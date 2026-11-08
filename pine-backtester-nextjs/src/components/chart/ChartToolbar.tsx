'use client';

import React from 'react';
import {
  Layers,
  Camera,
  Maximize2,
  Minimize2,
  PenTool,
  Bookmark,
  TrendingUp,
  Activity,
  RotateCcw,
} from 'lucide-react';
import { IconButton } from '../ui/IconButton';

export interface ChartToolbarProps {
  symbol: string;
  timeframe: string;
  showBoxes: boolean;
  onToggleBoxes: () => void;
  showMarks: boolean;
  onToggleMarks: () => void;
  showEma: boolean;
  onToggleEma: () => void;
  showBands: boolean;
  onToggleBands: () => void;
  showToolbar: boolean;
  onToggleToolbar: () => void;
  onSelectPreset: (preset: '1D' | '1W' | '1M' | '3M' | 'ALL') => void;
  onFit: () => void;
  onScreenshot: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

export const ChartToolbar: React.FC<ChartToolbarProps> = ({
  symbol,
  timeframe,
  showBoxes,
  onToggleBoxes,
  showMarks,
  onToggleMarks,
  showEma,
  onToggleEma,
  showBands,
  onToggleBands,
  showToolbar,
  onToggleToolbar,
  onSelectPreset,
  onFit,
  onScreenshot,
  isFullscreen,
  onToggleFullscreen,
}) => {
  return (
    <div className="h-10 px-3 bg-white border-b border-[#E2E5EA] flex items-center justify-between gap-2 select-none shrink-0 text-xs">
      {/* Left: Symbol, TF, Range Presets */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#F0F2F5] border border-[#CBD1DA] font-semibold text-[#0E1520] font-mono text-[11px]">
          <span>{symbol}</span>
          <span className="text-[#6B7587]">·</span>
          <span className="text-[#2B59FF] font-bold">{timeframe}m</span>
        </div>

        <div className="h-4 w-px bg-[#E2E5EA] mx-0.5 hidden sm:block" />

        {/* Range Presets */}
        <div className="hidden sm:flex items-center gap-0.5 bg-[#F0F2F5] rounded-md p-0.5 font-mono text-[11px]">
          {(['1D', '1W', '1M', '3M', 'ALL'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onSelectPreset(p)}
              className="px-1.5 py-0.5 rounded text-[#475266] hover:text-[#0E1520] hover:bg-white transition-all cursor-pointer font-medium"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Right: Layer Toggles, Drawing Toolbar, Tools */}
      <div className="flex items-center gap-1">
        {/* Trade Execution Boxes Toggle */}
        <IconButton
          icon={<Layers size={14} />}
          label={showBoxes ? 'Hide Trade Boxes' : 'Show Trade Boxes'}
          active={showBoxes}
          onClick={onToggleBoxes}
          size="sm"
        />

        {/* Marks Lane Toggle */}
        <IconButton
          icon={<Bookmark size={14} />}
          label={showMarks ? 'Hide Trade Markers' : 'Show Trade Markers'}
          active={showMarks}
          onClick={onToggleMarks}
          size="sm"
        />

        {/* EMA Trend Lines Toggle */}
        <IconButton
          icon={<TrendingUp size={14} />}
          label={showEma ? 'Hide EMA 50/200' : 'Show EMA 50/200'}
          active={showEma}
          onClick={onToggleEma}
          size="sm"
        />

        {/* Volatility Bands Toggle */}
        <IconButton
          icon={<Activity size={14} />}
          label={showBands ? 'Hide Volatility Bands' : 'Show Volatility Bands'}
          active={showBands}
          onClick={onToggleBands}
          size="sm"
        />

        <div className="h-4 w-px bg-[#E2E5EA] mx-0.5" />

        {/* Native Drawing Toolbar Toggle */}
        <IconButton
          icon={<PenTool size={14} />}
          label={showToolbar ? 'Hide Drawing Toolbar' : 'Show Drawing Toolbar'}
          active={showToolbar}
          onClick={onToggleToolbar}
          size="sm"
        />

        {/* Reset / Fit View */}
        <IconButton
          icon={<RotateCcw size={14} />}
          label="Reset Autoscale / Fit"
          onClick={onFit}
          size="sm"
        />

        {/* Screenshot PNG */}
        <IconButton
          icon={<Camera size={14} />}
          label="Export Chart PNG"
          onClick={onScreenshot}
          size="sm"
        />

        {/* Fullscreen */}
        <IconButton
          icon={isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          onClick={onToggleFullscreen}
          size="sm"
        />
      </div>
    </div>
  );
};

