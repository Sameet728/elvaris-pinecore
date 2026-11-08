'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/shell/TopBar';
import { Footer } from '@/components/shell/Footer';
import { Button } from '@/components/ui';
import type { OptimizationResultItem } from '@/app/api/optimize/route';
import {
  Sliders,
  Play,
  ArrowRight,
  Trophy,
  Download,
  Search,
  ArrowUpDown,
  Loader2,
} from 'lucide-react';

const DATASETS = [
  { id: 'xauusd_15m', label: 'XAUUSD (Gold 15M)', bars: '8,900 candles' },
  { id: 'eurusd_15m', label: 'EURUSD (Euro 15M)', bars: '6,577 candles' },
  { id: 'nas100_15m', label: 'NAS100 (Nasdaq 15M)', bars: '4,200 candles' },
  { id: 'btcusdt_15m', label: 'BTCUSDT (Bitcoin 15M)', bars: '10,000 candles' },
];

const OBJECTIVES = [
  { id: 'sharpe', label: 'Sharpe Ratio', desc: 'Highest risk-adjusted efficiency' },
  { id: 'netProfit', label: 'Net Profit ($)', desc: 'Maximum absolute cash gain' },
  { id: 'profitFactor', label: 'Profit Factor', desc: 'Highest gross win/loss multiplier' },
  { id: 'winRate', label: 'Win Rate (%)', desc: 'Maximum trade hit rate' },
  { id: 'minDrawdown', label: 'Lowest Drawdown', desc: 'Safest capital preservation' },
] as const;

