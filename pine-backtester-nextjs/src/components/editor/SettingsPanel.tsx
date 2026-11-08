'use client';

import React from 'react';
import { Card, Input, NumberField, Select, Switch, Button } from '@/components/ui';
import { Settings, Shield, Sliders, Calendar, DollarSign, RotateCcw } from 'lucide-react';

export interface BacktestSettings {
  initialCapital: number;
  riskDollars: number;
  commission: number;
  slippage: number;
  orderSizingType: 'fixed_contracts' | 'percent_equity' | 'cash_risk';
  orderSize: number;
  startDate?: string;
  endDate?: string;
  engine: 'pinets-ast' | 'fast-quant';
  propProfileId: string;
}

interface SettingsPanelProps {
  settings: BacktestSettings;
  onChange: (settings: BacktestSettings) => void;
  onReset?: () => void;
  className?: string;
}

export function SettingsPanel({
  settings,
  onChange,
  onReset,
  className = '',
}: SettingsPanelProps) {
  const updateField = <K extends keyof BacktestSettings>(field: K, value: BacktestSettings[K]) => {
    onChange({
      ...settings,
      [field]: value,
    });
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Capital & Sizing */}
      <Card className="p-4 bg-[var(--bg-surface)]">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[var(--border-subtle)]">
          <DollarSign className="w-4 h-4 text-[var(--brand)]" />
          <h4 className="text-xs font-semibold text-[var(--text-1)] uppercase tracking-wider">
            Capital & Position Sizing
          </h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-[var(--text-2)] mb-1 font-medium">Initial Capital ($)</label>
            <input
              type="number"
              value={settings.initialCapital}
              onChange={(e) => updateField('initialCapital', Number(e.target.value) || 100000)}
              className="w-full px-2.5 py-1.5 rounded-md bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-1)] font-mono text-xs focus:outline-hidden focus:border-[var(--brand)]"
              min={1000}
              step={1000}
            />
          </div>

          <div>
            <label className="block text-[var(--text-2)] mb-1 font-medium">Risk Per Trade ($)</label>
            <input
              type="number"
              value={settings.riskDollars}
              onChange={(e) => updateField('riskDollars', Number(e.target.value) || 500)}
              className="w-full px-2.5 py-1.5 rounded-md bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-1)] font-mono text-xs focus:outline-hidden focus:border-[var(--brand)]"
              min={50}
              step={50}
            />
          </div>

          <div>
            <label className="block text-[var(--text-2)] mb-1 font-medium">Commission ($ / contract)</label>
            <input
              type="number"
              value={settings.commission}
              onChange={(e) => updateField('commission', Number(e.target.value) || 0)}
              className="w-full px-2.5 py-1.5 rounded-md bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-1)] font-mono text-xs focus:outline-hidden focus:border-[var(--brand)]"
              min={0}
              step={0.5}
            />
          </div>

          <div>
            <label className="block text-[var(--text-2)] mb-1 font-medium">Slippage (points)</label>
            <input
              type="number"
              value={settings.slippage}
              onChange={(e) => updateField('slippage', Number(e.target.value) || 0)}
              className="w-full px-2.5 py-1.5 rounded-md bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-1)] font-mono text-xs focus:outline-hidden focus:border-[var(--brand)]"
              min={0}
              step={0.1}
            />
          </div>
        </div>
      </Card>

      {/* Engine & Evaluation Profile */}
      <Card className="p-4 bg-[var(--bg-surface)]">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[var(--border-subtle)]">
          <Shield className="w-4 h-4 text-[var(--brand)]" />
          <h4 className="text-xs font-semibold text-[var(--text-1)] uppercase tracking-wider">
            Engine & Prop Target
          </h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-[var(--text-2)] mb-1 font-medium">Backtest Engine</label>
            <select
              value={settings.engine}
              onChange={(e) => updateField('engine', e.target.value as any)}
              className="w-full px-2.5 py-1.5 rounded-md bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-1)] text-xs focus:outline-hidden focus:border-[var(--brand)]"
            >
              <option value="pinets-ast">PineTS AST Interpreter (Official Pine v5)</option>
              <option value="fast-quant">Fast Quant Native Engine (10x Speed)</option>
            </select>
          </div>

          <div>
            <label className="block text-[var(--text-2)] mb-1 font-medium">Prop Firm Compliance Audit</label>
            <select
              value={settings.propProfileId}
              onChange={(e) => updateField('propProfileId', e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-md bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-1)] text-xs focus:outline-hidden focus:border-[var(--brand)]"
            >
              <option value="tradeify_select_100k">Tradeify Select ($100k · 3% EOD · 40% Cons.)</option>
              <option value="tradeify_growth_100k">Tradeify Growth ($100k · Static DD)</option>
              <option value="apex_50k">Apex Trader Funding ($50k)</option>
              <option value="topstep_50k">Topstep ($50k Trading Combine)</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Reset button */}
      {onReset && (
        <div className="flex justify-end">
          <Button size="sm" variant="ghost" onClick={onReset} className="text-xs gap-1">
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Settings to Default</span>
          </Button>
        </div>
      )}
    </div>
  );
}
