import fs from 'fs';

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
    monthlyR
  };
}

console.log('Inspecting October Max R on BTC 15M across all setups...');

const list = [];

for (const start of [0, 6, 8]) {
  for (const end of [20, 22, 23]) {
    for (const bLen of [20, 24, 28, 30]) {
      for (const bMult of [2.0, 2.2, 2.3, 2.4]) {
        const bb = computeBB(closes, bLen, bMult);
        for (const rsiFilter of [50, 55, 60]) {
          const signals = new Int8Array(n);
          for (let i = 200; i < n; i++) {
            const h = hours[i];
            if (h < start || h > end) continue;

            const longSig = closes[i] > ema200[i] && lows[i] <= bb.lower[i] && closes[i] > opens[i] && rsi14[i] < rsiFilter;
            const shortSig = closes[i] < ema200[i] && ema50[i] < ema200[i] && highs[i] >= bb.upper[i] && closes[i] < opens[i] && rsi14[i] > (100 - rsiFilter);

            if (longSig) signals[i] = 1;
            else if (shortSig) signals[i] = -1;
          }

          for (const sl of [300, 350, 400, 500]) {
            for (const rr of [1.0, 1.25, 1.5, 2.0]) {
              const tp = Math.round(sl * rr);
              const res = runFastSim(signals, sl, tp, rr);
              if (!res) continue;

              const sepR = res.monthlyR['2026-09'] || 0;
              const octR = res.monthlyR['2026-10'] || 0;

              if (res.wr >= 60.0 && octR > 0) {
                list.push({ start, end, bLen, bMult, rsiFilter, sl, tp, rr, sepR, octR, ...res });
              }
            }
          }
        }
      }
    }
  }
}

list.sort((a, b) => b.octR - a.octR || b.wr - a.wr);

console.log(`Found ${list.length} setups with positive October return.`);
console.log('\nTop 15 Setups Ranked by October R:');
list.slice(0, 15).forEach((c, idx) => {
  console.log(`#${idx+1}: Session=[${c.start}-${c.end}] BB(${c.bLen}, ${c.bMult}) RSI<${c.rsiFilter} | SL=$${c.sl} TP=$${c.tp} (1:${c.rr}) | Sep: +${c.sepR}R | Oct: +${c.octR}R | Total: +${c.cumR}R | WR: ${c.wr}% | MaxDD: ${c.maxDD}R | Calmar: ${c.calmar}`);
});
