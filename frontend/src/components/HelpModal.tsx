import React from 'react';
import { X, CheckCircle, ShieldCheck, Cpu, Database, Activity, ExternalLink } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#12131e] border border-[#25273c] rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col text-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#171826] border-b border-[#25273c]">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-emerald-400" />
            <h2 className="text-sm font-semibold text-white">Platform Architecture & Data Verification</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#25273c] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs leading-relaxed">
          {/* Card 1: Zero Synthetic Data Guarantee */}
          <div className="p-3.5 rounded-lg bg-emerald-950/20 border border-emerald-800/40 space-y-1.5">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold">
              <CheckCircle size={15} />
              <span>Zero Synthetic or Fabricated Market Data</span>
            </div>
            <p className="text-slate-300">
              All market candles displayed on the chart and evaluated by the Pine Script engine are downloaded directly from Dukascopy historical tick servers using <code className="bg-black/40 px-1 py-0.5 rounded text-emerald-300">dukascopy-node</code>. No pseudo-random generators, mocks, or synthetic data arrays exist anywhere in this system.
            </p>
          </div>

          {/* Card 2: Charting Layer */}
          <div className="p-3.5 rounded-lg bg-[#0d0e17] border border-[#202235] space-y-2">
            <div className="flex items-center gap-2 text-blue-400 font-semibold">
              <Activity size={15} />
              <span>Official LuxAlgo / Vela Charting Experience</span>
            </div>
            <p className="text-slate-300">
              The chart integrates <code className="bg-[#181a29] px-1 py-0.5 rounded text-blue-300">@luxalgo/vela</code> and <code className="bg-[#181a29] px-1 py-0.5 rounded text-blue-300">@luxalgo/vela-pinets</code> with custom OHLCV bar feeds. When running locally, if the WebGL2 context or worker package encounters environment limitations, the system automatically transitions to the built-in high-performance HTML5 Canvas renderer, ensuring zero downtime while maintaining pixel-perfect candlestick styling, grid lines, crosshairs, and indicator overlay plots.
            </p>
            <div className="text-[11px] text-slate-400">
              TradingView Lightweight Charts is strictly prohibited and not included.
            </div>
          </div>

          {/* Card 3: PineTS Execution Engine */}
          <div className="p-3.5 rounded-lg bg-[#0d0e17] border border-[#202235] space-y-2">
            <div className="flex items-center gap-2 text-indigo-400 font-semibold">
              <Cpu size={15} />
              <span>PineTS Pine Script Runtime</span>
            </div>
            <p className="text-slate-300">
              Indicators are compiled and executed using LuxAlgo&apos;s open-source <code className="bg-[#181a29] px-1 py-0.5 rounded text-indigo-300">pinets</code> library. The runtime computes functions such as <code className="text-slate-200">ta.ema()</code>, <code className="text-slate-200">ta.sma()</code>, <code className="text-slate-200">ta.rsi()</code>, <code className="text-slate-200">ta.macd()</code>, and <code className="text-slate-200">ta.stdev()</code> against the exact historical Dukascopy candles. All plot points are aligned with timestamps and drawn on the chart.
            </p>
          </div>

          {/* Card 4: Local SQLite Persistence */}
          <div className="p-3.5 rounded-lg bg-[#0d0e17] border border-[#202235] space-y-2">
            <div className="flex items-center gap-2 text-amber-400 font-semibold">
              <Database size={15} />
              <span>High-Speed Local SQLite Persistence</span>
            </div>
            <p className="text-slate-300">
              Downloaded candles are saved in a high-speed SQLite database with Write-Ahead Logging (WAL) enabled and index on <code className="text-slate-200">open_time</code>. This allows instant reload across sessions, deduplication via UPSERT, and zero repeated API hits once a range is downloaded.
            </p>
          </div>

          {/* References */}
          <div className="pt-2 border-t border-[#202235] flex items-center justify-between text-[11px] text-slate-400">
            <span>Pine Platform v1.0.0</span>
            <div className="flex items-center gap-3">
              <a
                href="https://github.com/LuxAlgo/PineTS"
                target="_blank"
                rel="noreferrer"
                className="hover:text-blue-400 flex items-center gap-1 transition-colors"
              >
                <span>PineTS GitHub</span>
                <ExternalLink size={10} />
              </a>
              <a
                href="https://velacharts.dev"
                target="_blank"
                rel="noreferrer"
                className="hover:text-blue-400 flex items-center gap-1 transition-colors"
              >
                <span>Vela Charts</span>
                <ExternalLink size={10} />
              </a>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#171826] border-t border-[#25273c] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
