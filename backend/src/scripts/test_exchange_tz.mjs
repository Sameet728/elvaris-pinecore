import fs from 'fs';
import { PineTS } from 'pinets';

async function testExchangeTZ() {
  const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));
  const p = new PineTS(candles, 'XAUUSD', '15');
  await p.ready();

  const codeNY = `//@version=5
strategy("TestNY", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, 28)
dev = 2.1 * ta.stdev(close, 28)
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

// Simulating TradingView exchange timezone: America/New_York
h = hour(time, "America/New_York")
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

  const resNY = await p.run(codeNY);
  const sNY = resNY.strategy;
  const trNY = sNY.closedtrades || [];
  const winsNY = trNY.filter(t => t.profit > 0);
  console.log(`\n=== WITH America/New_York (TradingView exchange timezone) ===`);
  console.log(`Total Trades: ${trNY.length}`);
  console.log(`Wins: ${winsNY.length} | Losses: ${trNY.length - winsNY.length}`);
  console.log(`Win Rate: ${(winsNY.length / trNY.length * 100).toFixed(2)}%`);
  console.log(`Net Profit: $${sNY.netprofit.toFixed(2)}`);
  console.log(`Max Drawdown: $${sNY.max_drawdown?.toFixed(2)}`);
}

testExchangeTZ().catch(console.error);
