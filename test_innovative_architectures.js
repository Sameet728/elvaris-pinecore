const sim = require('./sim_framework');

const {
  N, open, high, low, close, time, utcHour, utcDay, utcMonth,
  atr14, rsi14, ema50, ema100, ema200, calcEMA, calcATR, runSimulation,
  s1Times
} = sim;

console.log('=== Testing Innovative Math Architectures for Gold 15M ===');

// 1. VWMA (Volume Weighted Moving Average)
const volume = sim.rawCandles.map(c => c.volume);
function calcVWMA(len) {
  const vwma = new Float64Array(N);
  for (let i = len - 1; i < N; i++) {
    let sumPv = 0, sumV = 0;
    for (let j = 0; j < len; j++) {
      const idx = i - j;
      sumPv += close[idx] * volume[idx];
      sumV += volume[idx];
    }
    vwma[i] = sumV === 0 ? close[i] : sumPv / sumV;
  }
  return vwma;
}

// 2. HMA (Hull Moving Average)
function calcWMA(src, len) {
  const wma = new Float64Array(N);
  const weightSum = (len * (len + 1)) / 2;
  for (let i = len - 1; i < N; i++) {
    let s = 0;
    for (let j = 0; j < len; j++) {
      s += src[i - j] * (len - j);
    }
    wma[i] = s / weightSum;
  }
  return wma;
}

function calcHMA(len) {
  const halfLen = Math.floor(len / 2);
  const sqrtLen = Math.floor(Math.sqrt(len));
  const wmaHalf = calcWMA(close, halfLen);
  const wmaFull = calcWMA(close, len);
  const diff = new Float64Array(N);
  for (let i = len - 1; i < N; i++) {
    diff[i] = 2 * wmaHalf[i] - wmaFull[i];
  }
  return calcWMA(diff, sqrtLen);
}

// 3. Linear Regression (LinReg) Channel
function calcLinReg(len) {
  const lr = new Float64Array(N);
  const se = new Float64Array(N);
  for (let i = len - 1; i < N; i++) {
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let j = 0; j < len; j++) {
      const x = j;
      const y = close[i - (len - 1 - j)];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }
    const slope = (len * sumXY - sumX * sumY) / (len * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / len;
    lr[i] = intercept + slope * (len - 1);

    // standard error
    let sumSqErr = 0;
    for (let j = 0; j < len; j++) {
      const x = j;
      const y = close[i - (len - 1 - j)];
      const yHat = intercept + slope * x;
      sumSqErr += (y - yHat) * (y - yHat);
    }
    se[i] = Math.sqrt(sumSqErr / len);
  }
  return { lr, se };
}

const sessions = [
  { name: 'London Core (3-14)', s: 3, e: 14, x12: false },
  { name: 'NY Momentum (13-21)', s: 13, e: 21, x12: false },
  { name: 'Global Day (1-20 exc 12)', s: 1, e: 20, x12: true }
];

const newResults = [];

// A. Test VWMA + ATR Channel (Volume-Weighted)
console.log('Testing VWMA (Volume-Weighted Volatility Envelope)...');
for (const vLen of [15, 20, 25, 30]) {
  const vwma = calcVWMA(vLen);
  for (const vMult of [1.7, 1.85, 2.0, 2.2]) {
    for (const sess of sessions) {
      for (const tp of [14.0, 16.0, 18.0]) {
        const sl = 13.75;
        const res = runSimulation((i) => {
          const h = utcHour[i];
          if (h < sess.s || h > sess.e || (sess.x12 && h === 12)) return 0;
          const passCrash = close[i] >= (ema50[i] - 1.25 * atr14[i]);
          const upper = vwma[i] + vMult * atr14[i];
          const lower = vwma[i] - vMult * atr14[i];

          const longSig = passCrash && close[i] > (ema200[i] + 3.0) && low[i] <= lower && close[i] > open[i] && rsi14[i] < 53;
          const shortSig = close[i] < ema200[i] && ema50[i] < ema200[i] && high[i] >= upper && close[i] < open[i] && rsi14[i] > 49;

          if (longSig) return 1;
          if (shortSig) return -1;
          return 0;
        }, tp, sl);

        if (res && res.wr >= 80.0 && res.calmar >= 4.0 && res.tradesCount >= 20) {
          newResults.push({
            family: 'Volume-Weighted Moving Average (VWMA) Envelope',
            name: `VWMA L${vLen} Mult${vMult} [${sess.name}] TP${tp}`,
            params: { vLen, vMult, sess: sess.name, tp, sl },
            ...res
          });
        }
      }
    }
  }
}

