import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('monkalgo_strategies/data');
const nas = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'nas100_15m.json'), 'utf8'));
const xau = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_15m.json'), 'utf8'));
const spx = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'spx500_15m.json'), 'utf8'));

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
  for (let i = period; i < candles.length; i++) emas[i] = candles[i].close * k + emas[i - 1] * (1 - k);
  return emas;
}

function testPureBracket(name, candles, tpR = 1.0, minGap = 0.4) {
  const atrs = computeATR(candles, 14);
  const ema50 = computeEMA(candles, 50);

  let trades = 0, wins = 0, losses = 0, totalR = 0;
  let inTrade = false, active = null, lastExit = -999;
  let peak = 0, maxDD = 0, currentEq = 0;

  let bullMid = null, bullSl = null, bullExp = 0;
  let bearMid = null, bearSl = null, bearExp = 0;

  for (let i = 2; i < candles.length; i++) {
    const c = candles[i];
    const c2 = candles[i - 2];

    if (inTrade) {
      const t = active;
      let exitR = null;

      if (t.dir === 1) { // LONG
        const isGreen = c.close >= c.open;
        if (isGreen) {
          if (c.low <= t.sl) exitR = -1.0;
          else if (c.high >= t.tp) exitR = tpR;
        } else {
          if (c.high >= t.tp) exitR = tpR;
          else if (c.low <= t.sl) exitR = -1.0;
        }
      } else { // SHORT
        const isRed = c.close <= c.open;
        if (isRed) {
          if (c.high >= t.sl) exitR = -1.0;
          else if (c.low <= t.tp) exitR = tpR;
        } else {
          if (c.low <= t.tp) exitR = tpR;
          else if (c.high >= t.sl) exitR = -1.0;
        }
      }

      if (exitR === null && (i - t.entryBar >= 35)) {
        const r = t.dir === 1 ? (c.close - t.entry) / t.risk : (t.entry - c.close) / t.risk;
        exitR = r;
      }

      if (exitR !== null) {
        trades++;
        totalR += exitR;
        currentEq += exitR;
        if (currentEq > peak) peak = currentEq;
        if (peak - currentEq > maxDD) maxDD = peak - currentEq;
        if (exitR > 0) wins++; else losses++;
        inTrade = false;
        active = null;
        lastExit = i;
        continue;
      }
    }

    if (c.low - c2.high > atrs[i] * minGap) {
      bullMid = (c.low + c2.high) / 2;
      bullSl = c2.high - atrs[i] * 0.2;
      bullExp = i + 15;
    }
    if (c2.low - c.high > atrs[i] * minGap) {
      bearMid = (c2.low + c.high) / 2;
      bearSl = c2.low + atrs[i] * 0.2;
      bearExp = i + 15;
    }

    if (!inTrade && i > lastExit + 2) {
      if (bullMid && i <= bullExp && c.low <= bullMid && c.close > bullMid && c.close > ema50[i]) {
        const entry = c.close;
        const sl = bullSl;
        const risk = entry - sl;
        if (risk > 0) {
          inTrade = true;
          active = { dir: 1, entry, sl, tp: entry + risk * tpR, risk, entryBar: i };
          bullMid = null;
        }
      } else if (bearMid && i <= bearExp && c.high >= bearMid && c.close < bearMid && c.close < ema50[i]) {
        const entry = c.close;
        const sl = bearSl;
        const risk = sl - entry;
        if (risk > 0) {
          inTrade = true;
          active = { dir: -1, entry, sl, tp: entry - risk * tpR, risk, entryBar: i };
          bearMid = null;
        }
      }
    }
  }

  const wr = ((wins / trades) * 100).toFixed(1);
  const pf = (wins * tpR / (losses || 1)).toFixed(2);
  console.log(name.padEnd(8), `(TP: ${tpR}R, MinGap: ${minGap}) -> Trades: ${trades}, Wins: ${wins}, Losses: ${losses}, WR: ${wr}%, PF: ${pf}, MaxDD: -${maxDD.toFixed(1)}R, Net R: +${totalR.toFixed(1)}R`);
}

for (const tp of [0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2]) {
  testPureBracket('NAS100', nas, tp, 0.4);
}
console.log('---');
for (const tp of [0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2]) {
  testPureBracket('XAUUSD', xau, tp, 0.4);
}

