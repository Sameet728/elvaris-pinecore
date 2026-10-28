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

// Helper functions
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

function getTrailingReturn(symbol, dateStr, lookbackDays) {
  const etf = etfMap.get(symbol);
  if (!etf) return null;
  const bar = etf.dateMap.get(dateStr);
  if (!bar || bar.idx < lookbackDays) return null;
  const pastBar = etf.bars[bar.idx - lookbackDays];
  if (!pastBar || pastBar.close <= 0) return null;
  return ((bar.close - pastBar.close) / pastBar.close) * 100;
}

// Momentum formulas
function getKeller13612W(symbol, dateStr) {
  const r1 = getTrailingReturn(symbol, dateStr, 21);
  const r3 = getTrailingReturn(symbol, dateStr, 63);
  const r6 = getTrailingReturn(symbol, dateStr, 126);
  const r12 = getTrailingReturn(symbol, dateStr, 252);
  if (r1 === null || r3 === null || r6 === null || r12 === null) return null;
  return 12 * (r1 / 100) + 4 * (r3 / 100) + 2 * (r6 / 100) + 1 * (r12 / 100);
}

function getUniform13612(symbol, dateStr) {
  const r1 = getTrailingReturn(symbol, dateStr, 21);
  const r3 = getTrailingReturn(symbol, dateStr, 63);
  const r6 = getTrailingReturn(symbol, dateStr, 126);
  const r12 = getTrailingReturn(symbol, dateStr, 252);
  if (r1 === null || r3 === null || r6 === null || r12 === null) return null;
  return (r1 + r3 + r6 + r12) / 4;
}

function get12mReturn(symbol, dateStr) {
  return getTrailingReturn(symbol, dateStr, 252);
}

