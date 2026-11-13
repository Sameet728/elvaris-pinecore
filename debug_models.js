const fs = require('fs');

const rawCandles = JSON.parse(fs.readFileSync('pine-backtester-nextjs/public/data/xauusd_15m.json', 'utf8'));
const s1Data = JSON.parse(fs.readFileSync('s1_entries.json', 'utf8'));
const s1Timestamps = new Set(s1Data.timestamps);

const n = rawCandles.length;
const open = new Float64Array(n);
const high = new Float64Array(n);
const low = new Float64Array(n);
const close = new Float64Array(n);
const time = new Float64Array(n);
const utcHour = new Int32Array(n);
const utcDay = new Int32Array(n);
const utcMonth = new Int32Array(n);

for (let i = 0; i < n; i++) {
  open[i] = rawCandles[i].open;
  high[i] = rawCandles[i].high;
  low[i] = rawCandles[i].low;
  close[i] = rawCandles[i].close;
  const t = rawCandles[i].openTime;
  time[i] = t;
  const dt = new Date(t);
  utcHour[i] = dt.getUTCHours();
  utcDay[i] = dt.getUTCDate();
  utcMonth[i] = dt.getUTCMonth();
}

function calcEMA(src, len) {
  const out = new Float64Array(n);
  const alpha = 2 / (len + 1);
  let val = src[0];
  out[0] = val;
  for (let i = 1; i < n; i++) {
    val = alpha * src[i] + (1 - alpha) * val;
    out[i] = val;
  }
  return out;
}

function calcRMA(src, len) {
  const out = new Float64Array(n);
  const alpha = 1 / len;
  let sum = 0;
  for (let i = 0; i < len; i++) sum += src[i];
  let val = sum / len;
  out[len - 1] = val;
  for (let i = len; i < n; i++) {
    val = alpha * src[i] + (1 - alpha) * val;
    out[i] = val;
  }
  return out;
}

const tr = new Float64Array(n);
tr[0] = high[0] - low[0];
for (let i = 1; i < n; i++) {
  const h_l = high[i] - low[i];
  const h_pc = Math.abs(high[i] - close[i - 1]);
  const l_pc = Math.abs(low[i] - close[i - 1]);
  tr[i] = Math.max(h_l, h_pc, l_pc);
}
const atr14 = calcRMA(tr, 14);

function calcRSI(len) {
  const rsi = new Float64Array(n);
  const up = new Float64Array(n);
  const dn = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const diff = close[i] - close[i - 1];
    if (diff > 0) up[i] = diff;
    else dn[i] = -diff;
  }
  const rmaUp = calcRMA(up, len);
  const rmaDn = calcRMA(dn, len);
  for (let i = len; i < n; i++) {
    if (rmaDn[i] === 0) rsi[i] = 100;
    else {
      const rs = rmaUp[i] / rmaDn[i];
      rsi[i] = 100 - (100 / (1 + rs));
    }
  }
  return rsi;
}

const rsi14 = calcRSI(14);
const rsi7 = calcRSI(7);
const rsi9 = calcRSI(9);

const ema20 = calcEMA(close, 20);
const ema50 = calcEMA(close, 50);
const ema100 = calcEMA(close, 100);
const ema200 = calcEMA(close, 200);

// Precompute SMAs and StDevs for lengths [14, 18, 20, 22, 35, 40, 50]
const smaCache = {};
const stdevCache = {};
const testLengths = [14, 18, 20, 22, 24, 32, 35, 40, 45, 50];
for (const len of testLengths) {
  const sma = new Float64Array(n);
  const std = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < len; i++) sum += close[i];
  sma[len - 1] = sum / len;
  for (let i = len; i < n; i++) {
    sum += close[i] - close[i - len];
    sma[i] = sum / len;
    let varSum = 0;
    const m = sma[i];
    for (let j = i - len + 1; j <= i; j++) {
      const d = close[j] - m;
      varSum += d * d;
    }
    std[i] = Math.sqrt(varSum / len);
  }
  smaCache[len] = sma;
  stdevCache[len] = std;
}

// Highest / Lowest for Donchian channels
function calcHighest(len) {
  const out = new Float64Array(n);
  for (let i = len - 1; i < n; i++) {
    let max = -Infinity;
    for (let j = i - len + 1; j <= i; j++) if (high[j] > max) max = high[j];
    out[i] = max;
  }
  return out;
}

function calcLowest(len) {
  const out = new Float64Array(n);
  for (let i = len - 1; i < n; i++) {
    let min = Infinity;
    for (let j = i - len + 1; j <= i; j++) if (low[j] < min) min = low[j];
    out[i] = min;
  }
  return out;
}

