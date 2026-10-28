import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));

async function analyzeTrades() {
  const p = new PineTS(candles, 'XAUUSD', '15');
  await p.ready();

  const code = `//@version=5
strategy("AnalyzeTrades", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, 30)
dev = 2.2 * ta.stdev(close, 30)
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

inActiveSession = (hour >= 1 and hour <= 20)

longSig = inActiveSession and close > ema200 and low <= lower and close > open and rsi < 52 and strategy.position_size == 0
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

  const res = await p.run(code);
  const trades = res.strategy.closedtrades || [];

  console.log(`\n=== ALL 43 TRADES DETAILED BREAKDOWN ===\n`);
  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    const d = new Date(t.entry_time);
    const dateStr = d.toISOString().replace('T', ' ').substring(0, 16);
    const result = t.profit > 0 ? 'WIN ' : 'LOSS';
    console.log(`Trade #${String(i+1).padStart(2)}: ${result} | ${t.entry_id.padEnd(5)} | Entry: ${dateStr} (UTC H:${d.getUTCHours()}) @ $${t.entry_price.toFixed(2)} -> Exit: @ $${t.exit_price.toFixed(2)} | Profit: $${t.profit.toFixed(2)}`);
  }
}

analyzeTrades().catch(console.error);
