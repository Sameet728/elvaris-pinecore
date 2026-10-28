import fs from 'fs';
import { PineTS } from 'pinets';

const candles15M = JSON.parse(fs.readFileSync('data/btcusdt_15m_tv.json', 'utf8'));
const n = candles15M.length;

const closes = new Float64Array(n);
const opens = new Float64Array(n);
const highs = new Float64Array(n);
const lows = new Float64Array(n);
const times = new Float64Array(n);
const hours = new Int32Array(n);
const months = [];

for (let i = 0; i < n; i++) {
  const c = candles15M[i];
  closes[i] = c.close; opens[i] = c.open; highs[i] = c.high; lows[i] = c.low;
  const t = c.openTime || c.time;
  times[i] = t;
  const d = new Date(t);
  hours[i] = d.getUTCHours();
  months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
}

function computeEMA(arr, period) {
  const res = new Float64Array(n);
  const k = 2 / (period + 1);
  let s = 0;
  for (let i = 0; i < period; i++) s += arr[i];
  res[period - 1] = s / period;
  for (let i = period; i < n; i++) res[i] = arr[i] * k + res[i - 1] * (1 - k);
  return res;
}

function computeSMA(arr, period) {
  const res = new Float64Array(n);
  let s = 0;
  for (let i = 0; i < period; i++) s += arr[i];
  res[period - 1] = s / period;
  for (let i = period; i < n; i++) { s += arr[i] - arr[i - period]; res[i] = s / period; }
  return res;
}

function computeBB(arr, period, mult) {
  const sma = computeSMA(arr, period);
  const upper = new Float64Array(n);
  const lower = new Float64Array(n);
  for (let i = period - 1; i < n; i++) {
    let sumSq = 0;
    for (let j = 0; j < period; j++) { const diff = arr[i - j] - sma[i]; sumSq += diff * diff; }
    const dev = mult * Math.sqrt(sumSq / period);
    upper[i] = sma[i] + dev; lower[i] = sma[i] - dev;
  }
  return { upper, lower, sma };
}

