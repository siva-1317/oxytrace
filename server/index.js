import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
const allowedOrigins = (process.env.CLIENT_URL || '').split(',').map(url => url.trim());
app.use(cors({ origin: allowedOrigins.length > 0 ? allowedOrigins : '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

import authRoutes from './routes/auth.js';
import cylinderRoutes from './routes/cylinders.js';
import readingRoutes from './routes/readings.js';
import alertRoutes from './routes/alerts.js';
import refillRoutes from './routes/refills.js';
import analyticsRoutes from './routes/analytics.js';
import aiRoutes from './routes/ai.js';
import settingsRoutes from './routes/settings.js';
import stockRoutes from './routes/stock.js';
import mappingRoutes from './routes/mapping.js';
import usersRoutes from './routes/users.js';

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
app.use('/api/mapping', mappingRoutes);
app.use('/api/users', usersRoutes);

app.get('/speed-test', (req, res) => {
  const size = Math.min(1024 * 1024, Math.max(64 * 1024, Number(req.query.size || 256 * 1024)));
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', String(size));
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.send(Buffer.alloc(size, '0'));
});

app.use(errorHandler);

app.listen(process.env.PORT || 4000, () => {
  // eslint-disable-next-line no-console
  console.log(`OxyTrace server listening on ${process.env.PORT || 4000}`);
});
