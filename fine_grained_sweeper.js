const sim = require('./sim_framework');

const {
  N, open, high, low, close, time, utcHour, utcDay, utcMonth,
  atr14, rsi14, ema9, ema15, ema21, ema50, ema100, ema200,
  calcEMA, calcATR, runSimulation, s1Times
} = sim;

console.log('=== Fine-Grained Architecture Sweeper ===');

const champions = [];

function checkCandidate(fam, name, params, evalFn, tp, sl = 13.75) {
  const res = runSimulation(evalFn, tp, sl);
  if (!res) return;
  if (res.wr >= 78.5 && res.calmar >= 4.0 && res.tradesCount >= 18) {
    champions.push({ fam, name, params, ...res });
  }
}

// -------------------------------------------------------------------------
// 1. Direct EMA 50 Volatility Channel (Single EMA Center + ATR Envelope)
// -------------------------------------------------------------------------
console.log('1. Testing EMA 50 / EMA 34 ATR Envelopes...');
for (const emaLen of [34, 40, 50, 60]) {
  const center = calcEMA(close, emaLen);
  for (const mult of [1.6, 1.75, 1.9, 2.05, 2.2, 2.35]) {
    for (const crashAtr of [1.1, 1.25, 1.4]) {
      for (const off of [2.0, 3.5, 4.5]) {
        for (const sess of [
          { name: 'NY Afternoon (14-22)', s: 14, e: 22, x12: false },
          { name: 'London Core (3-14)', s: 3, e: 14, x12: false },
          { name: 'Full Session (1-20 exc 12)', s: 1, e: 20, x12: true }
        ]) {
          for (const tp of [14.0, 15.0, 16.0, 17.0, 18.0]) {
            checkCandidate(
              'EMA-ATR Envelope',
              `EMA${emaLen}-ATR M${mult} [${sess.name}] TP${tp}`,
              { emaLen, mult, crashAtr, off, sess: sess.name, tp, sl: 13.75 },
              (i) => {
                const h = utcHour[i];
                if (h < sess.s || h > sess.e || (sess.x12 && h === 12)) return 0;
                const passCrash = close[i] >= (ema50[i] - crashAtr * atr14[i]);
                const upper = center[i] + mult * atr14[i];
                const lower = center[i] - mult * atr14[i];

                const longSig = passCrash && close[i] > (ema200[i] + off) && low[i] <= lower && close[i] > open[i] && rsi14[i] < 53;
                const shortSig = close[i] < ema200[i] && ema50[i] < ema200[i] && high[i] >= upper && close[i] < open[i] && rsi14[i] > 49;

                if (longSig) return 1;
                if (shortSig) return -1;
                return 0;
              },
              tp
            );
          }
        }
      }
    }
  }
}

// -------------------------------------------------------------------------
// 2. Asian Session Liquidity Sweeps (00:00 - 07:00 UTC Asian High/Low Swept)
// -------------------------------------------------------------------------
console.log('2. Testing Asian Session Liquidity Sweeps...');
const asiaHigh = new Float64Array(N);
const asiaLow = new Float64Array(N);
let curAsiaDay = -1;
let curAsiaH = -Infinity, curAsiaL = Infinity;

for (let i = 0; i < N; i++) {
  const day = utcDay[i];
  const h = utcHour[i];
  if (day !== curAsiaDay) {
    curAsiaDay = day;
    curAsiaH = -Infinity;
    curAsiaL = Infinity;
  }
  if (h >= 0 && h < 7) {
    if (high[i] > curAsiaH) curAsiaH = high[i];
    if (low[i] < curAsiaL) curAsiaL = low[i];
  }
  asiaHigh[i] = curAsiaH;
  asiaLow[i] = curAsiaL;
}

