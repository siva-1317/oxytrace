import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { supabaseAdmin } from '../services/supabaseAdmin.js';
import { getPlacedSourceIdSet } from '../utils/workspaceScope.js';
import { shapeCylinderRow } from '../utils/cylinderShape.js';
import { buildTelemetryDeviceMap, canonicalizeDeviceKey } from '../utils/deviceMatch.js';
import { normalizeTelemetryRow } from '../utils/telemetryNormalize.js';

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const status = req.query.status || 'active';
    const limit = Math.min(500, Number(req.query.limit || 200));

    const applyStatus = (builder) => {
      if (status === 'active') return builder.eq('is_resolved', false);
      if (status === 'resolved') return builder.eq('is_resolved', true);
      return builder;
    };

    const countQuery = applyStatus(
      supabaseAdmin.from('alerts').select('id', {
        count: 'exact',
        head: true
      })
    );

    const { count, error: countErr } = await countQuery;
    if (countErr) throw new Error(countErr.message);

    const dataQuery = applyStatus(supabaseAdmin.from('alerts').select('*'))
      .order('created_at', { ascending: false })
      .limit(limit);

    const { data: alerts, error } = await dataQuery;
    if (error) throw new Error(error.message);

    const placedCylinderIds = await getPlacedSourceIdSet('cylinder');
    const placedIdList = Array.from(placedCylinderIds);

    let placedCylinderRows = [];
    if (placedIdList.length) {
      const { data: cylinders, error: cylinderError } = await supabaseAdmin
        .from('cylinders')
        .select('id, cylinder_num, ward, floor, device_id')
        .in('id', placedIdList);
      if (cylinderError) throw new Error(cylinderError.message);
      placedCylinderRows = cylinders || [];
    }

    const placedCylinders = placedCylinderRows.map(shapeCylinderRow);
    const cylMap = new Map(placedCylinders.map((c) => [c.id, c]));

    const activeAlerts = (alerts || []).filter(
      (a) => !a.cylinder_id || placedCylinderIds.has(String(a.cylinder_id))
    );

    const activeLeakCylinderIds = new Set(
      activeAlerts
        .filter((a) => a.alert_type === 'LEAK_DANGER' && a.cylinder_id)
        .map((a) => String(a.cylinder_id))
    );

    const deviceIds = Array.from(
      new Set(placedCylinders.map((c) => String(c.device_id || '').trim()).filter(Boolean))
    );

    let telemetryMap = new Map();
    if (deviceIds.length) {
      const { data: telemetryRows, error: telemetryError } = await supabaseAdmin
        .from('iot_telemetry')
        .select('*')
        .in('device_id', deviceIds)
        .order('created_at', { ascending: false })
        .limit(Math.max(2000, deviceIds.length * 10));
      if (telemetryError) throw new Error(telemetryError.message);
      telemetryMap = buildTelemetryDeviceMap(telemetryRows || []);
    }

    const createdTelemetryAlerts = [];
    for (const cylinder of placedCylinders) {
      const latestTelemetry = telemetryMap.get(canonicalizeDeviceKey(cylinder.device_id));
      const normalized = normalizeTelemetryRow(latestTelemetry, cylinder);
      if (!normalized?.leak_detect) continue;

      if (activeLeakCylinderIds.has(String(cylinder.id))) continue;

      const message = [
        `Cylinder leak detected for ${cylinder.cylinder_num || cylinder.device_id}.`,
        'AI assessment: Active leak state received from live telemetry. Check the valve, regulator, and move the cylinder to a ventilated safe area immediately.',
        `Current gas level: ${normalized.gas_level_pct != null ? `${Number(normalized.gas_level_pct).toFixed(1)}%` : 'unknown'}. Location: ${[cylinder.ward, cylinder.floor].filter(Boolean).join(', ') || 'Location not assigned'}.`
      ].join('\n\n');

      activeLeakCylinderIds.add(String(cylinder.id));
      createdTelemetryAlerts.push({
        id: 'telemetry-' + cylinder.id + '-' + (normalized.created_at || Date.now()),
        cylinder_id: cylinder.id,
        alert_type: 'LEAK_DANGER',
        message,
        severity: 'critical',
        created_at: normalized.created_at || new Date().toISOString(),
        is_resolved: false,
        cylinder
      });
    }

    const enriched = [...activeAlerts, ...createdTelemetryAlerts]
      .map((a) => ({ ...a, cylinder: cylMap.get(a.cylinder_id) || a.cylinder || null }))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, limit);

    res.json({ alerts: enriched, count: enriched.length });
  } catch (e) {
    next(e);
  }
});

router.patch('/:id/resolve', async (req, res, next) => {
  try {
    const id = req.params.id;
    const { error } = await supabaseAdmin
      .from('alerts')
      .update({ is_resolved: true, resolved_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;



