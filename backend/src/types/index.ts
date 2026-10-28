// Shared TypeScript types for the backend

export interface Candle {
  openTime: number;   // Unix timestamp in milliseconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;     // Real volume from Dukascopy; may be 0 for metals
}

export interface DownloadProgress {
  status: 'downloading' | 'processing' | 'saving' | 'complete' | 'error';
  message: string;
  percent: number;
}

export interface DataMetadata {
  candleCount: number;
  firstCandle: number | null;
  lastCandle: number | null;
  lastDownload: string | null;
  instrument: string;
  timeframe: string;
  provider: string;
}

export interface BacktestTrade {
  id: number;
  bar: number;
  time: number;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  result: 'WIN' | 'LOSS' | 'OPEN';
  profitR: number;
}

export interface BacktestSummary {
  bias: string;
  winRate: number;
  wins: number;
  losses: number;
  expired: number;
  open: number;
  sampleTotal: number;
  cumulativeR: number;
  profitFactor?: number;
  maxDrawdownR: number;
  maxConsWinR: number;
  maxConsLossR: number;
  monthly: Array<{
    month: string;
    returnsR: number;
    winRate: number;
    trades: number;
  }>;
  dataFrom?: string;
}

export interface PineDrawingLabel {
  id: number;
  x: number;
  time?: number;
  y: number;
  text: string;
  color: string;
  textcolor: string;
  style: string;
}

export interface PineDrawingBox {
  id: number;
  left: number;
  leftTime?: number;
  right: number;
  rightTime?: number;
  top: number;
  bottom: number;
  border_color: string;
  bg_color: string;
  text?: string;
}

export interface PineDrawingLine {
  id: number;
  x1: number;
  time1?: number;
  y1: number;
  x2: number;
  time2?: number;
  y2: number;
  color: string;
  style: string;
  width: number;
}

export interface EngineInfo {
  id: 'auto' | 'pinets' | 'pynecore' | 'openpinescript' | 'native';
  name: string;
  repo: string;
  version: string;
  license: string;
  description: string;
  status: 'active' | 'ready';
  features: string[];
}

export interface PineScriptResult {
  success: boolean;
  plots: Record<string, PlotSeries>;
  drawings?: {
    labels: PineDrawingLabel[];
    boxes: PineDrawingBox[];
    lines: PineDrawingLine[];
  };
  backtest?: {
    summary: BacktestSummary;
    trades: BacktestTrade[];
  };
  error?: string;
  executionTime?: number;
  bars?: number;
  engineUsed?: string;
  engineDetails?: {
    name: string;
    repo: string;
    version: string;
    license: string;
  };
}

export interface PlotSeries {
  name: string;
  data: Array<{ time: number; value: number | null }>;
  style?: 'line' | 'histogram' | 'area' | 'circles' | 'cross';
  color?: string;
  linewidth?: number;
  overlay?: boolean;
}

export interface ExecuteScriptRequest {
  script: string;
  engine?: 'auto' | 'pinets' | 'pynecore' | 'openpinescript' | 'native';
  startTime?: number;
  endTime?: number;
  maxBars?: number;
}

export interface SavedScript {
  id: string;
  name: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

