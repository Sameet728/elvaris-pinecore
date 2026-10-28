import fs from 'fs';
import { PineTS } from 'pinets';

const candles1h = JSON.parse(fs.readFileSync('data/xauusd_1h_tv.json', 'utf8'));

async function test1H() {
  const p = new PineTS(candles1h, 'XAUUSD', '60');
  await p.ready();

  const slTargets = [10.0, 11.0, 12.0, 13.0, 14.0, 15.0];

  console.log(`=== Testing 1H Sovereign Strategy with 1:2.0 R:R ===`);

  for (const sl of slTargets) {
    const tp = sl * 2.0;
    const code = `//@version=5
strategy("1H_1to2", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0)

ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, 30)
dev = 2.4 * ta.stdev(close, 30)
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

longSig = close > ema200 and low <= lower and close > open and rsi < 45 and strategy.position_size == 0
shortSig = close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > 55 and strategy.position_size == 0

var float ep = na
var float currSL = na
var float tpP = na

if longSig
    ep := close
    currSL := ep - ${sl}
    tpP := ep + ${tp}
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortSig
    ep := close
    currSL := ep + ${sl}
    tpP := ep - ${tp}
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)
`;

    const res = await p.run(code);
    const trades = res.strategy.closedtrades || [];
    const wins = trades.filter(t => t.profit > 0);
    const wr = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
    const netR = res.strategy.netprofit / sl;
    const maxDDR = (res.strategy.max_drawdown || 1) / sl;
    const calmar = maxDDR > 0 ? (netR / maxDDR) : 0;

    console.log(`SL: $${sl.toFixed(1)} / TP: $${tp.toFixed(1)} (1:2.0 R:R) -> Trades: ${trades.length} | Wins: ${wins.length} | Losses: ${trades.length - wins.length} | WR: ${wr.toFixed(2)}% | Net: +${netR.toFixed(2)}R | MaxDD: ${maxDDR.toFixed(2)}R | Calmar: ${calmar.toFixed(2)}`);
  }
}

test1H().catch(console.error);
