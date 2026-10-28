import fs from 'fs';

const candles15M = JSON.parse(fs.readFileSync('data/btcusdt_15m_tv.json', 'utf8'));
const n = candles15M.length;

const closes = new Float64Array(n);
const opens = new Float64Array(n);
const highs = new Float64Array(n);
const lows = new Float64Array(n);
const volumes = new Float64Array(n);
const times = new Float64Array(n);
const hours = new Int32Array(n);
const months = [];

for (let i = 0; i < n; i++) {
  const c = candles15M[i];
  closes[i] = c.close; opens[i] = c.open; highs[i] = c.high; lows[i] = c.low;
  volumes[i] = c.volume || 0;
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

function computeATR(period = 14) {
  const tr = new Float64Array(n);
  tr[0] = highs[0] - lows[0];
  for (let i = 1; i < n; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
  }
  const atr = new Float64Array(n);
  let s = 0;
  for (let i = 0; i < period; i++) s += tr[i];
  atr[period - 1] = s / period;
  for (let i = period; i < n; i++) atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  return atr;
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
const ema200 = computeEMA(closes, 200);
const atr14 = computeATR(14);
const rsi14 = computeRSI(closes, 14);

function runFastSim(signals, getSLTP) {
  let inTrade = false;
  let dir = 0;
  let currSL = 0, currTP = 0;
  let entryMonth = '';
  let pendingSignal = 0;
  let currentRR = 1.0;

  const trades = [];
  let cumR = 0, peakR = 0, maxDD = 0;
  const monthlyR = {};

  for (let i = 200; i < n; i++) {
    if (pendingSignal !== 0 && !inTrade) {
      inTrade = true;
      dir = pendingSignal;
      const ep = opens[i];
      const res = getSLTP(i - 1, ep, dir);
      currSL = res.sl;
      currTP = res.tp;
      currentRR = res.rr;
      entryMonth = months[i];
      pendingSignal = 0;
    }

    if (inTrade) {
      let exited = false;
      let pnlR = 0;

      if (dir === 1) {
        if (highs[i] >= currTP && lows[i] <= currSL) {
          pnlR = opens[i] >= currTP ? currentRR : -1.0;
          exited = true;
        } else if (highs[i] >= currTP) {
          pnlR = currentRR;
          exited = true;
        } else if (lows[i] <= currSL) {
          pnlR = -1.0;
          exited = true;
        }
      } else {
        if (lows[i] <= currTP && highs[i] >= currSL) {
          pnlR = opens[i] <= currTP ? currentRR : -1.0;
          exited = true;
        } else if (lows[i] <= currTP) {
          pnlR = currentRR;
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

console.log('--- Testing Dual-Engine Architecture on BTC 15M ---');
const results = [];

// Loop over parameters
for (const bMult of [2.2, 2.3, 2.4, 2.5]) {
  const bb = computeBB(closes, 30, bMult);
  for (const rsiMax of [50, 52, 55]) {
    for (const wickRatio of [0.0, 0.10, 0.20]) {
      for (const pullEMA of ['ema21', 'ema50', 'none']) {
        const signals = new Int8Array(n);
        const pEMA = pullEMA === 'ema21' ? ema21 : ema50;

        for (let i = 200; i < n; i++) {
          const h = hours[i];
          if (h < 7 || h > 22) continue; // Active crypto hours

          const body = Math.abs(closes[i] - opens[i]);
          const lowerWick = Math.min(opens[i], closes[i]) - lows[i];
          const upperWick = highs[i] - Math.max(opens[i], closes[i]);
          const wickLongOk = wickRatio === 0 || lowerWick >= (body * wickRatio);
          const wickShortOk = wickRatio === 0 || upperWick >= (body * wickRatio);

          // Setup A: Volatility Band Reversal
          const bandLong = closes[i] > ema200[i] && lows[i] <= bb.lower[i] && closes[i] > opens[i] && rsi14[i] < rsiMax && wickLongOk;
          const bandShort = closes[i] < ema200[i] && ema50[i] < ema200[i] && highs[i] >= bb.upper[i] && closes[i] < opens[i] && rsi14[i] > (100 - rsiMax) && wickShortOk;

          // Setup B: Trend Pullback Continuation (if enabled)
          let pullLong = false, pullShort = false;
          if (pullEMA !== 'none') {
            pullLong = closes[i] > ema200[i] && ema50[i] > ema200[i] && lows[i] <= pEMA[i] && closes[i] > pEMA[i] && closes[i] > opens[i] && lowerWick >= (body * 0.20) && rsi14[i] <= 52;
            pullShort = closes[i] < ema200[i] && ema50[i] < ema200[i] && highs[i] >= pEMA[i] && closes[i] < pEMA[i] && closes[i] < opens[i] && upperWick >= (body * 0.20) && rsi14[i] >= 48;
          }

          if (bandLong || pullLong) signals[i] = 1;
          else if (bandShort || pullShort) signals[i] = -1;
        }

        for (const sl of [300, 350, 400, 450, 500]) {
          for (const rr of [1.0, 1.2, 1.25, 1.5]) {
            const tp = Math.round(sl * rr);
            const res = runFastSim(signals, (barIdx, ep, dir) => ({
              sl: dir === 1 ? ep - sl : ep + sl,
              tp: dir === 1 ? ep + tp : ep - tp,
              rr
            }));

            if (!res) continue;
            const sepR = res.monthlyR['2026-09'] || 0;
            const octR = res.monthlyR['2026-10'] || 0;

            if (sepR >= 8.0 && octR >= 7.0 && res.wr >= 70.0 && res.calmar >= 4.0) {
              results.push({
                bMult, rsiMax, wickRatio, pullEMA, sl, tp, rr, sepR, octR, ...res
              });
            }
          }
        }
      }
    }
  }
}

results.sort((a, b) => (b.sepR + b.octR) - (a.sepR + a.octR) || b.calmar - a.calmar);

console.log(`Found ${results.length} dual-engine setups meeting institutional criteria!`);
results.slice(0, 15).forEach((c, idx) => {
  console.log(`#${idx+1}: BB_Mult=${c.bMult} Pull=${c.pullEMA} RSI<${c.rsiMax} Wick=${c.wickRatio} | SL=$${c.sl} TP=$${c.tp} (1:${c.rr}) | Sep: +${c.sepR}R | Oct: +${c.octR}R | Total: +${c.cumR}R | WR: ${c.wr}% | MaxDD: ${c.maxDD}R | Calmar: ${c.calmar}`);
});

fs.writeFileSync('data/dual_engine_btc_results.json', JSON.stringify(results.slice(0, 20), null, 2));
