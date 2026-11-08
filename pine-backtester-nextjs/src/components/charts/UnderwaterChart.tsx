'use client';

import React, { useState, useId } from 'react';
import { scaleLinear, scaleTime } from 'd3-scale';
import { line, area, curveMonotoneX } from 'd3-shape';

export interface UnderwaterPoint {
  time: number;
  drawdownPct: number;
  drawdownCash: number;
}

export interface UnderwaterChartProps {
  data: UnderwaterPoint[];
  width?: number;
  height?: number;
  interactive?: boolean;
  limitPct?: number; // e.g. 3.0 for Tradeify 3% EOD limit
  className?: string;
}

export const UnderwaterChart: React.FC<UnderwaterChartProps> = ({
  data,
  width = 680,
  height = 200,
  interactive = true,
  limitPct = 3.0,
  className = '',
}) => {
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-[#6B7587]">
        No drawdown data available
      </div>
    );
  }

  const margin = { top: 14, right: 24, bottom: 24, left: 50 };
  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = Math.max(10, height - margin.top - margin.bottom);

  const times = data.map((d) => d.time);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);

  const maxDDPct = Math.max(...data.map((d) => d.drawdownPct), limitPct, 1.0);
  const yDomainMax = Math.ceil(maxDDPct * 1.15);

  const xScale = scaleTime()
    .domain([new Date(minTime), new Date(maxTime)])
    .range([0, innerWidth]);

  // Inverted Y: 0% is at the top (y = 0), max drawdown is at the bottom (y = innerHeight)
  const yScale = scaleLinear()
    .domain([0, yDomainMax])
    .range([0, innerHeight]);

  const areaGen = area<UnderwaterPoint>()
    .x((d) => xScale(new Date(d.time)))
    .y0(0) // baseline at 0%
    .y1((d) => yScale(d.drawdownPct))
    .curve(curveMonotoneX);

  const lineGen = line<UnderwaterPoint>()
    .x((d) => xScale(new Date(d.time)))
    .y((d) => yScale(d.drawdownPct))
    .curve(curveMonotoneX);

  const areaPath = areaGen(data) || '';
  const linePath = lineGen(data) || '';

  const yTicks = yScale.ticks(4);
  const xTicks = xScale.ticks(5);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!interactive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - margin.left;
    if (mouseX < 0 || mouseX > innerWidth) {
      setHoverIndex(null);
      return;
    }
    const ratio = Math.max(0, Math.min(1, mouseX / innerWidth));
    const idx = Math.round(ratio * (data.length - 1));
    setHoverIndex(idx);
  };

  const activePoint = hoverIndex !== null ? data[hoverIndex] : null;

  return (
    <div className={`relative flex flex-col w-full select-none ${className}`}>
      {/* Legend & Hover Info */}
      <div className="flex items-center justify-between mb-1.5 text-xs font-mono">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-[#E0314A] rounded-full" />
            <span className="text-[#0E1520] font-medium">Underwater Drawdown</span>
          </div>
          {limitPct > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#E0314A] opacity-60 border-t border-dashed" />
              <span className="text-[#C0223A] font-medium">Tradeify {limitPct}% DD Limit</span>
            </div>
          )}
        </div>

        {activePoint && (
          <div className="flex items-center gap-3 text-[11px] tabular-nums">
            <span className="text-[#6B7587]">
              {new Date(activePoint.time).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
            <span className="text-[#C0223A] font-bold">
              -{activePoint.drawdownPct.toFixed(2)}% (-${activePoint.drawdownCash.toFixed(2)})
            </span>
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E0314A" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#E0314A" stopOpacity="0.25" />
          </linearGradient>
        </defs>

        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {/* Horizontal Grid lines */}
          {yTicks.map((t) => (
            <g key={t} transform={`translate(0, ${yScale(t)})`}>
              <line x1={0} x2={innerWidth} stroke="#F0F2F5" strokeWidth={1} />
              <text
                x={-8}
                y={3}
                textAnchor="end"
                className="text-[10px] fill-[#6B7587] font-mono tabular-nums"
              >
                -{t.toFixed(1)}%
              </text>
            </g>
          ))}

          {/* Vertical Grid lines */}
          {xTicks.map((t) => (
            <g key={t.getTime()} transform={`translate(${xScale(t)}, 0)`}>
              <line y1={0} y2={innerHeight} stroke="#F0F2F5" strokeWidth={1} />
              <text
                y={innerHeight + 14}
                textAnchor="middle"
                className="text-[10px] fill-[#6B7587] font-mono"
              >
                {t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </text>
            </g>
          ))}

          {/* Tradeify Limit Line */}
          {limitPct > 0 && limitPct <= yDomainMax && (
            <g transform={`translate(0, ${yScale(limitPct)})`}>
              <line
                x1={0}
                x2={innerWidth}
                stroke="#E0314A"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
              <text
                x={innerWidth - 4}
                y={-4}
                textAnchor="end"
                className="text-[9px] fill-[#C0223A] font-mono font-semibold"
              >
                3% Hard DD Limit Floor
              </text>
            </g>
          )}

          {/* Underwater Area & Line */}
          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path d={linePath} fill="none" stroke="#E0314A" strokeWidth={2} />

          {/* Interactive Crosshair */}
          {interactive && activePoint && (
            <g>
              <line
                x1={xScale(new Date(activePoint.time))}
                x2={xScale(new Date(activePoint.time))}
                y1={0}
                y2={innerHeight}
                stroke="#E0314A"
                strokeWidth={1}
                strokeDasharray="2 2"
              />
              <circle
                cx={xScale(new Date(activePoint.time))}
                cy={yScale(activePoint.drawdownPct)}
                r={4}
                fill="#E0314A"
                stroke="#FFFFFF"
                strokeWidth={2}
              />
            </g>
          )}
        </g>
      </svg>
    </div>
  );
};

