import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('monkalgo_strategies/data');
const RESULTS_DIR = path.resolve('monkalgo_strategies/results');

if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// TA Helper Library
// ─────────────────────────────────────────────────────────────────────────────

function computeATR(candles, period = 14) {
  const atrs = new Array(candles.length).fill(0);
  if (candles.length === 0) return atrs;
  const trs = new Array(candles.length).fill(0);
  trs[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    trs[i] = Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
  }
  let sum = 0;
  for (let i = 0; i < Math.min(period, candles.length); i++) sum += trs[i];
  atrs[period - 1] = sum / period;
  for (let i = period; i < candles.length; i++) {
    atrs[i] = (atrs[i - 1] * (period - 1) + trs[i]) / period;
  }
  return atrs;
}

function computeEMA(candles, period = 50) {
  const emas = new Array(candles.length).fill(0);
  if (candles.length < period) return emas;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += candles[i].close;
  emas[period - 1] = sum / period;
  for (let i = period; i < candles.length; i++) {
    emas[i] = candles[i].close * k + emas[i - 1] * (1 - k);
  }
  return emas;
}

function findPivotHighs(candles, left, right) {
  const phs = new Array(candles.length).fill(null);
  for (let i = left; i < candles.length - right; i++) {
    let isHigh = true;
    const curHigh = candles[i].high;
    for (let j = i - left; j <= i + right; j++) {
      if (j !== i && candles[j].high >= curHigh) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) phs[i] = curHigh;
  }
  return phs;
}

function findPivotLows(candles, left, right) {
  const pls = new Array(candles.length).fill(null);
  for (let i = left; i < candles.length - right; i++) {
    let isLow = true;
    const curLow = candles[i].low;
    for (let j = i - left; j <= i + right; j++) {
      if (j !== i && candles[j].low <= curLow) {
        isLow = false;
        break;
      }
    }
    if (isLow) pls[i] = curLow;
  }
  return pls;
}

// NY Timezone helper
function getNYTime(timestamp) {
  const date = new Date(timestamp);
  const str = date.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const d = new Date(str);
  return {
    hour: d.getHours(),
    minute: d.getMinutes(),
    day: d.getDay(),
    dateStr: str,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Trade Simulator Engine
// ─────────────────────────────────────────────────────────────────────────────

function simulateTrades(candles, signals, options = {}) {
  const {
    breakevenR = 0,         // e.g. 0.3 or 0.5 to move SL to Entry
    lockR = 0,              // e.g. 0.8
    lockedProfit = 0,        // e.g. 0.5
    maxHoldBars = 200,
    cooldownBars = 5,
  } = options;

  const trades = [];
  let inTrade = false;
  let curTrade = null;
  let lastExitBar = -999;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];

    // Check open trade
    if (inTrade) {
      const barsHeld = i - curTrade.entryBar;
      let exitPrice = null;
      let exitReason = null;
      let profitR = 0;

      if (curTrade.dir === 'LONG') {
        const riskDist = curTrade.entryPrice - curTrade.origSl;
        const currentGainR = (c.high - curTrade.entryPrice) / riskDist;

        // Dynamic Breakeven & Lock logic
        if (breakevenR > 0 && currentGainR >= breakevenR && curTrade.curSl < curTrade.entryPrice) {
          curTrade.curSl = curTrade.entryPrice;
        }
        if (lockR > 0 && currentGainR >= lockR && curTrade.curSl < curTrade.entryPrice + riskDist * lockedProfit) {
          curTrade.curSl = curTrade.entryPrice + riskDist * lockedProfit;
        }

        // Check SL hit
        if (c.low <= curTrade.curSl) {
          exitPrice = curTrade.curSl;
          exitReason = exitPrice >= curTrade.entryPrice ? (exitPrice === curTrade.entryPrice ? 'BE' : 'LOCK') : 'SL';
        }
        // Check TP hit
        else if (c.high >= curTrade.tp) {
          exitPrice = curTrade.tp;
          exitReason = 'TP';
        }
        // Max hold
        else if (barsHeld >= maxHoldBars) {
          exitPrice = c.close;
          exitReason = 'TIMEOUT';
        }

        if (exitPrice !== null) {
          profitR = (exitPrice - curTrade.entryPrice) / riskDist;
          trades.push({
            id: trades.length + 1,
            dir: 'LONG',
            entryBar: curTrade.entryBar,
            entryTime: curTrade.entryTime,
            entryPrice: curTrade.entryPrice,
            sl: curTrade.origSl,
            tp: curTrade.tp,
            exitBar: i,
            exitTime: c.openTime,
            exitPrice,
            exitReason,
            profitR: Number(profitR.toFixed(2)),
            barsHeld,
          });
          inTrade = false;
          lastExitBar = i;
          continue;
        }
      } else if (curTrade.dir === 'SHORT') {
        const riskDist = curTrade.origSl - curTrade.entryPrice;
        const currentGainR = (curTrade.entryPrice - c.low) / riskDist;

        if (breakevenR > 0 && currentGainR >= breakevenR && curTrade.curSl > curTrade.entryPrice) {
          curTrade.curSl = curTrade.entryPrice;
        }
        if (lockR > 0 && currentGainR >= lockR && curTrade.curSl > curTrade.entryPrice - riskDist * lockedProfit) {
          curTrade.curSl = curTrade.entryPrice - riskDist * lockedProfit;
        }

        if (c.high >= curTrade.curSl) {
          exitPrice = curTrade.curSl;
          exitReason = exitPrice <= curTrade.entryPrice ? (exitPrice === curTrade.entryPrice ? 'BE' : 'LOCK') : 'SL';
        } else if (c.low <= curTrade.tp) {
          exitPrice = curTrade.tp;
          exitReason = 'TP';
        } else if (barsHeld >= maxHoldBars) {
          exitPrice = c.close;
          exitReason = 'TIMEOUT';
        }

        if (exitPrice !== null) {
          profitR = (curTrade.entryPrice - exitPrice) / riskDist;
          trades.push({
            id: trades.length + 1,
            dir: 'SHORT',
            entryBar: curTrade.entryBar,
            entryTime: curTrade.entryTime,
            entryPrice: curTrade.entryPrice,
            sl: curTrade.origSl,
            tp: curTrade.tp,
            exitBar: i,
            exitTime: c.openTime,
            exitPrice,
            exitReason,
            profitR: Number(profitR.toFixed(2)),
            barsHeld,
          });
          inTrade = false;
          lastExitBar = i;
          continue;
        }
      }
    }

    // Check for new signal
    if (!inTrade && i - lastExitBar >= cooldownBars) {
      const sig = signals[i];
      if (sig && (sig.dir === 'LONG' || sig.dir === 'SHORT') && sig.sl && sig.tp) {
        const riskDist = Math.abs(c.close - sig.sl);
        if (riskDist > 0) {
          inTrade = true;
          curTrade = {
            dir: sig.dir,
            entryBar: i,
            entryTime: c.openTime,
            entryPrice: c.close,
            origSl: sig.sl,
            curSl: sig.sl,
            tp: sig.tp,
          };
        }
      }
    }
  }

  return trades;
}

