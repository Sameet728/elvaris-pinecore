const fs = require('fs');

const candles = JSON.parse(fs.readFileSync('pine-backtester-nextjs/public/data/xauusd_15m.json', 'utf8'));
const N = candles.length;
console.log(`Loaded ${N} candles.`);

// Helper: Fast EMA
function calcEMA(len) {
  const ema = new Float64Array(N);
  const k = 2 / (len + 1);
  let s = 0;
  for (let i = 0; i < len; i++) s += candles[i].close;
  ema[len - 1] = s / len;
  for (let i = len; i < N; i++) ema[i] = candles[i].close * k + ema[i - 1] * (1 - k);
  return ema;
}

// Helper: Fast SMA
function calcSMA(len) {
  const sma = new Float64Array(N);
  let s = 0;
  for (let i = 0; i < len; i++) s += candles[i].close;
  sma[len - 1] = s / len;
  for (let i = len; i < N; i++) {
    s += candles[i].close - candles[i - len].close;
    sma[i] = s / len;
  }
  return sma;
}

// Helper: Fast StDev
function calcStDev(len, sma) {
  const sd = new Float64Array(N);
  for (let i = len - 1; i < N; i++) {
    let v = 0;
    const m = sma[i];
    for (let j = 0; j < len; j++) {
      const d = candles[i - j].close - m;
      v += d * d;
    }
    sd[i] = Math.sqrt(v / len);
  }
  return sd;
}

// Helper: Fast RSI
function calcRSI(len = 14) {
  const rsi = new Float64Array(N);
  let g = 0, l = 0;
  for (let i = 1; i <= len; i++) {
    const d = candles[i].close - candles[i - 1].close;
    if (d > 0) g += d; else l -= d;
  }
  let ag = g / len, al = l / len;
  rsi[len] = al === 0 ? 100 : 100 - (100 / (1 + ag / al));
  for (let i = len + 1; i < N; i++) {
    const d = candles[i].close - candles[i - 1].close;
    ag = (ag * (len - 1) + (d > 0 ? d : 0)) / len;
    al = (al * (len - 1) + (d < 0 ? -d : 0)) / len;
    rsi[i] = al === 0 ? 100 : 100 - (100 / (1 + ag / al));
  }
  return rsi;
}

// Helper: Fast ATR
function calcATR(len = 14) {
  const tr = new Float64Array(N);
  tr[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < N; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  const atr = new Float64Array(N);
  let s = 0;
  for (let i = 0; i < len; i++) s += tr[i];
  atr[len - 1] = s / len;
  for (let i = len; i < N; i++) {
    atr[i] = (atr[i - 1] * (len - 1) + tr[i]) / len;
  }
  return atr;
}

const ema20 = calcEMA(20);
const ema50 = calcEMA(50);
const ema200 = calcEMA(200);
const rsi14 = calcRSI(14);
const atr14 = calcATR(14);

// Evaluate a signals array with exact monthly R requirements
function evaluateStrategy(signals, tp, sl) {
  let wins = 0, losses = 0, inPos = false, posType = null, ep = 0, slP = 0, tpP = 0, epIdx = 0;
  const trades = [];
  let peak = 0, maxDD = 0, runningPnl = 0;

  const months = {
    '2026-08': { trades: 0, wins: 0, r: 0, cash: 0 },
    '2026-09': { trades: 0, wins: 0, r: 0, cash: 0 },
    '2026-10': { trades: 0, wins: 0, r: 0, cash: 0 },
    '2026-11': { trades: 0, wins: 0, r: 0, cash: 0 }
  };

  for (let i = 200; i < N; i++) {
    const c = candles[i];
    if (inPos) {
      let closed = false, pnl = 0, isWin = false;
      if (posType === 'LONG') {
        if (c.low <= slP) {
          losses++;
          pnl = slP - ep;
          isWin = false;
          closed = true;
        } else if (c.high >= tpP) {
          wins++;
          pnl = tpP - ep;
          isWin = true;
          closed = true;
        }
      } else {
        if (c.high >= slP) {
          losses++;
          pnl = ep - slP;
          isWin = false;
          closed = true;
        } else if (c.low <= tpP) {
          wins++;
          pnl = ep - tpP;
          isWin = true;
          closed = true;
        }
      }

      if (closed) {
        runningPnl += pnl;
        if (runningPnl > peak) peak = runningPnl;
        const dd = peak - runningPnl;
        if (dd > maxDD) maxDD = dd;

        const tradeObj = {
          type: posType,
          win: isWin,
          pnl,
          entryTime: candles[epIdx].openTime,
          exitTime: c.openTime
        };
        trades.push(tradeObj);

        const dt = new Date(tradeObj.entryTime);
        const mKey = dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0');
        if (months[mKey]) {
          months[mKey].trades++;
          if (isWin) months[mKey].wins++;
          months[mKey].cash += pnl;
          months[mKey].r += (pnl / sl);
        }
        inPos = false;
      }
    }

    if (!inPos && signals[i]) {
      inPos = true;
      posType = signals[i];
      ep = c.close;
      epIdx = i;
      if (posType === 'LONG') {
        tpP = ep + tp;
        slP = ep - sl;
      } else {
        tpP = ep - tp;
        slP = ep + sl;
      }
    }
  }

  const total = wins + losses;
  if (total < 25) return null; // Need sufficient sample size across 3.2 months
  const winRate = (wins / total) * 100;
  const netProfit = runningPnl;
  const calmar = maxDD > 0 ? netProfit / maxDD : 0;

  const augR = months['2026-08'].r;
  const sepR = months['2026-09'].r;
  const octR = months['2026-10'].r;
  const novR = months['2026-11'].r;

  return {
    total,
    wins,
    losses,
    winRate,
    netProfit,
    maxDD,
    calmar,
    augR,
    sepR,
    octR,
    novR,
    months,
    trades
  };
}

module.exports = {
  candles, N,
  calcEMA, calcSMA, calcStDev, calcRSI, calcATR,
  ema20, ema50, ema200, rsi14, atr14,
  evaluateStrategy
};

