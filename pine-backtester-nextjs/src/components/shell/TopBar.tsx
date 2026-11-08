'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Play, 
  Download, 
  Command, 
  HelpCircle, 
  Layers, 
  Database, 
  History, 
  Sliders, 
  Flame,
  Loader2,
  ChevronRight,
  TrendingUp,
  BookOpen,
  ExternalLink
} from 'lucide-react';
import { Button } from '@/components/ui';
import { STRATEGY_PRESETS } from '@/components/editor/PineEditor';

interface TopBarProps {
  symbol?: string;
  onSymbolChange?: (symbol: string) => void;
  presetKey?: string;
  onPresetChange?: (preset: string) => void;
  onRunBacktest?: () => void;
  onExportPdf?: () => void;
  isRunning?: boolean;
  isExportingPdf?: boolean;
  onOpenCommandPalette?: () => void;
  onOpenShortcuts?: () => void;
  netProfit?: number;
  winRate?: number;
}

export function TopBar({
  symbol = 'xauusd_15m',
  onSymbolChange,
  presetKey,
  onPresetChange,
  onRunBacktest,
  onExportPdf,
  isRunning = false,
  isExportingPdf = false,
  onOpenCommandPalette,
  onOpenShortcuts,
  netProfit,
  winRate,
}: TopBarProps) {
  const pathname = usePathname();

  const navLinks = [
    { href: '/', label: 'Workspace', icon: Layers },
    { href: '/strategies', label: 'Strategies', icon: Flame },
    { href: '/data', label: 'Data', icon: Database },
    { href: '/runs', label: 'Runs', icon: History },
    { href: '/optimize', label: 'Optimize', icon: Sliders },
    { href: '/docs', label: 'Docs', icon: BookOpen },
  ];

  return (
    <header className="h-14 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] px-4 flex items-center justify-between z-30 select-none shadow-xs">
      {/* Left: Brand + Breadcrumbs/Navigation */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2.5">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-white border border-[var(--border-subtle)] flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/logo.png" alt="Elvaris Capital" className="w-full h-full object-contain p-0.5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm text-[var(--text-1)] tracking-tight">Elvaris</span>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[var(--brand)]/10 text-[var(--brand)] uppercase tracking-wider">
                  Capital
                </span>
              </div>
              <span className="text-[10px] text-[var(--text-3)] block -mt-0.5 font-medium">
                Product by Elvaris Capital
              </span>
            </div>
          </Link>

          <a
            href="https://elvariscapital.in"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden xl:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-[var(--brand)] hover:underline bg-[var(--brand)]/5 border border-[var(--brand)]/20"
            title="Parent Organization Website"
          >
            <span>elvariscapital.in</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>

        {/* Global Nav Links */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-[var(--bg-subtle)] text-[var(--brand)] font-semibold'
                    : 'text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--bg-subtle)]/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Center: Market & Strategy Quick Selectors (Workspace Only) */}
      {pathname === '/' && (
        <div className="hidden lg:flex items-center gap-3">
          {/* Symbol Selector */}
          <div className="flex items-center gap-1.5 bg-[var(--bg-subtle)] px-2.5 py-1 rounded-md border border-[var(--border-subtle)]">
            <span className="text-[10px] font-semibold text-[var(--text-3)] uppercase">Market:</span>
            <select
              value={symbol}
              onChange={(e) => onSymbolChange?.(e.target.value)}
              className="bg-transparent text-xs font-medium text-[var(--text-1)] focus:outline-hidden cursor-pointer"
            >
              <option value="xauusd_15m">XAUUSD (Gold 15M) · 8,900 bars</option>
              <option value="eurusd_15m">EURUSD (Euro 15M) · 6,577 bars</option>
              <option value="nas100_15m">NAS100 (Nasdaq 15M) · 4,200 bars</option>
              <option value="btcusdt_15m">BTCUSDT (Bitcoin 15M) · 10,000 bars</option>
            </select>
          </div>

          {/* Strategy Preset Selector */}
          <div className="flex items-center gap-1.5 bg-[var(--bg-subtle)] px-2.5 py-1 rounded-md border border-[var(--border-subtle)]">
            <span className="text-[10px] font-semibold text-[var(--text-3)] uppercase">Strategy:</span>
            <select
              value={presetKey || ''}
              onChange={(e) => onPresetChange?.(e.target.value)}
              className="bg-transparent text-xs font-medium text-[var(--text-1)] focus:outline-hidden max-w-[210px] truncate cursor-pointer"
            >
              {STRATEGY_PRESETS.map((p) => (
                <option key={p.id} value={p.filename}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* KPI Badge if result available */}
          {netProfit !== undefined && winRate !== undefined && (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-[var(--profit-subtle)] border border-[var(--profit)]/20 text-xs font-mono">
              <span className="text-[10px] text-[var(--profit)] font-semibold uppercase">Net:</span>
              <span className={`font-bold ${netProfit >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
                {netProfit >= 0 ? '+' : ''}${netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[var(--text-3)]">·</span>
              <span className="font-semibold text-[var(--text-1)]">{winRate.toFixed(1)}% WR</span>
            </div>
          )}
        </div>
      )}

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Command Palette Trigger */}
        <button
          onClick={onOpenCommandPalette}
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-[var(--text-3)] bg-[var(--bg-subtle)] hover:text-[var(--text-1)] border border-[var(--border-subtle)] transition-colors"
          title="Command Palette (Ctrl+K)"
        >
          <Command className="w-3.5 h-3.5" />
          <span className="font-mono text-[10px]">Ctrl+K</span>
        </button>

        {/* Shortcuts Dialog Trigger */}
        <button
          onClick={onOpenShortcuts}
          className="p-1.5 rounded-md text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--bg-subtle)] transition-colors"
          title="Keyboard Shortcuts (?)"
        >
          <HelpCircle className="w-4 h-4" />
        </button>

        {/* Export PDF Button */}
        {onExportPdf && (
          <Button
            size="sm"
            variant="outline"
            onClick={onExportPdf}
            disabled={isExportingPdf}
            className="text-xs h-8 gap-1.5 hidden sm:flex"
            title="Download Full Institutional Audit PDF"
          >
            {isExportingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5 text-[var(--brand)]" />}
            <span>Export PDF</span>
          </Button>
        )}

        {/* Run Strategy Button */}
        {onRunBacktest && (
          <Button
            size="sm"
            variant="primary"
            onClick={onRunBacktest}
            disabled={isRunning}
            className="text-xs h-8 font-semibold gap-1.5 shadow-xs"
            title="Execute Pine Script Simulation (Ctrl+Enter)"
          >
            {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            <span>{isRunning ? 'Simulating...' : 'Run Strategy'}</span>
          </Button>
        )}
      </div>
    </header>
  );
}
