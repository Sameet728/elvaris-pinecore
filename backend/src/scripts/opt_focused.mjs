import fs from 'fs';
import { PineTS } from 'pinets';

const candles15m = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));
const candles30m = JSON.parse(fs.readFileSync('data/xauusd_30m_tv.json', 'utf8'));
const candles5m = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

const makeCode = (tp, sl, blen, bmult, rsiL, beTrigger) => `//@version=6
strategy("FocusedOpt", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, margin_long=0, margin_short=0)
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

    strategy.exit(dir == 1 ? "Exit Long" : "Exit Short", dir == 1 ? "Long" : "Short", limit=tpP, stop=currSL)
`;

async function testDataset(candles, tfCode, tfName, slList, tpMultList) {
  console.log(`\n==============================================`);
  console.log(`=== TESTING ${tfName} (${candles.length} bars) ===`);
  console.log(`==============================================`);
  const results = [];

  for (const sl of slList) {
    for (const tpMult of tpMultList) {
      const tp = sl * tpMult;
      for (const blen of [20, 25, 30]) {
        for (const bmult of [2.0, 2.4]) {
          for (const rsiL of [45, 50]) {
            for (const beTrigger of [0.0, 0.40]) {
              try {
                const code = makeCode(tp, sl, blen, bmult, rsiL, beTrigger);
                const p = new PineTS(candles, 'XAUUSD', tfCode);
                await p.ready();
                const res = await p.run(code);
                const s = res.strategy;
                const trades = s.closedtrades || [];
                if (trades.length < 15) continue;

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

                if (realRR >= 0.95 && calmar >= 3.0) {
                  results.push({
                    tp, sl, blen, bmult, rsiL, beTrigger,
                    trades: trades.length, wins: wins.length, losses: losses.length,
                    wr, net, dd, calmar, realRR, avgWin, avgLoss, totalR, avgMonthlyR, monthly
                  });
                }
              } catch (e) {}
            }
          }
        }
      }
    }
  }

  // Sort by Win Rate
  results.sort((a, b) => b.wr - a.wr);
  console.log(`Found ${results.length} valid setups with R:R >= 1.0 & Calmar >= 3.0. Top 5 by Win Rate:`);
  results.slice(0, 5).forEach((c, i) => {
    console.log(`#${i+1}: WR: ${c.wr.toFixed(1)}% (${c.wins}W/${c.losses}L) | Trades: ${c.trades} | Net: +$${c.net.toFixed(2)} (+${c.totalR.toFixed(1)}R) | ${c.avgMonthlyR.toFixed(1)}R/mo | Calmar: ${c.calmar.toFixed(2)} | Real R:R: 1:${c.realRR.toFixed(2)} (+$${c.avgWin.toFixed(2)} / -$${c.avgLoss.toFixed(2)})`);
    console.log(`Params: TP=$${c.tp.toFixed(1)} (${(c.tp*10).toFixed(0)}p), SL=$${c.sl.toFixed(1)} (${(c.sl*10).toFixed(0)}p), BB(${c.blen}, ${c.bmult}), RSI<${c.rsiL}, BE=${c.beTrigger}`);
    console.log('Monthly R:', c.monthly, '\n');
  });

  // Sort by Total R
  results.sort((a, b) => b.totalR - a.totalR);
  console.log(`Top 3 by Total Return:`);
  results.slice(0, 3).forEach((c, i) => {
    console.log(`#${i+1}: Net: +${c.totalR.toFixed(1)}R (+$${c.net.toFixed(2)}) | ${c.avgMonthlyR.toFixed(1)}R/mo | WR: ${c.wr.toFixed(1)}% | Trades: ${c.trades} | Calmar: ${c.calmar.toFixed(2)} | Real R:R: 1:${c.realRR.toFixed(2)}`);
    console.log(`Params: TP=$${c.tp.toFixed(1)} (${(c.tp*10).toFixed(0)}p), SL=$${c.sl.toFixed(1)} (${(c.sl*10).toFixed(0)}p), BB(${c.blen}, ${c.bmult}), RSI<${c.rsiL}, BE=${c.beTrigger}`);
    console.log('Monthly R:', c.monthly, '\n');
  });

  return results;
}

async function main() {
  await testDataset(candles15m, '15', '15M (15 Minutes)', [6.0, 8.0, 10.0], [1.0, 1.25, 1.5]);
  await testDataset(candles30m, '30', '30M (30 Minutes)', [8.0, 10.0, 12.0], [1.0, 1.25, 1.5]);
  await testDataset(candles5m, '5', '5M (5 Minutes)', [3.0, 4.0, 5.0], [1.0, 1.25, 1.5]);
}

main().catch(console.error);

