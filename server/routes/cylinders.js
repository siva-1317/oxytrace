import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { supabaseAdmin } from '../services/supabaseAdmin.js';
import { filterRowsByPlacedSourceId, isPlacedSourceId } from '../utils/workspaceScope.js';
import { normalizeTelemetryRow } from '../utils/telemetryNormalize.js';
import { buildTelemetryDeviceMap, canonicalizeDeviceKey, deviceKeysMatch } from '../utils/deviceMatch.js';
import { shapeCylinderRow } from '../utils/cylinderShape.js';

const router = express.Router();
router.use(requireAuth);

async function getInventoryRow(cylinder_size, gas_type = 'oxygen') {
  const { data, error } = await supabaseAdmin
    .from('stock_inventory')
    .select('*')
    .eq('cylinder_size', cylinder_size)
    .eq('gas_type', gas_type)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data;

  const { data: created, error: insertError } = await supabaseAdmin
    .from('stock_inventory')
    .insert({
      cylinder_size,
      gas_type,
      quantity_full: 0,
      quantity_empty: 0,
      quantity_in_use: 0,
      quantity_damaged: 0
    })
    .select('*')
    .single();
  if (insertError) throw new Error(insertError.message);
  return created;
}

async function updateInventoryBuckets({ cylinder_size, gas_type = 'oxygen' }, delta) {
  const row = await getInventoryRow(cylinder_size, gas_type);
  const next = {
    quantity_full: Math.max(0, Number(row.quantity_full || 0) + Number(delta.quantity_full || 0)),
    quantity_empty: Math.max(0, Number(row.quantity_empty || 0) + Number(delta.quantity_empty || 0)),
    quantity_in_use: Math.max(0, Number(row.quantity_in_use || 0) + Number(delta.quantity_in_use || 0)),
    quantity_damaged: Math.max(0, Number(row.quantity_damaged || 0) + Number(delta.quantity_damaged || 0)),
    last_updated: new Date().toISOString()
  };

  const { data, error } = await supabaseAdmin
    .from('stock_inventory')
    .update(next)
    .eq('id', row.id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

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
    latestByCylinderId.set(cylinder.id, normalizeTelemetryRow(matchedRow, cylinder));
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
    latestByCylinderId.set(cylinder.id, normalizeTelemetryRow(matchedRow, cylinder));
  }

  return latestByCylinderId;
}

router.get('/', async (_req, res, next) => {
  try {
    const { data: cylinders, error } = await supabaseAdmin
      .from('cylinders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    const cylList = (await filterRowsByPlacedSourceId('cylinder', cylinders || [])).map(shapeCylinderRow);
    const latestByCylinderId = await fetchLatestTelemetryByMappedDevices(cylList);

    res.json({
      cylinders: cylList.map((c) => ({
        ...shapeCylinderRow(c),
        weight: latestByCylinderId.get(c.id)?.gas_weight_kg ?? latestByCylinderId.get(c.id)?.current_weight ?? null,
        valve_pos: latestByCylinderId.get(c.id)?.valve_position ?? null,
        leak_detect: latestByCylinderId.get(c.id)?.leak_detect ?? null,
        timestamp: latestByCylinderId.get(c.id)?.created_at ?? null,
        latest_reading: latestByCylinderId.get(c.id) || null
      }))
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
      floor: String(req.body.floor || req.body.floor_name || '').trim()
    };

    if (!payload.device_id || !payload.cylinder_num || !payload.ward || !payload.floor) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { data, error } = await supabaseAdmin
      .from('cylinders')
      .insert({
        device_id: payload.device_id,
        cylinder_num: payload.cylinder_num,
        ward: payload.ward,
        floor: payload.floor
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);

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

    const { data: refills } = await supabaseAdmin
      .from('refill_history')
      .select('*')
      .eq('cylinder_id', cylinderId)
      .order('refill_date', { ascending: false });

    const { data: activeAlerts } = await supabaseAdmin
      .from('alerts')
      .select('*')
      .eq('cylinder_id', cylinderId)
      .eq('is_resolved', false)
      .order('created_at', { ascending: false });

    res.json({
      cylinder: { ...shapeCylinderRow(cyl), latest_reading: matchedTelemetry ? normalizeTelemetryRow(matchedTelemetry, cyl) : null, alerts: activeAlerts || [] },
      refills: refills || []
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
      'is_active'
    ];
    const patch = {};
    for (const k of allowed) {
      if (k in req.body) patch[k] = req.body[k];
    }

    const { data, error } = await supabaseAdmin.from('cylinders').update(patch).eq('id', id).select('*').single();
    if (error) throw new Error(error.message);
    res.json({ cylinder: shapeCylinderRow(data) });
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
