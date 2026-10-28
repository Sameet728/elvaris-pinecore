// Express API routes for data, execution, and scripts

import fs from 'fs';
import path from 'path';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  downloadXAUUSD,
  loadCachedCandles,
  loadCandlesInRange,
  getDataMetadata,
} from '../dukascopy/downloader.js';
import { executeMultiEngine, SUPPORTED_ENGINES } from '../engines/orchestrator.js';
import { listScripts, getScript, saveScript, deleteScript } from '../scripts/storage.js';
import type { DownloadProgress } from '../types/index.js';
import * as ti from 'technicalindicators';

const router = Router();

// ─── Native TA Analysis Endpoint ─────────────────────────────────────────────

/**
 * GET /api/ta-analysis
 * Computes 15 native technical indicators from real Dukascopy candle data
 * using the open-source technicalindicators npm library.
 * Returns TradingView-style Buy/Neutral/Sell summary signal.
 */
router.get('/ta-analysis', (_req: Request, res: Response) => {
  const candles = loadCachedCandles();
  if (candles.length < 50) {
    res.status(400).json({ error: 'Need at least 50 candles for analysis' });
    return;
  }

  const closes  = candles.map((c) => c.close);
  const highs   = candles.map((c) => c.high);
  const lows    = candles.map((c) => c.low);
  const volumes = candles.map((c) => c.volume ?? 0);
  const hlc3    = candles.map((c) => (c.high + c.low + c.close) / 3);

  // ── EMA 9, 21, 50, 200 ──
  const ema9   = ti.EMA.calculate({ period: 9,   values: closes });
  const ema21  = ti.EMA.calculate({ period: 21,  values: closes });
  const ema50  = ti.EMA.calculate({ period: 50,  values: closes });
  const ema200 = ti.EMA.calculate({ period: 200, values: closes });

  // ── SMA 20, 50 ──
  const sma20 = ti.SMA.calculate({ period: 20, values: closes });
  const sma50 = ti.SMA.calculate({ period: 50, values: closes });

  // ── RSI 14 ──
  const rsi14 = ti.RSI.calculate({ period: 14, values: closes });

  // ── MACD (12, 26, 9) ──
  const macd = ti.MACD.calculate({
    fastPeriod: 12, slowPeriod: 26, signalPeriod: 9,
    SimpleMAOscillator: false, SimpleMASignal: false,
    values: closes,
  });

  // ── Bollinger Bands (20, 2) ──
  const bb = ti.BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });

  // ── Stochastic (14, 3, 3) ──
  const stoch = ti.Stochastic.calculate({
    period: 14, signalPeriod: 3,
    high: highs, low: lows, close: closes,
  });

  // ── ATR 14 ──
  const atr14 = ti.ATR.calculate({ period: 14, high: highs, low: lows, close: closes });

  // ── CCI 20 ──
  const cci20 = ti.CCI.calculate({ period: 20, high: highs, low: lows, close: closes });

  // ── OBV ──
  const obv = ti.OBV.calculate({ close: closes, volume: volumes });

  // ── VWAP (rolling 20-period approximation) ──
  const vwapValues: number[] = [];
  for (let i = 0; i < hlc3.length; i++) {
    const w = 20;
    const start = Math.max(0, i - w + 1);
    const slice = hlc3.slice(start, i + 1);
    const volSlice = volumes.slice(start, i + 1);
    const sumPV = slice.reduce((acc, p, j) => acc + p * volSlice[j], 0);
    const sumV  = volSlice.reduce((a, b) => a + b, 0);
    vwapValues.push(sumV > 0 ? sumPV / sumV : hlc3[i]);
  }

  // ── Williams %R ──
  const willR = ti.WilliamsR.calculate({ period: 14, high: highs, low: lows, close: closes });

  // ── Current price & indicators ──
  const lastClose   = closes[closes.length - 1];
  const lastEMA9    = ema9[ema9.length - 1];
  const lastEMA21   = ema21[ema21.length - 1];
  const lastEMA50   = ema50[ema50.length - 1];
  const lastEMA200  = ema200[ema200.length - 1];
  const lastSMA20   = sma20[sma20.length - 1];
  const lastSMA50   = sma50[sma50.length - 1];
  const lastRSI     = rsi14[rsi14.length - 1];
  const lastMACD    = macd[macd.length - 1];
  const lastBB      = bb[bb.length - 1];
  const lastStoch   = stoch[stoch.length - 1];
  const lastATR     = atr14[atr14.length - 1];
  const lastCCI     = cci20[cci20.length - 1];
  const lastOBV     = obv[obv.length - 1];
  const lastVWAP    = vwapValues[vwapValues.length - 1];
  const lastWillR   = willR[willR.length - 1];

  // ── Signal generation (TV-style) ──
  const signals: Array<{ name: string; value: number; signal: 'BUY' | 'NEUTRAL' | 'SELL' }> = [];

  const sig = (name: string, value: number, signal: 'BUY' | 'NEUTRAL' | 'SELL') =>
    signals.push({ name, value: Math.round(value * 100) / 100, signal });

  // EMA signals
  sig('EMA 9',   lastEMA9,   lastClose > lastEMA9   ? 'BUY' : 'SELL');
  sig('EMA 21',  lastEMA21,  lastClose > lastEMA21  ? 'BUY' : 'SELL');
  sig('EMA 50',  lastEMA50,  lastClose > lastEMA50  ? 'BUY' : 'SELL');
  sig('EMA 200', lastEMA200, lastClose > lastEMA200 ? 'BUY' : 'SELL');
  sig('SMA 20',  lastSMA20,  lastClose > lastSMA20  ? 'BUY' : 'SELL');
  sig('SMA 50',  lastSMA50,  lastClose > lastSMA50  ? 'BUY' : 'SELL');
  sig('VWAP',    lastVWAP,   lastClose > lastVWAP   ? 'BUY' : 'SELL');

  // Oscillator signals
  sig('RSI 14', lastRSI, lastRSI > 70 ? 'SELL' : lastRSI < 30 ? 'BUY' : 'NEUTRAL');
  sig('MACD', lastMACD?.MACD ?? 0,
    (lastMACD?.MACD ?? 0) > (lastMACD?.signal ?? 0) ? 'BUY' :
    (lastMACD?.MACD ?? 0) < (lastMACD?.signal ?? 0) ? 'SELL' : 'NEUTRAL'
  );
  sig('BB %B', lastClose, lastClose > lastBB?.upper ? 'SELL' : lastClose < lastBB?.lower ? 'BUY' : 'NEUTRAL');
  sig('Stoch %K', lastStoch?.k ?? 50, (lastStoch?.k ?? 50) > 80 ? 'SELL' : (lastStoch?.k ?? 50) < 20 ? 'BUY' : 'NEUTRAL');
  sig('ATR 14', lastATR, 'NEUTRAL');
  sig('CCI 20', lastCCI, lastCCI > 100 ? 'SELL' : lastCCI < -100 ? 'BUY' : 'NEUTRAL');
  sig('OBV',    lastOBV, obv.length > 1 ? (lastOBV > obv[obv.length - 2] ? 'BUY' : 'SELL') : 'NEUTRAL');
  sig('Williams %R', lastWillR, lastWillR < -80 ? 'BUY' : lastWillR > -20 ? 'SELL' : 'NEUTRAL');

  const buys    = signals.filter((s) => s.signal === 'BUY').length;
  const sells   = signals.filter((s) => s.signal === 'SELL').length;
  const neutral = signals.filter((s) => s.signal === 'NEUTRAL').length;
  const total   = signals.length;

  // Overall summary
  const overallSignal =
    buys >= Math.ceil(total * 0.6)  ? 'STRONG BUY'  :
    buys >= Math.ceil(total * 0.4)  ? 'BUY'          :
    sells >= Math.ceil(total * 0.6) ? 'STRONG SELL'  :
    sells >= Math.ceil(total * 0.4) ? 'SELL'         : 'NEUTRAL';

  res.json({
    timestamp: Date.now(),
    symbol: 'XAUUSD',
    timeframe: 'M5',
    price: lastClose,
    source: 'technicalindicators npm (open-source)',
    summary: { signal: overallSignal, buy: buys, neutral, sell: sells, total },
    movingAverages: {
      ema9: lastEMA9,  ema21: lastEMA21, ema50: lastEMA50, ema200: lastEMA200,
      sma20: lastSMA20, sma50: lastSMA50, vwap: Math.round(lastVWAP * 100) / 100,
    },
    oscillators: {
      rsi14: Math.round(lastRSI * 100) / 100,
      macdLine: Math.round((lastMACD?.MACD ?? 0) * 100) / 100,
      macdSignal: Math.round((lastMACD?.signal ?? 0) * 100) / 100,
      macdHist: Math.round((lastMACD?.histogram ?? 0) * 100) / 100,
      bbUpper: Math.round((lastBB?.upper ?? 0) * 100) / 100,
      bbMiddle: Math.round((lastBB?.middle ?? 0) * 100) / 100,
      bbLower: Math.round((lastBB?.lower ?? 0) * 100) / 100,
      stochK: Math.round((lastStoch?.k ?? 0) * 100) / 100,
      stochD: Math.round((lastStoch?.d ?? 0) * 100) / 100,
      atr14: Math.round(lastATR * 100) / 100,
      cci20: Math.round(lastCCI * 100) / 100,
      williamsR: Math.round(lastWillR * 100) / 100,
      obv: lastOBV,
    },
    signals,
    bars: candles.length,
    lastTimestamp: candles[candles.length - 1]?.openTime,
  });
});


