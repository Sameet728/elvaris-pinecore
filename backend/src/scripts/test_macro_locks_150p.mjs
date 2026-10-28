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

function runMacroSim(candles, config) {
  const n = candles.length;
  const ema = computeEMA(candles, config.emaPeriod);
  const atr = computeATR(candles, 14);
  const sweeps = precomputeSweeps(candles, config.swMin, config.swMaj);

  const timeMsArr = new Float64Array(n);
  const dayKeys = new Array(n);
  const monthKeys = new Array(n);

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
  let maxConsecLoss = 0;
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
      const currentGainR = currentGain / slDistInit;

      // Trailing Dynamic Multi-Tier Locks for Macro 150p Targets:
      // Check locks from highest to lowest
      for (let lockIdx = config.locks.length - 1; lockIdx >= 0; lockIdx--) {
        const lock = config.locks[lockIdx];
        if (currentGainR >= lock.triggerR) {
          if (t.curLockValR < lock.lockValR) {
            t.curLockValR = lock.lockValR;
            t.sl = dir === 1 ? (entry + slDistInit * lock.lockValR) : (entry - slDistInit * lock.lockValR);
            t.lockTier = lockIdx + 1; // 1 = BE (if lockVal=0), 2 = Lock1, etc.
          }
          break;
        }
      }

      const maxHoldBars = config.maxHoldBars || 90;
      if (age >= maxHoldBars) {
        finalRes = 2; resolved = true; // timeout
      } else if (holdSec >= (config.minHoldSec || 120)) {
        if (dir === 1) {
          if (c.high >= tp) { finalRes = 1; resolved = true; }
          else if (c.low <= t.sl) {
            finalRes = t.lockTier > 0 ? (t.curLockValR > 0 ? 10 + t.lockTier : 3) : -1;
            resolved = true;
          }
        } else {
          if (c.low <= tp) { finalRes = 1; resolved = true; }
          else if (c.high >= t.sl) {
            finalRes = t.lockTier > 0 ? (t.curLockValR > 0 ? 10 + t.lockTier : 3) : -1;
            resolved = true;
          }
        }
      }

      if (resolved) {
        const rOutcome = finalRes === 1 ? t.rVal :
                         finalRes >= 10 ? t.curLockValR :
                         finalRes === 3 ? 0.0 : -1.0;

        if (finalRes === 1 || finalRes === -1 || finalRes === 3 || finalRes >= 10) {
          const mKey = monthKeys[t.bar];
          const tDayKey = dayKeys[t.bar];
          if (!monthlyR[mKey]) monthlyR[mKey] = 0;

          if (finalRes === 1 || finalRes >= 10) {
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
            if (consecutiveLosses > maxConsecLoss) maxConsecLoss = consecutiveLosses;
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
            finalRes,
            month: mKey
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
                curLockValR: -1, lockTier: 0
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
                curLockValR: -1, lockTier: 0
              };
              lookShort = false;
              break;
            }
          }
        }
      }
    }
  }

  const closed = trades.length;
  if (closed < 5) return null;

  const wins = trades.filter(t => t.rOutcome > 0).length;
  const losses = trades.filter(t => t.rOutcome < 0).length;
  const beCount = trades.filter(t => t.rOutcome === 0).length;
  const decTrades = wins + losses;
  const winRate = decTrades > 0 ? Number(((wins / decTrades) * 100).toFixed(1)) : 0;
  const calmarRatio = maxDD > 0 ? Number((cumulativeR / maxDD).toFixed(2)) : Number((cumulativeR * 10).toFixed(2));

  const sepR = Number((monthlyR['2026-09'] || 0).toFixed(2));
  const octR = Number((monthlyR['2026-10'] || 0).toFixed(2));

  return {
    closed, wins, losses, beCount, winRate, cumulativeR, maxDrawdown: maxDD, calmarRatio, sepR, octR, monthlyR, maxConsecLoss, trades
  };
}

