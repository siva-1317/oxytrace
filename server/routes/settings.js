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

const DEFAULT_CYLINDER_TYPE_WEIGHTS = {
  'B-type 10L': 14,
  'D-type 46L': 16,
  'Jumbo 47L': 18
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

router.get('/cylinder-type-weights', async (_req, res, next) => {
  try {
    const weights = await getJsonSetting('cylinder_type_weights', DEFAULT_CYLINDER_TYPE_WEIGHTS);
    res.json({ weights });
  } catch (e) {
    next(e);
  }
});

router.patch('/cylinder-type-weights', async (req, res, next) => {
  try {
    const current = await getJsonSetting('cylinder_type_weights', DEFAULT_CYLINDER_TYPE_WEIGHTS);
    const nextWeights = { ...current };

    for (const key of Object.keys(current)) {
      if (key in req.body) nextWeights[key] = Number(req.body[key]);
    }

    const { error } = await supabaseAdmin
      .from('app_settings')
      .upsert({
        setting_key: 'cylinder_type_weights',
        setting_value: nextWeights,
        updated_at: new Date().toISOString()
      }, { onConflict: 'setting_key' });
    if (error) throw new Error(error.message);

    res.json({ ok: true, weights: nextWeights });
  } catch (e) {
    next(e);
  }
});

export default router;
