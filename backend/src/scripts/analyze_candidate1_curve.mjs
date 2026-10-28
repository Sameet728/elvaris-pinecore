import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_1h_tv.json', 'utf8'));

// Let's run Candidate 1 and analyze every drawdown period
const code = `//@version=6
strategy("Candidate1_Equity", overlay=true, 
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

async function analyze() {
  const p = new PineTS(candles, 'XAUUSD', '60');
  await p.ready();
  const res = await p.run(code);
  const s = res.strategy;
  const trades = s.closedtrades || [];

  let cum = 0;
  let peak = 0;
  let maxDD = 0;

  console.log('--- TRADE BY TRADE EQUITY AND DRAWDOWN ---');
  trades.forEach((t, i) => {
    cum += t.profit;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
    const d = new Date(t.entry_time);
    console.log(`Trade #${String(i+1).padStart(2, ' ')} | ${d.toISOString().substring(0, 10)} | ${t.size > 0 ? 'LONG ' : 'SHORT'} | PnL: ${t.profit > 0 ? '+' : ''}$${t.profit.toFixed(2)} | Cum: $${cum.toFixed(2)} | Peak: $${peak.toFixed(2)} | DD: $${dd.toFixed(2)}`);
  });

  console.log(`\nFinal Net Profit: $${cum.toFixed(2)}`);
  console.log(`Peak Equity: $${peak.toFixed(2)}`);
  console.log(`Max Closed Trade Drawdown: $${maxDD.toFixed(2)}`);
}

analyze().catch(console.error);
