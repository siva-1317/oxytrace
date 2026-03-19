import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { supabaseAdmin } from '../services/supabaseAdmin.js';
import {
  analyzeCylinder,
  analyzeCylinderStream,
  generateAnalyticsReport,
  generateSummary,
  listModels,
  testGemini
} from '../services/geminiService.js';

const router = express.Router();
router.use(requireAuth);

function overrides(req) {
  const apiKey = req.headers['x-gemini-key'];
  const model = req.headers['x-gemini-model'];
  const temperature =
    req.headers['x-gemini-temp'] != null ? Number(req.headers['x-gemini-temp']) : undefined;
  return {
    apiKey: apiKey ? String(apiKey) : undefined,
    model: model ? String(model) : undefined,
    temperature: Number.isFinite(temperature) ? temperature : undefined
  };
}

router.get('/models', async (req, res, next) => {
  try {
    const data = await listModels({ apiKey: overrides(req).apiKey });
    res.json(data);
  } catch (e) {
    next(e);
  }
});

router.post('/summary', async (req, res, next) => {
  try {
    const { data: alerts } = await supabaseAdmin
      .from('alerts')
      .select('alert_type, message, severity, created_at')
      .eq('is_resolved', false)
      .order('created_at', { ascending: false })
      .limit(10);

    const { data: cylinders } = await supabaseAdmin
      .from('cylinders')
      .select(
        'id, cylinder_name, ward, location, is_active, sensor_readings (gas_weight_kg, leakage_ppm, valve_open, gas_level_pct, created_at)'
      )
      .order('created_at', { ascending: false });

    const sys = {
      now: new Date().toISOString(),
      alerts: alerts || [],
      cylinders: (cylinders || []).slice(0, 30).map((c) => ({
        id: c.id,
        name: c.cylinder_name,
        ward: c.ward,
        location: c.location,
        is_active: c.is_active,
        latest: Array.isArray(c.sensor_readings) && c.sensor_readings.length ? c.sensor_readings[0] : null
      }))
    };

    const text = await generateSummary(sys, { ...overrides(req) });
    res.json({ text });
  } catch (e) {
    next(e);
  }
});

router.post('/cylinder-analysis', async (req, res, next) => {
  try {
    const { cylinderId, question } = req.body || {};
    if (!cylinderId || !question) return res.status(400).json({ error: 'Missing cylinderId/question' });

    const { data: cylinder, error } = await supabaseAdmin
      .from('cylinders')
      .select('*')
      .eq('id', cylinderId)
      .single();
    if (error) throw new Error(error.message);

    const { data: readings } = await supabaseAdmin
      .from('sensor_readings')
      .select('*')
      .eq('cylinder_id', cylinderId)
      .order('created_at', { ascending: false })
      .limit(200);

    const cylinderData = { ...cylinder, readings: readings || [] };

    const stream = String(req.query.stream || '') === '1';
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      for await (const chunk of analyzeCylinderStream(cylinderData, question, { ...overrides(req) })) {
        res.write(`data: ${chunk.replace(/\n/g, ' ')}\n\n`);
      }
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    const text = await analyzeCylinder(cylinderData, question, { ...overrides(req) });
    res.json({ text });
  } catch (e) {
    next(e);
  }
});

router.post('/analytics-report', async (req, res, next) => {
  try {
    const { from, to, stats } = req.body || {};
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });
    const markdown = await generateAnalyticsReport(stats || {}, { from, to }, { ...overrides(req) });
    res.json({ markdown });
  } catch (e) {
    next(e);
  }
});

router.post('/test', async (req, res, next) => {
  try {
    const text = await testGemini(req.body?.prompt || 'Say OK.', { ...overrides(req) });
    res.json({ text });
  } catch (e) {
    next(e);
  }
});

export default router;
