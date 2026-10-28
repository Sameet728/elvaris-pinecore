import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { TopNav } from './components/TopNav';
import { VelaChart, type VelaChartHandle } from './components/VelaChart';
import { CodeEditor, SAMPLE_SCRIPTS } from './components/CodeEditor';
import { OutputConsole } from './components/OutputConsole';
import { DataDownloader } from './components/DataDownloader';
import { HelpModal } from './components/HelpModal';
import { Leaderboard } from './components/Leaderboard';
import {
  fetchCandles,
  fetchMetadata,
  executeScript,
  listScripts,
  createScript,
  type Candle,
  type DataMetadata,
  type PineScriptResult,
  type SavedScript,
  type PlotSeries,
} from './api/client';
import { AlertCircle, Download, Loader2, Code2, Terminal, Play, Trophy } from 'lucide-react';

export const App: React.FC = () => {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [metadata, setMetadata] = useState<DataMetadata | null>(null);
  const [isLoadingCandles, setIsLoadingCandles] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Pine Script state - default to Liquidity Sweep Signals [EVLabs] via PineTS
  // Pine Script state - default to Liquidity Sweep Signals [EVLabs] via PineTS
  const [activeScriptName, setActiveScriptName] = useState(SAMPLE_SCRIPTS.liquidity_sweep_signals.name);
  const [script, setScript] = useState<string>(SAMPLE_SCRIPTS.liquidity_sweep_signals.script);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<PineScriptResult | null>(null);
  const [savedScripts, setSavedScripts] = useState<SavedScript[]>([]);

  const [maxBars, setMaxBars] = useState<number>(2000);
  const [selectedEngine, setSelectedEngine] = useState<'auto' | 'pinets' | 'pynecore' | 'openpinescript' | 'native'>('auto');
  const [hiddenPlots, setHiddenPlots] = useState<Set<string>>(new Set());

  // Chart Handle for direct on-chart Pine execution
  const chartHandleRef = useRef<VelaChartHandle | null>(null);

  // UI Panels & Layout - default to bottom dock like TradingView & velacharts.dev/pine-script
  const [editorLayout, setEditorLayout] = useState<'bottom' | 'side'>('bottom');
  const [editorHeight, setEditorHeight] = useState<number>(300);
  const [isEditorMaximized, setIsEditorMaximized] = useState(false);
  const [showEditor, setShowEditor] = useState(true);
  const [showConsole, setShowConsole] = useState(true);
  const [consoleCollapsed, setConsoleCollapsed] = useState(true); // Keep collapsed by default so chart has maximum room
  const [downloaderOpen, setDownloaderOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  // Scroll Indicator Below Mode (defaults to true: chart full screen + scroll page below for indicator & trades)
  const [scrollMode, setScrollMode] = useState(true);

  // Load initial data from backend SQLite
  const loadData = useCallback(async () => {
    setIsLoadingCandles(true);
    setLoadError(null);
    try {
      const [meta, candleRes, scripts] = await Promise.all([
        fetchMetadata().catch(() => null),
        fetchCandles({ limit: maxBars }).catch((e) => {
          console.warn('Candle fetch warning:', e);
          return { candles: [], count: 0, instrument: 'XAUUSD', timeframe: 'M5', provider: 'Dukascopy' };
        }),
        listScripts().catch(() => []),
      ]);

      setMetadata(meta);
      setCandles(candleRes.candles || []);
      setSavedScripts(scripts || []);

      // If no data exists yet, automatically prompt the user to download
      if ((!candleRes.candles || candleRes.candles.length === 0) && (!meta || meta.candleCount === 0)) {
        setDownloaderOpen(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLoadError(msg);
    } finally {
      setIsLoadingCandles(false);
    }
  }, [maxBars]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Execute Pine Script: dual-path (on-chart Vela workspace + backend quantitative engine)
  const handleExecute = useCallback(async () => {
    if (!script.trim()) return;
    setIsExecuting(true);
    try {
      // 1. Direct on-chart execution in VelaWorkspace via PineWorkerEngine
      if (chartHandleRef.current) {
        try {
          const chartRun = await chartHandleRef.current.runScript(script, activeScriptName);
          console.log('[App] Vela workspace on-chart runScript result:', chartRun);
        } catch (chartErr) {
          console.warn('[App] Vela on-chart script run note:', chartErr);
        }
      }

      // 2. Multi-Engine execution against real Dukascopy SQLite candles
      const res = await executeScript(script, { maxBars, engine: selectedEngine });
      setExecutionResult(res);
      if (res.backtest) {
        setShowConsole(true);
        setConsoleCollapsed(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setExecutionResult({
        success: false,
        plots: {},
        error: msg,
        executionTime: 0,
        bars: candles.length,
      });
      setShowConsole(true);
      setConsoleCollapsed(false);
    } finally {
      setIsExecuting(false);
    }
  }, [script, maxBars, selectedEngine, candles.length, activeScriptName]);


  // Automatically execute default indicator (Liquidity Sweep Signals) on initial load
  const autoRunExecutedRef = useRef(false);
  useEffect(() => {
    if (candles.length > 0 && !autoRunExecutedRef.current) {
      autoRunExecutedRef.current = true;
      const timer = setTimeout(() => {
        handleExecute();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [candles.length, handleExecute]);

  // Save script handler
  const handleSaveScript = async (name: string) => {
    try {
      const saved = await createScript(name, script);
      setSavedScripts((prev) => [saved, ...prev]);
      setActiveScriptName(name);
    } catch (err) {
      console.error('Failed to save script:', err);
    }
  };

  const handleTogglePlotVisibility = (name: string) => {
    setHiddenPlots((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  // Filter plots to pass to the chart based on hiddenPlots
  const visiblePlots = useMemo(() => {
    if (!executionResult?.plots) return {};
    const filtered: Record<string, PlotSeries> = {};
    for (const [key, series] of Object.entries(executionResult.plots)) {
      if (!hiddenPlots.has(key)) {
        filtered[key] = series;
      }
    }
    return filtered;
  }, [executionResult?.plots, hiddenPlots]);

  return (
    <div className={`flex flex-col w-screen bg-[#0a0a0f] text-slate-100 font-sans ${
      scrollMode ? 'min-h-screen overflow-y-auto custom-scrollbar' : 'h-screen overflow-hidden'
    }`}>
      {/* Top Navigation */}
      <div className={scrollMode ? 'sticky top-0 z-40 shrink-0' : 'shrink-0'}>
        <TopNav
          candles={candles}
          metadata={metadata}
          onOpenDownloader={() => setDownloaderOpen(true)}
          onExecuteScript={handleExecute}
          isExecuting={isExecuting}
          showEditor={showEditor}
          onToggleEditor={() => setShowEditor((prev) => !prev)}
          showConsole={showConsole}
          onToggleConsole={() => setShowConsole((prev) => !prev)}
          onOpenHelp={() => setHelpOpen(true)}
          scrollMode={scrollMode}
          onToggleScrollMode={() => setScrollMode((prev) => !prev)}
        />
      </div>

      {scrollMode ? (
        /* ── Scroll Mode: Full-Screen Chart + Indicator Scrolled Below ── */
        <div className="flex flex-col w-full">
          {/* Upper: Full-Screen Height Chart Viewport */}
          <section className="w-full h-[calc(100vh-48px)] min-h-[580px] shrink-0 relative bg-[#090a10]">
            {isLoadingCandles ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 h-full">
                <Loader2 size={32} className="animate-spin text-blue-500" />
                <span className="text-xs text-slate-400">Loading Dukascopy XAUUSD data...</span>
              </div>
            ) : loadError ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center h-full">
                <AlertCircle size={36} className="text-red-400" />
                <div className="text-sm font-semibold text-white">Connection Error</div>
                <div className="text-xs text-slate-400 max-w-md">{loadError}</div>
                <button
                  onClick={loadData}
                  className="mt-2 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-xs text-white"
                >
                  Retry Connection
                </button>
              </div>
            ) : candles.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center h-full">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-1">
                  <Download size={22} />
                </div>
                <div className="text-sm font-bold text-white">No Historical XAUUSD Data Found</div>
                <p className="text-xs text-slate-400 max-w-sm">
                  Download genuine 5-minute historical candles from Dukascopy to populate the Vela workspace and run Pine Script indicators.
                </p>
                <button
                  onClick={() => setDownloaderOpen(true)}
                  className="mt-2 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow-lg shadow-blue-900/40"
                >
                  <Download size={14} />
                  <span>Open Data Pipeline</span>
                </button>
              </div>
            ) : (
              <VelaChart
                candles={candles}
                plots={visiblePlots}
                drawings={executionResult?.drawings}
                backtest={executionResult?.backtest}
                symbol="XAUUSD"
                timeframe="M5"
                onChartReady={(handle) => {
                  chartHandleRef.current = handle;
                }}
                onScrollIndicatorBelow={() => {
                  document.getElementById('indicator-section')?.scrollIntoView({ behavior: 'smooth' });
                }}
              />
            )}
          </section>

          {/* Lower: Scrolled Beneath Chart - Indicator Settings, Editor & Backtest Results */}
          <section id="indicator-section" className="w-full bg-[#0c0d16] border-t-2 border-[#1e2035] p-4 flex flex-col gap-4 shrink-0">
            {/* Indicator Banner & Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-[#131525] border border-[#232742]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                  <Code2 size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">{activeScriptName}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40 font-mono">
                      v5 Active
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800/40 font-mono">
                      Engine: {selectedEngine.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Pine Script Technical Indicator & Quantitative Signals Engine
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1d30] hover:bg-[#252a45] text-slate-300 text-xs font-semibold border border-[#2b3052] transition-colors"
                  title="Scroll back up to full-screen chart"
                >
                  <span>↑ Back to Chart</span>
                </button>

                <button
                  onClick={handleExecute}
                  disabled={isExecuting}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold shadow-lg shadow-blue-900/40 cursor-pointer transition-all"
                >
                  {isExecuting ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} className="fill-current" />}
                  <span>Execute Indicator</span>
                </button>
              </div>
            </div>

            {/* Pine Script Editor */}
            <div className="rounded-xl border border-[#1f2237] overflow-hidden bg-[#101220] min-h-[420px] h-[480px]">
              <CodeEditor
                script={script}
                onChange={setScript}
                onExecute={handleExecute}
                isExecuting={isExecuting}
                savedScripts={savedScripts}
                onSaveScript={handleSaveScript}
                onLoadScript={(s) => {
                  setScript(s.source);
                  setActiveScriptName(s.name);
                }}
                maxBars={maxBars}
                onMaxBarsChange={setMaxBars}
                layout="bottom"
                onToggleLayout={() => {}}
                isMaximized={false}
                onToggleMaximize={() => {}}
                onClose={() => {}}
                activeScriptName={activeScriptName}
                onScriptNameChange={setActiveScriptName}
                selectedEngine={selectedEngine}
                onSelectEngine={setSelectedEngine}
              />
            </div>

            {/* Strategy Tester & Output Console */}
            <div className="rounded-xl border border-[#1f2237] overflow-hidden bg-[#101220]">
              <OutputConsole
                result={executionResult}
                candles={candles}
                hiddenPlots={hiddenPlots}
                onTogglePlotVisibility={handleTogglePlotVisibility}
                isCollapsed={false}
                onToggleCollapse={() => {}}
              />
            </div>
          </section>
        </div>
      ) : (
        /* ── Docked Layout: Classic TradingView Dock with Split Panels ── */
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
          {editorLayout === 'bottom' ? (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
              <div className={`flex-1 relative flex flex-col min-w-0 min-h-0 overflow-hidden bg-[#090a10] ${isEditorMaximized ? 'hidden' : ''}`}>
                {isLoadingCandles ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3">
                    <Loader2 size={32} className="animate-spin text-blue-500" />
                    <span className="text-xs text-slate-400">Loading Dukascopy XAUUSD data...</span>
                  </div>
                ) : loadError ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
                    <AlertCircle size={36} className="text-red-400" />
                    <div className="text-sm font-semibold text-white">Connection Error</div>
                    <div className="text-xs text-slate-400 max-w-md">{loadError}</div>
                    <button
                      onClick={loadData}
                      className="mt-2 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-xs text-white"
                    >
                      Retry Connection
                    </button>
                  </div>
                ) : candles.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-1">
                      <Download size={22} />
                    </div>
                    <div className="text-sm font-bold text-white">No Historical XAUUSD Data Found</div>
                    <p className="text-xs text-slate-400 max-w-sm">
                      Download genuine 5-minute historical candles from Dukascopy to populate the Vela workspace and run Pine Script indicators.
                    </p>
                    <button
                      onClick={() => setDownloaderOpen(true)}
                      className="mt-2 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow-lg shadow-blue-900/40"
                    >
                      <Download size={14} />
                      <span>Open Data Pipeline</span>
                    </button>
                  </div>
                ) : (
                  <VelaChart
                    candles={candles}
                    plots={visiblePlots}
                    drawings={executionResult?.drawings}
                    backtest={executionResult?.backtest}
                    symbol="XAUUSD"
                    timeframe="M5"
                    onChartReady={(handle) => {
                      chartHandleRef.current = handle;
                    }}
                  />
                )}
              </div>

              {showEditor && !isEditorMaximized && (
                <div
                  className="h-1 bg-[#1e1e2e] hover:bg-blue-500 active:bg-blue-600 cursor-row-resize transition-colors flex items-center justify-center shrink-0 z-20 group"
                  onMouseDown={(e) => {
                    const startY = e.clientY;
                    const startH = editorHeight;
                    const onMouseMove = (moveEvent: MouseEvent) => {
                      const delta = startY - moveEvent.clientY;
                      setEditorHeight(Math.max(160, Math.min(window.innerHeight - 150, startH + delta)));
                    };
                    const onMouseUp = () => {
                      window.removeEventListener('mousemove', onMouseMove);
                      window.removeEventListener('mouseup', onMouseUp);
                    };
                    window.addEventListener('mousemove', onMouseMove);
                    window.addEventListener('mouseup', onMouseUp);
                  }}
                >
                  <div className="w-10 h-0.5 rounded-full bg-slate-600 group-hover:bg-white" />
                </div>
              )}

              {showEditor && (
                <div
                  style={{ height: isEditorMaximized ? '100%' : `${editorHeight}px` }}
                  className="shrink-0 overflow-hidden flex flex-col min-h-[140px] z-10"
                >
                  <CodeEditor
                    script={script}
                    onChange={setScript}
                    onExecute={handleExecute}
                    isExecuting={isExecuting}
                    savedScripts={savedScripts}
                    onSaveScript={handleSaveScript}
                    onLoadScript={(s) => {
                      setScript(s.source);
                      setActiveScriptName(s.name);
                    }}
                    maxBars={maxBars}
                    onMaxBarsChange={setMaxBars}
                    layout={editorLayout}
                    onToggleLayout={() => setEditorLayout('side')}
                    isMaximized={isEditorMaximized}
                    onToggleMaximize={() => setIsEditorMaximized((prev) => !prev)}
                    onClose={() => setShowEditor(false)}
                    activeScriptName={activeScriptName}
                    onScriptNameChange={setActiveScriptName}
                    selectedEngine={selectedEngine}
                    onSelectEngine={setSelectedEngine}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex min-h-0 overflow-hidden relative">
              <div className={`flex-1 relative flex flex-col min-w-0 min-h-0 overflow-hidden bg-[#090a10] ${isEditorMaximized ? 'hidden' : ''}`}>
                {candles.length > 0 ? (
                  <VelaChart
                    candles={candles}
                    plots={visiblePlots}
                    drawings={executionResult?.drawings}
                    backtest={executionResult?.backtest}
                    symbol="XAUUSD"
                    timeframe="M5"
                    onChartReady={(handle) => {
                      chartHandleRef.current = handle;
                    }}
                  />
                ) : (
                  <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
                    Download XAUUSD data to populate chart
                  </div>
                )}
              </div>

              {showEditor && (
                <div className={`${isEditorMaximized ? 'w-full' : 'w-[520px]'} shrink-0 h-full overflow-hidden flex flex-col z-10`}>
                  <CodeEditor
                    script={script}
                    onChange={setScript}
                    onExecute={handleExecute}
                    isExecuting={isExecuting}
                    savedScripts={savedScripts}
                    onSaveScript={handleSaveScript}
                    onLoadScript={(s) => {
                      setScript(s.source);
                      setActiveScriptName(s.name);
                    }}
                    maxBars={maxBars}
                    onMaxBarsChange={setMaxBars}
                    layout={editorLayout}
                    onToggleLayout={() => setEditorLayout('bottom')}
                    isMaximized={isEditorMaximized}
                    onToggleMaximize={() => setIsEditorMaximized((prev) => !prev)}
                    onClose={() => setShowEditor(false)}
                    activeScriptName={activeScriptName}
                    onScriptNameChange={setActiveScriptName}
                    selectedEngine={selectedEngine}
                    onSelectEngine={setSelectedEngine}
                  />
                </div>
              )}
            </div>
          )}

          {showConsole && (
            <OutputConsole
              result={executionResult}
              candles={candles}
              hiddenPlots={hiddenPlots}
              onTogglePlotVisibility={handleTogglePlotVisibility}
              isCollapsed={consoleCollapsed}
              onToggleCollapse={() => setConsoleCollapsed((prev) => !prev)}
            />
          )}
        </div>
      )}

      {/* Leaderboard FAB — always visible */}
      <button
        onClick={() => setLeaderboardOpen(true)}
        className="fixed bottom-12 right-5 z-40 flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[12px] font-bold text-white shadow-2xl cursor-pointer transition-all hover:scale-105 active:scale-95"
        style={{
          background: 'linear-gradient(135deg,#f59e0b 0%,#d97706 100%)',
          boxShadow: '0 8px 32px rgba(245,158,11,0.45)',
        }}
        title="Open Strategy Leaderboard"
      >
        <Trophy size={15} />
        Leaderboard
      </button>

      {/* TradingView-Style Bottom Dock Bar */}
      <footer className="h-8 bg-[#0c0d16] border-t border-[#1b1c2d] flex items-center justify-between px-3 select-none text-xs shrink-0 z-30">
        <div className="flex items-center gap-1">
          {/* Scroll Indicator Below Mode Toggle */}
          <button
            onClick={() => setScrollMode((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-all cursor-pointer ${
              scrollMode
                ? 'bg-blue-600/30 text-blue-300 border border-blue-500/50'
                : 'text-slate-400 hover:text-white hover:bg-[#181a29]'
            }`}
            title="Toggle between Scroll Indicator Below and Docked Layout"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${scrollMode ? 'bg-cyan-400 animate-pulse' : 'bg-slate-500'}`} />
            <span>{scrollMode ? 'Scroll Below Active' : 'Docked Layout'}</span>
          </button>

          {/* Pine Editor Toggle Tab */}
          <button
            onClick={() => {
              if (scrollMode) {
                document.getElementById('indicator-section')?.scrollIntoView({ behavior: 'smooth' });
              } else {
                setShowEditor((prev) => !prev);
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-medium transition-all cursor-pointer ${
              showEditor || scrollMode
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/40'
                : 'text-slate-300 hover:text-white hover:bg-[#181a29]'
            }`}
            title="Pine Script Indicator Editor"
          >
            <Code2 size={13} />
            <span className="font-semibold">Pine Editor</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-[10px] text-slate-300 font-mono hidden sm:inline">
              ({activeScriptName})
            </span>
          </button>

          {/* Console / Output Toggle Tab */}
          <button
            onClick={() => {
              if (scrollMode) {
                document.getElementById('indicator-section')?.scrollIntoView({ behavior: 'smooth' });
              } else {
                setShowConsole(true);
                setConsoleCollapsed((prev) => !prev);
              }
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-all cursor-pointer ${
              showConsole && !consoleCollapsed
                ? 'bg-[#1e2034] text-white border border-[#2d304f]'
                : 'text-slate-400 hover:text-white hover:bg-[#181a29]'
            }`}
          >
            <Terminal size={12} />
            <span>Console</span>
            {executionResult && (
              <span className={`px-1 py-0.2 rounded text-[9px] font-mono ${executionResult.success ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'}`}>
                {executionResult.success ? 'Active' : 'Error'}
              </span>
            )}
          </button>

          {/* Quick Execute Indicator Button */}
          <button
            onClick={handleExecute}
            disabled={isExecuting}
            className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 text-[11px] font-medium ml-2 transition-all cursor-pointer"
            title="Execute current Pine Script indicator"
          >
            {isExecuting ? <Loader2 size={11} className="animate-spin" /> : <Play size={10} className="fill-current" />}
            <span>Run Indicator</span>
          </button>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
          <span className="hidden md:inline text-slate-500">
            Dukascopy Historical XAUUSD 5m
          </span>
          <span className="text-emerald-400 font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Asia/Kolkata (IST UTC+05:30)
          </span>
        </div>
      </footer>

      {/* Modals */}
      <DataDownloader
        isOpen={downloaderOpen}
        onClose={() => setDownloaderOpen(false)}
        metadata={metadata}
        onDownloadSuccess={() => {
          loadData();
        }}
      />

      <HelpModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} />

      <Leaderboard isOpen={leaderboardOpen} onClose={() => setLeaderboardOpen(false)} />
    </div>
  );
};
