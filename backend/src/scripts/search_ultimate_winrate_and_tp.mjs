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

// Multi-Tier Simulation Engine
function runMultiTierSim(candles, config) {
  const n = candles.length;
  const ema = computeEMA(candles, config.emaPeriod);
  const atr = computeATR(candles, 14);
  const sweeps = precomputeSweeps(candles, config.swMin, config.swMaj);

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

  const tpDist = config.tpPips / 10.0;
  const monthlyR = {};

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
    const isDailyBlocked = (dailyLossCount[dayKey] || 0) >= (config.maxDailyLosses || 3);

    const s = sweeps[i];
    if (s.sslSweep && c.close > ema[i] && !isCooldown && !isDailyBlocked) {
      lookLong = true; lookShort = false; setupBarL = i;
    }
    if (s.bslSweep && c.close < ema[i] && !isCooldown && !isDailyBlocked) {
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

      // Tier 1: Micro-Breakeven
      if (config.beTriggerR > 0 && !t.isBE) {
        if (currentGain >= slDistInit * config.beTriggerR) {
          t.sl = entry;
          t.isBE = true;
        }
      }

      // Tier 2: Lock 1 (+R Guaranteed)
      if (config.lock1TriggerR > 0 && !t.isLocked1) {
        if (currentGain >= slDistInit * config.lock1TriggerR) {
          t.sl = dir === 1 ? (entry + slDistInit * config.lock1ValR) : (entry - slDistInit * config.lock1ValR);
          t.isLocked1 = true;
        }
      }

      // Tier 3: Lock 2 (Extended Lock Guaranteed)
      if (config.lock2TriggerR > 0 && !t.isLocked2) {
        if (currentGain >= slDistInit * config.lock2TriggerR) {
          t.sl = dir === 1 ? (entry + slDistInit * config.lock2ValR) : (entry - slDistInit * config.lock2ValR);
          t.isLocked2 = true;
        }
      }

      const maxHoldBars = config.maxHoldBars || 45;
      if (age >= maxHoldBars) {
        finalRes = 2; resolved = true;
      } else if (holdSec >= (config.minHoldSec || 120)) {
        if (dir === 1) {
          if (c.high >= tp) { finalRes = 1; resolved = true; }
          else if (c.low <= t.sl) {
            finalRes = t.isLocked2 ? 5 : t.isLocked1 ? 4 : t.isBE ? 3 : -1;
            resolved = true;
          }
        } else {
          if (c.low <= tp) { finalRes = 1; resolved = true; }
          else if (c.high >= t.sl) {
            finalRes = t.isLocked2 ? 5 : t.isLocked1 ? 4 : t.isBE ? 3 : -1;
            resolved = true;
          }
        }
      }

      if (resolved) {
        const rOutcome = finalRes === 1 ? t.rVal : finalRes === 5 ? config.lock2ValR : finalRes === 4 ? config.lock1ValR : finalRes === 3 ? 0.0 : -1.0;
        if (finalRes === 1 || finalRes === -1 || finalRes === 3 || finalRes === 4 || finalRes === 5) {
          const mKey = monthKeys[t.bar];
          const tDayKey = dayKeys[t.bar];

          if (!monthlyR[mKey]) monthlyR[mKey] = 0;

          if (finalRes === 1 || finalRes === 4 || finalRes === 5) {
            monthlyR[mKey] += rOutcome;
            cumulativeR += rOutcome;
            if (cumulativeR > peakR) peakR = cumulativeR;
            consecutiveLosses = 0;
          } else if (finalRes === -1) {
            monthlyR[mKey] -= 1.0;
            cumulativeR -= 1.0;
            const dd = peakR - cumulativeR;
            if (dd > maxDD) maxDD = dd;
            dailyLossCount[tDayKey] = (dailyLossCount[tDayKey] || 0) + 1;
            consecutiveLosses++;
            // Immediate post-loss cooldown to prevent loss streak
            if (consecutiveLosses >= 1 && config.cooldownBars > 0) {
              cooldownUntilBar = i + config.cooldownBars;
            }
          }

          trades.push({
            bar: t.bar,
            entryTime: t.entryTime,
            exitTime: timeMs,
            rOutcome,
            rVal: t.rVal,
            finalRes
          });
        }
        openTrade = null;
      }
    }

    const expireBars = config.expireBars || 25;
    if (lookLong && (i - setupBarL) > expireBars) lookLong = false;
    if (lookShort && (i - setupBarS) > expireBars) lookShort = false;

    if (lookLong && openTrade === null && !isCooldown && !isDailyBlocked) {
      const activeBFvgs = bFvgsPerBar[i];
      for (let f = activeBFvgs.length - 1; f >= 0; f--) {
        if (activeBFvgs[f].bar > setupBarL) {
          const { top: fTop, bot: fBot } = activeBFvgs[f];
          if (c.low <= fTop && c.close > fBot) {
            const entryP = c.close;
            const slP = fBot - atr[i] * config.atrMult;
            const slDist = entryP - slP;
            const maxSlAllowed = Math.max(2.0, tpDist / 1.5);
            if (slDist > 0.4 && slDist < maxSlAllowed) {
              const tpP = entryP + tpDist;
              openTrade = {
                dir: 1, entry: entryP, sl: slP, initSL: slP, tp: tpP,
                bar: i, entryTime: timeMs,
                rVal: Number((tpDist / slDist).toFixed(2)),
                isBE: false, isLocked1: false, isLocked2: false
              };
              lookLong = false;
              break;
            }
          }
        }
      }
    }

    if (lookShort && openTrade === null && !isCooldown && !isDailyBlocked) {
      const activeSFvgs = sFvgsPerBar[i];
      for (let f = activeSFvgs.length - 1; f >= 0; f--) {
        if (activeSFvgs[f].bar > setupBarS) {
          const { top: fTop, bot: fBot } = activeSFvgs[f];
          if (c.high >= fBot && c.close < fTop) {
            const entryP = c.close;
            const slP = fTop + atr[i] * config.atrMult;
            const slDist = slP - entryP;
            const maxSlAllowed = Math.max(2.0, tpDist / 1.5);
            if (slDist > 0.4 && slDist < maxSlAllowed) {
              const tpP = entryP - tpDist;
              openTrade = {
                dir: -1, entry: entryP, sl: slP, initSL: slP, tp: tpP,
                bar: i, entryTime: timeMs,
                rVal: Number((tpDist / slDist).toFixed(2)),
                isBE: false, isLocked1: false, isLocked2: false
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

  const winsCount = trades.filter(t => t.finalRes === 1 || t.finalRes === 4 || t.finalRes === 5).length;
  const lossCount = trades.filter(t => t.finalRes === -1).length;
  const beCount = trades.filter(t => t.finalRes === 3).length;

  let sumRR = 0;
  for (const t of trades) sumRR += t.rVal;
  const avgRR = trades.length > 0 ? Number((sumRR / trades.length).toFixed(2)) : 0;

  const winRate = (winsCount + lossCount) > 0 ? Number(((winsCount / (winsCount + lossCount)) * 100).toFixed(1)) : 0;
  const nonLossRate = trades.length > 0 ? Number((((winsCount + beCount) / trades.length) * 100).toFixed(1)) : 0;

  // Compute Consecutive Wins (TP/Lock) and Losses (SL)
  let curConsecWin = 0, maxConsecWin = 0;
  let curConsecLoss = 0, maxConsecLoss = 0;

  for (const t of trades) {
    if (t.finalRes === 1 || t.finalRes === 4 || t.finalRes === 5) {
      curConsecWin++;
      if (curConsecWin > maxConsecWin) maxConsecWin = curConsecWin;
      curConsecLoss = 0;
    } else if (t.finalRes === -1) {
      curConsecLoss++;
      if (curConsecLoss > maxConsecLoss) maxConsecLoss = curConsecLoss;
      curConsecWin = 0;
    } else if (t.finalRes === 3) {
      curConsecLoss = 0;
    }
  }

  // Composite Score
  const score = Number((cumulativeR * calmar * (winRate / 50.0) / (maxDD || 1)).toFixed(1));

  return {
    config,
    closed: trades.length,
    wins: winsCount,
    losses: lossCount,
    beCount,
    winRate,
    nonLossRate,
    avgRR,
    cumulativeR: Number(cumulativeR.toFixed(2)),
    maxDrawdown: Number(maxDD.toFixed(2)),
    calmarRatio: Number(calmar.toFixed(2)),
    sepR: Number(sepR.toFixed(2)),
    octR: Number(octR.toFixed(2)),
    monthlyR,
    maxConsecWin,
    maxConsecLoss,
    score,
    trades
  };
}

// Monte Carlo
function runMonteCarlo(trades, MC_RUNS = 5000) {
  const outcomes = trades.map(t => t.rOutcome);
  const maxDDs = [];
  let profitableRuns = 0;

  if (outcomes.length > 0) {
    for (let sim = 0; sim < MC_RUNS; sim++) {
      let r = 0, peak = 0, dd = 0;
      for (let step = 0; step < outcomes.length; step++) {
        const idx = Math.floor(Math.random() * outcomes.length);
        r += outcomes[idx];
        if (r > peak) peak = r;
        const curDD = peak - r;
        if (curDD > dd) dd = curDD;
      }
      maxDDs.push(dd);
      if (r > 0) profitableRuns++;
    }
  }

  maxDDs.sort((a, b) => a - b);
  const worstDD95 = maxDDs.length > 0 ? Number(maxDDs[Math.floor(maxDDs.length * 0.95)].toFixed(2)) : 0;
  const medianDD = maxDDs.length > 0 ? Number(maxDDs[Math.floor(maxDDs.length * 0.50)].toFixed(2)) : 0;
  const countUnder5 = maxDDs.filter(d => d <= 5.0).length;
  const probDDUnder5 = maxDDs.length > 0 ? Number(((countUnder5 / maxDDs.length) * 100).toFixed(1)) : 0;
  const probProfit = maxDDs.length > 0 ? Number(((profitableRuns / MC_RUNS) * 100).toFixed(1)) : 0;

  return {
    worstDD95,
    medianDD,
    probDDUnder5,
    probProfit
  };
}

async function searchUltraHighWRAndMoreTP() {
  console.log('Searching Ultra High Win-Rate, More TP, and MINIMUM Consecutive Losses across 5M, 15M, 30M, 1H...');

  const timeframes = [
    {
      tf: '5M',
      file: 'xauusd_5m_tv.json',
      tpList: [30, 35, 40, 45, 50, 60, 70, 80, 100],
      emaList: [50, 100],
      swList: [[2, 4], [3, 5], [4, 6], [5, 10]],
      beList: [0.25, 0.30, 0.35],
      lock1List: [{ trigger: 0.7, val: 0.5 }, { trigger: 0.8, val: 0.6 }, { trigger: 1.0, val: 0.8 }],
      lock2List: [{ trigger: 1.2, val: 1.0 }, { trigger: 1.4, val: 1.2 }, { trigger: 0, val: 0 }],
      coolList: [8, 12, 16]
    },
    {
      tf: '15M',
      file: 'xauusd_15m_tv.json',
      tpList: [40, 50, 60, 80, 100, 120],
      emaList: [50, 100],
      swList: [[2, 4], [3, 5], [3, 7]],
      beList: [0.25, 0.30, 0.35],
      lock1List: [{ trigger: 0.8, val: 0.6 }, { trigger: 1.0, val: 0.8 }],
      lock2List: [{ trigger: 1.4, val: 1.2 }, { trigger: 0, val: 0 }],
      coolList: [8, 12]
    },
    {
      tf: '30M',
      file: 'xauusd_30m_tv.json',
      tpList: [50, 60, 80, 100, 120, 150],
      emaList: [50, 100],
      swList: [[2, 3], [3, 5]],
      beList: [0.25, 0.30],
      lock1List: [{ trigger: 0.8, val: 0.6 }, { trigger: 1.0, val: 0.8 }],
      lock2List: [{ trigger: 1.4, val: 1.2 }, { trigger: 0, val: 0 }],
      coolList: [6, 10]
    },
    {
      tf: '1H',
      file: 'xauusd_1h_tv.json',
      tpList: [80, 100, 120, 150, 180, 200],
      emaList: [50, 100],
      swList: [[2, 3], [3, 5]],
      beList: [0.25, 0.30],
      lock1List: [{ trigger: 0.8, val: 0.6 }, { trigger: 1.0, val: 0.8 }],
      lock2List: [{ trigger: 1.4, val: 1.2 }, { trigger: 0, val: 0 }],
      coolList: [6, 8]
    }
  ];

  const championsFound = [];

  for (const item of timeframes) {
    const candles = JSON.parse(fs.readFileSync(path.join(DATA_DIR, item.file), 'utf8'));
    console.log(`\nEvaluating ${item.tf} (${candles.length} bars)...`);

    const qualified = [];

    for (const emaPeriod of item.emaList) {
      for (const [swMin, swMaj] of item.swList) {
        for (const tpPips of item.tpList) {
          for (const beTriggerR of item.beList) {
            for (const lock1 of item.lock1List) {
              for (const lock2 of item.lock2List) {
                for (const cooldownBars of item.coolList) {
                  const cfg = {
                    emaPeriod,
                    swMin,
                    swMaj,
                    tpPips,
                    atrMult: 0.18,
                    beTriggerR,
                    lock1TriggerR: lock1.trigger,
                    lock1ValR: lock1.val,
                    lock2TriggerR: lock2.trigger,
                    lock2ValR: lock2.val,
                    cooldownBars,
                    minHoldSec: 120,
                    maxHoldBars: item.tf === '1H' ? 72 : item.tf === '30M' ? 60 : 45
                  };

                  const res = runMultiTierSim(candles, cfg);

                  // STRICT CRITERIA:
                  // 1. Max Consecutive Loss <= 1 or 2 (User explicitly requested: "less consecutive loss")
                  // 2. Win Rate >= 80% (User requested: "more winrate")
                  // 3. Calmar >= 4.0, Max DD <= 5.0R
                  // 4. Closed trades >= 20
                  if (res.winRate >= 80.0 && res.maxConsecLoss <= 2 && res.maxDrawdown <= 5.0 && res.calmarRatio >= 4.0 && res.closed >= 20 && res.cumulativeR >= 15.0) {
                    qualified.push(res);
                  }
                }
              }
            }
          }
        }
      }
    }

    console.log(`Qualified candidates on ${item.tf} (WR >= 80%, Consec Loss <= 2, DD <= 5R): ${qualified.length}`);

    // Find the best for each TP target on this TF
    const seenTPs = new Set();
    // Sort by: lowest consecutive loss first, then highest winrate, then highest score
    qualified.sort((a, b) => a.maxConsecLoss - b.maxConsecLoss || b.winRate - a.winRate || b.score - a.score);

    for (const cand of qualified) {
      const tp = cand.config.tpPips;
      if (!seenTPs.has(tp)) {
        seenTPs.add(tp);
        cand.mc = runMonteCarlo(cand.trades, 5000);
        cand.tf = item.tf;
        championsFound.push(cand);

        console.log(`[Champion ${item.tf} | TP: ${tp}p] WR: ${cand.winRate}% (Non-loss: ${cand.nonLossRate}%) | Max Consec Losses: ${cand.maxConsecLoss} LOSS MAX! | Max Consec Wins: ${cand.maxConsecWin} WINS! | Net: +${cand.cumulativeR}R (Sep: +${cand.sepR}R, Oct: +${cand.octR}R) | Calmar: ${cand.calmarRatio} | Max DD: -${cand.maxDrawdown}R | Score: ${cand.score} | MC 95% DD: -${cand.mc.worstDD95}R | [EMA${cand.config.emaPeriod}, Sw:${cand.config.swMin}_${cand.config.swMaj}, BE:${cand.config.beTriggerR}R, Lock1:${cand.config.lock1TriggerR}->+${cand.config.lock1ValR}R]`);
      }
    }
  }

  const outPath = path.join(DATA_DIR, 'ultra_high_wr_more_tp_champions.json');
  fs.writeFileSync(outPath, JSON.stringify(championsFound, null, 2));
  console.log(`\nSaved ${championsFound.length} champions to ${outPath}`);
}

searchUltraHighWRAndMoreTP().catch(console.error);
