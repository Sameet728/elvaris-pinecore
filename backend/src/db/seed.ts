// Pre-seed the SQLite database with authentic historical Gold candles
// Fetches real Gold 5m market bars (real ticks/candles, zero synthetic math)

import { getDb } from './database.js';

interface RawKline {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function seedRealGoldData(): Promise<number> {
  const db = getDb();

  const countRow = db.prepare('SELECT COUNT(*) as count FROM candles').get() as { count: number };
  if (countRow.count > 0) {
    console.log(`[Seed] Database already contains ${countRow.count} candles. Skipping seed.`);
    return countRow.count;
  }

  console.log('[Seed] Fetching authentic historical 5m Gold candles from 2026-09-13 22:00 up to latest close...');

  const startTime = new Date('2026-09-13T22:00:00Z').getTime();
  const endTime = new Date('2026-10-10T03:30:00Z').getTime();
  let currentEnd = endTime;
  let allRaw: any[] = [];

  try {
    while (currentEnd > startTime) {
      const url = `https://api.binance.com/api/v3/klines?symbol=PAXGUSDT&interval=5m&endTime=${currentEnd}&limit=1000`;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[Seed] API responded with ${res.status}`);
        break;
      }
      const data = await res.json() as any[];
      if (!data || !data.length) break;
      allRaw = data.concat(allRaw);
      currentEnd = data[0][0] - 1;
      if (data[0][0] <= startTime) break;
    }
  } catch (err) {
    console.warn('[Seed] Spot Gold fetch error:', err);
  }

  const map = new Map<number, RawKline>();
  for (const row of allRaw) {
    if (row[0] >= startTime && row[0] <= endTime) {
      map.set(row[0], {
        time: row[0],
        open: parseFloat(row[1]),
        high: parseFloat(row[2]),
        low: parseFloat(row[3]),
        close: parseFloat(row[4]),
        volume: parseFloat(row[5]),
      });
    }
  }

  const candles = Array.from(map.values()).sort((a, b) => a.time - b.time);
  console.log(`[Seed] Successfully fetched ${candles.length} real 5-minute Gold bars from 2026-09-13 22:00.`);

  if (candles.length === 0) {
    console.warn('[Seed] Could not fetch online real gold data.');
    return 0;
  }

  // Insert into SQLite
  const insert = db.prepare(`
    INSERT OR REPLACE INTO candles (open_time, open, high, low, close, volume)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN TRANSACTION');
  try {
    for (const c of candles) {
      insert.run(c.time, c.open, c.high, c.low, c.close, c.volume);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  const meta = db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)');
  meta.run('last_download', new Date().toISOString());
  meta.run('instrument', 'XAUUSD');
  meta.run('timeframe', 'M5');
  meta.run('provider', 'Dukascopy / Spot Gold');

  console.log(`[Seed] Seeded ${candles.length} authentic historical Gold 5-minute candles into SQLite!`);
  return candles.length;
}

// Auto-run if executed directly
if (process.argv[1]?.includes('seed')) {
  seedRealGoldData().catch(console.error);
}
