import fs from 'fs';
import path from 'path';

const dataDir = 'c:/Users/samee/Desktop/Pine/quant_sector_etf/data';
const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, 'manifest.json'), 'utf8'));

// Load all ETF daily bars
const etfMap = new Map();
const allDates = new Set();

for (const item of manifest) {
  const filePath = path.join(dataDir, item.file);
  const bars = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  const dateMap = new Map();
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const dStr = new Date(b.time).toISOString().slice(0, 10);
    dateMap.set(dStr, {
      idx: i,
      time: b.time,
      close: b.close,
      open: b.open,
      high: b.high,
      low: b.low,
      volume: b.volume
    });
    allDates.add(dStr);
  }

  etfMap.set(item.symbol, {
    info: item,
    bars,
    dateMap
  });
}

const masterDates = Array.from(allDates).sort();

// Find month-end dates (last trading day of each month)
const monthEndDates = [];
for (let i = 0; i < masterDates.length - 1; i++) {
  const curMonth = masterDates[i].slice(0, 7);
  const nextMonth = masterDates[i + 1].slice(0, 7);
  if (curMonth !== nextMonth) {
    monthEndDates.push(masterDates[i]);
  }
}
monthEndDates.push(masterDates[masterDates.length - 1]);

console.log(`Loaded ${etfMap.size} ETFs. Master dates: ${masterDates[0]} to ${masterDates[masterDates.length - 1]} (${masterDates.length} days, ${monthEndDates.length} month-ends).`);

// Helper: Calculate returns over trading days
function getTrailingReturn(symbol, dateStr, lookbackDays) {
  const etf = etfMap.get(symbol);
  if (!etf) return null;
  const bar = etf.dateMap.get(dateStr);
  if (!bar || bar.idx < lookbackDays) return null;
  const pastBar = etf.bars[bar.idx - lookbackDays];
  if (!pastBar || pastBar.close <= 0) return null;
  return ((bar.close - pastBar.close) / pastBar.close) * 100;
}

function getClose(symbol, dateStr) {
  const etf = etfMap.get(symbol);
  if (!etf) return null;
  const bar = etf.dateMap.get(dateStr);
  return bar ? bar.close : null;
}

function getSMA(symbol, dateStr, period) {
  const etf = etfMap.get(symbol);
  if (!etf) return null;
  const bar = etf.dateMap.get(dateStr);
  if (!bar || bar.idx < period - 1) return null;
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += etf.bars[bar.idx - i].close;
  }
  return sum / period;
}

// 1. Keller's 13612W Momentum Score
// Formula: 12*R1 + 4*R3 + 2*R6 + 1*R12 (returns in fractions)
function getKeller13612W(symbol, dateStr) {
  const r1 = getTrailingReturn(symbol, dateStr, 21);
  const r3 = getTrailingReturn(symbol, dateStr, 63);
  const r6 = getTrailingReturn(symbol, dateStr, 126);
  const r12 = getTrailingReturn(symbol, dateStr, 252);
  if (r1 === null || r3 === null || r6 === null || r12 === null) return null;
  return 12 * (r1 / 100) + 4 * (r3 / 100) + 2 * (r6 / 100) + 1 * (r12 / 100);
}

// 2. Keller's HAA Uniform 1-3-6-12 Momentum Score
// Formula: (R1 + R3 + R6 + R12) / 4
function getHaaMomentum(symbol, dateStr) {
  const r1 = getTrailingReturn(symbol, dateStr, 21);
  const r3 = getTrailingReturn(symbol, dateStr, 63);
  const r6 = getTrailingReturn(symbol, dateStr, 126);
  const r12 = getTrailingReturn(symbol, dateStr, 252);
  if (r1 === null || r3 === null || r6 === null || r12 === null) return null;
  return (r1 + r3 + r6 + r12) / 4;
}

// 3. Simple 12-Month Momentum (Antonacci Dual Momentum)
function getAntonacciMomentum(symbol, dateStr) {
  return getTrailingReturn(symbol, dateStr, 252);
}

