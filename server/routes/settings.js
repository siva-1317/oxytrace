import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();
router.use(requireAuth);

// Simple in-memory settings store; replace with a DB table for persistence.
const thresholds = {
  low_gas_pct: 20,
  danger_gas_pct: 10,
  leak_warn_ppm: 120,
  leak_danger_ppm: 200
};

router.get('/thresholds', async (_req, res) => {
  res.json({ thresholds });
});

router.patch('/thresholds', async (req, res) => {
  for (const k of Object.keys(thresholds)) {
    if (k in req.body) thresholds[k] = Number(req.body[k]);
  }
  res.json({ ok: true, thresholds });
});

export default router;
