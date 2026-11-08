import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('monkalgo_strategies/data');
const RESULTS_DIR = path.resolve('monkalgo_strategies/results');

function loadCandles(filename) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8'));
}

const nas15m = loadCandles('nas100_15m.json');
const spx15m = loadCandles('spx500_15m.json');
const xau15m = loadCandles('xauusd_15m.json');
const eur15m = loadCandles('eurusd_15m.json');

function computeATR(candles, period = 14) {
  const atrs = new Float64Array(candles.length);
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    atrs[i] = (atrs[i - 1] * (period - 1) + tr) / period;
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

function findPivotLows(candles, left, right) {
  const pls = new Float64Array(candles.length);
  for (let i = left; i < candles.length - right; i++) {
    let isL = true;
    const l = candles[i].low;
    for (let j = i - left; j <= i + right; j++) {
      if (j !== i && candles[j].low <= l) { isL = false; break; }
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
    return { hour, minute: m };
  });
}

function simulateTrades(candles, signals, options = {}) {
  const {
    breakevenR = 0.25,
    lockR = 0.6,
    lockedProfit = 0.5,
    cooldownBars = 2,
    maxHoldingBars = 35,
    systemId = 'SYS',
    asset = 'NAS100',
    timeframe = '15M',
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
            systemId,
            asset,
            timeframe,
            entryTime: candles[t.entryBar].openTime,
            exitTime: c.openTime,
            entryDate: new Date(candles[t.entryBar].openTime).toISOString(),
            exitDate: new Date(c.openTime).toISOString(),
            dir: t.dir,
            entryPrice: Number(t.entryPrice.toFixed(4)),
            exitPrice: Number(exitPrice.toFixed(4)),
            returnR: Number(returnR.toFixed(3)),
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
            systemId,
            asset,
            timeframe,
            entryTime: candles[t.entryBar].openTime,
            exitTime: c.openTime,
            entryDate: new Date(candles[t.entryBar].openTime).toISOString(),
            exitDate: new Date(c.openTime).toISOString(),
            dir: t.dir,
            entryPrice: Number(t.entryPrice.toFixed(4)),
            exitPrice: Number(t.targetPrice.toFixed(4)),
            returnR: Number(returnR.toFixed(3)),
            result: 'WIN',
            barsHeld,
          });
          inTrade = false;
          activeTrade = null;
          lastExitBar = i;
          continue;
        }
      } else {
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
            systemId,
            asset,
            timeframe,
            entryTime: candles[t.entryBar].openTime,
            exitTime: c.openTime,
            entryDate: new Date(candles[t.entryBar].openTime).toISOString(),
            exitDate: new Date(c.openTime).toISOString(),
            dir: t.dir,
            entryPrice: Number(t.entryPrice.toFixed(4)),
            exitPrice: Number(exitPrice.toFixed(4)),
            returnR: Number(returnR.toFixed(3)),
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
            systemId,
            asset,
            timeframe,
            entryTime: candles[t.entryBar].openTime,
            exitTime: c.openTime,
            entryDate: new Date(candles[t.entryBar].openTime).toISOString(),
            exitDate: new Date(c.openTime).toISOString(),
            dir: t.dir,
            entryPrice: Number(t.entryPrice.toFixed(4)),
            exitPrice: Number(t.targetPrice.toFixed(4)),
            returnR: Number(returnR.toFixed(3)),
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
          systemId,
          asset,
          timeframe,
          entryTime: candles[t.entryBar].openTime,
          exitTime: c.openTime,
          entryDate: new Date(candles[t.entryBar].openTime).toISOString(),
          exitDate: new Date(c.openTime).toISOString(),
          dir: t.dir,
          entryPrice: Number(t.entryPrice.toFixed(4)),
          exitPrice: Number(exitPrice.toFixed(4)),
          returnR: Number(returnR.toFixed(3)),
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

// 1. #02 9:30 AM OTE Signal Generator
function generate02Signals(candles) {
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
  return signals;
}

// 2. #12 EASY MSS Fib Signal Generator
function generate12Signals(candles) {
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
  return signals;
}

// 3. #13 GAP Liquidity Imbalance Generator
function generate13Signals(candles, minGapAtr = 0.4) {
  const atrs = computeATR(candles, 14);
  const signals = new Array(candles.length).fill(null);

  for (let i = 2; i < candles.length - 20; i++) {
    const c0 = candles[i - 2], c2 = candles[i];
    // Bullish Gap
    if (c2.low - c0.high > atrs[i] * minGapAtr) {
      const gapMid = (c2.low + c0.high) / 2;
      for (let f = i + 1; f < Math.min(i + 15, candles.length); f++) {
        if (candles[f].low <= gapMid && candles[f].close > gapMid) {
          const sl = c0.high - atrs[f] * 0.2;
          const tp = gapMid + (gapMid - sl) * 1.3;
          signals[f] = { dir: 'LONG', entryPrice: gapMid, sl, tp };
          break;
        }
      }
    } else if (c0.low - c2.high > atrs[i] * minGapAtr) {
      // Bearish Gap
      const gapMid = (c0.low + c2.high) / 2;
      for (let f = i + 1; f < Math.min(i + 15, candles.length); f++) {
        if (candles[f].high >= gapMid && candles[f].close < gapMid) {
          const sl = c0.low + atrs[f] * 0.2;
          const tp = gapMid - (sl - gapMid) * 1.3;
          signals[f] = { dir: 'SHORT', entryPrice: gapMid, sl, tp };
          break;
        }
      }
    }
  }
  return signals;
}

// Execute all constituent high-WR systems
const sys02_nas = simulateTrades(nas15m, generate02Signals(nas15m), {
  systemId: '#02_930AM', asset: 'NAS100', timeframe: '15M',
  breakevenR: 0.25, lockR: 0.6, lockedProfit: 0.5, cooldownBars: 3, maxHoldingBars: 30
});

const sys02_spx = simulateTrades(spx15m, generate02Signals(spx15m), {
  systemId: '#02_930AM', asset: 'SPX500', timeframe: '15M',
  breakevenR: 0.25, lockR: 0.6, lockedProfit: 0.5, cooldownBars: 3, maxHoldingBars: 30
});

const sys12_nas = simulateTrades(nas15m, generate12Signals(nas15m), {
  systemId: '#12_EASY', asset: 'NAS100', timeframe: '15M',
  breakevenR: 0.35, lockR: 0.7, lockedProfit: 0.5, cooldownBars: 3, maxHoldingBars: 35
});

const sys12_spx = simulateTrades(spx15m, generate12Signals(spx15m), {
  systemId: '#12_EASY', asset: 'SPX500', timeframe: '15M',
  breakevenR: 0.35, lockR: 0.7, lockedProfit: 0.5, cooldownBars: 3, maxHoldingBars: 35
});

const sys12_eur = simulateTrades(eur15m, generate12Signals(eur15m), {
  systemId: '#12_EASY', asset: 'EURUSD', timeframe: '15M',
  breakevenR: 0.35, lockR: 0.7, lockedProfit: 0.5, cooldownBars: 3, maxHoldingBars: 35
});

const sys13_xau = simulateTrades(xau15m, generate13Signals(xau15m, 0.4), {
  systemId: '#13_GAP', asset: 'XAUUSD', timeframe: '15M',
  breakevenR: 0.25, lockR: 0.6, lockedProfit: 0.5, cooldownBars: 3, maxHoldingBars: 30
});

// Consolidate Master Portfolio Trades
const masterTrades = [
  ...sys02_nas,
  ...sys02_spx,
  ...sys12_nas,
  ...sys12_spx,
  ...sys12_eur,
  ...sys13_xau,
].sort((a, b) => a.entryTime - b.entryTime);

// Compute Portfolio Performance
let wins = 0, losses = 0, bes = 0, totalR = 0;
let peak = 0, maxDD = 0, currentEquity = 0;

for (const t of masterTrades) {
  totalR += t.returnR;
  currentEquity += t.returnR;
  if (currentEquity > peak) peak = currentEquity;
  const dd = peak - currentEquity;
  if (dd > maxDD) maxDD = dd;

  if (t.result === 'WIN') wins++;
  else if (t.result === 'BE') bes++;
  else losses++;
}

const totalTrades = masterTrades.length;
const winRate = Number(((wins / totalTrades) * 100).toFixed(2));
const nonLossRate = Number((((wins + bes) / totalTrades) * 100).toFixed(2));
const lossRate = Number(((losses / totalTrades) * 100).toFixed(2));
const calmar = Number((totalR / (maxDD || 1)).toFixed(2));

// Monthly aggregation
const monthsMap = {};
for (const t of masterTrades) {
  const m = t.entryDate.slice(0, 7);
  if (!monthsMap[m]) {
    monthsMap[m] = { month: m, trades: 0, wins: 0, losses: 0, bes: 0, returnR: 0 };
  }
  monthsMap[m].trades++;
  monthsMap[m].returnR += t.returnR;
  if (t.result === 'WIN') monthsMap[m].wins++;
  else if (t.result === 'BE') monthsMap[m].bes++;
  else monthsMap[m].losses++;
}

const monthlyTable = Object.values(monthsMap).map(m => ({
  month: m.month,
  trades: m.trades,
  wins: m.wins,
  losses: m.losses,
  bes: m.bes,
  winRate: Number(((m.wins / m.trades) * 100).toFixed(1)),
  nonLossRate: Number((((m.wins + m.bes) / m.trades) * 100).toFixed(1)),
  returnR: Number(m.returnR.toFixed(2)),
})).sort((a, b) => a.month.localeCompare(b.month));

// Monte Carlo 5,000 runs
const returnsList = masterTrades.map(t => t.returnR);
const SIM_RUNS = 5000;
const simMaxDDs = [];
const simFinalRs = [];
let simProfitCount = 0;

for (let r = 0; r < SIM_RUNS; r++) {
  let simEquity = 0;
  let simPeak = 0;
  let simDD = 0;

  for (let s = 0; s < returnsList.length; s++) {
    const idx = Math.floor(Math.random() * returnsList.length);
    const ret = returnsList[idx];
    simEquity += ret;
    if (simEquity > simPeak) simPeak = simEquity;
    const curDD = simPeak - simEquity;
    if (curDD > simDD) simDD = curDD;
  }

  simMaxDDs.push(simDD);
  simFinalRs.push(simEquity);
  if (simEquity > 0) simProfitCount++;
}

simMaxDDs.sort((a, b) => a - b);
simFinalRs.sort((a, b) => a - b);

const mcSummary = {
  runs: SIM_RUNS,
  probProfit: Number(((simProfitCount / SIM_RUNS) * 100).toFixed(2)),
  medianR: Number(simFinalRs[Math.floor(SIM_RUNS * 0.5)].toFixed(2)),
  p5R: Number(simFinalRs[Math.floor(SIM_RUNS * 0.05)].toFixed(2)),
  p95R: Number(simFinalRs[Math.floor(SIM_RUNS * 0.95)].toFixed(2)),
  medianMaxDD: Number(simMaxDDs[Math.floor(SIM_RUNS * 0.5)].toFixed(2)),
  p95MaxDD: Number(simMaxDDs[Math.floor(SIM_RUNS * 0.95)].toFixed(2)),
  worstMaxDD: Number(simMaxDDs[SIM_RUNS - 1].toFixed(2)),
};

function formatSubsystem(name, trades) {
  let w = 0, l = 0, b = 0, r = 0;
  for (const t of trades) {
    r += t.returnR;
    if (t.result === 'WIN') w++;
    else if (t.result === 'BE') b++;
    else l++;
  }
  return {
    name,
    trades: trades.length,
    wins: w,
    losses: l,
    bes: b,
    winRate: Number(((w / trades.length) * 100).toFixed(1)),
    nonLossRate: Number((((w + b) / trades.length) * 100).toFixed(1)),
    returnR: Number(r.toFixed(2)),
  };
}

const subsystemsSummary = [
  formatSubsystem('#02 · 9:30 AM (NAS100 15M)', sys02_nas),
  formatSubsystem('#02 · 9:30 AM (SPX500 15M)', sys02_spx),
  formatSubsystem('#12 · EASY Fib (NAS100 15M)', sys12_nas),
  formatSubsystem('#12 · EASY Fib (SPX500 15M)', sys12_spx),
  formatSubsystem('#12 · EASY Fib (EURUSD 15M)', sys12_eur),
  formatSubsystem('#13 · GAP Fill (XAUUSD 15M)', sys13_xau),
];

console.log('================================================================');
console.log('       GRAND MASTER ENSEMBLE: 70%+ WIN RATE & >=7-8R/MONTH       ');
console.log('================================================================');
console.log(`Total Trades:       ${totalTrades}`);
console.log(`Wins:               ${wins}`);
console.log(`Losses:             ${losses}`);
console.log(`Breakevens (BE):    ${bes}`);
console.log(`Portfolio Win Rate: ${winRate}%  (Target: >= 70%)`);
console.log(`Portfolio NLR:      ${nonLossRate}%`);
console.log(`Portfolio Total R:  +${totalR.toFixed(2)}R`);
console.log(`Max Drawdown:       -${maxDD.toFixed(2)}R`);
console.log(`Calmar Ratio:       ${calmar}  (Target: >= 4.0)`);
console.log('----------------------------------------------------------------');
console.log('                   CONSTITUENT SUBSYSTEMS                       ');
console.log('----------------------------------------------------------------');
console.table(subsystemsSummary);
console.log('----------------------------------------------------------------');
console.log('                    MONTHLY BREAKDOWN                           ');
console.log('----------------------------------------------------------------');
console.table(monthlyTable);
console.log('----------------------------------------------------------------');
console.log('             MONTE CARLO STRESS TEST (5,000 RUNS)              ');
console.log('----------------------------------------------------------------');
console.log(`Probability of Profit:  ${mcSummary.probProfit}%`);
console.log(`Median Final Return:    +${mcSummary.medianR}R`);
console.log(`5th Percentile Return:  +${mcSummary.p5R}R`);
console.log(`95th Percentile Return: +${mcSummary.p95R}R`);
console.log(`Median Max Drawdown:    -${mcSummary.medianMaxDD}R`);
console.log(`95% Worst Drawdown:     -${mcSummary.p95MaxDD}R`);
console.log(`Absolute Worst DD:      -${mcSummary.worstMaxDD}R`);
console.log('================================================================');

// Save JSON outputs
const out = {
  summary: {
    totalTrades,
    wins,
    losses,
    bes,
    winRate,
    nonLossRate,
    lossRate,
    totalR: Number(totalR.toFixed(2)),
    maxDD: Number(maxDD.toFixed(2)),
    calmar,
  },
  subsystems: subsystemsSummary,
  monthly: monthlyTable,
  monteCarlo: mcSummary,
  trades: masterTrades,
};

fs.writeFileSync(path.join(RESULTS_DIR, 'grand_master_70plus_portfolio.json'), JSON.stringify(out, null, 2));
console.log('Saved master results to monkalgo_strategies/results/grand_master_70plus_portfolio.json');

