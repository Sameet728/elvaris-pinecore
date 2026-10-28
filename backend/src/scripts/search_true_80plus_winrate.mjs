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

const candles = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_5m_tv.json'), 'utf8'));
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

const fvgMap = { bFvgsPerBar, sFvgsPerBar };
const atr = computeATR(candles, 14);

const emas = {
  EMA50: computeEMA(candles, 50),
  EMA100: computeEMA(candles, 100),
  EMA200: computeEMA(candles, 200)
};

const sweepCache = {
  '2_4': precomputeSweeps(candles, 2, 4),
  '3_5': precomputeSweeps(candles, 3, 5),
  '4_6': precomputeSweeps(candles, 4, 6)
};

function testSim({
  emaKey = 'EMA50',
  swKey = '2_4',
  tpPips = 25,
  atrMult = 0.20,
  beTriggerR = 0.5,
  lockInTriggerR = 0.9,
  lockInValR = 0.7,
  cooldownBars = 10,
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
    const isDailyBlocked = (dailyLossCount[dayKey] || 0) >= 2;

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

      if (age >= 40) {
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
            const maxSlAllowed = Math.max(2.0, tpDist / 1.6);
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
            const maxSlAllowed = Math.max(2.0, tpDist / 1.6);
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
  let ddUnder5 = 0;
  for (let i = 0; i < iterations; i++) {
    if (simDDs[i] <= 5.0) ddUnder5++;
  }

  return {
    worstDD95: Number(p(simDDs, 95).toFixed(2)),
    medianDD: Number(p(simDDs, 50).toFixed(2)),
    probDDUnder5R: Number(((ddUnder5 / iterations) * 100).toFixed(1))
  };
}

console.log('=== SEARCHING FOR STRICT >= 80% WIN RATE CHAMPIONS ===\n');

const true80Winners = [];

for (const swKey of ['2_4', '3_5', '4_6']) {
  for (const emaKey of ['EMA50', 'EMA100', 'EMA200']) {
    for (const tpPips of [20, 25, 30, 35, 40]) {
      for (const atrMult of [0.15, 0.18, 0.20, 0.25]) {
        for (const beTriggerR of [0.4, 0.5, 0.6]) {
          for (const lockInTriggerR of [0.8, 0.9, 1.0, 1.2]) {
            for (const lockInValR of [0.6, 0.7, 0.8, 1.0]) {
              for (const cooldownBars of [6, 10, 14]) {
                const res = testSim({
                  emaKey, swKey, tpPips, atrMult, beTriggerR, lockInTriggerR, lockInValR, cooldownBars
                });

                if (res && res.closed >= 20 && res.winRate >= 80.0 && res.sepR > 0 && res.octR > 0 && res.maxDrawdown <= 4.0) {
                  true80Winners.push(res);
                }
              }
            }
          }
        }
      }
    }
  }
}

console.log(`Found ${true80Winners.length} strategies strictly achieving Win Rate >= 80.0%!\n`);

true80Winners.sort((a,b) => b.winRate - a.winRate || b.cumulativeR - a.cumulativeR);

const topList = true80Winners.slice(0, 10);
topList.forEach((w, idx) => {
  const mc = runMonteCarlo(w.trades, 5000);
  w.mc = mc;
  console.log(`🎯 [80%+ WIN RATE CHAMPION #${idx+1}] — WIN RATE: ${w.winRate}% (Non-Loss Rate: ${w.nonLossRate}%) | Avg R:R 1:${w.avgRR}`);
  console.log(`   Config: ${w.emaKey} Sw:${w.swKey} TP:${w.tpPips}p ATR:${w.atrMult} BE:${w.beTriggerR}R Lock:${w.lockInTriggerR}R->${w.lockInValR}R Cool:${w.cooldownBars}`);
  console.log(`   Trades: ${w.closed} (Wins: ${w.wins}, Losses: ${w.losses}, BE: ${w.beCount})`);
  console.log(`   Sep: +${w.sepR}R | Oct: +${w.octR}R | Total: +${w.cumulativeR}R | Calmar: ${w.calmarRatio} | MaxDD: -${w.maxDrawdown}R (Eq: ${(w.maxDrawdown*0.5).toFixed(1)}%)`);
  if (mc) {
    console.log(`   Monte Carlo (5,000 runs): Worst 95% DD: -${mc.worstDD95}R | Prob DD <= 5R: ${mc.probDDUnder5R}%\n`);
  }
});

fs.writeFileSync(path.join(DATA_DIR, 'strict_80pct_winrate_champions.json'), JSON.stringify(topList, null, 2));
console.log('Saved to data/strict_80pct_winrate_champions.json');
