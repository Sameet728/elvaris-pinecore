import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
      if (activeBsl.length > 20) activeBsl.shift();
      bslPtr++;
    }
    while (sslPtr < sslLvls.length && sslLvls[sslPtr].bar <= i) {
      activeSsl.push({ price: sslLvls[sslPtr].price, swept: false });
      if (activeSsl.length > 20) activeSsl.shift();
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

function loadTimeframe(name, filename, swingPairs) {
  const p = path.join(DATA_DIR, filename);
  if (!fs.existsSync(p)) {
    console.error(`File missing: ${p}`);
    return null;
  }
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
    EMA100: computeEMA(candles, 100),
    EMA200: computeEMA(candles, 200)
  };

  const sweepCache = {};
  for (const [sMin, sMaj] of swingPairs) {
    sweepCache[`${sMin}_${sMaj}`] = precomputeSweeps(candles, sMin, sMaj);
  }

  return {
    name, candles, n, dayKeys, monthKeys, timeMsArr,
    fvgMap: { bFvgsPerBar, sFvgsPerBar },
    atr, emas, sweepCache
  };
}

function simulateStrategy(tfData, sweepKey, {
  emaKey = 'EMA100',
  tpPips = 82,
  atrMult = 0.18,
  beTriggerR = 1.4,
  lockInTriggerR = 1.6,
  lockInValR = 1.2,
  cooldownBars = 16,
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
  const trades = [];

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
            monthlyWins[mKey]++;
            monthlyR[mKey] += rOutcome;
            cumulativeR += rOutcome;
            if (cumulativeR > peakR) peakR = cumulativeR;
            consecutiveLosses = 0;
          } else if (finalRes === -1) {
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
          }

          t.exitBar = i;
          t.exitTime = timeMs;
          t.exitTimeStr = new Date(timeMs).toISOString();
          t.finalRes = finalRes;
          t.rOutcome = Number(rOutcome.toFixed(2));
          t.cumulativeR = Number(cumulativeR.toFixed(2));
          trades.push(t);
        }
        openTrade = null;
      }
    }

    if (lookLong && (i - setupBarL) > expireBars) lookLong = false;
    if (lookShort && (i - setupBarS) > expireBars) lookShort = false;

    if (lookLong && openTrade === null && !isCooldown && !isDailyBlocked) {
      const activeBFvgs = fvgMap.bFvgsPerBar[i];
      for (let f = activeBFvgs.length - 1; f >= 0; f--) {
        if (activeBFvgs[f].bar > setupBarL) {
          const { top: fTop, bot: fBot } = activeBFvgs[f];
          if (c.low <= fTop && c.close > fBot) {
            const entryP = c.close;
            const slP = fBot - atr[i] * atrMult;
            const slDist = entryP - slP;
            const maxSlAllowed = Math.max(3.5, tpDist / 2.2);
            if (slDist > 0.4 && slDist < maxSlAllowed) {
              const tpP = entryP + tpDist;
              openTrade = {
                id: trades.length + 1,
                dir: 1, dirStr: 'BUY', entry: entryP, sl: slP, initSL: slP, tp: tpP,
                bar: i, entryTime: timeMs, entryTimeStr: new Date(timeMs).toISOString(),
                rVal: Number((tpDist / slDist).toFixed(2)),
                slPips: Number((slDist * 10).toFixed(1)),
                tpPips: Number(tpPips.toFixed(1)),
                isBE: false, isLocked: false
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
            const maxSlAllowed = Math.max(3.5, tpDist / 2.2);
            if (slDist > 0.4 && slDist < maxSlAllowed) {
              const tpP = entryP - tpDist;
              openTrade = {
                id: trades.length + 1,
                dir: -1, dirStr: 'SELL', entry: entryP, sl: slP, initSL: slP, tp: tpP,
                bar: i, entryTime: timeMs, entryTimeStr: new Date(timeMs).toISOString(),
                rVal: Number((tpDist / slDist).toFixed(2)),
                slPips: Number((slDist * 10).toFixed(1)),
                tpPips: Number(tpPips.toFixed(1)),
                isBE: false, isLocked: false
              };
              lookShort = false;
              break;
            }
          }
        }
      }
    }
  }

  const calmar = maxDD > 0 ? cumulativeR / maxDD : cumulativeR;
  const sepR = monthlyR['2026-09'] || 0;
  const octR = monthlyR['2026-10'] || 0;

  const winsCount = trades.filter(t => t.finalRes === 1 || t.finalRes === 4).length;
  const lossCount = trades.filter(t => t.finalRes === -1).length;
  const beCount = trades.filter(t => t.finalRes === 3).length;

  const score = (cumulativeR * 2.5) + (calmar * 15.0) + (Math.min(sepR, octR) * 10.0) + (tpPips * 0.2) - (maxDD * 12.0);

  return {
    tf: tfData.name,
    tpPips, atrMult, beTriggerR, lockInTriggerR, lockInValR, cooldownBars,
    closed: trades.length,
    wins: winsCount,
    losses: lossCount,
    beCount,
    winRate: (winsCount + lossCount) > 0 ? Number(((winsCount / (winsCount + lossCount)) * 100).toFixed(1)) : 0,
    cumulativeR: Number(cumulativeR.toFixed(2)),
    maxDrawdown: Number(maxDD.toFixed(2)),
    calmarRatio: Number(calmar.toFixed(2)),
    sepR: Number(sepR.toFixed(2)),
    octR: Number(octR.toFixed(2)),
    score: Number(score.toFixed(1)),
    monthlyWins, monthlyLosses, monthlyR,
    trades
  };
}