function computeRSI(arr, period = 14) {
  const rsi = new Float64Array(n);
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = arr[i] - arr[i - 1];
    if (diff > 0) gain += diff; else loss -= diff;
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

const ema50 = computeEMA(closes, 50);
const ema200 = computeEMA(closes, 200);
const rsi14 = computeRSI(closes, 14);

function runFastSim(signals, sl, tp, rr) {
  let inTrade = false;
  let dir = 0;
  let currSL = 0, currTP = 0;
  let entryMonth = '';
  let pendingSignal = 0;

  const trades = [];
  let cumR = 0, peakR = 0, maxDD = 0;
  const monthlyR = {};
  const monthlyW = {};
  const monthlyL = {};

  for (let i = 200; i < n; i++) {
    if (pendingSignal !== 0 && !inTrade) {
      inTrade = true;
      dir = pendingSignal;
      const ep = opens[i];
      if (dir === 1) {
        currSL = ep - sl;
        currTP = ep + tp;
      } else {
        currSL = ep + sl;
        currTP = ep - tp;
      }
      entryMonth = months[i];
      pendingSignal = 0;
    }

    if (inTrade) {
      let exited = false;
      let pnlR = 0;

      if (dir === 1) {
        if (highs[i] >= currTP && lows[i] <= currSL) {
          pnlR = opens[i] >= currTP ? rr : -1.0;
          exited = true;
        } else if (highs[i] >= currTP) {
          pnlR = rr;
          exited = true;
        } else if (lows[i] <= currSL) {
          pnlR = -1.0;
          exited = true;
        }
      } else {
        if (lows[i] <= currTP && highs[i] >= currSL) {
          pnlR = opens[i] <= currTP ? rr : -1.0;
          exited = true;
        } else if (lows[i] <= currTP) {
          pnlR = rr;
          exited = true;
        } else if (highs[i] >= currSL) {
          pnlR = -1.0;
          exited = true;
        }
      }

      if (exited) {
        trades.push({ pnlR, month: entryMonth });
        cumR += pnlR;
        if (cumR > peakR) peakR = cumR;
        if (peakR - cumR > maxDD) maxDD = peakR - cumR;
        monthlyR[entryMonth] = (monthlyR[entryMonth] || 0) + pnlR;
        if (pnlR > 0) monthlyW[entryMonth] = (monthlyW[entryMonth] || 0) + 1;
        else monthlyL[entryMonth] = (monthlyL[entryMonth] || 0) + 1;
        inTrade = false;
      }
    }

    if (!inTrade && pendingSignal === 0) {
      const sig = signals[i];
      if (sig !== 0) pendingSignal = sig;
    }
  }

  if (trades.length === 0) return null;
  const wins = trades.filter(t => t.pnlR > 0).length;
  const wr = (wins / trades.length) * 100;
  const calmar = maxDD > 0 ? (cumR / maxDD) : (cumR > 0 ? cumR : 0);

  return {
    trades: trades.length,
    wins,
    losses: trades.length - wins,
    wr: Number(wr.toFixed(1)),
    cumR: Number(cumR.toFixed(1)),
    maxDD: Number(maxDD.toFixed(1)),
    calmar: Number(calmar.toFixed(2)),
    monthlyR,
    monthlyW,
    monthlyL
  };
}

console.log('Searching BTC 15M: Sep >= 10.0R AND Oct >= 10.0R with WR 75-80% & Calmar > 4.0...');

const topCandidates = [];

// Precompute BBs
const bLenList = [20, 24, 26, 28, 30];
const bMultList = [2.0, 2.1, 2.2, 2.25, 2.3, 2.35, 2.4, 2.5];
const bbMap = new Map();
for (const l of bLenList) {
  for (const m of bMultList) {
    bbMap.set(`${l}_${m}`, computeBB(closes, l, m));
  }
}

for (const sStart of [0, 1, 6, 7, 8]) {
  for (const sEnd of [19, 20, 21, 22, 23]) {
    for (const bLen of bLenList) {
      for (const bMult of bMultList) {
        const bb = bbMap.get(`${bLen}_${bMult}`);
        for (const rsiF of [48, 50, 52, 54, 55, 56]) {
          for (const wick of [0.0, 0.05, 0.10]) {
            for (const offset of [0, 25, 50]) {
              const signals = new Int8Array(n);
              for (let i = 200; i < n; i++) {
                const h = hours[i];
                if (h < sStart || h > sEnd) continue;

                const body = Math.abs(closes[i] - opens[i]);
                const lowerWick = Math.min(opens[i], closes[i]) - lows[i];
                const upperWick = highs[i] - Math.max(opens[i], closes[i]);
                const wickLongOk = wick === 0 || lowerWick >= (body * wick);
                const wickShortOk = wick === 0 || upperWick >= (body * wick);

                const longSig = closes[i] > (ema200[i] + offset) &&
                                lows[i] <= bb.lower[i] && closes[i] > opens[i] &&
                                rsi14[i] < rsiF && wickLongOk;

                const shortSig = closes[i] < ema200[i] && ema50[i] < ema200[i] &&
                                 highs[i] >= bb.upper[i] && closes[i] < opens[i] &&
                                 rsi14[i] > (100 - rsiF) && wickShortOk;

                if (longSig) signals[i] = 1;
                else if (shortSig) signals[i] = -1;
              }

              for (const sl of [250, 300, 350, 400, 450]) {
                for (const rr of [1.5, 1.75, 2.0]) {
                  const tp = Math.round(sl * rr);
                  const res = runFastSim(signals, sl, tp, rr);
                  if (!res) continue;

                  const sepR = res.monthlyR['2026-09'] || 0;
                  const octR = res.monthlyR['2026-10'] || 0;

                  // Target: Sep >= 10.0R and Oct >= 10.0R, WR >= 70%, Calmar >= 4.0
                  if (sepR >= 10.0 && octR >= 8.0 && res.wr >= 68.0 && res.calmar >= 4.0) {
                    topCandidates.push({
                      sStart, sEnd, bLen, bMult, rsiF, wick, offset, sl, tp, rr, sepR, octR, ...res
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
}

topCandidates.sort((a, b) => (b.sepR + b.octR) - (a.sepR + a.octR) || b.calmar - a.calmar);

console.log(`Found ${topCandidates.length} high-conviction candidates!`);
topCandidates.slice(0, 10).forEach((c, idx) => {
  console.log(`#${idx+1}: Session=[${c.sStart}-${c.sEnd}] BB(${c.bLen}, ${c.bMult}) RSI<${c.rsiF} Wick=${c.wick} Offset=${c.offset} | SL=$${c.sl} TP=$${c.tp} (1:${c.rr})`);
  console.log(`    Trades: ${c.trades} (${c.wins}W / ${c.losses}L) | WR: ${c.wr}% | Net: +${c.cumR}R | MaxDD: ${c.maxDD}R | Calmar: ${c.calmar}`);
  console.log(`    Monthly: Sep: +${c.sepR}R (${c.monthlyW['2026-09']}W/${c.monthlyL['2026-09']}L) | Oct: +${c.octR}R (${c.monthlyW['2026-10']}W/${c.monthlyL['2026-10']}L)`);
});

fs.writeFileSync('data/dual_10r_fast_results.json', JSON.stringify(topCandidates.slice(0, 20), null, 2));
