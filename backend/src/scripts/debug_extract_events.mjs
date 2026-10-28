import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeATR } from './fast_evaluator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const c5 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_5m_tv.json'), 'utf8'));

function computeEMA(candles, period) {
  const ema = new Float64Array(candles.length);
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += candles[i].close;
  ema[period - 1] = sum / period;
  for (let i = period; i < candles.length; i++) {
    ema[i] = candles[i].close * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

const atr5 = computeATR(c5, 14);
const ema100_5 = computeEMA(c5, 100);

// Let's test extractEvents with console.log
const swMin = 3, swMaj = 6, minFvgAtr = 0.2, expireBars = 35;
const n = c5.length;
const bslLvls = [], bslSwept = [];
const sslLvls = [], sslSwept = [];
const bFvgTop = [], bFvgBot = [], bFvgBar = [];
const sFvgTop = [], sFvgBot = [], sFvgBar = [];

let lookLong = false, lookShort = false;
let setupBarL = 0, setupBarS = 0;
const events = [];

for (let i = 2; i < n; i++) {
  const c = c5[i];
  const prev2C = c5[i - 2];
  const timeMs = c.openTime || c.time;

  if (i >= swMin * 2) {
    const pIdx = i - swMin;
    let isH1 = true, isL1 = true;
    const pH = c5[pIdx].high, pL = c5[pIdx].low;
    for (let j = i - swMin * 2; j <= i; j++) {
      if (j !== pIdx) {
        if (c5[j].high > pH) isH1 = false;
        if (c5[j].low < pL) isL1 = false;
      }
    }
    if (isH1) { bslLvls.push(pH); bslSwept.push(false); if (bslLvls.length > 15) { bslLvls.shift(); bslSwept.shift(); } }
    if (isL1) { sslLvls.push(pL); sslSwept.push(false); if (sslLvls.length > 15) { sslLvls.shift(); sslSwept.shift(); } }
  }

  if (i >= swMaj * 2) {
    const pIdx = i - swMaj;
    let isH2 = true, isL2 = true;
    const pH = c5[pIdx].high, pL = c5[pIdx].low;
    for (let j = i - swMaj * 2; j <= i; j++) {
      if (j !== pIdx) {
        if (c5[j].high > pH) isH2 = false;
        if (c5[j].low < pL) isL2 = false;
      }
    }
    if (isH2) { bslLvls.push(pH); bslSwept.push(false); if (bslLvls.length > 15) { bslLvls.shift(); bslSwept.shift(); } }
    if (isL2) { sslLvls.push(pL); sslSwept.push(false); if (sslLvls.length > 15) { sslLvls.shift(); sslSwept.shift(); } }
  }

  if (c.low > prev2C.high) {
    const sz = c.low - prev2C.high;
    if (sz >= atr5[i] * minFvgAtr) {
      bFvgTop.push(c.low); bFvgBot.push(prev2C.high); bFvgBar.push(i);
      if (bFvgTop.length > 30) { bFvgTop.shift(); bFvgBot.shift(); bFvgBar.shift(); }
    }
  }
  if (c.high < prev2C.low) {
    const sz = prev2C.low - c.high;
    if (sz >= atr5[i] * minFvgAtr) {
      sFvgTop.push(prev2C.low); sFvgBot.push(c.high); sFvgBar.push(i);
      if (sFvgTop.length > 30) { sFvgTop.shift(); sFvgBot.shift(); sFvgBar.shift(); }
    }
  }

  for (let k = 0; k < sslLvls.length; k++) {
    if (!sslSwept[k] && c.low < sslLvls[k] && c.close > sslLvls[k]) {
      sslSwept[k] = true;
      if (c.close > ema100_5[i]) {
        lookLong = true; lookShort = false; setupBarL = i;
      }
    }
  }
  for (let k = 0; k < bslLvls.length; k++) {
    if (!bslSwept[k] && c.high > bslLvls[k] && c.close < bslLvls[k]) {
      bslSwept[k] = true;
      if (c.close < ema100_5[i]) {
        lookShort = true; lookLong = false; setupBarS = i;
      }
    }
  }

  if (lookLong && (i - setupBarL) > expireBars) lookLong = false;
  if (lookShort && (i - setupBarS) > expireBars) lookShort = false;

  if (lookLong) {
    for (let f = bFvgBar.length - 1; f >= 0; f--) {
      if (bFvgBar[f] > setupBarL) {
        const fTop = bFvgTop[f], fBot = bFvgBot[f];
        if (c.low <= fTop && c.close > fBot) {
          events.push({ bar: i, dir: 1, entryP: c.close, fBot });
          lookLong = false; break;
        }
      }
    }
  }

  if (lookShort) {
    for (let f = sFvgBar.length - 1; f >= 0; f--) {
      if (sFvgBar[f] > setupBarS) {
        const fTop = sFvgTop[f], fBot = sFvgBot[f];
        if (c.high >= fBot && c.close < fTop) {
          events.push({ bar: i, dir: -1, entryP: c.close, fTop });
          lookShort = false; break;
        }
      }
    }
  }
}

console.log(`Events extracted: ${events.length}`);
