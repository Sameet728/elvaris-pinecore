import fs from 'fs';
import { PineTS } from 'pinets';

function prepareData(candles) {
  const n = candles.length;
  const closes = new Float64Array(n);
  const opens = new Float64Array(n);
  const highs = new Float64Array(n);
  const lows = new Float64Array(n);
  const times = new Float64Array(n);
  const bodies = new Float64Array(n);
  const lowerWicks = new Float64Array(n);
  const upperWicks = new Float64Array(n);
  const months = [];

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    closes[i] = c.close; opens[i] = c.open; highs[i] = c.high; lows[i] = c.low;
    const t = c.openTime || c.time;
    times[i] = t;
    const d = new Date(t);
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    bodies[i] = Math.abs(c.close - c.open);
    lowerWicks[i] = Math.min(c.open, c.close) - c.low;
    upperWicks[i] = c.high - Math.max(c.open, c.close);
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

  return {
    n, closes, opens, highs, lows, times, bodies, lowerWicks, upperWicks, months,
    ema50, ema200, rsi14, computeBB
  };
}

function simData(d, bb, slDist, tpDist, rsiMax, wickMin, offset) {
  const { n, closes, opens, highs, lows, bodies, lowerWicks, upperWicks, months, ema50, ema200, rsi14 } = d;
  const { upper, lower } = bb;
  const rsiShortMin = 100 - rsiMax;

  let inTrade = false;
  let dir = 0;
  let currSL = 0, tpP = 0;
  let entryMonth = '';

  const trades = [];
  let cumR = 0, peakR = 0, maxDD = 0;
  const monthlyR = {};

  let pendingSignal = 0;

  for (let i = 200; i < n; i++) {
    // 1. Process entry
    if (pendingSignal !== 0 && !inTrade) {
      inTrade = true;
      dir = pendingSignal;
      const ep = opens[i];
      if (dir === 1) {
        currSL = ep - slDist;
        tpP = ep + tpDist;
      } else {
        currSL = ep + slDist;
        tpP = ep - tpDist;
      }
      entryMonth = months[i];
      pendingSignal = 0;
    }

    // 2. Process exit
    if (inTrade) {
      const bHigh = highs[i];
      const bLow = lows[i];
      let exited = false;
      let pnlR = 0;

      if (dir === 1) {
        if (bHigh >= tpP && bLow <= currSL) {
          pnlR = opens[i] >= tpP ? (tpDist / slDist) : -1.0;
          exited = true;
        } else if (bHigh >= tpP) {
          pnlR = tpDist / slDist;
          exited = true;
        } else if (bLow <= currSL) {
          pnlR = -1.0;
          exited = true;
        }
      } else {
        if (bLow <= tpP && bHigh >= currSL) {
          pnlR = opens[i] <= tpP ? (tpDist / slDist) : -1.0;
          exited = true;
        } else if (bLow <= tpP) {
          pnlR = tpDist / slDist;
          exited = true;
        } else if (bHigh >= currSL) {
          pnlR = -1.0;
          exited = true;
        }
      }

      if (exited) {
        trades.push(pnlR);
        cumR += pnlR;
        if (cumR > peakR) peakR = cumR;
        if (peakR - cumR > maxDD) maxDD = peakR - cumR;
        monthlyR[entryMonth] = (monthlyR[entryMonth] || 0) + pnlR;
        inTrade = false;
      }
    }

    // 3. Signal evaluation
    if (!inTrade && pendingSignal === 0) {
      const c = closes[i];
      const o = opens[i];
      const l = lows[i];
      const hBar = highs[i];
      const r = rsi14[i];
      const b = bodies[i];

      const wickLongOk = wickMin === 0 || lowerWicks[i] >= (b * wickMin);
      const wickShortOk = wickMin === 0 || upperWicks[i] >= (b * wickMin);

      const longCond = c > (ema200[i] + offset) && l <= lower[i] && c > o && r < rsiMax && wickLongOk;
      const shortCond = c < ema200[i] && ema50[i] < ema200[i] && hBar >= upper[i] && c < o && r > rsiShortMin && wickShortOk;

      if (longCond) pendingSignal = 1;
      else if (shortCond) pendingSignal = -1;
    }
  }

  const totalTrades = trades.length;
  if (totalTrades < 10) return null;
  const wins = trades.filter(t => t > 0).length;
  const wr = (wins / totalTrades) * 100;
  const calmar = maxDD > 0 ? (cumR / maxDD) : 0;

  return { totalTrades, wins, wr, cumR, maxDD, calmar, monthlyR };
}

// 1. Optimize 15M BTC
console.log('--- Fast Vectorized Search on BTC 15M (5,061 candles) ---');
const candles15M = JSON.parse(fs.readFileSync('data/btcusdt_15m_tv.json', 'utf8'));
const d15 = prepareData(candles15M);

