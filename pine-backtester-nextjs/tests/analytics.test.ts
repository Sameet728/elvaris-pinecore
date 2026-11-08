import { describe, it, expect } from 'vitest';
import { computeReport } from '../src/lib/analytics/computeReport';
import { Trade, Candle } from '../src/types/backtest';

describe('computeReport analytics engine', () => {
  // Hand-built 12-trade deterministic test fixture
  // 9 Wins, 3 Losses (75% Win Rate)
  const baseTime = 1754179200000; // Aug 2026 epoch ms
  const testTrades: Trade[] = [
    { id: 1, entryIndex: 10, exitIndex: 18, entryTime: baseTime, exitTime: baseTime + 3600000 * 2, type: 'LONG', entryPrice: 2400, exitPrice: 2414, stopLoss: 2386.25, takeProfit: 2414, pnl: 1400, pnlR: 1.02, rMultiple: 1.02, isWin: true, streakCount: 1, streakType: 'WIN', barsHeld: 8, durationHours: 2, cumulativeEquity: 101400, drawdownFromPeak: 0 },
    { id: 2, entryIndex: 30, exitIndex: 38, entryTime: baseTime + 86400000, exitTime: baseTime + 86400000 + 3600000 * 2, type: 'LONG', entryPrice: 2410, exitPrice: 2424, stopLoss: 2396.25, takeProfit: 2424, pnl: 1400, pnlR: 1.02, rMultiple: 1.02, isWin: true, streakCount: 2, streakType: 'WIN', barsHeld: 8, durationHours: 2, cumulativeEquity: 102800, drawdownFromPeak: 0 },
    { id: 3, entryIndex: 50, exitIndex: 58, entryTime: baseTime + 86400000 * 2, exitTime: baseTime + 86400000 * 2 + 3600000 * 2, type: 'SHORT', entryPrice: 2420, exitPrice: 2406, stopLoss: 2433.75, takeProfit: 2406, pnl: 1400, pnlR: 1.02, rMultiple: 1.02, isWin: true, streakCount: 3, streakType: 'WIN', barsHeld: 8, durationHours: 2, cumulativeEquity: 104200, drawdownFromPeak: 0 },
    { id: 4, entryIndex: 70, exitIndex: 78, entryTime: baseTime + 86400000 * 3, exitTime: baseTime + 86400000 * 3 + 3600000 * 2, type: 'LONG', entryPrice: 2415, exitPrice: 2401.25, stopLoss: 2401.25, takeProfit: 2429, pnl: -1375, pnlR: -1.0, rMultiple: -1.0, isWin: false, streakCount: 1, streakType: 'LOSS', barsHeld: 8, durationHours: 2, cumulativeEquity: 102825, drawdownFromPeak: 1375 },
    { id: 5, entryIndex: 90, exitIndex: 98, entryTime: baseTime + 86400000 * 4, exitTime: baseTime + 86400000 * 4 + 3600000 * 2, type: 'LONG', entryPrice: 2405, exitPrice: 2419, stopLoss: 2391.25, takeProfit: 2419, pnl: 1400, pnlR: 1.02, rMultiple: 1.02, isWin: true, streakCount: 1, streakType: 'WIN', barsHeld: 8, durationHours: 2, cumulativeEquity: 104225, drawdownFromPeak: 0 },
    { id: 6, entryIndex: 110, exitIndex: 118, entryTime: baseTime + 86400000 * 5, exitTime: baseTime + 86400000 * 5 + 3600000 * 2, type: 'SHORT', entryPrice: 2430, exitPrice: 2416, stopLoss: 2443.75, takeProfit: 2416, pnl: 1400, pnlR: 1.02, rMultiple: 1.02, isWin: true, streakCount: 2, streakType: 'WIN', barsHeld: 8, durationHours: 2, cumulativeEquity: 105625, drawdownFromPeak: 0 },
    { id: 7, entryIndex: 130, exitIndex: 138, entryTime: baseTime + 86400000 * 6, exitTime: baseTime + 86400000 * 6 + 3600000 * 2, type: 'LONG', entryPrice: 2425, exitPrice: 2411.25, stopLoss: 2411.25, takeProfit: 2439, pnl: -1375, pnlR: -1.0, rMultiple: -1.0, isWin: false, streakCount: 1, streakType: 'LOSS', barsHeld: 8, durationHours: 2, cumulativeEquity: 104250, drawdownFromPeak: 1375 },
    { id: 8, entryIndex: 150, exitIndex: 158, entryTime: baseTime + 86400000 * 7, exitTime: baseTime + 86400000 * 7 + 3600000 * 2, type: 'LONG', entryPrice: 2410, exitPrice: 2396.25, stopLoss: 2396.25, takeProfit: 2424, pnl: -1375, pnlR: -1.0, rMultiple: -1.0, isWin: false, streakCount: 2, streakType: 'LOSS', barsHeld: 8, durationHours: 2, cumulativeEquity: 102875, drawdownFromPeak: 2750 },
    { id: 9, entryIndex: 170, exitIndex: 178, entryTime: baseTime + 86400000 * 8, exitTime: baseTime + 86400000 * 8 + 3600000 * 2, type: 'SHORT', entryPrice: 2400, exitPrice: 2386, stopLoss: 2413.75, takeProfit: 2386, pnl: 1400, pnlR: 1.02, rMultiple: 1.02, isWin: true, streakCount: 1, streakType: 'WIN', barsHeld: 8, durationHours: 2, cumulativeEquity: 104275, drawdownFromPeak: 1350 },
    { id: 10, entryIndex: 190, exitIndex: 198, entryTime: baseTime + 86400000 * 9, exitTime: baseTime + 86400000 * 9 + 3600000 * 2, type: 'LONG', entryPrice: 2390, exitPrice: 2404, stopLoss: 2376.25, takeProfit: 2404, pnl: 1400, pnlR: 1.02, rMultiple: 1.02, isWin: true, streakCount: 2, streakType: 'WIN', barsHeld: 8, durationHours: 2, cumulativeEquity: 105675, drawdownFromPeak: 0 },
    { id: 11, entryIndex: 210, exitIndex: 218, entryTime: baseTime + 86400000 * 10, exitTime: baseTime + 86400000 * 10 + 3600000 * 2, type: 'LONG', entryPrice: 2400, exitPrice: 2414, stopLoss: 2386.25, takeProfit: 2414, pnl: 1400, pnlR: 1.02, rMultiple: 1.02, isWin: true, streakCount: 3, streakType: 'WIN', barsHeld: 8, durationHours: 2, cumulativeEquity: 107075, drawdownFromPeak: 0 },
    { id: 12, entryIndex: 230, exitIndex: 238, entryTime: baseTime + 86400000 * 11, exitTime: baseTime + 86400000 * 11 + 3600000 * 2, type: 'SHORT', entryPrice: 2410, exitPrice: 2396, stopLoss: 2423.75, takeProfit: 2396, pnl: 1400, pnlR: 1.02, rMultiple: 1.02, isWin: true, streakCount: 4, streakType: 'WIN', barsHeld: 8, durationHours: 2, cumulativeEquity: 108475, drawdownFromPeak: 0 },
  ];

  const dummyCandles: Candle[] = Array.from({ length: 300 }, (_, i) => ({
    openTime: baseTime + i * 15 * 60 * 1000,
    open: 2400 + (i % 20),
    high: 2410 + (i % 20),
    low: 2395 + (i % 20),
    close: 2405 + (i % 20),
    volume: 100,
  }));

  it('computes correct baseline metrics on 12-trade fixture', () => {
    const report = computeReport({
      trades: testTrades,
      candles: dummyCandles,
      settings: { initialCapital: 100000, riskDollars: 1000 },
    });

    expect(report.kpis.totalTrades).toBe(12);
    expect(report.kpis.winRate).toBe(75.0); // 9/12 = 75%
    expect(report.summary.all.wins).toBe(9);
    expect(report.summary.all.losses).toBe(3);

    // 9 wins * $1400 = $12,600 gross profit
    expect(report.summary.all.grossProfit).toBe(12600);
    // 3 losses * $1375 = $4,125 gross loss
    expect(report.summary.all.grossLoss).toBe(4125);
    // Net profit = $12,600 - $4,125 = $8,475
    expect(report.kpis.netProfitCash).toBe(8475);
    expect(report.summary.finalEquity).toBe(108475);

    // Profit Factor = 12600 / 4125 = 3.05
    expect(report.kpis.profitFactor).toBeCloseTo(3.05, 2);

    // Max Consecutive Streaks
    expect(report.summary.all.maxConsecutiveWins).toBe(4);
    expect(report.summary.all.maxConsecutiveLosses).toBe(2);

    // Max Drawdown: Trade 7 & 8 back-to-back losses = $2,750
    expect(report.kpis.maxDrawdownCash).toBe(2750);
  });

  it('handles edge case: 0 trades gracefully', () => {
    const report = computeReport({
      trades: [],
      candles: dummyCandles,
      settings: { initialCapital: 100000 },
    });

    expect(report.kpis.totalTrades).toBe(0);
    expect(report.kpis.winRate).toBe(0);
    expect(report.kpis.netProfitCash).toBe(0);
    expect(report.kpis.profitFactor).toBe(0);
    expect(report.summary.finalEquity).toBe(100000);
    expect(report.kpis.verdict.status).toBe('Fragile');
  });

  it('handles edge case: 100% winning trades without division by zero', () => {
    const allWins = testTrades.filter((t) => t.isWin);
    const report = computeReport({
      trades: allWins,
      candles: dummyCandles,
      settings: { initialCapital: 100000 },
    });

    expect(report.kpis.winRate).toBe(100);
    expect(report.summary.all.grossLoss).toBe(0);
    expect(report.kpis.profitFactor).toBeGreaterThanOrEqual(99);
    expect(report.kpis.maxDrawdownCash).toBe(0);
  });

  it('executes Monte Carlo simulation reproducibly with seed', () => {
    const report1 = computeReport({
      trades: testTrades,
      candles: dummyCandles,
    });
    const report2 = computeReport({
      trades: testTrades,
      candles: dummyCandles,
    });

    expect(report1.monteCarlo.medianFinalEquity).toBe(report2.monteCarlo.medianFinalEquity);
    expect(report1.monteCarlo.probProfit).toBe(report2.monteCarlo.probProfit);
    expect(report1.monteCarlo.probProfit).toBeGreaterThan(90);
  });
});

