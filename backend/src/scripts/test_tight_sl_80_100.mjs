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
const c1 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_1m_tv.json'), 'utf8'));

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

// Simulator with FVG-bound SL or ATR-bound SL
function testTightSLModel(candles, atr, ema, {
  slMode = 'fvg_bound', // 'fvg_bound' or 'atr_bound' or 'sweep_bound'
  swMin = 3,
  swMaj = 7,
  rr = 3.0,
  atrMult = 0.3,
  fixedTpPips = 85, // 85 pips ($8.50)
  beTriggerR = 1.0,
  useEma = false,
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
  let setupBarL = 0, setupBarS = 0;
  let sweepLow = 0, sweepHigh = 0;

  for (let i = 2; i < n; i++) {
    const c = candles[i];
    const prev2C = candles[i - 2];
    const timeMs = c.openTime || c.time;

    // Pivots
    if (i >= swMin * 2) {
      const pIdx = i - swMin;
      let isH = true, isL = true;
      const pH = candles[pIdx].high, pL = candles[pIdx].low;
      for (let j = i - swMin * 2; j <= i; j++) {
        if (j !== pIdx) {
          if (candles[j].high > pH) isH = false;
          if (candles[j].low < pL) isL = false;
        }
      }
      if (isH) { bslLvls.push(pH); bslSwept.push(false); if (bslLvls.length > 15) { bslLvls.shift(); bslSwept.shift(); } }
      if (isL) { sslLvls.push(pL); sslSwept.push(false); if (sslLvls.length > 15) { sslLvls.shift(); sslSwept.shift(); } }
    }

    if (i >= swMaj * 2) {
      const pIdx = i - swMaj;
      let isH = true, isL = true;
      const pH = candles[pIdx].high, pL = candles[pIdx].low;
      for (let j = i - swMaj * 2; j <= i; j++) {
        if (j !== pIdx) {
          if (candles[j].high > pH) isH = false;
          if (candles[j].low < pL) isL = false;
        }
      }
      if (isH) { bslLvls.push(pH); bslSwept.push(false); if (bslLvls.length > 15) { bslLvls.shift(); bslSwept.shift(); } }
      if (isL) { sslLvls.push(pL); sslSwept.push(false); if (sslLvls.length > 15) { sslLvls.shift(); sslSwept.shift(); } }
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
        if (!useEma || (ema && c.close > ema[i])) {
          lookLong = true; lookShort = false; setupBarL = i; sweepLow = c.low;
        }
      }
    }
    for (let k = 0; k < bslLvls.length; k++) {
      if (!bslSwept[k] && c.high > bslLvls[k] && c.close < bslLvls[k]) {
        bslSwept[k] = true;
        if (!useEma || (ema && c.close < ema[i])) {
          lookShort = true; lookLong = false; setupBarS = i; sweepHigh = c.high;
        }
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

        if (beTriggerR > 0 && !sigIsBE[t]) {
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

    if (lookLong && (i - setupBarL) > expireBars) lookLong = false;
    if (lookShort && (i - setupBarS) > expireBars) lookShort = false;

    // Long entry
    if (lookLong && !hasOpen) {
      for (let f = bFvgBar.length - 1; f >= 0; f--) {
        if (bFvgBar[f] > setupBarL) {
          const fTop = bFvgTop[f], fBot = bFvgBot[f];
          if (c.low <= fTop && c.close > fBot) {
            const entryP = c.close;
            let slP;
            if (slMode === 'fvg_bound') {
              slP = fBot - atr[i] * atrMult;
            } else if (slMode === 'atr_bound') {
              slP = entryP - atr[i] * (1.0 + atrMult);
            } else {
              slP = sweepLow - atr[i] * atrMult;
            }
            const slDist = entryP - slP;

            if (slDist > 0.8 && slDist < 6.0) { // SL between $0.80 and $6.00
              const tpDist = fixedTpPips / 10; // e.g. $8.50 (85 pips)
              const tpP = entryP + tpDist;
              const tradeRR = tpDist / slDist;

              sigDir.push(1); sigEntry.push(entryP); sigSL.push(slP); sigTP.push(tpP);
              sigResult.push(0); sigBar.push(i); sigRVal.push(tradeRR); sigEntryTime.push(timeMs);
              sigIsBE.push(false);
              lookLong = false; break;
            }
          }
        }
      }
    }

    // Short entry
    if (lookShort && !hasOpen) {
      for (let f = sFvgBar.length - 1; f >= 0; f--) {
        if (sFvgBar[f] > setupBarS) {
          const fTop = sFvgTop[f], fBot = sFvgBot[f];
          if (c.high >= fBot && c.close < fTop) {
            const entryP = c.close;
            let slP;
            if (slMode === 'fvg_bound') {
              slP = fTop + atr[i] * atrMult;
            } else if (slMode === 'atr_bound') {
              slP = entryP + atr[i] * (1.0 + atrMult);
            } else {
              slP = sweepHigh + atr[i] * atrMult;
            }
            const slDist = slP - entryP;

            if (slDist > 0.8 && slDist < 6.0) {
              const tpDist = fixedTpPips / 10;
              const tpP = entryP - tpDist;
              const tradeRR = tpDist / slDist;

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

console.log('Testing FVG-bound and ATR-bound SL with 80-100 Pip Target TP on M5 and M15...');
const atr5 = computeATR(c5, 14);
const atr15 = computeATR(c15, 14);
const ema5 = computeEMA(c5, 100);
const ema15 = computeEMA(c15, 100);

const champions = [];
const allResults = [];

for (const tf of [{ name: 'M5', candles: c5, atr: atr5, ema: ema5 }, { name: 'M15', candles: c15, atr: atr15, ema: ema15 }]) {
  for (const slMode of ['fvg_bound', 'atr_bound', 'sweep_bound']) {
    for (const swMin of [2, 3, 4]) {
      for (const swMaj of [5, 6, 7, 8]) {
        for (const fixedTpPips of [80, 85, 90, 95, 100]) {
          for (const atrMult of [0.15, 0.25, 0.35, 0.45]) {
            for (const beTriggerR of [0.0, 0.8, 1.0, 1.2]) {
              for (const useEma of [false, true]) {
                const res = testTightSLModel(tf.candles, tf.atr, tf.ema, {
                  slMode, swMin, swMaj, atrMult, fixedTpPips, beTriggerR, useEma, expireBars: 35
                });

                if (res.closed >= 3) {
                  const item = { tf: tf.name, slMode, swMin, swMaj, fixedTpPips, atrMult, beTriggerR, useEma, ...res };
                  allResults.push(item);
                  if (res.sepR >= 10.0 && res.octR >= 10.0 && res.maxDrawdown <= 3.5 && res.calmarRatio >= 4.0) {
                    champions.push(item);
                    console.log(`>>> CHAMPION: [${tf.name}] Mode:${slMode} SwMin:${swMin} Maj:${swMaj} TP:${fixedTpPips}p ATR:${atrMult} BE:${beTriggerR}R EMA:${useEma} -> Sep:+${res.sepR}R Oct:+${res.octR}R Total:+${res.cumulativeR}R Calmar:${res.calmarRatio} DD:-${res.maxDrawdown}R WR:${res.winRate.toFixed(1)}% Trades:${res.closed}`);
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

console.log(`Found ${champions.length} Champions! Evaluated ${allResults.length} active candidates.`);
allResults.sort((a,b) => (Math.min(b.sepR, b.octR) - Math.min(a.sepR, a.octR)) || (b.cumulativeR - a.cumulativeR));
console.log('Top 15 candidates:');
allResults.slice(0, 15).forEach((c, idx) => {
  console.log(`#${idx+1}: [${c.tf}] Mode:${c.slMode} SwMin:${c.swMin} Maj:${c.swMaj} TP:${c.fixedTpPips}p ATR:${c.atrMult} BE:${c.beTriggerR}R EMA:${c.useEma} -> Sep:+${c.sepR}R Oct:+${c.octR}R Total:+${c.cumulativeR}R Calmar:${c.calmarRatio} DD:-${c.maxDrawdown}R WR:${c.winRate.toFixed(1)}% Trades:${c.closed}`);
});
