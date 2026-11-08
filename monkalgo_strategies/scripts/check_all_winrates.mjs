import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('monkalgo_strategies/data');

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

const dataNAS100_15m = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'nas100_15m.json'), 'utf8'));
const dataNAS100_5m = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'nas100_5m.json'), 'utf8'));

// Test #01 SWING with pure win rate
{
  const candles = dataNAS100_15m;
  const atrs = computeATR(candles, 14);
  const emas = computeEMA(candles, 200);
  const left = 4;
  const phs = new Float64Array(candles.length);
  const pls = new Float64Array(candles.length);
  for (let i = left; i < candles.length - left; i++) {
    let isH = true, isL = true;
    for (let j = i - left; j <= i + left; j++) {
      if (j !== i && candles[j].high >= candles[i].high) isH = false;
      if (j !== i && candles[j].low <= candles[i].low) isL = false;
    }
    if (isH) phs[i] = candles[i].high;
    if (isL) pls[i] = candles[i].low;
  }

  for (const rr of [0.8, 1.0, 1.25, 1.5]) {
    let lastPh = 0, lastPl = 0;
    let activeFib = 0, activeOriginLow = 0, activeDir = 0, activeExpire = 0;
    let trades = 0, wins = 0, losses = 0, totalR = 0;

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
        const tp = entry + risk * rr;
        trades++;
        for (let j = i + 1; j < Math.min(i + 35, candles.length); j++) {
          if (candles[j].low <= sl) { losses++; totalR -= 1.0; break; }
          if (candles[j].high >= tp) { wins++; totalR += rr; break; }
        }
        activeDir = 0;
        i += 6;
      }
    }
    console.log(`SWING RR ${rr} -> Trades: ${trades}, Wins: ${wins}, Losses: ${losses}, WR: ${((wins/trades)*100).toFixed(1)}%, Return: ${totalR.toFixed(2)}R`);
  }
}

