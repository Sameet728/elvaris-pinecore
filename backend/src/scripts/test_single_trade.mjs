import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

// Test ONLY bar 98..102
const testCode = `//@version=6
strategy("SingleTrade", overlay=true)

if bar_index == 99
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=4327.33, stop=4332.13)
`;

async function run() {
  const p = new PineTS(candles.slice(0, 105), 'XAUUSD', '5');
  await p.ready();
  const res = await p.run(testCode);
  console.log('Single trade closed:');
  console.log(res.strategy.closedtrades);
}
run().catch(console.error);
