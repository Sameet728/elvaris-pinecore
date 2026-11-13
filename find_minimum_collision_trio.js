const fs = require('fs');
const { PineTS } = require('./pine-backtester-nextjs/node_modules/pinets');

const rawCandles = JSON.parse(fs.readFileSync('pine-backtester-nextjs/public/data/xauusd_15m.json', 'utf8'));
const pineCandles = rawCandles.map(c => ({
  open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
  openTime: c.openTime, closeTime: c.openTime + 15 * 60000
}));

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
const allLengths = [22, 24, 25, 26, 27, 28, 29, 30, 32, 34, 36];
for (const len of allLengths) {
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

// S1 Baseline trades
const s1Trades = fastSim({
  bandLen: 28, bandMult: 2.1, offset: 4.0, tp: 14.0, sl: 13.75,
  maxDailyTrades: 2, maxDailyLosses: 1, startHour: 1, endHour: 20, excludeH12: true
});
const s1Indices = new Set(s1Trades.map(t => t.entryIndex));

// Collect all high performing setups (WR >= 80%, Trades >= 25, Calmar >= 4)
const pool = [];

const sessions = [
  { name: 'US_12_21', s: 12, e: 21, ex12: false, cat: 'US' },
  { name: 'US_12_22', s: 12, e: 22, ex12: false, cat: 'US' },
  { name: 'US_13_22', s: 13, e: 22, ex12: false, cat: 'US' },
  { name: 'Lon_04_20', s: 4, e: 20, ex12: true, cat: 'LON' },
  { name: 'Lon_05_20', s: 5, e: 20, ex12: true, cat: 'LON' },
  { name: 'Lon_06_20', s: 6, e: 20, ex12: true, cat: 'LON' },
  { name: 'Lon_07_21', s: 7, e: 21, ex12: true, cat: 'LON' }
];

for (const sess of sessions) {
  for (const bLen of allLengths) {
    for (const bMult of [2.05, 2.1, 2.15, 2.2]) {
      for (const off of [2.5, 3.0, 3.5, 4.0, 4.5]) {
        for (const tp of [14.0, 15.0, 15.5, 16.0, 18.0]) {
          for (const sl of [13.75]) {
            for (const cf of [1.25, 1.35, 1.5]) {
              const tr = fastSim({
                bandLen: bLen, bandMult: bMult, offset: off, tp, sl,
                startHour: sess.s, endHour: sess.e, excludeH12: sess.ex12, crashFilterAtr: cf
              });
              if (tr.length < 25) continue;
              const wins = tr.filter(t => t.profit > 0).length;
              const wr = (wins / tr.length) * 100;
              if (wr < 80.0) continue;

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

              let matchS1 = 0;
              for (const t of tr) if (s1Indices.has(t.entryIndex)) matchS1++;

              pool.push({
                sess: sess.name, cat: sess.cat,
                bLen, bMult, off, tp, sl, cf,
                trades: tr.length, wr: wr.toFixed(1),
                net: net.toFixed(2), calmar: calmar.toFixed(1), maxDD: maxDD.toFixed(2),
                rAug: moR[7].toFixed(2), rSep: moR[8].toFixed(2), rOct: moR[9].toFixed(2), rNov: moR[10].toFixed(2),
                totalR: (moR[7] + moR[8] + moR[9] + moR[10]).toFixed(2),
                matchS1,
                indices: new Set(tr.map(t => t.entryIndex)),
                tr
              });
            }
          }
        }
      }
    }
  }
}

console.log(`Pool contains ${pool.length} candidate strategies with WR >= 80% & Calmar >= 4.0.`);

// Now find pairs (S2, S3) where:
// S2 is from US cat, S3 is from LON cat
// We want:
// 1. MINIMUM exact matches between S1 and S2
// 2. MINIMUM exact matches between S1 and S3
// 3. MINIMUM exact matches between S2 and S3!
// 4. Maximum monthly R (close to 10R each month)
const usPool = pool.filter(p => p.cat === 'US');
const lonPool = pool.filter(p => p.cat === 'LON');

console.log(`US Candidates: ${usPool.length} | London Candidates: ${lonPool.length}`);

const trioPairs = [];

for (const s2 of usPool) {
  for (const s3 of lonPool) {
    // Count exact matches between S2 and S3
    let matchS2S3 = 0;
    for (const idx of s2.indices) {
      if (s3.indices.has(idx)) matchS2S3++;
    }

    // Count 3-way exact matches (bars where S1, S2, and S3 ALL entered together)
    let match3Way = 0;
    for (const idx of s2.indices) {
      if (s3.indices.has(idx) && s1Indices.has(idx)) match3Way++;
    }

    // Combined score: lower overlap is better, higher total R is better
    const minM2 = Math.min(s2.rAug, s2.rSep, s2.rOct);
    const minM3 = Math.min(s3.rAug, s3.rSep, s3.rOct);

    if (minM2 >= 6.5 && minM3 >= 7.0) {
      trioPairs.push({
        s2,
        s3,
        matchS1S2: s2.matchS1,
        matchS1S3: s3.matchS1,
        matchS2S3,
        match3Way,
        totalCollision: s2.matchS1 + s3.matchS1 + matchS2S3,
        minM2,
        minM3
      });
    }
  }
}

console.log(`Found ${trioPairs.length} qualifying trio configurations!`);

// Sort by: LOWEST 3-way match, then lowest total collision, then highest R
trioPairs.sort((a, b) => a.match3Way - b.match3Way || a.totalCollision - b.totalCollision || (parseFloat(b.s2.totalR) + parseFloat(b.s3.totalR)) - (parseFloat(a.s2.totalR) + parseFloat(a.s3.totalR)));

console.log('\n--- TOP 10 BEST TRIO CONFIGURATIONS WITH LOWEST SIMULTANEOUS MATCHES ---');
for (let i = 0; i < Math.min(10, trioPairs.length); i++) {
  const tp = trioPairs[i];
  const s2 = tp.s2;
  const s3 = tp.s3;
  console.log(`\n#${i + 1}: 3-Way Simultaneous Matches: ${tp.match3Way} | S1-S2 Matches: ${tp.matchS1S2} | S1-S3 Matches: ${tp.matchS1S3} | S2-S3 Matches: ${tp.matchS2S3}`);
  console.log(`   Strategy 2: [${s2.sess}] Len:${s2.bLen} Mult:${s2.bMult} Off:${s2.off} TP:${s2.tp} SL:${s2.sl} | Trades:${s2.trades} WR:${s2.wr}% Calmar:${s2.calmar}`);
  console.log(`      Monthly R: Aug +${s2.rAug}R | Sep +${s2.rSep}R | Oct +${s2.rOct}R | Nov +${s2.rNov}R | Total: +${s2.totalR}R`);
  console.log(`   Strategy 3: [${s3.sess}] Len:${s3.bLen} Mult:${s3.bMult} Off:${s3.off} TP:${s3.tp} SL:${s3.sl} | Trades:${s3.trades} WR:${s3.wr}% Calmar:${s3.calmar}`);
  console.log(`      Monthly R: Aug +${s3.rAug}R | Sep +${s3.rSep}R | Oct +${s3.rOct}R | Nov +${s3.rNov}R | Total: +${s3.totalR}R`);
}

fs.writeFileSync('top_trio_pairs.json', JSON.stringify(trioPairs.slice(0, 20).map(tp => ({
  match3Way: tp.match3Way,
  matchS1S2: tp.matchS1S2,
  matchS1S3: tp.matchS1S3,
  matchS2S3: tp.matchS2S3,
  s2: { sess: tp.s2.sess, bLen: tp.s2.bLen, bMult: tp.s2.bMult, off: tp.s2.off, tp: tp.s2.tp, sl: tp.s2.sl, cf: tp.s2.cf, trades: tp.s2.trades, wr: tp.s2.wr, calmar: tp.s2.calmar, rAug: tp.s2.rAug, rSep: tp.s2.rSep, rOct: tp.s2.rOct, rNov: tp.s2.rNov, totalR: tp.s2.totalR },
  s3: { sess: tp.s3.sess, bLen: tp.s3.bLen, bMult: tp.s3.bMult, off: tp.s3.off, tp: tp.s3.tp, sl: tp.s3.sl, cf: tp.s3.cf, trades: tp.s3.trades, wr: tp.s3.wr, calmar: tp.s3.calmar, rAug: tp.s3.rAug, rSep: tp.s3.rSep, rOct: tp.s3.rOct, rNov: tp.s3.rNov, totalR: tp.s3.totalR }
})), null, 2));

