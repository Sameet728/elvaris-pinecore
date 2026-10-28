import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const c5 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_5m_tv.json'), 'utf8'));

// Precompute ATR(14)
export function computeATR(candles, period = 14) {
  const atr = new Float64Array(candles.length);
  const tr = new Float64Array(candles.length);
  tr[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    tr[i] = Math.max(hl, hc, lc);
  }
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  atr[period - 1] = sum / period;
  for (let i = period; i < candles.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  }
  return atr;
}

const atr14 = computeATR(c5, 14);

// Native fast backtester
export function simulateDualPivot(candles, atr, {
  swMin = 4,
  swMaj = 7,
  rr = 2.8,
  atrMult = 0.42,
  minTp = 2.2,
  maxTp = 4.0,
  expireBars = 35,
  minHoldSeconds = 120
}) {
  const n = candles.length;
  const bslLvls = [];
  const bslSwept = [];
  const sslLvls = [];
  const sslSwept = [];

  const bFvgTop = [];
  const bFvgBot = [];
  const bFvgBar = [];

  const sFvgTop = [];
  const sFvgBot = [];
  const sFvgBar = [];

  const sigDir = [];
  const sigEntry = [];
  const sigSL = [];
  const sigTP = [];
  const sigResult = [];
  const sigBar = [];
  const sigRVal = [];
  const sigEntryTime = [];

  const monthlyWins = {};
  const monthlyLosses = {};
  const monthlyR = {};

  let cumulativeR = 0;
  let peakR = 0;
  let maxDD = 0;

  let lookLong = false;
  let lookShort = false;
  let setupBarL = 0;
  let setupBarS = 0;
  let setupSLL = 0;
  let setupSLS = 0;

  for (let i = 2; i < n; i++) {
    const c = candles[i];
    const prevC = candles[i - 1];
    const prev2C = candles[i - 2];
    const timeMs = c.openTime || c.time;

    // Check pivots for swMin
    if (i >= swMin * 2) {
      const pIdx = i - swMin;
      let isH1 = true;
      let isL1 = true;
      const pH = candles[pIdx].high;
      const pL = candles[pIdx].low;
      for (let j = i - swMin * 2; j <= i; j++) {
        if (j !== pIdx) {
          if (candles[j].high > pH) isH1 = false;
          if (candles[j].low < pL) isL1 = false;
        }
      }
      if (isH1) {
        bslLvls.push(pH);
        bslSwept.push(false);
        if (bslLvls.length > 12) { bslLvls.shift(); bslSwept.shift(); }
      }
      if (isL1) {
        sslLvls.push(pL);
        sslSwept.push(false);
        if (sslLvls.length > 12) { sslLvls.shift(); sslSwept.shift(); }
      }
    }

    // Check pivots for swMaj
    if (i >= swMaj * 2) {
      const pIdx = i - swMaj;
      let isH2 = true;
      let isL2 = true;
      const pH = candles[pIdx].high;
      const pL = candles[pIdx].low;
      for (let j = i - swMaj * 2; j <= i; j++) {
        if (j !== pIdx) {
          if (candles[j].high > pH) isH2 = false;
          if (candles[j].low < pL) isL2 = false;
        }
      }
      if (isH2) {
        bslLvls.push(pH);
        bslSwept.push(false);
        if (bslLvls.length > 12) { bslLvls.shift(); bslSwept.shift(); }
      }
      if (isL2) {
        sslLvls.push(pL);
        sslSwept.push(false);
        if (sslLvls.length > 12) { sslLvls.shift(); sslSwept.shift(); }
      }
    }

    // FVG
    if (c.low > prev2C.high) {
      bFvgTop.push(c.low);
      bFvgBot.push(prev2C.high);
      bFvgBar.push(i);
      if (bFvgTop.length > 30) { bFvgTop.shift(); bFvgBot.shift(); bFvgBar.shift(); }
    }
    if (c.high < prev2C.low) {
      sFvgTop.push(prev2C.low);
      sFvgBot.push(c.high);
      sFvgBar.push(i);
      if (sFvgTop.length > 30) { sFvgTop.shift(); sFvgBot.shift(); sFvgBar.shift(); }
    }

    // Sweeps
    let sslSweep = false;
    let bslSweep = false;
    let sweepLow = 0;
    let sweepHigh = 0;

    for (let k = 0; k < sslLvls.length; k++) {
      if (!sslSwept[k]) {
        const lvl = sslLvls[k];
        if (c.low < lvl && c.close > lvl) {
          sslSwept[k] = true;
          sslSweep = true;
          sweepLow = c.low;
        }
      }
    }

    for (let k = 0; k < bslLvls.length; k++) {
      if (!bslSwept[k]) {
        const lvl = bslLvls[k];
        if (c.high > lvl && c.close < lvl) {
          bslSwept[k] = true;
          bslSweep = true;
          sweepHigh = c.high;
        }
      }
    }

    // Process open trades
    for (let t = 0; t < sigDir.length; t++) {
      if (sigResult[t] === 0) {
        const dir = sigDir[t];
        const tp = sigTP[t];
        const sl = sigSL[t];
        const age = i - sigBar[t];
        const holdSec = (timeMs - sigEntryTime[t]) / 1000;
        let resolved = false;

        if (age >= expireBars * 3) {
          sigResult[t] = 2; // expired
          resolved = true;
        } else if (holdSec >= minHoldSeconds) {
          if (dir === 1) {
            if (c.high >= tp) {
              sigResult[t] = 1;
              resolved = true;
            } else if (c.low <= sl) {
              sigResult[t] = -1;
              resolved = true;
            }
          } else {
            if (c.low <= tp) {
              sigResult[t] = 1;
              resolved = true;
            } else if (c.high >= sl) {
              sigResult[t] = -1;
              resolved = true;
            }
          }
        }

        if (resolved) {
          const finalRes = sigResult[t];
          const rOutcome = sigRVal[t];
          if (finalRes === 1 || finalRes === -1) {
            const d = new Date(timeMs);
            const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
            if (!monthlyWins[mKey]) { monthlyWins[mKey] = 0; monthlyLosses[mKey] = 0; monthlyR[mKey] = 0; }

            if (finalRes === 1) {
              monthlyWins[mKey]++;
              monthlyR[mKey] += rOutcome;
              cumulativeR += rOutcome;
              if (cumulativeR > peakR) peakR = cumulativeR;
            } else {
              monthlyLosses[mKey]++;
              monthlyR[mKey] -= 1.0;
              cumulativeR -= 1.0;
              const dd = peakR - cumulativeR;
              if (dd > maxDD) maxDD = dd;
            }
          }
        }
      }
    }

    // Check has open
    let hasOpen = false;
    for (let t = 0; t < sigResult.length; t++) {
      if (sigResult[t] === 0) { hasOpen = true; break; }
    }

    if (sslSweep && !hasOpen) {
      lookLong = true;
      lookShort = false;
      setupBarL = i;
      setupSLL = sweepLow - atr[i] * atrMult;
    }
    if (bslSweep && !hasOpen) {
      lookShort = true;
      lookLong = false;
      setupBarS = i;
      setupSLS = sweepHigh + atr[i] * atrMult;
    }

    if (lookLong && (i - setupBarL) > expireBars) lookLong = false;
    if (lookShort && (i - setupBarS) > expireBars) lookShort = false;

    if (lookLong && !hasOpen) {
      for (let f = bFvgBar.length - 1; f >= 0; f--) {
        if (bFvgBar[f] > setupBarL) {
          const fTop = bFvgTop[f];
          const fBot = bFvgBot[f];
          if (c.low <= fTop && c.close > fBot) {
            const entryP = c.close;
            const slP = setupSLL;
            const slDist = entryP - slP;
            if (slDist > 0) {
              const tpP = entryP + slDist * rr;
              const tpDist = tpP - entryP;
              if (tpDist >= minTp && tpDist <= maxTp) {
                sigDir.push(1);
                sigEntry.push(entryP);
                sigSL.push(slP);
                sigTP.push(tpP);
                sigResult.push(0);
                sigBar.push(i);
                sigRVal.push(rr);
                sigEntryTime.push(timeMs);
                lookLong = false;
                break;
              }
            }
          }
        }
      }
    }

    if (lookShort && !hasOpen) {
      for (let f = sFvgBar.length - 1; f >= 0; f--) {
        if (sFvgBar[f] > setupBarS) {
          const fTop = sFvgTop[f];
          const fBot = sFvgBot[f];
          if (c.high >= fBot && c.close < fTop) {
            const entryP = c.close;
            const slP = setupSLS;
            const slDist = slP - entryP;
            if (slDist > 0) {
              const tpP = entryP - slDist * rr;
              const tpDist = entryP - tpP;
              if (tpDist >= minTp && tpDist <= maxTp) {
                sigDir.push(-1);
                sigEntry.push(entryP);
                sigSL.push(slP);
                sigTP.push(tpP);
                sigResult.push(0);
                sigBar.push(i);
                sigRVal.push(rr);
                sigEntryTime.push(timeMs);
                lookShort = false;
                break;
              }
            }
          }
        }
      }
    }
  }

  let wins = 0;
  let losses = 0;
  let sumTpPips = 0;
  for (let t = 0; t < sigResult.length; t++) {
    if (sigResult[t] === 1) wins++;
    if (sigResult[t] === -1) losses++;
    if (sigResult[t] !== 0) {
      sumTpPips += Math.abs(sigTP[t] - sigEntry[t]) * 10;
    }
  }
  const closed = wins + losses;
  const calmar = maxDD > 0 ? cumulativeR / maxDD : cumulativeR;
  const avgTp = closed > 0 ? sumTpPips / closed : 0;
  const sepR = monthlyR['2026-09'] || 0;
  const octR = monthlyR['2026-10'] || 0;

  return {
    closed,
    wins,
    losses,
    winRate: closed > 0 ? (wins / closed) * 100 : 0,
    cumulativeR: Number(cumulativeR.toFixed(1)),
    maxDrawdown: Number(maxDD.toFixed(1)),
    calmarRatio: Number(calmar.toFixed(2)),
    avgTpPips: Number(avgTp.toFixed(1)),
    sepR: Number(sepR.toFixed(1)),
    octR: Number(octR.toFixed(1)),
    monthlyWins,
    monthlyLosses,
    monthlyR
  };
}

// Quick validation test
const t0 = Date.now();
const testRes = simulateDualPivot(c5, atr14, { swMin: 4, swMaj: 7, rr: 2.8, atrMult: 0.42, minTp: 2.2, maxTp: 4.0 });
console.log(`Native simulation took: ${Date.now() - t0} ms!`);
console.log('Test result:', JSON.stringify(testRes, null, 2));
