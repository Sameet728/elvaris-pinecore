import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PineTS } from 'pinets';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PINE_DIR = path.join(ROOT_DIR, 'pine_scripts');

async function check(name, scriptFile, dataFile, tf) {
  const candles = JSON.parse(fs.readFileSync(path.join(DATA_DIR, dataFile), 'utf8'));
  const firstBar = candles[0];
  const lastBar = candles[candles.length - 1];
  const tStart = new Date(firstBar.openTime || firstBar.time).toISOString();
  const tEnd = new Date(lastBar.openTime || lastBar.time).toISOString();

  const code = fs.readFileSync(path.join(PINE_DIR, scriptFile), 'utf8');
  const p = new PineTS(candles, 'XAUUSD', tf);
  await p.ready();
  const res = await p.run(code);
  const trades = res.strategy.closedtrades || [];
  const firstTrade = trades[0];
  const lastTrade = trades[trades.length - 1];

  const firstEntry = firstTrade ? new Date(firstTrade.entry_time).toUTCString() : 'N/A';
  const lastExit = lastTrade ? new Date(lastTrade.exit_time).toUTCString() : 'N/A';

  console.log(`=======================================================`);
  console.log(`Strategy: ${name}`);
  console.log(`Dataset Timeframe: ${dataFile} (${candles.length} bars)`);
  console.log(`Dataset Full Range: ${tStart} to ${tEnd}`);
  console.log(`Total Trades: ${trades.length}`);
  console.log(`First Trade Entry: ${firstEntry}`);
  console.log(`Last Trade Exit:   ${lastExit}`);
  console.log(`=======================================================\n`);
}

async function main() {
  await check('15M Pure Sovereign', 'Champion_15M_Pure_Sovereign_STRATEGY.pine', 'xauusd_15m_tv.json', '15');
  await check('5M High-Frequency Prop', 'Champion_5M_HighFrequency_Prop_STRATEGY.pine', 'xauusd_5m_tv.json', '5');
  await check('1H Pure Sovereign', 'Champion_1H_Pure_Sovereign_STRATEGY.pine', 'xauusd_1h_tv.json', '60');
}

main().catch(console.error);

