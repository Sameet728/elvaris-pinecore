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

// Pre-extract raw trade signals for a given TF and (swMin, swMaj)
function extractRawSignals(candles, atr, ema, swMin, swMaj, expireBars = 35) {
  const n = candles.length;
  const bslLvls = [], bslSwept = [];
  const sslLvls = [], sslSwept = [];
  const bFvgTop = [], bFvgBot = [], bFvgBar = [];
  const sFvgTop = [], sFvgBot = [], sFvgBar = [];

  let lookLong = false, lookShort = false;
  let setupBarL = 0, setupBarS = 0;
  let sweepLow = 0, sweepHigh = 0;

  const rawSignals = [];

  for (let i = 2; i < n; i++) {
    const c = candles[i];
    const prev2C = candles[i - 2];
    const timeMs = c.openTime || c.time;

    // Minor Pivots
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

    // Major Pivots
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
        lookLong = true; lookShort = false; setupBarL = i; sweepLow = c.low;
      }
    }
    for (let k = 0; k < bslLvls.length; k++) {
      if (!bslSwept[k] && c.high > bslLvls[k] && c.close < bslLvls[k]) {
        bslSwept[k] = true;
        lookShort = true; lookLong = false; setupBarS = i; sweepHigh = c.high;
      }
    }

    if (lookLong && (i - setupBarL) > expireBars) lookLong = false;
    if (lookShort && (i - setupBarS) > expireBars) lookShort = false;

    // Long trigger
    if (lookLong) {
      for (let f = bFvgBar.length - 1; f >= 0; f--) {
        if (bFvgBar[f] > setupBarL) {
          const fTop = bFvgTop[f], fBot = bFvgBot[f];
          if (c.low <= fTop && c.close > fBot) {
            rawSignals.push({
              bar: i,
              time: timeMs,
              dir: 1,
              entryPrice: c.close,
              sweepExt: sweepLow,
              atrVal: atr[i],
              emaPass: ema ? c.close > ema[i] : true
            });
            lookLong = false;
            break;
          }
        }
      }
    }

    // Short trigger
    if (lookShort) {
      for (let f = sFvgBar.length - 1; f >= 0; f--) {
        if (sFvgBar[f] > setupBarS) {
          const fTop = sFvgTop[f], fBot = sFvgBot[f];
          if (c.high >= fBot && c.close < fTop) {
            rawSignals.push({
              bar: i,
              time: timeMs,
              dir: -1,
              entryPrice: c.close,
              sweepExt: sweepHigh,
              atrVal: atr[i],
              emaPass: ema ? c.close < ema[i] : true
            });
            lookShort = false;
            break;
          }
        }
      }
    }
  }

  return rawSignals;
}

