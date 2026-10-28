import fs from 'fs';
import path from 'path';

const candles15 = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));
const candles1h = JSON.parse(fs.readFileSync('data/xauusd_1h_tv.json', 'utf8'));

console.log(`Loaded 15M: ${candles15.length} candles, 1H: ${candles1h.length} candles.`);

function runFastBacktest(candles, is15M = true) {
  const n = candles.length;
  const closes = new Float64Array(n);
  const opens = new Float64Array(n);
  const highs = new Float64Array(n);
  const lows = new Float64Array(n);
  const times = new Float64Array(n);
  const hours = new Int32Array(n);

  for (let i = 0; i < n; i++) {
    closes[i] = candles[i].close;
    opens[i] = candles[i].open;
    highs[i] = candles[i].high;
    lows[i] = candles[i].low;
    const t = candles[i].openTime || candles[i].time;
    times[i] = t;
    hours[i] = new Date(t).getUTCHours();
  }

  function computeEMA(arr, period) {
    const ema = new Float64Array(n);
    const k = 2 / (period + 1);
    let sum = 0;
    for (let i = 0; i < period; i++) sum += arr[i];
    ema[period - 1] = sum / period;
    for (let i = period; i < n; i++) {
      ema[i] = arr[i] * k + ema[i - 1] * (1 - k);
    }
    return ema;
  }

  function computeSMA(arr, period) {
    const sma = new Float64Array(n);
    let sum = 0;
    for (let i = 0; i < period; i++) sum += arr[i];
    sma[period - 1] = sum / period;
    for (let i = period; i < n; i++) {
      sum += arr[i] - arr[i - period];
      sma[i] = sum / period;
    }
    return sma;
  }

  function computeRSI(arr, period = 14) {
    const rsi = new Float64Array(n);
    let gain = 0, loss = 0;
    for (let i = 1; i <= period; i++) {
      const diff = arr[i] - arr[i - 1];
      if (diff > 0) gain += diff;
      else loss -= diff;
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

  function computeBB(arr, period, mult) {
    const basis = computeSMA(arr, period);
    const upper = new Float64Array(n);
    const lower = new Float64Array(n);
    for (let i = period - 1; i < n; i++) {
      let sumSq = 0;
      for (let j = 0; j < period; j++) {
        const d = arr[i - j] - basis[i];
        sumSq += d * d;
      }
      const dev = mult * Math.sqrt(sumSq / period);
      upper[i] = basis[i] + dev;
      lower[i] = basis[i] - dev;
    }
    return { upper, lower, basis };
  }

  const ema50 = computeEMA(closes, 50);
  const ema200 = computeEMA(closes, 200);
  const rsi14 = computeRSI(closes, 14);

  // Precompute BB maps
  const bbMap = new Map();
  const periods = [20, 25, 28, 30, 35, 40];
  const mults = [1.8, 2.0, 2.1, 2.2, 2.4, 2.6, 2.8];
  for (const p of periods) {
    for (const m of mults) {
      bbMap.set(`${p}_${m}`, computeBB(closes, p, m));
    }
  }

  // Simulation engine with exact 1:2.0 R:R and optional BE trigger
  function sim(bbKey, slDist, tpDist, rsiMax, sStart, sEnd, exclH12, longOnly, beTrigger) {
    const bb = bbMap.get(bbKey);
    const bbLower = bb.lower;
    const bbUpper = bb.upper;

    let inTrade = false;
    let dir = 0;
    let ep = 0;
    let currSL = 0;
    let tpP = 0;
    let beActivated = false;

    const trades = [];
    let cumR = 0, peakR = 0, maxDD = 0;

    for (let i = 200; i < n - 1; i++) {
      const nextOpen = opens[i + 1];
      const nextHigh = highs[i + 1];
      const nextLow = lows[i + 1];

      if (inTrade) {
        let exited = false;
        let pnlR = 0;

        if (dir === 1) {
          // Check BE activation during bar
          if (beTrigger > 0 && !beActivated && nextHigh >= (ep + slDist * beTrigger)) {
            currSL = ep; // Move SL to breakeven
            beActivated = true;
          }

          if (nextHigh >= tpP) {
            pnlR = 2.0; // Exact 1:2 R:R!
            exited = true;
          } else if (nextLow <= currSL) {
            pnlR = beActivated && currSL === ep ? 0.0 : -1.0;
            exited = true;
          }
        } else {
          if (beTrigger > 0 && !beActivated && nextLow <= (ep - slDist * beTrigger)) {
            currSL = ep;
            beActivated = true;
          }

          if (nextLow <= tpP) {
            pnlR = 2.0; // Exact 1:2 R:R!
            exited = true;
          } else if (nextHigh >= currSL) {
            pnlR = beActivated && currSL === ep ? 0.0 : -1.0;
            exited = true;
          }
        }

        if (exited) {
          trades.push(pnlR);
          cumR += pnlR;
          if (cumR > peakR) peakR = cumR;
          if (peakR - cumR > maxDD) maxDD = peakR - cumR;
          inTrade = false;
        }
      }

      if (!inTrade) {
        const h = hours[i];
        if (h < sStart || h > sEnd) continue;
        if (exclH12 && h === 12) continue;

        const c = closes[i];
        const o = opens[i];
        const l = lows[i];
        const hBar = highs[i];
        const r = rsi14[i];
        const e200 = ema200[i];
        const e50 = ema50[i];

        const longCond = c > (e200 + 4.0) && l <= bbLower[i] && c > o && r < rsiMax;
        const shortCond = !longOnly && c < e200 && e50 < e200 && hBar >= bbUpper[i] && c < o && r > (100 - rsiMax);

        if (longCond) {
          inTrade = true;
          dir = 1;
          ep = nextOpen;
          currSL = ep - slDist;
          tpP = ep + tpDist;
          beActivated = false;
        } else if (shortCond) {
          inTrade = true;
          dir = -1;
          ep = nextOpen;
          currSL = ep + slDist;
          tpP = ep - tpDist;
          beActivated = false;
        }
      }
    }

    if (trades.length < 20) return null;

    const wins = trades.filter(r => r > 0).length;
    const losses = trades.filter(r => r < 0).length;
    const bes = trades.filter(r => r === 0).length;
    const wr = (wins / trades.length) * 100;
    const calmar = maxDD > 0 ? (cumR / maxDD) : 99;

    return {
      bbKey, slDist, tpDist, rsiMax, sStart, sEnd, exclH12, longOnly, beTrigger,
      totalTrades: trades.length,
      wins,
      losses,
      bes,
      winRate: wr,
      netR: cumR,
      maxDD,
      calmar
    };
  }

  const results = [];
  const slList = is15M ? [7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0] : [10.0, 12.0, 14.0, 15.0, 16.0, 18.0, 20.0];
  const rsiMaxs = [45, 48, 50, 52, 54];
  const beTriggers = [0.0, 0.5, 0.75, 1.0]; // 0.0 = no BE, 1.0 = lock BE at +1R

  for (const [bbKey] of bbMap.entries()) {
    for (const sl of slList) {
      const tp = sl * 2.0; // STRICT 1:2.0 R:R
      for (const rsiMax of rsiMaxs) {
        for (const beTrigger of beTriggers) {
          for (const longOnly of [true, false]) {
            const res = sim(bbKey, sl, tp, rsiMax, is15M ? 1 : 0, is15M ? 20 : 23, is15M, longOnly, beTrigger);
            if (!res) continue;

            if (res.winRate >= 70.0 && res.calmar >= 4.0) {
              results.push(res);
            }
          }
        }
      }
    }
  }

  return results;
}

console.log('Optimizing 15M for 1:2.0 R:R...');
const res15 = runFastBacktest(candles15, true);
console.log(`Found ${res15.length} candidates on 15M with 1:2 R:R and WR >= 70% and Calmar >= 4!`);

console.log('\nOptimizing 1H for 1:2.0 R:R...');
const res1h = runFastBacktest(candles1h, false);
console.log(`Found ${res1h.length} candidates on 1H with 1:2 R:R and WR >= 70% and Calmar >= 4!`);

res15.sort((a, b) => (b.winRate * b.calmar * b.netR) - (a.winRate * a.calmar * a.netR));
res1h.sort((a, b) => (b.winRate * b.calmar * b.netR) - (a.winRate * a.calmar * a.netR));

console.log('\nTop 5 Candidates on 15M (1:2 R:R):');
for (let i = 0; i < Math.min(5, res15.length); i++) {
  console.log(res15[i]);
}

console.log('\nTop 5 Candidates on 1H (1:2 R:R):');
for (let i = 0; i < Math.min(5, res1h.length); i++) {
  console.log(res1h[i]);
}
