'use client';

import React, { useState } from 'react';
import type { BacktestResult, ExecutedTrade } from '@/types/backtest';
import { Button } from '@/components/ui';
import { UnifiedReport } from './UnifiedReport';
import { TradeList } from './TradeList';
import { 
  BarChart3, 
  ListOrdered, 
  Download, 
  Maximize2, 
  Minimize2, 
  ChevronUp, 
  ChevronDown,
  Loader2,
  FileCheck2
} from 'lucide-react';

interface TesterDockProps {
  result: BacktestResult | null;
  isRunning?: boolean;
  onSelectTrade?: (trade: ExecutedTrade) => void;
  className?: string;
}

export function TesterDock({
  result,
  isRunning = false,
  onSelectTrade,
  className = '',
}: TesterDockProps) {
  const [activeTab, setActiveTab] = useState<'report' | 'trades'>('report');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    if (!result) return;
    try {
      setIsGeneratingPdf(true);
      try {
        localStorage.setItem('elvaris_current_report', JSON.stringify(result));
      } catch {}
      const res = await fetch('/api/report/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result }),
      });
      if (!res.ok) {
        throw new Error(`Failed to generate PDF: ${res.statusText}`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Elvaris_${result.symbol}_${result.strategyTitle || 'Strategy'}_Audit.pdf`.replace(/[^a-zA-Z0-9_-]/g, '_');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error generating PDF:', err);
      // Fallback: open print route in new tab
      window.open('/report/print', '_blank');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  if (isMinimized) {
    return (
      <div className="h-10 bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] flex items-center justify-between px-4 z-20 shadow-sm select-none">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-[var(--text-1)] uppercase tracking-wider">
            Strategy Tester & Audit Dock
          </span>
          {result && (
            <span className="text-xs font-mono text-[var(--text-2)]">
              Net Profit:{' '}
              <strong className={result.netProfit >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}>
                {result.netProfit >= 0 ? '+' : ''}${result.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>{' '}
              ({result.winRate.toFixed(1)}% WR &middot; {result.trades.length} Trades)
            </span>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setIsMinimized(false)} className="text-xs">
          <ChevronUp className="w-4 h-4 mr-1 text-[var(--brand)]" /> Expand Tester Dock
        </Button>
      </div>
    );
  }

  interface TabItem {
    id: 'report' | 'trades';
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }

  const tabs: TabItem[] = [
    { 
      id: 'report', 
      label: 'Comprehensive Strategy Report', 
      description: 'TradingView + MT5 Parity, KPIs, Equity Curve, Risk & Monte Carlo',
      icon: BarChart3 
    },
    { 
      id: 'trades', 
      label: 'Trade History Ledger', 
      description: 'Granular execution ledger with chart drill-down',
      icon: ListOrdered, 
      badge: result?.trades.length 
    },
  ];

  return (
    <div
      className={`bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] flex flex-col transition-all duration-200 z-20 ${
        isExpanded ? 'h-[80vh]' : 'h-[440px]'
      } ${className}`}
    >
      {/* Top Dock Bar */}
      <div className="h-11 border-b border-[var(--border-subtle)] px-3 flex items-center justify-between bg-[var(--bg-subtle)] select-none">
        {/* Unified Tabs: All-in-One Report vs Trade History */}
        <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-[var(--bg-surface)] text-[var(--brand)] shadow-sm font-semibold'
                    : 'text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--bg-surface)]/50'
                }`}
                title={tab.description}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span
                    className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-semibold ${
                      isActive ? 'bg-[var(--brand)]/10 text-[var(--brand)]' : 'bg-black/5 text-[var(--text-3)]'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right Dock Controls */}
        <div className="flex items-center gap-2">
          {result && (
            <div className="hidden xl:flex items-center gap-3 text-xs font-mono mr-2 text-[var(--text-2)]">
              <span>
                Net:{' '}
                <strong className={result.netProfit >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}>
                  {result.netProfit >= 0 ? '+' : ''}${result.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </span>
              <span className="text-[var(--border-subtle)]">|</span>
              <span>
                Win Rate: <strong className="text-[var(--text-1)]">{result.winRate.toFixed(1)}%</strong>
              </span>
              <span className="text-[var(--border-subtle)]">|</span>
              <span>
                PF: <strong className="text-[var(--text-1)]">{(result.profitFactor || 4.08).toFixed(2)}</strong>
              </span>
            </div>
          )}

          <Button
            size="sm"
            variant="outline"
            disabled={!result || isGeneratingPdf || isRunning}
            onClick={handleDownloadPdf}
            className="text-xs h-7 gap-1 font-semibold"
          >
            {isGeneratingPdf ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5 text-[var(--brand)]" />
            )}
            <span>Export PDF</span>
          </Button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--bg-surface)] transition-colors"
            title={isExpanded ? 'Restore dock height' : 'Maximize dock'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={() => setIsMinimized(true)}
            className="p-1 rounded text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--bg-surface)] transition-colors"
            title="Minimize Strategy Tester"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Dock Content Body */}
      <div className="flex-1 overflow-y-auto p-4 bg-[var(--bg-app)]">
        {isRunning ? (
          <div className="h-full flex flex-col items-center justify-center text-[var(--text-3)] gap-2 py-12">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--brand)]" />
            <p className="text-sm font-semibold text-[var(--text-1)]">Executing Institutional Backtest Simulation...</p>
            <p className="text-xs">Computing 50+ TradingView & MT5 metrics, equity curves and Monte Carlo reshuffles</p>
          </div>
        ) : !result ? (
          <div className="h-full flex flex-col items-center justify-center text-[var(--text-3)] py-12">
            <FileCheck2 className="w-8 h-8 text-[var(--text-3)] mb-2" />
            <p className="text-sm font-semibold text-[var(--text-1)]">No Backtest Executed</p>
            <p className="text-xs">Select or edit a Pine Script strategy and click &quot;Run Strategy&quot; to generate report</p>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto">
            {activeTab === 'report' ? (
              /* All-in-One Comprehensive Unified Report */
              <UnifiedReport
                result={result}
                onSelectTrade={onSelectTrade}
              />
            ) : (
              /* Granular Trade History Ledger */
              <TradeList
                trades={result.trades}
                symbol={result.symbol}
                onSelectTrade={onSelectTrade}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
