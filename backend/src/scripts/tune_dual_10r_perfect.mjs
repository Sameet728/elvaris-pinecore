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
const rsi14 = computeRSI(closes, 14);
const volSMA20 = computeSMA(volumes, 20);

function runSim(signals, sl, tp, rr) {
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

console.log('Fine-tuning Trend Pullback for Dual-Month >= 10.0R on BTC 15M...');
const matched = [];

for (const startH of [0, 6, 7, 8]) {
  for (const endH of [20, 21, 22, 23]) {
    for (const rsiMax of [48, 49, 50, 51, 52]) {
      for (const wickRatio of [0.0, 0.05, 0.10, 0.15]) {
        for (const volFilter of [false, true]) {
          const signals = new Int8Array(n);
          for (let i = 200; i < n; i++) {
            const h = hours[i];
            if (h < startH || h > endH) continue;

            const body = Math.abs(closes[i] - opens[i]);
            const lowerWick = Math.min(opens[i], closes[i]) - lows[i];
            const upperWick = highs[i] - Math.max(opens[i], closes[i]);
            const wickLongOk = wickRatio === 0 || lowerWick >= (body * wickRatio);
            const wickShortOk = wickRatio === 0 || upperWick >= (body * wickRatio);
            const volOk = !volFilter || volumes[i] >= volSMA20[i];

            const longSig = closes[i] > ema200[i] && ema50[i] > ema200[i] &&
                            lows[i] <= ema50[i] && closes[i] > ema50[i] &&
                            closes[i] > opens[i] && rsi14[i] <= rsiMax && wickLongOk && volOk;

            const shortSig = closes[i] < ema200[i] && ema50[i] < ema200[i] &&
                             highs[i] >= ema50[i] && closes[i] < ema50[i] &&
                             closes[i] < opens[i] && rsi14[i] >= (100 - rsiMax) && wickShortOk && volOk;

            if (longSig) signals[i] = 1;
            else if (shortSig) signals[i] = -1;
          }

          for (const sl of [350, 380, 400, 420, 450]) {
            for (const rr of [1.25, 1.30, 1.35, 1.40, 1.50]) {
              const tp = Math.round(sl * rr);
              const res = runSim(signals, sl, tp, rr);
              if (!res) continue;

              const sepR = res.monthlyR['2026-09'] || 0;
              const octR = res.monthlyR['2026-10'] || 0;

              // Check if BOTH months hit >= 10.0R!
              if (sepR >= 10.0 && octR >= 10.0 && res.calmar >= 4.0) {
                matched.push({
                  startH, endH, rsiMax, wickRatio, volFilter, sl, tp, rr, sepR, octR, ...res
                });
              }
            }
          }
        }
      }
    }
  }
}

matched.sort((a, b) => b.calmar - a.calmar || b.wr - a.wr);

console.log(`Found ${matched.length} strategies achieving STRICT Dual-Month >= 10.0R (Sep >= 10R AND Oct >= 10R)!`);

if (matched.length > 0) {
  matched.slice(0, 10).forEach((c, idx) => {
    console.log(`\n🏆 #${idx+1}: Session=[${c.startH}-${c.endH} UTC] RSI<${c.rsiMax} Wick=${c.wickRatio} Vol=${c.volFilter} | SL=$${c.sl} TP=$${c.tp} (1:${c.rr})`);
    console.log(`   Trades: ${c.trades} (${c.wins}W / ${c.losses}L) | Win Rate: ${c.wr}% | Net: +${c.cumR}R | MaxDD: ${c.maxDD}R | Calmar: ${c.calmar}`);
    console.log(`   September 2026: +${c.sepR}R (${c.monthlyW['2026-09']}W / ${c.monthlyL['2026-09']}L)`);
    console.log(`   October 2026:   +${c.octR}R (${c.monthlyW['2026-10']}W / ${c.monthlyL['2026-10']}L)`);
  });
} else {
  console.log('Testing nearest combinations to dual 10R...');
}

fs.writeFileSync('data/dual_10r_perfect_matches.json', JSON.stringify(matched.slice(0, 20), null, 2));