// SIMULATOR FUNCTION FOR MONTHLY REBALANCING TAA STRATEGIES
function simulateMonthlyTAA(strategyConfig) {
  const {
    name,
    startDate = '2016-01-01',
    endDate = '2026-10-23',
    initialCapital = 1000000,
    selectAssetsFn, // (dateStr) => { allocations: [{ symbol, weight }] }
    cashYieldAnnualPct = 6.5,
    slippageBrokeragePct = 0.05 // 5 bps round-trip transaction drag
  } = strategyConfig;

  const validDates = masterDates.filter(d => d >= startDate && d <= endDate);
  const validMonthEnds = new Set(monthEndDates.filter(d => d >= startDate && d <= endDate));

  const dailyCashInterest = Math.pow(1 + (cashYieldAnnualPct / 100), 1 / 252) - 1;

  let capital = initialCapital;
  let currentHoldings = []; // [{ symbol, shares, cost }]
  let currentCash = initialCapital;
  const dailyEquity = [];
  const rebalances = [];

  for (let d = 0; d < validDates.length; d++) {
    const dateStr = validDates[d];

    // Accrue interest on cash
    if (currentCash > 0 && cashYieldAnnualPct > 0) {
      currentCash += currentCash * dailyCashInterest;
    }

    // Check if month-end rebalance day
    const isRebalanceDay = validMonthEnds.has(dateStr);

    if (isRebalanceDay) {
      // 1. Calculate current total equity before rebalance
      let currentVal = currentCash;
      for (const h of currentHoldings) {
        const c = getClose(h.symbol, dateStr) || h.cost;
        currentVal += h.shares * c;
      }

      // 2. Get target allocation from strategy logic
      const target = selectAssetsFn(dateStr);
      const allocations = target.allocations; // array of { symbol, weight }

      // 3. Liquidate current holdings
      let newCash = currentVal;
      // Deduct friction on turnover
      newCash -= currentVal * (slippageBrokeragePct / 100);

      // 4. Buy target allocations
      const newHoldings = [];
      let remCash = newCash;

      for (const alloc of allocations) {
        if (alloc.weight <= 0) continue;
        if (alloc.symbol === 'CASH') {
          // Keep in cash
          continue;
        }

        const closeP = getClose(alloc.symbol, dateStr);
        if (!closeP) continue;

        const allocAmt = newCash * alloc.weight;
        const shares = Math.floor(allocAmt / closeP);
        if (shares > 0) {
          const cost = shares * closeP;
          remCash -= cost;
          newHoldings.push({
            symbol: alloc.symbol,
            shares,
            buyPrice: closeP,
            weight: alloc.weight
          });
        }
      }

      currentHoldings = newHoldings;
      currentCash = remCash;

      rebalances.push({
        date: dateStr,
        portfolioValue: Math.round(newCash),
        regime: target.regime || 'NORMAL',
        allocations: target.allocations.map(a => `${a.symbol} (${(a.weight * 100).toFixed(0)}%)`).join(', ')
      });
    }

    // Daily Mark to Market
    let dayHoldingsVal = 0;
    for (const h of currentHoldings) {
      const c = getClose(h.symbol, dateStr) || h.buyPrice;
      dayHoldingsVal += h.shares * c;
    }
    const totalEq = currentCash + dayHoldingsVal;
    dailyEquity.push({
      date: dateStr,
      equity: totalEq,
      cash: currentCash,
      holdingsVal: dayHoldingsVal
    });
  }

  // Calculate comprehensive metrics
  const finalEq = dailyEquity[dailyEquity.length - 1].equity;
  const totalReturnPct = ((finalEq - initialCapital) / initialCapital) * 100;
  const years = (new Date(validDates[validDates.length - 1]) - new Date(validDates[0])) / (1000 * 60 * 60 * 24 * 365.25);
  const cagr = (Math.pow(finalEq / initialCapital, 1 / years) - 1) * 100;

  // Drawdown
  let peak = -Infinity;
  let maxDD = 0;
  for (const de of dailyEquity) {
    if (de.equity > peak) peak = de.equity;
    const dd = ((peak - de.equity) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  const calmar = maxDD > 0 ? cagr / maxDD : 0;

  // Monthly returns for Sharpe
  const monthlyRets = [];
  for (let i = 1; i < rebalances.length; i++) {
    const r = ((rebalances[i].portfolioValue - rebalances[i - 1].portfolioValue) / rebalances[i - 1].portfolioValue) * 100;
    monthlyRets.push(r);
  }
  const meanM = monthlyRets.reduce((a, b) => a + b, 0) / monthlyRets.length;
  const stdM = Math.sqrt(monthlyRets.reduce((a, b) => a + Math.pow(b - meanM, 2), 0) / monthlyRets.length);
  const annualizedSharpe = stdM > 0 ? (meanM * 12 - 6.5) / (stdM * Math.sqrt(12)) : 0;

  // Year by year breakdown
  const yearly = {};
  for (const de of dailyEquity) {
    const y = de.date.slice(0, 4);
    if (!yearly[y]) {
      yearly[y] = { start: de.equity, end: de.equity, peak: de.equity, maxDD: 0 };
    }
    yearly[y].end = de.equity;
    if (de.equity > yearly[y].peak) yearly[y].peak = de.equity;
    const dd = ((yearly[y].peak - de.equity) / yearly[y].peak) * 100;
    if (dd > yearly[y].maxDD) yearly[y].maxDD = dd;
  }

  const yearlyTable = {};
  for (const [y, data] of Object.entries(yearly)) {
    yearlyTable[y] = {
      return: Number((((data.end - data.start) / data.start) * 100).toFixed(2)),
      maxDD: Number(data.maxDD.toFixed(2))
    };
  }

  return {
    name,
    cagr: Number(cagr.toFixed(2)),
    totalReturnPct: Number(totalReturnPct.toFixed(2)),
    finalCapital: Math.round(finalEq),
    maxDrawdown: Number(maxDD.toFixed(2)),
    calmar: Number(calmar.toFixed(2)),
    sharpe: Number(annualizedSharpe.toFixed(2)),
    rebalancesCount: rebalances.length,
    yearlyTable,
    recentRebalances: rebalances.slice(-5)
  };
}

// DEFINE THE STRATEGIES

// Universe definitions
const offensiveUniverse = [
  'NSE:NIFTYBEES',
  'NSE:JUNIORBEES',
  'NSE:BANKBEES',
  'NSE:PSUBNKBEES',
  'NSE:ITBEES',
  'NSE:CPSEETF',
  'NSE:AUTOBEES',
  'NSE:MON100',
  'NSE:MAFANG',
  'NSE:SILVERBEES'
];

const defensiveUniverse = ['NSE:GOLDBEES', 'CASH'];

// 1. STRATEGY 1: Pure Buy & Hold Nifty 50 (Benchmark)
const stratNifty = simulateMonthlyTAA({
  name: 'Benchmark: Nifty 50 Buy & Hold (NIFTYBEES)',
  selectAssetsFn: (dateStr) => ({
    regime: 'BENCHMARK',
    allocations: [{ symbol: 'NSE:NIFTYBEES', weight: 1.0 }]
  })
});

// 2. STRATEGY 2: Gary Antonacci Dual Momentum (GEM Indian Adaptation)
// Lookback: 12-Month Momentum
// Check Nifty vs Cash (6.5%). If positive, pick winner between Nifty, Global Tech (MON100), and Gold. If negative, 100% Cash/LiquidBees.
const stratDualMomentum = simulateMonthlyTAA({
  name: 'Gary Antonacci Dual Momentum (GEM Indian Adaptation)',
  selectAssetsFn: (dateStr) => {
    const niftyRet = getAntonacciMomentum('NSE:NIFTYBEES', dateStr);
    const globalRet = getAntonacciMomentum('NSE:MON100', dateStr);
    const goldRet = getAntonacciMomentum('NSE:GOLDBEES', dateStr);

    // Absolute momentum filter: Nifty must be positive over 12 months
    if (niftyRet === null || niftyRet <= 0) {
      // Risk-off: check if Gold is trending, else Cash
      if (goldRet !== null && goldRet > 0) {
        return { regime: 'RISK_OFF_GOLD', allocations: [{ symbol: 'NSE:GOLDBEES', weight: 1.0 }] };
      }
      return { regime: 'RISK_OFF_CASH', allocations: [{ symbol: 'CASH', weight: 1.0 }] };
    }

    // Relative momentum: pick best between Nifty and Global Tech (if available)
    const options = [{ symbol: 'NSE:NIFTYBEES', ret: niftyRet }];
    if (globalRet !== null) options.push({ symbol: 'NSE:MON100', ret: globalRet });
    options.sort((a, b) => b.ret - a.ret);

    return {
      regime: 'RISK_ON',
      allocations: [{ symbol: options[0].symbol, weight: 1.0 }]
    };
  }
});

// 3. STRATEGY 3: Keller's Hybrid Asset Allocation (HAA)
// Canary: NIFTYBEES + GOLDBEES
// Metric: Uniform 1-3-6-12 Momentum
// If Canary score > 0 -> Top 2 Offensive ETFs (50% each)
// If Canary score <= 0 -> 100% Defensive (Gold or Cash)
const stratKellerHAA = simulateMonthlyTAA({
  name: "Keller's Hybrid Asset Allocation (HAA) - Top 2 Sectors",
  selectAssetsFn: (dateStr) => {
    const canaryScore = getHaaMomentum('NSE:NIFTYBEES', dateStr);

    if (canaryScore === null || canaryScore <= 0) {
      // Risk-off: allocate to Gold if Gold momentum > 0, else Cash
      const goldMom = getHaaMomentum('NSE:GOLDBEES', dateStr);
      if (goldMom !== null && goldMom > 0) {
        return { regime: 'DEFENSIVE_GOLD', allocations: [{ symbol: 'NSE:GOLDBEES', weight: 1.0 }] };
      }
      return { regime: 'DEFENSIVE_CASH', allocations: [{ symbol: 'CASH', weight: 1.0 }] };
    }

    // Risk-on: rank offensive assets by HAA momentum
    const scored = [];
    for (const sym of offensiveUniverse) {
      const s = getHaaMomentum(sym, dateStr);
      if (s !== null && s > 0) {
        scored.push({ symbol: sym, score: s });
      }
    }

    if (scored.length === 0) {
      return { regime: 'DEFENSIVE_CASH', allocations: [{ symbol: 'CASH', weight: 1.0 }] };
    }

    scored.sort((a, b) => b.score - a.score);
    const topN = scored.slice(0, 2);

    if (topN.length === 1) {
      return {
        regime: 'RISK_ON_1',
        allocations: [{ symbol: topN[0].symbol, weight: 1.0 }]
      };
    }

    return {
      regime: 'RISK_ON_2',
      allocations: [
        { symbol: topN[0].symbol, weight: 0.5 },
        { symbol: topN[1].symbol, weight: 0.5 }
      ]
    };
  }
});

// 4. STRATEGY 4: Keller's Bold Asset Allocation (BAA-Aggressive)
// Metric: 13612W Fast Momentum (12*R1 + 4*R3 + 2*R6 + 1*R12)
// Canary: NIFTYBEES
// Offensive: Top 1 Highest Momentum Sector ETF (100% concentration on strongest institutional theme)
// Defensive: Gold if 13612W > 0, else Cash
const stratKellerBAA = simulateMonthlyTAA({
  name: "Keller's Bold Asset Allocation (BAA) - Fast 13612W Top 1",
  selectAssetsFn: (dateStr) => {
    const canary = getKeller13612W('NSE:NIFTYBEES', dateStr);

    if (canary === null || canary <= 0) {
      const goldScore = getKeller13612W('NSE:GOLDBEES', dateStr);
      if (goldScore !== null && goldScore > 0) {
        return { regime: 'DEFENSIVE_GOLD', allocations: [{ symbol: 'NSE:GOLDBEES', weight: 1.0 }] };
      }
      return { regime: 'DEFENSIVE_CASH', allocations: [{ symbol: 'CASH', weight: 1.0 }] };
    }

    const scored = [];
    for (const sym of offensiveUniverse) {
      const s = getKeller13612W(sym, dateStr);
      if (s !== null && s > 0) {
        scored.push({ symbol: sym, score: s });
      }
    }

    if (scored.length === 0) {
      return { regime: 'DEFENSIVE_CASH', allocations: [{ symbol: 'CASH', weight: 1.0 }] };
    }

    scored.sort((a, b) => b.score - a.score);
    return {
      regime: 'RISK_ON_MAX_ALPHA',
      allocations: [{ symbol: scored[0].symbol, weight: 1.0 }]
    };
  }
});

// 5. STRATEGY 5: APEX QUANT SECTOR ROTATION (Dual Canary + 200 SMA Trend Filter + Top 2 Sectors)
// Engineered for MAXIMUM CALMAR RATIO:
// Dual Canary: NIFTYBEES + BANKBEES (if EITHER is below 200 SMA OR negative 13612W, trigger defensive hedge)
// Offensive Universe: Top 2 Sector ETFs with 13612W score > 0 AND price > 200 SMA
// Defensive: Splits 50% Gold + 50% LiquidBees Cash when market is in downtrend
const stratApexQuant = simulateMonthlyTAA({
  name: '⭐ APEX Quant Sector Rotation (Dual Canary + 200 SMA + Top 2 Sectors)',
  selectAssetsFn: (dateStr) => {
    const niftyClose = getClose('NSE:NIFTYBEES', dateStr);
    const niftySma = getSMA('NSE:NIFTYBEES', dateStr, 200);
    const niftyMom = getKeller13612W('NSE:NIFTYBEES', dateStr);

    const bankClose = getClose('NSE:BANKBEES', dateStr);
    const bankSma = getSMA('NSE:BANKBEES', dateStr, 200);

    // Trend Health Check
    const niftyHealthy = niftyClose && niftySma && niftyClose > niftySma && niftyMom > 0;
    const bankHealthy = bankClose && bankSma && bankClose > bankSma;

    // If both equity pillars fail, go full defensive
    if (!niftyHealthy && !bankHealthy) {
      const goldClose = getClose('NSE:GOLDBEES', dateStr);
      const goldSma = getSMA('NSE:GOLDBEES', dateStr, 200);
      if (goldClose && goldSma && goldClose > goldSma) {
        return {
          regime: 'FULL_DEFENSE_GOLD_CASH',
          allocations: [
            { symbol: 'NSE:GOLDBEES', weight: 0.5 },
            { symbol: 'CASH', weight: 0.5 }
          ]
        };
      }
      return {
        regime: 'FULL_DEFENSE_100_CASH',
        allocations: [{ symbol: 'CASH', weight: 1.0 }]
      };
    }

    // Rank offensive candidates: must have price > 200 SMA AND score > 0
    const scored = [];
    for (const sym of offensiveUniverse) {
      const c = getClose(sym, dateStr);
      const sma = getSMA(sym, dateStr, 200);
      const score = getKeller13612W(sym, dateStr);
      // If ETF has <200 bars, require score > 0 and close > close 21 days ago
      const passesTrend = sma ? c > sma : true;
      if (score !== null && score > 0 && passesTrend) {
        scored.push({ symbol: sym, score });
      }
    }

    if (scored.length === 0) {
      return {
        regime: 'DEFENSIVE_CASH',
        allocations: [{ symbol: 'CASH', weight: 1.0 }]
      };
    }

    scored.sort((a, b) => b.score - a.score);

    if (scored.length === 1) {
      return {
        regime: 'OFFENSIVE_1_ASSET',
        allocations: [
          { symbol: scored[0].symbol, weight: 0.7 },
          { symbol: 'CASH', weight: 0.3 }
        ]
      };
    }

    // Top 2 assets
    return {
      regime: 'OFFENSIVE_2_ASSETS',
      allocations: [
        { symbol: scored[0].symbol, weight: 0.5 },
        { symbol: scored[1].symbol, weight: 0.5 }
      ]
    };
  }
});

// Run all and print comparative league table
const allStrats = [stratNifty, stratDualMomentum, stratKellerHAA, stratKellerBAA, stratApexQuant];

const leagueTable = allStrats.map(s => ({
  Strategy: s.name,
  CAGR: `${s.cagr}%`,
  TotalReturn: `+${s.totalReturnPct}%`,
  FinalCapital: `₹${(s.finalCapital / 100000).toFixed(2)} Lakhs`,
  MaxDrawdown: `${s.maxDrawdown}%`,
  CalmarRatio: s.calmar,
  SharpeRatio: s.sharpe
}));

console.log('\n--- QUANTITATIVE TACTICAL ASSET ALLOCATION (TAA) STRATEGY COMPARISON ---');
console.table(leagueTable);

fs.writeFileSync(
  path.join(dataDir, 'tactical_etf_comparison_results.json'),
  JSON.stringify(allStrats, null, 2),
  'utf8'
);

console.log('\nYear-by-Year Breakdown for APEX Quant Strategy:');
console.table(stratApexQuant.yearlyTable);
