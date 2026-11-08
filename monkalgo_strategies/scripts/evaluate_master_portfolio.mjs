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
const nas5m = loadCandles('nas100_5m.json');

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
            systemId,
            asset,
            timeframe,
            entryTime: candles[t.entryBar].openTime,
            exitTime: c.openTime,
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
            systemId,
            asset,
            timeframe,
            entryTime: candles[t.entryBar].openTime,
            exitTime: c.openTime,
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
          systemId,
          asset,
          timeframe,
          entryTime: candles[t.entryBar].openTime,
          exitTime: c.openTime,
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

function generate08Signals(candles) {
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
  return signals;
}

// Generate Subsystems
const trades02_nas = simulateTrades(nas15m, generate02Signals(nas15m), { systemId: '#02_930AM', asset: 'NAS100', timeframe: '15M', breakevenR: 0.25, lockR: 0.6, lockedProfit: 0.5, cooldownBars: 3, maxHoldingBars: 30 });
const trades02_spx = simulateTrades(spx15m, generate02Signals(spx15m), { systemId: '#02_930AM', asset: 'SPX500', timeframe: '15M', breakevenR: 0.25, lockR: 0.6, lockedProfit: 0.5, cooldownBars: 3, maxHoldingBars: 30 });
const trades12_nas = simulateTrades(nas15m, generate12Signals(nas15m), { systemId: '#12_EASY', asset: 'NAS100', timeframe: '15M', breakevenR: 0.35, lockR: 0.7, lockedProfit: 0.5, cooldownBars: 3, maxHoldingBars: 35 });
const trades12_spx = simulateTrades(spx15m, generate12Signals(spx15m), { systemId: '#12_EASY', asset: 'SPX500', timeframe: '15M', breakevenR: 0.35, lockR: 0.7, lockedProfit: 0.5, cooldownBars: 3, maxHoldingBars: 35 });
const trades12_xau = simulateTrades(xau15m, generate12Signals(xau15m), { systemId: '#12_EASY', asset: 'XAUUSD', timeframe: '15M', breakevenR: 0.35, lockR: 0.7, lockedProfit: 0.5, cooldownBars: 3, maxHoldingBars: 35 });
const trades12_eur = simulateTrades(eur15m, generate12Signals(eur15m), { systemId: '#12_EASY', asset: 'EURUSD', timeframe: '15M', breakevenR: 0.35, lockR: 0.7, lockedProfit: 0.5, cooldownBars: 3, maxHoldingBars: 35 });
const trades08_nas = simulateTrades(nas5m, generate08Signals(nas5m), { systemId: '#08_PUSH', asset: 'NAS100', timeframe: '5M', breakevenR: 0.25, lockR: 0.6, lockedProfit: 0.5, cooldownBars: 10, maxHoldingBars: 30 });

// Aggregate all trades chronologically
const masterTrades = [
  ...trades02_nas,
  ...trades02_spx,
  ...trades12_nas,
  ...trades12_spx,
  ...trades12_xau,
  ...trades12_eur,
  ...trades08_nas,
].sort((a, b) => a.entryTime - b.entryTime);

// Compute overall metrics
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
const calmar = maxDD > 0 ? Number((totalR / maxDD).toFixed(2)) : totalR;

// Monthly breakdown
const monthsMap = {};
for (const t of masterTrades) {
  const m = new Date(t.entryTime).toISOString().slice(0, 7);
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

// Monte Carlo Simulation (5,000 runs)
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

console.log('================================================================');
console.log('            MONKALGO 70%+ WIN RATE MASTER ENSEMBLE             ');
console.log('================================================================');
console.log(`Total Trades:       ${totalTrades}`);
console.log(`Wins:               ${wins}`);
console.log(`Losses:             ${losses}`);
console.log(`Breakevens (BE):    ${bes}`);
console.log(`Win Rate:           ${winRate}%  (Target: >= 70%)`);
console.log(`Non-Loss Rate:      ${nonLossRate}%`);
console.log(`Total Return:       ${totalR.toFixed(2)}R`);
console.log(`Max Drawdown:       -${maxDD.toFixed(2)}R`);
console.log(`Calmar Ratio:       ${calmar}  (Target: >= 4.0)`);
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
  monthly: monthlyTable,
  monteCarlo: mcSummary,
  subsystems: [
    { name: '#02_930AM_NAS100', trades: trades02_nas.length, returnR: Number(trades02_nas.reduce((a, t) => a + t.returnR, 0).toFixed(2)) },
    { name: '#02_930AM_SPX500', trades: trades02_spx.length, returnR: Number(trades02_spx.reduce((a, t) => a + t.returnR, 0).toFixed(2)) },
    { name: '#12_EASY_NAS100', trades: trades12_nas.length, returnR: Number(trades12_nas.reduce((a, t) => a + t.returnR, 0).toFixed(2)) },
    { name: '#12_EASY_SPX500', trades: trades12_spx.length, returnR: Number(trades12_spx.reduce((a, t) => a + t.returnR, 0).toFixed(2)) },
    { name: '#12_EASY_XAUUSD', trades: trades12_xau.length, returnR: Number(trades12_xau.reduce((a, t) => a + t.returnR, 0).toFixed(2)) },
    { name: '#12_EASY_EURUSD', trades: trades12_eur.length, returnR: Number(trades12_eur.reduce((a, t) => a + t.returnR, 0).toFixed(2)) },
    { name: '#08_PUSH_NAS100', trades: trades08_nas.length, returnR: Number(trades08_nas.reduce((a, t) => a + t.returnR, 0).toFixed(2)) },
  ],
  trades: masterTrades,
};

fs.writeFileSync(path.join(RESULTS_DIR, 'master_70plus_portfolio_results.json'), JSON.stringify(out, null, 2));
console.log('Saved results to monkalgo_strategies/results/master_70plus_portfolio_results.json');

