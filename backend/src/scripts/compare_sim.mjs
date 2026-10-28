import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

// Run runSim exactly from search_frontier_high_winrate_and_tp.mjs
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

// FVGs
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

// Run Sim
const tpDist = 3.0; // 30 pips
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

    let resolved = false, res = 0, rOut = 0;
    if (i - t.bar >= 45) { resolved = true; res = 2; }
    else if ((tTime - t.entryTime) / 1000 >= 120) {
      if (t.dir === 1) {
        if (c.high >= t.tp) { resolved = true; res = 1; rOut = t.rVal; }
        else if (c.low <= t.sl) { resolved = true; res = t.isLock ? 4 : t.isBE ? 3 : -1; rOut = t.isLock ? 0.6 : t.isBE ? 0 : -1; }
      } else {
        if (c.low <= t.tp) { resolved = true; res = 1; rOut = t.rVal; }
        else if (c.high >= t.sl) { resolved = true; res = t.isLock ? 4 : t.isBE ? 3 : -1; rOut = t.isLock ? 0.6 : t.isBE ? 0 : -1; }
      }
    }

    if (resolved) {
      if (res !== 2) {
        simTrades.push({
          bar: t.bar,
          exitBar: i,
          dir: t.dir === 1 ? 'LONG' : 'SHORT',
          entry: t.entry,
          tp: t.tp,
          sl: t.sl,
          initSL: t.initSL,
          res, // 1: TP, 4: Lock, 3: BE, -1: SL
          rOut,
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

console.log('simTrades total:', simTrades.length);
const wins = simTrades.filter(t => t.res === 1 || t.res === 4);
const losses = simTrades.filter(t => t.res === -1);
const bes = simTrades.filter(t => t.res === 3);
console.log('simTrades Wins:', wins.length, 'Losses:', losses.length, 'BE:', bes.length);
console.log('simTrades Win Rate:', (wins.length / (wins.length + losses.length) * 100).toFixed(1) + '%');

// Now run PineTS on the exact code from Champion_5M_200Pip_Sovereign_STRATEGY.pine
const p = new PineTS(candles, 'XAUUSD', '5');
await p.ready();
const stratCode = fs.readFileSync('pine_scripts/Champion_5M_200Pip_Sovereign_STRATEGY.pine', 'utf8');
const res = await p.run(stratCode);
const tvTrades = res.strategy.closedtrades;
console.log('\nPineTS total trades:', tvTrades.length);
const tvWins = tvTrades.filter(t => t.profit > 0);
const tvLosses = tvTrades.filter(t => t.profit < 0);
console.log('PineTS Wins:', tvWins.length, 'Losses:', tvLosses.length);

// Compare first 10 trades between simTrades and PineTS
console.log('\nComparing first 10 trades:');
for (let i = 0; i < 10; i++) {
  const st = simTrades[i];
  const tt = tvTrades[i];
  console.log(`[Trade ${i+1}]`);
  console.log(`  SIM : ${st.dir} entry=${st.entry} exit=${st.exitBar} res=${st.res} (${st.res===1?'TP':st.res===4?'LOCK':st.res===3?'BE':'SL'}) rOut=${st.rOut}`);
  console.log(`  PINE: ${tt.entry_id} entry=${tt.entry_price} exit=${tt.exit_price} profit=${tt.profit.toFixed(2)} comment=${tt.exit_comment}`);
}
