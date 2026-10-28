import { getCandles } from '@mathieuc/tradingview';
import fs from 'fs';
import path from 'path';

const outDir = 'quant_seasonality/data';
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const targets = [
  { symbol: 'BINANCE:ETHUSDT', tf: 'D', label: 'ETH_Daily', file: 'ethusdt_daily.json' },
  { symbol: 'BINANCE:ETHUSDT', tf: '240', label: 'ETH_4H', file: 'ethusdt_4h.json' },
  { symbol: 'AMEX:SPY', tf: 'D', label: 'SPY_Daily', file: 'spy_daily.json' },
  { symbol: 'AMEX:SPY', tf: '240', label: 'SPY_4H', file: 'spy_4h.json' },
  { symbol: 'NASDAQ:QQQ', tf: 'D', label: 'QQQ_Daily', file: 'qqq_daily.json' },
  { symbol: 'NASDAQ:QQQ', tf: '240', label: 'QQQ_4H', file: 'qqq_4h.json' },
  { symbol: 'FX:EURUSD', tf: 'D', label: 'EURUSD_Daily', file: 'eurusd_daily.json' },
  { symbol: 'FX:EURUSD', tf: '240', label: 'EURUSD_4H', file: 'eurusd_4h.json' }
];

async function run() {
  console.log('--- Downloading Multi-Asset Data (ETH, SPY, QQQ, EURUSD) ---');

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
      console.log(`   Period: ${startDate} to ${endDate}`);
      console.log(`   Latest Close: ${formatted[formatted.length - 1].close}`);
    } catch (err) {
      console.error(`Error fetching ${t.label}:`, err.message);
    }
  }
  console.log('\nMulti-asset download complete!');
}

run();