const pList = [18, 20, 22, 24, 26, 28, 30];
const mList = [2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6];
const slList15 = [500, 600, 700, 800, 900, 1000, 1200];
const rrList = [1.2, 1.25, 1.5, 1.75, 2.0];
const rsiList = [46, 48, 50, 52, 54];
const wickList = [0, 0.10, 0.15];
const offsetList = [0, 100, 200, 300];

const bbMap15 = new Map();
for (const p of pList) {
  for (const m of mList) {
    bbMap15.set(`${p}_${m}`, d15.computeBB(d15.closes, p, m));
  }
}

const results15 = [];

for (const p of pList) {
  for (const m of mList) {
    const bb = bbMap15.get(`${p}_${m}`);
    for (const sl of slList15) {
      for (const rr of rrList) {
        const tp = Math.round(sl * rr);
        for (const rsi of rsiList) {
          for (const wick of wickList) {
            for (const offset of offsetList) {
              const res = simData(d15, bb, sl, tp, rsi, wick, offset);
              if (!res) continue;
              if (res.wr >= 72.0 && res.calmar >= 6.0 && res.totalTrades >= 12) {
                results15.push({ p, m, sl, tp, rr, rsi, wick, offset, ...res });
              }
            }
          }
        }
      }
    }
  }
}

console.log(`Found ${results15.length} institutional candidates on BTC 15M!`);
results15.sort((a, b) => b.calmar - a.calmar || b.wr - a.wr);

console.log('\nTop 10 BTC 15M Candidates:');
for (let i = 0; i < Math.min(10, results15.length); i++) {
  const r = results15[i];
  console.log(`#${i+1}: BB(${r.p}, ${r.m}) | SL: $${r.sl} / TP: $${r.tp} (1:${r.rr}) | RSI: <${r.rsi} | Wick: ${r.wick} | Offset: $${r.offset}`);
  console.log(`    Trades: ${r.totalTrades} (${r.wins}W/${r.totalTrades-r.wins}L) | WR: ${r.wr.toFixed(1)}% | Net: +${r.cumR.toFixed(1)}R | MaxDD: ${r.maxDD.toFixed(1)}R | Calmar: ${r.calmar.toFixed(1)}`);
  console.log(`    Monthly: ${JSON.stringify(r.monthlyR)}`);
}

// 2. Optimize 1H BTC (7,098 candles - 10 Months)
console.log('\n--- Fast Vectorized Search on BTC 1H (7,098 candles / Jan-Oct 2026) ---');
const candles1H = JSON.parse(fs.readFileSync('data/btcusdt_1h_tv.json', 'utf8'));
const d1H = prepareData(candles1H);

const bbMap1H = new Map();
for (const p of pList) {
  for (const m of mList) {
    bbMap1H.set(`${p}_${m}`, d1H.computeBB(d1H.closes, p, m));
  }
}

const slList1H = [800, 1000, 1200, 1400, 1600, 1800, 2000];
const results1H = [];

for (const p of pList) {
  for (const m of mList) {
    const bb = bbMap1H.get(`${p}_${m}`);
    for (const sl of slList1H) {
      for (const rr of rrList) {
        const tp = Math.round(sl * rr);
        for (const rsi of rsiList) {
          for (const wick of wickList) {
            for (const offset of [0, 200, 400]) {
              const res = simData(d1H, bb, sl, tp, rsi, wick, offset);
              if (!res) continue;
              if (res.wr >= 72.0 && res.calmar >= 6.0 && res.totalTrades >= 25) {
                results1H.push({ p, m, sl, tp, rr, rsi, wick, offset, ...res });
              }
            }
          }
        }
      }
    }
  }
}

console.log(`Found ${results1H.length} institutional candidates on BTC 1H!`);
results1H.sort((a, b) => b.calmar - a.calmar || b.wr - a.wr);

console.log('\nTop 10 BTC 1H Candidates:');
for (let i = 0; i < Math.min(10, results1H.length); i++) {
  const r = results1H[i];
  console.log(`#${i+1}: BB(${r.p}, ${r.m}) | SL: $${r.sl} / TP: $${r.tp} (1:${r.rr}) | RSI: <${r.rsi} | Wick: ${r.wick} | Offset: $${r.offset}`);
  console.log(`    Trades: ${r.totalTrades} (${r.wins}W/${r.totalTrades-r.wins}L) | WR: ${r.wr.toFixed(1)}% | Net: +${r.cumR.toFixed(1)}R | MaxDD: ${r.maxDD.toFixed(1)}R | Calmar: ${r.calmar.toFixed(1)}`);
  console.log(`    Monthly: ${JSON.stringify(r.monthlyR)}`);
}

fs.writeFileSync('data/btc_vectorized_best.json', JSON.stringify({ top15: results15.slice(0, 15), top1H: results1H.slice(0, 15) }, null, 2));
