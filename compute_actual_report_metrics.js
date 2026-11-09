const fs = require('fs');

const candlesRaw = JSON.parse(
  fs.readFileSync('C:/Users/samee/Desktop/Pine/pine-backtester-nextjs/public/data/xauusd_15m.json', 'utf8')
);

// We have the 3 strategies:
// S1: Len 28, Mult 2.1, TP 14.0, SL 13.75, Offset 4.0, Filter 1.25, Hours 1-20 excl 12
// S2: Len 30, Mult 2.0, TP 18.0, SL 13.75, Offset 2.0, Filter 1.50, Hours 14-22
// S3: Len 28, Mult 2.1, TP 16.0, SL 13.75, Offset 3.0, Filter 1.25, Hours 4-20 excl 12

function calculateSMA(data, period) {
  const res = new Float64Array(data.length);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    if (i >= period) sum -= data[i - period];
    res[i] = i >= period - 1 ? sum / period : NaN;
  }
  return res;
}

function calculateEMA(data, period) {
  const res = new Float64Array(data.length);
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i];
  let prev = sum / period;
  res[period - 1] = prev;
  for (let i = period; i < data.length; i++) {
    prev = data[i] * k + prev * (1 - k);
    res[i] = prev;
  }
  return res;
}

function calculateRMA(data, period) {
  const res = new Float64Array(data.length);
  const alpha = 1 / period;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i];
  let prev = sum / period;
  res[period - 1] = prev;
  for (let i = period; i < data.length; i++) {
    prev = data[i] * alpha + prev * (1 - alpha);
    res[i] = prev;
  }
  return res;
}

