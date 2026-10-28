import { getCandles as getTVCandles } from '@mathieuc/tradingview';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../../data');

const timeframes = [
  { tf: '1', name: '1m', file: 'xauusd_1m_tv.json', rangeDays: 14 },
  { tf: '5', name: '5m', file: 'xauusd_5m_tv.json', rangeDays: 35 },
  { tf: '15', name: '15m', file: 'xauusd_15m_tv.json', rangeDays: 95 },
  { tf: '30', name: '30m', file: 'xauusd_30m_tv.json', rangeDays: 125 },
  { tf: '60', name: '1h', file: 'xauusd_1h_tv.json', rangeDays: 210 },
  { tf: '240', name: '4h', file: 'xauusd_4h_tv.json', rangeDays: 410 },
];

async function updateAllData() {
  console.log('Fetching live authentic TradingView data up to today (October 12/13, 2026)...');
  const now = new Date();

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

        // Merge with existing data if present
        const targetFile = path.join(DATA_DIR, item.file);
        let merged = formatted;
        if (fs.existsSync(targetFile)) {
          try {
            const existing = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
            const map = new Map();
            for (const c of existing) map.set(c.openTime || c.time, c);
            for (const c of formatted) map.set(c.openTime || c.time, c);
            merged = Array.from(map.values()).sort((a, b) => (a.openTime || a.time) - (b.openTime || b.time));
          } catch (e) {
            console.warn(`Could not merge existing file ${item.file}, overwriting.`);
          }
        }

        fs.writeFileSync(targetFile, JSON.stringify(merged));
        const firstTime = new Date(merged[0].openTime || merged[0].time).toISOString();
        const lastTime = new Date(merged[merged.length - 1].openTime || merged[merged.length - 1].time).toISOString();
        console.log(`[Success] ${item.name}: ${merged.length} candles | From: ${firstTime} to ${lastTime}`);
      } else {
        console.warn(`[Warning] No candles returned for ${item.name}`);
      }
    } catch (err) {
      console.error(`[Error] Failed to fetch ${item.name}:`, err.message);
    }
  }

  // Also update SQLite database if db exists
  try {
    const { getDb } = await import('../../dist/db/database.js');
    const db = getDb();
    const c5 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_5m_tv.json'), 'utf8'));
    console.log('\nSyncing 5m candles into SQLite database...');
    const insert = db.prepare(`
      INSERT OR REPLACE INTO candles (open_time, open, high, low, close, volume)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertMany = db.transaction((rows) => {
      for (const r of rows) {
        insert.run(r.openTime, r.open, r.high, r.low, r.close, r.volume);
      }
    });
    insertMany(c5);
    console.log(`SQLite database successfully synced with ${c5.length} candles!`);
  } catch (err) {
    console.log('SQLite sync note:', err.message);
  }
}

updateAllData().catch(console.error);
