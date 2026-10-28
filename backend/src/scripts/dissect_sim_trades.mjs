import fs from 'fs';

const candles = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

// Run the EXACT simTrades logic from compare_sim.mjs
function computeEMA(candles, period) {
  const ema = new Float64Array(candles.length);
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += candles[i].close;
  ema[period - 1] = sum / period;
  for (let i = period; i < candles.length; i++) ema[i] = candles[i].close * k + ema[i - 1] * (1 - k);
  return ema;
}
function computeATR(candles, period = 14) {
  const atr = new Float64Array(candles.length);
  let sum = 0;
  for (let i = 1; i <= period; i++) {
    sum += Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i - 1].close), Math.abs(candles[i].low - candles[i - 1].close));
  }
  atr[period] = sum / period;
  for (let i = period + 1; i < candles.length; i++) {
    const tr = Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i - 1].close), Math.abs(candles[i].low - candles[i - 1].close));
    atr[i] = (atr[i - 1] * (period - 1) + tr) / period;
  }
  return atr;
}
function precomputeSweeps(candles, swMin, swMaj) {
  const n = candles.length;
  const bslLvls = [], sslLvls = [];
  for (let i = swMaj * 2; i < n; i++) {
    const p1 = i - swMin;
    let isH1 = true, isL1 = true;
    for (let j = i - swMin * 2; j <= i; j++) {
      if (j !== p1) {
        if (candles[j].high > candles[p1].high) isH1 = false;
        if (candles[j].low < candles[p1].low) isL1 = false;
      }
    }
    if (isH1) bslLvls.push({ bar: p1, price: candles[p1].high });
    if (isL1) sslLvls.push({ bar: p1, price: candles[p1].low });
    const p2 = i - swMaj;
    let isH2 = true, isL2 = true;
    for (let j = i - swMaj * 2; j <= i; j++) {
      if (j !== p2) {
        if (candles[j].high > candles[p2].high) isH2 = false;
        if (candles[j].low < candles[p2].low) isL2 = false;
      }
    }
    if (isH2) bslLvls.push({ bar: p2, price: candles[p2].high });
    if (isL2) sslLvls.push({ bar: p2, price: candles[p2].low });
  }
  const sweeps = new Array(n);
  const activeBsl = [], activeSsl = [];
  let bslPtr = 0, sslPtr = 0;
  for (let i = 0; i < n; i++) {
    sweeps[i] = { sslSweep: false, bslSweep: false };
    if (i < 2) continue;
    const c = candles[i];
    while (bslPtr < bslLvls.length && bslLvls[bslPtr].bar <= i) {
      activeBsl.push({ price: bslLvls[bslPtr].price, swept: false });
      if (activeBsl.length > 20) activeBsl.shift();
      bslPtr++;
    }
    while (sslPtr < sslLvls.length && sslLvls[sslPtr].bar <= i) {
      activeSsl.push({ price: sslLvls[sslPtr].price, swept: false });
      if (activeSsl.length > 20) activeSsl.shift();
      sslPtr++;
    }
    for (let k = 0; k < activeSsl.length; k++) {
      if (!activeSsl[k].swept && c.low < activeSsl[k].price && c.close > activeSsl[k].price) {
        activeSsl[k].swept = true;
        sweeps[i].sslSweep = true;
      }
    }
    for (let k = 0; k < activeBsl.length; k++) {
      if (!activeBsl[k].swept && c.high > activeBsl[k].price && c.close < activeBsl[k].price) {
        activeBsl[k].swept = true;
        sweeps[i].bslSweep = true;
      }
    }
  }
  return sweeps;
}

const n = candles.length;
const ema = computeEMA(candles, 50);
const atr = computeATR(candles, 14);
const sweeps = precomputeSweeps(candles, 4, 6);

const curBFvg = [], curSFvg = [];
const bFvgs = new Array(n), sFvgs = new Array(n);
for (let i = 0; i < n; i++) {
  if (i >= 2) {
    if (candles[i].low > candles[i-2].high) {
      curBFvg.push({ bar: i, top: candles[i].low, bot: candles[i-2].high });
      if (curBFvg.length > 10) curBFvg.shift();
    }
    if (candles[i].high < candles[i-2].low) {
      curSFvg.push({ bar: i, top: candles[i-2].low, bot: candles[i].high });
      if (curSFvg.length > 10) curSFvg.shift();
    }
  }
  bFvgs[i] = [...curBFvg];
  sFvgs[i] = [...curSFvg];
}

const tpDist = 3.0;
let openTrade = null;
let lookLong = false, lookShort = false, setupBarL = 0, setupBarS = 0;
const simTrades = [];