// ─── Data Routes ─────────────────────────────────────────────────────────────

/**
 * GET /api/data/metadata
 * Returns stats about currently cached Dukascopy data.
 */
router.get('/data/metadata', (_req: Request, res: Response) => {
  const meta = getDataMetadata();
  res.json(meta);
});

/**
 * GET /api/data/candles
 * Returns cached XAUUSD 5-minute candles.
 * Optional query params: start, end (Unix ms), limit
 */
router.get('/data/candles', (req: Request, res: Response) => {
  const { start, end, limit } = req.query;

  let candles = (start && end)
    ? loadCandlesInRange(Number(start), Number(end))
    : loadCachedCandles();

  if (limit) {
    const n = parseInt(limit as string, 10);
    if (!isNaN(n) && n > 0) {
      candles = candles.slice(-n);
    }
  }

  res.json({
    candles,
    count: candles.length,
    instrument: 'XAUUSD',
    timeframe: 'M5',
    provider: 'Dukascopy',
  });
});

/**
 * POST /api/data/download
 * Triggers a real Dukascopy data download.
 * Uses Server-Sent Events to stream progress.
 */
const DownloadSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
});

router.post('/data/download', async (req: Request, res: Response) => {
  const parsed = DownloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
    return;
  }

  const startDate = new Date(parsed.data.startDate);
  const endDate = new Date(parsed.data.endDate);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    res.status(400).json({ error: 'Invalid date format. Use ISO 8601 strings.' });
    return;
  }

  if (startDate >= endDate) {
    res.status(400).json({ error: 'startDate must be before endDate.' });
    return;
  }

  // Use SSE for real-time progress
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendProgress = (progress: DownloadProgress) => {
    res.write(`data: ${JSON.stringify(progress)}\n\n`);
  };

  try {
    const candles = await downloadXAUUSD({
      startDate,
      endDate,
      onProgress: sendProgress,
    });

    const meta = getDataMetadata();
    res.write(`data: ${JSON.stringify({
      status: 'complete',
      message: `Download complete: ${candles.length} candles`,
      percent: 100,
      metadata: meta,
    })}\n\n`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.write(`data: ${JSON.stringify({
      status: 'error',
      message,
      percent: 0,
    })}\n\n`);
  } finally {
    res.end();
  }
});

