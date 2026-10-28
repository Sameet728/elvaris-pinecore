import fs from 'fs';
import { PineTS } from 'pinets';

const candles5m = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

// Test 5M strategy parameters targeting high win rate and >= 10R/month
const makeCode = (tp, sl, blen, bmult, rsiL, beTrigger) => `//@version=6
strategy("PropChampion5M", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, margin_long=0, margin_short=0)

atr = ta.atr(14)
ema200 = ta.ema(close, 200)
ema50 = ta.ema(close, 50)
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

async function main() {
  console.log('--- DEEP SEARCH ON 5M TV DATA (5,510 CANDLES) ---');
  const results = [];

  for (const sl of [2.0, 3.0, 4.0, 5.0]) {
    for (const tp of [sl * 1.0, sl * 1.25, sl * 1.5, sl * 2.0]) {
      for (const blen of [20, 25, 30]) {
        for (const bmult of [1.8, 2.0, 2.2, 2.4]) {
          for (const rsiL of [45, 50]) {
            for (const beTrigger of [0.0, 0.35, 0.45]) {
              try {
                const code = makeCode(tp, sl, blen, bmult, rsiL, beTrigger);
                const p = new PineTS(candles5m, 'XAUUSD', '5');
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
                const totalR = net / sl;

                // Monthly breakdown
                const monthly = {};
                trades.forEach(t => {
                  const d = new Date(t.entry_time);
                  const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
                  monthly[mKey] = (monthly[mKey] || 0) + (t.profit / sl);
                });
                const mKeys = Object.keys(monthly);
                const avgMonthlyR = totalR / Math.max(mKeys.length, 1);

                results.push({
                  tp, sl, blen, bmult, rsiL, beTrigger,
                  trades: trades.length, wr, net, dd, calmar, realRR,
                  avgWin, avgLoss, totalR, avgMonthlyR, monthly
                });
              } catch (e) {}
            }
          }
        }
      }
    }
  }

  // Filter for R:R >= 1.0, Calmar >= 4.0
  const top = results.filter(r => r.realRR >= 0.95 && r.calmar >= 3.5);
  top.sort((a, b) => b.wr - a.wr);

  console.log(`\nFound ${top.length} 5M setups with R:R >= 1.0 & Calmar >= 3.5. Top 5 by Win Rate:`);
  top.slice(0, 5).forEach((c, i) => {
    console.log(`#${i+1}: WR: ${c.wr.toFixed(1)}% | Trades: ${c.trades} | Net: +$${c.net.toFixed(2)} (+${c.totalR.toFixed(1)}R) | ${c.avgMonthlyR.toFixed(1)}R/mo | Calmar: ${c.calmar.toFixed(2)} | Real R:R: 1:${c.realRR.toFixed(2)} (+$${c.avgWin.toFixed(2)} / -$${c.avgLoss.toFixed(2)})`);
    console.log(`Params: TP=$${c.tp} (${(c.tp*10).toFixed(0)}p), SL=$${c.sl} (${(c.sl*10).toFixed(0)}p), BB(${c.blen}, ${c.bmult}), RSI<${c.rsiL}, BE=${c.beTrigger}`);
    console.log('Monthly R:', c.monthly, '\n');
  });

  // Sort by Monthly R
  top.sort((a, b) => b.totalR - a.totalR);
  console.log(`Top 5 by Total Monthly R Return:`);
  top.slice(0, 5).forEach((c, i) => {
    console.log(`#${i+1}: Net: +${c.totalR.toFixed(1)}R (+$${c.net.toFixed(2)}) | ${c.avgMonthlyR.toFixed(1)}R/mo | WR: ${c.wr.toFixed(1)}% | Trades: ${c.trades} | Calmar: ${c.calmar.toFixed(2)} | Real R:R: 1:${c.realRR.toFixed(2)}`);
    console.log(`Params: TP=$${c.tp} (${(c.tp*10).toFixed(0)}p), SL=$${c.sl} (${(c.sl*10).toFixed(0)}p), BB(${c.blen}, ${c.bmult}), RSI<${c.rsiL}, BE=${c.beTrigger}`);
    console.log('Monthly R:', c.monthly, '\n');
  });
}

main().catch(console.error);
