'use client';

import React, { useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { TimeSliceStat } from '@/types/backtest';

export interface BarChartProps {
  data: TimeSliceStat[];
  width?: number;
  height?: number;
  valueKey?: 'profitR' | 'profitCash' | 'trades' | 'winRate';
  interactive?: boolean;
  className?: string;
}

export const BarChart: React.FC<BarChartProps> = ({
  data,
  width = 640,
  height = 180,
  valueKey = 'profitR',
  interactive = true,
  className = '',
}) => {
  const [hoverItem, setHoverItem] = useState<TimeSliceStat | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-36 text-xs text-[#6B7587]">
        No time-series distribution available
      </div>
    );
  }

  const margin = { top: 12, right: 16, bottom: 28, left: 40 };
  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = Math.max(10, height - margin.top - margin.bottom);

  const values = data.map((d) => d[valueKey]);
  const minVal = Math.min(...values, 0);
  const maxVal = Math.max(...values, 1);

  const yScale = scaleLinear().domain([minVal * 1.15, maxVal * 1.15]).range([innerHeight, 0]);
  const barWidth = innerWidth / data.length;
  const zeroY = yScale(0);

  return (
    <div className={`relative flex flex-col w-full select-none ${className}`}>
      {/* Legend & Hover Info */}
      <div className="flex items-center justify-between mb-1.5 text-xs font-mono">
        <span className="text-[#475266] font-medium">Performance by Segment</span>
        {hoverItem && (
          <div className="text-[11px] text-[#0E1520] font-bold tabular-nums">
            {hoverItem.label}: {hoverItem.trades} trades · {hoverItem.winRate}% WR · {hoverItem.profitR >= 0 ? '+' : ''}{hoverItem.profitR.toFixed(2)}R (+${hoverItem.profitCash.toFixed(2)})
          </div>
        )}
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {/* Zero baseline */}
          <line x1={0} x2={innerWidth} y1={zeroY} y2={zeroY} stroke="#CBD1DA" strokeWidth={1} />

          {/* Grid lines */}
          {yScale.ticks(4).map((t) => (
            <g key={t} transform={`translate(0, ${yScale(t)})`}>
              <line x1={0} x2={innerWidth} stroke="#F0F2F5" strokeWidth={1} />
              <text x={-6} y={3} textAnchor="end" className="text-[9px] fill-[#6B7587] font-mono">
                {t >= 0 ? '+' : ''}{t.toFixed(1)}
              </text>
            </g>
          ))}

          {/* Bars */}
          {data.map((item, i) => {
            const val = item[valueKey];
            const isPos = val >= 0;
            const barY = isPos ? yScale(val) : zeroY;
            const barH = Math.abs(yScale(val) - zeroY);
            const x = i * barWidth;
            const isHovered = hoverItem === item;

            return (
              <g
                key={item.label}
                onMouseEnter={() => interactive && setHoverItem(item)}
                onMouseLeave={() => interactive && setHoverItem(null)}
                className="cursor-pointer"
              >
                <rect
                  x={x + 1}
                  y={barY}
                  width={Math.max(1, barWidth - 2)}
                  height={Math.max(2, barH)}
                  rx={1.5}
                  fill={
                    isHovered
                      ? isPos
                        ? '#089981'
                        : '#F23645'
                      : isPos
                        ? 'rgba(8, 153, 129, 0.75)'
                        : 'rgba(242, 54, 69, 0.75)'
                  }
                  stroke={isHovered ? '#0E1520' : 'none'}
                  strokeWidth={1}
                />
                {/* X-axis label */}
                {i % Math.ceil(data.length / 8) === 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={innerHeight + 14}
                    textAnchor="middle"
                    className="text-[9px] fill-[#6B7587] font-mono"
                  >
                    {item.label.split(' ')[0]}
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


