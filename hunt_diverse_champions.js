const fs = require('fs');
const sim = require('./sim_framework');

const {
  N, open, high, low, close, time, utcHour, utcDay, utcMonth,
  atr14, rsi14, ema9, ema15, ema21, ema50, ema100, ema200,
  calcEMA, calcATR, calcHighest, calcLowest, runSimulation, s1Times
} = sim;

console.log('=== Hunting for Additional Diverse 80%+ Champions ===');

const matches = [];

// Let's test diverse setups across different indicator families
// 1. Dual-EMA Dynamic Volatility Envelope (Fast EMA 34/40/50 + ATR)
for (const eLen of [30, 35, 40, 45, 50]) {
  const cEma = calcEMA(close, eLen);
  for (const mult of [1.65, 1.75, 1.85, 1.95, 2.05, 2.15]) {
    for (const tp of [15.0, 16.0, 17.0, 18.0]) {
      const sl = 13.75;
      for (const off of [1.0, 2.0, 3.0, 4.0]) {
        for (const sess of [
          { name: 'London Morning (3-12)', s: 3, e: 12, x12: false },
          { name: 'London Core (4-14)', s: 4, e: 14, x12: false },
          { name: 'NY Afternoon (13-21)', s: 13, e: 21, x12: false },
          { name: 'US Extended (12-22)', s: 12, e: 22, x12: false },
          { name: 'Full Session (1-20 exc 12)', s: 1, e: 20, x12: true }
        ]) {
          const res = runSimulation((i) => {
            const h = utcHour[i];
            if (h < sess.s || h > sess.e || (sess.x12 && h === 12)) return 0;
            const upper = cEma[i] + mult * atr14[i];
            const lower = cEma[i] - mult * atr14[i];

            const longSig = close[i] > (ema200[i] + off) && low[i] <= lower && close[i] > open[i] && rsi14[i] < 53;
            const shortSig = close[i] < ema200[i] && ema50[i] < ema200[i] && high[i] >= upper && close[i] < open[i] && rsi14[i] > 49;

            if (longSig) return 1;
            if (shortSig) return -1;
            return 0;
          }, tp, sl);

          if (res && res.wr >= 80.0 && res.calmar >= 4.0 && res.tradesCount >= 20) {
            matches.push({
              family: 'Dual-EMA ATR Envelope',
              name: `DualEMA L${eLen} M${mult} [${sess.name}] TP${tp}`,
              params: { eLen, mult, off, sess: sess.name, tp, sl },
              ...res
            });
          }
        }
      }
    }
  }
}

// 2. Keltner Channel with Fast ATR (ATR 10 instead of ATR 14)
console.log('Testing Keltner with Fast ATR (ATR 10)...');
const atr10 = calcATR(10);
for (const kLen of [15, 20, 25]) {
  const kCenter = calcEMA(close, kLen);
  for (const mult of [1.7, 1.8, 1.9, 2.0, 2.1]) {
    for (const tp of [15.0, 16.0, 17.0, 18.0]) {
      const sl = 13.75;
      for (const off of [1.5, 2.5, 3.5]) {
        for (const sess of [
          { name: 'US Extended (12-22)', s: 12, e: 22, x12: false },
          { name: 'NY Afternoon (13-21)', s: 13, e: 21, x12: false },
          { name: 'London Core (4-15)', s: 4, e: 15, x12: false },
          { name: 'Full Session (1-20 exc 12)', s: 1, e: 20, x12: true }
        ]) {
          const res = runSimulation((i) => {
            const h = utcHour[i];
            if (h < sess.s || h > sess.e || (sess.x12 && h === 12)) return 0;
            const upper = kCenter[i] + mult * atr10[i];
            const lower = kCenter[i] - mult * atr10[i];

            const longSig = close[i] > (ema200[i] + off) && low[i] <= lower && close[i] > open[i] && rsi14[i] < 53;
            const shortSig = close[i] < ema200[i] && ema50[i] < ema200[i] && high[i] >= upper && close[i] < open[i] && rsi14[i] > 49;

            if (longSig) return 1;
            if (shortSig) return -1;
            return 0;
          }, tp, sl);

          if (res && res.wr >= 80.0 && res.calmar >= 4.0 && res.tradesCount >= 20) {
            matches.push({
              family: 'Keltner Channel (Fast ATR-10)',
              name: `Keltner-FastATR P${kLen} M${mult} [${sess.name}] TP${tp}`,
              params: { kLen, mult, off, sess: sess.name, tp, sl },
              ...res
            });
          }
        }
      }
    }
  }
}

