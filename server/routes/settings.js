import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { supabaseAdmin } from '../services/supabaseAdmin.js';
import { DEFAULT_AI_SETTINGS } from '../utils/aiConfig.js';

const router = express.Router();
router.use(requireAuth);

const DEFAULT_THRESHOLDS = {
  low_gas_pct: 20,
  danger_gas_pct: 10,
  leak_warn_ppm: 120,
  leak_danger_ppm: 200,
  low_weight_kg: 10,
  danger_weight_kg: 5,
  low_in_use_cylinders: 2
};

const DEFAULT_HOSPITAL_PROFILE = {
  hospital_name: 'OxyTrace Medical Center',
  contact_name: '',
  email: '',
  phone: '',
  address_line_1: '',
  address_line_2: '',
  city: '',
  state: '',
  postal_code: '',
  country: 'India'
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

router.get('/hospital-profile', async (_req, res, next) => {
  try {
    const hospitalProfile = await getJsonSetting('hospital_profile', DEFAULT_HOSPITAL_PROFILE);
    res.json({ hospitalProfile });
  } catch (e) {
    next(e);
  }
});

router.patch('/hospital-profile', async (req, res, next) => {
  try {
    const current = await getJsonSetting('hospital_profile', DEFAULT_HOSPITAL_PROFILE);
    const nextProfile = {
      ...current,
      ...Object.fromEntries(
        Object.keys(DEFAULT_HOSPITAL_PROFILE).map((key) => [key, String(req.body?.[key] ?? current[key] ?? '').trim()])
      )
    };

    const { error } = await supabaseAdmin.from('app_settings').upsert(
      {
        setting_key: 'hospital_profile',
        setting_value: nextProfile,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'setting_key' }
    );
    if (error) throw new Error(error.message);

    res.json({ ok: true, hospitalProfile: nextProfile });
  } catch (e) {
    next(e);
  }
});

router.get('/ai-config', async (_req, res, next) => {
  try {
    const aiConfig = await getJsonSetting('ai_settings', DEFAULT_AI_SETTINGS);
    res.json({ aiConfig });
  } catch (e) {
    next(e);
  }
});

router.patch('/ai-config', async (req, res, next) => {
  try {
    const current = await getJsonSetting('ai_settings', DEFAULT_AI_SETTINGS);
    const nextConfig = {
      ...current,
      model: String(req.body?.model ?? current.model ?? DEFAULT_AI_SETTINGS.model).trim() || DEFAULT_AI_SETTINGS.model,
      api_key: String(req.body?.api_key ?? current.api_key ?? '').trim(),
      temperature: Number.isFinite(Number(req.body?.temperature))
        ? Number(req.body.temperature)
        : Number(current.temperature ?? DEFAULT_AI_SETTINGS.temperature)
    };

    const { error } = await supabaseAdmin.from('app_settings').upsert(
      {
        setting_key: 'ai_settings',
        setting_value: nextConfig,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'setting_key' }
    );
    if (error) throw new Error(error.message);

    res.json({ ok: true, aiConfig: nextConfig });
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

router.post('/reset-data', async (req, res, next) => {
  try {
    const { domains } = req.body || {};
    if (!Array.isArray(domains)) return res.status(400).json({ error: 'Domains must be an array' });

    if (domains.includes('orders')) {
      await supabaseAdmin.from('stock_transactions').delete().not('id', 'is', null);
      await supabaseAdmin.from('stock_orders').delete().not('id', 'is', null);
    }
    if (domains.includes('inventory')) {
      await supabaseAdmin.from('stock_inventory').delete().not('id', 'is', null);
    }
    if (domains.includes('telemetry')) {
      await supabaseAdmin.from('iot_telemetry').delete().not('id', 'is', null);
      await supabaseAdmin.from('sensor_readings').delete().not('id', 'is', null);
    }
    if (domains.includes('alerts')) {
      await supabaseAdmin.from('alerts').delete().not('id', 'is', null);
    }
    if (domains.includes('refills')) {
      await supabaseAdmin.from('cylinder_refills').delete().not('id', 'is', null);
    }
    if (domains.includes('cylinders')) {
      await supabaseAdmin.from('cylinder_refills').delete().not('id', 'is', null);
      await supabaseAdmin.from('cylinders').delete().not('id', 'is', null);
    }
    if (domains.includes('suppliers')) {
      await supabaseAdmin.from('suppliers').delete().not('id', 'is', null);
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
