import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeATR } from './fast_evaluator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const c5 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_5m_tv.json'), 'utf8'));
const atr5 = computeATR(c5, 14);

function simulateFineTuned(candles, atr, {
  swMin = 4,
  swMaj = 7,
  rr = 3.3,
  atrMult = 0.45,
  minTp = 8.0,
  maxTp = 10.0,
  beTriggerR = 1.0,
  lockInTriggerR = 1.5,
  lockInValR = 0.5,
  maxDailyLosses = 2,
  consecutiveLossLimit = 2,
  cooldownBars = 0,
  useSession = false,
  expireBars = 35,
  minHoldSeconds = 120
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
  let setupBarL = 0, setupBarS = 0, setupSLL = 0, setupSLS = 0;

  let consecutiveLosses = 0;
  let cooldownUntilBar = -1;
  const dailyLossCount = {};

  for (let i = 2; i < n; i++) {
    const c = candles[i];
    const prev2C = candles[i - 2];
    const timeMs = c.openTime || c.time;
    const d = new Date(timeMs);
    const dayKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
    const hour = d.getUTCHours();

    const isCooldown = i < cooldownUntilBar;
    const isDailyBlocked = (dailyLossCount[dayKey] || 0) >= maxDailyLosses;
    const isSessionAllowed = !useSession || (hour >= 6 && hour < 21);

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
      if (isH1) { bslLvls.push(pH); bslSwept.push(false); if (bslLvls.length > 12) { bslLvls.shift(); bslSwept.shift(); } }
      if (isL1) { sslLvls.push(pL); sslSwept.push(false); if (sslLvls.length > 12) { sslLvls.shift(); sslSwept.shift(); } }
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
      if (isH2) { bslLvls.push(pH); bslSwept.push(false); if (bslLvls.length > 12) { bslLvls.shift(); bslSwept.shift(); } }
      if (isL2) { sslLvls.push(pL); sslSwept.push(false); if (sslLvls.length > 12) { sslLvls.shift(); sslSwept.shift(); } }
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
        if (!isCooldown && !isDailyBlocked && isSessionAllowed) {
          lookLong = true; lookShort = false; setupBarL = i;
          setupSLL = c.low - atr[i] * atrMult;
        }
      }
    }
    for (let k = 0; k < bslLvls.length; k++) {
      if (!bslSwept[k] && c.high > bslLvls[k] && c.close < bslLvls[k]) {
        bslSwept[k] = true;
        if (!isCooldown && !isDailyBlocked && isSessionAllowed) {
          lookShort = true; lookLong = false; setupBarS = i;
          setupSLS = c.high + atr[i] * atrMult;
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

        if (age >= expireBars * 3) {
          sigResult[t] = 2; resolved = true;
        } else if (holdSec >= minHoldSeconds) {
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
            } else if (finalRes === 3) {
              // BE: 0R
            }
          }
        }
      }
    }

    let hasOpen = false;
    for (let t = 0; t < sigResult.length; t++) {
      if (sigResult[t] === 0) { hasOpen = true; break; }
    }

    if (lookLong && (i - setupBarL) > expireBars) lookLong = false;
    if (lookShort && (i - setupBarS) > expireBars) lookShort = false;

    // Trigger entries
    if (lookLong && !hasOpen && !isCooldown && !isDailyBlocked && isSessionAllowed) {
      for (let f = bFvgBar.length - 1; f >= 0; f--) {
        if (bFvgBar[f] > setupBarL) {
          const fTop = bFvgTop[f], fBot = bFvgBot[f];
          if (c.low <= fTop && c.close > fBot) {
            const entryP = c.close;
            const slP = setupSLL;
            const slDist = entryP - slP;

            if (slDist > 0) {
              const tpP = entryP + slDist * rr;
              const tpDist = tpP - entryP;
              if (tpDist >= minTp && tpDist <= maxTp) {
                sigDir.push(1); sigEntry.push(entryP); sigSL.push(slP); sigTP.push(tpP);
                sigResult.push(0); sigBar.push(i); sigRVal.push(rr); sigEntryTime.push(timeMs);
                sigIsBE.push(false); sigIsLocked.push(false);
                lookLong = false; break;
              }
            }
          }
        }
      }
    }

    if (lookShort && !hasOpen && !isCooldown && !isDailyBlocked && isSessionAllowed) {
      for (let f = sFvgBar.length - 1; f >= 0; f--) {
        if (sFvgBar[f] > setupBarS) {
          const fTop = sFvgTop[f], fBot = sFvgBot[f];
          if (c.high >= fBot && c.close < fTop) {
            const entryP = c.close;
            const slP = setupSLS;
            const slDist = slP - entryP;

            if (slDist > 0) {
              const tpP = entryP - slDist * rr;
              const tpDist = entryP - tpP;
              if (tpDist >= minTp && tpDist <= maxTp) {
                sigDir.push(-1); sigEntry.push(entryP); sigSL.push(slP); sigTP.push(tpP);
                sigResult.push(0); sigBar.push(i); sigRVal.push(rr); sigEntryTime.push(timeMs);
                sigIsBE.push(false); sigIsLocked.push(false);
                lookShort = false; break;
              }
            }
          }
        }
      }
    }
  }

  let wins = 0, losses = 0, beCount = 0, sumTpPips = 0;
  for (let t = 0; t < sigResult.length; t++) {
    if (sigResult[t] === 1 || sigResult[t] === 4) wins++;
    if (sigResult[t] === -1) losses++;
    if (sigResult[t] === 3) beCount++;
    if (sigResult[t] === 1 || sigResult[t] === -1 || sigResult[t] === 3 || sigResult[t] === 4) {
      sumTpPips += Math.abs(sigTP[t] - sigEntry[t]) * 10;
    }
  }
  const closed = wins + losses + beCount;
  const calmar = maxDD > 0 ? cumulativeR / maxDD : cumulativeR;
  const avgTp = closed > 0 ? sumTpPips / closed : 0;
  const sepR = monthlyR['2026-09'] || 0;
  const octR = monthlyR['2026-10'] || 0;

  return {
    closed, wins, losses, beCount,
    winRate: (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0,
    cumulativeR: Number(cumulativeR.toFixed(1)),
    maxDrawdown: Number(maxDD.toFixed(1)),
    calmarRatio: Number(calmar.toFixed(2)),
    avgTpPips: Number(avgTp.toFixed(1)),
    sepR: Number(sepR.toFixed(1)),
    octR: Number(octR.toFixed(1)),
    monthlyWins, monthlyLosses, monthlyR
  };
}

