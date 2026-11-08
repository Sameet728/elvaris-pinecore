'use client';

import React from 'react';
import { Dialog, DialogContent, Button } from '@/components/ui';
import { Keyboard, X } from 'lucide-react';

interface ShortcutsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutsDialog({ isOpen, onClose }: ShortcutsDialogProps) {
  if (!isOpen) return null;

  const shortcutGroups = [
    {
      category: 'Backtesting & Execution',
      items: [
        { key: 'Ctrl + Enter', description: 'Run Pine Script simulation on current dataset' },
        { key: 'Ctrl + S', description: 'Save strategy script draft' },
        { key: 'Ctrl + K', description: 'Open Global Command Palette' },
        { key: 'Esc', description: 'Close modal or command palette' },
      ],
    },
    {
      category: 'Elvaris Quant Chart Navigation',
      items: [
        { key: 'Mouse Drag / Touch', description: 'Smooth 60 FPS inertia pan across time' },
        { key: 'Scroll Wheel', description: 'Smooth cursor-anchored zoom in / out' },
        { key: 'Right Drag / Shift Drag', description: 'Vertical price scale manual resize' },
        { key: 'Double Click', description: 'Autoscale price & time to fit visible window' },
      ],
    },
    {
      category: 'Strategy Tester Dock',
      items: [
        { key: 'Click Trade Row', description: 'Focus and zoom chart to trade execution candle' },
        { key: 'Export PDF', description: 'Generate high-res vector A4 audit report' },
        { key: 'Export CSV', description: 'Download complete trade ledger' },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-100">
      <div className="w-full max-w-lg bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)]">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-[var(--brand)]" />
            <h3 className="text-sm font-semibold text-[var(--text-1)]">Keyboard Shortcuts & Navigation</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 text-xs max-h-[70vh] overflow-y-auto">
          {shortcutGroups.map((group) => (
            <div key={group.category}>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-3)] mb-2">
                {group.category}
              </h4>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <div key={item.key} className="flex items-center justify-between py-1">
                    <span className="text-[var(--text-2)]">{item.description}</span>
                    <kbd className="px-2 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-1)] font-mono text-[11px] font-medium shadow-2xs">
                      {item.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--bg-subtle)] flex justify-end">
          <Button size="sm" variant="outline" onClick={onClose}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}
