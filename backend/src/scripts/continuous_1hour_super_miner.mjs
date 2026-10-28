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

function loadTimeframe(name, filename, swingPairs, emaPeriods) {
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
  const emas = {};
  for (const period of emaPeriods) {
    emas[`EMA${period}`] = computeEMA(candles, period);
  }

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
                bar: i, entryTime: timeMs,
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
                bar: i, entryTime: timeMs,
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

  let sumRR = 0;
  for (const t of trades) sumRR += t.rVal;
  const avgRR = trades.length > 0 ? Number((sumRR / trades.length).toFixed(2)) : 0;

  const score = (cumulativeR * 2.5) + (calmar * 15.0) + (Math.min(sepR, octR) * 10.0) + (tpPips * 0.3) - (maxDD * 12.0);

  return {
    tf: tfData.name,
    tpPips, atrMult, beTriggerR, lockInTriggerR, lockInValR, cooldownBars,
    closed: trades.length,
    wins: winsCount,
    losses: lossCount,
    beCount,
    winRate: (winsCount + lossCount) > 0 ? Number(((winsCount / (winsCount + lossCount)) * 100).toFixed(1)) : 0,
    avgRR,
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

function runMonteCarlo(trades, iterations = 5000) {
  if (!trades || trades.length < 5) return null;
  const tradeRs = trades.map(t => t.rOutcome);
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
  let ddUnder5 = 0, profitable = 0;
  for (let i = 0; i < iterations; i++) {
    if (simDDs[i] <= 5.0) ddUnder5++;
    if (simCumRs[i] > 0) profitable++;
  }

  return {
    worstDD95: Number(p(simDDs, 95).toFixed(2)),
    worstDD99: Number(p(simDDs, 99).toFixed(2)),
    medianDD: Number(p(simDDs, 50).toFixed(2)),
    medianR: Number(p(simCumRs, 50).toFixed(1)),
    probDDUnder5R: Number(((ddUnder5 / iterations) * 100).toFixed(1)),
    probProfitable: Number(((profitable / iterations) * 100).toFixed(1))
  };
}

function getTierKey(tpPips) {
  if (tpPips < 90) return 'Tier_80_89p';
  if (tpPips < 100) return 'Tier_90_99p';
  if (tpPips < 120) return 'Tier_100_119p';
  if (tpPips < 150) return 'Tier_120_149p';
  return 'Tier_150p_Plus';
}

async function runContinuousMiner() {
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const startTime = Date.now();
  console.log(`========================================================================`);
  console.log(`🚀 CONTINUOUS QUANT AI MINER STARTED AT ${new Date().toISOString()}`);
  console.log(`Mandate: 1 Hour continuous search for higher-scoring strategies, bigger pips, better R:R`);
  console.log(`Criteria: Both Sep >= 12.0R & Oct >= 12.0R | Calmar > 4.0 | MaxDD <= 5.0R`);
  console.log(`========================================================================\n`);

  const swingPairs = [[3, 5], [3, 6], [3, 7], [4, 6], [4, 7], [2, 4]];
  const emaPeriods = [40, 50, 60, 75, 80, 100, 120, 150, 200];

  console.log('Loading 5M, 15M, and 1H datasets...');
  const m5 = loadTimeframe('5M', 'xauusd_5m_tv.json', swingPairs, emaPeriods);
  const m15 = loadTimeframe('15M', 'xauusd_15m_tv.json', swingPairs, emaPeriods);
  const h1 = loadTimeframe('1H', 'xauusd_1h_tv.json', swingPairs, emaPeriods);

  let globalBestScore = 394.4; // current record
  const bestByTier = {};
  const allDiscovered = [];
  let cycle = 0;

  // Initialize tier baselines
  const tierScores = {
    'Tier_80_89p': 394.4,
    'Tier_90_99p': 300.3,
    'Tier_100_119p': 250.0,
    'Tier_120_149p': 248.0,
    'Tier_150p_Plus': 200.0
  };

  while (Date.now() - startTime < ONE_HOUR_MS) {
    cycle++;
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n--- [Cycle #${cycle}] Continuous Mining Frontier (Elapsed: ${elapsedSec}s / 3600s) ---`);

    // Focus grid across TP targets (80p to 140p on 5M)
    const tps = [80, 82, 85, 88, 90, 92, 95, 100, 105, 110, 115, 120, 125, 130, 135, 140];
    const atrMults = [0.16, 0.17, 0.18, 0.19, 0.20, 0.22];
    const beTriggers = [1.3, 1.4, 1.5];
    const lockTriggers = [1.5, 1.6, 1.7, 1.8];
    const lockVals = [1.0, 1.1, 1.2, 1.3];
    const cooldowns = [12, 14, 16, 18, 20];

    for (const [sMin, sMaj] of swingPairs) {
      const swKey = `${sMin}_${sMaj}`;
      for (const period of emaPeriods) {
        const emaKey = `EMA${period}`;
        for (const tpPips of tps) {
          const tier = getTierKey(tpPips);
          for (const atrMult of atrMults) {
            for (const beTriggerR of beTriggers) {
              for (const lockInTriggerR of lockTriggers) {
                for (const lockInValR of lockVals) {
                  for (const cooldownBars of cooldowns) {
                    const res = simulateStrategy(m5, swKey, {
                      emaKey, tpPips, atrMult, beTriggerR, lockInTriggerR, lockInValR,
                      cooldownBars, consecutiveLossLimit: 2, maxDailyLosses: 3
                    });

                    if (res && res.sepR >= 12.0 && res.octR >= 12.0 && res.calmarRatio >= 4.0 && res.maxDrawdown <= 5.0) {
                      const prevTierBest = tierScores[tier] || 0;
                      const isNewGlobalRecord = res.score > globalBestScore;
                      const isNewTierRecord = res.score > prevTierBest;

                      if (isNewGlobalRecord || isNewTierRecord) {
                        if (isNewGlobalRecord) globalBestScore = res.score;
                        tierScores[tier] = res.score;

                        const mc = runMonteCarlo(res.trades, 5000);
                        const champRecord = {
                          discoveredAt: new Date().toISOString(),
                          cycle,
                          tier,
                          isNewGlobalRecord,
                          isNewTierRecord,
                          score: res.score,
                          tf: '5M',
                          emaKey, swKey, tpPips, atrMult, beTriggerR, lockInTriggerR, lockInValR, cooldownBars,
                          avgRR: res.avgRR,
                          sepR: res.sepR, octR: res.octR, cumulativeR: res.cumulativeR,
                          calmarRatio: res.calmarRatio, maxDrawdown: res.maxDrawdown,
                          winRate: res.winRate, trades: res.closed,
                          mc
                        };

                        bestByTier[tier] = champRecord;
                        allDiscovered.push(champRecord);

                        const tag = isNewGlobalRecord ? '🔥 [GLOBAL RECORD ALL-TIME HIGHEST SCORE]' : `⭐ [TIER RECORD FOR ${tier.toUpperCase()}]`;
                        console.log(`${tag}: Score ${res.score} | 5M ${emaKey} Sw:${swKey} TP:${tpPips}p (Avg R:R 1:${res.avgRR}) ATR:${atrMult} Lock:${lockInTriggerR}R->${lockInValR}R Cool:${cooldownBars}`);
                        console.log(`      Sep:+${res.sepR}R | Oct:+${res.octR}R | Total:+${res.cumulativeR}R | Calmar:${res.calmarRatio} | MaxDD:-${res.maxDrawdown}R (Eq: ${(res.maxDrawdown*0.5).toFixed(1)}%) | Trades:${res.closed} WR:${res.winRate}%`);
                        console.log(`      Monte Carlo (5,000 runs): Worst 95% DD: -${mc.worstDD95}R | Prob DD <= 5R: ${mc.probDDUnder5R}% | Prob Profit: ${mc.probProfitable}%\n`);

                        fs.writeFileSync(path.join(DATA_DIR, 'super_champions_by_target.json'), JSON.stringify(bestByTier, null, 2));
                        fs.writeFileSync(path.join(DATA_DIR, 'continuous_miner_champions.json'), JSON.stringify(allDiscovered, null, 2));
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

    // Short rest between massive cycles
    await new Promise(r => setTimeout(r, 10000));
  }

  console.log(`\n✅ 1-Hour Continuous Mining completed! Discovered ${allDiscovered.length} records.`);
}

runContinuousMiner().catch(console.error);
