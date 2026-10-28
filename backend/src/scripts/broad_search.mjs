import fs from 'fs';

const candles = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));
const n = candles.length;

// Let's test a broad set of systematic strategies on 5M XAUUSD
// 1. RSI Extreme Scalper (RSI(5) < 15 or > 85)
// 2. MACD Histogram Trend Continuation
// 3. EMA Cross (9/21) + 200 EMA Filter
// 4. Session High/Low Breakout & Pullback
// 5. Volume Climax Reversal

function runSim(entries, tpPips, slPips, beTriggerPips = null, maxHold = 30) {
  const tpDist = tpPips / 10.0;
  const slDist = slPips / 10.0;
  const beDist = beTriggerPips ? beTriggerPips / 10.0 : null;
  let openTrade = null;
  const trades = [];

  for (let i = 50; i < n; i++) {
    const c = candles[i];

    if (openTrade !== null) {
      const t = openTrade;
      let exitPrice = null;
      let res = '';

      if (t.dir === 1) { // Long
        if (c.high >= t.tp) {
          exitPrice = t.tp; res = 'TP';
        } else if (c.low <= t.sl) {
          exitPrice = t.sl; res = 'SL';
        } else if (i - t.bar >= maxHold) {
          exitPrice = c.close; res = 'Timeout';
        } else if (beDist && !t.isBE && (c.high - t.entry) >= beDist) {
          t.sl = t.entry + 0.05; // Lock +0.05
          t.isBE = true;
        }
      } else { // Short
        if (c.low <= t.tp) {
          exitPrice = t.tp; res = 'TP';
        } else if (c.high >= t.sl) {
          exitPrice = t.sl; res = 'SL';
        } else if (i - t.bar >= maxHold) {
          exitPrice = c.close; res = 'Timeout';
        } else if (beDist && !t.isBE && (t.entry - c.low) >= beDist) {
          t.sl = t.entry - 0.05;
          t.isBE = true;
        }
      }

      if (exitPrice !== null) {
        const profit = t.dir === 1 ? (exitPrice - t.entry) : (t.entry - exitPrice);
        trades.push({ profit, res });
        openTrade = null;
      }
    }

    if (openTrade === null && i < n - 1) {
      const dir = entries(i);
      if (dir !== 0) {
        const nextOpen = candles[i + 1].open;
        openTrade = {
          bar: i + 1,
          dir,
          entry: nextOpen,
          tp: dir === 1 ? nextOpen + tpDist : nextOpen - tpDist,
          sl: dir === 1 ? nextOpen - slDist : nextOpen + slDist,
          isBE: false
        };
      }
    }
  }

  const wins = trades.filter(t => t.profit > 0);
  const wr = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
  const net = trades.reduce((a, b) => a + b.profit, 0);
  return { count: trades.length, wins: wins.length, wr: wr.toFixed(1), net: net.toFixed(2) };
}

// Precompute RSI 5
function calcRSI(p) {
  const r = new Float64Array(n);
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) {
    const d = candles[i].close - candles[i-1].close;
    if (d > 0) g += d; else l -= d;
  }
  let ag = g / p, al = l / p;
  r[p] = al === 0 ? 100 : 100 - (100 / (1 + ag / al));
  for (let i = p + 1; i < n; i++) {
    const d = candles[i].close - candles[i-1].close;
    ag = (ag * (p - 1) + (d > 0 ? d : 0)) / p;
    al = (al * (p - 1) + (d < 0 ? -d : 0)) / p;
    r[i] = al === 0 ? 100 : 100 - (100 / (1 + ag / al));
  }
  return r;
}
const rsi5 = calcRSI(5);

// Precompute EMA 20, 50, 200
function calcEMA(p) {
  const e = new Float64Array(n);
  const k = 2 / (p + 1);
  let s = 0;
  for (let i = 0; i < p; i++) s += candles[i].close;
  e[p - 1] = s / p;
  for (let i = p; i < n; i++) e[i] = candles[i].close * k + e[i - 1] * (1 - k);
  return e;
}
const ema20 = calcEMA(20);
const ema50 = calcEMA(50);
const ema200 = calcEMA(200);

console.log('Testing RSI(5) Mean Reversion:');
for (const thresh of [10, 15, 20]) {
  for (const tp of [10, 15, 20, 25]) {
    for (const sl of [15, 20, 30]) {
      const res = runSim((i) => {
        if (rsi5[i] < thresh && candles[i].close > candles[i].open) return 1;
        if (rsi5[i] > (100 - thresh) && candles[i].close < candles[i].open) return -1;
        return 0;
      }, tp, sl, tp * 0.5);
      if (res.count >= 20 && Number(res.wr) >= 70) {
        console.log(`Thresh=${thresh} TP=${tp}p SL=${sl}p -> Total=${res.count} Wins=${res.wins} WR=${res.wr}% Net=$${res.net}`);
      }
    }
  }
}

console.log('\nTesting EMA Trend Alignment Pullback:');
for (const tp of [15, 20, 25, 30]) {
  for (const sl of [15, 20, 25]) {
    const res = runSim((i) => {
      // Trend: 20 > 50 > 200
      if (ema20[i] > ema50[i] && ema50[i] > ema200[i]) {
        // Pullback: low touched ema20 and closed above ema20
        if (candles[i].low <= ema20[i] && candles[i].close > ema20[i] && candles[i].close > candles[i].open) return 1;
      }
      if (ema20[i] < ema50[i] && ema50[i] < ema200[i]) {
        if (candles[i].high >= ema20[i] && candles[i].close < ema20[i] && candles[i].close < candles[i].open) return -1;
      }
      return 0;
    }, tp, sl, tp * 0.5);
    if (res.count >= 20 && Number(res.wr) >= 60) {
      console.log(`TP=${tp}p SL=${sl}p -> Total=${res.count} Wins=${res.wins} WR=${res.wr}% Net=$${res.net}`);
    }
  }
}
