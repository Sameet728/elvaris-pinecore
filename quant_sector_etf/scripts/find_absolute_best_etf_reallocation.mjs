import fs from 'fs';
import path from 'path';

const dataDir = 'c:/Users/samee/Desktop/Pine/quant_sector_etf/data';
const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, 'manifest.json'), 'utf8'));

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

function getScore(symbol, dateStr, momType) {
  if (momType === '13612W') {
    const r1 = getTrailingReturn(symbol, dateStr, 21);
    const r3 = getTrailingReturn(symbol, dateStr, 63);
    const r6 = getTrailingReturn(symbol, dateStr, 126);
    const r12 = getTrailingReturn(symbol, dateStr, 252);
    if (r1 === null || r3 === null || r6 === null || r12 === null) return null;
    return 12 * (r1 / 100) + 4 * (r3 / 100) + 2 * (r6 / 100) + 1 * (r12 / 100);
  }
  if (momType === '13612_Uniform') {
    const r1 = getTrailingReturn(symbol, dateStr, 21);
    const r3 = getTrailingReturn(symbol, dateStr, 63);
    const r6 = getTrailingReturn(symbol, dateStr, 126);
    const r12 = getTrailingReturn(symbol, dateStr, 252);
    if (r1 === null || r3 === null || r6 === null || r12 === null) return null;
    return (r1 + r3 + r6 + r12) / 4;
  }
  if (momType === '6M_Mom') {
    return getTrailingReturn(symbol, dateStr, 126);
  }
  if (momType === '12M_Mom') {
    return getTrailingReturn(symbol, dateStr, 252);
  }
  return null;
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

function runSim(params) {
  const {
    rebalDays,
    topN,
    stopLossPct,
    trailingStopPct,
    volWeighting,
    momType,
    defenseMode,
    dualCanary,
    cashYieldPct = 6.5,
    startDate = '2016-01-01',
    endDate = '2026-10-23',
    initialCapital = 1000000
  } = params;

  const validDates = masterDates.filter(d => d >= startDate && d <= endDate);
  const dailyCashInterest = Math.pow(1 + (cashYieldPct / 100), 1 / 252) - 1;

  let cash = initialCapital;
  let holdings = [];
  let daysSinceRebal = rebalDays;
  const dailyEquity = [];
  let totalTrades = 0;
  let winTrades = 0;

  for (let d = 0; d < validDates.length; d++) {
    const dateStr = validDates[d];

    if (cash > 0 && cashYieldPct > 0) {
      cash += cash * dailyCashInterest;
    }

    // Daily stops
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
        if (stopLossPct !== null && lossFromBuy <= -stopLossPct) triggered = true;
        if (trailingStopPct !== null && dropFromPeak <= -trailingStopPct) triggered = true;

        if (triggered) {
          cash += h.shares * c;
          totalTrades++;
          if (c > h.buyPrice) winTrades++;
        } else {
          survivors.push(h);
        }
      }
      holdings = survivors;
    }

    // Rebalance day
    daysSinceRebal++;
    if (daysSinceRebal >= rebalDays) {
      daysSinceRebal = 0;

      let totalVal = cash;
      for (const h of holdings) {
        const c = getClose(h.symbol, dateStr) || h.buyPrice;
        totalVal += h.shares * c;
      }

      // Canary evaluation
      const nC = getClose('NSE:NIFTYBEES', dateStr);
      const nSma = getSMA('NSE:NIFTYBEES', dateStr, 200);
      const nMom = getScore('NSE:NIFTYBEES', dateStr, momType);

      let canaryOk = (nC > nSma) && (nMom > 0);
      if (dualCanary) {
        const bC = getClose('NSE:BANKBEES', dateStr);
        const bSma = getSMA('NSE:BANKBEES', dateStr, 200);
        if (nC < nSma && bC < bSma) canaryOk = false;
      }

      let targets = [];
      if (!canaryOk) {
        // Defensive
        if (defenseMode === 'Dynamic_Gold_Cash') {
          const gC = getClose('NSE:GOLDBEES', dateStr);
          const gSma = getSMA('NSE:GOLDBEES', dateStr, 50);
          const gMom = getTrailingReturn('NSE:GOLDBEES', dateStr, 42);
          if (gC && gSma && gC > gSma && gMom > 0) {
            targets.push({ symbol: 'NSE:GOLDBEES', weight: 0.6 });
            targets.push({ symbol: 'CASH', weight: 0.4 });
          } else {
            targets.push({ symbol: 'CASH', weight: 1.0 });
          }
        } else if (defenseMode === 'GoldCash_60_40') {
          targets.push({ symbol: 'NSE:GOLDBEES', weight: 0.6 });
          targets.push({ symbol: 'CASH', weight: 0.4 });
        } else {
          targets.push({ symbol: 'CASH', weight: 1.0 });
        }
      } else {
        // Offensive
        const scored = [];
        for (const sym of offensivePool) {
          const c = getClose(sym, dateStr);
          const sma = getSMA(sym, dateStr, 200);
          const score = getScore(sym, dateStr, momType);
          const vol = volWeighting ? getVolatility(sym, dateStr, 42) : 1;

          if (score !== null && score > 0 && (sma ? c > sma : true)) {
            scored.push({ symbol: sym, score, vol: vol || 1 });
          }
        }

        if (scored.length === 0) {
          targets.push({ symbol: 'CASH', weight: 1.0 });
        } else {
          scored.sort((a, b) => b.score - a.score);
          const selected = scored.slice(0, Math.min(topN, scored.length));

          if (volWeighting && selected.length > 1) {
            const invVols = selected.map(s => 1 / s.vol);
            const sumInv = invVols.reduce((a, b) => a + b, 0);
            for (let i = 0; i < selected.length; i++) {
              targets.push({ symbol: selected[i].symbol, weight: invVols[i] / sumInv });
            }
          } else {
            const w = 1.0 / selected.length;
            for (const s of selected) {
              targets.push({ symbol: s.symbol, weight: w });
            }
          }
        }
      }

      // Check trade results for closed positions
      const newSyms = new Set(targets.map(t => t.symbol));
      for (const h of holdings) {
        if (!newSyms.has(h.symbol)) {
          const c = getClose(h.symbol, dateStr) || h.buyPrice;
          totalTrades++;
          if (c > h.buyPrice) winTrades++;
        }
      }

      // Rebalance capital
      cash = totalVal * 0.9995; // 0.05% slippage/comm
      const nextHoldings = [];
      for (const t of targets) {
        if (t.symbol === 'CASH') continue;
        const c = getClose(t.symbol, dateStr);
        if (!c) continue;
        const cap = totalVal * t.weight;
        const shares = Math.floor(cap / c);
        if (shares > 0) {
          cash -= shares * c;
          nextHoldings.push({
            symbol: t.symbol,
            shares,
            buyPrice: c,
            peakPrice: c,
            weight: t.weight
          });
        }
      }
      holdings = nextHoldings;
    }

    let dailyVal = cash;
    for (const h of holdings) {
      const c = getClose(h.symbol, dateStr) || h.buyPrice;
      dailyVal += h.shares * c;
    }
    dailyEquity.push({ date: dateStr, equity: dailyVal });
  }

  const finalVal = dailyEquity[dailyEquity.length - 1].equity;
  const years = (new Date(validDates[validDates.length - 1]) - new Date(validDates[0])) / (1000 * 60 * 60 * 24 * 365.25);
  const cagr = (Math.pow(finalVal / initialCapital, 1 / years) - 1) * 100;

  let peak = -Infinity;
  let maxDD = 0;
  for (const de of dailyEquity) {
    if (de.equity > peak) peak = de.equity;
    const dd = ((peak - de.equity) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }
  const calmar = maxDD > 0 ? cagr / maxDD : 0;

  // Covid max DD
  const covidSlice = dailyEquity.filter(de => de.date >= '2020-01-01' && de.date <= '2020-03-31');
  let covPeak = -Infinity;
  let covMaxDD = 0;
  for (const c of covidSlice) {
    if (c.equity > covPeak) covPeak = c.equity;
    const dd = ((covPeak - c.equity) / covPeak) * 100;
    if (dd > covMaxDD) covMaxDD = dd;
  }

  // Daily Sharpe
  const dailyReturns = [];
  for (let i = 1; i < dailyEquity.length; i++) {
    dailyReturns.push((dailyEquity[i].equity - dailyEquity[i - 1].equity) / dailyEquity[i - 1].equity);
  }
  const meanRet = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((a, b) => a + Math.pow(b - meanRet, 2), 0) / dailyReturns.length;
  const stdDev = Math.sqrt(variance);
  const rfrDaily = (cashYieldPct / 100) / 252;
  const sharpe = stdDev > 0 ? ((meanRet - rfrDaily) / stdDev) * Math.sqrt(252) : 0;

  return {
    params,
    cagr: Number(cagr.toFixed(2)),
    finalLakhs: Number((finalVal / 100000).toFixed(2)),
    maxDD: Number(maxDD.toFixed(2)),
    calmar: Number(calmar.toFixed(2)),
    sharpe: Number(sharpe.toFixed(2)),
    covidMaxDD: Number(covMaxDD.toFixed(1)),
    winRate: totalTrades > 0 ? Number(((winTrades / totalTrades) * 100).toFixed(1)) : 0,
    trades: totalTrades
  };
}

