import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));

const makeCode = (tp, sl, blen, bmult, rsiL, beTrigger) => `//@version=6
strategy("Opt15M", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, margin_long=0, margin_short=0)
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
        currSL := dir == 1 ? (ep + 0.10) : (ep - 0.10)
        isBE := true
    ` : ''}

    strategy.exit(dir == 1 ? "Exit Long" : "Exit Short", dir == 1 ? "Long" : "Short", limit=tpP, stop=currSL)
`;

async function runSingle(name, tp, sl, blen, bmult, rsiL, beTrigger) {
  const code = makeCode(tp, sl, blen, bmult, rsiL, beTrigger);
  const p = new PineTS(candles, 'XAUUSD', '15');
  await p.ready();
  const res = await p.run(code);
  const s = res.strategy;
  const trades = s.closedtrades || [];
  const wins = trades.filter(t => t.profit > 0);
  const losses = trades.filter(t => t.profit <= 0);
  const wr = (wins.length / trades.length) * 100;
  const avgWin = wins.reduce((acc, t) => acc + t.profit, 0) / (wins.length || 1);
  const avgLoss = losses.length ? Math.abs(losses.reduce((acc, t) => acc + t.profit, 0) / losses.length) : 1;
  const realRR = avgWin / avgLoss;

  console.log(`=== ${name} ===`);
  console.log(`Trades: ${trades.length} | Wins: ${wins.length} | Losses: ${losses.length}`);
  console.log(`Win Rate: ${wr.toFixed(2)}% | Net Profit: $${s.netprofit.toFixed(2)} | Max DD: $${s.max_drawdown?.toFixed(2)}`);
  console.log(`Realized R:R: 1 : ${realRR.toFixed(2)} (Avg Win: +$${avgWin.toFixed(2)} vs Avg Loss: -$${avgLoss.toFixed(2)})`);
  console.log(`Calmar Ratio: ${(s.netprofit / (s.max_drawdown || 1)).toFixed(2)}`);
  console.log('');
}

async function main() {
  await runSingle('Config A (49 trades, Calmar 8.47, Clean Growth)', 15.0, 12.0, 30, 2.2, 50, 0.0);
  await runSingle('Config B (24 trades, 75.0% Win Rate, Calmar 7.20)', 15.0, 10.0, 20, 2.0, 40, 0.5);
  await runSingle('Config C (42 trades, Calmar 6.02, High RR)', 24.0, 12.0, 30, 2.2, 45, 0.7);
}

main().catch(console.error);















