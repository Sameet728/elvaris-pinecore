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

// 5M Search Engine
const candles = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_5m_tv.json'), 'utf8'));
const n = candles.length;
console.log(`Loaded 5M candles: ${n} bars (from ${new Date(candles[0].openTime).toISOString()} to ${new Date(candles[n - 1].openTime).toISOString()})`);

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

const fvgMap = { bFvgsPerBar, sFvgsPerBar };
const atr = computeATR(candles, 14);

const emas = {
  EMA50: computeEMA(candles, 50),
  EMA100: computeEMA(candles, 100),
  EMA120: computeEMA(candles, 120),
  EMA200: computeEMA(candles, 200)
};

const sweepCache = {
  '2_4': precomputeSweeps(candles, 2, 4),
  '3_5': precomputeSweeps(candles, 3, 5),
  '4_6': precomputeSweeps(candles, 4, 6),
  '5_10': precomputeSweeps(candles, 5, 10)
};

function runSim({
  emaKey,
  swKey,
  tpPips,
  atrMult,
  beTriggerR,
  lockInTriggerR,
  lockInValR,
  cooldownBars,
  minHoldSec = 120
}) {
  const ema = emas[emaKey];
  const sweeps = sweepCache[swKey];
  const tpDist = tpPips / 10.0;
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
    const isDailyBlocked = (dailyLossCount[dayKey] || 0) >= 3;

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

      if (age >= 45) {
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

          if (!monthlyR[mKey]) monthlyR[mKey] = 0;

          if (finalRes === 1 || finalRes === 4) {
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
            if (consecutiveLosses >= 2 && cooldownBars > 0) {
              cooldownUntilBar = i + cooldownBars;
            }
          }

          trades.push({
            rOutcome,
            rVal: t.rVal,
            finalRes
          });
        }
        openTrade = null;
      }
    }

    if (lookLong && (i - setupBarL) > 25) lookLong = false;
    if (lookShort && (i - setupBarS) > 25) lookShort = false;

    if (lookLong && openTrade === null && !isCooldown && !isDailyBlocked) {
      const activeBFvgs = fvgMap.bFvgsPerBar[i];
      for (let f = activeBFvgs.length - 1; f >= 0; f--) {
        if (activeBFvgs[f].bar > setupBarL) {
          const { top: fTop, bot: fBot } = activeBFvgs[f];
          if (c.low <= fTop && c.close > fBot) {
            const entryP = c.close;
            const slP = fBot - atr[i] * atrMult;
            const slDist = entryP - slP;
            const maxSlAllowed = Math.max(2.0, tpDist / 1.5);
            if (slDist > 0.4 && slDist < maxSlAllowed) {
              const tpP = entryP + tpDist;
              openTrade = {
                dir: 1, entry: entryP, sl: slP, initSL: slP, tp: tpP,
                bar: i, entryTime: timeMs,
                rVal: Number((tpDist / slDist).toFixed(2)),
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
            const maxSlAllowed = Math.max(2.0, tpDist / 1.5);
            if (slDist > 0.4 && slDist < maxSlAllowed) {
              const tpP = entryP - tpDist;
              openTrade = {
                dir: -1, entry: entryP, sl: slP, initSL: slP, tp: tpP,
                bar: i, entryTime: timeMs,
                rVal: Number((tpDist / slDist).toFixed(2)),
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

  const winRate = (winsCount + lossCount) > 0 ? Number(((winsCount / (winsCount + lossCount)) * 100).toFixed(1)) : 0;
  const nonLossRate = trades.length > 0 ? Number((((winsCount + beCount) / trades.length) * 100).toFixed(1)) : 0;

  // Compute Consecutive Wins (TP/Lock) and Losses (SL)
  let curConsecWin = 0, maxConsecWin = 0;
  let curConsecLoss = 0, maxConsecLoss = 0;

  for (const t of trades) {
    if (t.finalRes === 1 || t.finalRes === 4) {
      curConsecWin++;
      if (curConsecWin > maxConsecWin) maxConsecWin = curConsecWin;
      curConsecLoss = 0;
    } else if (t.finalRes === -1) {
      curConsecLoss++;
      if (curConsecLoss > maxConsecLoss) maxConsecLoss = curConsecLoss;
      curConsecWin = 0;
    } else if (t.finalRes === 3) {
      // Break-even pauses loss streak
      curConsecLoss = 0;
    }
  }

  // Composite Score
  // Balances Win Rate, Avg TP, Score, Calmar, and Dual Month performance
  const score = (sepR >= 12 && octR >= 12 && maxDD <= 5.0 && calmar >= 4.0)
    ? Number((cumulativeR * calmar * (winRate / 50.0) * (tpPips / 40.0) / (maxDD || 1)).toFixed(1))
    : 0;

  return {
    emaKey, swKey, tpPips, atrMult, beTriggerR, lockInTriggerR, lockInValR, cooldownBars,
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
    maxConsecWin,
    maxConsecLoss,
    score,
    trades
  };
}

// Grid Search
console.log('Beginning High Win-Rate & Greater TP Grid Search on updated 5M data...');

const emaList = ['EMA50', 'EMA100', 'EMA120', 'EMA200'];
const swList = ['2_4', '3_5', '4_6', '5_10'];
const tpList = [25, 30, 35, 40, 45, 50, 60, 70, 80, 82, 85, 90, 100, 110, 120, 140];
const atrList = [0.18, 0.20, 0.22];
const beList = [0.3, 0.4, 0.5, 0.6, 1.0, 1.4];
const lockTriggerList = [0.6, 0.8, 1.0, 1.2, 1.4, 1.5];
const lockValList = [0.6, 0.8, 1.0, 1.2, 1.3];
const coolList = [6, 10, 14, 20];

const results = [];
let evaluated = 0;

for (const emaKey of emaList) {
  for (const swKey of swList) {
    for (const tpPips of tpList) {
      for (const atrMult of atrList) {
        for (const beTriggerR of beList) {
          for (const lockInTriggerR of lockTriggerList) {
            if (lockInTriggerR <= beTriggerR) continue;
            for (const lockInValR of lockValList) {
              if (lockInValR >= lockInTriggerR) continue;
              for (const cooldownBars of coolList) {
                evaluated++;
                const res = runSim({
                  emaKey, swKey, tpPips, atrMult, beTriggerR, lockInTriggerR, lockInValR, cooldownBars
                });

                // Filter for strict prop rules: both months >= 12R, Calmar >= 4.0, Max DD <= 5.0R
                if (res.sepR >= 12.0 && res.octR >= 12.0 && res.maxDrawdown <= 5.0 && res.calmarRatio >= 4.0 && res.closed >= 30) {
                  results.push(res);
                }
              }
            }
          }
        }
      }
    }
  }
}

console.log(`Evaluated ${evaluated} configurations. Qualified setups meeting ALL rules: ${results.length}`);

// Sort by winRate descending
const byWinRate = [...results].sort((a, b) => b.winRate - a.winRate);
console.log('\n======================================================');
console.log('TOP 10 SETUPS BY HIGHEST WIN RATE (Both Months >= 12R, DD <= 5R):');
console.log('======================================================');
byWinRate.slice(0, 10).forEach((c, idx) => {
  console.log(`#${idx + 1} | WR: ${c.winRate}% (Non-loss: ${c.nonLossRate}%) | TP: ${c.tpPips}p | RR: 1:${c.avgRR} | Net: +${c.cumulativeR}R (Sep: +${c.sepR}R, Oct: +${c.octR}R) | Calmar: ${c.calmarRatio} | Max DD: -${c.maxDrawdown}R | Max Wins in row: ${c.maxConsecWin} | Max Loss in row: ${c.maxConsecLoss} | Score: ${c.score} | [${c.emaKey}, Sw:${c.swKey}, BE:${c.beTriggerR}R, Lock:${c.lockInTriggerR}->+${c.lockInValR}R, Cool:${c.cooldownBars}]`);
});

// Sort by Score descending
const byScore = [...results].sort((a, b) => b.score - a.score);
console.log('\n======================================================');
console.log('TOP 10 SETUPS BY COMPOSITE SCORE (Both Months >= 12R, DD <= 5R):');
console.log('======================================================');
byScore.slice(0, 10).forEach((c, idx) => {
  console.log(`#${idx + 1} | Score: ${c.score} | WR: ${c.winRate}% | TP: ${c.tpPips}p | RR: 1:${c.avgRR} | Net: +${c.cumulativeR}R (Sep: +${c.sepR}R, Oct: +${c.octR}R) | Calmar: ${c.calmarRatio} | Max DD: -${c.maxDrawdown}R | Max Wins: ${c.maxConsecWin} | Max Loss: ${c.maxConsecLoss} | [${c.emaKey}, Sw:${c.swKey}, BE:${c.beTriggerR}R, Lock:${c.lockInTriggerR}->+${c.lockInValR}R, Cool:${c.cooldownBars}]`);
});

// Group by TP targets to show GREATER AVG TP options with high win rate
console.log('\n======================================================');
console.log('BEST STRATEGY FOR EACH TAKE PROFIT TARGET (25p to 140p):');
console.log('======================================================');
const tpBuckets = [25, 30, 35, 40, 45, 50, 60, 70, 80, 82, 85, 90, 100, 110, 120, 140];
const frontier = [];
for (const tp of tpBuckets) {
  const matches = results.filter(r => r.tpPips === tp);
  if (matches.length > 0) {
    matches.sort((a, b) => b.winRate - a.winRate || b.score - a.score);
    const best = matches[0];
    frontier.push(best);
    console.log(`TP: ${best.tpPips} Pips | WR: ${best.winRate}% (Non-loss: ${best.nonLossRate}%) | RR: 1:${best.avgRR} | Net: +${best.cumulativeR}R (Sep: +${best.sepR}R, Oct: +${best.octR}R) | Calmar: ${best.calmarRatio} | Max DD: -${best.maxDrawdown}R | Max Wins: ${best.maxConsecWin} | Max Loss: ${best.maxConsecLoss} | Score: ${best.score} | [${best.emaKey}, Sw:${best.swKey}, Lock:${best.lockInTriggerR}->+${best.lockInValR}R]`);
  }
}

fs.writeFileSync(path.join(DATA_DIR, 'frontier_all_tp_targets_5m.json'), JSON.stringify(frontier, null, 2));
console.log('\nSaved 5M frontier targets to data/frontier_all_tp_targets_5m.json');
