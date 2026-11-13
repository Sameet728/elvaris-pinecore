const fs = require('fs');
const {
  candles, N, calcEMA, calcSMA, calcStDev, calcRSI, calcATR,
  ema20, ema50, ema200, rsi14, atr14, evaluateStrategy
} = require('./fast_8r_engine');

console.log('Searching for Elite Strategies with:');
console.log(' - Win Rate >= 80.0%');
console.log(' - Calmar >= 4.0');
console.log(' - August >= +8.0R');
console.log(' - September >= +8.0R');
console.log(' - October >= +8.0R');
console.log(' - November >= +1.5R (on pace)');

const allMatches = [];

// =========================================================================
// 1. BOLLINGER BAND ARCHITECTURES (Testing various sessions and filters)
// =========================================================================
for (let bandLen of [24, 26, 28, 30]) {
  const sma = calcSMA(bandLen);
  for (let mult of [2.0, 2.1, 2.2, 2.3, 2.4]) {
    const sd = calcStDev(bandLen, sma);
    const upper = new Float64Array(N);
    const lower = new Float64Array(N);
    for (let i = bandLen - 1; i < N; i++) {
      upper[i] = sma[i] + mult * sd[i];
      lower[i] = sma[i] - mult * sd[i];
    }

    for (let session of [
      { name: 'Sess_01_16', start: 1, end: 16 },
      { name: 'Sess_01_18', start: 1, end: 18 },
      { name: 'Sess_01_20', start: 1, end: 20 },
      { name: 'Sess_06_20', start: 6, end: 20 },
      { name: 'Sess_00_21', start: 0, end: 21 },
      { name: 'Sess_12_22', start: 12, end: 22 }
    ]) {
      for (let tp of [13.0, 14.0, 15.0, 16.0, 17.0, 18.0]) {
        for (let sl of [12.0, 13.0, 13.75, 14.0]) {
          for (let rsiFilter of [50, 52, 54]) {
            for (let emaOffset of [0.0, 2.0, 4.0]) {
              for (let crashFilter of [0.0, 1.0, 1.25]) {
                const signals = new Array(N);
                for (let i = 200; i < N; i++) {
                  const c = candles[i];
                  const h = new Date(c.openTime).getUTCHours();
                  if (h < session.start || h > session.end) continue;

                  const passCrash = crashFilter === 0.0 || (c.close >= (ema50[i] - crashFilter * atr14[i]));

                  if (c.close > (ema200[i] + emaOffset) && c.low <= lower[i] && c.close > c.open && rsi14[i] < rsiFilter && passCrash) {
                    signals[i] = 'LONG';
                  } else if (c.close < ema200[i] && ema50[i] < ema200[i] && c.high >= upper[i] && c.close < c.open && rsi14[i] > (100 - rsiFilter)) {
                    signals[i] = 'SHORT';
                  }
                }

                const res = evaluateStrategy(signals, tp, sl);
                if (res && res.winRate >= 80.0 && res.calmar >= 4.0) {
                  // Check monthly criteria
                  if (res.augR >= 8.0 && res.sepR >= 8.0 && res.octR >= 8.0 && res.novR >= 1.5) {
                    allMatches.push({
                      type: 'Bollinger_Band',
                      session: session.name,
                      params: { bandLen, mult, tp, sl, rsiFilter, emaOffset, crashFilter },
                      ...res
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

console.log(`Bollinger Band Architecture found ${allMatches.length} matches satisfying all monthly 8R rules!`);

// =========================================================================
// 2. KELTNER CHANNEL ARCHITECTURES (Testing dynamic ATR envelopes)
// =========================================================================
let keltnerMatches = 0;
for (let emaLen of [15, 20, 25, 30]) {
  const centerEMA = calcEMA(emaLen);
  for (let atrMult of [1.6, 1.8, 2.0, 2.2, 2.4]) {
    for (let session of [
      { name: 'Sess_01_16', start: 1, end: 16 },
      { name: 'Sess_01_20', start: 1, end: 20 },
      { name: 'Sess_06_20', start: 6, end: 20 },
      { name: 'Sess_00_21', start: 0, end: 21 },
      { name: 'Sess_12_22', start: 12, end: 22 }
    ]) {
      for (let tp of [12.0, 13.0, 14.0, 15.0, 16.0, 17.0]) {
        for (let sl of [12.0, 13.0, 13.75, 14.0]) {
          for (let rsiFilter of [50, 52, 54]) {
            for (let crashFilter of [0.0, 1.0, 1.25]) {
              const signals = new Array(N);
              for (let i = 200; i < N; i++) {
                const c = candles[i];
                const h = new Date(c.openTime).getUTCHours();
                if (h < session.start || h > session.end) continue;

                const upper = centerEMA[i] + atrMult * atr14[i];
                const lower = centerEMA[i] - atrMult * atr14[i];
                const passCrash = crashFilter === 0.0 || (c.close >= (ema50[i] - crashFilter * atr14[i]));

                if (c.close > ema200[i] && c.low <= lower && c.close > c.open && rsi14[i] < rsiFilter && passCrash) {
                  signals[i] = 'LONG';
                } else if (c.close < ema200[i] && ema50[i] < ema200[i] && c.high >= upper && c.close < c.open && rsi14[i] > (100 - rsiFilter)) {
                  signals[i] = 'SHORT';
                }
              }

              const res = evaluateStrategy(signals, tp, sl);
              if (res && res.winRate >= 80.0 && res.calmar >= 4.0) {
                if (res.augR >= 8.0 && res.sepR >= 8.0 && res.octR >= 8.0 && res.novR >= 1.5) {
                  allMatches.push({
                    type: 'Keltner_Channel',
                    session: session.name,
                    params: { emaLen, atrMult, tp, sl, rsiFilter, crashFilter },
                    ...res
                  });
                  keltnerMatches++;
                }
              }
            }
          }
        }
      }
    }
  }
}

console.log(`Keltner Channel Architecture found ${keltnerMatches} matches!`);
console.log(`Total 8R-Compliant Candidates: ${allMatches.length}`);

fs.writeFileSync('all_8r_candidates.json', JSON.stringify(allMatches, null, 2));

// Sort by total R and calmar
allMatches.sort((a, b) => (b.augR + b.sepR + b.octR + b.novR) - (a.augR + a.sepR + a.octR + a.novR));

allMatches.slice(0, 10).forEach((c, idx) => {
  const totR = (c.augR + c.sepR + c.octR + c.novR).toFixed(2);
  console.log(`\n#${idx + 1} [${c.type} - ${c.session}] Trades=${c.total} | WR=${c.winRate.toFixed(1)}% | Calmar=${c.calmar.toFixed(1)} | Total R=+${totR}R`);
  console.log(`   Aug: +${c.augR.toFixed(2)}R | Sep: +${c.sepR.toFixed(2)}R | Oct: +${c.octR.toFixed(2)}R | Nov: +${c.novR.toFixed(2)}R`);
  console.log(`   Params:`, c.params);
});

