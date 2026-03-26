import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { supabaseAdmin } from '../services/supabaseAdmin.js';
import { filterRowsByPlacedSourceId, isPlacedSourceId } from '../utils/workspaceScope.js';
import { buildTelemetryDeviceMap, canonicalizeDeviceKey, deviceKeysMatch } from '../utils/deviceMatch.js';
import { shapeCylinderRow } from '../utils/cylinderShape.js';
import { buildLiveCylinder, buildLiveReading } from '../utils/cylinderLive.js';
import { updateInventoryBuckets } from '../utils/stockInventory.js';

const router = express.Router();
router.use(requireAuth);

async function fetchLatestTelemetryByMappedDevices(cylinders) {
  const latestByCylinderId = new Map();
  const deviceIds = Array.from(
    new Set(
      (cylinders || [])
        .map((cylinder) => String(cylinder?.device_id || '').trim())
        .filter(Boolean)
    )
  );

  if (!deviceIds.length) return latestByCylinderId;

  const { data: exactRows, error: exactError } = await supabaseAdmin
    .from('iot_telemetry')
    .select('*')
    .in('device_id', deviceIds)
    .order('created_at', { ascending: false })
    .limit(Math.max(5000, deviceIds.length * 20));
  if (exactError) throw new Error(exactError.message);

  const exactTelemetryByDevice = buildTelemetryDeviceMap(exactRows);
  for (const cylinder of cylinders) {
    const matchedRow = exactTelemetryByDevice.get(canonicalizeDeviceKey(cylinder.device_id));
    if (!matchedRow) continue;
    latestByCylinderId.set(cylinder.id, matchedRow);
  }

  const missingCylinders = cylinders.filter((cylinder) => !latestByCylinderId.has(cylinder.id));
  if (!missingCylinders.length) return latestByCylinderId;

  const { data: fallbackRows, error: fallbackError } = await supabaseAdmin
    .from('iot_telemetry')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5000);
  if (fallbackError) throw new Error(fallbackError.message);

  const fallbackTelemetryByDevice = buildTelemetryDeviceMap(fallbackRows);
  for (const cylinder of missingCylinders) {
    const matchedRow = fallbackTelemetryByDevice.get(canonicalizeDeviceKey(cylinder.device_id));
    if (!matchedRow) continue;
    latestByCylinderId.set(cylinder.id, matchedRow);
  }

  return latestByCylinderId;
}

async function fetchCylinderTypesById(cylinders) {
  const typeIds = Array.from(
    new Set(
      (cylinders || [])
        .map((cylinder) => String(cylinder?.type_id || '').trim())
        .filter(Boolean)
    )
  );
  const map = new Map();
  if (!typeIds.length) return map;

  const { data, error } = await supabaseAdmin
    .from('cylinder_types')
    .select('*')
    .in('id', typeIds);
  if (error) throw new Error(error.message);

  for (const row of data || []) {
    map.set(String(row.id), row);
  }
  return map;
}

