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

function inspectCandidate(candles, atr, params) {
  const {
    swMin = 4,
    swMaj = 7,
    rr = 3.3,
    atrMult = 0.45,
    minTp = 8.0,
    maxTp = 10.0,
    expireBars = 35,
    minHoldSeconds = 120
  } = params;

  const n = candles.length;
  const bslLvls = [], bslSwept = [];
  const sslLvls = [], sslSwept = [];
  const bFvgTop = [], bFvgBot = [], bFvgBar = [];
  const sFvgTop = [], sFvgBot = [], sFvgBar = [];

  const trades = [];
  let lookLong = false, lookShort = false;
  let setupBarL = 0, setupBarS = 0, setupSLL = 0, setupSLS = 0;
  let hasOpen = false;

  for (let i = 2; i < n; i++) {
    const c = candles[i];
    const prev2C = candles[i - 2];
    const timeMs = c.openTime || c.time;

    // Check pivots
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

    // FVGs
    if (c.low > prev2C.high) {
      bFvgTop.push(c.low); bFvgBot.push(prev2C.high); bFvgBar.push(i);
      if (bFvgTop.length > 30) { bFvgTop.shift(); bFvgBot.shift(); bFvgBar.shift(); }
    }
    if (c.high < prev2C.low) {
      sFvgTop.push(prev2C.low); sFvgBot.push(c.high); sFvgBar.push(i);
      if (sFvgTop.length > 30) { sFvgTop.shift(); sFvgBot.shift(); sFvgBar.shift(); }
    }

    // Sweeps
    for (let k = 0; k < sslLvls.length; k++) {
      if (!sslSwept[k] && c.low < sslLvls[k] && c.close > sslLvls[k]) {
        sslSwept[k] = true;
        if (!hasOpen) {
          lookLong = true; lookShort = false; setupBarL = i;
          setupSLL = c.low - atr[i] * atrMult;
        }
      }
    }
    for (let k = 0; k < bslLvls.length; k++) {
      if (!bslSwept[k] && c.high > bslLvls[k] && c.close < bslLvls[k]) {
        bslSwept[k] = true;
        if (!hasOpen) {
          lookShort = true; lookLong = false; setupBarS = i;
          setupSLS = c.high + atr[i] * atrMult;
        }
      }
    }

    // Check open trade
    if (trades.length > 0) {
      const last = trades[trades.length - 1];
      if (last.result === 0) {
        const holdSec = (timeMs - last.time) / 1000;
        const age = i - last.bar;

        // Check Intrabar MFE (max favorable excursion)
        const favorable = last.dir === 1 ? (c.high - last.entry) : (last.entry - c.low);
        if (favorable > last.mfe) last.mfe = favorable;

        if (age >= expireBars * 3) {
          last.result = 2; // Expired
          hasOpen = false;
        } else if (holdSec >= minHoldSeconds) {
          if (last.dir === 1) {
            if (c.high >= last.tp) {
              last.result = 1;
              last.exitTime = timeMs;
              last.exitPrice = last.tp;
              hasOpen = false;
            } else if (c.low <= last.sl) {
              last.result = -1;
              last.exitTime = timeMs;
              last.exitPrice = last.sl;
              hasOpen = false;
            }
          } else {
            if (c.low <= last.tp) {
              last.result = 1;
              last.exitTime = timeMs;
              last.exitPrice = last.tp;
              hasOpen = false;
            } else if (c.high >= last.sl) {
              last.result = -1;
              last.exitTime = timeMs;
              last.exitPrice = last.sl;
              hasOpen = false;
            }
          }
        }
      }
    }

    if (lookLong && (i - setupBarL) > expireBars) lookLong = false;
    if (lookShort && (i - setupBarS) > expireBars) lookShort = false;

    // Trigger entries
    if (lookLong && !hasOpen) {
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
                trades.push({
                  id: trades.length + 1,
                  dir: 1,
                  time: timeMs,
                  timeStr: new Date(timeMs).toISOString(),
                  bar: i,
                  entry: entryP,
                  sl: slP,
                  tp: tpP,
                  slDist: Number(slDist.toFixed(2)),
                  tpDist: Number(tpDist.toFixed(2)),
                  tpPips: Number((tpDist * 10).toFixed(1)),
                  rr,
                  result: 0,
                  mfe: 0
                });
                hasOpen = true;
                lookLong = false;
                break;
              }
            }
          }
        }
      }
    }

    if (lookShort && !hasOpen) {
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
                trades.push({
                  id: trades.length + 1,
                  dir: -1,
                  time: timeMs,
                  timeStr: new Date(timeMs).toISOString(),
                  bar: i,
                  entry: entryP,
                  sl: slP,
                  tp: tpP,
                  slDist: Number(slDist.toFixed(2)),
                  tpDist: Number(tpDist.toFixed(2)),
                  tpPips: Number((tpDist * 10).toFixed(1)),
                  rr,
                  result: 0,
                  mfe: 0
                });
                hasOpen = true;
                lookShort = false;
                break;
              }
            }
          }
        }
      }
    }
  }

  return trades;
}