// 3. London Open Session Breakout / Core Expansion with Keltner Volatility
console.log('Testing London Open Session Core...');
for (const kLen of [14, 16, 18, 20]) {
  const kCenter = calcEMA(close, kLen);
  for (const mult of [1.7, 1.85, 2.0, 2.15]) {
    for (const tp of [14.0, 15.0, 16.0]) {
      const sl = 13.75;
      for (const sess of [
        { name: 'London Morning Open (5-13)', s: 5, e: 13, x12: false },
        { name: 'London Expansion (6-14)', s: 6, e: 14, x12: false },
        { name: 'London Core (4-12)', s: 4, e: 12, x12: false }
      ]) {
        const res = runSimulation((i) => {
          const h = utcHour[i];
          if (h < sess.s || h > sess.e || (sess.x12 && h === 12)) return 0;
          const upper = kCenter[i] + mult * atr14[i];
          const lower = kCenter[i] - mult * atr14[i];

          const longSig = close[i] > (ema200[i] + 2.0) && low[i] <= lower && close[i] > open[i] && rsi14[i] < 53;
          const shortSig = close[i] < ema200[i] && ema50[i] < ema200[i] && high[i] >= upper && close[i] < open[i] && rsi14[i] > 49;

          if (longSig) return 1;
          if (shortSig) return -1;
          return 0;
        }, tp, sl);

        if (res && res.wr >= 80.0 && res.calmar >= 4.0 && res.tradesCount >= 18) {
          matches.push({
            family: 'London Session Volatility Expansion',
            name: `London-Keltner P${kLen} M${mult} [${sess.name}] TP${tp}`,
            params: { kLen, mult, sess: sess.name, tp, sl },
            ...res
          });
        }
      }
    }
  }
}

console.log(`\nFound ${matches.length} distinct champions!`);
matches.sort((a, b) => b.totalR - a.totalR);

const famMap = {};
for (const m of matches) {
  if (!famMap[m.family]) famMap[m.family] = [];
  famMap[m.family].push(m);
}

for (const fam of Object.keys(famMap)) {
  console.log(`\n=======================================================`);
  console.log(`FAMILY: ${fam} (${famMap[fam].length} champions)`);
  console.log(`=======================================================`);
  famMap[fam].slice(0, 3).forEach((c, idx) => {
    console.log(` [${idx + 1}] ${c.name}`);
    console.log(`     Trades: ${c.tradesCount} (${c.wins}W / ${c.losses}L) | WR: ${c.wr.toFixed(2)}% | Net: +$${c.netProfit.toFixed(2)} (+${c.totalR.toFixed(2)}R)`);
    console.log(`     Calmar: ${c.calmar.toFixed(2)} | ProfitFactor: ${c.profitFactor.toFixed(2)} | MaxDD: $${c.maxDd.toFixed(2)} | S1 Overlap: ${c.overlapWithS1}/${c.tradesCount}`);
    console.log(`     Monthly R: Aug +${c.mReturns[7].toFixed(2)}R | Sep +${c.mReturns[8].toFixed(2)}R | Oct +${c.mReturns[9].toFixed(2)}R | Nov +${c.mReturns[10].toFixed(2)}R`);
  });
}

fs.writeFileSync('C:/Users/samee/Desktop/Pine/all_new_diverse_matches.json', JSON.stringify(matches, null, 2), 'utf8');
