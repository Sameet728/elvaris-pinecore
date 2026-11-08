import type { BacktestResult } from '@/types/backtest';

// In-memory cache for reports with 1-hour expiration
interface CacheEntry {
  result: BacktestResult;
  createdAt: number;
}

const globalReports = globalThis as unknown as {
  __elvaris_reports__?: Map<string, CacheEntry>;
};

if (!globalReports.__elvaris_reports__) {
  globalReports.__elvaris_reports__ = new Map();
}

const reports = globalReports.__elvaris_reports__;

export function storeReport(id: string, result: BacktestResult): void {
  // Prune entries older than 1 hour
  const now = Date.now();
  for (const [key, entry] of reports.entries()) {
    if (now - entry.createdAt > 3600 * 1000) {
      reports.delete(key);
    }
  }
  reports.set(id, { result, createdAt: now });
}

export function getReport(id: string): BacktestResult | null {
  const entry = reports.get(id);
  if (!entry) return null;
  return entry.result;
}
