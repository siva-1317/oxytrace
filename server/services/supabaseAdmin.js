import { createClient } from '@supabase/supabase-js';

let client = null;

export function getSupabaseAdmin() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    const err = new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in server/.env.');
    err.status = 500;
    throw err;
  }

  client = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

  return client;
}

export const supabaseAdmin = new Proxy(
  {},
  {
    get(_target, prop) {
      const c = getSupabaseAdmin();
      const v = c[prop];
      return typeof v === 'function' ? v.bind(c) : v;
    }
  }
);
