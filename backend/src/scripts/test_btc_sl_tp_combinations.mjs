import fs from 'fs';

const candles = JSON.parse(fs.readFileSync('data/btcusdt_15m_tv.json', 'utf8'));
const n = candles.length;
const closes = candles.map(c => c.close);
const opens = candles.map(c => c.open);
const highs = candles.map(c => c.high);
const lows = candles.map(c => c.low);

function computeSMA(arr, p) {
  const res = new Float64Array(arr.length);
  let s = 0;
  for (let i = 0; i < p; i++) s += arr[i];
  res[p - 1] = s / p;
  for (let i = p; i < arr.length; i++) { s += arr[i] - arr[i - p]; res[i] = s / p; }
  return res;
}
function computeEMA(arr, p) {
  const res = new Float64Array(arr.length);
  const k = 2 / (p + 1);
  let s = 0;
  for (let i = 0; i < p; i++) s += arr[i];
  res[p - 1] = s / p;
  for (let i = p; i < arr.length; i++) { res[i] = arr[i] * k + res[i - 1] * (1 - k); }
  return res;
}
function computeBB(arr, p, mult) {
  const basis = computeSMA(arr, p);
  const upper = new Float64Array(arr.length);
  const lower = new Float64Array(arr.length);
  for (let i = p - 1; i < arr.length; i++) {
    let sumSq = 0;
    for (let j = 0; j < p; j++) { const d = arr[i - j] - basis[i]; sumSq += d * d; }
    const dev = mult * Math.sqrt(sumSq / p);
    upper[i] = basis[i] + dev; lower[i] = basis[i] - dev;
  }
  return { upper, lower };
}

const ema50 = computeEMA(closes, 50);
const ema200 = computeEMA(closes, 200);

for (const m of [1.8, 2.0, 2.2, 2.4, 2.6]) {
  const bb = computeBB(closes, 20, m);
  for (const sl of [300, 400, 500, 600, 800, 1000, 1200, 1500]) {
    for (const rr of [1.0, 1.25, 1.5, 2.0]) {
      const tp = sl * rr;
      let inTrade = false, dir = 0, currSL = 0, tpP = 0;
      let wins = 0, losses = 0, cumR = 0;
      for (let i = 200; i < n; i++) {
        if (inTrade) {
          if (dir === 1) {
            if (highs[i] >= tpP) { wins++; cumR += rr; inTrade = false; }
            else if (lows[i] <= currSL) { losses++; cumR -= 1.0; inTrade = false; }
          } else {
            if (lows[i] <= tpP) { wins++; cumR += rr; inTrade = false; }
            else if (highs[i] >= currSL) { losses++; cumR -= 1.0; inTrade = false; }
          }
        }
        if (!inTrade) {
          if (closes[i] > ema200[i] && lows[i] <= bb.lower[i] && closes[i] > opens[i]) {
            inTrade = true; dir = 1; currSL = closes[i] - sl; tpP = closes[i] + tp;
          } else if (closes[i] < ema200[i] && ema50[i] < ema200[i] && highs[i] >= bb.upper[i] && closes[i] < opens[i]) {
            inTrade = true; dir = -1; currSL = closes[i] + sl; tpP = closes[i] - tp;
          }
        }
      }
      const tot = wins + losses;
      const wr = tot > 0 ? (wins / tot) * 100 : 0;
      if (cumR >= 5.0) {
        console.log(`m=${m} sl=${sl} tp=${tp} (1:${rr}): trades=${tot} W=${wins} L=${losses} WR=${wr.toFixed(1)}% cumR=+${cumR.toFixed(1)}R`);
      }
    }
  }
}