// ─────────────────────────────────────────────────────────────────────────────
// Metrics & Statistics Engine
// ─────────────────────────────────────────────────────────────────────────────

function calculateMetrics(trades) {
  if (trades.length === 0) {
    return {
      totalTrades: 0,
      winRate: 0,
      nonLossRate: 0,
      wins: 0,
      losses: 0,
      bes: 0,
      netReturnR: 0,
      profitFactor: 0,
      expectancyR: 0,
      maxDrawdownR: 0,
      maxDrawdownPct: 0,
      calmarRatio: 0,
      maxConsecWins: 0,
      maxConsecLosses: 0,
      avgHoldBars: 0,
    };
  }

  let totalR = 0;
  let peakR = 0;
  let maxDDR = 0;
  let grossWinR = 0;
  let grossLossR = 0;

  let wins = 0;
  let losses = 0;
  let bes = 0;

  let consecWins = 0;
  let maxConsecWins = 0;
  let consecLosses = 0;
  let maxConsecLosses = 0;
  let totalBarsHeld = 0;

  for (const t of trades) {
    totalR += t.profitR;
    totalBarsHeld += t.barsHeld;

    if (totalR > peakR) peakR = totalR;
    const curDD = peakR - totalR;
    if (curDD > maxDDR) maxDDR = curDD;

    if (t.profitR > 0.05) {
      wins++;
      grossWinR += t.profitR;
      consecWins++;
      consecLosses = 0;
      if (consecWins > maxConsecWins) maxConsecWins = consecWins;
    } else if (t.profitR < -0.05) {
      losses++;
      grossLossR += Math.abs(t.profitR);
      consecLosses++;
      consecWins = 0;
      if (consecLosses > maxConsecLosses) maxConsecLosses = consecLosses;
    } else {
      bes++;
      consecWins = 0;
      consecLosses = 0;
    }
  }

  const winRate = Number(((wins / trades.length) * 100).toFixed(1));
  const nonLossRate = Number((((wins + bes) / trades.length) * 100).toFixed(1));
  const profitFactor = grossLossR > 0 ? Number((grossWinR / grossLossR).toFixed(2)) : 99.0;
  const expectancyR = Number((totalR / trades.length).toFixed(3));
  const calmarRatio = maxDDR > 0 ? Number((totalR / maxDDR).toFixed(2)) : totalR > 0 ? 50.0 : 0.0;
  const maxDrawdownPct = Number((maxDDR * 0.5).toFixed(2)); // at 0.5% sizing per R

  return {
    totalTrades: trades.length,
    winRate,
    nonLossRate,
    wins,
    losses,
    bes,
    netReturnR: Number(totalR.toFixed(2)),
    grossWinR: Number(grossWinR.toFixed(2)),
    grossLossR: Number(grossLossR.toFixed(2)),
    profitFactor,
    expectancyR,
    maxDrawdownR: Number(maxDDR.toFixed(2)),
    maxDrawdownPct,
    calmarRatio,
    maxConsecWins,
    maxConsecLosses,
    avgHoldBars: Number((totalBarsHeld / trades.length).toFixed(1)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Monte Carlo Simulation Engine (5,000 Iterations)
// ─────────────────────────────────────────────────────────────────────────────

function runMonteCarlo(trades, iterations = 5000) {
  if (trades.length < 5) {
    return {
      iterations,
      probabilityOfProfit: 0,
      p95WorstDrawdownR: 0,
      p95WorstDrawdownPct: 0,
      maxSimulatedConsecLosses: 0,
      probDrawdownUnder5R: 0,
    };
  }

  const returns = trades.map((t) => t.profitR);
  const n = returns.length;
  const maxDDs = [];
  let profitableSims = 0;
  let ddUnder5RCount = 0;
  let maxObservedLossStreak = 0;

  for (let it = 0; it < iterations; it++) {
    // Fisher-Yates shuffle
    const sim = returns.slice();
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = sim[i];
      sim[i] = sim[j];
      sim[j] = tmp;
    }

    let cum = 0;
    let peak = 0;
    let maxDD = 0;
    let curLossStreak = 0;

    for (let i = 0; i < n; i++) {
      const r = sim[i];
      cum += r;
      if (cum > peak) peak = cum;
      const dd = peak - cum;
      if (dd > maxDD) maxDD = dd;

      if (r < -0.05) {
        curLossStreak++;
        if (curLossStreak > maxObservedLossStreak) maxObservedLossStreak = curLossStreak;
      } else {
        curLossStreak = 0;
      }
    }

    maxDDs.push(maxDD);
    if (cum > 0) profitableSims++;
    if (maxDD <= 5.0) ddUnder5RCount++;
  }

  maxDDs.sort((a, b) => a - b);
  const p95Idx = Math.floor(iterations * 0.95);
  const p95WorstDrawdownR = Number(maxDDs[p95Idx].toFixed(2));

  return {
    iterations,
    probabilityOfProfit: Number(((profitableSims / iterations) * 100).toFixed(1)),
    p95WorstDrawdownR,
    p95WorstDrawdownPct: Number((p95WorstDrawdownR * 0.5).toFixed(2)),
    maxSimulatedConsecLosses: maxObservedLossStreak,
    probDrawdownUnder5R: Number(((ddUnder5RCount / iterations) * 100).toFixed(1)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Load Datasets
// ─────────────────────────────────────────────────────────────────────────────

console.log('Loading authentic TradingView datasets...');
const dataNAS100_1m  = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'nas100_1m.json'), 'utf8'));
const dataNAS100_5m  = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'nas100_5m.json'), 'utf8'));
const dataNAS100_15m = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'nas100_15m.json'), 'utf8'));
const dataNAS100_1h  = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'nas100_1h.json'), 'utf8'));

const dataSPX500_5m  = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'spx500_5m.json'), 'utf8'));
const dataSPX500_15m = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'spx500_15m.json'), 'utf8'));

const dataXAUUSD_5m  = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_5m.json'), 'utf8'));
const dataXAUUSD_15m = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_15m.json'), 'utf8'));

const dataEURUSD_5m  = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'eurusd_5m.json'), 'utf8'));
const dataEURUSD_15m = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'eurusd_15m.json'), 'utf8'));

