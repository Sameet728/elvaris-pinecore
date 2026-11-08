import { ReportVerdict } from '@/types/backtest';

export interface VerdictInputs {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  calmarRatio: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
  netProfitPct: number;
  p5FinalEquity: number;
  initialCapital: number;
  consistencyPct: number;
}

export function computeVerdict({
  totalTrades,
  winRate,
  profitFactor,
  calmarRatio,
  sharpeRatio,
  maxDrawdownPct,
  netProfitPct,
  p5FinalEquity,
  initialCapital,
  consistencyPct,
}: VerdictInputs): ReportVerdict {
  const reasons: string[] = [];
  let score = 50;

  // 1. Sample Size Rule
  if (totalTrades >= 100) {
    score += 15;
    reasons.push(`Statistically robust sample size (${totalTrades} trades ≥ 100).`);
  } else if (totalTrades >= 30) {
    score += 5;
    reasons.push(`Moderate sample size (${totalTrades} trades). Further out-of-sample testing advised.`);
  } else {
    score -= 15;
    reasons.push(`Small sample size (${totalTrades} trades < 30). Treat statistical metrics with caution.`);
  }

  // 2. Profit Factor
  if (profitFactor >= 2.0) {
    score += 20;
    reasons.push(`Exceptional profit factor (${profitFactor.toFixed(2)} ≥ 2.0).`);
  } else if (profitFactor >= 1.4) {
    score += 10;
    reasons.push(`Solid profit factor (${profitFactor.toFixed(2)}).`);
  } else if (profitFactor >= 1.0) {
    score -= 5;
    reasons.push(`Marginal profit factor (${profitFactor.toFixed(2)}). Sensitive to slippage and spread.`);
  } else {
    score -= 30;
    reasons.push(`Unprofitable strategy (Profit Factor ${profitFactor.toFixed(2)} < 1.0).`);
  }

  // 3. Monte Carlo 5th Percentile
  if (p5FinalEquity > initialCapital) {
    score += 15;
    reasons.push(`95% of bootstrap Monte Carlo runs remain profitable (P5 Equity: $${p5FinalEquity.toFixed(0)}).`);
  } else {
    score -= 10;
    reasons.push(`Adverse Monte Carlo runs experience net loss (P5 Equity: $${p5FinalEquity.toFixed(0)}).`);
  }

  // 4. Drawdown vs Net Profit
  if (netProfitPct > maxDrawdownPct * 3) {
    score += 15;
    reasons.push(`Outstanding reward-to-drawdown profile (${netProfitPct.toFixed(1)}% return vs ${maxDrawdownPct.toFixed(1)}% max DD).`);
  } else if (netProfitPct > maxDrawdownPct) {
    score += 5;
    reasons.push(`Net profit exceeds max drawdown (${netProfitPct.toFixed(1)}% vs ${maxDrawdownPct.toFixed(1)}%).`);
  } else {
    score -= 15;
    reasons.push(`Drawdown (${maxDrawdownPct.toFixed(1)}%) is larger than realized net profit (${netProfitPct.toFixed(1)}%).`);
  }

  // 5. Prop Firm Consistency
  if (consistencyPct <= 40.0) {
    score += 10;
    reasons.push(`Passes 40% consistency rule (highest single-day profit is ${consistencyPct.toFixed(1)}% of total).`);
  } else {
    score -= 10;
    reasons.push(`High profit concentration: single day accounts for ${consistencyPct.toFixed(1)}% of total profit (ceiling 40%).`);
  }

  score = Math.max(0, Math.min(100, score));

  let status: 'Robust' | 'Acceptable' | 'Fragile' = 'Acceptable';
  if (score >= 75) status = 'Robust';
  else if (score < 50) status = 'Fragile';

  return {
    status,
    score,
    reasons,
  };
}

