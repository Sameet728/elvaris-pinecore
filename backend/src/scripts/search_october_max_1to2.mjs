import fs from 'fs';

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
const periods = [20, 24, 26, 28, 30, 32];
const mults = [2.0, 2.1, 2.2, 2.25, 2.3, 2.35, 2.4, 2.45, 2.5];
for (const p of periods) {
  for (const m of mults) {
    bbMap.set(`${p}_${m}`, computeBB(closes, p, m));
  }
}

// Simulator with next-bar execution matching PineTS strategy.entry
function simPineTSExact(bbKey, slDist, tpDist, rsiMax, sStart, sEnd, exclH12, wickMin, emaOffset) {
  const bb = bbMap.get(bbKey);
  const bbLower = bb.lower;
  const bbUpper = bb.upper;
  const rsiShortMin = 100 - rsiMax;

  let inTrade = false;
  let dir = 0;
  let currSL = 0;
  let tpP = 0;
  let entryMonth = '';

  const trades = [];
  let cumR = 0, peakR = 0, maxDD = 0;
  let rAug = 0, rSep = 0, rOct = 0;
  let wAug = 0, wSep = 0, wOct = 0;
  let lAug = 0, lSep = 0, lOct = 0;

  let pendingSignal = 0; // 1 for long, -1 for short

  for (let i = 200; i < n; i++) {
    // 1. Process pending entry on bar open/close if PineTS executes on open of next bar
    if (pendingSignal !== 0 && !inTrade) {
      inTrade = true;
      dir = pendingSignal;
      const ep = opens[i]; // standard strategy execution is open of next bar
      if (dir === 1) {
        currSL = ep - slDist;
        tpP = ep + tpDist;
      } else {
        currSL = ep + slDist;
        tpP = ep - tpDist;
      }
      entryMonth = months[i];
      pendingSignal = 0;
    }

    // 2. Check exits if in trade
    if (inTrade) {
      const bHigh = highs[i];
      const bLow = lows[i];
      let exited = false;
      let pnlR = 0;

      if (dir === 1) {
        // Did we hit TP or SL?
        // In PineTS, if high >= tpP and low <= currSL, order of evaluation depends on open -> high/low
        if (bHigh >= tpP && bLow <= currSL) {
          // Both hit: conservative check
          if (opens[i] >= tpP) { pnlR = 2.0; exited = true; }
          else if (opens[i] <= currSL) { pnlR = -1.0; exited = true; }
          else { pnlR = -1.0; exited = true; } // conservative
        } else if (bHigh >= tpP) {
          pnlR = 2.0;
          exited = true;
        } else if (bLow <= currSL) {
          pnlR = -1.0;
          exited = true;
        }
      } else {
        if (bLow <= tpP && bHigh >= currSL) {
          if (opens[i] <= tpP) { pnlR = 2.0; exited = true; }
          else if (opens[i] >= currSL) { pnlR = -1.0; exited = true; }
          else { pnlR = -1.0; exited = true; }
        } else if (bLow <= tpP) {
          pnlR = 2.0;
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

    // 3. Signal evaluation on bar close
    if (!inTrade && pendingSignal === 0) {
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
        pendingSignal = 1;
      } else if (shortCond) {
        pendingSignal = -1;
      }
    }
  }

  const totalTrades = trades.length;
  if (totalTrades < 18) return null;
  const wins = trades.filter(t => t > 0).length;
  const wr = (wins / totalTrades) * 100;
  const calmar = maxDD > 0 ? (cumR / maxDD) : 0;

  return {
    totalTrades, wins, wr, cumR, maxDD, calmar,
    rAug, wAug, lAug,
    rSep, wSep, lSep,
    rOct, wOct, lOct
  };
}

console.log("Starting Grid Search for 1:2.0 RR with Max October Return & High Win Rate...");

const slDistances = [8.0, 9.0, 10.0, 11.0, 12.0];
const rsiFilters = [50, 52, 54, 55];
const emaOffsets = [0, 2.0, 3.0, 4.0, 5.0];
const sessions = [
  { sStart: 1, sEnd: 19, exclH12: true },
  { sStart: 1, sEnd: 19, exclH12: false },
  { sStart: 1, sEnd: 20, exclH12: true },
  { sStart: 2, sEnd: 19, exclH12: true },
  { sStart: 0, sEnd: 20, exclH12: true }
];
const wickFilters = [0, 0.10, 0.15];

const results = [];

for (const p of periods) {
  for (const m of mults) {
    const bbKey = `${p}_${m}`;
    for (const sl of slDistances) {
      const tp = sl * 2.0; // Strict 1:2.0 RR
      for (const rsi of rsiFilters) {
        for (const offset of emaOffsets) {
          for (const sess of sessions) {
            for (const wick of wickFilters) {
              const res = simPineTSExact(bbKey, sl, tp, rsi, sess.sStart, sess.sEnd, sess.exclH12, wick, offset);
              if (!res) continue;

              // Filter criteria:
              // WR >= 70%
              // Calmar >= 5.0
              // Oct return >= 7.0R
              // Aug >= 5.0R and Sep >= 8.0R (consistent across months)
              if (res.wr >= 70.0 && res.calmar >= 5.0 && res.rOct >= 7.0 && res.rAug >= 5.0 && res.rSep >= 8.0) {
                results.push({
                  p, m, sl, tp, rsi, offset, sess, wick,
                  ...res
                });
              }
            }
          }
        }
      }
    }
  }
}

console.log(`Grid search finished. Found ${results.length} candidates meeting all criteria!`);

// Sort by October return descending, then by Win Rate
results.sort((a, b) => b.rOct - a.rOct || b.wr - a.wr || b.calmar - a.calmar);

console.log("\nTop 15 Configurations Ranked by October Return (with WR >= 70% & Consistent Months):");
for (let i = 0; i < Math.min(15, results.length); i++) {
  const r = results[i];
  console.log(`\n#${i + 1}: BB(${r.p}, ${r.m}) | SL: $${r.sl} / TP: $${r.tp} (1:2.0) | RSI: <${r.rsi} | Offset: $${r.offset} | Wick: ${r.wick} | Sess: ${r.sess.sStart}-${r.sess.sEnd} excl12:${r.sess.exclH12}`);
  console.log(`    Trades: ${r.totalTrades} | WR: ${r.wr.toFixed(1)}% | Net: +${r.cumR.toFixed(1)}R | MaxDD: ${r.maxDD.toFixed(1)}R | Calmar: ${r.calmar.toFixed(1)}`);
  console.log(`    Monthly: Aug +${r.rAug.toFixed(1)}R (${r.wAug}W/${r.lAug}L) | Sep +${r.rSep.toFixed(1)}R (${r.wSep}W/${r.lSep}L) | OCT: +${r.rOct.toFixed(1)}R (${r.wOct}W/${r.lOct}L)`);
}
