import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const c1 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_1m_tv.json'), 'utf8'));

console.log('c1 first candle:', new Date(c1[0].time || c1[0].openTime).toISOString());
console.log('c1 last candle:', new Date(c1[c1.length-1].time || c1[c1.length-1].openTime).toISOString());
console.log('c1 total count:', c1.length);