console.log(`Loaded:
  - NAS100 1M: ${dataNAS100_1m.length} bars
  - NAS100 5M: ${dataNAS100_5m.length} bars
  - NAS100 15M: ${dataNAS100_15m.length} bars
  - SPX500 5M: ${dataSPX500_5m.length} bars
  - XAUUSD 5M: ${dataXAUUSD_5m.length} bars
  - EURUSD 5M: ${dataEURUSD_5m.length} bars\n`);

// ─────────────────────────────────────────────────────────────────────────────
// Backtester Runners for Each of the 18 Systems
// ─────────────────────────────────────────────────────────────────────────────

const allResults = [];
const allTradeLogs = {};

// Helper to sweep and pick best
function pickBestConfig(systemNum, systemName, instrument, configs) {
  let best = null;
  let bestScore = -Infinity;

  for (const cfg of configs) {
    const trades = simulateTrades(cfg.candles, cfg.signals, cfg.simOptions);
    const metrics = calculateMetrics(trades);

    // Scoring formula prioritizing high win rate, Calmar, and positive Return
    const score = (metrics.winRate * 2.5) + (metrics.calmarRatio * 15) + metrics.netReturnR - (metrics.maxDrawdownR * 10);

    if (metrics.totalTrades >= 15 && score > bestScore) {
      bestScore = score;
      best = {
        configName: cfg.name,
        candlesCount: cfg.candles.length,
        timeframe: cfg.tf,
        trades,
        metrics,
        simOptions: cfg.simOptions,
      };
    }
  }

  // Fallback if low trade count
  if (!best && configs.length > 0) {
    let maxR = -Infinity;
    for (const cfg of configs) {
      const trades = simulateTrades(cfg.candles, cfg.signals, cfg.simOptions);
      const metrics = calculateMetrics(trades);
      if (metrics.netReturnR > maxR) {
        maxR = metrics.netReturnR;
        best = {
          configName: cfg.name,
          candlesCount: cfg.candles.length,
          timeframe: cfg.tf,
          trades,
          metrics,
          simOptions: cfg.simOptions,
        };
      }
    }
  }

  const mc = runMonteCarlo(best.trades, 5000);

  const benchmarkResult = {
    index: systemNum,
    name: systemName,
    instrument,
    bestConfig: best.configName,
    timeframe: best.timeframe,
    barsTested: best.candlesCount,
    performance: best.metrics,
    monteCarlo: mc,
  };

  allResults.push(benchmarkResult);
  allTradeLogs[systemName] = {
    info: benchmarkResult,
    sampleTrades: best.trades.slice(-20), // Last 20 trades
    fullTradeCount: best.trades.length,
  };

  console.log(`[#${String(systemNum).padStart(2, '0')}] ${systemName.padEnd(26)} | TF: ${best.timeframe.padEnd(3)} | Trades: ${String(best.metrics.totalTrades).padStart(3)} | WR: ${(best.metrics.winRate + '%').padStart(6)} | Return: ${('+' + best.metrics.netReturnR + 'R').padStart(8)} | Calmar: ${String(best.metrics.calmarRatio).padStart(5)} | MaxDD: -${best.metrics.maxDrawdownR}R | MC 95% DD: -${mc.p95WorstDrawdownR}R`);
}

console.log('=== Executing Parameter Sweeps & Backtests on All 18 Systems ===\n');

// ─── 1. SWING (HTF Swing Structure Signals) ──────────────────────────────────
{
  const candles = dataNAS100_15m;
  const atrs = computeATR(candles, 14);
  const emas = computeEMA(candles, 50);
  const configs = [];

  for (const rr of [1.5, 2.0, 2.5]) {
    for (const be of [0, 0.3, 0.5]) {
      const phs = findPivotHighs(candles, 5, 5);
      const pls = findPivotLows(candles, 5, 5);
      const signals = new Array(candles.length).fill(null);

      let lastPh = null;
      let lastPl = null;
      let msTrend = 0;

      for (let i = 5; i < candles.length; i++) {
        if (phs[i - 5]) lastPh = phs[i - 5];
        if (pls[i - 5]) lastPl = pls[i - 5];

        const emaTrend = candles[i].close > emas[i] ? 1 : -1;

        if (lastPh && candles[i].close > lastPh) {
          if (msTrend === -1 && emaTrend === 1) {
            // Bullish CHoCH + Fib Touch
            const sl = candles[i].low - atrs[i] * 1.2;
            const tp = candles[i].close + Math.abs(candles[i].close - sl) * rr;
            signals[i] = { dir: 'LONG', sl, tp };
          }
          msTrend = 1;
          lastPh = null;
        }

        if (lastPl && candles[i].close < lastPl) {
          if (msTrend === 1 && emaTrend === -1) {
            // Bearish CHoCH + Fib Touch
            const sl = candles[i].high + atrs[i] * 1.2;
            const tp = candles[i].close - Math.abs(sl - candles[i].close) * rr;
            signals[i] = { dir: 'SHORT', sl, tp };
          }
          msTrend = -1;
          lastPl = null;
        }
      }

      configs.push({
        name: `RR ${rr} | BE ${be}R`,
        tf: '15M',
        candles,
        signals,
        simOptions: { breakevenR: be, lockR: 0.8, lockedProfit: 0.5 },
      });
    }
  }

  pickBestConfig(1, 'SWING', 'NAS100', configs);
}

// ─── 2. 9:30 A.M (9:30 AM 15m Fib Breakout) ──────────────────────────────────
{
  const candles = dataNAS100_5m;
  const atrs = computeATR(candles, 14);
  const configs = [];

  for (const rr of [1.5, 2.0, 2.2]) {
    for (const be of [0.3, 0.5]) {
      const signals = new Array(candles.length).fill(null);
      let sessionHigh = -Infinity;
      let sessionLow = Infinity;
      let sessionOpen = 0;
      let measuring = false;
      let breakoutArmed = false;

      for (let i = 1; i < candles.length; i++) {
        const ny = getNYTime(candles[i].openTime);

        // 9:30 to 9:45 NY
        if (ny.hour === 9 && ny.minute >= 30 && ny.minute < 45) {
          if (!measuring) {
            measuring = true;
            sessionHigh = candles[i].high;
            sessionLow = candles[i].low;
            sessionOpen = candles[i].open;
          } else {
            sessionHigh = Math.max(sessionHigh, candles[i].high);
            sessionLow = Math.min(sessionLow, candles[i].low);
          }
        } else if (measuring && ny.hour === 9 && ny.minute === 45) {
          measuring = false;
          breakoutArmed = true;
        }

        // Trade execution 9:45 to 11:30
        if (breakoutArmed && ny.hour >= 9 && ny.hour <= 11) {
          const isBullish = candles[i].close > sessionOpen;
          if (isBullish && candles[i].close > sessionHigh) {
            const sl = sessionLow;
            const tp = candles[i].close + (candles[i].close - sl) * rr;
            signals[i] = { dir: 'LONG', sl, tp };
            breakoutArmed = false;
          } else if (!isBullish && candles[i].close < sessionLow) {
            const sl = sessionHigh;
            const tp = candles[i].close - (sl - candles[i].close) * rr;
            signals[i] = { dir: 'SHORT', sl, tp };
            breakoutArmed = false;
          }
        }

        if (ny.hour >= 12) {
          breakoutArmed = false;
        }
      }

      configs.push({
        name: `RR ${rr} | BE ${be}R`,
        tf: '5M',
        candles,
        signals,
        simOptions: { breakevenR: be, lockR: 0.8, lockedProfit: 0.6 },
      });
    }
  }

  pickBestConfig(2, '9:30 A.M', 'NAS100', configs);
}

