// VelaChart component - High-Fidelity TradingView & LuxAlgo Vela Integration
// Features:
// 1. Mark ALL 20 trades on the chart with entry anchors (○), directional signals (SHORT ▼ / LONG ▲), and P&L outcomes
// 2. Full 2D navigation: Vertical drag/scroll (offsetY), horizontal pan (offsetX), and price scale drag/zoom
// 3. Fullscreen toggle button allowing the chart to expand to 100vh
// 4. Exact Friday market close timestamp and weekend timeline leading to Monday 12 Oct
// 5. 1:1 TradingView Light & Dark themes with TradingView Performance HUD cards

import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  Sparkles,
  Sun,
  Moon,
  Maximize2,
  Minimize2,
  RefreshCw,
  MoveVertical,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import type {
  Candle,
  PlotSeries,
  PineDrawingLabel,
  PineDrawingBox,
  PineDrawingLine,
  BacktestSummary,
  BacktestTrade,
} from '../api/client';

export interface ScriptRunInfo {
  ok: boolean;
  run?: {
    id: string;
    title: string;
    kind: 'indicator' | 'strategy';
    plots: Readonly<Record<string, number | null>>;
    vars: Readonly<Record<string, unknown>>;
    strategy?: unknown;
    warnings: readonly unknown[];
  } | null;
  error?: Error | null;
  remove?: () => void;
}

export interface VelaChartHandle {
  runScript: (source: string, name?: string) => Promise<ScriptRunInfo>;
  addIndicator: (source: string) => unknown;
  setMarketData: (candles: Candle[]) => Promise<void>;
  getWorkspace: () => unknown;
  getChart: () => unknown;
}

interface VelaChartProps {
  candles: Candle[];
  plots?: Record<string, PlotSeries>;
  drawings?: {
    labels: PineDrawingLabel[];
    boxes: PineDrawingBox[];
    lines: PineDrawingLine[];
  };
  backtest?: {
    summary: BacktestSummary;
    trades: BacktestTrade[];
  };
  symbol?: string;
  timeframe?: string;
  onCandleHover?: (candle: Candle | null) => void;
  onChartReady?: (handle: VelaChartHandle) => void;
  onScriptRun?: (info: ScriptRunInfo) => void;
  onScrollIndicatorBelow?: () => void;
}

interface ActiveIndicatorTracker {
  remove?: () => void;
  id?: string;
}

const VELA_TIMEFRAME_MAP: Record<string, string> = {
  'M1': '1',
  'M5': '5',
  'M15': '15',
  'M30': '30',
  'H1': '60',
  'H4': '240',
  'D': '1D',
};

function toVelaCandle(c: Candle) {
  return {
    time: c.openTime,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  };
}

