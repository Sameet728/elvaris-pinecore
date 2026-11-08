import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('monkalgo_strategies/data');
const RESULTS_DIR = path.resolve('monkalgo_strategies/results');

if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// TA Libraries
// ─────────────────────────────────────────────────────────────────────────────

function computeATR(candles, period = 14) {
  const atrs = new Float64Array(candles.length);
  if (candles.length === 0) return atrs;
  const trs = new Float64Array(candles.length);
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
  const emas = new Float64Array(candles.length);
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
  const phs = new Float64Array(candles.length);
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
  const pls = new Float64Array(candles.length);
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

function getNYTime(timestamp) {
  const date = new Date(timestamp);
  const str = date.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const d = new Date(str);
  return {
    hour: d.getHours(),
    minute: d.getMinutes(),
    day: d.getDay(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulator with Multi-Tier Defensive Locks
// ─────────────────────────────────────────────────────────────────────────────

function simulateTrades(candles, signals, options = {}) {
  const {
    breakevenR = 0.25,
    lockR = 0.55,
    lockedProfit = 0.45,
    maxHoldBars = 100,
    cooldownBars = 6,
  } = options;

  const trades = [];
  let inTrade = false;
  let curTrade = null;
  let lastExitBar = -999;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];

    if (inTrade) {
      const barsHeld = i - curTrade.entryBar;
      let exitPrice = null;
      let exitReason = null;
      let profitR = 0;

      if (curTrade.dir === 'LONG') {
        const riskDist = curTrade.entryPrice - curTrade.origSl;
        const currentGainR = (c.high - curTrade.entryPrice) / riskDist;

        if (breakevenR > 0 && currentGainR >= breakevenR && curTrade.curSl < curTrade.entryPrice) {
          curTrade.curSl = curTrade.entryPrice + riskDist * 0.05;
        }
        if (lockR > 0 && currentGainR >= lockR && curTrade.curSl < curTrade.entryPrice + riskDist * lockedProfit) {
          curTrade.curSl = curTrade.entryPrice + riskDist * lockedProfit;
        }

        if (c.low <= curTrade.curSl) {
          exitPrice = curTrade.curSl;
          exitReason = exitPrice >= curTrade.entryPrice ? (exitPrice <= curTrade.entryPrice + riskDist * 0.1 ? 'BE' : 'LOCK') : 'SL';
        } else if (c.high >= curTrade.tp) {
          exitPrice = curTrade.tp;
          exitReason = 'TP';
        } else if (barsHeld >= maxHoldBars) {
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
          curTrade.curSl = curTrade.entryPrice - riskDist * 0.05;
        }
        if (lockR > 0 && currentGainR >= lockR && curTrade.curSl > curTrade.entryPrice - riskDist * lockedProfit) {
          curTrade.curSl = curTrade.entryPrice - riskDist * lockedProfit;
        }

        if (c.high >= curTrade.curSl) {
          exitPrice = curTrade.curSl;
          exitReason = exitPrice <= curTrade.entryPrice ? (exitPrice >= curTrade.entryPrice - riskDist * 0.1 ? 'BE' : 'LOCK') : 'SL';
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
  const maxDrawdownPct = Number((maxDDR * 0.5).toFixed(2));

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

const dataNAS100_1m  = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'nas100_1m.json'), 'utf8'));
const dataNAS100_5m  = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'nas100_5m.json'), 'utf8'));
const dataNAS100_15m = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'nas100_15m.json'), 'utf8'));

const dataSPX500_5m  = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'spx500_5m.json'), 'utf8'));
const dataSPX500_15m = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'spx500_15m.json'), 'utf8'));

const dataXAUUSD_5m  = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_5m.json'), 'utf8'));
const dataXAUUSD_15m = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_15m.json'), 'utf8'));

const dataEURUSD_5m  = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'eurusd_5m.json'), 'utf8'));
const dataEURUSD_15m = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'eurusd_15m.json'), 'utf8'));

const allResults = [];
const allTradeLogs = {};

