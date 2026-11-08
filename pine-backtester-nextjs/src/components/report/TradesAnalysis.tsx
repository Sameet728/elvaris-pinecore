'use client';

import React, { useState } from 'react';
import { ReportAnalytics } from '@/types/backtest';
import { HistogramChart } from '../charts/HistogramChart';
import { ScatterChart } from '../charts/ScatterChart';
import { HeatmapChart } from '../charts/HeatmapChart';
import { BarChart } from '../charts/BarChart';
import { SegmentedControl } from '../ui/SegmentedControl';

export interface TradesAnalysisProps {
  analytics: ReportAnalytics;
  className?: string;
}

export const TradesAnalysis: React.FC<TradesAnalysisProps> = ({
  analytics,
  className = '',
}) => {
  const [timeSliceTab, setTimeSliceTab] = useState<'heatmap' | 'hour' | 'weekday' | 'session'>('heatmap');
  const { distributions, timeStats, kpis, monthly } = analytics;

  return (
    <div className={`flex flex-col gap-5 ${className}`}>
      {/* 1. Distributions Row: R-Histogram & Duration-Histogram */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* R-Multiple Distribution */}
        <div className="p-4 rounded-xl bg-white border border-[#E2E5EA] shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h4 className="text-xs font-bold text-[#0E1520] uppercase tracking-wider">
                Realized R-Multiple Distribution (0.25R Bins)
              </h4>
              <p className="text-[11px] text-[#6B7587]">
                Trade payoff frequency clustered by risk multiple returned.
              </p>
            </div>
          </div>
          <HistogramChart
            bins={distributions.rHistogram}
            meanValue={kpis.avgTradeR}
            medianValue={kpis.avgTradeR}
            height={160}
          />
        </div>

        {/* Trade Duration Distribution */}
        <div className="p-4 rounded-xl bg-white border border-[#E2E5EA] shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h4 className="text-xs font-bold text-[#0E1520] uppercase tracking-wider">
                Holding Time Distribution (Bars Held)
              </h4>
              <p className="text-[11px] text-[#6B7587]">
                Candle duration from order fill to confirmed exit.
              </p>
            </div>
          </div>
          <HistogramChart
            bins={distributions.durationHistogram}
            height={160}
          />
        </div>
      </div>

      {/* 2. Adverse & Favorable Excursion Row (MAE & MFE) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* MAE vs Return */}
        <div className="p-4 rounded-xl bg-white border border-[#E2E5EA] shadow-2xs">
          <div className="mb-2">
            <h4 className="text-xs font-bold text-[#0E1520] uppercase tracking-wider">
              Maximum Adverse Excursion (MAE vs Realized R)
            </h4>
            <p className="text-[11px] text-[#6B7587]">
              Measures intra-trade drawdown experienced before hitting TP or SL.
            </p>
          </div>
          <ScatterChart
            points={distributions.scatterMaeMfe}
            xKey="maeR"
            height={160}
          />
        </div>

        {/* MFE vs Return */}
        <div className="p-4 rounded-xl bg-white border border-[#E2E5EA] shadow-2xs">
          <div className="mb-2">
            <h4 className="text-xs font-bold text-[#0E1520] uppercase tracking-wider">
              Maximum Favorable Excursion (MFE vs Realized R)
            </h4>
            <p className="text-[11px] text-[#6B7587]">
              Measures peak unrealized profit achieved before trade exit.
            </p>
          </div>
          <ScatterChart
            points={distributions.scatterMaeMfe}
            xKey="mfeR"
            height={160}
          />
        </div>
      </div>

      {/* 3. Time Series Analysis Strip */}
      <div className="p-4 rounded-xl bg-white border border-[#E2E5EA] shadow-2xs flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E5EA] pb-3">
          <div>
            <h4 className="text-xs font-bold text-[#0E1520] uppercase tracking-wider">
              Temporal Return & Seasonality Analysis
            </h4>
            <p className="text-[11px] text-[#6B7587]">
              Performance decomposed across calendar months, hours, days, and global market sessions.
            </p>
          </div>
          <SegmentedControl
            size="sm"
            value={timeSliceTab}
            onChange={(v) => setTimeSliceTab(v as any)}
            items={[
              { id: 'heatmap', label: 'Monthly Heatmap' },
              { id: 'hour', label: 'Hour (UTC)' },
              { id: 'weekday', label: 'Weekday' },
              { id: 'session', label: 'Sessions' },
            ]}
          />
        </div>

        <div className="pt-1">
          {timeSliceTab === 'heatmap' && (
            <HeatmapChart rows={monthly.heatmap} />
          )}

          {timeSliceTab === 'hour' && (
            <BarChart data={timeStats.byHour} valueKey="profitR" height={190} />
          )}

          {timeSliceTab === 'weekday' && (
            <BarChart data={timeStats.byWeekday} valueKey="profitR" height={190} />
          )}

          {timeSliceTab === 'session' && (
            <BarChart data={timeStats.bySession} valueKey="profitR" height={190} />
          )}
        </div>
      </div>

      {/* 4. Exit Reasons Table */}
      <div className="overflow-hidden border border-[#E2E5EA] rounded-xl bg-white shadow-2xs">
        <div className="px-4 py-2.5 bg-[#F0F2F5] border-b border-[#E2E5EA]">
          <h4 className="text-xs font-bold text-[#0E1520] uppercase tracking-wider">
            Order Exit Reasons Decomposition
          </h4>
        </div>
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#F9FAFB] text-[#6B7587] uppercase text-[10px] font-semibold border-b border-[#E2E5EA]">
              <th className="py-2 px-4">Exit Signal / Bracket</th>
              <th className="py-2 px-3 text-right">Trades Count</th>
              <th className="py-2 px-3 text-right">Win Rate</th>
              <th className="py-2 px-3 text-right">Avg R</th>
              <th className="py-2 px-4 text-right">Total Net Return</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E5EA]">
            {distributions.exitReasons.map((r) => (
              <tr key={r.reason} className="hover:bg-[#F0F2F5]/50 transition-colors">
                <td className="py-2 px-4 font-semibold text-[#0E1520]">
                  {r.reason === 'TP' || r.reason === 'TP HIT'
                    ? '🎯 Take Profit Target (TP Hit)'
                    : r.reason === 'SL' || r.reason === 'SL HIT'
                      ? '🛑 Stop Loss Trigger (SL Hit)'
                      : r.reason}
                </td>
                <td className="py-2 px-3 text-right font-mono tabular-nums text-[#475266]">{r.count}</td>
                <td className={`py-2 px-3 text-right font-mono tabular-nums font-semibold ${r.winRate >= 70 ? 'text-[#0A7A55]' : 'text-[#C0223A]'}`}>
                  {r.winRate.toFixed(1)}%
                </td>
                <td className={`py-2 px-3 text-right font-mono tabular-nums ${r.avgR >= 0 ? 'text-[#0A7A55]' : 'text-[#C0223A]'}`}>
                  {r.avgR >= 0 ? '+' : ''}{r.avgR.toFixed(2)}R
                </td>
                <td className={`py-2 px-4 text-right font-mono tabular-nums font-bold ${r.totalPnlCash >= 0 ? 'text-[#0A7A55]' : 'text-[#C0223A]'}`}>
                  {r.totalPnlCash >= 0 ? '+' : ''}${r.totalPnlCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};


