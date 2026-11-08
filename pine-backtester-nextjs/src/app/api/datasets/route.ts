import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Candle } from '@/types/backtest';

const DATA_DIR = path.join(process.cwd(), 'public', 'data');

export interface DatasetMetaResponse {
  id: string;
  name: string;
  symbol: string;
  timeframe: string;
  barCount: number;
  firstDate: string;
  lastDate: string;
  firstTime: number;
  lastTime: number;
  hasRealVolume: boolean;
}

export async function GET() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      return NextResponse.json({ datasets: [] });
    }

    const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));
    const datasets: DatasetMetaResponse[] = [];

    const symbolMap: Record<string, { symbol: string; name: string }> = {
      xauusd_15m: { symbol: 'FOREXCOM:XAUUSD', name: 'Gold / US Dollar' },
      eurusd_15m: { symbol: 'FX:EURUSD', name: 'Euro / US Dollar' },
      nas100_15m: { symbol: 'NASDAQ:NAS100', name: 'Nasdaq 100 Index' },
      btcusdt_15m: { symbol: 'BINANCE:BTCUSDT', name: 'Bitcoin / Tether' },
    };

    for (const file of files) {
      const id = file.replace('.json', '');
      const filePath = path.join(DATA_DIR, file);
      const raw = fs.readFileSync(filePath, 'utf8');
      const candles: Candle[] = JSON.parse(raw);

      if (candles.length > 0) {
        const firstTime = candles[0].openTime;
        const lastTime = candles[candles.length - 1].openTime;
        const firstDate = new Date(firstTime).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        const lastDate = new Date(lastTime).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });

        const mapping = symbolMap[id] || {
          symbol: id.toUpperCase(),
          name: id.toUpperCase(),
        };

        datasets.push({
          id,
          name: mapping.name,
          symbol: mapping.symbol,
          timeframe: '15',
          barCount: candles.length,
          firstDate,
          lastDate,
          firstTime,
          lastTime,
          hasRealVolume: false, // Synthetic 100 volume
        });
      }
    }

    return NextResponse.json({ datasets });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

