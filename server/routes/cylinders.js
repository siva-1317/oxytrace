import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { supabaseAdmin } from '../services/supabaseAdmin.js';

const router = express.Router();
router.use(requireAuth);

router.get('/', async (_req, res, next) => {
  try {
    const { data: cylinders, error } = await supabaseAdmin
      .from('cylinders')
      .select('id, esp32_device_id, cylinder_name, location, ward, total_capacity_kg, last_refill_date, refill_threshold_pct, is_active, created_at')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    const cylList = cylinders || [];
    const cylIds = cylList.map((c) => c.id);

    const latestByCylinderId = new Map();
    if (cylIds.length) {
      const { data: readings, error: rErr } = await supabaseAdmin
        .from('sensor_readings')
        .select('id, cylinder_id, esp32_device_id, gas_weight_kg, leakage_ppm, valve_open, gas_level_pct, created_at')
        .in('cylinder_id', cylIds)
        .order('created_at', { ascending: false })
        .limit(5000);
      if (rErr) throw new Error(rErr.message);
      for (const r of readings || []) {
        if (!latestByCylinderId.has(r.cylinder_id)) latestByCylinderId.set(r.cylinder_id, r);
      }
    }

    const esp32Ids = cylList.map((c) => c.esp32_device_id).filter(Boolean);
    let hasAlertSet = new Set();
    if (esp32Ids.length) {
      const { data: activeAlerts } = await supabaseAdmin
        .from('alerts')
        .select('esp32_device_id')
        .in('esp32_device_id', esp32Ids)
        .eq('is_resolved', false);
      hasAlertSet = new Set((activeAlerts || []).map((a) => a.esp32_device_id));
    }

    res.json({
      cylinders: cylList.map((c) => ({
        ...c,
        latest_reading: latestByCylinderId.get(c.id) || null,
        _hasAlert: hasAlertSet.has(c.esp32_device_id)
      }))
    });
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const payload = {
      esp32_device_id: String(req.body.esp32_device_id || '').trim(),
      cylinder_name: String(req.body.cylinder_name || '').trim(),
      ward: String(req.body.ward || '').trim(),
      location: String(req.body.location || '').trim(),
      total_capacity_kg: Number(req.body.total_capacity_kg || 47),
      last_refill_date: req.body.last_refill_date || null
    };

    if (!payload.esp32_device_id || !payload.cylinder_name || !payload.ward || !payload.location) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { data, error } = await supabaseAdmin.from('cylinders').insert(payload).select('*').single();
    if (error) throw new Error(error.message);
    res.status(201).json({ cylinder: data });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const cylinderId = req.params.id;

    const { data: cyl, error } = await supabaseAdmin
      .from('cylinders')
      .select('*')
      .eq('id', cylinderId)
      .single();
    if (error) throw new Error(error.message);

    const { data: latestRead } = await supabaseAdmin
      .from('sensor_readings')
      .select('*')
      .eq('cylinder_id', cylinderId)
      .order('created_at', { ascending: false })
      .limit(1);

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
      cylinder: { ...cyl, latest_reading: latestRead?.[0] || null, alerts: activeAlerts || [] },
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
      'cylinder_name',
      'location',
      'ward',
      'total_capacity_kg',
      'last_refill_date',
      'refill_threshold_pct',
      'is_active'
    ];
    const patch = {};
    for (const k of allowed) {
      if (k in req.body) patch[k] = req.body[k];
    }

    const { data, error } = await supabaseAdmin.from('cylinders').update(patch).eq('id', id).select('*').single();
    if (error) throw new Error(error.message);
    res.json({ cylinder: data });
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
      .select('id, esp32_device_id')
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
      esp32_device_id: cylinder.esp32_device_id,
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
