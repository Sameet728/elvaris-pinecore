import fs from 'fs';

const candles15M = JSON.parse(fs.readFileSync('data/btcusdt_15m_tv.json', 'utf8'));
const candles1H = JSON.parse(fs.readFileSync('data/btcusdt_1h_tv.json', 'utf8'));

function prepare(candles) {
  const n = candles.length;
  const closes = new Float64Array(n);
  const opens = new Float64Array(n);
  const highs = new Float64Array(n);
  const lows = new Float64Array(n);
  const volumes = new Float64Array(n);
  const times = new Float64Array(n);
  const dates = [];
  const hours = new Int32Array(n);
  const months = [];

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    closes[i] = c.close; opens[i] = c.open; highs[i] = c.high; lows[i] = c.low;
    volumes[i] = c.volume || 0;
    const t = c.openTime || c.time;
    times[i] = t;
    const d = new Date(t);
    dates.push(d);
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

  const volSMA20 = computeSMA(volumes, 20);

  return {
    n, closes, opens, highs, lows, volumes, volSMA20, times, dates, hours, months,
    ema9: computeEMA(closes, 9),
    ema21: computeEMA(closes, 21),
    ema50: computeEMA(closes, 50),
    ema100: computeEMA(closes, 100),
    ema200: computeEMA(closes, 200),
    atr14: computeATR(14),
    rsi14: computeRSI(closes, 14)
  };
}

