import fs from 'fs';
import { PineTS } from 'pinets';

const candles15M = JSON.parse(fs.readFileSync('data/btcusdt_15m_tv.json', 'utf8'));
const p15 = new PineTS(candles15M, 'BTCUSDT', '15');
await p15.ready();

console.log('--- Verifying Dual-Month 10R+ Champions in PineTS ---');

const candidates = [
  {
    name: "Champion #1: BTC 15M Dual-10R Sovereign (SL $380 / TP $513 [1:1.35])",
    sl: 380.0,
    tp: 513.0,
    rsiMax: 49,
    startH: 6,
    endH: 21
  },
  {
    name: "Champion #2: BTC 15M Dual-10R Sovereign (SL $400 / TP $520 [1:1.30])",
    sl: 400.0,
    tp: 520.0,
    rsiMax: 49,
    startH: 6,
    endH: 21
  },
  {
    name: "Champion #3: BTC 15M Dual-10R Sovereign (SL $380 / TP $532 [1:1.40])",
    sl: 380.0,
    tp: 532.0,
    rsiMax: 49,
    startH: 6,
    endH: 21
  }
];

for (const c of candidates) {
  const code = `//@version=5
strategy("Dual10R_Test", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

utcHour = hour(time, "UTC")
inActiveSession = (utcHour >= ${c.startH} and utcHour <= ${c.endH})

ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
rsi = ta.rsi(close, 14)

longSig = inActiveSession and close > ema200 and ema50 > ema200 and low <= ema50 and close > ema50 and close > open and rsi <= ${c.rsiMax} and strategy.position_size == 0
shortSig = inActiveSession and close < ema200 and ema50 < ema200 and high >= ema50 and close < ema50 and close < open and rsi >= (100 - ${c.rsiMax}) and strategy.position_size == 0

var float ep = na
var float currSL = na
var float tpP = na

if longSig
    ep := close
    currSL := ep - ${c.sl}
    tpP := ep + ${c.tp}
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortSig
    ep := close
    currSL := ep + ${c.sl}
    tpP := ep - ${c.tp}
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)
`;

  const res = await p15.run(code);
  const trades = res.strategy.closedtrades || [];
  const wins = trades.filter(t => t.profit > 0);
  const losses = trades.filter(t => t.profit <= 0);
  const wr = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
  const net = res.strategy.netprofit || 0;
  const maxDD = res.strategy.max_drawdown || 1;
  const netR = net / c.sl;
  const maxDDR = maxDD / c.sl;
  const calmar = maxDDR > 0 ? (netR / maxDDR) : 0;

  const monthlyR = {};
  const monthlyW = {};
  const monthlyL = {};
  for (const t of trades) {
    const m = new Date(t.entry_time).toISOString().substring(0, 7);
    monthlyR[m] = (monthlyR[m] || 0) + (t.profit / c.sl);
    if (t.profit > 0) monthlyW[m] = (monthlyW[m] || 0) + 1;
    else monthlyL[m] = (monthlyL[m] || 0) + 1;
  }

  console.log(`\n======================================================`);
  console.log(`🏆 ${c.name}:`);
  console.log(`Trades: ${trades.length} | Wins: ${wins.length} | Losses: ${losses.length}`);
  console.log(`Win Rate: ${wr.toFixed(2)}% | Net Return: $${net.toFixed(2)} (+${netR.toFixed(2)}R)`);
  console.log(`Max Drawdown: $${maxDD.toFixed(2)} (${maxDDR.toFixed(2)}R) | Calmar: ${calmar.toFixed(2)}`);
  console.log(`Monthly Breakdown:`);
  for (const m of Object.keys(monthlyR).sort()) {
    console.log(`  ${m}: ${monthlyW[m] + monthlyL[m]} trades | ${monthlyW[m]}W / ${monthlyL[m]}L | Net: +${monthlyR[m].toFixed(2)}R`);
  }
}