// ─── Script Execution Routes ──────────────────────────────────────────────────

// ─── Engine Information Route ────────────────────────────────────────────────
/**
 * GET /api/engines
 * Returns all 4 integrated open-source Pine Script runtimes and their active status.
 */
router.get('/engines', (_req: Request, res: Response) => {
  res.json({
    engines: SUPPORTED_ENGINES,
    count: SUPPORTED_ENGINES.length,
    activeEngine: 'auto',
  });
});

/**
 * POST /api/execute
 * Execute Pine Script using selected open-source engine (PineTS, PyneCore, OpenPineScript, or Native TA).
 */
const ExecuteSchema = z.object({
  script: z.string().min(1, 'Script cannot be empty'),
  engine: z.enum(['auto', 'pinets', 'pynecore', 'openpinescript', 'native']).optional(),
  startTime: z.number().optional(),
  endTime: z.number().optional(),
  maxBars: z.number().optional(),
});

router.post('/execute', async (req: Request, res: Response) => {
  const parsed = ExecuteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    return;
  }

  const result = await executeMultiEngine(parsed.data);
  res.json(result);
});


// ─── Saved Scripts Routes ─────────────────────────────────────────────────────

/**
 * GET /api/scripts
 * List all saved scripts.
 */
router.get('/scripts', (_req: Request, res: Response) => {
  res.json(listScripts());
});

