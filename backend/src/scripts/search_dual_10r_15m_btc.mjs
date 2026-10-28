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

console.log('Searching BTC 15M: Sep >= 10.0R AND Oct >= 10.0R, Win Rate 74-82%, Calmar > 4.0...');

const candidates = [];

// Test session windows
const sessionWindows = [
  { name: '0_23', start: 0, end: 23 },      // 24/7 Full crypto liquidity
  { name: '6_23', start: 6, end: 23 },      // European to end of US
  { name: '7_22', start: 7, end: 22 },      // London open to US close
  { name: '8_22', start: 8, end: 22 },      // London core to US evening
  { name: '7_20', start: 7, end: 20 },
  { name: '8_20', start: 8, end: 20 }
];

for (const sess of sessionWindows) {
  for (const bLen of [20, 24, 26, 28, 30, 32]) {
    for (const bMult of [2.0, 2.1, 2.2, 2.25, 2.3, 2.35, 2.4, 2.45]) {
      const bb = computeBB(closes, bLen, bMult);
      for (const rsiFilter of [50, 52, 54, 55, 56, 58, 60]) {
        for (const wickRatio of [0.0, 0.05, 0.10, 0.15]) {
          for (const emaOffset of [0, 25, 50, 75]) {
            const signals = new Int8Array(n);
            for (let i = 200; i < n; i++) {
              const h = hours[i];
              if (h < sess.start || h > sess.end) continue;

              const body = Math.abs(closes[i] - opens[i]);
              const lowerWick = Math.min(opens[i], closes[i]) - lows[i];
              const upperWick = highs[i] - Math.max(opens[i], closes[i]);

              const wickLongOk = wickRatio === 0 || lowerWick >= (body * wickRatio);
              const wickShortOk = wickRatio === 0 || upperWick >= (body * wickRatio);

              const longSig = closes[i] > (ema200[i] + emaOffset) &&
                              lows[i] <= bb.lower[i] && closes[i] > opens[i] &&
                              rsi14[i] < rsiFilter && wickLongOk;

              const shortSig = closes[i] < ema200[i] && ema50[i] < ema200[i] &&
                               highs[i] >= bb.upper[i] && closes[i] < opens[i] &&
                               rsi14[i] > (100 - rsiFilter) && wickShortOk;

              if (longSig) signals[i] = 1;
              else if (shortSig) signals[i] = -1;
            }

            for (const sl of [250, 300, 350, 400, 450, 500]) {
              for (const rr of [1.0, 1.1, 1.2, 1.25, 1.3, 1.5, 1.75, 2.0]) {
                const tp = Math.round(sl * rr);
                const res = runFastSim(signals, sl, tp, rr);
                if (!res) continue;

                const sepR = res.monthlyR['2026-09'] || 0;
                const octR = res.monthlyR['2026-10'] || 0;

                // User criteria: Sep >= 10.0R AND Oct >= 10.0R, WR >= 74%, Calmar > 4.0
                if (sepR >= 10.0 && octR >= 10.0 && res.wr >= 74.0 && res.calmar >= 4.0) {
                  candidates.push({
                    sess: sess.name, bLen, bMult, rsiFilter, wickRatio, emaOffset, sl, tp, rr, sepR, octR, ...res
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

candidates.sort((a, b) => b.calmar - a.calmar || (b.sepR + b.octR) - (a.sepR + a.octR));

console.log(`\nFound ${candidates.length} strategies meeting STRICT Dual-Month 10R+ (Sep>=10R & Oct>=10R) with WR >= 74% and Calmar > 4.0!`);

if (candidates.length > 0) {
  console.log('\n--- TOP 10 DUAL-MONTH 10R+ CHAMPIONS ---');
  candidates.slice(0, 10).forEach((c, idx) => {
    console.log(`#${idx+1}: Session=${c.sess} BB(${c.bLen}, ${c.bMult}) RSI<${c.rsiFilter} Wick=${c.wickRatio} Offset=$${c.emaOffset} | SL=$${c.sl} TP=$${c.tp} (1:${c.rr})`);
    console.log(`    Trades: ${c.trades} (${c.wins}W / ${c.losses}L) | WR: ${c.wr}% | Net: +${c.cumR}R | MaxDD: ${c.maxDD}R | Calmar: ${c.calmar}`);
    console.log(`    Monthly: Sep: +${c.sepR}R | Oct: +${c.octR}R`);
  });
} else {
  console.log('No exact matches with Sep>=10 & Oct>=10 at WR>=74%. Relaxing to check highest October R with WR>=74%...');
}

fs.writeFileSync('data/dual_10r_15m_btc_candidates.json', JSON.stringify(candidates.slice(0, 20), null, 2));
