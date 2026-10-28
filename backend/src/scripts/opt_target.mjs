import fs from 'fs';
import { PineTS } from 'pinets';

const candles1h = JSON.parse(fs.readFileSync('data/xauusd_1h_tv.json', 'utf8'));
const candles15m = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));

const makeCode = (tp, sl, blen, bmult, rsiL, beTrigger) => `//@version=6
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
var bool isBE = false

if longCond
    ep := close
    currSL := ep - ${sl}
    tpP := ep + ${tp}
    isBE := false
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortCond
    ep := close
    currSL := ep + ${sl}
    tpP := ep - ${tp}
    isBE := false
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)

if strategy.position_size != 0
    dir = strategy.position_size > 0 ? 1 : -1
    currentGain = dir == 1 ? (high - ep) : (ep - low)

    ${beTrigger > 0 ? `
    if not isBE and currentGain >= ${sl} * ${beTrigger}
        currSL := dir == 1 ? (ep + syminfo.mintick * 10) : (ep - syminfo.mintick * 10)
        isBE := true
    ` : ''}

    exitComment = isBE ? "BREAKEVEN" : "SL HIT"
    strategy.exit(dir == 1 ? "Exit Long" : "Exit Short", dir == 1 ? "Long" : "Short", limit=tpP, stop=currSL, comment_profit="TP HIT", comment_loss=exitComment)
`;

async function runTest() {
  console.log('Testing target strategy optimization...');
  const results = [];

  // Focus on 15M: 80 to 120 pips TP ($8 to $12), SL $6 to $10
  for (const sl of [6.0, 7.0, 8.0]) {
    for (const tp of [sl * 1.15, sl * 1.3, sl * 1.5]) {
      for (const blen of [20, 25]) {
        for (const bmult of [1.8, 2.0, 2.2]) {
          for (const rsiL of [45, 50]) {
            for (const beTrigger of [0.0, 0.4]) {
              try {
                const code = makeCode(tp, sl, blen, bmult, rsiL, beTrigger);
                const p = new PineTS(candles15m, 'XAUUSD', '15');
                await p.ready();
                const res = await p.run(code);
                const s = res.strategy;
                const trades = s.closedtrades || [];

                if (trades.length < 25) continue;

                const wins = trades.filter(t => t.profit > 0);
                const losses = trades.filter(t => t.profit <= 0);
                const wr = (wins.length / trades.length) * 100;
                const net = s.netprofit;
                const dd = s.max_drawdown || 1;
                const calmar = net / dd;
                const avgWin = wins.reduce((acc, t) => acc + t.profit, 0) / (wins.length || 1);
                const avgLoss = losses.length ? Math.abs(losses.reduce((acc, t) => acc + t.profit, 0) / losses.length) : 1;
                const realRR = avgWin / avgLoss;

                if (wr >= 75.0 && calmar >= 4.0 && realRR >= 1.0) {
                  const totalR = net / sl;
                  console.log(`[15M MATCH] TP: $${tp.toFixed(1)} (${(tp*10).toFixed(0)}p) | SL: $${sl.toFixed(1)} (${(sl*10).toFixed(0)}p) | Trades: ${trades.length} | WR: ${wr.toFixed(1)}% | Net: +$${net.toFixed(1)} (+${totalR.toFixed(1)}R) | Calmar: ${calmar.toFixed(2)} | Real R:R: 1:${realRR.toFixed(2)}`);
                  results.push({ tf: '15M', tp, sl, blen, bmult, rsiL, beTrigger, trades: trades.length, wr, net, totalR, dd, calmar, realRR, avgWin, avgLoss });
                }
              } catch (e) {}
            }
          }
        }
      }
    }
  }

  // Focus on 1H: TP $12 to $18, SL $10 to $14, lower bmult (1.8-2.0) for more trades
  for (const sl of [10.0, 12.0]) {
    for (const tp of [sl * 1.15, sl * 1.3, sl * 1.5]) {
      for (const blen of [20, 25]) {
        for (const bmult of [1.7, 1.9, 2.1]) {
          for (const rsiL of [45, 50]) {
            for (const beTrigger of [0.0, 0.4]) {
              try {
                const code = makeCode(tp, sl, blen, bmult, rsiL, beTrigger);
                const p = new PineTS(candles1h, 'XAUUSD', '60');
                await p.ready();
                const res = await p.run(code);
                const s = res.strategy;
                const trades = s.closedtrades || [];

                if (trades.length < 80) continue; // Require >= 80 trades for 1H high frequency

                const wins = trades.filter(t => t.profit > 0);
                const losses = trades.filter(t => t.profit <= 0);
                const wr = (wins.length / trades.length) * 100;
                const net = s.netprofit;
                const dd = s.max_drawdown || 1;
                const calmar = net / dd;
                const avgWin = wins.reduce((acc, t) => acc + t.profit, 0) / (wins.length || 1);
                const avgLoss = losses.length ? Math.abs(losses.reduce((acc, t) => acc + t.profit, 0) / losses.length) : 1;
                const realRR = avgWin / avgLoss;

                if (wr >= 75.0 && calmar >= 4.0 && realRR >= 1.0) {
                  const totalR = net / sl;
                  console.log(`[1H MATCH] TP: $${tp.toFixed(1)} (${(tp*10).toFixed(0)}p) | SL: $${sl.toFixed(1)} (${(sl*10).toFixed(0)}p) | Trades: ${trades.length} | WR: ${wr.toFixed(1)}% | Net: +$${net.toFixed(1)} (+${totalR.toFixed(1)}R) | Calmar: ${calmar.toFixed(2)} | Real R:R: 1:${realRR.toFixed(2)}`);
                  results.push({ tf: '1H', tp, sl, blen, bmult, rsiL, beTrigger, trades: trades.length, wr, net, totalR, dd, calmar, realRR, avgWin, avgLoss });
                }
              } catch (e) {}
            }
          }
        }
      }
    }
  }

  results.sort((a, b) => (b.wr * (b.net / b.dd)) - (a.wr * (a.net / a.dd)));
  console.log('\n=== TOP RESULTS ===');
  results.slice(0, 5).forEach((r, i) => {
    console.log(`#${i+1} [${r.tf}] Trades:${r.trades} | WR:${r.wr.toFixed(1)}% | Net:+$${r.net.toFixed(2)} (+${r.totalR.toFixed(1)}R) | Calmar:${r.calmar.toFixed(2)} | Real R:R: 1:${r.realRR.toFixed(2)} (+$${r.avgWin.toFixed(2)} / -$${r.avgLoss.toFixed(2)})`);
    console.log(`Params: TP=$${r.tp}, SL=$${r.sl}, BB(${r.blen}, ${r.bmult}), RSI<${r.rsiL}, BE=${r.beTrigger}\n`);
  });

  fs.writeFileSync('backend/src/scripts/opt_target_results.json', JSON.stringify(results, null, 2));
}

runTest().catch(console.error);