const donchHigh20 = calcHighest(20);
const donchLow20 = calcLowest(20);

console.log('TA precomputation complete.');

// Generic simulator
function simSignals(longCond, shortCond, tp, sl, maxTrades = 2, maxLoss = 1) {
  let curDay = -1;
  let dayTradeCount = 0;
  let dayLossCount = 0;

  let inTrade = false;
  let tradeType = 0;
  let entryPrice = 0;
  let entryIndex = 0;

  const trades = [];

  for (let i = 200; i < n; i++) {
    const day = utcDay[i];
    if (day !== curDay) {
      curDay = day;
      dayTradeCount = 0;
      dayLossCount = 0;
    }

    if (inTrade) {
      let closed = false;
      let profit = 0;

      if (tradeType === 1) { // Long
        const hitSl = low[i] <= entryPrice - sl;
        const hitTp = high[i] >= entryPrice + tp;
        if (hitSl && hitTp) {
          closed = true;
          profit = -sl;
        } else if (hitSl) {
          closed = true;
          profit = -sl;
        } else if (hitTp) {
          closed = true;
          profit = tp;
        }
      } else if (tradeType === -1) { // Short
        const hitSl = high[i] >= entryPrice + sl;
        const hitTp = low[i] <= entryPrice - tp;
        if (hitSl && hitTp) {
          closed = true;
          profit = -sl;
        } else if (hitSl) {
          closed = true;
          profit = -sl;
        } else if (hitTp) {
          closed = true;
          profit = tp;
        }
      }

      if (closed) {
        trades.push({
          entryIndex,
          exitIndex: i,
          entryTime: time[entryIndex],
          exitTime: time[i],
          month: utcMonth[entryIndex],
          profit,
          r: profit / sl
        });
        if (profit <= 0) dayLossCount++;
        dayTradeCount++;
        inTrade = false;
      }
    }

    if (!inTrade) {
      const canTrade = dayLossCount < maxLoss && dayTradeCount < maxTrades;
      if (canTrade) {
        if (longCond[i]) {
          inTrade = true;
          tradeType = 1;
          entryPrice = close[i];
          entryIndex = i;
        } else if (shortCond[i]) {
          inTrade = true;
          tradeType = -1;
          entryPrice = close[i];
          entryIndex = i;
        }
      }
    }
  }

  return trades;
}

// Evaluate trades
function evaluate(trades) {
  if (trades.length === 0) return null;
  const wins = trades.filter(t => t.profit > 0).length;
  const wr = (wins / trades.length) * 100;
  const net = trades.reduce((acc, t) => acc + t.profit, 0);

  let peak = 0;
  let running = 0;
  let maxDD = 0;
  for (const t of trades) {
    running += t.profit;
    if (running > peak) peak = running;
    const dd = peak - running;
    if (dd > maxDD) maxDD = dd;
  }
  const calmar = maxDD > 0 ? net / maxDD : 999;

  const moR = { 7: 0, 8: 0, 9: 0, 10: 0 };
  const moWins = { 7: 0, 8: 0, 9: 0, 10: 0 };
  const moTrades = { 7: 0, 8: 0, 9: 0, 10: 0 };

  for (const t of trades) {
    moR[t.month] = (moR[t.month] || 0) + t.r;
    moTrades[t.month] = (moTrades[t.month] || 0) + 1;
    if (t.profit > 0) moWins[t.month] = (moWins[t.month] || 0) + 1;
  }

  // Count exact matches with S1
  let exactS1Matches = 0;
  for (const t of trades) {
    if (s1Timestamps.has(t.entryTime)) exactS1Matches++;
  }

  return {
    trades: trades.length,
    wins,
    wr,
    net,
    maxDD,
    calmar,
    moR,
    moWins,
    moTrades,
    exactS1Matches
  };
}

console.log('Testing diverse indicator models for ZERO exact matches with S1...');

const allCandidates = [];

