import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

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

function computeATR(candles, period = 14) {
  const atr = new Float64Array(candles.length);
  let sum = 0;
  for (let i = 1; i <= period; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    sum += tr;
  }
  atr[period] = sum / period;
  for (let i = period + 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    atr[i] = (atr[i - 1] * (period - 1) + tr) / period;
  }
  return atr;
}

function precomputeSweeps(candles, swMin, swMaj) {
  const n = candles.length;
  const bslLvls = [];
  const sslLvls = [];

  for (let i = swMaj * 2; i < n; i++) {
    const p1 = i - swMin;
    let isH1 = true, isL1 = true;
    for (let j = i - swMin * 2; j <= i; j++) {
      if (j !== p1) {
        if (candles[j].high > candles[p1].high) isH1 = false;
        if (candles[j].low < candles[p1].low) isL1 = false;
      }
    }
    if (isH1) bslLvls.push({ bar: p1, price: candles[p1].high });
    if (isL1) sslLvls.push({ bar: p1, price: candles[p1].low });

    const p2 = i - swMaj;
    let isH2 = true, isL2 = true;
    for (let j = i - swMaj * 2; j <= i; j++) {
      if (j !== p2) {
        if (candles[j].high > candles[p2].high) isH2 = false;
        if (candles[j].low < candles[p2].low) isL2 = false;
      }
    }
    if (isH2) bslLvls.push({ bar: p2, price: candles[p2].high });
    if (isL2) sslLvls.push({ bar: p2, price: candles[p2].low });
  }

  const sweeps = new Array(n);
  const activeBsl = [];
  const activeSsl = [];
  let bslPtr = 0, sslPtr = 0;

  for (let i = 0; i < n; i++) {
    sweeps[i] = { sslSweep: false, bslSweep: false };
    if (i < 2) continue;
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
        sweeps[i].sslSweep = true;
      }
    }
    for (let k = 0; k < activeBsl.length; k++) {
      if (!activeBsl[k].swept && c.high > activeBsl[k].price && c.close < activeBsl[k].price) {
        activeBsl[k].swept = true;
        sweeps[i].bslSweep = true;
      }
    }
  }

  return sweeps;
}

function loadTimeframe(name, filename) {
  const p = path.join(DATA_DIR, filename);
  if (!fs.existsSync(p)) return null;
  const candles = JSON.parse(fs.readFileSync(p, 'utf8'));
  const n = candles.length;

  const dayKeys = new Array(n);
  const monthKeys = new Array(n);
  const timeMsArr = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const t = candles[i].openTime || candles[i].time;
    timeMsArr[i] = t;
    const d = new Date(t);
    dayKeys[i] = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
    monthKeys[i] = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
  }

  const bFvgsPerBar = new Array(n);
  const sFvgsPerBar = new Array(n);
  const curBFvg = [];
  const curSFvg = [];

  for (let i = 0; i < n; i++) {
    if (i >= 2) {
      if (candles[i].low > candles[i - 2].high) {
        curBFvg.push({ bar: i, top: candles[i].low, bot: candles[i - 2].high });
        if (curBFvg.length > 10) curBFvg.shift();
      }
      if (candles[i].high < candles[i - 2].low) {
        curSFvg.push({ bar: i, top: candles[i - 2].low, bot: candles[i].high });
        if (curSFvg.length > 10) curSFvg.shift();
      }
    }
    bFvgsPerBar[i] = [...curBFvg];
    sFvgsPerBar[i] = [...curSFvg];
  }

  const atr = computeATR(candles, 14);

  const emas = {
    EMA50: computeEMA(candles, 50),
    EMA75: computeEMA(candles, 75),
    EMA80: computeEMA(candles, 80),
    EMA100: computeEMA(candles, 100),
    EMA120: computeEMA(candles, 120),
    EMA150: computeEMA(candles, 150),
    EMA200: computeEMA(candles, 200)
  };

  const sweepCache = {
    '2_4': precomputeSweeps(candles, 2, 4),
    '3_5': precomputeSweeps(candles, 3, 5),
    '3_6': precomputeSweeps(candles, 3, 6),
    '3_7': precomputeSweeps(candles, 3, 7),
    '4_6': precomputeSweeps(candles, 4, 6),
    '4_7': precomputeSweeps(candles, 4, 7),
    '4_8': precomputeSweeps(candles, 4, 8),
    '5_8': precomputeSweeps(candles, 5, 8),
  };

  return {
    name, candles, n, dayKeys, monthKeys, timeMsArr,
    fvgMap: { bFvgsPerBar, sFvgsPerBar },
    atr, emas, sweepCache
  };
}