/**
 * GET /api/scripts/:id
 * Get a specific saved script.
 */
router.get('/scripts/:id', (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const script = getScript(id);
  if (!script) {
    res.status(404).json({ error: 'Script not found' });
    return;
  }
  res.json(script);
});

/**
 * POST /api/scripts
 * Save a new script.
 */
const SaveScriptSchema = z.object({
  name: z.string().min(1).max(200),
  source: z.string().min(1),
});

router.post('/scripts', (req: Request, res: Response) => {
  const parsed = SaveScriptSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid script data', details: parsed.error.issues });
    return;
  }
  const script = saveScript(parsed.data.name, parsed.data.source);
  res.status(201).json(script);
});

/**
 * PUT /api/scripts/:id
 * Update an existing script.
 */
router.put('/scripts/:id', (req: Request, res: Response) => {
  const parsed = SaveScriptSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid script data', details: parsed.error.issues });
    return;
  }
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const script = saveScript(parsed.data.name, parsed.data.source, id);
  res.json(script);
});

/**
 * DELETE /api/scripts/:id
 * Delete a saved script.
 */
router.delete('/scripts/:id', (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const ok = deleteScript(id);
  if (!ok) {
    res.status(404).json({ error: 'Script not found' });
    return;
  }
  res.json({ success: true });
});

// ─── AI Leaderboard Routes ───────────────────────────────────────────────────
/**
 * GET /api/leaderboard
 * Merges strategy_leaderboard.json + ultimate_best_strategy.json,
 * deduplicates, sorts by score desc, returns all.
 */
