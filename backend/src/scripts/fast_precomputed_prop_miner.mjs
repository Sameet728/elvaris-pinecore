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
const atr15 = computeATR(c15, 14);
const ema100_5 = computeEMA(c5, 100);
const ema100_15 = computeEMA(c15, 100);

// Pre-extract trade events
function extractEvents(candles, atr, ema, swMin, swMaj, minFvgAtr = 0.2, expireBars = 35) {
  const n = candles.length;
  const bslLvls = [], bslSwept = [];
  const sslLvls = [], sslSwept = [];
  const bFvgTop = [], bFvgBot = [], bFvgBar = [];
  const sFvgTop = [], sFvgBot = [], sFvgBar = [];

  let lookLong = false, lookShort = false;
  let setupBarL = 0, setupBarS = 0;

  const events = [];

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
      const sz = c.low - prev2C.high;
      if (sz >= atr[i] * minFvgAtr) {
        bFvgTop.push(c.low); bFvgBot.push(prev2C.high); bFvgBar.push(i);
        if (bFvgTop.length > 30) { bFvgTop.shift(); bFvgBot.shift(); bFvgBar.shift(); }
      }
    }
    if (c.high < prev2C.low) {
      const sz = prev2C.low - c.high;
      if (sz >= atr[i] * minFvgAtr) {
        sFvgTop.push(prev2C.low); sFvgBot.push(c.high); sFvgBar.push(i);
        if (sFvgTop.length > 30) { sFvgTop.shift(); sFvgBot.shift(); sFvgBar.shift(); }
      }
    }

    // Sweeps
    for (let k = 0; k < sslLvls.length; k++) {
      if (!sslSwept[k] && c.low < sslLvls[k] && c.close > sslLvls[k]) {
        sslSwept[k] = true;
        if (c.close > ema[i]) {
          lookLong = true; lookShort = false; setupBarL = i;
        }
      }
    }
    for (let k = 0; k < bslLvls.length; k++) {
      if (!bslSwept[k] && c.high > bslLvls[k] && c.close < bslLvls[k]) {
        bslSwept[k] = true;
        if (c.close < ema[i]) {
          lookShort = true; lookLong = false; setupBarS = i;
        }
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
            const d = new Date(timeMs);
            events.push({
              bar: i,
              time: timeMs,
              dir: 1,
              entryP: c.close,
              fvgBound: fBot,
              atrVal: atr[i],
              utcHour: d.getUTCHours(),
              dayKey: `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`,
              monthKey: `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`
            });
            lookLong = false; break;
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
            const d = new Date(timeMs);
            events.push({
              bar: i,
              time: timeMs,
              dir: -1,
              entryP: c.close,
              fvgBound: fTop,
              atrVal: atr[i],
              utcHour: d.getUTCHours(),
              dayKey: `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`,
              monthKey: `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`
            });
            lookShort = false; break;
          }
        }
      }
    }
  }

  return events;
}

