import React, { useState } from 'react';
import {
  Download,
  Database,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Loader2,
  HardDrive,
  Clock,
  X,
  ExternalLink,
} from 'lucide-react';
import { downloadData, type DataMetadata, type DownloadProgress } from '../api/client';
import { format, subDays } from 'date-fns';

interface DataDownloaderProps {
  metadata: DataMetadata | null;
  onDownloadSuccess: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export const DataDownloader: React.FC<DataDownloaderProps> = ({
  metadata,
  onDownloadSuccess,
  isOpen,
  onClose,
}) => {
  const today = new Date();
  // Default to last 7 days
  const [startDate, setStartDate] = useState(
    format(subDays(today, 7), 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState(format(today, 'yyyy-MM-dd'));
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  if (!isOpen) return null;

  const handlePreset = (days: number) => {
    setStartDate(format(subDays(today, days), 'yyyy-MM-dd'));
    setEndDate(format(today, 'yyyy-MM-dd'));
  };

  const handleStartDownload = () => {
    setIsDownloading(true);
    setProgress({
      status: 'downloading',
      message: 'Connecting to Dukascopy servers...',
      percent: 5,
    });

    const controller = downloadData(
      new Date(startDate).toISOString(),
      new Date(endDate + 'T23:59:59Z').toISOString(),
      (prog) => {
        setProgress(prog);
        if (prog.status === 'complete') {
          setIsDownloading(false);
          setAbortController(null);
          onDownloadSuccess();
        } else if (prog.status === 'error') {
          setIsDownloading(false);
          setAbortController(null);
        }
      }
    );

    setAbortController(controller);
  };

  const handleCancelDownload = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
    setIsDownloading(false);
    setProgress(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#12131e] border border-[#25273c] rounded-xl shadow-2xl w-full max-w-lg overflow-hidden text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#171826] border-b border-[#25273c]">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Database size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Dukascopy Historical Data Pipeline</h2>
              <p className="text-[11px] text-slate-400">
                Direct download of official XAUUSD (Gold) 5-minute OHLCV candles
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDownloading}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-[#25273c] disabled:opacity-40 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4">
          {/* Metadata Card: Currently Cached Data */}
          <div className="bg-[#0b0c13] rounded-lg p-3.5 border border-[#1e2033] space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-300 flex items-center gap-1.5">
                <HardDrive size={13} className="text-blue-400" />
                Local SQLite Database
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 font-mono">
                {metadata?.provider ?? 'Dukascopy'} · {metadata?.instrument ?? 'XAUUSD'} · {metadata?.timeframe ?? 'M5'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div className="bg-[#12131f] p-2 rounded border border-[#1b1d2e]">
                <span className="text-[11px] text-slate-400 block">Total 5m Candles</span>
                <span className="text-sm font-bold text-white font-mono">
                  {metadata?.candleCount ? metadata.candleCount.toLocaleString() : '0 (Empty)'}
                </span>
              </div>
              <div className="bg-[#12131f] p-2 rounded border border-[#1b1d2e]">
                <span className="text-[11px] text-slate-400 block">Available History</span>
                <span className="text-[11px] text-slate-300 font-mono truncate block">
                  {metadata?.firstCandle && metadata?.lastCandle ? (
                    <>
                      {new Date(metadata.firstCandle).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })} →{' '}
                      {new Date(metadata.lastCandle).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })} (IST)
                    </>
                  ) : (
                    'No data cached yet'
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Date Range Selection */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Calendar size={13} className="text-blue-400" />
              Download Date Range (UTC)
            </label>

            {/* Quick Presets */}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setStartDate('2026-09-13');
                  setEndDate('2026-10-10');
                }}
                disabled={isDownloading}
                className="px-2.5 py-1 text-xs rounded bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-500/40 font-semibold disabled:opacity-50 transition-colors flex items-center gap-1"
              >
                <span>⚡ TradingView History (Sep 13 → Latest)</span>
              </button>
              {[
                { label: '7 Days', days: 7 },
                { label: '14 Days', days: 14 },
                { label: '30 Days', days: 30 },
              ].map((p) => (
                <button
                  key={p.days}
                  type="button"
                  onClick={() => handlePreset(p.days)}
                  disabled={isDownloading}
                  className="px-2.5 py-1 text-xs rounded bg-[#181a28] hover:bg-[#222438] text-slate-300 border border-[#25273c] disabled:opacity-50 transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Start and End inputs */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <span className="text-[11px] text-slate-400 block mb-1">Start Date</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={isDownloading}
                  className="w-full bg-[#0c0d15] border border-[#25273c] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
                />
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block mb-1">End Date</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={isDownloading}
                  className="w-full bg-[#0c0d15] border border-[#25273c] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
                />
              </div>
            </div>
          </div>

          {/* Progress / Status Display */}
          {progress && (
            <div className="space-y-2 p-3 rounded-lg bg-[#0c0d15] border border-[#1e2033]">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  {progress.status === 'downloading' && (
                    <Loader2 size={13} className="text-blue-400 animate-spin" />
                  )}
                  {progress.status === 'processing' && (
                    <Clock size={13} className="text-amber-400 animate-spin" />
                  )}
                  {progress.status === 'saving' && (
                    <HardDrive size={13} className="text-emerald-400" />
                  )}
                  {progress.status === 'complete' && (
                    <CheckCircle2 size={13} className="text-emerald-400" />
                  )}
                  {progress.status === 'error' && (
                    <AlertCircle size={13} className="text-red-400" />
                  )}
                  <span
                    className={`font-medium ${
                      progress.status === 'complete'
                        ? 'text-emerald-400'
                        : progress.status === 'error'
                        ? 'text-red-400'
                        : 'text-slate-300'
                    }`}
                  >
                    {progress.status.toUpperCase()}
                  </span>
                </span>
                <span className="font-mono text-slate-300">{progress.percent}%</span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-1.5 bg-[#1b1c2b] rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    progress.status === 'error'
                      ? 'bg-red-500'
                      : progress.status === 'complete'
                      ? 'bg-emerald-500'
                      : 'bg-blue-500'
                  }`}
                  style={{ width: `${progress.percent}%` }}
                />
              </div>

              <p className="text-[11px] text-slate-400 font-mono truncate">
                {progress.message}
              </p>
            </div>
          )}

          {/* Data Authenticity Notice */}
          <div className="p-2.5 rounded bg-blue-950/20 border border-blue-900/40 text-[11px] text-blue-300/90 leading-relaxed">
            <p className="flex items-center gap-1 font-semibold mb-0.5">
              <span>Verified Market Data Guarantee:</span>
            </p>
            This pipeline downloads genuine Swiss Forex & CFD historical tick files (.bi5 format) from Dukascopy public servers. Zero synthetic or fabricated bars are ever generated.
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-5 py-3 bg-[#171826] border-t border-[#25273c]">
          <a
            href="https://www.dukascopy.com"
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
          >
            <span>Dukascopy Swiss Bank</span>
            <ExternalLink size={10} />
          </a>

          <div className="flex items-center gap-2">
            {isDownloading ? (
              <button
                type="button"
                onClick={handleCancelDownload}
                className="px-3 py-1.5 text-xs rounded bg-red-900/50 hover:bg-red-800 text-red-200 border border-red-700/50 transition-colors"
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs rounded bg-[#1e2030] hover:bg-[#282b40] text-slate-300 border border-[#2d2d42] transition-colors"
              >
                Close
              </button>
            )}

            <button
              type="button"
              onClick={handleStartDownload}
              disabled={isDownloading || !startDate || !endDate}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 text-white font-medium shadow-md shadow-blue-900/30 transition-all cursor-pointer"
            >
              {isDownloading ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Downloading...</span>
                </>
              ) : (
                <>
                  <Download size={13} />
                  <span>Download Candles</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
