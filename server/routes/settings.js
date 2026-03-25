import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { supabaseAdmin } from '../services/supabaseAdmin.js';

const router = express.Router();
router.use(requireAuth);

const DEFAULT_THRESHOLDS = {
  low_gas_pct: 20,
  danger_gas_pct: 10,
  leak_warn_ppm: 120,
  leak_danger_ppm: 200,
  low_weight_kg: 10,
  danger_weight_kg: 5
};

async function getJsonSetting(settingKey, defaults) {
  const { data, error } = await supabaseAdmin
    .from('app_settings')
    .select('setting_key, setting_value')
    .eq('setting_key', settingKey)
    .maybeSingle();
  if (error) throw new Error(error.message);

  return {
    ...defaults,
    ...(data?.setting_value && typeof data.setting_value === 'object' ? data.setting_value : {})
  };
}

router.get('/thresholds', async (_req, res, next) => {
  try {
    const thresholds = await getJsonSetting('alert_thresholds', DEFAULT_THRESHOLDS);
    res.json({ thresholds });
  } catch (e) {
    next(e);
  }
});

router.patch('/thresholds', async (req, res, next) => {
  try {
    const current = await getJsonSetting('alert_thresholds', DEFAULT_THRESHOLDS);
    const nextThresholds = { ...current };

    for (const k of Object.keys(DEFAULT_THRESHOLDS)) {
      if (k in req.body) nextThresholds[k] = Number(req.body[k]);
    }

    const { error } = await supabaseAdmin
      .from('app_settings')
      .upsert({
        setting_key: 'alert_thresholds',
        setting_value: nextThresholds,
        updated_at: new Date().toISOString()
      }, { onConflict: 'setting_key' });
    if (error) throw new Error(error.message);

    res.json({ ok: true, thresholds: nextThresholds });
  } catch (e) {
    next(e);
  }
});

router.get('/cylinder-types', async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('cylinder_types')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    res.json({ cylinderTypes: data || [] });
  } catch (e) {
    next(e);
  }
});

router.post('/cylinder-types', async (req, res, next) => {
  try {
    const type_name = String(req.body?.type_name || '').trim();
    const full_weight = Number(req.body?.full_weight);
    const empty_weight = Number(req.body?.empty_weight);

    if (!type_name) return res.status(400).json({ error: 'Missing type_name' });
    if (!Number.isFinite(full_weight)) return res.status(400).json({ error: 'Missing full_weight' });
    if (!Number.isFinite(empty_weight)) return res.status(400).json({ error: 'Missing empty_weight' });

    const { data, error } = await supabaseAdmin
      .from('cylinder_types')
      .insert({ type_name, full_weight, empty_weight })
      .select('*')
      .single();
    if (error) throw new Error(error.message);

    res.status(201).json({ cylinderType: data });
  } catch (e) {
    next(e);
  }
});

router.patch('/cylinder-types/:id', async (req, res, next) => {
  try {
    const patch = {};
    if ('type_name' in req.body) patch.type_name = String(req.body.type_name || '').trim();
    if ('full_weight' in req.body) patch.full_weight = Number(req.body.full_weight);
    if ('empty_weight' in req.body) patch.empty_weight = Number(req.body.empty_weight);

    const { data, error } = await supabaseAdmin
      .from('cylinder_types')
      .update(patch)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);

    res.json({ cylinderType: data });
  } catch (e) {
    next(e);
  }
});

router.delete('/cylinder-types/:id', async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin
      .from('cylinder_types')
      .delete()
      .eq('id', req.params.id);
    if (error) throw new Error(error.message);

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
