import fs from 'fs';
import { PineTS } from 'pinets';

async function run() {
  const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));
  const p = new PineTS(candles, 'XAUUSD', '15');
  await p.ready();

  const code = `//@version=5
strategy("Champion_15M_1to2RR_74WR_Oct10R_STRATEGY", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, 26)
dev = 2.35 * ta.stdev(close, 26)
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

utcHour = hour(time, "UTC")
inActiveSession = (utcHour >= 1 and utcHour <= 19)

candleBody = math.abs(close - open)
lowerWick = math.min(open, close) - low
upperWick = high - math.max(open, close)

longSig = inActiveSession and close > ema200 and low <= lower and close > open and rsi < 52 and lowerWick >= (candleBody * 0.10) and strategy.position_size == 0
shortSig = inActiveSession and close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > 48 and upperWick >= (candleBody * 0.10) and strategy.position_size == 0

var float ep = na
var float currSL = na
var float tpP = na

if longSig
    ep := close
    currSL := ep - 10.0
    tpP := ep + 20.0
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortSig
    ep := close
    currSL := ep + 10.0
    tpP := ep - 20.0
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)
`;

  const res = await p.run(code);
  const trades = res.strategy.closedtrades || [];
  console.log('Total trades:', trades.length);
  trades.forEach((t, i) => {
    const d = new Date(t.entry_time).toISOString();
    const outcome = t.profit > 0 ? 'WIN ' : 'LOSS';
    console.log(`#${String(i+1).padStart(2, ' ')}: ${d.substring(0, 16).replace('T', ' ')} UTC | ${outcome} | Entry: $${t.entry_price.toFixed(2)} | Exit: $${t.exit_price.toFixed(2)} | PnL: ${t.profit > 0 ? '+' : ''}$${t.profit.toFixed(2)} (${(t.profit/10).toFixed(1)}R)`);
  });
}
run();
