import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../../../');
const readmePath = path.join(ROOT_DIR, 'README.md');

let content = fs.readFileSync(readmePath, 'utf8');
content = content.replace(
  `dual-month backtest results (September +21.1R, October +10.2R), authentic market data up to today, leaderboard, and Pine Script v6 strategy & indicator files.`,
  `dual-month backtest results (September +23.6R, October +17.8R, Score 384.1), multi-timeframe Monte Carlo benchmarks across all timeframes (1M, 5M, 15M, 30M, 1H, 4H), authentic market data up to today, leaderboard, and Pine Script v6 strategy & indicator files.`
);

fs.writeFileSync(readmePath, content, 'utf8');
console.log('README.md updated successfully!');
