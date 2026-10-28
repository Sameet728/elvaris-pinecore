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

function inspectSetup9(candles, atr, ema, { maxDailyLosses = 2, cooldownBars = 24, beTriggerR = 1.4, lockInTriggerR = 1.6, lockInValR = 0.8, streakLimit = 2 }) {
  const swMin = 3, swMaj = 6, tpPips = 80, atrMult = 0.20;
  const n = candles.length;
  const bslLvls = [], bslSwept = [];
  const sslLvls = [], sslSwept = [];
  const bFvgTop = [], bFvgBot = [], bFvgBar = [];
  const sFvgTop = [], sFvgBot = [], sFvgBar = [];

  const sigDir = [], sigEntry = [], sigSL = [], sigTP = [];
  const sigResult = [], sigBar = [], sigRVal = [], sigEntryTime = [], sigIsBE = [], sigIsLocked = [];
  const trades = [];

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

            if (finalRes === 1 || finalRes === 4) {
              cumulativeR += rOutcome;
              if (cumulativeR > peakR) peakR = cumulativeR;
              consecutiveLosses = 0;
            } else if (finalRes === -1) {
              cumulativeR -= 1.0;
              const dd = peakR - cumulativeR;
              if (dd > maxDD) maxDD = dd;
              dailyLossCount[tDayKey] = (dailyLossCount[tDayKey] || 0) + 1;
              consecutiveLosses++;
              if (consecutiveLosses >= streakLimit && cooldownBars > 0) {
                cooldownUntilBar = i + cooldownBars;
              }
            }

            trades.push({
              id: trades.length + 1,
              time: entryD.toISOString(),
              dir: sigDir[t] === 1 ? 'BUY' : 'SELL',
              entry: sigEntry[t],
              sl: sigSL[t],
              tp: sigTP[t],
              res: finalRes === 1 ? 'WIN' : finalRes === 4 ? 'LOCK_WIN' : finalRes === 3 ? 'BE' : 'LOSS',
              r: Number(rOutcome.toFixed(2)),
              cumR: Number(cumulativeR.toFixed(2)),
              dd: Number((peakR - cumulativeR).toFixed(2))
            });
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

  let sepR = 0, octR = 0;
  trades.forEach(t => {
    const m = t.time.substring(0, 7);
    if (m === '2026-09') sepR += t.r;
    if (m === '2026-10') octR += t.r;
  });

  return { trades, cumulativeR, maxDD, sepR, octR };
}

const base = inspectSetup9(c5, atr5, ema200, { maxDailyLosses: 2, cooldownBars: 24, beTriggerR: 1.4, lockInTriggerR: 1.6, lockInValR: 0.8, streakLimit: 2 });
console.log(`Base Setup 9: Sep:+${base.sepR.toFixed(1)}R Oct:+${base.octR.toFixed(1)}R Total:+${base.cumulativeR.toFixed(1)}R MaxDD:-${base.maxDD.toFixed(1)}R Calmar:${(base.cumulativeR/base.maxDD).toFixed(2)}`);
console.log('\nTrades with DD >= 3.0R:');
base.trades.filter(t => t.dd >= 3.0).forEach(t => {
  console.log(`Trade #${t.id}: ${t.time.substring(0, 16)} | ${t.dir} | Res:${t.res} (${t.r > 0 ? '+' : ''}${t.r}R) | CumR:${t.cumR} | DD:-${t.dd}R`);
});

// Test variations to bring DD under 3.5R
console.log('\nTesting Variations to Clamp DD <= 3.5R:');
for (const beR of [1.0, 1.2, 1.3, 1.4]) {
  for (const lockR of [1.4, 1.5, 1.6]) {
    for (const lockVal of [0.5, 0.6, 0.8]) {
      for (const dailyL of [1, 2]) {
        for (const cool of [18, 24, 30, 36]) {
          for (const streak of [1, 2]) {
            const v = inspectSetup9(c5, atr5, ema200, { maxDailyLosses: dailyL, cooldownBars: cool, beTriggerR: beR, lockInTriggerR: lockR, lockInValR: lockVal, streakLimit: streak });
            if (v.sepR >= 10.0 && v.octR >= 10.0 && v.maxDD <= 3.5) {
              console.log(`🎯 TARGET HIT! BE:${beR} Lock:${lockR} Val:${lockVal} Daily:${dailyL} Cool:${cool} Streak:${streak} -> Sep:+${v.sepR.toFixed(1)}R Oct:+${v.octR.toFixed(1)}R Total:+${v.cumulativeR.toFixed(1)}R MaxDD:-${v.maxDD.toFixed(1)}R Calmar:${(v.cumulativeR/v.maxDD).toFixed(2)}`);
            }
          }
        }
      }
    }
  }
}