async function explore() {
  console.log('=== EXPLORING MACRO LOCK TIERS FOR 150+ PIP TARGETS ACROSS ALL TFS ===');
  
  const timeframes = ['5m', '15m', '30m', '1h'];
  
  // Test various lock structures
  const lockProfiles = [
    // Profile 0: Classic 2-tier lock
    [
      { triggerR: 0.25, lockValR: 0.0 },
      { triggerR: 0.80, lockValR: 0.6 },
      { triggerR: 1.40, lockValR: 1.2 }
    ],
    // Profile 1: Standard 4-tier
    [
      { triggerR: 0.25, lockValR: 0.0 },
      { triggerR: 0.8, lockValR: 0.6 },
      { triggerR: 1.5, lockValR: 1.2 },
      { triggerR: 3.0, lockValR: 2.5 }
    ],
    // Profile 2: High yield trailing
    [
      { triggerR: 0.25, lockValR: 0.0 },
      { triggerR: 0.7, lockValR: 0.5 },
      { triggerR: 1.5, lockValR: 1.2 },
      { triggerR: 2.5, lockValR: 2.0 },
      { triggerR: 4.0, lockValR: 3.5 }
    ],
    // Profile 3: Pure swing runner
    [
      { triggerR: 0.35, lockValR: 0.0 },
      { triggerR: 1.0, lockValR: 0.8 },
      { triggerR: 2.0, lockValR: 1.6 },
      { triggerR: 3.0, lockValR: 2.5 }
    ]
  ];

  for (const tf of timeframes) {
    const filePath = path.join(DATA_DIR, `xauusd_${tf}_tv.json`);
    if (!fs.existsSync(filePath)) continue;
    const candles = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    const tpTargets = [150, 160, 180, 200];
    const swingPairs = [[2, 3], [2, 4], [3, 5], [4, 6]];
    const emaList = [50, 100];
    const coolList = [6, 8, 12];
    const maxHoldList = tf === '5m' ? [60, 90, 120] : tf === '15m' ? [45, 60, 80] : [60, 72, 96];

    const allRuns = [];

    for (const tpPips of tpTargets) {
      for (let pIdx = 0; pIdx < lockProfiles.length; pIdx++) {
        const locks = lockProfiles[pIdx];
        for (const [swMin, swMaj] of swingPairs) {
          for (const emaPeriod of emaList) {
            for (const cooldownBars of coolList) {
              for (const maxHoldBars of maxHoldList) {
                const config = {
                  tpPips,
                  swMin,
                  swMaj,
                  emaPeriod,
                  atrMult: 0.18,
                  cooldownBars,
                  maxHoldBars,
                  minHoldSec: 120,
                  expireBars: 25,
                  locks
                };

                const res = runMacroSim(candles, config);
                if (!res) continue;

                allRuns.push({
                  tf: tf.toUpperCase(),
                  tpPips,
                  profileIdx: pIdx,
                  config,
                  res
                });
              }
            }
          }
        }
      }
    }

    console.log(`\n--- TOP CANDIDATES ON ${tf.toUpperCase()} (TP >= 150p) ---`);
    allRuns.sort((a, b) => (b.res.sepR + b.res.octR) * (b.res.winRate / 100) - (a.res.sepR + a.res.octR) * (a.res.winRate / 100));
    allRuns.slice(0, 5).forEach((w, i) => {
      console.log(`#${i+1} [${w.tf}] TP: ${w.tpPips}p | WR: ${w.res.winRate}% (${w.res.wins}W/${w.res.losses}L/${w.res.beCount}BE) | Net: +${w.res.cumulativeR}R | Sep: +${w.res.sepR}R | Oct: +${w.res.octR}R | DD: -${w.res.maxDrawdown}R | Calmar: ${w.res.calmarRatio} | MaxLoss: ${w.res.maxConsecLoss}`);
      console.log('    Profile:', w.profileIdx, 'Config:', { ema: w.config.emaPeriod, sw: [w.config.swMin, w.config.swMaj], cool: w.config.cooldownBars, hold: w.config.maxHoldBars });
    });
  }
}

explore().catch(console.error);
