import { DatabaseSync } from 'node:sqlite';
import { getCandles } from '@mathieuc/tradingview';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../../../data/xauusd.db');

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = NORMAL');

const TIMEFRAMES = [
  { tf: '1', table: 'candles_1m', label: '1-Minute (M1)' },
  { tf: '5', table: 'candles_5m', label: '5-Minute (M5)' },
  { tf: '15', table: 'candles_15m', label: '15-Minute (M15)' },
  { tf: '60', table: 'candles_1h', label: '1-Hour (H1)' },
  { tf: '240', table: 'candles_4h', label: '4-Hour (H4)' },
  { tf: 'D', table: 'candles_1d', label: 'Daily (1D)' },
];

console.log('=== Downloading Maximum TradingView Data for FOREXCOM:XAUUSD ===');

for (const item of TIMEFRAMES) {
  console.log(`\nFetching ${item.label} (${item.tf})...`);
  try {
    const rawCandles = await getCandles({
      symbol: 'FOREXCOM:XAUUSD',
      timeframe: item.tf,
      count: 10000,
    });

    if (!rawCandles || rawCandles.length === 0) {
      console.log(`No candles returned for ${item.label}`);
      continue;
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS ${item.table} (
        open_time INTEGER PRIMARY KEY,
        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,
        volume REAL NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_${item.table}_time ON ${item.table}(open_time);
    `);

    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO ${item.table} (open_time, open, high, low, close, volume)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    db.exec('BEGIN TRANSACTION');
    for (const c of rawCandles) {
      insertStmt.run(
        c.time * 1000,
        Number(c.open),
        Number(c.high),
        Number(c.low),
        Number(c.close),
        Number(c.volume) || 100
      );
    }
    db.exec('COMMIT');

    const oldest = new Date(rawCandles[0].time * 1000).toISOString();
    const newest = new Date(rawCandles.at(-1).time * 1000).toISOString();
    console.log(`✓ Stored ${rawCandles.length} candles in ${item.table} (${oldest} -> ${newest})`);

    // If it's M5, also ensure the main 'candles' table has all of them
    if (item.tf === '5') {
      const mainInsert = db.prepare(`
        INSERT OR REPLACE INTO candles (open_time, open, high, low, close, volume)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      db.exec('BEGIN TRANSACTION');
      for (const c of rawCandles) {
        mainInsert.run(
          c.time * 1000,
          Number(c.open),
          Number(c.high),
          Number(c.low),
          Number(c.close),
          Number(c.volume) || 100
        );
      }
      db.exec('COMMIT');
    }
  } catch (err) {
    console.error(`Error downloading ${item.label}:`, err.message);
  }
}

// Update metadata
const metaStmt = db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)');
metaStmt.run('all_tv_timeframes_archived', 'true');
metaStmt.run('tv_archive_timestamp', new Date().toISOString());

console.log('\n=== Download Complete! All timeframes successfully stored. ===');
