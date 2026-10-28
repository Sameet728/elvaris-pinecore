import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_1h_tv.json', 'utf8'));

const code = `//@version=6
strategy("Test_Visual_Drawing", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0)

tpDistInput = 20.0
slDistInput = 14.0
beTriggerR = 0.35
bandLen = 30
bandMult = 2.4
rsiL = 45

atr = ta.atr(14)
ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, bandLen)
dev = bandMult * ta.stdev(close, bandLen)
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

longCond = close > ema200 and low <= lower and close > open and rsi < rsiL and strategy.position_size == 0
shortCond = close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > (100 - rsiL) and strategy.position_size == 0

var float ep = na
var float currSL = na
var float tpP = na
var bool isBE = false

if longCond
    ep := close
    currSL := ep - slDistInput
    tpP := ep + tpDistInput
    isBE := false
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortCond
    ep := close
    currSL := ep + slDistInput
    tpP := ep - tpDistInput
    isBE := false
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)

if strategy.position_size != 0
    dir = strategy.position_size > 0 ? 1 : -1
    currentGain = dir == 1 ? (high - ep) : (ep - low)

    if not isBE and currentGain >= slDistInput * beTriggerR
        targetBE = dir == 1 ? (ep + syminfo.mintick * 10) : (ep - syminfo.mintick * 10)
        if (dir == 1 and close > targetBE) or (dir == -1 and close < targetBE)
            currSL := targetBE
            isBE := true

    exitComment = isBE ? "BREAKEVEN" : "SL HIT"
    strategy.exit(dir == 1 ? "Exit Long" : "Exit Short", dir == 1 ? "Long" : "Short", limit=tpP, stop=currSL, comment_profit="TP HIT", comment_loss=exitComment)
`;

async function test() {
  const p = new PineTS(candles, 'XAUUSD', '60');
  await p.ready();
  const res = await p.run(code);
  const trades = res.strategy.closedtrades;
  console.log('Total closed trades:', trades.length);
  trades.slice(-5).forEach((t, i) => {
    const num = trades.length - 5 + i + 1;
    const entryDate = new Date(t.entry_time);
    const exitDate = new Date(t.exit_time);
    console.log(`Trade #${num} | ${t.size > 0 ? 'LONG' : 'SHORT'} | Entry: ${entryDate.toISOString()} at ${t.entry_price} | Exit: ${exitDate.toISOString()} at ${t.exit_price} | PnL: ${t.profit.toFixed(2)}`);
  });
}

test().catch(console.error);
