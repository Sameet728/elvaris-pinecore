import { Trade, HistogramBin, ScatterPoint, ExitReasonStat } from '@/types/backtest';

export function computeDistributions(trades: Trade[]) {
  if (trades.length === 0) {
    return {
      rHistogram: [],
      durationHistogram: [],
      scatterMaeMfe: [],
      exitReasons: [],
    };
  }

  // 1. R-Multiple Histogram (0.25R bins from -3.0R to +3.0R)
  const binStep = 0.25;
  const minBin = -2.5;
  const maxBin = 2.5;
  const numBins = Math.round((maxBin - minBin) / binStep);
  const rCounts: number[] = new Array(numBins).fill(0);

  const returnsR = trades.map((t) => t.pnlR ?? t.rMultiple ?? (t.pnl > 0 ? 1.02 : -1.0));

  for (const r of returnsR) {
    let bIdx = Math.floor((r - minBin) / binStep);
    if (bIdx < 0) bIdx = 0;
    if (bIdx >= numBins) bIdx = numBins - 1;
    rCounts[bIdx]++;
  }

  const rHistogram: HistogramBin[] = [];
  for (let b = 0; b < numBins; b++) {
    const start = minBin + b * binStep;
    const end = start + binStep;
    const count = rCounts[b];
    rHistogram.push({
      binLabel: `${start >= 0 ? '+' : ''}${start.toFixed(2)}R`,
      binStart: start,
      binEnd: end,
      count,
      frequencyPct: Math.round((count / trades.length) * 1000) / 10,
    });
  }

  // 2. Duration Histogram (bins of 4 bars)
  const durations = trades.map((t) => t.barsHeld || t.durationBars || 8);
  const maxDur = Math.max(...durations, 24);
  const durStep = 4;
  const durBinsCount = Math.min(12, Math.ceil(maxDur / durStep));
  const durCounts: number[] = new Array(durBinsCount).fill(0);

  for (const d of durations) {
    let idx = Math.floor(d / durStep);
    if (idx >= durBinsCount) idx = durBinsCount - 1;
    durCounts[idx]++;
  }

  const durationHistogram: HistogramBin[] = [];
  for (let b = 0; b < durBinsCount; b++) {
    const start = b * durStep;
    const end = start + durStep;
    const count = durCounts[b];
    durationHistogram.push({
      binLabel: `${start}-${end} bars`,
      binStart: start,
      binEnd: end,
      count,
      frequencyPct: Math.round((count / trades.length) * 1000) / 10,
    });
  }

  // 3. MAE & MFE Scatter Points
  const scatterMaeMfe: ScatterPoint[] = trades.map((t) => {
    const r = t.pnlR ?? t.rMultiple ?? (t.pnl > 0 ? 1.02 : -1.0);
    return {
      tradeId: t.id,
      type: t.type,
      maeR: t.maeR !== undefined ? Math.round(t.maeR * 100) / 100 : (t.pnl <= 0 ? 1.0 : 0.3),
      mfeR: t.mfeR !== undefined ? Math.round(t.mfeR * 100) / 100 : (t.pnl > 0 ? 1.05 : 0.4),
      pnlR: Math.round(r * 100) / 100,
      isWin: t.isWin,
    };
  });

  // 4. Exit Reasons Breakdown
  const reasonMap: Record<
    string,
    { count: number; wins: number; totalR: number; totalCash: number }
  > = {};

  for (const t of trades) {
    const reason = t.exitReason || (t.isWin ? 'TP HIT' : 'SL HIT');
    if (!reasonMap[reason]) {
      reasonMap[reason] = { count: 0, wins: 0, totalR: 0, totalCash: 0 };
    }
    const r = t.pnlR ?? t.rMultiple ?? (t.pnl > 0 ? 1.02 : -1.0);
    reasonMap[reason].count++;
    if (t.isWin) reasonMap[reason].wins++;
    reasonMap[reason].totalR += r;
    reasonMap[reason].totalCash += t.pnl;
  }

  const exitReasons: ExitReasonStat[] = Object.entries(reasonMap).map(
    ([reason, data]) => ({
      reason,
      count: data.count,
      winRate: Math.round((data.wins / data.count) * 1000) / 10,
      avgR: Math.round((data.totalR / data.count) * 100) / 100,
      totalPnlCash: Math.round(data.totalCash * 100) / 100,
    })
  );

  return {
    rHistogram,
    durationHistogram,
    scatterMaeMfe,
    exitReasons,
  };
}

