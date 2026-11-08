'use client';

import React, { useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { area, line, curveMonotoneX } from 'd3-shape';
import { MonteCarloBand } from '@/types/backtest';

export interface FanChartProps {
  bands: MonteCarloBand[];
  initialCapital?: number;
  width?: number;
  height?: number;
  interactive?: boolean;
  className?: string;
}

export const FanChart: React.FC<FanChartProps> = ({
  bands,
  initialCapital = 100000,
  width = 680,
  height = 220,
  interactive = true,
  className = '',
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!bands || bands.length === 0) {
    return (
      <div className="flex items-center justify-center h-44 text-xs text-[#6B7587]">
        No Monte Carlo simulation data
      </div>
    );
  }

  const margin = { top: 14, right: 24, bottom: 26, left: 60 };
  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = Math.max(10, height - margin.top - margin.bottom);

  const nSteps = bands.length - 1;
  const p95Max = Math.max(...bands.map((b) => b.p95));
  const p5Min = Math.min(...bands.map((b) => b.p5));

  const yMin = Math.floor(Math.min(p5Min, initialCapital) * 0.96);
  const yMax = Math.ceil(p95Max * 1.04);

  const xScale = scaleLinear().domain([0, nSteps]).range([0, innerWidth]);
  const yScale = scaleLinear().domain([yMin, yMax]).range([innerHeight, 0]);

  // Outer Band: 5th to 95th percentile
  const outerAreaGen = area<MonteCarloBand>()
    .x((d) => xScale(d.tradeIndex))
    .y0((d) => yScale(d.p5))
    .y1((d) => yScale(d.p95))
    .curve(curveMonotoneX);

  // Inner Band: 25th to 75th percentile
  const innerAreaGen = area<MonteCarloBand>()
    .x((d) => xScale(d.tradeIndex))
    .y0((d) => yScale(d.p25))
    .y1((d) => yScale(d.p75))
    .curve(curveMonotoneX);

  // Median (50th) Line
  const medianLineGen = line<MonteCarloBand>()
    .x((d) => xScale(d.tradeIndex))
    .y((d) => yScale(d.p50))
    .curve(curveMonotoneX);

  const outerPath = outerAreaGen(bands) || '';
  const innerPath = innerAreaGen(bands) || '';
  const medianPath = medianLineGen(bands) || '';

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!interactive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - margin.left;
    if (mouseX < 0 || mouseX > innerWidth) {
      setHoverIndex(null);
      return;
    }
    const ratio = Math.max(0, Math.min(1, mouseX / innerWidth));
    const idx = Math.round(ratio * nSteps);
    setHoverIndex(idx);
  };

  const activeBand = hoverIndex !== null && bands[hoverIndex] ? bands[hoverIndex] : null;

  return (
    <div className={`relative flex flex-col w-full select-none ${className}`}>
      {/* Legend & Hover Info */}
      <div className="flex items-center justify-between mb-1.5 text-xs font-mono">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-[#2B59FF] font-bold" />
            <span className="text-[#0E1520] font-medium">50th % (Median)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-2 bg-[#2B59FF]/30 rounded-xs" />
            <span className="text-[#475266]">25th-75th % Band</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-2 bg-[#2B59FF]/12 rounded-xs" />
            <span className="text-[#6B7587]">5th-95th % Fan</span>
          </div>
        </div>

        {activeBand && (
          <div className="flex items-center gap-3 text-[11px] tabular-nums font-mono">
            <span>Trade #{activeBand.tradeIndex}</span>
            <span className="text-[#6B7587]">P5: ${activeBand.p5.toFixed(0)}</span>
            <span className="text-[#2B59FF] font-bold">P50: ${activeBand.p50.toFixed(0)}</span>
            <span className="text-[#0A7A55]">P95: ${activeBand.p95.toFixed(0)}</span>
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {/* Baseline initial capital */}
          <line
            x1={0}
            x2={innerWidth}
            y1={yScale(initialCapital)}
            y2={yScale(initialCapital)}
            stroke="#CBD1DA"
            strokeWidth={1}
            strokeDasharray="3 3"
          />

          {/* Grid lines */}
          {yScale.ticks(4).map((t) => (
            <g key={t} transform={`translate(0, ${yScale(t)})`}>
              <line x1={0} x2={innerWidth} stroke="#F0F2F5" strokeWidth={1} />
              <text x={-8} y={3} textAnchor="end" className="text-[10px] fill-[#6B7587] font-mono tabular-nums">
                ${t >= 1000 ? `${(t / 1000).toFixed(0)}k` : t.toFixed(0)}
              </text>
            </g>
          ))}

          {/* 5th-95th Fan Area */}
          <path d={outerPath} fill="rgba(43, 89, 255, 0.12)" />

          {/* 25th-75th Band Area */}
          <path d={innerPath} fill="rgba(43, 89, 255, 0.28)" />

          {/* 50th Median Line */}
          <path d={medianPath} fill="none" stroke="#2B59FF" strokeWidth={2} />

          {/* Active pointer guide */}
          {activeBand && (
            <line
              x1={xScale(activeBand.tradeIndex)}
              x2={xScale(activeBand.tradeIndex)}
              y1={0}
              y2={innerHeight}
              stroke="#2B59FF"
              strokeWidth={1}
              strokeDasharray="2 2"
            />
          )}
        </g>
      </svg>
    </div>
  );
};

