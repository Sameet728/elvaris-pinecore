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

const dayKeys = new Array(c5.length);
const monthKeys = new Array(c5.length);
const timeMsArr = new Float64Array(c5.length);

for (let i = 0; i < c5.length; i++) {
  const t = c5[i].openTime || c5[i].time;
  timeMsArr[i] = t;
  const d = new Date(t);
  dayKeys[i] = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  monthKeys[i] = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
}

function precomputeActiveFVGs(candles) {
  const n = candles.length;
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
  return { bFvgsPerBar, sFvgsPerBar };
}

const fvgMap = precomputeActiveFVGs(c5);

function precomputeSweeps(candles, swMin = 3, swMaj = 7) {
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

const sweeps = precomputeSweeps(c5, 3, 7);

// Parameters for Score 314.9: EMA100, Sw:3/7, TP:85p, ATR:0.20, BE:1.4R, Lock:1.7R (val:1.0R), Cool:20, Daily:3
function runDetailedSim() {
  const n = c5.length;
  const tpPips = 85.0;
  const atrMult = 0.20;
  const beTriggerR = 1.4;
  const lockInTriggerR = 1.7;
  const lockInValR = 1.0;
  const cooldownBars = 20;
  const consecutiveLossLimit = 2;
  const maxDailyLosses = 3;
  const expireBars = 35;

  const tpDist = tpPips / 10.0;
  const trades = [];
  const monthlyWins = {}, monthlyLosses = {}, monthlyR = {};

  let cumulativeR = 0, peakR = 0, maxDD = 0;
  let lookLong = false, lookShort = false;
  let setupBarL = 0, setupBarS = 0;

  let consecutiveLosses = 0;
  let cooldownUntilBar = -1;
  const dailyLossCount = {};
  let openTrade = null;

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
        t.exitBar = i;
        t.exitTime = timeMs;
        t.exitTimeStr = new Date(timeMs).toISOString();
        t.finalRes = finalRes;
        t.rOutcome = Number(rOutcome.toFixed(2));
        t.holdBars = age;
        t.holdSec = Math.round(holdSec);

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

        t.cumulativeR = Number(cumulativeR.toFixed(2));
        trades.push(t);
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
            if (slDist > 0.8 && slDist < 4.5) {
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
            if (slDist > 0.8 && slDist < 4.5) {
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

  // Run 5,000 Monte Carlo bootstrap iterations
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
    probProfitable: Number(((simCumRs.filter(r => r > 0).length / iterations) * 100).toFixed(1))
  };

  const winsCount = trades.filter(t => t.finalRes === 1 || t.finalRes === 4).length;
  const lossCount = trades.filter(t => t.finalRes === -1).length;
  const beCount = trades.filter(t => t.finalRes === 3).length;

  console.log(`\n======================================================`);
  console.log(`🏆 ULTIMATE GRAND CHAMPION (SCORE: 314.9)`);
  console.log(`TP: ${tpPips} Pips ($${(tpPips/10).toFixed(2)}) | 5M EMA100 Sw:3/7`);
  console.log(`======================================================`);
  console.log(`Total Trades: ${trades.length} (${winsCount}W / ${lossCount}L / ${beCount}BE) | WR: ${((winsCount/(winsCount+lossCount))*100).toFixed(1)}%`);
  console.log(`Cumulative Return: +${cumulativeR.toFixed(2)}R`);
  console.log(`Max Drawdown: -${maxDD.toFixed(2)}R (${(maxDD * 0.5).toFixed(2)}% Equity DD @ 0.5% risk)`);
  console.log(`Calmar Ratio: ${calmar.toFixed(2)}`);
  console.log(`September: +${sepR.toFixed(2)}R (${monthlyWins['2026-09']}W / ${monthlyLosses['2026-09']}L)`);
  console.log(`October: +${octR.toFixed(2)}R (${monthlyWins['2026-10']}W / ${monthlyLosses['2026-10']}L)`);
  console.log(`Monte Carlo (5,000 runs): WorstDD95: -${mc.worstDD95}R | ProbDD<=5R: ${mc.probDDUnder5R}% | ProbProfitable: ${mc.probProfitable}%`);

  const exportData = {
    strategyName: "UltimateGrandChampion_85Pip_Dual15R_PropPassed",
    score: 314.9,
    tf: "5M",
    tpPips,
    sepR: Number(sepR.toFixed(2)),
    octR: Number(octR.toFixed(2)),
    cumulativeR: Number(cumulativeR.toFixed(2)),
    maxDrawdown: Number(maxDD.toFixed(2)),
    calmarRatio: Number(calmar.toFixed(2)),
    winRate: Number(((winsCount/(winsCount+lossCount))*100).toFixed(1)),
    totalClosed: trades.length,
    winsCount, lossCount, beCount,
    monteCarlo: mc,
    trades
  };

  fs.writeFileSync(path.join(DATA_DIR, 'ultimate_champion_314_trades.json'), JSON.stringify(exportData, null, 2));
  console.log(`\nSaved full trade export to ${path.join(DATA_DIR, 'ultimate_champion_314_trades.json')}`);
}

runDetailedSim();
