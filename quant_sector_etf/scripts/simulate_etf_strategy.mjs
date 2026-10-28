import fs from 'fs';
import path from 'path';

const dataDir = 'c:/Users/samee/Desktop/Pine/quant_sector_etf/data';
const manifestPath = path.join(dataDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Load all ETF daily data into memory
const etfDataMap = new Map();
const allDatesSet = new Set();

for (const item of manifest) {
  const filePath = path.join(dataDir, item.file);
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // Pre-index by date string YYYY-MM-DD
  const dateMap = new Map();
  for (let i = 0; i < raw.length; i++) {
    const bar = raw[i];
    const dateStr = new Date(bar.time).toISOString().slice(0, 10);
    dateMap.set(dateStr, {
      idx: i,
      time: bar.time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      turnoverCr: (bar.volume * bar.close) / 10000000
    });
    allDatesSet.add(dateStr);
  }

  etfDataMap.set(item.symbol, {
    info: item,
    bars: raw,
    dateMap
  });
}

// Sorted master trading calendar
const masterDates = Array.from(allDatesSet).sort();
console.log(`Master Calendar: ${masterDates.length} total trading days (${masterDates[0]} to ${masterDates[masterDates.length - 1]})`);
console.log(`Loaded ${etfDataMap.size} Sector/Thematic ETFs.`);

// Simulation Runner Function
function runPortfolioSimulation(config) {
  const {
    initialCapital = 1000000, // 10 Lakhs INR
    dailyAllocPct = 1.5,      // 1.5% per trade
    maxSlots = 40,            // max positions held
    targetGainPct = 7.0,      // exit at +7%
    stopLossPct = null,       // null = no stop loss (as per video)
    oneDayDipThreshold = -1.0, // 1-day change <= -1%
    trailing30dThreshold = -2.5, // 30-day (21 bars) change <= -2.5%
    minVolume = 500000,
    minTurnoverCr = 2.0,
    respectVolumeFilter = true,
    maxExitsPerDay = 1,
    enforceSectorCooldown = true,
    startDate = '2015-01-01', // test across liquid multi-sector era
    endDate = '2026-10-23'
  } = config;

  let cash = initialCapital;
  let positions = []; // Array of active positions { id, symbol, sector, buyDate, buyPrice, shares, cost }
  let tradeHistory = [];
  let equityCurve = [];
  let lastBoughtSector = null;
  let nextTradeId = 1;

  const validDates = masterDates.filter(d => d >= startDate && d <= endDate);

  for (let dayIdx = 0; dayIdx < validDates.length; dayIdx++) {
    const dateStr = validDates[dayIdx];

    // 1. Mark to Market & Check Exits on Active Positions
    const eligibleExits = [];
    for (let p = 0; p < positions.length; p++) {
      const pos = positions[p];
      const etf = etfDataMap.get(pos.symbol);
      const todayBar = etf.dateMap.get(dateStr);

      if (!todayBar) continue; // no price today

      const currentGainPct = ((todayBar.close - pos.buyPrice) / pos.buyPrice) * 100;
      
      // Check Target Profit
      if (currentGainPct >= targetGainPct) {
        eligibleExits.push({
          posIndex: p,
          pos,
          exitPrice: todayBar.close,
          gainPct: currentGainPct,
          reason: 'PROFIT_TARGET'
        });
      } else if (stopLossPct !== null && currentGainPct <= -stopLossPct) {
        eligibleExits.push({
          posIndex: p,
          pos,
          exitPrice: todayBar.close,
          gainPct: currentGainPct,
          reason: 'STOP_LOSS'
        });
      }
    }

    // Sort eligible exits by highest gain first
    eligibleExits.sort((a, b) => b.gainPct - a.gainPct);

    // Exit up to maxExitsPerDay
    const exitsToExecute = eligibleExits.slice(0, maxExitsPerDay);
    // Sort exits by posIndex descending to splice safely
    exitsToExecute.sort((a, b) => b.posIndex - a.posIndex);

    for (const ex of exitsToExecute) {
      const p = ex.pos;
      const proceeds = p.shares * ex.exitPrice;
      const profitAmt = proceeds - p.cost;
      cash += proceeds;

      // Calculate holding days
      const buyTime = new Date(p.buyDate).getTime();
      const exitTime = new Date(dateStr).getTime();
      const holdDays = Math.round((exitTime - buyTime) / (1000 * 60 * 60 * 24));

      tradeHistory.push({
        id: p.id,
        symbol: p.symbol,
        sector: p.sector,
        buyDate: p.buyDate,
        exitDate: dateStr,
        buyPrice: p.buyPrice,
        exitPrice: ex.exitPrice,
        shares: p.shares,
        cost: p.cost,
        proceeds,
        profitAmt,
        gainPct: ex.gainPct,
        holdDays,
        reason: ex.reason
      });

      positions.splice(ex.posIndex, 1);
    }

    // 2. Scan Universe for New Buys (at 3:15 PM close)
    let todayBoughtSector = null;

    if (positions.length < maxSlots) {
      const candidates = [];

      for (const item of manifest) {
        const etf = etfDataMap.get(item.symbol);
        const todayBar = etf.dateMap.get(dateStr);
        if (!todayBar || todayBar.idx < 21) continue; // need at least 21 trading days (approx 30 calendar days)

        const prevBar = etf.bars[todayBar.idx - 1];
        const bar30dAgo = etf.bars[todayBar.idx - 21];

        const oneDayChange = ((todayBar.close - prevBar.close) / prevBar.close) * 100;
        const trailing30dChange = ((todayBar.close - bar30dAgo.close) / bar30dAgo.close) * 100;

        // Condition 1: Today's 1-day change <= threshold (e.g. <= -1%)
        const cond1 = oneDayChange <= oneDayDipThreshold;

        // Condition 2: Trailing 30-day change <= threshold (e.g. <= -2.5%)
        const cond2 = trailing30dChange <= trailing30dThreshold;

        // Condition 3: Liquidity check
        let cond3 = true;
        if (respectVolumeFilter) {
          cond3 = (todayBar.volume >= minVolume) || (todayBar.turnoverCr >= minTurnoverCr);
        }

        // Condition 4: Sector cooldown (no consecutive buy in same sector)
        let cond4 = true;
        if (enforceSectorCooldown && lastBoughtSector && lastBoughtSector === item.sector) {
          cond4 = false;
        }

        if (cond1 && cond2 && cond3 && cond4) {
          candidates.push({
            symbol: item.symbol,
            sector: item.sector,
            close: todayBar.close,
            oneDayChange,
            trailing30dChange
          });
        }
      }

      // Rank by deepest 30-day drop (lowest trailing30dChange)
      if (candidates.length > 0) {
        candidates.sort((a, b) => a.trailing30dChange - b.trailing30dChange);
        const bestCandidate = candidates[0];

        // Allocate 1.5% of current total portfolio equity (or available cash)
        // First calculate total equity
        let currentPosValue = 0;
        for (const pos of positions) {
          const etf = etfDataMap.get(pos.symbol);
          const bar = etf.dateMap.get(dateStr) || { close: pos.buyPrice };
          currentPosValue += pos.shares * bar.close;
        }
        const totalEq = cash + currentPosValue;
        const targetAllocAmt = totalEq * (dailyAllocPct / 100);
        const actualAllocAmt = Math.min(targetAllocAmt, cash);

        if (actualAllocAmt >= bestCandidate.close) {
          const shares = Math.floor(actualAllocAmt / bestCandidate.close);
          if (shares > 0) {
            const cost = shares * bestCandidate.close;
            cash -= cost;

            positions.push({
              id: nextTradeId++,
              symbol: bestCandidate.symbol,
              sector: bestCandidate.sector,
              buyDate: dateStr,
              buyPrice: bestCandidate.close,
              shares,
              cost
            });

            todayBoughtSector = bestCandidate.sector;
          }
        }
      }
    }

    // Update sector cooldown for next day
    if (todayBoughtSector) {
      lastBoughtSector = todayBoughtSector;
    } else {
      lastBoughtSector = null; // reset if no trade made
    }

    // 3. Record Daily Equity & Metrics
    let dayPosValue = 0;
    for (const pos of positions) {
      const etf = etfDataMap.get(pos.symbol);
      const bar = etf.dateMap.get(dateStr) || { close: pos.buyPrice };
      dayPosValue += pos.shares * bar.close;
    }
    const totalDayEquity = cash + dayPosValue;

    equityCurve.push({
      date: dateStr,
      cash,
      posValue: dayPosValue,
      totalEquity: totalDayEquity,
      openSlots: positions.length
    });
  }

  // Calculate Performance Metrics
  const initialEq = initialCapital;
  const finalEq = equityCurve[equityCurve.length - 1].totalEquity;
  const totalReturnPct = ((finalEq - initialEq) / initialEq) * 100;

  // Years in simulation
  const startMs = new Date(validDates[0]).getTime();
  const endMs = new Date(validDates[validDates.length - 1]).getTime();
  const years = (endMs - startMs) / (1000 * 60 * 60 * 24 * 365.25);
  const cagr = ((Math.pow(finalEq / initialEq, 1 / years) - 1) * 100);

  // Maximum Drawdown
  let peak = -Infinity;
  let maxDD = 0;
  for (const pt of equityCurve) {
    if (pt.totalEquity > peak) peak = pt.totalEquity;
    const dd = ((peak - pt.totalEquity) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  // Calmar Ratio
  const calmar = maxDD > 0 ? (cagr / maxDD) : 0;

  // Win Rate & Trade Stats
  const wins = tradeHistory.filter(t => t.profitAmt > 0);
  const losses = tradeHistory.filter(t => t.profitAmt < 0);
  const winRate = tradeHistory.length > 0 ? (wins.length / tradeHistory.length) * 100 : 0;

  const totalProfitAmt = wins.reduce((s, t) => s + t.profitAmt, 0);
  const totalLossAmt = Math.abs(losses.reduce((s, t) => s + t.profitAmt, 0));
  const profitFactor = totalLossAmt > 0 ? (totalProfitAmt / totalLossAmt) : (totalProfitAmt > 0 ? 999 : 0);

  const avgHoldDays = tradeHistory.length > 0
    ? tradeHistory.reduce((s, t) => s + t.holdDays, 0) / tradeHistory.length
    : 0;

  const avgGainPct = tradeHistory.length > 0
    ? tradeHistory.reduce((s, t) => s + t.gainPct, 0) / tradeHistory.length
    : 0;

  return {
    config,
    years: years.toFixed(2),
    initialCapital,
    finalEquity: Math.round(finalEq),
    totalReturnPct: Number(totalReturnPct.toFixed(2)),
    cagr: Number(cagr.toFixed(2)),
    maxDrawdownPct: Number(maxDD.toFixed(2)),
    calmarRatio: Number(calmar.toFixed(2)),
    totalClosedTrades: tradeHistory.length,
    wins: wins.length,
    losses: losses.length,
    winRate: Number(winRate.toFixed(2)),
    profitFactor: Number(profitFactor.toFixed(2)),
    avgHoldDays: Number(avgHoldDays.toFixed(1)),
    avgGainPct: Number(avgGainPct.toFixed(2)),
    currentlyOpenPositions: positions.length,
    equityCurveSample: equityCurve.filter((_, i) => i % 50 === 0),
    recentTrades: tradeHistory.slice(-10)
  };
}

// Execute Baseline and Parameter Matrix
console.log('\n--- 1. Testing Video Baseline Strategy (No Stop Loss, +7% Target, 1.5% Daily Allocation) ---');
const baseline = runPortfolioSimulation({
  startDate: '2016-01-01',
  endDate: '2026-10-23',
  targetGainPct: 7.0,
  stopLossPct: null,
  dailyAllocPct: 1.5,
  oneDayDipThreshold: -1.0,
  trailing30dThreshold: -2.5,
  respectVolumeFilter: true,
  enforceSectorCooldown: true
});

console.log('Video Baseline Results:');
console.log(`  CAGR: ${baseline.cagr}%`);
console.log(`  Total Return: ${baseline.totalReturnPct}% (Final: ₹${baseline.finalEquity.toLocaleString()})`);
console.log(`  Max Drawdown: ${baseline.maxDrawdownPct}%`);
console.log(`  Calmar Ratio: ${baseline.calmarRatio}`);
console.log(`  Win Rate: ${baseline.winRate}% (${baseline.wins} wins / ${baseline.losses} losses out of ${baseline.totalClosedTrades} trades)`);
console.log(`  Profit Factor: ${baseline.profitFactor}`);
console.log(`  Average Holding Days: ${baseline.avgHoldDays} days`);
console.log(`  Open Positions Remaining: ${baseline.currentlyOpenPositions}`);

// Save baseline
fs.writeFileSync(
  path.join(dataDir, 'baseline_simulation_results.json'),
  JSON.stringify(baseline, null, 2),
  'utf8'
);

console.log('\n--- 2. Running Full Grid Optimization Matrix ---');
const targets = [5.0, 6.0, 7.0, 8.0, 10.0, 12.0];
const allocs = [1.0, 1.5, 2.0, 2.5, 3.0];
const oneDayDips = [-0.5, -1.0, -1.5];
const trailing30Dips = [-1.5, -2.5, -4.0];
const stopLosses = [null, 15.0, 10.0];

const gridResults = [];

for (const t of targets) {
  for (const a of allocs) {
    for (const od of oneDayDips) {
      for (const t30 of trailing30Dips) {
        for (const sl of stopLosses) {
          const res = runPortfolioSimulation({
            startDate: '2016-01-01',
            endDate: '2026-10-23',
            targetGainPct: t,
            stopLossPct: sl,
            dailyAllocPct: a,
            oneDayDipThreshold: od,
            trailing30dThreshold: t30,
            respectVolumeFilter: true,
            enforceSectorCooldown: true
          });

          gridResults.push({
            target: t,
            alloc: a,
            oneDayDip: od,
            trailing30Dip: t30,
            stopLoss: sl === null ? 'None' : `${sl}%`,
            cagr: res.cagr,
            totalReturn: res.totalReturnPct,
            maxDD: res.maxDrawdownPct,
            calmar: res.calmarRatio,
            winRate: res.winRate,
            trades: res.totalClosedTrades,
            profitFactor: res.profitFactor,
            avgHoldDays: res.avgHoldDays
          });
        }
      }
    }
  }
}

// Sort grid results by Calmar Ratio
gridResults.sort((a, b) => b.calmar - a.calmar);

console.log(`\nGrid Search Completed! Tested ${gridResults.length} parameter combinations.`);
console.log('\nTop 10 Configurations by Calmar Ratio (Risk-Adjusted Return):');
console.table(gridResults.slice(0, 10));

console.log('\nTop 10 Configurations by CAGR:');
const byCAGR = [...gridResults].sort((a, b) => b.cagr - a.cagr);
console.table(byCAGR.slice(0, 10));

console.log('\nTop 10 Configurations by Win Rate (with min 100 trades):');
const byWinRate = gridResults.filter(r => r.trades >= 100).sort((a, b) => b.winRate - a.winRate);
console.table(byWinRate.slice(0, 10));

fs.writeFileSync(
  path.join(dataDir, 'grid_optimization_results.json'),
  JSON.stringify(gridResults, null, 2),
  'utf8'
);

console.log('\nOptimization results saved to grid_optimization_results.json');