// Fast simulation over pre-extracted events
function evalPrecomputed(candles, events, {
  atrMult = 0.20,
  tpPips = 85,
  beTriggerR = 0.8,
  lockInTriggerR = 1.5,
  maxDailyLosses = 2,
  useSessionFilter = false,
  expireBars = 35,
  minHoldSeconds = 120
}) {
  const monthlyWins = {};
  const monthlyLosses = {};
  const monthlyR = {};
  const dailyLosses = {};

  let cumulativeR = 0, peakR = 0, maxDD = 0;
  let wins = 0, losses = 0, beCount = 0;
  let activeUntilBar = -1;

  const tpDist = tpPips / 10;

  for (let e = 0; e < events.length; e++) {
    const ev = events[e];
    if (ev.bar < activeUntilBar) continue;

    // Session filter
    if (useSessionFilter) {
      const inSession = (ev.utcHour >= 6 && ev.utcHour < 11) || (ev.utcHour >= 12 && ev.utcHour < 19);
      if (!inSession) continue;
    }

    // Daily loss filter
    if ((dailyLosses[ev.dayKey] || 0) >= maxDailyLosses) continue;

    const dir = ev.dir;
    const entryP = ev.entryP;
    const slP = dir === 1 ? (ev.fvgBound - ev.atrVal * atrMult) : (ev.fvgBound + ev.atrVal * atrMult);
    const slDist = Math.abs(entryP - slP);

    if (slDist < 0.6 || slDist > 4.5) continue;

    const tpP = dir === 1 ? (entryP + tpDist) : (entryP - tpDist);
    const tradeRR = tpDist / slDist;

    let currSL = slP;
    let isBE = false;
    let isLocked = false;
    const entryTime = ev.time;

    const maxBar = Math.min(candles.length - 1, ev.bar + expireBars * 3);
    for (let i = ev.bar; i <= maxBar; i++) {
      const c = candles[i];
      const holdSec = (c.time - entryTime) / 1000;
      const gain = dir === 1 ? (c.high - entryP) : (entryP - c.low);

      // Breakeven check
      if (beTriggerR > 0 && !isBE && gain >= slDist * beTriggerR) {
        currSL = entryP;
        isBE = true;
      }

      // Lock-in check
      if (lockInTriggerR > 0 && !isLocked && gain >= slDist * lockInTriggerR) {
        currSL = dir === 1 ? (entryP + slDist * 0.5) : (entryP - slDist * 0.5);
        isLocked = true;
      }

      if (i === maxBar) {
        activeUntilBar = i;
        break; // Expired
      }

      if (holdSec >= minHoldSeconds) {
        if (dir === 1) {
          if (c.high >= tpP) {
            wins++;
            const mKey = ev.monthKey;
            monthlyWins[mKey] = (monthlyWins[mKey] || 0) + 1;
            monthlyR[mKey] = (monthlyR[mKey] || 0) + tradeRR;
            cumulativeR += tradeRR;
            if (cumulativeR > peakR) peakR = cumulativeR;
            activeUntilBar = i;
            break;
          } else if (c.low <= currSL) {
            const mKey = ev.monthKey;
            if (isLocked) {
              wins++;
              monthlyWins[mKey] = (monthlyWins[mKey] || 0) + 1;
              monthlyR[mKey] = (monthlyR[mKey] || 0) + 0.5;
              cumulativeR += 0.5;
              if (cumulativeR > peakR) peakR = cumulativeR;
            } else if (isBE) {
              beCount++;
            } else {
              losses++;
              monthlyLosses[mKey] = (monthlyLosses[mKey] || 0) + 1;
              monthlyR[mKey] = (monthlyR[mKey] || 0) - 1.0;
              cumulativeR -= 1.0;
              const dd = peakR - cumulativeR;
              if (dd > maxDD) maxDD = dd;
              dailyLosses[ev.dayKey] = (dailyLosses[ev.dayKey] || 0) + 1;
            }
            activeUntilBar = i;
            break;
          }
        } else {
          if (c.low <= tpP) {
            wins++;
            const mKey = ev.monthKey;
            monthlyWins[mKey] = (monthlyWins[mKey] || 0) + 1;
            monthlyR[mKey] = (monthlyR[mKey] || 0) + tradeRR;
            cumulativeR += tradeRR;
            if (cumulativeR > peakR) peakR = cumulativeR;
            activeUntilBar = i;
            break;
          } else if (c.high >= currSL) {
            const mKey = ev.monthKey;
            if (isLocked) {
              wins++;
              monthlyWins[mKey] = (monthlyWins[mKey] || 0) + 1;
              monthlyR[mKey] = (monthlyR[mKey] || 0) + 0.5;
              cumulativeR += 0.5;
              if (cumulativeR > peakR) peakR = cumulativeR;
            } else if (isBE) {
              beCount++;
            } else {
              losses++;
              monthlyLosses[mKey] = (monthlyLosses[mKey] || 0) + 1;
              monthlyR[mKey] = (monthlyR[mKey] || 0) - 1.0;
              cumulativeR -= 1.0;
              const dd = peakR - cumulativeR;
              if (dd > maxDD) maxDD = dd;
              dailyLosses[ev.dayKey] = (dailyLosses[ev.dayKey] || 0) + 1;
            }
            activeUntilBar = i;
            break;
          }
        }
      }
    }
  }

  const closed = wins + losses + beCount;
  const calmar = maxDD > 0 ? cumulativeR / maxDD : cumulativeR;
  const sepR = monthlyR['2026-09'] || 0;
  const octR = monthlyR['2026-10'] || 0;

  return {
    closed, wins, losses, beCount,
    winRate: (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0,
    cumulativeR: Number(cumulativeR.toFixed(1)),
    maxDrawdown: Number(maxDD.toFixed(1)),
    calmarRatio: Number(calmar.toFixed(2)),
    avgTpPips: tpPips,
    sepR: Number(sepR.toFixed(1)),
    octR: Number(octR.toFixed(1)),
    monthlyWins, monthlyLosses, monthlyR
  };
}

console.log('Running Precomputed Multi-Grid Search for 80-100 Pip Champions...');
const startTime = Date.now();
const champions = [];
const allResults = [];

const timeframes = [
  { name: 'M5', candles: c5, atr: atr5, ema: ema100_5 },
  { name: 'M15', candles: c15, atr: atr15, ema: ema100_15 }
];

for (const tf of timeframes) {
  for (const swMin of [2, 3, 4]) {
    for (const swMaj of [5, 6, 7, 8]) {
      for (const minFvgAtr of [0.15, 0.25, 0.35]) {
        const events = extractEvents(tf.candles, tf.atr, tf.ema, swMin, swMaj, minFvgAtr, 35);
        if (events.length < 5) continue;

        for (const tpPips of [80, 85, 90, 95, 100]) {
          for (const atrMult of [0.10, 0.15, 0.20, 0.25, 0.30]) {
            for (const beTriggerR of [0.6, 0.8, 1.0, 1.2]) {
              for (const lockInTriggerR of [0.0, 1.4, 1.6]) {
                for (const maxDailyLosses of [1, 2, 3]) {
                  for (const useSessionFilter of [false, true]) {
                    const res = evalPrecomputed(tf.candles, events, {
                      atrMult, tpPips, beTriggerR, lockInTriggerR, maxDailyLosses, useSessionFilter,
                      expireBars: 35, minHoldSeconds: 120
                    });

                    if (res.closed >= 4) {
                      const item = {
                        tf: tf.name, swMin, swMaj, minFvgAtr, tpPips, atrMult, beTriggerR,
                        lockInTriggerR, maxDailyLosses, useSessionFilter, ...res
                      };
                      allResults.push(item);

                      if (res.sepR >= 10.0 && res.octR >= 10.0 && res.maxDrawdown <= 3.5 && res.calmarRatio >= 4.0) {
                        champions.push(item);
                        console.log(`>>> CHAMPION! [${tf.name}] SwMin:${swMin} Maj:${swMaj} TP:${tpPips}p ATR:${atrMult} BE:${beTriggerR}R Lock:${lockInTriggerR} Daily:${maxDailyLosses} Session:${useSessionFilter} -> Sep:+${res.sepR}R Oct:+${res.octR}R Total:+${res.cumulativeR}R Calmar:${res.calmarRatio} MaxDD:-${res.maxDrawdown}R WR:${res.winRate.toFixed(1)}% Trades:${res.closed}`);
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
  }
}

const elapsedMs = Date.now() - startTime;
console.log(`\nCompleted ${allResults.length} configurations in ${elapsedMs} ms! Champions found: ${champions.length}`);

if (champions.length > 0) {
  champions.sort((a,b) => (b.cumulativeR * 1.5 + b.calmarRatio * 2) - (a.cumulativeR * 1.5 + a.calmarRatio * 2));
  console.log('\nTop 10 Champions:');
  champions.slice(0, 10).forEach((c, idx) => {
    console.log(`#${idx+1}: [${c.tf}] SwMin:${c.swMin} Maj:${c.swMaj} TP:${c.tpPips}p ATR:${c.atrMult} BE:${c.beTriggerR}R Lock:${c.lockInTriggerR} DailyLoss:${c.maxDailyLosses} Session:${c.useSessionFilter} -> Sep:+${c.sepR}R Oct:+${c.octR}R Total:+${c.cumulativeR}R Calmar:${c.calmarRatio} DD:-${c.maxDrawdown}R WR:${c.winRate.toFixed(1)}% Trades:${c.closed}`);
  });

  fs.writeFileSync(path.join(DATA_DIR, 'champions_80_100_pips.json'), JSON.stringify(champions, null, 2));
  console.log(`Saved champions to ${path.join(DATA_DIR, 'champions_80_100_pips.json')}`);
} else {
  allResults.sort((a,b) => (Math.min(b.sepR, b.octR) - Math.min(a.sepR, a.octR)) || (b.cumulativeR - a.cumulativeR));
  console.log('\nTop 15 Closest Strategies:');
  allResults.slice(0, 15).forEach((c, idx) => {
    console.log(`#${idx+1}: [${c.tf}] SwMin:${c.swMin} Maj:${c.swMaj} TP:${c.tpPips}p ATR:${c.atrMult} BE:${c.beTriggerR}R Lock:${c.lockInTriggerR} DailyLoss:${c.maxDailyLosses} Session:${c.useSessionFilter} -> Sep:+${c.sepR}R Oct:+${c.octR}R Total:+${c.cumulativeR}R Calmar:${c.calmarRatio} DD:-${c.maxDrawdown}R WR:${c.winRate.toFixed(1)}% Trades:${c.closed}`);
  });
}
