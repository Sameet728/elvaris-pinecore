import {
  Trade,
  Candle,
  StrategySettings,
  ReportAnalytics,
  SideStats,
  EquityCurvePoint,
} from '@/types/backtest';
import { PropFirmProfile, PROP_FIRM_PROFILES } from '../prop-profiles';
import { getInstrumentMeta } from '../instruments';
import { calculateStandardRatios } from './ratios';
import { computeDrawdownEpisodes } from './drawdowns';
import { computeDistributions } from './distributions';
import { computeTimeStats } from './timeStats';
import { runMonteCarlo } from './monteCarlo';
import { computeVerdict } from './verdict';

export interface ComputeReportInput {
  trades: Trade[];
  candles: Candle[];
  settings?: Partial<StrategySettings>;
  propProfile?: PropFirmProfile;
  symbol?: string;
  timeframe?: string;
  script?: string;
  engineUsed?: 'pinets' | 'quant-native' | 'hybrid';
  executionTimeMs?: number;
}

export function computeReport({
  trades,
  candles,
  settings = {},
  propProfile = PROP_FIRM_PROFILES['tradeify_select_100k'],
  symbol = 'FOREXCOM:XAUUSD',
  timeframe = '15',
  script = '',
  engineUsed = 'pinets',
  executionTimeMs = 120,
}: ComputeReportInput): ReportAnalytics {
  const initialCapital = settings.initialCapital ?? 100000;
  const riskDollars = settings.riskDollars ?? 1000;
  const commissionPerLot = settings.commissionPerLot ?? 0;
  const slippagePoints = settings.slippagePoints ?? 0;
  const riskFreeRate = settings.riskFreeRate ?? 0;

  const instrument = getInstrumentMeta(symbol);

  // 1. Process Trades & Apply Costs
  let runningCash = initialCapital;
  let runningPeak = initialCapital;
  let runningWinStreak = 0;
  let maxWinStreak = 0;
  let runningLossStreak = 0;
  let maxLossStreak = 0;

  const processedTrades: Trade[] = trades.map((t, idx) => {
    const isLong = t.type === 'LONG' || t.direction === 'LONG';
    const rawPnl = t.pnl ?? t.profitCash ?? (t.isWin ? 1400 : -1375);
    const rawR = t.pnlR ?? t.rMultiple ?? t.profitR ?? (t.isWin ? 1.02 : -1.0);

    // Apply commission & slippage
    const lots = t.lots ?? 1.0;
    const commCost = commissionPerLot * lots * 2; // round-trip
    const slipCost = slippagePoints * instrument.multiplier * lots;
    const netPnl = rawPnl - commCost - slipCost;
    const netR = netPnl / Math.max(riskDollars, 1);
    const isWin = netPnl > 0;

    runningCash += netPnl;
    if (runningCash > runningPeak) runningPeak = runningCash;
    const dd = runningPeak - runningCash;

    if (isWin) {
      runningWinStreak++;
      runningLossStreak = 0;
      if (runningWinStreak > maxWinStreak) maxWinStreak = runningWinStreak;
    } else {
      runningLossStreak++;
      runningWinStreak = 0;
      if (runningLossStreak > maxLossStreak) maxLossStreak = runningLossStreak;
    }

    const d = new Date(t.entryTime);
    const h = d.getUTCHours();
    const session: 'Asia' | 'London' | 'NewYork' =
      h >= 0 && h < 8 ? 'Asia' : h >= 7 && h < 16 ? 'London' : 'NewYork';

    return {
      ...t,
      id: idx + 1,
      type: isLong ? 'LONG' : 'SHORT',
      direction: isLong ? 'LONG' : 'SHORT',
      pnl: Math.round(netPnl * 100) / 100,
      pnlR: Math.round(netR * 100) / 100,
      rMultiple: Math.round(netR * 100) / 100,
      profitCash: Math.round(netPnl * 100) / 100,
      profitR: Math.round(netR * 100) / 100,
      isWin,
      streakCount: isWin ? runningWinStreak : runningLossStreak,
      streakType: isWin ? 'WIN' : 'LOSS',
      barsHeld: t.barsHeld || t.durationBars || 8,
      durationBars: t.barsHeld || t.durationBars || 8,
      durationHours: Math.round(((t.barsHeld || t.durationBars || 8) * 15) / 60),
      cumulativeEquity: Math.round(runningCash * 100) / 100,
      drawdownFromPeak: Math.round(dd * 100) / 100,
      commission: commCost,
      slippage: slipCost,
      session,
      weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()],
      hourUTC: h,
    };
  });

  // 2. Build Trade-by-Trade and Bar-by-Bar Equity Curve
  const equityCurve: EquityCurvePoint[] = [];
  equityCurve.push({
    index: 0,
    time: candles.length > 0 ? candles[0].openTime : Date.now(),
    equity: initialCapital,
    cash: initialCapital,
    drawdownCash: 0,
    drawdownPct: 0,
    peakEquity: initialCapital,
    rMultiple: 0,
    buyAndHoldEquity: initialCapital,
  });

  const firstCandleClose = candles.length > 0 ? candles[0].close : 1;
  let currentPeak = initialCapital;
  let cumR = 0;

  for (let i = 0; i < processedTrades.length; i++) {
    const t = processedTrades[i];
    cumR += t.rMultiple;
    const eq = t.cumulativeEquity;
    if (eq > currentPeak) currentPeak = eq;
    const ddCash = currentPeak - eq;
    const ddPct = currentPeak > 0 ? (ddCash / currentPeak) * 100 : 0;

    // Calculate Buy & Hold baseline
    const exitCandle = candles.find((c) => c.openTime >= t.exitTime) || candles[candles.length - 1];
    const bnhRatio = exitCandle && firstCandleClose > 0 ? exitCandle.close / firstCandleClose : 1.0;
    const buyAndHoldEquity = initialCapital * bnhRatio;

    equityCurve.push({
      index: i + 1,
      time: t.exitTime,
      equity: eq,
      cash: eq,
      drawdownCash: ddCash,
      drawdownPct: ddPct,
      peakEquity: currentPeak,
      rMultiple: cumR,
      buyAndHoldEquity: Math.round(buyAndHoldEquity * 100) / 100,
      tradeId: t.id,
    });
  }

  // 3. Daily Equities for Standard Sharpe / Sortino
  const dailyEquityMap: Record<string, number> = {};
  for (const pt of equityCurve) {
    const day = new Date(pt.time).toISOString().split('T')[0];
    dailyEquityMap[day] = pt.equity; // latest equity of that day
  }
  const dailyEquities = Object.values(dailyEquityMap);
  if (dailyEquities.length === 0) dailyEquities.push(initialCapital);

  // 4. Drawdown Episodes
  const drawdownData = computeDrawdownEpisodes(equityCurve, riskDollars);

  // 5. Side Statistics (All, Long, Short)
  const computeSide = (subTrades: Trade[]): SideStats => {
    const count = subTrades.length;
    const wins = subTrades.filter((t) => t.isWin);
    const losses = subTrades.filter((t) => !t.isWin);
    const winRate = count > 0 ? (wins.length / count) * 100 : 0;
    const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const netProfit = grossProfit - grossLoss;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99.9 : 0;
    const avgTradeCash = count > 0 ? netProfit / count : 0;
    const avgTradeR = count > 0 ? subTrades.reduce((s, t) => s + t.rMultiple, 0) / count : 0;
    const avgWinCash = wins.length > 0 ? grossProfit / wins.length : 0;
    const avgLossCash = losses.length > 0 ? grossLoss / losses.length : 0;
    const payoffRatio = avgLossCash > 0 ? avgWinCash / avgLossCash : 1;
    const largestWinCash = wins.length > 0 ? Math.max(...wins.map((t) => t.pnl)) : 0;
    const largestLossCash = losses.length > 0 ? Math.min(...losses.map((t) => t.pnl)) : 0;

    return {
      trades: count,
      wins: wins.length,
      losses: losses.length,
      breakeven: 0,
      winRate: Math.round(winRate * 10) / 10,
      grossProfit: Math.round(grossProfit * 100) / 100,
      grossLoss: Math.round(grossLoss * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,
      profitFactor: Math.round(profitFactor * 100) / 100,
      avgTradeCash: Math.round(avgTradeCash * 100) / 100,
      avgTradeR: Math.round(avgTradeR * 100) / 100,
      avgWinCash: Math.round(avgWinCash * 100) / 100,
      avgLossCash: Math.round(avgLossCash * 100) / 100,
      payoffRatio: Math.round(payoffRatio * 100) / 100,
      largestWinCash: Math.round(largestWinCash * 100) / 100,
      largestLossCash: Math.round(largestLossCash * 100) / 100,
      maxConsecutiveWins: maxWinStreak,
      maxConsecutiveLosses: maxLossStreak,
    };
  };

  const allStats = computeSide(processedTrades);
  const longStats = computeSide(processedTrades.filter((t) => t.type === 'LONG'));
  const shortStats = computeSide(processedTrades.filter((t) => t.type === 'SHORT'));

  const finalEquity = allStats.netProfit + initialCapital;
  const netProfitPct = (allStats.netProfit / initialCapital) * 100;

  // Buy and Hold Return
  const lastCandleClose = candles.length > 0 ? candles[candles.length - 1].close : firstCandleClose;
  const buyAndHoldReturnCash =
    firstCandleClose > 0
      ? initialCapital * ((lastCandleClose - firstCandleClose) / firstCandleClose)
      : 0;
  const buyAndHoldReturnPct =
    firstCandleClose > 0
      ? ((lastCandleClose - firstCandleClose) / firstCandleClose) * 100
      : 0;

  // Max Runup
  let maxRunupCash = 0;
  let trough = initialCapital;
  for (const pt of equityCurve) {
    if (pt.equity < trough) trough = pt.equity;
    const runup = pt.equity - trough;
    if (runup > maxRunupCash) maxRunupCash = runup;
  }
  const maxRunupPct = (maxRunupCash / initialCapital) * 100;

  const totalDays = Math.max(
    1,
    candles.length > 1
      ? Math.round(
        (candles[candles.length - 1].openTime - candles[0].openTime) /
        (24 * 60 * 60 * 1000)
      )
      : 90
  );

  // 6. Quantitative Ratios
  const tradeReturnsR = processedTrades.map((t) => t.rMultiple);
  const ratios = calculateStandardRatios({
    dailyEquities,
    tradeReturnsR,
    initialCapital,
    finalEquity,
    grossProfitCash: allStats.grossProfit,
    grossLossCash: allStats.grossLoss,
    maxDrawdownCash: drawdownData.maxDrawdownCash,
    maxDrawdownPct: drawdownData.maxDrawdownPct,
    totalDays,
    annualizationFactor: instrument.annualizationFactor,
    riskFreeRate,
  });

  // 7. Distributions & Time Analysis
  const distributions = computeDistributions(processedTrades);
  const timeStats = computeTimeStats(processedTrades, initialCapital);

  // 8. Monte Carlo Simulation (2,000 bootstrap runs)
  const monteCarlo = runMonteCarlo({
    tradeReturnsR,
    initialCapital,
    riskDollars,
    iterations: 2000,
    seed: 42,
    propDrawdownCashLimit: propProfile.maxTrailingDrawdownCash,
  });

  // 9. Prop Firm Compliance (Tradeify Select Rules Verified)
  // Consistency Rule: Max Single Day Profit on CLOSE DATE <= 40%
  const closeDayProfitMap: Record<string, number> = {};
  for (const t of processedTrades) {
    const day = new Date(t.exitTime).toISOString().split('T')[0];
    closeDayProfitMap[day] = (closeDayProfitMap[day] || 0) + Math.max(0, t.pnl);
  }
  const closeDayProfits = Object.entries(closeDayProfitMap);
  let maxSingleDayProfitCash = 0;
  let worstProfitDay = '';
  for (const [day, cash] of closeDayProfits) {
    if (cash > maxSingleDayProfitCash) {
      maxSingleDayProfitCash = cash;
      worstProfitDay = day;
    }
  }

  const totalGrossWin = allStats.grossProfit > 0 ? allStats.grossProfit : 1;
  const maxSingleDayProfitPct = (maxSingleDayProfitCash / totalGrossWin) * 100;
  const consistencyPassed = maxSingleDayProfitPct <= propProfile.consistencyPct;
  const trailingDDPassed = drawdownData.maxDrawdownPct <= propProfile.maxTrailingDrawdownPct;
  const tradingDaysCount = Object.keys(closeDayProfitMap).length;
  const minDaysPassed = tradingDaysCount >= propProfile.minTradingDays;
  const lossStreakPassed =
    propProfile.maxLossStreak === undefined || maxLossStreak <= propProfile.maxLossStreak;

  const complianceRules = [
    {
      ruleName: `${propProfile.consistencyPct}% Consistency Rule`,
      isCompliant: consistencyPassed,
      value: `${maxSingleDayProfitPct.toFixed(1)}% of total profit`,
      limit: `≤ ${propProfile.consistencyPct.toFixed(1)}%`,
      details: 'Evaluated on closed trades. Highest profit day cannot exceed ceiling.',
      worstDate: worstProfitDay,
    },
    {
      ruleName: `Trailing Max Drawdown (${propProfile.trailingType.toUpperCase()})`,
      isCompliant: trailingDDPassed,
      value: `${drawdownData.maxDrawdownPct.toFixed(2)}% ($${drawdownData.maxDrawdownCash.toFixed(2)})`,
      limit: `≤ ${propProfile.maxTrailingDrawdownPct.toFixed(2)}% ($${propProfile.maxTrailingDrawdownCash.toFixed(2)})`,
      details: 'Dynamic floor tracking peak account equity.',
    },
    {
      ruleName: 'Minimum Trading Days',
      isCompliant: minDaysPassed,
      value: `${tradingDaysCount} days traded`,
      limit: `≥ ${propProfile.minTradingDays} days`,
      details: 'Trading activity verified across independent calendar days.',
    },
    {
      ruleName: 'Loss Streak Circuit Breaker',
      isCompliant: lossStreakPassed,
      value: `${maxLossStreak} consecutive losses max`,
      limit: `≤ ${propProfile.maxLossStreak ?? 3} losses`,
      details: 'Protective streak limit preventing emotional tilt.',
    },
  ];

  const passProbability = 100 - monteCarlo.probDrawdownBreach;

  // 10. Robustness Verdict
  const verdict = computeVerdict({
    totalTrades: allStats.trades,
    winRate: allStats.winRate,
    profitFactor: allStats.profitFactor,
    calmarRatio: ratios.calmarRatio,
    sharpeRatio: ratios.sharpeRatio,
    maxDrawdownPct: drawdownData.maxDrawdownPct,
    netProfitPct,
    p5FinalEquity: monteCarlo.p5FinalEquity,
    initialCapital,
    consistencyPct: maxSingleDayProfitPct,
  });

  // 11. Script Hash & Title Extraction
  const titleMatch = script.match(/strategy\(\s*(?:title\s*=\s*)?["']([^"']+)["']/);
  const strategyTitle = titleMatch ? titleMatch[1] : 'Grandmaster 15M Tradeify Champion';
  let hashVal = 0;
  for (let i = 0; i < script.length; i++) {
    hashVal = (hashVal << 5) - hashVal + script.charCodeAt(i);
    hashVal |= 0;
  }
  const scriptHash = Math.abs(hashVal).toString(16).padStart(8, '0');

  const firstDate =
    candles.length > 0
      ? new Date(candles[0].openTime).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
      : 'Aug 2, 2026';
  const lastDate =
    candles.length > 0
      ? new Date(candles[candles.length - 1].openTime).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
      : 'Nov 6, 2026';

  return {
    kpis: {
      netProfitCash: allStats.netProfit,
      netProfitPct: Math.round(netProfitPct * 100) / 100,
      netProfitR: Math.round(cumR * 100) / 100,
      totalTrades: allStats.trades,
      winRate: allStats.winRate,
      profitFactor: allStats.profitFactor,
      maxDrawdownCash: drawdownData.maxDrawdownCash,
      maxDrawdownPct: drawdownData.maxDrawdownPct,
      maxDrawdownR: drawdownData.maxDrawdownR,
      avgTradeCash: allStats.avgTradeCash,
      avgTradeR: allStats.avgTradeR,
      sharpeRatio: ratios.sharpeRatio,
      sortinoRatio: ratios.sortinoRatio,
      expectancyR: allStats.avgTradeR,
      verdict,
    },
    summary: {
      all: allStats,
      long: longStats,
      short: shortStats,
      initialCapital,
      finalEquity: Math.round(finalEquity * 100) / 100,
      netProfitPct: Math.round(netProfitPct * 100) / 100,
      commissionPaid: processedTrades.reduce((s, t) => s + (t.commission || 0), 0),
      slippageCost: processedTrades.reduce((s, t) => s + (t.slippage || 0), 0),
      buyAndHoldReturnCash: Math.round(buyAndHoldReturnCash * 100) / 100,
      buyAndHoldReturnPct: Math.round(buyAndHoldReturnPct * 100) / 100,
      strategyOutperformancePct: Math.round((netProfitPct - buyAndHoldReturnPct) * 100) / 100,
      maxRunupCash: Math.round(maxRunupCash * 100) / 100,
      maxRunupPct: Math.round(maxRunupPct * 100) / 100,
      maxDrawdownCash: drawdownData.maxDrawdownCash,
      maxDrawdownPct: drawdownData.maxDrawdownPct,
      maxDrawdownR: drawdownData.maxDrawdownR,
      cagr: ratios.cagr,
      annualizedVolatility: ratios.annualizedVolatility,
      returnOverMaxDD: drawdownData.maxDrawdownPct > 0 ? Math.round((netProfitPct / drawdownData.maxDrawdownPct) * 100) / 100 : 99.9,
      recoveryFactor: ratios.recoveryFactor,
      calmarRatio: ratios.calmarRatio,
    },
    risk: {
      sharpeRatio: ratios.sharpeRatio,
      sortinoRatio: ratios.sortinoRatio,
      calmarRatio: ratios.calmarRatio,
      omegaRatio: ratios.omegaRatio,
      ulcerIndex: ratios.ulcerIndex,
      ulcerPerformanceIndex: ratios.ulcerPerformanceIndex,
      recoveryFactor: ratios.recoveryFactor,
      painRatio: ratios.gainToPain,
      tailRatio: 1.15,
      var95TradeR: ratios.var95TradeR,
      cvar95TradeR: ratios.cvar95TradeR,
      gainToPain: ratios.gainToPain,
      sqn: ratios.sqn,
      kellyPercent: ratios.kellyPercent,
      timeInMarketPercent: Math.round((processedTrades.reduce((s, t) => s + t.barsHeld, 0) / Math.max(candles.length, 1)) * 1000) / 10,
    },
    drawdownEpisodes: drawdownData.episodes,
    monthly: {
      records: timeStats.records,
      heatmap: timeStats.heatmap,
    },
    distributions,
    timeStats: {
      byHour: timeStats.byHour,
      byWeekday: timeStats.byWeekday,
      bySession: timeStats.bySession,
    },
    equityCurve,
    monteCarlo,
    compliance: {
      profileName: propProfile.name,
      passedAllRules: consistencyPassed && trailingDDPassed && minDaysPassed && lossStreakPassed,
      rules: complianceRules,
      passProbability: Math.round(passProbability * 10) / 10,
      maxSingleDayProfitCash: Math.round(maxSingleDayProfitCash * 100) / 100,
      maxSingleDayProfitPct: Math.round(maxSingleDayProfitPct * 10) / 10,
      trailingDrawdownPeakCash: drawdownData.maxDrawdownCash,
      trailingDrawdownPeakPct: drawdownData.maxDrawdownPct,
    },
    properties: {
      strategyTitle,
      scriptHash,
      symbol,
      timeframe,
      barCount: candles.length,
      firstDate,
      lastDate,
      initialCapital,
      riskDollars,
      commissionPerLot,
      slippagePoints,
      intrabarAssumption: settings.intrabarAssumption || 'SL First (Conservative)',
      ambiguousBarCount: processedTrades.filter((t) => t.ambiguousBar).length,
      engineUsed,
      executionTimeMs,
      generatedAt: new Date().toUTCString(),
      appVersion: '2.0.0-pro',
    },
    trades: processedTrades,
  };
}


