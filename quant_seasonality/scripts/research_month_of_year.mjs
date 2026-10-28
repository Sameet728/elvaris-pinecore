import fs from 'fs';

const btcDaily = JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_daily.json', 'utf8'));
const goldDaily = JSON.parse(fs.readFileSync('quant_seasonality/data/xauusd_daily.json', 'utf8'));

console.log('========================================================================');
console.log('       QUANTITATIVE RESEARCH: MONTH-OF-YEAR & TURN-OF-MONTH             ');
console.log('========================================================================');

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function analyzeMonthlySeasonality(bars, symbol) {
  console.log(`\n------------------------------------------------------------------------`);
  console.log(`  1. MONTH-OF-YEAR SEASONALITY FOR ${symbol}`);
  console.log(`------------------------------------------------------------------------`);

  // Group by year and month to get exact monthly percentage return
  const monthlyReturns = {}; // { '2020-01': retPct, ... }
  const monthByYear = {};

  for (let i = 0; i < bars.length; i++) {
    const d = new Date(bars[i].time);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;

    if (!monthByYear[key]) {
      monthByYear[key] = { year: y, month: m, open: bars[i].open, close: bars[i].close };
    } else {
      monthByYear[key].close = bars[i].close;
    }
  }

  // Aggregate by month (0-11)
  const monthStats = {};
  for (let m = 0; m < 12; m++) {
    monthStats[m] = {
      name: monthNames[m],
      years: 0,
      wins: 0,
      losses: 0,
      returns: [],
      eq: [100],
      peak: 100,
      maxDD: 0
    };
  }

  for (const [key, val] of Object.entries(monthByYear)) {
    const retPct = ((val.close - val.open) / val.open) * 100;
    const s = monthStats[val.month];
    s.years++;
    if (retPct > 0) s.wins++;
    else if (retPct < 0) s.losses++;
    s.returns.push(retPct);

    const prevEq = s.eq[s.eq.length - 1];
    const newEq = prevEq * (1 + retPct / 100);
    s.eq.push(newEq);
    if (newEq > s.peak) s.peak = newEq;
    const dd = ((s.peak - newEq) / s.peak) * 100;
    if (dd > s.maxDD) s.maxDD = dd;
  }

  console.log(`Month\t\tYears\tWinRate\tAvgRet%\tTotalRet%\tMaxDD%\tPF\tSharpe`);
  console.log(`---------------------------------------------------------------------------------------`);

  const ranked = [];

  for (let m = 0; m < 12; m++) {
    const s = monthStats[m];
    if (s.years === 0) continue;
    const wr = (s.wins / s.years) * 100;
    const avgRet = s.returns.reduce((a, b) => a + b, 0) / s.years;
    const totalRet = s.eq[s.eq.length - 1] - 100;

    const grossWin = s.returns.filter(r => r > 0).reduce((a, b) => a + b, 0);
    const grossLoss = Math.abs(s.returns.filter(r => r < 0).reduce((a, b) => a + b, 0));
    const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin;

    const mean = avgRet;
    const variance = s.returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / s.years;
    const stdDev = Math.sqrt(variance);
    const sharpe = stdDev > 0 ? (mean / stdDev) : 0;

    ranked.push({ month: s.name, monthNum: m, years: s.years, wr, avgRet, totalRet, maxDD: s.maxDD, pf, sharpe });

    console.log(`${s.name.padEnd(12)}\t${s.years}\t${wr.toFixed(1)}%\t${avgRet >= 0 ? '+' : ''}${avgRet.toFixed(2)}%\t${totalRet >= 0 ? '+' : ''}${totalRet.toFixed(1)}%\t${s.maxDD.toFixed(1)}%\t${pf.toFixed(2)}\t${sharpe.toFixed(2)}`);
  }

  return ranked;
}

function analyzeTurnOfMonth(bars, symbol) {
  console.log(`\n------------------------------------------------------------------------`);
  console.log(`  2. TURN-OF-MONTH (TOM) ANOMALY FOR ${symbol} (Days -2 to +3 of Month)`);
  console.log(`------------------------------------------------------------------------`);

  // Turn-of-Month (TOM): Buy 2 trading days before month end, hold through day 3 of new month
  // Non-TOM: Hold the rest of the month

  let tomReturns = [];
  let restReturns = [];

  let inTom = false;
  let tomEntry = 0;
  let eqTOM = [100], peakTOM = 100, maxDDTOM = 0;
  let eqRest = [100], peakRest = 100, maxDDRest = 0;

  for (let i = 0; i < bars.length; i++) {
    const d = new Date(bars[i].time);
    const dayOfMonth = d.getUTCDate();
    const retPct = ((bars[i].close - bars[i].open) / bars[i].open) * 100;

    // Check if within last 2 days of month or first 3 days of month
    // Simplified: day >= 28 or day <= 3
    const isTOM = dayOfMonth >= 28 || dayOfMonth <= 3;

    if (isTOM) {
      tomReturns.push(retPct);
      const prev = eqTOM[eqTOM.length - 1];
      const next = prev * (1 + retPct / 100);
      eqTOM.push(next);
      if (next > peakTOM) peakTOM = next;
      const dd = ((peakTOM - next) / peakTOM) * 100;
      if (dd > maxDDTOM) maxDDTOM = dd;
    } else {
      restReturns.push(retPct);
      const prev = eqRest[eqRest.length - 1];
      const next = prev * (1 + retPct / 100);
      eqRest.push(next);
      if (next > peakRest) peakRest = next;
      const dd = ((peakRest - next) / peakRest) * 100;
      if (dd > maxDDRest) maxDDRest = dd;
    }
  }

  const tomTrades = tomReturns.length;
  const tomWins = tomReturns.filter(r => r > 0).length;
  const tomWR = (tomWins / tomTrades) * 100;
  const tomTotal = eqTOM[eqTOM.length - 1] - 100;

  const restTrades = restReturns.length;
  const restWins = restReturns.filter(r => r > 0).length;
  const restWR = (restWins / restTrades) * 100;
  const restTotal = eqRest[eqRest.length - 1] - 100;

  console.log(`Cluster\t\t\tDays\tWinRate\tTotalRet%\tMaxDD%`);
  console.log(`-----------------------------------------------------------------------`);
  console.log(`Turn-of-Month (TOM)\t${tomTrades}\t${tomWR.toFixed(1)}%\t${tomTotal >= 0 ? '+' : ''}${tomTotal.toFixed(1)}%\t${maxDDTOM.toFixed(1)}%`);
  console.log(`Rest-of-Month (Mid)\t${restTrades}\t${restWR.toFixed(1)}%\t${restTotal >= 0 ? '+' : ''}${restTotal.toFixed(1)}%\t${maxDDRest.toFixed(1)}%`);

  return { tomTotal, tomWR, maxDDTOM, restTotal, restWR, maxDDRest };
}

const btcMonth = analyzeMonthlySeasonality(btcDaily, 'BITCOIN (BINANCE:BTCUSDT)');
const btcTOM = analyzeTurnOfMonth(btcDaily, 'BITCOIN (BINANCE:BTCUSDT)');

const goldMonth = analyzeMonthlySeasonality(goldDaily, 'GOLD (FOREXCOM:XAUUSD)');
const goldTOM = analyzeTurnOfMonth(goldDaily, 'GOLD (FOREXCOM:XAUUSD)');

fs.writeFileSync('quant_seasonality/data/monthly_seasonality_results.json', JSON.stringify({
  btcMonth, btcTOM, goldMonth, goldTOM
}, null, 2));

console.log('\nMonthly Seasonality results saved to quant_seasonality/data/monthly_seasonality_results.json');
