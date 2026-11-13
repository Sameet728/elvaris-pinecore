const fs = require('fs');
const sim = require('./sim_framework');

const {
  N, open, high, low, close, time, utcHour, utcDay, utcMonth,
  atr14, rsi14, ema9, ema15, ema21, ema50, ema100, ema200,
  calcEMA, calcATR, calcRSI, calcHighest, calcLowest, runSimulation,
  s1Times
} = sim;

console.log('=== Advanced Diverse Explorer with Volatility Guards ===');

const allChampions = [];

const sessions = [
  { name: 'London Core (4-15)', s: 4, e: 15, x12: false },
  { name: 'London Open (6-13)', s: 6, e: 13, x12: false },
  { name: 'NY Momentum (13-21)', s: 13, e: 21, x12: false },
  { name: 'US Extended (12-22)', s: 12, e: 22, x12: false },
  { name: 'Global Day (1-20 exc 12)', s: 1, e: 20, x12: true }
];

// =========================================================================
// 1. KELTNER VOLATILITY CHANNEL (EMA 15-30 +/- ATR Envelope)
// =========================================================================
console.log('Testing Family 1: Keltner Channel Volatility Expansion...');
for (const kPeriod of [14, 18, 20, 24, 28]) {
  const kCenter = calcEMA(close, kPeriod);
  for (const kMult of [1.6, 1.75, 1.9, 2.05, 2.2]) {
    for (const crashAtr of [1.0, 1.25, 1.5, 1.75]) {
      for (const off of [2.0, 3.5, 4.5]) {
        for (const sess of sessions) {
          for (const tp of [14.0, 15.0, 16.0, 17.0, 18.0]) {
            const sl = 13.75;
            const res = runSimulation((i) => {
              const h = utcHour[i];
              if (h < sess.s || h > sess.e || (sess.x12 && h === 12)) return 0;

              const passCrash = close[i] >= (ema50[i] - crashAtr * atr14[i]);
              const upper = kCenter[i] + kMult * atr14[i];
              const lower = kCenter[i] - kMult * atr14[i];

              const longSig = passCrash && close[i] > (ema200[i] + off) && low[i] <= lower && close[i] > open[i] && rsi14[i] < 53;
              const shortSig = close[i] < ema200[i] && ema50[i] < ema200[i] && high[i] >= upper && close[i] < open[i] && rsi14[i] > 49;

              if (longSig) return 1;
              if (shortSig) return -1;
              return 0;
            }, tp, sl);

            if (res && res.wr >= 80.0 && res.calmar >= 4.0 && res.tradesCount >= 20 && res.mReturns[7] >= 6.0 && res.mReturns[8] >= 6.0 && res.mReturns[9] >= 6.0 && res.mReturns[10] >= 0.0) {
              allChampions.push({
                family: 'Keltner Channel Expansion',
                name: `Keltner EMA${kPeriod} Mult${kMult} [${sess.name}] TP${tp}`,
                params: { kPeriod, kMult, crashAtr, off, sess: sess.name, tp, sl },
                ...res
              });
            }
          }
        }
      }
    }
  }
}

