import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeATR } from './fast_evaluator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

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

const atr5 = computeATR(c5, 14);
const ema200 = computeEMA(c5, 200);

function simulateFine(candles, atr, ema, {
  swMin = 3,
  swMaj = 6,
  tpPips = 80,
  atrMult = 0.20,
  beTriggerR = 1.4,
  lockInTriggerR = 1.6,
  lockInValR = 0.8,
  cooldownBars = 24,
  consecutiveLossLimit = 2,
  maxDailyLosses = 2,
  trailTriggerR = 0.0, // trail after X R
  trailOffsetR = 0.5
}) {
  const n = candles.length;
  const bslLvls = [], bslSwept = [];
  const sslLvls = [], sslSwept = [];
  const bFvgTop = [], bFvgBot = [], bFvgBar = [];
  const sFvgTop = [], sFvgBot = [], sFvgBar = [];

  const sigDir = [], sigEntry = [], sigSL = [], sigTP = [];
  const sigResult = [], sigBar = [], sigRVal = [], sigEntryTime = [], sigIsBE = [], sigIsLocked = [];
  const monthlyWins = {}, monthlyLosses = {}, monthlyR = {};

  let cumulativeR = 0, peakR = 0, maxDD = 0;
  let lookLong = false, lookShort = false;
  let setupBarL = 0, setupBarS = 0;

  let consecutiveLosses = 0;
  let cooldownUntilBar = -1;
  const dailyLossCount = {};
  const tpDist = tpPips / 10;

  for (let i = 2; i < n; i++) {
    const c = candles[i];
    const prev2C = candles[i - 2];
    const timeMs = c.openTime || c.time;
    const d = new Date(timeMs);
    const dayKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;

    const isCooldown = i < cooldownUntilBar;
    const isDailyBlocked = (dailyLossCount[dayKey] || 0) >= maxDailyLosses;

    if (i >= swMin * 2) {
      const pIdx = i - swMin;
      let isH1 = true, isL1 = true;
      const pH = candles[pIdx].high, pL = candles[pIdx].low;
      for (let j = i - swMin * 2; j <= i; j++) {
        if (j !== pIdx) {
          if (candles[j].high > pH) isH1 = false;
          if (candles[j].low < pL) isL1 = false;
        }
      }
      if (isH1) { bslLvls.push(pH); bslSwept.push(false); if (bslLvls.length > 15) { bslLvls.shift(); bslSwept.shift(); } }
      if (isL1) { sslLvls.push(pL); sslSwept.push(false); if (sslLvls.length > 15) { sslLvls.shift(); sslSwept.shift(); } }
    }

    if (i >= swMaj * 2) {
      const pIdx = i - swMaj;
      let isH2 = true, isL2 = true;
      const pH = candles[pIdx].high, pL = candles[pIdx].low;
      for (let j = i - swMaj * 2; j <= i; j++) {
        if (j !== pIdx) {
          if (candles[j].high > pH) isH2 = false;
          if (candles[j].low < pL) isL2 = false;
        }
      }
      if (isH2) { bslLvls.push(pH); bslSwept.push(false); if (bslLvls.length > 15) { bslLvls.shift(); bslSwept.shift(); } }
      if (isL2) { sslLvls.push(pL); sslSwept.push(false); if (sslLvls.length > 15) { sslLvls.shift(); sslSwept.shift(); } }
    }

    if (c.low > prev2C.high) {
      bFvgTop.push(c.low); bFvgBot.push(prev2C.high); bFvgBar.push(i);
      if (bFvgTop.length > 30) { bFvgTop.shift(); bFvgBot.shift(); bFvgBar.shift(); }
    }
    if (c.high < prev2C.low) {
      sFvgTop.push(prev2C.low); sFvgBot.push(c.high); sFvgBar.push(i);
      if (sFvgTop.length > 30) { sFvgTop.shift(); sFvgBot.shift(); sFvgBar.shift(); }
    }

    for (let k = 0; k < sslLvls.length; k++) {
      if (!sslSwept[k] && c.low < sslLvls[k] && c.close > sslLvls[k]) {
        sslSwept[k] = true;
        if (c.close > ema[i] && !isCooldown && !isDailyBlocked) {
          lookLong = true; lookShort = false; setupBarL = i;
        }
      }
    }
    for (let k = 0; k < bslLvls.length; k++) {
      if (!bslSwept[k] && c.high > bslLvls[k] && c.close < bslLvls[k]) {
        bslSwept[k] = true;
        if (c.close < ema[i] && !isCooldown && !isDailyBlocked) {
          lookShort = true; lookLong = false; setupBarS = i;
        }
      }
    }

    // Trade Resolution
    for (let t = 0; t < sigDir.length; t++) {
      if (sigResult[t] === 0) {
        const dir = sigDir[t];
        const tp = sigTP[t];
        let sl = sigSL[t];
        const entry = sigEntry[t];
        const age = i - sigBar[t];
        const holdSec = (timeMs - sigEntryTime[t]) / 1000;
        let resolved = false;

        const slDistInit = Math.abs(entry - sigSL[t]);
        const currentGain = dir === 1 ? (c.high - entry) : (entry - c.low);

        if (beTriggerR > 0 && !sigIsBE[t]) {
          if (currentGain >= slDistInit * beTriggerR) {
            sigSL[t] = entry;
            sigIsBE[t] = true;
          }
        }

        if (lockInTriggerR > 0 && !sigIsLocked[t]) {
          if (currentGain >= slDistInit * lockInTriggerR) {
            sigSL[t] = dir === 1 ? (entry + slDistInit * lockInValR) : (entry - slDistInit * lockInValR);
            sigIsLocked[t] = true;
          }
        }

        // Optional Trailing
        if (trailTriggerR > 0 && currentGain >= slDistInit * trailTriggerR) {
          const trailSL = dir === 1 ? (c.high - slDistInit * trailOffsetR) : (c.low + slDistInit * trailOffsetR);
          if (dir === 1 && trailSL > sigSL[t]) sigSL[t] = trailSL;
          if (dir === -1 && trailSL < sigSL[t]) sigSL[t] = trailSL;
        }

        if (age >= 105) {
          sigResult[t] = 2; resolved = true;
        } else if (holdSec >= 120) {
          if (dir === 1) {
            if (c.high >= tp) { sigResult[t] = 1; resolved = true; }
            else if (c.low <= sigSL[t]) { sigResult[t] = sigIsLocked[t] ? 4 : sigIsBE[t] ? 3 : -1; resolved = true; }
          } else {
            if (c.low <= tp) { sigResult[t] = 1; resolved = true; }
            else if (c.high >= sigSL[t]) { sigResult[t] = sigIsLocked[t] ? 4 : sigIsBE[t] ? 3 : -1; resolved = true; }
          }
        }

        if (resolved) {
          const finalRes = sigResult[t];
          const rOutcome = finalRes === 1 ? sigRVal[t] : finalRes === 4 ? lockInValR : finalRes === 3 ? 0.0 : -1.0;
          if (finalRes === 1 || finalRes === -1 || finalRes === 3 || finalRes === 4) {
            const entryD = new Date(sigEntryTime[t]);
            const mKey = `${entryD.getUTCFullYear()}-${String(entryD.getUTCMonth() + 1).padStart(2, '0')}`;
            const tDayKey = `${entryD.getUTCFullYear()}-${String(entryD.getUTCMonth()+1).padStart(2,'0')}-${String(entryD.getUTCDate()).padStart(2,'0')}`;

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
          }
        }
      }
    }

    let hasOpen = false;
    for (let t = 0; t < sigResult.length; t++) {
      if (sigResult[t] === 0) { hasOpen = true; break; }
    }

    if (lookLong && (i - setupBarL) > 35) lookLong = false;
    if (lookShort && (i - setupBarS) > 35) lookShort = false;

    if (lookLong && !hasOpen && !isCooldown && !isDailyBlocked) {
      for (let f = bFvgBar.length - 1; f >= 0; f--) {
        if (bFvgBar[f] > setupBarL) {
          const fTop = bFvgTop[f], fBot = bFvgBot[f];
          if (c.low <= fTop && c.close > fBot) {
            const entryP = c.close;
            const slP = fBot - atr[i] * atrMult;
            const slDist = entryP - slP;
            if (slDist > 0.8 && slDist < 4.5) {
              const tpP = entryP + tpDist;
              sigDir.push(1); sigEntry.push(entryP); sigSL.push(slP); sigTP.push(tpP);
              sigResult.push(0); sigBar.push(i); sigRVal.push(tpDist / slDist); sigEntryTime.push(timeMs);
              sigIsBE.push(false); sigIsLocked.push(false);
              lookLong = false; break;
            }
          }
        }
      }
    }

    if (lookShort && !hasOpen && !isCooldown && !isDailyBlocked) {
      for (let f = sFvgBar.length - 1; f >= 0; f--) {
        if (sFvgBar[f] > setupBarS) {
          const fTop = sFvgTop[f], fBot = sFvgBot[f];
          if (c.high >= fBot && c.close < fTop) {
            const entryP = c.close;
            const slP = fTop + atr[i] * atrMult;
            const slDist = slP - entryP;
            if (slDist > 0.8 && slDist < 4.5) {
              const tpP = entryP - tpDist;
              sigDir.push(-1); sigEntry.push(entryP); sigSL.push(slP); sigTP.push(tpP);
              sigResult.push(0); sigBar.push(i); sigRVal.push(tpDist / slDist); sigEntryTime.push(timeMs);
              sigIsBE.push(false); sigIsLocked.push(false);
              lookShort = false; break;
            }
          }
        }
      }
    }
  }

  let wins = 0, losses = 0, beCount = 0;
  for (let t = 0; t < sigResult.length; t++) {
    if (sigResult[t] === 1 || sigResult[t] === 4) wins++;
    if (sigResult[t] === -1) losses++;
    if (sigResult[t] === 3) beCount++;
  }
  const closed = wins + losses + beCount;
  const calmar = maxDD > 0 ? cumulativeR / maxDD : cumulativeR;
  const sepR = monthlyR['2026-09'] || 0;
  const octR = monthlyR['2026-10'] || 0;

  return {
    closed, wins, losses, beCount,
    winRate: (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0,
    cumulativeR: Number(cumulativeR.toFixed(1)),
    maxDrawdown: Number(maxDD.toFixed(1)),
    calmarRatio: Number(calmar.toFixed(2)),
    avgTpPips: tpPips,
    sepR: Number(sepR.toFixed(1)),
    octR: Number(octR.toFixed(1)),
    monthlyWins, monthlyLosses, monthlyR
  };
}

console.log('Fine-tuning Setup #3 risk controls...');
const hits = [];

for (const tpPips of [80, 85, 90]) {
  for (const atrMult of [0.18, 0.20, 0.22]) {
    for (const beTriggerR of [1.2, 1.3, 1.4]) {
      for (const lockInTriggerR of [1.5, 1.6, 1.7]) {
        for (const lockInValR of [0.6, 0.7, 0.8]) {
          for (const cooldownBars of [24, 30, 36, 42, 48]) {
            for (const maxDailyLosses of [2, 3]) {
              const res = simulateFine(c5, atr5, ema200, {
                swMin: 3, swMaj: 6, tpPips, atrMult, beTriggerR, lockInTriggerR, lockInValR,
                cooldownBars, consecutiveLossLimit: 2, maxDailyLosses
              });

              if (res.sepR >= 10.0 && res.octR >= 10.0) {
                hits.push({ tpPips, atrMult, beTriggerR, lockInTriggerR, lockInValR, cooldownBars, maxDailyLosses, ...res });
              }
            }
          }
        }
      }
    }
  }
}

console.log(`Found ${hits.length} configurations with Sep >= 10.0R AND Oct >= 10.0R!`);
hits.sort((a,b) => a.maxDrawdown - b.maxDrawdown || b.calmarRatio - a.calmarRatio);

console.log('\nTop 15 lowest drawdown champions:');
hits.slice(0, 15).forEach((c, idx) => {
  console.log(`#${idx+1}: TP:${c.tpPips}p ATR:${c.atrMult} BE:${c.beTriggerR}R Lock:${c.lockInTriggerR}R (val:${c.lockInValR}R) Cool:${c.cooldownBars} Daily:${c.maxDailyLosses} -> Sep:+${c.sepR}R Oct:+${c.octR}R Total:+${c.cumulativeR}R Calmar:${c.calmarRatio} MaxDD:-${c.maxDrawdown}R WR:${c.winRate.toFixed(1)}% Trades:${c.closed}`);
});

fs.writeFileSync(path.join(DATA_DIR, 'champions_80_100_pips.json'), JSON.stringify(hits, null, 2));
