import { getCandles } from '@mathieuc/tradingview';
import fs from 'fs';

async function fetchBTC() {
  console.log('Fetching BTCUSDT data from TradingView (BINANCE:BTCUSDT)...');

  const configs = [
    { tf: '15', filename: 'data/btcusdt_15m_tv.json', label: '15-Minute (15M)' },
    { tf: '60', filename: 'data/btcusdt_1h_tv.json', label: '1-Hour (1H)' },
    { tf: '5', filename: 'data/btcusdt_5m_tv.json', label: '5-Minute (5M)' }
  ];

  for (const c of configs) {
    console.log(`\nDownloading ${c.label}...`);
    try {
      const raw = await getCandles({
        symbol: 'BINANCE:BTCUSDT',
        timeframe: c.tf,
        count: 10000
      });

      if (!raw || raw.length === 0) {
        console.error(`Failed to fetch ${c.label}`);
        continue;
      }

      // Format candles consistently
      const formatted = raw.map(bar => ({
        time: (bar.time > 1e11 ? bar.time : bar.time * 1000),
        openTime: (bar.time > 1e11 ? bar.time : bar.time * 1000),
        open: Number(bar.open),
        high: Number(bar.high),
        low: Number(bar.low),
        close: Number(bar.close),
        volume: Number(bar.volume || 0)
      }));

      // Sort by time ascending
      formatted.sort((a, b) => a.time - b.time);

      fs.writeFileSync(c.filename, JSON.stringify(formatted, null, 2), 'utf8');
      console.log(`✅ Saved ${formatted.length} candles to ${c.filename}`);
      console.log(`   Start: ${new Date(formatted[0].time).toISOString()}`);
      console.log(`   End:   ${new Date(formatted[formatted.length - 1].time).toISOString()}`);
      console.log(`   Price Range: $${Math.min(...formatted.slice(-100).map(x=>x.close))} - $${Math.max(...formatted.slice(-100).map(x=>x.close))}`);
    } catch (err) {
      console.error(`Error fetching ${c.label}:`, err.message);
    }
  }
}

fetchBTC().catch(console.error);
