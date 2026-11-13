const sim = require('./sim_framework');

const {
  N, open, high, low, close, time, utcHour, utcDay, utcMonth,
  atr14, rsi14, ema9, ema15, ema21, ema50, ema100, ema200,
  calcEMA, calcATR, calcRSI, calcHighest, calcLowest, runSimulation
} = sim;

console.log('--- Testing Diverse Strategy Architectures ---');

const candidates = [];

// =========================================================================
// FAMILY 1: KELTNER VOLATILITY CHANNELS (EMA + ATR Envelope)
// =========================================================================
console.log('Testing Family 1: Keltner Channels...');
const keltnerCenterPeriods = [15, 20, 25];
const keltnerAtrMults = [1.8, 2.0, 2.2, 2.4];
const sessionWindows = [
  { name: 'London (3-14)', start: 3, end: 14, exc12: false },
  { name: 'London Core (4-15)', start: 4, end: 15, exc12: false },
  { name: 'NY Afternoon (13-21)', start: 13, end: 21, exc12: false },
  { name: 'US Extended (12-22)', start: 12, end: 22, exc12: false },
  { name: 'Full Day (1-20)', start: 1, end: 20, exc12: true }
];

for (const kPeriod of keltnerCenterPeriods) {
  const kCenter = calcEMA(close, kPeriod);
  for (const kMult of keltnerAtrMults) {
    for (const sess of sessionWindows) {
      for (const tp of [14.0, 15.0, 16.0, 18.0]) {
        const sl = 13.75;
        const res = runSimulation((i) => {
          const h = utcHour[i];
          const inSess = (h >= sess.start && h <= sess.end) && (!sess.exc12 || h !== 12);
          if (!inSess) return 0;

          const upper = kCenter[i] + kMult * atr14[i];
          const lower = kCenter[i] - kMult * atr14[i];

          // Long: Price dips below lower Keltner in uptrend (> EMA 100/200) and closes bullish
          const longSig = close[i] > ema200[i] && low[i] <= lower && close[i] > open[i] && rsi14[i] < 54;
          // Short: Price pushes above upper Keltner in downtrend (< EMA 200) and closes bearish
          const shortSig = close[i] < ema200[i] && ema50[i] < ema200[i] && high[i] >= upper && close[i] < open[i] && rsi14[i] > 48;

          if (longSig) return 1;
          if (shortSig) return -1;
          return 0;
        }, tp, sl);

        if (res && res.wr >= 78.0 && res.calmar >= 4.0 && res.tradesCount >= 18) {
          candidates.push({
            family: 'Keltner Channel Expansion',
            name: `Keltner EMA${kPeriod} Mult${kMult} [${sess.name}] TP${tp}`,
            params: { kPeriod, kMult, sess: sess.name, tp, sl },
            ...res
          });
        }
      }
    }
  }
}

// =========================================================================
// FAMILY 2: TRIPLE EMA TREND RIBBON PULLBACK
// =========================================================================
console.log('Testing Family 2: Triple EMA Trend Ribbon...');
const emaFastPeriods = [8, 9, 13];
const emaMedPeriods = [21, 34];
const emaSlowPeriods = [55, 89];

for (const fLen of emaFastPeriods) {
  const fEma = calcEMA(close, fLen);
  for (const mLen of emaMedPeriods) {
    const mEma = calcEMA(close, mLen);
    for (const sLen of emaSlowPeriods) {
      const sEma = calcEMA(close, sLen);
      for (const sess of sessionWindows) {
        for (const tp of [14.0, 16.0, 18.0]) {
          const sl = 13.75;
          const res = runSimulation((i) => {
            const h = utcHour[i];
            const inSess = (h >= sess.start && h <= sess.end) && (!sess.exc12 || h !== 12);
            if (!inSess) return 0;

            // Bullish Ribbon: Fast > Med > Slow and Macro > 200
            const bullRibbon = fEma[i] > mEma[i] && mEma[i] > sEma[i] && close[i] > ema200[i];
            // Pullback: low touches or penetrates medium EMA, but close recovers above it
            const bullPullback = bullRibbon && low[i] <= mEma[i] && close[i] > mEma[i] && close[i] > open[i] && rsi14[i] < 58;

            // Bearish Ribbon: Fast < Med < Slow and Macro < 200
            const bearRibbon = fEma[i] < mEma[i] && mEma[i] < sEma[i] && close[i] < ema200[i];
            const bearPullback = bearRibbon && high[i] >= mEma[i] && close[i] < mEma[i] && close[i] < open[i] && rsi14[i] > 42;

            if (bullPullback) return 1;
            if (bearPullback) return -1;
            return 0;
          }, tp, sl);

          if (res && res.wr >= 78.0 && res.calmar >= 4.0 && res.tradesCount >= 18) {
            candidates.push({
              family: 'Triple EMA Trend Ribbon',
              name: `Ribbon EMA${fLen}/${mLen}/${sLen} [${sess.name}] TP${tp}`,
              params: { fLen, mLen, sLen, sess: sess.name, tp, sl },
              ...res
            });
          }
        }
      }
    }
  }
}

