import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Trophy, RefreshCw, TrendingUp, TrendingDown, Activity,
  Target, Zap, Shield, Clock, ChevronDown, ChevronUp,
  Star, AlertCircle, CheckCircle2, XCircle, Minus, X
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────
interface MonteCarlo {
  worstDrawdownR: number;
  probDrawdownUnder4R: number;
  probProfitable: number;
}

interface LeaderboardEntry {
  name: string;
  filePath?: string;
  score: number;
  sepR: number;
  octR: number;
  cumulativeR: number;
  winRate: number;
  maxDrawdown: number;
  calmarRatio: number;
  closed: number;
  avgTpPips: number;
  maxConsLoss?: number;
  propStatus?: string;
  monteCarlo?: MonteCarlo;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────
const REFRESH_INTERVAL_MS = 30_000; // auto-refresh every 30s

const propTag = (status?: string) => {
  if (!status) return null;
  const s = status.toUpperCase();
  if (s === 'PASS' || s === 'CHAMPION' || s === 'CHAMPION_CANDIDATE')
    return { label: '✅ PASS', cls: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60' };
  if (s === 'NEAR_PASS')
    return { label: '🔶 NEAR', cls: 'bg-amber-950/80 text-amber-300 border-amber-700/60' };
  if (s === 'TESTING')
    return { label: '🔵 TEST', cls: 'bg-blue-950/80 text-blue-300 border-blue-700/60' };
  if (s === 'OPTIMIZING')
    return { label: '⚙️ OPT', cls: 'bg-purple-950/80 text-purple-300 border-purple-700/60' };
  return { label: status, cls: 'bg-slate-900 text-slate-400 border-slate-700' };
};

const rColor = (r: number) =>
  r >= 10 ? 'text-emerald-400 font-bold' :
  r >= 5  ? 'text-lime-400' :
  r >= 0  ? 'text-slate-300' :
             'text-rose-400';

const calmarColor = (c: number) =>
  c >= 10 ? 'text-emerald-300 font-bold' :
  c >= 5  ? 'text-lime-300' :
  c >= 4  ? 'text-amber-300' :
             'text-rose-400';

const wrColor = (w: number) =>
  w >= 70 ? 'text-emerald-300' :
  w >= 55 ? 'text-lime-300' :
  w >= 45 ? 'text-amber-300' :
             'text-rose-400';

const ddColor = (d: number) =>
  d <= 2  ? 'text-emerald-300' :
  d <= 3.5 ? 'text-amber-300' :
              'text-rose-400';

const rankBadge = (i: number) => {
  if (i === 0) return { icon: '🥇', cls: 'text-amber-400 border-amber-500/50 bg-amber-950/40' };
  if (i === 1) return { icon: '🥈', cls: 'text-slate-300 border-slate-500/50 bg-slate-800/40' };
  if (i === 2) return { icon: '🥉', cls: 'text-orange-400 border-orange-600/50 bg-orange-950/40' };
  return { icon: `#${i + 1}`, cls: 'text-slate-400 border-slate-700/50 bg-slate-900/40' };
};

const isDual10R = (e: LeaderboardEntry) => e.sepR >= 10 && e.octR >= 10;

// ─────────────────────────────────────────────────────────────────
// Column definitions
// ─────────────────────────────────────────────────────────────────
type SortKey = keyof LeaderboardEntry | 'dual';
const COLS: { key: SortKey; label: string; title?: string; w?: string }[] = [
  { key: 'name',        label: 'Strategy',   w: 'min-w-[200px]' },
  { key: 'propStatus',  label: 'Status',     w: 'min-w-[90px]' },
  { key: 'sepR',        label: 'Sep R',      title: 'September R-multiple', w: 'min-w-[70px]' },
  { key: 'octR',        label: 'Oct R',      title: 'October R-multiple',   w: 'min-w-[70px]' },
  { key: 'cumulativeR', label: 'Total R',    w: 'min-w-[70px]' },
  { key: 'calmarRatio', label: 'Calmar',     title: 'Calmar Ratio (Return/MaxDD)', w: 'min-w-[70px]' },
  { key: 'winRate',     label: 'WR %',       title: 'Win Rate', w: 'min-w-[65px]' },
  { key: 'closed',      label: 'Trades',     w: 'min-w-[65px]' },
  { key: 'avgTpPips',   label: 'Avg TP',     title: 'Average TP in pips', w: 'min-w-[70px]' },
  { key: 'maxDrawdown', label: 'Max DD',     title: 'Maximum Drawdown in R', w: 'min-w-[70px]' },
  { key: 'score',       label: 'Score',      w: 'min-w-[65px]' },
];

// ─────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────
export const Leaderboard: React.FC<Props> = ({ isOpen, onClose }) => {
  const [data, setData]         = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL_MS / 1000);
  const [sortKey, setSortKey]   = useState<SortKey>('score');
  const [sortAsc, setSortAsc]   = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [filterDual, setFilterDual] = useState(false);
  const [newEntries, setNewEntries] = useState<Set<string>>(new Set());

  const prevNamesRef = useRef<Set<string>>(new Set());
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch leaderboard ─────────────────────────────────────────
  const fetchLeaderboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/leaderboard');
      const json = await res.json();
      const raw: LeaderboardEntry[] = (json.leaderboard || []).map((e: Record<string, unknown>) => ({
        name:        e.name        as string ?? 'Unknown',
        filePath:    e.filePath    as string,
        score:       Number(e.score       ?? 0),
        sepR:        Number(e.sepR        ?? 0),
        octR:        Number(e.octR        ?? 0),
        cumulativeR: Number(e.cumulativeR ?? 0),
        winRate:     Number(e.winRate     ?? 0),
        maxDrawdown: Number(e.maxDrawdown ?? 0),
        calmarRatio: Number(e.calmarRatio ?? 0),
        closed:      Number(e.closed      ?? 0),
        avgTpPips:   Number(e.avgTpPips   ?? 0),
        maxConsLoss: Number(e.maxConsLoss ?? 0),
        propStatus:  e.propStatus as string,
        monteCarlo:  e.monteCarlo as MonteCarlo,
      }));

      // detect new entries
      const incoming = new Set(raw.map(e => e.name));
      const fresh = new Set<string>();
      incoming.forEach(n => { if (!prevNamesRef.current.has(n)) fresh.add(n); });
      if (fresh.size > 0) setNewEntries(fresh);
      prevNamesRef.current = incoming;
      setTimeout(() => setNewEntries(new Set()), 4000); // clear highlight

      setData(raw);
      setLastRefresh(new Date());
      setCountdown(REFRESH_INTERVAL_MS / 1000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Auto-refresh ──────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    fetchLeaderboard();

    intervalRef.current = setInterval(() => fetchLeaderboard(true), REFRESH_INTERVAL_MS);

    const cdInterval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) return REFRESH_INTERVAL_MS / 1000;
        return c - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      clearInterval(cdInterval);
    };
  }, [isOpen, fetchLeaderboard]);

  if (!isOpen) return null;

  // ── Sort + filter ──────────────────────────────────────────────
  const sorted = [...data]
    .filter(e => filterDual ? isDual10R(e) : true)
    .sort((a, b) => {
      const aVal = a[sortKey as keyof LeaderboardEntry];
      const bVal = b[sortKey as keyof LeaderboardEntry];
      const diff = typeof aVal === 'number' && typeof bVal === 'number'
        ? aVal - bVal
        : String(aVal ?? '').localeCompare(String(bVal ?? ''));
      return sortAsc ? diff : -diff;
    });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  };

  const toggleExpand = (i: number) => {
    setExpanded(prev => {
      const s = new Set(prev);
      if (s.has(i)) s.delete(i); else s.add(i);
      return s;
    });
  };

  const dualCount = data.filter(isDual10R).length;
  const passCount = data.filter(e => {
    const s = (e.propStatus ?? '').toUpperCase();
    return s === 'PASS' || s === 'CHAMPION' || s === 'CHAMPION_CANDIDATE';
  }).length;

  // ─────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-6 pb-6 px-3"
      style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="relative w-full flex flex-col rounded-2xl overflow-hidden"
        style={{
          maxWidth: 1340,
          maxHeight: 'calc(100vh - 48px)',
          background: 'linear-gradient(160deg, #0d0f1f 0%, #0a0c1a 100%)',
          border: '1.5px solid #1e2240',
          boxShadow: '0 30px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(99,102,241,0.08)',
        }}
      >
        {/* ── Header ── */}
        <div
          className="shrink-0 flex items-center justify-between gap-4 px-6 py-4"
          style={{ borderBottom: '1px solid #1a1e35', background: 'rgba(15,17,35,0.95)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', boxShadow: '0 0 18px rgba(245,158,11,0.35)' }}>
              <Trophy size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">Strategy Leaderboard</h2>
              <p className="text-[11px] text-slate-400">XAUUSD Prop-Firm Optimized · Auto-refreshing every 30s</p>
            </div>
          </div>

          {/* Stats pills */}
          <div className="hidden md:flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1 rounded-full text-[11px] font-semibold border bg-slate-900/80 border-slate-700/60 text-slate-300">
              {data.length} Strategies
            </span>
            {dualCount > 0 && (
              <span className="px-3 py-1 rounded-full text-[11px] font-semibold border bg-emerald-950/70 border-emerald-700/50 text-emerald-300">
                🎯 {dualCount} Dual 10R
              </span>
            )}
            {passCount > 0 && (
              <span className="px-3 py-1 rounded-full text-[11px] font-semibold border bg-blue-950/70 border-blue-700/50 text-blue-300">
                ✅ {passCount} Prop Pass
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Dual 10R filter */}
            <button
              onClick={() => setFilterDual(f => !f)}
              title="Show only Dual 10R strategies"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                filterDual
                  ? 'bg-emerald-600/30 text-emerald-300 border-emerald-600/60'
                  : 'bg-slate-900/60 text-slate-400 border-slate-700/60 hover:text-white'
              }`}
            >
              <Target size={12} /> Dual 10R Only
            </button>

            {/* Refresh */}
            <button
              onClick={() => fetchLeaderboard()}
              disabled={loading}
              title={`Next auto-refresh in ${countdown}s`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-900/60 border border-slate-700/60 text-slate-300 hover:text-white hover:bg-slate-800/80 transition-all cursor-pointer"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Refreshing…' : `Refresh (${countdown}s)`}
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Last updated ── */}
        {lastRefresh && (
          <div className="shrink-0 flex items-center gap-2 px-6 py-2 text-[10px] text-slate-500"
            style={{ borderBottom: '1px solid #141629' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Last updated: {lastRefresh.toLocaleTimeString()} · {newEntries.size > 0 && <span className="text-amber-400 font-semibold ml-1">+{newEntries.size} new!</span>}
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="shrink-0 mx-4 mt-3 p-3 rounded-lg bg-rose-950/50 border border-rose-700/50 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {/* ── Table ── */}
        <div className="flex-1 overflow-auto custom-scrollbar">
          {sorted.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 py-20 text-slate-500">
              <Activity size={32} className="opacity-40" />
              <p className="text-sm">No strategies found yet. Miner is running…</p>
            </div>
          ) : (
            <table className="w-full border-collapse text-[12px]" style={{ minWidth: 900 }}>
              <thead>
                <tr style={{ background: 'rgba(12,14,28,0.98)', position: 'sticky', top: 0, zIndex: 10 }}>
                  <th className="w-8 py-3 pl-4 text-left" />
                  {COLS.map(col => (
                    <th
                      key={col.key}
                      title={col.title}
                      onClick={() => handleSort(col.key)}
                      className={`py-3 px-3 text-left text-[11px] font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer select-none whitespace-nowrap ${col.w ?? ''}`}
                      style={{ borderBottom: '1px solid #1a1e35' }}
                    >
                      <span className="flex items-center gap-1">
                        {col.label}
                        {sortKey === col.key ? (
                          sortAsc ? <ChevronUp size={11} className="text-indigo-400" /> : <ChevronDown size={11} className="text-indigo-400" />
                        ) : (
                          <ChevronDown size={11} className="opacity-20" />
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {sorted.map((entry, i) => {
                  const rank   = rankBadge(i);
                  const tag    = propTag(entry.propStatus);
                  const dual   = isDual10R(entry);
                  const isNew  = newEntries.has(entry.name);
                  const open   = expanded.has(i);

                  return (
                    <React.Fragment key={entry.name + i}>
                      <tr
                        onClick={() => toggleExpand(i)}
                        className="cursor-pointer transition-all group"
                        style={{
                          background: isNew
                            ? 'rgba(245,158,11,0.07)'
                            : i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                          borderBottom: open ? 'none' : '1px solid rgba(255,255,255,0.04)',
                          outline: dual ? '1px solid rgba(52,211,153,0.12)' : 'none',
                        }}
                      >
                        {/* Expand icon */}
                        <td className="py-2.5 pl-4 pr-1 text-slate-600 group-hover:text-slate-400 transition-colors">
                          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </td>

                        {/* Rank + Name */}
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-bold w-8 h-6 flex items-center justify-center rounded border shrink-0 ${rank.cls}`}
                            >
                              {rank.icon}
                            </span>
                            <div className="flex flex-col min-w-0">
                              <span className={`font-semibold truncate max-w-[240px] ${dual ? 'text-emerald-300' : 'text-white'} group-hover:text-indigo-300 transition-colors`}>
                                {dual && <span className="mr-1">🎯</span>}
                                {isNew && <span className="text-amber-400 mr-1">NEW</span>}
                                {entry.name}
                              </span>
                              {entry.filePath && (
                                <span className="text-[9px] text-slate-600 truncate max-w-[220px]">
                                  {entry.filePath.split(/[\\/]/).pop()}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-2.5 px-3">
                          {tag ? (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${tag.cls}`}>
                              {tag.label}
                            </span>
                          ) : <span className="text-slate-600">—</span>}
                        </td>

                        {/* Sep R */}
                        <td className={`py-2.5 px-3 font-mono font-bold ${rColor(entry.sepR)}`}>
                          {entry.sepR >= 0 ? '+' : ''}{entry.sepR.toFixed(1)}R
                          {entry.sepR >= 10 && <span className="ml-1 text-[9px] text-emerald-400">✓10R</span>}
                        </td>

                        {/* Oct R */}
                        <td className={`py-2.5 px-3 font-mono font-bold ${rColor(entry.octR)}`}>
                          {entry.octR >= 0 ? '+' : ''}{entry.octR.toFixed(1)}R
                          {entry.octR >= 10 && <span className="ml-1 text-[9px] text-emerald-400">✓10R</span>}
                        </td>

                        {/* Total R */}
                        <td className={`py-2.5 px-3 font-mono font-semibold ${rColor(entry.cumulativeR)}`}>
                          {entry.cumulativeR >= 0 ? '+' : ''}{entry.cumulativeR.toFixed(1)}R
                        </td>

                        {/* Calmar */}
                        <td className={`py-2.5 px-3 font-mono ${calmarColor(entry.calmarRatio)}`}>
                          {entry.calmarRatio.toFixed(1)}
                          {entry.calmarRatio >= 4 && <span className="ml-0.5 text-[9px]">✓</span>}
                        </td>

                        {/* WR% */}
                        <td className={`py-2.5 px-3 font-mono ${wrColor(entry.winRate)}`}>
                          {entry.winRate.toFixed(0)}%
                        </td>

                        {/* Trades */}
                        <td className="py-2.5 px-3 font-mono text-slate-300">
                          {entry.closed}
                        </td>

                        {/* Avg TP */}
                        <td className="py-2.5 px-3 font-mono text-slate-300">
                          {entry.avgTpPips > 0 ? (
                            <span className={entry.avgTpPips >= 20 && entry.avgTpPips <= 42 ? 'text-indigo-300' : 'text-amber-400'}>
                              {entry.avgTpPips.toFixed(1)}p
                            </span>
                          ) : '—'}
                        </td>

                        {/* Max DD */}
                        <td className={`py-2.5 px-3 font-mono ${ddColor(entry.maxDrawdown)}`}>
                          -{entry.maxDrawdown.toFixed(1)}R
                          {entry.maxDrawdown <= 3.5 && <span className="ml-0.5 text-[9px] text-emerald-400">✓</span>}
                        </td>

                        {/* Score */}
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <div
                              className="h-1.5 rounded-full"
                              style={{
                                width: Math.min(60, Math.max(4, (entry.score / 150) * 60)),
                                background: entry.score >= 100
                                  ? 'linear-gradient(90deg,#34d399,#10b981)'
                                  : entry.score >= 30
                                  ? 'linear-gradient(90deg,#a3e635,#65a30d)'
                                  : 'linear-gradient(90deg,#60a5fa,#3b82f6)',
                              }}
                            />
                            <span className="text-slate-400 font-mono text-[11px]">{entry.score.toFixed(0)}</span>
                          </div>
                        </td>
                      </tr>

                      {/* ── Expanded detail row ── */}
                      {open && (
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(10,12,28,0.95)' }}>
                          <td />
                          <td colSpan={COLS.length} className="px-4 py-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              {/* Monthly breakdown */}
                              <div className="rounded-xl p-3.5 border"
                                style={{ background: 'rgba(255,255,255,0.02)', borderColor: '#1e2240' }}>
                                <p className="text-[10px] text-slate-500 mb-2 font-semibold uppercase tracking-wider">Monthly P&L</p>
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-slate-400 text-xs">September</span>
                                  <span className={`font-mono text-sm font-bold ${rColor(entry.sepR)}`}>
                                    {entry.sepR >= 0 ? '+' : ''}{entry.sepR.toFixed(1)}R
                                    {entry.sepR >= 10 ? <CheckCircle2 size={11} className="inline ml-1 text-emerald-400" /> : entry.sepR < 0 ? <XCircle size={11} className="inline ml-1 text-rose-400" /> : <Minus size={11} className="inline ml-1 text-amber-400" />}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400 text-xs">October</span>
                                  <span className={`font-mono text-sm font-bold ${rColor(entry.octR)}`}>
                                    {entry.octR >= 0 ? '+' : ''}{entry.octR.toFixed(1)}R
                                    {entry.octR >= 10 ? <CheckCircle2 size={11} className="inline ml-1 text-emerald-400" /> : entry.octR < 0 ? <XCircle size={11} className="inline ml-1 text-rose-400" /> : <Minus size={11} className="inline ml-1 text-amber-400" />}
                                  </span>
                                </div>
                                <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between">
                                  <span className="text-slate-500 text-[10px]">Dual 10R?</span>
                                  <span className={`text-[11px] font-semibold ${dual ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {dual ? '✅ YES' : '❌ NO'}
                                  </span>
                                </div>
                              </div>

                              {/* Risk Metrics */}
                              <div className="rounded-xl p-3.5 border"
                                style={{ background: 'rgba(255,255,255,0.02)', borderColor: '#1e2240' }}>
                                <p className="text-[10px] text-slate-500 mb-2 font-semibold uppercase tracking-wider">Risk Metrics</p>
                                <div className="space-y-1.5 text-xs">
                                  <div className="flex justify-between">
                                    <span className="text-slate-500">Calmar Ratio</span>
                                    <span className={`font-mono font-bold ${calmarColor(entry.calmarRatio)}`}>{entry.calmarRatio.toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-500">Max Drawdown</span>
                                    <span className={`font-mono ${ddColor(entry.maxDrawdown)}`}>-{entry.maxDrawdown.toFixed(1)}R</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-500">Max Cons. Loss</span>
                                    <span className="font-mono text-slate-300">{entry.maxConsLoss ?? '—'}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-500">Avg TP Pips</span>
                                    <span className="font-mono text-indigo-300">{entry.avgTpPips > 0 ? entry.avgTpPips.toFixed(1) + 'p' : '—'}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Trade Stats */}
                              <div className="rounded-xl p-3.5 border"
                                style={{ background: 'rgba(255,255,255,0.02)', borderColor: '#1e2240' }}>
                                <p className="text-[10px] text-slate-500 mb-2 font-semibold uppercase tracking-wider">Trade Stats</p>
                                <div className="space-y-1.5 text-xs">
                                  <div className="flex justify-between">
                                    <span className="text-slate-500">Win Rate</span>
                                    <span className={`font-mono font-bold ${wrColor(entry.winRate)}`}>{entry.winRate.toFixed(1)}%</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-500">Total Trades</span>
                                    <span className="font-mono text-slate-300">{entry.closed}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-500">Cumulative R</span>
                                    <span className={`font-mono font-bold ${rColor(entry.cumulativeR)}`}>
                                      {entry.cumulativeR >= 0 ? '+' : ''}{entry.cumulativeR.toFixed(1)}R
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Monte Carlo */}
                              {entry.monteCarlo ? (
                                <div className="rounded-xl p-3.5 border"
                                  style={{ background: 'rgba(255,255,255,0.02)', borderColor: '#1e2240' }}>
                                  <p className="text-[10px] text-slate-500 mb-2 font-semibold uppercase tracking-wider">Monte Carlo (3K runs)</p>
                                  <div className="space-y-1.5 text-xs">
                                    <div className="flex justify-between">
                                      <span className="text-slate-500">P95 Max DD</span>
                                      <span className={`font-mono ${ddColor(entry.monteCarlo.worstDrawdownR)}`}>{entry.monteCarlo.worstDrawdownR.toFixed(1)}R</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-slate-500">P(DD &lt; 4R)</span>
                                      <span className={`font-mono font-bold ${entry.monteCarlo.probDrawdownUnder4R >= 80 ? 'text-emerald-300' : 'text-amber-300'}`}>
                                        {entry.monteCarlo.probDrawdownUnder4R}%
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-slate-500">P(Profitable)</span>
                                      <span className={`font-mono font-bold ${entry.monteCarlo.probProfitable >= 80 ? 'text-emerald-300' : 'text-amber-300'}`}>
                                        {entry.monteCarlo.probProfitable}%
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="rounded-xl p-3.5 border flex items-center justify-center text-slate-600 text-xs"
                                  style={{ background: 'rgba(255,255,255,0.01)', borderColor: '#1a1e35' }}>
                                  No MC data yet
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Footer legend ── */}
        <div
          className="shrink-0 flex items-center justify-between gap-3 px-6 py-3 text-[10px] text-slate-500 flex-wrap"
          style={{ borderTop: '1px solid #14172a', background: 'rgba(8,10,20,0.95)' }}
        >
          <div className="flex items-center gap-4">
            <span className="text-emerald-400">✓ = Prop target met</span>
            <span className="text-indigo-400">🎯 = Both months ≥ 10R</span>
            <span className="text-slate-500">TP range: 20–42 pips | Max DD: ≤ 3.5R | Calmar: ≥ 4</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Live · Refreshes every 30s</span>
          </div>
        </div>
      </div>
    </div>
  );
};
