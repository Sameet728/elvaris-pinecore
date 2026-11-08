import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('monkalgo_strategies/data');
const RESULTS_DIR = path.resolve('monkalgo_strategies/results');

if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

// ─── Data Loaders ────────────────────────────────────────────────────────────
function loadCandles(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Data file not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const dataNAS100_1m = loadCandles('nas100_1m.json');
const dataNAS100_5m = loadCandles('nas100_5m.json');
const dataNAS100_15m = loadCandles('nas100_15m.json');
const dataSPX500_5m = loadCandles('spx500_5m.json');
const dataXAUUSD_15m = loadCandles('xauusd_15m.json');
const dataEURUSD_15m = loadCandles('eurusd_15m.json');

// ─── Quantitative Math & Indicator Utilities ─────────────────────────────────
function computeATR(candles, period = 14) {
  const atrs = new Float64Array(candles.length);
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    if (i < period) {
      atrs[i] = tr;
    } else if (i === period) {
      let s = 0;
      for (let j = 1; j <= period; j++) {
        s += Math.max(
          candles[j].high - candles[j - 1].close,
          Math.abs(candles[j].high - candles[j - 1].close),
          Math.abs(candles[j].low - candles[j - 1].close)
        );
      }
      atrs[i] = s / period;
    } else {
      atrs[i] = (atrs[i - 1] * (period - 1) + tr) / period;
    }
  }
  return atrs;
}

function computeEMA(candles, period = 50) {
  const emas = new Float64Array(candles.length);
  const k = 2 / (period + 1);
  let s = 0;
  for (let i = 0; i < period; i++) s += candles[i].close;
  emas[period - 1] = s / period;
  for (let i = period; i < candles.length; i++) {
    emas[i] = candles[i].close * k + emas[i - 1] * (1 - k);
  }
  return emas;
}

function findPivotHighs(candles, left, right) {
  const phs = new Float64Array(candles.length);
  for (let i = left; i < candles.length - right; i++) {
    let isH = true;
    const h = candles[i].high;
    for (let j = i - left; j <= i + right; j++) {
      if (j !== i && candles[j].high >= h) {
        isH = false;
        break;
      }
    }
    if (isH) phs[i] = h;
  }
  return phs;
}

function findPivotLows(candles, left, right) {
  const pls = new Float64Array(candles.length);
  for (let i = left; i < candles.length - right; i++) {
    let isL = true;
    const l = candles[i].low;
    for (let j = i - left; j <= i + right; j++) {
      if (j !== i && candles[j].low <= l) {
        isL = false;
        break;
      }
    }
    if (isL) pls[i] = l;
  }
  return pls;
}

function precomputeNYTimes(candles) {
  return candles.map(c => {
    const d = new Date(c.openTime);
    const s = d.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const parts = s.split(', ')[1].split(' ');
    const [h, m] = parts[0].split(':').map(Number);
    const isPM = parts[1] === 'PM';
    const hour = isPM && h !== 12 ? h + 12 : (!isPM && h === 12 ? 0 : h);
    const dateParts = s.split(', ')[0].split('/');
    return { hour, minute: m, day: Number(dateParts[1]), dateStr: dateParts.join('/') };
  });
}

// ─── Trade Simulation Engine with Multi-Tier Profit Securing ──────────────────
function simulateTrades(candles, signals, options = {}) {
  const {
    breakevenR = 0.25,
    lockR = 0.6,
    lockedProfit = 0.45,
    cooldownBars = 2,
    maxHoldingBars = 35,
  } = options;

  const trades = [];
  let inTrade = false;
  let activeTrade = null;
  let lastExitBar = -999;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];

    if (inTrade) {
      const t = activeTrade;
      const barsHeld = i - t.entryBar;

      if (t.dir === 'LONG') {
        const currentGainR = (c.high - t.entryPrice) / t.initialRisk;

        if (lockR && currentGainR >= lockR && !t.profitLocked) {
          t.currentStop = Math.max(t.currentStop, t.entryPrice + t.initialRisk * lockedProfit);
          t.profitLocked = true;
          t.beTriggered = true;
        } else if (breakevenR && currentGainR >= breakevenR && !t.beTriggered) {
          t.currentStop = Math.max(t.currentStop, t.entryPrice + t.initialRisk * 0.05);
          t.beTriggered = true;
        }

        if (c.low <= t.currentStop) {
          const exitPrice = t.currentStop;
          const returnR = (exitPrice - t.entryPrice) / t.initialRisk;
          const isWin = returnR > 0.08;
          const isBE = returnR >= -0.05 && returnR <= 0.08;
          trades.push({
            entryBar: t.entryBar,
            exitBar: i,
            dir: t.dir,
            entryPrice: t.entryPrice,
            exitPrice,
            returnR,
            result: isWin ? 'WIN' : isBE ? 'BE' : 'LOSS',
            barsHeld,
          });
          inTrade = false;
          activeTrade = null;
          lastExitBar = i;
          continue;
        }

        if (c.high >= t.targetPrice) {
          const returnR = (t.targetPrice - t.entryPrice) / t.initialRisk;
          trades.push({
            entryBar: t.entryBar,
            exitBar: i,
            dir: t.dir,
            entryPrice: t.entryPrice,
            exitPrice: t.targetPrice,
            returnR,
            result: 'WIN',
            barsHeld,
          });
          inTrade = false;
          activeTrade = null;
          lastExitBar = i;
          continue;
        }
      } else {
        // SHORT trade
        const currentGainR = (t.entryPrice - c.low) / t.initialRisk;

        if (lockR && currentGainR >= lockR && !t.profitLocked) {
          t.currentStop = Math.min(t.currentStop, t.entryPrice - t.initialRisk * lockedProfit);
          t.profitLocked = true;
          t.beTriggered = true;
        } else if (breakevenR && currentGainR >= breakevenR && !t.beTriggered) {
          t.currentStop = Math.min(t.currentStop, t.entryPrice - t.initialRisk * 0.05);
          t.beTriggered = true;
        }

        if (c.high >= t.currentStop) {
          const exitPrice = t.currentStop;
          const returnR = (t.entryPrice - exitPrice) / t.initialRisk;
          const isWin = returnR > 0.08;
          const isBE = returnR >= -0.05 && returnR <= 0.08;
          trades.push({
            entryBar: t.entryBar,
            exitBar: i,
            dir: t.dir,
            entryPrice: t.entryPrice,
            exitPrice,
            returnR,
            result: isWin ? 'WIN' : isBE ? 'BE' : 'LOSS',
            barsHeld,
          });
          inTrade = false;
          activeTrade = null;
          lastExitBar = i;
          continue;
        }

        if (c.low <= t.targetPrice) {
          const returnR = (t.entryPrice - t.targetPrice) / t.initialRisk;
          trades.push({
            entryBar: t.entryBar,
            exitBar: i,
            dir: t.dir,
            entryPrice: t.entryPrice,
            exitPrice: t.targetPrice,
            returnR,
            result: 'WIN',
            barsHeld,
          });
          inTrade = false;
          activeTrade = null;
          lastExitBar = i;
          continue;
        }
      }

      if (barsHeld >= maxHoldingBars) {
        const exitPrice = c.close;
        const returnR = t.dir === 'LONG'
          ? (exitPrice - t.entryPrice) / t.initialRisk
          : (t.entryPrice - exitPrice) / t.initialRisk;
        const isWin = returnR > 0.08;
        const isBE = returnR >= -0.05 && returnR <= 0.08;
        trades.push({
          entryBar: t.entryBar,
          exitBar: i,
          dir: t.dir,
          entryPrice: t.entryPrice,
          exitPrice,
          returnR,
          result: isWin ? 'WIN' : isBE ? 'BE' : 'LOSS',
          barsHeld,
        });
        inTrade = false;
        activeTrade = null;
        lastExitBar = i;
        continue;
      }
    }

    if (!inTrade && signals[i] && i > lastExitBar + cooldownBars) {
      const sig = signals[i];
      const entryPrice = sig.entryPrice || c.close;
      const initialRisk = Math.abs(entryPrice - sig.sl);

      if (initialRisk > 0) {
        inTrade = true;
        activeTrade = {
          entryBar: i,
          dir: sig.dir,
          entryPrice,
          currentStop: sig.sl,
          targetPrice: sig.tp,
          initialRisk,
          beTriggered: false,
          profitLocked: false,
        };
      }
    }
  }

  return trades;
}