function simulateStrategy(tfData, sweepKey, {
  emaKey = 'EMA100',
  tpPips = 82,
  atrMult = 0.20,
  beTriggerR = 1.4,
  lockInTriggerR = 1.7,
  lockInValR = 1.0,
  cooldownBars = 20,
  consecutiveLossLimit = 2,
  maxDailyLosses = 3,
  expireBars = 35,
  minHoldSec = 120
}) {
  const { candles, n, dayKeys, monthKeys, timeMsArr, fvgMap, atr, emas, sweepCache } = tfData;
  const ema = emas[emaKey];
  const sweeps = sweepCache[sweepKey];
  if (!ema || !sweeps) return null;

  const tpDist = tpPips / 10.0;
  const monthlyWins = {}, monthlyLosses = {}, monthlyR = {};

  let cumulativeR = 0, peakR = 0, maxDD = 0;
  let lookLong = false, lookShort = false;
  let setupBarL = 0, setupBarS = 0;

  let consecutiveLosses = 0;
  let cooldownUntilBar = -1;
  const dailyLossCount = {};
  let openTrade = null;
  let wins = 0, losses = 0, beCount = 0;
  const allTrades = [];

  for (let i = 2; i < n; i++) {
    const c = candles[i];
    const timeMs = timeMsArr[i];
    const dayKey = dayKeys[i];

    const isCooldown = i < cooldownUntilBar;
    const isDailyBlocked = (dailyLossCount[dayKey] || 0) >= maxDailyLosses;

    const sw = sweeps[i];
    if (sw.sslSweep && c.close > ema[i] && !isCooldown && !isDailyBlocked) {
      lookLong = true; lookShort = false; setupBarL = i;
    }
    if (sw.bslSweep && c.close < ema[i] && !isCooldown && !isDailyBlocked) {
      lookShort = true; lookLong = false; setupBarS = i;
    }

    if (openTrade !== null) {
      const t = openTrade;
      const dir = t.dir;
      const tp = t.tp;
      const entry = t.entry;
      const age = i - t.bar;
      const holdSec = (timeMs - t.entryTime) / 1000;
      let resolved = false;
      let finalRes = 0;

      const slDistInit = Math.abs(entry - t.initSL);
      const currentGain = dir === 1 ? (c.high - entry) : (entry - c.low);

      if (beTriggerR > 0 && !t.isBE) {
        if (currentGain >= slDistInit * beTriggerR) {
          t.sl = entry;
          t.isBE = true;
        }
      }

      if (lockInTriggerR > 0 && !t.isLocked) {
        if (currentGain >= slDistInit * lockInTriggerR) {
          t.sl = dir === 1 ? (entry + slDistInit * lockInValR) : (entry - slDistInit * lockInValR);
          t.isLocked = true;
        }
      }

      if (age >= expireBars * 3) {
        finalRes = 2; resolved = true;
      } else if (holdSec >= minHoldSec) {
        if (dir === 1) {
          if (c.high >= tp) { finalRes = 1; resolved = true; }
          else if (c.low <= t.sl) { finalRes = t.isLocked ? 4 : t.isBE ? 3 : -1; resolved = true; }
        } else {
          if (c.low <= tp) { finalRes = 1; resolved = true; }
          else if (c.high >= t.sl) { finalRes = t.isLocked ? 4 : t.isBE ? 3 : -1; resolved = true; }
        }
      }

      if (resolved) {
        const rOutcome = finalRes === 1 ? t.rVal : finalRes === 4 ? lockInValR : finalRes === 3 ? 0.0 : -1.0;
        if (finalRes === 1 || finalRes === -1 || finalRes === 3 || finalRes === 4) {
          const mKey = monthKeys[t.bar];
          const tDayKey = dayKeys[t.bar];

          if (!monthlyWins[mKey]) { monthlyWins[mKey] = 0; monthlyLosses[mKey] = 0; monthlyR[mKey] = 0; }

          if (finalRes === 1 || finalRes === 4) {
            wins++;
            monthlyWins[mKey]++;
            monthlyR[mKey] += rOutcome;
            cumulativeR += rOutcome;
            if (cumulativeR > peakR) peakR = cumulativeR;
            consecutiveLosses = 0;
            allTrades.push(rOutcome);
          } else if (finalRes === -1) {
            losses++;
            monthlyLosses[mKey]++;
            monthlyR[mKey] -= 1.0;
            cumulativeR -= 1.0;
            const dd = peakR - cumulativeR;
            if (dd > maxDD) maxDD = dd;
            dailyLossCount[tDayKey] = (dailyLossCount[tDayKey] || 0) + 1;
            consecutiveLosses++;
            if (consecutiveLosses >= consecutiveLossLimit && cooldownBars > 0) {
              cooldownUntilBar = i + cooldownBars;
            }
            allTrades.push(-1.0);
          } else if (finalRes === 3) {
            beCount++;
            allTrades.push(0.0);
          }
        }
        openTrade = null;
      }
    }

    if (lookLong && (i - setupBarL) > expireBars) lookLong = false;
    if (lookShort && (i - setupBarS) > expireBars) lookShort = false;

    // Trigger entries
    if (lookLong && openTrade === null && !isCooldown && !isDailyBlocked) {
      const activeBFvgs = fvgMap.bFvgsPerBar[i];
      for (let f = activeBFvgs.length - 1; f >= 0; f--) {
        if (activeBFvgs[f].bar > setupBarL) {
          const { top: fTop, bot: fBot } = activeBFvgs[f];
          if (c.low <= fTop && c.close > fBot) {
            const entryP = c.close;
            const slP = fBot - atr[i] * atrMult;
            const slDist = entryP - slP;
            // Cap SL distance relative to TF
            const maxSlAllowed = Math.max(3.5, tpDist / 2.5);
            if (slDist > 0.6 && slDist < maxSlAllowed) {
              const tpP = entryP + tpDist;
              openTrade = {
                dir: 1, entry: entryP, sl: slP, initSL: slP, tp: tpP,
                bar: i, rVal: tpDist / slDist, entryTime: timeMs, isBE: false, isLocked: false
              };
              lookLong = false;
              break;
            }
          }
        }
      }
    }

    if (lookShort && openTrade === null && !isCooldown && !isDailyBlocked) {
      const activeSFvgs = fvgMap.sFvgsPerBar[i];
      for (let f = activeSFvgs.length - 1; f >= 0; f--) {
        if (activeSFvgs[f].bar > setupBarS) {
          const { top: fTop, bot: fBot } = activeSFvgs[f];
          if (c.high >= fBot && c.close < fTop) {
            const entryP = c.close;
            const slP = fTop + atr[i] * atrMult;
            const slDist = slP - entryP;
            const maxSlAllowed = Math.max(3.5, tpDist / 2.5);
            if (slDist > 0.6 && slDist < maxSlAllowed) {
              const tpP = entryP - tpDist;
              openTrade = {
                dir: -1, entry: entryP, sl: slP, initSL: slP, tp: tpP,
                bar: i, rVal: tpDist / slDist, entryTime: timeMs, isBE: false, isLocked: false
              };
              lookShort = false;
              break;
            }
          }
        }
      }
    }
  }

  const closed = wins + losses + beCount;
  const calmar = maxDD > 0 ? cumulativeR / maxDD : cumulativeR;
  const sepR = monthlyR['2026-09'] || 0;
  const octR = monthlyR['2026-10'] || 0;

  // Composite Score rewarding Bigger Pips, High RR, Dual Month Consistency
  const score = (cumulativeR * 2.5) + (calmar * 15.0) + (Math.min(sepR, octR) * 10.0) + (tpPips * 0.3) - (maxDD * 12.0);

  return {
    tf: tfData.name,
    closed, wins, losses, beCount,
    winRate: (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0,
    cumulativeR: Number(cumulativeR.toFixed(1)),
    maxDrawdown: Number(maxDD.toFixed(1)),
    calmarRatio: Number(calmar.toFixed(2)),
    avgTpPips: tpPips,
    sepR: Number(sepR.toFixed(1)),
    octR: Number(octR.toFixed(1)),
    score: Number(score.toFixed(1)),
    allTrades,
    monthlyWins, monthlyLosses, monthlyR
  };
}

function runMonteCarlo(tradeRs, iterations = 1000) {
  if (!tradeRs || tradeRs.length < 5) return null;
  const closed = tradeRs.filter(r => r !== 0);
  const n = closed.length;
  const simDDs = [];
  const simCumRs = [];

  for (let iter = 0; iter < iterations; iter++) {
    let cumR = 0, peak = 0, maxDD = 0;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(Math.random() * n);
      const r = closed[idx];
      cumR += r;
      if (cumR > peak) peak = cumR;
      const dd = peak - cumR;
      if (dd > maxDD) maxDD = dd;
    }
    simDDs.push(maxDD);
    simCumRs.push(cumR);
  }

  simDDs.sort((a,b) => a - b);
  simCumRs.sort((a,b) => a - b);

  const p = (arr, pct) => arr[Math.floor((pct / 100) * arr.length)];
  const probDDUnder5R = (simDDs.filter(d => d <= 5.0).length / iterations) * 100;
  const probDDUnder6R = (simDDs.filter(d => d <= 6.0).length / iterations) * 100;
  const probProfitable = (simCumRs.filter(r => r > 0).length / iterations) * 100;

  return {
    worstDD95: Number(p(simDDs, 95).toFixed(2)),
    worstDD99: Number(p(simDDs, 99).toFixed(2)),
    medianDD: Number(p(simDDs, 50).toFixed(2)),
    medianR: Number(p(simCumRs, 50).toFixed(1)),
    probDDUnder5R: Number(probDDUnder5R.toFixed(1)),
    probDDUnder6R: Number(probDDUnder6R.toFixed(1)),
    probProfitable: Number(probProfitable.toFixed(1))
  };
}

