import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeATR } from './fast_evaluator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const c5 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_5m_tv.json'), 'utf8'));
const atr5 = computeATR(c5, 14);

// Let's inspect extractSetups from fast_80_100_miner
const n = c5.length;
const swMin = 4, swMaj = 7;
const bslLvls = [], bslSwept = [];
const sslLvls = [], sslSwept = [];
const bFvgTop = [], bFvgBot = [], bFvgBar = [];
const sFvgTop = [], sFvgBot = [], sFvgBar = [];

let lookLong = false, lookShort = false;
let setupBarL = 0, setupBarS = 0;
let sweepLow = 0, sweepHigh = 0;
const setups = [];

for (let i = 2; i < n; i++) {
  const c = c5[i];
  const prev2C = c5[i - 2];

  // Minor Pivots
  if (i >= swMin * 2) {
    const pIdx = i - swMin;
    let isH = true, isL = true;
    for (let j = i - swMin * 2; j <= i; j++) {
      if (j !== pIdx) {
        if (c5[j].high > c5[pIdx].high) isH = false;
        if (c5[j].low < c5[pIdx].low) isL = false;
      }
    }
    if (isH) { bslLvls.push(c5[pIdx].high); bslSwept.push(false); if (bslLvls.length > 15) { bslLvls.shift(); bslSwept.shift(); } }
    if (isL) { sslLvls.push(c5[pIdx].low); sslSwept.push(false); if (sslLvls.length > 15) { sslLvls.shift(); sslSwept.shift(); } }
  }

  // Major Pivots
  if (i >= swMaj * 2) {
    const pIdx = i - swMaj;
    let isH = true, isL = true;
    for (let j = i - swMaj * 2; j <= i; j++) {
      if (j !== pIdx) {
        if (c5[j].high > c5[pIdx].high) isH = false;
        if (c5[j].low < c5[pIdx].low) isL = false;
      }
    }
    if (isH) { bslLvls.push(c5[pIdx].high); bslSwept.push(false); if (bslLvls.length > 15) { bslLvls.shift(); bslSwept.shift(); } }
    if (isL) { sslLvls.push(c5[pIdx].low); sslSwept.push(false); if (sslLvls.length > 15) { sslLvls.shift(); sslSwept.shift(); } }
  }

  // FVG
  if (c.low > prev2C.high) {
    bFvgTop.push(c.low); bFvgBot.push(prev2C.high); bFvgBar.push(i);
    if (bFvgTop.length > 30) { bFvgTop.shift(); bFvgBot.shift(); bFvgBar.shift(); }
  }
  if (c.high < prev2C.low) {
    sFvgTop.push(prev2C.low); sFvgBot.push(c.high); sFvgBar.push(i);
    if (sFvgTop.length > 30) { sFvgTop.shift(); sFvgBot.shift(); sFvgBar.shift(); }
  }

  // Sweeps
  for (let k = 0; k < sslLvls.length; k++) {
    if (!sslSwept[k] && c.low < sslLvls[k] && c.close > sslLvls[k]) {
      sslSwept[k] = true;
      lookLong = true; lookShort = false; setupBarL = i; sweepLow = c.low;
    }
  }
  for (let k = 0; k < bslLvls.length; k++) {
    if (!bslSwept[k] && c.high > bslLvls[k] && c.close < bslLvls[k]) {
      bslSwept[k] = true;
      lookShort = true; lookLong = false; setupBarS = i; sweepHigh = c.high;
    }
  }

  if (lookLong && (i - setupBarL) > 40) lookLong = false;
  if (lookShort && (i - setupBarS) > 40) lookShort = false;

  if (lookLong) {
    for (let f = bFvgBar.length - 1; f >= 0; f--) {
      if (bFvgBar[f] > setupBarL) {
        const fTop = bFvgTop[f], fBot = bFvgBot[f];
        if (c.low <= fTop && c.close > fBot) {
          setups.push({ bar: i, time: c.time || c.openTime, dir: 1, entryPrice: c.close, sweepExt: sweepLow, atr: atr5[i] });
          lookLong = false;
          break;
        }
      }
    }
  }

  if (lookShort) {
    for (let f = sFvgBar.length - 1; f >= 0; f--) {
      if (sFvgBar[f] > setupBarS) {
        const fTop = sFvgTop[f], fBot = sFvgBot[f];
        if (c.high >= fBot && c.close < fTop) {
          setups.push({ bar: i, time: c.time || c.openTime, dir: -1, entryPrice: c.close, sweepExt: sweepHigh, atr: atr5[i] });
          lookShort = false;
          break;
        }
      }
    }
  }
}

console.log(`Extracted setups count: ${setups.length}`);
if (setups.length > 0) {
  console.log('Sample setup:', setups[0]);
  const s0 = setups[0];
  const slP = s0.dir === 1 ? (s0.sweepExt - s0.atr * 0.42) : (s0.sweepExt + s0.atr * 0.42);
  const slDist = Math.abs(s0.entryPrice - slP);
  console.log(`Sample SL dist: ${slDist.toFixed(2)}, slPips: ${(slDist * 10).toFixed(1)}`);
}
