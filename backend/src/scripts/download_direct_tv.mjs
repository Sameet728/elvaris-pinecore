import { getCandles as getTVCandles } from '@mathieuc/tradingview';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../../data');

const timeframes = [
  { tf: '1', name: '1m', file: 'xauusd_1m_tv.json', rangeDays: 14 },
  { tf: '5', name: '5m', file: 'xauusd_5m_tv.json', rangeDays: 30 },
  { tf: '15', name: '15m', file: 'xauusd_15m_tv.json', rangeDays: 90 },
  { tf: '30', name: '30m', file: 'xauusd_30m_tv.json', rangeDays: 120 },
  { tf: '60', name: '1h', file: 'xauusd_1h_tv.json', rangeDays: 200 },
  { tf: '240', name: '4h', file: 'xauusd_4h_tv.json', rangeDays: 400 },
];

async function downloadAllDirectTV() {
  console.log('Downloading direct authentic TradingView data for all timeframes...');
  const now = new Date('2026-10-09T22:00:00.000Z');

  for (const item of timeframes) {
    const fromDate = new Date(now.getTime() - item.rangeDays * 24 * 3600 * 1000);
    console.log(`\nFetching ${item.name} (${item.tf}) from ${fromDate.toISOString()} to ${now.toISOString()}...`);
    try {
      const candles = await getTVCandles({
        symbol: 'FOREXCOM:XAUUSD',
        timeframe: item.tf,
        from: fromDate,
        to: now
      });

      if (candles && candles.length > 0) {
        const formatted = candles.map(c => {
          const tMs = c.time * 1000;
          const durMs = parseInt(item.tf) * 60 * 1000;
          return {
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume || 100,
            openTime: tMs,
            closeTime: tMs + durMs
          };
        });

        const targetFile = path.join(DATA_DIR, item.file);
        fs.writeFileSync(targetFile, JSON.stringify(formatted));
        console.log(`[Success] Downloaded ${formatted.length} direct TradingView candles for ${item.name}! Saved to ${item.file}`);
      } else {
        console.warn(`[Warning] No candles returned for ${item.name}`);
      }
    } catch (err) {
      console.error(`[Error] Failed to fetch ${item.name}:`, err.message);
    }
  }
}

downloadAllDirectTV().catch(console.error);
