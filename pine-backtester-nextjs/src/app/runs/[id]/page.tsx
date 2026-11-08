'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { TopBar } from '@/components/shell/TopBar';
import { KpiStrip } from '@/components/report/KpiStrip';
import { PerformanceTable } from '@/components/report/PerformanceTable';
import { TradesAnalysis } from '@/components/report/TradesAnalysis';
import { RiskMonteCarlo } from '@/components/report/RiskMonteCarlo';
import { TradeList } from '@/components/report/TradeList';
import { PropertiesPanel } from '@/components/report/PropertiesPanel';
import { LineAreaChart, UnderwaterChart } from '@/components/charts';
import { Card, Button } from '@/components/ui';
import { ArrowLeft, Download, ShieldCheck, FileText, Loader2 } from 'lucide-react';
import type { BacktestResult } from '@/types/backtest';

function RunReportDetailContent() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    async function fetchRun() {
      if (!id) return;
      try {
        // First check in-memory / server store
        const res = await fetch(`/api/report/data?id=${id}`);
        if (res.ok) {
          const data = await res.json();
          setResult(data.result);
          setLoading(false);
          return;
        }

        // Check localStorage
        if (typeof window !== 'undefined') {
          const localStr = localStorage.getItem(`elvaris_run_${id}`) || localStorage.getItem(`velapine_run_${id}`);
          if (localStr) {
            setResult(JSON.parse(localStr));
            setLoading(false);
            return;
          }
        }

        // Fallback: run default backtest
        const fallbackRes = await fetch('/api/backtest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: 'XAUUSD',
            presetKey: 'Champion_15M_Grandmaster_Dual10R_Oct8R_STRATEGY.pine',
          }),
        });
        if (fallbackRes.ok) {
          const data = await fallbackRes.json();
          setResult(data);
        }
      } catch (err) {
        console.error('Failed to load run:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchRun();
  }, [id]);

  const handleExportPdf = async () => {
    if (!result) return;
    try {
      setExporting(true);
      const res = await fetch('/api/report/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${result.symbol}_${result.strategyTitle || 'Report'}.pdf`.replace(/[^a-zA-Z0-9_-]/g, '_');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error(err);
      window.open(`/report/print?id=${id}`, '_blank');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-app)] flex flex-col">
      <TopBar />

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <Link href="/runs">
              <Button size="sm" variant="ghost" className="p-2">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[var(--brand)]/10 text-[var(--brand)] uppercase">
                  Run Report Audit
                </span>
                <span className="text-xs font-mono text-[var(--text-3)]">ID: {id}</span>
              </div>
              <h1 className="text-xl font-bold text-[var(--text-1)]">
                {result?.strategyTitle || 'Grandmaster 15M (XAUUSD) Strategy'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportPdf}
              disabled={exporting || !result}
              className="text-xs gap-1.5"
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5 text-[var(--brand)]" />}
              <span>Download PDF</span>
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="py-24 text-center font-mono text-xs text-[var(--text-3)]">
            Loading Backtest Audit Report...
          </div>
        ) : !result ? (
          <div className="py-24 text-center text-xs text-[var(--loss)]">
            Run not found.
          </div>
        ) : (
          <div className="space-y-6">
            {/* KPI Strip */}
            <KpiStrip result={result} />

            {/* Equity Curve & Underwater Curve */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="p-4 bg-[var(--bg-surface)]">
                <h3 className="text-xs font-semibold text-[var(--text-1)] uppercase tracking-wider mb-2">
                  Account Equity Growth ($)
                </h3>
                <LineAreaChart
                  data={result.equityCurve.map((eq, i) => ({
                    time: eq.time || i,
                    value: eq.equity,
                  }))}
                  height={190}
                  color="var(--brand)"
                />
              </Card>

              {result.analytics?.underwaterCurve && (
                <Card className="p-4 bg-[var(--bg-surface)]">
                  <h3 className="text-xs font-semibold text-[var(--text-1)] uppercase tracking-wider mb-2">
                    Mark-to-Market Drawdown (%)
                  </h3>
                  <UnderwaterChart data={result.analytics.underwaterCurve} height={190} />
                </Card>
              )}
            </div>

            {/* Performance Summary Table */}
            <PerformanceTable summary={result.analytics?.performanceSummary} />

            {/* Trades & Distribution Analysis */}
            {result.analytics && <TradesAnalysis analytics={result.analytics} />}

            {/* Risk, Drawdowns & Monte Carlo */}
            {result.analytics && (
              <RiskMonteCarlo
                drawdownEpisodes={result.analytics.drawdownEpisodes}
                underwaterCurve={result.analytics.underwaterCurve}
                monteCarlo={result.analytics.monteCarlo}
                propFirmEvaluation={result.analytics.propFirmEvaluation}
              />
            )}

            {/* Trades Ledger */}
            <TradeList trades={result.trades} symbol={result.symbol} />

            {/* Properties */}
            <PropertiesPanel result={result} />
          </div>
        )}
      </main>
    </div>
  );
}

export default function RunReportDetailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F5F6F8] flex items-center justify-center font-mono text-xs">Loading Run Report...</div>}>
      <RunReportDetailContent />
    </Suspense>
  );
}
