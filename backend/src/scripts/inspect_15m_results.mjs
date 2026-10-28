import fs from 'fs';
import { PineTS } from 'pinets';

const candles15m = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));

const makeCode = (tp, sl, blen, bmult, rsiL) => `//@version=6
strategy("StrategyTarget", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, margin_long=0, margin_short=0)

atr = ta.atr(14)
ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, ${blen})
dev = ${bmult} * ta.stdev(close, ${blen})
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

longCond = close > ema200 and low <= lower and close > open and rsi < ${rsiL} and strategy.position_size == 0
shortCond = close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > ${100 - rsiL} and strategy.position_size == 0

var float ep = na
var float currSL = na
var float tpP = na

if longCond
    ep := close
    currSL := ep - ${sl}
    tpP := ep + ${tp}
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortCond
    ep := close
    currSL := ep + ${sl}
    tpP := ep - ${tp}
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)
`;

async function test() {
  const list = [];
  for (const sl of [5.0, 6.0, 8.0, 10.0]) {
    for (const tp of [sl, sl * 1.25, sl * 1.5, sl * 2.0]) {
      for (const blen of [20, 25]) {
        for (const bmult of [1.8, 2.0, 2.2, 2.4]) {
          for (const rsiL of [45, 50]) {
            try {
              const code = makeCode(tp, sl, blen, bmult, rsiL);
              const p = new PineTS(candles15m, 'XAUUSD', '15');
              await p.ready();
              const res = await p.run(code);
              const s = res.strategy;
              const trades = s.closedtrades || [];
              if (trades.length < 15) continue;
              const wins = trades.filter(t => t.profit > 0);
              const wr = (wins.length / trades.length) * 100;
              const net = s.netprofit;
              const dd = s.max_drawdown || 1;
              const calmar = net / dd;
              list.push({ tp, sl, blen, bmult, rsiL, trades: trades.length, wr, net, dd, calmar });
            } catch (e) {}
          }
        }
      }
    }
  }

  list.sort((a, b) => b.net - a.net);
  console.log(`Tested ${list.length} valid 15M configs. Top 10 by Net Profit:`);
  list.slice(0, 10).forEach((item, i) => {
    console.log(`#${i+1}: Trades=${item.trades} | WR=${item.wr.toFixed(1)}% | Net=+$${item.net.toFixed(1)} | DD=$${item.dd.toFixed(1)} | Calmar=${item.calmar.toFixed(2)} | TP=$${item.tp} SL=$${item.sl} BB(${item.blen}, ${item.bmult}) RSI<${item.rsiL}`);
  });
}

test().catch(console.error);
