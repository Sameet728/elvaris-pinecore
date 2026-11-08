import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('monkalgo_strategies/data');

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
}

const nas15m = load('nas100_15m.json');
const spx15m = load('spx500_15m.json');
const xau15m = load('xauusd_15m.json');
const eur15m = load('eurusd_15m.json');

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

// Test #15 SWEEP & SHIFT high-conviction filter
console.log('--- Testing High-Conviction SWEEP & SHIFT on NAS100 15M ---');
{
  const candles = nas15m;
  const atrs = computeATR(candles, 14);
  const emas = computeEMA(candles, 50);
  const phs = findPivotHighs(candles, 5, 5);
  const pls = findPivotLows(candles, 5, 5);

  for (const sweepMult of [0.1, 0.2, 0.3]) {
    for (const rr of [1.0, 1.2, 1.4]) {
      let trades = 0, wins = 0, losses = 0, bes = 0, totalR = 0;
      let lastPl = null, lastPh = null;
      let lastExit = -999;

      for (let i = 10; i < candles.length - 20; i++) {
        if (pls[i - 5]) lastPl = pls[i - 5];
        if (phs[i - 5]) lastPh = phs[i - 5];

        const c = candles[i];
        let dir = 0, sl = 0, tp = 0;

        // High conviction: sweep must exceed swing by at least sweepMult * ATR and close with trend alignment
        if (lastPl && c.low < lastPl - atrs[i] * sweepMult && c.close > lastPl && c.close > emas[i] && i > lastExit + 4) {
          dir = 1;
          sl = c.low - atrs[i] * 0.2;
          tp = c.close + (c.close - sl) * rr;
          lastPl = null;
        } else if (lastPh && c.high > lastPh + atrs[i] * sweepMult && c.close < lastPh && c.close < emas[i] && i > lastExit + 4) {
          dir = -1;
          sl = c.high + atrs[i] * 0.2;
          tp = c.close - (sl - c.close) * rr;
          lastPh = null;
        }

        if (dir !== 0) {
          const entry = c.close;
          const risk = Math.abs(entry - sl);
          let curSl = sl, be = false, locked = false;

          for (let f = i + 1; f < Math.min(i + 35, candles.length); f++) {
            if (dir === 1) {
              const gainR = (candles[f].high - entry) / risk;
              if (gainR >= 0.6 && !locked) { curSl = entry + risk * 0.5; locked = true; be = true; }
              else if (gainR >= 0.25 && !be) { curSl = entry + risk * 0.05; be = true; }

              if (candles[f].low <= curSl) {
                trades++;
                if (be) { bes++; totalR += (locked ? 0.5 : 0.05); } else { losses++; totalR -= 1.0; }
                lastExit = f; break;
              }
              if (candles[f].high >= tp) {
                trades++; wins++; totalR += rr; lastExit = f; break;
              }
            } else {
              const gainR = (entry - candles[f].low) / risk;
              if (gainR >= 0.6 && !locked) { curSl = entry - risk * 0.5; locked = true; be = true; }
              else if (gainR >= 0.25 && !be) { curSl = entry - risk * 0.05; be = true; }

              if (candles[f].high >= curSl) {
                trades++;
                if (be) { bes++; totalR += (locked ? 0.5 : 0.05); } else { losses++; totalR -= 1.0; }
                lastExit = f; break;
              }
              if (candles[f].low <= tp) {
                trades++; wins++; totalR += rr; lastExit = f; break;
              }
            }
          }
        }
      }
      const wr = (wins + (totalR > 0 ? bes : 0)) / trades;
      console.log(`sweepMult: ${sweepMult} | rr: ${rr} -> Trades: ${trades}, Wins: ${wins}, Losses: ${losses}, BEs: ${bes}, WR: ${((wins/trades)*100).toFixed(1)}%, NonLoss: ${(((wins+bes)/trades)*100).toFixed(1)}%, Return: ${totalR.toFixed(2)}R`);
    }
  }
}
