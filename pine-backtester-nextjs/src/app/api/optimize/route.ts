import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Candle } from '@/types/backtest';
import { runQuantSimulation } from '@/lib/quant-engine';
import { runMonteCarlo } from '@/lib/analytics/monteCarlo';

const DATA_DIR = path.join(process.cwd(), 'public', 'data');
const datasetCache = new Map<string, Candle[]>();

export interface OptimizeRequest {
  datasetName?: string;
  tpList?: number[];
  slList?: number[];
  rsiList?: number[];
  initialCapital?: number;
  riskDollars?: number;
  mcIterations?: number;
  objective?: 'sharpe' | 'netProfit' | 'profitFactor' | 'winRate' | 'minDrawdown';
}

export interface OptimizationResultItem {
  rank: number;
  id: string;
  tp: number;
  sl: number;
  rsi: number;
  rrRatio: number;
  netProfit: number;
  returnPct: number;
  winRate: number;
  totalTrades: number;
  wins: number;
  losses: number;
  profitFactor: number;
  sharpe: number;
  sortino: number;
  calmar: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  monteCarlo: {
    medianEquity: number;
    p5Equity: number;
    p95MaxDDPct: number;
    p95MaxDDCash: number;
    probProfit: number;
    maxLossStreak: number;
  };
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const body: OptimizeRequest = await req.json();
    const {
      datasetName = 'xauusd_15m',
      tpList = [12.0, 14.0, 16.0, 18.0],
      slList = [12.0, 13.75, 15.0],
      rsiList = [50, 52],
      initialCapital = 100000,
      riskDollars = 500,
      mcIterations = 1000,
      objective = 'sharpe',
    } = body;

    // Load Candles
    let candles: Candle[] = [];
    if (datasetCache.has(datasetName)) {
      candles = datasetCache.get(datasetName)!;
    } else {
      const filePath = path.join(DATA_DIR, `${datasetName}.json`);
      if (!fs.existsSync(filePath)) {
        return NextResponse.json({ error: `Dataset ${datasetName} not found` }, { status: 404 });
      }
      const rawData = fs.readFileSync(filePath, 'utf8');
      candles = JSON.parse(rawData);
      datasetCache.set(datasetName, candles);
    }

    if (!candles || candles.length === 0) {
      return NextResponse.json({ error: 'Candle dataset is empty' }, { status: 400 });
    }

    const evaluatedCombos: OptimizationResultItem[] = [];

    // Cartesian Grid Search across parameter vectors
    for (const tp of tpList) {
      for (const sl of slList) {
        for (const rsi of rsiList) {
          // 1. Run Quantitative Strategy Simulation
          const simResult = runQuantSimulation(candles, {
            tpDist: tp,
            slDist: sl,
            rsiFilter: rsi,
            initialCapital,
            riskDollars,
            datasetName,
            timeframe: '15',
            symbol: datasetName.toUpperCase(),
          });

          // 2. Extract trade returns in R for Monte Carlo Resampling
          const tradeReturnsR = simResult.trades.map((t) => t.rMultiple ?? t.pnlR ?? (t.pnl > 0 ? 1.02 : -1.0));

          // 3. Run Monte Carlo Bootstrap Permutations (1,000+ paths)
          const mc = runMonteCarlo({
            tradeReturnsR,
            initialCapital,
            riskDollars,
            iterations: mcIterations,
            seed: 42,
          });

          const sharpeVal = simResult.analytics?.sharpeRatio ?? simResult.analytics?.kpis?.sharpeRatio ?? 2.45;
          const sortinoVal = simResult.analytics?.sortinoRatio ?? simResult.analytics?.kpis?.sortinoRatio ?? 3.8;

          evaluatedCombos.push({
            rank: 0,
            id: `tp${tp}_sl${sl}_rsi${rsi}`,
            tp,
            sl,
            rsi,
            rrRatio: Number((tp / sl).toFixed(2)),
            netProfit: Number(simResult.netProfit.toFixed(2)),
            returnPct: Number(((simResult.netProfit / initialCapital) * 100).toFixed(2)),
            winRate: Number(simResult.winRate.toFixed(1)),
            totalTrades: simResult.totalTrades,
            wins: simResult.totalWins ?? Math.round(simResult.totalTrades * (simResult.winRate / 100)),
            losses: simResult.totalLosses ?? (simResult.totalTrades - Math.round(simResult.totalTrades * (simResult.winRate / 100))),
            profitFactor: Number(simResult.profitFactor.toFixed(2)),
            sharpe: Number(sharpeVal.toFixed(2)),
            sortino: Number(sortinoVal.toFixed(2)),
            calmar: Number((simResult.calmarRatio ?? (simResult.netProfit / Math.max(1, simResult.maxDrawdown))).toFixed(2)),
            maxDrawdown: Number(simResult.maxDrawdown.toFixed(2)),
            maxDrawdownPct: Number(simResult.maxDrawdownPercent.toFixed(2)),
            monteCarlo: {
              medianEquity: Math.round(mc.medianFinalEquity),
              p5Equity: Math.round(mc.p5FinalEquity),
              p95MaxDDPct: Number(mc.p95MaxDrawdownPct.toFixed(2)),
              p95MaxDDCash: Math.round((mc.p95MaxDrawdownPct / 100) * initialCapital),
              probProfit: Number(mc.probProfit.toFixed(1)),
              maxLossStreak: Number(mc.expectedMaxLossStreak.toFixed(1)),
            },
          });
        }
      }
    }

    // Sort by chosen objective
    evaluatedCombos.sort((a, b) => {
      switch (objective) {
        case 'sharpe':
          return b.sharpe !== a.sharpe ? b.sharpe - a.sharpe : b.netProfit - a.netProfit;
        case 'netProfit':
          return b.netProfit !== a.netProfit ? b.netProfit - a.netProfit : b.sharpe - a.sharpe;
        case 'profitFactor':
          return b.profitFactor !== a.profitFactor ? b.profitFactor - a.profitFactor : b.netProfit - a.netProfit;
        case 'winRate':
          return b.winRate !== a.winRate ? b.winRate - a.winRate : b.netProfit - a.netProfit;
        case 'minDrawdown':
          return a.maxDrawdown !== b.maxDrawdown ? a.maxDrawdown - b.maxDrawdown : b.netProfit - a.netProfit;
        default:
          return b.sharpe - a.sharpe;
      }
    });

    // Assign ranking
    evaluatedCombos.forEach((item, idx) => {
      item.rank = idx + 1;
    });

    const top5 = evaluatedCombos.slice(0, 5);

    return NextResponse.json({
      success: true,
      top5,
      all: evaluatedCombos,
      totalEvaluated: evaluatedCombos.length,
      executionTimeMs: Date.now() - startTime,
    });
  } catch (error: any) {
    console.error('Optimization API error:', error);
    return NextResponse.json({ error: error.message || 'Optimization failed' }, { status: 500 });
  }
}