// Run Extensive Grid Search
const rebalOptions = [8, 10, 12, 15, 21];
const topNOptions = [1, 2, 3];
const stopLossOptions = [null, 5.0, 6.0, 7.0, 8.0];
const trailingStopOptions = [null, 10.0, 12.0];
const volWeightOptions = [false, true];
const momOptions = ['13612W', '13612_Uniform', '6M_Mom'];
const defenseOptions = ['Dynamic_Gold_Cash', 'Cash'];

const results = [];
let totalRuns = 0;

console.log('Running Systematic Grid Search across Parameter Space...');

for (const rebalDays of rebalOptions) {
  for (const topN of topNOptions) {
    for (const stopLossPct of stopLossOptions) {
      for (const trailingStopPct of trailingStopOptions) {
        for (const volWeighting of volWeightOptions) {
          for (const momType of momOptions) {
            for (const defenseMode of defenseOptions) {
              const res = runSim({
                rebalDays,
                topN,
                stopLossPct,
                trailingStopPct,
                volWeighting,
                momType,
                defenseMode,
                dualCanary: true
              });
              results.push(res);
              totalRuns++;
            }
          }
        }
      }
    }
  }
}

console.log(`Completed ${totalRuns} model configurations.`);

// Sort by Calmar
const topByCalmar = [...results].sort((a, b) => b.calmar - a.calmar).slice(0, 10);
// Sort by CAGR
const topByCAGR = [...results].sort((a, b) => b.cagr - a.cagr).slice(0, 10);

