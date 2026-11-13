const fs = require('fs');
const sim = require('./sim_framework');

const {
  N, open, high, low, close, time, utcHour, utcDay, utcMonth,
  atr14, rsi14, ema9, ema15, ema21, ema50, ema100, ema200,
  calcEMA, calcATR, calcRSI, calcHighest, calcLowest, runSimulation,
  s1Times
} = sim;

console.log('=== Deep Diverse Architectures Discovery ===');

const found = [];

// Precompute common technical structures
const highest15 = calcHighest(high, 15);
const lowest15 = calcLowest(low, 15);
const highest20 = calcHighest(high, 20);
const lowest20 = calcLowest(low, 20);
const highest30 = calcHighest(high, 30);
const lowest30 = calcLowest(low, 30);

// Precompute Keltner channels for multiple EMAs
const keltnerMap = {};
for (const p of [10, 14, 18, 20, 24, 28, 32]) {
  keltnerMap[p] = calcEMA(close, p);
}

// Session definitions
const sessions = [
  { id: 'LDN_CORE', name: 'London Core (3-12)', s: 3, e: 12, x12: false },
  { id: 'LDN_EXT',  name: 'London Ext (3-15)',  s: 3, e: 15, x12: false },
  { id: 'NY_CORE',   name: 'NY Core (13-20)',   s: 13, e: 20, x12: false },
  { id: 'NY_AFT',    name: 'NY Afternoon (15-22)', s: 15, e: 22, x12: false },
  { id: 'GLOBAL',    name: 'Global (1-20 exc 12)', s: 1, e: 20, x12: true },
  { id: 'ASIA_LDN',  name: 'Asia to London (1-10)', s: 1, e: 10, x12: false }
];

// Helper to record candidate
function evaluateCandidate(family, name, params, evalFn, tp, sl = 13.75) {
  const res = runSimulation(evalFn, tp, sl);
  if (!res) return;
  if (res.tradesCount >= 20 && res.wr >= 80.0 && res.calmar >= 4.0) {
    found.push({
      family,
      name,
      params,
      ...res
    });
  }
}