function runSimulation(d, signals, getStopTarget) {
  const { n, opens, highs, lows, months } = d;
  let inTrade = false;
  let dir = 0;
  let sl = 0, tp = 0;
  let entryMonth = '';
  let pendingSignal = 0;
  let currentTradeRR = 1.0;

  const trades = [];
  let cumR = 0, peakR = 0, maxDD = 0;
  const monthlyR = {};

  for (let i = 50; i < n; i++) {
    // 1. Enter on open
    if (pendingSignal !== 0 && !inTrade) {
      inTrade = true;
      dir = pendingSignal;
      const ep = opens[i];
      const params = getStopTarget(i - 1, ep, dir);
      sl = params.sl;
      tp = params.tp;
      currentTradeRR = params.rr;
      entryMonth = months[i];
      pendingSignal = 0;
    }

    // 2. Intra-bar exit
    if (inTrade) {
      let exited = false;
      let pnlR = 0;

      if (dir === 1) {
        if (highs[i] >= tp && lows[i] <= sl) {
          pnlR = opens[i] >= tp ? currentTradeRR : -1.0;
          exited = true;
        } else if (highs[i] >= tp) {
          pnlR = currentTradeRR;
          exited = true;
        } else if (lows[i] <= sl) {
          pnlR = -1.0;
          exited = true;
        }
      } else {
        if (lows[i] <= tp && highs[i] >= sl) {
          pnlR = opens[i] <= tp ? currentTradeRR : -1.0;
          exited = true;
        } else if (lows[i] <= tp) {
          pnlR = currentTradeRR;
          exited = true;
        } else if (highs[i] >= sl) {
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

    // 3. Signal evaluation
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

// Comprehensive search on 15M and 1H
const d15 = prepare(candles15M);
const d1H = prepare(candles1H);

console.log('--- Deep Search on BTC 15M ---');
const results15 = [];

// Strategy Variations:
// 1. Trend Pullback with Confirmation (EMA21/50 + RSI + Lower Wick Rejection)
for (const pullEMA of ['ema21', 'ema50']) {
  for (const rsiThreshold of [40, 45, 50, 55]) {
    for (const wickRatio of [0.10, 0.20, 0.30]) {
      for (const volFilter of [false, true]) {
        const signals = new Int8Array(d15.n);
        const pEMA = pullEMA === 'ema21' ? d15.ema21 : d15.ema50;

        for (let i = 200; i < d15.n; i++) {
          const body = Math.abs(d15.closes[i] - d15.opens[i]);
          const lowerWick = Math.min(d15.opens[i], d15.closes[i]) - d15.lows[i];
          const upperWick = d15.highs[i] - Math.max(d15.opens[i], d15.closes[i]);
          const volOk = !volFilter || d15.volumes[i] >= d15.volSMA20[i];

          // Long: Uptrend (close > ema200, ema50 > ema200), dipped to/below EMA, rejected, green candle, RSI <= threshold
          const longSig = d15.closes[i] > d15.ema200[i] && d15.ema50[i] > d15.ema200[i] &&
                          d15.lows[i] <= pEMA[i] && d15.closes[i] > pEMA[i] &&
                          d15.closes[i] > d15.opens[i] && lowerWick >= (body * wickRatio) &&
                          d15.rsi14[i] <= rsiThreshold && volOk;

          // Short: Downtrend (close < ema200, ema50 < ema200), spiked to/above EMA, rejected, red candle, RSI >= (100 - threshold)
          const shortSig = d15.closes[i] < d15.ema200[i] && d15.ema50[i] < d15.ema200[i] &&
                           d15.highs[i] >= pEMA[i] && d15.closes[i] < pEMA[i] &&
                           d15.closes[i] < d15.opens[i] && upperWick >= (body * wickRatio) &&
                           d15.rsi14[i] >= (100 - rsiThreshold) && volOk;

          if (longSig) signals[i] = 1;
          else if (shortSig) signals[i] = -1;
        }

        // Test fixed SL and ATR SL
        for (const slMode of ['atr', 'fixed']) {
          const slVals = slMode === 'atr' ? [1.5, 2.0, 2.5] : [400, 500, 600, 800];
          for (const val of slVals) {
            for (const rr of [1.0, 1.25, 1.5, 2.0]) {
              const res = runSimulation(d15, signals, (barIdx, ep, dir) => {
                const slDist = slMode === 'atr' ? Math.max(d15.atr14[barIdx] * val, 300) : val;
                const tpDist = slDist * rr;
                return {
                  sl: dir === 1 ? ep - slDist : ep + slDist,
                  tp: dir === 1 ? ep + tpDist : ep - tpDist,
                  rr
                };
              });

              if (res && res.trades >= 15 && res.wr >= 60.0 && res.calmar >= 3.0) {
                results15.push({
                  type: 'TrendPullback', pullEMA, rsiThreshold, wickRatio, volFilter, slMode, val, rr, ...res
                });
              }
            }
          }
        }
      }
    }
  }
}

// 2. Add Volatility Expansion / Bollinger Reversion in Trend
for (const bLen of [20, 25, 30]) {
  for (const bMult of [2.0, 2.2, 2.4, 2.6]) {
    // Compute BB
    const sma = new Float64Array(d15.n);
    let s = 0;
    for (let i = 0; i < bLen; i++) s += d15.closes[i];
    sma[bLen - 1] = s / bLen;
    for (let i = bLen; i < d15.n; i++) { s += d15.closes[i] - d15.closes[i - bLen]; sma[i] = s / bLen; }

    const upper = new Float64Array(d15.n);
    const lower = new Float64Array(d15.n);
    for (let i = bLen - 1; i < d15.n; i++) {
      let sumSq = 0;
      for (let j = 0; j < bLen; j++) { const diff = d15.closes[i - j] - sma[i]; sumSq += diff * diff; }
      const dev = bMult * Math.sqrt(sumSq / bLen);
      upper[i] = sma[i] + dev; lower[i] = sma[i] - dev;
    }

    for (const rsiMax of [45, 50, 55]) {
      const signals = new Int8Array(d15.n);
      for (let i = 200; i < d15.n; i++) {
        const body = Math.abs(d15.closes[i] - d15.opens[i]);
        const lowerWick = Math.min(d15.opens[i], d15.closes[i]) - d15.lows[i];
        const upperWick = d15.highs[i] - Math.max(d15.opens[i], d15.closes[i]);

        const longSig = d15.closes[i] > d15.ema200[i] && d15.lows[i] <= lower[i] &&
                        d15.closes[i] > d15.opens[i] && lowerWick >= (body * 0.15) &&
                        d15.rsi14[i] <= rsiMax;

        const shortSig = d15.closes[i] < d15.ema200[i] && d15.ema50[i] < d15.ema200[i] &&
                         d15.highs[i] >= upper[i] && d15.closes[i] < d15.opens[i] && upperWick >= (body * 0.15) &&
                         d15.rsi14[i] >= (100 - rsiMax);

        if (longSig) signals[i] = 1;
        else if (shortSig) signals[i] = -1;
      }

      for (const sl of [400, 500, 600, 700, 800]) {
        for (const rr of [1.0, 1.25, 1.5, 2.0]) {
          const res = runSimulation(d15, signals, (barIdx, ep, dir) => {
            const tpDist = sl * rr;
            return {
              sl: dir === 1 ? ep - sl : ep + sl,
              tp: dir === 1 ? ep + tpDist : ep - tpDist,
              rr
            };
          });

          if (res && res.trades >= 15 && res.wr >= 60.0 && res.calmar >= 3.0) {
            results15.push({
              type: 'BBReversion', bLen, bMult, rsiMax, sl, rr, ...res
            });
          }
        }
      }
    }
  }
}

results15.sort((a, b) => b.calmar - a.calmar || b.wr - a.wr);
console.log(`\nFound ${results15.length} candidates on BTC 15M meeting institutional standards.`);
console.log('\n--- TOP 10 BTC 15M STRATEGIES ---');
results15.slice(0, 10).forEach((r, idx) => {
  console.log(`#${idx+1}: [${r.type}] Details: ${JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => !['trades','wins','losses','wr','cumR','maxDD','calmar','monthlyR'].includes(k))))}`);
  console.log(`    Trades: ${r.trades} (${r.wins}W / ${r.losses}L) | WR: ${r.wr}% | Net: +${r.cumR}R | MaxDD: ${r.maxDD}R | Calmar: ${r.calmar}`);
  console.log(`    Monthly: ${JSON.stringify(r.monthlyR)}`);
});

// Now Deep Search on 1H
console.log('\n--- Deep Search on BTC 1H (10-Month Dataset) ---');
const results1H = [];

for (const pullEMA of ['ema21', 'ema50']) {
  for (const rsiThreshold of [40, 45, 50, 55]) {
    for (const wickRatio of [0.0, 0.15, 0.25]) {
      const signals = new Int8Array(d1H.n);
      const pEMA = pullEMA === 'ema21' ? d1H.ema21 : d1H.ema50;

      for (let i = 200; i < d1H.n; i++) {
        const body = Math.abs(d1H.closes[i] - d1H.opens[i]);
        const lowerWick = Math.min(d1H.opens[i], d1H.closes[i]) - d1H.lows[i];
        const upperWick = d1H.highs[i] - Math.max(d1H.opens[i], d1H.closes[i]);

        const longSig = d1H.closes[i] > d1H.ema200[i] && d1H.ema50[i] > d1H.ema200[i] &&
                        d1H.lows[i] <= pEMA[i] && d1H.closes[i] > pEMA[i] &&
                        d1H.closes[i] > d1H.opens[i] && lowerWick >= (body * wickRatio) &&
                        d1H.rsi14[i] <= rsiThreshold;

        const shortSig = d1H.closes[i] < d1H.ema200[i] && d1H.ema50[i] < d1H.ema200[i] &&
                         d1H.highs[i] >= pEMA[i] && d1H.closes[i] < pEMA[i] &&
                         d1H.closes[i] < d1H.opens[i] && upperWick >= (body * wickRatio) &&
                         d1H.rsi14[i] >= (100 - rsiThreshold);

        if (longSig) signals[i] = 1;
        else if (shortSig) signals[i] = -1;
      }

      for (const slMode of ['atr', 'fixed']) {
        const slVals = slMode === 'atr' ? [1.5, 2.0, 2.5] : [800, 1000, 1200, 1500];
        for (const val of slVals) {
          for (const rr of [1.0, 1.25, 1.5, 2.0]) {
            const res = runSimulation(d1H, signals, (barIdx, ep, dir) => {
              const slDist = slMode === 'atr' ? Math.max(d1H.atr14[barIdx] * val, 600) : val;
              const tpDist = slDist * rr;
              return {
                sl: dir === 1 ? ep - slDist : ep + slDist,
                tp: dir === 1 ? ep + tpDist : ep - tpDist,
                rr
              };
            });

            if (res && res.trades >= 20 && res.wr >= 55.0 && res.calmar >= 3.0) {
              results1H.push({
                type: 'TrendPullback', pullEMA, rsiThreshold, wickRatio, slMode, val, rr, ...res
              });
            }
          }
        }
      }
    }
  }
}

// 2. 1H SFP / Swing Failure
for (const lookback of [10, 15, 20]) {
  for (const wickRatio of [0.15, 0.25]) {
    const signals = new Int8Array(d1H.n);
    for (let i = lookback + 1; i < d1H.n; i++) {
      let swingHigh = -Infinity;
      let swingLow = Infinity;
      for (let j = 1; j <= lookback; j++) {
        if (d1H.highs[i - j] > swingHigh) swingHigh = d1H.highs[i - j];
        if (d1H.lows[i - j] < swingLow) swingLow = d1H.lows[i - j];
      }

      const body = Math.abs(d1H.closes[i] - d1H.opens[i]);
      const upperWick = d1H.highs[i] - Math.max(d1H.opens[i], d1H.closes[i]);
      const lowerWick = Math.min(d1H.opens[i], d1H.closes[i]) - d1H.lows[i];

      const bullSFP = d1H.lows[i] < swingLow && d1H.closes[i] > swingLow && lowerWick >= (body * wickRatio) && d1H.closes[i] > d1H.opens[i] && d1H.closes[i] > d1H.ema200[i];
      const bearSFP = d1H.highs[i] > swingHigh && d1H.closes[i] < swingHigh && upperWick >= (body * wickRatio) && d1H.closes[i] < d1H.opens[i] && d1H.closes[i] < d1H.ema200[i];

      if (bullSFP) signals[i] = 1;
      else if (bearSFP) signals[i] = -1;
    }

    for (const val of [800, 1000, 1200, 1500]) {
      for (const rr of [1.0, 1.25, 1.5, 2.0]) {
        const res = runSimulation(d1H, signals, (barIdx, ep, dir) => {
          const tpDist = val * rr;
          return {
            sl: dir === 1 ? ep - val : ep + val,
            tp: dir === 1 ? ep + tpDist : ep - tpDist,
            rr
          };
        });

        if (res && res.trades >= 20 && res.wr >= 55.0 && res.calmar >= 3.0) {
          results1H.push({
            type: '1H_SFP', lookback, wickRatio, val, rr, ...res
          });
        }
      }
    }
  }
}

results1H.sort((a, b) => b.calmar - a.calmar || b.wr - a.wr);
console.log(`\nFound ${results1H.length} candidates on BTC 1H meeting institutional standards.`);
console.log('\n--- TOP 10 BTC 1H STRATEGIES ---');
results1H.slice(0, 10).forEach((r, idx) => {
  console.log(`#${idx+1}: [${r.type}] Details: ${JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => !['trades','wins','losses','wr','cumR','maxDD','calmar','monthlyR'].includes(k))))}`);
  console.log(`    Trades: ${r.trades} (${r.wins}W / ${r.losses}L) | WR: ${r.wr}% | Net: +${r.cumR}R | MaxDD: ${r.maxDD}R | Calmar: ${r.calmar}`);
  console.log(`    Monthly: ${JSON.stringify(r.monthlyR)}`);
});

fs.writeFileSync('data/deep_btc_champions.json', JSON.stringify({ top15: results15.slice(0, 15), top1H: results1H.slice(0, 15) }, null, 2));
