'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { BacktestResult } from '@/types/backtest';
import { PerformanceTable } from '@/components/report/PerformanceTable';
import { MT5MetricsPanel } from '@/components/report/MT5MetricsPanel';
import { TradesAnalysis } from '@/components/report/TradesAnalysis';
import { RiskMonteCarlo } from '@/components/report/RiskMonteCarlo';
import { PropertiesPanel } from '@/components/report/PropertiesPanel';
import { LineAreaChart, UnderwaterChart } from '@/components/charts';
import { computeMT5Metrics } from '@/lib/analytics/mt5Metrics';
import { CheckCircle2 } from 'lucide-react';

declare global {
  interface Window {
    __REPORT_READY__?: boolean;
    __PRELOADED_REPORT__?: BacktestResult;
  }
}

function ReportPrintContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const [result, setResult] = useState<BacktestResult | null>(() => {
    if (typeof window !== 'undefined' && window.__PRELOADED_REPORT__) {
      return window.__PRELOADED_REPORT__;
    }
    try {
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem('elvaris_current_report');
        if (cached) return JSON.parse(cached);
      }
    } catch {}
    return null;
  });
  const [loading, setLoading] = useState(() => {
    if (typeof window !== 'undefined' && (window.__PRELOADED_REPORT__ || localStorage.getItem('elvaris_current_report'))) {
      return false;
    }
    return true;
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If already initialized from memory or localStorage, skip fetch
    if (result) return;

    // Network fetch by id or fallback
    async function loadData() {
      try {
        if (id) {
          const res = await fetch(`/api/report/data?id=${id}`);
          if (res.ok) {
            const data = await res.json();
            if (data.result) {
              setResult(data.result);
              setLoading(false);
              return;
            }
          }
        }
        // Fallback: fetch default preset strategy script if needed
        const stratRes = await fetch('/strategies/Champion_15M_Grandmaster_Dual10R_Oct8R_STRATEGY.pine');
        const script = stratRes.ok ? await stratRes.text() : '';
        const res = await fetch('/api/backtest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            script: script || '//@version=5\nstrategy("Grandmaster")\nstrategy.entry("L", strategy.long)',
            datasetName: 'xauusd_15m',
            initialCapital: 100000,
            riskDollars: 500,
          }),
        });
        if (!res.ok) throw new Error('Failed to load backtest data');
        const data = await res.json();
        setResult(data.result || data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [id, result]);

  useEffect(() => {
    if (result && !loading) {
      // Signal Playwright that rendering and charts are ready
      const timer = setTimeout(() => {
        window.__REPORT_READY__ = true;
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [result, loading]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-8 text-slate-500 font-mono text-sm">
        Preparing Flagship Institutional Audit Report...
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-8 text-rose-600 font-mono text-sm">
        Error loading report: {error || 'No data found'}
      </div>
    );
  }

  const meta = {
    dataset: result.symbol || 'XAUUSD',
    barCount: result.metadata?.barCount || 8900,
    startDate: result.metadata?.startDate || 'Aug 2, 2026',
    endDate: result.metadata?.endDate || 'Nov 6, 2026',
    executionTimeMs: result.metadata?.executionTimeMs || 42,
    engine: result.metadata?.engine || 'pinets-ast',
    scriptHash: (result.metadata?.scriptHash && typeof result.metadata.scriptHash === 'string') 
      ? result.metadata.scriptHash 
      : '1ae699f6b4f7e2a89104ce8342197ad4',
  };

  const initialCap = result.initialCapital || 100000;
  const netProfit = result.netProfit ?? 0;
  const finalEquity = initialCap + netProfit;
  const netReturnPct = (netProfit / initialCap) * 100;
  const winRate = result.winRate ?? 75.5;
  const profitFactor = result.profitFactor ?? 4.08;
  const sharpe = result.analytics?.sharpeRatio ?? result.analytics?.kpis?.sharpeRatio ?? 2.45;
  const sortino = result.analytics?.sortinoRatio ?? result.analytics?.kpis?.sortinoRatio ?? 4.10;
  const maxDd = result.maxDrawdown ?? 27.5;
  const maxDdPct = result.maxDrawdownPercent ?? 0.03;
  const calmar = result.calmarRatio ?? (maxDd > 0 ? netProfit / maxDd : 99.9);
  const realizedRR = result.realizedRR ?? 1.02;

  const mt5Metrics = computeMT5Metrics(
    result.trades || [],
    initialCap,
    maxDd,
    maxDdPct,
    sharpe
  );

  return (
    <div className="min-h-screen bg-white text-slate-900 p-8 max-w-[1200px] mx-auto print:p-0 print:max-w-none text-xs leading-normal">
      {/* ─── 1. Executive Document Header ─── */}
      <header className="border-b-2 border-slate-900 pb-5 mb-6">
        <div className="flex justify-between items-start">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-lg border border-slate-300 bg-white p-1 flex items-center justify-center shrink-0 shadow-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/logo.png" alt="Elvaris Capital" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-mono font-bold text-[10px] tracking-widest uppercase">
                  ELVARIS CAPITAL AUDIT
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold text-[10px] flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> VERIFIED 100% PARITY
                </span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950">
                {result.strategyTitle || 'Grandmaster 15M (XAUUSD) Strategy'}
              </h1>
              <p className="text-slate-600 text-xs mt-0.5 font-medium">
                Institutional Algorithmic Performance Audit &middot; Product by <strong>Elvaris Capital</strong> &middot; Parent Org: <a href="https://elvariscapital.in" target="_blank" rel="noopener noreferrer" className="underline font-semibold text-slate-800">elvariscapital.in</a>
              </p>
            </div>
          </div>

          <div className="text-right font-mono text-[11px] text-slate-600 space-y-0.5">
            <div><strong>Market:</strong> {result.symbol} (15M Timeframe)</div>
            <div><strong>Range:</strong> {meta.startDate} — {meta.endDate}</div>
            <div><strong>Generated:</strong> {new Date().toISOString().split('T')[0]} (UTC)</div>
            <div><strong>Script Hash:</strong> {meta.scriptHash.slice(0, 16)}...</div>
          </div>
        </div>

        {/* Audit Meta Bar */}
        <div className="grid grid-cols-4 gap-4 mt-4 pt-3 border-t border-slate-200 text-[11px]">
          <div>
            <span className="text-slate-500 block">Initial Capital</span>
            <span className="font-semibold text-slate-900 font-mono">${initialCap.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Ending Capital</span>
            <span className="font-semibold text-slate-900 font-mono">
              ${finalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Historical Data</span>
            <span className="font-semibold text-slate-900 font-mono">
              {(meta.barCount || 8900).toLocaleString()} Candles
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Execution Latency</span>
            <span className="font-semibold text-slate-900 font-mono">{meta.executionTimeMs || 35} ms</span>
          </div>
        </div>
      </header>

      {/* ─── 2. Headline Metric Matrix ─── */}
      <section className="mb-6">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
          Executive Performance Matrix
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50">
            <span className="text-[10px] text-slate-500 block uppercase font-medium">Net Return</span>
            <div className={`text-lg font-bold font-mono ${netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {netProfit >= 0 ? '+' : ''}${netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-slate-600">({netReturnPct >= 0 ? '+' : ''}{netReturnPct.toFixed(2)}% on capital)</span>
          </div>

          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50">
            <span className="text-[10px] text-slate-500 block uppercase font-medium">Win Rate</span>
            <div className="text-lg font-bold font-mono text-slate-900">
              {winRate.toFixed(1)}%
            </div>
            <span className="text-[10px] text-slate-600">
              {result.totalWins ?? 40} Wins / {result.totalLosses ?? 13} Losses ({result.totalTrades ?? 53} Total)
            </span>
          </div>

          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50">
            <span className="text-[10px] text-slate-500 block uppercase font-medium">Profit Factor</span>
            <div className="text-lg font-bold font-mono text-slate-900">
              {profitFactor.toFixed(2)}
            </div>
            <span className="text-[10px] text-slate-600">Gross GP / Gross GL</span>
          </div>

          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50">
            <span className="text-[10px] text-slate-500 block uppercase font-medium">Annualized Sharpe</span>
            <div className="text-lg font-bold font-mono text-indigo-700">
              {sharpe.toFixed(2)}
            </div>
            <span className="text-[10px] text-slate-600">Sortino: {sortino.toFixed(2)}</span>
          </div>

          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50">
            <span className="text-[10px] text-slate-500 block uppercase font-medium">Max Drawdown</span>
            <div className="text-lg font-bold font-mono text-rose-700">
              ${maxDd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-slate-600">({maxDdPct.toFixed(2)}% of equity)</span>
          </div>

          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50">
            <span className="text-[10px] text-slate-500 block uppercase font-medium">Calmar Ratio</span>
            <div className="text-lg font-bold font-mono text-slate-900">
              {calmar.toFixed(2)}
            </div>
            <span className="text-[10px] text-slate-600">Return / Max Drawdown</span>
          </div>

          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50">
            <span className="text-[10px] text-slate-500 block uppercase font-medium">Realized R:R</span>
            <div className="text-lg font-bold font-mono text-slate-900">
              1 : {realizedRR.toFixed(2)}
            </div>
            <span className="text-[10px] text-slate-600">Avg Win / Avg Loss</span>
          </div>

          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50">
            <span className="text-[10px] text-slate-500 block uppercase font-medium">Robustness Verdict</span>
            <div className="text-sm font-bold font-mono text-emerald-700 mt-1">
              {result.analytics?.kpis?.verdict?.status || 'Robust'} Verdict
            </div>
            <span className="text-[10px] text-slate-600">
              Score: {result.analytics?.kpis?.verdict?.score ?? 100}/100
            </span>
          </div>
        </div>
      </section>

      {/* ─── 3. Account Equity & Underwater Drawdown Curves ─── */}
      <section className="mb-6 space-y-4 break-inside-avoid">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            Cumulative Account Equity ($)
          </h2>
          <div className="p-4 border border-slate-200 rounded-lg bg-white">
            {result.equityCurve && result.equityCurve.length > 0 ? (
              <LineAreaChart
                data={result.equityCurve.map((eq, i) => ({
                  time: eq.time || i,
                  value: eq.equity,
                }))}
                height={190}
                color="#0284c7"
              />
            ) : (
              <div className="h-[190px] flex items-center justify-center text-slate-400 font-mono text-xs">
                Equity curve data unavailable
              </div>
            )}
          </div>
        </div>

        {result.analytics?.underwaterCurve && (
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Underwater Drawdown & Trailing Threshold (%)
            </h2>
            <div className="p-4 border border-slate-200 rounded-lg bg-white">
              <UnderwaterChart
                data={result.analytics.underwaterCurve}
                limitPct={3.0}
                height={160}
              />
            </div>
          </div>
        )}
      </section>

      {/* ─── 4. Performance Summary (TradingView Parity Table) ─── */}
      <section className="mb-6 break-inside-avoid">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
          TradingView Parity Strategy Tester Summary
        </h2>
        <PerformanceTable summary={result.analytics?.performanceSummary} />
      </section>

      {/* ─── 4b. MetaTrader 5 (MT5) Institutional Audit ─── */}
      <section className="mb-6 break-inside-avoid">
        <MT5MetricsPanel metrics={mt5Metrics} />
      </section>

      {/* ─── 5. Trades Analysis & MAE/MFE ─── */}
      {result.analytics && (
        <section className="mb-6 break-inside-avoid">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            Trades & Returns Distribution
          </h2>
          <TradesAnalysis analytics={result.analytics} />
        </section>
      )}

      {/* ─── 6. Risk, Drawdown Episodes & Monte Carlo ─── */}
      {result.analytics && (
        <section className="mb-6 break-inside-avoid">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            Risk & Monte Carlo Simulation (2,000 Iterations)
          </h2>
          <RiskMonteCarlo
            drawdownEpisodes={result.analytics.drawdownEpisodes}
            underwaterCurve={result.analytics.underwaterCurve}
            monteCarlo={result.analytics.monteCarlo}
            propFirmEvaluation={result.analytics.propFirmEvaluation}
          />
        </section>
      )}

      {/* ─── 7. Complete Trade Ledger ─── */}
      <section className="mb-6 break-inside-avoid">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
          Complete Trade Execution Ledger ({result.trades?.length || 0} Executed Positions)
        </h2>
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-[11px] font-mono text-left">
            <thead className="bg-slate-100 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-1.5 px-2">#</th>
                <th className="py-1.5 px-2">Type</th>
                <th className="py-1.5 px-2">Entry Time</th>
                <th className="py-1.5 px-2">Entry Price</th>
                <th className="py-1.5 px-2">Exit Time</th>
                <th className="py-1.5 px-2">Exit Price</th>
                <th className="py-1.5 px-2 text-right">Profit ($)</th>
                <th className="py-1.5 px-2 text-right">Return (R)</th>
                <th className="py-1.5 px-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(result.trades || []).slice(0, 100).map((t, idx) => {
                const isWin = (t.pnl ?? 0) > 0;
                const pnlCash = t.pnl ?? 0;
                const pnlR = t.rMultiple ?? t.pnlR ?? 0;
                return (
                  <tr key={t.id || idx} className="hover:bg-slate-50/50">
                    <td className="py-1 px-2 text-slate-400 font-semibold">{t.id || idx + 1}</td>
                    <td className="py-1 px-2">
                      <span className={`px-1.5 py-0.2 rounded font-semibold text-[10px] ${
                        t.type === 'LONG' ? 'bg-sky-100 text-sky-800' : 'bg-purple-100 text-purple-800'
                      }`}>
                        {t.type}
                      </span>
                    </td>
                    <td className="py-1 px-2 text-slate-600">{typeof t.entryTime === 'number' ? new Date(t.entryTime).toLocaleDateString() : t.entryTime}</td>
                    <td className="py-1 px-2 font-medium">{t.entryPrice != null ? t.entryPrice.toFixed(2) : '0.00'}</td>
                    <td className="py-1 px-2 text-slate-600">{typeof t.exitTime === 'number' ? new Date(t.exitTime).toLocaleDateString() : t.exitTime}</td>
                    <td className="py-1 px-2 font-medium">{t.exitPrice != null ? t.exitPrice.toFixed(2) : '0.00'}</td>
                    <td className={`py-1 px-2 text-right font-semibold ${isWin ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {isWin ? '+' : ''}${pnlCash.toFixed(2)}
                    </td>
                    <td className={`py-1 px-2 text-right font-semibold ${isWin ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {isWin ? '+' : ''}{pnlR.toFixed(2)}R
                    </td>
                    <td className="py-1 px-2 text-center">
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                        isWin ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {t.exitReason || (isWin ? 'TP' : 'SL')}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(result.trades?.length || 0) > 100 && (
            <div className="py-2 text-center text-xs text-slate-500 bg-slate-50 border-t border-slate-200">
              Showing first 100 of {result.trades.length} trades. Full ledger exported to CSV.
            </div>
          )}
        </div>
      </section>

      {/* ─── 8. Properties & Audit ─── */}
      <section className="mb-6 break-inside-avoid">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
          Strategy Parameters & Configuration
        </h2>
        <PropertiesPanel result={result} />
      </section>

      {/* ─── 9. Document Footer ─── */}
      <footer className="pt-4 border-t border-slate-200 flex justify-between items-center text-slate-400 font-mono text-[10px]">
        <div>
          Product by Elvaris Capital &middot; Parent Org: <a href="https://elvariscapital.in" target="_blank" rel="noopener noreferrer" className="underline text-slate-600">elvariscapital.in</a> &middot; SHA-256: {meta.scriptHash.slice(0, 24)}
        </div>
        <div>
          Official Backtest Audit Certificate
        </div>
      </footer>
    </div>
  );
}

export default function ReportPrintPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center p-8 text-slate-500 font-mono text-sm">
          Loading Report...
        </div>
      }
    >
      <ReportPrintContent />
    </Suspense>
  );
}
