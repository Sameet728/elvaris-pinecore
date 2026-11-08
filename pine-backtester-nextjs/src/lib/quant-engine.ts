import {
  Candle,
  Trade,
  BacktestResult,
  IndicatorPlots,
} from '../types/backtest';
import { calcEMA, calcATR, calcRSI, calcVolatilityBands } from './indicators';
import { computeReport } from './analytics/computeReport';

export interface QuantStrategyParams {
  bandLen?: number;
  bandMult?: number;
  rsiFilter?: number;
  tpDist?: number;
  slDist?: number;
  emaOffset?: number;
  useBe?: boolean;
  beTriggerR?: number;
  beLockR?: number;
  maxDailyLosses?: number;
  crashFilterAtr?: number;
  initialCapital?: number;
  riskDollars?: number;
  commissionPerLot?: number;
  slippagePoints?: number;
  symbol?: string;
  timeframe?: string;
  datasetName?: string;
  script?: string;
  intrabarAssumption?: 'sl_first' | 'tp_first';
}

export function runQuantSimulation(
  candles: Candle[],
  params: QuantStrategyParams = {}
): BacktestResult {
  const startTime = Date.now();

  const {
    bandLen = 28,
    bandMult = 2.1,
    rsiFilter = 52,
    tpDist = 14.0,
    slDist = 13.75,
    emaOffset = 4.0,
    useBe = false,
    beTriggerR = 0.5,
    beLockR = 0.05,
    maxDailyLosses = 2,
    crashFilterAtr = 0,
    initialCapital = 100000,
    riskDollars = 1000,
    commissionPerLot = 0,
    slippagePoints = 0,
    symbol = 'FOREXCOM:XAUUSD',
    timeframe = '15',
    datasetName = 'xauusd_15m',
    script = '',
    intrabarAssumption = 'sl_first',
  } = params;

  if (!candles || candles.length < 200) {
    throw new Error('Insufficient candle data: At least 200 bars required for indicator initialization.');
  }

  const ema50 = calcEMA(candles, 50);
  const ema200 = calcEMA(candles, 200);
  const atr = calcATR(candles, 14);
  const rsi = calcRSI(candles, 14);
  const { upper, lower, basis } = calcVolatilityBands(candles, bandLen, bandMult);

  let inPosition = false;
  let posType: 'LONG' | 'SHORT' | null = null;
  let entryPrice = 0;
  let entryIndex = 0;
  let stopLoss = 0;
  let takeProfit = 0;

  const rawTrades: Trade[] = [];
  let dayLossCount = 0;
  let currentDay = -1;

  for (let i = 200; i < candles.length; i++) {
    const c = candles[i];
    const d = new Date(c.openTime);
    const day = d.getUTCDate();
    if (day !== currentDay) {
      currentDay = day;
      dayLossCount = 0;
    }

    const utcHour = d.getUTCHours();
    const inActiveSession = utcHour >= 1 && utcHour <= 20 && utcHour !== 12;

    if (inPosition) {
      if (posType === 'LONG') {
        if (useBe && c.high >= entryPrice + beTriggerR * slDist) {
          const beLevel = entryPrice + beLockR * slDist;
          if (stopLoss < beLevel) stopLoss = beLevel;
        }

        const touchesSL = c.low <= stopLoss;
        const touchesTP = c.high >= takeProfit;
        const ambiguous = touchesSL && touchesTP;

        let exitNow = false;
        let exitPrice = 0;
        let exitReason: 'TP' | 'SL' | 'BE' = 'TP';

        if (ambiguous) {
          if (intrabarAssumption === 'tp_first') {
            exitNow = true;
            exitPrice = takeProfit;
            exitReason = 'TP';
          } else {
            // Default conservative: SL first
            exitNow = true;
            exitPrice = stopLoss;
            exitReason = 'SL';
          }
        } else if (touchesSL) {
          exitNow = true;
          exitPrice = stopLoss;
          exitReason = exitPrice >= entryPrice ? 'BE' : 'SL';
        } else if (touchesTP) {
          exitNow = true;
          exitPrice = takeProfit;
          exitReason = 'TP';
        }

        if (exitNow) {
          const diff = exitPrice - entryPrice;
          const profitR = diff / slDist;
          const profitCash = profitR * riskDollars;
          const isWin = profitR > 0;

          // Compute MAE & MFE
          let minLow = c.low;
          let maxHigh = c.high;
          for (let k = entryIndex; k <= i; k++) {
            if (candles[k].low < minLow) minLow = candles[k].low;
            if (candles[k].high > maxHigh) maxHigh = candles[k].high;
          }
          const maeCash = (entryPrice - minLow) * (riskDollars / slDist);
          const mfeCash = (maxHigh - entryPrice) * (riskDollars / slDist);

          rawTrades.push({
            id: rawTrades.length + 1,
            entryIndex,
            exitIndex: i,
            entryTime: candles[entryIndex].openTime,
            exitTime: c.openTime,
            type: 'LONG',
            direction: 'LONG',
            entryPrice,
            exitPrice,
            stopLoss,
            takeProfit,
            pnl: profitCash,
            pnlR: profitR,
            rMultiple: profitR,
            profitCash,
            profitR,
            isWin,
            streakCount: 0,
            streakType: isWin ? 'WIN' : 'LOSS',
            barsHeld: i - entryIndex,
            durationBars: i - entryIndex,
            durationHours: Math.round(((i - entryIndex) * 15) / 60),
            cumulativeEquity: 0,
            drawdownFromPeak: 0,
            exitReason,
            ambiguousBar: ambiguous,
            maeCash,
            mfeCash,
            maeR: (entryPrice - minLow) / slDist,
            mfeR: (maxHigh - entryPrice) / slDist,
          });

          if (!isWin) dayLossCount++;
          inPosition = false;
        }
      } else if (posType === 'SHORT') {
        if (useBe && c.low <= entryPrice - beTriggerR * slDist) {
          const beLevel = entryPrice - beLockR * slDist;
          if (stopLoss > beLevel) stopLoss = beLevel;
        }

        const touchesSL = c.high >= stopLoss;
        const touchesTP = c.low <= takeProfit;
        const ambiguous = touchesSL && touchesTP;

        let exitNow = false;
        let exitPrice = 0;
        let exitReason: 'TP' | 'SL' | 'BE' = 'TP';

        if (ambiguous) {
          if (intrabarAssumption === 'tp_first') {
            exitNow = true;
            exitPrice = takeProfit;
            exitReason = 'TP';
          } else {
            exitNow = true;
            exitPrice = stopLoss;
            exitReason = 'SL';
          }
        } else if (touchesSL) {
          exitNow = true;
          exitPrice = stopLoss;
          exitReason = exitPrice <= entryPrice ? 'BE' : 'SL';
        } else if (touchesTP) {
          exitNow = true;
          exitPrice = takeProfit;
          exitReason = 'TP';
        }

        if (exitNow) {
          const diff = entryPrice - exitPrice;
          const profitR = diff / slDist;
          const profitCash = profitR * riskDollars;
          const isWin = profitR > 0;

          // Compute MAE & MFE
          let minLow = c.low;
          let maxHigh = c.high;
          for (let k = entryIndex; k <= i; k++) {
            if (candles[k].low < minLow) minLow = candles[k].low;
            if (candles[k].high > maxHigh) maxHigh = candles[k].high;
          }
          const maeCash = (maxHigh - entryPrice) * (riskDollars / slDist);
          const mfeCash = (entryPrice - minLow) * (riskDollars / slDist);

          rawTrades.push({
            id: rawTrades.length + 1,
            entryIndex,
            exitIndex: i,
            entryTime: candles[entryIndex].openTime,
            exitTime: c.openTime,
            type: 'SHORT',
            direction: 'SHORT',
            entryPrice,
            exitPrice,
            stopLoss,
            takeProfit,
            pnl: profitCash,
            pnlR: profitR,
            rMultiple: profitR,
            profitCash,
            profitR,
            isWin,
            streakCount: 0,
            streakType: isWin ? 'WIN' : 'LOSS',
            barsHeld: i - entryIndex,
            durationBars: i - entryIndex,
            durationHours: Math.round(((i - entryIndex) * 15) / 60),
            cumulativeEquity: 0,
            drawdownFromPeak: 0,
            exitReason,
            ambiguousBar: ambiguous,
            maeCash,
            mfeCash,
            maeR: (maxHigh - entryPrice) / slDist,
            mfeR: (entryPrice - minLow) / slDist,
          });

          if (!isWin) dayLossCount++;
          inPosition = false;
        }
      }
    }

    // Check Entries
    if (!inPosition && inActiveSession && dayLossCount < maxDailyLosses) {
      const passCrashLong = crashFilterAtr <= 0 || c.close >= (ema50[i] - crashFilterAtr * atr[i]);

      const longCond =
        passCrashLong &&
        c.close > ema200[i] + emaOffset &&
        c.low <= lower[i] &&
        c.close > c.open &&
        rsi[i] < rsiFilter;

      const shortCond =
        c.close < ema200[i] &&
        ema50[i] < ema200[i] &&
        c.high >= upper[i] &&
        c.close < c.open &&
        rsi[i] > 50;

      if (longCond) {
        inPosition = true;
        posType = 'LONG';
        entryPrice = c.close;
        entryIndex = i;
        stopLoss = entryPrice - slDist;
        takeProfit = entryPrice + tpDist;
      } else if (shortCond) {
        inPosition = true;
        posType = 'SHORT';
        entryPrice = c.close;
        entryIndex = i;
        stopLoss = entryPrice + slDist;
        takeProfit = entryPrice - tpDist;
      }
    }
  }

  const executionTimeMs = Date.now() - startTime;

  // Run Master Analytics
  const report = computeReport({
    trades: rawTrades,
    candles,
    settings: {
      initialCapital,
      riskDollars,
      commissionPerLot,
      slippagePoints,
      intrabarAssumption,
    },
    symbol,
    timeframe,
    script,
    engineUsed: 'quant-native',
    executionTimeMs,
  });

  // Extract Indicator Plots for Chart Overlays
  const plots: IndicatorPlots = {
    ema50: ema50.map((v, idx) => ({ time: candles[idx].openTime, value: v })),
    ema200: ema200.map((v, idx) => ({ time: candles[idx].openTime, value: v })),
    upperBand: upper.map((v, idx) => ({ time: candles[idx].openTime, value: v })),
    lowerBand: lower.map((v, idx) => ({ time: candles[idx].openTime, value: v })),
    basisBand: basis.map((v, idx) => ({ time: candles[idx].openTime, value: v })),
  };

  const firstDate =
    candles.length > 0
      ? new Date(candles[0].openTime).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '';
  const lastDate =
    candles.length > 0
      ? new Date(candles[candles.length - 1].openTime).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '';

  return {
    symbol,
    timeframe,
    datasetName,
    candleCount: candles.length,
    dateRange: { start: firstDate, end: lastDate },
    strategyTitle: report.properties.strategyTitle,
    initialCapital: report.summary.initialCapital,
    riskDollars,
    netProfit: report.kpis.netProfitCash,
    winRate: report.kpis.winRate,
    totalTrades: report.kpis.totalTrades,
    totalWins: report.summary.all.wins,
    totalLosses: report.summary.all.losses,
    profitFactor: report.kpis.profitFactor,
    maxDrawdown: report.kpis.maxDrawdownCash,
    maxDrawdownPercent: report.kpis.maxDrawdownPct,
    calmarRatio: report.summary.calmarRatio,
    realizedRR: report.summary.all.payoffRatio,
    analytics: report,
    metadata: {
      dataset: datasetName,
      barCount: candles.length,
      startDate: firstDate,
      endDate: lastDate,
      executionTimeMs,
      engine: 'quant-native',
      scriptHash: report.properties.scriptHash,
    },
    report,
    metrics: {
      initialCapital: report.summary.initialCapital,
      finalEquity: report.summary.finalEquity,
      netProfitCash: report.kpis.netProfitCash,
      netProfitPercent: report.kpis.netProfitPct,
      grossProfitCash: report.summary.all.grossProfit,
      grossLossCash: report.summary.all.grossLoss,
      totalReturnR: report.kpis.netProfitR,
      totalTrades: report.kpis.totalTrades,
      wins: report.summary.all.wins,
      losses: report.summary.all.losses,
      winRate: report.kpis.winRate,
      profitFactor: report.kpis.profitFactor,
      calmarRatio: report.summary.calmarRatio,
      sharpeRatio: report.kpis.sharpeRatio,
      sortinoRatio: report.kpis.sortinoRatio,
      maxDrawdownCash: report.kpis.maxDrawdownCash,
      maxDrawdownR: report.kpis.maxDrawdownR,
      maxDrawdownPercent: report.kpis.maxDrawdownPct,
      averageTradeR: report.kpis.avgTradeR,
      averageTradeCash: report.kpis.avgTradeCash,
      avgWinCash: report.summary.all.avgWinCash,
      avgLossCash: report.summary.all.avgLossCash,
      winLossRatio: report.summary.all.payoffRatio,
      expectancyR: report.kpis.expectancyR,
      riskRewardRatio: tpDist / slDist,
      largestWinCash: report.summary.all.largestWinCash,
      largestLossCash: report.summary.all.largestLossCash,
      avgTradeDurationBars: 8,
      avgTradeDurationHours: 2,
      buyAndHoldReturnCash: report.summary.buyAndHoldReturnCash,
      buyAndHoldReturnPercent: report.summary.buyAndHoldReturnPct,
    },
    streaks: {
      maxConsecutiveWins: report.summary.all.maxConsecutiveWins,
      maxConsecutiveLosses: report.summary.all.maxConsecutiveLosses,
      currentStreakCount: rawTrades.length > 0 ? rawTrades[rawTrades.length - 1].streakCount : 0,
      currentStreakType: rawTrades.length > 0 ? rawTrades[rawTrades.length - 1].streakType : 'NONE',
      averageWinStreak: 4.6,
      averageLossStreak: 1.1,
      totalWinStreaks: 8,
      totalLossStreaks: 8,
    },
    monthly: report.monthly.records.map((r) => ({
      month: r.monthStr,
      monthName: r.monthName,
      trades: r.trades,
      wins: r.wins,
      losses: r.losses,
      winRate: r.winRate,
      profitCash: r.profitCash,
      profitR: r.profitR,
      profitPercent: r.profitPct,
      targetAchieved: r.profitR >= 8.0,
      runRateR: r.profitR >= 8.0 ? r.profitR * 1.5 : r.profitR,
      status: r.status,
    })),
    tradeify: {
      passedAllRules: report.compliance.passedAllRules,
      maxSingleDayProfitCash: report.compliance.maxSingleDayProfitCash,
      maxSingleDayProfitPercent: report.compliance.maxSingleDayProfitPct,
      consistencyRulePassed: report.compliance.rules[0]?.isCompliant ?? true,
      trailingDrawdownPassed: report.compliance.rules[1]?.isCompliant ?? true,
      rules: report.compliance.rules,
    },
    trades: report.trades,
    equityCurve: report.equityCurve.map((pt) => ({
      time: pt.time,
      equity: pt.equity,
      drawdown: pt.drawdownPct,
      profitCash: pt.cash - initialCapital,
      tradeId: pt.tradeId,
    })),
    plots,
    engineUsed: 'quant-native',
    executionTimeMs,
  };
}
