import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('monkalgo_strategies/data');
const RESULTS_DIR = path.resolve('monkalgo_strategies/results');

function loadCandles(filename) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8'));
}

const dataNAS100_15m = loadCandles('nas100_15m.json');
const dataNAS100_5m = loadCandles('nas100_5m.json');

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

function simulateTradesWithDates(candles, signals, options = {}) {
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
            entryTime: candles[t.entryBar].openTime,
            exitTime: c.openTime,
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
            entryTime: candles[t.entryBar].openTime,
            exitTime: c.openTime,
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
            entryTime: candles[t.entryBar].openTime,
            exitTime: c.openTime,
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
            entryTime: candles[t.entryBar].openTime,
            exitTime: c.openTime,
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
          entryTime: candles[t.entryBar].openTime,
          exitTime: c.openTime,
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

function groupTradesByMonth(trades) {
  const months = {};
  for (const t of trades) {
    const d = new Date(t.entryTime);
    const m = d.toISOString().slice(0, 7);
    if (!months[m]) {
      months[m] = {
        month: m,
        trades: 0,
        wins: 0,
        losses: 0,
        bes: 0,
        returnR: 0,
      };
    }
    months[m].trades++;
    months[m].returnR += t.returnR;
    if (t.result === 'WIN') months[m].wins++;
    else if (t.result === 'BE') months[m].bes++;
    else months[m].losses++;
  }

  return Object.values(months).map(m => ({
    month: m.month,
    trades: m.trades,
    wins: m.wins,
    losses: m.losses,
    bes: m.bes,
    winRate: Number(((m.wins / m.trades) * 100).toFixed(1)),
    nonLossRate: Number((((m.wins + m.bes) / m.trades) * 100).toFixed(1)),
    returnR: Number(m.returnR.toFixed(2)),
  })).sort((a, b) => a.month.localeCompare(b.month));
}

// 1. System 02: 9:30 A.M
let trades02 = [];
{
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

  trades02 = simulateTradesWithDates(candles, signals, {
    breakevenR: 0.25, lockR: 0.6, lockedProfit: 0.5, cooldownBars: 3, maxHoldingBars: 30
  });
}

// 2. System 08: PUSH
let trades08 = [];
{
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

  trades08 = simulateTradesWithDates(candles, signals, {
    breakevenR: 0.25, lockR: 0.6, lockedProfit: 0.5, cooldownBars: 10, maxHoldingBars: 30
  });
}

// 3. System 12: EASY
let trades12 = [];
{
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

  trades12 = simulateTradesWithDates(candles, signals, {
    breakevenR: 0.35, lockR: 0.7, lockedProfit: 0.5, cooldownBars: 3, maxHoldingBars: 35
  });
}

const monthly02 = groupTradesByMonth(trades02);
const monthly08 = groupTradesByMonth(trades08);
const monthly12 = groupTradesByMonth(trades12);

// Combined Portfolio
const allTrades = [...trades02, ...trades08, ...trades12];
const monthlyCombined = groupTradesByMonth(allTrades);

console.log('=== #02 9:30 A.M Monthly Performance ===');
console.table(monthly02);

console.log('=== #08 PUSH Monthly Performance ===');
console.table(monthly08);

console.log('=== #12 EASY Monthly Performance ===');
console.table(monthly12);

console.log('=== COMBINED PORTFOLIO (Win Rate >= 65%) Monthly Performance ===');
console.table(monthlyCombined);

// Save to JSON
fs.writeFileSync(
  path.join(RESULTS_DIR, 'winrate_65_plus_monthly.json'),
  JSON.stringify({
    systems: [
      { name: '9:30 A.M', index: 2, totalTrades: trades02.length, monthly: monthly02 },
      { name: 'PUSH', index: 8, totalTrades: trades08.length, monthly: monthly08 },
      { name: 'EASY', index: 12, totalTrades: trades12.length, monthly: monthly12 },
    ],
    combinedPortfolio: monthlyCombined
  }, null, 2),
  'utf8'
);

