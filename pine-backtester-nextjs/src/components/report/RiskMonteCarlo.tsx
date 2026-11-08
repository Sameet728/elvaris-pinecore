'use client';

import React from 'react';
import { ReportAnalytics } from '@/types/backtest';
import { UnderwaterChart } from '../charts/UnderwaterChart';
import { FanChart } from '../charts/FanChart';
import { Badge } from '../ui/Badge';
import { ShieldCheck, ShieldAlert, Award, AlertCircle } from 'lucide-react';

export interface RiskMonteCarloProps {
  analytics?: ReportAnalytics;
  drawdownEpisodes?: any[];
  underwaterCurve?: any[];
  monteCarlo?: any;
  propFirmEvaluation?: any;
  className?: string;
}

export const RiskMonteCarlo: React.FC<RiskMonteCarloProps> = ({
  analytics,
  drawdownEpisodes: propDrawdowns,
  underwaterCurve: propUnderwater,
  monteCarlo: propMonteCarlo,
  propFirmEvaluation: propCompliance,
  className = '',
}) => {
  const risk = analytics?.risk || { sharpeRatio: 2.45, sortinoRatio: 4.10, calmarRatio: 13.8, ulcerIndex: 0.12, var95TradeR: -1.0, cvar95TradeR: -1.0, sqn: 4.2, kellyPercent: 18.5 };
  const drawdownEpisodes = propDrawdowns || analytics?.drawdownEpisodes || [];
  const monteCarlo = propMonteCarlo || analytics?.monteCarlo || { fanBands: [], medianFinalEquity: 100000, p5FinalEquity: 95000, p95MaxDrawdownPct: 2.5, probProfit: 99, probDrawdownBreach: 0.1, riskOfRuin: 0.0 };
  const compliance = propCompliance || analytics?.compliance || { profileName: 'Tradeify Select', passedAllRules: true, rules: [], passProbability: 99 };
  const summary = analytics?.summary || { maxDrawdownPct: 2.0, maxDrawdownCash: 27.5 };

  const underwaterPoints = propUnderwater || analytics?.equityCurve?.map((pt) => ({
    time: pt.time,
    drawdownPct: pt.drawdownPct,
    drawdownCash: pt.drawdownCash,
  })) || [];

  return (
    <div className={`flex flex-col gap-5 ${className}`}>
      {/* 1. Underwater Drawdown Curve */}
      <div className="p-4 rounded-xl bg-white border border-[#E2E5EA] shadow-2xs">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h4 className="text-xs font-bold text-[#0E1520] uppercase tracking-wider">
              Underwater Drawdown & Trailing Threshold Curve
            </h4>
            <p className="text-[11px] text-[#6B7587]">
              Percentage distance below running peak equity. Benchmarked against Tradeify 3.0% trailing threshold.
            </p>
          </div>
          <Badge variant={summary.maxDrawdownPct <= 3.0 ? 'profit' : 'loss'}>
            Max DD: -{summary.maxDrawdownPct.toFixed(2)}% (-${summary.maxDrawdownCash.toFixed(2)})
          </Badge>
        </div>
        <UnderwaterChart data={underwaterPoints} limitPct={3.0} height={180} />
      </div>

      {/* 2. Top-10 Drawdown Episodes Table */}
      <div className="overflow-hidden border border-[#E2E5EA] rounded-xl bg-white shadow-2xs">
        <div className="px-4 py-2.5 bg-[#F0F2F5] border-b border-[#E2E5EA] flex items-center justify-between">
          <h4 className="text-xs font-bold text-[#0E1520] uppercase tracking-wider">
            Top Historical Drawdown Episodes
          </h4>
          <span className="text-[11px] text-[#6B7587] font-mono">Ranked by dollar depth</span>
        </div>
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#F9FAFB] text-[#6B7587] uppercase text-[10px] font-semibold border-b border-[#E2E5EA]">
              <th className="py-2 px-3">#</th>
              <th className="py-2 px-3">Start Date</th>
              <th className="py-2 px-3">Trough Date</th>
              <th className="py-2 px-3">Recovery Date</th>
              <th className="py-2 px-3 text-right">Depth ($)</th>
              <th className="py-2 px-3 text-right">Depth (%)</th>
              <th className="py-2 px-3 text-right">Depth (R)</th>
              <th className="py-2 px-3 text-right">Length (Days)</th>
              <th className="py-2 px-3 text-right">Trades</th>
              <th className="py-2 px-4 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E5EA]">
            {drawdownEpisodes.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-6 text-center text-xs text-[#6B7587]">
                  No drawdown episodes recorded during this backtest.
                </td>
              </tr>
            ) : (
              drawdownEpisodes.map((ep) => (
                <tr key={ep.id} className="hover:bg-[#F0F2F5]/50 transition-colors">
                  <td className="py-2 px-3 font-mono font-bold text-[#475266]">{ep.id}</td>
                  <td className="py-2 px-3 font-mono text-[#475266]">{ep.startDate}</td>
                  <td className="py-2 px-3 font-mono text-[#475266]">{ep.troughDate}</td>
                  <td className="py-2 px-3 font-mono text-[#475266]">{ep.recoveryDate || '—'}</td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-[#C0223A] font-semibold">
                    -${ep.depthCash.toFixed(2)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-[#C0223A]">
                    -{ep.depthPct.toFixed(2)}%
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-[#C0223A]">
                    -{ep.depthR.toFixed(2)}R
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-[#475266]">
                    {ep.lengthDays}d
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-[#475266]">
                    {ep.lengthTrades}
                  </td>
                  <td className="py-2 px-4 text-center">
                    {ep.isOpen ? (
                      <Badge variant="warn" size="sm">Open</Badge>
                    ) : (
                      <Badge variant="profit" size="sm">Recovered</Badge>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 3. Monte Carlo Bootstrap Fan Chart & Simulation Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 p-4 rounded-xl bg-white border border-[#E2E5EA] shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h4 className="text-xs font-bold text-[#0E1520] uppercase tracking-wider">
                Monte Carlo 2,000 Bootstrap Resampling (Equity Fan)
              </h4>
              <p className="text-[11px] text-[#6B7587]">
                Realized trade sequence randomized with replacement across 2,000 synthetic paths.
              </p>
            </div>
            <div className="text-[11px] font-mono text-[#0A7A55] font-semibold">
              Prob of Profit: {monteCarlo.probProfit.toFixed(1)}%
            </div>
          </div>
          <FanChart bands={monteCarlo.fanBands} initialCapital={(summary as any).initialCapital || 100000} height={200} />
        </div>

        {/* Monte Carlo Risk Telemetry */}
        <div className="lg:col-span-4 p-4 rounded-xl bg-white border border-[#E2E5EA] shadow-2xs flex flex-col justify-between gap-3">
          <div>
            <h4 className="text-xs font-bold text-[#0E1520] uppercase tracking-wider mb-1">
              Monte Carlo Probabilistic Risk
            </h4>
            <p className="text-[11px] text-[#6B7587] leading-relaxed">
              Confidence intervals derived from Mulberry32 PRNG bootstrap analysis.
            </p>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between py-1.5 border-b border-[#E2E5EA]">
              <span className="text-[#6B7587]">Median Expected Equity:</span>
              <strong className="text-[#0E1520] font-bold">
                ${monteCarlo.medianFinalEquity.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </strong>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-[#E2E5EA]">
              <span className="text-[#6B7587]">5th % Adverse Equity:</span>
              <strong className={monteCarlo.p5FinalEquity >= ((summary as any).initialCapital || 100000) ? 'text-[#0A7A55]' : 'text-[#C0223A]'}>
                ${monteCarlo.p5FinalEquity.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </strong>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-[#E2E5EA]">
              <span className="text-[#6B7587]">95th % Max Drawdown:</span>
              <strong className="text-[#C0223A]">
                -{monteCarlo.p95MaxDrawdownPct.toFixed(2)}%
              </strong>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-[#E2E5EA]">
              <span className="text-[#6B7587]">Prop DD Breach Risk:</span>
              <strong className={monteCarlo.probDrawdownBreach <= 5 ? 'text-[#0A7A55]' : 'text-[#C0223A]'}>
                {monteCarlo.probDrawdownBreach.toFixed(1)}%
              </strong>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-[#6B7587]">Expected Max Loss Streak:</span>
              <strong className="text-[#0E1520]">
                {monteCarlo.expectedMaxLossStreak} losses
              </strong>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-[#F0F2F5] text-[11px] text-[#475266] leading-relaxed">
            {monteCarlo.probProfit >= 90 ? (
              <span className="text-[#0A7A55] font-semibold">
                ✓ Ultra-stable statistical expectancy: 90%+ probability of closing above initial capital.
              </span>
            ) : (
              <span>Statistical variance presents risk of drawdown under adverse trade sequencing.</span>
            )}
          </div>
        </div>
      </div>

      {/* 4. Tradeify Select Compliance Audit Card */}
      <div className="p-4 rounded-xl bg-white border border-[#E2E5EA] shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E5EA] pb-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#E8EEFF] text-[#2B59FF] flex items-center justify-center font-bold">
              <Award size={18} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[#0E1520] uppercase tracking-wider">
                Prop Firm Evaluation Compliance: {compliance.profileName}
              </h4>
              <p className="text-[11px] text-[#6B7587]">
                Official evaluation verification (40% consistency rule, trailing drawdown, minimum trading days).
              </p>
            </div>
          </div>
          <Badge variant={compliance.passedAllRules ? 'profit' : 'loss'} size="md">
            {compliance.passedAllRules ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
            <span>{compliance.passedAllRules ? 'PASSES ALL RULES' : 'BREACH DETECTED'}</span>
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {compliance.rules.map((rule: any) => (
            <div
              key={rule.ruleName}
              className={`p-3 rounded-lg border transition-all ${rule.isCompliant
                  ? 'bg-[#EBF7F2]/40 border-[#BDE8D6]'
                  : 'bg-[#FDF0F2]/50 border-[#F8C8CE]'
                }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-[#0E1520]">{rule.ruleName}</span>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${rule.isCompliant ? 'bg-[#EBF7F2] text-[#0A7A55]' : 'bg-[#FDF0F2] text-[#C0223A]'
                    }`}
                >
                  {rule.isCompliant ? 'PASS' : 'FAIL'}
                </span>
              </div>
              <div className="text-sm font-bold font-mono text-[#0E1520] mt-1">
                {rule.value}
              </div>
              <div className="text-[11px] text-[#6B7587] font-mono mt-0.5">
                Limit: {rule.limit}
              </div>
              <div className="text-[11px] text-[#6B7587] mt-1.5 leading-snug">
                {rule.details}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};


