import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeATR } from './fast_evaluator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const c5 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_5m_tv.json'), 'utf8'));
const c15 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_15m_tv.json'), 'utf8'));
const c30 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_30m_tv.json'), 'utf8'));

console.log('Testing SL distances across timeframes...');
for (const [name, candles] of [['M5', c5], ['M15', c15], ['M30', c30]]) {
  const atr = computeATR(candles, 14);
  let sls = [];
  for (let i = 20; i < candles.length; i++) {
    sls.push(atr[i]);
  }
  sls.sort((a,b) => a - b);
  const medianATR = sls[Math.floor(sls.length / 2)];
  const p10ATR = sls[Math.floor(sls.length * 0.1)];
  const p90ATR = sls[Math.floor(sls.length * 0.9)];
  console.log(`[${name}] ATR(14) in $: Median=$${medianATR.toFixed(2)} (p10=$${p10ATR.toFixed(2)}, p90=$${p90ATR.toFixed(2)})`);
}
