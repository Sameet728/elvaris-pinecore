const fs = require('fs');

const candles = JSON.parse(fs.readFileSync('pine-backtester-nextjs/public/data/xauusd_15m.json', 'utf8'));
const N = candles.length;

// Get official trades from S1
async function getParityEngine() {
  const code = fs.readFileSync('15M_Champion_Strategies/Champion_15M_Grandmaster_Dual10R_Oct8R_STRATEGY.pine', 'utf8');
  const res = await fetch('http://127.0.0.1:3005/api/backtest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script: code, datasetName: 'xauusd_15m', symbol: 'FOREXCOM:XAUUSD', timeframe: '15' })
  });
  const d = await res.json();
  const officialTrades = d.result.trades;
  console.log(`Official S1 Trades: ${officialTrades.length}`);

  // Now let's implement pure JS simulator to match 100%
  function calcEMA(len) {
    const ema = new Float64Array(N);
    const k = 2 / (len + 1);
    let s = 0;
    for (let i = 0; i < len; i++) s += candles[i].close;
    ema[len - 1] = s / len;
    for (let i = len; i < N; i++) ema[i] = candles[i].close * k + ema[i - 1] * (1 - k);
    return ema;
  }
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

  const ema50 = calcEMA(50);
  const ema200 = calcEMA(200);
  const rsi14 = calcRSI(14);
  const atr14 = calcATR(14);
  const sma28 = calcSMA(28);
  const sd28 = calcStDev(28, sma28);

  // Exact Pine Script execution loop
  let pos = 0; // 0=flat, 1=long, -1=short
  let ep = 0, slP = 0, tpP = 0, entryIdx = 0;
  let dayTrades = 0, dayLosses = 0, curDay = -1;
  const myTrades = [];

  for (let i = 200; i < N; i++) {
    const c = candles[i];
    const d = new Date(c.openTime);
    const day = d.getUTCDate();
    const h = d.getUTCHours();

    if (day !== curDay) {
      curDay = day;
      dayTrades = 0;
      dayLosses = 0;
    }

    // 1. Evaluate open position exit on current bar
    if (pos === 1) {
      if (c.low <= slP) {
        myTrades.push({ type: 'LONG', win: false, pnl: slP - ep, entryIdx, exitIdx: i, time: candles[entryIdx].openTime });
        dayLosses++;
        pos = 0;
      } else if (c.high >= tpP) {
        myTrades.push({ type: 'LONG', win: true, pnl: tpP - ep, entryIdx, exitIdx: i, time: candles[entryIdx].openTime });
        pos = 0;
      }
    } else if (pos === -1) {
      if (c.high >= slP) {
        myTrades.push({ type: 'SHORT', win: false, pnl: ep - slP, entryIdx, exitIdx: i, time: candles[entryIdx].openTime });
        dayLosses++;
        pos = 0;
      } else if (c.low <= tpP) {
        myTrades.push({ type: 'SHORT', win: true, pnl: ep - tpP, entryIdx, exitIdx: i, time: candles[entryIdx].openTime });
        pos = 0;
      }
    }

    // 2. Evaluate entry on confirmed bar close
    if (pos === 0) {
      const inSession = (h >= 1 && h <= 20) && (h !== 12);
      const canTrade = dayLossCount_check(dayLosses, dayTrades);
      const passCrash = c.close >= (ema50[i] - 1.25 * atr14[i]);
      const upper = sma28[i] + 2.1 * sd28[i];
      const lower = sma28[i] - 2.1 * sd28[i];

      const longSig = inSession && canTrade && passCrash && c.close > (ema200[i] + 4.0) && c.low <= lower && c.close > c.open && rsi14[i] < 52;
      const shortSig = inSession && canTrade && c.close < ema200[i] && ema50[i] < ema200[i] && c.high >= upper && c.close < c.open && rsi14[i] > 50;

      if (longSig) {
        pos = 1;
        ep = c.close;
        slP = ep - 13.75;
        tpP = ep + 14.0;
        entryIdx = i;
        dayTrades++;
      } else if (shortSig) {
        pos = -1;
        ep = c.close;
        slP = ep + 13.75;
        tpP = ep - 14.0;
        entryIdx = i;
        dayTrades++;
      }
    }
  }

  function dayLossCount_check(l, t) {
    return l < 1 && t < 2;
  }

  console.log(`My JS Sim Trades: ${myTrades.length}`);
  let match = 0;
  for (let i = 0; i < Math.min(myTrades.length, officialTrades.length); i++) {
    if (Math.abs(myTrades[i].time - officialTrades[i].entryTime) < 60000) match++;
  }
  console.log(`Matched with official API: ${match}/${officialTrades.length} trades!`);
}

getParityEngine().catch(console.error);

