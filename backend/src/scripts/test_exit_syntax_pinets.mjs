import fs from 'fs';
import { PineTS } from 'pinets';

async function testExitSyntaxes() {
  const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));
  const p = new PineTS(candles, 'XAUUSD', '15');
  await p.ready();

  const codeA = `//@version=5
strategy("TestA", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0)
ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, 28)
dev = 2.1 * ta.stdev(close, 28)
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

h = hour(time, "UTC")
inActiveSession = (h >= 1 and h <= 20) and (h != 12)

longSig = inActiveSession and close > (ema200 + 4.0) and low <= lower and close > open and rsi < 52 and strategy.position_size == 0
shortSig = inActiveSession and close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > 48 and strategy.position_size == 0

var float ep = na
var float currSL = na
var float tpP = na

if longSig
    ep := close
    currSL := ep - 14.0
    tpP := ep + 18.0
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortSig
    ep := close
    currSL := ep + 14.0
    tpP := ep - 18.0
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)
`;

  const codeB = `//@version=5
strategy("TestB", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0)
ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, 28)
dev = 2.1 * ta.stdev(close, 28)
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

h = hour(time, "UTC")
inActiveSession = (h >= 1 and h <= 20) and (h != 12)

longSig = inActiveSession and close > (ema200 + 4.0) and low <= lower and close > open and rsi < 52 and strategy.position_size == 0
shortSig = inActiveSession and close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > 48 and strategy.position_size == 0

if longSig
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", profit=1800, loss=1400)

if shortSig
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", profit=1800, loss=1400)
`;

  const resA = await p.run(codeA);
  console.log(`Option A: Trades: ${resA.strategy.closedtrades?.length} | PnL: $${resA.strategy.netprofit?.toFixed(2)} | MaxDD: $${resA.strategy.max_drawdown?.toFixed(2)}`);

  const resB = await p.run(codeB);
  console.log(`Option B: Trades: ${resB.strategy.closedtrades?.length} | PnL: $${resB.strategy.netprofit?.toFixed(2)} | MaxDD: $${resB.strategy.max_drawdown?.toFixed(2)}`);
}

testExitSyntaxes().catch(console.error);
