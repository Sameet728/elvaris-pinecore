import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const c5 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_5m_tv.json'), 'utf8'));

console.log('c5 first candle:', new Date(c5[0].time || c5[0].openTime).toISOString());
console.log('c5 last candle:', new Date(c5[c5.length-1].time || c5[c5.length-1].openTime).toISOString());
console.log('c5 total count:', c5.length);
