import fs from 'fs';
import path from 'path';

const dataDir = 'c:/Users/samee/Desktop/Pine/quant_sector_etf/data';
const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, 'manifest.json'), 'utf8'));

// Load ETF data into memory
const etfDataMap = new Map();
const allDatesSet = new Set();

for (const item of manifest) {
  const filePath = path.join(dataDir, item.file);
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));

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

const masterDates = Array.from(allDatesSet).sort();

function simulateDetailed(config) {
  const {
    initialCapital = 1000000,
    dailyAllocPct = 1.5,
    maxSlots = 40,
    targetGainPct = 7.0,
    stopLossPct = null,
    oneDayDipThreshold = -1.0,
    trailing30dThreshold = -2.5,
    minTurnoverCr = 1.0,
    maxExitsPerDay = 1,
    enforceSectorCooldown = true,
    idleCashYieldPct = 6.5,
    startDate = '2016-01-01',
    endDate = '2026-10-23'
  } = config;

  let cash = initialCapital;
  let positions = [];
  let tradeHistory = [];
  let dailyRecords = [];
  let lastBoughtSector = null;
  let nextTradeId = 1;

  const validDates = masterDates.filter(d => d >= startDate && d <= endDate);
  const dailyCashInterestRate = Math.pow(1 + (idleCashYieldPct / 100), 1 / 252) - 1;

  for (let dayIdx = 0; dayIdx < validDates.length; dayIdx++) {
    const dateStr = validDates[dayIdx];

    // Earn interest on idle cash
    if (cash > 0 && idleCashYieldPct > 0) {
      cash += cash * dailyCashInterestRate;
    }

    // 1. Exits
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
        name: etfDataMap.get(p.symbol).info.name,
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

    // 2. Buys
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

        if (cond1 && cond2 && cond3 && cond4) {
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

    lastBoughtSector = todayBoughtSector ? todayBoughtSector : null;

    // Daily Mark to Market
    let dayPosValue = 0;
    for (const pos of positions) {
      const etf = etfDataMap.get(pos.symbol);
      const bar = etf.dateMap.get(dateStr) || { close: pos.buyPrice };
      dayPosValue += pos.shares * bar.close;
    }
    const totalDayEquity = cash + dayPosValue;

    dailyRecords.push({
      date: dateStr,
      cash,
      posValue: dayPosValue,
      totalEquity: totalDayEquity,
      openSlots: positions.length
    });
  }

  return { tradeHistory, dailyRecords, positions };
}

// Run baseline & liquidbees setup
const baseline = simulateDetailed({ idleCashYieldPct: 0.0 });
const withLiquidBees = simulateDetailed({ idleCashYieldPct: 6.5 });
const optimizedEngine = simulateDetailed({ idleCashYieldPct: 6.5, dailyAllocPct: 2.5, targetGainPct: 8.0, maxExitsPerDay: 2 });

// 1. Year by Year Performance Analysis
function calcYearlyStats(records, trades, benchmarkSymbol = 'NSE:NIFTYBEES') {
  const bench = etfDataMap.get(benchmarkSymbol);
  const years = {};

  for (const r of records) {
    const y = r.date.slice(0, 4);
    if (!years[y]) {
      years[y] = {
        startEq: r.totalEquity,
        endEq: r.totalEquity,
        peakEq: r.totalEquity,
        maxDD: 0,
        startCash: r.cash,
        days: 0,
        startDate: r.date,
        endDate: r.date
      };
    }
    years[y].endEq = r.totalEquity;
    years[y].endDate = r.date;
    years[y].days++;
    if (r.totalEquity > years[y].peakEq) years[y].peakEq = r.totalEquity;
    const dd = ((years[y].peakEq - r.totalEquity) / years[y].peakEq) * 100;
    if (dd > years[y].maxDD) years[y].maxDD = dd;
  }

  const yearlyArray = [];
  for (const [y, data] of Object.entries(years)) {
    const returnPct = ((data.endEq - data.startEq) / data.startEq) * 100;

    // Calculate benchmark return
    let benchReturn = 0;
    if (bench) {
      const bStart = bench.dateMap.get(data.startDate);
      const bEnd = bench.dateMap.get(data.endDate);
      if (bStart && bEnd) {
        benchReturn = ((bEnd.close - bStart.close) / bStart.close) * 100;
      }
    }

    const yearTrades = trades.filter(t => t.exitDate.startsWith(y));
    const wins = yearTrades.filter(t => t.profitAmt > 0).length;

    yearlyArray.push({
      year: y,
      startCapital: Math.round(data.startEq),
      endCapital: Math.round(data.endEq),
      strategyReturnPct: Number(returnPct.toFixed(2)),
      benchmarkNiftyReturnPct: Number(benchReturn.toFixed(2)),
      maxDrawdownPct: Number(data.maxDD.toFixed(2)),
      tradesClosed: yearTrades.length,
      winRate: yearTrades.length > 0 ? Number(((wins / yearTrades.length) * 100).toFixed(1)) : 100
    });
  }

  return yearlyArray;
}

// 2. Individual ETF Performance Breakdown
function calcEtfBreakdown(trades) {
  const map = {};
  for (const t of trades) {
    if (!map[t.symbol]) {
      map[t.symbol] = {
        symbol: t.symbol,
        name: t.name,
        sector: t.sector,
        trades: 0,
        wins: 0,
        totalProfit: 0,
        totalCost: 0,
        holdDaysSum: 0,
        maxHoldDays: 0,
        minHoldDays: 9999
      };
    }
    const item = map[t.symbol];
    item.trades++;
    if (t.profitAmt > 0) item.wins++;
    item.totalProfit += t.profitAmt;
    item.totalCost += t.cost;
    item.holdDaysSum += t.holdDays;
    if (t.holdDays > item.maxHoldDays) item.maxHoldDays = t.holdDays;
    if (t.holdDays < item.minHoldDays) item.minHoldDays = t.holdDays;
  }

  return Object.values(map).map(e => ({
    symbol: e.symbol,
    name: e.name,
    sector: e.sector,
    trades: e.trades,
    winRate: Number(((e.wins / e.trades) * 100).toFixed(1)),
    totalProfit: Math.round(e.totalProfit),
    avgProfitPerTrade: Math.round(e.totalProfit / e.trades),
    avgHoldDays: Math.round(e.holdDaysSum / e.trades),
    maxHoldDays: e.maxHoldDays
  })).sort((a, b) => b.totalProfit - a.totalProfit);
}

// 3. Drawdown Analysis (Top 5 worst drawdowns)
function calcTopDrawdowns(records) {
  let peak = -Infinity;
  let peakDate = '';
  let inDD = false;
  let currentTrough = Infinity;
  let currentTroughDate = '';
  const dds = [];

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (r.totalEquity >= peak) {
      if (inDD) {
        const ddPct = ((peak - currentTrough) / peak) * 100;
        const durDays = Math.round((new Date(r.date) - new Date(peakDate)) / (1000 * 60 * 60 * 24));
        dds.push({
          peakDate,
          troughDate: currentTroughDate,
          recoveryDate: r.date,
          drawdownPct: Number(ddPct.toFixed(2)),
          totalDurationDays: durDays
        });
        inDD = false;
        currentTrough = Infinity;
      }
      peak = r.totalEquity;
      peakDate = r.date;
    } else {
      inDD = true;
      if (r.totalEquity < currentTrough) {
        currentTrough = r.totalEquity;
        currentTroughDate = r.date;
      }
    }
  }

  return dds.sort((a, b) => b.drawdownPct - a.drawdownPct).slice(0, 5);
}

