import { Trade } from '@/types/backtest';

export interface MT5Metrics {
  initialDeposit: number;
  totalNetProfit: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  expectedPayoff: number;
  recoveryFactor: number;
  sharpeRatio: number;
  marginLevel: number;
  
  // Drawdown
  balanceDrawdownAbsolute: number;
  balanceDrawdownMaximal: number;
  balanceDrawdownMaximalPct: number;
  balanceDrawdownRelative: number;
  balanceDrawdownRelativePct: number;
  
  // Trade stats
  totalTrades: number;
  shortTrades: number;
  shortTradesWonPct: number;
  longTrades: number;
  longTradesWonPct: number;
  profitTrades: number;
  profitTradesPct: number;
  lossTrades: number;
  lossTradesPct: number;
  
  // Trade sizes
  largestProfitTrade: number;
  largestLossTrade: number;
  averageProfitTrade: number;
  averageLossTrade: number;
  
  // Streaks
  maxConsecutiveWinsCount: number;
  maxConsecutiveWinsCash: number;
  maxConsecutiveLossesCount: number;
  maxConsecutiveLossesCash: number;
  avgConsecutiveWins: number;
  avgConsecutiveLosses: number;
  
  // Statistical tests
  zScore: number;
  confidenceLevelPct: number;
  ahpr: number; // Average Holding Period Return
  ghpr: number; // Geometric Holding Period Return
}