function calculateATR(high, low, close, period = 14) {
  const tr = new Float64Array(close.length);
  tr[0] = high[0] - low[0];
  for (let i = 1; i < close.length; i++) {
    const hl = high[i] - low[i];
    const hc = Math.abs(high[i] - close[i - 1]);
    const lc = Math.abs(low[i] - close[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
  }
  return calculateRMA(tr, period);
}

function calculateRSI(close, period = 14) {
  const gains = new Float64Array(close.length);
  const losses = new Float64Array(close.length);
  for (let i = 1; i < close.length; i++) {
    const diff = close[i] - close[i - 1];
    if (diff > 0) gains[i] = diff;
    else losses[i] = -diff;
  }
  const avgG = calculateRMA(gains, period);
  const avgL = calculateRMA(losses, period);
  const rsi = new Float64Array(close.length);
  for (let i = period; i < close.length; i++) {
    if (avgL[i] === 0) rsi[i] = 100;
    else {
      const rs = avgG[i] / avgL[i];
      rsi[i] = 100 - (100 / (1 + rs));
    }
  }
  return rsi;
}

function calculateBB(close, period, mult) {
  const sma = calculateSMA(close, period);
  const upper = new Float64Array(close.length);
  const lower = new Float64Array(close.length);
  for (let i = period - 1; i < close.length; i++) {
    let sumSq = 0;
    for (let j = 0; j < period; j++) {
      const d = close[i - j] - sma[i];
      sumSq += d * d;
    }
    const std = Math.sqrt(sumSq / period);
    upper[i] = sma[i] + mult * std;
    lower[i] = sma[i] - mult * std;
  }
  return { sma, upper, lower };
}

const n = candlesRaw.length;
const open = new Float64Array(n);
const high = new Float64Array(n);
const low = new Float64Array(n);
const close = new Float64Array(n);
const time = new Float64Array(n);
const utcHour = new Int32Array(n);
const utcDay = new Int32Array(n);
const utcMonth = new Int32Array(n);

for (let i = 0; i < n; i++) {
  open[i] = candlesRaw[i].open;
  high[i] = candlesRaw[i].high;
  low[i] = candlesRaw[i].low;
  close[i] = candlesRaw[i].close;
  time[i] = candlesRaw[i].openTime;
  const d = new Date(time[i]);
  utcHour[i] = d.getUTCHours();
  utcDay[i] = d.getUTCDate();
  utcMonth[i] = d.getUTCMonth(); // 7=Aug, 8=Sep, 9=Oct, 10=Nov
}

const ema50 = calculateEMA(close, 50);
const ema200 = calculateEMA(close, 200);
const atr = calculateATR(high, low, close, 14);
const rsi = calculateRSI(close, 14);

function runBacktest(cfg) {
  const bb = calculateBB(close, cfg.bandLen, cfg.bandMult);
  const trades = [];
  let inPos = false;
  let posType = 0; // 1=Long, -1=Short
  let ep = 0;
  let entryBar = 0;
  let tpP = 0;
  let slP = 0;

  let curDay = -1;
  let dayTrades = 0;
  let dayLosses = 0;

  for (let i = 200; i < n - 1; i++) {
    const dNum = utcDay[i];
    if (dNum !== curDay) {
      curDay = dNum;
      dayTrades = 0;
      dayLosses = 0;
    }

    // Check exit
    if (inPos) {
      if (posType === 1) {
        if (high[i] >= tpP) {
          trades.push({ type: 'LONG', ep, exitP: tpP, isWin: true, profitR: cfg.tp / cfg.sl, month: utcMonth[i], bar: i, exitTime: time[i] });
          inPos = false;
        } else if (low[i] <= slP) {
          trades.push({ type: 'LONG', ep, exitP: slP, isWin: false, profitR: -1.0, month: utcMonth[i], bar: i, exitTime: time[i] });
          dayLosses++;
          inPos = false;
        }
      } else {
        if (low[i] <= tpP) {
          trades.push({ type: 'SHORT', ep, exitP: tpP, isWin: true, profitR: cfg.tp / cfg.sl, month: utcMonth[i], bar: i, exitTime: time[i] });
          inPos = false;
        } else if (high[i] >= slP) {
          trades.push({ type: 'SHORT', ep, exitP: slP, isWin: false, profitR: -1.0, month: utcMonth[i], bar: i, exitTime: time[i] });
          dayLosses++;
          inPos = false;
        }
      }
    }

    if (!inPos) {
      const canTrade = dayLosses < 1 && dayTrades < 2;
      const h = utcHour[i];
      let inSession = h >= cfg.startH && h <= cfg.endH;
      if (cfg.excl12 && h === 12) inSession = false;

      const crashOk = close[i] >= ema50[i] - cfg.crashAtr * atr[i];
      const longSig = inSession && canTrade && crashOk && close[i] > ema200[i] + cfg.offset && low[i] <= bb.lower[i] && close[i] > open[i] && rsi[i] < cfg.rsiLong;
      const shortSig = inSession && canTrade && close[i] < ema200[i] && ema50[i] < ema200[i] && high[i] >= bb.upper[i] && close[i] < open[i] && rsi[i] > cfg.rsiShort;

      if (longSig) {
        inPos = true;
        posType = 1;
        ep = close[i];
        tpP = ep + cfg.tp;
        slP = ep - cfg.sl;
        entryBar = i;
        dayTrades++;
      } else if (shortSig) {
        inPos = true;
        posType = -1;
        ep = close[i];
        tpP = ep - cfg.tp;
        slP = ep + cfg.sl;
        entryBar = i;
        dayTrades++;
      }
    }
  }

  return trades;
}

const s1Trades = runBacktest({ bandLen: 28, bandMult: 2.1, tp: 14.0, sl: 13.75, offset: 4.0, crashAtr: 1.25, startH: 1, endH: 20, excl12: true, rsiLong: 52, rsiShort: 50 });
const s2Trades = runBacktest({ bandLen: 30, bandMult: 2.0, tp: 18.0, sl: 13.75, offset: 2.0, crashAtr: 1.50, startH: 14, endH: 22, excl12: false, rsiLong: 52, rsiShort: 50 });
const s3Trades = runBacktest({ bandLen: 28, bandMult: 2.1, tp: 16.0, sl: 13.75, offset: 3.0, crashAtr: 1.25, startH: 4, endH: 20, excl12: true, rsiLong: 52, rsiShort: 50 });

function analyze(name, trades, tp, sl) {
  const total = trades.length;
  const wins = trades.filter(t => t.isWin).length;
  const losses = total - wins;
  const winRate = ((wins / total) * 100).toFixed(2);
  const longTrades = trades.filter(t => t.type === 'LONG');
  const shortTrades = trades.filter(t => t.type === 'SHORT');

  const longWins = longTrades.filter(t => t.isWin).length;
  const shortWins = shortTrades.filter(t => t.isWin).length;
  const longPnl = longTrades.reduce((acc, t) => acc + t.profitR, 0);
  const shortPnl = shortTrades.reduce((acc, t) => acc + t.profitR, 0);
  const totPnl = trades.reduce((acc, t) => acc + t.profitR, 0);

  const grossProfit = wins * (tp / sl);
  const grossLoss = losses * 1.0;
  const pf = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : '99.0';

  // Monthly breakdown (Aug=7, Sep=8, Oct=9, Nov=10)
  const augTrades = trades.filter(t => t.month === 7);
  const sepTrades = trades.filter(t => t.month === 8);
  const octTrades = trades.filter(t => t.month === 9);
  const novTrades = trades.filter(t => t.month === 10);

  const augPnl = augTrades.reduce((acc, t) => acc + t.profitR, 0);
  const sepPnl = sepTrades.reduce((acc, t) => acc + t.profitR, 0);
  const octPnl = octTrades.reduce((acc, t) => acc + t.profitR, 0);
  const novPnl = novTrades.reduce((acc, t) => acc + t.profitR, 0);

  let curWins = 0, maxWins = 0, curLoss = 0, maxLoss = 0;
  for (const t of trades) {
    if (t.isWin) {
      curWins++;
      curLoss = 0;
      if (curWins > maxWins) maxWins = curWins;
    } else {
      curLoss++;
      curWins = 0;
      if (curLoss > maxLoss) maxLoss = curLoss;
    }
  }

  return {
    name,
    total,
    wins,
    losses,
    winRate: winRate + '%',
    totPnl: totPnl.toFixed(2) + 'R',
    pf,
    maxWins,
    maxLoss,
    long: {
      trades: `${longTrades.length} (${((longTrades.length / total) * 100).toFixed(1)}%)`,
      pnl: `+${longPnl.toFixed(2)}R`,
      winRate: `${((longWins / longTrades.length) * 100).toFixed(2)}%`,
      pf: pf
    },
    short: {
      trades: `${shortTrades.length} (${((shortTrades.length / total) * 100).toFixed(1)}%)`,
      pnl: `${shortPnl >= 0 ? '+' : ''}${shortPnl.toFixed(2)}R`,
      winRate: shortTrades.length > 0 ? `${((shortWins / shortTrades.length) * 100).toFixed(2)}%` : '0%',
      pf: pf
    },
    months: {
      aug: { cnt: augTrades.length, pnl: Number(augPnl.toFixed(2)) },
      sep: { cnt: sepTrades.length, pnl: Number(sepPnl.toFixed(2)) },
      oct: { cnt: octTrades.length, pnl: Number(octPnl.toFixed(2)) },
      nov: { cnt: novTrades.length, pnl: Number(novPnl.toFixed(2)) },
    }
  };
}

console.log(JSON.stringify({
  s1: analyze('PS-01 Grandmaster', s1Trades, 14.0, 13.75),
  s2: analyze('PS-02 US Afternoon Reversal', s2Trades, 18.0, 13.75),
  s3: analyze('PS-03 London Core Expansion', s3Trades, 16.0, 13.75),
}, null, 2));

