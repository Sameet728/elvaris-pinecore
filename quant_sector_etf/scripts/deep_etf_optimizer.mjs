import fs from 'fs';
import path from 'path';

const dataDir = 'c:/Users/samee/Desktop/Pine/quant_sector_etf/data';
const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, 'manifest.json'), 'utf8'));

// Load all ETF daily data
const etfDataMap = new Map();
const allDatesSet = new Set();

for (const item of manifest) {
  const filePath = path.join(dataDir, item.file);
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  const dateMap = new Map();
  // Precompute 200 EMA / SMA
  let sum200 = 0;
  for (let i = 0; i < raw.length; i++) {
    const bar = raw[i];
    sum200 += bar.close;
    if (i >= 200) sum200 -= raw[i - 200].close;
    const sma200 = i >= 199 ? sum200 / 200 : null;

    const dateStr = new Date(bar.time).toISOString().slice(0, 10);
    dateMap.set(dateStr, {
      idx: i,
      time: bar.time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      sma200,
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

const masterDates = Array.from(allDatesSet).sort();

function runAdvancedSimulation(config) {
  const {
    initialCapital = 1000000,
    dailyAllocPct = 2.5,
    maxSlots = 30,
    targetGainPct = 7.0,
    stopLossPct = null,
    oneDayDipThreshold = -0.5,
    trailing30dThreshold = -1.5,
    minTurnoverCr = 1.0,
    maxExitsPerDay = 2,
    enforceSectorCooldown = true,
    idleCashYieldPct = 6.5, // 6.5% annual yield on uninvested cash (LiquidBees / overnight funds)
    useTrendFilter = false,  // only buy if close > 200 SMA (uptrend dip)
    dynamicSizing = false,  // increase allocation if cash is high
    startDate = '2016-01-01',
    endDate = '2026-10-23'
  } = config;

  let cash = initialCapital;
  let positions = [];
  let tradeHistory = [];
  let equityCurve = [];
  let lastBoughtSector = null;
  let nextTradeId = 1;

  const validDates = masterDates.filter(d => d >= startDate && d <= endDate);
  const dailyCashInterestRate = Math.pow(1 + (idleCashYieldPct / 100), 1 / 252) - 1;

  for (let dayIdx = 0; dayIdx < validDates.length; dayIdx++) {
    const dateStr = validDates[dayIdx];

    // Earn daily interest on idle cash via LiquidBees (Indian market standard)
    if (cash > 0 && idleCashYieldPct > 0) {
      cash += cash * dailyCashInterestRate;
    }

    // 1. Check Exits
    const eligibleExits = [];
    for (let p = 0; p < positions.length; p++) {
      const pos = positions[p];
      const etf = etfDataMap.get(pos.symbol);
      const todayBar = etf.dateMap.get(dateStr);
      if (!todayBar) continue;

      const currentGainPct = ((todayBar.close - pos.buyPrice) / pos.buyPrice) * 100;
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

    eligibleExits.sort((a, b) => b.gainPct - a.gainPct);
    const exitsToExecute = eligibleExits.slice(0, maxExitsPerDay);
    exitsToExecute.sort((a, b) => b.posIndex - a.posIndex);

    for (const ex of exitsToExecute) {
      const p = ex.pos;
      const proceeds = p.shares * ex.exitPrice;
      const profitAmt = proceeds - p.cost;
      cash += proceeds;

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
        profitAmt,
        gainPct: ex.gainPct,
        holdDays,
        reason: ex.reason
      });

      positions.splice(ex.posIndex, 1);
    }

    // 2. Check Buys
    let todayBoughtSector = null;

    if (positions.length < maxSlots) {
      const candidates = [];

      for (const item of manifest) {
        const etf = etfDataMap.get(item.symbol);
        const todayBar = etf.dateMap.get(dateStr);
        if (!todayBar || todayBar.idx < 21) continue;

        const prevBar = etf.bars[todayBar.idx - 1];
        const bar30dAgo = etf.bars[todayBar.idx - 21];

        const oneDayChange = ((todayBar.close - prevBar.close) / prevBar.close) * 100;
        const trailing30dChange = ((todayBar.close - bar30dAgo.close) / bar30dAgo.close) * 100;

        const cond1 = oneDayChange <= oneDayDipThreshold;
        const cond2 = trailing30dChange <= trailing30dThreshold;
        const cond3 = todayBar.turnoverCr >= minTurnoverCr || todayBar.volume >= 500000;
        let cond4 = true;
        if (enforceSectorCooldown && lastBoughtSector && lastBoughtSector === item.sector) {
          cond4 = false;
        }

        let cond5 = true;
        if (useTrendFilter && todayBar.sma200) {
          cond5 = todayBar.close >= todayBar.sma200; // buy the dip in a macro bull trend
        }

        if (cond1 && cond2 && cond3 && cond4 && cond5) {
          candidates.push({
            symbol: item.symbol,
            sector: item.sector,
            close: todayBar.close,
            trailing30dChange
          });
        }
      }

      if (candidates.length > 0) {
        candidates.sort((a, b) => a.trailing30dChange - b.trailing30dChange);
        const bestCandidate = candidates[0];

        // Total Equity calculation
        let currentPosValue = 0;
        for (const pos of positions) {
          const etf = etfDataMap.get(pos.symbol);
          const bar = etf.dateMap.get(dateStr) || { close: pos.buyPrice };
          currentPosValue += pos.shares * bar.close;
        }
        const totalEq = cash + currentPosValue;

        // Dynamic Sizing calculation
        let allocPct = dailyAllocPct;
        if (dynamicSizing) {
          // If cash is > 50% of portfolio, size up to 4% per trade to reduce cash drag
          const cashRatio = cash / totalEq;
          if (cashRatio > 0.6) allocPct = dailyAllocPct * 1.6;
          else if (cashRatio < 0.2) allocPct = dailyAllocPct * 0.7;
        }

        const targetAllocAmt = totalEq * (allocPct / 100);
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

    lastBoughtSector = todayBoughtSector ? todayBoughtSector : null;

    // Daily Equity
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

  const initialEq = initialCapital;
  const finalEq = equityCurve[equityCurve.length - 1].totalEquity;
  const totalReturnPct = ((finalEq - initialEq) / initialEq) * 100;

  const startMs = new Date(validDates[0]).getTime();
  const endMs = new Date(validDates[validDates.length - 1]).getTime();
  const years = (endMs - startMs) / (1000 * 60 * 60 * 24 * 365.25);
  const cagr = ((Math.pow(finalEq / initialEq, 1 / years) - 1) * 100);

  let peak = -Infinity;
  let maxDD = 0;
  for (const pt of equityCurve) {
    if (pt.totalEquity > peak) peak = pt.totalEquity;
    const dd = ((peak - pt.totalEquity) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  const calmar = maxDD > 0 ? (cagr / maxDD) : 0;
  const wins = tradeHistory.filter(t => t.profitAmt > 0);
  const losses = tradeHistory.filter(t => t.profitAmt < 0);
  const winRate = tradeHistory.length > 0 ? (wins.length / tradeHistory.length) * 100 : 0;
  const avgHoldDays = tradeHistory.length > 0
    ? tradeHistory.reduce((s, t) => s + t.holdDays, 0) / tradeHistory.length
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
    avgHoldDays: Number(avgHoldDays.toFixed(1)),
    currentlyOpenPositions: positions.length
  };
}

// Compare Key Institutional Setups
const setups = [
  {
    name: '1. Pure Video Baseline (Cash idle = 0%)',
    config: {
      dailyAllocPct: 1.5,
      targetGainPct: 7.0,
      stopLossPct: null,
      idleCashYieldPct: 0.0,
      dynamicSizing: false,
      useTrendFilter: false,
      oneDayDipThreshold: -1.0,
      trailing30dThreshold: -2.5
    }
  },
  {
    name: '2. Video Baseline + LiquidBees Cash Yield (6.5% idle)',
    config: {
      dailyAllocPct: 1.5,
      targetGainPct: 7.0,
      stopLossPct: null,
      idleCashYieldPct: 6.5,
      dynamicSizing: false,
      useTrendFilter: false,
      oneDayDipThreshold: -1.0,
      trailing30dThreshold: -2.5
    }
  },
  {
    name: '3. Optimized Active Engine (+8% Target, 2.5% Alloc, LiquidBees)',
    config: {
      dailyAllocPct: 2.5,
      targetGainPct: 8.0,
      stopLossPct: null,
      idleCashYieldPct: 6.5,
      dynamicSizing: true,
      useTrendFilter: false,
      oneDayDipThreshold: -0.5,
      trailing30dThreshold: -1.5
    }
  },
  {
    name: '4. High-Velocity Velocity Engine (+6% Target, 3.0% Alloc, Max 2 exits/day)',
    config: {
      dailyAllocPct: 3.0,
      targetGainPct: 6.0,
      stopLossPct: null,
      idleCashYieldPct: 6.5,
      dynamicSizing: true,
      useTrendFilter: false,
      maxExitsPerDay: 2,
      oneDayDipThreshold: -0.5,
      trailing30dThreshold: -1.5
    }
  },
  {
    name: '5. Institutional Ultra-Low-Drawdown (10% Stop Loss, Trend Filter)',
    config: {
      dailyAllocPct: 2.0,
      targetGainPct: 7.0,
      stopLossPct: 10.0,
      idleCashYieldPct: 6.5,
      dynamicSizing: false,
      useTrendFilter: true,
      oneDayDipThreshold: -1.0,
      trailing30dThreshold: -1.5
    }
  }
];

console.log('--- COMPARING INSTITUTIONAL ARCHITECTURES ACROSS 10.8 YEARS OF NSE ETF HISTORY ---');
const comparison = [];

for (const s of setups) {
  const res = runAdvancedSimulation(s.config);
  comparison.push({
    Strategy: s.name,
    CAGR: `${res.cagr}%`,
    TotalReturn: `+${res.totalReturnPct}%`,
    FinalCapital: `₹${res.finalEquity.toLocaleString()}`,
    MaxDrawdown: `${res.maxDrawdownPct}%`,
    Calmar: res.calmarRatio,
    WinRate: `${res.winRate}%`,
    Trades: res.totalClosedTrades,
    AvgHoldDays: `${res.avgHoldDays}d`
  });
}

console.table(comparison);

fs.writeFileSync(
  path.join(dataDir, 'advanced_comparison_results.json'),
  JSON.stringify(comparison, null, 2),
  'utf8'
);
