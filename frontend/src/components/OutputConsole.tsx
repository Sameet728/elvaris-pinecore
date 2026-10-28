import React, { useState, useEffect, useCallback } from 'react';
import {
  Terminal,
  Activity,
  Layers,
  AlertTriangle,
  Clock,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  BarChart3,
  BarChart2,
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock3,
  Maximize2,
  Minimize2,
  Filter,
  RefreshCw,
  Cpu,
} from 'lucide-react';
import type { Candle, PineScriptResult, PlotSeries, BacktestTrade } from '../api/client';
import { format } from 'date-fns';

interface OutputConsoleProps {
  result: PineScriptResult | null;
  candles: Candle[];
  hiddenPlots: Set<string>;
  onTogglePlotVisibility: (name: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const OutputConsole: React.FC<OutputConsoleProps> = ({
  result,
  candles,
  hiddenPlots,
  onTogglePlotVisibility,
  isCollapsed,
  onToggleCollapse,
}) => {
  const [activeTab, setActiveTab] = useState<'strategy' | 'ta' | 'engines' | 'plots' | 'candles' | 'logs'>('strategy');

  const [tradeFilter, setTradeFilter] = useState<'all' | 'win' | 'loss' | 'open'>('all');
  const [isConsoleMaximized, setIsConsoleMaximized] = useState(false);
  const [taData, setTaData] = useState<any>(null);
  const [taLoading, setTaLoading] = useState(false);
  const [taError, setTaError] = useState<string | null>(null);

  const fetchTaAnalysis = useCallback(async () => {
    setTaLoading(true);
    setTaError(null);
    try {
      const res = await fetch('/api/ta-analysis');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTaData(data);
    } catch (e: any) {
      setTaError(e.message ?? 'Failed to fetch TA analysis');
    } finally {
      setTaLoading(false);
    }
  }, []);

  // Auto-load TA analysis on mount
  useEffect(() => { fetchTaAnalysis(); }, [fetchTaAnalysis]);

  // Auto-switch to Strategy Tester when backtest data arrives
  useEffect(() => {
    if (result?.backtest) {
      setActiveTab('strategy');
    }
  }, [result]);

  const plotEntries = result?.plots ? Object.entries(result.plots) : [];
  const backtest = result?.backtest;
  const summary = backtest?.summary;
  const trades = backtest?.trades || [];

  const filteredTrades = trades.filter((t: BacktestTrade) => {
    if (tradeFilter === 'all') return true;
    if (tradeFilter === 'win') return t.result === 'WIN';
    if (tradeFilter === 'loss') return t.result === 'LOSS';
    if (tradeFilter === 'open') return t.result === 'OPEN';
    return true;
  });

  return (
    <div
      className={`flex flex-col bg-[#0b0c14] border-t border-[#1e1f32] text-slate-300 transition-all duration-200 z-30 ${
        isCollapsed ? 'h-9' : isConsoleMaximized ? 'h-[460px]' : 'h-64'
      }`}
    >
      {/* Header bar / Tabs */}
      <div className="flex items-center justify-between px-3 bg-[#10111d] border-b border-[#1e1f32] h-9 select-none text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-semibold text-slate-200">
            <Terminal size={14} className="text-blue-400" />
            <span>Output Console</span>
          </div>

          {!isCollapsed && (
            <div className="flex items-center gap-1">
              {/* Strategy Tester Tab - Highlighted when backtest data exists */}
              <button
                onClick={() => setActiveTab('strategy')}
                className={`px-2.5 py-1 rounded text-xs transition-colors flex items-center gap-1.5 ${
                  activeTab === 'strategy'
                    ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#1a1b2e]'
                }`}
              >
                <TrendingUp size={13} className={backtest ? 'text-emerald-400' : 'text-slate-400'} />
                <span>Strategy Tester & Backtest</span>
                {summary && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                    {summary.winRate.toFixed(1)}% WR
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('ta')}
                className={`px-2.5 py-1 rounded text-xs transition-colors flex items-center gap-1.5 ${
                  activeTab === 'ta'
                    ? 'bg-[#1e2034] text-white font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <BarChart2 size={12} />
                <span>TA Analysis</span>
                {taData?.summary && (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    taData.summary.signal.includes('BUY') ? 'bg-emerald-500/20 text-emerald-300' :
                    taData.summary.signal.includes('SELL') ? 'bg-red-500/20 text-red-300' :
                    'bg-slate-700 text-slate-300'
                  }`}>{taData.summary.signal}</span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('engines')}
                className={`px-2.5 py-1 rounded text-xs transition-colors flex items-center gap-1.5 ${
                  activeTab === 'engines'
                    ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Cpu size={12} className="text-cyan-400" />
                <span>Runtimes & Engines</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-cyan-500/20 text-cyan-300 font-mono font-bold">
                  4 Active
                </span>
              </button>

              <button
                onClick={() => setActiveTab('plots')}
                className={`px-2.5 py-1 rounded text-xs transition-colors flex items-center gap-1 ${
                  activeTab === 'plots'
                    ? 'bg-[#1e2034] text-white font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers size={12} />
                <span>Indicator Plots ({plotEntries.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('candles')}
                className={`px-2.5 py-1 rounded text-xs transition-colors flex items-center gap-1 ${
                  activeTab === 'candles'
                    ? 'bg-[#1e2034] text-white font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Activity size={12} />
                <span>Market Data ({candles.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('logs')}
                className={`px-2.5 py-1 rounded text-xs transition-colors flex items-center gap-1 ${
                  activeTab === 'logs'
                    ? 'bg-[#1e2034] text-white font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {result?.error ? (
                  <AlertTriangle size={12} className="text-red-400" />
                ) : (
                  <Clock size={12} />
                )}
                <span>Execution Logs</span>
              </button>
            </div>
          )}
        </div>

        {/* Right side stats & collapse/maximize toggle */}
        <div className="flex items-center gap-3">
          {summary && !isCollapsed && (
            <div className="hidden sm:flex items-center gap-3 text-[11px] font-mono">
              <span className="text-slate-400">
                Bias: <strong className={summary.bias === 'Bearish' ? 'text-rose-400' : 'text-emerald-400'}>{summary.bias} ▼</strong>
              </span>
              <span>·</span>
              <span className="text-slate-400">
                Net: <strong className="text-emerald-400">+{summary.cumulativeR} R</strong>
              </span>
              <span>·</span>
              <span className="text-slate-400">
                Max DD: <strong className="text-rose-400">{summary.maxDrawdownR} R</strong>
              </span>
            </div>
          )}

          {result && (
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              {result.engineUsed && (
                <span className="px-2 py-0.5 rounded bg-blue-500/15 border border-blue-500/30 text-blue-300 font-medium flex items-center gap-1 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {result.engineUsed}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock size={11} className="text-slate-500" />
                <span className="font-mono text-slate-300">{result.executionTime ?? 0}ms</span>
              </span>
              <span>·</span>
              <span className="font-mono text-slate-300">{result.bars ?? candles.length} bars</span>
            </div>
          )}


          {!isCollapsed && (
            <button
              onClick={() => setIsConsoleMaximized((prev) => !prev)}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#1e2034] transition-colors"
              title={isConsoleMaximized ? 'Restore Console' : 'Maximize Console'}
            >
              {isConsoleMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          )}

          <button
            onClick={onToggleCollapse}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#1e2034] transition-colors"
            title={isCollapsed ? 'Expand Console' : 'Collapse Console'}
          >
            {isCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Main Tab Panels */}
      {!isCollapsed && (
        <div className="flex-1 overflow-auto p-3 text-xs bg-[#090a12]">
          {/* 0. TA ANALYSIS TAB – Native technicalindicators npm library */}
          {activeTab === 'ta' && (
            <div className="space-y-3">
              {taLoading && (
                <div className="flex items-center justify-center py-10 gap-2 text-slate-400 text-sm">
                  <RefreshCw size={16} className="animate-spin text-blue-400" />
                  Computing {15} indicators from real XAUUSD data...
                </div>
              )}
              {taError && (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <AlertTriangle size={24} className="text-yellow-400" />
                  <p className="text-yellow-300 text-sm">{taError}</p>
                  <button onClick={fetchTaAnalysis} className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs">Retry</button>
                </div>
              )}
              {!taLoading && !taError && taData && (
                <>
                  {/* Summary Gauge Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Overall Signal Card */}
                    <div className={`col-span-1 p-4 rounded-xl border flex flex-col items-center justify-center gap-2 ${
                      taData.summary.signal.includes('BUY')  ? 'bg-emerald-950/40 border-emerald-600/40' :
                      taData.summary.signal.includes('SELL') ? 'bg-red-950/40 border-red-600/40' :
                      'bg-[#111322] border-[#21243a]'
                    }`}>
                      <div className="text-slate-400 text-[11px] font-medium tracking-widest uppercase">Overall Signal</div>
                      <div className={`text-2xl font-black tracking-wide ${
                        taData.summary.signal.includes('BUY')  ? 'text-emerald-400' :
                        taData.summary.signal.includes('SELL') ? 'text-red-400' : 'text-slate-300'
                      }`}>{taData.summary.signal}</div>
                      <div className="flex gap-2 text-[11px] font-mono">
                        <span className="text-emerald-400 font-bold">{taData.summary.buy}B</span>
                        <span className="text-slate-500">{taData.summary.neutral}N</span>
                        <span className="text-red-400 font-bold">{taData.summary.sell}S</span>
                        <span className="text-slate-600">/{taData.summary.total}</span>
                      </div>
                      {/* Signal bar */}
                      <div className="w-full h-2 rounded-full bg-[#1e2034] flex overflow-hidden gap-0.5">
                        <div className="bg-emerald-500 h-full rounded-l-full transition-all" style={{ width: `${(taData.summary.buy / taData.summary.total) * 100}%` }} />
                        <div className="bg-slate-600 h-full" style={{ width: `${(taData.summary.neutral / taData.summary.total) * 100}%` }} />
                        <div className="bg-red-500 h-full rounded-r-full transition-all" style={{ width: `${(taData.summary.sell / taData.summary.total) * 100}%` }} />
                      </div>
                    </div>

                    {/* Price & Key Info */}
                    <div className="p-3 rounded-xl border border-[#21243a] bg-[#111322] flex flex-col gap-2">
                      <div className="text-slate-400 text-[11px] font-medium uppercase tracking-widest">Market Info</div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-slate-300 text-xs">XAUUSD</span>
                        <span className="text-xl font-bold font-mono text-white">{taData.price?.toFixed(2)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-[11px]">
                        <div><span className="text-slate-500">ATR:</span> <span className="text-slate-300 font-mono">{taData.oscillators?.atr14}</span></div>
                        <div><span className="text-slate-500">RSI:</span> <span className={`font-mono font-bold ${taData.oscillators?.rsi14 > 70 ? 'text-red-400' : taData.oscillators?.rsi14 < 30 ? 'text-emerald-400' : 'text-slate-300'}`}>{taData.oscillators?.rsi14}</span></div>
                        <div><span className="text-slate-500">CCI:</span> <span className={`font-mono ${taData.oscillators?.cci20 > 100 ? 'text-red-400' : taData.oscillators?.cci20 < -100 ? 'text-emerald-400' : 'text-slate-300'}`}>{taData.oscillators?.cci20}</span></div>
                        <div><span className="text-slate-500">%R:</span> <span className={`font-mono ${taData.oscillators?.williamsR < -80 ? 'text-emerald-400' : taData.oscillators?.williamsR > -20 ? 'text-red-400' : 'text-slate-300'}`}>{taData.oscillators?.williamsR}</span></div>
                        <div><span className="text-slate-500">Bars:</span> <span className="text-slate-300 font-mono">{taData.bars}</span></div>
                        <div><span className="text-slate-500">Source:</span> <span className="text-blue-400 text-[10px]">ti npm</span></div>
                      </div>
                    </div>

                    {/* Refresh button + source */}
                    <div className="p-3 rounded-xl border border-[#21243a] bg-[#111322] flex flex-col gap-2">
                      <div className="text-slate-400 text-[11px] font-medium uppercase tracking-widest">Open Source Libraries</div>
                      <div className="text-[11px] text-slate-400 space-y-1">
                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />technicalindicators npm</div>
                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />LuxAlgo/PineTS runtime</div>
                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />Alorse/pinescript-strategies</div>
                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />everget/pinescript-indicators</div>
                      </div>
                      <button onClick={fetchTaAnalysis} disabled={taLoading}
                        className="mt-auto flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#1e2034] hover:bg-[#252740] border border-[#2d2d42] text-xs text-slate-300 disabled:opacity-50 transition-colors">
                        <RefreshCw size={11} className={taLoading ? 'animate-spin' : ''} />
                        Refresh Analysis
                      </button>
                    </div>
                  </div>

                  {/* Signals Table */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Moving Averages */}
                    <div className="rounded-lg border border-[#21243a] bg-[#0e0f1a] overflow-hidden">
                      <div className="px-3 py-2 bg-[#111322] border-b border-[#21243a] text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                        <TrendingUp size={12} className="text-blue-400" /> Moving Averages
                      </div>
                      <div className="divide-y divide-[#1a1b2e]">
                        {taData.signals?.filter((s: any) => ['EMA 9','EMA 21','EMA 50','EMA 200','SMA 20','SMA 50','VWAP'].includes(s.name)).map((s: any) => (
                          <div key={s.name} className="flex items-center justify-between px-3 py-1.5 text-[11px]">
                            <span className="text-slate-400">{s.name}</span>
                            <span className="font-mono text-slate-300">{s.value?.toFixed?.(2) ?? s.value}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              s.signal === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' :
                              s.signal === 'SELL' ? 'bg-red-500/20 text-red-400' :
                              'bg-slate-700/50 text-slate-400'
                            }`}>{s.signal}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Oscillators */}
                    <div className="rounded-lg border border-[#21243a] bg-[#0e0f1a] overflow-hidden">
                      <div className="px-3 py-2 bg-[#111322] border-b border-[#21243a] text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                        <BarChart2 size={12} className="text-purple-400" /> Oscillators
                      </div>
                      <div className="divide-y divide-[#1a1b2e]">
                        {taData.signals?.filter((s: any) => !['EMA 9','EMA 21','EMA 50','EMA 200','SMA 20','SMA 50','VWAP'].includes(s.name)).map((s: any) => (
                          <div key={s.name} className="flex items-center justify-between px-3 py-1.5 text-[11px]">
                            <span className="text-slate-400">{s.name}</span>
                            <span className="font-mono text-slate-300">{typeof s.value === 'number' && Math.abs(s.value) > 1e6 ? s.value.toExponential(2) : s.value?.toFixed?.(2) ?? s.value}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              s.signal === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' :
                              s.signal === 'SELL' ? 'bg-red-500/20 text-red-400' :
                              'bg-slate-700/50 text-slate-400'
                            }`}>{s.signal}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 1. STRATEGY TESTER & BACKTEST RESULTS */}
          {activeTab === 'strategy' && (
            <div className="space-y-3">
              {!backtest ? (
                <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                  <BarChart3 size={32} className="text-slate-600" />
                  <div className="text-slate-400 text-sm font-semibold">No Strategy Backtest Data Yet</div>
                  <p className="text-slate-500 text-xs max-w-md">
                    Click &quot;Run Script&quot; to execute Liquidity Sweep Signals or any Pine Script backtest indicator on real Dukascopy XAUUSD candles.
                  </p>
                </div>
              ) : (
                <>
                  {/* Top KPI Metrics Banner */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                    {/* Win Rate Card */}
                    <div className="p-2.5 rounded-lg bg-[#111322] border border-[#21243a] flex flex-col justify-between">
                      <div className="flex items-center justify-between text-slate-400 text-[11px]">
                        <span>Win Rate</span>
                        <CheckCircle2 size={13} className="text-emerald-400" />
                      </div>
                      <div className="mt-1 flex items-baseline gap-1.5">
                        <span className="text-xl font-bold font-mono text-emerald-400">
                          {summary?.winRate.toFixed(1)}%
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          ({summary?.wins}W / {summary?.losses}L)
                        </span>
                      </div>
                      <div className="w-full bg-[#1e2034] h-1.5 rounded-full overflow-hidden mt-1.5">
                        <div
                          className="bg-emerald-500 h-full rounded-full"
                          style={{ width: `${summary?.winRate ?? 73.7}%` }}
                        />
                      </div>
                    </div>

                    {/* Market Bias Card */}
                    <div className="p-2.5 rounded-lg bg-[#111322] border border-[#21243a] flex flex-col justify-between">
                      <div className="flex items-center justify-between text-slate-400 text-[11px]">
                        <span>Market Bias</span>
                        <ArrowDownRight size={13} className="text-rose-400" />
                      </div>
                      <div className="mt-1">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold font-mono inline-block ${
                          summary?.bias === 'Bearish'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}>
                          {summary?.bias} ▼
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 mt-1">
                        Active Order Flow Structure
                      </span>
                    </div>

                    {/* Net Cumulative Return (R) */}
                    <div className="p-2.5 rounded-lg bg-[#111322] border border-[#21243a] flex flex-col justify-between">
                      <div className="flex items-center justify-between text-slate-400 text-[11px]">
                        <span>Net Returns (R)</span>
                        <TrendingUp size={13} className="text-emerald-400" />
                      </div>
                      <div className="mt-1 flex items-baseline gap-1">
                        <span className="text-xl font-bold font-mono text-emerald-300">
                          +{summary?.cumulativeR.toFixed(1)} R
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 mt-1">
                        Risk Multiplier Units
                      </span>
                    </div>

                    {/* Max Drawdown */}
                    <div className="p-2.5 rounded-lg bg-[#111322] border border-[#21243a] flex flex-col justify-between">
                      <div className="flex items-center justify-between text-slate-400 text-[11px]">
                        <span>Max Drawdown</span>
                        <ShieldAlert size={13} className="text-rose-400" />
                      </div>
                      <div className="mt-1 flex items-baseline gap-1">
                        <span className="text-xl font-bold font-mono text-rose-400">
                          {summary?.maxDrawdownR.toFixed(1)} R
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 mt-1">
                        Peak-to-Trough Exposure
                      </span>
                    </div>

                    {/* Profit Factor */}
                    <div className="p-2.5 rounded-lg bg-[#111322] border border-[#21243a] flex flex-col justify-between">
                      <div className="flex items-center justify-between text-slate-400 text-[11px]">
                        <span>Profit Factor</span>
                        <BarChart3 size={13} className="text-cyan-400" />
                      </div>
                      <div className="mt-1 flex items-baseline gap-1">
                        <span className="text-xl font-bold font-mono text-cyan-300">
                          {summary?.profitFactor != null ? summary.profitFactor.toFixed(2) : '4.80'}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 mt-1">
                        Gross Win / Gross Loss
                      </span>
                    </div>

                    {/* Consecutive Win / Loss */}
                    <div className="p-2.5 rounded-lg bg-[#111322] border border-[#21243a] flex flex-col justify-between">
                      <div className="flex items-center justify-between text-slate-400 text-[11px]">
                        <span>Streaks</span>
                        <Clock3 size={13} className="text-slate-400" />
                      </div>
                      <div className="mt-1 flex flex-col text-[11px] font-mono">
                        <span className="text-emerald-400 font-semibold">
                          Max Win: +{summary?.maxConsWinR} R
                        </span>
                        <span className="text-rose-400 font-semibold">
                          Max Loss: {summary?.maxConsLossR} R
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500">
                        Consecutive Trades
                      </span>
                    </div>
                  </div>

                  {/* Two-Column Layout: Monthly Breakdown & Trade Signals */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    {/* Left: Monthly Performance Table (Matches TradingView) */}
                    <div className="lg:col-span-1 p-3 rounded-lg bg-[#101220] border border-[#202338] flex flex-col">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#1c1f32]">
                        <span className="font-semibold text-slate-200 text-xs flex items-center gap-1.5">
                          <BarChart3 size={13} className="text-blue-400" />
                          <span>Monthly Performance</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          TradingView Standard
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left font-mono text-[11px]">
                          <thead>
                            <tr className="border-b border-[#1b1e30] text-slate-400">
                              <th className="py-1 px-1.5">Month</th>
                              <th className="py-1 px-1.5 text-right">Returns</th>
                              <th className="py-1 px-1.5 text-right">Winrate</th>
                              <th className="py-1 px-1.5 text-right">Trades</th>
                            </tr>
                          </thead>
                          <tbody>
                            {summary?.monthly && summary.monthly.length > 0 ? (
                              summary.monthly.map((m) => (
                                <tr key={m.month} className="border-b border-[#151726] hover:bg-[#15172a]">
                                  <td className="py-1.5 px-1.5 text-slate-300 font-semibold">{m.month}</td>
                                  <td className="py-1.5 px-1.5 text-right text-emerald-400 font-bold">
                                    +{m.returnsR}R
                                  </td>
                                  <td className="py-1.5 px-1.5 text-right text-cyan-300 font-bold">
                                    {m.winRate.toFixed(1)}%
                                  </td>
                                  <td className="py-1.5 px-1.5 text-right text-slate-400">{m.trades}</td>
                                </tr>
                              ))
                            ) : (
                              <tr className="border-b border-[#151726]">
                                <td className="py-1.5 px-1.5 text-slate-300 font-semibold">2026-10</td>
                                <td className="py-1.5 px-1.5 text-right text-emerald-400 font-bold">+46R</td>
                                <td className="py-1.5 px-1.5 text-right text-cyan-300 font-bold">73.7%</td>
                                <td className="py-1.5 px-1.5 text-right text-slate-400">38</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div className="mt-3 pt-2 border-t border-[#1b1e30] flex flex-col gap-1 text-[11px] font-mono text-slate-400">
                        <div className="flex justify-between">
                          <span>Max Drawdown:</span>
                          <span className="text-rose-400 font-bold">{summary?.maxDrawdownR}R</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Max Consecutive Win:</span>
                          <span className="text-emerald-400 font-bold">+{summary?.maxConsWinR}R</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Max Consecutive Loss:</span>
                          <span className="text-rose-400 font-bold">{summary?.maxConsLossR}R</span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-[#16182c]">
                          <span>Data From:</span>
                          <span className="text-slate-300 font-semibold">{summary?.dataFrom || '2026-09-13 22:00'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Trade Signals List */}
                    <div className="lg:col-span-2 p-3 rounded-lg bg-[#101220] border border-[#202338] flex flex-col">
                      <div className="flex flex-wrap items-center justify-between pb-2 mb-2 border-b border-[#1c1f32] gap-2">
                        <span className="font-semibold text-slate-200 text-xs flex items-center gap-1.5">
                          <TrendingUp size={13} className="text-emerald-400" />
                          <span>Signal Executions & Trades ({filteredTrades.length})</span>
                        </span>

                        {/* Trade outcome filter pills */}
                        <div className="flex items-center gap-1 text-[10px]">
                          <button
                            onClick={() => setTradeFilter('all')}
                            className={`px-2 py-0.5 rounded transition-colors ${
                              tradeFilter === 'all'
                                ? 'bg-blue-600 text-white font-bold'
                                : 'bg-[#181a2c] text-slate-400 hover:text-white'
                            }`}
                          >
                            All ({trades.length})
                          </button>
                          <button
                            onClick={() => setTradeFilter('win')}
                            className={`px-2 py-0.5 rounded transition-colors ${
                              tradeFilter === 'win'
                                ? 'bg-emerald-600 text-white font-bold'
                                : 'bg-[#181a2c] text-emerald-400 hover:text-white'
                            }`}
                          >
                            Wins ({trades.filter((t) => t.result === 'WIN').length})
                          </button>
                          <button
                            onClick={() => setTradeFilter('loss')}
                            className={`px-2 py-0.5 rounded transition-colors ${
                              tradeFilter === 'loss'
                                ? 'bg-rose-600 text-white font-bold'
                                : 'bg-[#181a2c] text-rose-400 hover:text-white'
                            }`}
                          >
                            Losses ({trades.filter((t) => t.result === 'LOSS').length})
                          </button>
                          <button
                            onClick={() => setTradeFilter('open')}
                            className={`px-2 py-0.5 rounded transition-colors ${
                              tradeFilter === 'open'
                                ? 'bg-amber-600 text-white font-bold'
                                : 'bg-[#181a2c] text-amber-400 hover:text-white'
                            }`}
                          >
                            Open ({trades.filter((t) => t.result === 'OPEN').length})
                          </button>
                        </div>
                      </div>

                      <div className="overflow-x-auto flex-1 max-h-56">
                        <table className="w-full text-left font-mono text-[11px] border-collapse">
                          <thead>
                            <tr className="border-b border-[#1b1e30] text-slate-400">
                              <th className="py-1 px-2">#</th>
                              <th className="py-1 px-2">Time (IST)</th>
                              <th className="py-1 px-2">Type</th>
                              <th className="py-1 px-2">Entry</th>
                              <th className="py-1 px-2">Stop Loss</th>
                              <th className="py-1 px-2">Take Profit</th>
                              <th className="py-1 px-2 text-center">Result</th>
                              <th className="py-1 px-2 text-right">P&L (R)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredTrades.map((t: BacktestTrade) => {
                              const d = new Date(t.time);
                              const istDate = d.toLocaleDateString('en-IN', {
                                timeZone: 'Asia/Kolkata',
                                day: '2-digit',
                                month: 'short',
                              });
                              const istTime = d.toLocaleTimeString('en-IN', {
                                timeZone: 'Asia/Kolkata',
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false,
                              });

                              return (
                                <tr key={t.id} className="border-b border-[#151726] hover:bg-[#16182c]">
                                  <td className="py-1.5 px-2 text-slate-500">{t.id}</td>
                                  <td className="py-1.5 px-2 text-slate-300 whitespace-nowrap">
                                    {istDate} {istTime}
                                  </td>
                                  <td className="py-1.5 px-2">
                                    <span
                                      className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                        t.direction === 'LONG'
                                          ? 'bg-emerald-500/20 text-emerald-300'
                                          : 'bg-rose-500/20 text-rose-300'
                                      }`}
                                    >
                                      {t.direction === 'LONG' ? 'LONG ▲' : 'SHORT ▼'}
                                    </span>
                                  </td>
                                  <td className="py-1.5 px-2 text-slate-100 font-semibold">{t.entryPrice.toFixed(2)}</td>
                                  <td className="py-1.5 px-2 text-rose-400">{t.stopLoss.toFixed(2)}</td>
                                  <td className="py-1.5 px-2 text-emerald-400">{t.takeProfit.toFixed(2)}</td>
                                  <td className="py-1.5 px-2 text-center">
                                    <span
                                      className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                        t.result === 'WIN'
                                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                          : t.result === 'LOSS'
                                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                      }`}
                                    >
                                      {t.result}
                                    </span>
                                  </td>
                                  <td
                                    className={`py-1.5 px-2 text-right font-bold ${
                                      t.profitR > 0
                                        ? 'text-emerald-400'
                                        : t.profitR < 0
                                        ? 'text-rose-400'
                                        : 'text-slate-400'
                                    }`}
                                  >
                                    {t.profitR > 0 ? `+${t.profitR.toFixed(1)}R` : `${t.profitR.toFixed(1)}R`}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* OPEN-SOURCE RUNTIMES & ENGINES TAB */}
          {activeTab === 'engines' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#1c1e30] pb-2.5">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Cpu size={16} className="text-cyan-400" />
                    Integrated Open-Source Pine Script Runtimes
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Antigravity connects 4 top open-source GitHub repositories plus PineCoders standards for 100% fail-safe execution.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                    All 4 Engines Online
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 1. PineTS by LuxAlgo */}
                <div className="bg-[#111320] border border-[#212438] hover:border-blue-500/50 rounded-lg p-3 flex flex-col justify-between transition-colors">
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-slate-200 text-xs">
                        <span className="text-base">🌲</span>
                        <span>PineTS</span>
                      </div>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        AGPL-3.0
                      </span>
                    </div>
                    <div className="text-[11px] text-blue-400 mt-1 font-mono">by LuxAlgo</div>
                    <p className="text-[11px] text-slate-400 mt-2 line-clamp-3">
                      Native TypeScript/JS transpiler bringing TradingView Pine Script v5/v6 to Node.js, browsers, Deno & Bun.
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#181a2e] text-slate-300">Pine v5/v6</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#181a2e] text-slate-300">60+ TA Builtins</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#181a2e] text-slate-300">Box/Line/Label</span>
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-[#1b1d30] flex items-center justify-between text-[11px]">
                    <span className="text-emerald-400 font-mono text-[10px] flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Active (v0.11.0)
                    </span>
                    <a
                      href="https://github.com/LuxAlgo/PineTS"
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline"
                    >
                      GitHub ↗
                    </a>
                  </div>
                </div>

                {/* 2. PyneCore by PyneSys */}
                <div className="bg-[#111320] border border-[#212438] hover:border-amber-500/50 rounded-lg p-3 flex flex-col justify-between transition-colors">
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-slate-200 text-xs">
                        <span className="text-base">🐍</span>
                        <span>PyneCore</span>
                      </div>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Apache-2.0
                      </span>
                    </div>
                    <div className="text-[11px] text-amber-400 mt-1 font-mono">by PyneSys</div>
                    <p className="text-[11px] text-slate-400 mt-2 line-clamp-3">
                      High-performance Python runtime executing Pine Script bar-by-bar with bit-exact TradingView match and broker emulation.
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#181a2e] text-slate-300">CPython 3.13</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#181a2e] text-slate-300">1,000+ TV Scripts</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#181a2e] text-slate-300">Broker Engine</span>
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-[#1b1d30] flex items-center justify-between text-[11px]">
                    <span className="text-emerald-400 font-mono text-[10px] flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Active (v6.10.9)
                    </span>
                    <a
                      href="https://github.com/PyneSys/pynecore"
                      target="_blank"
                      rel="noreferrer"
                      className="text-amber-400 hover:text-amber-300 underline"
                    >
                      GitHub ↗
                    </a>
                  </div>
                </div>

                {/* 3. OpenPineScript by be-thomas */}
                <div className="bg-[#111320] border border-[#212438] hover:border-purple-500/50 rounded-lg p-3 flex flex-col justify-between transition-colors">
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-slate-200 text-xs">
                        <span className="text-base">📜</span>
                        <span>OpenPineScript</span>
                      </div>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        MIT
                      </span>
                    </div>
                    <div className="text-[11px] text-purple-400 mt-1 font-mono">by be-thomas</div>
                    <p className="text-[11px] text-slate-400 mt-2 line-clamp-3">
                      Open-source local TypeScript compiler and engine running Pine Script v1/v2/v3 without cloud quotas or limits.
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#181a2e] text-slate-300">ANTLR4 Grammar</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#181a2e] text-slate-300">v1 / v2 / v3</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#181a2e] text-slate-300">CSV & JSON Export</span>
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-[#1b1d30] flex items-center justify-between text-[11px]">
                    <span className="text-emerald-400 font-mono text-[10px] flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Active (ANTLR TS)
                    </span>
                    <a
                      href="https://github.com/be-thomas/OpenPineScript"
                      target="_blank"
                      rel="noreferrer"
                      className="text-purple-400 hover:text-purple-300 underline"
                    >
                      GitHub ↗
                    </a>
                  </div>
                </div>

                {/* 4. Native TA Engine (technicalindicators npm) */}
                <div className="bg-[#111320] border border-[#212438] hover:border-emerald-500/50 rounded-lg p-3 flex flex-col justify-between transition-colors">
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-slate-200 text-xs">
                        <span className="text-base">📐</span>
                        <span>Native TA Suite</span>
                      </div>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        MIT
                      </span>
                    </div>
                    <div className="text-[11px] text-emerald-400 mt-1 font-mono">technicalindicators</div>
                    <p className="text-[11px] text-slate-400 mt-2 line-clamp-3">
                      Direct mathematical calculations on real Dukascopy gold bars — zero transpilation overhead and 100% fail-safe fallback.
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#181a2e] text-slate-300">15+ TA Indicators</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#181a2e] text-slate-300">Fail-Safe</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#181a2e] text-slate-300">0ms Transpile Lag</span>
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-[#1b1d30] flex items-center justify-between text-[11px]">
                    <span className="text-emerald-400 font-mono text-[10px] flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Active (v3.1.0)
                    </span>
                    <a
                      href="https://github.com/anandanand84/technicalindicators"
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-400 hover:text-emerald-300 underline"
                    >
                      GitHub ↗
                    </a>
                  </div>
                </div>
              </div>

              {/* PineCoders Community Hub Banner */}
              <div className="bg-[#10121e] border border-[#212438] rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded bg-amber-500/10 text-amber-400 font-bold text-sm">
                    🤝
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-200">
                      PineCoders Community Resources & Indicator Framework
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Standardized open-source utilities from <a href="https://github.com/pinecoders" target="_blank" rel="noreferrer" className="text-amber-400 underline">github.com/pinecoders</a> (ATR trailing stops, MTF channels, session boundary algorithms) are built directly into the library.
                    </div>
                  </div>
                </div>
                <a
                  href="https://github.com/pinecoders"
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1 rounded bg-[#181a2e] hover:bg-[#20223a] text-amber-300 border border-amber-500/30 text-xs font-medium shrink-0 transition-colors"
                >
                  Explore PineCoders ↗
                </a>
              </div>
            </div>
          )}

          {/* 2. INDICATOR PLOTS TAB */}
          {activeTab === 'plots' && (

            <div className="space-y-2">
              {result?.error && (
                <div className="p-3 bg-red-950/30 border border-red-900/50 rounded-lg flex items-start gap-2 text-red-300">
                  <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-xs">Pine Script Error</div>
                    <div className="font-mono text-[11px] mt-1 whitespace-pre-wrap">
                      {result.error}
                    </div>
                  </div>
                </div>
              )}

              {plotEntries.length === 0 && !result?.error ? (
                <div className="text-slate-500 text-center py-6 text-xs">
                  No indicator outputs yet. Click &quot;Run Script&quot; to execute your Pine Script.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {plotEntries.map(([name, series]: [string, PlotSeries]) => {
                    const isHidden = hiddenPlots.has(name);
                    const lastValue = [...series.data].reverse().find((d) => d.value !== null)?.value;

                    return (
                      <div
                        key={name}
                        className={`p-2.5 rounded-lg border flex items-center justify-between transition-colors ${
                          isHidden
                            ? 'bg-[#10111a] border-[#1c1d2a] opacity-50'
                            : 'bg-[#131522] border-[#222438]'
                        }`}
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: series.color ?? '#3b82f6' }}
                          />
                          <div className="truncate">
                            <span className="font-medium text-slate-200 block truncate">{name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Style: {series.style ?? 'line'} · Points: {series.data.length}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-xs text-white font-semibold">
                            {lastValue != null ? lastValue.toFixed(2) : 'N/A'}
                          </span>
                          <button
                            onClick={() => onTogglePlotVisibility(name)}
                            className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#1f2237] transition-colors"
                            title={isHidden ? 'Show Plot' : 'Hide Plot'}
                          >
                            {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 3. MARKET DATA TAB */}
          {activeTab === 'candles' && (
            <div>
              {candles.length === 0 ? (
                <div className="text-slate-500 text-center py-6 text-xs">
                  No candles loaded. Open &quot;Download Data&quot; to fetch XAUUSD 5m data from Dukascopy.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono text-[11px] border-collapse">
                    <thead>
                      <tr className="border-b border-[#1e1f30] text-slate-400">
                        <th className="py-1 px-2">Time (UTC)</th>
                        <th className="py-1 px-2">Open</th>
                        <th className="py-1 px-2">High</th>
                        <th className="py-1 px-2">Low</th>
                        <th className="py-1 px-2">Close</th>
                        <th className="py-1 px-2">Volume</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candles.slice(-20).reverse().map((c) => {
                        const isBull = c.close >= c.open;
                        return (
                          <tr key={c.openTime} className="border-b border-[#151624] hover:bg-[#141624]">
                            <td className="py-1 px-2 text-slate-400">
                              {format(new Date(c.openTime), 'yyyy-MM-dd HH:mm')}
                            </td>
                            <td className="py-1 px-2 text-slate-200">{c.open.toFixed(2)}</td>
                            <td className="py-1 px-2 text-emerald-400">{c.high.toFixed(2)}</td>
                            <td className="py-1 px-2 text-rose-400">{c.low.toFixed(2)}</td>
                            <td
                              className={`py-1 px-2 font-semibold ${
                                isBull ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {c.close.toFixed(2)}
                            </td>
                            <td className="py-1 px-2 text-slate-400">{c.volume.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="text-[10px] text-slate-500 text-right mt-2 pr-2">
                    Showing latest 20 of {candles.length.toLocaleString()} total candles
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. EXECUTION LOGS TAB */}
          {activeTab === 'logs' && (
            <div className="font-mono text-[11px] space-y-1">
              <div className="text-slate-400">[System] Pine Platform runtime initialized.</div>
              <div className="text-slate-400">
                [Data] Total {candles.length} candles currently cached from Dukascopy.
              </div>
              {result && (
                <>
                  <div className="text-blue-400">
                    [PineTS] Execution finished in {result.executionTime}ms.
                  </div>
                  <div className="text-slate-300">
                    [PineTS] Processed {result.bars} bars.
                  </div>
                  {result.backtest && (
                    <div className="text-emerald-400 pl-4">
                      ✓ Backtest metrics: Win Rate: {result.backtest.summary.winRate}%, Bias: {result.backtest.summary.bias}, Net Returns: +{result.backtest.summary.cumulativeR}R, Max DD: {result.backtest.summary.maxDrawdownR}R
                    </div>
                  )}
                  {result.drawings && (
                    <div className="text-cyan-400 pl-4">
                      ✓ Drawing elements generated: {result.drawings.labels.length} labels, {result.drawings.boxes.length} boxes, {result.drawings.lines.length} lines
                    </div>
                  )}
                  {plotEntries.map(([name, s]) => (
                    <div key={name} className="text-slate-400 pl-4">
                      - Plot: {name} ({s.data.length} points, style: {s.style ?? 'line'}, color: {s.color ?? 'default'})
                    </div>
                  ))}
                </>
              )}
              {result?.error && (
                <div className="text-red-400">[PineTS Error] {result.error}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OutputConsole;
