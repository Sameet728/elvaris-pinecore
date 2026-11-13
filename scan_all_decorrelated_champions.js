const fs = require('fs');
const { PineTS } = require('./pine-backtester-nextjs/node_modules/pinets');

const rawCandles = JSON.parse(fs.readFileSync('pine-backtester-nextjs/public/data/xauusd_15m.json', 'utf8'));

// Load S1
const s1Script = fs.readFileSync('15M_Champion_Strategies/Champion_15M_Grandmaster_Dual10R_Oct8R_STRATEGY.pine', 'utf8')
  .replace(/var table perfTable[\s\S]*?plot\(ema50/m, 'plot(ema50')
  .replace(/if showPositionBoxes[\s\S]*?var table/m, 'var table');

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

const smaCache = {};
const stdevCache = {};
const lengths = [18, 20, 22, 24, 25, 26, 27, 28, 29, 30, 32, 34, 36, 40];
for (const len of lengths) {
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

function fastSim(opts) {
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

    if (!inTrade) {
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

// Compute baseline S1 trades using fastSim
const s1Trades = fastSim({
  bandLen: 28, bandMult: 2.1, offset: 4.0, tp: 14.0, sl: 13.75,
  maxDailyTrades: 2, maxDailyLosses: 1, startHour: 1, endHour: 20, excludeH12: true
});

const s1BarIndices = new Set(s1Trades.map(t => t.entryIndex));
console.log(`S1 Baseline: ${s1Trades.length} trades.`);

const sessions = [
  // Diverse sessions
  { name: 'US_12_21', s: 12, e: 21, ex12: false },
  { name: 'US_13_21', s: 13, e: 21, ex12: false },
  { name: 'US_12_22', s: 12, e: 22, ex12: false },
  { name: 'US_13_22', s: 13, e: 22, ex12: false },
  { name: 'US_14_22', s: 14, e: 22, ex12: false },
  { name: 'Asia_00_12', s: 0, e: 12, ex12: false },
  { name: 'Asia_01_12', s: 1, e: 12, ex12: false },
  { name: 'Lon_06_18', s: 6, e: 18, ex12: true },
  { name: 'Lon_07_19', s: 7, e: 19, ex12: true },
  { name: 'Lon_08_20', s: 8, e: 20, ex12: true },
  { name: 'Full_02_20', s: 2, e: 20, ex12: true },
  { name: 'Full_04_20', s: 4, e: 20, ex12: true }
];

const matches = [];

for (const sess of sessions) {
  for (const bLen of lengths) {
    for (const bMult of [1.95, 2.0, 2.05, 2.1, 2.15, 2.2, 2.25]) {
      for (const off of [2.0, 3.0, 4.0, 5.0]) {
        for (const tp of [14.0, 15.0, 16.0, 17.0, 18.0]) {
          for (const sl of [13.75, 14.50]) {
            for (const cf of [1.25, 1.35, 1.5]) {
              const tr = fastSim({
                bandLen: bLen, bandMult: bMult, offset: off, tp, sl,
                startHour: sess.s, endHour: sess.e, excludeH12: sess.ex12, crashFilterAtr: cf
              });

              if (tr.length < 24) continue;
              const wins = tr.filter(t => t.profit > 0).length;
              const wr = (wins / tr.length) * 100;
              if (wr < 80.0) continue;

              const moR = { 7: 0, 8: 0, 9: 0, 10: 0 };
              for (const t of tr) moR[t.month] = (moR[t.month] || 0) + t.r;

              // Count exact matching entry bar indices with S1
              let exactMatchingWithS1 = 0;
              for (const t of tr) {
                if (s1BarIndices.has(t.entryIndex)) exactMatchingWithS1++;
              }

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

              matches.push({
                sess: sess.name,
                bLen, bMult, off, tp, sl, cf,
                trades: tr.length,
                wr: wr.toFixed(1),
                net: net.toFixed(2),
                maxDD: maxDD.toFixed(2),
                calmar: calmar.toFixed(1),
                rAug: moR[7].toFixed(2),
                rSep: moR[8].toFixed(2),
                rOct: moR[9].toFixed(2),
                rNov: moR[10].toFixed(2),
                totalR: (moR[7] + moR[8] + moR[9] + moR[10]).toFixed(2),
                exactMatchingWithS1,
                nonMatchingTrades: tr.length - exactMatchingWithS1,
                decorrelationPct: (((tr.length - exactMatchingWithS1) / tr.length) * 100).toFixed(1)
              });
            }
          }
        }
      }
    }
  }
}

console.log(`Total qualifying strategies with WR >= 80% & Calmar >= 4.0: ${matches.length}`);

// Find candidates with MINIMUM exact matches with S1!
// Let's sort by: lowest exactMatchingWithS1, then highest totalR
matches.sort((a, b) => a.exactMatchingWithS1 - b.exactMatchingWithS1 || parseFloat(b.totalR) - parseFloat(a.totalR));

console.log('\n--- TOP CANDIDATES WITH LOWEST EXACT S1 MATCHES ---');
for (let i = 0; i < Math.min(25, matches.length); i++) {
  const m = matches[i];
  console.log(`${i + 1}. [${m.sess}] Len:${m.bLen} Mult:${m.bMult} Off:${m.off} TP:${m.tp} SL:${m.sl} CF:${m.cf}`);
  console.log(`   Trades:${m.trades} WR:${m.wr}% Calmar:${m.calmar} | S1 Exact Matches: ${m.exactMatchingWithS1} (${m.nonMatchingTrades} DIFFERENT trades! Decorrelated: ${m.decorrelationPct}%)`);
  console.log(`   Monthly R: Aug +${m.rAug}R | Sep +${m.rSep}R | Oct +${m.rOct}R | Nov +${m.rNov}R | Total: +${m.totalR}R`);
}

fs.writeFileSync('lowest_overlap_matches.json', JSON.stringify(matches.slice(0, 50), null, 2));

