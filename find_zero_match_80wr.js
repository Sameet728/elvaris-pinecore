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
const ema50 = calcEMA(close, 50);
const ema200 = calcEMA(close, 200);

// Precompute SMAs and StDevs for lengths 14..50
const smaCache = {};
const stdevCache = {};
const allLengths = [16, 18, 20, 22, 24, 25, 26, 30, 32, 34, 36, 40, 45, 50];
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

// Fast simulation function
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

const sessionConfigs = [
  // Session non-overlapping with S1 (S1 is 01:00-20:00 UTC)
  // What about US late & Asian session: 20:00 to 01:00 UTC?
  { name: 'LateUS_Asian_20_01', s: 20, e: 1, ex12: false },
  // What about Asian morning session: 00:00 to 08:00 UTC?
  { name: 'Asia_00_08', s: 0, e: 8, ex12: false },
  // What about Asian-London bridge: 01:00 to 11:00 UTC?
  { name: 'Asia_Lon_01_11', s: 1, e: 11, ex12: false },
  // What about US Exclusive Hours: 12:00 to 23:00 UTC?
  { name: 'US_12_23', s: 12, e: 23, ex12: false },
  { name: 'US_13_23', s: 13, e: 23, ex12: false },
  { name: 'US_14_23', s: 14, e: 23, ex12: false },
  { name: 'US_15_23', s: 15, e: 23, ex12: false },
  // Broad session but different length:
  { name: 'Full_01_22_ex12', s: 1, e: 22, ex12: true },
  { name: 'Lon_06_21_ex12', s: 6, e: 21, ex12: true },
  { name: 'Lon_07_22_ex12', s: 7, e: 22, ex12: true }
];

const results = [];

for (const sc of sessionConfigs) {
  for (const bLen of allLengths) {
    for (const bMult of [1.9, 2.0, 2.1, 2.2, 2.25, 2.3]) {
      for (const off of [1.5, 2.5, 3.5, 4.5, 5.5]) {
        for (const tp of [14.0, 15.0, 16.0, 17.0, 18.0]) {
          for (const sl of [13.75, 14.50]) {
            for (const cf of [1.1, 1.25, 1.35, 1.5]) {
              const tr = fastSim({
                bandLen: bLen,
                bandMult: bMult,
                offset: off,
                tp,
                sl,
                maxDailyTrades: 2,
                maxDailyLosses: 1,
                startHour: sc.s,
                endHour: sc.e,
                excludeH12: sc.ex12,
                crashFilterAtr: cf
              });

              if (tr.length < 22) continue;
              const ev = evaluate(tr);
              if (!ev) continue;

              // We want high win rate and CALMAR > 4.0
              if (ev.wr >= 79.5 && ev.calmar >= 4.0) {
                results.push({
                  sess: sc.name,
                  bLen,
                  bMult,
                  off,
                  tp,
                  sl,
                  cf,
                  ev
                });
              }
            }
          }
        }
      }
    }
  }
}

console.log(`Grid completed. Found ${results.length} setups with WR >= 79.5% and Calmar >= 4.0.`);

// Group by exactS1Matches: 0, 1, 2, 3..
const exact0 = results.filter(r => r.ev.exactS1Matches === 0);
const exact1to3 = results.filter(r => r.ev.exactS1Matches >= 1 && r.ev.exactS1Matches <= 3);
const exact4to8 = results.filter(r => r.ev.exactS1Matches >= 4 && r.ev.exactS1Matches <= 8);

console.log(`• EXACTLY 0 matching trades with S1: ${exact0.length}`);
console.log(`• 1 to 3 matching trades with S1: ${exact1to3.length}`);
console.log(`• 4 to 8 matching trades with S1: ${exact4to8.length}`);

// Print top 10 for EXACT 0
console.log('\n--- TOP CANDIDATES WITH EXACTLY 0 S1 MATCHES ---');
exact0.sort((a, b) => b.ev.net - a.ev.net);
for (let i = 0; i < Math.min(10, exact0.length); i++) {
  const r = exact0[i];
  const ev = r.ev;
  console.log(`${i + 1}. [${r.sess}] Len:${r.bLen} Mult:${r.bMult} Off:${r.off} TP:${r.tp} SL:${r.sl} CF:${r.cf}`);
  console.log(`   Trades:${ev.trades} WR:${ev.wr.toFixed(1)}% Calmar:${ev.calmar.toFixed(1)} DD:$${ev.maxDD} Matches:${ev.exactS1Matches}`);
  console.log(`   Monthly R: Aug +${ev.moR[7].toFixed(1)}R | Sep +${ev.moR[8].toFixed(1)}R | Oct +${ev.moR[9].toFixed(1)}R | Nov +${ev.moR[10].toFixed(1)}R | Total: +${(ev.net / r.sl).toFixed(1)}R`);
}

// Print top 10 for 1-3 Matches
console.log('\n--- TOP CANDIDATES WITH 1 TO 3 S1 MATCHES (Near Zero Overlap) ---');
exact1to3.sort((a, b) => b.ev.net - a.ev.net);
for (let i = 0; i < Math.min(10, exact1to3.length); i++) {
  const r = exact1to3[i];
  const ev = r.ev;
  console.log(`${i + 1}. [${r.sess}] Len:${r.bLen} Mult:${r.bMult} Off:${r.off} TP:${r.tp} SL:${r.sl} CF:${r.cf}`);
  console.log(`   Trades:${ev.trades} WR:${ev.wr.toFixed(1)}% Calmar:${ev.calmar.toFixed(1)} DD:$${ev.maxDD} Matches:${ev.exactS1Matches}`);
  console.log(`   Monthly R: Aug +${ev.moR[7].toFixed(1)}R | Sep +${ev.moR[8].toFixed(1)}R | Oct +${ev.moR[9].toFixed(1)}R | Nov +${ev.moR[10].toFixed(1)}R | Total: +${(ev.net / r.sl).toFixed(1)}R`);
}

// Print top 10 for 4-8 Matches
console.log('\n--- TOP CANDIDATES WITH 4 TO 8 S1 MATCHES (Low Overlap) ---');
exact4to8.sort((a, b) => b.ev.net - a.ev.net);
for (let i = 0; i < Math.min(10, exact4to8.length); i++) {
  const r = exact4to8[i];
  const ev = r.ev;
  console.log(`${i + 1}. [${r.sess}] Len:${r.bLen} Mult:${r.bMult} Off:${r.off} TP:${r.tp} SL:${r.sl} CF:${r.cf}`);
  console.log(`   Trades:${ev.trades} WR:${ev.wr.toFixed(1)}% Calmar:${ev.calmar.toFixed(1)} DD:$${ev.maxDD} Matches:${ev.exactS1Matches}`);
  console.log(`   Monthly R: Aug +${ev.moR[7].toFixed(1)}R | Sep +${ev.moR[8].toFixed(1)}R | Oct +${ev.moR[9].toFixed(1)}R | Nov +${ev.moR[10].toFixed(1)}R | Total: +${(ev.net / r.sl).toFixed(1)}R`);
}

fs.writeFileSync('all_decorrelated_matches.json', JSON.stringify({ exact0, exact1to3, exact4to8 }, null, 2));