// Rapid simulation across rawSignals
function simulateRawSignals(candles, rawSignals, {
  rr = 2.5,
  atrMult = 0.35,
  minTp = 7.5,
  maxTp = 10.5,
  beTriggerR = 1.0,
  useEma = false,
  expireBars = 35,
  minHoldSeconds = 120
}) {
  const monthlyWins = {};
  const monthlyLosses = {};
  const monthlyR = {};

  let cumulativeR = 0;
  let peakR = 0;
  let maxDD = 0;
  let wins = 0;
  let losses = 0;
  let beCount = 0;
  let sumTpPips = 0;

  let activeTradeUntilBar = -1;

  for (let s = 0; s < rawSignals.length; s++) {
    const sig = rawSignals[s];
    if (sig.bar < activeTradeUntilBar) continue; // In-market trade blocks new trade
    if (useEma && !sig.emaPass) continue; // Trend filter check

    const dir = sig.dir;
    const entryP = sig.entryPrice;
    const slP = dir === 1 ? (sig.sweepExt - sig.atrVal * atrMult) : (sig.sweepExt + sig.atrVal * atrMult);
    const slDist = dir === 1 ? (entryP - slP) : (slP - entryP);

    if (slDist <= 0) continue;

    const tpDist = slDist * rr;
    if (tpDist < minTp || tpDist > maxTp) continue; // Must land in TP window

    const tpP = dir === 1 ? (entryP + tpDist) : (entryP - tpDist);
    let currSL = slP;
    let isBE = false;
    const entryTime = sig.time;

    const maxBar = Math.min(candles.length - 1, sig.bar + expireBars * 3);
    for (let i = sig.bar; i <= maxBar; i++) {
      const c = candles[i];
      const holdSec = (c.time - entryTime) / 1000;

      // Breakeven check
      if (beTriggerR > 0 && !isBE) {
        const gain = dir === 1 ? (c.high - entryP) : (entryP - c.low);
        if (gain >= slDist * beTriggerR) {
          currSL = entryP;
          isBE = true;
        }
      }

      if (i === maxBar) {
        activeTradeUntilBar = i;
        break; // Timeout/expired
      }

      if (holdSec >= minHoldSeconds) {
        if (dir === 1) {
          if (c.high >= tpP) {
            wins++;
            sumTpPips += tpDist * 10;
            const d = new Date(entryTime);
            const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
            monthlyWins[mKey] = (monthlyWins[mKey] || 0) + 1;
            monthlyR[mKey] = (monthlyR[mKey] || 0) + rr;
            cumulativeR += rr;
            if (cumulativeR > peakR) peakR = cumulativeR;
            activeTradeUntilBar = i;
            break;
          } else if (c.low <= currSL) {
            if (isBE) {
              beCount++;
              sumTpPips += tpDist * 10;
            } else {
              losses++;
              sumTpPips += tpDist * 10;
              const d = new Date(entryTime);
              const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
              monthlyLosses[mKey] = (monthlyLosses[mKey] || 0) + 1;
              monthlyR[mKey] = (monthlyR[mKey] || 0) - 1.0;
              cumulativeR -= 1.0;
              const dd = peakR - cumulativeR;
              if (dd > maxDD) maxDD = dd;
            }
            activeTradeUntilBar = i;
            break;
          }
        } else {
          if (c.low <= tpP) {
            wins++;
            sumTpPips += tpDist * 10;
            const d = new Date(entryTime);
            const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
            monthlyWins[mKey] = (monthlyWins[mKey] || 0) + 1;
            monthlyR[mKey] = (monthlyR[mKey] || 0) + rr;
            cumulativeR += rr;
            if (cumulativeR > peakR) peakR = cumulativeR;
            activeTradeUntilBar = i;
            break;
          } else if (c.high >= currSL) {
            if (isBE) {
              beCount++;
              sumTpPips += tpDist * 10;
            } else {
              losses++;
              sumTpPips += tpDist * 10;
              const d = new Date(entryTime);
              const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
              monthlyLosses[mKey] = (monthlyLosses[mKey] || 0) + 1;
              monthlyR[mKey] = (monthlyR[mKey] || 0) - 1.0;
              cumulativeR -= 1.0;
              const dd = peakR - cumulativeR;
              if (dd > maxDD) maxDD = dd;
            }
            activeTradeUntilBar = i;
            break;
          }
        }
      }
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

// Execute pre-cached search
const atr5 = computeATR(c5, 14);
const atr15 = computeATR(c15, 14);
const atr30 = computeATR(c30, 14);
const ema5 = computeEMA(c5, 100);
const ema15 = computeEMA(c15, 100);
const ema30 = computeEMA(c30, 100);

const tfList = [
  { name: 'M5', candles: c5, atr: atr5, ema: ema5 },
  { name: 'M15', candles: c15, atr: atr15, ema: ema15 },
  { name: 'M30', candles: c30, atr: atr30, ema: ema30 }
];

console.log('Extracting signal cache across timeframes...');
const startTime = Date.now();

const allCandidates = [];
const champions = [];

for (const tf of tfList) {
  for (const swMin of [2, 3, 4, 5]) {
    for (const swMaj of [4, 5, 6, 7, 8, 9, 10]) {
      if (swMaj <= swMin) continue;
      const rawSignals = extractRawSignals(tf.candles, tf.atr, tf.ema, swMin, swMaj, 35);

      for (const rr of [1.6, 1.8, 2.0, 2.2, 2.5, 2.8, 3.0, 3.3, 3.5, 4.0]) {
        for (const atrMult of [0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50]) {
          for (const beTriggerR of [0.0, 0.7, 0.8, 1.0, 1.2]) {
            for (const useEma of [false, true]) {
              for (const [minTp, maxTp] of [[7.8, 10.2], [8.0, 10.5], [7.5, 10.5], [7.0, 11.0]]) {
                const res = simulateRawSignals(tf.candles, rawSignals, {
                  rr, atrMult, minTp, maxTp, beTriggerR, useEma, expireBars: 35
                });

                if (res.closed >= 4 && res.avgTpPips >= 78 && res.avgTpPips <= 102) {
                  const item = { tfName: tf.name, swMin, swMaj, rr, atrMult, beTriggerR, useEma, minTp, maxTp, ...res };
                  allCandidates.push(item);
                  if (res.sepR >= 10.0 && res.octR >= 10.0 && res.maxDrawdown <= 3.5 && res.calmarRatio >= 4.0) {
                    champions.push(item);
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

const elapsedMs = Date.now() - startTime;
console.log(`Pre-cached search finished in ${elapsedMs} ms! Evaluated candidates: ${allCandidates.length}`);
console.log(`Found Dual-Month Champions: ${champions.length}`);

allCandidates.sort((a, b) => (Math.min(b.sepR, b.octR) - Math.min(a.sepR, a.octR)) || (b.cumulativeR - a.cumulativeR));
console.log('\nTop 20 Closest Candidates to Dual 10R with 80-100 Pips Avg TP:');
allCandidates.slice(0, 20).forEach((c, idx) => {
  console.log(`#${idx + 1}: [${c.tfName}] SwMin:${c.swMin} Maj:${c.swMaj} RR:${c.rr} ATR:${c.atrMult} BE:${c.beTriggerR}R EMA:${c.useEma} [${c.minTp}-${c.maxTp}] -> Sep:+${c.sepR}R Oct:+${c.octR}R Total:+${c.cumulativeR}R Calmar:${c.calmarRatio} DD:-${c.maxDrawdown}R WR:${c.winRate.toFixed(1)}% AvgTP:${c.avgTpPips}p Trades:${c.closed}`);
});

if (champions.length > 0) {
  champions.sort((a, b) => (b.cumulativeR * 1.5 + b.calmarRatio * 2) - (a.cumulativeR * 1.5 + a.calmarRatio * 2));
  console.log('\n================ CHAMPIONS ================');
  champions.slice(0, 10).forEach((c, idx) => {
    console.log(`WINNER #${idx + 1}: [${c.tfName}] SwMin:${c.swMin} Maj:${c.swMaj} RR:${c.rr} ATR:${c.atrMult} BE:${c.beTriggerR}R EMA:${c.useEma} [${c.minTp}-${c.maxTp}] -> Sep:+${c.sepR}R Oct:+${c.octR}R Total:+${c.cumulativeR}R Calmar:${c.calmarRatio} DD:-${c.maxDrawdown}R WR:${c.winRate.toFixed(1)}% AvgTP:${c.avgTpPips}p Trades:${c.closed}`);
  });
}
