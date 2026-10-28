import fs from 'fs';

const candles1H = JSON.parse(fs.readFileSync('data/btcusdt_1h_tv.json', 'utf8'));
const n = candles1H.length;
const closes = new Float64Array(n);
const opens = new Float64Array(n);
const highs = new Float64Array(n);
const lows = new Float64Array(n);
const times = new Float64Array(n);
const hours = new Int32Array(n);
const months = [];

for (let i = 0; i < n; i++) {
  const c = candles1H[i];
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

const ema21 = computeEMA(closes, 21);
const ema50 = computeEMA(closes, 50);
const ema100 = computeEMA(closes, 100);
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

console.log('--- Searching Macro Champions on BTC 1H (7,098 Bars / 10 Months) ---');
const candidates1H = [];

// Test Session Filters: 24/7 vs London/NY
const sessions1H = [
  { name: '24/7', start: 0, end: 23 },
  { name: 'London_NY', start: 8, end: 20 },
  { name: 'Extended_Day', start: 6, end: 22 }
];

for (const sess of sessions1H) {
  for (const bLen of [20, 24, 28, 30, 36]) {
    for (const bMult of [2.0, 2.2, 2.4, 2.6, 2.8]) {
      const bb = computeBB(closes, bLen, bMult);
      for (const rsiFilter of [45, 50, 52, 55]) {
        for (const wickRatio of [0.0, 0.15, 0.25]) {
          const signals = new Int8Array(n);
          for (let i = 200; i < n; i++) {
            const h = hours[i];
            if (h < sess.start || h > sess.end) continue;

            const body = Math.abs(closes[i] - opens[i]);
            const lowerWick = Math.min(opens[i], closes[i]) - lows[i];
            const upperWick = highs[i] - Math.max(opens[i], closes[i]);

            const wickLongOk = wickRatio === 0 || lowerWick >= (body * wickRatio);
            const wickShortOk = wickRatio === 0 || upperWick >= (body * wickRatio);

            const longSig = closes[i] > ema200[i] && lows[i] <= bb.lower[i] && closes[i] > opens[i] &&
                            rsi14[i] < rsiFilter && wickLongOk;

            const shortSig = closes[i] < ema200[i] && ema50[i] < ema200[i] &&
                             highs[i] >= bb.upper[i] && closes[i] < opens[i] &&
                             rsi14[i] > (100 - rsiFilter) && wickShortOk;

            if (longSig) signals[i] = 1;
            else if (shortSig) signals[i] = -1;
          }

          for (const sl of [600, 800, 1000, 1200, 1500, 1800, 2000]) {
            for (const rr of [1.0, 1.25, 1.5, 2.0]) {
              const tp = Math.round(sl * rr);
              const res = runFastSim(signals, sl, tp, rr);
              if (!res) continue;

              // 10-month evaluation: require positive net profit, at least 15 trades, WR >= 55%, Calmar >= 2.0
              if (res.trades >= 15 && res.wr >= 55.0 && res.cumR >= 8.0 && res.calmar >= 2.0) {
                candidates1H.push({
                  sess: sess.name, bLen, bMult, rsiFilter, wickRatio, sl, tp, rr, ...res
                });
              }
            }
          }
        }
      }
    }
  }
}

candidates1H.sort((a, b) => b.calmar - a.calmar || b.wr - a.wr);
console.log(`Found ${candidates1H.length} 1H macro candidates!`);

console.log('\n--- TOP 10 1H BTC STRATEGIES ---');
candidates1H.slice(0, 10).forEach((c, idx) => {
  console.log(`#${idx+1}: Session=${c.sess} BB(${c.bLen}, ${c.bMult}) RSI<${c.rsiFilter} Wick=${c.wickRatio} | SL=$${c.sl} TP=$${c.tp} (1:${c.rr})`);
  console.log(`    Trades: ${c.trades} (${c.wins}W / ${c.losses}L) | WR: ${c.wr}% | Net: +${c.cumR}R | MaxDD: ${c.maxDD}R | Calmar: ${c.calmar}`);
  console.log(`    Monthly: ${JSON.stringify(c.monthlyR)}`);
});

fs.writeFileSync('data/btc_1h_top_candidates.json', JSON.stringify(candidates1H.slice(0, 20), null, 2));