// =========================================================================
// 2. DONCHIAN CHANNEL RANGE EXTREMES & PULLBACK
// =========================================================================
console.log('Testing Family 2: Donchian Channel Extremes & Pullback...');
for (const dLen of [14, 18, 20, 24, 28, 32]) {
  const dHigh = calcHighest(high, dLen);
  const dLow = calcLowest(low, dLen);
  for (const tolAtr of [0.1, 0.25, 0.5, 0.75]) {
    for (const crashAtr of [1.0, 1.25, 1.5]) {
      for (const off of [2.0, 3.5, 4.5]) {
        for (const sess of sessions) {
          for (const tp of [14.0, 15.0, 16.0, 18.0]) {
            const sl = 13.75;
            const res = runSimulation((i) => {
              const h = utcHour[i];
              if (h < sess.s || h > sess.e || (sess.x12 && h === 12)) return 0;

              const passCrash = close[i] >= (ema50[i] - crashAtr * atr14[i]);
              const lowerBoundary = dLow[i - 1] + tolAtr * atr14[i];
              const upperBoundary = dHigh[i - 1] - tolAtr * atr14[i];

              const longSig = passCrash && close[i] > (ema200[i] + off) && low[i] <= lowerBoundary && close[i] > open[i] && rsi14[i] < 53;
              const shortSig = close[i] < ema200[i] && ema50[i] < ema200[i] && high[i] >= upperBoundary && close[i] < open[i] && rsi14[i] > 49;

              if (longSig) return 1;
              if (shortSig) return -1;
              return 0;
            }, tp, sl);

            if (res && res.wr >= 80.0 && res.calmar >= 4.0 && res.tradesCount >= 20 && res.mReturns[7] >= 6.0 && res.mReturns[8] >= 6.0 && res.mReturns[9] >= 6.0 && res.mReturns[10] >= 0.0) {
              allChampions.push({
                family: 'Donchian Channel Range Extremes',
                name: `Donchian L${dLen} Tol${tolAtr} [${sess.name}] TP${tp}`,
                params: { dLen, tolAtr, crashAtr, off, sess: sess.name, tp, sl },
                ...res
              });
            }
          }
        }
      }
    }
  }
}

// =========================================================================
// 3. TRIPLE EMA TREND RIBBON DYNAMIC PULLBACK
// =========================================================================
console.log('Testing Family 3: Triple EMA Dynamic Trend Ribbon...');
for (const fLen of [8, 9, 13]) {
  const fEma = calcEMA(close, fLen);
  for (const mLen of [21, 26, 34]) {
    const mEma = calcEMA(close, mLen);
    for (const sLen of [50, 55, 75]) {
      const sEma = calcEMA(close, sLen);
      for (const crashAtr of [1.0, 1.25, 1.5]) {
        for (const sess of sessions) {
          for (const tp of [14.0, 15.0, 16.0, 18.0]) {
            const sl = 13.75;
            const res = runSimulation((i) => {
              const h = utcHour[i];
              if (h < sess.s || h > sess.e || (sess.x12 && h === 12)) return 0;

              const passCrash = close[i] >= (ema50[i] - crashAtr * atr14[i]);
              const bullRibbon = fEma[i] > mEma[i] && mEma[i] > sEma[i] && close[i] > (ema200[i] + 3.0);
              const bullEntry = bullRibbon && passCrash && low[i] <= (mEma[i] + 0.25 * atr14[i]) && close[i] > mEma[i] && close[i] > open[i] && rsi14[i] < 55;

              const bearRibbon = fEma[i] < mEma[i] && mEma[i] < sEma[i] && close[i] < ema200[i];
              const bearEntry = bearRibbon && high[i] >= (mEma[i] - 0.25 * atr14[i]) && close[i] < mEma[i] && close[i] < open[i] && rsi14[i] > 45;

              if (bullEntry) return 1;
              if (bearEntry) return -1;
              return 0;
            }, tp, sl);

            if (res && res.wr >= 80.0 && res.calmar >= 4.0 && res.tradesCount >= 20 && res.mReturns[7] >= 6.0 && res.mReturns[8] >= 6.0 && res.mReturns[9] >= 6.0 && res.mReturns[10] >= 0.0) {
              allChampions.push({
                family: 'Triple EMA Trend Ribbon',
                name: `Ribbon EMA${fLen}/${mLen}/${sLen} [${sess.name}] TP${tp}`,
                params: { fLen, mLen, sLen, crashAtr, sess: sess.name, tp, sl },
                ...res
              });
            }
          }
        }
      }
    }
  }
}

