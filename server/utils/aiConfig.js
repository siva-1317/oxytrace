import { supabaseAdmin } from '../services/supabaseAdmin.js';

export const DEFAULT_AI_SETTINGS = {
  model: 'gemini-2.5-flash',
  temperature: 0.4,
  api_key: ''
};

export async function getStoredAiSettings() {
  const { data, error } = await supabaseAdmin
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', 'ai_settings')
    .maybeSingle();
  if (error) throw new Error(error.message);

  return {
    ...DEFAULT_AI_SETTINGS,
    ...(data?.setting_value && typeof data.setting_value === 'object' ? data.setting_value : {})
  };
}

export async function resolveAiOptions(req) {
  const stored = await getStoredAiSettings();
  const headerApiKey = req.headers['x-gemini-key'];
  const headerModel = req.headers['x-gemini-model'];
  const headerTemp =
    req.headers['x-gemini-temp'] != null ? Number(req.headers['x-gemini-temp']) : undefined;

  return {
    apiKey: headerApiKey ? String(headerApiKey) : String(stored.api_key || '').trim() || undefined,
    model: headerModel ? String(headerModel) : String(stored.model || DEFAULT_AI_SETTINGS.model).trim(),
    temperature: Number.isFinite(headerTemp)
      ? headerTemp
      : Number.isFinite(Number(stored.temperature))
        ? Number(stored.temperature)
        : DEFAULT_AI_SETTINGS.temperature
  };
}
