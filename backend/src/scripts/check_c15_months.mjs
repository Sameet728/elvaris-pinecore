import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const c15 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_15m_tv.json'), 'utf8'));

let sepCount = 0, octCount = 0;
for (const c of c15) {
  const d = new Date(c.openTime || c.time);
  const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
  if (m === '2026-09') sepCount++;
  if (m === '2026-10') octCount++;
}
console.log(`c15 has ${sepCount} bars in 2026-09 and ${octCount} bars in 2026-10`);
