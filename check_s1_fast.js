const fs = require('fs');
const {
  candles, N, calcEMA, calcSMA, calcStDev, calcRSI, calcATR,
  ema20, ema50, ema200, rsi14, atr14, evaluateStrategy
} = require('./fast_8r_engine');

// Let's test the baseline Strategy 1 first to see why Strategy 1 passed
// Strategy 1:
// bandLen = 28, mult = 2.1, tp = 14, sl = 13.75, emaFast = 50, emaSlow = 200, emaOffset = 4.0, rsiFilter = 52, session = 1 to 20, excludeH12 = true, crashFilter = 1.25

const sma28 = calcSMA(28);
const sd28 = calcStDev(28, sma28);
const upper = new Float64Array(N);
const lower = new Float64Array(N);
for (let i = 27; i < N; i++) {
  upper[i] = sma28[i] + 2.1 * sd28[i];
  lower[i] = sma28[i] - 2.1 * sd28[i];
}

const signals = new Array(N);
for (let i = 200; i < N; i++) {
  const c = candles[i];
  const h = new Date(c.openTime).getUTCHours();
  if (h < 1 || h > 20 || h === 12) continue;
  const passCrash = c.close >= (ema50[i] - 1.25 * atr14[i]);
  if (c.close > (ema200[i] + 4.0) && c.low <= lower[i] && c.close > c.open && rsi14[i] < 52 && passCrash) {
    signals[i] = 'LONG';
  } else if (c.close < ema200[i] && ema50[i] < ema200[i] && c.high >= upper[i] && c.close < c.open && rsi14[i] > 50) {
    signals[i] = 'SHORT';
  }
}

const res = evaluateStrategy(signals, 14.0, 13.75);
console.log('Strategy 1 Baseline simulation:');
console.log('Total:', res.total, 'WR:', res.winRate.toFixed(1), '% | Calmar:', res.calmar.toFixed(1));
console.log('Aug R:', res.augR.toFixed(2), 'Sep R:', res.sepR.toFixed(2), 'Oct R:', res.octR.toFixed(2), 'Nov R:', res.novR.toFixed(2));

