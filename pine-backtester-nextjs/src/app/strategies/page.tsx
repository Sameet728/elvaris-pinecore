'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/shell/TopBar';
import { Footer } from '@/components/shell/Footer';
import { STRATEGY_PRESETS } from '@/components/editor/PineEditor';
import { Card, Button, Badge } from '@/components/ui';
import { FileCode, Flame, Play, ArrowRight, ShieldCheck, CheckCircle } from 'lucide-react';

export default function StrategiesPage() {
  const router = useRouter();

  const handleLoadStrategy = (filename: string) => {
    // Save to localStorage or query param and navigate to home workspace
    if (typeof window !== 'undefined') {
      localStorage.setItem('elvaris_selected_preset', filename);
    }
    router.push(`/?preset=${encodeURIComponent(filename)}`);
  };

  const descriptions: Record<string, { desc: string; tags: string[]; tf: string; target: string }> = {
    'Champion_15M_Grandmaster_Dual10R_Oct8R_STRATEGY.pine': {
      desc: 'Dual 10R Pace institutional strategy calibrated for Tradeify Select challenge rules. Combines 50/200 EMA trend confirmation, volatility bands, and flash crash filter.',
      tags: ['Strategy', '15M Timeframe', 'Gold (XAUUSD)', 'Tradeify Verified'],
      tf: '15 Minutes',
      target: 'Tradeify Select $100K',
    },
    'Champion_15M_Grandmaster_Dual10R_Oct8R_INDICATOR.pine': {
      desc: 'Visual chart indicator counterpart for Grandmaster 15M. Plots real-time execution signals, dual HUD tables, and risk metrics on chart.',
      tags: ['Indicator', 'Visual HUD', 'Signals', '15M Timeframe'],
      tf: '15 Minutes',
      target: 'Chart Overlay',
    },
    'Champion_15M_Apex_88WR_STRATEGY.pine': {
      desc: 'Apex-calibrated high-frequency trend-following setup with strict London/NY active session filters and quick volatility band mean reversion.',
      tags: ['Strategy', 'High Frequency', 'Apex Funding', '15M Timeframe'],
      tf: '15 Minutes',
      target: 'Apex $50K Challenge',
    },
    'Champion_15M_Apex_88WR_INDICATOR.pine': {
      desc: 'Indicator script with visual position tools and high-contrast execution badges for the Apex 15M system.',
      tags: ['Indicator', 'Visual Signals', '15M Timeframe'],
      tf: '15 Minutes',
      target: 'Chart Overlay',
    },
    'Champion_15M_1to2RR_75WR_STRATEGY.pine': {
      desc: 'Asymmetric 1:2 Risk/Reward ratio strategy engineered for high-expectancy trend expansion while preserving conservative drawdown.',
      tags: ['Strategy', '1:2 Asymmetric R:R', 'Trend Follow'],
      tf: '15 Minutes',
      target: 'Standard Futures/Forex',
    },
    'Champion_15M_1to2RR_75WR_INDICATOR.pine': {
      desc: 'Indicator companion for 1:2 Risk/Reward Parity strategy with real-time target and stop-loss level plots.',
      tags: ['Indicator', 'R:R Visualizer', '15M Timeframe'],
      tf: '15 Minutes',
      target: 'Chart Overlay',
    },
    'Champion_15M_80WR_Elite_STRATEGY.pine': {
      desc: 'Elite volatility scalp model utilizing dynamic standard deviation channels and RSI momentum boundary confirmation.',
      tags: ['Strategy', 'Volatility Scalp', 'RSI Boundary'],
      tf: '15 Minutes',
      target: 'Prop Firm Challenge',
    },
    'Champion_15M_80WR_Elite_INDICATOR.pine': {
      desc: 'Elite scalp indicator displaying band baselines, breakout alerts, and intraday streak tracking.',
      tags: ['Indicator', 'Volatility Channels', 'Alerts'],
      tf: '15 Minutes',
      target: 'Chart Overlay',
    },
  };

  return (
    <div className="min-h-screen bg-[var(--bg-app)] flex flex-col">
      <TopBar />

      <main className="flex-1 max-w-6xl w-full mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Flame className="w-5 h-5 text-[var(--brand)]" />
              <h1 className="text-xl font-bold text-[var(--text-1)]">Strategy & Indicator Library</h1>
            </div>
            <p className="text-xs text-[var(--text-3)]">
              All 8 production-grade Pine Script v5 models. Fully calibrated for confirmed candle-close execution with zero lookahead bias.
            </p>
          </div>
          <Link href="/">
            <Button size="sm" variant="outline" className="text-xs gap-1.5">
              <span>Back to Workspace</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>

        {/* Strategy Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {STRATEGY_PRESETS.map((preset) => {
            const meta = descriptions[preset.filename] || {
              desc: 'Calibrated Pine Script v5 quantitative trading model.',
              tags: [preset.type.toUpperCase(), '15M Timeframe'],
              tf: '15 Minutes',
              target: 'Universal',
            };
            const isStrategy = preset.type === 'strategy';

            return (
              <Card key={preset.id} className="p-5 flex flex-col justify-between hover:border-[var(--brand)]/50 transition-all bg-[var(--bg-surface)]">
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                          isStrategy
                            ? 'bg-[var(--brand)]/10 text-[var(--brand)]'
                            : 'bg-purple-100 text-purple-700'
                        }`}>
                          {preset.type}
                        </span>
                        <span className="text-[11px] font-mono text-[var(--text-3)]">
                          {preset.filename}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-[var(--text-1)]">{preset.name}</h3>
                    </div>
                  </div>

                  <p className="text-xs text-[var(--text-2)] mb-4 leading-relaxed">
                    {meta.desc}
                  </p>

                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {meta.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--bg-subtle)] text-[var(--text-3)] border border-[var(--border-subtle)]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between">
                  <div className="text-[11px] text-[var(--text-3)]">
                    Target: <strong className="text-[var(--text-1)]">{meta.target}</strong>
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => handleLoadStrategy(preset.filename)}
                    className="text-xs h-7 gap-1.5"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Load in Editor</span>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </main>
      <Footer />
    </div>
  );
}
