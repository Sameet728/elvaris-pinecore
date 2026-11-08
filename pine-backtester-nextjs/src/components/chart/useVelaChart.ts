'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Candle, Trade } from '@/types/backtest';
import { buildTradeLayer } from './buildTradeLayer';

export interface UseVelaChartProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  hudRef?: React.RefObject<HTMLDivElement | null>;
  candles: Candle[];
  trades?: Trade[];
  symbol?: string;
  timeframe?: string;
  selectedTradeId?: number | null;
  onSelectTrade?: (trade: Trade) => void;
  showBoxes?: boolean;
  showMarks?: boolean;
  showEma?: boolean;
  showBands?: boolean;
  showToolbar?: boolean;
}

export function useVelaChart({
  containerRef,
  hudRef,
  candles,
  trades = [],
  symbol = 'FOREXCOM:XAUUSD',
  timeframe = '15',
  selectedTradeId,
  onSelectTrade,
  showBoxes = true,
  showMarks = true,
  showEma = true,
  showBands = false,
  showToolbar = false,
}: UseVelaChartProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);
  const isReadyRef = useRef(false);
  const [isInitialized, setIsInitialized] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emaHandlesRef = useRef<any[]>([]);

  // Format candles for Vela: { time (epoch ms), open, high, low, close, volume }
  const formatBars = useCallback((rawCandles: Candle[]) => {
    return rawCandles.map((c) => ({
      time: c.openTime,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: 0, // No synthetic volume
    }));
  }, []);

  // 1. Initialize Chart Instance once candles are available
  useEffect(() => {
    let disposed = false;
    const container = containerRef.current;
    if (!container || isReadyRef.current) return;
    if (!candles || candles.length === 0) return;

    async function initChart() {
      try {
        const { Vela, createTheme } = await import('@luxalgo/vela');
        const { PineEngine } = await import('@luxalgo/vela-pinets');

        if (disposed || !container) return;

        const lightTheme = createTheme({
          base: 'light',
          colors: {
            accent: '#2B59FF',
            background: '#FFFFFF',
            text: '#0E1520',
            grid: '#F0F2F5',
            border: '#E2E5EA',
            up: '#089981',
            down: '#F23645',
          },
        });

        const initialBars = formatBars(candles);

        const pineEngine = new PineEngine();

        const chart = new Vela(container, {
          data: initialBars,
          symbol,
          timeframe,
          theme: lightTheme,
          live: false,
          volume: false, // Explicitly disable synthetic volume pane
          attribution: false, // Hide third-party attribution watermark
          engines: [pineEngine],
        } as any);

        try {
          chart.registerEngine('pine', pineEngine);
        } catch (e) {
          console.warn('PineEngine registration info:', e);
        }

        // Await readiness with a 2.5s safeguard timeout
        await Promise.race([
          chart.ready(),
          new Promise((resolve) => setTimeout(resolve, 2500)),
        ]);

        if (disposed) {
          chart.destroy();
          return;
        }

        chartRef.current = chart;
        isReadyRef.current = true;
        setIsInitialized(true);

        // Institutional White-Labeling: Cleanly strip third-party attribution
        const stripAttribution = () => {
          if (!container) return;
          container.querySelectorAll('a[href*="velacharts"], .vela-attribution, [class*="vela-attr"]').forEach((el) => {
            el.remove();
          });
        };
        stripAttribution();
        const watermarkObserver = new MutationObserver(stripAttribution);
        watermarkObserver.observe(container, { childList: true, subtree: true });

        // Render trade layer (boxes, prices, and outcome badges) immediately
        try {
          buildTradeLayer(chart, trades, {
            showBoxes,
            showMarks,
            selectedTradeId,
          });
        } catch (e) {
          console.warn('Initial trade layer paint failed:', e);
        }

        // Hide toolbar initially if specified
        if (chart.drawings && chart.drawings.showToolbar) {
          chart.drawings.showToolbar(showToolbar);
        }

        // Setup Zero React Re-render Crosshair Listener for HUD
        if (chart.renderer && (chart.renderer as any).onCrosshairMove && hudRef) {
          let rafId = 0;
          (chart.renderer as any).onCrosshairMove((ev: any) => {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
              const el = hudRef.current;
              if (!el) return;
              if (ev && ev.bar) {
                const b = ev.bar;
                const change = b.close - b.open;
                const changePct = b.open > 0 ? (change / b.open) * 100 : 0;
                const isUp = change >= 0;
                const tradeOnBar = trades.find(
                  (t) => (t.entryTime <= b.time && (t.exitTime ? b.time <= t.exitTime : b.time <= t.entryTime + 15 * 60 * 1000 * 8))
                );
                const tradeBadge = tradeOnBar
                  ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      tradeOnBar.pnl > 0 ? 'bg-[#EBF7F2] text-[#0A7A55]' : 'bg-[#FDF0F2] text-[#C0223A]'
                    }">
                      #${tradeOnBar.id} ${tradeOnBar.type} ${tradeOnBar.pnl > 0 ? 'TP HIT' : 'SL HIT'} (${tradeOnBar.pnl >= 0 ? '+' : ''}$${tradeOnBar.pnl.toFixed(2)}) Entry: $${tradeOnBar.entryPrice.toFixed(2)} Exit: $${tradeOnBar.exitPrice ? tradeOnBar.exitPrice.toFixed(2) : '—'}
                    </span>`
                  : '';
                el.innerHTML = `
                  <div class="flex items-center gap-2.5 font-mono text-[11px] text-[#475266] tabular-nums">
                    <span>O: <strong class="text-[#0E1520]">${b.open.toFixed(2)}</strong></span>
                    <span>H: <strong class="text-[#0E1520]">${b.high.toFixed(2)}</strong></span>
                    <span>L: <strong class="text-[#0E1520]">${b.low.toFixed(2)}</strong></span>
                    <span>C: <strong class="text-[#0E1520]">${b.close.toFixed(2)}</strong></span>
                    <span class="${isUp ? 'text-[#0A7A55]' : 'text-[#C0223A]'} font-semibold">
                      ${isUp ? '+' : ''}${change.toFixed(2)} (${isUp ? '+' : ''}${changePct.toFixed(2)}%)
                    </span>
                    ${tradeBadge}
                    <span class="text-[#6B7587]">|</span>
                    <span class="text-[#6B7587]">${new Date(b.time).toUTCString()}</span>
                  </div>
                `;
              } else {
                el.innerHTML = '';
              }
            });
          });
        }

        // Listen for Timeline Mark clicks to focus trades
        chart.on('mark:click', (ev: { id: string }) => {
          if (!ev || !ev.id || !onSelectTrade) return;
          const match = ev.id.match(/^trade_(?:entry|exit)_mark_(\d+)$/);
          if (match && match[1]) {
            const tradeId = parseInt(match[1], 10);
            const found = trades.find((t) => t.id === tradeId);
            if (found) onSelectTrade(found);
          }
        });

        // Coalesced ResizeObserver
        let resizeRaf = 0;
        const ro = new ResizeObserver(() => {
          if (resizeRaf) cancelAnimationFrame(resizeRaf);
          resizeRaf = requestAnimationFrame(() => {
            if (chartRef.current) {
              chartRef.current.resize();
            }
          });
        });
        ro.observe(container);

        // Store ro cleanup on container
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (container as any).__vela_ro__ = ro;
      } catch (err) {
        console.error('Failed to initialize @luxalgo/vela chart:', err);
      }
    }

    initChart();

    return () => {
      disposed = true;
      if (container) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ro = (container as any).__vela_ro__;
        if (ro) ro.disconnect();
      }
      if (chartRef.current) {
        try {
          chartRef.current.destroy();
        } catch (e) {
          console.warn('Error destroying chart:', e);
        }
        chartRef.current = null;
        isReadyRef.current = false;
      }
    };
  }, [containerRef, candles.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2. Update Market Data in place when candles, symbol or timeframe changes (NO DESTROY!)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !isReadyRef.current) return;

    const formatted = formatBars(candles);
    if (formatted.length > 0) {
      try {
        chart.setMarket({
          symbol,
          timeframe,
          data: formatted,
        });
      } catch (e) {
        console.warn('Failed to update chart market data:', e);
      }
    }
  }, [candles, symbol, timeframe, formatBars]);

  // 3. Update Trade Drawings & Timeline Marks
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !isReadyRef.current) return;

    buildTradeLayer(chart, trades, {
      showBoxes,
      showMarks,
      selectedTradeId,
    });
  }, [trades, showBoxes, showMarks, selectedTradeId]);

  // 4. Overlays: EMAs & Volatility Bands
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !isReadyRef.current) return;

    // Clear existing EMA handles
    emaHandlesRef.current.forEach((h) => {
      try {
        if (h && h.remove) h.remove();
      } catch { }
    });
    emaHandlesRef.current = [];

    if (showEma) {
      try {
        const ema50 = chart.addIndicator(`//@version=5
indicator("EMA 50", overlay=true)
plot(ta.ema(close, 50), "EMA 50", color=#1E88E5, linewidth=1)`);

        const ema200 = chart.addIndicator(`//@version=5
indicator("EMA 200", overlay=true)
plot(ta.ema(close, 200), "EMA 200", color=#F59E0B, linewidth=2)`);

        emaHandlesRef.current = [ema50, ema200];
      } catch (e) {
        console.warn('Failed to add EMA indicators:', e);
      }
    }

    if (showBands) {
      try {
        const bands = chart.addIndicator(`//@version=5
indicator("Volatility Band", overlay=true)
basis = ta.sma(close, 28)
dev = 2.1 * ta.stdev(close, 28)
p1 = plot(basis + dev, "Upper", color=color.new(#E0314A, 40), linewidth=1)
p2 = plot(basis - dev, "Lower", color=color.new(#089981, 40), linewidth=1)
plot(basis, "Basis", color=color.new(#64748B, 50), linewidth=1)
fill(p1, p2, color=color.new(#2B59FF, 94))`);
        emaHandlesRef.current.push(bands);
      } catch (e) {
        console.warn('Failed to add Volatility Bands:', e);
      }
    }
  }, [showEma, showBands]);

  // 5. Drawing Toolbar Visibility
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !isReadyRef.current) return;
    if (chart.drawings && chart.drawings.showToolbar) {
      chart.drawings.showToolbar(showToolbar);
    }
  }, [showToolbar]);

  // 6. Focus Selected Trade
  const focusTrade = useCallback((tradeId: number) => {
    const chart = chartRef.current;
    if (!chart || !trades) return;
    const trade = trades.find((t) => t.id === tradeId);
    if (!trade) return;

    const span = (trade.exitTime ? trade.exitTime : trade.entryTime) - trade.entryTime;
    const padding = Math.max(span * 2, 25 * 15 * 60 * 1000); // at least 25 bars padding

    try {
      if (chart.setVisibleRange) {
        chart.setVisibleRange({
          from: trade.entryTime - padding,
          to: (trade.exitTime || trade.entryTime) + padding,
        });
      }
    } catch (e) {
      console.warn('Error focusing trade:', e);
    }
  }, [trades]);

  // Handle selectedTradeId change
  useEffect(() => {
    if (selectedTradeId !== null && selectedTradeId !== undefined) {
      focusTrade(selectedTradeId);
    }
  }, [selectedTradeId, focusTrade]);

  // Range Presets
  const setRangePreset = useCallback((preset: '1D' | '1W' | '1M' | '3M' | 'ALL') => {
    const chart = chartRef.current;
    if (!chart) return;
    try {
      if (preset === 'ALL') {
        if (chart.setVisibleRangePreset) chart.setVisibleRangePreset('ALL');
        else if (chart.autoscale) chart.autoscale();
      } else {
        const now = candles.length > 0 ? candles[candles.length - 1].openTime : Date.now();
        const durationMap = {
          '1D': 24 * 60 * 60 * 1000,
          '1W': 7 * 24 * 60 * 60 * 1000,
          '1M': 30 * 24 * 60 * 60 * 1000,
          '3M': 90 * 24 * 60 * 60 * 1000,
        };
        const from = now - durationMap[preset];
        if (chart.setVisibleRange) {
          chart.setVisibleRange({ from, to: now });
        }
      }
    } catch (e) {
      console.warn('Error setting range preset:', e);
    }
  }, [candles]);

  // Screenshot Export
  const captureScreenshot = useCallback(async (): Promise<string | null> => {
    const chart = chartRef.current;
    if (!chart || !chart.renderer) return null;
    try {
      if (chart.renderer.screenshot) {
        return await chart.renderer.screenshot();
      }
    } catch (e) {
      console.warn('Failed to capture screenshot:', e);
    }
    return null;
  }, []);

  return {
    isInitialized,
    focusTrade,
    setRangePreset,
    captureScreenshot,
  };
}