function scoreMetric(m) {
  if (m.totalTrades < 6) return -9999;
  return (m.netReturnR * 5.0) + (m.winRate * 2.0) + (m.nonLossRate * 1.5) + (m.calmarRatio * 10) - (m.maxDrawdownR * 4);
}

function optimizeSystem(num, name, instrument, generateConfigs) {
  const configs = generateConfigs();
  let best = null;
  let bestScore = -Infinity;

  for (const cfg of configs) {
    const trades = simulateTrades(cfg.candles, cfg.signals, cfg.simOptions);
    const metrics = calculateMetrics(trades);
    const score = scoreMetric(metrics);

    if (score > bestScore) {
      bestScore = score;
      best = {
        name: cfg.name,
        tf: cfg.tf,
        candlesCount: cfg.candles.length,
        trades,
        metrics,
        simOptions: cfg.simOptions,
      };
    }
  }

  if (!best || best.trades.length === 0) {
    for (const cfg of configs) {
      const trades = simulateTrades(cfg.candles, cfg.signals, cfg.simOptions);
      if (trades.length > 0) {
        best = {
          name: cfg.name,
          tf: cfg.tf,
          candlesCount: cfg.candles.length,
          trades,
          metrics: calculateMetrics(trades),
          simOptions: cfg.simOptions,
        };
        break;
      }
    }
  }

  const mc = runMonteCarlo(best.trades, 5000);

  const res = {
    index: num,
    name,
    instrument,
    bestConfig: best.name,
    timeframe: best.tf,
    barsTested: best.candlesCount,
    performance: best.metrics,
    monteCarlo: mc,
  };

  allResults.push(res);
  allTradeLogs[name] = {
    info: res,
    sampleTrades: best.trades.slice(-25),
    fullTradeCount: best.trades.length,
  };

  console.log(`[#${String(num).padStart(2, '0')}] ${name.padEnd(25)} | TF: ${best.tf.padEnd(3)} | Trades: ${String(best.metrics.totalTrades).padStart(3)} | WR: ${(best.metrics.winRate + '%').padStart(6)} | Non-Loss: ${(best.metrics.nonLossRate + '%').padStart(6)} | Return: ${('+' + best.metrics.netReturnR + 'R').padStart(8)} | Calmar: ${String(best.metrics.calmarRatio).padStart(5)} | MaxDD: -${best.metrics.maxDrawdownR}R | MC 95% DD: -${mc.p95WorstDrawdownR}R`);
}

console.log('=== Running Master Quantitative Institutional Benchmark on All 18 Systems ===\n');

// ─── 1. SWING ───────────────────────────────────────────────────────────────
optimizeSystem(1, 'SWING', 'NAS100', () => {
  const configs = [];
  const candles = dataNAS100_15m;
  const atrs = computeATR(candles, 14);
  const emas = computeEMA(candles, 200);

  for (const rr of [1.1, 1.25, 1.4]) {
    for (const be of [0.2, 0.25]) {
      const phs = findPivotHighs(candles, 5, 5);
      const pls = findPivotLows(candles, 5, 5);
      const signals = new Array(candles.length).fill(null);

      let lastPh = null;
      let lastPl = null;
      let msTrend = 0;

      for (let i = 10; i < candles.length; i++) {
        if (phs[i - 5]) lastPh = phs[i - 5];
        if (pls[i - 5]) lastPl = pls[i - 5];

        const emaTrend = candles[i].close > emas[i] ? 1 : -1;

        if (lastPh && candles[i].close > lastPh) {
          if (msTrend === -1 && emaTrend === 1) {
            const sl = candles[i].low - atrs[i] * 0.25;
            const tp = candles[i].close + (candles[i].close - sl) * rr;
            signals[i] = { dir: 'LONG', sl, tp };
          }
          msTrend = 1;
          lastPh = null;
        }

        if (lastPl && candles[i].close < lastPl) {
          if (msTrend === 1 && emaTrend === -1) {
            const sl = candles[i].high + atrs[i] * 0.25;
            const tp = candles[i].close - (sl - candles[i].close) * rr;
            signals[i] = { dir: 'SHORT', sl, tp };
          }
          msTrend = -1;
          lastPl = null;
        }
      }

      configs.push({
        name: `15M | EMA200 Filter | RR ${rr} | Micro-BE ${be}R`,
        tf: '15M',
        candles,
        signals,
        simOptions: { breakevenR: be, lockR: 0.5, lockedProfit: 0.4, cooldownBars: 6 },
      });
    }
  }
  return configs;
});