// 4. Monthly Performance Matrix
function calcMonthlyMatrix(records) {
  const months = {};
  for (const r of records) {
    const ym = r.date.slice(0, 7); // YYYY-MM
    if (!months[ym]) {
      months[ym] = {
        start: r.totalEquity,
        end: r.totalEquity
      };
    }
    months[ym].end = r.totalEquity;
  }

  const matrix = {};
  for (const [ym, val] of Object.entries(months)) {
    const [y, m] = ym.split('-');
    if (!matrix[y]) matrix[y] = {};
    const ret = ((val.end - val.start) / val.start) * 100;
    matrix[y][m] = Number(ret.toFixed(2));
  }

  return matrix;
}

// 5. Portfolio Slot Utilization Statistics
function calcSlotStats(records) {
  let totalSlots = 0;
  let maxSlots = 0;
  let minSlots = 999;
  const bins = { '0-5 slots': 0, '6-15 slots': 0, '16-25 slots': 0, '26-35 slots': 0, '36-40 slots': 0 };

  for (const r of records) {
    totalSlots += r.openSlots;
    if (r.openSlots > maxSlots) maxSlots = r.openSlots;
    if (r.openSlots < minSlots) minSlots = r.openSlots;

    if (r.openSlots <= 5) bins['0-5 slots']++;
    else if (r.openSlots <= 15) bins['6-15 slots']++;
    else if (r.openSlots <= 25) bins['16-25 slots']++;
    else if (r.openSlots <= 35) bins['26-35 slots']++;
    else bins['36-40 slots']++;
  }

  const totalDays = records.length;
  const binPct = {};
  for (const [b, count] of Object.entries(bins)) {
    binPct[b] = `${((count / totalDays) * 100).toFixed(1)}% (${count} days)`;
  }

  return {
    avgSlotsUsed: (totalSlots / totalDays).toFixed(1),
    maxSlotsUsed: maxSlots,
    minSlotsUsed: minSlots,
    slotDistribution: binPct
  };
}

