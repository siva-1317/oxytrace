import { supabaseAdmin } from '../services/supabaseAdmin.js';

const DEFAULT_THRESHOLDS = {
  low_gas_pct: 20,
  danger_gas_pct: 10,
  leak_warn_ppm: 120,
  leak_danger_ppm: 200,
  low_weight_kg: 10,
  danger_weight_kg: 5,
  low_in_use_cylinders: 2
};

async function getJsonSetting(settingKey, defaults) {
  const { data, error } = await supabaseAdmin
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', settingKey)
    .maybeSingle();
  if (error) throw new Error(error.message);

  return {
    ...defaults,
    ...(data?.setting_value && typeof data.setting_value === 'object' ? data.setting_value : {})
  };
}

export async function getAlertThresholds() {
  return getJsonSetting('alert_thresholds', DEFAULT_THRESHOLDS);
}

export async function getInventoryRow(cylinder_size, gas_type = 'oxygen') {
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

async function reconcileStockAlert({ alertType, active, severity = 'warning', message, matchPrefix }) {
  const { data: openAlerts, error } = await supabaseAdmin
    .from('alerts')
    .select('id, message')
    .eq('alert_type', alertType)
    .eq('is_resolved', false)
    .is('cylinder_id', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const existing = (openAlerts || []).find((alert) => String(alert.message || '').startsWith(matchPrefix));

  if (!active) {
    if (!existing?.id) return;
    const { error: resolveError } = await supabaseAdmin
      .from('alerts')
      .update({
        is_resolved: true,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id);
    if (resolveError) throw new Error(resolveError.message);
    return;
  }

  if (existing?.id) {
    const { error: updateError } = await supabaseAdmin
      .from('alerts')
      .update({
        message,
        severity,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id);
    if (updateError) throw new Error(updateError.message);
    return;
  }

  try {
    const { error: insertError } = await supabaseAdmin
      .from('alerts')
      .insert({
        alert_type: alertType,
        message,
        severity
      });
    if (insertError) console.warn('[ALERTS] Insert error:', insertError.message);
  } catch (e) {
    console.warn('[ALERTS] Error in reconcileStockAlert:', e.message);
  }
}

async function syncInventoryAlerts(updatedRow) {
  const thresholds = await getAlertThresholds();
  const stockLabel = `${updatedRow.cylinder_size} (${updatedRow.gas_type || 'oxygen'})`;
  const reorderLevel = Number(updatedRow.reorder_level || 0);
  const fullCount = Number(updatedRow.quantity_full || 0);
  const inUseCount = Number(updatedRow.quantity_in_use || 0);
  const lowInUseThreshold = Math.max(0, Number(thresholds.low_in_use_cylinders || 0));

  await reconcileStockAlert({
    alertType: 'LOW_STOCK',
    active: reorderLevel > 0 && fullCount < reorderLevel,
    matchPrefix: `Low stock: ${stockLabel}`,
    message: `Low stock: ${stockLabel} full=${fullCount} reorder=${reorderLevel}`
  });

  await reconcileStockAlert({
    alertType: 'LOW_IN_USE_STOCK',
    active: lowInUseThreshold > 0 && inUseCount < lowInUseThreshold,
    matchPrefix: `Low in-use cylinders: ${stockLabel}`,
    message: `Low in-use cylinders: ${stockLabel} in_use=${inUseCount} threshold=${lowInUseThreshold}`
  });
}

export async function updateInventoryBuckets(
  { cylinder_size, gas_type = 'oxygen' },
  delta,
  { unit_price = null, strict = false } = {}
) {
  const row = await getInventoryRow(cylinder_size, gas_type);
  const next = {
    quantity_full: Number(row.quantity_full || 0) + Number(delta.quantity_full || 0),
    quantity_empty: Number(row.quantity_empty || 0) + Number(delta.quantity_empty || 0),
    quantity_in_use: Number(row.quantity_in_use || 0) + Number(delta.quantity_in_use || 0),
    quantity_damaged: Number(row.quantity_damaged || 0) + Number(delta.quantity_damaged || 0)
  };

  if (strict) {
    if (next.quantity_full < 0) throw new Error(`Not enough full stock for ${cylinder_size}`);
    if (next.quantity_empty < 0) throw new Error(`Not enough empty stock for ${cylinder_size}`);
    if (next.quantity_in_use < 0) throw new Error(`Not enough in-use stock for ${cylinder_size}`);
    if (next.quantity_damaged < 0) throw new Error(`Not enough damaged stock for ${cylinder_size}`);
  }

  const patch = {
    quantity_full: Math.max(0, next.quantity_full),
    quantity_empty: Math.max(0, next.quantity_empty),
    quantity_in_use: Math.max(0, next.quantity_in_use),
    quantity_damaged: Math.max(0, next.quantity_damaged),
    last_updated: new Date().toISOString()
  };
  if (unit_price != null && Number.isFinite(Number(unit_price))) patch.unit_price = Number(unit_price);

  const { data: updated, error } = await supabaseAdmin
    .from('stock_inventory')
    .update(patch)
    .eq('id', row.id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  try {
    await syncInventoryAlerts(updated);
  } catch (e) {
    console.warn('[STOCK ALERTS] Failed to sync inventory alerts:', e.message);
  }
  return updated;
}