// ─── 2. 9:30 A.M ─────────────────────────────────────────────────────────────
optimizeSystem(2, '9:30 A.M', 'NAS100', () => {
  const configs = [];
  const candles = dataNAS100_5m;
  const atrs = computeATR(candles, 14);

  for (const rr of [1.2, 1.4, 1.6]) {
    for (const be of [0.2, 0.25]) {
      const signals = new Array(candles.length).fill(null);
      let sHigh = -Infinity;
      let sLow = Infinity;
      let sOpen = 0;
      let measuring = false;
      let armed = false;

      for (let i = 1; i < candles.length; i++) {
        const ny = getNYTime(candles[i].openTime);

        if (ny.hour === 9 && ny.minute >= 30 && ny.minute < 45) {
          if (!measuring) {
            measuring = true;
            sHigh = candles[i].high;
            sLow = candles[i].low;
            sOpen = candles[i].open;
          } else {
            sHigh = Math.max(sHigh, candles[i].high);
            sLow = Math.min(sLow, candles[i].low);
          }
        } else if (measuring && ny.hour === 9 && ny.minute === 45) {
          measuring = false;
          armed = true;
        }

        // Pullback to 50% Fib level
        if (armed && ny.hour >= 9 && ny.hour <= 11) {
          const isBull = candles[i].close > sOpen;
          const fib50 = (sHigh + sLow) / 2;

          if (isBull && candles[i].low <= fib50 && candles[i].close > fib50) {
            const sl = sLow - atrs[i] * 0.15;
            const tp = candles[i].close + (candles[i].close - sl) * rr;
            signals[i] = { dir: 'LONG', sl, tp };
            armed = false;
          } else if (!isBull && candles[i].high >= fib50 && candles[i].close < fib50) {
            const sl = sHigh + atrs[i] * 0.15;
            const tp = candles[i].close - (sl - candles[i].close) * rr;
            signals[i] = { dir: 'SHORT', sl, tp };
            armed = false;
          }
        }

        if (ny.hour >= 12) armed = false;
      }

      configs.push({
        name: `50% Fib Pullback | RR ${rr} | BE ${be}R`,
        tf: '5M',
        candles,
        signals,
        simOptions: { breakevenR: be, lockR: 0.5, lockedProfit: 0.4, cooldownBars: 8 },
      });
    }
  }
  return configs;
});

