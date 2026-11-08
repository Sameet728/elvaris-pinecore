'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/shell/TopBar';
import { Footer } from '@/components/shell/Footer';
import { Card, Button, Badge } from '@/components/ui';
import { Database, Calendar, BarChart2, CheckCircle2, ArrowRight, Upload, Play, ShieldCheck } from 'lucide-react';
import type { DatasetMetaResponse } from '@/app/api/datasets/route';

export default function DataManagerPage() {
  const router = useRouter();
  const [datasets, setDatasets] = useState<DatasetMetaResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDatasets() {
      try {
        const res = await fetch('/api/datasets');
        if (res.ok) {
          const data = await res.json();
          setDatasets(data.datasets || []);
        }
      } catch (err) {
        console.error('Failed to load datasets:', err);
      } finally {
        setLoading(false);
      }
    }
    loadDatasets();
  }, []);

  const handleSelectDataset = (id: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('elvaris_selected_symbol', id);
    }
    router.push(`/?symbol=${encodeURIComponent(id)}`);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-app)] flex flex-col">
      <TopBar />

      <main className="flex-1 max-w-6xl w-full mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-5 h-5 text-[var(--brand)]" />
              <h1 className="text-xl font-bold text-[var(--text-1)]">Historical Market Datasets</h1>
            </div>
            <p className="text-xs text-[var(--text-3)]">
              Verified high-resolution multi-month datasets exported directly from TradingView charts. Zero lookahead bias.
            </p>
          </div>
          <Link href="/">
            <Button size="sm" variant="outline" className="text-xs gap-1.5">
              <span>Back to Workspace</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>

        {/* Datasets Table / Cards */}
        {loading ? (
          <div className="py-16 text-center text-xs text-[var(--text-3)] font-mono">
            Scanning local public/data/ repository...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {datasets.map((ds) => (
              <Card key={ds.id} className="p-5 flex flex-col justify-between hover:border-[var(--brand)]/50 transition-all bg-[var(--bg-surface)]">
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-[var(--brand)]/10 text-[var(--brand)]">
                          {ds.timeframe}
                        </span>
                        <span className="text-xs font-mono font-bold text-[var(--text-1)]">
                          {ds.symbol}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-[var(--text-1)]">{ds.name}</h3>
                    </div>
                    <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-[var(--profit-subtle)] text-[var(--profit)]">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>TradingView Parity</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 p-3 bg-[var(--bg-subtle)] rounded-lg text-xs font-mono mb-4">
                    <div>
                      <span className="text-[10px] text-[var(--text-3)] block uppercase">Candle Count</span>
                      <strong className="text-[var(--text-1)]">{ds.barCount.toLocaleString()} bars</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-[var(--text-3)] block uppercase">Date Coverage</span>
                      <strong className="text-[var(--text-1)] truncate block">
                        {ds.firstDate} - {ds.lastDate}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between">
                  <div className="text-[11px] text-[var(--text-3)]">
                    File: <code className="text-[var(--text-1)] font-mono">{ds.id}.json</code>
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => handleSelectDataset(ds.id)}
                    className="text-xs h-7 gap-1.5"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Select for Backtest</span>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Upload Custom Dataset Card */}
        <Card className="p-6 border-dashed border-2 border-[var(--border-subtle)] bg-[var(--bg-surface)] text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-[var(--bg-subtle)] text-[var(--brand)] flex items-center justify-center mx-auto">
            <Upload className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-1)]">Custom Dataset Import</h3>
            <p className="text-xs text-[var(--text-3)] max-w-md mx-auto mt-1">
              Have OHLCV historical candles from another broker or TradingView export? Upload CSV or JSON files to simulate in the Elvaris Capital Quant Suite.
            </p>
          </div>
          <Button size="sm" variant="outline" className="text-xs gap-1.5" disabled>
            <span>Upload Dataset (Coming Soon)</span>
          </Button>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
