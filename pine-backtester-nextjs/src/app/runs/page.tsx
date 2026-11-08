'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/shell/TopBar';
import { Footer } from '@/components/shell/Footer';
import { Card, Button, Badge } from '@/components/ui';
import { History, ArrowRight, Eye, Trash2, Calendar, TrendingUp } from 'lucide-react';
import type { BacktestResult } from '@/types/backtest';

interface SavedRun {
  id: string;
  timestamp: number;
  strategyTitle: string;
  symbol: string;
  netProfit: number;
  winRate: number;
  totalTrades: number;
  sharpeRatio: number;
  maxDrawdown: number;
}

export default function RunsHistoryPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<SavedRun[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('elvaris_run_history') || localStorage.getItem('velapine_run_history');
      if (stored) {
        try {
          setRuns(JSON.parse(stored));
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, []);

  const handleClearHistory = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('elvaris_run_history');
      localStorage.removeItem('velapine_run_history');
      setRuns([]);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-app)] flex flex-col">
      <TopBar />

      <main className="flex-1 max-w-6xl w-full mx-auto p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <History className="w-5 h-5 text-[var(--brand)]" />
              <h1 className="text-xl font-bold text-[var(--text-1)]">Simulation Run History</h1>
            </div>
            <p className="text-xs text-[var(--text-3)]">
              Audit log of previous backtest runs with performance snapshots and report links.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {runs.length > 0 && (
              <Button size="sm" variant="ghost" onClick={handleClearHistory} className="text-xs text-[var(--loss)] gap-1">
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear History</span>
              </Button>
            )}
            <Link href="/">
              <Button size="sm" variant="outline" className="text-xs gap-1.5">
                <span>Back to Workspace</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>
        </div>

        {runs.length === 0 ? (
          <div className="py-20 text-center space-y-3 bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)]">
            <History className="w-8 h-8 text-[var(--text-3)] mx-auto opacity-50" />
            <div className="text-sm font-semibold text-[var(--text-1)]">No Run History Yet</div>
            <p className="text-xs text-[var(--text-3)] max-w-sm mx-auto">
              Simulate a strategy in the Workspace to automatically save its snapshot to your history ledger.
            </p>
            <Link href="/" className="inline-block mt-2">
              <Button size="sm" variant="primary" className="text-xs">
                Launch Workspace
              </Button>
            </Link>
          </div>
        ) : (
          <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] overflow-hidden shadow-xs">
            <table className="w-full text-xs font-mono text-left">
              <thead className="bg-[var(--bg-subtle)] border-b border-[var(--border-subtle)] text-[var(--text-3)]">
                <tr>
                  <th className="py-2 px-4">Date / Time</th>
                  <th className="py-2 px-4">Strategy</th>
                  <th className="py-2 px-4">Market</th>
                  <th className="py-2 px-4 text-right">Net Profit ($)</th>
                  <th className="py-2 px-4 text-right">Win Rate</th>
                  <th className="py-2 px-4 text-right">Trades</th>
                  <th className="py-2 px-4 text-right">Sharpe</th>
                  <th className="py-2 px-4 text-right">Max DD</th>
                  <th className="py-2 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {runs.map((r) => {
                  const isProfit = r.netProfit >= 0;
                  return (
                    <tr key={r.id} className="hover:bg-[var(--bg-subtle)]/50 transition-colors">
                      <td className="py-2.5 px-4 text-[var(--text-3)]">
                        {new Date(r.timestamp).toLocaleDateString()} {new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-[var(--text-1)] max-w-[200px] truncate">
                        {r.strategyTitle}
                      </td>
                      <td className="py-2.5 px-4 text-[var(--brand)] font-medium">
                        {r.symbol}
                      </td>
                      <td className={`py-2.5 px-4 text-right font-bold ${isProfit ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
                        {isProfit ? '+' : ''}${r.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4 text-right text-[var(--text-1)]">
                        {r.winRate.toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-4 text-right text-[var(--text-2)]">
                        {r.totalTrades}
                      </td>
                      <td className="py-2.5 px-4 text-right text-[var(--text-1)]">
                        {r.sharpeRatio.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-4 text-right text-[var(--loss)]">
                        ${r.maxDrawdown.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <Link href={`/runs/${r.id}`}>
                          <Button size="sm" variant="ghost" className="text-xs h-6 px-2 gap-1">
                            <Eye className="w-3 h-3" />
                            <span>Report</span>
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