router.get('/', async (_req, res, next) => {
  try {
    const { data: cylinders, error } = await supabaseAdmin
      .from('cylinders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    const cylList = (await filterRowsByPlacedSourceId('cylinder', cylinders || [])).map(shapeCylinderRow);
    const typeMap = await fetchCylinderTypesById(cylList);
    const latestByCylinderId = await fetchLatestTelemetryByMappedDevices(cylList);

    res.json({
      cylinders: cylList.map((c) =>
        buildLiveCylinder(c, latestByCylinderId.get(c.id) || null, typeMap.get(String(c.type_id || '')) || null)
      )
    });
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const payload = {
      device_id: String(req.body.device_id || req.body.esp32_device_id || '').trim(),
      cylinder_num: String(req.body.cylinder_num || req.body.cylinder_name || '').trim(),
      ward: String(req.body.ward || '').trim(),
      floor: String(req.body.floor || req.body.floor_name || '').trim(),
      type_id: req.body.type_id ? String(req.body.type_id).trim() : null
    };

    if (!payload.device_id || !payload.cylinder_num || !payload.ward || !payload.floor) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    let type = null;
    if (payload.type_id) {
      const { data: typeRow, error: typeError } = await supabaseAdmin
        .from('cylinder_types')
        .select('id, type_name')
        .eq('id', payload.type_id)
        .maybeSingle();
      if (typeError) throw new Error(typeError.message);
      if (!typeRow) return res.status(404).json({ error: 'Cylinder type not found' });
      type = typeRow;
    }

    const { data, error } = await supabaseAdmin
      .from('cylinders')
      .insert({
        device_id: payload.device_id,
        cylinder_num: payload.cylinder_num,
        ward: payload.ward,
        floor: payload.floor,
        type_id: payload.type_id
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);

    if (type?.type_name) {
      try {
        await updateInventoryBuckets(
          { cylinder_size: type.type_name, gas_type: 'oxygen' },
          { quantity_full: -1, quantity_in_use: 1 },
          { strict: true }
        );
        await supabaseAdmin.from('stock_transactions').insert({
          transaction_type: 'issued',
          cylinder_size: type.type_name,
          gas_type: 'oxygen',
          quantity: 1,
          reference_id: data.id,
          reference_type: 'cylinder_create',
          ward: payload.ward,
          performed_by: req.user?.email || null,
          notes: `Cylinder ${payload.cylinder_num} deployed to use`
        });
      } catch (stockError) {
        await supabaseAdmin.from('cylinders').delete().eq('id', data.id);
        throw stockError;
      }
    }

    res.status(201).json({ cylinder: shapeCylinderRow(data) });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const cylinderId = req.params.id;
    if (!(await isPlacedSourceId('cylinder', cylinderId))) return res.status(404).json({ error: 'Cylinder not active in workspace' });

    const { data: cyl, error } = await supabaseAdmin
      .from('cylinders')
      .select('*')
      .eq('id', cylinderId)
      .single();
    if (error) throw new Error(error.message);

    const typeMap = await fetchCylinderTypesById([cyl]);

    const exactDeviceId = String(cyl.device_id || '').trim();
    let matchedTelemetry = null;

    if (exactDeviceId) {
      const { data: exactTelemetry, error: exactError } = await supabaseAdmin
        .from('iot_telemetry')
        .select('*')
        .eq('device_id', exactDeviceId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (exactError) throw new Error(exactError.message);
      matchedTelemetry = exactTelemetry?.[0] || null;
    }

    if (!matchedTelemetry) {
      const { data: latestTelemetry, error: telemetryError } = await supabaseAdmin
      .from('iot_telemetry')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5000);
      if (telemetryError) throw new Error(telemetryError.message);
      matchedTelemetry =
        (latestTelemetry || []).find((row) => deviceKeysMatch(row.device_id, cyl.device_id)) || null;
    }

    const { data: refills, error: refillError } = await supabaseAdmin
      .from('refill_logs')
      .select('*, cylinder_types (id, type_name, full_weight, empty_weight)')
      .eq('cylinder_id', cylinderId)
      .order('refill_time', { ascending: false });
    if (refillError) throw new Error(refillError.message);

    const { data: activeAlerts } = await supabaseAdmin
      .from('alerts')
      .select('*')
      .eq('cylinder_id', cylinderId)
      .eq('is_resolved', false)
      .order('created_at', { ascending: false });

    res.json({
      cylinder: {
        ...buildLiveCylinder(shapeCylinderRow(cyl), matchedTelemetry, typeMap.get(String(cyl.type_id || '')) || null),
        alerts: activeAlerts || []
      },
      refills: (refills || []).map((row) => ({
        ...row,
        type: row.cylinder_types || null
      }))
    });
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const allowed = [
      'device_id',
      'cylinder_num',
      'ward',
      'floor',
      'is_active',
      'type_id'
    ];
    const patch = {};
    for (const k of allowed) {
      if (k in req.body) patch[k] = req.body[k];
    }

    const { data, error } = await supabaseAdmin.from('cylinders').update(patch).eq('id', id).select('*').single();
    if (error) throw new Error(error.message);
    const typeMap = await fetchCylinderTypesById([data]);
    res.json({ cylinder: buildLiveCylinder(shapeCylinderRow(data), null, typeMap.get(String(data.type_id || '')) || null) });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const { error } = await supabaseAdmin.from('cylinders').delete().eq('id', id);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.patch('/:id/valve', async (req, res, next) => {
  try {
    const cylinderId = req.params.id;
    const { data: cylinder, error: cylErr } = await supabaseAdmin
      .from('cylinders')
      .select('id, device_id')
      .eq('id', cylinderId)
      .single();
    if (cylErr) throw new Error(cylErr.message);

    const { data: latest } = await supabaseAdmin
      .from('sensor_readings')
      .select('*')
      .eq('cylinder_id', cylinderId)
      .order('created_at', { ascending: false })
      .limit(1);

    const current = latest?.[0] || {};
    const nextValve = !current.valve_open;

    const insertRow = {
      cylinder_id: cylinder.id,
      esp32_device_id: cylinder.device_id,
      gas_weight_kg: current.gas_weight_kg ?? null,
      leakage_ppm: current.leakage_ppm ?? null,
      valve_open: nextValve,
      gas_level_pct: current.gas_level_pct ?? null
    };

    const { error: insErr } = await supabaseAdmin.from('sensor_readings').insert(insertRow);
    if (insErr) throw new Error(insErr.message);

    res.json({ ok: true, valve_open: nextValve });
  } catch (e) {
    next(e);
  }
});

export default router;
