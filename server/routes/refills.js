import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { supabaseAdmin } from '../services/supabaseAdmin.js';
import { updateInventoryBuckets } from '../utils/stockInventory.js';

const router = express.Router();
router.use(requireAuth);

function toCsv(rows) {
  const esc = (v) => {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = ['id', 'cylinder', 'type', 'ward', 'refill_time'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.cylinder?.cylinder_num || '',
        r.type?.type_name || '',
        r.cylinder?.ward || '',
        r.refill_time
      ].map(esc).join(',')
    );
  }
  return lines.join('\n');
}

function shapeRefillRow(row) {
  const { cylinders, cylinder_types, ...rest } = row;
  return {
    ...rest,
    cylinder: cylinders || null,
    type: cylinder_types || null
  };
}

router.get('/', async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('refill_logs')
      .select('*, cylinders (id, cylinder_num, ward, floor, device_id, type_id), cylinder_types (id, type_name, full_weight, empty_weight)')
      .order('refill_time', { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);

    res.json({ refills: (data || []).map(shapeRefillRow) });
  } catch (e) {
    next(e);
  }
});

router.get('/export', async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('refill_logs')
      .select('*, cylinders (id, cylinder_num, ward), cylinder_types (id, type_name)')
      .order('refill_time', { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(toCsv((data || []).map(shapeRefillRow)));
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const cylinderId = String(req.body?.cylinder_id || '').trim();
    const typeId = String(req.body?.type_id || '').trim();

    if (!cylinderId) return res.status(400).json({ error: 'Missing cylinder_id' });
    if (!typeId) return res.status(400).json({ error: 'Missing type_id' });

    const { data: cylinder, error: cylinderError } = await supabaseAdmin
      .from('cylinders')
      .select('id, type_id')
      .eq('id', cylinderId)
      .maybeSingle();
    if (cylinderError) throw new Error(cylinderError.message);
    if (!cylinder) return res.status(404).json({ error: 'Cylinder not found' });

    const { data: type, error: typeError } = await supabaseAdmin
      .from('cylinder_types')
      .select('id, type_name, full_weight, empty_weight')
      .eq('id', typeId)
      .maybeSingle();
    if (typeError) throw new Error(typeError.message);
    if (!type) return res.status(404).json({ error: 'Cylinder type not found' });

    const refillTime = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('refill_logs')
      .insert({
        cylinder_id: cylinderId,
        type_id: typeId,
        refill_time: refillTime
      })
      .select('*, cylinders (id, cylinder_num, ward, floor, device_id, type_id), cylinder_types (id, type_name, full_weight, empty_weight)')
      .single();
    if (error) throw new Error(error.message);

    const { error: updateError } = await supabaseAdmin
      .from('cylinders')
      .update({ type_id: typeId })
      .eq('id', cylinderId);
    if (updateError) throw new Error(updateError.message);

    try {
      await updateInventoryBuckets(
        { cylinder_size: type.type_name, gas_type: 'oxygen' },
        { quantity_full: -1, quantity_empty: 1 },
        { strict: true }
      );

      await supabaseAdmin.from('stock_transactions').insert([
        {
          transaction_type: 'issued',
          cylinder_size: type.type_name,
          gas_type: 'oxygen',
          quantity: 1,
          reference_id: data.id,
          reference_type: 'refill',
          ward: data?.cylinders?.ward || null,
          performed_by: req.user?.email || null,
          notes: `Replacement full cylinder issued for ${data?.cylinders?.cylinder_num || 'cylinder'}`
        },
        {
          transaction_type: 'returned',
          cylinder_size: type.type_name,
          gas_type: 'oxygen',
          quantity: 1,
          reference_id: data.id,
          reference_type: 'refill',
          ward: data?.cylinders?.ward || null,
          performed_by: req.user?.email || null,
          notes: `Empty cylinder returned during refill for ${data?.cylinders?.cylinder_num || 'cylinder'}`
        }
      ]);
    } catch (stockError) {
      await supabaseAdmin.from('refill_logs').delete().eq('id', data.id);
      await supabaseAdmin.from('cylinders').update({ type_id: cylinder.type_id || null }).eq('id', cylinderId);
      throw stockError;
    }

    res.status(201).json({ refill: shapeRefillRow(data) });
  } catch (e) {
    next(e);
  }
});

export default router;

