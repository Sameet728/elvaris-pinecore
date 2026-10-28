// SQLite database initialization and connection management using Node.js built-in node:sqlite
// Zero native compilation dependencies; ultra-fast native C SQLite built into Node.js

import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../../data');
const DB_PATH = path.join(DATA_DIR, 'xauusd.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (_db) return _db;

  _db = new DatabaseSync(DB_PATH);

  // Enable WAL mode for better concurrent read/write performance
  _db.exec('PRAGMA journal_mode = WAL');
  _db.exec('PRAGMA synchronous = NORMAL');
  _db.exec('PRAGMA cache_size = 10000');

  // Create tables if they don't exist
  _db.exec(`
    CREATE TABLE IF NOT EXISTS candles (
      open_time INTEGER PRIMARY KEY,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      volume REAL NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_candles_open_time ON candles(open_time);

    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scripts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  console.log(`[DB] Initialized SQLite database at ${DB_PATH} using node:sqlite`);
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
