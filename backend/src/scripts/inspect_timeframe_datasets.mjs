import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../../data');

const files = [
  'xauusd_1m_tv.json',
  'xauusd_5m_tv.json',
  'xauusd_15m_tv.json',
  'xauusd_30m_tv.json',
  'xauusd_1h_tv.json',
  'xauusd_4h_tv.json'
];

console.log('=== TIMEFRAME DATASETS STATUS ===');
for (const f of files) {
  const p = path.join(DATA_DIR, f);
  if (fs.existsSync(p)) {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const first = raw[0];
    const last = raw[raw.length - 1];
    const tStart = new Date(first.openTime || first.time).toISOString();
    const tEnd = new Date(last.openTime || last.time).toISOString();
    console.log(`${f.padEnd(20)}: ${String(raw.length).padStart(6)} bars | Start: ${tStart} | End: ${tEnd}`);
  } else {
    console.log(`${f.padEnd(20)}: NOT FOUND`);
  }
}