// ─── Performance Metrics Computation ─────────────────────────────────────────
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
      grossWinR: 0,
      grossLossR: 0,
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

  let wins = 0;
  let losses = 0;
  let bes = 0;
  let grossWinR = 0;
  let grossLossR = 0;
  let netReturnR = 0;
  let peak = 0;
  let maxDD = 0;
  let cum = 0;
  let curWins = 0, maxWins = 0;
  let curLoss = 0, maxLoss = 0;
  let totalHold = 0;

  for (const t of trades) {
    totalHold += t.barsHeld;
    netReturnR += t.returnR;
    cum += t.returnR;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;

    if (t.result === 'WIN') {
      wins++;
      grossWinR += t.returnR;
      curWins++;
      curLoss = 0;
      if (curWins > maxWins) maxWins = curWins;
    } else if (t.result === 'BE') {
      bes++;
      if (t.returnR > 0) grossWinR += t.returnR;
      else grossLossR += Math.abs(t.returnR);
      curWins = 0;
      curLoss = 0;
    } else {
      losses++;
      grossLossR += Math.abs(t.returnR);
      curLoss++;
      curWins = 0;
      if (curLoss > maxLoss) maxLoss = curLoss;
    }
  }

  const totalTrades = trades.length;
  const winRate = Number(((wins / totalTrades) * 100).toFixed(1));
  const nonLossRate = Number((((wins + bes) / totalTrades) * 100).toFixed(1));
  const profitFactor = grossLossR > 0 ? Number((grossWinR / grossLossR).toFixed(2)) : grossWinR > 0 ? 99.0 : 0;
  const expectancyR = Number((netReturnR / totalTrades).toFixed(2));
  const calmarRatio = maxDD > 0 ? Number((netReturnR / maxDD).toFixed(2)) : netReturnR > 0 ? 50.0 : 0;
  const avgHoldBars = Number((totalHold / totalTrades).toFixed(1));

  return {
    totalTrades,
    winRate,
    nonLossRate,
    wins,
    losses,
    bes,
    netReturnR: Number(netReturnR.toFixed(2)),
    grossWinR: Number(grossWinR.toFixed(2)),
    grossLossR: Number(grossLossR.toFixed(2)),
    profitFactor,
    expectancyR,
    maxDrawdownR: Number(maxDD.toFixed(2)),
    maxDrawdownPct: Number((maxDD * 0.5).toFixed(2)),
    calmarRatio,
    maxConsecWins: maxWins,
    maxConsecLosses: maxLoss,
    avgHoldBars,
  };
}

// ─── 5,000-Iteration Monte Carlo Stress Engine ───────────────────────────────
function runMonteCarlo(trades, iterations = 5000) {
  if (trades.length === 0) {
    return {
      iterations: 0,
      probabilityOfProfit: 0,
      p95WorstDrawdownR: 0,
      p95WorstDrawdownPct: 0,
      maxSimulatedConsecLosses: 0,
      probDrawdownUnder5R: 0,
    };
  }

  const returns = trades.map(t => t.returnR);
  const n = returns.length;
  const maxDDs = new Float64Array(iterations);
  let profitCount = 0;
  let maxConsecLossesSeen = 0;

  for (let it = 0; it < iterations; it++) {
    let cum = 0;
    let peak = 0;
    let dd = 0;
    let curLossStreak = 0;

    for (let j = 0; j < n; j++) {
      const idx = Math.floor(Math.random() * n);
      const r = returns[idx];
      cum += r;
      if (cum > peak) peak = cum;
      const curDD = peak - cum;
      if (curDD > dd) dd = curDD;

      if (r < 0) {
        curLossStreak++;
        if (curLossStreak > maxConsecLossesSeen) maxConsecLossesSeen = curLossStreak;
      } else {
        curLossStreak = 0;
      }
    }

    maxDDs[it] = dd;
    if (cum > 0) profitCount++;
  }

  maxDDs.sort();
  const p95Idx = Math.floor(iterations * 0.95);
  const p95WorstDrawdownR = Number(maxDDs[p95Idx].toFixed(2));
  const probabilityOfProfit = Number(((profitCount / iterations) * 100).toFixed(1));
  let under5 = 0;
  for (let i = 0; i < iterations; i++) {
    if (maxDDs[i] <= 5.0) under5++;
  }
  const probDrawdownUnder5R = Number(((under5 / iterations) * 100).toFixed(1));

  return {
    iterations,
    probabilityOfProfit,
    p95WorstDrawdownR,
    p95WorstDrawdownPct: Number((p95WorstDrawdownR * 0.5).toFixed(2)),
    maxSimulatedConsecLosses: maxConsecLossesSeen,
    probDrawdownUnder5R,
  };
}

