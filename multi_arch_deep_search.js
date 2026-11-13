const fs = require('fs');
const { dsXAU, dsNAS, dsSPX, dsEUR, simulate, s1Set } = require('./sim_framework');

const qualified = [];

console.log('--- EXHAUSTIVE MULTI-ARCHITECTURE DIVERSE STRATEGY SEARCH ---');

// =========================================================================
// 1. GOLD ARCHITECTURES (SEARCHING FOR LOW/ZERO S1 OVERLAP STRATEGIES)
// =========================================================================
console.log('\n[1/4] Exploring Gold (XAUUSD 15M) Alternative Indicator Architectures...');

const ema20 = dsXAU.calcEMA(20);
const ema34 = dsXAU.calcEMA(34);
const ema50 = dsXAU.calcEMA(50);
const ema100 = dsXAU.calcEMA(100);
const ema200 = dsXAU.calcEMA(200);
const rsi7 = dsXAU.calcRSI(7);
const rsi14 = dsXAU.calcRSI(14);
const atr14 = dsXAU.atr14;

// Cache SMAs & StDevs for Gold
const smaLengths = [14, 20, 21, 30, 34, 40, 50];
const smaMap = {};
const stdevMap = {};
for (const len of smaLengths) {
  const sma = dsXAU.calcSMA(len);
  smaMap[len] = sma;
  stdevMap[len] = dsXAU.calcStDev(len, sma);
}

// 1A. Keltner Channel Architecture on Gold (EMA 20/34 + kMult * ATR)
console.log('Testing Gold Keltner Volatility Envelopes...');
for (const kLen of [20, 34]) {
  const basis = kLen === 20 ? ema20 : ema34;
  for (const kMult of [2.0, 2.2, 2.4, 2.6, 2.8]) {
    for (const tp of [14.0, 15.0, 16.0, 18.0]) {
      for (const sl of [13.75, 14.50]) {
        for (const sH of [1, 3, 6, 8, 12, 13]) {
          for (const eH of [18, 20, 21]) {
            const longCond = new Uint8Array(dsXAU.n);
            const shortCond = new Uint8Array(dsXAU.n);

            for (let i = 200; i < dsXAU.n; i++) {
              const h = dsXAU.utcHour[i];
              if (h >= sH && h <= eH && (sH <= 11 && eH >= 13 ? h !== 12 : true)) {
                const upper = basis[i] + kMult * atr14[i];
                const lower = basis[i] - kMult * atr14[i];
                const bull = dsXAU.close[i] > ema200[i] + 2.0;
                const bear = dsXAU.close[i] < ema200[i] && ema50[i] < ema200[i];
                const passCrash = dsXAU.close[i] >= (ema50[i] - 1.25 * atr14[i]);

                if (passCrash && bull && dsXAU.low[i] <= lower && dsXAU.close[i] > dsXAU.open[i] && rsi14[i] < 53) longCond[i] = 1;
                if (bear && dsXAU.high[i] >= upper && dsXAU.close[i] < dsXAU.open[i] && rsi14[i] > 48) shortCond[i] = 1;
              }
            }

            const res = simulate(dsXAU, longCond, shortCond, tp, sl, 2, 1);
            if (res && res.wr >= 78.0 && res.calmar >= 4.0 && res.trades >= 20) {
              // Calculate overlap with S1
              let overlap = 0;
              for (const t of res.tradesList) {
                if (s1Set.has(t.entryTime)) overlap++;
              }
              const decorrelation = ((res.trades - overlap) / res.trades) * 100;
              qualified.push({
                asset: 'XAUUSD',
                arch: `Gold Keltner (${kLen} EMA, ${kMult}x ATR)`,
                session: `${sH}:00-${eH}:00 UTC`,
                params: { kLen, kMult, tp, sl, sH, eH },
                trades: res.trades,
                wins: res.wins,
                wr: res.wr.toFixed(1),
                net: res.net.toFixed(2),
                maxDD: res.maxDD.toFixed(2),
                calmar: res.calmar.toFixed(1),
                augR: res.moR[7].toFixed(2),
                sepR: res.moR[8].toFixed(2),
                octR: res.moR[9].toFixed(2),
                novR: res.moR[10].toFixed(2),
                totalR: (res.moR[7] + res.moR[8] + res.moR[9] + res.moR[10]).toFixed(2),
                s1Overlap: overlap,
                decorrelation: decorrelation.toFixed(1)
              });
            }
          }
        }
      }
    }
  }
}

