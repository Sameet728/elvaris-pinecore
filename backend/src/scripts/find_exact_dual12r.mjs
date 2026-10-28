import fs from 'path';
import fsPromises from 'fs';
import { fileURLToPath } from 'url';

const c5 = JSON.parse(fsPromises.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

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

const sweeps3_7 = precomputeSweeps(c5, 3, 7);

function sim(sweeps, {
  tpPips = 85,
  atrMult = 0.20,
  beTriggerR = 1.4,
  lockInTriggerR = 1.7,
  lockInValR = 1.0,
  cooldownBars = 20,
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
  let wins = 0, losses = 0, beCount = 0;
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
            wins++;
            monthlyWins[mKey]++;
            monthlyR[mKey] += rOutcome;
            cumulativeR += rOutcome;
            if (cumulativeR > peakR) peakR = cumulativeR;
            consecutiveLosses = 0;
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
          } else if (finalRes === 3) {
            beCount++;
          }
          trades.push({ rOutcome, finalRes, mKey, entryTime: t.entryTime, bar: t.bar });
        }
        openTrade = null;
      }
    }

    if (lookLong && (i - setupBarL) > expireBars) lookLong = false;
    if (lookShort && (i - setupBarS) > expireBars) lookShort = false;

    if (lookLong && openTrade === null && !isCooldown && !isDailyBlocked) {
      const activeBFvgs = bFvgsPerBar[i];
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
            const slP = fTop + atr5[i] * atrMult;
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

  const calmar = maxDD > 0 ? cumulativeR / maxDD : cumulativeR;
  const sepR = monthlyR['2026-09'] || 0;
  const octR = monthlyR['2026-10'] || 0;
  const score = (cumulativeR * 2.5) + (calmar * 15.0) + (Math.min(sepR, octR) * 10.0) + (tpPips * 0.3) - (maxDD * 12.0);

  return {
    closed: wins + losses + beCount,
    wins, losses, beCount,
    winRate: (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0,
    cumulativeR: Number(cumulativeR.toFixed(1)),
    maxDrawdown: Number(maxDD.toFixed(1)),
    calmarRatio: Number(calmar.toFixed(2)),
    avgTpPips: tpPips,
    sepR: Number(sepR.toFixed(1)),
    octR: Number(octR.toFixed(1)),
    score: Number(score.toFixed(1)),
    trades,
    monthlyWins, monthlyLosses, monthlyR
  };
}

console.log('Sweeping Sw:3/7 and Sw:3/6 parameters to find the exact highest scoring dual >= 12R configuration...');

const matching = [];

for (const sw of [[3,7, sweeps3_7], [3,6, precomputeSweeps(c5, 3, 6)], [3,5, precomputeSweeps(c5, 3, 5)]]) {
  const [sMin, sMaj, sweepsArr] = sw;
  for (const tpPips of [82, 85, 90, 95, 100, 110, 120, 130]) {
    for (const atrMult of [0.18, 0.20, 0.22, 0.25]) {
      for (const beTriggerR of [1.3, 1.4, 1.5]) {
        for (const lockInTriggerR of [1.6, 1.7, 1.8, 2.0]) {
          for (const lockInValR of [0.8, 1.0, 1.2]) {
            for (const cooldownBars of [16, 20, 24]) {
              for (const maxDailyLosses of [2, 3]) {
                const res = sim(sweepsArr, {
                  tpPips, atrMult, beTriggerR, lockInTriggerR, lockInValR,
                  cooldownBars, consecutiveLossLimit: 2, maxDailyLosses
                });

                if (res.sepR >= 12.0 && res.octR >= 12.0 && res.calmarRatio >= 4.0 && res.maxDrawdown <= 5.5) {
                  matching.push({
                    sMin, sMaj, tpPips, atrMult, beTriggerR, lockInTriggerR, lockInValR,
                    cooldownBars, maxDailyLosses, ...res
                  });
                }
              }
            }
          }
        }
      }
    }
  }
}

matching.sort((a,b) => b.score - a.score);

console.log(`\nFound ${matching.length} matching setups with Sep >= 12R AND Oct >= 12R!`);
console.log('\nTop 10:');
matching.slice(0, 10).forEach((c, idx) => {
  console.log(`#${idx+1} [SCORE: ${c.score}] Sw:${c.sMin}/${c.sMaj} TP:${c.tpPips}p ATR:${c.atrMult} BE:${c.beTriggerR}R Lock:${c.lockInTriggerR}R (val:${c.lockInValR}R) Cool:${c.cooldownBars} Daily:${c.maxDailyLosses}`);
  console.log(`    -> Sep:+${c.sepR}R Oct:+${c.octR}R Cum:+${c.cumulativeR}R | Calmar:${c.calmarRatio} MaxDD:-${c.maxDrawdown}R | Trades:${c.closed} WR:${c.winRate.toFixed(1)}%`);
});

fsPromises.writeFileSync('data/dual_12r_exact_verified.json', JSON.stringify(matching.slice(0, 30), null, 2));
