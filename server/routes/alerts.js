import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { supabaseAdmin } from '../services/supabaseAdmin.js';

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const status = req.query.status || 'active';
    const limit = Math.min(500, Number(req.query.limit || 200));

    const applyStatus = (builder) => {
      if (status === 'active') return builder.eq('is_resolved', false);
      if (status === 'resolved') return builder.eq('is_resolved', true);
      return builder;
    };

    const countQuery = applyStatus(
      supabaseAdmin.from('alerts').select('id', {
      count: 'exact',
      head: true
      })
    );

    const { count, error: countErr } = await countQuery;
    if (countErr) throw new Error(countErr.message);

    const dataQuery = applyStatus(supabaseAdmin.from('alerts').select('*'))
      .order('created_at', { ascending: false })
      .limit(limit);

    const { data: alerts, error } = await dataQuery;
    if (error) throw new Error(error.message);

    const cylIds = Array.from(new Set((alerts || []).map((a) => a.cylinder_id).filter(Boolean)));
    let cylMap = new Map();
    if (cylIds.length) {
      const { data: cylinders } = await supabaseAdmin
        .from('cylinders')
        .select('id, cylinder_name, ward, location')
        .in('id', cylIds);
      cylMap = new Map((cylinders || []).map((c) => [c.id, c]));
    }

    const enriched = (alerts || []).map((a) => ({ ...a, cylinder: cylMap.get(a.cylinder_id) || null }));
    res.json({ alerts: enriched, count: count || 0 });
  } catch (e) {
    next(e);
  }
});

router.patch('/:id/resolve', async (req, res, next) => {
  try {
    const id = req.params.id;
    const { error } = await supabaseAdmin
      .from('alerts')
      .update({ is_resolved: true, resolved_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
