import { getCandles as getTVCandles } from '@mathieuc/tradingview';
import fs from 'fs';

async function fetchFull1H() {
  console.log('Fetching full 1H candles from Jan 2025 to Oct 2026...');
  const fromDate = new Date('2025-01-01T00:00:00.000Z');
  const toDate = new Date('2026-10-15T00:00:00.000Z');

  try {
    const candles = await getTVCandles({
      symbol: 'FOREXCOM:XAUUSD',
      timeframe: '60',
      from: fromDate,
      to: toDate
    });

    if (candles && candles.length > 0) {
      const formatted = candles.map(c => {
        const tMs = c.time * 1000;
        return {
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume || 100,
          openTime: tMs,
          closeTime: tMs + 3600 * 1000
        };
      });
      fs.writeFileSync('data/xauusd_1h_tv.json', JSON.stringify(formatted));
      console.log(`Successfully saved ${formatted.length} 1H candles from ${new Date(formatted[0].openTime).toISOString()} to ${new Date(formatted[formatted.length-1].openTime).toISOString()}`);
    } else {
      console.log('No candles returned');
    }
  } catch (e) {
    console.error('Fetch error:', e.message);
  }
}

fetchFull1H().catch(console.error);