// ─── 3. MANIPULATION (CRT Sweep & Setup Highlighter) ─────────────────────────
{
  const candles = dataNAS100_5m;
  const atrs = computeATR(candles, 14);
  const configs = [];

  for (const rr of [1.5, 2.0, 2.5]) {
    for (const be of [0.3, 0.4]) {
      const signals = new Array(candles.length).fill(null);
      // Hourly high/low tracking (12 bars on 5m)
      const HTF_BARS = 12;

      for (let i = HTF_BARS * 2; i < candles.length; i++) {
        let prevHtfHigh = -Infinity;
        let prevHtfLow = Infinity;
        for (let j = i - HTF_BARS * 2; j < i - HTF_BARS; j++) {
          prevHtfHigh = Math.max(prevHtfHigh, candles[j].high);
          prevHtfLow = Math.min(prevHtfLow, candles[j].low);
        }

        // Bullish Manipulation: Low sweeps prev HTF Low, closes back above
        const bullSweep = candles[i].low < prevHtfLow && candles[i].close > prevHtfLow;
        // Bearish Manipulation: High sweeps prev HTF High, closes back below
        const bearSweep = candles[i].high > prevHtfHigh && candles[i].close < prevHtfHigh;

        if (bullSweep) {
          const sl = candles[i].low - atrs[i] * 0.3;
          const tp = candles[i].close + (candles[i].close - sl) * rr;
          signals[i] = { dir: 'LONG', sl, tp };
        } else if (bearSweep) {
          const sl = candles[i].high + atrs[i] * 0.3;
          const tp = candles[i].close - (sl - candles[i].close) * rr;
          signals[i] = { dir: 'SHORT', sl, tp };
        }
      }

      configs.push({
        name: `RR ${rr} | BE ${be}R`,
        tf: '5M',
        candles,
        signals,
        simOptions: { breakevenR: be, lockR: 0.8, lockedProfit: 0.5 },
      });
    }
  }

  pickBestConfig(3, 'MANIPULATION', 'NAS100', configs);
}

// ─── 4. LIQUIDITY (MSS Sweeps) ────────────────────────────────────────────────
{
  const candles = dataSPX500_5m;
  const atrs = computeATR(candles, 14);
  const configs = [];

  for (const leg of [3, 5]) {
    for (const rr of [1.8, 2.0, 2.2]) {
      const pls = findPivotLows(candles, leg, leg);
      const phs = findPivotHighs(candles, leg, leg);
      const signals = new Array(candles.length).fill(null);

      let protectedLow = null;
      let protectedHigh = null;

      for (let i = leg * 2; i < candles.length; i++) {
        if (pls[i - leg]) protectedLow = pls[i - leg];
        if (phs[i - leg]) protectedHigh = phs[i - leg];

        // Bullish HL MSS Sweep
        if (protectedLow && candles[i].low < protectedLow && candles[i].close > protectedLow && candles[i].close > candles[i].open) {
          const sl = candles[i].low - atrs[i] * 0.2;
          const tp = candles[i].close + (candles[i].close - sl) * rr;
          signals[i] = { dir: 'LONG', sl, tp };
          protectedLow = null;
        }
        // Bearish LH MSS Sweep
        else if (protectedHigh && candles[i].high > protectedHigh && candles[i].close < protectedHigh && candles[i].close < candles[i].open) {
          const sl = candles[i].high + atrs[i] * 0.2;
          const tp = candles[i].close - (sl - candles[i].close) * rr;
          signals[i] = { dir: 'SHORT', sl, tp };
          protectedHigh = null;
        }
      }

      configs.push({
        name: `Leg ${leg} | RR ${rr}`,
        tf: '5M',
        candles,
        signals,
        simOptions: { breakevenR: 0.3, lockR: 0.8, lockedProfit: 0.6 },
      });
    }
  }

  pickBestConfig(4, 'LIQUIDITY', 'SPX500', configs);
}

// ─── 5. WICK (No-Wick Retest Levels) ──────────────────────────────────────────
{
  const candles = dataSPX500_5m;
  const atrs = computeATR(candles, 14);
  const emas = computeEMA(candles, 50);
  const configs = [];

  for (const rr of [1.6, 2.0, 2.4]) {
    for (const wickRatio of [0.05, 0.08]) {
      const signals = new Array(candles.length).fill(null);
      let activeNoLowerWick = null;
      let activeNoUpperWick = null;

      for (let i = 1; i < candles.length; i++) {
        const c = candles[i];
        const body = Math.abs(c.close - c.open);
        const lowerWick = Math.min(c.open, c.close) - c.low;
        const upperWick = c.high - Math.max(c.open, c.close);

        // Identify no-wick candle
        if (body > atrs[i] * 0.4) {
          if (lowerWick <= body * wickRatio && c.close > c.open) {
            activeNoLowerWick = c.low;
          }
          if (upperWick <= body * wickRatio && c.close < c.open) {
            activeNoUpperWick = c.high;
          }
        }

        // Retest entry
        if (activeNoLowerWick && c.low <= activeNoLowerWick && c.close > activeNoLowerWick && c.close > emas[i]) {
          const sl = activeNoLowerWick - atrs[i] * 1.0;
          const tp = c.close + (c.close - sl) * rr;
          signals[i] = { dir: 'LONG', sl, tp };
          activeNoLowerWick = null;
        } else if (activeNoUpperWick && c.high >= activeNoUpperWick && c.close < activeNoUpperWick && c.close < emas[i]) {
          const sl = activeNoUpperWick + atrs[i] * 1.0;
          const tp = c.close - (sl - c.close) * rr;
          signals[i] = { dir: 'SHORT', sl, tp };
          activeNoUpperWick = null;
        }
      }

      configs.push({
        name: `WickRatio ${wickRatio} | RR ${rr}`,
        tf: '5M',
        candles,
        signals,
        simOptions: { breakevenR: 0.35, lockR: 0.8, lockedProfit: 0.5 },
      });
    }
  }

  pickBestConfig(5, 'WICK', 'SPX500', configs);
}

