import { DrawdownEpisode, EquityCurvePoint } from '@/types/backtest';

export interface DrawdownResult {
  episodes: DrawdownEpisode[];
  maxDrawdownCash: number;
  maxDrawdownPct: number;
  maxDrawdownR: number;
}

export function computeDrawdownEpisodes(
  equityPoints: EquityCurvePoint[],
  riskDollars: number
): DrawdownResult {
  if (equityPoints.length === 0) {
    return {
      episodes: [],
      maxDrawdownCash: 0,
      maxDrawdownPct: 0,
      maxDrawdownR: 0,
    };
  }

  const rawEpisodes: {
    startIdx: number;
    troughIdx: number;
    endIdx?: number;
    depthCash: number;
    depthPct: number;
    depthR: number;
    isOpen: boolean;
  }[] = [];

  let inDrawdown = false;
  let currentStartIdx = 0;
  let currentTroughIdx = 0;
  let currentMaxDD = 0;
  let peakEquity = equityPoints[0].equity;

  for (let i = 0; i < equityPoints.length; i++) {
    const pt = equityPoints[i];
    if (pt.equity >= peakEquity) {
      if (inDrawdown) {
        // Recovery reached!
        rawEpisodes.push({
          startIdx: currentStartIdx,
          troughIdx: currentTroughIdx,
          endIdx: i,
          depthCash: currentMaxDD,
          depthPct: (currentMaxDD / peakEquity) * 100,
          depthR: currentMaxDD / Math.max(riskDollars, 1),
          isOpen: false,
        });
        inDrawdown = false;
        currentMaxDD = 0;
      }
      peakEquity = pt.equity;
    } else {
      const dd = peakEquity - pt.equity;
      if (!inDrawdown) {
        inDrawdown = true;
        currentStartIdx = Math.max(0, i - 1);
        currentTroughIdx = i;
        currentMaxDD = dd;
      } else if (dd > currentMaxDD) {
        currentMaxDD = dd;
        currentTroughIdx = i;
      }
    }
  }

  if (inDrawdown) {
    rawEpisodes.push({
      startIdx: currentStartIdx,
      troughIdx: currentTroughIdx,
      endIdx: undefined,
      depthCash: currentMaxDD,
      depthPct: (currentMaxDD / peakEquity) * 100,
      depthR: currentMaxDD / Math.max(riskDollars, 1),
      isOpen: true,
    });
  }

  // Sort episodes by depthCash descending
  rawEpisodes.sort((a, b) => b.depthCash - a.depthCash);

  const top10 = rawEpisodes.slice(0, 10).map((ep, idx) => {
    const startPt = equityPoints[ep.startIdx];
    const troughPt = equityPoints[ep.troughIdx];
    const endPt = ep.endIdx !== undefined ? equityPoints[ep.endIdx] : undefined;

    const startDate = new Date(startPt.time).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const troughDate = new Date(troughPt.time).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const recoveryDate = endPt
      ? new Date(endPt.time).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
      : undefined;

    const lengthMs = (endPt ? endPt.time : troughPt.time) - startPt.time;
    const lengthDays = Math.max(1, Math.round(lengthMs / (24 * 60 * 60 * 1000)));
    const lengthTrades = (ep.endIdx !== undefined ? ep.endIdx : ep.troughIdx) - ep.startIdx;

    const recoveryMs = endPt ? endPt.time - troughPt.time : undefined;
    const recoveryDays = recoveryMs !== undefined ? Math.max(0, Math.round(recoveryMs / (24 * 60 * 60 * 1000))) : undefined;

    return {
      id: idx + 1,
      startDate,
      troughDate,
      recoveryDate,
      depthCash: Math.round(ep.depthCash * 100) / 100,
      depthPct: Math.round(ep.depthPct * 100) / 100,
      depthR: Math.round(ep.depthR * 100) / 100,
      lengthDays,
      lengthTrades: Math.max(1, lengthTrades),
      recoveryDays,
      isOpen: ep.isOpen,
    };
  });

  const maxDrawdownCash = top10.length > 0 ? top10[0].depthCash : 0;
  const maxDrawdownPct = top10.length > 0 ? top10[0].depthPct : 0;
  const maxDrawdownR = top10.length > 0 ? top10[0].depthR : 0;

  return {
    episodes: top10,
    maxDrawdownCash,
    maxDrawdownPct,
    maxDrawdownR,
  };
}


