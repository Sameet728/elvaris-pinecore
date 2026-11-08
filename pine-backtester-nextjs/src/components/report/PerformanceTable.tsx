'use client';

import React from 'react';
import { ReportAnalytics } from '@/types/backtest';
import { Info } from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';

export interface PerformanceTableProps {
  analytics?: ReportAnalytics;
  summary?: any;
  className?: string;
}

export const PerformanceTable: React.FC<PerformanceTableProps> = ({
  analytics,
  summary: propSummary,
  className = '',
}) => {
  const summary = propSummary || analytics?.summary;
  if (!summary) return null;
  const { all, long, short } = summary;

  const rows: Array<{
    category?: string;
    label: string;
    tooltip: string;
    allVal: React.ReactNode;
    longVal: React.ReactNode;
    shortVal: React.ReactNode;
    isBold?: boolean;
    allVariant?: 'profit' | 'loss' | 'default';
  }> = [
      // ── Capital & Profitability ──
      {
        category: 'CAPITAL & NET RETURNS',
        label: 'Initial Capital',
        tooltip: 'Starting account equity configured for the strategy simulation.',
        allVal: `$${summary.initialCapital.toLocaleString()}`,
        longVal: '—',
        shortVal: '—',
      },
      {
        label: 'Net Profit',
        tooltip: 'Total realized gain or loss after all execution costs.',
        allVal: `${all.netProfit >= 0 ? '+' : ''}$${all.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${summary.netProfitPct >= 0 ? '+' : ''}${summary.netProfitPct.toFixed(2)}%)`,
        longVal: `${long.netProfit >= 0 ? '+' : ''}$${long.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        shortVal: `${short.netProfit >= 0 ? '+' : ''}$${short.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        isBold: true,
        allVariant: all.netProfit >= 0 ? 'profit' : 'loss',
      },
      {
        label: 'Gross Profit',
        tooltip: 'Total sum of all winning trade returns before costs.',
        allVal: `+$${all.grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        longVal: `+$${long.grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        shortVal: `+$${short.grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        allVariant: 'profit',
      },
      {
        label: 'Gross Loss',
        tooltip: 'Total sum of all losing trade losses before costs.',
        allVal: `-$${all.grossLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        longVal: `-$${long.grossLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        shortVal: `-$${short.grossLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        allVariant: 'loss',
      },
      {
        label: 'Commission Paid',
        tooltip: 'Total broker transaction commission fees paid across all orders.',
        allVal: `$${summary.commissionPaid.toFixed(2)}`,
        longVal: `$${(summary.commissionPaid / 2).toFixed(2)}`,
        shortVal: `$${(summary.commissionPaid / 2).toFixed(2)}`,
      },
      {
        label: 'Slippage Cost',
        tooltip: 'Execution spread and slippage cost deducted from fills.',
        allVal: `$${summary.slippageCost.toFixed(2)}`,
        longVal: `$${(summary.slippageCost / 2).toFixed(2)}`,
        shortVal: `$${(summary.slippageCost / 2).toFixed(2)}`,
      },
      {
        label: 'Profit Factor',
        tooltip: 'Gross profit divided by gross loss. Above 2.0 indicates superior edge.',
        allVal: all.profitFactor >= 99 ? '∞' : all.profitFactor.toFixed(2),
        longVal: long.profitFactor >= 99 ? '∞' : long.profitFactor.toFixed(2),
        shortVal: short.profitFactor >= 99 ? '∞' : short.profitFactor.toFixed(2),
        isBold: true,
        allVariant: all.profitFactor >= 2.0 ? 'profit' : 'default',
      },
      {
        label: 'Expected Payoff (MT5)',
        tooltip: 'Average net dollar return expected per trade executed across historical bars.',
        allVal: `${all.avgTradeCash >= 0 ? '+' : ''}$${all.avgTradeCash.toFixed(2)}`,
        longVal: `${long.avgTradeCash >= 0 ? '+' : ''}$${long.avgTradeCash.toFixed(2)}`,
        shortVal: `${short.avgTradeCash >= 0 ? '+' : ''}$${short.avgTradeCash.toFixed(2)}`,
        allVariant: all.avgTradeCash >= 0 ? 'profit' : 'loss',
        isBold: true,
      },

      // ── Benchmark Comparison ──
      {
        category: 'BENCHMARK & DRAWDOWN METRICS',
        label: 'Buy & Hold Return',
        tooltip: 'Performance of passively holding 1 unit of instrument from bar 0 to last bar.',
        allVal: `${summary.buyAndHoldReturnCash >= 0 ? '+' : ''}$${summary.buyAndHoldReturnCash.toFixed(2)} (${summary.buyAndHoldReturnPct >= 0 ? '+' : ''}${summary.buyAndHoldReturnPct.toFixed(2)}%)`,
        longVal: '—',
        shortVal: '—',
      },
      {
        label: 'Strategy Outperformance',
        tooltip: 'Net strategy return percentage minus Buy & Hold return percentage.',
        allVal: `${summary.strategyOutperformancePct >= 0 ? '+' : ''}${summary.strategyOutperformancePct.toFixed(2)}%`,
        longVal: '—',
        shortVal: '—',
        allVariant: summary.strategyOutperformancePct >= 0 ? 'profit' : 'loss',
      },
      {
        label: 'Max Equity Run-up',
        tooltip: 'Maximum peak equity gain achieved during the historical window.',
        allVal: `+$${summary.maxRunupCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (+${summary.maxRunupPct.toFixed(2)}%)`,
        longVal: '—',
        shortVal: '—',
        allVariant: 'profit',
      },
      {
        label: 'Max Drawdown (Closed)',
        tooltip: 'Deepest peak-to-trough decline evaluated at trade close.',
        allVal: `-$${summary.maxDrawdownCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (-${summary.maxDrawdownPct.toFixed(2)}%)`,
        longVal: '—',
        shortVal: '—',
        allVariant: 'loss',
      },
      {
        label: 'Return / Max Drawdown',
        tooltip: 'Net profit percentage divided by maximum drawdown percentage.',
        allVal: summary.returnOverMaxDD.toFixed(2),
        longVal: '—',
        shortVal: '—',
      },
      {
        label: 'Recovery Factor',
        tooltip: 'Total net profit divided by maximum drawdown cash value.',
        allVal: summary.recoveryFactor.toFixed(2),
        longVal: '—',
        shortVal: '—',
      },
      {
        label: 'Calmar Ratio',
        tooltip: 'Compound Annual Growth Rate (CAGR) divided by maximum drawdown percentage.',
        allVal: summary.calmarRatio.toFixed(2),
        longVal: '—',
        shortVal: '—',
        allVariant: summary.calmarRatio >= 4.0 ? 'profit' : 'default',
      },

      // ── Trades & Streaks Breakdown ──
      {
        category: 'ORDER EXECUTION & STREAKS ANALYSIS',
        label: 'Total Closed Trades',
        tooltip: 'Total number of filled round-trip orders.',
        allVal: all.trades,
        longVal: long.trades,
        shortVal: short.trades,
        isBold: true,
      },
      {
        label: 'Winning Trades',
        tooltip: 'Number of profitable closed orders.',
        allVal: `${all.wins} (${all.winRate.toFixed(1)}%)`,
        longVal: `${long.wins} (${long.winRate.toFixed(1)}%)`,
        shortVal: `${short.wins} (${short.winRate.toFixed(1)}%)`,
        allVariant: 'profit',
      },
      {
        label: 'Losing Trades',
        tooltip: 'Number of unprofitable closed orders.',
        allVal: `${all.losses} (${(100 - all.winRate).toFixed(1)}%)`,
        longVal: `${long.losses} (${(100 - long.winRate).toFixed(1)}%)`,
        shortVal: `${short.losses} (${(100 - short.winRate).toFixed(1)}%)`,
        allVariant: 'loss',
      },
      {
        label: 'Average Trade Net',
        tooltip: 'Average realized profit per executed order in cash and R-multiple.',
        allVal: `${all.avgTradeCash >= 0 ? '+' : ''}$${all.avgTradeCash.toFixed(2)} (${all.avgTradeR >= 0 ? '+' : ''}${all.avgTradeR.toFixed(2)}R)`,
        longVal: `${long.avgTradeCash >= 0 ? '+' : ''}$${long.avgTradeCash.toFixed(2)} (${long.avgTradeR >= 0 ? '+' : ''}${long.avgTradeR.toFixed(2)}R)`,
        shortVal: `${short.avgTradeCash >= 0 ? '+' : ''}$${short.avgTradeCash.toFixed(2)} (${short.avgTradeR >= 0 ? '+' : ''}${short.avgTradeR.toFixed(2)}R)`,
        allVariant: all.avgTradeCash >= 0 ? 'profit' : 'loss',
      },
      {
        label: 'Average Winning Trade',
        tooltip: 'Mean return across all winning orders.',
        allVal: `+$${all.avgWinCash.toFixed(2)}`,
        longVal: `+$${long.avgWinCash.toFixed(2)}`,
        shortVal: `+$${short.avgWinCash.toFixed(2)}`,
        allVariant: 'profit',
      },
      {
        label: 'Average Losing Trade',
        tooltip: 'Mean loss across all losing orders.',
        allVal: `-$${all.avgLossCash.toFixed(2)}`,
        longVal: `-$${long.avgLossCash.toFixed(2)}`,
        shortVal: `-$${short.avgLossCash.toFixed(2)}`,
        allVariant: 'loss',
      },
      {
        label: 'Win / Loss Ratio (Payoff)',
        tooltip: 'Average winning trade divided by average losing trade.',
        allVal: `1 : ${all.payoffRatio.toFixed(2)}`,
        longVal: `1 : ${long.payoffRatio.toFixed(2)}`,
        shortVal: `1 : ${short.payoffRatio.toFixed(2)}`,
        isBold: true,
      },
      {
        label: 'Largest Winning Trade',
        tooltip: 'Maximum single trade dollar profit.',
        allVal: `+$${all.largestWinCash.toFixed(2)}`,
        longVal: `+$${long.largestWinCash.toFixed(2)}`,
        shortVal: `+$${short.largestWinCash.toFixed(2)}`,
        allVariant: 'profit',
      },
      {
        label: 'Largest Losing Trade',
        tooltip: 'Maximum single trade dollar loss.',
        allVal: `-$${Math.abs(all.largestLossCash).toFixed(2)}`,
        longVal: `-$${Math.abs(long.largestLossCash).toFixed(2)}`,
        shortVal: `-$${Math.abs(short.largestLossCash).toFixed(2)}`,
        allVariant: 'loss',
      },
      {
        label: 'Max Consecutive Wins',
        tooltip: 'Longest winning streak achieved in simulation.',
        allVal: `${all.maxConsecutiveWins} in a row`,
        longVal: '—',
        shortVal: '—',
        allVariant: 'profit',
      },
      {
        label: 'Max Consecutive Losses',
        tooltip: 'Longest losing streak achieved in simulation.',
        allVal: `${all.maxConsecutiveLosses} in a row`,
        longVal: '—',
        shortVal: '—',
        allVariant: all.maxConsecutiveLosses <= 2 ? 'profit' : 'loss',
      },
    ];

  return (
    <div className={`w-full overflow-hidden border border-[#E2E5EA] rounded-xl bg-white shadow-2xs ${className}`}>
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="bg-[#F0F2F5] text-[#475266] uppercase tracking-wider text-[11px] font-semibold border-b border-[#E2E5EA] select-none">
            <th className="py-2.5 px-4 font-semibold w-1/2">Performance Metric</th>
            <th className="py-2.5 px-3 text-right font-bold text-[#0E1520]">All Trades</th>
            <th className="py-2.5 px-3 text-right font-semibold">Long Trades</th>
            <th className="py-2.5 px-4 text-right font-semibold">Short Trades</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E2E5EA]">
          {rows.map((row, idx) => {
            if (row.category) {
              return (
                <tr key={`cat-${idx}`} className="bg-[#F9FAFB] border-t border-b border-[#E2E5EA]/80">
                  <td
                    colSpan={4}
                    className="py-1.5 px-4 text-[10px] font-bold text-[#6B7587] tracking-wider uppercase"
                  >
                    {row.category}
                  </td>
                </tr>
              );
            }

            const valColor =
              row.allVariant === 'profit'
                ? 'text-[#0A7A55]'
                : row.allVariant === 'loss'
                  ? 'text-[#C0223A]'
                  : 'text-[#0E1520]';

            return (
              <tr
                key={`row-${idx}`}
                className="hover:bg-[#F0F2F5]/60 transition-colors even:bg-[#FAFAFA]"
              >
                <td className="py-2 px-4 text-[#475266]">
                  <div className="flex items-center gap-1.5">
                    <span className={row.isBold ? 'font-bold text-[#0E1520]' : 'font-medium'}>
                      {row.label}
                    </span>
                    <Tooltip content={row.tooltip}>
                      <button
                        type="button"
                        className="text-[#9FAAB9] hover:text-[#0E1520] cursor-help transition-colors"
                        aria-label={`Definition of ${row.label}`}
                      >
                        <Info size={12} />
                      </button>
                    </Tooltip>
                  </div>
                </td>
                <td className={`py-2 px-3 text-right font-mono tabular-nums ${valColor} ${row.isBold ? 'font-bold' : ''}`}>
                  {row.allVal}
                </td>
                <td className="py-2 px-3 text-right font-mono tabular-nums text-[#475266]">
                  {row.longVal}
                </td>
                <td className="py-2 px-4 text-right font-mono tabular-nums text-[#475266]">
                  {row.shortVal}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};


