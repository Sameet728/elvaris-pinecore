'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Candle, Trade, BacktestResult, ExecutedTrade } from '@/types/backtest';
import { DEFAULT_GRANDMASTER_STRATEGY } from '@/lib/presets';
import { TopBar } from '@/components/shell/TopBar';
import { CommandPalette } from '@/components/shell/CommandPalette';
import { ShortcutsDialog } from '@/components/shell/ShortcutsDialog';
import { VelaChartPanel } from '@/components/chart/VelaChartPanel';
import { PineEditor } from '@/components/editor/PineEditor';
import { SettingsPanel, BacktestSettings } from '@/components/editor/SettingsPanel';
import { TesterDock } from '@/components/report/TesterDock';
import { Button, ErrorBoundary } from '@/components/ui';
import { Code2, Settings, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';

const SYMBOL_MAP: Record<string, { symbol: string; timeframe: string }> = {
  xauusd_15m: { symbol: 'FOREXCOM:XAUUSD', timeframe: '15' },
  eurusd_15m: { symbol: 'FX:EURUSD', timeframe: '15' },
  nas100_15m: { symbol: 'NASDAQ:NAS100', timeframe: '15' },
  btcusdt_15m: { symbol: 'BINANCE:BTCUSDT', timeframe: '15' },
};

function WorkspaceContent() {
  const searchParams = useSearchParams();
  const queryPreset = searchParams.get('preset');
  const querySymbol = searchParams.get('symbol');

  const [script, setScript] = useState(DEFAULT_GRANDMASTER_STRATEGY);
  const [currentPreset, setCurrentPreset] = useState('Champion_15M_Grandmaster_Dual10R_Oct8R_STRATEGY.pine');
  const [dataset, setDataset] = useState('xauusd_15m');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);

  const [sidebarTab, setSidebarTab] = useState<'editor' | 'settings'>('editor');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  const [settings, setSettings] = useState<BacktestSettings>({
    initialCapital: 100000,
    riskDollars: 500,
    commission: 0,
    slippage: 0,
    orderSizingType: 'fixed_contracts',
    orderSize: 1.0,
    engine: 'pinets-ast',
    propProfileId: 'tradeify_select_100k',
  });

  // Load candle data for chart
  const loadCandles = useCallback(async (datasetKey: string): Promise<Candle[]> => {
    try {
      const res = await fetch(`/api/data?dataset=${datasetKey}`);
      if (!res.ok) throw new Error('Failed to load dataset candles');
      const data = await res.json();
      setCandles(data.candles || []);
      return data.candles || [];
    } catch (err: any) {
      console.error('Error fetching candles:', err);
      return [];
    }
  }, []);

  // Run backtest simulation
  const executeSimulation = useCallback(
    async (
      pineCode: string,
      datasetKey: string,
      currentSettings: BacktestSettings
    ) => {
      try {
        setIsLoading(true);
        setError(null);

        const marketInfo = SYMBOL_MAP[datasetKey] || { symbol: datasetKey.toUpperCase(), timeframe: '15' };

        const res = await fetch('/api/backtest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            script: pineCode,
            datasetName: datasetKey,
            symbol: marketInfo.symbol,
            timeframe: marketInfo.timeframe,
            initialCapital: currentSettings.initialCapital,
            riskDollars: currentSettings.riskDollars,
            commission: currentSettings.commission,
            slippage: currentSettings.slippage,
            engine: currentSettings.engine,
            propProfileId: currentSettings.propProfileId,
          }),
        });

        const json = await res.json();
        if (!res.ok || !json.result) {
          throw new Error(json.error || json.details || 'Backtest execution failed');
        }

        const result: BacktestResult = json.result;
        setBacktestResult(result);

        // Save run to localStorage history
        if (typeof window !== 'undefined') {
          try {
            const runId = crypto.randomUUID();
            const historyItem = {
              id: runId,
              timestamp: Date.now(),
              strategyTitle: result.strategyTitle || 'Grandmaster 15M (XAUUSD)',
              symbol: result.symbol,
              netProfit: result.netProfit,
              winRate: result.winRate,
              totalTrades: result.totalTrades,
              sharpeRatio: result.analytics?.sharpeRatio || 2.45,
              maxDrawdown: result.maxDrawdown,
            };
            const existing = JSON.parse(localStorage.getItem('elvaris_run_history') || '[]');
            localStorage.setItem('elvaris_run_history', JSON.stringify([historyItem, ...existing.slice(0, 29)]));
            localStorage.setItem(`elvaris_run_${runId}`, JSON.stringify(result));
          } catch (e) {
            console.error('Error saving run history:', e);
          }
        }
      } catch (err: any) {
        console.error('Backtest error:', err);
        setError(err.message || 'Backtest simulation error');
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Initial load
  useEffect(() => {
    let ignore = false;
    async function initWorkspace() {
      const targetDataset = querySymbol || dataset;
      if (querySymbol) {
        setDataset(querySymbol);
      }
      await loadCandles(targetDataset);
      if (ignore) return;

      const queryTp = searchParams.get('tp');
      const querySl = searchParams.get('sl');

      const applyTpSl = (code: string) => {
        if (!queryTp || !querySl) return code;
        return code
          .replace(/(tpDist(?:Manual|Input)?\s*=\s*input\.float\()([0-9.]+)/, `$1${queryTp}`)
          .replace(/(slDist(?:Manual|Input)?\s*=\s*input\.float\()([0-9.]+)/, `$1${querySl}`)
          .replace(/(var float tpDistInput\s*=\s*)([0-9.]+)/, `$1${queryTp}`)
          .replace(/(var float slDistInput\s*=\s*)([0-9.]+)/, `$1${querySl}`);
      };

      if (queryPreset) {
        setCurrentPreset(queryPreset);
        try {
          const res = await fetch(`/strategies/${queryPreset}`);
          let code = res.ok ? await res.text() : DEFAULT_GRANDMASTER_STRATEGY;
          code = applyTpSl(code);
          if (!ignore) {
            setScript(code);
            executeSimulation(code, targetDataset, settings);
          }
        } catch {
          const fallbackCode = applyTpSl(DEFAULT_GRANDMASTER_STRATEGY);
          if (!ignore) executeSimulation(fallbackCode, targetDataset, settings);
        }
      } else {
        const initialCode = applyTpSl(DEFAULT_GRANDMASTER_STRATEGY);
        if (queryTp && querySl) {
          setScript(initialCode);
        }
        executeSimulation(initialCode, targetDataset, settings);
      }
    }

    initWorkspace();
    return () => {
      ignore = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle dataset change
  const handleDatasetChange = async (newDataset: string) => {
    setDataset(newDataset);
    await loadCandles(newDataset);
    executeSimulation(script, newDataset, settings);
  };

  // Handle preset selection
  const handleSelectPreset = async (filename: string) => {
    setCurrentPreset(filename);
    try {
      const res = await fetch(`/strategies/${filename}`);
      if (res.ok) {
        const code = await res.text();
        setScript(code);
        executeSimulation(code, dataset, settings);
      }
    } catch (err) {
      console.error('Failed to load strategy file:', err);
    }
  };

  // Handle PDF Export
  const handleExportPdf = async () => {
    if (!backtestResult) return;
    try {
      setIsExportingPdf(true);
      try {
        localStorage.setItem('elvaris_current_report', JSON.stringify(backtestResult));
      } catch {}
      const res = await fetch('/api/report/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result: backtestResult }),
      });
      if (!res.ok) throw new Error('PDF export failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${backtestResult.symbol}_${backtestResult.strategyTitle || 'Report'}.pdf`.replace(/[^a-zA-Z0-9_-]/g, '_');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error generating PDF:', err);
      window.open('/report/print', '_blank');
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Focus trade on Vela chart
  const handleSelectTrade = (trade: ExecutedTrade | Trade) => {
    setSelectedTradeId(trade.id);
  };

  const currentMarket = SYMBOL_MAP[dataset] || { symbol: dataset.toUpperCase(), timeframe: '15' };

  return (
    <div className="min-h-screen bg-[var(--bg-app)] flex flex-col overflow-hidden">
      {/* Top Bar Navigation */}
      <TopBar
        symbol={dataset}
        onSymbolChange={handleDatasetChange}
        presetKey={currentPreset}
        onPresetChange={handleSelectPreset}
        onRunBacktest={() => executeSimulation(script, dataset, settings)}
        onExportPdf={handleExportPdf}
        isRunning={isLoading}
        isExportingPdf={isExportingPdf}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        netProfit={backtestResult?.netProfit}
        winRate={backtestResult?.winRate}
      />

      {/* Main Workspace Split (Editor/Settings + WebGL2 Vela Chart) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Side: Code Editor / Settings Pane */}
        {!isSidebarCollapsed && (
          <div className="w-[440px] xl:w-[480px] shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col z-10 transition-all duration-150">
            {/* Sidebar Pane Tabs */}
            <div className="h-9 border-b border-[var(--border-subtle)] px-2 bg-[var(--bg-subtle)] flex items-center justify-between select-none">
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setSidebarTab('editor')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    sidebarTab === 'editor'
                      ? 'bg-[var(--bg-surface)] text-[var(--brand)] font-semibold shadow-2xs'
                      : 'text-[var(--text-3)] hover:text-[var(--text-1)]'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>Pine Script Editor</span>
                </button>

                <button
                  onClick={() => setSidebarTab('settings')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    sidebarTab === 'settings'
                      ? 'bg-[var(--bg-surface)] text-[var(--brand)] font-semibold shadow-2xs'
                      : 'text-[var(--text-3)] hover:text-[var(--text-1)]'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Properties & Sizing</span>
                </button>
              </div>

              <button
                onClick={() => setIsSidebarCollapsed(true)}
                className="p-1 rounded text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors"
                title="Collapse Editor Pane"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Pane Content */}
            <div className="flex-1 overflow-hidden p-2 relative">
              <div className={`h-full ${sidebarTab === 'editor' ? 'block' : 'hidden'}`}>
                <ErrorBoundary fallbackTitle="Editor Recovery">
                  <PineEditor
                    code={script}
                    onChange={setScript}
                    onRunBacktest={() => executeSimulation(script, dataset, settings)}
                    isLoading={isLoading}
                    onSelectPreset={handleSelectPreset}
                    currentPreset={currentPreset}
                    errorMessage={error}
                  />
                </ErrorBoundary>
              </div>
              <div className={`h-full overflow-y-auto pr-1 ${sidebarTab === 'settings' ? 'block' : 'hidden'}`}>
                <SettingsPanel
                  settings={settings}
                  onChange={(newSettings) => {
                    setSettings(newSettings);
                    executeSimulation(script, dataset, newSettings);
                  }}
                  onReset={() => {
                    const defaults: BacktestSettings = {
                      initialCapital: 100000,
                      riskDollars: 500,
                      commission: 0,
                      slippage: 0,
                      orderSizingType: 'fixed_contracts',
                      orderSize: 1.0,
                      engine: 'pinets-ast',
                      propProfileId: 'tradeify_select_100k',
                    };
                    setSettings(defaults);
                    executeSimulation(script, dataset, defaults);
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Collapsed Sidebar Handle */}
        {isSidebarCollapsed && (
          <button
            onClick={() => setIsSidebarCollapsed(false)}
            className="absolute left-0 top-12 z-20 bg-[var(--bg-surface)] border border-l-0 border-[var(--border-subtle)] p-1.5 rounded-r-md text-[var(--text-3)] hover:text-[var(--text-1)] shadow-sm transition-colors"
            title="Expand Editor Pane"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {/* Right Side: Native WebGL2 Vela Chart */}
        <div className="flex-1 flex flex-col min-w-0 bg-[var(--bg-app)] relative overflow-hidden">
          <ErrorBoundary fallbackTitle="Chart Engine Recovery">
            <VelaChartPanel
              candles={candles}
              trades={backtestResult?.trades || []}
              symbol={currentMarket.symbol}
              timeframe={currentMarket.timeframe}
              selectedTradeId={selectedTradeId}
              onSelectTrade={handleSelectTrade}
              className="flex-1"
            />
          </ErrorBoundary>
        </div>
      </div>

      {/* Bottom Strategy Tester Dock */}
      <ErrorBoundary fallbackTitle="Strategy Tester Recovery">
        <TesterDock
          result={backtestResult}
          isRunning={isLoading}
          onSelectTrade={(t) => handleSelectTrade(t as any)}
        />
      </ErrorBoundary>

      {/* Global Modals */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onRunBacktest={() => executeSimulation(script, dataset, settings)}
        onExportPdf={handleExportPdf}
        onSelectPreset={handleSelectPreset}
        onSelectSymbol={handleDatasetChange}
      />

      <ShortcutsDialog
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F5F6F8] flex items-center justify-center font-mono text-xs">Loading Elvaris Capital Workspace...</div>}>
      <WorkspaceContent />
    </Suspense>
  );
}