// ─── 3. MANIPULATION ─────────────────────────────────────────────────────────
optimizeSystem(3, 'MANIPULATION', 'NAS100', () => {
  const configs = [];
  const candles = dataNAS100_5m;
  const atrs = computeATR(candles, 14);

  for (const htfBars of [12, 18]) {
    for (const rr of [1.3, 1.5]) {
      const signals = new Array(candles.length).fill(null);

      for (let i = htfBars * 2; i < candles.length; i++) {
        const ny = getNYTime(candles[i].openTime);
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

      configs.push({
        name: `HTFBars ${htfBars} | RR ${rr} | Micro-BE 0.25R`,
        tf: '5M',
        candles,
        signals,
        simOptions: { breakevenR: 0.25, lockR: 0.55, lockedProfit: 0.45, cooldownBars: 8 },
      });
    }
  }
  return configs;
});

// ─── 4. LIQUIDITY ────────────────────────────────────────────────────────────
optimizeSystem(4, 'LIQUIDITY', 'SPX500', () => {
  const configs = [];
  const candles = dataSPX500_5m;
  const atrs = computeATR(candles, 14);

  for (const leg of [3, 5]) {
    for (const rr of [1.3, 1.5]) {
      const pls = findPivotLows(candles, leg, leg);
      const phs = findPivotHighs(candles, leg, leg);
      const signals = new Array(candles.length).fill(null);

      let protLow = null;
      let protHigh = null;

      for (let i = leg * 2; i < candles.length; i++) {
        if (pls[i - leg]) protLow = pls[i - leg];
        if (phs[i - leg]) protHigh = phs[i - leg];

        const ny = getNYTime(candles[i].openTime);
        if (ny.hour < 9 || ny.hour > 16) continue;

        if (protLow && candles[i].low < protLow && candles[i].close > protLow) {
          const sl = candles[i].low - atrs[i] * 0.25;
          const tp = candles[i].close + (candles[i].close - sl) * rr;
          signals[i] = { dir: 'LONG', sl, tp };
          protLow = null;
        } else if (protHigh && candles[i].high > protHigh && candles[i].close < protHigh) {
          const sl = candles[i].high + atrs[i] * 0.25;
          const tp = candles[i].close - (sl - candles[i].close) * rr;
          signals[i] = { dir: 'SHORT', sl, tp };
          protHigh = null;
        }
      }

      configs.push({
        name: `Leg ${leg} | RR ${rr} | Micro-BE 0.25R`,
        tf: '5M',
        candles,
        signals,
        simOptions: { breakevenR: 0.25, lockR: 0.55, lockedProfit: 0.45, cooldownBars: 6 },
      });
    }
  }
  return configs;
});

// ─── 5. WICK ─────────────────────────────────────────────────────────────────
optimizeSystem(5, 'WICK', 'SPX500', () => {
  const configs = [];
  const candles = dataSPX500_5m;
  const atrs = computeATR(candles, 14);
  const emas = computeEMA(candles, 100);

  for (const rr of [1.1, 1.25, 1.4]) {
    for (const be of [0.2, 0.25]) {
      const signals = new Array(candles.length).fill(null);

      for (let i = 2; i < candles.length; i++) {
        const c = candles[i - 1];
        const body = Math.abs(c.close - c.open);
        const lowerWick = Math.min(c.open, c.close) - c.low;
        const upperWick = c.high - Math.max(c.open, c.close);

        // Strong directional imbalance candle (no wick) -> Impulse follow-through
        if (body > atrs[i] * 0.6) {
          if (lowerWick <= body * 0.03 && c.close > c.open && c.close > emas[i]) {
            const sl = c.low - atrs[i] * 0.2;
            const tp = candles[i].close + (candles[i].close - sl) * rr;
            signals[i] = { dir: 'LONG', sl, tp };
          } else if (upperWick <= body * 0.03 && c.close < c.open && c.close < emas[i]) {
            const sl = c.high + atrs[i] * 0.2;
            const tp = candles[i].close - (sl - candles[i].close) * rr;
            signals[i] = { dir: 'SHORT', sl, tp };
          }
        }
      }

      configs.push({
        name: `Impulse Continuation | RR ${rr} | BE ${be}R`,
        tf: '5M',
        candles,
        signals,
        simOptions: { breakevenR: be, lockR: 0.5, lockedProfit: 0.4, cooldownBars: 6 },
      });
    }
  }
  return configs;
});

// ─── 6. FVG ──────────────────────────────────────────────────────────────────
optimizeSystem(6, 'FVG', 'NAS100', () => {
  const configs = [];
  const candles = dataNAS100_5m;
  const atrs = computeATR(candles, 14);

  for (const rr of [1.4, 1.6, 1.8]) {
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

      if (lastPl && c.low < lastPl && isBullFvg) {
        const sl = c.low - atrs[i] * 0.25;
        const tp = c.close + (c.close - sl) * rr;
        signals[i] = { dir: 'LONG', sl, tp };
        lastPl = null;
      } else if (lastPh && c.high > lastPh && isBearFvg) {
        const sl = c.high + atrs[i] * 0.25;
        const tp = c.close - (sl - c.close) * rr;
        signals[i] = { dir: 'SHORT', sl, tp };
        lastPh = null;
      }
    }

    configs.push({
      name: `RR ${rr} | Micro-BE 0.25R | Lock 0.55R`,
      tf: '5M',
      candles,
      signals,
      simOptions: { breakevenR: 0.25, lockR: 0.55, lockedProfit: 0.45, cooldownBars: 6 },
    });
  }
  return configs;
});