// B. Test HMA (Hull Moving Average) Envelope
console.log('Testing HMA (Hull Moving Average Zero-Lag Envelope)...');
for (const hLen of [16, 20, 25, 30]) {
  const hma = calcHMA(hLen);
  for (const hMult of [1.8, 2.0, 2.2, 2.4]) {
    for (const sess of sessions) {
      for (const tp of [14.0, 16.0, 18.0]) {
        const sl = 13.75;
        const res = runSimulation((i) => {
          const h = utcHour[i];
          if (h < sess.s || h > sess.e || (sess.x12 && h === 12)) return 0;
          const passCrash = close[i] >= (ema50[i] - 1.25 * atr14[i]);
          const upper = hma[i] + hMult * atr14[i];
          const lower = hma[i] - hMult * atr14[i];

          const longSig = passCrash && close[i] > (ema200[i] + 3.0) && low[i] <= lower && close[i] > open[i] && rsi14[i] < 53;
          const shortSig = close[i] < ema200[i] && ema50[i] < ema200[i] && high[i] >= upper && close[i] < open[i] && rsi14[i] > 49;

          if (longSig) return 1;
          if (shortSig) return -1;
          return 0;
        }, tp, sl);

        if (res && res.wr >= 80.0 && res.calmar >= 4.0 && res.tradesCount >= 20) {
          newResults.push({
            family: 'Hull Zero-Lag Moving Average (HMA) Envelope',
            name: `HMA L${hLen} Mult${hMult} [${sess.name}] TP${tp}`,
            params: { hLen, hMult, sess: sess.name, tp, sl },
            ...res
          });
        }
      }
    }
  }
}

// C. Test Linear Regression Trend Channel
console.log('Testing Linear Regression Trend Channel...');
for (const lrLen of [20, 25, 30]) {
  const { lr, se } = calcLinReg(lrLen);
  for (const seMult of [1.8, 2.0, 2.2]) {
    for (const sess of sessions) {
      for (const tp of [14.0, 16.0, 18.0]) {
        const sl = 13.75;
        const res = runSimulation((i) => {
          const h = utcHour[i];
          if (h < sess.s || h > sess.e || (sess.x12 && h === 12)) return 0;
          const passCrash = close[i] >= (ema50[i] - 1.25 * atr14[i]);
          const upper = lr[i] + seMult * se[i];
          const lower = lr[i] - seMult * se[i];

          const longSig = passCrash && close[i] > (ema200[i] + 3.0) && low[i] <= lower && close[i] > open[i] && rsi14[i] < 53;
          const shortSig = close[i] < ema200[i] && ema50[i] < ema200[i] && high[i] >= upper && close[i] < open[i] && rsi14[i] > 49;

          if (longSig) return 1;
          if (shortSig) return -1;
          return 0;
        }, tp, sl);

        if (res && res.wr >= 80.0 && res.calmar >= 4.0 && res.tradesCount >= 20) {
          newResults.push({
            family: 'Linear Regression Channel',
            name: `LinReg L${lrLen} Mult${seMult} [${sess.name}] TP${tp}`,
            params: { lrLen, seMult, sess: sess.name, tp, sl },
            ...res
          });
        }
      }
    }
  }
}

console.log(`\nFound ${newResults.length} new champions in innovative mathematical architectures!`);

// Group by family and display
const groups = {};
for (const r of newResults) {
  if (!groups[r.family]) groups[r.family] = [];
  groups[r.family].push(r);
}

for (const fam of Object.keys(groups)) {
  console.log(`\n=======================================================`);
  console.log(`FAMILY: ${fam} (${groups[fam].length} strategies)`);
  console.log(`=======================================================`);
  groups[fam].sort((a, b) => b.calmar - a.calmar).slice(0, 3).forEach((c, idx) => {
    console.log(`  #${idx + 1}: ${c.name}`);
    console.log(`      Trades: ${c.tradesCount} (${c.wins}W / ${c.losses}L) | WR: ${c.wr.toFixed(2)}% | Net: +$${c.netProfit.toFixed(2)} (+${c.totalR.toFixed(2)}R)`);
    console.log(`      Calmar: ${c.calmar.toFixed(2)} | ProfitFactor: ${c.profitFactor.toFixed(2)} | MaxDD: $${c.maxDd.toFixed(2)} | S1 Overlap: ${c.overlapWithS1}/${c.tradesCount}`);
    console.log(`      Monthly R: Aug +${c.mReturns[7].toFixed(2)}R | Sep +${c.mReturns[8].toFixed(2)}R | Oct +${c.mReturns[9].toFixed(2)}R | Nov +${c.mReturns[10].toFixed(2)}R`);
  });
}

fs.writeFileSync('C:/Users/samee/Desktop/Pine/innovative_architectures_champions.json', JSON.stringify(newResults, null, 2), 'utf8');