console.log('Preloading all 6 timeframes into memory...');
const timeframes = {
  '1M': loadTimeframe('1M', 'xauusd_1m_tv.json'),
  '5M': loadTimeframe('5M', 'xauusd_5m_tv.json'),
  '15M': loadTimeframe('15M', 'xauusd_15m_tv.json'),
  '30M': loadTimeframe('30M', 'xauusd_30m_tv.json'),
  '1H': loadTimeframe('1H', 'xauusd_1h_tv.json'),
  '4H': loadTimeframe('4H', 'xauusd_4h_tv.json')
};

for (const [tf, data] of Object.entries(timeframes)) {
  if (data) {
    console.log(`Loaded ${tf}: ${data.n} candles (End: ${new Date(data.timeMsArr[data.n-1]).toISOString()})`);
  }
}

// Target TP grids per timeframe (focusing on BIGGER PIP TARGETS and higher R:R)
const tfPipsConfig = {
  '1M': [35, 45, 55, 65, 80],
  '5M': [80, 82, 85, 90, 95, 100, 110, 120, 130, 140, 150],
  '15M': [90, 100, 120, 140, 160, 180, 200, 250],
  '30M': [100, 120, 150, 180, 200, 250, 300],
  '1H': [150, 200, 250, 300, 400],
  '4H': [250, 300, 400, 500]
};

