const fs = require('fs');
const sim = require('./sim_framework');

const {
  N, open, high, low, close, time, utcHour, utcDay, utcMonth,
  atr14, rsi14, ema9, ema15, ema21, ema50, ema100, ema200,
  calcEMA, calcATR, calcRSI, calcHighest, calcLowest, runSimulation,
  s1Times
} = sim;

console.log('=== Exhaustive Diverse Architecture Explorer ===');

const results = [];

// Helper: check monthly consistency
function isMonthlyConsistent(m) {
  // Aug: m[7], Sep: m[8], Oct: m[9], Nov: m[10]
  // We want at least 7-8R in full months and positive Nov
  return m[7] >= 6.0 && m[8] >= 6.0 && m[9] >= 6.0 && m[10] >= 0;
}

// -------------------------------------------------------------------------
// 1. KELTNER CHANNEL ENVELOPE (EMA Center + ATR Band)
// -------------------------------------------------------------------------
console.log('Exploring 1. Keltner Channel Family...');
for (const kPeriod of [12, 15, 20, 25, 30]) {
  const kCenter = calcEMA(close, kPeriod);
  for (const kMult of [1.6, 1.8, 2.0, 2.2, 2.4, 2.6]) {
    for (const macroEma of [ema100, ema200]) {
      const macroOffsetVals = [0.0, 2.0, 3.5, 5.0];
      for (const off of macroOffsetVals) {
        for (const sess of [
          { name: 'London (3-14)', s: 3, e: 14, x12: false },
          { name: 'London Full (3-16)', s: 3, e: 16, x12: true },
          { name: 'NY Session (13-21)', s: 13, e: 21, x12: false },
          { name: 'US Extended (12-22)', s: 12, e: 22, x12: false },
          { name: 'All Sessions (1-21)', s: 1, e: 21, x12: true }
        ]) {
          for (const tp of [14.0, 15.0, 16.0, 17.0, 18.0, 19.0, 20.0]) {
            const sl = 13.75;
            const res = runSimulation((i) => {
              const h = utcHour[i];
              if (h < sess.s || h > sess.e || (sess.x12 && h === 12)) return 0;

              const upper = kCenter[i] + kMult * atr14[i];
              const lower = kCenter[i] - kMult * atr14[i];

              const longSig = close[i] > (macroEma[i] + off) && low[i] <= lower && close[i] > open[i] && rsi14[i] < 54;
              const shortSig = close[i] < macroEma[i] && ema50[i] < macroEma[i] && high[i] >= upper && close[i] < open[i] && rsi14[i] > 48;

              if (longSig) return 1;
              if (shortSig) return -1;
              return 0;
            }, tp, sl);

            if (res && res.wr >= 80.0 && res.calmar >= 4.0 && res.tradesCount >= 20) {
              results.push({
                family: 'Keltner ATR Channel',
                name: `Keltner EMA${kPeriod} Mult${kMult} [${sess.name}] TP${tp}`,
                params: { kPeriod, kMult, off, sess: sess.name, tp, sl },
                ...res
              });
            }
          }
        }
      }
    }
  }
}

// -------------------------------------------------------------------------
// 2. DONCHIAN CHANNEL EXTREMES & PULLBACK
// -------------------------------------------------------------------------
console.log('Exploring 2. Donchian Channel Family...');
for (const dLen of [14, 18, 20, 24, 28, 32, 40]) {
  const dHigh = calcHighest(high, dLen);
  const dLow = calcLowest(low, dLen);
  for (const atrTol of [0.0, 0.25, 0.5, 0.75, 1.0]) {
    for (const sess of [
      { name: 'London (3-14)', s: 3, e: 14, x12: false },
      { name: 'London Full (3-16)', s: 3, e: 16, x12: true },
      { name: 'NY Session (13-21)', s: 13, e: 21, x12: false },
      { name: 'US Extended (12-22)', s: 12, e: 22, x12: false },
      { name: 'All Sessions (1-21)', s: 1, e: 21, x12: true }
    ]) {
      for (const tp of [14.0, 15.0, 16.0, 17.0, 18.0, 20.0]) {
        const sl = 13.75;
        const res = runSimulation((i) => {
          const h = utcHour[i];
          if (h < sess.s || h > sess.e || (sess.x12 && h === 12)) return 0;

          // Donchian Extreme Reversal: In macro uptrend, price tests near Donchian lower boundary
          const longSig = close[i] > (ema200[i] + 2.0) && low[i] <= (dLow[i - 1] + atrTol * atr14[i]) && close[i] > open[i] && rsi14[i] < 53;
          // In macro downtrend, price tests near Donchian upper boundary
          const shortSig = close[i] < ema200[i] && ema50[i] < ema200[i] && high[i] >= (dHigh[i - 1] - atrTol * atr14[i]) && close[i] < open[i] && rsi14[i] > 48;

          if (longSig) return 1;
          if (shortSig) return -1;
          return 0;
        }, tp, sl);

        if (res && res.wr >= 80.0 && res.calmar >= 4.0 && res.tradesCount >= 20) {
          results.push({
            family: 'Donchian Channel Extremes',
            name: `Donchian L${dLen} Tol${atrTol} [${sess.name}] TP${tp}`,
            params: { dLen, atrTol, sess: sess.name, tp, sl },
            ...res
          });
        }
      }
    }
  }
}