console.log('Testing Fine-Tuned Setup A (SwMin:4 Maj:7) with BE & Lock Control...');
const results = [];

for (const rr of [3.2, 3.3, 3.5]) {
  for (const atrMult of [0.40, 0.42, 0.45]) {
    for (const beTriggerR of [0.8, 1.0, 1.2]) {
      for (const lockInTriggerR of [0.0, 1.3, 1.5]) {
        for (const lockInValR of [0.5]) {
          for (const maxDailyLosses of [2, 3]) {
            for (const useSession of [false, true]) {
              const res = simulateFineTuned(c5, atr5, {
                swMin: 4, swMaj: 7, rr, atrMult, minTp: 8.0, maxTp: 10.0,
                beTriggerR, lockInTriggerR, lockInValR, maxDailyLosses,
                useSession
              });

              if (res.closed >= 4 && res.avgTpPips >= 80 && res.avgTpPips <= 100) {
                results.push({ rr, atrMult, beTriggerR, lockInTriggerR, lockInValR, maxDailyLosses, useSession, ...res });
              }
            }
          }
        }
      }
    }
  }
}

const champions = results.filter(r => r.sepR >= 10.0 && r.octR >= 10.0 && r.maxDrawdown <= 3.5 && r.calmarRatio >= 4.0);
console.log(`Evaluated: ${results.length}, Champions: ${champions.length}`);

if (champions.length > 0) {
  champions.sort((a,b) => (b.cumulativeR * 1.5 + b.calmarRatio * 2) - (a.cumulativeR * 1.5 + a.calmarRatio * 2));
  console.log('\n🏆 TOP CHAMPIONS:');
  champions.slice(0, 10).forEach((c, idx) => {
    console.log(`WINNER #${idx+1}: RR:${c.rr} ATR:${c.atrMult} BE:${c.beTriggerR}R Lock:${c.lockInTriggerR}R (val:${c.lockInValR}R) Daily:${c.maxDailyLosses} Sess:${c.useSession} -> Sep:+${c.sepR}R Oct:+${c.octR}R Total:+${c.cumulativeR}R Calmar:${c.calmarRatio} DD:-${c.maxDrawdown}R WR:${c.winRate.toFixed(1)}% Trades:${c.closed} AvgTP:${c.avgTpPips}p`);
  });
} else {
  results.sort((a,b) => (Math.min(b.sepR, b.octR) - Math.min(a.sepR, a.octR)) || (b.cumulativeR - a.cumulativeR));
  console.log('\nTop 15 Closest:');
  results.slice(0, 15).forEach((c, idx) => {
    console.log(`#${idx+1}: RR:${c.rr} ATR:${c.atrMult} BE:${c.beTriggerR}R Lock:${c.lockInTriggerR}R (val:${c.lockInValR}R) Daily:${c.maxDailyLosses} Sess:${c.useSession} -> Sep:+${c.sepR}R Oct:+${c.octR}R Total:+${c.cumulativeR}R Calmar:${c.calmarRatio} DD:-${c.maxDrawdown}R WR:${c.winRate.toFixed(1)}% Trades:${c.closed} AvgTP:${c.avgTpPips}p`);
  });
}