function runMonteCarlo(tradeRs, iterations = 5000) {
  if (!tradeRs || tradeRs.length < 5) return null;
  const n = tradeRs.length;
  const simDDs = new Float64Array(iterations);
  const simCumRs = new Float64Array(iterations);

  for (let iter = 0; iter < iterations; iter++) {
    let cR = 0, pR = 0, mDD = 0;
    for (let j = 0; j < n; j++) {
      const idx = Math.floor(Math.random() * n);
      const r = tradeRs[idx];
      cR += r;
      if (cR > pR) pR = cR;
      const dd = pR - cR;
      if (dd > mDD) mDD = dd;
    }
    simDDs[iter] = mDD;
    simCumRs[iter] = cR;
  }

  simDDs.sort();
  simCumRs.sort();

  const p = (arr, pct) => arr[Math.floor((pct / 100) * arr.length)];
  let ddUnder5 = 0, ddUnder6 = 0, profitable = 0;
  for (let i = 0; i < iterations; i++) {
    if (simDDs[i] <= 5.0) ddUnder5++;
    if (simDDs[i] <= 6.0) ddUnder6++;
    if (simCumRs[i] > 0) profitable++;
  }

  return {
    iterations,
    worstDD95: Number(p(simDDs, 95).toFixed(2)),
    worstDD99: Number(p(simDDs, 99).toFixed(2)),
    medianDD: Number(p(simDDs, 50).toFixed(2)),
    medianR: Number(p(simCumRs, 50).toFixed(1)),
    probDDUnder5R: Number(((ddUnder5 / iterations) * 100).toFixed(1)),
    probDDUnder6R: Number(((ddUnder6 / iterations) * 100).toFixed(1)),
    probProfitable: Number(((profitable / iterations) * 100).toFixed(1))
  };
}

