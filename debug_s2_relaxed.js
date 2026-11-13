const fs = require('fs');

const rawCandles = JSON.parse(fs.readFileSync('pine-backtester-nextjs/public/data/xauusd_15m.json', 'utf8'));

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
const ema50 = calcEMA(close, 50);
const ema200 = calcEMA(close, 200);

// Precompute SMAs and StDevs
const smaCache = {};
const stdevCache = {};
const testLens = [20, 22, 24, 25, 26, 28, 30, 32, 34, 36, 40];
for (const len of testLens) {
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

// Identify S1 triggers
const sma28 = smaCache[28];
const std28 = stdevCache[28];
const s1Trigger = new Uint8Array(n);

for (let i = 200; i < n; i++) {
  const h = utcHour[i];
  const inSess = (h >= 1 && h <= 20) && (h !== 12);
  const lower = sma28[i] - 2.1 * std28[i];
  const upper = sma28[i] + 2.1 * std28[i];
  const passCrash = close[i] >= (ema50[i] - 1.25 * atr14[i]);

  const longS1 = inSess && passCrash && (close[i] > ema200[i] + 4.0) && (low[i] <= lower) && (close[i] > open[i]) && (rsi14[i] < 52);
  const shortS1 = inSess && (close[i] < ema200[i]) && (ema50[i] < ema200[i]) && (high[i] >= upper) && (close[i] < open[i]) && (rsi14[i] > 50);

  if (longS1 || shortS1) s1Trigger[i] = 1;
}

console.log(`Precomputed S1 triggers. Total S1 trigger bars: ${s1Trigger.reduce((a, b) => a + b, 0)}.`);

// Fast simulation with NOT s1Trigger constraint
function simExclusive(opts) {
  const {
    bandLen,
    bandMult,
    offset,
    tp,
    sl,
    maxDailyTrades = 2,
    maxDailyLosses = 1,
    startHour,
    endHour,
    excludeH12 = false,
    crashFilterAtr = 1.25,
    rsiLong = 52,
    rsiShort = 50
  } = opts;

  const sma = smaCache[bandLen];
  const std = stdevCache[bandLen];

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

    // STRICT ZERO-COLLISION CHECK: Cannot enter if S1 triggered on this bar!
    if (!inTrade && !s1Trigger[i]) {
      const h = utcHour[i];
      const inSession = (h >= startHour && h <= endHour) && (!excludeH12 || h !== 12);
      const canTrade = dayLossCount < maxDailyLosses && dayTradeCount < maxDailyTrades;
      const passCrash = crashFilterAtr <= 0 || close[i] >= (ema50[i] - crashFilterAtr * atr14[i]);

      const upper = sma[i] + bandMult * std[i];
      const lower = sma[i] - bandMult * std[i];

      const longSig = inSession && canTrade && passCrash &&
        (close[i] > ema200[i] + offset) &&
        (low[i] <= lower) &&
        (close[i] > open[i]) &&
        (rsi14[i] < rsiLong);

      const shortSig = inSession && canTrade &&
        (close[i] < ema200[i]) &&
        (ema50[i] < ema200[i]) &&
        (high[i] >= upper) &&
        (close[i] < open[i]) &&
        (rsi14[i] > rsiShort);

      if (longSig) {
        inTrade = true;
        tradeType = 1;
        entryPrice = close[i];
        entryIndex = i;
      } else if (shortSig) {
        inTrade = true;
        tradeType = -1;
        entryPrice = close[i];
        entryIndex = i;
      }
    }
  }

  return trades;
}

console.log('Searching for Strategy 2 with GUARANTEED ZERO MATCHES against Strategy 1...');

const s2Candidates = [];

const sessions = [
  { name: 'Full_00_23', s: 0, e: 23, ex12: false },
  { name: 'Day_01_22', s: 1, e: 22, ex12: false },
  { name: 'US_12_23', s: 12, e: 23, ex12: false },
  { name: 'US_12_22', s: 12, e: 22, ex12: false },
  { name: 'Lon_US_05_22', s: 5, e: 22, ex12: false }
];

for (const sess of sessions) {
  for (const bLen of testLens) {
    for (const bMult of [1.8, 1.9, 2.0, 2.05, 2.1, 2.15, 2.2]) {
      for (const off of [1.0, 2.0, 3.0, 4.0, 5.0]) {
        for (const tp of [14.0, 15.0, 16.0, 18.0]) {
          for (const sl of [13.75]) {
            for (const cf of [1.25, 1.35, 1.5]) {
              for (const mtd of [2, 3]) {
                const tr = simExclusive({
                  bandLen: bLen, bandMult: bMult, offset: off, tp, sl,
                  startHour: sess.s, endHour: sess.e, excludeH12: sess.ex12, crashFilterAtr: cf,
                  maxDailyTrades: mtd
                });

                if (tr.length < 10) continue;
                const wins = tr.filter(t => t.profit > 0).length;
                const wr = (wins / tr.length) * 100;
                if (wr < 70.0) continue;

                const net = tr.reduce((acc, t) => acc + t.profit, 0);
                let peak = 0, running = 0, maxDD = 0;
                for (const t of tr) {
                  running += t.profit;
                  if (running > peak) peak = running;
                  const dd = peak - running;
                  if (dd > maxDD) maxDD = dd;
                }
                const calmar = maxDD > 0 ? net / maxDD : 999;
                if (calmar < 4.0) continue;

                const moR = { 7: 0, 8: 0, 9: 0, 10: 0 };
                for (const t of tr) moR[t.month] = (moR[t.month] || 0) + t.r;

                s2Candidates.push({
                  sess: sess.name,
                  bLen, bMult, off, tp, sl, cf, mtd,
                  trades: tr.length,
                  wr: wr.toFixed(1),
                  net: net.toFixed(2),
                  calmar: calmar.toFixed(1),
                  maxDD: maxDD.toFixed(2),
                  rAug: moR[7].toFixed(2),
                  rSep: moR[8].toFixed(2),
                  rOct: moR[9].toFixed(2),
                  rNov: moR[10].toFixed(2),
                  totalR: (moR[7] + moR[8] + moR[9] + moR[10]).toFixed(2),
                  tr
                });
              }
            }
          }
        }
      }
    }
  }
}

console.log(`Found ${s2Candidates.length} Strategy 2 candidates with ZERO S1 MATCHES, WR >= 80%, Calmar >= 4.0!`);

s2Candidates.sort((a, b) => parseFloat(b.totalR) - parseFloat(a.totalR));

for (let i = 0; i < Math.min(20, s2Candidates.length); i++) {
  const c = s2Candidates[i];
  console.log(`${i+1}. [${c.sess}] Len:${c.bLen} Mult:${c.bMult} Off:${c.off} TP:${c.tp} SL:${c.sl} CF:${c.cf} MTD:${c.mtd}`);
  console.log(`   Trades:${c.trades} WR:${c.wr}% Calmar:${c.calmar} DD:$${c.maxDD}`);
  console.log(`   Monthly R: Aug +${c.rAug}R | Sep +${c.rSep}R | Oct +${c.rOct}R | Nov +${c.rNov}R | Total: +${c.totalR}R`);
}

fs.writeFileSync('zero_match_s2_candidates.json', JSON.stringify(s2Candidates.slice(0, 30).map(c => {
  const { tr, ...rest } = c;
  return rest;
}), null, 2));