// 1B. Different Lookback Bollinger (14, 20, 34, 40) on Gold
console.log('Testing Gold Non-28 Bollinger & Macro Bands...');
for (const len of [14, 20, 34, 40]) {
  const sma = smaMap[len];
  const stdev = stdevMap[len];
  for (const bMult of [1.9, 2.0, 2.1, 2.2, 2.3]) {
    for (const tp of [14.0, 15.0, 16.0, 18.0]) {
      for (const sl of [13.75, 14.50]) {
        for (const off of [1.5, 3.0, 4.5]) {
          for (const sH of [1, 6, 12, 13]) {
            for (const eH of [18, 20, 21]) {
              const longCond = new Uint8Array(dsXAU.n);
              const shortCond = new Uint8Array(dsXAU.n);

              for (let i = 200; i < dsXAU.n; i++) {
                const h = dsXAU.utcHour[i];
                if (h >= sH && h <= eH && (sH <= 11 && eH >= 13 ? h !== 12 : true)) {
                  const upper = sma[i] + bMult * stdev[i];
                  const lower = sma[i] - bMult * stdev[i];
                  const bull = dsXAU.close[i] > ema200[i] + off;
                  const bear = dsXAU.close[i] < ema200[i] && ema50[i] < ema200[i];
                  const passCrash = dsXAU.close[i] >= (ema50[i] - 1.25 * atr14[i]);

                  if (passCrash && bull && dsXAU.low[i] <= lower && dsXAU.close[i] > dsXAU.open[i] && rsi14[i] < 53) longCond[i] = 1;
                  if (bear && dsXAU.high[i] >= upper && dsXAU.close[i] < dsXAU.open[i] && rsi14[i] > 48) shortCond[i] = 1;
                }
              }

              const res = simulate(dsXAU, longCond, shortCond, tp, sl, 2, 1);
              if (res && res.wr >= 78.0 && res.calmar >= 4.0 && res.trades >= 20) {
                let overlap = 0;
                for (const t of res.tradesList) {
                  if (s1Set.has(t.entryTime)) overlap++;
                }
                const decorrelation = ((res.trades - overlap) / res.trades) * 100;
                qualified.push({
                  asset: 'XAUUSD',
                  arch: `Gold Bollinger (${len} SMA, ${bMult} sigma)`,
                  session: `${sH}:00-${eH}:00 UTC`,
                  params: { len, bMult, tp, sl, off, sH, eH },
                  trades: res.trades,
                  wins: res.wins,
                  wr: res.wr.toFixed(1),
                  net: res.net.toFixed(2),
                  maxDD: res.maxDD.toFixed(2),
                  calmar: res.calmar.toFixed(1),
                  augR: res.moR[7].toFixed(2),
                  sepR: res.moR[8].toFixed(2),
                  octR: res.moR[9].toFixed(2),
                  novR: res.moR[10].toFixed(2),
                  totalR: (res.moR[7] + res.moR[8] + res.moR[9] + res.moR[10]).toFixed(2),
                  s1Overlap: overlap,
                  decorrelation: decorrelation.toFixed(1)
                });
              }
            }
          }
        }
      }
    }
  }
}

// 1C. Asian Session Sweep (00:00 - 06:00 UTC Range) Traded in London/NY
console.log('Testing Gold Asian Range Sweeps & Breakouts...');
// Precompute Asian Range High & Low
const asianHigh = new Float64Array(dsXAU.n);
const asianLow = new Float64Array(dsXAU.n);
let curDay = -1;
let curAsianH = -Infinity;
let curAsianL = Infinity;
for (let i = 0; i < dsXAU.n; i++) {
  const d = dsXAU.utcDay[i];
  const h = dsXAU.utcHour[i];
  if (d !== curDay) {
    curDay = d;
    curAsianH = -Infinity;
    curAsianL = Infinity;
  }
  if (h >= 0 && h <= 6) {
    if (dsXAU.high[i] > curAsianH) curAsianH = dsXAU.high[i];
    if (dsXAU.low[i] < curAsianL) curAsianL = dsXAU.low[i];
  }
  asianHigh[i] = curAsianH;
  asianLow[i] = curAsianL;
}