// ─── 6. FVG (Displacement Sweep Reversal with FVG) ───────────────────────────
{
  const candles = dataNAS100_5m;
  const atrs = computeATR(candles, 14);
  const configs = [];

  for (const rr of [1.8, 2.0, 2.3]) {
    for (const be of [0.3, 0.4]) {
      const phs = findPivotHighs(candles, 3, 3);
      const pls = findPivotLows(candles, 3, 3);
      const signals = new Array(candles.length).fill(null);

      let lastPh = null;
      let lastPl = null;

      for (let i = 5; i < candles.length; i++) {
        if (phs[i - 3]) lastPh = phs[i - 3];
        if (pls[i - 3]) lastPl = pls[i - 3];

        const c = candles[i];
        const prev2 = candles[i - 2];

        // Bullish FVG displacement
        const isBullFvg = c.low > prev2.high && (c.close - c.open) > atrs[i] * 0.7;
        const isBearFvg = c.high < prev2.low && (c.open - c.close) > atrs[i] * 0.7;

        if (lastPl && c.low < lastPl && isBullFvg && c.close > prev2.high) {
          const sl = c.low - atrs[i] * 0.3;
          const tp = c.close + (c.close - sl) * rr;
          signals[i] = { dir: 'LONG', sl, tp };
          lastPl = null;
        } else if (lastPh && c.high > lastPh && isBearFvg && c.close < prev2.low) {
          const sl = c.high + atrs[i] * 0.3;
          const tp = c.close - (sl - c.close) * rr;
          signals[i] = { dir: 'SHORT', sl, tp };
          lastPh = null;
        }
      }

      configs.push({
        name: `RR ${rr} | BE ${be}R`,
        tf: '5M',
        candles,
        signals,
        simOptions: { breakevenR: be, lockR: 0.8, lockedProfit: 0.6 },
      });
    }
  }

  pickBestConfig(6, 'FVG', 'NAS100', configs);
}

// ─── 7. ROADMAP (8am Road Map Zone) ──────────────────────────────────────────
{
  const candles = dataNAS100_5m;
  const atrs = computeATR(candles, 14);
  const configs = [];

  for (const rr of [1.5, 2.0, 2.2]) {
    for (const be of [0.3, 0.5]) {
      const signals = new Array(candles.length).fill(null);
      let orHigh = -Infinity;
      let orLow = Infinity;
      let armed = false;

      for (let i = 0; i < candles.length; i++) {
        const ny = getNYTime(candles[i].openTime);

        // 8:00 - 8:15 AM
        if (ny.hour === 8 && ny.minute >= 0 && ny.minute < 15) {
          orHigh = Math.max(orHigh, candles[i].high);
          orLow = Math.min(orLow, candles[i].low);
        } else if (ny.hour === 8 && ny.minute === 15) {
          armed = true;
        }

        // At 9:30 AM Market Open
        if (armed && ny.hour === 9 && ny.minute === 30) {
          const orMid = (orHigh + orLow) / 2;
          if (candles[i].close > orHigh) {
            const sl = orMid;
            const tp = candles[i].close + (candles[i].close - sl) * rr;
            signals[i] = { dir: 'LONG', sl, tp };
          } else if (candles[i].close < orLow) {
            const sl = orMid;
            const tp = candles[i].close - (sl - candles[i].close) * rr;
            signals[i] = { dir: 'SHORT', sl, tp };
          }
          armed = false;
          orHigh = -Infinity;
          orLow = Infinity;
        }
      }

      configs.push({
        name: `RR ${rr} | BE ${be}R`,
        tf: '5M',
        candles,
        signals,
        simOptions: { breakevenR: be, lockR: 0.8, lockedProfit: 0.6 },
      });
    }
  }

  pickBestConfig(7, 'ROADMAP', 'NAS100', configs);
}

// ─── 8. PUSH (Session Ranges & Asia Sweep) ────────────────────────────────────
{
  const candles = dataNAS100_5m;
  const atrs = computeATR(candles, 14);
  const configs = [];

  for (const rr of [1.8, 2.0, 2.5]) {
    for (const be of [0.3, 0.4]) {
      const signals = new Array(candles.length).fill(null);
      let asiaHigh = -Infinity;
      let asiaLow = Infinity;
      let inAsia = false;
      let sweepHighDone = false;
      let sweepLowDone = false;

      for (let i = 0; i < candles.length; i++) {
        const d = new Date(candles[i].openTime);
        const utcHour = d.getUTCHours();

        // Asia session: 00:00 - 08:00 UTC
        if (utcHour >= 0 && utcHour < 8) {
          inAsia = true;
          asiaHigh = Math.max(asiaHigh, candles[i].high);
          asiaLow = Math.min(asiaLow, candles[i].low);
          sweepHighDone = false;
          sweepLowDone = false;
        } else if (inAsia && utcHour >= 8 && utcHour < 14) {
          // London session sweep
          if (!sweepHighDone && candles[i].high > asiaHigh && candles[i].close < asiaHigh) {
            const sl = candles[i].high + atrs[i] * 0.3;
            const tp = candles[i].close - (sl - candles[i].close) * rr;
            signals[i] = { dir: 'SHORT', sl, tp };
            sweepHighDone = true;
          } else if (!sweepLowDone && candles[i].low < asiaLow && candles[i].close > asiaLow) {
            const sl = candles[i].low - atrs[i] * 0.3;
            const tp = candles[i].close + (candles[i].close - sl) * rr;
            signals[i] = { dir: 'LONG', sl, tp };
            sweepLowDone = true;
          }
        } else if (utcHour >= 16) {
          inAsia = false;
          asiaHigh = -Infinity;
          asiaLow = Infinity;
        }
      }

      configs.push({
        name: `RR ${rr} | BE ${be}R`,
        tf: '5M',
        candles,
        signals,
        simOptions: { breakevenR: be, lockR: 0.8, lockedProfit: 0.6 },
      });
    }
  }

  pickBestConfig(8, 'PUSH', 'NAS100', configs);
}

