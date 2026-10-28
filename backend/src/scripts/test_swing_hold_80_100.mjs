import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeATR } from './fast_evaluator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const c5 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_5m_tv.json'), 'utf8'));
const c15 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_15m_tv.json'), 'utf8'));
const c30 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_30m_tv.json'), 'utf8'));

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
const atr15 = computeATR(c15, 14);
const atr30 = computeATR(c30, 14);

const ema100_5 = computeEMA(c5, 100);
const ema100_15 = computeEMA(c15, 100);
const ema100_30 = computeEMA(c30, 100);

// Simulator allowing sufficient hold time (up to 24h) for 80-100 pip swings
function simulateSwingTrades(candles, atr, ema, {
  swMin = 3,
  swMaj = 6,
  tpPips = 85,
  atrMult = 0.25,
  beTriggerR = 0.8,
  lockInTriggerR = 1.4,
  maxHoldHours = 24,
  tfMinutes = 5
}) {
  const n = candles.length;
  const maxHoldBars = Math.floor((maxHoldHours * 60) / tfMinutes);

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
  const tpDist = tpPips / 10;

  for (let i = 2; i < n; i++) {
    const c = candles[i];
    const prev2C = candles[i - 2];
    const timeMs = c.openTime || c.time;

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
        if (c.close > ema[i]) {
          lookLong = true; lookShort = false; setupBarL = i;
        }
      }
    }
    for (let k = 0; k < bslLvls.length; k++) {
      if (!bslSwept[k] && c.high > bslLvls[k] && c.close < bslLvls[k]) {
        bslSwept[k] = true;
        if (c.close < ema[i]) {
          lookShort = true; lookLong = false; setupBarS = i;
        }
      }
    }

    // Trade resolution
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

        if (beTriggerR > 0 && !sigIsBE[t] && currentGain >= slDistInit * beTriggerR) {
          sigSL[t] = entry;
          sigIsBE[t] = true;
        }

        if (lockInTriggerR > 0 && !sigIsLocked[t] && currentGain >= slDistInit * lockInTriggerR) {
          sigSL[t] = dir === 1 ? (entry + slDistInit * 0.5) : (entry - slDistInit * 0.5);
          sigIsLocked[t] = true;
        }

        if (age >= maxHoldBars) {
          // Timeout exit at market close
          resolved = true;
          const exitGain = dir === 1 ? (c.close - entry) : (entry - c.close);
          const rGain = exitGain / slDistInit;
          if (rGain > 0) {
            sigResult[t] = 1; // Closed in profit
            sigRVal[t] = rGain;
          } else {
            sigResult[t] = sigIsBE[t] ? 3 : -1;
          }
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
          const rOutcome = finalRes === 1 ? sigRVal[t] : finalRes === 4 ? 0.5 : finalRes === 3 ? 0.0 : -1.0;
          if (finalRes === 1 || finalRes === -1 || finalRes === 3 || finalRes === 4) {
            const entryD = new Date(sigEntryTime[t]);
            const mKey = `${entryD.getUTCFullYear()}-${String(entryD.getUTCMonth() + 1).padStart(2, '0')}`;
            if (!monthlyWins[mKey]) { monthlyWins[mKey] = 0; monthlyLosses[mKey] = 0; monthlyR[mKey] = 0; }

            if (finalRes === 1 || finalRes === 4) {
              monthlyWins[mKey]++;
              monthlyR[mKey] += rOutcome;
              cumulativeR += rOutcome;
              if (cumulativeR > peakR) peakR = cumulativeR;
            } else if (finalRes === -1) {
              monthlyLosses[mKey]++;
              monthlyR[mKey] -= 1.0;
              cumulativeR -= 1.0;
              const dd = peakR - cumulativeR;
              if (dd > maxDD) maxDD = dd;
            }
          }
        }
      }
    }

    let hasOpen = false;
    for (let t = 0; t < sigResult.length; t++) {
      if (sigResult[t] === 0) { hasOpen = true; break; }
    }

    if (lookLong && (i - setupBarL) > 40) lookLong = false;
    if (lookShort && (i - setupBarS) > 40) lookShort = false;

    // Long entry
    if (lookLong && !hasOpen) {
      for (let f = bFvgBar.length - 1; f >= 0; f--) {
        if (bFvgBar[f] > setupBarL) {
          const fTop = bFvgTop[f], fBot = bFvgBot[f];
          if (c.low <= fTop && c.close > fBot) {
            const entryP = c.close;
            const slP = fBot - atr[i] * atrMult;
            const slDist = entryP - slP;

            if (slDist > 0.8 && slDist < 6.5) {
              const tpP = entryP + tpDist;
              const tradeRR = tpDist / slDist;

              sigDir.push(1); sigEntry.push(entryP); sigSL.push(slP); sigTP.push(tpP);
              sigResult.push(0); sigBar.push(i); sigRVal.push(tradeRR); sigEntryTime.push(timeMs);
              sigIsBE.push(false); sigIsLocked.push(false);
              lookLong = false; break;
            }
          }
        }
      }
    }

    // Short entry
    if (lookShort && !hasOpen) {
      for (let f = sFvgBar.length - 1; f >= 0; f--) {
        if (sFvgBar[f] > setupBarS) {
          const fTop = sFvgTop[f], fBot = sFvgBot[f];
          if (c.high >= fBot && c.close < fTop) {
            const entryP = c.close;
            const slP = fTop + atr[i] * atrMult;
            const slDist = slP - entryP;

            if (slDist > 0.8 && slDist < 6.5) {
              const tpP = entryP - tpDist;
              const tradeRR = tpDist / slDist;

              sigDir.push(-1); sigEntry.push(entryP); sigSL.push(slP); sigTP.push(tpP);
              sigResult.push(0); sigBar.push(i); sigRVal.push(tradeRR); sigEntryTime.push(timeMs);
              sigIsBE.push(false); sigIsLocked.push(false);
              lookShort = false; break;
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

console.log('Testing Swing Trades on M5, M15, M30 with 24-Hour Max Hold...');
const champions = [];

for (const tf of [
  { name: 'M5', candles: c5, atr: atr5, ema: ema100_5, tfMin: 5 },
  { name: 'M15', candles: c15, atr: atr15, ema: ema100_15, tfMin: 15 },
  { name: 'M30', candles: c30, atr: atr30, ema: ema100_30, tfMin: 30 }
]) {
  for (const swMin of [2, 3, 4]) {
    for (const swMaj of [5, 6, 7, 8]) {
      for (const tpPips of [80, 85, 90, 95, 100]) {
        for (const atrMult of [0.15, 0.25, 0.35]) {
          for (const beTriggerR of [0.7, 0.8, 1.0]) {
            for (const lockInTriggerR of [0.0, 1.4, 1.6]) {
              const res = simulateSwingTrades(tf.candles, tf.atr, tf.ema, {
                swMin, swMaj, tpPips, atrMult, beTriggerR, lockInTriggerR,
                maxHoldHours: 24, tfMinutes: tf.tfMin
              });

              if (res.closed >= 4 && res.sepR >= 10.0 && res.octR >= 10.0 && res.maxDrawdown <= 3.5 && res.calmarRatio >= 4.0) {
                champions.push({ tf: tf.name, swMin, swMaj, tpPips, atrMult, beTriggerR, lockInTriggerR, ...res });
                console.log(`>>> CHAMPION! [${tf.name}] SwMin:${swMin} Maj:${swMaj} TP:${tpPips}p ATR:${atrMult} BE:${beTriggerR}R Lock:${lockInTriggerR} -> Sep:+${res.sepR}R Oct:+${res.octR}R Total:+${res.cumulativeR}R Calmar:${res.calmarRatio} MaxDD:-${res.maxDrawdown}R WR:${res.winRate.toFixed(1)}% Trades:${res.closed}`);
              }
            }
          }
        }
      }
    }
  }
}

console.log(`Finished swing search! Total champions: ${champions.length}`);
if (champions.length > 0) {
  champions.sort((a,b) => (b.cumulativeR * 1.5 + b.calmarRatio * 2) - (a.cumulativeR * 1.5 + a.calmarRatio * 2));
  console.log('\nTop 5 Champions:');
  champions.slice(0, 5).forEach((c, idx) => {
    console.log(`#${idx+1}: [${c.tf}] SwMin:${c.swMin} Maj:${c.swMaj} TP:${c.tpPips}p ATR:${c.atrMult} BE:${c.beTriggerR}R Lock:${c.lockInTriggerR} -> Sep:+${c.sepR}R Oct:+${c.octR}R Total:+${c.cumulativeR}R Calmar:${c.calmarRatio} DD:-${c.maxDrawdown}R WR:${c.winRate.toFixed(1)}% AvgTP:${c.avgTpPips}p Trades:${c.closed}`);
  });
  fs.writeFileSync(path.join(DATA_DIR, 'champions_80_100_pips.json'), JSON.stringify(champions, null, 2));
}