for (const tp of [12.0, 14.0, 16.0, 18.0]) {
  for (const sl of [12.0, 13.75, 14.50]) {
    for (const rsiFilter of [45, 50, 55]) {
      const longCond = new Uint8Array(dsXAU.n);
      const shortCond = new Uint8Array(dsXAU.n);

      for (let i = 200; i < dsXAU.n; i++) {
        const h = dsXAU.utcHour[i];
        if (h >= 7 && h <= 17 && asianHigh[i] > -Infinity && asianLow[i] < Infinity) {
          // Asian Low Sweep & Reversal: low penetrates asianLow but close snaps back above asianLow
          const lowSweep = dsXAU.low[i] < asianLow[i] && dsXAU.close[i] > asianLow[i] && dsXAU.close[i] > dsXAU.open[i];
          // Asian High Sweep & Reversal: high penetrates asianHigh but close snaps back below asianHigh
          const highSweep = dsXAU.high[i] > asianHigh[i] && dsXAU.close[i] < asianHigh[i] && dsXAU.close[i] < dsXAU.open[i];

          const bull = dsXAU.close[i] > ema200[i];
          const bear = dsXAU.close[i] < ema200[i];

          if (lowSweep && bull && rsi14[i] < rsiFilter) longCond[i] = 1;
          if (highSweep && bear && rsi14[i] > (100 - rsiFilter)) shortCond[i] = 1;
        }
      }

      const res = simulate(dsXAU, longCond, shortCond, tp, sl, 2, 1);
      if (res && res.wr >= 75.0 && res.calmar >= 3.5 && res.trades >= 15) {
        let overlap = 0;
        for (const t of res.tradesList) {
          if (s1Set.has(t.entryTime)) overlap++;
        }
        const decorrelation = ((res.trades - overlap) / res.trades) * 100;
        qualified.push({
          asset: 'XAUUSD',
          arch: 'Gold Asian Range Liquidity Sweep',
          session: '07:00-17:00 UTC',
          params: { tp, sl, rsiFilter },
          trades: res.trades,
          wins: res.wins,
          wr: res.wr.toFixed(1),
          net: res.net.toFixed(2),
          maxDD: res.maxDD.toFixed(2),
          calmar: res.calmar.toFixed(1),
          augR: res.moR[7].toFixed(2),
          sepR: res.moR[8].toFixed(2),
          octR: res.moR[9].toFixed(2),
          novR: res.moR[10].toFixed(2),
          totalR: (res.moR[7] + res.moR[8] + res.moR[9] + res.moR[10]).toFixed(2),
          s1Overlap: overlap,
          decorrelation: decorrelation.toFixed(1)
        });
      }
    }
  }
}

// =========================================================================
// 2. NASDAQ 100 ARCHITECTURES (SEARCHING FOR CANDIDATES ON NAS100)
// =========================================================================
console.log('\n[2/4] Exploring NASDAQ 100 (NAS100 15M)...');

const nasEma20 = dsNAS.calcEMA(20);
const nasEma50 = dsNAS.calcEMA(50);
const nasEma200 = dsNAS.calcEMA(200);
const nasRsi14 = dsNAS.calcRSI(14);
const nasAtr14 = dsNAS.atr14;