const yearlyBaseline = calcYearlyStats(baseline.dailyRecords, baseline.tradeHistory);
const yearlyLiquidBees = calcYearlyStats(withLiquidBees.dailyRecords, withLiquidBees.tradeHistory);
const etfBreakdown = calcEtfBreakdown(withLiquidBees.tradeHistory);
const topDrawdowns = calcTopDrawdowns(withLiquidBees.dailyRecords);
const monthlyMatrix = calcMonthlyMatrix(withLiquidBees.dailyRecords);
const slotStats = calcSlotStats(withLiquidBees.dailyRecords);

const fullReport = {
  summary: {
    totalTradingDays: withLiquidBees.dailyRecords.length,
    startDate: withLiquidBees.dailyRecords[0].date,
    endDate: withLiquidBees.dailyRecords[withLiquidBees.dailyRecords.length - 1].date,
    initialCapital: 1000000,
    baselineFinal: Math.round(baseline.dailyRecords[baseline.dailyRecords.length - 1].totalEquity),
    liquidBeesFinal: Math.round(withLiquidBees.dailyRecords[withLiquidBees.dailyRecords.length - 1].totalEquity),
    optimizedFinal: Math.round(optimizedEngine.dailyRecords[optimizedEngine.dailyRecords.length - 1].totalEquity)
  },
  yearlyBaseline,
  yearlyLiquidBees,
  etfBreakdown,
  topDrawdowns,
  monthlyMatrix,
  slotStats
};

fs.writeFileSync(
  path.join(dataDir, 'full_institutional_etf_report.json'),
  JSON.stringify(fullReport, null, 2),
  'utf8'
);

console.log('✅ Full institutional ETF report generated!');
console.log('\n--- YEAR BY YEAR PERFORMANCE (WITH LIQUIDBEES CASH YIELD) ---');
console.table(yearlyLiquidBees);

console.log('\n--- TOP 10 PROFIT GENERATING SECTOR ETFS ---');
console.table(etfBreakdown.slice(0, 10));

console.log('\n--- TOP 5 WORST HISTORICAL DRAWDOWNS ---');
console.table(topDrawdowns);

console.log('\n--- PORTFOLIO SLOT UTILIZATION ---');
console.log(slotStats);