async function main() {
  console.log('=== MULTI-TIMEFRAME QUANTITATIVE OPTIMIZATION & MONTE CARLO ANALYSIS ===');
  console.log('Loading datasets across all 6 timeframes: 1M, 5M, 15M, 30M, 1H, 4H...\n');

  const tfConfigs = [
    {
      name: '1M',
      file: 'xauusd_1m_tv.json',
      swings: [[3, 5], [5, 10], [8, 15]],
      tpPips: [35, 45, 55, 65, 80],
      atrMults: [0.15, 0.20, 0.25],
      beTriggers: [1.2, 1.4],
      lockTriggers: [1.5, 1.6],
      lockVals: [0.8, 1.0, 1.2],
      cooldowns: [20, 30, 45],
      emas: ['EMA100', 'EMA200']
    },
    {
      name: '5M',
      file: 'xauusd_5m_tv.json',
      swings: [[3, 5], [3, 7], [4, 6]],
      tpPips: [80, 82, 85, 90, 100, 120, 130, 140],
      atrMults: [0.16, 0.18, 0.20],
      beTriggers: [1.3, 1.4, 1.5],
      lockTriggers: [1.5, 1.6, 1.7],
      lockVals: [1.0, 1.2],
      cooldowns: [12, 16, 20],
      emas: ['EMA50', 'EMA100', 'EMA200']
    },
    {
      name: '15M',
      file: 'xauusd_15m_tv.json',
      swings: [[2, 4], [3, 5], [3, 7]],
      tpPips: [80, 100, 120, 150, 180, 200],
      atrMults: [0.15, 0.18, 0.20, 0.25],
      beTriggers: [1.2, 1.4],
      lockTriggers: [1.5, 1.6, 1.8],
      lockVals: [0.8, 1.0, 1.2],
      cooldowns: [6, 10, 16],
      emas: ['EMA50', 'EMA100', 'EMA200']
    },
    {
      name: '30M',
      file: 'xauusd_30m_tv.json',
      swings: [[2, 3], [2, 5], [3, 5]],
      tpPips: [100, 130, 160, 200, 250],
      atrMults: [0.15, 0.20, 0.25],
      beTriggers: [1.2, 1.4],
      lockTriggers: [1.5, 1.7],
      lockVals: [1.0, 1.2],
      cooldowns: [4, 8],
      emas: ['EMA50', 'EMA100', 'EMA200']
    },
    {
      name: '1H',
      file: 'xauusd_1h_tv.json',
      swings: [[2, 3], [2, 4], [3, 5]],
      tpPips: [150, 200, 250, 300, 350],
      atrMults: [0.15, 0.20, 0.25],
      beTriggers: [1.2, 1.4],
      lockTriggers: [1.5, 1.7],
      lockVals: [1.0, 1.2],
      cooldowns: [2, 4],
      emas: ['EMA50', 'EMA100', 'EMA200']
    },
    {
      name: '4H',
      file: 'xauusd_4h_tv.json',
      swings: [[1, 2], [2, 3], [2, 4]],
      tpPips: [250, 350, 450, 600],
      atrMults: [0.15, 0.20, 0.25],
      beTriggers: [1.2, 1.4],
      lockTriggers: [1.5, 1.7],
      lockVals: [1.0, 1.2],
      cooldowns: [1, 2],
      emas: ['EMA50', 'EMA100']
    }
  ];

  const bestByTF = {};

  for (const cfg of tfConfigs) {
    console.log(`\n======================================================`);
    console.log(`🔍 Processing Timeframe: ${cfg.name} (${cfg.file})`);
    console.log(`======================================================`);
    const tfData = loadTimeframe(cfg.name, cfg.file, cfg.swings);
    if (!tfData) continue;

    console.log(`Loaded ${tfData.n} bars. Starting grid search...`);
    let topStrat = null;
    let evalCount = 0;

    for (const [sMin, sMaj] of cfg.swings) {
      const swKey = `${sMin}_${sMaj}`;
      for (const emaKey of cfg.emas) {
        for (const tpPips of cfg.tpPips) {
          for (const atrMult of cfg.atrMults) {
            for (const beTriggerR of cfg.beTriggers) {
              for (const lockInTriggerR of cfg.lockTriggers) {
                for (const lockInValR of cfg.lockVals) {
                  for (const cooldownBars of cfg.cooldowns) {
                    evalCount++;
                    const res = simulateStrategy(tfData, swKey, {
                      emaKey, tpPips, atrMult, beTriggerR, lockInTriggerR, lockInValR,
                      cooldownBars, consecutiveLossLimit: 2, maxDailyLosses: 3
                    });

                    if (res && res.closed >= 5) {
                      if (!topStrat || res.score > topStrat.score) {
                        topStrat = {
                          swKey, emaKey, ...res
                        };
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

    if (topStrat) {
      console.log(`Evaluated ${evalCount} combinations on ${cfg.name}.`);
      console.log(`🏆 BEST STRATEGY ON ${cfg.name}:`);
      console.log(`   Config: ${topStrat.emaKey} Sw:${topStrat.swKey} TP:${topStrat.tpPips}p ATR:${topStrat.atrMult} BE:${topStrat.beTriggerR}R Lock:${topStrat.lockInTriggerR}R (val:${topStrat.lockInValR}R) Cool:${topStrat.cooldownBars}`);
      console.log(`   Performance: Trades: ${topStrat.closed} | WR: ${topStrat.winRate}%`);
      console.log(`   Sep: +${topStrat.sepR}R | Oct: +${topStrat.octR}R | Total: +${topStrat.cumulativeR}R | Calmar: ${topStrat.calmarRatio} | MaxDD: -${topStrat.maxDrawdown}R (Eq DD: ${(topStrat.maxDrawdown * 0.5).toFixed(1)}%) | Score: ${topStrat.score}`);

      // Run 5000-iteration Monte Carlo
      const tradeRs = topStrat.trades.map(t => t.rOutcome);
      console.log(`   Running 5,000 Monte Carlo bootstrap iterations...`);
      const mc = runMonteCarlo(tradeRs, 5000);
      topStrat.mc = mc;

      if (mc) {
        console.log(`   📊 Monte Carlo Stress Results (5,000 runs):`);
        console.log(`      Worst 95% DD: -${mc.worstDD95}R (Eq: ${(mc.worstDD95 * 0.5).toFixed(1)}%)`);
        console.log(`      Worst 99% DD: -${mc.worstDD99}R (Eq: ${(mc.worstDD99 * 0.5).toFixed(1)}%)`);
        console.log(`      Median Max DD: -${mc.medianDD}R | Median Return: +${mc.medianR}R`);
        console.log(`      Prob DD <= 5.0R (Prop Firm Safe): ${mc.probDDUnder5R}%`);
        console.log(`      Probability Profitable: ${mc.probProfitable}%`);
      }

      bestByTF[cfg.name] = topStrat;
    }
  }

  // Save the full structured result
  fs.writeFileSync(path.join(DATA_DIR, 'monte_carlo_all_timeframes.json'), JSON.stringify(bestByTF, null, 2));
  console.log(`\nSuccessfully exported full results to data/monte_carlo_all_timeframes.json`);
}

main().catch(err => {
  console.error('Fatal error in main:', err);
  process.exit(1);
});