for (const sweepTol of [0.0, 0.5, 1.0, 1.5, 2.0, 2.5]) {
  for (const sess of [
    { name: 'London Sweep (7-13)', s: 7, e: 13 },
    { name: 'NY Sweep (13-20)', s: 13, e: 20 },
    { name: 'London+NY Sweep (7-20)', s: 7, e: 20 }
  ]) {
    for (const tp of [12.0, 14.0, 15.0, 16.0, 18.0]) {
      checkCandidate(
        'Asian Liquidity Sweep',
        `Asia Sweep Tol${sweepTol} [${sess.name}] TP${tp}`,
        { sweepTol, sess: sess.name, tp, sl: 13.75 },
        (i) => {
          const h = utcHour[i];
          if (h < sess.s || h > sess.e) return 0;
          const aH = asiaHigh[i];
          const aL = asiaLow[i];
          if (aH === -Infinity || aL === Infinity) return 0;

          // Sweep of Asian Low: Price dips below Asian Low, but closes back above it
          const sweptLow = low[i] <= (aL - sweepTol) && close[i] > aL && close[i] > open[i] && close[i] > ema200[i] && rsi14[i] < 54;
          // Sweep of Asian High: Price breaks above Asian High, but closes back below it
          const sweptHigh = high[i] >= (aH + sweepTol) && close[i] < aH && close[i] < open[i] && close[i] < ema200[i] && rsi14[i] > 46;

          if (sweptLow) return 1;
          if (sweptHigh) return -1;
          return 0;
        },
        tp
      );
    }
  }
}

// -------------------------------------------------------------------------
// 3. Dynamic RSI Extremes with Candle Rejection (RSI Stretch + Volatility Filter)
// -------------------------------------------------------------------------
console.log('3. Testing Dynamic RSI Extremes...');
for (const rsiLong of [30, 35, 40, 45]) {
  for (const rsiShort of [55, 60, 65, 70]) {
    for (const sess of [
      { name: 'London Core (3-14)', s: 3, e: 14, x12: false },
      { name: 'NY Afternoon (14-22)', s: 14, e: 22, x12: false },
      { name: 'Global Day (1-20 exc 12)', s: 1, e: 20, x12: true }
    ]) {
      for (const tp of [14.0, 16.0, 18.0]) {
        checkCandidate(
          'RSI Dynamic Exhaustion',
          `RSI ${rsiLong}/${rsiShort} [${sess.name}] TP${tp}`,
          { rsiLong, rsiShort, sess: sess.name, tp, sl: 13.75 },
          (i) => {
            const h = utcHour[i];
            if (h < sess.s || h > sess.e || (sess.x12 && h === 12)) return 0;
            const passCrash = close[i] >= (ema50[i] - 1.25 * atr14[i]);

            // Bullish exhaustion dip in uptrend
            const longSig = passCrash && close[i] > (ema200[i] + 3.0) && rsi14[i - 1] <= rsiLong && rsi14[i] > rsiLong && close[i] > open[i] && (low[i] <= ema50[i]);
            // Bearish exhaustion spike in downtrend
            const shortSig = close[i] < ema200[i] && ema50[i] < ema200[i] && rsi14[i - 1] >= rsiShort && rsi14[i] < rsiShort && close[i] < open[i] && (high[i] >= ema50[i]);

            if (longSig) return 1;
            if (shortSig) return -1;
            return 0;
          },
          tp
        );
      }
    }
  }
}

console.log(`\nFound ${champions.length} qualifying champions!`);
champions.sort((a, b) => (b.wr * b.totalR) - (a.wr * a.totalR));

const fams = {};
for (const c of champions) {
  if (!fams[c.fam]) fams[c.fam] = [];
  fams[c.fam].push(c);
}

for (const f of Object.keys(fams)) {
  console.log(`\n=== FAMILY: ${f} (${fams[f].length} strategies) ===`);
  fams[f].slice(0, 4).forEach((c, idx) => {
    console.log(` [${idx + 1}] ${c.name}`);
    console.log(`     Trades: ${c.tradesCount} (${c.wins}W / ${c.losses}L) | WR: ${c.wr.toFixed(2)}% | Net: +$${c.netProfit.toFixed(2)} (+${c.totalR.toFixed(2)}R)`);
    console.log(`     Calmar: ${c.calmar.toFixed(2)} | ProfitFactor: ${c.profitFactor.toFixed(2)} | MaxDD: $${c.maxDd.toFixed(2)} | S1 Overlap: ${c.overlapWithS1}/${c.tradesCount}`);
    console.log(`     Monthly R: Aug +${c.mReturns[7].toFixed(2)}R | Sep +${c.mReturns[8].toFixed(2)}R | Oct +${c.mReturns[9].toFixed(2)}R | Nov +${c.mReturns[10].toFixed(2)}R`);
  });
}

