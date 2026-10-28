import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

const testCode = `//@version=6
strategy("BuiltinTradesTest", overlay=true)

if bar_index == 100
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit", from_entry="Long", limit=close + 3.0, stop=close - 1.5)

if barstate.islast
    log.info("Closed trades count: " + str.tostring(strategy.closedtrades))
    if strategy.closedtrades > 0
        p = strategy.closedtrades.profit(0)
        log.info("Trade 0 profit: " + str.tostring(p))
`;

async function test() {
  const p = new PineTS(candles.slice(0, 150), 'XAUUSD', '5');
  await p.ready();
  const res = await p.run(testCode);
  console.log('Logs:', res.logs);
}
test().catch(console.error);