// ─── 7. ROADMAP ──────────────────────────────────────────────────────────────
optimizeSystem(7, 'ROADMAP', 'NAS100', () => {
  const configs = [];
  const candles = dataNAS100_5m;

  for (const rr of [1.4, 1.6, 1.8]) {
    const signals = new Array(candles.length).fill(null);
    let orHigh = -Infinity;
    let orLow = Infinity;
    let armed = false;

    for (let i = 0; i < candles.length; i++) {
      const ny = getNYTime(candles[i].openTime);

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
      name: `RR ${rr} | Micro-BE 0.25R`,
      tf: '5M',
      candles,
      signals,
      simOptions: { breakevenR: 0.25, lockR: 0.6, lockedProfit: 0.5, cooldownBars: 10 },
    });
  }
  return configs;
});

// ─── 8. PUSH ─────────────────────────────────────────────────────────────────
optimizeSystem(8, 'PUSH', 'NAS100', () => {
  const configs = [];
  const candles = dataNAS100_5m;
  const atrs = computeATR(candles, 14);

  for (const rr of [1.5, 1.8, 2.0]) {
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
          const tp = candles[i].close - (sl - candles[i].close) * rr;
          signals[i] = { dir: 'SHORT', sl, tp };
          sweepHighDone = true;
        } else if (!sweepLowDone && candles[i].low < asiaLow && candles[i].close > asiaLow) {
          const sl = candles[i].low - atrs[i] * 0.25;
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
      name: `RR ${rr} | Micro-BE 0.25R`,
      tf: '5M',
      candles,
      signals,
      simOptions: { breakevenR: 0.25, lockR: 0.6, lockedProfit: 0.5, cooldownBars: 10 },
    });
  }
  return configs;
});

// ─── 9. SWEEP IFVG ───────────────────────────────────────────────────────────
optimizeSystem(9, 'SWEEP IFVG', 'NAS100', () => {
  const configs = [];
  const candles = dataNAS100_5m;
  const atrs = computeATR(candles, 14);

  for (const rr of [1.2, 1.4, 1.6]) {
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
          const tp = c.close + (c.close - sl) * rr;
          signals[i] = { dir: 'LONG', sl, tp };
          bearFvgs.splice(j, 1);
          break;
        }
      }

      for (let j = bullFvgs.length - 1; j >= 0; j--) {
        const f = bullFvgs[j];
        if (c.close < f.bot && lastPh && c.high >= lastPh - atrs[i] * 0.4) {
          const sl = c.high + atrs[i] * 0.25;
          const tp = c.close - (sl - c.close) * rr;
          signals[i] = { dir: 'SHORT', sl, tp };
          bullFvgs.splice(j, 1);
          break;
        }
      }
    }

    configs.push({
      name: `RR ${rr} | Micro-BE 0.25R`,
      tf: '5M',
      candles,
      signals,
      simOptions: { breakevenR: 0.25, lockR: 0.55, lockedProfit: 0.45, cooldownBars: 6 },
    });
  }
  return configs;
});

// ─── 10. IFVG ────────────────────────────────────────────────────────────────
optimizeSystem(10, 'IFVG', 'NAS100', () => {
  const configs = [];
  const candles = dataNAS100_5m;
  const atrs = computeATR(candles, 14);

  for (const rr of [1.2, 1.4, 1.6]) {
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
          const tp = c.close + (c.close - sl) * rr;
          signals[i] = { dir: 'LONG', sl, tp };
          fvgs.splice(j, 1);
          break;
        } else if (f.type === 'BULL' && c.close < f.bot) {
          const sl = f.top + atrs[i] * 0.2;
          const tp = c.close - (sl - c.close) * rr;
          signals[i] = { dir: 'SHORT', sl, tp };
          fvgs.splice(j, 1);
          break;
        }
      }
    }

    configs.push({
      name: `RR ${rr} | Micro-BE 0.25R`,
      tf: '5M',
      candles,
      signals,
      simOptions: { breakevenR: 0.25, lockR: 0.55, lockedProfit: 0.45, cooldownBars: 6 },
    });
  }
  return configs;
});

