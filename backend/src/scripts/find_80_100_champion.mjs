import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const c5 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_5m_tv.json'), 'utf8'));
const c15 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_15m_tv.json'), 'utf8'));

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
const ema50_5 = computeEMA(c5, 50);
const ema100_5 = computeEMA(c5, 100);
const ema200_5 = computeEMA(c5, 200);

const ema50_15 = computeEMA(c15, 50);
const ema100_15 = computeEMA(c15, 100);
const ema200_15 = computeEMA(c15, 200);

// Precompute Bull/Bear FVGs for candles
function precomputeFVGs(candles) {
  const n = candles.length;
  const bFvg = []; // { bar, top, bot }
  const sFvg = [];
  for (let i = 2; i < n; i++) {
    if (candles[i].low > candles[i - 2].high) {
      bFvg.push({ bar: i, top: candles[i].low, bot: candles[i - 2].high });
    }
    if (candles[i].high < candles[i - 2].low) {
      sFvg.push({ bar: i, top: candles[i - 2].low, bot: candles[i].high });
    }
  }
  return { bFvg, sFvg };
}

const fvgs5 = precomputeFVGs(c5);
const fvgs15 = precomputeFVGs(c15);

// Fast precomputation of pivots for given swMin and swMaj
function precomputeSweeps(candles, swMin, swMaj) {
  const n = candles.length;
  const bslLvls = [];
  const sslLvls = [];

  // Identify pivot points
  for (let i = swMaj * 2; i < n; i++) {
    // minor
    const p1 = i - swMin;
    let isH1 = true, isL1 = true;
    for (let j = i - swMin * 2; j <= i; j++) {
      if (j !== p1) {
        if (candles[j].high > candles[p1].high) isH1 = false;
        if (candles[j].low < candles[p1].low) isL1 = false;
      }
    }
    if (isH1) bslLvls.push({ bar: p1, price: candles[p1].high, swept: false });
    if (isL1) sslLvls.push({ bar: p1, price: candles[p1].low, swept: false });

    // major
    const p2 = i - swMaj;
    let isH2 = true, isL2 = true;
    for (let j = i - swMaj * 2; j <= i; j++) {
      if (j !== p2) {
        if (candles[j].high > candles[p2].high) isH2 = false;
        if (candles[j].low < candles[p2].low) isL2 = false;
      }
    }
    if (isH2) bslLvls.push({ bar: p2, price: candles[p2].high, swept: false });
    if (isL2) sslLvls.push({ bar: p2, price: candles[p2].low, swept: false });
  }

  // Pre-index sweeps by candle bar
  const sweepsByBar = new Array(n);
  for (let i = 0; i < n; i++) sweepsByBar[i] = { sslSweep: false, bslSweep: false, sweepLow: 0, sweepHigh: 0 };

  const activeBsl = [];
  const activeSsl = [];
  let bslPtr = 0;
  let sslPtr = 0;

  for (let i = 2; i < n; i++) {
    const c = candles[i];
    while (bslPtr < bslLvls.length && bslLvls[bslPtr].bar <= i) {
      activeBsl.push({ price: bslLvls[bslPtr].price, swept: false });
      if (activeBsl.length > 15) activeBsl.shift();
      bslPtr++;
    }
    while (sslPtr < sslLvls.length && sslLvls[sslPtr].bar <= i) {
      activeSsl.push({ price: sslLvls[sslPtr].price, swept: false });
      if (activeSsl.length > 15) activeSsl.shift();
      sslPtr++;
    }

    for (let k = 0; k < activeSsl.length; k++) {
      if (!activeSsl[k].swept && c.low < activeSsl[k].price && c.close > activeSsl[k].price) {
        activeSsl[k].swept = true;
        sweepsByBar[i].sslSweep = true;
        sweepsByBar[i].sweepLow = c.low;
      }
    }
    for (let k = 0; k < activeBsl.length; k++) {
      if (!activeBsl[k].swept && c.high > activeBsl[k].price && c.close < activeBsl[k].price) {
        activeBsl[k].swept = true;
        sweepsByBar[i].bslSweep = true;
        sweepsByBar[i].sweepHigh = c.high;
      }
    }
  }

  return sweepsByBar;
}