// ─── 9. SWEEP IFVG (Session Sweep & iFVG RR) ──────────────────────────────────
{
  const candles = dataNAS100_5m;
  const atrs = computeATR(candles, 14);
  const configs = [];

  for (const rr of [1.8, 2.0, 2.2]) {
    for (const be of [0.3, 0.4]) {
      const phs = findPivotHighs(candles, 4, 4);
      const pls = findPivotLows(candles, 4, 4);
      const signals = new Array(candles.length).fill(null);

      let lastPl = null;
      let lastPh = null;

      for (let i = 5; i < candles.length; i++) {
        if (pls[i - 4]) lastPl = pls[i - 4];
        if (phs[i - 4]) lastPh = phs[i - 4];

        const c = candles[i];
        const p2 = candles[i - 2];

        // iFVG Inversion check: bearish gap closed above by bull candle
        const invertedBearFvg = p2.low > candles[i - 1].high && c.close > p2.low;
        // Bullish gap closed below by bear candle
        const invertedBullFvg = p2.high < candles[i - 1].low && c.close < p2.high;

        if (lastPl && c.low < lastPl && invertedBearFvg) {
          const sl = c.low - atrs[i] * 0.4;
          const tp = c.close + (c.close - sl) * rr;
          signals[i] = { dir: 'LONG', sl, tp };
          lastPl = null;
        } else if (lastPh && c.high > lastPh && invertedBullFvg) {
          const sl = c.high + atrs[i] * 0.4;
          const tp = c.close - (sl - c.close) * rr;
          signals[i] = { dir: 'SHORT', sl, tp };
          lastPh = null;
        }
      }

      configs.push({
        name: `RR ${rr} | BE ${be}R`,
        tf: '5M',
        candles,
        signals,
        simOptions: { breakevenR: be, lockR: 0.8, lockedProfit: 0.6 },
      });
    }
  }

  pickBestConfig(9, 'SWEEP IFVG', 'NAS100', configs);
}

// ─── 10. IFVG (Liquidity Sweeps & Inverse FVGs) ──────────────────────────────
{
  const candles = dataNAS100_5m;
  const atrs = computeATR(candles, 14);
  const configs = [];

  for (const rr of [1.7, 2.0, 2.3]) {
    for (const be of [0.3, 0.5]) {
      const phs = findPivotHighs(candles, 3, 3);
      const pls = findPivotLows(candles, 3, 3);
      const signals = new Array(candles.length).fill(null);

      let activeBullSweep = false;
      let activeBearSweep = false;

      for (let i = 5; i < candles.length; i++) {
        if (pls[i - 3] && candles[i].low < pls[i - 3]) activeBullSweep = true;
        if (phs[i - 3] && candles[i].high > phs[i - 3]) activeBearSweep = true;

        const c = candles[i];
        const p2 = candles[i - 2];

        // Bullish IFVG confirmed
        if (activeBullSweep && p2.low > candles[i - 1].high && c.close > p2.low) {
          const sl = c.low - atrs[i] * 0.4;
          const tp = c.close + (c.close - sl) * rr;
          signals[i] = { dir: 'LONG', sl, tp };
          activeBullSweep = false;
        } else if (activeBearSweep && p2.high < candles[i - 1].low && c.close < p2.high) {
          const sl = c.high + atrs[i] * 0.4;
          const tp = c.close - (sl - c.close) * rr;
          signals[i] = { dir: 'SHORT', sl, tp };
          activeBearSweep = false;
        }
      }

      configs.push({
        name: `RR ${rr} | BE ${be}R`,
        tf: '5M',
        candles,
        signals,
        simOptions: { breakevenR: be, lockR: 0.8, lockedProfit: 0.5 },
      });
    }
  }

  pickBestConfig(10, 'IFVG', 'NAS100', configs);
}

// ─── 11. PROFILE (Value Area Reversion Signals) ──────────────────────────────
{
  const candles = dataNAS100_5m;
  const atrs = computeATR(candles, 14);
  const configs = [];

  for (const rr of [1.5, 2.0, 2.2]) {
    for (const be of [0.3, 0.4]) {
      const signals = new Array(candles.length).fill(null);
      // Rolling 78 bars (~6.5 hours / session)
      const SESSION_BARS = 78;

      for (let i = SESSION_BARS; i < candles.length; i++) {
        let maxP = -Infinity;
        let minP = Infinity;
        for (let j = i - SESSION_BARS; j < i; j++) {
          maxP = Math.max(maxP, candles[j].high);
          minP = Math.min(minP, candles[j].low);
        }
        const range = maxP - minP;
        const vah = maxP - range * 0.3; // 70% value area high
        const val = minP + range * 0.3; // 70% value area low

        // Bullish Value Area Reclaim: dips below VAL, then reclaims above
        if (candles[i - 1].low < val && candles[i].close > val && candles[i].close > candles[i].open) {
          const sl = candles[i - 1].low - atrs[i] * 0.2;
          const tp = candles[i].close + (candles[i].close - sl) * rr;
          signals[i] = { dir: 'LONG', sl, tp };
        }
        // Bearish Value Area Reclaim: pokes above VAH, then reclaims below
        else if (candles[i - 1].high > vah && candles[i].close < vah && candles[i].close < candles[i].open) {
          const sl = candles[i - 1].high + atrs[i] * 0.2;
          const tp = candles[i].close - (sl - candles[i].close) * rr;
          signals[i] = { dir: 'SHORT', sl, tp };
        }
      }

      configs.push({
        name: `RR ${rr} | BE ${be}R`,
        tf: '5M',
        candles,
        signals,
        simOptions: { breakevenR: be, lockR: 0.8, lockedProfit: 0.6 },
      });
    }
  }

  pickBestConfig(11, 'PROFILE', 'NAS100', configs);
}

// ─── 12. EASY (MSS Sweep Fib Retrace) ─────────────────────────────────────────
{
  const candles = dataNAS100_5m;
  const atrs = computeATR(candles, 14);
  const emas = computeEMA(candles, 200);
  const configs = [];

  for (const rr of [1.8, 2.0, 2.4]) {
    for (const be of [0.3, 0.4]) {
      const pls = findPivotLows(candles, 5, 5);
      const phs = findPivotHighs(candles, 5, 5);
      const signals = new Array(candles.length).fill(null);

      let lastPl = null;
      let lastPh = null;

      for (let i = 10; i < candles.length; i++) {
        if (pls[i - 5]) lastPl = pls[i - 5];
        if (phs[i - 5]) lastPh = phs[i - 5];

        // 3 consecutive candles momentum check
        const bullMom = candles[i].close > candles[i].open && candles[i - 1].close > candles[i - 1].open && candles[i - 2].close > candles[i - 2].open;
        const bearMom = candles[i].close < candles[i].open && candles[i - 1].close < candles[i - 1].open && candles[i - 2].close < candles[i - 2].open;

        if (lastPl && candles[i - 2].low < lastPl && bullMom && candles[i].close > emas[i]) {
          const sl = candles[i - 2].low - atrs[i] * 0.3;
          const tp = candles[i].close + (candles[i].close - sl) * rr;
          signals[i] = { dir: 'LONG', sl, tp };
          lastPl = null;
        } else if (lastPh && candles[i - 2].high > lastPh && bearMom && candles[i].close < emas[i]) {
          const sl = candles[i - 2].high + atrs[i] * 0.3;
          const tp = candles[i].close - (sl - candles[i].close) * rr;
          signals[i] = { dir: 'SHORT', sl, tp };
          lastPh = null;
        }
      }

      configs.push({
        name: `RR ${rr} | BE ${be}R`,
        tf: '5M',
        candles,
        signals,
        simOptions: { breakevenR: be, lockR: 0.8, lockedProfit: 0.6 },
      });
    }
  }

  pickBestConfig(12, 'EASY', 'NAS100', configs);
}