// Test NAS100 Session Sweeps, Keltner & Bands
for (const tp of [40, 50, 60, 80, 100]) {
  for (const sl of [35, 45, 55, 75, 90]) {
    if (tp < sl) continue; // TP >= SL rule
    for (const mult of [1.8, 2.0, 2.2, 2.4, 2.6]) {
      for (const sH of [7, 13, 14]) {
        for (const eH of [17, 19, 21]) {
          const longCond = new Uint8Array(dsNAS.n);
          const shortCond = new Uint8Array(dsNAS.n);

          for (let i = 200; i < dsNAS.n; i++) {
            const h = dsNAS.utcHour[i];
            if (h >= sH && h <= eH) {
              const upper = nasEma20[i] + mult * nasAtr14[i];
              const lower = nasEma20[i] - mult * nasAtr14[i];
              const bull = dsNAS.close[i] > nasEma200[i] + 10;
              const bear = dsNAS.close[i] < nasEma200[i] - 10;

              if (bull && dsNAS.low[i] <= lower && dsNAS.close[i] > dsNAS.open[i] && nasRsi14[i] < 55) longCond[i] = 1;
              if (bear && dsNAS.high[i] >= upper && dsNAS.close[i] < dsNAS.open[i] && nasRsi14[i] > 45) shortCond[i] = 1;
            }
          }

          const res = simulate(dsNAS, longCond, shortCond, tp, sl, 2, 1);
          if (res && res.wr >= 75.0 && res.calmar >= 3.0 && res.trades >= 15) {
            qualified.push({
              asset: 'NAS100',
              arch: `NAS100 Keltner Momentum Reversal (${mult}x ATR)`,
              session: `${sH}:00-${eH}:00 UTC`,
              params: { mult, tp, sl, sH, eH },
              trades: res.trades,
              wins: res.wins,
              wr: res.wr.toFixed(1),
              net: res.net.toFixed(2),
              maxDD: res.maxDD.toFixed(2),
              calmar: res.calmar.toFixed(1),
              augR: res.moR[7].toFixed(2),
              sepR: res.moR[8].toFixed(2),
              octR: res.moR[9].toFixed(2),
              novR: res.moR[10].toFixed(2),
              totalR: (res.moR[7] + res.moR[8] + res.moR[9] + res.moR[10]).toFixed(2),
              s1Overlap: 0,
              decorrelation: '100.0'
            });
          }
        }
      }
    }
  }
}

// =========================================================================
// 3. S&P 500 & EUR/USD ARCHITECTURES
// =========================================================================
console.log('\n[3/4] Exploring S&P 500 & EUR/USD (15M)...');

const spxEma20 = dsSPX.calcEMA(20);
const spxEma200 = dsSPX.calcEMA(200);
const spxAtr14 = dsSPX.atr14;
const spxRsi14 = dsSPX.calcRSI(14);

for (const tp of [10, 12, 15, 20]) {
  for (const sl of [10, 12, 15, 18]) {
    if (tp < sl) continue;
    for (const mult of [1.8, 2.0, 2.2, 2.5]) {
      const longCond = new Uint8Array(dsSPX.n);
      const shortCond = new Uint8Array(dsSPX.n);

      for (let i = 200; i < dsSPX.n; i++) {
        const h = dsSPX.utcHour[i];
        if (h >= 13 && h <= 20) {
          const upper = spxEma20[i] + mult * spxAtr14[i];
          const lower = spxEma20[i] - mult * spxAtr14[i];
          if (dsSPX.close[i] > spxEma200[i] && dsSPX.low[i] <= lower && dsSPX.close[i] > dsSPX.open[i] && spxRsi14[i] < 55) longCond[i] = 1;
          if (dsSPX.close[i] < spxEma200[i] && dsSPX.high[i] >= upper && dsSPX.close[i] < dsSPX.open[i] && spxRsi14[i] > 45) shortCond[i] = 1;
        }
      }

      const res = simulate(dsSPX, longCond, shortCond, tp, sl, 2, 1);
      if (res && res.wr >= 75.0 && res.calmar >= 3.0 && res.trades >= 15) {
        qualified.push({
          asset: 'SPX500',
          arch: `SPX500 Keltner (${mult}x ATR)`,
          session: '13:00-20:00 UTC',
          params: { mult, tp, sl },
          trades: res.trades,
          wins: res.wins,
          wr: res.wr.toFixed(1),
          net: res.net.toFixed(2),
          maxDD: res.maxDD.toFixed(2),
          calmar: res.calmar.toFixed(1),
          augR: res.moR[7].toFixed(2),
          sepR: res.moR[8].toFixed(2),
          octR: res.moR[9].toFixed(2),
          novR: res.moR[10].toFixed(2),
          totalR: (res.moR[7] + res.moR[8] + res.moR[9] + res.moR[10]).toFixed(2),
          s1Overlap: 0,
          decorrelation: '100.0'
        });
      }
    }
  }
}

