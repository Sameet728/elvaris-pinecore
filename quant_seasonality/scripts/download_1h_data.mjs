import { getCandles } from '@mathieuc/tradingview';
import fs from 'fs';
import path from 'path';

const outDir = 'quant_seasonality/data';

const targets = [
  { symbol: 'BINANCE:BTCUSDT', tf: '60', label: 'BTC_1H', file: 'btcusdt_1h.json' },
  { symbol: 'BINANCE:ETHUSDT', tf: '60', label: 'ETH_1H', file: 'ethusdt_1h.json' },
  { symbol: 'FOREXCOM:XAUUSD', tf: '60', label: 'XAUUSD_1H', file: 'xauusd_1h.json' }
];

async function run() {
  console.log('--- Downloading 1-Hour (1H) Granular Tick Data from TradingView ---');

  for (const t of targets) {
    console.log(`\nFetching ${t.label} (${t.symbol}, timeframe: ${t.tf})...`);
    try {
      const raw = await getCandles({
        symbol: t.symbol,
        timeframe: t.tf,
        count: 10000
      });

      if (!raw || raw.length === 0) {
        console.warn(`No candles returned for ${t.label}`);
        continue;
      }

      const formatted = raw.map(bar => ({
        time: (bar.time > 1e11 ? bar.time : bar.time * 1000),
        openTime: (bar.time > 1e11 ? bar.time : bar.time * 1000),
        open: Number(bar.open),
        high: Number(bar.high),
        low: Number(bar.low),
        close: Number(bar.close),
        volume: Number(bar.volume || 0)
      }));

      formatted.sort((a, b) => a.time - b.time);

      const filePath = path.join(outDir, t.file);
      fs.writeFileSync(filePath, JSON.stringify(formatted, null, 2), 'utf8');

      const startDate = new Date(formatted[0].time).toISOString().substring(0, 10);
      const endDate = new Date(formatted[formatted.length - 1].time).toISOString().substring(0, 10);

      console.log(`✅ Saved ${formatted.length} bars to ${filePath}`);
      console.log(`   Period: ${startDate} to ${endDate} (${(formatted.length / (24 * 365)).toFixed(1)} years)`);
      console.log(`   Latest Close: ${formatted[formatted.length - 1].close}`);
    } catch (err) {
      console.error(`Error fetching ${t.label}:`, err.message);
    }
  }
  console.log('\n1H Data downloads complete!');
}

run();