// =========================================================================
// 4. EMA VOLATILITY BAND (EMA 50 +/- ATR Channel)
// =========================================================================
console.log('Testing Family 4: EMA Volatility Band...');
for (const emaLen of [34, 45, 50, 60]) {
  const centerEma = calcEMA(close, emaLen);
  for (const atrMult of [1.75, 1.9, 2.1, 2.3]) {
    for (const crashAtr of [1.1, 1.25, 1.4]) {
      for (const off of [2.0, 3.5, 4.5]) {
        for (const sess of sessions) {
          for (const tp of [14.0, 15.0, 16.0, 18.0]) {
            const sl = 13.75;
            const res = runSimulation((i) => {
              const h = utcHour[i];
              if (h < sess.s || h > sess.e || (sess.x12 && h === 12)) return 0;

              const passCrash = close[i] >= (ema50[i] - crashAtr * atr14[i]);
              const upper = centerEma[i] + atrMult * atr14[i];
              const lower = centerEma[i] - atrMult * atr14[i];

              const longSig = passCrash && close[i] > (ema200[i] + off) && low[i] <= lower && close[i] > open[i] && rsi14[i] < 53;
              const shortSig = close[i] < ema200[i] && ema50[i] < ema200[i] && high[i] >= upper && close[i] < open[i] && rsi14[i] > 49;

              if (longSig) return 1;
              if (shortSig) return -1;
              return 0;
            }, tp, sl);

            if (res && res.wr >= 80.0 && res.calmar >= 4.0 && res.tradesCount >= 20 && res.mReturns[7] >= 6.0 && res.mReturns[8] >= 6.0 && res.mReturns[9] >= 6.0 && res.mReturns[10] >= 0.0) {
              allChampions.push({
                family: 'EMA Volatility Envelope',
                name: `EMA-ATR L${emaLen} Mult${atrMult} [${sess.name}] TP${tp}`,
                params: { emaLen, atrMult, crashAtr, off, sess: sess.name, tp, sl },
                ...res
              });
            }
          }
        }
      }
    }
  }
}

console.log(`\n=======================================================`);
console.log(`TOTAL CHAMPIONS MATCHING ALL TRADEIFY & MONTHLY RULES: ${allChampions.length}`);
console.log(`=======================================================`);

// Sort by Total R * Win Rate
allChampions.sort((a, b) => (b.totalR * b.wr) - (a.totalR * a.wr));

const famSummary = {};
for (const c of allChampions) {
  if (!famSummary[c.family]) famSummary[c.family] = [];
  famSummary[c.family].push(c);
}

for (const fam of Object.keys(famSummary)) {
  console.log(`\n-------------------------------------------------------`);
  console.log(`FAMILY: ${fam} (${famSummary[fam].length} strategies satisfying all rules)`);
  console.log(`-------------------------------------------------------`);
  famSummary[fam].slice(0, 3).forEach((c, idx) => {
    console.log(`  #${idx + 1}: ${c.name}`);
    console.log(`      Trades: ${c.tradesCount} | ${c.wins}W / ${c.losses}L | WR: ${c.wr.toFixed(2)}% | Net: +$${c.netProfit.toFixed(2)} (+${c.totalR.toFixed(2)}R)`);
    console.log(`      Calmar: ${c.calmar.toFixed(2)} | ProfitFactor: ${c.profitFactor.toFixed(2)} | MaxDD: $${c.maxDd.toFixed(2)} | S1 Overlap: ${c.overlapWithS1}/${c.tradesCount}`);
    console.log(`      Monthly R: Aug +${c.mReturns[7].toFixed(2)}R | Sep +${c.mReturns[8].toFixed(2)}R | Oct +${c.mReturns[9].toFixed(2)}R | Nov +${c.mReturns[10].toFixed(2)}R`);
  });
}

fs.writeFileSync('C:/Users/samee/Desktop/Pine/all_diverse_champions.json', JSON.stringify(allChampions, null, 2), 'utf8');