// =========================================================================
// FAMILY 3: DONCHIAN CHANNEL BREAKOUT & PULLBACK
// =========================================================================
console.log('Testing Family 3: Donchian Channels...');
for (const dLen of [16, 20, 24, 28]) {
  const dHigh = calcHighest(high, dLen);
  const dLow = calcLowest(low, dLen);
  for (const sess of sessionWindows) {
    for (const tp of [14.0, 16.0, 18.0]) {
      const sl = 13.75;
      const res = runSimulation((i) => {
        const h = utcHour[i];
        const inSess = (h >= sess.start && h <= sess.end) && (!sess.exc12 || h !== 12);
        if (!inSess) return 0;

        const dMid = (dHigh[i - 1] + dLow[i - 1]) / 2;
        // Donchian Reversal/Pullback: price tests low channel or mid channel
        const longSig = close[i] > ema200[i] && low[i] <= dLow[i - 1] + 0.5 * atr14[i] && close[i] > open[i] && rsi14[i] < 50;
        const shortSig = close[i] < ema200[i] && high[i] >= dHigh[i - 1] - 0.5 * atr14[i] && close[i] < open[i] && rsi14[i] > 50;

        if (longSig) return 1;
        if (shortSig) return -1;
        return 0;
      }, tp, sl);

      if (res && res.wr >= 78.0 && res.calmar >= 4.0 && res.tradesCount >= 18) {
        candidates.push({
          family: 'Donchian Channel Range Extremes',
          name: `Donchian L${dLen} [${sess.name}] TP${tp}`,
          params: { dLen, sess: sess.name, tp, sl },
          ...res
        });
      }
    }
  }
}

// =========================================================================
// FAMILY 4: ASIAN SESSION LIQUIDITY SWEEPS (SMC Architecture)
// =========================================================================
console.log('Testing Family 4: Asian Session Liquidity Sweeps...');
// Compute Asian Session (00:00 - 07:00 UTC) High & Low for each day
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

for (const sweepBuffer of [0.0, 1.0, 2.0, 3.0]) {
  for (const sess of [
    { name: 'London Sweep (7-14)', start: 7, end: 14 },
    { name: 'London+NY Sweep (7-19)', start: 7, end: 19 },
    { name: 'NY Sweep (12-21)', start: 12, end: 21 }
  ]) {
    for (const tp of [14.0, 15.0, 16.0, 18.0]) {
      const sl = 13.75;
      const res = runSimulation((i) => {
        const h = utcHour[i];
        if (h < sess.start || h > sess.end) return 0;
        const aH = asiaHigh[i];
        const aL = asiaLow[i];
        if (aH === -Infinity || aL === Infinity) return 0;

        // Long Sweep: Price swept below Asian Low by sweepBuffer, then closed back above Asian Low
        const sweptLow = low[i] <= (aL - sweepBuffer) && close[i] > aL && close[i] > open[i] && close[i] > ema200[i];
        // Short Sweep: Price swept above Asian High by sweepBuffer, then closed back below Asian High
        const sweptHigh = high[i] >= (aH + sweepBuffer) && close[i] < aH && close[i] < open[i] && close[i] < ema200[i];

        if (sweptLow) return 1;
        if (sweptHigh) return -1;
        return 0;
      }, tp, sl);

      if (res && res.wr >= 78.0 && res.calmar >= 4.0 && res.tradesCount >= 15) {
        candidates.push({
          family: 'Asian Range Liquidity Sweep',
          name: `Asia Sweep Buf${sweepBuffer} [${sess.name}] TP${tp}`,
          params: { sweepBuffer, sess: sess.name, tp, sl },
          ...res
        });
      }
    }
  }
}