// ==========================================
// MODEL 1: Institutional 20 SMA Bollinger Bands (Standard Institutional Benchmark)
// ==========================================
for (const bMult of [1.9, 2.0, 2.1, 2.2]) {
  for (const tp of [14.0, 15.0, 16.0]) {
    for (const sl of [13.75]) {
      for (const off of [2.0, 3.0, 4.0]) {
        for (const sH of [1, 2, 4, 6, 8, 11, 12]) {
          for (const eH of [19, 20, 21, 22]) {
            const longCond = new Uint8Array(n);
            const shortCond = new Uint8Array(n);
            const sma20 = smaCache[20];
            const std20 = stdevCache[20];

            for (let i = 200; i < n; i++) {
              const h = utcHour[i];
              if (h >= sH && h <= eH && h !== 12) {
                const passCrash = close[i] >= (ema50[i] - 1.25 * atr14[i]);
                const bull = close[i] > ema200[i] + off;
                const bear = close[i] < ema200[i] && ema50[i] < ema200[i];
                const upper = sma20[i] + bMult * std20[i];
                const lower = sma20[i] - bMult * std20[i];

                if (passCrash && bull && low[i] <= lower && close[i] > open[i] && rsi14[i] < 52) longCond[i] = 1;
                if (bear && high[i] >= upper && close[i] < open[i] && rsi14[i] > 50) shortCond[i] = 1;
              }
            }

            const tr = simSignals(longCond, shortCond, tp, sl, 2, 1);
            const ev = evaluate(tr);
            if (ev && ev.wr >= 68.0 && ev.trades >= 15) {
              allCandidates.push({
                model: 'SMA_20_BB',
                params: { bMult, tp, sl, off, sH, eH },
                ev
              });
            }
          }
        }
      }
    }
  }
}

// ==========================================
// MODEL 2: Macro 40 SMA Institutional Mean-Reversion Band
// ==========================================
for (const bMult of [2.0, 2.1, 2.2]) {
  for (const tp of [14.0, 15.0, 16.0]) {
    for (const sl of [13.75]) {
      for (const off of [2.0, 3.0, 4.0]) {
        for (const sH of [1, 3, 5, 7, 10, 12]) {
          for (const eH of [20, 21, 22]) {
            const longCond = new Uint8Array(n);
            const shortCond = new Uint8Array(n);
            const sma40 = smaCache[40];
            const std40 = stdevCache[40];

            for (let i = 200; i < n; i++) {
              const h = utcHour[i];
              if (h >= sH && h <= eH && h !== 12) {
                const passCrash = close[i] >= (ema50[i] - 1.25 * atr14[i]);
                const bull = close[i] > ema200[i] + off;
                const bear = close[i] < ema200[i] && ema50[i] < ema200[i];
                const upper = sma40[i] + bMult * std40[i];
                const lower = sma40[i] - bMult * std40[i];

                if (passCrash && bull && low[i] <= lower && close[i] > open[i] && rsi14[i] < 52) longCond[i] = 1;
                if (bear && high[i] >= upper && close[i] < open[i] && rsi14[i] > 50) shortCond[i] = 1;
              }
            }

            const tr = simSignals(longCond, shortCond, tp, sl, 2, 1);
            const ev = evaluate(tr);
            if (ev && ev.wr >= 68.0 && ev.trades >= 15) {
              allCandidates.push({
                model: 'SMA_40_MacroBand',
                params: { bMult, tp, sl, off, sH, eH },
                ev
              });
            }
          }
        }
      }
    }
  }
}

// ==========================================
// MODEL 3: Keltner Channel Volatility Envelopes (EMA 20 + ATR Multiplier)
// ==========================================
for (const kMult of [2.2, 2.4, 2.6, 2.8]) {
  for (const tp of [14.0, 15.0, 16.0]) {
    for (const sl of [13.75]) {
      for (const sH of [1, 3, 5, 8, 11, 12]) {
        for (const eH of [20, 21, 22]) {
          const longCond = new Uint8Array(n);
          const shortCond = new Uint8Array(n);

          for (let i = 200; i < n; i++) {
            const h = utcHour[i];
            if (h >= sH && h <= eH && h !== 12) {
              const upper = ema20[i] + kMult * atr14[i];
              const lower = ema20[i] - kMult * atr14[i];
              const bull = close[i] > ema200[i] + 3.0;
              const bear = close[i] < ema200[i] && ema50[i] < ema200[i];
              const passCrash = close[i] >= (ema50[i] - 1.25 * atr14[i]);

              if (passCrash && bull && low[i] <= lower && close[i] > open[i] && rsi14[i] < 52) longCond[i] = 1;
              if (bear && high[i] >= upper && close[i] < open[i] && rsi14[i] > 50) shortCond[i] = 1;
            }
          }

          const tr = simSignals(longCond, shortCond, tp, sl, 2, 1);
          const ev = evaluate(tr);
          if (ev && ev.wr >= 68.0 && ev.trades >= 15) {
            allCandidates.push({
              model: 'Keltner_20',
              params: { kMult, tp, sl, sH, eH },
              ev
            });
          }
        }
      }
    }
  }
}

