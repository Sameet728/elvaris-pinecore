import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeATR } from './fast_evaluator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const c15 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_15m_tv.json'), 'utf8'));

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

const atr15 = computeATR(c15, 14);
const ema15 = computeEMA(c15, 100);

// Let's run simulation on M15 and print each trade's date, direction, entry, SL, TP, outcome
const swMin = 2, swMaj = 5, rr = 2.8, atrMult = 0.45, minTp = 7.5, maxTp = 10.5, beTriggerR = 1.0, useEma = true;

const n = c15.length;
const bslLvls = [], bslSwept = [];
const sslLvls = [], sslSwept = [];
const bFvgTop = [], bFvgBot = [], bFvgBar = [];
const sFvgTop = [], sFvgBot = [], sFvgBar = [];

const sigDir = [], sigEntry = [], sigSL = [], sigTP = [];
const sigResult = [], sigBar = [], sigRVal = [], sigEntryTime = [], sigIsBE = [];
const monthlyWins = {}, monthlyLosses = {}, monthlyR = {};

let cumulativeR = 0, peakR = 0, maxDD = 0;
let lookLong = false, lookShort = false;
let setupBarL = 0, setupBarS = 0, setupSLL = 0, setupSLS = 0;

for (let i = 2; i < n; i++) {
  const c = c15[i];
  const prev2C = c15[i - 2];
  const timeMs = c.openTime || c.time;

  if (i >= swMin * 2) {
    const pIdx = i - swMin;
    let isH1 = true, isL1 = true;
    const pH = c15[pIdx].high, pL = c15[pIdx].low;
    for (let j = i - swMin * 2; j <= i; j++) {
      if (j !== pIdx) {
        if (c15[j].high > pH) isH1 = false;
        if (c15[j].low < pL) isL1 = false;
      }
    }
    if (isH1) { bslLvls.push(pH); bslSwept.push(false); if (bslLvls.length > 12) { bslLvls.shift(); bslSwept.shift(); } }
    if (isL1) { sslLvls.push(pL); sslSwept.push(false); if (sslLvls.length > 12) { sslLvls.shift(); sslSwept.shift(); } }
  }

  if (i >= swMaj * 2) {
    const pIdx = i - swMaj;
    let isH2 = true, isL2 = true;
    const pH = c15[pIdx].high, pL = c15[pIdx].low;
    for (let j = i - swMaj * 2; j <= i; j++) {
      if (j !== pIdx) {
        if (c15[j].high > pH) isH2 = false;
        if (c15[j].low < pL) isL2 = false;
      }
    }
    if (isH2) { bslLvls.push(pH); bslSwept.push(false); if (bslLvls.length > 12) { bslLvls.shift(); bslSwept.shift(); } }
    if (isL2) { sslLvls.push(pL); sslSwept.push(false); if (sslLvls.length > 12) { sslLvls.shift(); sslSwept.shift(); } }
  }

  if (c.low > prev2C.high) {
    bFvgTop.push(c.low); bFvgBot.push(prev2C.high); bFvgBar.push(i);
    if (bFvgTop.length > 30) { bFvgTop.shift(); bFvgBot.shift(); bFvgBar.shift(); }
  }
  if (c.high < prev2C.low) {
    sFvgTop.push(prev2C.low); sFvgBot.push(c.high); sFvgBar.push(i);
    if (sFvgTop.length > 30) { sFvgTop.shift(); sFvgBot.shift(); sFvgBar.shift(); }
  }

  let sslSweep = false, bslSweep = false, sweepLow = 0, sweepHigh = 0;
  for (let k = 0; k < sslLvls.length; k++) {
    if (!sslSwept[k] && c.low < sslLvls[k] && c.close > sslLvls[k]) {
      sslSwept[k] = true; sslSweep = true; sweepLow = c.low;
    }
  }
  for (let k = 0; k < bslLvls.length; k++) {
    if (!bslSwept[k] && c.high > bslLvls[k] && c.close < bslLvls[k]) {
      bslSwept[k] = true; bslSweep = true; sweepHigh = c.high;
    }
  }

  for (let t = 0; t < sigDir.length; t++) {
    if (sigResult[t] === 0) {
      const dir = sigDir[t];
      const tp = sigTP[t];
      let sl = sigSL[t];
      const entry = sigEntry[t];
      const age = i - sigBar[t];
      const holdSec = (timeMs - sigEntryTime[t]) / 1000;
      let resolved = false;

      if (!sigIsBE[t]) {
        const slDistInit = Math.abs(entry - sigSL[t]);
        const currentGain = dir === 1 ? (c.high - entry) : (entry - c.low);
        if (currentGain >= slDistInit * beTriggerR) {
          sigSL[t] = entry;
          sigIsBE[t] = true;
        }
      }

      if (age >= 105) {
        sigResult[t] = 2; resolved = true;
      } else if (holdSec >= 120) {
        if (dir === 1) {
          if (c.high >= tp) { sigResult[t] = 1; resolved = true; }
          else if (c.low <= sigSL[t]) { sigResult[t] = sigIsBE[t] ? 3 : -1; resolved = true; }
        } else {
          if (c.low <= tp) { sigResult[t] = 1; resolved = true; }
          else if (c.high >= sigSL[t]) { sigResult[t] = sigIsBE[t] ? 3 : -1; resolved = true; }
        }
      }

      if (resolved) {
        const finalRes = sigResult[t];
        const rOutcome = finalRes === 1 ? sigRVal[t] : finalRes === 3 ? 0.0 : -1.0;
        if (finalRes === 1 || finalRes === -1 || finalRes === 3) {
          const d = new Date(timeMs);
          const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
          if (!monthlyWins[mKey]) { monthlyWins[mKey] = 0; monthlyLosses[mKey] = 0; monthlyR[mKey] = 0; }

          if (finalRes === 1) {
            monthlyWins[mKey]++;
            monthlyR[mKey] += rOutcome;
            cumulativeR += rOutcome;
            if (cumulativeR > peakR) peakR = cumulativeR;
          } else if (finalRes === -1) {
            monthlyLosses[mKey]++;
            monthlyR[mKey] -= 1.0;
            cumulativeR -= 1.0;
            const dd = peakR - cumulativeR;
            if (dd > maxDD) maxDD = dd;
          }
          console.log(`Trade #${t+1} resolved at ${d.toISOString()}: Result=${finalRes} (R=${rOutcome}), Dir=${dir}, Entry=${entry}, Month=${mKey}, RunningR=${cumulativeR.toFixed(1)}`);
        }
      }
    }
  }

  let hasOpen = false;
  for (let t = 0; t < sigResult.length; t++) {
    if (sigResult[t] === 0) { hasOpen = true; break; }
  }

  if (sslSweep && !hasOpen) {
    if (!useEma || (ema15 && c.close > ema15[i])) {
      lookLong = true; lookShort = false; setupBarL = i;
      setupSLL = sweepLow - atr15[i] * atrMult;
    }
  }
  if (bslSweep && !hasOpen) {
    if (!useEma || (ema15 && c.close < ema15[i])) {
      lookShort = true; lookLong = false; setupBarS = i;
      setupSLS = sweepHigh + atr15[i] * atrMult;
    }
  }

  if (lookLong && (i - setupBarL) > 35) lookLong = false;
  if (lookShort && (i - setupBarS) > 35) lookShort = false;

  if (lookLong && !hasOpen) {
    for (let f = bFvgBar.length - 1; f >= 0; f--) {
      if (bFvgBar[f] > setupBarL) {
        const fTop = bFvgTop[f], fBot = bFvgBot[f];
        if (c.low <= fTop && c.close > fBot) {
          const entryP = c.close, slP = setupSLL, slDist = entryP - slP;
          if (slDist > 0) {
            const tpP = entryP + slDist * rr, tpDist = tpP - entryP;
            if (tpDist >= minTp && tpDist <= maxTp) {
              sigDir.push(1); sigEntry.push(entryP); sigSL.push(slP); sigTP.push(tpP);
              sigResult.push(0); sigBar.push(i); sigRVal.push(rr); sigEntryTime.push(timeMs);
              sigIsBE.push(false);
              lookLong = false; break;
            }
          }
        }
      }
    }
  }

  if (lookShort && !hasOpen) {
    for (let f = sFvgBar.length - 1; f >= 0; f--) {
      if (sFvgBar[f] > setupBarS) {
        const fTop = sFvgTop[f], fBot = sFvgBot[f];
        if (c.high >= fBot && c.close < fTop) {
          const entryP = c.close, slP = setupSLS, slDist = slP - entryP;
          if (slDist > 0) {
            const tpP = entryP - slDist * rr, tpDist = entryP - tpP;
            if (tpDist >= minTp && tpDist <= maxTp) {
              sigDir.push(-1); sigEntry.push(entryP); sigSL.push(slP); sigTP.push(tpP);
              sigResult.push(0); sigBar.push(i); sigRVal.push(rr); sigEntryTime.push(timeMs);
              sigIsBE.push(false);
              lookShort = false; break;
            }
          }
        }
      }
    }
  }
}

console.log('\nFinal Monthly Breakdown:', monthlyR);
console.log('Total Cumulative R:', cumulativeR);
