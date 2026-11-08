'use client';

import React from 'react';
import { MT5Metrics } from '@/lib/analytics/mt5Metrics';
import { Card } from '@/components/ui';
import { Activity, ShieldCheck, TrendingUp, Layers } from 'lucide-react';

interface MT5MetricsPanelProps {
  metrics: MT5Metrics;
  className?: string;
}

export const MT5MetricsPanel: React.FC<MT5MetricsPanelProps> = ({ metrics, className = '' }) => {
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-[var(--brand)]/10 text-[var(--brand)] flex items-center justify-center font-bold text-xs">
            MT5
          </div>
          <div>
            <h4 className="text-xs font-bold text-[var(--text-1)] uppercase tracking-wider">
              MetaTrader 5 (MT5) Strategy Tester Audit
            </h4>
            <p className="text-[11px] text-[var(--text-3)]">
              Institutional execution diagnostics, runs-test randomness, and streak analytics
            </p>
          </div>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-2)]">
          Parity Engine · Verified
        </span>
      </div>

      {/* 4-Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Deposit & Payoff */}
        <Card className="p-3.5 bg-[var(--bg-surface)] border-[var(--border-subtle)] shadow-xs">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wider mb-2">
            <TrendingUp className="w-3.5 h-3.5 text-[var(--brand)]" />
            <span>Payoff & Factor</span>
          </div>
          <div className="space-y-1.5 text-xs font-mono">
            <div className="flex justify-between py-0.5 border-b border-[var(--border-subtle)]/40">
              <span className="text-[var(--text-3)]">Initial Deposit:</span>
              <strong className="text-[var(--text-1)]">${metrics.initialDeposit.toLocaleString()}</strong>
            </div>
            <div className="flex justify-between py-0.5 border-b border-[var(--border-subtle)]/40">
              <span className="text-[var(--text-3)]">Total Net Profit:</span>
              <strong className={metrics.totalNetProfit >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}>
                {metrics.totalNetProfit >= 0 ? '+' : ''}${metrics.totalNetProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
            </div>
            <div className="flex justify-between py-0.5 border-b border-[var(--border-subtle)]/40">
              <span className="text-[var(--text-3)]">Expected Payoff:</span>
              <strong className={metrics.expectedPayoff >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}>
                {metrics.expectedPayoff >= 0 ? '+' : ''}${metrics.expectedPayoff.toFixed(2)}
              </strong>
            </div>
            <div className="flex justify-between py-0.5 border-b border-[var(--border-subtle)]/40">
              <span className="text-[var(--text-3)]">Profit Factor:</span>
              <strong className="text-[var(--text-1)]">{metrics.profitFactor.toFixed(2)}</strong>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-[var(--text-3)]">Recovery Factor:</span>
              <strong className="text-[var(--brand)]">{metrics.recoveryFactor.toFixed(2)}</strong>
            </div>
          </div>
        </Card>

        {/* Card 2: Drawdowns & Risk */}
        <Card className="p-3.5 bg-[var(--bg-surface)] border-[var(--border-subtle)] shadow-xs">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wider mb-2">
            <ShieldCheck className="w-3.5 h-3.5 text-[var(--loss)]" />
            <span>Drawdown Diagnostics</span>
          </div>
          <div className="space-y-1.5 text-xs font-mono">
            <div className="flex justify-between py-0.5 border-b border-[var(--border-subtle)]/40">
              <span className="text-[var(--text-3)]">Absolute Drawdown:</span>
              <strong className="text-[var(--text-1)]">${metrics.balanceDrawdownAbsolute.toFixed(2)}</strong>
            </div>
            <div className="flex justify-between py-0.5 border-b border-[var(--border-subtle)]/40">
              <span className="text-[var(--text-3)]">Maximal Drawdown:</span>
              <strong className="text-[var(--loss)]">
                ${metrics.balanceDrawdownMaximal.toFixed(2)} ({metrics.balanceDrawdownMaximalPct.toFixed(2)}%)
              </strong>
            </div>
            <div className="flex justify-between py-0.5 border-b border-[var(--border-subtle)]/40">
              <span className="text-[var(--text-3)]">Relative Drawdown:</span>
              <strong className="text-[var(--loss)]">
                ${metrics.balanceDrawdownRelative.toFixed(2)} ({metrics.balanceDrawdownRelativePct.toFixed(2)}%)
              </strong>
            </div>
            <div className="flex justify-between py-0.5 border-b border-[var(--border-subtle)]/40">
              <span className="text-[var(--text-3)]">Sharpe Ratio:</span>
              <strong className="text-[var(--text-1)]">{metrics.sharpeRatio.toFixed(2)}</strong>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-[var(--text-3)]">Margin Level:</span>
              <strong className="text-[var(--text-1)]">{metrics.marginLevel}%</strong>
            </div>
          </div>
        </Card>

        {/* Card 3: Directional Trades & Win Rates */}
        <Card className="p-3.5 bg-[var(--bg-surface)] border-[var(--border-subtle)] shadow-xs">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wider mb-2">
            <Layers className="w-3.5 h-3.5 text-[var(--brand)]" />
            <span>Trade Partitioning</span>
          </div>
          <div className="space-y-1.5 text-xs font-mono">
            <div className="flex justify-between py-0.5 border-b border-[var(--border-subtle)]/40">
              <span className="text-[var(--text-3)]">Total Closed Trades:</span>
              <strong className="text-[var(--text-1)]">{metrics.totalTrades}</strong>
            </div>
            <div className="flex justify-between py-0.5 border-b border-[var(--border-subtle)]/40">
              <span className="text-[var(--text-3)]">Short Trades (Won %):</span>
              <strong className="text-[var(--text-1)]">{metrics.shortTrades} ({metrics.shortTradesWonPct.toFixed(1)}%)</strong>
            </div>
            <div className="flex justify-between py-0.5 border-b border-[var(--border-subtle)]/40">
              <span className="text-[var(--text-3)]">Long Trades (Won %):</span>
              <strong className="text-[var(--text-1)]">{metrics.longTrades} ({metrics.longTradesWonPct.toFixed(1)}%)</strong>
            </div>
            <div className="flex justify-between py-0.5 border-b border-[var(--border-subtle)]/40">
              <span className="text-[var(--text-3)]">Profit Trades (% Total):</span>
              <strong className="text-[var(--profit)]">{metrics.profitTrades} ({metrics.profitTradesPct.toFixed(1)}%)</strong>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-[var(--text-3)]">Loss Trades (% Total):</span>
              <strong className="text-[var(--loss)]">{metrics.lossTrades} ({metrics.lossTradesPct.toFixed(1)}%)</strong>
            </div>
          </div>
        </Card>

        {/* Card 4: Streaks & Z-Score Robustness */}
        <Card className="p-3.5 bg-[var(--bg-surface)] border-[var(--border-subtle)] shadow-xs">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wider mb-2">
            <Activity className="w-3.5 h-3.5 text-[var(--brand)]" />
            <span>Streaks & Runs Test</span>
          </div>
          <div className="space-y-1.5 text-xs font-mono">
            <div className="flex justify-between py-0.5 border-b border-[var(--border-subtle)]/40">
              <span className="text-[var(--text-3)]">Max Consecutive Wins:</span>
              <strong className="text-[var(--profit)]">{metrics.maxConsecutiveWinsCount} (+${metrics.maxConsecutiveWinsCash.toFixed(2)})</strong>
            </div>
            <div className="flex justify-between py-0.5 border-b border-[var(--border-subtle)]/40">
              <span className="text-[var(--text-3)]">Max Consecutive Losses:</span>
              <strong className="text-[var(--loss)]">{metrics.maxConsecutiveLossesCount} (-${metrics.maxConsecutiveLossesCash.toFixed(2)})</strong>
            </div>
            <div className="flex justify-between py-0.5 border-b border-[var(--border-subtle)]/40">
              <span className="text-[var(--text-3)]">Avg Consecutive (W / L):</span>
              <strong className="text-[var(--text-1)]">{metrics.avgConsecutiveWins.toFixed(1)} / {metrics.avgConsecutiveLosses.toFixed(1)}</strong>
            </div>
            <div className="flex justify-between py-0.5 border-b border-[var(--border-subtle)]/40">
              <span className="text-[var(--text-3)]">Z-Score (Runs Test):</span>
              <strong className="text-[var(--brand)]">{metrics.zScore.toFixed(2)}</strong>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-[var(--text-3)]">AHPR / GHPR:</span>
              <strong className="text-[var(--text-1)]">{metrics.ahpr.toFixed(4)} / {metrics.ghpr.toFixed(4)}</strong>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

