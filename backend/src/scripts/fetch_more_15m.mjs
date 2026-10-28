import { getCandles } from '@mathieuc/tradingview';
import fs from 'fs';

async function fetch15M() {
  console.log('Fetching maximum 15M candles from TradingView for FOREXCOM:XAUUSD...');
  try {
    const toDate = new Date();
    const fromDate = new Date(Date.now() - 120 * 24 * 3600 * 1000); // 120 days

    const raw = await getCandles({
      symbol: 'FOREXCOM:XAUUSD',
      timeframe: '15',
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
          closeTime: tMs + 15 * 60 * 1000
        };
      });
      console.log(`Fetched ${formatted.length} candles! First: ${new Date(formatted[0].openTime).toISOString()} Last: ${new Date(formatted[formatted.length-1].openTime).toISOString()}`);
      fs.writeFileSync('data/xauusd_15m_tv.json', JSON.stringify(formatted, null, 2));
      console.log('Saved to data/xauusd_15m_tv.json successfully!');
    }
  } catch (err) {
    console.error('Error fetching 15M:', err.message);
  }
}

fetch15M().catch(console.error);