// ==========================================
// MODEL 4: RSI(7) Extreme Reversion System
// ==========================================
for (const rsiOversold of [20, 22, 25, 28]) {
  for (const rsiOverbought of [72, 75, 78, 80]) {
    for (const tp of [14.0, 15.0, 16.0]) {
      for (const sl of [13.75]) {
        for (const sH of [1, 3, 6, 9, 12]) {
          for (const eH of [20, 21, 22]) {
            const longCond = new Uint8Array(n);
            const shortCond = new Uint8Array(n);

            for (let i = 200; i < n; i++) {
              const h = utcHour[i];
              if (h >= sH && h <= eH && h !== 12) {
                const bull = close[i] > ema200[i] + 3.0;
                const bear = close[i] < ema200[i] && ema50[i] < ema200[i];
                const passCrash = close[i] >= (ema50[i] - 1.25 * atr14[i]);

                if (passCrash && bull && rsi7[i] < rsiOversold && close[i] > open[i]) longCond[i] = 1;
                if (bear && rsi7[i] > rsiOverbought && close[i] < open[i]) shortCond[i] = 1;
              }
            }

            const tr = simSignals(longCond, shortCond, tp, sl, 2, 1);
            const ev = evaluate(tr);
            if (ev && ev.wr >= 68.0 && ev.trades >= 15) {
              allCandidates.push({
                model: 'RSI7_Extreme',
                params: { rsiOversold, rsiOverbought, tp, sl, sH, eH },
                ev
              });
            }
          }
        }
      }
    }
  }
}

console.log(`Evaluated models. Found ${allCandidates.length} high win rate candidate setups!`);

// Filter for ZERO EXACT MATCHES with Strategy 1!
const zeroMatches = allCandidates.filter(c => c.ev.exactS1Matches === 0);
console.log(`Strategies with EXACTLY 0 matching trades with S1: ${zeroMatches.length}`);

// If zero is small, also look at <= 2 incidental matches
const lowMatches = allCandidates.filter(c => c.ev.exactS1Matches <= 3);
console.log(`Strategies with <= 3 matching trades with S1: ${lowMatches.length}`);

// Sort by: min monthly R and total R
zeroMatches.sort((a, b) => {
  const minA = Math.min(a.ev.moR[7], a.ev.moR[8], a.ev.moR[9]);
  const minB = Math.min(b.ev.moR[7], b.ev.moR[8], b.ev.moR[9]);
  return minB - minA;
});

lowMatches.sort((a, b) => {
  const minA = Math.min(a.ev.moR[7], a.ev.moR[8], a.ev.moR[9]);
  const minB = Math.min(b.ev.moR[7], b.ev.moR[8], b.ev.moR[9]);
  return minB - minA;
});

console.log('\n--- TOP ZERO-MATCH STRATEGIES (0 S1 Overlap) ---');
for (let i = 0; i < Math.min(15, zeroMatches.length); i++) {
  const c = zeroMatches[i];
  const ev = c.ev;
  console.log(`${i+1}. [${c.model}] Params: ${JSON.stringify(c.params)}`);
  console.log(`   Trades: ${ev.trades} | WR: ${ev.wr.toFixed(1)}% | Calmar: ${ev.calmar.toFixed(1)} | Exact S1 Matches: ${ev.exactS1Matches}`);
  console.log(`   Monthly R: Aug +${ev.moR[7].toFixed(2)}R | Sep +${ev.moR[8].toFixed(2)}R | Oct +${ev.moR[9].toFixed(2)}R | Nov +${ev.moR[10].toFixed(2)}R`);
}

console.log('\n--- TOP ULTRA-LOW MATCH STRATEGIES (<= 3 S1 Overlap) ---');
for (let i = 0; i < Math.min(15, lowMatches.length); i++) {
  const c = lowMatches[i];
  const ev = c.ev;
  console.log(`${i+1}. [${c.model}] Params: ${JSON.stringify(c.params)}`);
  console.log(`   Trades: ${ev.trades} | WR: ${ev.wr.toFixed(1)}% | Calmar: ${ev.calmar.toFixed(1)} | Exact S1 Matches: ${ev.exactS1Matches}`);
  console.log(`   Monthly R: Aug +${ev.moR[7].toFixed(2)}R | Sep +${ev.moR[8].toFixed(2)}R | Oct +${ev.moR[9].toFixed(2)}R | Nov +${ev.moR[10].toFixed(2)}R`);
}

fs.writeFileSync('zero_match_results.json', JSON.stringify({ zeroMatches: zeroMatches.slice(0, 30), lowMatches: lowMatches.slice(0, 30) }, null, 2));