// ─── 11. PROFILE ─────────────────────────────────────────────────────────────
optimizeSystem(11, 'PROFILE', 'NAS100', () => {
  const configs = [];
  const candles = dataNAS100_15m;
  const atrs = computeATR(candles, 14);

  for (const bars of [24, 36]) {
    for (const rr of [1.1, 1.25]) {
      const signals = new Array(candles.length).fill(null);

      for (let i = bars; i < candles.length; i++) {
        let maxP = -Infinity;
        let minP = Infinity;
        for (let j = i - bars; j < i; j++) {
          maxP = Math.max(maxP, candles[j].high);
          minP = Math.min(minP, candles[j].low);
        }
        const range = maxP - minP;
        const vah = maxP - range * 0.3;
        const val = minP + range * 0.3;
        const poc = (maxP + minP) / 2; // Midpoint POC

        if (candles[i - 1].low < val && candles[i].close > val) {
          const sl = candles[i - 1].low - atrs[i] * 0.2;
          const tp = Math.min(candles[i].close + (candles[i].close - sl) * rr, poc);
          if (tp > candles[i].close) signals[i] = { dir: 'LONG', sl, tp };
        } else if (candles[i - 1].high > vah && candles[i].close < vah) {
          const sl = candles[i - 1].high + atrs[i] * 0.2;
          const tp = Math.max(candles[i].close - (sl - candles[i].close) * rr, poc);
          if (tp < candles[i].close) signals[i] = { dir: 'SHORT', sl, tp };
        }
      }

      configs.push({
        name: `POC Target | Window ${bars} | RR ${rr}`,
        tf: '15M',
        candles,
        signals,
        simOptions: { breakevenR: 0.2, lockR: 0.5, lockedProfit: 0.4, cooldownBars: 6 },
      });
    }
  }
  return configs;
});

// ─── 12. EASY ────────────────────────────────────────────────────────────────
optimizeSystem(12, 'EASY', 'NAS100', () => {
  const configs = [];
  const candles = dataNAS100_15m;
  const atrs = computeATR(candles, 14);

  for (const rr of [1.1, 1.25, 1.4]) {
    const pls = findPivotLows(candles, 4, 4);
    const phs = findPivotHighs(candles, 4, 4);
    const signals = new Array(candles.length).fill(null);

    let lastPl = null;
    let lastPh = null;

    for (let i = 8; i < candles.length; i++) {
      if (pls[i - 4]) lastPl = pls[i - 4];
      if (phs[i - 4]) lastPh = phs[i - 4];

      const bullMom = candles[i].close > candles[i].open && candles[i - 1].close > candles[i - 1].open;
      const bearMom = candles[i].close < candles[i].open && candles[i - 1].close < candles[i - 1].open;

      if (lastPl && candles[i - 2].low < lastPl && bullMom) {
        const sl = candles[i - 2].low - atrs[i] * 0.2;
        const tp = candles[i].close + (candles[i].close - sl) * rr;
        signals[i] = { dir: 'LONG', sl, tp };
        lastPl = null;
      } else if (lastPh && candles[i - 2].high > lastPh && bearMom) {
        const sl = candles[i - 2].high + atrs[i] * 0.2;
        const tp = candles[i].close - (sl - candles[i].close) * rr;
        signals[i] = { dir: 'SHORT', sl, tp };
        lastPh = null;
      }
    }

    configs.push({
      name: `RR ${rr} | Micro-BE 0.2R`,
      tf: '15M',
      candles,
      signals,
      simOptions: { breakevenR: 0.2, lockR: 0.5, lockedProfit: 0.4, cooldownBars: 6 },
    });
  }
  return configs;
});

// ─── 13. GAP ─────────────────────────────────────────────────────────────────
optimizeSystem(13, 'GAP', 'XAUUSD', () => {
  const configs = [];
  const candles = dataXAUUSD_15m;
  const atrs = computeATR(candles, 14);

  for (const rr of [1.2, 1.4]) {
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

    configs.push({
      name: `GapFill | RR ${rr} | Micro-BE 0.25R`,
      tf: '15M',
      candles,
      signals,
      simOptions: { breakevenR: 0.25, lockR: 0.55, lockedProfit: 0.45, cooldownBars: 6 },
    });
  }
  return configs;
});

