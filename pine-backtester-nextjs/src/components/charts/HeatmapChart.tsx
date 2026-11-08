'use client';

import React, { useState } from 'react';
import { MonthlyHeatmapRow, MonthlyRecord } from '@/types/backtest';

const MONTH_COLS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface HeatmapChartProps {
  rows: MonthlyHeatmapRow[];
  interactive?: boolean;
  className?: string;
}

export const HeatmapChart: React.FC<HeatmapChartProps> = ({
  rows,
  interactive = true,
  className = '',
}) => {
  const [hoverCell, setHoverCell] = useState<{ record: MonthlyRecord; x: number; y: number } | null>(null);

  if (!rows || rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-28 text-xs text-[#6B7587]">
        No monthly performance history available
      </div>
    );
  }

  const getCellBg = (rec: MonthlyRecord | null) => {
    if (!rec) return 'bg-[#F9FAFB] text-[#CBD1DA]';
    const r = rec.profitR;
    if (r > 8) return 'bg-[#0E9F6E] text-white font-bold';
    if (r > 4) return 'bg-[#31C48D] text-white font-medium';
    if (r > 0) return 'bg-[#84E1BC] text-[#0A7A55] font-medium';
    if (r === 0) return 'bg-[#F0F2F5] text-[#475266]';
    if (r > -3) return 'bg-[#F8B4B4] text-[#C0223A] font-medium';
    return 'bg-[#E02424] text-white font-bold';
  };

  return (
    <div className={`relative flex flex-col w-full overflow-x-auto select-none ${className}`}>
      <table className="w-full text-center border-collapse text-xs font-mono">
        <thead>
          <tr className="border-b border-[#E2E5EA] text-[#6B7587] text-[11px]">
            <th className="py-2 px-2 text-left font-semibold">Year</th>
            {MONTH_COLS.map((m) => (
              <th key={m} className="py-2 px-1.5 font-semibold">
                {m}
              </th>
            ))}
            <th className="py-2 px-2.5 font-bold text-[#0E1520] border-l border-[#E2E5EA]">
              YTD Return
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.year} className="border-b border-[#E2E5EA]/60">
              <td className="py-2 px-2 text-left font-bold text-[#0E1520]">
                {row.year}
              </td>
              {row.months.map((rec, mIdx) => (
                <td key={mIdx} className="p-1">
                  <div
                    className={`h-8 rounded flex items-center justify-center text-[11px] tabular-nums transition-transform ${getCellBg(
                      rec
                    )} ${rec ? 'cursor-pointer hover:scale-105' : ''}`}
                    onMouseEnter={(e) => {
                      if (interactive && rec) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoverCell({ record: rec, x: rect.left, y: rect.top });
                      }
                    }}
                    onMouseLeave={() => interactive && setHoverCell(null)}
                  >
                    {rec ? `${rec.profitR >= 0 ? '+' : ''}${rec.profitR.toFixed(1)}R` : '—'}
                  </div>
                </td>
              ))}
              <td className="py-2 px-2.5 border-l border-[#E2E5EA] text-right font-bold tabular-nums">
                <span
                  className={
                    row.ytdReturnR >= 0 ? 'text-[#0A7A55]' : 'text-[#C0223A]'
                  }
                >
                  {row.ytdReturnR >= 0 ? '+' : ''}{row.ytdReturnR.toFixed(1)}R ({row.ytdReturnR >= 0 ? '+' : ''}{row.ytdReturnPct.toFixed(1)}%)
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Hover Card */}
      {hoverCell && (
        <div className="absolute top-0 right-0 z-20 p-2.5 rounded-lg bg-[#0E1520] text-white text-[11px] shadow-lg font-mono">
          <div className="font-bold text-sm mb-1">{hoverCell.record.monthName}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[#CBD1DA]">
            <span>Net Profit:</span>
            <strong className="text-white text-right font-bold">
              {hoverCell.record.profitCash >= 0 ? '+' : ''}${hoverCell.record.profitCash.toFixed(2)} ({hoverCell.record.profitR >= 0 ? '+' : ''}{hoverCell.record.profitR.toFixed(2)}R)
            </strong>
            <span>Win Rate:</span>
            <span className="text-white text-right">{hoverCell.record.winRate.toFixed(1)}% ({hoverCell.record.wins}W / {hoverCell.record.losses}L)</span>
            <span>Best Day:</span>
            <span className="text-[#31C48D] text-right">+${hoverCell.record.bestDayCash.toFixed(2)}</span>
            <span>Worst Day:</span>
            <span className="text-[#F8B4B4] text-right">-${Math.abs(hoverCell.record.worstDayCash).toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
};

