'use client';

import React from 'react';

export interface ChartLegendProps {
  hudRef: React.RefObject<HTMLDivElement | null>;
  tradesCount?: number;
}

export const ChartLegend: React.FC<ChartLegendProps> = ({ hudRef, tradesCount = 0 }) => {
  return (
    <div className="h-8 px-3 bg-[#F9FAFB] border-t border-[#E2E5EA] flex items-center justify-between text-xs select-none shrink-0">
      {/* Live Crosshair DOM Target (No React Re-render!) */}
      <div ref={hudRef} className="flex-1 min-w-0 overflow-hidden" />

      {/* Right Legend Indicators */}
      <div className="flex items-center gap-3 shrink-0 text-[11px] font-mono text-[#6B7587]">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#1E88E5]" />
          <span>EMA 50</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#F59E0B]" />
          <span>EMA 200</span>
        </div>
        <div className="flex items-center gap-1">
          <span>Trades:</span>
          <strong className="text-[#0E1520]">{tradesCount}</strong>
        </div>
      </div>
    </div>
  );
};

