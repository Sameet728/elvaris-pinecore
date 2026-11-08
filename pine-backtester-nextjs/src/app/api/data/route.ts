import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Candle } from '@/types/backtest';

const DATA_DIR = path.join(process.cwd(), 'public', 'data');

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dataset = searchParams.get('dataset') || 'xauusd_15m';
    const limit = parseInt(searchParams.get('limit') || '0', 10);

    const filePath = path.join(DATA_DIR, `${dataset}.json`);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: `Dataset ${dataset} not found in public/data` },
        { status: 404 }
      );
    }

    const rawData = fs.readFileSync(filePath, 'utf8');
    let candles: Candle[] = JSON.parse(rawData);

    if (limit > 0 && candles.length > limit) {
      candles = candles.slice(-limit);
    }

    const response = NextResponse.json({
      success: true,
      dataset,
      count: candles.length,
      firstCandle: candles[0],
      lastCandle: candles[candles.length - 1],
      candles,
    });

    response.headers.set(
      'Cache-Control',
      'public, max-age=3600, stale-while-revalidate=86400'
    );

    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