// -------------------------------------------------------------------------
// 3. TRIPLE EMA TREND RIBBON PULLBACK
// -------------------------------------------------------------------------
console.log('Exploring 3. Triple EMA Ribbon Family...');
for (const fLen of [8, 9, 13]) {
  const fEma = calcEMA(close, fLen);
  for (const mLen of [21, 26, 34]) {
    const mEma = calcEMA(close, mLen);
    for (const sLen of [50, 55, 75]) {
      const sEma = calcEMA(close, sLen);
      for (const sess of [
        { name: 'London (3-14)', s: 3, e: 14, x12: false },
        { name: 'London Full (3-16)', s: 3, e: 16, x12: true },
        { name: 'NY Session (13-21)', s: 13, e: 21, x12: false },
        { name: 'US Extended (12-22)', s: 12, e: 22, x12: false },
        { name: 'All Sessions (1-21)', s: 1, e: 21, x12: true }
      ]) {
        for (const tp of [14.0, 16.0, 18.0]) {
          const sl = 13.75;
          const res = runSimulation((i) => {
            const h = utcHour[i];
            if (h < sess.s || h > sess.e || (sess.x12 && h === 12)) return 0;

            // Trend Ribbon Setup:
            const bullRibbon = fEma[i] > mEma[i] && mEma[i] > sEma[i] && close[i] > (ema200[i] + 2.0);
            const bullPullback = bullRibbon && low[i] <= mEma[i] && close[i] > mEma[i] && close[i] > open[i] && rsi14[i] < 56;

            const bearRibbon = fEma[i] < mEma[i] && mEma[i] < sEma[i] && close[i] < ema200[i];
            const bearPullback = bearRibbon && high[i] >= mEma[i] && close[i] < mEma[i] && close[i] < open[i] && rsi14[i] > 44;

            if (bullPullback) return 1;
            if (bearPullback) return -1;
            return 0;
          }, tp, sl);

          if (res && res.wr >= 80.0 && res.calmar >= 4.0 && res.tradesCount >= 20) {
            results.push({
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

// -------------------------------------------------------------------------
// 4. ASIAN SESSION & PRIOR DAY LIQUIDITY SWEEPS (SMC)
// -------------------------------------------------------------------------
console.log('Exploring 4. Liquidity Sweep Family...');
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

for (const sweepBuf of [0.0, 0.5, 1.0, 1.5, 2.0]) {
  for (const sess of [
    { name: 'London Sweep (7-14)', s: 7, e: 14, x12: false },
    { name: 'London+NY Sweep (7-20)', s: 7, e: 20, x12: false },
    { name: 'NY Sweep (12-21)', s: 12, e: 21, x12: false }
  ]) {
    for (const tp of [14.0, 15.0, 16.0, 18.0, 20.0]) {
      const sl = 13.75;
      const res = runSimulation((i) => {
        const h = utcHour[i];
        if (h < sess.s || h > sess.e) return 0;
        const aH = asiaHigh[i];
        const aL = asiaLow[i];
        if (aH === -Infinity || aL === Infinity) return 0;

        const sweptLow = low[i] <= (aL - sweepBuf) && close[i] > aL && close[i] > open[i] && close[i] > ema200[i] && rsi14[i] < 55;
        const sweptHigh = high[i] >= (aH + sweepBuf) && close[i] < aH && close[i] < open[i] && close[i] < ema200[i] && rsi14[i] > 45;

        if (sweptLow) return 1;
        if (sweptHigh) return -1;
        return 0;
      }, tp, sl);

      if (res && res.wr >= 80.0 && res.calmar >= 4.0 && res.tradesCount >= 18) {
        results.push({
          family: 'Asian Range Liquidity Sweep',
          name: `Asia Sweep Buf${sweepBuf} [${sess.name}] TP${tp}`,
          params: { sweepBuf, sess: sess.name, tp, sl },
          ...res
        });
      }
    }
  }
}

// -------------------------------------------------------------------------
// 5. MOVING AVERAGE ENVELOPE (SMA + ATR / % Envelopes)
// -------------------------------------------------------------------------
console.log('Exploring 5. Moving Average Envelope Family...');
for (const envLen of [20, 24, 30, 36]) {
  // calculate SMA
  const envSma = new Float64Array(N);
  for (let i = envLen - 1; i < N; i++) {
    let s = 0;
    for (let j = 0; j < envLen; j++) s += close[i - j];
    envSma[i] = s / envLen;
  }
  for (const envMult of [1.8, 2.0, 2.2, 2.5]) {
    for (const sess of [
      { name: 'London (3-14)', s: 3, e: 14, x12: false },
      { name: 'NY Session (13-21)', s: 13, e: 21, x12: false },
      { name: 'US Extended (12-22)', s: 12, e: 22, x12: false },
      { name: 'Full Day (1-20)', s: 1, e: 20, x12: true }
    ]) {
      for (const tp of [14.0, 16.0, 18.0, 20.0]) {
        const sl = 13.75;
        const res = runSimulation((i) => {
          const h = utcHour[i];
          if (h < sess.s || h > sess.e || (sess.x12 && h === 12)) return 0;

          const upper = envSma[i] + envMult * atr14[i];
          const lower = envSma[i] - envMult * atr14[i];

          const longSig = close[i] > (ema200[i] + 3.0) && low[i] <= lower && close[i] > open[i] && rsi14[i] < 53;
          const shortSig = close[i] < ema200[i] && ema50[i] < ema200[i] && high[i] >= upper && close[i] < open[i] && rsi14[i] > 49;

          if (longSig) return 1;
          if (shortSig) return -1;
          return 0;
        }, tp, sl);

        if (res && res.wr >= 80.0 && res.calmar >= 4.0 && res.tradesCount >= 20) {
          results.push({
            family: 'Moving Average ATR Envelope',
            name: `MA Envelope L${envLen} Mult${envMult} [${sess.name}] TP${tp}`,
            params: { envLen, envMult, sess: sess.name, tp, sl },
            ...res
          });
        }
      }
    }
  }
}

console.log(`\n=======================================================`);
console.log(`TOTAL CANDIDATES FOUND WITH WR >= 80% & CALMAR >= 4.0: ${results.length}`);
console.log(`=======================================================`);

// Sort by Total R * Win Rate
results.sort((a, b) => (b.totalR * b.wr) - (a.totalR * a.wr));

const famGroups = {};
for (const r of results) {
  if (!famGroups[r.family]) famGroups[r.family] = [];
  famGroups[r.family].push(r);
}

for (const fam of Object.keys(famGroups)) {
  console.log(`\n--- FAMILY: ${fam} (${famGroups[fam].length} strategies) ---`);
  famGroups[fam].slice(0, 4).forEach((c, idx) => {
    console.log(`  [${idx + 1}] ${c.name}`);
    console.log(`      Trades: ${c.tradesCount} (${c.wins}W / ${c.losses}L) | WR: ${c.wr.toFixed(2)}% | Net: +$${c.netProfit.toFixed(2)} (+${c.totalR.toFixed(2)}R)`);
    console.log(`      Calmar: ${c.calmar.toFixed(2)} | ProfitFactor: ${c.profitFactor.toFixed(2)} | MaxDD: $${c.maxDd.toFixed(2)} | S1 Overlap: ${c.overlapWithS1}/${c.tradesCount}`);
    console.log(`      Monthly R: Aug +${c.mReturns[7].toFixed(2)}R | Sep +${c.mReturns[8].toFixed(2)}R | Oct +${c.mReturns[9].toFixed(2)}R | Nov +${c.mReturns[10].toFixed(2)}R`);
  });
}

// Find candidates that also satisfy monthly consistency (Aug >= 7R, Sep >= 7R, Oct >= 7R)
const highConsistency = results.filter(r => r.mReturns[7] >= 7.0 && r.mReturns[8] >= 7.0 && r.mReturns[9] >= 7.0);
console.log(`\n=======================================================`);
console.log(`TRIPLE-MONTH HIGH CONSISTENCY (Aug>=7R, Sep>=7R, Oct>=7R): ${highConsistency.length}`);
console.log(`=======================================================`);
highConsistency.slice(0, 10).forEach((c, idx) => {
  console.log(`  [#${idx + 1}] [${c.family}] ${c.name}`);
  console.log(`      Trades: ${c.tradesCount} (${c.wins}W / ${c.losses}L) | WR: ${c.wr.toFixed(2)}% | Net: +$${c.netProfit.toFixed(2)} (+${c.totalR.toFixed(2)}R)`);
  console.log(`      Calmar: ${c.calmar.toFixed(2)} | MaxDD: $${c.maxDd.toFixed(2)} | S1 Overlap: ${c.overlapWithS1}/${c.tradesCount}`);
  console.log(`      Monthly R: Aug +${c.mReturns[7].toFixed(2)}R | Sep +${c.mReturns[8].toFixed(2)}R | Oct +${c.mReturns[9].toFixed(2)}R | Nov +${c.mReturns[10].toFixed(2)}R`);
});

fs.writeFileSync('C:/Users/samee/Desktop/Pine/diverse_quant_candidates.json', JSON.stringify(results, null, 2), 'utf8');
fs.writeFileSync('C:/Users/samee/Desktop/Pine/high_consistency_candidates.json', JSON.stringify(highConsistency, null, 2), 'utf8');