console.log('\n========================================================================================');
console.log('🥇 TOP 10 MODELS BY CALMAR RATIO (MAX RISK-ADJUSTED QUALITY)');
console.log('========================================================================================');
console.table(topByCalmar.map((r, i) => ({
  Rank: i + 1,
  Rebal: `${r.params.rebalDays}d`,
  TopN: r.params.topN,
  StopLoss: r.params.stopLossPct ? `${r.params.stopLossPct}%` : 'None',
  TrailStop: r.params.trailingStopPct ? `${r.params.trailingStopPct}%` : 'None',
  VolWeight: r.params.volWeighting ? 'Yes' : 'No',
  Mom: r.params.momType,
  Defense: r.params.defenseMode,
  CAGR: `${r.cagr}%`,
  MaxDD: `${r.maxDD}%`,
  Calmar: r.calmar,
  Sharpe: r.sharpe,
  CovidDD: `${r.covidMaxDD}%`,
  WinRate: `${r.winRate}%`,
  FinalVal: `₹${r.finalLakhs}L`
})));

console.log('\n========================================================================================');
console.log('🚀 TOP 10 MODELS BY TOTAL RETURNS / CAGR (MAXIMUM WEALTH MULTIPLIER)');
console.log('========================================================================================');
console.table(topByCAGR.map((r, i) => ({
  Rank: i + 1,
  Rebal: `${r.params.rebalDays}d`,
  TopN: r.params.topN,
  StopLoss: r.params.stopLossPct ? `${r.params.stopLossPct}%` : 'None',
  TrailStop: r.params.trailingStopPct ? `${r.params.trailingStopPct}%` : 'None',
  VolWeight: r.params.volWeighting ? 'Yes' : 'No',
  Mom: r.params.momType,
  Defense: r.params.defenseMode,
  CAGR: `${r.cagr}%`,
  MaxDD: `${r.maxDD}%`,
  Calmar: r.calmar,
  Sharpe: r.sharpe,
  CovidDD: `${r.covidMaxDD}%`,
  WinRate: `${r.winRate}%`,
  FinalVal: `₹${r.finalLakhs}L`
})));

fs.writeFileSync(
  path.join(dataDir, 'grid_search_best_etf_models.json'),
  JSON.stringify({ topByCalmar, topByCAGR }, null, 2),
  'utf8'
);
