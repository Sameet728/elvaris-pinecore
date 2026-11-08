'use client';

import React, { useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { HistogramBin } from '@/types/backtest';

export interface HistogramChartProps {
  bins: HistogramBin[];
  width?: number;
  height?: number;
  meanValue?: number;
  medianValue?: number;
  interactive?: boolean;
  className?: string;
}

export const HistogramChart: React.FC<HistogramChartProps> = ({
  bins,
  width = 640,
  height = 180,
  meanValue,
  medianValue,
  interactive = true,
  className = '',
}) => {
  const [hoverBin, setHoverBin] = useState<HistogramBin | null>(null);

  if (!bins || bins.length === 0) {
    return (
      <div className="flex items-center justify-center h-36 text-xs text-[#6B7587]">
        No distribution data
      </div>
    );
  }

  const margin = { top: 12, right: 16, bottom: 28, left: 36 };
  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = Math.max(10, height - margin.top - margin.bottom);

  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const yScale = scaleLinear().domain([0, maxCount]).range([innerHeight, 0]);

  const barWidth = innerWidth / bins.length;

  return (
    <div className={`relative flex flex-col w-full select-none ${className}`}>
      {/* Legend & Hover Info */}
      <div className="flex items-center justify-between mb-1.5 text-xs font-mono">
        <div className="flex items-center gap-3">
          {meanValue !== undefined && (
            <div className="flex items-center gap-1.5 text-[#2B59FF]">
              <span className="w-2.5 h-0.5 bg-[#2B59FF]" />
              <span>Mean: {meanValue >= 0 ? '+' : ''}{meanValue.toFixed(2)}R</span>
            </div>
          )}
          {medianValue !== undefined && (
            <div className="flex items-center gap-1.5 text-[#0A7A55]">
              <span className="w-2.5 h-0.5 bg-[#0A7A55]" />
              <span>Median: {medianValue >= 0 ? '+' : ''}{medianValue.toFixed(2)}R</span>
            </div>
          )}
        </div>

        {hoverBin && (
          <div className="text-[11px] text-[#0E1520] font-bold tabular-nums">
            {hoverBin.binLabel}: {hoverBin.count} trades ({hoverBin.frequencyPct}%)
          </div>
        )}
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {/* Horizontal grid lines */}
          {yScale.ticks(3).map((t) => (
            <g key={t} transform={`translate(0, ${yScale(t)})`}>
              <line x1={0} x2={innerWidth} stroke="#F0F2F5" strokeWidth={1} />
              <text x={-6} y={3} textAnchor="end" className="text-[9px] fill-[#6B7587] font-mono">
                {t}
              </text>
            </g>
          ))}

          {/* Histogram Bars */}
          {bins.map((bin, i) => {
            const isProfit = bin.binStart >= 0;
            const barH = innerHeight - yScale(bin.count);
            const x = i * barWidth;
            const isHovered = hoverBin === bin;

            return (
              <g
                key={bin.binLabel}
                onMouseEnter={() => interactive && setHoverBin(bin)}
                onMouseLeave={() => interactive && setHoverBin(null)}
                className="cursor-pointer"
              >
                <rect
                  x={x + 1}
                  y={yScale(bin.count)}
                  width={Math.max(1, barWidth - 2)}
                  height={barH}
                  rx={2}
                  fill={
                    isHovered
                      ? isProfit
                        ? '#089981'
                        : '#F23645'
                      : isProfit
                        ? 'rgba(8, 153, 129, 0.7)'
                        : 'rgba(242, 54, 69, 0.7)'
                  }
                  stroke={isHovered ? '#0E1520' : 'none'}
                  strokeWidth={1}
                />
                {/* X-axis tick label for sparse display */}
                {i % Math.ceil(bins.length / 8) === 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={innerHeight + 14}
                    textAnchor="middle"
                    className="text-[9px] fill-[#6B7587] font-mono"
                  >
                    {bin.binLabel}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};


