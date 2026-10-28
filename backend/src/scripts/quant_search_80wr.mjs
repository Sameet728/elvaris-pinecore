import fs from 'fs';

const candles = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));
const n = candles.length;

// Precompute common indicators:
// EMAs: 20, 50, 100, 200
function calcEMA(period) {
  const ema = new Float64Array(n);
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += candles[i].close;
  ema[period - 1] = sum / period;
  for (let i = period; i < n; i++) ema[i] = candles[i].close * k + ema[i - 1] * (1 - k);
  return ema;
}
const ema20 = calcEMA(20);
const ema50 = calcEMA(50);
const ema100 = calcEMA(100);
const ema200 = calcEMA(200);

// RSI 7, 14
function calcRSI(period) {
  const rsi = new Float64Array(n);
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff > 0) gain += diff; else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < n; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }
  return rsi;
}
const rsi7 = calcRSI(7);
const rsi14 = calcRSI(14);

// ATR 14
const atr = new Float64Array(n);
let trSum = 0;
for (let i = 1; i <= 14; i++) {
  trSum += Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i - 1].close), Math.abs(candles[i].low - candles[i - 1].close));
}
atr[14] = trSum / 14;
for (let i = 15; i < n; i++) {
  const tr = Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i - 1].close), Math.abs(candles[i].low - candles[i - 1].close));
  atr[i] = (atr[i - 1] * 13 + tr) / 14;
}

// Bollinger Bands (20, 2)
const bbUpper = new Float64Array(n);
const bbLower = new Float64Array(n);
for (let i = 19; i < n; i++) {
  let sum = 0;
  for (let j = i - 19; j <= i; j++) sum += candles[j].close;
  const mean = sum / 20;
  let sqSum = 0;
  for (let j = i - 19; j <= i; j++) sqSum += (candles[j].close - mean) ** 2;
  const std = Math.sqrt(sqSum / 20);
  bbUpper[i] = mean + 2 * std;
  bbLower[i] = mean - 2 * std;
}

console.log('Searching for top models on 5M XAUUSD (Sep 14 - Oct 15, 2026)...');

// Simulator function with NO LOOKAHEAD, realistic execution:
// Order placed on bar i close executes on bar i+1 open!
function simulateStrategy(signals, getBracket) {
  let openTrade = null;
  const trades = [];

  for (let i = 200; i < n; i++) {
    const c = candles[i];

    // If trade open, evaluate exits first
    if (openTrade !== null) {
      const t = openTrade;
      let exitPrice = null;
      let comment = '';

      if (t.dir === 1) { // Long
        // Check if bar hit TP or SL
        // Realistic conservative check: if both hit on same bar, assume loss
        const hitTP = c.high >= t.tp;
        const hitSL = c.low <= t.sl;

        if (hitTP && hitSL) {
          exitPrice = t.sl; comment = 'SL (Ambiguous)';
        } else if (hitTP) {
          exitPrice = t.tp; comment = 'TP';
        } else if (hitSL) {
          exitPrice = t.sl; comment = 'SL';
        } else if (i - t.bar >= t.maxBars) {
          exitPrice = c.close; comment = 'Timeout';
        } else {
          // Trailing stop on close
          if (t.beTrigger && !t.isBE && (c.close - t.entry) >= t.beTrigger) {
            t.sl = t.entry + 0.10; // Positive BE +$0.10
            t.isBE = true;
          }
        }
      } else { // Short
        const hitTP = c.low <= t.tp;
        const hitSL = c.high >= t.sl;

        if (hitTP && hitSL) {
          exitPrice = t.sl; comment = 'SL (Ambiguous)';
        } else if (hitTP) {
          exitPrice = t.tp; comment = 'TP';
        } else if (hitSL) {
          exitPrice = t.sl; comment = 'SL';
        } else if (i - t.bar >= t.maxBars) {
          exitPrice = c.close; comment = 'Timeout';
        } else {
          if (t.beTrigger && !t.isBE && (t.entry - c.close) >= t.beTrigger) {
            t.sl = t.entry - 0.10; // Positive BE +$0.10
            t.isBE = true;
          }
        }
      }

      if (exitPrice !== null) {
        const profit = t.dir === 1 ? (exitPrice - t.entry) : (t.entry - exitPrice);
        trades.push({
          bar: t.bar, exitBar: i, dir: t.dir, entry: t.entry, exit: exitPrice, profit, comment
        });
        openTrade = null;
      }
    }

    // Check entry signal on bar close i -> enters on bar i+1 open!
    if (openTrade === null && i < n - 1) {
      const sig = signals(i);
      if (sig !== 0) {
        const nextOpen = candles[i + 1].open;
        const bracket = getBracket(i, sig, nextOpen);
        if (bracket) {
          openTrade = {
            bar: i + 1,
            dir: sig,
            entry: nextOpen,
            tp: bracket.tp,
            sl: bracket.sl,
            maxBars: bracket.maxBars || 50,
            beTrigger: bracket.beTrigger || null,
            isBE: false
          };
        }
      }
    }
  }

  const wins = trades.filter(t => t.profit > 0);
  const losses = trades.filter(t => t.profit <= 0);
  const total = trades.length;
  const wr = total > 0 ? (wins.length / total) * 100 : 0;
  const netProfit = trades.reduce((acc, t) => acc + t.profit, 0);

  return { total, wins: wins.length, losses: losses.length, wr: wr.toFixed(1), netProfit: netProfit.toFixed(2), trades };
}

