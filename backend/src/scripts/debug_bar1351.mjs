import fs from 'fs';
import { PineTS } from 'pinets';

const c5 = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

const testPine = `//@version=6
strategy("DebugTest", overlay=true)

atr = ta.atr(14)
bFvg = low > high[2]
var float bfTop = na
var float bfBot = na

if bFvg
    bfTop := low
    bfBot := high[2]

var float stopVal = na
var float targetVal = na

if bar_index == 1351
    entryP = close
    stopVal := bfBot - atr * 0.22
    targetVal := entryP + 3.5
    strategy.entry("Long", strategy.long)

if strategy.position_size > 0
    strategy.exit("Exit Long", from_entry="Long", limit=targetVal, stop=stopVal)
`;

async function run() {
  const p = new PineTS(c5.slice(0, 1360), 'XAUUSD', '5');
  await p.ready();
  const res = await p.run(testPine);
  console.log('Closed trades when exit is called in position_size > 0:');
  console.log(res.strategy.closedtrades);
}
run().catch(console.error);