export default function OptimizePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Configuration state
  const [dataset, setDataset] = useState('xauusd_15m');
  const [objective, setObjective] = useState<'sharpe' | 'netProfit' | 'profitFactor' | 'winRate' | 'minDrawdown'>('sharpe');
  const [tpPreset, setTpPreset] = useState<'standard' | 'tight' | 'wide' | 'custom'>('standard');
  const [slPreset, setSlPreset] = useState<'standard' | 'tight' | 'wide' | 'custom'>('standard');
  const [customTpString, setCustomTpString] = useState('12, 14, 16, 18');
  const [customSlString, setCustomSlString] = useState('12, 13.75, 15');
  const [rsiRange, setRsiRange] = useState<number[]>([50, 52]);
  const [mcIterations, setMcIterations] = useState<number>(1000);
  const [initialCapital, setInitialCapital] = useState<number>(100000);
  const [riskDollars, setRiskDollars] = useState<number>(500);

  // Execution state
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [top5Results, setTop5Results] = useState<OptimizationResultItem[]>([]);
  const [allResults, setAllResults] = useState<OptimizationResultItem[]>([]);
  const [executionStats, setExecutionStats] = useState<{ totalEvaluated: number; timeMs: number } | null>(null);

  // Table filtering and sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<keyof OptimizationResultItem>('rank');
  const [sortAsc, setSortAsc] = useState(true);

  // Derived TP list
  const tpList = useMemo(() => {
    if (tpPreset === 'standard') return [12.0, 14.0, 16.0, 18.0];
    if (tpPreset === 'tight') return [10.0, 12.0, 14.0];
    if (tpPreset === 'wide') return [14.0, 16.0, 18.0, 20.0, 22.0];
    return customTpString
      .split(',')
      .map((s) => parseFloat(s.trim()))
      .filter((n) => !isNaN(n) && n > 0);
  }, [tpPreset, customTpString]);

  // Derived SL list
  const slList = useMemo(() => {
    if (slPreset === 'standard') return [12.0, 13.75, 15.0];
    if (slPreset === 'tight') return [10.0, 12.0, 13.75];
    if (slPreset === 'wide') return [13.75, 15.0, 17.5];
    return customSlString
      .split(',')
      .map((s) => parseFloat(s.trim()))
      .filter((n) => !isNaN(n) && n > 0);
  }, [slPreset, customSlString]);

  const totalCombinations = tpList.length * slList.length * rsiRange.length;
  const totalMonteCarloSimulations = totalCombinations * mcIterations;

  const handleLaunchOptimizer = async () => {
    try {
      setIsRunning(true);
      setProgress(10);
      setStatusMessage('Loading historical candles and formulating parameter matrix...');
      setTop5Results([]);
      setAllResults([]);
      setExecutionStats(null);

      const progressTimer = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) return prev;
          return prev + 15;
        });
      }, 300);

      setStatusMessage(`Simulating ${totalCombinations} parameter vectors & ${totalMonteCarloSimulations.toLocaleString()} Monte Carlo paths...`);

      const res = await fetch('/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetName: dataset,
          tpList,
          slList,
          rsiList: rsiRange,
          initialCapital,
          riskDollars,
          mcIterations,
          objective,
        }),
      });

      clearInterval(progressTimer);
      setProgress(100);

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to complete optimization sweep');
      }

      const data = await res.json();
      setTop5Results(data.top5 || []);
      setAllResults(data.all || []);
      setExecutionStats({
        totalEvaluated: data.totalEvaluated,
        timeMs: data.executionTimeMs,
      });
      setStatusMessage(`Optimization completed: ${data.totalEvaluated} setups evaluated in ${data.executionTimeMs} ms.`);
    } catch (err: any) {
      console.error('Optimization error:', err);
      setStatusMessage(`Error during sweep: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleApplySetup = (item: OptimizationResultItem) => {
    try {
      localStorage.setItem(
        'elvaris_applied_opt',
        JSON.stringify({
          tp: item.tp,
          sl: item.sl,
          rsi: item.rsi,
          dataset,
        })
      );
    } catch {}
    router.push(`/?symbol=${dataset}&tp=${item.tp}&sl=${item.sl}&applied=true`);
  };

  // Filtered & sorted table data
  const filteredResults = useMemo(() => {
    return allResults
      .filter((item) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
          String(item.rank).includes(q) ||
          String(item.tp).includes(q) ||
          String(item.sl).includes(q) ||
          String(item.netProfit).includes(q) ||
          String(item.winRate).includes(q)
        );
      })
      .sort((a, b) => {
        let valA: any = a[sortField];
        let valB: any = b[sortField];
        if (sortField === 'maxDrawdown') {
          valA = a.maxDrawdown;
          valB = b.maxDrawdown;
        }
        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
      });
  }, [allResults, searchQuery, sortField, sortAsc]);

  const handleSort = (field: keyof OptimizationResultItem) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === 'rank' || field === 'maxDrawdown');
    }
  };

  const handleExportCsv = () => {
    if (allResults.length === 0) return;
    const headers = [
      'Rank',
      'TP ($)',
      'SL ($)',
      'R:R Ratio',
      'RSI Filter',
      'Net Profit ($)',
      'Return (%)',
      'Win Rate (%)',
      'Total Trades',
      'Wins',
      'Losses',
      'Profit Factor',
      'Sharpe Ratio',
      'Sortino Ratio',
      'Calmar Ratio',
      'Max Drawdown ($)',
      'Max Drawdown (%)',
      'MC Median Equity ($)',
      'MC 95% Adverse DD ($)',
      'MC Win Prob (%)',
      'MC Max Loss Streak',
    ];

    const rows = allResults.map((r) => [
      r.rank,
      r.tp.toFixed(2),
      r.sl.toFixed(2),
      r.rrRatio.toFixed(2),
      r.rsi,
      r.netProfit.toFixed(2),
      r.returnPct.toFixed(2),
      r.winRate.toFixed(1),
      r.totalTrades,
      r.wins,
      r.losses,
      r.profitFactor.toFixed(2),
      r.sharpe.toFixed(2),
      r.sortino.toFixed(2),
      r.calmar.toFixed(2),
      r.maxDrawdown.toFixed(2),
      r.maxDrawdownPct.toFixed(2),
      r.monteCarlo.medianEquity,
      r.monteCarlo.p95MaxDDCash,
      r.monteCarlo.probProfit.toFixed(1),
      r.monteCarlo.maxLossStreak.toFixed(1),
    ]);

    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Elvaris_MonteCarlo_Optimization_${dataset}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[var(--bg-app)] flex flex-col">
        <TopBar />
        <main className="flex-1 max-w-7xl w-full mx-auto p-8 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-[var(--brand)] border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-mono text-[var(--text-3)]">Loading Optimizer Engine...</span>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-app)] flex flex-col selection:bg-[var(--brand-soft)]">
      <TopBar />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* ─── Hero Header ─── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 rounded-lg bg-[var(--brand)]/10 text-[var(--brand)]">
                <Sliders className="w-5 h-5" />
              </span>
              <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-1)] tracking-tight">
                Monte Carlo Multi-Variable Optimizer
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                PRO QUANT ENGINE
              </span>
            </div>
            <p className="text-xs text-[var(--text-3)] max-w-3xl">
              Simultaneous parameter sweep across Take-Profit, Stop-Loss, and RSI thresholds combined with 1,000+ path Monte Carlo bootstrap simulations to discover the highest-expectancy, lowest-drawdown frontiers.
            </p>
          </div>

          <Link href="/">
            <Button size="sm" variant="outline" className="text-xs gap-1.5 bg-white">
              <span>Back to Workspace</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>

        {/* ─── Configuration Grid Panel ─── */}
        <div className="bg-white rounded-2xl border border-[var(--border-subtle)] p-5 shadow-xs space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Market Selection */}
            <div>
              <label className="text-xs font-bold text-[var(--text-1)] mb-1.5 flex items-center gap-1.5">
                <span>Target Asset / Dataset</span>
              </label>
              <select
                value={dataset}
                onChange={(e) => setDataset(e.target.value)}
                disabled={isRunning}
                className="w-full text-xs font-medium px-3 py-2 rounded-lg border border-[var(--border-strong)] bg-white text-[var(--text-1)] focus:outline-hidden focus:ring-2 focus:ring-[var(--brand)]"
              >
                {DATASETS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label} ({d.bars})
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-[var(--text-3)] mt-1 block">Full verified candle dataset</span>
            </div>

            {/* 2. Objective Function */}
            <div>
              <label className="text-xs font-bold text-[var(--text-1)] mb-1.5 flex items-center gap-1.5">
                <span>Optimization Target</span>
              </label>
              <select
                value={objective}
                onChange={(e) => setObjective(e.target.value as any)}
                disabled={isRunning}
                className="w-full text-xs font-medium px-3 py-2 rounded-lg border border-[var(--border-strong)] bg-white text-[var(--text-1)] focus:outline-hidden focus:ring-2 focus:ring-[var(--brand)]"
              >
                {OBJECTIVES.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label} — {o.desc}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-[var(--text-3)] mt-1 block">Sorts candidates by chosen metric</span>
            </div>

            {/* 3. Monte Carlo Iterations */}
            <div>
              <label className="text-xs font-bold text-[var(--text-1)] mb-1.5 flex items-center gap-1.5">
                <span>Monte Carlo Paths</span>
              </label>
              <select
                value={mcIterations}
                onChange={(e) => setMcIterations(Number(e.target.value))}
                disabled={isRunning}
                className="w-full text-xs font-medium px-3 py-2 rounded-lg border border-[var(--border-strong)] bg-white text-[var(--text-1)] focus:outline-hidden focus:ring-2 focus:ring-[var(--brand)]"
              >
                <option value={500}>500 Resamples (Fast Sweep)</option>
                <option value={1000}>1,000 Resamples (Recommended)</option>
                <option value={2000}>2,000 Resamples (Deep Audit)</option>
              </select>
              <span className="text-[10px] text-[var(--text-3)] mt-1 block">Mulberry32 seeded PRNG bootstrap</span>
            </div>

            {/* 4. Risk / Position Capital */}
            <div>
              <label className="text-xs font-bold text-[var(--text-1)] mb-1.5 flex items-center gap-1.5">
                <span>Risk Per Trade ($)</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={riskDollars}
                  onChange={(e) => setRiskDollars(Math.max(100, Number(e.target.value)))}
                  disabled={isRunning}
                  className="w-full text-xs font-mono font-medium px-3 py-2 rounded-lg border border-[var(--border-strong)] bg-white text-[var(--text-1)] focus:outline-hidden focus:ring-2 focus:ring-[var(--brand)]"
                  placeholder="500"
                />
              </div>
              <span className="text-[10px] text-[var(--text-3)] mt-1 block">Capital: ${initialCapital.toLocaleString()}</span>
            </div>
          </div>

          {/* Parameter Sweep Ranges */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-[var(--border-subtle)]">
            {/* Take Profit Range */}
            <div className="p-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--text-1)] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#089981]" />
                  Take Profit (TP) Grid Values ($)
                </span>
                <span className="text-[11px] font-mono text-[var(--text-2)]">
                  {tpList.length} values: [{tpList.map((n) => `$${n}`).join(', ')}]
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {(['standard', 'tight', 'wide', 'custom'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setTpPreset(p)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-all ${
                      tpPreset === p
                        ? 'bg-[var(--brand)] text-white shadow-2xs'
                        : 'bg-white text-[var(--text-2)] hover:bg-slate-100 border border-[var(--border-subtle)]'
                    }`}
                  >
                    {p === 'standard' && 'Standard [12, 14, 16, 18]'}
                    {p === 'tight' && 'Tight [10, 12, 14]'}
                    {p === 'wide' && 'Wide [14, 16, 18, 20, 22]'}
                    {p === 'custom' && 'Custom Manual...'}
                  </button>
                ))}
              </div>

              {tpPreset === 'custom' && (
                <input
                  type="text"
                  value={customTpString}
                  onChange={(e) => setCustomTpString(e.target.value)}
                  className="w-full text-xs font-mono px-3 py-1.5 rounded-md border border-[var(--border-strong)] bg-white"
                  placeholder="e.g. 11, 13, 15, 17, 19"
                />
              )}
            </div>

            {/* Stop Loss Range */}
            <div className="p-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--text-1)] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#F23645]" />
                  Stop Loss (SL) Grid Values ($)
                </span>
                <span className="text-[11px] font-mono text-[var(--text-2)]">
                  {slList.length} values: [{slList.map((n) => `$${n}`).join(', ')}]
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {(['standard', 'tight', 'wide', 'custom'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setSlPreset(p)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-all ${
                      slPreset === p
                        ? 'bg-[var(--brand)] text-white shadow-2xs'
                        : 'bg-white text-[var(--text-2)] hover:bg-slate-100 border border-[var(--border-subtle)]'
                    }`}
                  >
                    {p === 'standard' && 'Standard [12, 13.75, 15]'}
                    {p === 'tight' && 'Tight [10, 12, 13.75]'}
                    {p === 'wide' && 'Wide [13.75, 15, 17.5]'}
                    {p === 'custom' && 'Custom Manual...'}
                  </button>
                ))}
              </div>

              {slPreset === 'custom' && (
                <input
                  type="text"
                  value={customSlString}
                  onChange={(e) => setCustomSlString(e.target.value)}
                  className="w-full text-xs font-mono px-3 py-1.5 rounded-md border border-[var(--border-strong)] bg-white"
                  placeholder="e.g. 11, 12.5, 14, 15.5"
                />
              )}
            </div>
          </div>

          {/* Action Launch Strip */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 border-t border-[var(--border-subtle)]">
            <div className="flex items-center gap-3 text-xs text-[var(--text-2)] font-mono">
              <span className="px-2.5 py-1 rounded-md bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                Vectors: <strong>{totalCombinations}</strong>
              </span>
              <span>&times;</span>
              <span className="px-2.5 py-1 rounded-md bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                MC Paths: <strong>{mcIterations.toLocaleString()}</strong>
              </span>
              <span>=</span>
              <span className="text-[var(--brand)] font-bold">
                {totalMonteCarloSimulations.toLocaleString()} Total Simulations
              </span>
            </div>

            <Button
              size="md"
              variant="primary"
              onClick={handleLaunchOptimizer}
              disabled={isRunning || totalCombinations === 0}
              className="text-xs px-5 py-2.5 shadow-sm font-bold gap-2"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Evaluating Parameter Matrix ({progress}%)...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Launch Monte Carlo Optimizer</span>
                </>
              )}
            </Button>
          </div>

          {/* Progress / Status feedback */}
          {isRunning && (
            <div className="space-y-1.5 pt-2">
              <div className="h-2 w-full bg-[var(--bg-subtle)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--brand)] transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] font-mono text-[var(--text-3)]">
                <span>{statusMessage}</span>
                <span>{progress}%</span>
              </div>
            </div>
          )}
        </div>

        {/* ─── TOP 5 BEST RESULTS SPOTLIGHT ─── */}
        {top5Results.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                <h2 className="text-lg font-bold text-[var(--text-1)] tracking-tight">
                  Top 5 Best Performing Setups (Monte Carlo Verified)
                </h2>
              </div>
              <span className="text-xs font-mono text-[var(--text-3)]">
                Sorted by <strong>{OBJECTIVES.find((o) => o.id === objective)?.label}</strong>
              </span>
            </div>

            {/* Top 5 Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
              {top5Results.map((item, idx) => {
                const isChampion = idx === 0;
                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 border ${
                      isChampion
                        ? 'bg-gradient-to-b from-amber-50/70 via-white to-white border-amber-300 shadow-sm ring-2 ring-amber-400/20'
                        : 'bg-white border-[var(--border-subtle)] hover:border-[var(--brand)]/40 shadow-2xs'
                    }`}
                  >
                    <div>
                      {/* Trophy Rank Badge */}
                      <div className="flex items-center justify-between mb-2.5">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                            isChampion
                              ? 'bg-amber-100 text-amber-900 border border-amber-300 font-extrabold'
                              : idx === 1
                              ? 'bg-slate-100 text-slate-800 border border-slate-300'
                              : idx === 2
                              ? 'bg-orange-100 text-orange-800 border border-orange-300'
                              : 'bg-slate-50 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {isChampion ? '🏆 #1 CHAMPION' : idx === 1 ? '🥈 #2 RUNNER-UP' : idx === 2 ? '🥉 #3 BRONZE' : `#${item.rank}`}
                        </span>

                        <span className="text-[10px] font-mono text-[var(--text-3)]">
                          1 : {item.rrRatio.toFixed(2)} R:R
                        </span>
                      </div>

                      {/* Parameter Vector */}
                      <div className="p-2 rounded-lg bg-[var(--bg-subtle)] mb-3 font-mono text-xs">
                        <div className="flex justify-between items-center text-[var(--text-1)] font-semibold">
                          <span>TP: ${item.tp.toFixed(2)}</span>
                          <span>SL: ${item.sl.toFixed(2)}</span>
                        </div>
                        <div className="text-[10px] text-[var(--text-3)] mt-0.5 flex justify-between">
                          <span>RSI Filter: {item.rsi}</span>
                          <span>{item.totalTrades} Trades</span>
                        </div>
                      </div>

                      {/* Headline Return & Win Rate */}
                      <div className="space-y-1 mb-3">
                        <div className="flex justify-between items-baseline">
                          <span className="text-[10px] text-[var(--text-3)] uppercase font-semibold">Net Profit</span>
                          <span className="text-base font-bold font-mono text-[var(--profit)]">
                            +${item.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between text-[11px] font-mono">
                          <span className="text-[var(--text-3)]">Win Rate:</span>
                          <span className="font-semibold text-[var(--text-1)]">
                            {item.winRate.toFixed(1)}% ({item.wins}W / {item.losses}L)
                          </span>
                        </div>
                      </div>

                      {/* Quant Metrics Grid */}
                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono p-2 rounded-lg bg-slate-50 border border-slate-100 mb-3">
                        <div>
                          <span className="text-slate-400 block">Sharpe</span>
                          <strong className="text-indigo-700 font-bold">{item.sharpe.toFixed(2)}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block">PF</span>
                          <strong className="text-slate-800 font-bold">{item.profitFactor.toFixed(2)}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Max DD</span>
                          <strong className="text-rose-600 font-bold">-${item.maxDrawdown.toFixed(2)}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block">MC Win Prob</span>
                          <strong className="text-emerald-700 font-bold">{item.monteCarlo.probProfit.toFixed(1)}%</strong>
                        </div>
                      </div>

                      {/* Monte Carlo 95% Adverse Confidence */}
                      <div className="text-[10px] font-mono text-[var(--text-3)] space-y-0.5 mb-3 border-t border-slate-100 pt-2">
                        <div className="flex justify-between">
                          <span>MC 95% Adverse DD:</span>
                          <span className="text-slate-800 font-semibold">-${item.monteCarlo.p95MaxDDCash}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Max Loss Streak:</span>
                          <span className="text-slate-800 font-semibold">{item.monteCarlo.maxLossStreak} trades</span>
                        </div>
                      </div>
                    </div>

                    {/* Apply Button */}
                    <Button
                      size="sm"
                      variant={isChampion ? 'primary' : 'outline'}
                      onClick={() => handleApplySetup(item)}
                      className="w-full text-xs font-semibold gap-1.5 mt-1 cursor-pointer"
                    >
                      <span>Apply Setup</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ─── Optimization Frontier Visualizer ─── */}
        {allResults.length > 0 && (
          <div className="bg-white rounded-2xl border border-[var(--border-subtle)] p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-1)]">
                  Optimization Frontier Matrix (Net Return vs. Max Drawdown)
                </h3>
                <p className="text-xs text-[var(--text-3)]">
                  Every evaluated vector plotted on the risk/reward coordinate plane. High-expectancy setups cluster toward the top-left quadrant.
                </p>
              </div>
              <span className="text-xs font-mono text-[var(--text-3)]">
                {allResults.length} Parameter Candidates Plotted
              </span>
            </div>

            {/* SVG Scatter Frontier Chart */}
            <div className="w-full h-48 border border-[var(--border-subtle)] rounded-xl bg-slate-50/50 p-3 relative flex items-center justify-center overflow-hidden">
              <svg className="w-full h-full" viewBox="0 0 800 160" preserveAspectRatio="none">
                {/* Horizontal reference lines */}
                <line x1="40" y1="20" x2="780" y2="20" stroke="#E2E5EA" strokeDasharray="3 3" />
                <line x1="40" y1="80" x2="780" y2="80" stroke="#E2E5EA" strokeDasharray="3 3" />
                <line x1="40" y1="140" x2="780" y2="140" stroke="#CBD1DA" />

                {/* Plot points */}
                {allResults.map((r, i) => {
                  // Normalize coordinates
                  const minDD = Math.min(...allResults.map((p) => p.maxDrawdown));
                  const maxDD = Math.max(...allResults.map((p) => p.maxDrawdown), minDD + 1);
                  const minProfit = Math.min(...allResults.map((p) => p.netProfit));
                  const maxProfit = Math.max(...allResults.map((p) => p.netProfit), minProfit + 1);

                  const x = 50 + ((r.maxDrawdown - minDD) / (maxDD - minDD)) * 710;
                  const y = 140 - ((r.netProfit - minProfit) / (maxProfit - minProfit)) * 120;
                  const isTop5 = r.rank <= 5;

                  return (
                    <g key={r.id}>
                      <circle
                        cx={x}
                        cy={y}
                        r={isTop5 ? 6.5 : 4}
                        fill={isTop5 ? '#2B59FF' : '#94A3B8'}
                        stroke={isTop5 ? '#FFFFFF' : '#64748B'}
                        strokeWidth={isTop5 ? 2 : 1}
                        className="cursor-pointer transition-transform hover:scale-150"
                      >
                        <title>{`Rank #${r.rank}: TP $${r.tp}, SL $${r.sl} | Net +$${r.netProfit} | Sharpe ${r.sharpe} | Win Rate ${r.winRate}%`}</title>
                      </circle>
                      {isTop5 && (
                        <text
                          x={x}
                          y={y - 8}
                          fontSize="9"
                          fontWeight="bold"
                          textAnchor="middle"
                          fill="#0E1520"
                        >
                          #{r.rank}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        )}

        {/* ─── Complete Parameter Ledger Table ─── */}
        {allResults.length > 0 && (
          <div className="bg-white rounded-2xl border border-[var(--border-subtle)] overflow-hidden shadow-xs">
            <div className="p-4 bg-[var(--bg-subtle)] border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[var(--text-1)] uppercase tracking-wider">
                  Complete Optimization Matrix Ledger
                </span>
                <span className="text-xs font-mono text-[var(--text-3)]">
                  ({filteredResults.length} of {allResults.length} vectors)
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search TP, SL, profit..."
                    className="text-xs pl-8 pr-3 py-1.5 rounded-lg border border-[var(--border-strong)] bg-white text-[var(--text-1)] focus:outline-hidden"
                  />
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExportCsv}
                  className="text-xs gap-1.5 bg-white cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[480px]">
              <table className="w-full text-xs font-mono text-left">
                <thead className="sticky top-0 bg-[var(--bg-subtle)] border-b border-[var(--border-subtle)] text-[var(--text-3)] select-none">
                  <tr>
                    <th
                      className="py-2.5 px-3 cursor-pointer hover:text-[var(--text-1)]"
                      onClick={() => handleSort('rank')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Rank</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th
                      className="py-2.5 px-3 cursor-pointer hover:text-[var(--text-1)]"
                      onClick={() => handleSort('tp')}
                    >
                      <div className="flex items-center gap-1">
                        <span>TP ($)</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th
                      className="py-2.5 px-3 cursor-pointer hover:text-[var(--text-1)]"
                      onClick={() => handleSort('sl')}
                    >
                      <div className="flex items-center gap-1">
                        <span>SL ($)</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th className="py-2.5 px-3">R:R</th>
                    <th
                      className="py-2.5 px-3 text-right cursor-pointer hover:text-[var(--text-1)]"
                      onClick={() => handleSort('netProfit')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Net Profit ($)</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th
                      className="py-2.5 px-3 text-right cursor-pointer hover:text-[var(--text-1)]"
                      onClick={() => handleSort('winRate')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Win Rate</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th
                      className="py-2.5 px-3 text-right cursor-pointer hover:text-[var(--text-1)]"
                      onClick={() => handleSort('profitFactor')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>PF</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th
                      className="py-2.5 px-3 text-right cursor-pointer hover:text-[var(--text-1)]"
                      onClick={() => handleSort('sharpe')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Sharpe</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th
                      className="py-2.5 px-3 text-right cursor-pointer hover:text-[var(--text-1)]"
                      onClick={() => handleSort('maxDrawdown')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Max DD</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th className="py-2.5 px-3 text-right">MC 95% DD</th>
                    <th className="py-2.5 px-3 text-right">MC Win %</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {filteredResults.map((res) => {
                    const isTop5 = res.rank <= 5;
                    return (
                      <tr
                        key={res.id}
                        className={`hover:bg-[var(--bg-subtle)]/60 transition-colors ${
                          isTop5 ? 'bg-amber-50/20 font-medium' : ''
                        }`}
                      >
                        <td className="py-2 px-3 font-bold">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] ${
                              res.rank === 1
                                ? 'bg-amber-100 text-amber-900 font-extrabold'
                                : isTop5
                                ? 'bg-slate-200 text-slate-800'
                                : 'text-[var(--text-3)]'
                            }`}
                          >
                            #{res.rank}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-semibold text-[var(--brand)]">${res.tp.toFixed(2)}</td>
                        <td className="py-2 px-3 text-[var(--text-1)]">${res.sl.toFixed(2)}</td>
                        <td className="py-2 px-3 text-[var(--text-2)]">1 : {res.rrRatio.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right font-bold text-[var(--profit)]">
                          +${res.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 text-right text-[var(--text-1)]">{res.winRate.toFixed(1)}%</td>
                        <td className="py-2 px-3 text-right text-[var(--text-1)]">{res.profitFactor.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right font-semibold text-indigo-700">{res.sharpe.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right text-[var(--loss)]">-${res.maxDrawdown.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right text-slate-600">-${res.monteCarlo.p95MaxDDCash}</td>
                        <td className="py-2 px-3 text-right font-semibold text-emerald-700">
                          {res.monteCarlo.probProfit.toFixed(1)}%
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            onClick={() => handleApplySetup(res)}
                            className="px-2 py-1 rounded text-[10px] font-bold bg-[var(--brand)]/10 text-[var(--brand)] hover:bg-[var(--brand)] hover:text-white transition-colors cursor-pointer"
                          >
                            Apply
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
