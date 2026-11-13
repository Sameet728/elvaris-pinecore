const fs = require('fs');

// Load Strategy 1 entries
const s1Script = fs.readFileSync('15M_Champion_Strategies/Champion_15M_Grandmaster_Dual10R_Oct8R_STRATEGY.pine', 'utf8');
const xauCandles = JSON.parse(fs.readFileSync('monkalgo_strategies/data/xauusd_15m.json', 'utf8'));

// Helper for TA
function buildData(raw) {
  const n = raw.length;
  const open = new Float64Array(n);
  const high = new Float64Array(n);
  const low = new Float64Array(n);
  const close = new Float64Array(n);
  const time = new Float64Array(n);
  const utcHour = new Int32Array(n);
  const utcDay = new Int32Array(n);
  const utcMonth = new Int32Array(n);

  for (let i = 0; i < n; i++) {
    open[i] = raw[i].open;
    high[i] = raw[i].high;
    low[i] = raw[i].low;
    close[i] = raw[i].close;
    const t = raw[i].openTime || raw[i].time;
    time[i] = t;
    const dt = new Date(t);
    utcHour[i] = dt.getUTCHours();
    utcDay[i] = dt.getUTCDate();
    utcMonth[i] = dt.getUTCMonth();
  }

  function calcEMA(len) {
    const out = new Float64Array(n);
    const alpha = 2 / (len + 1);
    let val = close[0];
    out[0] = val;
    for (let i = 1; i < n; i++) {
      val = alpha * close[i] + (1 - alpha) * val;
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
    const hl = high[i] - low[i];
    const hc = Math.abs(high[i] - close[i - 1]);
    const lc = Math.abs(low[i] - close[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
  }
  const atr14 = calcRMA(tr, 14);

  function calcSMA(len) {
    const out = new Float64Array(n);
    let sum = 0;
    for (let i = 0; i < len; i++) sum += close[i];
    out[len - 1] = sum / len;
    for (let i = len; i < n; i++) {
      sum += close[i] - close[i - len];
      out[i] = sum / len;
    }
    return out;
  }

  function calcStDev(len, sma) {
    const out = new Float64Array(n);
    for (let i = len - 1; i < n; i++) {
      let v = 0;
      const m = sma[i];
      for (let j = i - len + 1; j <= i; j++) {
        const d = close[j] - m;
        v += d * d;
      }
      out[i] = Math.sqrt(v / len);
    }
    return out;
  }

  function calcRSI(len) {
    const rsi = new Float64Array(n);
    const up = new Float64Array(n);
    const dn = new Float64Array(n);
    for (let i = 1; i < n; i++) {
      const diff = close[i] - close[i - 1];
      up[i] = diff > 0 ? diff : 0;
      dn[i] = diff < 0 ? -diff : 0;
    }
    const rmaUp = calcRMA(up, len);
    const rmaDn = calcRMA(dn, len);
    for (let i = len; i < n; i++) {
      const u = rmaUp[i];
      const d = rmaDn[i];
      rsi[i] = d === 0 ? 100 : 100 - (100 / (1 + u / d));
    }
    return rsi;
  }

  function calcHighest(len) {
    const out = new Float64Array(n);
    for (let i = len - 1; i < n; i++) {
      let m = -Infinity;
      for (let j = i - len + 1; j <= i; j++) if (high[j] > m) m = high[j];
      out[i] = m;
    }
    return out;
  }

  function calcLowest(len) {
    const out = new Float64Array(n);
    for (let i = len - 1; i < n; i++) {
      let m = Infinity;
      for (let j = i - len + 1; j <= i; j++) if (low[j] < m) m = low[j];
      out[i] = m;
    }
    return out;
  }

  return {
    n, raw, open, high, low, close, time, utcHour, utcDay, utcMonth,
    calcEMA, calcRMA, calcSMA, calcStDev, calcRSI, calcHighest, calcLowest,
    atr14, tr
  };
}

console.log('Building datasets...');
const dsXAU = buildData(xauCandles);
const dsNAS = buildData(JSON.parse(fs.readFileSync('monkalgo_strategies/data/nas100_15m.json', 'utf8')));
const dsSPX = buildData(JSON.parse(fs.readFileSync('monkalgo_strategies/data/spx500_15m.json', 'utf8')));
const dsEUR = buildData(JSON.parse(fs.readFileSync('monkalgo_strategies/data/eurusd_15m.json', 'utf8')));

// Universal Tradeify Simulator
function simulate(ds, longCond, shortCond, tp, sl, maxTrades = 2, maxLoss = 1) {
  let curDay = -1;
  let dayTradeCount = 0;
  let dayLossCount = 0;

  let inTrade = false;
  let tradeType = 0;
  let entryPrice = 0;
  let entryIndex = 0;

  const trades = [];

  for (let i = 200; i < ds.n; i++) {
    const day = ds.utcDay[i];
    if (day !== curDay) {
      curDay = day;
      dayTradeCount = 0;
      dayLossCount = 0;
    }

    if (inTrade) {
      let closed = false;
      let profit = 0;

      if (tradeType === 1) { // Long
        const hitSl = ds.low[i] <= entryPrice - sl;
        const hitTp = ds.high[i] >= entryPrice + tp;
        if (hitSl && hitTp) {
          closed = true; profit = -sl;
        } else if (hitSl) {
          closed = true; profit = -sl;
        } else if (hitTp) {
          closed = true; profit = tp;
        }
      } else if (tradeType === -1) { // Short
        const hitSl = ds.high[i] >= entryPrice + sl;
        const hitTp = ds.low[i] <= entryPrice - tp;
        if (hitSl && hitTp) {
          closed = true; profit = -sl;
        } else if (hitSl) {
          closed = true; profit = -sl;
        } else if (hitTp) {
          closed = true; profit = tp;
        }
      }

      if (closed) {
        trades.push({
          entryIndex,
          exitIndex: i,
          entryTime: ds.time[entryIndex],
          exitTime: ds.time[i],
          month: ds.utcMonth[entryIndex],
          profit,
          r: profit / sl
        });
        if (profit <= 0) dayLossCount++;
        dayTradeCount++;
        inTrade = false;
      }
    }

    if (!inTrade) {
      const canTrade = dayLossCount < maxLoss && dayTradeCount < maxTrades;
      if (canTrade) {
        if (longCond[i]) {
          inTrade = true;
          tradeType = 1;
          entryPrice = ds.close[i];
          entryIndex = i;
        } else if (shortCond[i]) {
          inTrade = true;
          tradeType = -1;
          entryPrice = ds.close[i];
          entryIndex = i;
        }
      }
    }
  }

  if (trades.length < 15) return null;

  const wins = trades.filter(t => t.profit > 0).length;
  const wr = (wins / trades.length) * 100;
  const net = trades.reduce((acc, t) => acc + t.profit, 0);

  let peak = 0, running = 0, maxDD = 0;
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
    tradesList: trades
  };
}

// Get S1 entry timestamps for overlap comparison
const s1Entries = JSON.parse(fs.readFileSync('s1_entries.json', 'utf8')).timestamps;
const s1Set = new Set(s1Entries);

console.log(`Loaded ${s1Set.size} Strategy 1 baseline entry timestamps.`);

module.exports = {
  dsXAU, dsNAS, dsSPX, dsEUR, simulate, s1Set
};