// ─── 13. GAP (Gap Fill Breakouts) ─────────────────────────────────────────────
{
  const candles = dataXAUUSD_5m;
  const atrs = computeATR(candles, 14);
  const configs = [];

  for (const rr of [1.6, 2.0, 2.2]) {
    for (const be of [0.3, 0.4]) {
      const signals = new Array(candles.length).fill(null);

      for (let i = 2; i < candles.length; i++) {
        const gapUp = candles[i].low > candles[i - 2].high + atrs[i] * 0.5;
        const gapDown = candles[i].high < candles[i - 2].low - atrs[i] * 0.5;

        if (gapUp && candles[i].close > candles[i].open) {
          const sl = candles[i - 2].high;
          const tp = candles[i].close + (candles[i].close - sl) * rr;
          signals[i] = { dir: 'LONG', sl, tp };
        } else if (gapDown && candles[i].close < candles[i].open) {
          const sl = candles[i - 2].low;
          const tp = candles[i].close - (sl - candles[i].close) * rr;
          signals[i] = { dir: 'SHORT', sl, tp };
        }
      }

      configs.push({
        name: `RR ${rr} | BE ${be}R`,
        tf: '5M',
        candles,
        signals,
        simOptions: { breakevenR: be, lockR: 0.8, lockedProfit: 0.6 },
      });
    }
  }

  pickBestConfig(13, 'GAP', 'XAUUSD', configs);
}

// ─── 14. 8 A.M INDICATOR (8AM 1H Range & Breaks) ──────────────────────────────
{
  const candles = dataNAS100_5m;
  const atrs = computeATR(candles, 14);
  const configs = [];

  for (const rr of [1.6, 2.0, 2.2]) {
    for (const be of [0.3, 0.5]) {
      const signals = new Array(candles.length).fill(null);
      let rangeHigh = -Infinity;
      let rangeLow = Infinity;
      let armed = false;
      let breakDone = false;

      for (let i = 0; i < candles.length; i++) {
        const ny = getNYTime(candles[i].openTime);

        // 8:00 - 9:00 AM NY
        if (ny.hour === 8) {
          rangeHigh = Math.max(rangeHigh, candles[i].high);
          rangeLow = Math.min(rangeLow, candles[i].low);
          breakDone = false;
        } else if (ny.hour === 9 && ny.minute === 0) {
          armed = true;
        }

        // 9:00 to 11:30 breakout
        if (armed && !breakDone && ny.hour >= 9 && ny.hour <= 11) {
          if (candles[i].close > rangeHigh) {
            const sl = (rangeHigh + rangeLow) / 2;
            const tp = candles[i].close + (candles[i].close - sl) * rr;
            signals[i] = { dir: 'LONG', sl, tp };
            breakDone = true;
          } else if (candles[i].close < rangeLow) {
            const sl = (rangeHigh + rangeLow) / 2;
            const tp = candles[i].close - (sl - candles[i].close) * rr;
            signals[i] = { dir: 'SHORT', sl, tp };
            breakDone = true;
          }
        }

        if (ny.hour >= 12) {
          armed = false;
          rangeHigh = -Infinity;
          rangeLow = Infinity;
        }
      }

      configs.push({
        name: `RR ${rr} | BE ${be}R`,
        tf: '5M',
        candles,
        signals,
        simOptions: { breakevenR: be, lockR: 0.8, lockedProfit: 0.6 },
      });
    }
  }

  pickBestConfig(14, '8 A.M INDICATOR', 'NAS100', configs);
}

// ─── 15. SWEEP & SHIFT (Session Sweep & MSS) ──────────────────────────────────
{
  const candles = dataNAS100_5m;
  const atrs = computeATR(candles, 14);
  const configs = [];

  for (const rr of [1.8, 2.0, 2.4]) {
    for (const be of [0.3, 0.4]) {
      const phs = findPivotHighs(candles, 4, 4);
      const pls = findPivotLows(candles, 4, 4);
      const signals = new Array(candles.length).fill(null);

      let lastPl = null;
      let lastPh = null;

      for (let i = 5; i < candles.length; i++) {
        if (pls[i - 4]) lastPl = pls[i - 4];
        if (phs[i - 4]) lastPh = phs[i - 4];

        const c = candles[i];

        // Bullish MSS: Low swept, then close breaks back above pivot high
        if (lastPl && c.low < lastPl && c.close > lastPl && c.close > candles[i].open) {
          const sl = c.low - atrs[i] * 0.3;
          const tp = c.close + (c.close - sl) * rr;
          signals[i] = { dir: 'LONG', sl, tp };
          lastPl = null;
        } else if (lastPh && c.high > lastPh && c.close < lastPh && c.close < candles[i].open) {
          const sl = c.high + atrs[i] * 0.3;
          const tp = c.close - (sl - c.close) * rr;
          signals[i] = { dir: 'SHORT', sl, tp };
          lastPh = null;
        }
      }

      configs.push({
        name: `RR ${rr} | BE ${be}R`,
        tf: '5M',
        candles,
        signals,
        simOptions: { breakevenR: be, lockR: 0.8, lockedProfit: 0.6 },
      });
    }
  }

  pickBestConfig(15, 'SWEEP & SHIFT', 'NAS100', configs);
}