const sweepKeys = ['3_5', '3_6', '3_7', '4_6', '4_7', '4_8', '2_4'];
const emaKeys = ['EMA100', 'EMA75', 'EMA80', 'EMA120', 'EMA150', 'EMA200', 'EMA50'];

console.log('\n======================================================');
console.log('🚀 LAUNCHING CONTINUOUS MULTI-TIMEFRAME QUANT MINER');
console.log('Criteria: Sep >= 12.0R | Oct >= 12.0R | Calmar > 4.0 | MaxDD <= 5.5R');
console.log('Bigger TP Targets: 80 - 500 pips | Full Monte Carlo Stress Testing');
console.log('======================================================\n');

const qualifyingChampions = [];
let evaluatedCount = 0;
const tStart = Date.now();

// Multi-TF Search Routine
for (const tfName of ['5M', '15M', '30M', '1H', '1M', '4H']) {
  const tfData = timeframes[tfName];
  if (!tfData) continue;
  const pipsList = tfPipsConfig[tfName];
  console.log(`\n>>> Scanning ${tfName} Frontier (${tfData.n} bars, TP: [${pipsList.join(', ')}] pips)...`);

  for (const sweepKey of sweepKeys) {
    for (const emaKey of emaKeys) {
      for (const tpPips of pipsList) {
        for (const atrMult of [0.18, 0.20, 0.22, 0.25]) {
          for (const beTriggerR of [1.3, 1.4, 1.5]) {
            for (const lockInTriggerR of [1.6, 1.7, 1.8, 2.0]) {
              for (const lockInValR of [0.8, 1.0, 1.2]) {
                for (const cooldownBars of [16, 20, 24]) {
                  for (const maxDailyLosses of [2, 3]) {
                    evaluatedCount++;
                    const res = simulateStrategy(tfData, sweepKey, {
                      emaKey, tpPips, atrMult, beTriggerR, lockInTriggerR, lockInValR,
                      cooldownBars, consecutiveLossLimit: 2, maxDailyLosses
                    });

                    if (res && res.sepR >= 12.0 && res.octR >= 12.0 && res.calmarRatio >= 4.0 && res.maxDrawdown <= 5.5) {
                      const mc = runMonteCarlo(res.allTrades, 1000);
                      const candidate = {
                        tf: tfName, sweepKey, emaKey, tpPips, atrMult,
                        beTriggerR, lockInTriggerR, lockInValR, cooldownBars, maxDailyLosses,
                        ...res, mc
                      };
                      qualifyingChampions.push(candidate);

                      console.log(`⭐ [NEW DUAL > 12R CHAMPION FOUND] ${tfName} ${emaKey} Sw:${sweepKey} TP:${tpPips}p | Sep:+${res.sepR}R Oct:+${res.octR}R Cum:+${res.cumulativeR}R | Calmar:${res.calmarRatio} DD:-${res.maxDrawdown}R | MC WorstDD95:-${mc.worstDD95}R (Score: ${res.score})`);
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

const elapsedSec = ((Date.now() - tStart) / 1000).toFixed(1);
console.log(`\nScan complete! Evaluated ${evaluatedCount.toLocaleString()} combinations across 6 timeframes in ${elapsedSec}s.`);
console.log(`Total Dual > 12.0R Champions Discovered: ${qualifyingChampions.length}`);

qualifyingChampions.sort((a,b) => b.score - a.score || b.calmarRatio - a.calmarRatio);

console.log('\n🏆 TOP 20 HIGHEST SCORING MULTI-TIMEFRAME DUAL > 12.0R CHAMPIONS:');
qualifyingChampions.slice(0, 20).forEach((c, idx) => {
  console.log(`RANK #${idx+1} [SCORE: ${c.score}] ${c.tf} ${c.emaKey} Sw:${c.sweepKey} TP:${c.tpPips}p ATR:${c.atrMult} BE:${c.beTriggerR}R Lock:${c.lockInTriggerR}R (val:${c.lockInValR}R) Cool:${c.cooldownBars}`);
  console.log(`      -> Sep: +${c.sepR}R | Oct: +${c.octR}R | Total: +${c.cumulativeR}R | Calmar: ${c.calmarRatio} | MaxDD: -${c.maxDrawdown}R | WR: ${c.winRate.toFixed(1)}% | Trades: ${c.closed}`);
  if (c.mc) {
    console.log(`      -> Monte Carlo: WorstDD95: -${c.mc.worstDD95}R | ProbDD<=5R: ${c.mc.probDDUnder5R}% | ProbProfit: ${c.mc.probProfitable}%`);
  }
});

fs.writeFileSync(path.join(DATA_DIR, 'super_multitf_champions.json'), JSON.stringify(qualifyingChampions.slice(0, 100), null, 2));

console.log(`\nSaved top 100 champions to ${path.join(DATA_DIR, 'super_multitf_champions.json')}`);