function getVolatility(symbol, dateStr, period = 42) {
  const etf = etfMap.get(symbol);
  if (!etf) return null;
  const bar = etf.dateMap.get(dateStr);
  if (!bar || bar.idx < period) return null;
  const rets = [];
  for (let i = 0; i < period; i++) {
    const pCurr = etf.bars[bar.idx - i].close;
    const pPrev = etf.bars[bar.idx - i - 1].close;
    rets.push((pCurr - pPrev) / pPrev);
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / rets.length;
  return Math.sqrt(variance * 252);
}

// Available sector ETFs pool
const offensiveUniverse = [
  'NSE:NIFTYBEES',
  'NSE:JUNIORBEES',
  'NSE:BANKBEES',
  'NSE:PSUBNKBEES',
  'NSE:ITBEES',
  'NSE:CPSEETF',
  'NSE:AUTOBEES',
  'NSE:PHARMABEES',
  'NSE:MON100',
  'NSE:MAFANG',
  'NSE:SILVERBEES'
];

// Unified Generic TAA Simulation Engine
function simulateTAAStrategy(config) {
  const {
    name,
    rebalanceIntervalDays = 15,
    rebalanceOnMonthEnd = false,
    stopLossPct = null,
    trailingStopPct = null,
    cashYieldPct = 6.5,
    commissionPct = 0.05,
    startDate = '2016-01-01',
    endDate = '2026-10-23',
    initialCapital = 1000000,
    allocationFn
  } = config;

  const validDates = masterDates.filter(d => d >= startDate && d <= endDate);
  const dailyCashInterest = Math.pow(1 + (cashYieldPct / 100), 1 / 252) - 1;
  const commFactor = commissionPct / 100;

  let cash = initialCapital;
  let holdings = []; // array of { symbol, shares, buyPrice, peakPrice, weight }
  let daysSinceRebal = rebalanceIntervalDays;
  const dailyEquity = [];
  const rebalanceLog = [];
  let totalTradesCount = 0;
  let winningTradesCount = 0;
  let losingTradesCount = 0;

  for (let d = 0; d < validDates.length; d++) {
    const dateStr = validDates[d];
    const isLastDayOfMonth = d < validDates.length - 1 && dateStr.slice(0, 7) !== validDates[d + 1].slice(0, 7);

    // Accrue interest on idle cash
    if (cash > 0 && cashYieldPct > 0) {
      cash += cash * dailyCashInterest;
    }

    // Daily Circuit Breakers & Trailing Stops
    if (holdings.length > 0 && (stopLossPct !== null || trailingStopPct !== null)) {
      const survivors = [];
      for (const h of holdings) {
        const c = getClose(h.symbol, dateStr);
        if (!c) {
          survivors.push(h);
          continue;
        }

        if (c > h.peakPrice) h.peakPrice = c;
        const lossFromBuy = ((c - h.buyPrice) / h.buyPrice) * 100;
        const dropFromPeak = ((c - h.peakPrice) / h.peakPrice) * 100;

        let triggered = false;
        if (stopLossPct !== null && lossFromBuy <= -stopLossPct) {
          triggered = true;
        } else if (trailingStopPct !== null && dropFromPeak <= -trailingStopPct) {
          triggered = true;
        }

        if (triggered) {
          cash += h.shares * c * (1 - commFactor);
          totalTradesCount++;
          if (c > h.buyPrice) winningTradesCount++;
          else losingTradesCount++;
        } else {
          survivors.push(h);
        }
      }
      holdings = survivors;
    }

    // Check Rebalance Trigger
    let shouldRebalance = false;
    if (rebalanceOnMonthEnd) {
      shouldRebalance = isLastDayOfMonth;
    } else {
      daysSinceRebal++;
      if (daysSinceRebal >= rebalanceIntervalDays) {
        shouldRebalance = true;
        daysSinceRebal = 0;
      }
    }

    if (shouldRebalance) {
      let totalPortfolioVal = cash;
      for (const h of holdings) {
        const c = getClose(h.symbol, dateStr) || h.buyPrice;
        totalPortfolioVal += h.shares * c;
      }

      // Query allocation strategy logic
      const allocDecision = allocationFn(dateStr, totalPortfolioVal);
      const targetAllocs = allocDecision.allocations || [];

      // Record trade wins/losses for closed positions
      const newSymSet = new Set(targetAllocs.map(a => a.symbol));
      for (const h of holdings) {
        if (!newSymSet.has(h.symbol)) {
          const c = getClose(h.symbol, dateStr) || h.buyPrice;
          totalTradesCount++;
          if (c > h.buyPrice) winningTradesCount++;
          else losingTradesCount++;
        }
      }

      // Liquidate current holdings
      cash = totalPortfolioVal * (1 - commFactor);
      const nextHoldings = [];

      for (const alloc of targetAllocs) {
        if (alloc.symbol === 'CASH') continue;
        const c = getClose(alloc.symbol, dateStr);
        if (!c) continue;
        const targetCapital = totalPortfolioVal * alloc.weight;
        const shares = Math.floor(targetCapital / c);
        if (shares > 0) {
          const cost = shares * c;
          cash -= cost;
          nextHoldings.push({
            symbol: alloc.symbol,
            shares,
            buyPrice: c,
            peakPrice: c,
            weight: alloc.weight
          });
        }
      }
      holdings = nextHoldings;

      rebalanceLog.push({
        date: dateStr,
        totalVal: totalPortfolioVal,
        regime: allocDecision.regime || 'NORMAL',
        allocations: targetAllocs
      });
    }

    // Daily equity tracking
    let dailyVal = cash;
    for (const h of holdings) {
      const c = getClose(h.symbol, dateStr) || h.buyPrice;
      dailyVal += h.shares * c;
    }
    dailyEquity.push({ date: dateStr, equity: dailyVal });
  }

  // Calculate Performance Metrics
  const finalVal = dailyEquity[dailyEquity.length - 1].equity;
  const totalReturnPct = ((finalVal - initialCapital) / initialCapital) * 100;
  const years = (new Date(validDates[validDates.length - 1]) - new Date(validDates[0])) / (1000 * 60 * 60 * 24 * 365.25);
  const cagr = (Math.pow(finalVal / initialCapital, 1 / years) - 1) * 100;

  let peak = -Infinity;
  let maxDD = 0;
  const drawdowns = [];

  for (const de of dailyEquity) {
    if (de.equity > peak) peak = de.equity;
    const dd = ((peak - de.equity) / peak) * 100;
    drawdowns.push(dd);
    if (dd > maxDD) maxDD = dd;
  }

  const calmar = maxDD > 0 ? cagr / maxDD : 0;

  // Daily returns for Sharpe and Sortino
  const dailyReturns = [];
  for (let i = 1; i < dailyEquity.length; i++) {
    dailyReturns.push((dailyEquity[i].equity - dailyEquity[i - 1].equity) / dailyEquity[i - 1].equity);
  }
  const meanRet = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((a, b) => a + Math.pow(b - meanRet, 2), 0) / dailyReturns.length;
  const stdDev = Math.sqrt(variance);
  const annualizedVol = stdDev * Math.sqrt(252) * 100;

  const rfrDaily = (cashYieldPct / 100) / 252;
  const excessRet = meanRet - rfrDaily;
  const sharpe = stdDev > 0 ? (excessRet / stdDev) * Math.sqrt(252) : 0;

  const downReturns = dailyReturns.filter(r => r < 0);
  const downVariance = downReturns.length > 0 ? downReturns.reduce((a, b) => a + Math.pow(b, 2), 0) / downReturns.length : 0.0001;
  const sortino = Math.sqrt(downVariance) > 0 ? (excessRet / Math.sqrt(downVariance)) * Math.sqrt(252) : 0;

  // Yearly Breakdown
  const yearly = {};
  for (const de of dailyEquity) {
    const y = de.date.slice(0, 4);
    if (!yearly[y]) yearly[y] = { start: de.equity, end: de.equity, peak: de.equity, maxDD: 0 };
    yearly[y].end = de.equity;
    if (de.equity > yearly[y].peak) yearly[y].peak = de.equity;
    const dd = ((yearly[y].peak - de.equity) / yearly[y].peak) * 100;
    if (dd > yearly[y].maxDD) yearly[y].maxDD = dd;
  }

  const yearlyStats = {};
  for (const [y, d] of Object.entries(yearly)) {
    yearlyStats[y] = {
      return: Number((((d.end - d.start) / d.start) * 100).toFixed(1)),
      maxDD: Number(d.maxDD.toFixed(1))
    };
  }

  // Crash period performance (e.g. Covid: 2020-01-15 to 2020-03-31)
  const covidSlice = dailyEquity.filter(de => de.date >= '2020-01-01' && de.date <= '2020-03-31');
  let covidPeak = -Infinity;
  let covidMaxDD = 0;
  for (const c of covidSlice) {
    if (c.equity > covidPeak) covidPeak = c.equity;
    const dd = ((covidPeak - c.equity) / covidPeak) * 100;
    if (dd > covidMaxDD) covidMaxDD = dd;
  }
  const covidRet = covidSlice.length > 0 ? ((covidSlice[covidSlice.length - 1].equity - covidSlice[0].equity) / covidSlice[0].equity) * 100 : 0;

  // Win rate
  const tradeWinRate = totalTradesCount > 0 ? (winningTradesCount / totalTradesCount) * 100 : 0;

  return {
    name,
    cagr: Number(cagr.toFixed(2)),
    totalReturnPct: Number(totalReturnPct.toFixed(1)),
    finalCapital: Math.round(finalVal),
    maxDrawdown: Number(maxDD.toFixed(2)),
    calmar: Number(calmar.toFixed(2)),
    sharpe: Number(sharpe.toFixed(2)),
    sortino: Number(sortino.toFixed(2)),
    annualizedVol: Number(annualizedVol.toFixed(1)),
    covidMaxDD: Number(covidMaxDD.toFixed(1)),
    covidReturn: Number(covidRet.toFixed(1)),
    totalTrades: totalTradesCount,
    winRate: Number(tradeWinRate.toFixed(1)),
    yearlyStats
  };
}

// ==========================================
// 1. BENCHMARKS
// ==========================================

// 1A. Nifty 50 Buy & Hold
const benchNifty = simulateTAAStrategy({
  name: '1. Benchmark: Nifty 50 Buy & Hold (NIFTYBEES)',
  rebalanceIntervalDays: 252,
  cashYieldPct: 0,
  allocationFn: () => ({
    regime: 'BUY_AND_HOLD',
    allocations: [{ symbol: 'NSE:NIFTYBEES', weight: 1.0 }]
  })
});

// 1B. 60/40 Equity-Gold Rebalanced Annually
const bench6040 = simulateTAAStrategy({
  name: '2. Benchmark: 60/40 Equity-Gold (60% NIFTYBEES / 40% GOLDBEES)',
  rebalanceIntervalDays: 252,
  cashYieldPct: 6.5,
  allocationFn: () => ({
    regime: '60_40_STATIC',
    allocations: [
      { symbol: 'NSE:NIFTYBEES', weight: 0.6 },
      { symbol: 'NSE:GOLDBEES', weight: 0.4 }
    ]
  })
});

// 1C. Permanent All-Weather ETF (25% Large, 25% Next50, 25% Gold, 25% Liquid Cash)
const benchAllWeather = simulateTAAStrategy({
  name: '3. Benchmark: All-Weather 4-Asset (Nifty, Junior, Gold, Cash 25% each)',
  rebalanceIntervalDays: 63,
  cashYieldPct: 6.5,
  allocationFn: () => ({
    regime: 'ALL_WEATHER_STATIC',
    allocations: [
      { symbol: 'NSE:NIFTYBEES', weight: 0.25 },
      { symbol: 'NSE:JUNIORBEES', weight: 0.25 },
      { symbol: 'NSE:GOLDBEES', weight: 0.25 },
      { symbol: 'CASH', weight: 0.25 }
    ]
  })
});

// ==========================================
// 2. CLASSICAL TACTICAL ALLOCATION STRATEGIES
// ==========================================

// 2A. Meb Faber's GTAA (Global Tactical Asset Allocation)
// 5 core assets: NIFTYBEES, BANKBEES, MON100, GOLDBEES, CPSEETF.
// Hold 20% in each asset IF price > 200 SMA; if below, hold cash. Rebalance monthly.
const stratFaberGTAA = simulateTAAStrategy({
  name: '4. Meb Faber GTAA (Trend Following 5-Asset, 200 SMA Filter)',
  rebalanceOnMonthEnd: true,
  cashYieldPct: 6.5,
  allocationFn: (dateStr) => {
    const universe = ['NSE:NIFTYBEES', 'NSE:BANKBEES', 'NSE:MON100', 'NSE:GOLDBEES', 'NSE:CPSEETF'];
    const allocs = [];
    const unitWeight = 1.0 / universe.length;
    for (const sym of universe) {
      const c = getClose(sym, dateStr);
      const sma = getSMA(sym, dateStr, 200);
      if (c && sma && c > sma) {
        allocs.push({ symbol: sym, weight: unitWeight });
      } else {
        allocs.push({ symbol: 'CASH', weight: unitWeight });
      }
    }
    return { regime: 'GTAA_TREND', allocations: allocs };
  }
});

// 2B. Gary Antonacci's GEM (Dual Momentum)
// Compare 12M return of NIFTYBEES vs MON100 (Global Tech).
// If best return > 0, hold top 1; else hold GOLDBEES if Gold 12M > 0, else CASH.
const stratAntonacciGEM = simulateTAAStrategy({
  name: '5. Gary Antonacci GEM (Global Equity Momentum / Dual Momentum)',
  rebalanceOnMonthEnd: true,
  cashYieldPct: 6.5,
  allocationFn: (dateStr) => {
    const rNifty = get12mReturn('NSE:NIFTYBEES', dateStr) || -999;
    const rNasdaq = get12mReturn('NSE:MON100', dateStr) || -999;
    const bestSym = rNasdaq > rNifty ? 'NSE:MON100' : 'NSE:NIFTYBEES';
    const bestRet = Math.max(rNifty, rNasdaq);

    if (bestRet > 0) {
      return { regime: 'RISK_ON_EQUITY', allocations: [{ symbol: bestSym, weight: 1.0 }] };
    } else {
      const rGold = get12mReturn('NSE:GOLDBEES', dateStr) || -999;
      if (rGold > 0) {
        return { regime: 'DEFENSIVE_GOLD', allocations: [{ symbol: 'NSE:GOLDBEES', weight: 1.0 }] };
      }
      return { regime: 'DEFENSIVE_CASH', allocations: [{ symbol: 'CASH', weight: 1.0 }] };
    }
  }
});

// 2C. Dr. Wouter Keller's VAA-G (Vigilant Asset Allocation - Geared / Aggressive)
// 4 Canary Assets: NIFTYBEES, BANKBEES, MON100, GOLDBEES.
// Canary check: If ALL 4 have 13612W score > 0 -> 100% Top 1 Offensive Sector.
// If ANY 1 canary has score < 0 -> 100% Defensive (Gold or Cash).
const stratKellerVAA_G = simulateTAAStrategy({
  name: '6. Keller VAA-G (Vigilant Asset Allocation - Geared Aggressive)',
  rebalanceOnMonthEnd: true,
  cashYieldPct: 6.5,
  allocationFn: (dateStr) => {
    const canaries = ['NSE:NIFTYBEES', 'NSE:BANKBEES', 'NSE:MON100', 'NSE:GOLDBEES'];
    let anyBad = false;
    for (const c of canaries) {
      const sc = getKeller13612W(c, dateStr);
      if (sc === null || sc < 0) {
        anyBad = true;
        break;
      }
    }

    if (anyBad) {
      // 100% Defensive
      const gScore = getKeller13612W('NSE:GOLDBEES', dateStr);
      if (gScore && gScore > 0) {
        return { regime: 'VAA_DEFENSE_GOLD', allocations: [{ symbol: 'NSE:GOLDBEES', weight: 1.0 }] };
      }
      return { regime: 'VAA_DEFENSE_CASH', allocations: [{ symbol: 'CASH', weight: 1.0 }] };
    }

    // Top 1 Offensive Asset
    const scored = [];
    for (const sym of offensiveUniverse) {
      const sc = getKeller13612W(sym, dateStr);
      if (sc !== null && sc > 0) scored.push({ symbol: sym, score: sc });
    }
    if (scored.length === 0) return { regime: 'CASH', allocations: [{ symbol: 'CASH', weight: 1.0 }] };
    scored.sort((a, b) => b.score - a.score);
    return { regime: 'VAA_OFFENSIVE_TOP1', allocations: [{ symbol: scored[0].symbol, weight: 1.0 }] };
  }
});

// 2D. Dr. Wouter Keller's DAA (Defensive Asset Allocation)
// Canary Assets: NIFTYBEES, BANKBEES.
// If both bad -> 100% Defensive. If 1 bad -> 50% Defensive / 50% Top 2 Offensive. If 0 bad -> 100% Top 2 Offensive.
const stratKellerDAA = simulateTAAStrategy({
  name: '7. Keller DAA (Defensive Asset Allocation - Multi-Regime)',
  rebalanceOnMonthEnd: true,
  cashYieldPct: 6.5,
  allocationFn: (dateStr) => {
    const scNifty = getKeller13612W('NSE:NIFTYBEES', dateStr) || -1;
    const scBank = getKeller13612W('NSE:BANKBEES', dateStr) || -1;
    let badCount = 0;
    if (scNifty < 0) badCount++;
    if (scBank < 0) badCount++;

    const scored = [];
    for (const sym of offensiveUniverse) {
      const sc = getKeller13612W(sym, dateStr);
      if (sc !== null && sc > 0) scored.push({ symbol: sym, score: sc });
    }
    scored.sort((a, b) => b.score - a.score);

    const gScore = getKeller13612W('NSE:GOLDBEES', dateStr) || -1;
    const defSym = gScore > 0 ? 'NSE:GOLDBEES' : 'CASH';

    if (badCount === 2 || scored.length === 0) {
      return { regime: 'DAA_FULL_DEFENSE', allocations: [{ symbol: defSym, weight: 1.0 }] };
    } else if (badCount === 1) {
      return {
        regime: 'DAA_HALF_DEFENSE',
        allocations: [
          { symbol: defSym, weight: 0.5 },
          { symbol: scored[0].symbol, weight: 0.25 },
          { symbol: scored.length > 1 ? scored[1].symbol : defSym, weight: 0.25 }
        ]
      };
    } else {
      return {
        regime: 'DAA_FULL_OFFENSE',
        allocations: [
          { symbol: scored[0].symbol, weight: 0.5 },
          { symbol: scored.length > 1 ? scored[1].symbol : defSym, weight: 0.5 }
        ]
      };
    }
  }
});

// 2E. Dr. Wouter Keller's HAA (Hybrid Asset Allocation)
const stratKellerHAA = simulateTAAStrategy({
  name: '8. Keller HAA (Hybrid Asset Allocation - Top 2 Sectors)',
  rebalanceOnMonthEnd: true,
  cashYieldPct: 6.5,
  allocationFn: (dateStr) => {
    const niftyScore = getUniform13612('NSE:NIFTYBEES', dateStr);
    if (niftyScore === null || niftyScore < 0) {
      const gScore = getUniform13612('NSE:GOLDBEES', dateStr);
      if (gScore && gScore > 0) return { regime: 'HAA_DEFENSE_GOLD', allocations: [{ symbol: 'NSE:GOLDBEES', weight: 1.0 }] };
      return { regime: 'HAA_DEFENSE_CASH', allocations: [{ symbol: 'CASH', weight: 1.0 }] };
    }

    const scored = [];
    for (const sym of offensiveUniverse) {
      const s = getUniform13612(sym, dateStr);
      if (s !== null && s > 0) scored.push({ symbol: sym, score: s });
    }
    if (scored.length === 0) return { regime: 'CASH', allocations: [{ symbol: 'CASH', weight: 1.0 }] };
    scored.sort((a, b) => b.score - a.score);
    return {
      regime: 'HAA_OFFENSIVE_TOP2',
      allocations: [
        { symbol: scored[0].symbol, weight: 0.5 },
        { symbol: scored.length > 1 ? scored[1].symbol : 'CASH', weight: 0.5 }
      ]
    };
  }
});

// 2F. Dr. Wouter Keller's BAA (Bold Asset Allocation - Top 1 Alpha Hunter)
const stratKellerBAA = simulateTAAStrategy({
  name: '9. Keller BAA (Bold Asset Allocation - Top 1 Max Alpha)',
  rebalanceOnMonthEnd: true,
  cashYieldPct: 6.5,
  allocationFn: (dateStr) => {
    const scNifty = getKeller13612W('NSE:NIFTYBEES', dateStr);
    const scBank = getKeller13612W('NSE:BANKBEES', dateStr);
    if ((scNifty !== null && scNifty < 0) || (scBank !== null && scBank < 0)) {
      const gScore = getKeller13612W('NSE:GOLDBEES', dateStr);
      if (gScore && gScore > 0) return { regime: 'BAA_DEFENSE_GOLD', allocations: [{ symbol: 'NSE:GOLDBEES', weight: 1.0 }] };
      return { regime: 'BAA_DEFENSE_CASH', allocations: [{ symbol: 'CASH', weight: 1.0 }] };
    }
    const scored = [];
    for (const sym of offensiveUniverse) {
      const s = getKeller13612W(sym, dateStr);
      if (s !== null && s > 0) scored.push({ symbol: sym, score: s });
    }
    if (scored.length === 0) return { regime: 'CASH', allocations: [{ symbol: 'CASH', weight: 1.0 }] };
    scored.sort((a, b) => b.score - a.score);
    return { regime: 'BAA_OFFENSIVE_TOP1', allocations: [{ symbol: scored[0].symbol, weight: 1.0 }] };
  }
});

// ==========================================
// 3. APEX QUANTITATIVE REALLOCATION MODELS
// ==========================================

// 3A. APEX MODEL 1: THE CALMAR CHAMPION (Ultra-Low Drawdown, Max Calmar Ratio)
// 15-day rebalance, Dual Canary (Nifty + Bank > 200 SMA), Top 3 Sectors, 6% Circuit Breaker, 10% Trailing Stop
const stratApexCalmarChampion = simulateTAAStrategy({
  name: '👑 APEX Model 1: Calmar Apex Champion (Top 3, 6% Stop, 15d Rebal)',
  rebalanceIntervalDays: 15,
  stopLossPct: 6.0,
  trailingStopPct: 10.0,
  cashYieldPct: 6.5,
  allocationFn: (dateStr) => {
    const nC = getClose('NSE:NIFTYBEES', dateStr);
    const nSma = getSMA('NSE:NIFTYBEES', dateStr, 200);
    const nMom = getKeller13612W('NSE:NIFTYBEES', dateStr);

    const bC = getClose('NSE:BANKBEES', dateStr);
    const bSma = getSMA('NSE:BANKBEES', dateStr, 200);

    const isCanaryBull = (nC && nSma && nC > nSma && nMom > 0) || (bC && bSma && bC > bSma);

    if (!isCanaryBull) {
      // Defensive
      const gC = getClose('NSE:GOLDBEES', dateStr);
      const gSma = getSMA('NSE:GOLDBEES', dateStr, 50);
      const gMom = getTrailingReturn('NSE:GOLDBEES', dateStr, 42);
      if (gC && gSma && gC > gSma && gMom > 0) {
        return {
          regime: 'DEFENSIVE_GOLD_CASH',
          allocations: [
            { symbol: 'NSE:GOLDBEES', weight: 0.6 },
            { symbol: 'CASH', weight: 0.4 }
          ]
        };
      }
      return { regime: 'DEFENSIVE_CASH', allocations: [{ symbol: 'CASH', weight: 1.0 }] };
    }

    const scored = [];
    for (const sym of offensiveUniverse) {
      const c = getClose(sym, dateStr);
      const sma = getSMA(sym, dateStr, 200);
      const score = getKeller13612W(sym, dateStr);
      if (score !== null && score > 0 && (sma ? c > sma : true)) {
        scored.push({ symbol: sym, score });
      }
    }

    if (scored.length === 0) return { regime: 'CASH', allocations: [{ symbol: 'CASH', weight: 1.0 }] };
    scored.sort((a, b) => b.score - a.score);

    const topN = Math.min(3, scored.length);
    const unitW = 1.0 / topN;
    const allocs = scored.slice(0, topN).map(s => ({ symbol: s.symbol, weight: unitW }));
    return { regime: `OFFENSIVE_TOP_${topN}`, allocations: allocs };
  }
});

// 3B. APEX MODEL 2: THE MAXIMUM ALPHA / RETURN CHAMPION
// 12-day rebalance, Top 1 Concentrated Momentum Leader, 8% Stop Loss, Dynamic Gold/Cash Hedge
const stratApexMaxAlpha = simulateTAAStrategy({
  name: '🚀 APEX Model 2: Max Alpha Champion (Top 1 Concentrated, 12d Rebal)',
  rebalanceIntervalDays: 12,
  stopLossPct: 8.0,
  trailingStopPct: 12.0,
  cashYieldPct: 6.5,
  allocationFn: (dateStr) => {
    const nC = getClose('NSE:NIFTYBEES', dateStr);
    const nSma = getSMA('NSE:NIFTYBEES', dateStr, 200);
    const nMom = getKeller13612W('NSE:NIFTYBEES', dateStr);

    if (nC && nSma && (nC < nSma || nMom < 0)) {
      const gC = getClose('NSE:GOLDBEES', dateStr);
      const gSma = getSMA('NSE:GOLDBEES', dateStr, 50);
      if (gC && gSma && gC > gSma) {
        return { regime: 'DEFENSIVE_GOLD', allocations: [{ symbol: 'NSE:GOLDBEES', weight: 1.0 }] };
      }
      return { regime: 'DEFENSIVE_CASH', allocations: [{ symbol: 'CASH', weight: 1.0 }] };
    }

    const scored = [];
    for (const sym of offensiveUniverse) {
      const c = getClose(sym, dateStr);
      const sma = getSMA(sym, dateStr, 200);
      const score = getKeller13612W(sym, dateStr);
      if (score !== null && score > 0 && (sma ? c > sma : true)) {
        scored.push({ symbol: sym, score });
      }
    }

    if (scored.length === 0) return { regime: 'CASH', allocations: [{ symbol: 'CASH', weight: 1.0 }] };
    scored.sort((a, b) => b.score - a.score);
    return { regime: 'OFFENSIVE_TOP1_MAX_ALPHA', allocations: [{ symbol: scored[0].symbol, weight: 1.0 }] };
  }
});

// 3C. APEX MODEL 3: THE BALANCED HIGH-GROWTH CHAMPION (Top 2 Sectors, 15d Rebal, 6% Stop)
const stratApexBalancedGrowth = simulateTAAStrategy({
  name: '⚖️ APEX Model 3: Balanced High-Growth (Top 2, 6% Stop, 15d Rebal)',
  rebalanceIntervalDays: 15,
  stopLossPct: 6.0,
  trailingStopPct: 10.0,
  cashYieldPct: 6.5,
  allocationFn: (dateStr) => {
    const nC = getClose('NSE:NIFTYBEES', dateStr);
    const nSma = getSMA('NSE:NIFTYBEES', dateStr, 200);
    const nMom = getKeller13612W('NSE:NIFTYBEES', dateStr);

    const bC = getClose('NSE:BANKBEES', dateStr);
    const bSma = getSMA('NSE:BANKBEES', dateStr, 200);

    const isCanaryBull = (nC && nSma && nC > nSma && nMom > 0) || (bC && bSma && bC > bSma);

    if (!isCanaryBull) {
      const gC = getClose('NSE:GOLDBEES', dateStr);
      const gSma = getSMA('NSE:GOLDBEES', dateStr, 50);
      if (gC && gSma && gC > gSma) {
        return {
          regime: 'DEFENSIVE_GOLD_CASH',
          allocations: [
            { symbol: 'NSE:GOLDBEES', weight: 0.5 },
            { symbol: 'CASH', weight: 0.5 }
          ]
        };
      }
      return { regime: 'DEFENSIVE_CASH', allocations: [{ symbol: 'CASH', weight: 1.0 }] };
    }

    const scored = [];
    for (const sym of offensiveUniverse) {
      const c = getClose(sym, dateStr);
      const sma = getSMA(sym, dateStr, 200);
      const score = getKeller13612W(sym, dateStr);
      if (score !== null && score > 0 && (sma ? c > sma : true)) {
        scored.push({ symbol: sym, score });
      }
    }

    if (scored.length === 0) return { regime: 'CASH', allocations: [{ symbol: 'CASH', weight: 1.0 }] };
    scored.sort((a, b) => b.score - a.score);

    if (scored.length === 1) {
      return { regime: 'OFFENSIVE_1_ASSET', allocations: [{ symbol: scored[0].symbol, weight: 1.0 }] };
    }
    return {
      regime: 'OFFENSIVE_TOP2',
      allocations: [
        { symbol: scored[0].symbol, weight: 0.5 },
        { symbol: scored[1].symbol, weight: 0.5 }
      ]
    };
  }
});

// 3D. APEX MODEL 4: DYNAMIC INVERSE-VOLATILITY WEIGHTED (Risk Parity Momentum)
const stratApexInvVol = simulateTAAStrategy({
  name: '🛡️ APEX Model 4: Inverse-Volatility Weighted (Top 3, Risk Parity)',
  rebalanceIntervalDays: 15,
  stopLossPct: 6.0,
  trailingStopPct: 10.0,
  cashYieldPct: 6.5,
  allocationFn: (dateStr) => {
    const nC = getClose('NSE:NIFTYBEES', dateStr);
    const nSma = getSMA('NSE:NIFTYBEES', dateStr, 200);
    const nMom = getKeller13612W('NSE:NIFTYBEES', dateStr);
    const bC = getClose('NSE:BANKBEES', dateStr);
    const bSma = getSMA('NSE:BANKBEES', dateStr, 200);

    const isCanaryBull = (nC && nSma && nC > nSma && nMom > 0) || (bC && bSma && bC > bSma);

    if (!isCanaryBull) {
      return {
        regime: 'DEFENSIVE_GOLD_CASH',
        allocations: [
          { symbol: 'NSE:GOLDBEES', weight: 0.5 },
          { symbol: 'CASH', weight: 0.5 }
        ]
      };
    }

    const scored = [];
    for (const sym of offensiveUniverse) {
      const c = getClose(sym, dateStr);
      const sma = getSMA(sym, dateStr, 200);
      const score = getKeller13612W(sym, dateStr);
      const vol = getVolatility(sym, dateStr, 42);
      if (score !== null && score > 0 && (sma ? c > sma : true) && vol) {
        scored.push({ symbol: sym, score, vol });
      }
    }

    if (scored.length === 0) return { regime: 'CASH', allocations: [{ symbol: 'CASH', weight: 1.0 }] };
    scored.sort((a, b) => b.score - a.score);

    const topN = Math.min(3, scored.length);
    const selected = scored.slice(0, topN);
    const invVols = selected.map(s => 1 / s.vol);
    const sumInv = invVols.reduce((a, b) => a + b, 0);

    const allocs = selected.map((s, i) => ({
      symbol: s.symbol,
      weight: invVols[i] / sumInv
    }));

    return { regime: 'OFFENSIVE_INV_VOL', allocations: allocs };
  }
});

// Compile All Results
const allStrategies = [
  benchNifty,
  bench6040,
  benchAllWeather,
  stratFaberGTAA,
  stratAntonacciGEM,
  stratKellerVAA_G,
  stratKellerDAA,
  stratKellerHAA,
  stratKellerBAA,
  stratApexCalmarChampion,
  stratApexMaxAlpha,
  stratApexBalancedGrowth,
  stratApexInvVol
];

// Sort League Table by Calmar Ratio
allStrategies.sort((a, b) => b.calmar - a.calmar);

console.log('\n========================================================================================');
console.log('🏆 INSTITUTIONAL TAA & ETF REALLOCATION MASTER LEAGUE TABLE (2016 - 2026)');
console.log('========================================================================================');

console.table(allStrategies.map((s, i) => ({
  Rank: i + 1,
  Strategy: s.name,
  CAGR: `${s.cagr}%`,
  TotalReturn: `+${s.totalReturnPct}%`,
  FinalCapital: `₹${(s.finalCapital / 100000).toFixed(2)}L`,
  MaxDrawdown: `${s.maxDrawdown}%`,
  CalmarRatio: s.calmar,
  SharpeRatio: s.sharpe,
  SortinoRatio: s.sortino,
  CovidMaxDD: `${s.covidMaxDD}%`
})));

// Save master results
fs.writeFileSync(
  path.join(dataDir, 'master_etf_reallocation_suite_results.json'),
  JSON.stringify(allStrategies, null, 2),
  'utf8'
);
