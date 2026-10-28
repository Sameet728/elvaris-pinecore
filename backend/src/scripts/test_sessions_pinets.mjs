import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));

async function testSessions() {
  const p = new PineTS(candles, 'XAUUSD', '15');
  await p.ready();

  for (const s of [1, 2, 3, 4, 5]) {
    for (const tp of [15, 16, 17]) {
      const code = `//@version=5
strategy("Test", overlay=true, initial_capital=100000, default_qty_value=1.0)
atr = ta.atr(14)
ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, 30)
dev = 2.2 * ta.stdev(close, 30)
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

inSession = (hour >= ${s} and hour <= 20)
longSig = inSession and close > ema200 and low <= lower and close > open and rsi < 50 and strategy.position_size == 0
shortSig = inSession and close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > 50 and strategy.position_size == 0

var float ep = na
var float currSL = na
var float tpP = na

if longSig
    ep := close
    currSL := ep - 14.0
    tpP := ep + ${tp}.0
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortSig
    ep := close
    currSL := ep + 14.0
    tpP := ep - ${tp}.0
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)
`;
      const res = await p.run(code);
      const trades = res.strategy.closedtrades || [];
      const wins = trades.filter(t => t.profit > 0);
      const losses = trades.filter(t => t.profit <= 0);
      const wr = (wins.length / trades.length) * 100;

      const monthlyProfit = {};
      for (const t of trades) {
        const d = new Date(t.entry_time);
        const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        monthlyProfit[m] = (monthlyProfit[m] || 0) + t.profit;
      }
      const augR = (monthlyProfit['2026-08'] || 0) / 14.0;
      const sepR = (monthlyProfit['2026-09'] || 0) / 14.0;
      const octR = (monthlyProfit['2026-10'] || 0) / 14.0;
      const net = res.strategy.netprofit;
      const dd = res.strategy.max_drawdown || 1.0;
      const calmar = net / dd;

      console.log(`Session ${s}:00-20:00 | TP $${tp} -> Trades: ${trades.length} | WR: ${wr.toFixed(2)}% (${wins.length}W/${losses.length}L) | Net: $${net.toFixed(2)} | Calmar: ${calmar.toFixed(2)} | Aug: +${augR.toFixed(2)}R | Sep: +${sepR.toFixed(2)}R | Oct: +${octR.toFixed(2)}R`);
    }
  }
}

testSessions().catch(console.error);