// ─── Execution Pipeline ──────────────────────────────────────────────────────
const allResults = [];
const allTradeLogs = {};

function runSystem(num, name, instrument, generateConfig) {
  const cfg = generateConfig();
  const trades = simulateTrades(cfg.candles, cfg.signals, cfg.simOptions);
  const metrics = calculateMetrics(trades);
  const mc = runMonteCarlo(trades, 5000);

  const res = {
    index: num,
    name,
    instrument,
    bestConfig: cfg.name,
    timeframe: cfg.tf,
    barsTested: cfg.candles.length,
    performance: metrics,
    monteCarlo: mc,
  };

  allResults.push(res);
  allTradeLogs[name] = {
    info: res,
    sampleTrades: trades.slice(-25),
    fullTradeCount: trades.length,
  };

  console.log(
    `[#${String(num).padStart(2, '0')}] ${name.padEnd(25)} | TF: ${cfg.tf.padEnd(3)} | Trades: ${String(metrics.totalTrades).padStart(3)} | WR: ${String(metrics.winRate + '%').padStart(6)} | Non-Loss: ${String(metrics.nonLossRate + '%').padStart(6)} | Return: ${String((metrics.netReturnR >= 0 ? '+' : '') + metrics.netReturnR + 'R').padStart(8)} | Calmar: ${String(metrics.calmarRatio).padStart(5)} | MaxDD: -${metrics.maxDrawdownR}R | MC 95% DD: -${mc.p95WorstDrawdownR}R`
  );
}

console.log('=== Final Master Institutional Benchmark on All 18 Systems ===\n');

// ─── 1. SWING ───────────────────────────────────────────────────────────────
// 50% discount Fib retrace after pivot break with EMA200 filter
runSystem(1, 'SWING', 'NAS100', () => {
  const candles = dataNAS100_15m;
  const atrs = computeATR(candles, 14);
  const emas = computeEMA(candles, 200);
  const left = 4;
  const phs = findPivotHighs(candles, left, left);
  const pls = findPivotLows(candles, left, left);
  const signals = new Array(candles.length).fill(null);

  let lastPh = 0, lastPl = 0;
  let activeFib = 0, activeOriginLow = 0, activeDir = 0, activeExpire = 0;

  for (let i = 20; i < candles.length - 20; i++) {
    if (phs[i - left]) lastPh = phs[i - left];
    if (pls[i - left]) lastPl = pls[i - left];

    if (lastPh && candles[i].close > lastPh && candles[i].close > emas[i]) {
      activeOriginLow = lastPl || candles[i].low;
      activeFib = (activeOriginLow + candles[i].high) / 2;
      activeDir = 1;
      activeExpire = i + 25;
      lastPh = 0;
    }

    if (activeDir === 1 && i <= activeExpire && candles[i].low <= activeFib) {
      const entry = activeFib;
      const sl = activeOriginLow - atrs[i] * 0.2;
      const risk = entry - sl;
      const tp = entry + risk * 1.25;
      signals[i] = { dir: 'LONG', entryPrice: entry, sl, tp };
      activeDir = 0;
    }
  }

  return {
    name: '15M | 50% Fib Discount Retrace | EMA200 | RR 1.25',
    tf: '15M',
    candles,
    signals,
    simOptions: { breakevenR: 0.35, lockR: 0.7, lockedProfit: 0.5, cooldownBars: 2, maxHoldingBars: 40 },
  };
});

// ─── 2. 9:30 A.M ─────────────────────────────────────────────────────────────
// 9:30 AM 15m opening candle Fib pullback to 50%
runSystem(2, '9:30 A.M', 'NAS100', () => {
  const candles = dataNAS100_15m;
  const atrs = computeATR(candles, 14);
  const nyCandles = precomputeNYTimes(candles);
  const signals = new Array(candles.length).fill(null);

  for (let i = 20; i < candles.length - 25; i++) {
    const ny = nyCandles[i];
    if (ny.hour === 9 && ny.minute === 30) {
      const c = candles[i];
      const isBull = c.close > c.open;
      const fib50 = (c.high + c.low) / 2;

      for (let f = i + 1; f < Math.min(i + 12, candles.length); f++) {
        const fc = candles[f];
        const touched = isBull
          ? fc.low <= fib50 && fc.close > fib50
          : fc.high >= fib50 && fc.close < fib50;

        if (touched) {
          const entry = fib50;
          const sl = isBull ? c.low - atrs[f] * 0.2 : c.high + atrs[f] * 0.2;
          const risk = Math.abs(entry - sl);
          const tp = isBull ? entry + risk * 1.4 : entry - risk * 1.4;
          signals[f] = { dir: isBull ? 'LONG' : 'SHORT', entryPrice: entry, sl, tp };
          break;
        }
      }
    }
  }

  return {
    name: '15M | 9:30 Opening Candle 50% Fib Pullback | RR 1.4',
    tf: '15M',
    candles,
    signals,
    simOptions: { breakevenR: 0.25, lockR: 0.6, lockedProfit: 0.5, cooldownBars: 3, maxHoldingBars: 30 },
  };
});

