import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));

async function inspectTrades() {
  const p = new PineTS(candles, 'XAUUSD', '15');
  await p.ready();

  const code = `//@version=5
strategy("Champion_15M_Grandmaster_Dual10R_Oct8R_STRATEGY", overlay=true,
         initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0,
         margin_long=0, margin_short=0,
         commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

// Inputs
tpDistInput  = input.float(18.0, "Take Profit Distance ($)")
slDistInput  = input.float(14.0, "Stop Loss Distance ($)")
bandLen      = input.int(30, "Volatility Band Length")
bandMult     = input.float(2.2, "Volatility Band Multiplier")
rsiFilter    = input.int(52, "RSI Boundary Filter")
sessionStart = input.int(1, "Session Start Hour (UTC)")
sessionEnd   = input.int(20, "Session End Hour (UTC)")

// Technical Indicators
atr = ta.atr(14)
ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, bandLen)
dev = bandMult * ta.stdev(close, bandLen)
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

inActiveSession = (hour >= sessionStart and hour <= sessionEnd)

longSig = inActiveSession and close > ema200 and low <= lower and close > open and rsi < rsiFilter and strategy.position_size == 0
shortSig = inActiveSession and close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > (100 - rsiFilter) and strategy.position_size == 0

var float ep = na
var float currSL = na
var float tpP = na

if longSig
    ep := close
    currSL := ep - slDistInput
    tpP := ep + tpDistInput
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortSig
    ep := close
    currSL := ep + slDistInput
    tpP := ep - tpDistInput
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)
`;

  const res = await p.run(code);
  const trades = res.strategy.closedtrades || [];
  console.log(`Total trades: ${trades.length}`);
  for (let i = 0; i < Math.min(10, trades.length); i++) {
    console.log(`Trade #${i+1}:`, trades[i]);
  }
  console.log(`\nLast 5 trades:`);
  for (let i = Math.max(0, trades.length - 5); i < trades.length; i++) {
    console.log(`Trade #${i+1}:`, trades[i]);
  }
}

inspectTrades().catch(console.error);
