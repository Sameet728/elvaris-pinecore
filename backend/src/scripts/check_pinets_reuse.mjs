import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));

async function testReuse() {
  const p = new PineTS(candles, 'XAUUSD', '15');
  await p.ready();

  const code1 = `//@version=5
strategy("S1", overlay=true)
strategy.entry("L", strategy.long, when=close > ta.ema(close, 200))
strategy.exit("Ex", "L", profit=100, loss=100)
`;
  console.log('Running code 1...');
  const t0 = Date.now();
  const res1 = await p.run(code1);
  console.log(`Code 1 took ${Date.now() - t0}ms, trades: ${res1.strategy.closedtrades?.length}`);

  console.log('Running code 2...');
  const t1 = Date.now();
  const res2 = await p.run(code1);
  console.log(`Code 2 took ${Date.now() - t1}ms, trades: ${res2.strategy.closedtrades?.length}`);
}

testReuse().catch(console.error);