export function computeMT5Metrics(
  trades: Trade[] = [],
  initialDeposit: number = 100000,
  maxDrawdownCash: number = 0,
  maxDrawdownPct: number = 0,
  sharpeRatio: number = 0
): MT5Metrics {
  const safeTrades = Array.isArray(trades) ? trades : [];
  const totalTrades = safeTrades.length;
  if (totalTrades === 0) {
    return {
      initialDeposit,
      totalNetProfit: 0,
      grossProfit: 0,
      grossLoss: 0,
      profitFactor: 0,
      expectedPayoff: 0,
      recoveryFactor: 0,
      sharpeRatio: 0,
      marginLevel: 0,
      balanceDrawdownAbsolute: 0,
      balanceDrawdownMaximal: 0,
      balanceDrawdownMaximalPct: 0,
      balanceDrawdownRelative: 0,
      balanceDrawdownRelativePct: 0,
      totalTrades: 0,
      shortTrades: 0,
      shortTradesWonPct: 0,
      longTrades: 0,
      longTradesWonPct: 0,
      profitTrades: 0,
      profitTradesPct: 0,
      lossTrades: 0,
      lossTradesPct: 0,
      largestProfitTrade: 0,
      largestLossTrade: 0,
      averageProfitTrade: 0,
      averageLossTrade: 0,
      maxConsecutiveWinsCount: 0,
      maxConsecutiveWinsCash: 0,
      maxConsecutiveLossesCount: 0,
      maxConsecutiveLossesCash: 0,
      avgConsecutiveWins: 0,
      avgConsecutiveLosses: 0,
      zScore: 0,
      confidenceLevelPct: 0,
      ahpr: 1.0,
      ghpr: 1.0,
    };
  }

  const winningTrades = safeTrades.filter((t) => t.pnl > 0);
  const losingTrades = safeTrades.filter((t) => t.pnl <= 0);
  const longTrades = safeTrades.filter((t) => t.type === 'LONG');
  const shortTrades = safeTrades.filter((t) => t.type === 'SHORT');

  const grossProfit = winningTrades.reduce((acc, t) => acc + t.pnl, 0);
  const grossLoss = Math.abs(losingTrades.reduce((acc, t) => acc + t.pnl, 0));
  const totalNetProfit = grossProfit - grossLoss;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99.9 : 0;
  const expectedPayoff = totalTrades > 0 ? totalNetProfit / totalTrades : 0;
  const recoveryFactor = maxDrawdownCash > 0 ? totalNetProfit / maxDrawdownCash : totalNetProfit > 0 ? 99.9 : 0;

  const longWins = longTrades.filter((t) => t.pnl > 0).length;
  const shortWins = shortTrades.filter((t) => t.pnl > 0).length;

  const largestProfitTrade = winningTrades.length > 0 ? Math.max(...winningTrades.map((t) => t.pnl)) : 0;
  const largestLossTrade = losingTrades.length > 0 ? Math.min(...losingTrades.map((t) => t.pnl)) : 0;
  const averageProfitTrade = winningTrades.length > 0 ? grossProfit / winningTrades.length : 0;
  const averageLossTrade = losingTrades.length > 0 ? grossLoss / losingTrades.length : 0;

  // Streaks calculation
  let curWinStreak = 0;
  let curWinCash = 0;
  let maxWinCount = 0;
  let maxWinCash = 0;
  const winStreaks: number[] = [];

  let curLossStreak = 0;
  let curLossCash = 0;
  let maxLossCount = 0;
  let maxLossCash = 0;
  const lossStreaks: number[] = [];

  for (const t of safeTrades) {
    if (t.pnl > 0) {
      curWinStreak++;
      curWinCash += t.pnl;
      if (curWinStreak > maxWinCount) maxWinCount = curWinStreak;
      if (curWinCash > maxWinCash) maxWinCash = curWinCash;

      if (curLossStreak > 0) {
        lossStreaks.push(curLossStreak);
        curLossStreak = 0;
        curLossCash = 0;
      }
    } else {
      curLossStreak++;
      curLossCash += Math.abs(t.pnl);
      if (curLossStreak > maxLossCount) maxLossCount = curLossStreak;
      if (curLossCash > maxLossCash) maxLossCash = curLossCash;

      if (curWinStreak > 0) {
        winStreaks.push(curWinStreak);
        curWinStreak = 0;
        curWinCash = 0;
      }
    }
  }
  if (curWinStreak > 0) winStreaks.push(curWinStreak);
  if (curLossStreak > 0) lossStreaks.push(curLossStreak);

  const avgConsecutiveWins =
    winStreaks.length > 0 ? winStreaks.reduce((a, b) => a + b, 0) / winStreaks.length : 0;
  const avgConsecutiveLosses =
    lossStreaks.length > 0 ? lossStreaks.reduce((a, b) => a + b, 0) / lossStreaks.length : 0;

  // Z-Score for Runs (Wald-Wolfowitz Runs Test)
  // Number of runs
  let runs = 1;
  for (let i = 1; i < trades.length; i++) {
    const prevWin = trades[i - 1].pnl > 0;
    const curWin = trades[i].pnl > 0;
    if (prevWin !== curWin) runs++;
  }

  const N = totalTrades;
  const W = winningTrades.length;
  const L = losingTrades.length;
  let zScore = 0;
  let confidenceLevelPct = 50;

  if (W > 0 && L > 0 && N > 10) {
    const expectedRuns = (2 * W * L) / N + 1;
    const varianceRuns = (2 * W * L * (2 * W * L - N)) / (N * N * (N - 1));
    if (varianceRuns > 0) {
      zScore = (runs - expectedRuns) / Math.sqrt(varianceRuns);
      // Approximate normal cumulative probability for |Z|
      const absZ = Math.abs(zScore);
      // Error function approximation
      const t = 1 / (1 + 0.2316419 * absZ);
      const d = 0.3989423 * Math.exp((-absZ * absZ) / 2);
      const prob = 1 - d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
      confidenceLevelPct = Math.min(99.9, Math.max(50, prob * 100));
    }
  }

  // AHPR and GHPR
  let hprSum = 0;
  let logHprSum = 0;
  let equity = initialDeposit;
  for (const t of trades) {
    const hpr = equity > 0 ? (equity + t.pnl) / equity : 1.0;
    equity += t.pnl;
    hprSum += hpr;
    logHprSum += Math.log(Math.max(0.0001, hpr));
  }
  const ahpr = totalTrades > 0 ? hprSum / totalTrades : 1.0;
  const ghpr = totalTrades > 0 ? Math.exp(logHprSum / totalTrades) : 1.0;

  return {
    initialDeposit,
    totalNetProfit: Math.round(totalNetProfit * 100) / 100,
    grossProfit: Math.round(grossProfit * 100) / 100,
    grossLoss: Math.round(grossLoss * 100) / 100,
    profitFactor: Math.round(profitFactor * 100) / 100,
    expectedPayoff: Math.round(expectedPayoff * 100) / 100,
    recoveryFactor: Math.round(recoveryFactor * 100) / 100,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    marginLevel: 2500, // 1:100 leverage standard
    balanceDrawdownAbsolute: Math.round(maxDrawdownCash * 100) / 100,
    balanceDrawdownMaximal: Math.round(maxDrawdownCash * 100) / 100,
    balanceDrawdownMaximalPct: Math.round(maxDrawdownPct * 100) / 100,
    balanceDrawdownRelative: Math.round(maxDrawdownCash * 100) / 100,
    balanceDrawdownRelativePct: Math.round(maxDrawdownPct * 100) / 100,
    totalTrades,
    shortTrades: shortTrades.length,
    shortTradesWonPct: shortTrades.length > 0 ? Math.round((shortWins / shortTrades.length) * 1000) / 10 : 0,
    longTrades: longTrades.length,
    longTradesWonPct: longTrades.length > 0 ? Math.round((longWins / longTrades.length) * 1000) / 10 : 0,
    profitTrades: winningTrades.length,
    profitTradesPct: Math.round((winningTrades.length / totalTrades) * 1000) / 10,
    lossTrades: losingTrades.length,
    lossTradesPct: Math.round((losingTrades.length / totalTrades) * 1000) / 10,
    largestProfitTrade: Math.round(largestProfitTrade * 100) / 100,
    largestLossTrade: Math.round(largestLossTrade * 100) / 100,
    averageProfitTrade: Math.round(averageProfitTrade * 100) / 100,
    averageLossTrade: Math.round(averageLossTrade * 100) / 100,
    maxConsecutiveWinsCount: maxWinCount,
    maxConsecutiveWinsCash: Math.round(maxWinCash * 100) / 100,
    maxConsecutiveLossesCount: maxLossCount,
    maxConsecutiveLossesCash: Math.round(maxLossCash * 100) / 100,
    avgConsecutiveWins: Math.round(avgConsecutiveWins * 10) / 10,
    avgConsecutiveLosses: Math.round(avgConsecutiveLosses * 10) / 10,
    zScore: Math.round(zScore * 100) / 100,
    confidenceLevelPct: Math.round(confidenceLevelPct * 10) / 10,
    ahpr: Math.round(ahpr * 10000) / 10000,
    ghpr: Math.round(ghpr * 10000) / 10000,
  };
}