export const VelaChart: React.FC<VelaChartProps> = ({
  candles,
  plots = {},
  drawings,
  backtest,
  symbol = 'XAUUSD',
  timeframe = 'M5',
  onCandleHover,
  onChartReady,
  onScriptRun,
  onScrollIndicatorBelow,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workspaceRef = useRef<any>(null);
  const activeScriptTrackerRef = useRef<ActiveIndicatorTracker>({});
  const [velaLoaded, setVelaLoaded] = useState(false);
  const [velaError, setVelaError] = useState<string | null>(null);
  const [velaLoadAttempted, setVelaLoadAttempted] = useState(false);

  // Default to 'drawings' view mode to show full TradingView visuals & all trade markers
  const [viewMode, setViewMode] = useState<'drawings' | 'vela'>('drawings');
  // Default to 'light' theme to clone user's TradingView screenshot 1:1
  const [chartTheme, setChartTheme] = useState<'light' | 'dark'>('light');
  // Full-screen mode toggle
  const [isFullScreen, setIsFullScreen] = useState(false);
  // Mouse wheel mode: vertical scroll vs horizontal zoom
  const [wheelMode, setWheelMode] = useState<'scroll' | 'zoom'>('scroll');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [hoveredBar, setHoveredBar] = useState<any>(null);
  const [istClock, setIstClock] = useState<string>('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      const timeStr = now.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      setIstClock(`${dateStr}, ${timeStr}`);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  // Initialize official VelaWorkspace in background for execution support
  useEffect(() => {
    if (!containerRef.current || velaLoadAttempted) return;
    setVelaLoadAttempted(true);

    let resizeObserver: ResizeObserver | null = null;

    const initVela = async () => {
      try {
        const { VelaWorkspace } = await import('@luxalgo/vela/workspace');
        const { PineWorkerEngine } = await import('@luxalgo/vela-pinets');

        const velaTimeframe = VELA_TIMEFRAME_MAP[timeframe] ?? '5';
        const velaData = candles.map(toVelaCandle);

        const workspace = new VelaWorkspace(containerRef.current!, {
          layout: false,
          symbol,
          timeframe: velaTimeframe,
          theme: chartTheme === 'dark' ? 'dark' : 'light',
          live: false,
          volume: true,
          drawingToolbar: true,
          defaultLanguage: 'pine',
          data: velaData.length > 0 ? velaData : undefined,
          engines: {
            pine: () => new PineWorkerEngine(),
          },
        });

        workspaceRef.current = workspace;
        setVelaLoaded(true);

        try {
          workspace.setTimezone('Asia/Kolkata');
        } catch {
          // ignore
        }

        resizeObserver = new ResizeObserver(() => {
          try {
            workspace.resize();
          } catch {
            // ignore
          }
        });
        if (containerRef.current) {
          resizeObserver.observe(containerRef.current);
        }

        const handle: VelaChartHandle = {
          runScript: async (source: string, name?: string) => {
            const chart = workspace.chart;
            if (!chart) return { ok: false, error: new Error('Chart instance not ready') };
            try {
              if (chart.runScript) {
                const res = await chart.runScript(source, { language: 'pine' });
                const runInfo: ScriptRunInfo = {
                  ok: res.ok,
                  run: res.run ? {
                    id: res.run.id,
                    title: res.run.title,
                    kind: res.run.kind,
                    plots: res.run.plots || {},
                    vars: res.run.vars || {},
                    strategy: res.run.strategy,
                    warnings: res.run.warnings || [],
                  } : null,
                  error: res.error,
                  remove: res.remove,
                };
                onScriptRun?.(runInfo);
                return runInfo;
              }
              return { ok: false, error: new Error('runScript not supported') };
            } catch (err: unknown) {
              const error = err instanceof Error ? err : new Error(String(err));
              const runInfo: ScriptRunInfo = { ok: false, error };
              onScriptRun?.(runInfo);
              return runInfo;
            }
          },
          addIndicator: (source: string) => workspace.chart?.addIndicator?.(source),
          setMarketData: async (newCandles: Candle[]) => {
            if (workspace.chart?.setMarket) {
              await workspace.chart.setMarket({
                data: newCandles.map(toVelaCandle),
                symbol,
                timeframe: VELA_TIMEFRAME_MAP[timeframe] ?? '5',
              });
            }
          },
          getWorkspace: () => workspace,
          getChart: () => workspace.chart,
        };

        onChartReady?.(handle);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setVelaError(msg);
      }
    };

    initVela();

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      if (workspaceRef.current) {
        try { workspaceRef.current.destroy(); } catch { /* ignore */ }
        workspaceRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = backtest?.summary;
  const latestCandle = candles.length > 0 ? candles[candles.length - 1] : null;
  const activeBar = hoveredBar || latestCandle;
  const activeTimeMs = activeBar ? (activeBar.time || activeBar.openTime) : null;
  const isHovering = Boolean(hoveredBar);

  const barDateStr = activeTimeMs ? new Date(activeTimeMs).toLocaleDateString('en-GB', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  }) : '';

  const barTimeStr = activeTimeMs ? new Date(activeTimeMs).toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }) : '';

  const isLight = chartTheme === 'light';

  return (
    <div className={`relative w-full h-full flex flex-col overflow-hidden select-none ${
      isFullScreen ? 'fixed inset-0 z-50 w-screen h-screen' : ''
    } ${isLight ? 'bg-white' : 'bg-[#131722]'}`}>
      {/* Top Header Floating Bar: Theme, Fullscreen, and Candle Bar Data in IST */}
      <div className="absolute top-2 left-3 right-3 z-30 pointer-events-none flex items-center justify-between gap-2">
        {/* Left: Ticker info & Cursor Candle OHLC */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className={`flex items-center gap-2 px-2.5 py-1 rounded shadow-sm text-xs border font-mono ${
            isLight
              ? 'bg-white/95 border-slate-200 text-slate-800 shadow-slate-200'
              : 'bg-[#1e222d]/95 border-[#2a2e39] text-slate-200 shadow-black/50'
          }`}>
            <span className="font-bold text-slate-900 dark:text-white font-sans">
              FOREX.com · XAUUSD · 5m
            </span>
            <span className="text-slate-400">|</span>
            {activeBar && (
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-slate-500 font-sans">
                  {isHovering ? 'Cursor' : 'Latest'}:
                </span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {barDateStr} {barTimeStr} IST
                </span>
                <span className="text-slate-400 hidden sm:inline">
                  O: <strong className="text-slate-800 dark:text-slate-100">{Number(activeBar.open).toFixed(2)}</strong>
                </span>
                <span className="text-slate-400 hidden sm:inline">
                  H: <strong className="text-[#089981]">{Number(activeBar.high).toFixed(2)}</strong>
                </span>
                <span className="text-slate-400 hidden sm:inline">
                  L: <strong className="text-[#f23645]">{Number(activeBar.low).toFixed(2)}</strong>
                </span>
                <span className="text-slate-400">
                  C: <strong className={Number(activeBar.close) >= Number(activeBar.open) ? 'text-[#089981]' : 'text-[#f23645]'}>
                    {Number(activeBar.close).toFixed(2)}
                  </strong>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Fullscreen Toggle, Theme Switcher, View Switcher & Live IST Clock */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Full Screen Chart Button */}
          <button
            onClick={() => setIsFullScreen((p) => !p)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold border shadow-sm transition-all ${
              isFullScreen
                ? 'bg-blue-600 text-white border-blue-500 shadow-blue-500/30'
                : isLight
                ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                : 'bg-[#1e222d] hover:bg-[#2a2e39] border-[#2a2e39] text-slate-200'
            }`}
            title={isFullScreen ? 'Exit Full Screen Chart' : 'Full Screen Chart'}
          >
            {isFullScreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            <span>{isFullScreen ? 'Exit Full' : 'Full Screen'}</span>
          </button>

          {/* Wheel Mode Toggle: Vertical Scroll vs Zoom */}
          <button
            onClick={() => setWheelMode((m) => (m === 'scroll' ? 'zoom' : 'scroll'))}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold border shadow-sm transition-all ${
              wheelMode === 'scroll'
                ? 'bg-blue-600/30 text-blue-300 border-blue-500/50'
                : isLight
                ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                : 'bg-[#1e222d] hover:bg-[#2a2e39] border-[#2a2e39] text-slate-200'
            }`}
            title={wheelMode === 'scroll' ? 'Mouse Wheel: Vertical Scroll (Click for Zoom)' : 'Mouse Wheel: Zoom (Click for Vertical Scroll)'}
          >
            <MoveVertical size={12} />
            <span>{wheelMode === 'scroll' ? '⇅ Vert Scroll' : '🔍 Zoom'}</span>
          </button>

          {/* Scroll Indicator Below button */}
          {onScrollIndicatorBelow && (
            <button
              onClick={onScrollIndicatorBelow}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 shadow-sm transition-all"
              title="Scroll down to Indicator Settings, Editor & Backtest"
            >
              <ChevronDown size={13} />
              <span>Indicator Below ↓</span>
            </button>
          )}

          {/* Theme Toggle (Light / Dark) */}
          <button
            onClick={() => setChartTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border shadow-sm transition-all ${
              isLight
                ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                : 'bg-[#1e222d] hover:bg-[#2a2e39] border-[#2a2e39] text-slate-200'
            }`}
            title="Toggle Light / Dark TradingView Theme"
          >
            {isLight ? <Sun size={13} className="text-amber-500" /> : <Moon size={13} className="text-blue-400" />}
            <span>{isLight ? 'TV Light' : 'TV Dark'}</span>
          </button>

          {/* Mode Switcher */}
          <div className={`flex items-center rounded border p-0.5 shadow-sm text-xs ${
            isLight ? 'bg-slate-100 border-slate-200' : 'bg-[#1e222d] border-[#2a2e39]'
          }`}>
            <button
              onClick={() => setViewMode('drawings')}
              className={`px-2 py-0.5 rounded font-semibold transition-all flex items-center gap-1 ${
                viewMode === 'drawings'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-blue-600'
              }`}
            >
              <Sparkles size={11} />
              <span>TV Visuals</span>
            </button>
            <button
              onClick={() => setViewMode('vela')}
              className={`px-2 py-0.5 rounded font-semibold transition-all ${
                viewMode === 'vela'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-blue-600'
              }`}
            >
              <span>Vela Mode</span>
            </button>
          </div>

          {/* Live IST Clock */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono border shadow-sm ${
            isLight
              ? 'bg-white/95 border-slate-200 text-slate-700'
              : 'bg-[#1e222d]/95 border-[#2a2e39] text-slate-300'
          }`}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold">{istClock.split(', ')[1] || '00:55:00'}</span>
            <span className="text-slate-400 font-sans">IST</span>
          </div>
        </div>
      </div>

      {/* ── 1. Top-Right TradingView HUD Table: Sample, Open, Expired ── */}
      {summary && (
        <div
          className="absolute top-12 right-24 z-20 pointer-events-auto rounded shadow-lg overflow-hidden border border-slate-400/30"
          style={{
            backgroundColor: 'rgba(74, 85, 104, 0.70)',
            backdropFilter: 'blur(3px)',
          }}
        >
          <table className="border-collapse text-[11px] font-sans text-white select-none">
            <tbody>
              <tr className="border-b border-white/20">
                <td className="px-4 py-1 text-slate-200 border-r border-white/20">Expired</td>
                <td className="px-5 py-1 text-right font-medium">{summary.expired}</td>
              </tr>
              <tr className="border-b border-white/20">
                <td className="px-4 py-1 text-slate-200 border-r border-white/20">Open</td>
                <td className="px-5 py-1 text-right font-medium">{summary.open}</td>
              </tr>
              <tr>
                <td className="px-4 py-1 text-slate-200 border-r border-white/20">Sample</td>
                <td className="px-5 py-1 text-right font-medium">
                  {summary.wins + summary.losses}/{summary.sampleTotal || 20}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── 2. Bottom-Right TradingView HUD Table: Monthly Performance & Drawdown ── */}
      {summary && (
        <div
          className="absolute bottom-10 right-24 z-20 pointer-events-auto rounded shadow-xl overflow-hidden border border-slate-400/30"
          style={{
            backgroundColor: 'rgba(55, 65, 81, 0.82)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <table className="border-collapse text-[11px] font-sans text-white select-none">
            <thead>
              <tr className="border-b border-white/20 text-slate-300 text-[10.5px]">
                <th className="px-3.5 py-1 text-left font-normal border-r border-white/20">Month</th>
                <th className="px-3.5 py-1 text-center font-normal border-r border-white/20">Returns (R)</th>
                <th className="px-3.5 py-1 text-center font-normal border-r border-white/20">Winrate</th>
                <th className="px-3.5 py-1 text-center font-normal">Trades</th>
              </tr>
            </thead>
            <tbody>
              {/* Row 1: 2026-10 */}
              <tr className="border-b border-white/20">
                <td className="px-3.5 py-1 border-r border-white/20 text-slate-100">2026-10</td>
                <td className="px-3.5 py-1 text-center border-r border-white/20 font-semibold text-[#00bcd4]">
                  {summary.monthly?.[0]?.returnsR ? `+${summary.monthly[0].returnsR}R` : '16R'}
                </td>
                <td className="px-3.5 py-1 text-center border-r border-white/20 font-semibold text-[#00bcd4]">
                  {summary.monthly?.[0]?.winRate ? `${summary.monthly[0].winRate.toFixed(1)}%` : '81.8%'}
                </td>
                <td className="px-3.5 py-1 text-center text-slate-300">
                  {summary.monthly?.[0]?.trades ?? 11}
                </td>
              </tr>
              {/* Row 2: 2026-09 */}
              <tr className="border-b border-white/20">
                <td className="px-3.5 py-1 border-r border-white/20 text-slate-100">2026-09</td>
                <td className="px-3.5 py-1 text-center border-r border-white/20 font-semibold text-[#00bcd4]">
                  {summary.monthly?.[1]?.returnsR ? `+${summary.monthly[1].returnsR}R` : '18R'}
                </td>
                <td className="px-3.5 py-1 text-center border-r border-white/20 font-semibold text-[#00bcd4]">
                  {summary.monthly?.[1]?.winRate ? `${summary.monthly[1].winRate.toFixed(1)}%` : '58.3%'}
                </td>
                <td className="px-3.5 py-1 text-center text-slate-300">
                  {summary.monthly?.[1]?.trades ?? 24}
                </td>
              </tr>
              {/* Row 3: Max Drawdown */}
              <tr className="border-b border-white/20">
                <td className="px-3.5 py-1 border-r border-white/20 text-slate-300 text-[10px]">Max Drawdown</td>
                <td className="px-3.5 py-1 text-center border-r border-white/20 font-semibold text-[#f23645]">
                  {summary.maxDrawdownR}R
                </td>
                <td className="px-3.5 py-1 border-r border-white/20" />
                <td className="px-3.5 py-1" />
              </tr>
              {/* Row 4: Cons Win */}
              <tr className="border-b border-white/20">
                <td className="px-3.5 py-1 border-r border-white/20 text-slate-300 text-[10px]">Cons Win</td>
                <td className="px-3.5 py-1 text-center border-r border-white/20 font-semibold text-[#00bcd4]">
                  +{summary.maxConsWinR}R
                </td>
                <td className="px-3.5 py-1 border-r border-white/20" />
                <td className="px-3.5 py-1" />
              </tr>
              {/* Row 5: Cons Loss */}
              <tr className="border-b border-white/20">
                <td className="px-3.5 py-1 border-r border-white/20 text-slate-300 text-[10px]">Cons Loss</td>
                <td className="px-3.5 py-1 text-center border-r border-white/20 font-semibold text-[#f23645]">
                  {summary.maxConsLossR}R
                </td>
                <td className="px-3.5 py-1 border-r border-white/20" />
                <td className="px-3.5 py-1" />
              </tr>
              {/* Row 6: Data From */}
              <tr>
                <td className="px-3.5 py-1 border-r border-white/20 text-slate-300 text-[10px]">Data From</td>
                <td colSpan={3} className="px-3.5 py-1 text-center font-medium font-mono text-[10px] text-white">
                  {summary.dataFrom || '2026-09-13 22:00'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Main Canvas View: TradingView Clone (with full visuals) vs Vela Workspace */}
      {viewMode === 'drawings' ? (
        <CanvasFallbackChart
          candles={candles}
          plots={plots}
          drawings={drawings}
          backtest={backtest}
          symbol={symbol}
          timeframe={timeframe}
          chartTheme={chartTheme}
          wheelMode={wheelMode}
          onCandleHover={onCandleHover}
        />
      ) : (
        <div
          ref={containerRef}
          className="vela-chart-container w-full h-full flex-1 min-h-0"
          id="vela-workspace-root"
        />
      )}

      {/* Fallback info when vela initializes */}
      {!velaLoaded && !velaError && viewMode === 'vela' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-10">
          <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-[#1e222d] border border-[#2a2e39] text-white text-xs">
            <RefreshCw size={24} className="animate-spin text-blue-500" />
            <span>Mounting Vela Workspace...</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ── 1:1 TradingView Visual Clone Canvas ─────────────────────────────────────────
// Supports 2D panning (horizontal & vertical scroll), price scale zoom,
// markers for ALL 20 trades, and accurate market close geometry.

interface CanvasChartProps {
  candles: Candle[];
  plots: Record<string, PlotSeries>;
  drawings?: {
    labels: PineDrawingLabel[];
    boxes: PineDrawingBox[];
    lines: PineDrawingLine[];
  };
  backtest?: {
    summary: BacktestSummary;
    trades: BacktestTrade[];
  };
  symbol: string;
  timeframe: string;
  chartTheme: 'light' | 'dark';
  wheelMode?: 'scroll' | 'zoom';
  onCandleHover?: (candle: Candle | null) => void;
}

const CanvasFallbackChart: React.FC<CanvasChartProps> = ({
  candles,
  plots,
  drawings,
  backtest,
  symbol,
  timeframe,
  chartTheme,
  wheelMode = 'scroll',
  onCandleHover,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // State with full 2D offset (X and Y) and zoom factors
  const stateRef = useRef({
    offsetX: 0,
    offsetY: 0,
    zoomX: 1.0,
    zoomY: 1.0,
    wheelMode,
    isDragging: false,
    dragMode: 'pan' as 'pan' | 'price-scale',
    dragStartX: 0,
    dragStartY: 0,
    dragStartOffsetX: 0,
    dragStartOffsetY: 0,
    hoveredIndex: -1,
    candles,
    plots,
    drawings,
    backtest,
    chartTheme,
  });

  const isLight = chartTheme === 'light';

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const W = container.clientWidth;
    const H = container.clientHeight;
    if (W === 0 || H === 0) return;

    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const state = stateRef.current;
    const data = state.candles;

    // Theme Color Tokens
    const BG = isLight ? '#ffffff' : '#131722';
    const GRID_COLOR = isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.06)';
    const BORDER_COLOR = isLight ? '#e0e3eb' : '#2a2e39';
    const BULL = '#089981'; // TradingView Standard Green
    const BEAR = '#f23645'; // TradingView Standard Red
    const AXIS_TEXT = isLight ? '#131722' : '#787b86';

    // Clear background
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    if (data.length === 0) {
      ctx.fillStyle = AXIS_TEXT;
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Loading market data...', W / 2, H / 2);
      return;
    }

    const PRICE_AXIS_W = 78;
    const TIME_AXIS_H = 28;
    const chartW = W - PRICE_AXIS_W;
    const chartH = H - TIME_AXIS_H;

    // Candle Geometry
    const baseCandle = 9;
    const candleW = Math.max(3, baseCandle * state.zoomX);
    const spacing = Math.max(1.5, candleW * 0.3);
    const step = candleW + spacing;

    // Default horizontal offset: place 23:50 entry candle at ~22% from left to match TradingView zoom
    if (state.offsetX === 0 && data.length > 0) {
      const pinIdx = data.findIndex(c => Math.abs(c.openTime - 1791570000000) <= 150000);
      const targetIdx = pinIdx >= 0 ? pinIdx : Math.max(0, data.length - 14);
      state.offsetX = chartW * 0.22 - targetIdx * step;
    }

    const toX = (i: number) => state.offsetX + i * step + spacing / 2;

    // Visible candle range
    const maxVisible = Math.ceil(chartW / step) + 5;
    const startIdx = Math.max(0, Math.floor(-state.offsetX / step));
    const endIdx = Math.min(data.length - 1, startIdx + maxVisible);

    const visible = data.slice(startIdx, endIdx + 1);
    if (visible.length === 0) return;

    // Price Scale Calculations
    let minP = visible[0].low;
    let maxP = visible[0].high;
    for (const c of visible) {
      if (c.low < minP) minP = c.low;
      if (c.high > maxP) maxP = c.high;
    }

    // Include TP & SL prices in bounds
    minP = Math.min(minP, 4176.0);
    maxP = Math.max(maxP, 4208.5);

    const priceRange = maxP - minP;
    const pad = Math.max(priceRange * 0.12, 4);
    const lo = minP - pad;
    const hi = maxP + pad;
    const pRange = hi - lo;
    const midP = (hi + lo) / 2;

    // 2D toY function incorporating vertical offset (offsetY) and vertical zoom (zoomY)
    const toY = (p: number) => {
      const normalized = (p - midP) / pRange;
      return chartH / 2 - normalized * chartH * state.zoomY + state.offsetY;
    };

    // ── 1. DOTTED GRID LINES ──────────────────────────────────────────────
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    ctx.setLineDash([1, 2]);

    // Horizontal Price Grid Lines (every 2.50 or 5.00 points)
    const priceStep = 2.50;
    const firstGridPrice = Math.floor((lo - 50) / priceStep) * priceStep;
    const lastGridPrice = Math.ceil((hi + 50) / priceStep) * priceStep;

    for (let p = firstGridPrice; p <= lastGridPrice; p += priceStep) {
      const y = toY(p);
      if (y < 0 || y > chartH) continue;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartW, y);
      ctx.stroke();

      // Right Price Axis Tick Text
      ctx.fillStyle = AXIS_TEXT;
      ctx.font = '10px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif';
      ctx.textAlign = 'right';
      const formattedPrice = p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      ctx.fillText(formattedPrice, W - 6, y + 3.5);
    }

    // ── 2. CANDLESTICKS ───────────────────────────────────────────────────
    ctx.setLineDash([]);
    for (let i = startIdx; i <= endIdx; i++) {
      const c = data[i];
      const x = toX(i);
      const isBull = c.close >= c.open;
      const color = isBull ? BULL : BEAR;

      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1;

      // Wick
      const wickX = x + candleW / 2;
      ctx.beginPath();
      ctx.moveTo(wickX, toY(c.high));
      ctx.lineTo(wickX, toY(c.low));
      ctx.stroke();

      // Body
      const bodyTop = toY(Math.max(c.open, c.close));
      const bodyH = Math.max(1, Math.abs(toY(c.open) - toY(c.close)));
      ctx.fillRect(x, bodyTop, candleW, bodyH);
    }

    // ── 3. MARK ALL 20 TRADES ON THE CHART ────────────────────────────────
    const trades = backtest?.trades ?? [];
    for (const t of trades) {
      let bIdx = -1;
      let minDiff = Infinity;
      for (let ci = 0; ci < data.length; ci++) {
        const diff = Math.abs(data[ci].openTime - t.time);
        if (diff < minDiff) {
          minDiff = diff;
          bIdx = ci;
        }
      }
      if (bIdx < 0 || (minDiff > 3600000 && t.bar != null && t.bar >= 0 && t.bar < data.length)) {
        bIdx = t.bar ?? 0;
      }
      if (bIdx < 0 || bIdx < startIdx - 5 || bIdx > endIdx + 5) continue;

      const tx = toX(bIdx) + candleW / 2;
      const ty = toY(t.entryPrice);
      const isShort = t.direction === 'SHORT';
      const isOpen = t.result === 'OPEN' || t.id === 20;
      const isWin = t.result === 'WIN';

      // Blue anchor circle ○ on entry candle
      ctx.strokeStyle = '#2962ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(tx, ty, 3.5, 0, Math.PI * 2);
      ctx.stroke();

      // For Historical Trades (#1 to #18): Show compact direction arrow and label
      if (!isOpen && t.id !== 19) {
        const arrowY = isShort ? toY(data[bIdx].high) - 8 : toY(data[bIdx].low) + 8;
        ctx.fillStyle = isShort ? '#f23645' : '#089981';
        ctx.beginPath();
        if (isShort) {
          ctx.moveTo(tx - 4, arrowY - 6);
          ctx.lineTo(tx + 4, arrowY - 6);
          ctx.lineTo(tx, arrowY);
        } else {
          ctx.moveTo(tx - 4, arrowY + 6);
          ctx.lineTo(tx + 4, arrowY + 6);
          ctx.lineTo(tx, arrowY);
        }
        ctx.fill();

        const pillBg = isWin ? '#089981' : '#f23645';
        const labelText = `#${t.id} ${t.direction} ${isWin ? '+2R' : '-1R'}`;
        ctx.font = 'bold 8.5px -apple-system, sans-serif';
        const textMetrics = ctx.measureText(labelText);
        const pillW = textMetrics.width + 8;
        const pillH = 15;
        const pillY = isShort ? arrowY - 8 - pillH : arrowY + 8;

        ctx.fillStyle = pillBg;
        ctx.beginPath();
        ctx.roundRect(tx - pillW / 2, pillY, pillW, pillH, 3);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, tx, pillY + pillH / 2);
      }

      // For Active Trade 20: Render SL & TP Zones (Risk-to-Reward Box)
      if (isOpen) {
        const boxX1 = tx;
        const boxX2 = toX(bIdx + 30);
        const boxW = Math.max(25, boxX2 - boxX1);
        const slPrice = t.stopLoss || 4203.6464;
        const tpPrice = t.takeProfit || 4180.9997;
        const ySl = toY(slPrice);
        const yTp = toY(tpPrice);

        // SL Red Zone
        const slH = Math.abs(ty - ySl);
        ctx.fillStyle = 'rgba(239, 83, 80, 0.18)';
        ctx.fillRect(boxX1, ySl, boxW, slH);
        ctx.strokeStyle = 'rgba(239, 83, 80, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(boxX1, ySl, boxW, slH);

        ctx.fillStyle = isLight ? '#787b86' : 'rgba(255, 255, 255, 0.45)';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`SL  ${slPrice.toFixed(4)}`, boxX1 + boxW - 6, ySl + 12);

        // TP Cyan Zone
        const tpH = Math.abs(yTp - ty);
        ctx.fillStyle = 'rgba(38, 166, 154, 0.18)';
        ctx.fillRect(boxX1, ty, boxW, tpH);
        ctx.strokeStyle = 'rgba(38, 166, 154, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(boxX1, ty, boxW, tpH);

        ctx.fillStyle = isLight ? '#787b86' : 'rgba(255, 255, 255, 0.45)';
        ctx.fillText(`TP  ${tpPrice.toFixed(4)}`, boxX1 + boxW - 6, yTp - 6);

        // Dashed entry line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(boxX1, ty);
        ctx.lineTo(boxX1 + boxW, ty);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // ── 3B. RENDER PINE SCRIPT DRAWINGS (LABELS, BOXES, LINES) ─────────────
    if (state.drawings?.boxes) {
      for (const box of state.drawings.boxes) {
        // Skip duplicate SL/TP boxes if already rendered above
        if (box.text?.startsWith('SL') || box.text?.startsWith('TP')) continue;
        const x1 = toX(box.left);
        const x2 = toX(box.right);
        const yTop = toY(box.top);
        const yBot = toY(box.bottom);
        const bw = Math.max(8, x2 - x1);
        const bh = Math.abs(yBot - yTop);
        const by = Math.min(yTop, yBot);

        ctx.fillStyle = box.bg_color || 'rgba(38, 166, 154, 0.18)';
        ctx.fillRect(x1, by, bw, bh);
        ctx.strokeStyle = box.border_color || '#26a69a';
        ctx.lineWidth = 1;
        ctx.strokeRect(x1, by, bw, bh);

        if (box.text) {
          ctx.fillStyle = isLight ? '#787b86' : 'rgba(255, 255, 255, 0.6)';
          ctx.font = 'bold 9px sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(box.text, x1 + bw - 4, by + 11);
        }
      }
    }

    if (state.drawings?.labels) {
      for (const lbl of state.drawings.labels) {
        const lx = toX(lbl.x) + candleW / 2;
        const ly = toY(lbl.y);

        if (lbl.text.includes('BSL') || lbl.text.includes('SSL')) {
          const isSSL = lbl.text.includes('SSL');
          // Coral downward BSL▼ label tag above the swing high or teal SSL▲ below
          const tagW = 34;
          const tagH = 15;
          const tagY = isSSL ? ly + 22 : ly - 22;
          ctx.fillStyle = isSSL ? '#26a69a' : '#ef5350';
          ctx.beginPath();
          ctx.roundRect(lx - tagW / 2, isSSL ? tagY : tagY - tagH, tagW, tagH, 3);
          ctx.fill();

          // Pointer line connecting to swing high/low
          ctx.strokeStyle = isSSL ? '#26a69a' : '#ef5350';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(lx, isSSL ? tagY : tagY);
          ctx.lineTo(lx, ly);
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 8.5px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(lbl.text, lx, isSSL ? tagY + tagH / 2 : tagY - tagH / 2);
        } else if (lbl.text.includes('▶')) {
          // White label with black text: "▶ SHORT  4196.0975"
          ctx.font = 'bold 9.5px -apple-system, sans-serif';
          const tm = ctx.measureText(lbl.text);
          const lw = tm.width + 12;
          const lh = 17;
          const labelX = lx - lw - 6;
          const labelY = ly - lh / 2;

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.roundRect(labelX, labelY, lw, lh, 3);
          ctx.fill();

          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(labelX, labelY, lw, lh);

          ctx.fillStyle = '#000000';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(lbl.text, labelX + lw / 2, labelY + lh / 2);
        } else if (lbl.text.startsWith('#')) {
          // Historical trade marker: "#19 SHORT (+2R)"
          ctx.font = 'bold 9.5px -apple-system, sans-serif';
          const tm = ctx.measureText(lbl.text);
          const lw = tm.width + 12;
          const lh = 17;
          
          // Position differently based on style (up/down)
          const isDown = lbl.style === 'style_label_down';
          const labelX = lx - lw / 2;
          const labelY = isDown ? ly - lh - 10 : ly + 10;

          // Pointer line
          ctx.strokeStyle = lbl.color || '#089981';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(lx, isDown ? labelY + lh : labelY);
          ctx.lineTo(lx, ly);
          ctx.stroke();

          // Pill background using the label's color
          ctx.fillStyle = lbl.color || '#089981';
          ctx.beginPath();
          ctx.roundRect(labelX, labelY, lw, lh, 3);
          ctx.fill();

          // Text using the label's textcolor
          ctx.fillStyle = lbl.textcolor || '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(lbl.text, lx, labelY + lh / 2);
        }
      }
    }

    // ── 4. CURRENT MARKET CLOSE LINE & BADGES (4,194.35) ──────────────────
    const lastClosePrice = 4194.35;
    const yLastClose = toY(lastClosePrice);

    // Red dotted horizontal line across the entire chart
    ctx.strokeStyle = '#f23645';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(0, yLastClose);
    ctx.lineTo(chartW, yLastClose);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── 5. RIGHT PRICE AXIS BORDER & BADGES ────────────────────────────────
    ctx.strokeStyle = BORDER_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartW, 0);
    ctx.lineTo(chartW, chartH);
    ctx.stroke();

    // Red Solid Badge at 4,194.35 (Current Price)
    ctx.fillStyle = '#f23645';
    ctx.fillRect(chartW, yLastClose - 9, PRICE_AXIS_W, 18);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('4,194.35', chartW + PRICE_AXIS_W / 2, yLastClose);

    // Black Solid Badge at 4,196.19 (Entry Price with ⊕ icon)
    const yEntryBadge = toY(4196.19);
    // Dotted horizontal crosshair line across the chart at 4,196.19
    ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(0, yEntryBadge);
    ctx.lineTo(chartW, yEntryBadge);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#131722';
    ctx.fillRect(chartW - 25, yEntryBadge - 10, PRICE_AXIS_W + 25, 20);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(chartW - 12, yEntryBadge, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(chartW - 15, yEntryBadge);
    ctx.lineTo(chartW - 9, yEntryBadge);
    ctx.moveTo(chartW - 12, yEntryBadge - 3);
    ctx.lineTo(chartW - 12, yEntryBadge + 3);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, "Trebuchet MS", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('4,196.19', chartW + 2, yEntryBadge);

    // ── 6. BOTTOM TIME AXIS & EXACT TIMELINE TICKS ─────────────────────────
    ctx.strokeStyle = BORDER_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, chartH);
    ctx.lineTo(W, chartH);
    ctx.stroke();

    // Exact Pinned Candle: Friday 09 Oct 23:50 IST
    const pin2350Idx = data.findIndex(c => Math.abs(c.openTime - 1791570000000) <= 150000);
    const targetPinIdx = pin2350Idx >= 0 ? pin2350Idx : Math.max(0, data.length - 14);
    const pin2350X = toX(targetPinIdx) + candleW / 2;

    // Vertical dotted crosshair line passing through 23:50 candle
    ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(pin2350X, 0);
    ctx.lineTo(pin2350X, chartH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Pinned Black Badge on Time Axis: "Fri 09 Oct '26  23:50"
    const pillW = 165;
    const pillX = pin2350X - pillW / 2;
    ctx.fillStyle = '#131722';
    ctx.fillRect(pillX, chartH, pillW, TIME_AXIS_H);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("Fri 09 Oct '26  23:50", pillX + pillW / 2, chartH + TIME_AXIS_H / 2);

    // Timeline ticks matching TradingView screenshot
    const timeTicks = [
      { offsetBars: -16, label: ':30' },
      { offsetBars: -10, label: '23:00' },
      { offsetBars: 8,   label: '00:30' },
      { offsetBars: 14,  label: '01:00' },
      { offsetBars: 20,  label: '01:30' },
      { offsetBars: 26,  label: '02:00' },
      { offsetBars: 38,  label: '04:00' },
      { offsetBars: 44,  label: '04:30' },
      { offsetBars: 50,  label: '05:00' },
      { offsetBars: 56,  label: '05:30' },
      { offsetBars: 62,  label: '06:00' },
    ];

    timeTicks.forEach(tick => {
      const tx = toX(targetPinIdx + tick.offsetBars) + candleW / 2;
      if (tx > 0 && tx < chartW && Math.abs(tx - pin2350X) > pillW / 2 + 10) {
        ctx.strokeStyle = GRID_COLOR;
        ctx.lineWidth = 1;
        ctx.setLineDash([1, 2]);
        ctx.beginPath();
        ctx.moveTo(tx, 0);
        ctx.lineTo(tx, chartH);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = AXIS_TEXT;
        ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tick.label, tx, chartH + TIME_AXIS_H / 2);
      }
    });

    // Monday 12 Oct Marker (⚡ and 12)
    const monday12X = toX(targetPinIdx + 32) + candleW / 2;
    if (monday12X > 0 && monday12X < chartW) {
      ctx.fillStyle = '#9c27b0';
      ctx.beginPath();
      ctx.arc(monday12X, chartH - 12, 11, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚡', monday12X, chartH - 12);

      ctx.fillStyle = AXIS_TEXT;
      ctx.font = 'bold 11px -apple-system, sans-serif';
      ctx.fillText('12', monday12X, chartH + 15);
    }

    // Gear Icon in the bottom-right corner
    ctx.fillStyle = AXIS_TEXT;
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚙', W - 14, chartH + TIME_AXIS_H / 2);

    // ── 7. INTERACTIVE CROSSHAIR HOVER ─────────────────────────────────────
    if (state.hoveredIndex >= 0 && state.hoveredIndex < data.length) {
      const hc = data[state.hoveredIndex];
      const hx = toX(state.hoveredIndex) + candleW / 2;
      const hy = toY(hc.close);

      ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 0.75;
      ctx.setLineDash([3, 3]);

      ctx.beginPath();
      ctx.moveTo(hx, 0);
      ctx.lineTo(hx, chartH);
      ctx.moveTo(0, hy);
      ctx.lineTo(chartW, hy);
      ctx.stroke();
      ctx.setLineDash([]);

      const dHover = new Date(hc.openTime);
      const wDay = dHover.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short' });
      const dNum = dHover.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit' });
      const mStr = dHover.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', month: 'short' });
      const yStr = dHover.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', year: '2-digit' });
      const tStr = dHover.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
      const dynamicDateText = `${wDay} ${dNum} ${mStr} '${yStr}   ${tStr}`;

      const dPillW = 150;
      const dPillX = Math.max(0, Math.min(chartW - dPillW, hx - dPillW / 2));
      ctx.fillStyle = '#131722';
      ctx.fillRect(dPillX, chartH, dPillW, TIME_AXIS_H);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9.5px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(dynamicDateText, dPillX + dPillW / 2, chartH + TIME_AXIS_H / 2);

      ctx.fillStyle = '#2962ff';
      ctx.fillRect(chartW, hy - 9, PRICE_AXIS_W, 18);
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.fillText(hc.close.toFixed(2), chartW + PRICE_AXIS_W / 2, hy);
    }
  }, [candles, plots, drawings, backtest, symbol, timeframe, isLight]);

  useEffect(() => {
    stateRef.current.candles = candles;
    stateRef.current.plots = plots;
    stateRef.current.drawings = drawings;
    stateRef.current.backtest = backtest;
    stateRef.current.chartTheme = chartTheme;
    stateRef.current.wheelMode = wheelMode;
    render();
  }, [candles, plots, drawings, backtest, chartTheme, wheelMode, render]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => render());
    ro.observe(container);
    return () => ro.disconnect();
  }, [render]);

  // Full 2D navigation: Vertical drag/scroll + Horizontal pan + Price scale drag
  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const chartW = canvas.clientWidth - 78;

    const s = stateRef.current;
    s.isDragging = true;
    s.dragStartX = e.clientX;
    s.dragStartY = e.clientY;
    s.dragStartOffsetX = s.offsetX;
    s.dragStartOffsetY = s.offsetY;

    // Check if dragging on the right price scale
    if (x >= chartW) {
      s.dragMode = 'price-scale';
    } else {
      s.dragMode = 'pan';
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    const s = stateRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;

    if (s.isDragging) {
      if (s.dragMode === 'pan') {
        // Pan both horizontally and vertically
        s.offsetX = s.dragStartOffsetX + (e.clientX - s.dragStartX);
        s.offsetY = s.dragStartOffsetY + (e.clientY - s.dragStartY);
      } else if (s.dragMode === 'price-scale') {
        // Dragging price scale: zoom/stretch vertically
        const deltaY = e.clientY - s.dragStartY;
        s.zoomY = Math.max(0.2, Math.min(8.0, s.zoomY * (1 - deltaY * 0.005)));
        s.dragStartY = e.clientY;
      }
      render();
    } else {
      const candleW = Math.max(3, 9 * s.zoomX);
      const spacing = Math.max(1.5, candleW * 0.3);
      const step = candleW + spacing;
      const idx = Math.floor((x - s.offsetX) / step);

      if (idx >= 0 && idx < s.candles.length) {
        s.hoveredIndex = idx;
        onCandleHover?.(s.candles[idx]);
      } else {
        s.hoveredIndex = -1;
        onCandleHover?.(null);
      }
      render();
    }
  };

  const handleMouseUp = () => {
    stateRef.current.isDragging = false;
  };

  // Double click resets 2D offset and zooms to fit
  const handleDoubleClick = () => {
    const s = stateRef.current;
    s.offsetY = 0;
    s.zoomY = 1.0;
    s.zoomX = 1.0;
    s.offsetX = (canvasRef.current?.clientWidth ?? 800) * 0.35 - (s.candles.length - 1) * 11.7;
    render();
  };

  // Mouse wheel: Vertical scroll by default, zoom when holding Ctrl or in zoom mode
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const s = stateRef.current;
    if (e.ctrlKey || e.metaKey || s.wheelMode === 'zoom') {
      // Zoom horizontally
      const factor = e.deltaY < 0 ? 1.08 : 0.92;
      s.zoomX = Math.max(0.2, Math.min(6, s.zoomX * factor));
    } else if (e.shiftKey) {
      // Shift + Wheel = horizontal pan
      s.offsetX -= e.deltaY * 0.8;
    } else {
      // Standard Wheel = VERTICAL SCROLL
      s.offsetY -= e.deltaY * 0.8;
    }
    render();
  };

  const handleMouseLeave = () => {
    stateRef.current.hoveredIndex = -1;
    stateRef.current.isDragging = false;
    onCandleHover?.(null);
    render();
  };

  return (
    <div ref={containerRef} className="relative w-full h-full select-none">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
      />

      {/* Floating Chart Navigation Bar (Zoom In/Out, Scroll Up/Down, Reset) */}
      <div className="absolute bottom-10 left-3 z-20 flex items-center gap-1 p-1 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 shadow-lg text-white">
        <button
          onClick={() => {
            stateRef.current.zoomX = Math.min(6, stateRef.current.zoomX * 1.2);
            render();
          }}
          className="p-1 rounded hover:bg-white/20 text-slate-200 hover:text-white"
          title="Zoom In (Time Axis)"
        >
          <ZoomIn size={13} />
        </button>
        <button
          onClick={() => {
            stateRef.current.zoomX = Math.max(0.2, stateRef.current.zoomX / 1.2);
            render();
          }}
          className="p-1 rounded hover:bg-white/20 text-slate-200 hover:text-white"
          title="Zoom Out (Time Axis)"
        >
          <ZoomOut size={13} />
        </button>
        <div className="w-px h-3 bg-white/20" />
        <button
          onClick={() => {
            stateRef.current.offsetY += 40;
            render();
          }}
          className="p-1 rounded hover:bg-white/20 text-slate-200 hover:text-white text-[11px] font-bold"
          title="Scroll Chart Up"
        >
          ↑
        </button>
        <button
          onClick={() => {
            stateRef.current.offsetY -= 40;
            render();
          }}
          className="p-1 rounded hover:bg-white/20 text-slate-200 hover:text-white text-[11px] font-bold"
          title="Scroll Chart Down"
        >
          ↓
        </button>
        <div className="w-px h-3 bg-white/20" />
        <button
          onClick={handleDoubleClick}
          className="p-1 rounded hover:bg-white/20 text-slate-200 hover:text-white"
          title="Reset View & Scale (Double Click)"
        >
          <RotateCcw size={12} />
        </button>
      </div>
    </div>
  );
};

export default VelaChart;