// =========================================================================
// 1. KELTNER CHANNEL FAMILIES (EMA 10 - 32, Mult 1.6 - 2.5)
// =========================================================================
console.log('Testing Keltner Channel Variations...');
for (const p of [14, 18, 20, 24, 28]) {
  const kCenter = keltnerMap[p];
  for (const mult of [1.7, 1.85, 2.0, 2.15, 2.3]) {
    for (const crashAtr of [1.1, 1.25, 1.4, 1.6]) {
      for (const off of [1.5, 2.5, 3.5, 4.5]) {
        for (const sess of sessions) {
          for (const tp of [14.0, 15.0, 16.0, 17.0, 18.0]) {
            evaluateCandidate(
              'Keltner Channel Expansion',
              `Keltner EMA${p} Mult${mult} [${sess.name}] TP${tp}`,
              { p, mult, crashAtr, off, sess: sess.id, tp, sl: 13.75 },
              (i) => {
                const h = utcHour[i];
                if (h < sess.s || h > sess.e || (sess.x12 && h === 12)) return 0;
                const passCrash = close[i] >= (ema50[i] - crashAtr * atr14[i]);
                const upper = kCenter[i] + mult * atr14[i];
                const lower = kCenter[i] - mult * atr14[i];

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

// =========================================================================
// 2. DONCHIAN CHANNELS (Pure High/Low Channel Retests)
// =========================================================================
console.log('Testing Donchian Channel Retest & Breakout...');
const donchianSets = [
  { len: 15, h: highest15, l: lowest15 },
  { len: 20, h: highest20, l: lowest20 },
  { len: 30, h: highest30, l: lowest30 }
];

for (const d of donchianSets) {
  for (const tol of [0.0, 0.25, 0.5, 0.75, 1.0]) {
    for (const crashAtr of [1.1, 1.25, 1.4]) {
      for (const off of [2.0, 3.5, 4.5]) {
        for (const sess of sessions) {
          for (const tp of [14.0, 15.0, 16.0, 18.0]) {
            evaluateCandidate(
              'Donchian Channel Retest',
              `Donchian L${d.len} Tol${tol} [${sess.name}] TP${tp}`,
              { len: d.len, tol, crashAtr, off, sess: sess.id, tp, sl: 13.75 },
              (i) => {
                const h = utcHour[i];
                if (h < sess.s || h > sess.e || (sess.x12 && h === 12)) return 0;
                const passCrash = close[i] >= (ema50[i] - crashAtr * atr14[i]);
                const lower = d.l[i - 1] + tol * atr14[i];
                const upper = d.h[i - 1] - tol * atr14[i];

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

// =========================================================================
// 3. TRIPLE EMA DYNAMIC TREND RIBBON (EMA 9 / 21 / 50 / 200)
// =========================================================================
console.log('Testing Triple EMA Ribbon Momentum...');
for (const fLen of [8, 10, 12]) {
  const fEma = calcEMA(close, fLen);
  for (const mLen of [21, 26, 30]) {
    const mEma = calcEMA(close, mLen);
    for (const tolAtr of [-0.2, 0.0, 0.25, 0.5]) {
      for (const crashAtr of [1.1, 1.25, 1.4]) {
        for (const sess of sessions) {
          for (const tp of [14.0, 15.0, 16.0, 18.0]) {
            evaluateCandidate(
              'Triple EMA Ribbon Momentum',
              `Ribbon EMA${fLen}/${mLen} Tol${tolAtr} [${sess.name}] TP${tp}`,
              { fLen, mLen, tolAtr, crashAtr, sess: sess.id, tp, sl: 13.75 },
              (i) => {
                const h = utcHour[i];
                if (h < sess.s || h > sess.e || (sess.x12 && h === 12)) return 0;
                const passCrash = close[i] >= (ema50[i] - crashAtr * atr14[i]);

                const bullRibbon = fEma[i] > mEma[i] && mEma[i] > ema50[i] && close[i] > (ema200[i] + 3.0);
                const bullPullback = bullRibbon && passCrash && low[i] <= (mEma[i] + tolAtr * atr14[i]) && close[i] > mEma[i] && close[i] > open[i] && rsi14[i] < 55;

                const bearRibbon = fEma[i] < mEma[i] && mEma[i] < ema50[i] && close[i] < ema200[i];
                const bearPullback = bearRibbon && high[i] >= (mEma[i] - tolAtr * atr14[i]) && close[i] < mEma[i] && close[i] < open[i] && rsi14[i] > 45;

                if (bullPullback) return 1;
                if (bearPullback) return -1;
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

// =========================================================================
// 4. MACD HISTOGRAM REVERSAL & IMPULSE (12, 26, 9)
// =========================================================================
console.log('Testing MACD Momentum Impulse...');
const macdLine = new Float64Array(N);
const ema12 = calcEMA(close, 12);
const ema26 = calcEMA(close, 26);
for (let i = 0; i < N; i++) macdLine[i] = ema12[i] - ema26[i];
const macdSignal = calcEMA(macdLine, 9);
const macdHist = new Float64Array(N);
for (let i = 0; i < N; i++) macdHist[i] = macdLine[i] - macdSignal[i];

for (const off of [2.0, 3.5, 4.5]) {
  for (const crashAtr of [1.1, 1.25, 1.4]) {
    for (const sess of sessions) {
      for (const tp of [14.0, 15.0, 16.0, 18.0]) {
        evaluateCandidate(
          'MACD Momentum Impulse',
          `MACD Impulse Off${off} [${sess.name}] TP${tp}`,
          { off, crashAtr, sess: sess.id, tp, sl: 13.75 },
          (i) => {
            const h = utcHour[i];
            if (h < sess.s || h > sess.e || (sess.x12 && h === 12)) return 0;
            const passCrash = close[i] >= (ema50[i] - crashAtr * atr14[i]);

            // Long: Macro bull trend + MACD hist crosses above 0 or turns upward after oversold dip
            const macdTurnUp = macdHist[i] > macdHist[i - 1] && macdHist[i - 1] < 0 && macdLine[i] < 0;
            const longSig = passCrash && close[i] > (ema200[i] + off) && macdTurnUp && close[i] > open[i] && rsi14[i] < 52;

            const macdTurnDown = macdHist[i] < macdHist[i - 1] && macdHist[i - 1] > 0 && macdLine[i] > 0;
            const shortSig = close[i] < ema200[i] && ema50[i] < ema200[i] && macdTurnDown && close[i] < open[i] && rsi14[i] > 48;

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

console.log(`\n=======================================================`);
console.log(`TOTAL CANDIDATES FOUND: ${found.length}`);
console.log(`=======================================================`);

// Sort by (WinRate * TotalR)
found.sort((a, b) => (b.wr * b.totalR) - (a.wr * a.totalR));

// Breakdown by family
const byFam = {};
for (const f of found) {
  if (!byFam[f.family]) byFam[f.family] = [];
  byFam[f.family].push(f);
}

for (const fam of Object.keys(byFam)) {
  console.log(`\n--- FAMILY: ${fam} (${byFam[fam].length} strategies) ---`);
  byFam[fam].slice(0, 5).forEach((c, idx) => {
    console.log(`  [${idx + 1}] ${c.name}`);
    console.log(`      Trades: ${c.tradesCount} (${c.wins}W / ${c.losses}L) | WR: ${c.wr.toFixed(2)}% | Net: +$${c.netProfit.toFixed(2)} (+${c.totalR.toFixed(2)}R)`);
    console.log(`      Calmar: ${c.calmar.toFixed(2)} | ProfitFactor: ${c.profitFactor.toFixed(2)} | MaxDD: $${c.maxDd.toFixed(2)} | S1 Overlap: ${c.overlapWithS1}/${c.tradesCount}`);
    console.log(`      Monthly R: Aug +${c.mReturns[7].toFixed(2)}R | Sep +${c.mReturns[8].toFixed(2)}R | Oct +${c.mReturns[9].toFixed(2)}R | Nov +${c.mReturns[10].toFixed(2)}R`);
  });
}

// Find candidates with zero S1 overlap!
const zeroOverlap = found.filter(c => c.overlapWithS1 === 0);
console.log(`\n=======================================================`);
console.log(`CANDIDATES WITH ZERO (0) S1 OVERLAP: ${zeroOverlap.length}`);
console.log(`=======================================================`);
zeroOverlap.slice(0, 10).forEach((c, idx) => {
  console.log(`  [#${idx + 1}] [${c.family}] ${c.name}`);
  console.log(`      Trades: ${c.tradesCount} (${c.wins}W / ${c.losses}L) | WR: ${c.wr.toFixed(2)}% | Net: +$${c.netProfit.toFixed(2)} (+${c.totalR.toFixed(2)}R)`);
  console.log(`      Calmar: ${c.calmar.toFixed(2)} | ProfitFactor: ${c.profitFactor.toFixed(2)} | MaxDD: $${c.maxDd.toFixed(2)}`);
  console.log(`      Monthly R: Aug +${c.mReturns[7].toFixed(2)}R | Sep +${c.mReturns[8].toFixed(2)}R | Oct +${c.mReturns[9].toFixed(2)}R | Nov +${c.mReturns[10].toFixed(2)}R`);
});

fs.writeFileSync('C:/Users/samee/Desktop/Pine/deep_diverse_found.json', JSON.stringify(found, null, 2), 'utf8');
fs.writeFileSync('C:/Users/samee/Desktop/Pine/zero_overlap_champions.json', JSON.stringify(zeroOverlap, null, 2), 'utf8');

