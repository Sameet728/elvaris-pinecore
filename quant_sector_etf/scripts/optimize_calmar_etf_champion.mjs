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

// Keller's 13612W Fast Momentum
function get13612W(symbol, dateStr) {
  const r1 = getTrailingReturn(symbol, dateStr, 21);
  const r3 = getTrailingReturn(symbol, dateStr, 63);
  const r6 = getTrailingReturn(symbol, dateStr, 126);
  const r12 = getTrailingReturn(symbol, dateStr, 252);
  if (r1 === null || r3 === null || r6 === null || r12 === null) return null;
  return 12 * (r1 / 100) + 4 * (r3 / 100) + 2 * (r6 / 100) + 1 * (r12 / 100);
}

// Uniform 1-3-6-12 Momentum
function getHaaMom(symbol, dateStr) {
  const r1 = getTrailingReturn(symbol, dateStr, 21);
  const r3 = getTrailingReturn(symbol, dateStr, 63);
  const r6 = getTrailingReturn(symbol, dateStr, 126);
  const r12 = getTrailingReturn(symbol, dateStr, 252);
  if (r1 === null || r3 === null || r6 === null || r12 === null) return null;
  return (r1 + r3 + r6 + r12) / 4;
}

const offensivePool = [
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

// SIMULATOR WITH INTRADAY CIRCUIT BREAKER & FAST CANARY
function runBacktest(params) {
  const {
    rebalanceIntervalDays = 21, // ~1 month
    stopLossPct = null, // e.g. 8.0, 10.0, or null
    topN = 2,
    momType = '13612W', // '13612W' or 'HAA'
    useSmaFilter = true, // individual asset > 200 SMA
    canarySmaPeriod = 200, // Nifty > 200 SMA
    defensiveAsset = 'DYNAMIC_GOLD_CASH', // 'CASH', 'GOLD', 'DYNAMIC_GOLD_CASH'
    cashYieldPct = 6.5,
    startDate = '2016-01-01',
    endDate = '2026-10-23',
    initialCapital = 1000000
  } = params;

  const validDates = masterDates.filter(d => d >= startDate && d <= endDate);
  const dailyCashInterest = Math.pow(1 + (cashYieldPct / 100), 1 / 252) - 1;

  let cash = initialCapital;
  let holdings = []; // [{ symbol, shares, buyPrice, peakPrice }]
  let daysSinceRebalance = rebalanceIntervalDays; // trigger on first day
  const dailyEquity = [];
  let stopOutsCount = 0;

  for (let d = 0; d < validDates.length; d++) {
    const dateStr = validDates[d];

    // Earn cash interest
    if (cash > 0 && cashYieldPct > 0) {
      cash += cash * dailyCashInterest;
    }

    // 1. INTRADAY / DAILY CIRCUIT BREAKER CHECK
    if (stopLossPct !== null && holdings.length > 0) {
      const survivingHoldings = [];
      for (const h of holdings) {
        const c = getClose(h.symbol, dateStr);
        if (!c) {
          survivingHoldings.push(h);
          continue;
        }

        if (c > h.peakPrice) h.peakPrice = c;
        const lossFromBuy = ((c - h.buyPrice) / h.buyPrice) * 100;
        const trailingDrop = ((c - h.peakPrice) / h.peakPrice) * 100;

        // Check if stopped out
        if (lossFromBuy <= -stopLossPct || trailingDrop <= -(stopLossPct * 1.5)) {
          // Liquidate to cash immediately
          cash += h.shares * c;
          stopOutsCount++;
        } else {
          survivingHoldings.push(h);
        }
      }
      holdings = survivingHoldings;
    }

    // 2. PERIODIC REBALANCE CHECK
    daysSinceRebalance++;
    const isRebalanceDay = daysSinceRebalance >= rebalanceIntervalDays;

    if (isRebalanceDay) {
      daysSinceRebalance = 0;

      // Calculate total portfolio equity
      let totalPortfolioVal = cash;
      for (const h of holdings) {
        const c = getClose(h.symbol, dateStr) || h.buyPrice;
        totalPortfolioVal += h.shares * c;
      }

      // Check Canary (Nifty 50)
      const niftyC = getClose('NSE:NIFTYBEES', dateStr);
      const niftySma = canarySmaPeriod ? getSMA('NSE:NIFTYBEES', dateStr, canarySmaPeriod) : null;
      const niftyMom = momType === '13612W' ? get13612W('NSE:NIFTYBEES', dateStr) : getHaaMom('NSE:NIFTYBEES', dateStr);

      const canaryPass = (canarySmaPeriod ? (niftyC > niftySma) : true) && (niftyMom > 0);

      let targetAllocations = []; // [{ symbol, weight }]

      if (!canaryPass) {
        // DEFENSIVE POSTURE
        if (defensiveAsset === 'CASH') {
          targetAllocations.push({ symbol: 'CASH', weight: 1.0 });
        } else if (defensiveAsset === 'GOLD') {
          targetAllocations.push({ symbol: 'NSE:GOLDBEES', weight: 1.0 });
        } else if (defensiveAsset === 'DYNAMIC_GOLD_CASH') {
          const goldC = getClose('NSE:GOLDBEES', dateStr);
          const goldSma = getSMA('NSE:GOLDBEES', dateStr, 100);
          const goldMom = getTrailingReturn('NSE:GOLDBEES', dateStr, 63);
          if (goldC && goldSma && goldC > goldSma && goldMom > 0) {
            // Gold is trending strong, protect with Gold + Cash split
            targetAllocations.push({ symbol: 'NSE:GOLDBEES', weight: 0.7 });
            targetAllocations.push({ symbol: 'CASH', weight: 0.3 });
          } else {
            // Gold is also chopping, 100% Cash / LiquidBees
            targetAllocations.push({ symbol: 'CASH', weight: 1.0 });
          }
        }
      } else {
        // OFFENSIVE POSTURE: Score all sectors
        const scored = [];
        for (const sym of offensivePool) {
          const c = getClose(sym, dateStr);
          const sma = useSmaFilter ? getSMA(sym, dateStr, 200) : null;
          const score = momType === '13612W' ? get13612W(sym, dateStr) : getHaaMom(sym, dateStr);

          const passesTrend = useSmaFilter ? (sma ? c > sma : true) : true;
          if (score !== null && score > 0 && passesTrend) {
            scored.push({ symbol: sym, score });
          }
        }

        if (scored.length === 0) {
          // Fallback to cash if no offensive sector passes trend filter
          targetAllocations.push({ symbol: 'CASH', weight: 1.0 });
        } else {
          scored.sort((a, b) => b.score - a.score);
          const selected = scored.slice(0, topN);
          const weightEach = 1.0 / selected.length;
          for (const s of selected) {
            targetAllocations.push({ symbol: s.symbol, weight: weightEach });
          }
        }
      }

      // Execute reallocation
      cash = totalPortfolioVal * (1 - 0.0005); // 5 bps friction
      const newHoldings = [];

      for (const alloc of targetAllocations) {
        if (alloc.symbol === 'CASH') continue;
        const c = getClose(alloc.symbol, dateStr);
        if (!c) continue;
        const targetAmt = totalPortfolioVal * alloc.weight;
        const shares = Math.floor(targetAmt / c);
        if (shares > 0) {
          const cost = shares * c;
          cash -= cost;
          newHoldings.push({
            symbol: alloc.symbol,
            shares,
            buyPrice: c,
            peakPrice: c,
            weight: alloc.weight
          });
        }
      }
      holdings = newHoldings;
    }

    // Daily Mark to Market
    let dayHoldingsVal = 0;
    for (const h of holdings) {
      const c = getClose(h.symbol, dateStr) || h.buyPrice;
      dayHoldingsVal += h.shares * c;
    }
    const totalEq = cash + dayHoldingsVal;
    dailyEquity.push({ date: dateStr, equity: totalEq });
  }

  // Calculate stats
  const finalEq = dailyEquity[dailyEquity.length - 1].equity;
  const totalReturn = ((finalEq - initialCapital) / initialCapital) * 100;
  const years = (new Date(validDates[validDates.length - 1]) - new Date(validDates[0])) / (1000 * 60 * 60 * 24 * 365.25);
  const cagr = (Math.pow(finalEq / initialCapital, 1 / years) - 1) * 100;

  let peak = -Infinity;
  let maxDD = 0;
  for (const de of dailyEquity) {
    if (de.equity > peak) peak = de.equity;
    const dd = ((peak - de.equity) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  const calmar = maxDD > 0 ? cagr / maxDD : 0;

  // Yearly table
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

  return {
    params,
    cagr: Number(cagr.toFixed(2)),
    totalReturn: Number(totalReturn.toFixed(1)),
    finalCapital: Math.round(finalEq),
    maxDrawdown: Number(maxDD.toFixed(2)),
    calmar: Number(calmar.toFixed(2)),
    stopOutsCount,
    yearlyStats
  };
}

// GRID SEARCH FOR THE CHAMPION HIGH-CALMAR ARCHITECTURE
const gridResults = [];

const intervals = [10, 15, 21]; // Bi-weekly (10d), 3-week (15d), Monthly (21d)
const stopLosses = [null, 8.0, 10.0, 12.0];
const topNs = [1, 2, 3];
const momTypes = ['13612W', 'HAA'];
const defensiveAssets = ['DYNAMIC_GOLD_CASH', 'CASH'];

for (const interval of intervals) {
  for (const sl of stopLosses) {
    for (const tn of topNs) {
      for (const mt of momTypes) {
        for (const def of defensiveAssets) {
          const res = runBacktest({
            rebalanceIntervalDays: interval,
            stopLossPct: sl,
            topN: tn,
            momType: mt,
            defensiveAsset: def
          });
          gridResults.push(res);
        }
      }
    }
  }
}

gridResults.sort((a, b) => b.calmar - a.calmar);

console.log(`\nGrid Search Completed across ${gridResults.length} parameter configurations.`);
console.log('\n--- TOP 10 STRATEGIES RANKED BY HIGHEST CALMAR RATIO ---');
console.table(gridResults.slice(0, 10).map((r, i) => ({
  Rank: i + 1,
  Interval: `${r.params.rebalanceIntervalDays}d`,
  StopLoss: r.params.stopLossPct ? `${r.params.stopLossPct}%` : 'None',
  TopN: r.params.topN,
  MomType: r.params.momType,
  Defensive: r.params.defensiveAsset,
  CAGR: `${r.cagr}%`,
  TotalReturn: `+${r.totalReturn}%`,
  FinalCapital: `₹${(r.finalCapital / 100000).toFixed(2)}L`,
  MaxDrawdown: `${r.maxDrawdown}%`,
  CalmarRatio: r.calmar
})));

const champion = gridResults[0];
console.log('\n=========================================');
console.log('🏆 #1 ALL-TIME CHAMPION ETF STRATEGY:');
console.log(champion.params);
console.log(`CAGR: ${champion.cagr}%`);
console.log(`Max Drawdown: ${champion.maxDrawdown}%`);
console.log(`Calmar Ratio: ${champion.calmar}`);
console.log('Year-by-Year Performance:');
console.table(champion.yearlyStats);
console.log('=========================================');

fs.writeFileSync(
  path.join(dataDir, 'champion_calmar_etf_results.json'),
  JSON.stringify({ champion, top10: gridResults.slice(0, 10) }, null, 2),
  'utf8'
);
