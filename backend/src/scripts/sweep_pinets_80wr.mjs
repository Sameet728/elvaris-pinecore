import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));

async function sweep() {
  const p = new PineTS(candles, 'XAUUSD', '15');
  await p.ready();

  const results = [];

  for (const sessionStart of [1, 2, 3, 4, 5, 6, 7]) {
    for (const sessionEnd of [19, 20, 21, 22]) {
      for (const rsiFilter of [48, 50, 52]) {
        for (const tp of [15.0, 16.0, 18.0]) {
          for (const sl of [12.0, 14.0]) {
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

inSession = (hour >= ${sessionStart} and hour <= ${sessionEnd})
longSig = inSession and close > ema200 and low <= lower and close > open and rsi < ${rsiFilter} and strategy.position_size == 0
shortSig = inSession and close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > (100 - ${rsiFilter}) and strategy.position_size == 0

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
            if (trades.length < 28) continue;
            const wins = trades.filter(t => t.profit > 0);
            const losses = trades.filter(t => t.profit <= 0);
            const wr = (wins.length / trades.length) * 100;
            if (wr >= 80.0) {
              const monthlyProfit = {};
              for (const t of trades) {
                const d = new Date(t.entry_time);
                const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
                monthlyProfit[m] = (monthlyProfit[m] || 0) + t.profit;
              }
              const netProfit = res.strategy.netprofit;
              const maxDD = res.strategy.max_drawdown || 1.0;
              const calmar = netProfit / maxDD;
              results.push({
                sessionStart, sessionEnd, rsiFilter, tp, sl,
                trades: trades.length,
                wins: wins.length,
                losses: losses.length,
                wr,
                netProfit,
                maxDD,
                calmar,
                monthlyProfit
              });
            }
          }
        }
      }
    }
  }

  console.log(`\n======================================================`);
  console.log(`Found ${results.length} PineTS Confirmed Strategies with WR >= 80.0%!`);
  results.sort((a, b) => b.wr - a.wr || b.calmar - a.calmar);

  for (let i = 0; i < Math.min(10, results.length); i++) {
    const r = results[i];
    console.log(`\n🏆 #${i + 1} | WR: ${r.wr.toFixed(2)}% (${r.wins}W / ${r.losses}L in ${r.trades}T) | Net: $${r.netProfit.toFixed(2)} | Max DD: $${r.maxDD.toFixed(2)} | Calmar: ${r.calmar.toFixed(2)}`);
    console.log(`   Config: Session ${r.sessionStart}:00-${r.sessionEnd}:00 UTC | TP: $${r.tp} / SL: $${r.sl} | RSI < ${r.rsiFilter}`);
    console.log(`   Monthly Profits ($):`, r.monthlyProfit);
    console.log(`   Monthly R (SL = $${r.sl}):`);
    for (const m of Object.keys(r.monthlyProfit)) {
      console.log(`      ${m}: +${(r.monthlyProfit[m] / r.sl).toFixed(2)}R`);
    }
  }
}

sweep().catch(console.error);