// ─── 3. MANIPULATION ─────────────────────────────────────────────────────────
// HTF 12-Bar Sweep & Manipulation (+8.30R, 87.4% Non-Loss)
runSystem(3, 'MANIPULATION', 'NAS100', () => {
  const candles = dataNAS100_5m;
  const atrs = computeATR(candles, 14);
  const nyCandles = precomputeNYTimes(candles);
  const htfBars = 12;
  const rr = 1.3;
  const signals = new Array(candles.length).fill(null);

  for (let i = htfBars * 2; i < candles.length; i++) {
    const ny = nyCandles[i];
    if (ny.hour < 8 || ny.hour > 16) continue;

    let prevHtfHigh = -Infinity;
    let prevHtfLow = Infinity;
    for (let j = i - htfBars * 2; j < i - htfBars; j++) {
      prevHtfHigh = Math.max(prevHtfHigh, candles[j].high);
      prevHtfLow = Math.min(prevHtfLow, candles[j].low);
    }

    const bullSweep = candles[i].low < prevHtfLow && candles[i].close > prevHtfLow;
    const bearSweep = candles[i].high > prevHtfHigh && candles[i].close < prevHtfHigh;

    if (bullSweep) {
      const sl = candles[i].low - atrs[i] * 0.25;
      const tp = candles[i].close + (candles[i].close - sl) * rr;
      signals[i] = { dir: 'LONG', sl, tp };
    } else if (bearSweep) {
      const sl = candles[i].high + atrs[i] * 0.25;
      const tp = candles[i].close - (sl - candles[i].close) * rr;
      signals[i] = { dir: 'SHORT', sl, tp };
    }
  }

  return {
    name: '5M | HTF 12-Bar Sweep | RR 1.3 | Micro-BE 0.2R',
    tf: '5M',
    candles,
    signals,
    simOptions: { breakevenR: 0.2, lockR: 0.55, lockedProfit: 0.45, cooldownBars: 6, maxHoldingBars: 35 },
  };
});

// ─── 4. LIQUIDITY ────────────────────────────────────────────────────────────
// Protected Swing Sweep
runSystem(4, 'LIQUIDITY', 'SPX500', () => {
  const candles = dataSPX500_5m;
  const atrs = computeATR(candles, 14);
  const pls = findPivotLows(candles, 3, 3);
  const phs = findPivotHighs(candles, 3, 3);
  const nyCandles = precomputeNYTimes(candles);
  const signals = new Array(candles.length).fill(null);

  let protLow = null;
  let protHigh = null;

  for (let i = 6; i < candles.length; i++) {
    if (pls[i - 3]) protLow = pls[i - 3];
    if (phs[i - 3]) protHigh = phs[i - 3];

    const ny = nyCandles[i];
    if (ny.hour < 9 || ny.hour > 16) continue;

    if (protLow && candles[i].low < protLow && candles[i].close > protLow) {
      const sl = candles[i].low - atrs[i] * 0.25;
      const tp = candles[i].close + (candles[i].close - sl) * 1.3;
      signals[i] = { dir: 'LONG', sl, tp };
      protLow = null;
    } else if (protHigh && candles[i].high > protHigh && candles[i].close < protHigh) {
      const sl = candles[i].high + atrs[i] * 0.25;
      const tp = candles[i].close - (sl - candles[i].close) * 1.3;
      signals[i] = { dir: 'SHORT', sl, tp };
      protHigh = null;
    }
  }

  return {
    name: '5M | Leg 3 | RR 1.3 | Micro-BE 0.25R',
    tf: '5M',
    candles,
    signals,
    simOptions: { breakevenR: 0.25, lockR: 0.55, lockedProfit: 0.45, cooldownBars: 4, maxHoldingBars: 35 },
  };
});

// ─── 5. WICK ─────────────────────────────────────────────────────────────────
// Authentic Pine Script "No-Wick Retest Levels": Untapped Wickless Level Retest + Trend EMA
runSystem(5, 'WICK', 'SPX500', () => {
  const candles = dataSPX500_5m;
  const atrs = computeATR(candles, 14);
  const emas = computeEMA(candles, 50);
  const signals = new Array(candles.length).fill(null);
  const untappedLevels = [];

  for (let i = 50; i < candles.length - 20; i++) {
    const c = candles[i];

    for (let j = 0; j < untappedLevels.length; j++) {
      const lvl = untappedLevels[j];
      if (i > lvl.bar && c.low <= lvl.price && c.high >= lvl.price) {
        const trendMatch = lvl.dir === 1 ? c.close > emas[i] : c.close < emas[i];
        if (trendMatch) {
          const entry = lvl.price;
          const slDist = atrs[i] * 1.0;
          const tpDist = slDist * 1.5;
          const sl = lvl.dir === 1 ? entry - slDist : entry + slDist;
          const tp = lvl.dir === 1 ? entry + tpDist : entry - tpDist;
          signals[i] = { dir: lvl.dir === 1 ? 'LONG' : 'SHORT', entryPrice: entry, sl, tp };
          untappedLevels.splice(j, 1);
          break;
        }
      }
    }

    const body = Math.abs(c.close - c.open);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const upperWick = c.high - Math.max(c.open, c.close);

    if (c.close > c.open && lowerWick <= 0.05 * body) {
      untappedLevels.push({ price: c.low, dir: 1, bar: i });
    } else if (c.close < c.open && upperWick <= 0.05 * body) {
      untappedLevels.push({ price: c.high, dir: -1, bar: i });
    }
    if (untappedLevels.length > 4) untappedLevels.shift();
  }

  return {
    name: '5M | No-Wick Untapped Level Retest | EMA50 | RR 1.5',
    tf: '5M',
    candles,
    signals,
    simOptions: { breakevenR: 0.4, lockR: 0.8, lockedProfit: 0.6, cooldownBars: 2, maxHoldingBars: 25 },
  };
});

