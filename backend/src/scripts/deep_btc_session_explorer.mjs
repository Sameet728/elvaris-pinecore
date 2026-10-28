import fs from 'fs';

const candles15M = JSON.parse(fs.readFileSync('data/btcusdt_15m_tv.json', 'utf8'));
const candles1H = JSON.parse(fs.readFileSync('data/btcusdt_1h_tv.json', 'utf8'));

function prepare(candles) {
  const n = candles.length;
  const closes = new Float64Array(n);
  const opens = new Float64Array(n);
  const highs = new Float64Array(n);
  const lows = new Float64Array(n);
  const times = new Float64Array(n);
  const hours = new Int32Array(n);
  const months = [];

  for (let i = 0; i < n; i++) {
    const c = candles[i];
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

  return {
    n, closes, opens, highs, lows, times, hours, months,
    ema50: computeEMA(closes, 50),
    ema100: computeEMA(closes, 100),
    ema200: computeEMA(closes, 200),
    rsi14: computeRSI(closes, 14),
    computeBB
  };
}

function runFastSim(d, signals, sl, tp, rr) {
  const { n, opens, highs, lows, months } = d;
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

const d15 = prepare(candles15M);
const d1H = prepare(candles1H);

console.log('--- Fine-Tuning 15M BTC Strategy Around London/NY Engine ---');
const fine15 = [];

const sessionWindows = [
  { name: '7_20', start: 7, end: 20 },
  { name: '8_20', start: 8, end: 20 },
  { name: '8_19', start: 8, end: 19 },
  { name: '7_19', start: 7, end: 19 },
  { name: '6_21', start: 6, end: 21 },
  { name: '8_22', start: 8, end: 22 }
];

for (const sess of sessionWindows) {
  for (const bLen of [26, 28, 30, 32, 34]) {
    for (const bMult of [2.2, 2.25, 2.3, 2.35, 2.4, 2.45, 2.5]) {
      const bb = d15.computeBB(d15.closes, bLen, bMult);
      for (const rsiFilter of [50, 52, 54, 55, 56]) {
        for (const wickRatio of [0.0, 0.05, 0.10]) {
          const signals = new Int8Array(d15.n);
          for (let i = 200; i < d15.n; i++) {
            const h = d15.hours[i];
            const inSess = (h >= sess.start && h <= sess.end);
            if (!inSess) continue;

            const body = Math.abs(d15.closes[i] - d15.opens[i]);
            const lowerWick = Math.min(d15.opens[i], d15.closes[i]) - d15.lows[i];
            const upperWick = d15.highs[i] - Math.max(d15.opens[i], d15.closes[i]);

            const wickLongOk = wickRatio === 0 || lowerWick >= (body * wickRatio);
            const wickShortOk = wickRatio === 0 || upperWick >= (body * wickRatio);

            const longSig = d15.closes[i] > d15.ema200[i] && d15.lows[i] <= bb.lower[i] &&
                            d15.closes[i] > d15.opens[i] && d15.rsi14[i] < rsiFilter && wickLongOk;

            const shortSig = d15.closes[i] < d15.ema200[i] && d15.ema50[i] < d15.ema200[i] &&
                             d15.highs[i] >= bb.upper[i] && d15.closes[i] < d15.opens[i] &&
                             d15.rsi14[i] > (100 - rsiFilter) && wickShortOk;

            if (longSig) signals[i] = 1;
            else if (shortSig) signals[i] = -1;
          }

          for (const sl of [300, 350, 400, 450, 500]) {
            for (const rr of [1.0, 1.25, 1.5, 2.0]) {
              const tp = Math.round(sl * rr);
              const res = runFastSim(d15, signals, sl, tp, rr);
              if (!res) continue;

              if (res.trades >= 15 && res.wr >= 65.0 && res.calmar >= 4.0 && res.cumR >= 8.0) {
                fine15.push({
                  session: sess.name, bLen, bMult, rsiFilter, wickRatio, sl, tp, rr, ...res
                });
              }
            }
          }
        }
      }
    }
  }
}

fine15.sort((a, b) => b.calmar - a.calmar || b.wr - a.wr);
console.log(`Found ${fine15.length} high-performing 15M candidates (Calmar >= 4.0, WR >= 65%)!`);

console.log('\n--- TOP 10 15M BTC STRATEGIES ---');
fine15.slice(0, 10).forEach((c, idx) => {
  console.log(`#${idx+1}: Session=${c.session} BB(${c.bLen}, ${c.bMult}) RSI<${c.rsiFilter} Wick=${c.wickRatio} | SL=$${c.sl} TP=$${c.tp} (1:${c.rr})`);
  console.log(`    Trades: ${c.trades} (${c.wins}W / ${c.losses}L) | WR: ${c.wr}% | Net: +${c.cumR}R | MaxDD: ${c.maxDD}R | Calmar: ${c.calmar}`);
  console.log(`    Monthly: ${JSON.stringify(c.monthlyR)}`);
});

// Now let's explore 1H with session windows!
console.log('\n--- Exploring 1H BTC Strategy Across Sessions (10-Month Dataset) ---');
const fine1H = [];

for (const sess of sessionWindows) {
  for (const bLen of [20, 24, 26, 30]) {
    for (const bMult of [2.0, 2.2, 2.35, 2.5]) {
      const bb = d1H.computeBB(d1H.closes, bLen, bMult);
      for (const rsiFilter of [50, 52, 55]) {
        for (const wickRatio of [0.0, 0.10]) {
          const signals = new Int8Array(d1H.n);
          for (let i = 200; i < d1H.n; i++) {
            const h = d1H.hours[i];
            const inSess = (h >= sess.start && h <= sess.end);
            if (!inSess) continue;

            const body = Math.abs(d1H.closes[i] - d1H.opens[i]);
            const lowerWick = Math.min(d1H.opens[i], d1H.closes[i]) - d1H.lows[i];
            const upperWick = d1H.highs[i] - Math.max(d1H.opens[i], d1H.closes[i]);

            const wickLongOk = wickRatio === 0 || lowerWick >= (body * wickRatio);
            const wickShortOk = wickRatio === 0 || upperWick >= (body * wickRatio);

            const longSig = d1H.closes[i] > d1H.ema200[i] && d1H.lows[i] <= bb.lower[i] &&
                            d1H.closes[i] > d1H.opens[i] && d1H.rsi14[i] < rsiFilter && wickLongOk;

            const shortSig = d1H.closes[i] < d1H.ema200[i] && d1H.ema50[i] < d1H.ema200[i] &&
                             d1H.highs[i] >= bb.upper[i] && d1H.closes[i] < d1H.opens[i] &&
                             d1H.rsi14[i] > (100 - rsiFilter) && wickShortOk;

            if (longSig) signals[i] = 1;
            else if (shortSig) signals[i] = -1;
          }

          for (const sl of [600, 800, 1000, 1200, 1500]) {
            for (const rr of [1.0, 1.25, 1.5, 2.0]) {
              const tp = Math.round(sl * rr);
              const res = runFastSim(d1H, signals, sl, tp, rr);
              if (!res) continue;

              if (res.trades >= 20 && res.wr >= 60.0 && res.calmar >= 3.0 && res.cumR >= 10.0) {
                fine1H.push({
                  session: sess.name, bLen, bMult, rsiFilter, wickRatio, sl, tp, rr, ...res
                });
              }
            }
          }
        }
      }
    }
  }
}

fine1H.sort((a, b) => b.calmar - a.calmar || b.wr - a.wr);
console.log(`Found ${fine1H.length} high-performing 1H candidates (Calmar >= 3.0, WR >= 60%)!`);

console.log('\n--- TOP 10 1H BTC STRATEGIES ---');
fine1H.slice(0, 10).forEach((c, idx) => {
  console.log(`#${idx+1}: Session=${c.session} BB(${c.bLen}, ${c.bMult}) RSI<${c.rsiFilter} Wick=${c.wickRatio} | SL=$${c.sl} TP=$${c.tp} (1:${c.rr})`);
  console.log(`    Trades: ${c.trades} (${c.wins}W / ${c.losses}L) | WR: ${c.wr}% | Net: +${c.cumR}R | MaxDD: ${c.maxDD}R | Calmar: ${c.calmar}`);
  console.log(`    Monthly: ${JSON.stringify(c.monthlyR)}`);
});

fs.writeFileSync('data/btc_session_explorer_results.json', JSON.stringify({
  fine15: fine15.slice(0, 20),
  fine1H: fine1H.slice(0, 20)
}, null, 2));
