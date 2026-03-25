import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { supabaseAdmin } from '../services/supabaseAdmin.js';

const router = express.Router();
router.use(requireAuth);

function toCsv(rows) {
  const esc = (v) => {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = ['id', 'cylinder', 'ward', 'refill_date', 'previous_weight_kg', 'new_weight_kg', 'refilled_by', 'notes'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.cylinder?.cylinder_num || r.cylinder?.cylinder_name || '',
        r.cylinder?.ward || '',
        r.refill_date,
        r.previous_weight_kg,
        r.new_weight_kg,
        r.refilled_by,
        r.notes
      ].map(esc).join(',')
    );
  }
  return lines.join('\n');
}

router.get('/', async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('refill_history')
      .select('*, cylinders (cylinder_name, cylinder_num, ward, floor)')
      .order('refill_date', { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);

    const refills = (data || []).map((r) => {
      const { cylinders, ...rest } = r;
      return { ...rest, cylinder: cylinders };
    });

    res.json({ refills });
  } catch (e) {
    next(e);
  }
});

router.get('/export', async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('refill_history')
      .select('*, cylinders (cylinder_name, cylinder_num, ward)')
      .order('refill_date', { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);
    const refills = (data || []).map((r) => {
      const { cylinders, ...rest } = r;
      return { ...rest, cylinder: cylinders };
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(toCsv(refills));
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const payload = {
      cylinder_id: req.body.cylinder_id,
      refilled_by: req.body.refilled_by,
      previous_weight_kg: req.body.previous_weight_kg,
      new_weight_kg: req.body.new_weight_kg,
      notes: req.body.notes
    };

    if (!payload.cylinder_id) return res.status(400).json({ error: 'Missing cylinder_id' });

    const { data, error } = await supabaseAdmin.from('refill_history').insert(payload).select('*').single();
    if (error) throw new Error(error.message);

    res.status(201).json({ refill: data });
  } catch (e) {
    next(e);
  }
});

export default router;
