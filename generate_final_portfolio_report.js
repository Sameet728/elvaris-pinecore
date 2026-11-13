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

const smaCache = {};
const stdevCache = {};
for (const len of [28, 30]) {
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

function runSim(opts) {
  const { bandLen, bandMult, offset, tp, sl, startHour, endHour, excludeH12 = false, crashFilterAtr = 1.25 } = opts;
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
      let exitPrice = 0;

      if (tradeType === 1) {
        const hitSl = low[i] <= entryPrice - sl;
        const hitTp = high[i] >= entryPrice + tp;
        if (hitSl && hitTp) { closed = true; profit = -sl; exitPrice = entryPrice - sl; }
        else if (hitSl) { closed = true; profit = -sl; exitPrice = entryPrice - sl; }
        else if (hitTp) { closed = true; profit = tp; exitPrice = entryPrice + tp; }
      } else if (tradeType === -1) {
        const hitSl = high[i] >= entryPrice + sl;
        const hitTp = low[i] <= entryPrice - tp;
        if (hitSl && hitTp) { closed = true; profit = -sl; exitPrice = entryPrice + sl; }
        else if (hitSl) { closed = true; profit = -sl; exitPrice = entryPrice + sl; }
        else if (hitTp) { closed = true; profit = tp; exitPrice = entryPrice - tp; }
      }

      if (closed) {
        trades.push({
          id: trades.length + 1,
          entryIndex,
          exitIndex: i,
          entryTime: time[entryIndex],
          exitTime: time[i],
          entryTimeStr: new Date(time[entryIndex]).toISOString().replace('T', ' ').substring(0, 19) + ' UTC',
          exitTimeStr: new Date(time[i]).toISOString().replace('T', ' ').substring(0, 19) + ' UTC',
          dir: tradeType === 1 ? 'LONG' : 'SHORT',
          entryPrice,
          exitPrice,
          profit,
          r: profit / sl,
          month: utcMonth[entryIndex]
        });
        if (profit <= 0) dayLossCount++;
        dayTradeCount++;
        inTrade = false;
      }
    }

    if (!inTrade) {
      const h = utcHour[i];
      const inSession = (h >= startHour && h <= endHour) && (!excludeH12 || h !== 12);
      const canTrade = dayLossCount < 1 && dayTradeCount < 2;
      const passCrash = crashFilterAtr <= 0 || close[i] >= (ema50[i] - crashFilterAtr * atr14[i]);
      const upper = sma[i] + bandMult * std[i];
      const lower = sma[i] - bandMult * std[i];

      const longSig = inSession && canTrade && passCrash &&
        (close[i] > ema200[i] + offset) &&
        (low[i] <= lower) &&
        (close[i] > open[i]) &&
        (rsi14[i] < 52);

      const shortSig = inSession && canTrade &&
        (close[i] < ema200[i]) &&
        (ema50[i] < ema200[i]) &&
        (high[i] >= upper) &&
        (close[i] < open[i]) &&
        (rsi14[i] > 50);

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

// STRATEGY 1: Tradeify Grandmaster Dual10R Oct8R
const s1Trades = runSim({
  bandLen: 28, bandMult: 2.1, offset: 4.0, tp: 14.0, sl: 13.75,
  startHour: 1, endHour: 20, excludeH12: true, crashFilterAtr: 1.25
});

// STRATEGY 2: Tradeify US Afternoon Reversal (NY Momentum)
const s2Trades = runSim({
  bandLen: 30, bandMult: 2.0, offset: 2.0, tp: 18.0, sl: 13.75,
  startHour: 14, endHour: 22, excludeH12: false, crashFilterAtr: 1.5
});

// STRATEGY 3: Tradeify London Core Expansion (TP16)
const s3Trades = runSim({
  bandLen: 28, bandMult: 2.1, offset: 3.0, tp: 16.0, sl: 13.75,
  startHour: 4, endHour: 20, excludeH12: true, crashFilterAtr: 1.25
});

function getStats(trades, name) {
  const total = trades.length;
  const wins = trades.filter(t => t.profit > 0).length;
  const losses = total - wins;
  const wr = (wins / total) * 100;
  const net = trades.reduce((a, t) => a + t.profit, 0);

  let peak = 0, running = 0, maxDD = 0;
  for (const t of trades) {
    running += t.profit;
    if (running > peak) peak = running;
    const dd = peak - running;
    if (dd > maxDD) maxDD = dd;
  }
  const calmar = maxDD > 0 ? net / maxDD : 999;
  const annCalmar = calmar * (365 / 96);

  const grossProfit = trades.filter(t => t.profit > 0).reduce((a, t) => a + t.profit, 0);
  const grossLoss = Math.abs(trades.filter(t => t.profit <= 0).reduce((a, t) => a + t.profit, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 999;

  const moR = { 7: 0, 8: 0, 9: 0, 10: 0 };
  const moWins = { 7: 0, 8: 0, 9: 0, 10: 0 };
  const moTrades = { 7: 0, 8: 0, 9: 0, 10: 0 };
  for (const t of trades) {
    moR[t.month] = (moR[t.month] || 0) + t.r;
    moTrades[t.month] = (moTrades[t.month] || 0) + 1;
    if (t.profit > 0) moWins[t.month] = (moWins[t.month] || 0) + 1;
  }

  return {
    name,
    total, wins, losses,
    wr: wr.toFixed(2),
    net: net.toFixed(2),
    totalR: (net / 13.75).toFixed(2),
    maxDD: maxDD.toFixed(2),
    calmar: calmar.toFixed(2),
    annCalmar: annCalmar.toFixed(2),
    profitFactor: profitFactor.toFixed(2),
    moR: {
      aug: moR[7].toFixed(2),
      sep: moR[8].toFixed(2),
      oct: moR[9].toFixed(2),
      nov: moR[10].toFixed(2)
    },
    moWins,
    moTrades,
    recent5: trades.slice(-5)
  };
}

const s1Stats = getStats(s1Trades, "Strategy 1: Tradeify Grandmaster Dual10R Oct8R");
const s2Stats = getStats(s2Trades, "Strategy 2: Tradeify US Afternoon Reversal");
const s3Stats = getStats(s3Trades, "Strategy 3: Tradeify London Core Expansion");

// Overlap audit
const s1Times = new Set(s1Trades.map(t => t.entryTime));
const s2Times = new Set(s2Trades.map(t => t.entryTime));
const s3Times = new Set(s3Trades.map(t => t.entryTime));

let m12 = 0, m13 = 0, m23 = 0, m123 = 0;
for (const t of s2Trades) {
  if (s1Times.has(t.entryTime)) m12++;
  if (s3Times.has(t.entryTime)) {
    m23++;
    if (s1Times.has(t.entryTime)) m123++;
  }
}
for (const t of s3Trades) {
  if (s1Times.has(t.entryTime)) m13++;
}

const reportData = {
  s1: s1Stats,
  s2: s2Stats,
  s3: s3Stats,
  overlap: {
    totalTrades: { s1: s1Trades.length, s2: s2Trades.length, s3: s3Trades.length, portfolioTotal: s1Trades.length + s2Trades.length + s3Trades.length },
    matchesS1S2: m12,
    uniqueS1vsS2: s1Trades.length - m12,
    uniqueS2vsS1: s2Trades.length - m12,
    matchesS1S3: m13,
    uniqueS1vsS3: s1Trades.length - m13,
    uniqueS3vsS1: s3Trades.length - m13,
    matchesS2S3: m23,
    uniqueS2vsS3: s2Trades.length - m23,
    uniqueS3vsS2: s3Trades.length - m23,
    threeWaySimultaneousMatches: m123,
    independentPortfolioExecutions: (s1Trades.length + s2Trades.length + s3Trades.length) - (m123 * 3)
  }
};

fs.writeFileSync('final_portfolio_report.json', JSON.stringify(reportData, null, 2));

console.log('=== FINAL AUDIT REPORT DATA GENERATED ===');
console.log(JSON.stringify(reportData, null, 2));
