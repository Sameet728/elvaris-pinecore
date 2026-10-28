import { getCandles } from '@mathieuc/tradingview';
import fs from 'fs';

async function fetch5M() {
  console.log('Fetching maximum 5M candles from TradingView for FOREXCOM:XAUUSD...');
  try {
    const toDate = new Date(); // current date
    const fromDate = new Date(Date.now() - 60 * 24 * 3600 * 1000); // 60 days
    console.log(`From ${fromDate.toISOString()} to ${toDate.toISOString()}`);

    const raw = await getCandles({
      symbol: 'FOREXCOM:XAUUSD',
      timeframe: '5',
      from: fromDate,
      to: toDate
    });

    if (raw && raw.length > 0) {
      const formatted = raw.map(c => {
        const tMs = c.time * 1000;
        return {
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume || 100,
          openTime: tMs,
          closeTime: tMs + 5 * 60 * 1000
        };
      });
      console.log(`Fetched ${formatted.length} candles! First: ${new Date(formatted[0].openTime).toISOString()} Last: ${new Date(formatted[formatted.length-1].openTime).toISOString()}`);
      fs.writeFileSync('data/xauusd_5m_tv.json', JSON.stringify(formatted, null, 2));
      console.log('Saved to data/xauusd_5m_tv.json successfully!');
    } else {
      console.log('No candles returned.');
    }
  } catch (err) {
    console.error('Error fetching 5M candles:', err.message);
  }
}

fetch5M().catch(console.error);