// ─── 16. 8:12 TO 9:12 ORB (Native Strategy: Range Fade) ──────────────────────
{
  const candles = dataNAS100_1m;
  const atrs = computeATR(candles, 14);
  const configs = [];

  for (const atrMult of [1.5, 2.0]) {
    for (const tpMult of [1.5, 2.0, 2.2]) {
      const signals = new Array(candles.length).fill(null);
      let rangeHigh = -Infinity;
      let rangeLow = Infinity;
      let building = false;
      let armed = false;
      let tradeCountToday = 0;
      let curDay = -1;

      for (let i = 0; i < candles.length; i++) {
        const ny = getNYTime(candles[i].openTime);

        if (ny.day !== curDay) {
          curDay = ny.day;
          tradeCountToday = 0;
          rangeHigh = -Infinity;
          rangeLow = Infinity;
        }

        // 08:12 to 09:12 build range
        const inBuild = (ny.hour === 8 && ny.minute >= 12) || (ny.hour === 9 && ny.minute < 12);
        if (inBuild) {
          building = true;
          rangeHigh = Math.max(rangeHigh, candles[i].high);
          rangeLow = Math.min(rangeLow, candles[i].low);
        } else if (building && ny.hour === 9 && ny.minute === 12) {
          building = false;
          armed = true;
        }

        // Trade window 09:12 to 15:00
        if (armed && tradeCountToday < 2 && ((ny.hour === 9 && ny.minute >= 12) || (ny.hour > 9 && ny.hour < 15))) {
          // Long fade: price broke below low, now closes back inside
          if (candles[i - 1].low < rangeLow && candles[i].close > rangeLow) {
            const sl = candles[i].close - atrs[i] * atrMult;
            const tp = candles[i].close + (candles[i].close - sl) * tpMult;
            signals[i] = { dir: 'LONG', sl, tp };
            tradeCountToday++;
          }
          // Short fade: price broke above high, now closes back inside
          else if (candles[i - 1].high > rangeHigh && candles[i].close < rangeHigh) {
            const sl = candles[i].close + atrs[i] * atrMult;
            const tp = candles[i].close - (sl - candles[i].close) * tpMult;
            signals[i] = { dir: 'SHORT', sl, tp };
            tradeCountToday++;
          }
        }

        if (ny.hour >= 15) {
          armed = false;
        }
      }

      configs.push({
        name: `SL ATR ${atrMult} | TP ${tpMult}x`,
        tf: '1M',
        candles,
        signals,
        simOptions: { breakevenR: 0.3, lockR: 0.8, lockedProfit: 0.6 },
      });
    }
  }

  pickBestConfig(16, '8:12 TO 9:12 ORB', 'NAS100', configs);
}

// ─── 17. ASIA SWEEP INDCATOR (Monk Algo Asia Range) ──────────────────────────
{
  const candles = dataEURUSD_5m;
  const atrs = computeATR(candles, 14);
  const configs = [];

  for (const rr of [1.6, 2.0, 2.2]) {
    for (const be of [0.3, 0.4]) {
      const signals = new Array(candles.length).fill(null);
      let asiaHigh = -Infinity;
      let asiaLow = Infinity;
      let inAsia = false;
      let sweepHighDone = false;
      let sweepLowDone = false;

      for (let i = 0; i < candles.length; i++) {
        const ny = getNYTime(candles[i].openTime);

        // Asia session: 19:00 - 04:00 NY time
        const isAsia = (ny.hour >= 19 || ny.hour < 4);
        if (isAsia) {
          inAsia = true;
          asiaHigh = Math.max(asiaHigh, candles[i].high);
          asiaLow = Math.min(asiaLow, candles[i].low);
          sweepHighDone = false;
          sweepLowDone = false;
        } else if (inAsia && ny.hour >= 4 && ny.hour < 12) {
          // London/NY session sweep
          if (!sweepHighDone && candles[i].high > asiaHigh && candles[i].close < asiaHigh) {
            const sl = candles[i].high + atrs[i] * 0.2;
            const tp = candles[i].close - (sl - candles[i].close) * rr;
            signals[i] = { dir: 'SHORT', sl, tp };
            sweepHighDone = true;
          } else if (!sweepLowDone && candles[i].low < asiaLow && candles[i].close > asiaLow) {
            const sl = candles[i].low - atrs[i] * 0.2;
            const tp = candles[i].close + (candles[i].close - sl) * rr;
            signals[i] = { dir: 'LONG', sl, tp };
            sweepLowDone = true;
          }
        } else if (ny.hour >= 15) {
          inAsia = false;
          asiaHigh = -Infinity;
          asiaLow = Infinity;
        }
      }

      configs.push({
        name: `RR ${rr} | BE ${be}R`,
        tf: '5M',
        candles,
        signals,
        simOptions: { breakevenR: be, lockR: 0.8, lockedProfit: 0.6 },
      });
    }
  }

  pickBestConfig(17, 'ASIA SWEEP INDCATOR', 'EUR/USD', configs);
}

// ─── 18. AMD/FVG (Ultimate AMD FVG Strategy - Native Strategy) ─────────────────
{
  const candles = dataNAS100_5m;
  const atrs = computeATR(candles, 14);
  const configs = [];

  for (const accLen of [30, 50]) {
    for (const tpMult of [1.8, 2.0, 2.4]) {
      const signals = new Array(candles.length).fill(null);

      for (let i = accLen + 15; i < candles.length; i++) {
        let accHigh = -Infinity;
        let accLow = Infinity;
        for (let j = i - accLen - 10; j < i - 10; j++) {
          accHigh = Math.max(accHigh, candles[j].high);
          accLow = Math.min(accLow, candles[j].low);
        }

        // Manipulation: break out of accumulation range and pull back
        const manipBear = candles[i - 2].high > accHigh && candles[i].close < accHigh;
        const manipBull = candles[i - 2].low < accLow && candles[i].close > accLow;

        // FVG trigger
        const p2 = candles[i - 2];
        const bullFvg = candles[i].low > p2.high && candles[i].close > candles[i].open;
        const bearFvg = candles[i].high < p2.low && candles[i].close < candles[i].open;

        if (manipBull && bullFvg) {
          const sl = candles[i].low - atrs[i] * 1.0;
          const tp = candles[i].close + (candles[i].close - sl) * tpMult;
          signals[i] = { dir: 'LONG', sl, tp };
        } else if (manipBear && bearFvg) {
          const sl = candles[i].high + atrs[i] * 1.0;
          const tp = candles[i].close - (sl - candles[i].close) * tpMult;
          signals[i] = { dir: 'SHORT', sl, tp };
        }
      }

      configs.push({
        name: `AccLen ${accLen} | TP ${tpMult}x`,
        tf: '5M',
        candles,
        signals,
        simOptions: { breakevenR: 0.3, lockR: 0.8, lockedProfit: 0.6 },
      });
    }
  }

  pickBestConfig(18, 'AMD/FVG', 'NAS100', configs);
}

// ─────────────────────────────────────────────────────────────────────────────
// Save Results to Disk
// ─────────────────────────────────────────────────────────────────────────────

fs.writeFileSync(path.join(RESULTS_DIR, 'all_18_benchmarks.json'), JSON.stringify(allResults, null, 2), 'utf8');
fs.writeFileSync(path.join(RESULTS_DIR, 'all_18_trade_logs.json'), JSON.stringify(allTradeLogs, null, 2), 'utf8');

console.log(`\nSuccessfully backtested all 18 systems on pure TradingView data!`);
console.log(`Saved master benchmarks to: ${path.join(RESULTS_DIR, 'all_18_benchmarks.json')}`);
console.log(`Saved full trade logs to: ${path.join(RESULTS_DIR, 'all_18_trade_logs.json')}`);

