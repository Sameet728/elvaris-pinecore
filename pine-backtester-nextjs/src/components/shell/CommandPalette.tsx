'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent } from '@/components/ui';
import { 
  Search, 
  Play, 
  Download, 
  FileCode, 
  Database, 
  History, 
  Sliders, 
  Trash2,
  ExternalLink
} from 'lucide-react';
import { STRATEGY_PRESETS } from '@/components/editor/PineEditor';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onRunBacktest?: () => void;
  onExportPdf?: () => void;
  onSelectPreset?: (preset: string) => void;
  onSelectSymbol?: (symbol: string) => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  onRunBacktest,
  onExportPdf,
  onSelectPreset,
  onSelectSymbol,
}: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  // Handle global shortcut Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else setQuery('');
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const commands = [
    {
      group: 'Actions',
      items: [
        {
          id: 'run_backtest',
          title: 'Run Strategy Simulation',
          shortcut: 'Ctrl+Enter',
          icon: Play,
          action: () => {
            onClose();
            onRunBacktest?.();
          },
        },
        {
          id: 'export_pdf',
          title: 'Export Institutional Audit PDF',
          icon: Download,
          action: () => {
            onClose();
            onExportPdf?.();
          },
        },
      ],
    },
    {
      group: 'Navigation',
      items: [
        {
          id: 'nav_workspace',
          title: 'Go to Workspace (Editor & Chart)',
          icon: FileCode,
          action: () => {
            onClose();
            router.push('/');
          },
        },
        {
          id: 'nav_strategies',
          title: 'Go to Strategy Library',
          icon: FileCode,
          action: () => {
            onClose();
            router.push('/strategies');
          },
        },
        {
          id: 'nav_data',
          title: 'Go to Data Manager',
          icon: Database,
          action: () => {
            onClose();
            router.push('/data');
          },
        },
        {
          id: 'nav_runs',
          title: 'Go to Run History & Compare',
          icon: History,
          action: () => {
            onClose();
            router.push('/runs');
          },
        },
        {
          id: 'nav_optimize',
          title: 'Go to Parameter Sweep Optimizer',
          icon: Sliders,
          action: () => {
            onClose();
            router.push('/optimize');
          },
        },
      ],
    },
    {
      group: 'Select Preset Strategy',
      items: STRATEGY_PRESETS.map((p) => ({
        id: `preset_${p.id}`,
        title: `Load ${p.name}`,
        icon: FileCode,
        action: () => {
          onClose();
          onSelectPreset?.(p.filename);
        },
      })),
    },
    {
      group: 'Switch Market Dataset',
      items: [
        { id: 'sym_gold', title: 'XAUUSD (Gold 15M) · 8,900 bars', icon: Database, action: () => { onClose(); onSelectSymbol?.('xauusd_15m'); } },
        { id: 'sym_euro', title: 'EURUSD (Euro 15M) · 6,577 bars', icon: Database, action: () => { onClose(); onSelectSymbol?.('eurusd_15m'); } },
        { id: 'sym_nasdaq', title: 'NAS100 (Nasdaq 15M) · 4,200 bars', icon: Database, action: () => { onClose(); onSelectSymbol?.('nas100_15m'); } },
        { id: 'sym_btc', title: 'BTCUSDT (Bitcoin 15M) · 10,000 bars', icon: Database, action: () => { onClose(); onSelectSymbol?.('btcusdt_15m'); } },
      ],
    },
  ];

  // Filter commands by query
  const filteredGroups = commands.map((group) => ({
    group: group.group,
    items: group.items.filter((item) =>
      item.title.toLowerCase().includes(query.toLowerCase())
    ),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-100">
      <div className="w-full max-w-xl bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] shadow-2xl overflow-hidden flex flex-col max-h-[70vh]">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)]">
          <Search className="w-4 h-4 text-[var(--text-3)] mr-3 shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Type a command, strategy, or market..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-hidden"
          />
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-3)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded shadow-2xs">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 divide-y divide-[var(--border-subtle)]">
          {filteredGroups.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-3)]">
              No matching commands or actions found
            </div>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.group} className="py-2 first:pt-0 last:pb-0">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-3)]">
                  {group.group}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={item.action}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-[var(--text-1)] hover:bg-[var(--bg-subtle)] hover:text-[var(--brand)] transition-colors text-left group"
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className="w-4 h-4 text-[var(--text-3)] group-hover:text-[var(--brand)]" />
                          <span className="font-medium">{item.title}</span>
                        </div>
                        {item.shortcut && (
                          <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-3)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded">
                            {item.shortcut}
                          </kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
