'use client';

import React, { useRef, useState, useCallback } from 'react';
import { Candle, Trade } from '@/types/backtest';
import { useVelaChart } from './useVelaChart';
import { ChartToolbar } from './ChartToolbar';
import { ChartLegend } from './ChartLegend';

export interface VelaChartPanelProps {
  candles: Candle[];
  trades?: Trade[];
  symbol?: string;
  timeframe?: string;
  selectedTradeId?: number | null;
  onSelectTrade?: (trade: Trade) => void;
  className?: string;
}

export const VelaChartPanel: React.FC<VelaChartPanelProps> = ({
  candles,
  trades = [],
  symbol = 'FOREXCOM:XAUUSD',
  timeframe = '15',
  selectedTradeId,
  onSelectTrade,
  className = '',
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const chartHostRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);

  const [showBoxes, setShowBoxes] = useState(true);
  const [showMarks, setShowMarks] = useState(true);
  const [showEma, setShowEma] = useState(true);
  const [showBands, setShowBands] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { isInitialized, setRangePreset, captureScreenshot } = useVelaChart({
    containerRef: chartHostRef,
    hudRef,
    candles,
    trades,
    symbol,
    timeframe,
    selectedTradeId,
    onSelectTrade,
    showBoxes,
    showMarks,
    showEma,
    showBands,
    showToolbar,
  });

  const handleToggleFullscreen = useCallback(() => {
    if (!panelRef.current) return;
    if (!document.fullscreenElement) {
      panelRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  const handleScreenshot = useCallback(async () => {
    const dataUrl = await captureScreenshot();
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `Elvaris_${symbol.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.png`;
    a.click();
  }, [captureScreenshot, symbol]);

  return (
    <div
      ref={panelRef}
      className={`flex flex-col w-full h-full min-h-0 bg-white border border-[#E2E5EA] rounded-xl overflow-hidden shadow-2xs ${className}`}
    >
      {/* 1. Chart Toolbar (40px) */}
      <ChartToolbar
        symbol={symbol}
        timeframe={timeframe}
        showBoxes={showBoxes}
        onToggleBoxes={() => setShowBoxes((v) => !v)}
        showMarks={showMarks}
        onToggleMarks={() => setShowMarks((v) => !v)}
        showEma={showEma}
        onToggleEma={() => setShowEma((v) => !v)}
        showBands={showBands}
        onToggleBands={() => setShowBands((v) => !v)}
        showToolbar={showToolbar}
        onToggleToolbar={() => setShowToolbar((v) => !v)}
        onSelectPreset={setRangePreset}
        onFit={() => setRangePreset('ALL')}
        onScreenshot={handleScreenshot}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
      />

      {/* 2. Chart Host Container (Flex-1 min-h-0, WebGL2 Canvas target) */}
      <div className="relative flex-1 w-full min-h-0 overflow-hidden bg-white">
        <div ref={chartHostRef} className="w-full h-full min-h-0" />
        {!isInitialized && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-2xs">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-[#2B59FF] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-mono text-[#6B7587]">Loading Elvaris Chart Engine...</span>
            </div>
          </div>
        )}
      </div>

      {/* 3. Legend & HUD Strip (32px) */}
      <ChartLegend hudRef={hudRef} tradesCount={trades.length} />
    </div>
  );
};

