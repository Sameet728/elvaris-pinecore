import fs from 'fs';

// Load authentic TradingView BTC data
const candles15M = JSON.parse(fs.readFileSync('data/btcusdt_15m_tv.json', 'utf8'));
const candles1H = JSON.parse(fs.readFileSync('data/btcusdt_1h_tv.json', 'utf8'));

console.log(`Loaded 15M (${candles15M.length} bars) and 1H (${candles1H.length} bars)`);

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

  return {
    n, closes, opens, highs, lows, volumes, times, dates, hours, months,
    ema9: computeEMA(closes, 9),
    ema21: computeEMA(closes, 21),
    ema50: computeEMA(closes, 50),
    ema100: computeEMA(closes, 100),
    ema200: computeEMA(closes, 200),
    atr14: computeATR(14),
    rsi14: computeRSI(closes, 14)
  };
}

// Universal fast backtest simulator with confirmed bar-close signals, open[i+1] execution, exact intra-bar high/low check
function runSimulation(d, signals, getStopTarget) {
  const { n, opens, highs, lows, months } = d;
  let inTrade = false;
  let dir = 0;
  let sl = 0, tp = 0;
  let entryMonth = '';
  let pendingSignal = 0; // +1 for long, -1 for short
  let currentTradeRR = 1.0;

  const trades = [];
  let cumR = 0, peakR = 0, maxDD = 0;
  const monthlyR = {};

  for (let i = 50; i < n; i++) {
    // 1. Process pending entry on bar open
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

    // 2. Process exit during current bar
    if (inTrade) {
      let exited = false;
      let pnlR = 0;

      if (dir === 1) {
        if (highs[i] >= tp && lows[i] <= sl) {
          // Both hit: if opened above TP, take win; else conservative loss
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

    // 3. Evaluate signal on bar close
    if (!inTrade && pendingSignal === 0) {
      const sig = signals[i];
      if (sig !== 0) {
        pendingSignal = sig;
      }
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

// -------------------------------------------------------------
// ARCHITECTURE 1: Swing Failure Pattern (SFP) / Liquidity Sweep Rejection
// -------------------------------------------------------------
function testSFP(d, tfName) {
  console.log(`\n================ Testing Architecture 1: SFP Rejection on ${tfName} ================`);
  const { n, closes, opens, highs, lows, ema50, ema200, atr14 } = d;
  const results = [];

  for (const lookback of [10, 15, 20, 30, 40]) {
    for (const wickRatio of [0.15, 0.25, 0.35]) {
      for (const trendFilter of [false, true]) {
        const signals = new Int8Array(n);
        for (let i = lookback + 1; i < n; i++) {
          let swingHigh = -Infinity;
          let swingLow = Infinity;
          for (let j = 1; j <= lookback; j++) {
            if (highs[i - j] > swingHigh) swingHigh = highs[i - j];
            if (lows[i - j] < swingLow) swingLow = lows[i - j];
          }

          const body = Math.abs(closes[i] - opens[i]);
          const upperWick = highs[i] - Math.max(opens[i], closes[i]);
          const lowerWick = Math.min(opens[i], closes[i]) - lows[i];

          // Bullish SFP: low swept previous swing low, closed back above swing low, with lower rejection wick
          const bullSFP = lows[i] < swingLow && closes[i] > swingLow && lowerWick >= (body * wickRatio) && closes[i] > opens[i];
          // Bearish SFP: high swept previous swing high, closed back below swing high, with upper rejection wick
          const bearSFP = highs[i] > swingHigh && closes[i] < swingHigh && upperWick >= (body * wickRatio) && closes[i] < opens[i];

          const longTrend = !trendFilter || closes[i] > ema200[i];
          const shortTrend = !trendFilter || (closes[i] < ema200[i] && ema50[i] < ema200[i]);

          if (bullSFP && longTrend) signals[i] = 1;
          else if (bearSFP && shortTrend) signals[i] = -1;
        }

        // Test ATR-based SL and RR
        for (const atrMult of [1.5, 2.0, 2.5, 3.0]) {
          for (const rr of [1.0, 1.25, 1.5, 2.0]) {
            const res = runSimulation(d, signals, (barIdx, ep, dir) => {
              const slDist = Math.max(atr14[barIdx] * atrMult, tfName === '15M' ? 300 : 600);
              const tpDist = slDist * rr;
              return {
                sl: dir === 1 ? ep - slDist : ep + slDist,
                tp: dir === 1 ? ep + tpDist : ep - tpDist,
                rr
              };
            });

            if (res && res.trades >= 15 && res.wr >= 60.0 && res.calmar >= 3.0) {
              results.push({
                arch: 'SFP', lookback, wickRatio, trendFilter, atrMult, rr, ...res
              });
            }
          }
        }
      }
    }
  }

  results.sort((a, b) => b.calmar - a.calmar || b.wr - a.wr);
  console.log(`Found ${results.length} SFP configurations meeting baseline.`);
  results.slice(0, 5).forEach((r, idx) => {
    console.log(`#${idx+1}: Lookback=${r.lookback} Wick=${r.wickRatio} Trend=${r.trendFilter} ATR=${r.atrMult} 1:${r.rr} | Trades=${r.trades} WR=${r.wr}% Net=+${r.cumR}R MaxDD=${r.maxDD}R Calmar=${r.calmar}`);
    console.log(`    Monthly: ${JSON.stringify(r.monthlyR)}`);
  });
  return results;
}

// -------------------------------------------------------------
// ARCHITECTURE 2: EMA Ribbon & Trend Pullback Continuation
// -------------------------------------------------------------
function testTrendPullback(d, tfName) {
  console.log(`\n================ Testing Architecture 2: Trend Pullback Continuation on ${tfName} ================`);
  const { n, closes, opens, highs, lows, ema9, ema21, ema50, ema100, ema200, atr14, rsi14 } = d;
  const results = [];

  for (const rsiFilter of [40, 45, 50, 55]) {
    for (const pullType of ['ema21', 'ema50']) {
      const signals = new Int8Array(n);
      for (let i = 200; i < n; i++) {
        const pullEMA = pullType === 'ema21' ? ema21 : ema50;

        // Long: Uptrend (ema50 > ema200, close > ema200), pull into EMA (low <= pullEMA), rejected & closed above EMA (close > pullEMA and close > open)
        const longPull = closes[i] > ema200[i] && ema50[i] > ema200[i] && lows[i] <= pullEMA[i] && closes[i] > pullEMA[i] && closes[i] > opens[i] && rsi14[i] <= rsiFilter;

        // Short: Downtrend (ema50 < ema200, close < ema200), pull into EMA (high >= pullEMA), rejected & closed below EMA (close < pullEMA and close < open)
        const shortPull = closes[i] < ema200[i] && ema50[i] < ema200[i] && highs[i] >= pullEMA[i] && closes[i] < pullEMA[i] && closes[i] < opens[i] && rsi14[i] >= (100 - rsiFilter);

        if (longPull) signals[i] = 1;
        else if (shortPull) signals[i] = -1;
      }

      for (const atrMult of [1.5, 2.0, 2.5, 3.0]) {
        for (const rr of [1.0, 1.25, 1.5, 2.0]) {
          const res = runSimulation(d, signals, (barIdx, ep, dir) => {
            const slDist = Math.max(atr14[barIdx] * atrMult, tfName === '15M' ? 350 : 700);
            const tpDist = slDist * rr;
            return {
              sl: dir === 1 ? ep - slDist : ep + slDist,
              tp: dir === 1 ? ep + tpDist : ep - tpDist,
              rr
            };
          });

          if (res && res.trades >= 15 && res.wr >= 60.0 && res.calmar >= 3.0) {
            results.push({
              arch: 'TrendPullback', pullType, rsiFilter, atrMult, rr, ...res
            });
          }
        }
      }
    }
  }

  results.sort((a, b) => b.calmar - a.calmar || b.wr - a.wr);
  console.log(`Found ${results.length} Trend Pullback configurations meeting baseline.`);
  results.slice(0, 5).forEach((r, idx) => {
    console.log(`#${idx+1}: Pull=${r.pullType} RSI=${r.rsiFilter} ATR=${r.atrMult} 1:${r.rr} | Trades=${r.trades} WR=${r.wr}% Net=+${r.cumR}R MaxDD=${r.maxDD}R Calmar=${r.calmar}`);
    console.log(`    Monthly: ${JSON.stringify(r.monthlyR)}`);
  });
  return results;
}

// -------------------------------------------------------------
// ARCHITECTURE 3: Asian Range Breakout / Session Reversal (Crypto London/NY Engine)
// -------------------------------------------------------------
function testSessionRange(d, tfName) {
  console.log(`\n================ Testing Architecture 3: Session Sweep & Breakout on ${tfName} ================`);
  const { n, closes, opens, highs, lows, hours, ema200, atr14 } = d;
  const results = [];

  // Track Asian session (00:00 - 08:00 UTC) High & Low
  for (const sweepMode of ['reversal', 'breakout']) {
    for (const allowedSession of ['london_ny', 'ny_only']) {
      const signals = new Int8Array(n);
      let asianHigh = -Infinity;
      let asianLow = Infinity;
      let inAsian = false;
      let tradedToday = false;
      let lastDay = -1;

      for (let i = 1; i < n; i++) {
        const h = hours[i];
        const day = d.dates[i].getUTCDate();

        if (day !== lastDay) {
          lastDay = day;
          asianHigh = -Infinity;
          asianLow = Infinity;
          tradedToday = false;
        }

        // Asian Session: 00 to 07 UTC
        if (h >= 0 && h < 8) {
          if (highs[i] > asianHigh) asianHigh = highs[i];
          if (lows[i] < asianLow) asianLow = lows[i];
        }

        // Target Session: 08 to 16 (London + early NY) or 13 to 20 (NY)
        const inWindow = allowedSession === 'london_ny' ? (h >= 8 && h < 18) : (h >= 13 && h < 21);

        if (inWindow && !tradedToday && asianHigh > -Infinity && asianLow < Infinity) {
          if (sweepMode === 'reversal') {
            // Swept Asian Low and closed back inside
            if (lows[i] < asianLow && closes[i] > asianLow && closes[i] > opens[i] && closes[i] > ema200[i]) {
              signals[i] = 1;
              tradedToday = true;
            }
            // Swept Asian High and closed back inside
            else if (highs[i] > asianHigh && closes[i] < asianHigh && closes[i] < opens[i] && closes[i] < ema200[i]) {
              signals[i] = -1;
              tradedToday = true;
            }
          } else {
            // Breakout continuation
            if (closes[i] > asianHigh && closes[i] > opens[i] && closes[i] > ema200[i]) {
              signals[i] = 1;
              tradedToday = true;
            } else if (closes[i] < asianLow && closes[i] < opens[i] && closes[i] < ema200[i]) {
              signals[i] = -1;
              tradedToday = true;
            }
          }
        }
      }

      for (const atrMult of [1.5, 2.0, 2.5]) {
        for (const rr of [1.0, 1.25, 1.5, 2.0]) {
          const res = runSimulation(d, signals, (barIdx, ep, dir) => {
            const slDist = Math.max(atr14[barIdx] * atrMult, tfName === '15M' ? 350 : 700);
            const tpDist = slDist * rr;
            return {
              sl: dir === 1 ? ep - slDist : ep + slDist,
              tp: dir === 1 ? ep + tpDist : ep - tpDist,
              rr
            };
          });

          if (res && res.trades >= 10 && res.wr >= 60.0 && res.calmar >= 3.0) {
            results.push({
              arch: 'SessionRange', sweepMode, allowedSession, atrMult, rr, ...res
            });
          }
        }
      }
    }
  }

  results.sort((a, b) => b.calmar - a.calmar || b.wr - a.wr);
  console.log(`Found ${results.length} Session Range configurations meeting baseline.`);
  results.slice(0, 5).forEach((r, idx) => {
    console.log(`#${idx+1}: Mode=${r.sweepMode} Session=${r.allowedSession} ATR=${r.atrMult} 1:${r.rr} | Trades=${r.trades} WR=${r.wr}% Net=+${r.cumR}R MaxDD=${r.maxDD}R Calmar=${r.calmar}`);
    console.log(`    Monthly: ${JSON.stringify(r.monthlyR)}`);
  });
  return results;
}

// Run all on 15M and 1H
const d15M = prepare(candles15M);
const d1H = prepare(candles1H);

console.log('Testing all architectures on BTC 15M:');
const sfp15 = testSFP(d15M, '15M');
const pull15 = testTrendPullback(d15M, '15M');
const sess15 = testSessionRange(d15M, '15M');

console.log('\nTesting all architectures on BTC 1H:');
const sfp1H = testSFP(d1H, '1H');
const pull1H = testTrendPullback(d1H, '1H');
const sess1H = testSessionRange(d1H, '1H');

fs.writeFileSync('data/btc_multi_arch_results.json', JSON.stringify({
  tf15M: { sfp: sfp15.slice(0, 5), pull: pull15.slice(0, 5), sess: sess15.slice(0, 5) },
  tf1H: { sfp: sfp1H.slice(0, 5), pull: pull1H.slice(0, 5), sess: sess1H.slice(0, 5) }
}, null, 2));

console.log('\nFinished multi-architecture exploration on authentic TradingView BTC dataset!');