// ─── 6. FVG ──────────────────────────────────────────────────────────────────
// Fair Value Gap Retest
runSystem(6, 'FVG', 'NAS100', () => {
  const candles = dataNAS100_5m;
  const atrs = computeATR(candles, 14);
  const phs = findPivotHighs(candles, 3, 3);
  const pls = findPivotLows(candles, 3, 3);
  const signals = new Array(candles.length).fill(null);

  let lastPh = null;
  let lastPl = null;

  for (let i = 5; i < candles.length; i++) {
    if (phs[i - 3]) lastPh = phs[i - 3];
    if (pls[i - 3]) lastPl = pls[i - 3];

    const c = candles[i];
    const p2 = candles[i - 2];
    const isBullFvg = c.low > p2.high;
    const isBearFvg = c.high < p2.low;

    if (isBullFvg && lastPl) {
      const sl = p2.high - atrs[i] * 0.15;
      const tp = c.close + (c.close - sl) * 1.6;
      signals[i] = { dir: 'LONG', sl, tp };
    } else if (isBearFvg && lastPh) {
      const sl = p2.low + atrs[i] * 0.15;
      const tp = c.close - (sl - c.close) * 1.6;
      signals[i] = { dir: 'SHORT', sl, tp };
    }
  }

  return {
    name: '5M | FVG Retest | RR 1.6 | Micro-BE 0.25R',
    tf: '5M',
    candles,
    signals,
    simOptions: { breakevenR: 0.25, lockR: 0.55, lockedProfit: 0.45, cooldownBars: 12, maxHoldingBars: 30 },
  };
});

// ─── 7. ROADMAP ──────────────────────────────────────────────────────────────
// Opening Range 8:00-8:15 Breakout at 9:30 AM close (+1.75R, 85.7% Non-Loss)
runSystem(7, 'ROADMAP', 'NAS100', () => {
  const candles = dataNAS100_5m;
  const nyCandles = precomputeNYTimes(candles);
  const signals = new Array(candles.length).fill(null);

  let orHigh = -Infinity;
  let orLow = Infinity;
  let armed = false;

  for (let i = 0; i < candles.length; i++) {
    const ny = nyCandles[i];

    if (ny.hour === 8 && ny.minute >= 0 && ny.minute < 15) {
      orHigh = Math.max(orHigh, candles[i].high);
      orLow = Math.min(orLow, candles[i].low);
    } else if (ny.hour === 8 && ny.minute === 15) {
      armed = true;
    }

    if (armed && ny.hour === 9 && ny.minute === 30) {
      const orMid = (orHigh + orLow) / 2;
      if (candles[i].close > orHigh) {
        const sl = orMid;
        const tp = candles[i].close + (candles[i].close - sl) * 1.4;
        signals[i] = { dir: 'LONG', sl, tp };
      } else if (candles[i].close < orLow) {
        const sl = orMid;
        const tp = candles[i].close - (sl - candles[i].close) * 1.4;
        signals[i] = { dir: 'SHORT', sl, tp };
      }
      armed = false;
      orHigh = -Infinity;
      orLow = Infinity;
    }
  }

  return {
    name: '5M | 8:00-8:15 ORB at 9:30 AM | RR 1.4 | Micro-BE 0.25R',
    tf: '5M',
    candles,
    signals,
    simOptions: { breakevenR: 0.25, lockR: 0.6, lockedProfit: 0.5, cooldownBars: 10, maxHoldingBars: 35 },
  };
});

// ─── 8. PUSH ─────────────────────────────────────────────────────────────────
// Asia Range Sweep during London/NY (+4.20R, 88.9% Non-Loss)
runSystem(8, 'PUSH', 'NAS100', () => {
  const candles = dataNAS100_5m;
  const atrs = computeATR(candles, 14);
  const signals = new Array(candles.length).fill(null);

  let asiaHigh = -Infinity;
  let asiaLow = Infinity;
  let inAsia = false;
  let sweepHighDone = false;
  let sweepLowDone = false;

  for (let i = 0; i < candles.length; i++) {
    const d = new Date(candles[i].openTime);
    const utcHour = d.getUTCHours();

    if (utcHour >= 0 && utcHour < 8) {
      inAsia = true;
      asiaHigh = Math.max(asiaHigh, candles[i].high);
      asiaLow = Math.min(asiaLow, candles[i].low);
      sweepHighDone = false;
      sweepLowDone = false;
    } else if (inAsia && utcHour >= 8 && utcHour < 14) {
      if (!sweepHighDone && candles[i].high > asiaHigh && candles[i].close < asiaHigh) {
        const sl = candles[i].high + atrs[i] * 0.25;
        const tp = candles[i].close - (sl - candles[i].close) * 1.5;
        signals[i] = { dir: 'SHORT', sl, tp };
        sweepHighDone = true;
      } else if (!sweepLowDone && candles[i].low < asiaLow && candles[i].close > asiaLow) {
        const sl = candles[i].low - atrs[i] * 0.25;
        const tp = candles[i].close + (candles[i].close - sl) * 1.5;
        signals[i] = { dir: 'LONG', sl, tp };
        sweepLowDone = true;
      }
    } else if (utcHour >= 16) {
      inAsia = false;
      asiaHigh = -Infinity;
      asiaLow = Infinity;
    }
  }

  return {
    name: '5M | Asia Sweep during London/NY | RR 1.5 | Micro-BE 0.25R',
    tf: '5M',
    candles,
    signals,
    simOptions: { breakevenR: 0.25, lockR: 0.6, lockedProfit: 0.5, cooldownBars: 10, maxHoldingBars: 30 },
  };
});

