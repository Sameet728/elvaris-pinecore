import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));

async function checkHour12() {
  const p = new PineTS(candles, 'XAUUSD', '15');
  await p.ready();

  const code = `//@version=5
strategy("CheckH12", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, 28)
dev = 2.1 * ta.stdev(close, 28)
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

inActiveSession = (hour >= 1 and hour <= 20)

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

  const res = await p.run(code);
  const trades = res.strategy.closedtrades || [];

  const hTrades = {};
  const hWins = {};
  for (const t of trades) {
    const d = new Date(t.entry_time);
    const h = d.getUTCHours();
    hTrades[h] = (hTrades[h] || 0) + 1;
    if (t.profit > 0) hWins[h] = (hWins[h] || 0) + 1;
  }

  console.log('Hourly performance:');
  for (let h = 0; h <= 23; h++) {
    if (hTrades[h]) {
      const tot = hTrades[h];
      const w = hWins[h] || 0;
      const l = tot - w;
      console.log(`Hour ${String(h).padStart(2)}: ${tot} trades | ${w}W / ${l}L (${(w/tot*100).toFixed(1)}% WR)`);
    }
  }
}

checkHour12().catch(console.error);
