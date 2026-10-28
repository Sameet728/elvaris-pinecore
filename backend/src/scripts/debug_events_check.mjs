import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeATR } from './fast_evaluator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const c5 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_5m_tv.json'), 'utf8'));

// Test extractEvents on M5
let bFvgTop = [], bFvgBot = [], bFvgBar = [];
let fvgCount = 0;
for (let i = 2; i < c5.length; i++) {
  if (c5[i].low > c5[i-2].high) {
    fvgCount++;
  }
}
console.log(`Total Bullish FVGs on M5: ${fvgCount}`);