// ─── 14. 8 A.M INDICATOR ─────────────────────────────────────────────────────
optimizeSystem(14, '8 A.M INDICATOR', 'NAS100', () => {
  const configs = [];
  const candles = dataNAS100_5m;
  const atrs = computeATR(candles, 14);

  for (const rr of [1.1, 1.3]) {
    const signals = new Array(candles.length).fill(null);
    let rangeHigh = -Infinity;
    let rangeLow = Infinity;
    let armed = false;
    let breakDone = false;

    for (let i = 0; i < candles.length; i++) {
      const ny = getNYTime(candles[i].openTime);

      if (ny.hour === 8) {
        rangeHigh = Math.max(rangeHigh, candles[i].high);
        rangeLow = Math.min(rangeLow, candles[i].low);
        breakDone = false;
      } else if (ny.hour === 9 && ny.minute === 0) {
        armed = true;
      }

      // Fading 8am false break
      if (armed && !breakDone && ny.hour >= 9 && ny.hour <= 11) {
        if (candles[i - 1].high > rangeHigh && candles[i].close < rangeHigh) {
          const sl = candles[i - 1].high + atrs[i] * 0.2;
          const tp = candles[i].close - (sl - candles[i].close) * rr;
          signals[i] = { dir: 'SHORT', sl, tp };
          breakDone = true;
        } else if (candles[i - 1].low < rangeLow && candles[i].close > rangeLow) {
          const sl = candles[i - 1].low - atrs[i] * 0.2;
          const tp = candles[i].close + (candles[i].close - sl) * rr;
          signals[i] = { dir: 'LONG', sl, tp };
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
      name: `Range Fade | RR ${rr} | Micro-BE 0.2R`,
      tf: '5M',
      candles,
      signals,
      simOptions: { breakevenR: 0.2, lockR: 0.5, lockedProfit: 0.4, cooldownBars: 8 },
    });
  }
  return configs;
});

// ─── 15. SWEEP & SHIFT ───────────────────────────────────────────────────────
optimizeSystem(15, 'SWEEP & SHIFT', 'NAS100', () => {
  const configs = [];
  const candles = dataNAS100_15m;
  const atrs = computeATR(candles, 14);

  for (const rr of [1.4, 1.6]) {
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
        const tp = c.close + (c.close - sl) * rr;
        signals[i] = { dir: 'LONG', sl, tp };
        lastPl = null;
      } else if (lastPh && c.high > lastPh && c.close < lastPh) {
        const sl = c.high + atrs[i] * 0.25;
        const tp = c.close - (sl - c.close) * rr;
        signals[i] = { dir: 'SHORT', sl, tp };
        lastPh = null;
      }
    }

    configs.push({
      name: `RR ${rr} | Micro-BE 0.25R`,
      tf: '15M',
      candles,
      signals,
      simOptions: { breakevenR: 0.25, lockR: 0.55, lockedProfit: 0.45, cooldownBars: 6 },
    });
  }
  return configs;
});

// ─── 16. 8:12 TO 9:12 ORB ────────────────────────────────────────────────────
optimizeSystem(16, '8:12 TO 9:12 ORB', 'NAS100', () => {
  const configs = [];
  const candles = dataNAS100_1m;
  const atrs = computeATR(candles, 14);

  for (const atrMult of [1.5, 2.0]) {
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

      const inBuild = (ny.hour === 8 && ny.minute >= 12) || (ny.hour === 9 && ny.minute < 12);
      if (inBuild) {
        building = true;
        rangeHigh = Math.max(rangeHigh, candles[i].high);
        rangeLow = Math.min(rangeLow, candles[i].low);
      } else if (building && ny.hour === 9 && ny.minute === 12) {
        building = false;
        armed = true;
      }

      if (armed && tradeCountToday < 2 && ((ny.hour === 9 && ny.minute >= 12) || (ny.hour > 9 && ny.hour < 15))) {
        if (candles[i - 1].low < rangeLow && candles[i].close > rangeLow) {
          const sl = candles[i].close - atrs[i] * atrMult;
          const tp = candles[i].close + (candles[i].close - sl) * 1.5;
          signals[i] = { dir: 'LONG', sl, tp };
          tradeCountToday++;
        } else if (candles[i - 1].high > rangeHigh && candles[i].close < rangeHigh) {
          const sl = candles[i].close - atrs[i] * atrMult;
          const tp = candles[i].close - (sl - candles[i].close) * 1.5;
          signals[i] = { dir: 'SHORT', sl, tp };
          tradeCountToday++;
        }
      }

      if (ny.hour >= 15) armed = false;
    }

    configs.push({
      name: `SL ATR ${atrMult} | TP 1.5x`,
      tf: '1M',
      candles,
      signals,
      simOptions: { breakevenR: 0.25, lockR: 0.6, lockedProfit: 0.5, cooldownBars: 10 },
    });
  }
  return configs;
});

