import express from 'express';
import { supabaseAdmin } from '../services/supabaseAdmin.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { normalizeTelemetryRow } from '../utils/telemetryNormalize.js';
import { deviceKeysMatch } from '../utils/deviceMatch.js';

const router = express.Router();

async function resolveCylinderForDevice(deviceId) {
  const normalized = String(deviceId || '').trim();
  if (!normalized) return null;

  const { data: cylinders, error } = await supabaseAdmin
    .from('cylinders')
    .select('id, cylinder_num, device_id')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const cylinder = (cylinders || []).find((row) => deviceKeysMatch(row.esp32_device_id, normalized));
  if (!cylinder?.id) return null;

  return {
    cylinder_id: cylinder.id,
    device_id: normalized,
    cylinder_label: cylinder.cylinder_num || null
  };
}

router.post('/ingest', async (req, res, next) => {
  try {
    const secret = req.headers['x-esp32-secret'];
    if (secret !== process.env.ESP32_SECRET) return res.status(401).json({ error: 'Forbidden' });

    const { esp32_device_id, device_id, gas_weight_kg, leakage_ppm, valve_open, gas_level_pct } = req.body || {};

    const incomingDeviceId = String(device_id || esp32_device_id || '').trim();
    if (!incomingDeviceId) return res.status(400).json({ error: 'Missing device_id' });

    const mapped = await resolveCylinderForDevice(incomingDeviceId);

    const insertPayload = {
      esp32_device_id: incomingDeviceId,
      cylinder_id: mapped?.cylinder_id || null,
      gas_weight_kg,
      leakage_ppm,
      valve_open,
      gas_level_pct
    };

    const { error } = await supabaseAdmin.from('sensor_readings').insert(insertPayload);
    if (error) throw new Error(error.message);

    const ppm = Number(leakage_ppm ?? 0);
    const pct = Number(gas_level_pct ?? 100);
    const alertBase = {
      esp32_device_id: incomingDeviceId,
      cylinder_id: mapped?.cylinder_id || null
    };

    if (ppm >= 200) {
      await supabaseAdmin.from('alerts').insert({
        ...alertBase,
        alert_type: 'LEAK_DANGER',
        message: `Dangerous leakage: ${ppm} ppm`,
        severity: 'critical'
      });
    } else if (pct < 20) {
      await supabaseAdmin.from('alerts').insert({
        ...alertBase,
        alert_type: 'LOW_GAS',
        message: `Gas below 20%: ${pct.toFixed(1)}%`,
        severity: 'warning'
      });
    }

    res.json({ success: true, cylinder_id: mapped?.cylinder_id || null });
  } catch (e) {
    next(e);
  }
});

router.use(requireAuth);

function parseRange(range) {
  switch (range) {
    case '1h':
      return 1 * 60 * 60 * 1000;
    case '1d':
      return 24 * 60 * 60 * 1000;
    case '1w':
      return 7 * 24 * 60 * 60 * 1000;
    case '1m':
      return 30 * 24 * 60 * 60 * 1000;
    default:
      return 24 * 60 * 60 * 1000;
  }
}

router.get('/:cylinderId', async (req, res, next) => {
  try {
    const cylinderId = req.params.cylinderId;
    const range = req.query.range || '1d';
    const since = new Date(Date.now() - parseRange(range)).toISOString();

    const { data: cylinder, error: cylErr } = await supabaseAdmin
      .from('cylinders')
      .select('id, device_id, cylinder_num')
      .eq('id', cylinderId)
      .single();
    if (cylErr) throw new Error(cylErr.message);

    let { data, error } = await supabaseAdmin
      .from('iot_telemetry')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);

    data = (data || []).filter((row) => deviceKeysMatch(row.device_id, cylinder.esp32_device_id));

    if (!data.length) {
      const fallback = await supabaseAdmin
        .from('iot_telemetry')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (fallback.error) throw new Error(fallback.error.message);
      data = (fallback.data || []).filter((row) => deviceKeysMatch(row.device_id, cylinder.esp32_device_id));
    }

    res.json({ readings: data.map((row) => normalizeTelemetryRow(row, cylinder)) });
  } catch (e) {
    next(e);
  }
});

export default router;
