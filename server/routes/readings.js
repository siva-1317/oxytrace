import express from 'express';
import { supabaseAdmin } from '../services/supabaseAdmin.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/ingest', async (req, res, next) => {
  try {
    const secret = req.headers['x-esp32-secret'];
    if (secret !== process.env.ESP32_SECRET) return res.status(401).json({ error: 'Forbidden' });

    const { esp32_device_id, gas_weight_kg, leakage_ppm, valve_open, gas_level_pct } = req.body || {};

    if (!esp32_device_id) return res.status(400).json({ error: 'Missing esp32_device_id' });

    const { error } = await supabaseAdmin.from('sensor_readings').insert({
      esp32_device_id,
      gas_weight_kg,
      leakage_ppm,
      valve_open,
      gas_level_pct
    });
    if (error) throw new Error(error.message);

    // Auto-generate alerts
    const ppm = Number(leakage_ppm ?? 0);
    const pct = Number(gas_level_pct ?? 100);

    if (ppm >= 200) {
      await supabaseAdmin.from('alerts').insert({
        esp32_device_id,
        alert_type: 'LEAK_DANGER',
        message: `Dangerous leakage: ${ppm} ppm`,
        severity: 'critical'
      });
    } else if (pct < 20) {
      await supabaseAdmin.from('alerts').insert({
        esp32_device_id,
        alert_type: 'LOW_GAS',
        message: `Gas below 20%: ${pct.toFixed(1)}%`,
        severity: 'warning'
      });
    }

    res.json({ success: true });
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

    const { data, error } = await supabaseAdmin
      .from('sensor_readings')
      .select('*')
      .eq('cylinder_id', cylinderId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(2000);

    if (error) throw new Error(error.message);
    res.json({ readings: data || [] });
  } catch (e) {
    next(e);
  }
});

export default router;
