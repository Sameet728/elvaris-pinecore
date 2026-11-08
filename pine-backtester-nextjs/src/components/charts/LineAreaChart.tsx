'use client';

import React, { useState, useId } from 'react';
import { scaleLinear, scaleTime } from 'd3-scale';
import { line, area, curveMonotoneX } from 'd3-shape';

export interface LineAreaPoint {
  time: number;
  value: number;
  secondaryValue?: number;
  label?: string;
}

export interface LineAreaChartProps {
  data: LineAreaPoint[];
  width?: number;
  height?: number;
  color?: string;
  interactive?: boolean;
  valuePrefix?: string;
  valueSuffix?: string;
  showSecondary?: boolean;
  primaryLabel?: string;
  secondaryLabel?: string;
  className?: string;
}

export const LineAreaChart: React.FC<LineAreaChartProps> = ({
  data,
  width = 680,
  height = 240,
  interactive = true,
  valuePrefix = '$',
  valueSuffix = '',
  showSecondary = true,
  primaryLabel = 'Strategy Equity',
  secondaryLabel = 'Buy & Hold',
  className = '',
}) => {
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-xs text-[#6B7587]">
        No equity data available
      </div>
    );
  }

  const margin = { top: 16, right: 24, bottom: 28, left: 60 };
  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = Math.max(10, height - margin.top - margin.bottom);

  const times = data.map((d) => d.time);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);

  const values = data.map((d) => d.value);
  if (showSecondary) {
    data.forEach((d) => {
      if (d.secondaryValue !== undefined) values.push(d.secondaryValue);
    });
  }

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const yPadding = (maxValue - minValue) * 0.08 || 100;
  const yMin = Math.floor(minValue - yPadding);
  const yMax = Math.ceil(maxValue + yPadding);

  const xScale = scaleTime()
    .domain([new Date(minTime), new Date(maxTime)])
    .range([0, innerWidth]);

  const yScale = scaleLinear()
    .domain([yMin, yMax])
    .range([innerHeight, 0]);

  // Generators
  const primaryAreaGen = area<LineAreaPoint>()
    .x((d) => xScale(new Date(d.time)))
    .y0(innerHeight)
    .y1((d) => yScale(d.value))
    .curve(curveMonotoneX);

  const primaryLineGen = line<LineAreaPoint>()
    .x((d) => xScale(new Date(d.time)))
    .y((d) => yScale(d.value))
    .curve(curveMonotoneX);

  const secondaryLineGen = line<LineAreaPoint>()
    .x((d) => xScale(new Date(d.time)))
    .y((d) => yScale(d.secondaryValue ?? d.value))
    .curve(curveMonotoneX);

  const primaryAreaPath = primaryAreaGen(data) || '';
  const primaryLinePath = primaryLineGen(data) || '';
  const secondaryLinePath = showSecondary ? secondaryLineGen(data) || '' : '';

  // Y-axis ticks
  const yTicks = yScale.ticks(5);
  // X-axis ticks
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
      <div className="flex items-center justify-between mb-2 text-xs font-mono">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-[#2B59FF] rounded-full" />
            <span className="text-[#0E1520] font-medium">{primaryLabel}</span>
          </div>
          {showSecondary && (
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#94A3B8] rounded-full stroke-dasharray" />
              <span className="text-[#6B7587]">{secondaryLabel}</span>
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
            <span className="text-[#2B59FF] font-bold">
              {valuePrefix}{activePoint.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{valueSuffix}
            </span>
            {showSecondary && activePoint.secondaryValue !== undefined && (
              <span className="text-[#6B7587]">
                B&H: {valuePrefix}{activePoint.secondaryValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{valueSuffix}
              </span>
            )}
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
            <stop offset="0%" stopColor="#2B59FF" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#2B59FF" stopOpacity="0.0" />
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
                {valuePrefix}{t >= 1000 ? `${(t / 1000).toFixed(0)}k` : t.toFixed(0)}
              </text>
            </g>
          ))}

          {/* Vertical Grid lines */}
          {xTicks.map((t) => (
            <g key={t.getTime()} transform={`translate(${xScale(t)}, 0)`}>
              <line y1={0} y2={innerHeight} stroke="#F0F2F5" strokeWidth={1} />
              <text
                y={innerHeight + 16}
                textAnchor="middle"
                className="text-[10px] fill-[#6B7587] font-mono"
              >
                {t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </text>
            </g>
          ))}

          {/* Secondary Line (Buy & Hold) */}
          {showSecondary && (
            <path
              d={secondaryLinePath}
              fill="none"
              stroke="#94A3B8"
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
          )}

          {/* Primary Area & Line */}
          <path d={primaryAreaPath} fill={`url(#${gradientId})`} />
          <path
            d={primaryLinePath}
            fill="none"
            stroke="#2B59FF"
            strokeWidth={2}
          />

          {/* Interactive Crosshair & Tooltip Point */}
          {interactive && activePoint && (
            <g>
              <line
                x1={xScale(new Date(activePoint.time))}
                x2={xScale(new Date(activePoint.time))}
                y1={0}
                y2={innerHeight}
                stroke="#2B59FF"
                strokeWidth={1}
                strokeDasharray="2 2"
              />
              <circle
                cx={xScale(new Date(activePoint.time))}
                cy={yScale(activePoint.value)}
                r={4}
                fill="#2B59FF"
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