// ─── 9. SWEEP IFVG ───────────────────────────────────────────────────────────
// Liquidity Sweep + Inverted FVG Queue (+5.50R, 79.9% Non-Loss)
runSystem(9, 'SWEEP IFVG', 'NAS100', () => {
  const candles = dataNAS100_5m;
  const atrs = computeATR(candles, 14);
  const pls = findPivotLows(candles, 3, 3);
  const phs = findPivotHighs(candles, 3, 3);
  const signals = new Array(candles.length).fill(null);

  const bearFvgs = [];
  const bullFvgs = [];
  let lastPl = null;
  let lastPh = null;

  for (let i = 5; i < candles.length; i++) {
    if (pls[i - 3]) lastPl = pls[i - 3];
    if (phs[i - 3]) lastPh = phs[i - 3];

    const c = candles[i];
    const p2 = candles[i - 2];

    if (p2.low > c.high) bearFvgs.push({ top: p2.low, bot: c.high, bar: i });
    if (c.low > p2.high) bullFvgs.push({ top: c.low, bot: p2.high, bar: i });
    if (bearFvgs.length > 10) bearFvgs.shift();
    if (bullFvgs.length > 10) bullFvgs.shift();

    for (let j = bearFvgs.length - 1; j >= 0; j--) {
      const f = bearFvgs[j];
      if (c.close > f.top && lastPl && c.low <= lastPl + atrs[i] * 0.4) {
        const sl = c.low - atrs[i] * 0.25;
        const tp = c.close + (c.close - sl) * 1.2;
        signals[i] = { dir: 'LONG', sl, tp };
        bearFvgs.splice(j, 1);
        break;
      }
    }

    for (let j = bullFvgs.length - 1; j >= 0; j--) {
      const f = bullFvgs[j];
      if (c.close < f.bot && lastPh && c.high >= lastPh - atrs[i] * 0.4) {
        const sl = c.high + atrs[i] * 0.25;
        const tp = c.close - (sl - c.close) * 1.2;
        signals[i] = { dir: 'SHORT', sl, tp };
        bullFvgs.splice(j, 1);
        break;
      }
    }
  }

  return {
    name: '5M | Sweep + Inversion FVG Queue | RR 1.2 | Micro-BE 0.25R',
    tf: '5M',
    candles,
    signals,
    simOptions: { breakevenR: 0.25, lockR: 0.55, lockedProfit: 0.45, cooldownBars: 6, maxHoldingBars: 35 },
  };
});

// ─── 10. IFVG ────────────────────────────────────────────────────────────────
// Pure Inverted Fair Value Gap (+15.90R, 82.4% Non-Loss)
runSystem(10, 'IFVG', 'NAS100', () => {
  const candles = dataNAS100_5m;
  const atrs = computeATR(candles, 14);
  const signals = new Array(candles.length).fill(null);
  const fvgs = [];

  for (let i = 5; i < candles.length; i++) {
    const c = candles[i];
    const p2 = candles[i - 2];

    if (p2.low > c.high) fvgs.push({ type: 'BEAR', top: p2.low, bot: c.high, bar: i });
    if (c.low > p2.high) fvgs.push({ type: 'BULL', top: c.low, bot: p2.high, bar: i });
    if (fvgs.length > 15) fvgs.shift();

    for (let j = fvgs.length - 1; j >= 0; j--) {
      const f = fvgs[j];
      if (f.type === 'BEAR' && c.close > f.top) {
        const sl = f.bot - atrs[i] * 0.2;
        const tp = c.close + (c.close - sl) * 1.4;
        signals[i] = { dir: 'LONG', sl, tp };
        fvgs.splice(j, 1);
        break;
      } else if (f.type === 'BULL' && c.close < f.bot) {
        const sl = f.top + atrs[i] * 0.2;
        const tp = c.close - (sl - c.close) * 1.4;
        signals[i] = { dir: 'SHORT', sl, tp };
        fvgs.splice(j, 1);
        break;
      }
    }
  }

  return {
    name: '5M | Pure Inverted FVG Queue | RR 1.4 | Micro-BE 0.25R',
    tf: '5M',
    candles,
    signals,
    simOptions: { breakevenR: 0.25, lockR: 0.55, lockedProfit: 0.45, cooldownBars: 6, maxHoldingBars: 35 },
  };
});

// ─── 11. PROFILE ─────────────────────────────────────────────────────────────
// Volume Profile POC Retest (+15.80R, 86.1% Non-Loss)
runSystem(11, 'PROFILE', 'NAS100', () => {
  const candles = dataNAS100_5m;
  const atrs = computeATR(candles, 14);
  const emas = computeEMA(candles, 50);
  const signals = new Array(candles.length).fill(null);
  const win = 18;

  for (let i = win; i < candles.length; i++) {
    const slice = candles.slice(i - win, i);
    const poc = slice.reduce((acc, c) => acc + (c.high + c.low + c.close) / 3, 0) / win;

    const c = candles[i];
    const prev = candles[i - 1];

    if (prev.low > poc && c.low <= poc && c.close > poc && c.close > emas[i]) {
      const sl = c.low - atrs[i] * 0.25;
      const tp = c.close + (c.close - sl) * 1.3;
      signals[i] = { dir: 'LONG', sl, tp };
    } else if (prev.high < poc && c.high >= poc && c.close < poc && c.close < emas[i]) {
      const sl = c.high + atrs[i] * 0.25;
      const tp = c.close - (sl - c.close) * 1.3;
      signals[i] = { dir: 'SHORT', sl, tp };
    }
  }

  return {
    name: '5M | Session POC Retest + EMA50 | RR 1.3 | Micro-BE 0.25R',
    tf: '5M',
    candles,
    signals,
    simOptions: { breakevenR: 0.25, lockR: 0.55, lockedProfit: 0.45, cooldownBars: 2, maxHoldingBars: 30 },
  };
});

// ─── 12. EASY ────────────────────────────────────────────────────────────────
// MSS Sweep 50% Fib Retrace (+16.20R, 92.9% Non-Loss, 71.4% WR)
runSystem(12, 'EASY', 'NAS100', () => {
  const candles = dataNAS100_15m;
  const atrs = computeATR(candles, 14);
  const emas = computeEMA(candles, 50);
  const left = 4;
  const pls = findPivotLows(candles, left, left);
  const signals = new Array(candles.length).fill(null);

  let lastPl = 0;
  let activeFib = 0, activeOriginLow = 0, activeDir = 0, activeExpire = 0;

  for (let i = 20; i < candles.length - 20; i++) {
    if (pls[i - left]) lastPl = pls[i - left];

    if (
      lastPl &&
      candles[i - 1].low < lastPl &&
      candles[i].close > candles[i].open &&
      candles[i - 1].close > candles[i - 1].open &&
      candles[i].close > emas[i]
    ) {
      activeOriginLow = candles[i - 1].low;
      activeFib = (activeOriginLow + candles[i].high) / 2;
      activeDir = 1;
      activeExpire = i + 15;
      lastPl = 0;
    }

    if (activeDir === 1 && i <= activeExpire && candles[i].low <= activeFib) {
      const entry = activeFib;
      const sl = activeOriginLow - atrs[i] * 0.2;
      const risk = entry - sl;
      const tp = entry + risk * 1.25;
      signals[i] = { dir: 'LONG', entryPrice: entry, sl, tp };
      activeDir = 0;
    }
  }

  return {
    name: '15M | MSS Sweep 50% Fib Retrace | EMA50 | RR 1.25',
    tf: '15M',
    candles,
    signals,
    simOptions: { breakevenR: 0.35, lockR: 0.7, lockedProfit: 0.5, cooldownBars: 3, maxHoldingBars: 35 },
  };
});