// =========================================================================
// FAMILY 5: SUPERTREND & VOLATILITY EXPANSION
// =========================================================================
console.log('Testing Family 5: SuperTrend Volatility Expansion...');
function calcSuperTrend(period, factor) {
  const st = new Float64Array(N);
  const dir = new Int32Array(N); // 1 = bull, -1 = bear
  const atr = calcATR(period);

  let up = (high[0] + low[0]) / 2 - factor * atr[0];
  let dn = (high[0] + low[0]) / 2 + factor * atr[0];
  dir[0] = 1;
  st[0] = up;

  for (let i = 1; i < N; i++) {
    const hl2 = (high[i] + low[i]) / 2;
    let basicUp = hl2 - factor * atr[i];
    let basicDn = hl2 + factor * atr[i];

    if (basicUp > up || close[i - 1] < up) up = basicUp;
    if (basicDn < dn || close[i - 1] > dn) dn = basicDn;

    if (dir[i - 1] === 1) {
      if (close[i] < up) {
        dir[i] = -1;
        st[i] = dn;
      } else {
        dir[i] = 1;
        st[i] = up;
      }
    } else {
      if (close[i] > dn) {
        dir[i] = 1;
        st[i] = up;
      } else {
        dir[i] = -1;
        st[i] = dn;
      }
    }
  }
  return { st, dir };
}

for (const stPeriod of [10, 14]) {
  for (const stFactor of [2.0, 2.5, 3.0]) {
    const { st, dir } = calcSuperTrend(stPeriod, stFactor);
    for (const sess of sessionWindows) {
      for (const tp of [14.0, 16.0, 18.0]) {
        const sl = 13.75;
        const res = runSimulation((i) => {
          const h = utcHour[i];
          const inSess = (h >= sess.start && h <= sess.end) && (!sess.exc12 || h !== 12);
          if (!inSess) return 0;

          // SuperTrend Bullish Flip or Pullback
          const bullSignal = dir[i] === 1 && low[i] <= st[i] + 1.0 * atr14[i] && close[i] > open[i] && close[i] > ema200[i] && rsi14[i] < 55;
          const bearSignal = dir[i] === -1 && high[i] >= st[i] - 1.0 * atr14[i] && close[i] < open[i] && close[i] < ema200[i] && rsi14[i] > 45;

          if (bullSignal) return 1;
          if (bearSignal) return -1;
          return 0;
        }, tp, sl);

        if (res && res.wr >= 78.0 && res.calmar >= 4.0 && res.tradesCount >= 18) {
          candidates.push({
            family: 'SuperTrend Volatility Flow',
            name: `SuperTrend P${stPeriod} F${stFactor} [${sess.name}] TP${tp}`,
            params: { stPeriod, stFactor, sess: sess.name, tp, sl },
            ...res
          });
        }
      }
    }
  }
}

console.log(`\nFound ${candidates.length} candidate strategies meeting base criteria!`);

// Sort by Calmar * WinRate
candidates.sort((a, b) => (b.calmar * b.wr) - (a.calmar * a.wr));

// Group by Family and show top 3 of each family
const families = {};
for (const c of candidates) {
  if (!families[c.family]) families[c.family] = [];
  families[c.family].push(c);
}

for (const fam of Object.keys(families)) {
  console.log(`\n=======================================================`);
  console.log(`TOP PERFORMERS: ${fam} (${families[fam].length} candidates)`);
  console.log(`=======================================================`);
  families[fam].slice(0, 3).forEach((c, idx) => {
    console.log(`${idx + 1}. ${c.name}`);
    console.log(`   Trades: ${c.tradesCount} | ${c.wins}W / ${c.losses}L | WR: ${c.wr.toFixed(2)}% | Net: +$${c.netProfit.toFixed(2)} (+${c.totalR.toFixed(2)}R)`);
    console.log(`   MaxDD: $${c.maxDd.toFixed(2)} | Calmar: ${c.calmar.toFixed(2)} | ProfitFactor: ${c.profitFactor.toFixed(2)} | S1 Overlap: ${c.overlapWithS1}/${c.tradesCount}`);
    console.log(`   Monthly R: Aug: +${c.mReturns[7].toFixed(1)}R | Sep: +${c.mReturns[8].toFixed(1)}R | Oct: +${c.mReturns[9].toFixed(1)}R | Nov: +${c.mReturns[10].toFixed(1)}R`);
  });
}

fs.writeFileSync('C:/Users/samee/Desktop/Pine/diverse_candidates.json', JSON.stringify(candidates, null, 2), 'utf8');

