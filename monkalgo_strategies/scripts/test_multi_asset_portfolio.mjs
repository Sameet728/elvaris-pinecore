import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('monkalgo_strategies/data');

function loadCandles(filename) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8'));
}

const nas15m = loadCandles('nas100_15m.json');
const spx15m = loadCandles('spx500_15m.json');
const xau15m = loadCandles('xauusd_15m.json');
const eur15m = loadCandles('eurusd_15m.json');

const nas5m = loadCandles('nas100_5m.json');
const spx5m = loadCandles('spx500_5m.json');

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

function findPivotHighs(candles, left, right) {
  const phs = new Float64Array(candles.length);
  for (let i = left; i < candles.length - right; i++) {
    let isH = true;
    const h = candles[i].high;
    for (let j = i - left; j <= i + right; j++) {
      if (j !== i && candles[j].high >= h) { isH = false; break; }
    }
    if (isH) phs[i] = h;
  }
  return phs;
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
    label = 'SYS',
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
            label,
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
            label,
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
            label,
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
            label,
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
          label,
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

// Test #02 on SPX500 15M
const sig02_nas = generate02Signals(nas15m);
const sig02_spx = generate02Signals(spx15m);
const trades02_nas = simulateTrades(nas15m, sig02_nas, { label: '#02_NAS100', breakevenR: 0.25, lockR: 0.6, lockedProfit: 0.5, cooldownBars: 3, maxHoldingBars: 30 });
const trades02_spx = simulateTrades(spx15m, sig02_spx, { label: '#02_SPX500', breakevenR: 0.25, lockR: 0.6, lockedProfit: 0.5, cooldownBars: 3, maxHoldingBars: 30 });

// Test #12 on NAS100, SPX500, XAUUSD
const sig12_nas = generate12Signals(nas15m);
const sig12_spx = generate12Signals(spx15m);
const sig12_xau = generate12Signals(xau15m);
const trades12_nas = simulateTrades(nas15m, sig12_nas, { label: '#12_NAS100', breakevenR: 0.35, lockR: 0.7, lockedProfit: 0.5, cooldownBars: 3, maxHoldingBars: 35 });
const trades12_spx = simulateTrades(spx15m, sig12_spx, { label: '#12_SPX500', breakevenR: 0.35, lockR: 0.7, lockedProfit: 0.5, cooldownBars: 3, maxHoldingBars: 35 });
const trades12_xau = simulateTrades(xau15m, sig12_xau, { label: '#12_XAUUSD', breakevenR: 0.35, lockR: 0.7, lockedProfit: 0.5, cooldownBars: 3, maxHoldingBars: 35 });

// Test #08 on NAS100 5M and SPX500 5M
const sig08_nas = generate08Signals(nas5m);
const sig08_spx = generate08Signals(spx5m);
const trades08_nas = simulateTrades(nas5m, sig08_nas, { label: '#08_NAS100', breakevenR: 0.25, lockR: 0.6, lockedProfit: 0.5, cooldownBars: 10, maxHoldingBars: 30 });
const trades08_spx = simulateTrades(spx5m, sig08_spx, { label: '#08_SPX500', breakevenR: 0.25, lockR: 0.6, lockedProfit: 0.5, cooldownBars: 10, maxHoldingBars: 30 });

function printSummary(name, trades) {
  let wins = 0, losses = 0, bes = 0, r = 0;
  for (const t of trades) {
    r += t.returnR;
    if (t.result === 'WIN') wins++;
    else if (t.result === 'BE') bes++;
    else losses++;
  }
  const wr = trades.length ? ((wins / trades.length) * 100).toFixed(1) : 0;
  const nlr = trades.length ? (((wins + bes) / trades.length) * 100).toFixed(1) : 0;
  console.log(`${name.padEnd(20)} | Trades: ${String(trades.length).padStart(3)} | Wins: ${String(wins).padStart(3)} | Losses: ${String(losses).padStart(2)} | BEs: ${String(bes).padStart(2)} | WR: ${wr}% | NonLoss: ${nlr}% | Return: ${r.toFixed(2)}R`);
}

console.log('=== MULTI-ASSET SUBSYSTEM BENCHMARKS ===');
printSummary('#02 NAS100 15M', trades02_nas);
printSummary('#02 SPX500 15M', trades02_spx);
printSummary('#12 NAS100 15M', trades12_nas);
printSummary('#12 SPX500 15M', trades12_spx);
printSummary('#12 XAUUSD 15M', trades12_xau);
printSummary('#08 NAS100 5M', trades08_nas);
printSummary('#08 SPX500 5M', trades08_spx);