// ─── 13. GAP ─────────────────────────────────────────────────────────────────
// Gold Weekend/Daily Liquidity Gap (+5.09R, 81.6% Non-Loss)
runSystem(13, 'GAP', 'XAUUSD', () => {
  const candles = dataXAUUSD_15m;
  const atrs = computeATR(candles, 14);
  const signals = new Array(candles.length).fill(null);

  for (let i = 2; i < candles.length; i++) {
    const gapUp = candles[i].low > candles[i - 2].high + atrs[i] * 0.3;
    const gapDown = candles[i].high < candles[i - 2].low - atrs[i] * 0.3;

    if (gapUp && candles[i].close < candles[i].open) {
      const sl = candles[i].high + atrs[i] * 0.25;
      const tp = candles[i - 2].high;
      signals[i] = { dir: 'SHORT', sl, tp };
    } else if (gapDown && candles[i].close > candles[i].open) {
      const sl = candles[i].low - atrs[i] * 0.25;
      const tp = candles[i - 2].low;
      signals[i] = { dir: 'LONG', sl, tp };
    }
  }

  return {
    name: '15M | GapFill | RR 1.2 | Micro-BE 0.25R',
    tf: '15M',
    candles,
    signals,
    simOptions: { breakevenR: 0.25, lockR: 0.55, lockedProfit: 0.45, cooldownBars: 6, maxHoldingBars: 35 },
  };
});

// ─── 14. 8 A.M INDICATOR ─────────────────────────────────────────────────────
// 8:00 AM NY Session Opening Range (+3.70R, 85.3% Non-Loss)
runSystem(14, '8 A.M INDICATOR', 'NAS100', () => {
  const candles = dataNAS100_15m;
  const atrs = computeATR(candles, 14);
  const nyCandles = precomputeNYTimes(candles);
  const signals = new Array(candles.length).fill(null);

  let high8am = 0;
  let low8am = 0;
  let armed = false;

  for (let i = 1; i < candles.length; i++) {
    const ny = nyCandles[i];

    if (ny.hour === 8 && ny.minute === 0) {
      high8am = candles[i].high;
      low8am = candles[i].low;
      armed = true;
    } else if (armed && ny.hour >= 8 && ny.hour <= 12) {
      if (candles[i].close > high8am) {
        const sl = low8am - atrs[i] * 0.2;
        const tp = candles[i].close + (candles[i].close - sl) * 1.5;
        signals[i] = { dir: 'LONG', sl, tp };
        armed = false;
      } else if (candles[i].close < low8am) {
        const sl = high8am + atrs[i] * 0.2;
        const tp = candles[i].close - (sl - candles[i].close) * 1.5;
        signals[i] = { dir: 'SHORT', sl, tp };
        armed = false;
      }
    }
  }

  return {
    name: '15M | 8:00 AM Session Range Breakout | RR 1.5 | Micro-BE 0.25R',
    tf: '15M',
    candles,
    signals,
    simOptions: { breakevenR: 0.25, lockR: 0.55, lockedProfit: 0.45, cooldownBars: 12, maxHoldingBars: 35 },
  };
});

// ─── 15. SWEEP & SHIFT ───────────────────────────────────────────────────────
// Major Swing Sweep + Reclaim on 15M (+32.73R, 86.9% Non-Loss)
runSystem(15, 'SWEEP & SHIFT', 'NAS100', () => {
  const candles = dataNAS100_15m;
  const atrs = computeATR(candles, 14);
  const phs = findPivotHighs(candles, 3, 3);
  const pls = findPivotLows(candles, 3, 3);
  const signals = new Array(candles.length).fill(null);

  let lastPl = null;
  let lastPh = null;

  for (let i = 5; i < candles.length; i++) {
    if (pls[i - 3]) lastPl = pls[i - 3];
    if (phs[i - 3]) lastPh = phs[i - 3];

    const c = candles[i];

    if (lastPl && c.low < lastPl && c.close > lastPl) {
      const sl = c.low - atrs[i] * 0.25;
      const tp = c.close + (c.close - sl) * 1.4;
      signals[i] = { dir: 'LONG', sl, tp };
      lastPl = null;
    } else if (lastPh && c.high > lastPh && c.close < lastPh) {
      const sl = c.high + atrs[i] * 0.25;
      const tp = c.close - (sl - c.close) * 1.4;
      signals[i] = { dir: 'SHORT', sl, tp };
      lastPh = null;
    }
  }

  return {
    name: '15M | Major Swing Sweep & Reclaim | RR 1.4 | Micro-BE 0.25R',
    tf: '15M',
    candles,
    signals,
    simOptions: { breakevenR: 0.25, lockR: 0.55, lockedProfit: 0.45, cooldownBars: 6, maxHoldingBars: 35 },
  };
});

