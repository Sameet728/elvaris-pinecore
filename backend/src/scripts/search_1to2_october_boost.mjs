import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));
const n = candles.length;

const closes = new Float64Array(n);
const opens = new Float64Array(n);
const highs = new Float64Array(n);
const lows = new Float64Array(n);
const times = new Float64Array(n);
const hours = new Int32Array(n);
const months = [];
const bodies = new Float64Array(n);
const lowerWicks = new Float64Array(n);
const upperWicks = new Float64Array(n);

for (let i = 0; i < n; i++) {
  const c = candles[i];
  closes[i] = c.close;
  opens[i] = c.open;
  highs[i] = c.high;
  lows[i] = c.low;
  const t = c.openTime || c.time;
  times[i] = t;
  const d = new Date(t);
  hours[i] = d.getUTCHours();
  months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  bodies[i] = Math.abs(c.close - c.open);
  lowerWicks[i] = Math.min(c.open, c.close) - c.low;
  upperWicks[i] = c.high - Math.max(c.open, c.close);
}

function computeEMA(arr, period) {
  const ema = new Float64Array(n);
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += arr[i];
  ema[period - 1] = sum / period;
  for (let i = period; i < n; i++) {
    ema[i] = arr[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

function computeSMA(arr, period) {
  const sma = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += arr[i];
  sma[period - 1] = sum / period;
  for (let i = period; i < n; i++) {
    sum += arr[i] - arr[i - period];
    sma[i] = sum / period;
  }
  return sma;
}

function computeRSI(arr, period = 14) {
  const rsi = new Float64Array(n);
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = arr[i] - arr[i - 1];
    if (diff > 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < n; i++) {
    const diff = arr[i] - arr[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }
  return rsi;
}

function computeBB(arr, period, mult) {
  const basis = computeSMA(arr, period);
  const upper = new Float64Array(n);
  const lower = new Float64Array(n);
  for (let i = period - 1; i < n; i++) {
    let sumSq = 0;
    for (let j = 0; j < period; j++) {
      const d = arr[i - j] - basis[i];
      sumSq += d * d;
    }
    const dev = mult * Math.sqrt(sumSq / period);
    upper[i] = basis[i] + dev;
    lower[i] = basis[i] - dev;
  }
  return { upper, lower, basis };
}

const ema50 = computeEMA(closes, 50);
const ema200 = computeEMA(closes, 200);
const rsi14 = computeRSI(closes, 14);

const bbMap = new Map();
const periods = [20, 22, 25, 28, 30, 35];
const mults = [1.8, 2.0, 2.1, 2.2, 2.3, 2.4, 2.5];
for (const p of periods) {
  for (const m of mults) {
    bbMap.set(`${p}_${m}`, computeBB(closes, p, m));
  }
}

function simExact(bbKey, slDist, tpDist, rsiMax, sStart, sEnd, exclH12, wickMin, emaOffset) {
  const bb = bbMap.get(bbKey);
  const bbLower = bb.lower;
  const bbUpper = bb.upper;
  const rsiShortMin = 100 - rsiMax;

  let inTrade = false;
  let dir = 0;
  let ep = 0;
  let currSL = 0;
  let tpP = 0;
  let entryMonth = '';

  const trades = [];
  let cumR = 0, peakR = 0, maxDD = 0;
  let rAug = 0, rSep = 0, rOct = 0;
  let wAug = 0, wSep = 0, wOct = 0;
  let lAug = 0, lSep = 0, lOct = 0;

  for (let i = 200; i < n - 1; i++) {
    if (inTrade) {
      const bHigh = highs[i];
      const bLow = lows[i];
      let exited = false;
      let pnlR = 0;

      if (dir === 1) {
        if (bHigh >= tpP) {
          pnlR = tpDist / slDist; // Dynamic or exact R:R
          exited = true;
        } else if (bLow <= currSL) {
          pnlR = -1.0;
          exited = true;
        }
      } else {
        if (bLow <= tpP) {
          pnlR = tpDist / slDist;
          exited = true;
        } else if (bHigh >= currSL) {
          pnlR = -1.0;
          exited = true;
        }
      }

      if (exited) {
        trades.push(pnlR);
        cumR += pnlR;
        if (cumR > peakR) peakR = cumR;
        if (peakR - cumR > maxDD) maxDD = peakR - cumR;

        if (entryMonth === '2026-08') {
          rAug += pnlR;
          if (pnlR > 0) wAug++; else lAug++;
        } else if (entryMonth === '2026-09') {
          rSep += pnlR;
          if (pnlR > 0) wSep++; else lSep++;
        } else if (entryMonth === '2026-10') {
          rOct += pnlR;
          if (pnlR > 0) wOct++; else lOct++;
        }

        inTrade = false;
      }
    }

    if (!inTrade) {
      const h = hours[i];
      if (h < sStart || h > sEnd) continue;
      if (exclH12 && h === 12) continue;

      const c = closes[i];
      const o = opens[i];
      const l = lows[i];
      const hBar = highs[i];
      const r = rsi14[i];
      const b = bodies[i];

      const wickLongOk = wickMin === 0 || lowerWicks[i] >= (b * wickMin);
      const wickShortOk = wickMin === 0 || upperWicks[i] >= (b * wickMin);

      const longCond = c > (ema200[i] + emaOffset) && l <= bbLower[i] && c > o && r < rsiMax && wickLongOk;
      const shortCond = c < ema200[i] && ema50[i] < ema200[i] && hBar >= bbUpper[i] && c < o && r > rsiShortMin && wickShortOk;

      if (longCond) {
        inTrade = true;
        dir = 1;
        ep = closes[i];
        currSL = ep - slDist;
        tpP = ep + tpDist;
        entryMonth = months[i];
      } else if (shortCond) {
        inTrade = true;
        dir = -1;
        ep = closes[i];
        currSL = ep + slDist;
        tpP = ep - tpDist;
        entryMonth = months[i];
      }
    }
  }

  if (trades.length < 20) return null;

  const wins = trades.filter(r => r > 0).length;
  const losses = trades.filter(r => r < 0).length;
  const wr = (wins / trades.length) * 100;
  const calmar = maxDD > 0 ? (cumR / maxDD) : 99;

  return {
    bbKey, slDist, tpDist, rrRatio: (tpDist / slDist).toFixed(2), rsiMax, sStart, sEnd, exclH12, wickMin, emaOffset,
    trades: trades.length,
    wins,
    losses,
    winRate: wr,
    netR: cumR,
    maxDD,
    calmar,
    rAug, rSep, rOct,
    wAug, lAug, wSep, lSep, wOct, lOct
  };
}

console.log('Exploring combinations for maximum October return...');

// Test 1:2 R:R as well as 1:1.8 and 1:1.6
const targets = [
  { sl: 10.0, tp: 20.0 }, // 1:2.0
  { sl: 9.0, tp: 18.0 },  // 1:2.0
  { sl: 8.0, tp: 16.0 },  // 1:2.0
  { sl: 11.0, tp: 22.0 }, // 1:2.0
  { sl: 10.0, tp: 18.0 }, // 1:1.8
  { sl: 11.0, tp: 20.0 }, // 1:1.82
  { sl: 12.0, tp: 20.0 }, // 1:1.67
  { sl: 12.0, tp: 22.0 }  // 1:1.83
];

const rsiMaxs = [48, 50, 52, 54];
const sessionStarts = [0, 1, 2];
const sessionEnds = [19, 20];
const wickMins = [0.0, 0.05, 0.10, 0.15];
const emaOffsets = [0.0, 2.0, 4.0];

const allResults = [];

for (const [bbKey] of bbMap.entries()) {
  for (const tgt of targets) {
    for (const rsiMax of rsiMaxs) {
      for (const sStart of sessionStarts) {
        for (const sEnd of sessionEnds) {
          for (const wickMin of wickMins) {
            for (const emaOffset of emaOffsets) {
              const res = simExact(bbKey, tgt.sl, tgt.tp, rsiMax, sStart, sEnd, true, wickMin, emaOffset);
              if (!res) continue;

              if (res.winRate >= 70.0 && res.calmar >= 4.0) {
                allResults.push(res);
              }
            }
          }
        }
      }
    }
  }
}

console.log(`Found ${allResults.length} configurations with WR >= 70% and Calmar >= 4!`);

// Sort by October return descending!
allResults.sort((a, b) => b.rOct - a.rOct);

console.log('\nTop 15 Configurations with HIGHEST OCTOBER RETURN:');
for (let i = 0; i < Math.min(15, allResults.length); i++) {
  const w = allResults[i];
  console.log(`Rank #${i + 1}: R:R 1:${w.rrRatio} (SL:$${w.slDist} / TP:$${w.tpDist}) | BB(${w.bbKey}) | RSI<${w.rsiMax} | Wick:${w.wickMin} | Offset:$${w.emaOffset} | Hours ${w.sStart}-${w.sEnd}`);
  console.log(`   Trades: ${w.trades} | WR: ${w.winRate.toFixed(1)}% (${w.wins}W/${w.losses}L) | Net: +${w.netR.toFixed(1)}R | MaxDD: ${w.maxDD.toFixed(1)}R | Calmar: ${w.calmar.toFixed(1)}`);
  console.log(`   Monthly R: Aug=+${w.rAug.toFixed(1)}R (${w.wAug}W/${w.lAug}L) | Sep=+${w.rSep.toFixed(1)}R (${w.wSep}W/${w.lSep}L) | Oct=+${w.rOct.toFixed(1)}R (${w.wOct}W/${w.lOct}L)\n`);
}