// EURUSD Asian Range Sweep & Keltner
const eurEma20 = dsEUR.calcEMA(20);
const eurEma200 = dsEUR.calcEMA(200);
const eurAtr14 = dsEUR.atr14;
const eurRsi14 = dsEUR.calcRSI(14);

for (const tp of [0.0010, 0.0012, 0.0015, 0.0018]) {
  for (const sl of [0.0010, 0.0012, 0.0015]) {
    if (tp < sl) continue;
    for (const mult of [2.0, 2.2, 2.5, 2.8]) {
      const longCond = new Uint8Array(dsEUR.n);
      const shortCond = new Uint8Array(dsEUR.n);

      for (let i = 200; i < dsEUR.n; i++) {
        const h = dsEUR.utcHour[i];
        if (h >= 7 && h <= 17) {
          const upper = eurEma20[i] + mult * eurAtr14[i];
          const lower = eurEma20[i] - mult * eurAtr14[i];
          if (dsEUR.close[i] > eurEma200[i] && dsEUR.low[i] <= lower && dsEUR.close[i] > dsEUR.open[i] && eurRsi14[i] < 55) longCond[i] = 1;
          if (dsEUR.close[i] < eurEma200[i] && dsEUR.high[i] >= upper && dsEUR.close[i] < dsEUR.open[i] && eurRsi14[i] > 45) shortCond[i] = 1;
        }
      }

      const res = simulate(dsEUR, longCond, shortCond, tp, sl, 2, 1);
      if (res && res.wr >= 75.0 && res.calmar >= 3.0 && res.trades >= 15) {
        qualified.push({
          asset: 'EURUSD',
          arch: `EURUSD Keltner (${mult}x ATR)`,
          session: '07:00-17:00 UTC',
          params: { mult, tp, sl },
          trades: res.trades,
          wins: res.wins,
          wr: res.wr.toFixed(1),
          net: res.net.toFixed(5),
          maxDD: res.maxDD.toFixed(5),
          calmar: res.calmar.toFixed(1),
          augR: res.moR[7].toFixed(2),
          sepR: res.moR[8].toFixed(2),
          octR: res.moR[9].toFixed(2),
          novR: res.moR[10].toFixed(2),
          totalR: (res.moR[7] + res.moR[8] + res.moR[9] + res.moR[10]).toFixed(2),
          s1Overlap: 0,
          decorrelation: '100.0'
        });
      }
    }
  }
}

console.log(`\n[4/4] Search Complete! Total high-performance candidates found: ${qualified.length}`);

// Filter for candidates with HIGH DECORRELATION from S1 (<= 10 overlapping trades, or 0 for other assets)
const diverseCandidates = qualified.filter(c => parseFloat(c.decorrelation) >= 60.0);
console.log(`Candidates with >= 60% Decorrelation from Strategy 1: ${diverseCandidates.length}`);

// Sort by decorrelation, then win rate, then total R
diverseCandidates.sort((a, b) => {
  return parseFloat(b.decorrelation) - parseFloat(a.decorrelation) ||
         parseFloat(b.wr) - parseFloat(a.wr) ||
         parseFloat(b.totalR) - parseFloat(a.totalR);
});

console.log('\n===============================================================================');
console.log('TOP 25 GENUINELY DIFFERENT STRATEGIES WITH DIFFERENT TRADES & SAME RULES:');
console.log('===============================================================================');

for (let i = 0; i < Math.min(25, diverseCandidates.length); i++) {
  const c = diverseCandidates[i];
  console.log(`\n#${i + 1} | Asset: ${c.asset} | ${c.arch} [${c.session}]`);
  console.log(`   WR: ${c.wr}% (${c.wins}W / ${c.trades - c.wins}L, ${c.trades}T) | Calmar: ${c.calmar} | Net: +${c.totalR}R`);
  console.log(`   S1 Overlap: ${c.s1Overlap} trades | Decorrelation: ${c.decorrelation}% DIFFERENT TRADES!`);
  console.log(`   Monthly R: Aug +${c.augR}R | Sep +${c.sepR}R | Oct +${c.octR}R | Nov +${c.novR}R`);
  console.log(`   Params: ${JSON.stringify(c.params)}`);
}

fs.writeFileSync('all_new_diverse_matches.json', JSON.stringify(diverseCandidates, null, 2));
