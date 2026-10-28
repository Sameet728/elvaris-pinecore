import fs from 'fs';
import { PineTS } from 'pinets';

const candles15M = JSON.parse(fs.readFileSync('data/btcusdt_15m_tv.json', 'utf8'));
const p15 = new PineTS(candles15M, 'BTCUSDT', '15');
await p15.ready();

for (const sl of [300, 350, 400, 450]) {
  for (const bMult of [2.25, 2.30, 2.35, 2.40, 2.45]) {
    for (const offset of [0, 50, 100]) {
      for (const rsi of [50, 52, 54, 55]) {
        const code = `//@version=5
strategy("S2", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0)
utcHour = hour(time, "UTC")
inActiveSession = (utcHour >= 8 and utcHour <= 19)
ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, 30)
dev = ${bMult} * ta.stdev(close, 30)
upper = basis + dev
lower = basis - dev
rsiVal = ta.rsi(close, 14)
longSig = inActiveSession and close > (ema200 + ${offset}) and low <= lower and close > open and rsiVal < ${rsi} and strategy.position_size == 0
shortSig = inActiveSession and close < ema200 and ema50 < ema200 and high >= upper and close < open and rsiVal > (100 - ${rsi}) and strategy.position_size == 0
var float ep = na
var float currSL = na
var float tpP = na
if longSig
    ep := close
    currSL := ep - ${sl}
    tpP := ep + ${sl * 2}
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)
if shortSig
    ep := close
    currSL := ep + ${sl}
    tpP := ep - ${sl * 2}
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)
`;
        const res = await p15.run(code);
        const trades = res.strategy.closedtrades || [];
        const wins = trades.filter(t => t.profit > 0);
        const wr = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
        const net = res.strategy.netprofit || 0;
        const maxDD = res.strategy.max_drawdown || 1;
        const netR = net / sl;
        const maxDDR = maxDD / sl;
        const calmar = maxDDR > 0 ? (netR / maxDDR) : 0;
        if (calmar >= 4.0 && wr >= 60.0 && trades.length >= 14) {
          console.log(`sl=${sl} bMult=${bMult} offset=${offset} rsi=${rsi} -> trades=${trades.length} W=${wins.length} WR=${wr.toFixed(1)}% netR=+${netR.toFixed(2)}R maxDDR=${maxDDR.toFixed(2)}R Calmar=${calmar.toFixed(2)}`);
        }
      }
    }
  }
}
