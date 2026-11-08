export interface RatioInputs {
  dailyEquities: number[];
  tradeReturnsR: number[];
  initialCapital: number;
  finalEquity: number;
  grossProfitCash: number;
  grossLossCash: number;
  maxDrawdownCash: number;
  maxDrawdownPct: number;
  totalDays: number;
  annualizationFactor?: number; // 252 or 365
  riskFreeRate?: number; // e.g. 0.0
}

export function calculateStandardRatios({
  dailyEquities,
  tradeReturnsR,
  initialCapital,
  finalEquity,
  grossProfitCash,
  grossLossCash,
  maxDrawdownCash,
  maxDrawdownPct,
  totalDays,
  annualizationFactor = 252,
  riskFreeRate = 0.0,
}: RatioInputs) {
  // 1. Daily Returns Series
  const dailyReturns: number[] = [];
  for (let i = 1; i < dailyEquities.length; i++) {
    const prev = dailyEquities[i - 1];
    const curr = dailyEquities[i];
    if (prev > 0) {
      dailyReturns.push((curr - prev) / prev);
    }
  }

  const nDays = dailyReturns.length;
  const rfDaily = riskFreeRate / annualizationFactor;

  let meanDailyReturn = 0;
  let variance = 0;
  let downsideVariance = 0;

  if (nDays > 1) {
    meanDailyReturn = dailyReturns.reduce((sum, r) => sum + r, 0) / nDays;
    const sumSqDiff = dailyReturns.reduce(
      (sum, r) => sum + Math.pow(r - meanDailyReturn, 2),
      0
    );
    variance = sumSqDiff / (nDays - 1);

    // Downside deviation strictly for returns below risk-free rate
    const sumDownsideSq = dailyReturns.reduce((sum, r) => {
      const under = Math.min(0, r - rfDaily);
      return sum + Math.pow(under, 2);
    }, 0);
    downsideVariance = sumDownsideSq / nDays;
  }

  const stdDaily = Math.sqrt(variance);
  const downsideDev = Math.sqrt(downsideVariance);

  // Annualized Sharpe Ratio
  const sharpeRatio =
    stdDaily > 0.000001
      ? ((meanDailyReturn - rfDaily) / stdDaily) * Math.sqrt(annualizationFactor)
      : 0;

  // Annualized Sortino Ratio
  const sortinoRatio =
    downsideDev > 0.000001
      ? ((meanDailyReturn - rfDaily) / downsideDev) * Math.sqrt(annualizationFactor)
      : sharpeRatio;

  // CAGR (Compound Annual Growth Rate)
  const years = Math.max(totalDays / 365.25, 0.05);
  const totalReturnMultiplier = finalEquity / Math.max(initialCapital, 1);
  const cagr =
    totalReturnMultiplier > 0
      ? (Math.pow(totalReturnMultiplier, 1 / years) - 1) * 100
      : 0;

  // Calmar Ratio = CAGR / MaxDD%
  const calmarRatio =
    maxDrawdownPct > 0.0001
      ? cagr / maxDrawdownPct
      : cagr > 0
        ? 99.9
        : 0;

  // Recovery Factor = Net Profit / Max DD Cash
  const netProfit = finalEquity - initialCapital;
  const recoveryFactor =
    maxDrawdownCash > 0 ? netProfit / maxDrawdownCash : netProfit > 0 ? 99.9 : 0;

  // Profit Factor
  const profitFactor =
    grossLossCash > 0
      ? grossProfitCash / grossLossCash
      : grossProfitCash > 0
        ? 99.9
        : 0;

  // System Quality Number (SQN) = sqrt(n) * mean(R) / std(R)
  const nTrades = tradeReturnsR.length;
  let sqn = 0;
  let avgR = 0;
  if (nTrades > 1) {
    avgR = tradeReturnsR.reduce((sum, r) => sum + r, 0) / nTrades;
    const rVar =
      tradeReturnsR.reduce((sum, r) => sum + Math.pow(r - avgR, 2), 0) /
      (nTrades - 1);
    const rStd = Math.sqrt(rVar);
    if (rStd > 0.00001) {
      sqn = Math.sqrt(nTrades) * (avgR / rStd);
    }
  }

  // Kelly Criterion: K% = W - (1 - W) / (AvgWin / AvgLoss)
  const wins = tradeReturnsR.filter((r) => r > 0);
  const losses = tradeReturnsR.filter((r) => r <= 0);
  const winRate = nTrades > 0 ? wins.length / nTrades : 0;
  const avgWinR = wins.length > 0 ? wins.reduce((s, r) => s + r, 0) / wins.length : 1;
  const avgLossR = losses.length > 0 ? Math.abs(losses.reduce((s, r) => s + r, 0) / losses.length) : 1;
  const payoff = avgLossR > 0 ? avgWinR / avgLossR : 1;
  const kelly = payoff > 0 ? winRate - (1 - winRate) / payoff : 0;
  const kellyPercent = Math.max(0, Math.min(100, Math.round(kelly * 1000) / 10));

  // VaR 95% and CVaR 95% on per-trade R
  const sortedR = tradeReturnsR.slice().sort((a, b) => a - b);
  const varIndex = Math.floor(nTrades * 0.05);
  const var95TradeR = sortedR.length > 0 ? sortedR[varIndex] : 0;
  const cvar95Slice = sortedR.slice(0, Math.max(1, varIndex));
  const cvar95TradeR =
    cvar95Slice.length > 0
      ? cvar95Slice.reduce((s, r) => s + r, 0) / cvar95Slice.length
      : var95TradeR;

  // Ulcer Index: sqrt(mean(drawdownPct^2))
  let ulcerSumSq = 0;
  let peak = initialCapital;
  for (const eq of dailyEquities) {
    if (eq > peak) peak = eq;
    const dd = peak > 0 ? ((peak - eq) / peak) * 100 : 0;
    ulcerSumSq += Math.pow(dd, 2);
  }
  const ulcerIndex =
    dailyEquities.length > 0 ? Math.sqrt(ulcerSumSq / dailyEquities.length) : 0;
  const ulcerPerformanceIndex = ulcerIndex > 0 ? (cagr - riskFreeRate * 100) / ulcerIndex : 0;

  // Omega Ratio (threshold = 0)
  const posReturns = dailyReturns.filter((r) => r > 0).reduce((s, r) => s + r, 0);
  const negReturns = Math.abs(dailyReturns.filter((r) => r < 0).reduce((s, r) => s + r, 0));
  const omegaRatio = negReturns > 0 ? posReturns / negReturns : posReturns > 0 ? 10 : 1;

  // Gain-to-Pain Ratio: Sum(all profits) / |Sum(all losses)|
  const gainToPain = grossLossCash > 0 ? netProfit / grossLossCash : netProfit > 0 ? 10 : 0;

  return {
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    sortinoRatio: Math.round(sortinoRatio * 100) / 100,
    calmarRatio: Math.round(calmarRatio * 100) / 100,
    cagr: Math.round(cagr * 100) / 100,
    recoveryFactor: Math.round(recoveryFactor * 100) / 100,
    profitFactor: Math.round(profitFactor * 100) / 100,
    sqn: Math.round(sqn * 100) / 100,
    kellyPercent,
    var95TradeR: Math.round(var95TradeR * 100) / 100,
    cvar95TradeR: Math.round(cvar95TradeR * 100) / 100,
    ulcerIndex: Math.round(ulcerIndex * 100) / 100,
    ulcerPerformanceIndex: Math.round(ulcerPerformanceIndex * 100) / 100,
    omegaRatio: Math.round(omegaRatio * 100) / 100,
    gainToPain: Math.round(gainToPain * 100) / 100,
    annualizedVolatility: Math.round(stdDaily * Math.sqrt(annualizationFactor) * 1000) / 10,
  };
}


