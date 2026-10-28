import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeATR } from './fast_evaluator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const c5 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_5m_tv.json'), 'utf8'));
const c15 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_15m_tv.json'), 'utf8'));
const c30 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_30m_tv.json'), 'utf8'));

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

// Flexible evaluator for 80-100 pip target
export function evaluate80to100Strategy(candles, atr, ema, {
  swMin = 3,
  swMaj = 6,
  targetTpPips = 85, // 85 pips = $8.50
  tpFlexibility = 15, // [target - flex, target + flex] -> [70, 100] pips
  maxSlPips = 30, // max SL in pips ($3.00)
  minSlPips = 12, // min SL in pips ($1.20)
  atrMult = 0.4,
  beTriggerR = 1.0, // breakeven trigger in R
  useEmaFilter = false,
  expireBars = 45,
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
  const sigIsBE = [];

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
    const prev2C = candles[i - 2];
    const timeMs = c.openTime || c.time;

    // Minor Pivots
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

    // Major Pivots
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

    // Process open trades
    for (let t = 0; t < sigDir.length; t++) {
      if (sigResult[t] === 0) {
        const dir = sigDir[t];
        const tp = sigTP[t];
        let sl = sigSL[t];
        const entry = sigEntry[t];
        const age = i - sigBar[t];
        const holdSec = (timeMs - sigEntryTime[t]) / 1000;
        let resolved = false;

        // Breakeven check
        if (beTriggerR > 0 && !sigIsBE[t]) {
          const slDistInit = Math.abs(entry - sigSL[t]);
          const currentGain = dir === 1 ? (c.high - entry) : (entry - c.low);
          if (currentGain >= slDistInit * beTriggerR) {
            sigSL[t] = entry;
            sigIsBE[t] = true;
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

    if (sslSweep && !hasOpen) {
      if (!useEmaFilter || (ema && c.close > ema[i])) {
        lookLong = true; lookShort = false; setupBarL = i;
        setupSLL = sweepLow - atr[i] * atrMult;
      }
    }
    if (bslSweep && !hasOpen) {
      if (!useEmaFilter || (ema && c.close < ema[i])) {
        lookShort = true; lookLong = false; setupBarS = i;
        setupSLS = sweepHigh + atr[i] * atrMult;
      }
    }

    if (lookLong && (i - setupBarL) > expireBars) lookLong = false;
    if (lookShort && (i - setupBarS) > expireBars) lookShort = false;

    // Check Long entry
    if (lookLong && !hasOpen) {
      for (let f = bFvgBar.length - 1; f >= 0; f--) {
        if (bFvgBar[f] > setupBarL) {
          const fTop = bFvgTop[f], fBot = bFvgBot[f];
          if (c.low <= fTop && c.close > fBot) {
            const entryP = c.close;
            let slP = setupSLL;
            let slDist = entryP - slP;
            const slPips = slDist * 10;

            if (slPips >= minSlPips && slPips <= maxSlPips) {
              // Target fixed 80-100 pips ($8.00 to $10.00)
              const tpDist = targetTpPips / 10; // e.g. 8.5
              const tpP = entryP + tpDist;
              const rr = tpDist / slDist;

              sigDir.push(1); sigEntry.push(entryP); sigSL.push(slP); sigTP.push(tpP);
              sigResult.push(0); sigBar.push(i); sigRVal.push(rr); sigEntryTime.push(timeMs);
              sigIsBE.push(false);
              lookLong = false; break;
            }
          }
        }
      }
    }

    // Check Short entry
    if (lookShort && !hasOpen) {
      for (let f = sFvgBar.length - 1; f >= 0; f--) {
        if (sFvgBar[f] > setupBarS) {
          const fTop = sFvgTop[f], fBot = sFvgBot[f];
          if (c.high >= fBot && c.close < fTop) {
            const entryP = c.close;
            let slP = setupSLS;
            let slDist = slP - entryP;
            const slPips = slDist * 10;

            if (slPips >= minSlPips && slPips <= maxSlPips) {
              const tpDist = targetTpPips / 10;
              const tpP = entryP - tpDist;
              const rr = tpDist / slDist;

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

  let wins = 0, losses = 0, beCount = 0, sumTpPips = 0;
  for (let t = 0; t < sigResult.length; t++) {
    if (sigResult[t] === 1) wins++;
    if (sigResult[t] === -1) losses++;
    if (sigResult[t] === 3) beCount++;
    if (sigResult[t] !== 0) {
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

// Run test on M5 and M15 with various target TP (80 - 100 pips)
console.log('Testing M5 and M15 with Target TP in [80, 100] Pips...');

const atr5 = computeATR(c5, 14);
const atr15 = computeATR(c15, 14);
const ema5 = computeEMA(c5, 100);
const ema15 = computeEMA(c15, 100);

const testTFs = [
  { name: 'M5', candles: c5, atr: atr5, ema: ema5 },
  { name: 'M15', candles: c15, atr: atr15, ema: ema15 }
];

const champions = [];

for (const tf of testTFs) {
  for (const swMin of [2, 3, 4, 5]) {
    for (const swMaj of [4, 5, 6, 7, 8, 9]) {
      if (swMaj <= swMin) continue;
      for (const targetTpPips of [80, 85, 90, 95, 100]) {
        for (const maxSlPips of [22, 25, 28, 30, 35]) {
          for (const minSlPips of [10, 14, 18]) {
            for (const atrMult of [0.25, 0.35, 0.45]) {
              for (const beTriggerR of [0.0, 0.8, 1.0, 1.2, 1.5]) {
                for (const useEmaFilter of [false, true]) {
                  const res = evaluate80to100Strategy(tf.candles, tf.atr, tf.ema, {
                    swMin, swMaj, targetTpPips, maxSlPips, minSlPips, atrMult,
                    beTriggerR, useEmaFilter, expireBars: 40
                  });

                  if (res.sepR >= 10.0 && res.octR >= 10.0 && res.maxDrawdown <= 3.5 && res.calmarRatio >= 4.0) {
                    champions.push({
                      tfName: tf.name, swMin, swMaj, targetTpPips, maxSlPips, minSlPips,
                      atrMult, beTriggerR, useEmaFilter, ...res
                    });
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

console.log(`Found ${champions.length} Dual Month >=10R Champions with 80-100 Pips!`);
champions.sort((a, b) => (b.cumulativeR * 1.5 + b.calmarRatio * 2) - (a.cumulativeR * 1.5 + a.calmarRatio * 2));
champions.slice(0, 10).forEach((c, idx) => {
  console.log(`#${idx + 1}: [${c.tfName}] SwMin:${c.swMin} Maj:${c.swMaj} TP:${c.targetTpPips}p SL:[${c.minSlPips}-${c.maxSlPips}] BE:${c.beTriggerR}R EMA:${c.useEmaFilter} -> Sep:+${c.sepR}R Oct:+${c.octR}R Total:+${c.cumulativeR}R Calmar:${c.calmarRatio} DD:-${c.maxDrawdown}R WR:${c.winRate.toFixed(1)}% Trades:${c.closed}`);
});
