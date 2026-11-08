import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('monkalgo_strategies/data');

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
}

const nas5m = load('nas100_5m.json');
const spx5m = load('spx500_5m.json');
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

// 1. Check #05 WICK on SPX500
console.log('=== #05 WICK Monthly Breakdown ===');
{
  const candles = spx5m;
  const atrs = computeATR(candles, 14);
  const emas = computeEMA(candles, 50);
  const untapped = [];
  const monthly = {};

  for (let i = 50; i < candles.length - 20; i++) {
    const c = candles[i];
    const m = new Date(c.openTime).toISOString().slice(0, 7);
    if (!monthly[m]) monthly[m] = { trades: 0, wins: 0, losses: 0, bes: 0, r: 0 };

    for (let j = 0; j < untapped.length; j++) {
      const lvl = untapped[j];
      if (i > lvl.bar && c.low <= lvl.price && c.high >= lvl.price) {
        const trendMatch = lvl.dir === 1 ? c.close > emas[i] : c.close < emas[i];
        if (trendMatch) {
          const entry = lvl.price;
          const slDist = atrs[i] * 1.0;
          const tpDist = slDist * 1.5;
          let sl = lvl.dir === 1 ? entry - slDist : entry + slDist;
          const tp = lvl.dir === 1 ? entry + tpDist : entry - tpDist;

          let be = false, locked = false;
          for (let f = i + 1; f < Math.min(i + 25, candles.length); f++) {
            if (lvl.dir === 1) {
              const gainR = (candles[f].high - entry) / slDist;
              if (gainR >= 0.8 && !locked) { sl = entry + slDist * 0.6; locked = true; be = true; }
              else if (gainR >= 0.4 && !be) { sl = entry + slDist * 0.05; be = true; }

              if (candles[f].low <= sl) {
                monthly[m].trades++;
                if (be) { monthly[m].bes++; monthly[m].r += (locked ? 0.6 : 0.05); }
                else { monthly[m].losses++; monthly[m].r -= 1.0; }
                break;
              }
              if (candles[f].high >= tp) {
                monthly[m].trades++; monthly[m].wins++; monthly[m].r += 1.5; break;
              }
            } else {
              const gainR = (entry - candles[f].low) / slDist;
              if (gainR >= 0.8 && !locked) { sl = entry - slDist * 0.6; locked = true; be = true; }
              else if (gainR >= 0.4 && !be) { sl = entry - slDist * 0.05; be = true; }

              if (candles[f].high >= sl) {
                monthly[m].trades++;
                if (be) { monthly[m].bes++; monthly[m].r += (locked ? 0.6 : 0.05); }
                else { monthly[m].losses++; monthly[m].r -= 1.0; }
                break;
              }
              if (candles[f].low <= tp) {
                monthly[m].trades++; monthly[m].wins++; monthly[m].r += 1.5; break;
              }
            }
          }
          untapped.splice(j, 1);
          break;
        }
      }
    }

    const body = Math.abs(c.close - c.open);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const upperWick = c.high - Math.max(c.open, c.close);

    if (c.close > c.open && lowerWick <= 0.05 * body) {
      untapped.push({ price: c.low, dir: 1, bar: i });
    } else if (c.close < c.open && upperWick <= 0.05 * body) {
      untapped.push({ price: c.high, dir: -1, bar: i });
    }
    if (untapped.length > 4) untapped.shift();
  }
  console.table(monthly);
}

// 2. Check #11 PROFILE on NAS100 5M
console.log('=== #11 PROFILE Monthly Breakdown ===');
{
  const candles = nas5m;
  const atrs = computeATR(candles, 14);
  const emas = computeEMA(candles, 50);
  const win = 18;
  const monthly = {};

  for (let i = win; i < candles.length; i++) {
    const m = new Date(candles[i].openTime).toISOString().slice(0, 7);
    if (!monthly[m]) monthly[m] = { trades: 0, wins: 0, losses: 0, bes: 0, r: 0 };

    const slice = candles.slice(i - win, i);
    const poc = slice.reduce((acc, c) => acc + (c.high + c.low + c.close) / 3, 0) / win;
    const c = candles[i];
    const prev = candles[i - 1];

    let dir = 0, sl = 0, tp = 0;
    if (prev.low > poc && c.low <= poc && c.close > poc && c.close > emas[i]) {
      dir = 1; sl = c.low - atrs[i] * 0.25; tp = c.close + (c.close - sl) * 1.3;
    } else if (prev.high < poc && c.high >= poc && c.close < poc && c.close < emas[i]) {
      dir = -1; sl = c.high + atrs[i] * 0.25; tp = c.close - (sl - c.close) * 1.3;
    }

    if (dir !== 0) {
      const entry = c.close;
      const risk = Math.abs(entry - sl);
      let curSl = sl, be = false, locked = false;

      for (let f = i + 1; f < Math.min(i + 30, candles.length); f++) {
        if (dir === 1) {
          const gainR = (candles[f].high - entry) / risk;
          if (gainR >= 0.55 && !locked) { curSl = entry + risk * 0.45; locked = true; be = true; }
          else if (gainR >= 0.25 && !be) { curSl = entry + risk * 0.05; be = true; }

          if (candles[f].low <= curSl) {
            monthly[m].trades++;
            if (be) { monthly[m].bes++; monthly[m].r += (locked ? 0.45 : 0.05); }
            else { monthly[m].losses++; monthly[m].r -= 1.0; }
            break;
          }
          if (candles[f].high >= tp) {
            monthly[m].trades++; monthly[m].wins++; monthly[m].r += 1.3; break;
          }
        } else {
          const gainR = (entry - candles[f].low) / risk;
          if (gainR >= 0.55 && !locked) { curSl = entry - risk * 0.45; locked = true; be = true; }
          else if (gainR >= 0.25 && !be) { curSl = entry - risk * 0.05; be = true; }

          if (candles[f].high >= curSl) {
            monthly[m].trades++;
            if (be) { monthly[m].bes++; monthly[m].r += (locked ? 0.45 : 0.05); }
            else { monthly[m].losses++; monthly[m].r -= 1.0; }
            break;
          }
          if (candles[f].low <= tp) {
            monthly[m].trades++; monthly[m].wins++; monthly[m].r += 1.3; break;
          }
        }
      }
      i += 2;
    }
  }
  console.table(monthly);
}

