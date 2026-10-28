import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

console.log('Loading market datasets for continuous discovery...');
const c5 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_5m_tv.json'), 'utf8'));
const c15 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_15m_tv.json'), 'utf8'));
const c30 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_30m_tv.json'), 'utf8'));
const c1 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_1m_tv.json'), 'utf8'));

// Precompute ATR
function computeATR(candles, period = 14) {
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

// Precompute EMA
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

// Precompute indicators
const datasets = {
  M5: { candles: c5, atr14: computeATR(c5, 14), ema50: computeEMA(c5, 50), ema100: computeEMA(c5, 100), ema200: computeEMA(c5, 200) },
  M15: { candles: c15, atr14: computeATR(c15, 14), ema50: computeEMA(c15, 50), ema100: computeEMA(c15, 100), ema200: computeEMA(c15, 200) },
  M30: { candles: c30, atr14: computeATR(c30, 14), ema50: computeEMA(c30, 50), ema100: computeEMA(c30, 100), ema200: computeEMA(c30, 200) },
  M1: { candles: c1, atr14: computeATR(c1, 14), ema50: computeEMA(c1, 50), ema100: computeEMA(c1, 100), ema200: computeEMA(c1, 200) }
};

// Simulation engine supporting:
// 1. Dual Pivot Sweep + FVG Tap
// 2. Trend Pullback + FVG
// 3. Breakeven protection (at X R)
// 4. Trailing SL protection
// 5. Target TP strictly in [80, 100] pips or R:R scaling
export function runUniversalSimulation(candles, atr, {
  model = 'dual_pivot', // 'dual_pivot', 'trend_fvg', 'session_sweep'
  swMin = 3,
  swMaj = 7,
  emaFilter = null,
  trendType = 'none', // 'none', 'ema_align', 'ema_pullback'
  rr = 2.8,
  atrMult = 0.35,
  minTp = 8.0, // 80 pips
  maxTp = 10.0, // 100 pips
  targetTpPips = 0, // if > 0, fixed/scaled target
  beTriggerR = 1.0,
  trailTriggerR = 0, // trail after X R
  expireBars = 35,
  minHoldSeconds = 120
}) {
  const n = candles.length;
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
    const c = candles[i];
    const prev2C = candles[i - 2];
    const timeMs = c.openTime || c.time;

    // Pivots
    if (i >= swMin * 2) {
      const pIdx = i - swMin;
      let isH1 = true, isL1 = true;
      const pH = candles[pIdx].high, pL = candles[pIdx].low;
      for (let j = i - swMin * 2; j <= i; j++) {
        if (j !== pIdx) {
          if (candles[j].high > pH) isH1 = false;
          if (candles[j].low < pL) isL1 = false;
        }
      }
      if (isH1) { bslLvls.push(pH); bslSwept.push(false); if (bslLvls.length > 15) { bslLvls.shift(); bslSwept.shift(); } }
      if (isL1) { sslLvls.push(pL); sslSwept.push(false); if (sslLvls.length > 15) { sslLvls.shift(); sslSwept.shift(); } }
    }

    if (i >= swMaj * 2) {
      const pIdx = i - swMaj;
      let isH2 = true, isL2 = true;
      const pH = candles[pIdx].high, pL = candles[pIdx].low;
      for (let j = i - swMaj * 2; j <= i; j++) {
        if (j !== pIdx) {
          if (candles[j].high > pH) isH2 = false;
          if (candles[j].low < pL) isL2 = false;
        }
      }
      if (isH2) { bslLvls.push(pH); bslSwept.push(false); if (bslLvls.length > 15) { bslLvls.shift(); bslSwept.shift(); } }
      if (isL2) { sslLvls.push(pL); sslSwept.push(false); if (sslLvls.length > 15) { sslLvls.shift(); sslSwept.shift(); } }
    }

    // FVGs
    if (c.low > prev2C.high) {
      bFvgTop.push(c.low); bFvgBot.push(prev2C.high); bFvgBar.push(i);
      if (bFvgTop.length > 30) { bFvgTop.shift(); bFvgBot.shift(); bFvgBar.shift(); }
    }
    if (c.high < prev2C.low) {
      sFvgTop.push(prev2C.low); sFvgBot.push(c.high); sFvgBar.push(i);
      if (sFvgTop.length > 30) { sFvgTop.shift(); sFvgBot.shift(); sFvgBar.shift(); }
    }

    // Sweeps
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

    // In-trade management
    for (let t = 0; t < sigDir.length; t++) {
      if (sigResult[t] === 0) {
        const dir = sigDir[t];
        const tp = sigTP[t];
        let sl = sigSL[t];
        const entry = sigEntry[t];
        const age = i - sigBar[t];
        const holdSec = (timeMs - sigEntryTime[t]) / 1000;
        let resolved = false;

        const slDistInit = Math.abs(entry - sigSL[t]);
        const currentGain = dir === 1 ? (c.high - entry) : (entry - c.low);

        // Breakeven check
        if (beTriggerR > 0 && !sigIsBE[t]) {
          if (currentGain >= slDistInit * beTriggerR) {
            sigSL[t] = entry;
            sigIsBE[t] = true;
          }
        }

        // Trailing check
        if (trailTriggerR > 0 && sigIsBE[t]) {
          if (currentGain >= slDistInit * trailTriggerR) {
            const lockIn = dir === 1 ? (entry + slDistInit * (trailTriggerR - 1.0)) : (entry - slDistInit * (trailTriggerR - 1.0));
            sigSL[t] = lockIn;
          }
        }

        if (age >= expireBars * 3) {
          sigResult[t] = 2; resolved = true;
        } else if (holdSec >= minHoldSeconds) {
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
          }
        }
      }
    }

    let hasOpen = false;
    for (let t = 0; t < sigResult.length; t++) {
      if (sigResult[t] === 0) { hasOpen = true; break; }
    }

    // Trend filter condition
    let trendLongOk = true, trendShortOk = true;
    if (trendType === 'ema_align' && emaFilter) {
      trendLongOk = c.close > emaFilter[i];
      trendShortOk = c.close < emaFilter[i];
    }

    if (sslSweep && !hasOpen && trendLongOk) {
      lookLong = true; lookShort = false; setupBarL = i;
      setupSLL = sweepLow - atr[i] * atrMult;
    }
    if (bslSweep && !hasOpen && trendShortOk) {
      lookShort = true; lookLong = false; setupBarS = i;
      setupSLS = sweepHigh + atr[i] * atrMult;
    }

    if (lookLong && (i - setupBarL) > expireBars) lookLong = false;
    if (lookShort && (i - setupBarS) > expireBars) lookShort = false;

    // Trigger checks
    if (lookLong && !hasOpen) {
      for (let f = bFvgBar.length - 1; f >= 0; f--) {
        if (bFvgBar[f] > setupBarL) {
          const fTop = bFvgTop[f], fBot = bFvgBot[f];
          if (c.low <= fTop && c.close > fBot) {
            const entryP = c.close, slP = setupSLL, slDist = entryP - slP;
            if (slDist > 0) {
              let tpDist, tradeRR;
              if (targetTpPips > 0) {
                tpDist = targetTpPips / 10;
                tradeRR = tpDist / slDist;
              } else {
                tpDist = slDist * rr;
                tradeRR = rr;
              }
              const tpP = entryP + tpDist;

              if (tpDist >= minTp && tpDist <= maxTp) {
                sigDir.push(1); sigEntry.push(entryP); sigSL.push(slP); sigTP.push(tpP);
                sigResult.push(0); sigBar.push(i); sigRVal.push(tradeRR); sigEntryTime.push(timeMs);
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
              let tpDist, tradeRR;
              if (targetTpPips > 0) {
                tpDist = targetTpPips / 10;
                tradeRR = tpDist / slDist;
              } else {
                tpDist = slDist * rr;
                tradeRR = rr;
              }
              const tpP = entryP - tpDist;

              if (tpDist >= minTp && tpDist <= maxTp) {
                sigDir.push(-1); sigEntry.push(entryP); sigSL.push(slP); sigTP.push(tpP);
                sigResult.push(0); sigBar.push(i); sigRVal.push(tradeRR); sigEntryTime.push(timeMs);
                sigIsBE.push(false);
                lookShort = false; break;
              }
            }
          }
        }
      }
    }
  }

  let wins = 0, losses = 0, beCount = 0, sumTpPips = 0;
  for (let t = 0; t < sigResult.length; t++) {
    if (sigResult[t] === 1) wins++;
    if (sigResult[t] === -1) losses++;
    if (sigResult[t] === 3) beCount++;
    if (sigResult[t] === 1 || sigResult[t] === -1 || sigResult[t] === 3) {
      sumTpPips += Math.abs(sigTP[t] - sigEntry[t]) * 10;
    }
  }
  const closed = wins + losses + beCount;
  const calmar = maxDD > 0 ? cumulativeR / maxDD : cumulativeR;
  const avgTp = closed > 0 ? sumTpPips / closed : 0;
  const sepR = monthlyR['2026-09'] || 0;
  const octR = monthlyR['2026-10'] || 0;

  return {
    closed, wins, losses, beCount,
    winRate: (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0,
    cumulativeR: Number(cumulativeR.toFixed(1)),
    maxDrawdown: Number(maxDD.toFixed(1)),
    calmarRatio: Number(calmar.toFixed(2)),
    avgTpPips: Number(avgTp.toFixed(1)),
    sepR: Number(sepR.toFixed(1)),
    octR: Number(octR.toFixed(1)),
    monthlyWins, monthlyLosses, monthlyR
  };
}

// Continuous discovery runner
const champions = [];
const evaluatedHistory = [];

console.log('Starting Multi-Architecture Continuous Search for 80-100 Pip Champions...');
let iteration = 0;

// Grid exploration definitions
const tfKeys = ['M5', 'M15', 'M30'];
const rrList = [1.8, 2.0, 2.2, 2.5, 2.8, 3.0, 3.2, 3.5, 4.0];
const atrMultList = [0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50];
const beList = [0.0, 0.8, 1.0, 1.2];
const trendTypes = ['none', 'ema_align'];
const emaPeriods = ['ema50', 'ema100', 'ema200'];

// TP Windows centered between 80 and 100 pips ($8.00 - $10.00)
const tpWindows = [
  { minTp: 8.0, maxTp: 10.0, targetTpPips: 0 },
  { minTp: 7.8, maxTp: 10.2, targetTpPips: 0 },
  { minTp: 7.5, maxTp: 10.5, targetTpPips: 0 },
  { minTp: 8.0, maxTp: 10.0, targetTpPips: 90 }, // fixed 90 pips ($9.00)
  { minTp: 8.0, maxTp: 10.0, targetTpPips: 85 }, // fixed 85 pips ($8.50)
  { minTp: 8.0, maxTp: 10.0, targetTpPips: 95 }  // fixed 95 pips ($9.50)
];

for (const tfKey of tfKeys) {
  const ds = datasets[tfKey];
  for (const swMin of [2, 3, 4, 5]) {
    for (const swMaj of [4, 5, 6, 7, 8, 9, 10]) {
      if (swMaj <= swMin) continue;
      for (const tpWin of tpWindows) {
        for (const rr of rrList) {
          for (const atrMult of atrMultList) {
            for (const beTriggerR of beList) {
              for (const trendType of trendTypes) {
                const emaFilter = trendType === 'ema_align' ? ds.ema100 : null;

                const res = runUniversalSimulation(ds.candles, ds.atr14, {
                  swMin,
                  swMaj,
                  rr,
                  atrMult,
                  minTp: tpWin.minTp,
                  maxTp: tpWin.maxTp,
                  targetTpPips: tpWin.targetTpPips,
                  beTriggerR,
                  trendType,
                  emaFilter,
                  expireBars: 35
                });

                iteration++;
                if (res.closed >= 4 && res.avgTpPips >= 78.0 && res.avgTpPips <= 102.0) {
                  const item = {
                    tf: tfKey,
                    swMin,
                    swMaj,
                    rr,
                    atrMult,
                    beTriggerR,
                    trendType,
                    tpWin,
                    ...res
                  };
                  evaluatedHistory.push(item);

                  if (res.sepR >= 10.0 && res.octR >= 10.0 && res.maxDrawdown <= 3.5 && res.calmarRatio >= 4.0) {
                    champions.push(item);
                    console.log(`>>> CHAMPION FOUND! [${tfKey}] SwMin:${swMin} Maj:${swMaj} RR:${rr} ATR:${atrMult} BE:${beTriggerR}R -> Sep:+${res.sepR}R Oct:+${res.octR}R Total:+${res.cumulativeR}R Calmar:${res.calmarRatio} DD:-${res.maxDrawdown}R WR:${res.winRate.toFixed(1)}% AvgTP:${res.avgTpPips}p`);
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

console.log(`Evaluated ${iteration} strategy combinations!`);
console.log(`Total qualifying strategies with Avg TP in 80-100 pips: ${evaluatedHistory.length}`);
console.log(`Total Champions meeting Dual Month >=10.0R & Calmar > 4.0 & MaxDD <= 3.5R: ${champions.length}`);

evaluatedHistory.sort((a, b) => (Math.min(b.sepR, b.octR) - Math.min(a.sepR, a.octR)) || (b.cumulativeR - a.cumulativeR));
console.log('\nTop 20 Strategies Ranked by Dual-Month Minimum Performance:');
evaluatedHistory.slice(0, 20).forEach((c, idx) => {
  console.log(`#${idx + 1}: [${c.tf}] SwMin:${c.swMin} Maj:${c.swMaj} RR:${c.rr} ATR:${c.atrMult} BE:${c.beTriggerR}R Trend:${c.trendType} TP:[${c.tpWin.minTp}-${c.tpWin.maxTp}, Fix:${c.tpWin.targetTpPips}] -> Sep:+${c.sepR}R Oct:+${c.octR}R Total:+${c.cumulativeR}R Calmar:${c.calmarRatio} DD:-${c.maxDrawdown}R WR:${c.winRate.toFixed(1)}% AvgTP:${c.avgTpPips}p Trades:${c.closed}`);
});

if (champions.length > 0) {
  champions.sort((a, b) => (b.cumulativeR * 1.5 + b.calmarRatio * 2) - (a.cumulativeR * 1.5 + a.calmarRatio * 2));
  fs.writeFileSync(path.join(DATA_DIR, 'champions_80_100_pips.json'), JSON.stringify(champions, null, 2));
  console.log(`\nSaved ${champions.length} champions to champions_80_100_pips.json!`);
}