// ─── 17. ASIA SWEEP INDCATOR ─────────────────────────────────────────────────
optimizeSystem(17, 'ASIA SWEEP INDCATOR', 'EUR/USD', () => {
  const configs = [];
  const candles = dataEURUSD_5m;
  const atrs = computeATR(candles, 14);

  for (const rr of [1.2, 1.4]) {
    const signals = new Array(candles.length).fill(null);
    let asiaHigh = -Infinity;
    let asiaLow = Infinity;
    let inAsia = false;
    let sweepHighDone = false;
    let sweepLowDone = false;

    for (let i = 0; i < candles.length; i++) {
      const ny = getNYTime(candles[i].openTime);

      const isAsia = (ny.hour >= 19 || ny.hour < 4);
      if (isAsia) {
        inAsia = true;
        asiaHigh = Math.max(asiaHigh, candles[i].high);
        asiaLow = Math.min(asiaLow, candles[i].low);
        sweepHighDone = false;
        sweepLowDone = false;
      } else if (inAsia && ny.hour >= 4 && ny.hour < 12) {
        const asiaMid = (asiaHigh + asiaLow) / 2;

        if (!sweepHighDone && candles[i].high > asiaHigh && candles[i].close < asiaHigh) {
          const sl = candles[i].high + atrs[i] * 0.15;
          const tp = candles[i].close - (sl - candles[i].close) * rr;
          signals[i] = { dir: 'SHORT', sl, tp };
          sweepHighDone = true;
        } else if (!sweepLowDone && candles[i].low < asiaLow && candles[i].close > asiaLow) {
          const sl = candles[i].low - atrs[i] * 0.15;
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
      name: `Asia Midline Reversion | RR ${rr}`,
      tf: '5M',
      candles,
      signals,
      simOptions: { breakevenR: 0.2, lockR: 0.5, lockedProfit: 0.4, cooldownBars: 8 },
    });
  }
  return configs;
});

// ─── 18. AMD/FVG ─────────────────────────────────────────────────────────────
optimizeSystem(18, 'AMD/FVG', 'NAS100', () => {
  const configs = [];
  const candles = dataNAS100_15m;
  const atrs = computeATR(candles, 14);

  for (const accLen of [20, 30]) {
    for (const tpMult of [1.2, 1.4]) {
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

      configs.push({
        name: `AccLen ${accLen} | TP ${tpMult}x`,
        tf: '15M',
        candles,
        signals,
        simOptions: { breakevenR: 0.2, lockR: 0.5, lockedProfit: 0.4, cooldownBars: 6 },
      });
    }
  }
  return configs;
});

// ─────────────────────────────────────────────────────────────────────────────
// Save Optimized Benchmarks
// ─────────────────────────────────────────────────────────────────────────────

fs.writeFileSync(path.join(RESULTS_DIR, 'all_18_benchmarks.json'), JSON.stringify(allResults, null, 2), 'utf8');
fs.writeFileSync(path.join(RESULTS_DIR, 'all_18_trade_logs.json'), JSON.stringify(allTradeLogs, null, 2), 'utf8');

console.log(`\nMaster Quantitative Benchmarks complete! All 18 systems saved.`);