// Helper to compute a standardized score (0 - 200+) based on user's exact criteria:
// 1. Dual-month balance (Sep >= 10R & Oct >= 10R is champion tier)
// 2. Calmar ratio >= 4.0
// 3. Max DD <= 3.5R
// 4. TP in 20-42 pips
// 5. Win Rate & Trade Count
function computeStrategyScore(e: any): number {
  const sep = Number(e.sepR ?? 0);
  const oct = Number(e.octR ?? 0);
  const totalR = Number(e.cumulativeR ?? e.totalR ?? (sep + oct));
  const calmar = Number(e.calmarRatio ?? e.calmar ?? 0);
  const maxDD = Number(e.maxDrawdown ?? e.maxDD ?? 0);
  const wr = Number(e.winRate ?? 0);
  const avgTp = Number(e.avgTpPips ?? 0);

  let score = 0;
  // Balanced monthly performance: heavier weight on the lower month
  const minMonth = Math.min(sep, oct);
  score += minMonth * 3.5;
  score += totalR * 1.5;

  // Calmar ratio reward
  score += Math.min(calmar, 25) * 1.5;

  // Win rate component
  score += (wr / 10);

  // Prop firm compliance bonus (Max DD <= 3.5R & Calmar >= 4.0)
  if (maxDD > 0 && maxDD <= 3.5 && calmar >= 4.0) {
    score += 20;
  }

  // Target pip compliance (20 - 42 pips)
  if (avgTp >= 20 && avgTp <= 42) {
    score += 10;
  }

  // Champion Tier: Dual-Month >= 10R
  if (sep >= 10.0 && oct >= 10.0) {
    score += 60.0;
  } else if (sep >= 8.0 && oct >= 7.0) {
    score += 25.0;
  } else if (sep >= 10.0 && oct >= 5.0) {
    score += 15.0;
  }

  // Penalties for failing prop limits
  if (maxDD > 3.5) {
    score -= (maxDD - 3.5) * 4;
  }
  if (calmar < 4.0) {
    score -= (4.0 - calmar) * 4;
  }

  return Math.max(1, Math.round(score * 10) / 10);
}

router.get('/leaderboard', (_req: Request, res: Response) => {
  try {
    const all: any[] = [];

    // Source 1: AI Miner leaderboard
    const lb1 = path.resolve(process.cwd(), 'data/strategy_leaderboard.json');
    if (fs.existsSync(lb1)) {
      const raw = JSON.parse(fs.readFileSync(lb1, 'utf8'));
      if (Array.isArray(raw)) {
        for (const item of raw) {
          const sc = (item.score && item.score > 0) ? item.score : computeStrategyScore(item);
          all.push({
            ...item,
            score: sc,
          });
        }
      }
    }

    // Source 2: Ultimate grid-search results
    const lb2 = path.resolve(process.cwd(), 'data/ultimate_best_strategy.json');
    if (fs.existsSync(lb2)) {
      const raw2 = JSON.parse(fs.readFileSync(lb2, 'utf8'));
      const entries = [...(raw2.dualMonthHits || []), ...(raw2.top20 || [])];
      for (const e of entries) {
        const item = {
          name:        e.name || e.cfg?.name || 'Unknown',
          filePath:    '',
          score:       e.score ?? 0,
          sepR:        e.sepR ?? 0,
          octR:        e.octR ?? 0,
          cumulativeR: e.totalR ?? e.cumulativeR ?? 0,
          winRate:     e.winRate ?? 0,
          maxDrawdown: e.maxDD ?? e.maxDrawdown ?? 0,
          calmarRatio: e.calmar ?? e.calmarRatio ?? 0,
          closed:      e.trades ?? e.closed ?? 0,
          avgTpPips:   e.avgTpPips ?? 0,
          maxConsLoss: 0,
          propStatus:  (e.sepR >= 10 && e.octR >= 10) ? 'CHAMPION' : (e.calmar >= 4 && e.maxDD <= 3.5) ? 'NEAR_PASS' : 'TESTING',
          monteCarlo:  e.monteCarlo ?? null,
        };
        item.score = (item.score && item.score > 0) ? item.score : computeStrategyScore(item);
        all.push(item);
      }
    }

    // Deduplicate by name (keep highest score)
    const seen = new Map<string, any>();
    for (const e of all) {
      const key = String(e.name ?? '');
      const cur = seen.get(key);
      if (!cur || (e.score ?? 0) > (cur.score ?? 0)) seen.set(key, e);
    }

    const merged = [...seen.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    res.json({ success: true, count: merged.length, leaderboard: merged });
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to read leaderboard: ' + e.message });
  }
});

export default router;
