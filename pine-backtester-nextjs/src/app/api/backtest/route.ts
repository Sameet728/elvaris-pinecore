import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Candle, BacktestResult } from '@/types/backtest';
import { executePineScript } from '@/lib/pinets-runner';

const DATA_DIR = path.join(process.cwd(), 'public', 'data');

// In-memory module cache for parsed datasets
const datasetCache = new Map<string, Candle[]>();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      script,
      datasetName = 'xauusd_15m',
      datasetId,
      symbol = 'FOREXCOM:XAUUSD',
      timeframe = '15',
      initialCapital = 100000,
      riskDollars = 1000,
      commissionPerLot = 0,
      slippagePoints = 0,
      intrabarAssumption = 'sl_first',
      customCandles,
    } = body;

    const targetDataset = datasetId || datasetName;

    if (!script || typeof script !== 'string') {
      return NextResponse.json(
        { error: 'Valid Pine Script code is required.' },
        { status: 400 }
      );
    }

    let candles: Candle[] = [];

    if (Array.isArray(customCandles) && customCandles.length > 0) {
      candles = customCandles;
    } else {
      // Check in-memory cache
      if (datasetCache.has(targetDataset)) {
        candles = datasetCache.get(targetDataset)!;
      } else {
        const filePath = path.join(DATA_DIR, `${targetDataset}.json`);
        if (!fs.existsSync(filePath)) {
          return NextResponse.json(
            { error: `Dataset ${targetDataset} not found` },
            { status: 404 }
          );
        }
        const rawData = fs.readFileSync(filePath, 'utf8');
        candles = JSON.parse(rawData);
        datasetCache.set(targetDataset, candles);
      }
    }

    const result: BacktestResult = await executePineScript({
      script,
      candles,
      symbol,
      timeframe,
      datasetName: targetDataset,
      initialCapital: Number(initialCapital),
      riskDollars: Number(riskDollars),
      commissionPerLot: Number(commissionPerLot),
      slippagePoints: Number(slippagePoints),
      intrabarAssumption,
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[API /api/backtest] Error:', error);
    return NextResponse.json(
      { error: message || 'Failed to execute Pine Script backtest' },
      { status: 500 }
    );
  }
}