// Fast candidate simulator using precomputed sweeps & FVGs
function runSim(candles, atr, ema, sweeps, fvgs, {
  minTpPips = 80,
  maxTpPips = 100,
  rr = 3.2,
  atrMult = 0.25,
  beTriggerR = 0.8,
  lockInTriggerR = 1.4,
  maxDailyLosses = 2,
  useSessionFilter = false, // 07:00 to 18:00 UTC (London + NY)
  useEmaFilter = false,
  expireBars = 35,
  slType = 'pivot' // 'pivot' (sweepLow) or 'fvg' (fBot)
}) {
  const n = candles.length;
  const minTp = minTpPips / 10;
  const maxTp = maxTpPips / 10;

  const sigDir = [], sigEntry = [], sigSL = [], sigTP = [];
  const sigResult = [], sigBar = [], sigRVal = [], sigEntryTime = [], sigIsBE = [], sigIsLocked = [];
  const monthlyWins = {}, monthlyLosses = {}, monthlyR = {};
  const dailyLossCount = {};

  let cumulativeR = 0, peakR = 0, maxDD = 0;
  let lookLong = false, lookShort = false;
  let setupBarL = 0, setupBarS = 0;
  let setupSLL = 0, setupSLS = 0;

  let fvgBPtr = 0;
  let fvgSPtr = 0;
  const recentBFvg = [];
  const recentSFvg = [];

  for (let i = 2; i < n; i++) {
    const c = candles[i];
    const timeMs = c.openTime || c.time;
    const d = new Date(timeMs);
    const dayKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
    const hour = d.getUTCHours();

    const isDailyBlocked = (dailyLossCount[dayKey] || 0) >= maxDailyLosses;
    const isSessionAllowed = !useSessionFilter || (hour >= 7 && hour < 18);

    // Update active recent FVGs
    while (fvgBPtr < fvgs.bFvg.length && fvgs.bFvg[fvgBPtr].bar <= i) {
      recentBFvg.push(fvgs.bFvg[fvgBPtr]);
      if (recentBFvg.length > 30) recentBFvg.shift();
      fvgBPtr++;
    }
    while (fvgSPtr < fvgs.sFvg.length && fvgs.sFvg[fvgSPtr].bar <= i) {
      recentSFvg.push(fvgs.sFvg[fvgSPtr]);
      if (recentSFvg.length > 30) recentSFvg.shift();
      fvgSPtr++;
    }

    const sw = sweeps[i];
    if (sw.sslSweep && isSessionAllowed && !isDailyBlocked) {
      if (!useEmaFilter || c.close > ema[i]) {
        lookLong = true; lookShort = false; setupBarL = i;
        setupSLL = sw.sweepLow - atr[i] * atrMult;
      }
    }
    if (sw.bslSweep && isSessionAllowed && !isDailyBlocked) {
      if (!useEmaFilter || c.close < ema[i]) {
        lookShort = true; lookLong = false; setupBarS = i;
        setupSLS = sw.sweepHigh + atr[i] * atrMult;
      }
    }

    // Trade resolution
    for (let t = 0; t < sigDir.length; t++) {
      if (sigResult[t] === 0) {
        const dir = sigDir[t];
        const tp = sigTP[t];
        const entry = sigEntry[t];
        const age = i - sigBar[t];
        const holdSec = (timeMs - sigEntryTime[t]) / 1000;
        let resolved = false;

        const slDistInit = Math.abs(entry - (dir === 1 ? sigSL[t] : sigSL[t]));
        const currentGain = dir === 1 ? (c.high - entry) : (entry - c.low);

        if (beTriggerR > 0 && !sigIsBE[t] && currentGain >= slDistInit * beTriggerR) {
          sigSL[t] = entry;
          sigIsBE[t] = true;
        }

        if (lockInTriggerR > 0 && !sigIsLocked[t] && currentGain >= slDistInit * lockInTriggerR) {
          sigSL[t] = dir === 1 ? (entry + slDistInit * 0.5) : (entry - slDistInit * 0.5);
          sigIsLocked[t] = true;
        }

        if (age >= 120) {
          resolved = true;
          sigResult[t] = 2; // Expired
        } else if (holdSec >= 120) {
          if (dir === 1) {
            if (c.high >= tp) { sigResult[t] = 1; resolved = true; }
            else if (c.low <= sigSL[t]) { sigResult[t] = sigIsLocked[t] ? 4 : sigIsBE[t] ? 3 : -1; resolved = true; }
          } else {
            if (c.low <= tp) { sigResult[t] = 1; resolved = true; }
            else if (c.high >= sigSL[t]) { sigResult[t] = sigIsLocked[t] ? 4 : sigIsBE[t] ? 3 : -1; resolved = true; }
          }
        }

        if (resolved) {
          const finalRes = sigResult[t];
          const rOutcome = finalRes === 1 ? sigRVal[t] : finalRes === 4 ? 0.5 : finalRes === 3 ? 0.0 : -1.0;
          if (finalRes === 1 || finalRes === -1 || finalRes === 3 || finalRes === 4) {
            const entryD = new Date(sigEntryTime[t]);
            const mKey = `${entryD.getUTCFullYear()}-${String(entryD.getUTCMonth() + 1).padStart(2, '0')}`;
            const tDayKey = `${entryD.getUTCFullYear()}-${String(entryD.getUTCMonth()+1).padStart(2,'0')}-${String(entryD.getUTCDate()).padStart(2,'0')}`;

            if (!monthlyWins[mKey]) { monthlyWins[mKey] = 0; monthlyLosses[mKey] = 0; monthlyR[mKey] = 0; }

            if (finalRes === 1 || finalRes === 4) {
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
              dailyLossCount[tDayKey] = (dailyLossCount[tDayKey] || 0) + 1;
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

    // Trigger entries
    if (lookLong && !hasOpen && !isDailyBlocked && isSessionAllowed) {
      for (let f = recentBFvg.length - 1; f >= 0; f--) {
        if (recentBFvg[f].bar > setupBarL) {
          const { top: fTop, bot: fBot } = recentBFvg[f];
          if (c.low <= fTop && c.close > fBot) {
            const entryP = c.close;
            const slP = slType === 'pivot' ? setupSLL : (fBot - atr[i] * atrMult);
            const slDist = entryP - slP;

            if (slDist > 0.8) {
              const tpDist = slDist * rr;
              if (tpDist >= minTp && tpDist <= maxTp) {
                const tpP = entryP + tpDist;
                sigDir.push(1); sigEntry.push(entryP); sigSL.push(slP); sigTP.push(tpP);
                sigResult.push(0); sigBar.push(i); sigRVal.push(rr); sigEntryTime.push(timeMs);
                sigIsBE.push(false); sigIsLocked.push(false);
                lookLong = false; break;
              }
            }
          }
        }
      }
    }

    if (lookShort && !hasOpen && !isDailyBlocked && isSessionAllowed) {
      for (let f = recentSFvg.length - 1; f >= 0; f--) {
        if (recentSFvg[f].bar > setupBarS) {
          const { top: fTop, bot: fBot } = recentSFvg[f];
          if (c.high >= fBot && c.close < fTop) {
            const entryP = c.close;
            const slP = slType === 'pivot' ? setupSLS : (fTop + atr[i] * atrMult);
            const slDist = slP - entryP;

            if (slDist > 0.8) {
              const tpDist = slDist * rr;
              if (tpDist >= minTp && tpDist <= maxTp) {
                const tpP = entryP - tpDist;
                sigDir.push(-1); sigEntry.push(entryP); sigSL.push(slP); sigTP.push(tpP);
                sigResult.push(0); sigBar.push(i); sigRVal.push(rr); sigEntryTime.push(timeMs);
                sigIsBE.push(false); sigIsLocked.push(false);
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
    if (sigResult[t] === 1 || sigResult[t] === 4) wins++;
    if (sigResult[t] === -1) losses++;
    if (sigResult[t] === 3) beCount++;
    if (sigResult[t] === 1 || sigResult[t] === -1 || sigResult[t] === 3 || sigResult[t] === 4) {
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

console.log('Precomputing sweeps...');
const sweepCache5 = {};
const sweepCache15 = {};

const pivotPairs = [
  [3, 6], [3, 7], [3, 8],
  [4, 7], [4, 8], [4, 10],
  [5, 8], [5, 10], [5, 12],
  [6, 12], [6, 15]
];

for (const [min, maj] of pivotPairs) {
  const key = `${min}_${maj}`;
  sweepCache5[key] = precomputeSweeps(c5, min, maj);
  sweepCache15[key] = precomputeSweeps(c15, min, maj);
}
console.log('Sweeps precomputed!');

const champions = [];
const allResults = [];

const timeframes = [
  { name: 'M5', candles: c5, atr: atr5, ema50: ema50_5, ema100: ema100_5, ema200: ema200_5, sweeps: sweepCache5, fvgs: fvgs5 },
  { name: 'M15', candles: c15, atr: atr15, ema50: ema50_15, ema100: ema100_15, ema200: ema200_15, sweeps: sweepCache15, fvgs: fvgs15 }
];

for (const tf of timeframes) {
  for (const [swMin, swMaj] of pivotPairs) {
    const sweeps = tf.sweeps[`${swMin}_${swMaj}`];
    for (const slType of ['pivot', 'fvg']) {
      for (const rr of [2.8, 3.0, 3.2, 3.4, 3.6, 3.8, 4.0]) {
        for (const atrMult of [0.15, 0.20, 0.25, 0.30, 0.35, 0.40]) {
          for (const beTriggerR of [0.6, 0.8, 1.0, 1.2]) {
            for (const lockInTriggerR of [0.0, 1.4, 1.6, 1.8]) {
              for (const maxDailyLosses of [1, 2, 3]) {
                for (const useSessionFilter of [false, true]) {
                  for (const useEmaFilter of [false, true]) {
                    const ema = tf.ema100;
                    const res = runSim(tf.candles, tf.atr, ema, sweeps, tf.fvgs, {
                      minTpPips: 80,
                      maxTpPips: 100,
                      rr,
                      atrMult,
                      beTriggerR,
                      lockInTriggerR,
                      maxDailyLosses,
                      useSessionFilter,
                      useEmaFilter,
                      slType
                    });

                    if (res.closed >= 4 && res.avgTpPips >= 80.0 && res.avgTpPips <= 100.0) {
                      const item = {
                        tf: tf.name, swMin, swMaj, slType, rr, atrMult, beTriggerR, lockInTriggerR,
                        maxDailyLosses, useSessionFilter, useEmaFilter, ...res
                      };
                      allResults.push(item);

                      if (res.sepR >= 10.0 && res.octR >= 10.0 && res.maxDrawdown <= 3.5 && res.calmarRatio >= 4.0) {
                        champions.push(item);
                        console.log(`>>> CHAMPION! [${tf.name}] Sw:${swMin}/${swMaj} ${slType} RR:${rr} ATR:${atrMult} BE:${beTriggerR} Lock:${lockInTriggerR} Daily:${maxDailyLosses} Sess:${useSessionFilter} EMA:${useEmaFilter} -> Sep:+${res.sepR}R Oct:+${res.octR}R Tot:+${res.cumulativeR}R Calmar:${res.calmarRatio} DD:-${res.maxDrawdown}R WR:${res.winRate.toFixed(1)}% Trades:${res.closed} AvgTP:${res.avgTpPips}p`);
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

console.log(`\nGrid search done! Total candidates evaluated: ${allResults.length}, Champions meeting ALL criteria: ${champions.length}`);

if (champions.length > 0) {
  champions.sort((a,b) => (b.cumulativeR * 1.5 + b.calmarRatio * 2) - (a.cumulativeR * 1.5 + a.calmarRatio * 2));
  console.log('\nTop Champions (Dual Month >= 10R, AvgTP 80-100p, Calmar > 4.0, Max DD <= 3.5R):');
  champions.slice(0, 10).forEach((c, idx) => {
    console.log(`WINNER #${idx+1}: [${c.tf}] Sw:${c.swMin}/${c.swMaj} ${c.slType} RR:${c.rr} ATR:${c.atrMult} BE:${c.beTriggerR}R Lock:${c.lockInTriggerR}R Daily:${c.maxDailyLosses} Sess:${c.useSessionFilter} EMA:${c.useEmaFilter} -> Sep:+${c.sepR}R Oct:+${c.octR}R Tot:+${c.cumulativeR}R Calmar:${c.calmarRatio} DD:-${c.maxDrawdown}R WR:${c.winRate.toFixed(1)}% Trades:${c.closed} AvgTP:${c.avgTpPips}p`);
  });
  fs.writeFileSync(path.join(DATA_DIR, 'champions_80_100_pips.json'), JSON.stringify(champions, null, 2));
} else {
  console.log('\nSearching closest frontier...');
  allResults.sort((a,b) => (Math.min(b.sepR, b.octR) - Math.min(a.sepR, a.octR)) || (b.cumulativeR - a.cumulativeR));
  allResults.slice(0, 15).forEach((c, idx) => {
    console.log(`CLOSEST #${idx+1}: [${c.tf}] Sw:${c.swMin}/${c.swMaj} ${c.slType} RR:${c.rr} ATR:${c.atrMult} BE:${c.beTriggerR}R Lock:${c.lockInTriggerR}R Daily:${c.maxDailyLosses} Sess:${c.useSessionFilter} EMA:${c.useEmaFilter} -> Sep:+${c.sepR}R Oct:+${c.octR}R Tot:+${c.cumulativeR}R Calmar:${c.calmarRatio} DD:-${c.maxDrawdown}R WR:${c.winRate.toFixed(1)}% Trades:${c.closed} AvgTP:${c.avgTpPips}p`);
  });
}
