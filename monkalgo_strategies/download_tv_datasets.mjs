import { getCandles } from '@mathieuc/tradingview';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('monkalgo_strategies/data');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const ASSETS = [
  { symbol: 'FOREXCOM:NAS100', name: 'nas100', tfs: ['1', '5', '15', '60'] },
  { symbol: 'FOREXCOM:SPX500', name: 'spx500', tfs: ['5', '15', '60'] },
  { symbol: 'FOREXCOM:XAUUSD', name: 'xauusd', tfs: ['5', '15', '60'] },
  { symbol: 'FX:EURUSD',        name: 'eurusd', tfs: ['5', '15', '60'] },
];

async function downloadAll() {
  console.log('=== Downloading Authentic TradingView Data via @mathieuc/tradingview ===\n');

  for (const asset of ASSETS) {
    for (const tf of asset.tfs) {
      const filename = `${asset.name}_${tf}m.json`.replace('60m', '1h');
      const filePath = path.join(outDir, filename);
      console.log(`Fetching ${asset.symbol} [TF: ${tf}] -> ${filename}...`);

      try {
        const raw = await getCandles({
          symbol: asset.symbol,
          timeframe: tf,
          count: 10000,
        });

        if (!raw || raw.length === 0) {
          console.warn(`  Warning: No candles returned for ${asset.symbol} (${tf})`);
          continue;
        }

        // Validate and clean
        const candles = [];
        const seen = new Set();
        for (const c of raw) {
          const openTime = c.time * 1000;
          if (seen.has(openTime)) continue;
          seen.add(openTime);

          const open = Number(c.open);
          const high = Number(c.high);
          const low = Number(c.low);
          const close = Number(c.close);
          const volume = Number(c.volume) || 100;

          if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) continue;
          if (high < low || open <= 0 || close <= 0) continue;

          candles.push({
            openTime,
            open,
            high,
            low,
            close,
            volume,
          });
        }

        // Sort ascending by openTime
        candles.sort((a, b) => a.openTime - b.openTime);

        fs.writeFileSync(filePath, JSON.stringify(candles), 'utf-8');
        const startStr = new Date(candles[0].openTime).toISOString().slice(0, 10);
        const endStr = new Date(candles[candles.length - 1].openTime).toISOString().slice(0, 10);
        console.log(`  Saved ${candles.length} bars (${startStr} -> ${endStr}) to ${filename}`);
      } catch (err) {
        console.error(`  ERROR fetching ${asset.symbol} (${tf}):`, err.message);
      }
    }
  }

  console.log('\nAll TradingView datasets downloaded successfully!');
}

downloadAll();

