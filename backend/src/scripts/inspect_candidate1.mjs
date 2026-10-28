import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_1h_tv.json', 'utf8'));

// Test candidate #1 in PineTS and inspect every single trade: entry time, entry price, exit time, exit price, exit comment
const code = `//@version=6
strategy("Candidate1_Test", overlay=true, 
         initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, 
         margin_long=0, margin_short=0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

tpDist = 18.0
slDist = 12.0
beTrigger = 0.40

atr = ta.atr(14)
ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, 30)
dev = 2.4 * ta.stdev(close, 30)
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

var int lastLossBar = -999

longCond = close > ema200 and low <= lower and close > open and rsi < 45 and strategy.position_size == 0
shortCond = close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > 55 and strategy.position_size == 0

var float ep = na
var float currSL = na
var float tpP = na
var bool isBE = false

if longCond
    ep := close
    currSL := close - slDist
    tpP := close + tpDist
    isBE := false
    strategy.entry("L", strategy.long)
    strategy.exit("XL", "L", limit=tpP, stop=currSL)

if shortCond
    ep := close
    currSL := close + slDist
    tpP := close - tpDist
    isBE := false
    strategy.entry("S", strategy.short)
    strategy.exit("XS", "S", limit=tpP, stop=currSL)

if strategy.position_size != 0
    dir = strategy.position_size > 0 ? 1 : -1
    currentGain = dir == 1 ? (high - ep) : (ep - low)

    if not isBE and currentGain >= slDist * beTrigger
        currSL := dir == 1 ? (ep + syminfo.mintick * 10) : (ep - syminfo.mintick * 10)
        isBE := true

    exitComment = isBE ? "BREAKEVEN" : "SL HIT"
    strategy.exit(dir == 1 ? "XL" : "XS", dir == 1 ? "L" : "S", limit=tpP, stop=currSL, comment_profit="TP HIT", comment_loss=exitComment)
`;

async function run() {
  const p = new PineTS(candles, 'XAUUSD', '60');
  await p.ready();
  const res = await p.run(code);
  const s = res.strategy;
  const trades = s.closedtrades || [];
  const wins = trades.filter(t => t.profit > 0);
  const losses = trades.filter(t => t.profit <= 0);

  const avgWin = wins.reduce((acc, t) => acc + t.profit, 0) / wins.length;
  const avgLoss = losses.length ? Math.abs(losses.reduce((acc, t) => acc + t.profit, 0) / losses.length) : 0;
  const calmar = s.netprofit / (s.max_drawdown || 1);

  console.log(`\n=== CANDIDATE 1 DETAILED METRICS ===`);
  console.log(`Total Trades: ${trades.length}`);
  console.log(`Wins: ${wins.length} | Losses: ${losses.length}`);
  console.log(`Win Rate: ${((wins.length / trades.length) * 100).toFixed(2)}%`);
  console.log(`Avg Win: $${avgWin.toFixed(2)}`);
  console.log(`Avg Loss: -$${avgLoss.toFixed(2)}`);
  console.log(`Realized R:R: 1 : ${(avgWin / avgLoss).toFixed(2)}`);
  console.log(`Net Profit: $${s.netprofit.toFixed(2)}`);
  console.log(`Max Drawdown: $${s.max_drawdown?.toFixed(2)} (${(s.max_drawdown_percent_value * 100).toFixed(2)}%)`);
  console.log(`Calmar Ratio: ${calmar.toFixed(2)}`);

  console.log('\n--- FIRST 10 TRADES ---');
  trades.slice(0, 10).forEach((t, i) => {
    console.log(`Trade #${i+1}: Entry=${t.entry_time} at ${t.entry_price} | Exit=${t.exit_time} at ${t.exit_price} | PnL=$${t.profit.toFixed(2)} | Dir=${t.size > 0 ? 'LONG' : 'SHORT'}`);
  });

  console.log('\n--- LAST 10 TRADES ---');
  trades.slice(-10).forEach((t, i) => {
    console.log(`Trade #${trades.length - 10 + i + 1}: Entry=${t.entry_time} at ${t.entry_price} | Exit=${t.exit_time} at ${t.exit_price} | PnL=$${t.profit.toFixed(2)} | Dir=${t.size > 0 ? 'LONG' : 'SHORT'}`);
  });
}

run().catch(console.error);
