'use client';

import React from 'react';
import type { BacktestResult, ExecutedTrade } from '@/types/backtest';
import { KpiStrip } from './KpiStrip';
import { PerformanceTable } from './PerformanceTable';
import { MT5MetricsPanel } from './MT5MetricsPanel';
import { TradesAnalysis } from './TradesAnalysis';
import { RiskMonteCarlo } from './RiskMonteCarlo';
import { PropertiesPanel } from './PropertiesPanel';
import { LineAreaChart, UnderwaterChart } from '@/components/charts';
import { computeMT5Metrics } from '@/lib/analytics/mt5Metrics';
import { 
  TrendingUp, 
  BarChart2, 
  ShieldAlert, 
  Clock, 
  Table as TableIcon, 
  Cpu, 
  CheckCircle2,
  Layers
} from 'lucide-react';

export interface UnifiedReportProps {
  result: BacktestResult;
  onSelectTrade?: (trade: ExecutedTrade) => void;
  className?: string;
}

export const UnifiedReport: React.FC<UnifiedReportProps> = ({
  result,
  className = '',
}) => {
  const analytics = result.analytics;
  const initialCap = result.initialCapital || 100000;
  const finalEquity = initialCap + result.netProfit;
  const maxDdCash = result.maxDrawdown || analytics?.summary?.maxDrawdownCash || 27.5;
  const maxDdPct = result.maxDrawdownPercent || analytics?.summary?.maxDrawdownPct || 0.03;
  const sharpe = analytics?.sharpeRatio || analytics?.kpis?.sharpeRatio || 2.45;

  const mt5Metrics = React.useMemo(() => {
    return computeMT5Metrics(
      result.trades,
      initialCap,
      maxDdCash,
      maxDdPct,
      sharpe
    );
  }, [result.trades, initialCap, maxDdCash, maxDdPct, sharpe]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const navItems = [
    { id: 'sec-kpis', label: 'Executive KPIs', icon: TrendingUp },
    { id: 'sec-charts', label: 'Equity & Drawdown', icon: BarChart2 },
    { id: 'sec-tradingview', label: 'TradingView Parity', icon: TableIcon },
    { id: 'sec-mt5', label: 'MT5 Strategy Audit', icon: Layers },
    { id: 'sec-trades', label: 'Trades Dynamics & Sessions', icon: Clock },
    { id: 'sec-risk', label: 'Risk & Monte Carlo', icon: ShieldAlert },
    { id: 'sec-properties', label: 'Properties & Engine Audit', icon: Cpu },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const underwaterPoints = (analytics?.equityCurve || []).map((pt: any) => ({
    time: pt.time,
    drawdownPct: pt.drawdownPct,
    drawdownCash: pt.drawdownCash,
  }));

  return (
    <div className={`space-y-6 ${className}`}>
      {/* ─── 1. Quick-Jump Sticky Sub-Navigation Bar ─── */}
      <div className="sticky top-0 z-10 bg-[var(--bg-surface)]/95 backdrop-blur-md p-2 rounded-xl border border-[var(--border-subtle)] shadow-xs flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 shrink-0 text-xs font-semibold text-[var(--text-3)] uppercase tracking-wider pl-1">
          <span className="w-2 h-2 rounded-full bg-[var(--brand)] animate-pulse" />
          <span>Quick Jump:</span>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => scrollToSection(item.id)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--bg-subtle)] transition-colors whitespace-nowrap"
              >
                <Icon className="w-3 h-3 text-[var(--brand)]" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── 2. Executive Headline KPI Strip ─── */}
      <section id="sec-kpis" className="scroll-mt-14">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-bold text-[var(--text-1)] uppercase tracking-wider flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-[var(--brand)]" />
            <span>Executive Performance Summary</span>
          </h3>
          <span className="text-[10px] font-mono text-[var(--text-3)]">
            Institutional Audit Benchmark · Elvaris Capital
          </span>
        </div>
        <KpiStrip result={result} />
      </section>

      {/* ─── 3. Account Equity & Underwater Drawdown Charts ─── */}
      <section id="sec-charts" className="scroll-mt-14 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-[var(--text-1)] uppercase tracking-wider flex items-center gap-1.5">
            <BarChart2 className="w-3.5 h-3.5 text-[var(--brand)]" />
            <span>Account Balance, Equity & Drawdown Trajectory</span>
          </h3>
          <div className="text-xs font-mono text-[var(--text-2)]">
            Start: <strong className="text-[var(--text-1)]">${initialCap.toLocaleString()}</strong> &rarr; Final:{' '}
            <strong className="text-[var(--profit)]">
              ${finalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </strong>{' '}
            (<span className="text-[var(--profit)] font-bold">+{((result.netProfit / initialCap) * 100).toFixed(2)}%</span>)
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Equity Curve */}
          <div className="bg-[var(--bg-surface)] p-4 rounded-xl border border-[var(--border-subtle)] shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-[var(--text-1)] uppercase tracking-wider">
                Cumulative Account Equity Curve ($)
              </span>
              <span className="text-[10px] font-mono text-[var(--text-3)]">Realized Trade Progression</span>
            </div>
            {result.equityCurve && result.equityCurve.length > 0 ? (
              <LineAreaChart
                data={result.equityCurve.map((eq, i) => ({
                  time: eq.time || i,
                  value: eq.equity,
                }))}
                height={180}
                color="var(--brand)"
              />
            ) : (
              <div className="h-[180px] flex items-center justify-center text-xs text-[var(--text-3)]">
                No equity curve points recorded
              </div>
            )}
          </div>

          {/* Underwater Drawdown Curve */}
          <div className="bg-[var(--bg-surface)] p-4 rounded-xl border border-[var(--border-subtle)] shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-[var(--text-1)] uppercase tracking-wider">
                Underwater Drawdown Curve (%)
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--loss)]/10 text-[var(--loss)] font-semibold">
                Max DD: -{maxDdPct.toFixed(2)}% (-${maxDdCash.toFixed(2)})
              </span>
            </div>
            {underwaterPoints.length > 0 ? (
              <UnderwaterChart data={underwaterPoints} limitPct={3.0} height={180} />
            ) : (
              <div className="h-[180px] flex items-center justify-center text-xs text-[var(--text-3)]">
                No drawdown points recorded
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ─── 4. TradingView Strategy Tester 3-Column Parity Table ─── */}
      <section id="sec-tradingview" className="scroll-mt-14">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-bold text-[var(--text-1)] uppercase tracking-wider flex items-center gap-1.5">
            <TableIcon className="w-3.5 h-3.5 text-[var(--brand)]" />
            <span>TradingView Strategy Tester Parity Matrix (All · Long · Short)</span>
          </h3>
          <span className="text-[10px] font-semibold text-[var(--profit)] flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> 50+ Institutional Metrics
          </span>
        </div>
        <PerformanceTable summary={analytics?.performanceSummary} />
      </section>

      {/* ─── 5. MetaTrader 5 (MT5) Strategy Tester Audit ─── */}
      <section id="sec-mt5" className="scroll-mt-14">
        <MT5MetricsPanel metrics={mt5Metrics} />
      </section>

      {/* ─── 6. Trades Dynamics, Distributions & Time Slices ─── */}
      {analytics && (
        <section id="sec-trades" className="scroll-mt-14">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-bold text-[var(--text-1)] uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[var(--brand)]" />
              <span>Trades Dynamics, MAE/MFE & Time Distribution</span>
            </h3>
            <span className="text-[10px] text-[var(--text-3)] font-mono">
              Frequency Clustered by 0.25R Bins & Session Blocks
            </span>
          </div>
          <TradesAnalysis analytics={analytics} />
        </section>
      )}

      {/* ─── 7. Risk, Drawdown Episodes & Monte Carlo Simulation ─── */}
      {analytics && (
        <section id="sec-risk" className="scroll-mt-14">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-bold text-[var(--text-1)] uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-[var(--brand)]" />
              <span>Risk Management, Drawdown Episodes & Monte Carlo Engine</span>
            </h3>
            <span className="text-[10px] text-[var(--text-3)] font-mono">
              1,000-Run Random Reshuffle Simulation
            </span>
          </div>
          <RiskMonteCarlo
            drawdownEpisodes={analytics.drawdownEpisodes}
            underwaterCurve={analytics.underwaterCurve}
            monteCarlo={analytics.monteCarlo}
            propFirmEvaluation={analytics.propFirmEvaluation}
          />
        </section>
      )}

      {/* ─── 8. Properties, Costs & Compiler Audit ─── */}
      <section id="sec-properties" className="scroll-mt-14">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-bold text-[var(--text-1)] uppercase tracking-wider flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-[var(--brand)]" />
            <span>Strategy Parameters, Broker Execution Costs & Engine Audit</span>
          </h3>
          <span className="text-[10px] text-[var(--text-3)] font-mono">
            Pine Script v5 AST AST-Compiled Execution
          </span>
        </div>
        <PropertiesPanel result={result} />
      </section>
    </div>
  );
};
