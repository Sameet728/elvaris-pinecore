'use client';

import React, { useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { ScatterPoint } from '@/types/backtest';

export interface ScatterChartProps {
  points: ScatterPoint[];
  xKey?: 'maeR' | 'mfeR';
  width?: number;
  height?: number;
  interactive?: boolean;
  className?: string;
}

export const ScatterChart: React.FC<ScatterChartProps> = ({
  points,
  xKey = 'maeR',
  width = 640,
  height = 180,
  interactive = true,
  className = '',
}) => {
  const [hoverPoint, setHoverPoint] = useState<ScatterPoint | null>(null);

  if (!points || points.length === 0) {
    return (
      <div className="flex items-center justify-center h-36 text-xs text-[#6B7587]">
        No scatter data
      </div>
    );
  }

  const margin = { top: 12, right: 16, bottom: 28, left: 40 };
  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = Math.max(10, height - margin.top - margin.bottom);

  const xValues = points.map((p) => p[xKey]);
  const yValues = points.map((p) => p.pnlR);

  const xMax = Math.max(...xValues, 1.5);
  const yMin = Math.min(...yValues, -1.2);
  const yMax = Math.max(...yValues, 1.5);

  const xScale = scaleLinear().domain([0, xMax * 1.1]).range([0, innerWidth]);
  const yScale = scaleLinear().domain([yMin * 1.1, yMax * 1.1]).range([innerHeight, 0]);

  const xLabel = xKey === 'maeR' ? 'Maximum Adverse Excursion (MAE in R)' : 'Maximum Favorable Excursion (MFE in R)';

  return (
    <div className={`relative flex flex-col w-full select-none ${className}`}>
      {/* Legend & Hover Info */}
      <div className="flex items-center justify-between mb-1.5 text-xs font-mono">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[#0A7A55]">
            <span className="w-2 h-2 rounded-full bg-[#089981]" />
            <span>Winning Trades</span>
          </div>
          <div className="flex items-center gap-1.5 text-[#C0223A]">
            <span className="w-2 h-2 rounded-full bg-[#F23645]" />
            <span>Losing Trades</span>
          </div>
        </div>

        {hoverPoint && (
          <div className="text-[11px] text-[#0E1520] font-bold tabular-nums">
            Trade #{hoverPoint.tradeId}: {xKey.toUpperCase()} {hoverPoint[xKey].toFixed(2)}R → Realized {hoverPoint.pnlR >= 0 ? '+' : ''}{hoverPoint.pnlR.toFixed(2)}R
          </div>
        )}
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {/* Zero R line */}
          <line
            x1={0}
            x2={innerWidth}
            y1={yScale(0)}
            y2={yScale(0)}
            stroke="#CBD1DA"
            strokeWidth={1}
            strokeDasharray="2 2"
          />

          {/* Grid lines */}
          {yScale.ticks(4).map((t) => (
            <g key={t} transform={`translate(0, ${yScale(t)})`}>
              <line x1={0} x2={innerWidth} stroke="#F0F2F5" strokeWidth={1} />
              <text x={-6} y={3} textAnchor="end" className="text-[9px] fill-[#6B7587] font-mono">
                {t >= 0 ? '+' : ''}{t.toFixed(1)}R
              </text>
            </g>
          ))}

          {xScale.ticks(5).map((t) => (
            <g key={t} transform={`translate(${xScale(t)}, 0)`}>
              <line y1={0} y2={innerHeight} stroke="#F0F2F5" strokeWidth={1} />
              <text y={innerHeight + 14} textAnchor="middle" className="text-[9px] fill-[#6B7587] font-mono">
                {t.toFixed(1)}R
              </text>
            </g>
          ))}

          {/* Scatter Points */}
          {points.map((p) => {
            const isHovered = hoverPoint === p;
            return (
              <circle
                key={p.tradeId}
                cx={xScale(p[xKey])}
                cy={yScale(p.pnlR)}
                r={isHovered ? 5 : 3.5}
                fill={p.isWin ? '#089981' : '#F23645'}
                fillOpacity={0.8}
                stroke={isHovered ? '#0E1520' : '#FFFFFF'}
                strokeWidth={isHovered ? 1.5 : 1}
                className="cursor-pointer transition-all"
                onMouseEnter={() => interactive && setHoverPoint(p)}
                onMouseLeave={() => interactive && setHoverPoint(null)}
              />
            );
          })}

          {/* X Axis Label */}
          <text
            x={innerWidth / 2}
            y={innerHeight + 24}
            textAnchor="middle"
            className="text-[9px] fill-[#6B7587] font-sans"
          >
            {xLabel}
          </text>
        </g>
      </svg>
    </div>
  );
};

