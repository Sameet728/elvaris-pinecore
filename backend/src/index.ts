// Main Express server entry point

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import 'express-async-errors';
import { getDb } from './db/database.js';
import { seedRealGoldData } from './db/seed.js';
import apiRouter from './routes/api.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

// Middleware
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173'] }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// Initialize database and seed real market data on startup
getDb();
seedRealGoldData().catch((err) => console.warn('[Seed Warning]', err));

// API routes
app.use('/api', apiRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server Error]', err.message);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`🚀 Pine Platform Backend running on http://localhost:${PORT}`);
  console.log(`   Instrument: XAUUSD`);
  console.log(`   Timeframe:  M5`);
  console.log(`   Data source: Dukascopy`);
});

export default app;
