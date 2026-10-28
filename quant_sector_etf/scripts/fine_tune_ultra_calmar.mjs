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

// 13612W Fast Momentum
function get13612W(symbol, dateStr) {
  const r1 = getTrailingReturn(symbol, dateStr, 21);
  const r3 = getTrailingReturn(symbol, dateStr, 63);
  const r6 = getTrailingReturn(symbol, dateStr, 126);
  const r12 = getTrailingReturn(symbol, dateStr, 252);
  if (r1 === null || r3 === null || r6 === null || r12 === null) return null;
  return 12 * (r1 / 100) + 4 * (r3 / 100) + 2 * (r6 / 100) + 1 * (r12 / 100);
}

// 10-day volatility (standard deviation of daily returns)
function getVolatility(symbol, dateStr, period = 21) {
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
  return Math.sqrt(variance * 252); // Annualized volatility
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

function runFineTune(params) {
  const {
    rebalanceIntervalDays = 12,
    stopLossPct = 7.0,
    trailingStopPct = 10.0,
    topN = 3,
    volWeighting = false, // Inverse volatility weighting vs Equal weighting
    dualCanary = true, // Nifty + BankBees
    goldFilterSma = 50,
    cashYieldPct = 6.5,
    startDate = '2016-01-01',
    endDate = '2026-10-23',
    initialCapital = 1000000
  } = params;

  const validDates = masterDates.filter(d => d >= startDate && d <= endDate);
  const dailyCashInterest = Math.pow(1 + (cashYieldPct / 100), 1 / 252) - 1;

  let cash = initialCapital;
  let holdings = [];
  let daysSinceRebalance = rebalanceIntervalDays;
  const dailyEquity = [];

  for (let d = 0; d < validDates.length; d++) {
    const dateStr = validDates[d];

    if (cash > 0 && cashYieldPct > 0) {
      cash += cash * dailyCashInterest;
    }

    // 1. INTRADAY CIRCUIT BREAKER
    if (holdings.length > 0) {
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

        if (lossFromBuy <= -stopLossPct || dropFromPeak <= -trailingStopPct) {
          cash += h.shares * c;
        } else {
          survivors.push(h);
        }
      }
      holdings = survivors;
    }

    // 2. REBALANCE DAY
    daysSinceRebalance++;
    if (daysSinceRebalance >= rebalanceIntervalDays) {
      daysSinceRebalance = 0;

      let totalVal = cash;
      for (const h of holdings) {
        const c = getClose(h.symbol, dateStr) || h.buyPrice;
        totalVal += h.shares * c;
      }

      // Canary Checks
      const niftyC = getClose('NSE:NIFTYBEES', dateStr);
      const niftySma = getSMA('NSE:NIFTYBEES', dateStr, 200);
      const niftyMom = get13612W('NSE:NIFTYBEES', dateStr);

      let canaryOk = (niftyC > niftySma) && (niftyMom > 0);

      if (dualCanary) {
        const bankC = getClose('NSE:BANKBEES', dateStr);
        const bankSma = getSMA('NSE:BANKBEES', dateStr, 200);
        // If BOTH fail 200 SMA, it's a structural bear regime
        if (niftyC < niftySma && bankC < bankSma) {
          canaryOk = false;
        }
      }

      let targetAllocations = [];

      if (!canaryOk) {
        // DEFENSIVE ROUTE
        const goldC = getClose('NSE:GOLDBEES', dateStr);
        const goldSma = getSMA('NSE:GOLDBEES', dateStr, goldFilterSma);
        const goldMom = getTrailingReturn('NSE:GOLDBEES', dateStr, 42);

        if (goldC && goldSma && goldC > goldSma && goldMom > 0) {
          targetAllocations.push({ symbol: 'NSE:GOLDBEES', weight: 0.6 });
          targetAllocations.push({ symbol: 'CASH', weight: 0.4 });
        } else {
          targetAllocations.push({ symbol: 'CASH', weight: 1.0 });
        }
      } else {
        // OFFENSIVE ROUTE
        const scored = [];
        for (const sym of offensivePool) {
          const c = getClose(sym, dateStr);
          const sma = getSMA(sym, dateStr, 200);
          const score = get13612W(sym, dateStr);
          const vol = volWeighting ? getVolatility(sym, dateStr, 42) : 1;

          if (score !== null && score > 0 && (sma ? c > sma : true)) {
            scored.push({ symbol: sym, score, vol: vol || 1 });
          }
        }

        if (scored.length === 0) {
          targetAllocations.push({ symbol: 'CASH', weight: 1.0 });
        } else {
          scored.sort((a, b) => b.score - a.score);
          const selected = scored.slice(0, topN);

          if (volWeighting) {
            const invVols = selected.map(s => 1 / s.vol);
            const sumInv = invVols.reduce((a, b) => a + b, 0);
            for (let i = 0; i < selected.length; i++) {
              targetAllocations.push({
                symbol: selected[i].symbol,
                weight: invVols[i] / sumInv
              });
            }
          } else {
            const w = 1.0 / selected.length;
            for (const s of selected) {
              targetAllocations.push({ symbol: s.symbol, weight: w });
            }
          }
        }
      }

      // Execution
      cash = totalVal * (1 - 0.0005);
      const newHoldings = [];

      for (const alloc of targetAllocations) {
        if (alloc.symbol === 'CASH') continue;
        const c = getClose(alloc.symbol, dateStr);
        if (!c) continue;
        const targetAmt = totalVal * alloc.weight;
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

    let dayHoldingsVal = 0;
    for (const h of holdings) {
      const c = getClose(h.symbol, dateStr) || h.buyPrice;
      dayHoldingsVal += h.shares * c;
    }
    dailyEquity.push({ date: dateStr, equity: cash + dayHoldingsVal });
  }

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
    yearlyStats
  };
}

const tests = [];
for (const interval of [10, 12, 14, 15, 18]) {
  for (const sl of [6.0, 7.5, 8.5, 10.0]) {
    for (const trail of [10.0, 12.0, 15.0]) {
      for (const topN of [2, 3]) {
        for (const vol of [false, true]) {
          const res = runFineTune({
            rebalanceIntervalDays: interval,
            stopLossPct: sl,
            trailingStopPct: trail,
            topN,
            volWeighting: vol,
            dualCanary: true,
            goldFilterSma: 50
          });
          tests.push(res);
        }
      }
    }
  }
}

tests.sort((a, b) => b.calmar - a.calmar);

console.log('\n--- TOP 10 FINE-TUNED CALMAR CHAMPIONS ---');
console.table(tests.slice(0, 10).map((r, i) => ({
  Rank: i + 1,
  Interval: `${r.params.rebalanceIntervalDays}d`,
  StopLoss: `${r.params.stopLossPct}%`,
  TrailingStop: `${r.params.trailingStopPct}%`,
  TopN: r.params.topN,
  VolWeight: r.params.volWeighting ? 'Yes' : 'Equal',
  CAGR: `${r.cagr}%`,
  TotalReturn: `+${r.totalReturn}%`,
  FinalCapital: `₹${(r.finalCapital / 100000).toFixed(2)}L`,
  MaxDrawdown: `${r.maxDrawdown}%`,
  CalmarRatio: r.calmar
})));

const apex = tests[0];
console.log('\n=============================================');
console.log('👑 ALL-TIME APEX CALMAR ETF CHAMPION:');
console.log(apex.params);
console.log(`CAGR: ${apex.cagr}%`);
console.log(`Max Drawdown: ${apex.maxDrawdown}%`);
console.log(`Calmar Ratio: ${apex.calmar}`);
console.log('Year-by-Year Breakdown:');
console.table(apex.yearlyStats);
console.log('=============================================');

fs.writeFileSync(
  path.join(dataDir, 'apex_calmar_champion_results.json'),
  JSON.stringify({ apex, top10: tests.slice(0, 10) }, null, 2),
  'utf8'
);