// ─── 16. 8:12 TO 9:12 ORB (Native Strategy: Range Fade) ──────────────────────
// 1-minute Failed Breakout Re-Entry Fade (Exact Pine max 1 trade/day: +1.20R)
runSystem(16, '8:12 TO 9:12 ORB', 'NAS100', () => {
  const candles = dataNAS100_1m;
  const atrs = computeATR(candles, 14);
  const nyCandles = precomputeNYTimes(candles);
  const signals = new Array(candles.length).fill(null);

  let rangeHigh = -Infinity;
  let rangeLow = Infinity;
  let building = false;
  let armed = false;
  let curDay = '';
  let tradesToday = 0;

  for (let i = 50; i < candles.length - 30; i++) {
    const c = candles[i];
    const ny = nyCandles[i];

    if (ny.dateStr !== curDay) {
      curDay = ny.dateStr;
      rangeHigh = -Infinity;
      rangeLow = Infinity;
      building = false;
      armed = false;
      tradesToday = 0;
    }

    const totalMin = ny.hour * 60 + ny.minute;
    if (totalMin >= 492 && totalMin < 552) {
      building = true;
      rangeHigh = Math.max(rangeHigh, c.high);
      rangeLow = Math.min(rangeLow, c.low);
    } else if (building && totalMin >= 552) {
      building = false;
      armed = true;
    }

    if (armed && tradesToday < 1 && totalMin >= 552 && totalMin < 960) {
      if (candles[i - 1].low < rangeLow && c.close > rangeLow) {
        const sl = c.close - atrs[i] * 1.5;
        const tp = c.close + (c.close - sl) * 3.0;
        signals[i] = { dir: 'LONG', sl, tp };
        tradesToday++;
      } else if (candles[i - 1].high > rangeHigh && c.close < rangeHigh) {
        const sl = c.close + atrs[i] * 1.5;
        const tp = c.close - (sl - c.close) * 3.0;
        signals[i] = { dir: 'SHORT', sl, tp };
        tradesToday++;
      }
    }
  }

  return {
    name: '1M | Failed Breakout Fade | SL 1.5x ATR | TP 3.0x | BE 0.55R',
    tf: '1M',
    candles,
    signals,
    simOptions: { breakevenR: 0.55, lockR: 0.8, lockedProfit: 0.5, cooldownBars: 5, maxHoldingBars: 120 },
  };
});

// ─── 17. ASIA SWEEP INDCATOR ─────────────────────────────────────────────────
// London Session Asia Range Breakout & Expansion (+16.80R, 58.6% WR)
runSystem(17, 'ASIA SWEEP INDCATOR', 'EURUSD', () => {
  const candles = dataEURUSD_15m;
  const signals = new Array(candles.length).fill(null);

  let sHigh = -Infinity;
  let sLow = Infinity;
  let inAsia = false;
  let armed = false;

  for (let i = 10; i < candles.length - 20; i++) {
    const d = new Date(candles[i].openTime);
    const h = d.getUTCHours();
    const isAsia = h >= 0 && h < 7;

    if (isAsia) {
      if (!inAsia) {
        inAsia = true;
        sHigh = candles[i].high;
        sLow = candles[i].low;
        armed = true;
      } else {
        sHigh = Math.max(sHigh, candles[i].high);
        sLow = Math.min(sLow, candles[i].low);
      }
    } else {
      if (inAsia) inAsia = false;
      if (!armed) continue;

      if (h >= 7 && h <= 11) {
        const rr = 1.2;
        if (candles[i].close > sHigh && candles[i - 1].close <= sHigh) {
          const sl = sHigh - (sHigh - sLow) * 0.25;
          const tp = candles[i].close + (candles[i].close - sl) * rr;
          signals[i] = { dir: 'LONG', sl, tp };
          armed = false;
        } else if (candles[i].close < sLow && candles[i - 1].close >= sLow) {
          const sl = sLow + (sHigh - sLow) * 0.25;
          const tp = candles[i].close - (sl - candles[i].close) * rr;
          signals[i] = { dir: 'SHORT', sl, tp };
          armed = false;
        }
      }
    }
  }

  return {
    name: '15M | London Asia Breakout Expansion | RR 1.2 | Fixed Risk',
    tf: '15M',
    candles,
    signals,
    simOptions: { breakevenR: null, lockR: null, cooldownBars: 3, maxHoldingBars: 35 },
  };
});

// ─── 18. AMD/FVG ─────────────────────────────────────────────────────────────
// Accumulation-Manipulation-Distribution + FVG (+0.95R, 82.1% Non-Loss)
runSystem(18, 'AMD/FVG', 'NAS100', () => {
  const candles = dataNAS100_15m;
  const atrs = computeATR(candles, 14);
  const accLen = 20;
  const tpMult = 1.2;
  const signals = new Array(candles.length).fill(null);

  for (let i = accLen + 10; i < candles.length; i++) {
    let accHigh = -Infinity;
    let accLow = Infinity;
    for (let j = i - accLen - 5; j < i - 5; j++) {
      accHigh = Math.max(accHigh, candles[j].high);
      accLow = Math.min(accLow, candles[j].low);
    }

    const manipBear = candles[i - 2].high > accHigh && candles[i].close < accHigh;
    const manipBull = candles[i - 2].low < accLow && candles[i].close > accLow;

    const p2 = candles[i - 2];
    const bullFvg = candles[i].low > p2.high && candles[i].close > candles[i].open;
    const bearFvg = candles[i].high < p2.low && candles[i].close < candles[i].open;

    if (manipBull && bullFvg) {
      const sl = candles[i].low - atrs[i] * 0.3;
      const tp = candles[i].close + (candles[i].close - sl) * tpMult;
      signals[i] = { dir: 'LONG', sl, tp };
    } else if (manipBear && bearFvg) {
      const sl = candles[i].high + atrs[i] * 0.3;
      const tp = candles[i].close - (sl - candles[i].close) * tpMult;
      signals[i] = { dir: 'SHORT', sl, tp };
    }
  }

  return {
    name: '15M | AccLen 20 | TP 1.2x | Micro-BE 0.2R',
    tf: '15M',
    candles,
    signals,
    simOptions: { breakevenR: 0.2, lockR: 0.5, lockedProfit: 0.4, cooldownBars: 6, maxHoldingBars: 35 },
  };
});

// ─── Save Final Outputs ──────────────────────────────────────────────────────
const benchPath = path.join(RESULTS_DIR, 'all_18_benchmarks.json');
const logsPath = path.join(RESULTS_DIR, 'all_18_trade_logs.json');

fs.writeFileSync(benchPath, JSON.stringify(allResults, null, 2), 'utf8');
fs.writeFileSync(logsPath, JSON.stringify(allTradeLogs, null, 2), 'utf8');

console.log(`\n Successfully written:`);
console.log(` - Benchmark summary: ${benchPath}`);
console.log(` - Full trade logs:   ${logsPath}`);
