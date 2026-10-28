// API client for communicating with the Pine Platform backend

const BASE_URL = '/api';

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
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

export interface DownloadProgress {
  status: 'downloading' | 'processing' | 'saving' | 'complete' | 'error';
  message: string;
  percent: number;
  metadata?: DataMetadata;
}

export interface PlotSeries {
  name: string;
  data: Array<{ time: number; value: number | null }>;
  style?: 'line' | 'histogram' | 'area' | 'circles' | 'cross';
  color?: string;
  linewidth?: number;
  overlay?: boolean;
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

export interface SavedScript {
  id: string;
  name: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}


export interface CandlesResponse {
  candles: Candle[];
  count: number;
  instrument: string;
  timeframe: string;
  provider: string;
}

// ── Data API ──────────────────────────────────────────────────────────────────

export async function fetchMetadata(): Promise<DataMetadata> {
  const res = await fetch(`${BASE_URL}/data/metadata`);
  if (!res.ok) throw new Error(`Failed to fetch metadata: ${res.statusText}`);
  return res.json();
}

export async function fetchCandles(opts?: {
  start?: number;
  end?: number;
  limit?: number;
}): Promise<CandlesResponse> {
  const params = new URLSearchParams();
  if (opts?.start) params.set('start', String(opts.start));
  if (opts?.end) params.set('end', String(opts.end));
  if (opts?.limit) params.set('limit', String(opts.limit));
  const url = `${BASE_URL}/data/candles${params.size ? '?' + params : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch candles: ${res.statusText}`);
  return res.json();
}

/**
 * Download Dukascopy data with SSE progress callbacks.
 * Streams real download progress events from the backend.
 */
export function downloadData(
  startDate: string,
  endDate: string,
  onProgress: (progress: DownloadProgress) => void
): AbortController {
  const controller = new AbortController();

  const run = async () => {
    const res = await fetch(`${BASE_URL}/data/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate, endDate }),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      const err = await res.text();
      onProgress({ status: 'error', message: `Server error: ${err}`, percent: 0 });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            onProgress(data as DownloadProgress);
          } catch {
            // ignore parse errors on partial lines
          }
        }
      }
    }
  };

  run().catch(err => {
    if (err.name !== 'AbortError') {
      onProgress({ status: 'error', message: err.message, percent: 0 });
    }
  });

  return controller;
}

// ── Script Execution API ──────────────────────────────────────────────────────

export async function fetchEngines(): Promise<EngineInfo[]> {
  const res = await fetch(`${BASE_URL}/engines`);
  if (!res.ok) throw new Error('Failed to fetch engine information');
  const data = await res.json();
  return data.engines ?? [];
}

export async function executeScript(
  script: string,
  opts?: {
    engine?: 'auto' | 'pinets' | 'pynecore' | 'openpinescript' | 'native';
    startTime?: number;
    endTime?: number;
    maxBars?: number;
  }
): Promise<PineScriptResult> {
  const res = await fetch(`${BASE_URL}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script, ...opts }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Script execution failed');
  }
  return res.json();
}


// ── Saved Scripts API ─────────────────────────────────────────────────────────

export async function listScripts(): Promise<SavedScript[]> {
  const res = await fetch(`${BASE_URL}/scripts`);
  if (!res.ok) throw new Error('Failed to list scripts');
  return res.json();
}

export async function getScriptById(id: string): Promise<SavedScript> {
  const res = await fetch(`${BASE_URL}/scripts/${id}`);
  if (!res.ok) throw new Error('Script not found');
  return res.json();
}

export async function createScript(name: string, source: string): Promise<SavedScript> {
  const res = await fetch(`${BASE_URL}/scripts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, source }),
  });
  if (!res.ok) throw new Error('Failed to save script');
  return res.json();
}

export async function updateScript(id: string, name: string, source: string): Promise<SavedScript> {
  const res = await fetch(`${BASE_URL}/scripts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, source }),
  });
  if (!res.ok) throw new Error('Failed to update script');
  return res.json();
}

export async function deleteScript(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/scripts/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete script');
}