// 1. Model A: Trend Exhaustion Reversal (RSI extreme + BB outer + Engulfing)
console.log('\n--- Model A: Trend Exhaustion Reversal ---');
for (const tp of [15, 20, 25, 30]) {
  for (const sl of [20, 30, 40]) {
    const res = simulateStrategy(
      (i) => {
        const c = candles[i], prev = candles[i - 1];
        // Long: prev bar closed below lower BB with RSI < 25, current bar is bullish engulfing
        if (prev.close < bbLower[i - 1] && rsi7[i - 1] < 25 && c.close > prev.open && c.close > c.open) return 1;
        // Short: prev bar closed above upper BB with RSI > 75, current bar is bearish engulfing
        if (prev.close > bbUpper[i - 1] && rsi7[i - 1] > 75 && c.close < prev.open && c.close < c.open) return -1;
        return 0;
      },
      (i, sig, entry) => ({
        tp: sig === 1 ? entry + (tp / 10) : entry - (tp / 10),
        sl: sig === 1 ? entry - (sl / 10) : entry + (sl / 10),
        beTrigger: (tp / 10) * 0.5,
        maxBars: 40
      })
    );
    if (res.total >= 10 && Number(res.wr) >= 70) {
      console.log(`TP=${tp}p SL=${sl}p -> Total: ${res.total} | Wins: ${res.wins} Losses: ${res.losses} | WR: ${res.wr}% | Net: $${res.netProfit}`);
    }
  }
}

// 2. Model B: Trend-Follow Pullback to EMA 50 with EMA 200 filter
console.log('\n--- Model B: Trend Pullback to 50 EMA ---');
for (const tp of [15, 20, 25, 30]) {
  for (const sl of [15, 20, 25, 30]) {
    const res = simulateStrategy(
      (i) => {
        const c = candles[i], prev = candles[i - 1];
        // Uptrend: EMA 50 > EMA 200
        if (ema50[i] > ema200[i]) {
          // Pullback: low touched or crossed below EMA 50, but closed above EMA 50 and RSI 14 between 40 and 55
          if (c.low <= ema50[i] && c.close > ema50[i] && rsi14[i] >= 40 && rsi14[i] <= 60 && c.close > c.open) return 1;
        }
        // Downtrend: EMA 50 < EMA 200
        if (ema50[i] < ema200[i]) {
          if (c.high >= ema50[i] && c.close < ema50[i] && rsi14[i] >= 40 && rsi14[i] <= 60 && c.close < c.open) return -1;
        }
        return 0;
      },
      (i, sig, entry) => ({
        tp: sig === 1 ? entry + (tp / 10) : entry - (tp / 10),
        sl: sig === 1 ? entry - (sl / 10) : entry + (sl / 10),
        beTrigger: (tp / 10) * 0.5,
        maxBars: 35
      })
    );
    if (res.total >= 10 && Number(res.wr) >= 65) {
      console.log(`TP=${tp}p SL=${sl}p -> Total: ${res.total} | Wins: ${res.wins} Losses: ${res.losses} | WR: ${res.wr}% | Net: $${res.netProfit}`);
    }
  }
}
