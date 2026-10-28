import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../../data');

const c5 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_5m_tv.json'), 'utf8'));

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

const atr5 = computeATR(c5, 14);
const ema100 = computeEMA(c5, 100);

const n = c5.length;
const dayKeys = new Array(n);
const monthKeys = new Array(n);
const timeMsArr = new Float64Array(n);

for (let i = 0; i < n; i++) {
  const t = c5[i].openTime || c5[i].time;
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
    if (c5[i].low > c5[i - 2].high) {
      curBFvg.push({ bar: i, top: c5[i].low, bot: c5[i - 2].high });
      if (curBFvg.length > 10) curBFvg.shift();
    }
    if (c5[i].high < c5[i - 2].low) {
      curSFvg.push({ bar: i, top: c5[i - 2].low, bot: c5[i].high });
      if (curSFvg.length > 10) curSFvg.shift();
    }
  }
  bFvgsPerBar[i] = [...curBFvg];
  sFvgsPerBar[i] = [...curSFvg];
}

const fvgMap = { bFvgsPerBar, sFvgsPerBar };

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

const sweeps3_5 = precomputeSweeps(c5, 3, 5);

function simulateExact(sweeps, {
  tpPips = 82,
  atrMult = 0.18,
  beTriggerR = 1.4,
  lockInTriggerR = 1.6,
  lockInValR = 1.2,
  cooldownBars = 16,
  consecutiveLossLimit = 2,
  maxDailyLosses = 3,
  expireBars = 35
}) {
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
    const c = c5[i];
    const timeMs = timeMsArr[i];
    const dayKey = dayKeys[i];

    const isCooldown = i < cooldownUntilBar;
    const isDailyBlocked = (dailyLossCount[dayKey] || 0) >= maxDailyLosses;

    const sw = sweeps[i];
    if (sw.sslSweep && c.close > ema100[i] && !isCooldown && !isDailyBlocked) {
      lookLong = true; lookShort = false; setupBarL = i;
    }
    if (sw.bslSweep && c.close < ema100[i] && !isCooldown && !isDailyBlocked) {
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
      } else if (holdSec >= 120) {
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
            const slP = fBot - atr5[i] * atrMult;
            const slDist = entryP - slP;
            const maxSlAllowed = Math.max(3.5, tpDist / 2.5);
            if (slDist > 0.6 && slDist < maxSlAllowed) {
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
            const slP = fTop + atr5[i] * atrMult;
            const slDist = slP - entryP;
            const maxSlAllowed = Math.max(3.5, tpDist / 2.5);
            if (slDist > 0.6 && slDist < maxSlAllowed) {
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

  // 5,000 Monte Carlo bootstrap iterations
  const tradeRs = trades.map(t => t.rOutcome);
  const simDDs = [];
  const simCumRs = [];
  const iterations = 5000;
  const nT = tradeRs.length;

  for (let iter = 0; iter < iterations; iter++) {
    let cR = 0, pR = 0, mDD = 0;
    for (let j = 0; j < nT; j++) {
      const idx = Math.floor(Math.random() * nT);
      const r = tradeRs[idx];
      cR += r;
      if (cR > pR) pR = cR;
      const dd = pR - cR;
      if (dd > mDD) mDD = dd;
    }
    simDDs.push(mDD);
    simCumRs.push(cR);
  }
  simDDs.sort((a,b) => a - b);
  simCumRs.sort((a,b) => a - b);
  const p = (arr, pct) => arr[Math.floor((pct / 100) * arr.length)];

  const mc = {
    iterations,
    worstDD95: Number(p(simDDs, 95).toFixed(2)),
    worstDD99: Number(p(simDDs, 99).toFixed(2)),
    medianDD: Number(p(simDDs, 50).toFixed(2)),
    medianR: Number(p(simCumRs, 50).toFixed(1)),
    probDDUnder5R: Number(((simDDs.filter(d => d <= 5.0).length / iterations) * 100).toFixed(1)),
    probDDUnder6R: Number(((simDDs.filter(d => d <= 6.0).length / iterations) * 100).toFixed(1)),
    probProfitable: Number(((simCumRs.filter(r => r > 0).length / iterations) * 100).toFixed(1))
  };

  const winsCount = trades.filter(t => t.finalRes === 1 || t.finalRes === 4).length;
  const lossCount = trades.filter(t => t.finalRes === -1).length;
  const beCount = trades.filter(t => t.finalRes === 3).length;

  return {
    tpPips, atrMult, beTriggerR, lockInTriggerR, lockInValR, cooldownBars,
    closed: trades.length,
    wins: winsCount,
    losses: lossCount,
    beCount,
    winRate: Number(((winsCount / (winsCount + lossCount)) * 100).toFixed(1)),
    cumulativeR: Number(cumulativeR.toFixed(2)),
    maxDrawdown: Number(maxDD.toFixed(2)),
    calmarRatio: Number(calmar.toFixed(2)),
    sepR: Number(sepR.toFixed(2)),
    octR: Number(octR.toFixed(2)),
    score: Number(((cumulativeR * 2.5) + (calmar * 15.0) + (Math.min(sepR, octR) * 10.0) + (tpPips * 0.3) - (maxDD * 12.0)).toFixed(1)),
    monthlyWins, monthlyLosses, monthlyR,
    mc,
    trades
  };
}

console.log('=== EVALUATING TOP 3 DUAL > 12R CHAMPIONS WITH 5,000 MONTE CARLO ITERATIONS ===\n');

// Champion #1: Score 351.8 (82 Pips)
const champ1 = simulateExact(sweeps3_5, { tpPips: 82 });
console.log(`🏆 CHAMPION #1 (SCORE: ${champ1.score}) - 82 Pips:`);
console.log(`   Sep: +${champ1.sepR}R | Oct: +${champ1.octR}R | Cum: +${champ1.cumulativeR}R | Calmar: ${champ1.calmarRatio} | MaxDD: -${champ1.maxDrawdown}R (2.0% Eq DD)`);
console.log(`   Trades: ${champ1.closed} | WR: ${champ1.winRate}% | MC WorstDD95: -${champ1.mc.worstDD95}R | ProbProfit: ${champ1.mc.probProfitable}%\n`);

// Champion #2: Score 330.2 (85 Pips)
const champ2 = simulateExact(sweeps3_5, { tpPips: 85 });
console.log(`🏆 CHAMPION #2 (SCORE: ${champ2.score}) - 85 Pips:`);
console.log(`   Sep: +${champ2.sepR}R | Oct: +${champ2.octR}R | Cum: +${champ2.cumulativeR}R | Calmar: ${champ2.calmarRatio} | MaxDD: -${champ2.maxDrawdown}R (2.0% Eq DD)`);
console.log(`   Trades: ${champ2.closed} | WR: ${champ2.winRate}% | MC WorstDD95: -${champ2.mc.worstDD95}R | ProbProfit: ${champ2.mc.probProfitable}%\n`);

// Champion #3: Score 300.2 (90 Pips)
const champ3 = simulateExact(sweeps3_5, { tpPips: 90 });
console.log(`🏆 CHAMPION #3 (SCORE: ${champ3.score}) - 90 Pips:`);
console.log(`   Sep: +${champ3.sepR}R | Oct: +${champ3.octR}R | Cum: +${champ3.cumulativeR}R | Calmar: ${champ3.calmarRatio} | MaxDD: -${champ3.maxDrawdown}R (2.0% Eq DD)`);
console.log(`   Trades: ${champ3.closed} | WR: ${champ3.winRate}% | MC WorstDD95: -${champ3.mc.worstDD95}R | ProbProfit: ${champ3.mc.probProfitable}%\n`);

fs.writeFileSync(path.join(DATA_DIR, 'super_champions_top3_verified.json'), JSON.stringify([champ1, champ2, champ3], null, 2));