for (let i = 2; i < n; i++) {
  const c = candles[i];
  const s = sweeps[i];
  const tTime = c.openTime || c.time;

  if (s.sslSweep && c.close > ema[i]) { lookLong = true; lookShort = false; setupBarL = i; }
  if (s.bslSweep && c.close < ema[i]) { lookShort = true; lookLong = false; setupBarS = i; }

  if (openTrade !== null) {
    const t = openTrade;
    const slDistInit = Math.abs(t.entry - t.initSL);
    const gain = t.dir === 1 ? (c.high - t.entry) : (t.entry - c.low);

    if (!t.isBE && gain >= slDistInit * 0.3) { t.sl = t.entry; t.isBE = true; }
    if (!t.isLock && gain >= slDistInit * 0.8) {
      t.sl = t.dir === 1 ? (t.entry + slDistInit * 0.6) : (t.entry - slDistInit * 0.6);
      t.isLock = true;
    }

    let resolved = false, res = 0, rOut = 0, exitPrice = 0;
    if (i - t.bar >= 45) { 
      resolved = true; res = 2; exitPrice = c.close; 
    } else if ((tTime - t.entryTime) / 1000 >= 120) {
      if (t.dir === 1) {
        // CHECK WHICH WAS HIT FIRST OR WHAT HAPPENED:
        if (c.high >= t.tp) { 
          resolved = true; res = 1; rOut = t.rVal; exitPrice = t.tp; 
        } else if (c.low <= t.sl) { 
          resolved = true; res = t.isLock ? 4 : t.isBE ? 3 : -1; rOut = t.isLock ? 0.6 : t.isBE ? 0 : -1; exitPrice = t.sl; 
        }
      } else {
        if (c.low <= t.tp) { 
          resolved = true; res = 1; rOut = t.rVal; exitPrice = t.tp; 
        } else if (c.high >= t.sl) { 
          resolved = true; res = t.isLock ? 4 : t.isBE ? 3 : -1; rOut = t.isLock ? 0.6 : t.isBE ? 0 : -1; exitPrice = t.sl; 
        }
      }
    }

    if (resolved) {
      if (res !== 2) {
        simTrades.push({
          tradeNum: simTrades.length + 1,
          bar: t.bar,
          exitBar: i,
          dir: t.dir === 1 ? 'LONG' : 'SHORT',
          entry: t.entry,
          tp: t.tp,
          sl: t.sl,
          initSL: t.initSL,
          res, // 1: TP, 4: Lock, 3: BE, -1: SL
          rOut,
          exitPrice,
          pnl: (t.dir === 1 ? (exitPrice - t.entry) : (t.entry - exitPrice)),
          entryTime: new Date(t.entryTime).toISOString(),
          exitTime: new Date(tTime).toISOString()
        });
      }
      openTrade = null;
    }
  }

  if (lookLong && (i - setupBarL) > 25) lookLong = false;
  if (lookShort && (i - setupBarS) > 25) lookShort = false;

  if (lookLong && openTrade === null) {
    const fvgs = bFvgs[i];
    for (let f = fvgs.length - 1; f >= 0; f--) {
      if (fvgs[f].bar > setupBarL) {
        if (c.low <= fvgs[f].top && c.close > fvgs[f].bot) {
          const entry = c.close;
          const sl = fvgs[f].bot - atr[i] * 0.22;
          const slDist = entry - sl;
          if (slDist > 0.4 && slDist < Math.max(2.0, tpDist / 1.5)) {
            openTrade = { dir: 1, entry, sl, initSL: sl, tp: entry + tpDist, bar: i, entryTime: tTime, rVal: Number((tpDist / slDist).toFixed(2)), isBE: false, isLock: false };
            lookLong = false; break;
          }
        }
      }
    }
  }

  if (lookShort && openTrade === null) {
    const fvgs = sFvgs[i];
    for (let f = fvgs.length - 1; f >= 0; f--) {
      if (fvgs[f].bar > setupBarS) {
        if (c.high >= fvgs[f].bot && c.close < fvgs[f].top) {
          const entry = c.close;
          const sl = fvgs[f].top + atr[i] * 0.22;
          const slDist = sl - entry;
          if (slDist > 0.4 && slDist < Math.max(2.0, tpDist / 1.5)) {
            openTrade = { dir: -1, entry, sl, initSL: sl, tp: entry - tpDist, bar: i, entryTime: tTime, rVal: Number((tpDist / slDist).toFixed(2)), isBE: false, isLock: false };
            lookShort = false; break;
          }
        }
      }
    }
  }
}

console.log('Total simTrades:', simTrades.length);
console.log('Wins (TP+Lock):', simTrades.filter(t => t.res === 1 || t.res === 4).length);
console.log('BE:', simTrades.filter(t => t.res === 3).length);
console.log('Losses:', simTrades.filter(t => t.res === -1).length);

// Check first 15 trades
console.log('\n--- FIRST 15 SIM TRADES ---');
simTrades.slice(0, 15).forEach(t => {
  console.log(`Trade ${t.tradeNum}: bar ${t.bar}->${t.exitBar} (${t.dir}) Entry=${t.entry} InitSL=${t.initSL.toFixed(2)} Exit=${t.exitPrice.toFixed(2)} Res=${t.res===1?'TP':t.res===4?'LOCK':t.res===3?'BE':'SL'} PnL=${t.pnl.toFixed(2)} R=${t.rOut}`);
});
