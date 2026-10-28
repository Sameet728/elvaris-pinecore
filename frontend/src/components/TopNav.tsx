import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Download,
  Play,
  Database,
  Code2,
  Terminal,
  HelpCircle,
  Loader2,
  Clock,
} from 'lucide-react';
import type { Candle, DataMetadata } from '../api/client';

interface TopNavProps {
  candles: Candle[];
  metadata: DataMetadata | null;
  onOpenDownloader: () => void;
  onExecuteScript: () => void;
  isExecuting: boolean;
  showEditor: boolean;
  onToggleEditor: () => void;
  showConsole: boolean;
  onToggleConsole: () => void;
  onOpenHelp: () => void;
  scrollMode?: boolean;
  onToggleScrollMode?: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  candles,
  metadata,
  onOpenDownloader,
  onExecuteScript,
  isExecuting,
  showEditor,
  onToggleEditor,
  showConsole,
  onToggleConsole,
  onOpenHelp,
  scrollMode,
  onToggleScrollMode,
}) => {
  const [istTime, setIstTime] = useState<string>('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setIstTime(
        now.toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);
  const lastCandle = candles.length > 0 ? candles[candles.length - 1] : null;
  const prevCandle = candles.length > 1 ? candles[candles.length - 2] : null;

  const change =
    lastCandle && prevCandle ? lastCandle.close - prevCandle.close : 0;
  const changePct =
    lastCandle && prevCandle && prevCandle.close !== 0
      ? (change / prevCandle.close) * 100
      : 0;
  const isPositive = change >= 0;

  return (
    <header className="h-12 bg-[#0c0d16] border-b border-[#1b1c2d] flex items-center justify-between px-3 select-none text-xs">
      {/* Left: Branding & Instrument details */}
      <div className="flex items-center gap-4">
        {/* Brand / Logo */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <TrendingUp size={15} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-white text-sm tracking-tight">VELA</span>
              <span className="text-[10px] text-blue-400 font-semibold tracking-wider px-1 rounded bg-blue-950/60 border border-blue-800/40">
                PINE
              </span>
            </div>
          </div>
        </div>

        <div className="h-4 w-px bg-[#202235]" />

        {/* Symbol & Market Info */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-white text-xs">XAUUSD</span>
            <span className="text-[11px] text-slate-400">Gold / USD</span>
          </div>

          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#181a29] text-amber-300 border border-[#2a2d44]">
            5m
          </span>

          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#181a29] text-slate-400 border border-[#2a2d44] flex items-center gap-1">
            <Database size={10} className="text-emerald-400" />
            <span>Dukascopy</span>
          </span>
        </div>

        {/* Live Candle Stats ticker */}
        {lastCandle && (
          <div className="hidden lg:flex items-center gap-3 font-mono text-[11px] bg-[#10111d] px-2.5 py-1 rounded border border-[#1b1d2e]">
            <div className="flex items-baseline gap-1.5">
              <span className="text-white font-bold text-xs">{lastCandle.close.toFixed(2)}</span>
              <span
                className={`text-[10px] font-semibold ${
                  isPositive ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {isPositive ? '+' : ''}
                {change.toFixed(2)} ({isPositive ? '+' : ''}
                {changePct.toFixed(2)}%)
              </span>
            </div>
            <div className="flex items-center gap-2 text-slate-400 text-[10px]">
              <span>O: <span className="text-slate-200">{lastCandle.open.toFixed(2)}</span></span>
              <span>H: <span className="text-emerald-400">{lastCandle.high.toFixed(2)}</span></span>
              <span>L: <span className="text-rose-400">{lastCandle.low.toFixed(2)}</span></span>
              <span>V: <span className="text-slate-300">{lastCandle.volume.toLocaleString()}</span></span>
              <span className="text-cyan-400 pl-1 border-l border-[#202235]">
                {new Date(lastCandle.openTime).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' })}{' '}
                {new Date(lastCandle.openTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })} IST
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Indian Standard Time (IST / UTC+5:30) Live Clock matching TradingView */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#141624] border border-[#23273e] text-[11px] font-mono shadow-xs" title="Indian Standard Time (UTC+05:30) - in.tradingview.com">
          <Clock size={12} className="text-amber-400" />
          <span className="text-slate-400 font-sans">IST:</span>
          <span className="text-emerald-400 font-semibold">{istTime}</span>
          <span className="text-cyan-400 text-[10px] font-bold px-1 rounded bg-cyan-950/60 border border-cyan-800/40">UTC+5:30</span>
        </div>
        {/* Dukascopy Data Downloader Button */}
        <button
          onClick={onOpenDownloader}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#161827] hover:bg-[#202338] text-slate-200 border border-[#272a42] transition-colors"
          title="Download historical data from Dukascopy"
        >
          <Download size={13} className="text-amber-400" />
          <span className="font-medium">Data Pipeline</span>
          {metadata && (
            <span className="ml-0.5 px-1.5 py-0.2 rounded text-[10px] bg-blue-900/60 text-blue-300 font-mono">
              {metadata.candleCount.toLocaleString()}
            </span>
          )}
        </button>

        {/* Run Script shortcut button */}
        <button
          onClick={onExecuteScript}
          disabled={isExecuting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 text-white font-medium shadow-md shadow-blue-900/30 transition-all cursor-pointer"
          title="Run Pine Script on real candles (Ctrl+Enter)"
        >
          {isExecuting ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Play size={13} className="fill-current" />
          )}
          <span>Execute</span>
        </button>

        <div className="h-4 w-px bg-[#202235]" />

        {/* Scroll Indicator Below Mode Toggle */}
        {onToggleScrollMode && (
          <button
            onClick={onToggleScrollMode}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
              scrollMode
                ? 'bg-blue-600/30 text-blue-300 border-blue-500/50'
                : 'bg-[#161827] text-slate-400 border-[#272a42] hover:text-white'
            }`}
            title="Toggle between Full-Height Page Scroll (Indicator Below) and Docked Layout"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${scrollMode ? 'bg-cyan-400 animate-pulse' : 'bg-slate-500'}`} />
            <span>{scrollMode ? 'Scroll Indicator Below' : 'Docked'}</span>
          </button>
        )}
        <button
          onClick={onToggleEditor}
          className={`p-1.5 rounded-lg border transition-colors ${
            showEditor
              ? 'bg-[#1e2034] text-white border-blue-500/50'
              : 'bg-[#121320] text-slate-400 border-[#222438] hover:text-white'
          }`}
          title="Toggle Code Editor Panel"
        >
          <Code2 size={14} />
        </button>

        <button
          onClick={onToggleConsole}
          className={`p-1.5 rounded-lg border transition-colors ${
            showConsole
              ? 'bg-[#1e2034] text-white border-blue-500/50'
              : 'bg-[#121320] text-slate-400 border-[#222438] hover:text-white'
          }`}
          title="Toggle Output Console"
        >
          <Terminal size={14} />
        </button>

        <button
          onClick={onOpenHelp}
          className="p-1.5 rounded-lg bg-[#121320] text-slate-400 border border-[#222438] hover:text-white transition-colors"
          title="Platform Information & Architecture"
        >
          <HelpCircle size={14} />
        </button>
      </div>
    </header>
  );
};
