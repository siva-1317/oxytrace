import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());

import authRoutes from './routes/auth.js';
import cylinderRoutes from './routes/cylinders.js';
import readingRoutes from './routes/readings.js';
import alertRoutes from './routes/alerts.js';
import refillRoutes from './routes/refills.js';
import analyticsRoutes from './routes/analytics.js';
import aiRoutes from './routes/ai.js';
import settingsRoutes from './routes/settings.js';
import stockRoutes from './routes/stock.js';

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/cylinders', cylinderRoutes);
app.use('/api/readings', readingRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/refills', refillRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/stock', stockRoutes);

app.use(errorHandler);

app.listen(process.env.PORT || 4000, () => {
  // eslint-disable-next-line no-console
  console.log(`OxyTrace server listening on ${process.env.PORT || 4000}`);
});