console.log('=== Inspecting Setup A: SwMin:4 Maj:7 RR:3.3 ATR:0.45 ===');
const tradesA = inspectCandidate(c5, atr5, { swMin: 4, swMaj: 7, rr: 3.3, atrMult: 0.45 });
let rA = 0, peakA = 0, ddA = 0;
let sepRA = 0, octRA = 0;
tradesA.forEach(t => {
  const rOutcome = t.result === 1 ? t.rr : t.result === -1 ? -1 : 0;
  rA += rOutcome;
  if (rA > peakA) peakA = rA;
  const curDD = peakA - rA;
  if (curDD > ddA) ddA = curDD;
  const m = t.timeStr.substring(0, 7);
  if (m === '2026-09') sepRA += rOutcome;
  if (m === '2026-10') octRA += rOutcome;
  const mfeR = (t.mfe / t.slDist).toFixed(2);
  console.log(`Trade #${t.id}: ${t.timeStr.substring(0, 16)} | ${t.dir === 1 ? 'BUY ' : 'SELL'} | Entry:${t.entry.toFixed(2)} SL:${t.sl.toFixed(2)} TP:${t.tp.toFixed(2)} | TP:${t.tpPips}p | Res:${t.result === 1 ? 'WIN (+3.3R)' : t.result === -1 ? 'LOSS (-1R)' : 'EXP'} | MFE:${mfeR}R | TotalR:${rA.toFixed(1)}`);
});
console.log(`Summary A: Sep:+${sepRA.toFixed(1)}R | Oct:+${octRA.toFixed(1)}R | Total:+${rA.toFixed(1)}R | MaxDD:-${ddA.toFixed(1)}R\n`);

console.log('=== Inspecting Setup B: SwMin:4 Maj:7 RR:3.5 ATR:0.40 ===');
const tradesB = inspectCandidate(c5, atr5, { swMin: 4, swMaj: 7, rr: 3.5, atrMult: 0.40 });
let rB = 0, peakB = 0, ddB = 0;
let sepRB = 0, octRB = 0;
tradesB.forEach(t => {
  const rOutcome = t.result === 1 ? t.rr : t.result === -1 ? -1 : 0;
  rB += rOutcome;
  if (rB > peakB) peakB = rB;
  const curDD = peakB - rB;
  if (curDD > ddB) ddB = curDD;
  const m = t.timeStr.substring(0, 7);
  if (m === '2026-09') sepRB += rOutcome;
  if (m === '2026-10') octRB += rOutcome;
  const mfeR = (t.mfe / t.slDist).toFixed(2);
  console.log(`Trade #${t.id}: ${t.timeStr.substring(0, 16)} | ${t.dir === 1 ? 'BUY ' : 'SELL'} | Entry:${t.entry.toFixed(2)} SL:${t.sl.toFixed(2)} TP:${t.tp.toFixed(2)} | TP:${t.tpPips}p | Res:${t.result === 1 ? 'WIN (+3.5R)' : t.result === -1 ? 'LOSS (-1R)' : 'EXP'} | MFE:${mfeR}R | TotalR:${rB.toFixed(1)}`);
});
console.log(`Summary B: Sep:+${sepRB.toFixed(1)}R | Oct:+${octRB.toFixed(1)}R | Total:+${rB.toFixed(1)}R | MaxDD:-${ddB.toFixed(1)}R`);
