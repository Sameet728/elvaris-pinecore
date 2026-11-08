'use client';

import React, { useState, useMemo } from 'react';
import { Trade } from '@/types/backtest';
import { Search, Download, ArrowUpDown, Filter, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';

export interface TradeListProps {
  trades: Trade[];
  symbol?: string;
  selectedTradeId?: number | null;
  onSelectTrade?: (trade: any) => void;
  className?: string;
}

export const TradeList: React.FC<TradeListProps> = ({
  trades,
  selectedTradeId,
  onSelectTrade,
  className = '',
}) => {
  const [search, setSearch] = useState('');
  const [sideFilter, setSideFilter] = useState<'ALL' | 'LONG' | 'SHORT'>('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState<'ALL' | 'WIN' | 'LOSS'>('ALL');
  const [sortField, setSortField] = useState<keyof Trade>('id');
  const [sortAsc, setSortAsc] = useState(false); // default newest first

  // Filter & Sort
  const filteredTrades = useMemo(() => {
    return trades
      .filter((t) => {
        if (sideFilter !== 'ALL' && t.type !== sideFilter) return false;
        if (outcomeFilter === 'WIN' && !t.isWin) return false;
        if (outcomeFilter === 'LOSS' && t.isWin) return false;
        if (search) {
          const q = search.toLowerCase();
          const matchId = String(t.id).includes(q);
          const matchPrice = String(t.entryPrice).includes(q) || String(t.exitPrice).includes(q);
          const matchReason = (t.exitReason || '').toLowerCase().includes(q);
          if (!matchId && !matchPrice && !matchReason) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const valA = a[sortField] ?? 0;
        const valB = b[sortField] ?? 0;
        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
      });
  }, [trades, sideFilter, outcomeFilter, search, sortField, sortAsc]);

  const handleSort = (field: keyof Trade) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const handleExportCsv = () => {
    if (filteredTrades.length === 0) return;
    const headers = [
      'Trade #',
      'Side',
      'Entry Time (UTC)',
      'Entry Price',
      'Exit Time (UTC)',
      'Exit Price',
      'Net P&L ($)',
      'Return (R)',
      'Outcome',
      'Bars Held',
      'MAE (R)',
      'MFE (R)',
      'Exit Reason',
      'Cumulative Equity',
    ];

    const rows = filteredTrades.map((t) => [
      t.id,
      t.type,
      new Date(t.entryTime).toISOString(),
      t.entryPrice.toFixed(2),
      t.exitTime ? new Date(t.exitTime).toISOString() : '',
      t.exitPrice ? t.exitPrice.toFixed(2) : '',
      t.pnl.toFixed(2),
      t.rMultiple.toFixed(2),
      t.isWin ? 'WIN' : 'LOSS',
      t.barsHeld,
      t.maeR !== undefined ? t.maeR.toFixed(2) : '',
      t.mfeR !== undefined ? t.mfeR.toFixed(2) : '',
      t.exitReason || '',
      t.cumulativeEquity.toFixed(2),
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Elvaris_Trades_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Search, Filters, CSV Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl bg-white border border-[#E2E5EA] shadow-2xs">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
          <div className="max-w-xs w-full">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search trade #, price, reason..."
              leftIcon={<Search size={14} />}
            />
          </div>

          <div className="flex items-center gap-1 bg-[#F0F2F5] p-0.5 rounded-lg text-xs font-medium">
            {(['ALL', 'LONG', 'SHORT'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSideFilter(s)}
                className={`px-2 py-1 rounded-md transition-all cursor-pointer ${sideFilter === s ? 'bg-white text-[#0E1520] font-bold shadow-2xs' : 'text-[#475266]'
                  }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-[#F0F2F5] p-0.5 rounded-lg text-xs font-medium">
            {(['ALL', 'WIN', 'LOSS'] as const).map((o) => (
              <button
                key={o}
                onClick={() => setOutcomeFilter(o)}
                className={`px-2 py-1 rounded-md transition-all cursor-pointer ${outcomeFilter === o ? 'bg-white text-[#0E1520] font-bold shadow-2xs' : 'text-[#475266]'
                  }`}
              >
                {o}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-[#6B7587] font-mono">
            Showing <strong>{filteredTrades.length}</strong> of {trades.length} trades
          </span>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Download size={13} />}
            onClick={handleExportCsv}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {/* Trades Table */}
      <div className="w-full overflow-x-auto border border-[#E2E5EA] rounded-xl bg-white shadow-2xs max-h-[460px] overflow-y-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-[#F0F2F5] text-[#475266] uppercase text-[10px] font-semibold border-b border-[#E2E5EA]">
            <tr>
              <th
                className="py-2 px-3 cursor-pointer hover:text-[#0E1520]"
                onClick={() => handleSort('id')}
              >
                <div className="flex items-center gap-1">
                  <span>#</span>
                  <ArrowUpDown size={10} />
                </div>
              </th>
              <th className="py-2 px-3">Side</th>
              <th
                className="py-2 px-3 cursor-pointer hover:text-[#0E1520]"
                onClick={() => handleSort('entryTime')}
              >
                <div className="flex items-center gap-1">
                  <span>Entry Time</span>
                  <ArrowUpDown size={10} />
                </div>
              </th>
              <th className="py-2 px-3 text-right">Entry Price</th>
              <th className="py-2 px-3 text-right">Exit Price</th>
              <th
                className="py-2 px-3 text-right cursor-pointer hover:text-[#0E1520]"
                onClick={() => handleSort('rMultiple')}
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Return (R)</span>
                  <ArrowUpDown size={10} />
                </div>
              </th>
              <th
                className="py-2 px-3 text-right cursor-pointer hover:text-[#0E1520]"
                onClick={() => handleSort('pnl')}
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Net P&L ($)</span>
                  <ArrowUpDown size={10} />
                </div>
              </th>
              <th className="py-2 px-3 text-center">Outcome</th>
              <th className="py-2 px-3 text-right">Duration</th>
              <th className="py-2 px-3 text-right">MAE</th>
              <th className="py-2 px-3 text-right">MFE</th>
              <th className="py-2 px-4 text-right">Cum. Equity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E5EA]">
            {filteredTrades.map((t) => {
              const isSelected = selectedTradeId === t.id;
              const isLong = t.type === 'LONG';
              return (
                <tr
                  key={t.id}
                  onClick={() => onSelectTrade && onSelectTrade(t)}
                  className={`cursor-pointer transition-colors ${isSelected
                      ? 'bg-[#E8EEFF]! font-medium'
                      : 'hover:bg-[#F0F2F5]/70 even:bg-[#FAFAFA]'
                    }`}
                >
                  <td className="py-2 px-3 font-mono font-bold text-[#0E1520]">{t.id}</td>
                  <td className="py-2 px-3">
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${isLong ? 'bg-[#EBF7F2] text-[#0A7A55]' : 'bg-[#FDF0F2] text-[#C0223A]'
                        }`}
                    >
                      {t.type}
                    </span>
                  </td>
                  <td className="py-2 px-3 font-mono text-[#475266]">
                    {new Date(t.entryTime).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-[#0E1520]">
                    <div>${t.entryPrice.toFixed(2)}</div>
                    <div className="text-[10px] text-[#C0223A] font-medium">SL: ${t.stopLoss.toFixed(2)}</div>
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-[#0E1520]">
                    <div>${t.exitPrice ? t.exitPrice.toFixed(2) : '—'}</div>
                    <div className="text-[10px] text-[#0A7A55] font-medium">TP: ${t.takeProfit.toFixed(2)}</div>
                  </td>
                  <td
                    className={`py-2 px-3 text-right font-mono tabular-nums font-semibold ${t.rMultiple >= 0 ? 'text-[#0A7A55]' : 'text-[#C0223A]'
                      }`}
                  >
                    {t.rMultiple >= 0 ? '+' : ''}{t.rMultiple.toFixed(2)}R
                  </td>
                  <td
                    className={`py-2 px-3 text-right font-mono tabular-nums font-bold ${t.pnl >= 0 ? 'text-[#0A7A55]' : 'text-[#C0223A]'
                      }`}
                  >
                    {t.pnl >= 0 ? '+' : ''}${t.pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded shadow-2xs ${
                          t.isWin
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-rose-100 text-rose-800 border border-rose-300'
                        }`}
                      >
                        {t.isWin ? 'TP HIT' : 'SL HIT'}
                      </span>
                      {t.ambiguousBar && (
                        <span title="Intrabar ambiguity: both TP and SL touched on the same candle. Resolved SL-first.">
                          <AlertTriangle size={11} className="text-[#F5A524]" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-[#475266]">
                    {t.barsHeld} bars
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-[#C0223A]">
                    {t.maeR !== undefined ? `-${t.maeR.toFixed(2)}R` : '—'}
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-[#0A7A55]">
                    {t.mfeR !== undefined ? `+${t.mfeR.toFixed(2)}R` : '—'}
                  </td>
                  <td className="py-2 px-4 text-right font-mono tabular-nums text-[#0E1520] font-semibold">
                    ${t.cumulativeEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};


