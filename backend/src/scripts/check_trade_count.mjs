import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeATR } from './fast_evaluator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const c5 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_5m_tv.json'), 'utf8'));
const atr5 = computeATR(c5, 14);

// Let's test extractRawSignals on M5
import { extractRawSignals } from './fast_cached_80_100_miner.mjs';
// Wait, extractRawSignals wasn't exported, let's test a simple run
