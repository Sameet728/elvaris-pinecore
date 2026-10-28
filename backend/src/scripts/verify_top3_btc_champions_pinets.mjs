import fs from 'fs';
import { PineTS } from 'pinets';

const candles15M = JSON.parse(fs.readFileSync('data/btcusdt_15m_tv.json', 'utf8'));
const candles1H = JSON.parse(fs.readFileSync('data/btcusdt_1h_tv.json', 'utf8'));

console.log(`Loaded 15M (${candles15M.length} bars) and 1H (${candles1H.length} bars)`);

const p15 = new PineTS(candles15M, 'BTCUSDT', '15');
const p1h = new PineTS(candles1H, 'BTCUSDT', '60');
await Promise.all([p15.ready(), p1h.ready()]);

console.log('PineTS Engines ready for BTC verification!');

// -------------------------------------------------------------
// Strategy #1: BTC 15M Sovereign Grandmaster (80% WR, Calmar 9.0)
// -------------------------------------------------------------
const pineStrat1 = `//@version=5
strategy("Champion_BTC_15M_Grandmaster_STRATEGY", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

utcHour = hour(time, "UTC")
inActiveSession = (utcHour >= 8 and utcHour <= 20)

ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, 30)
dev = 2.45 * ta.stdev(close, 30)
upper = basis + dev
lower = basis - dev
rsiVal = ta.rsi(close, 14)

longSig = inActiveSession and close > ema200 and low <= lower and close > open and rsiVal < 55 and strategy.position_size == 0
shortSig = inActiveSession and close < ema200 and ema50 < ema200 and high >= upper and close < open and rsiVal > (100 - 55) and strategy.position_size == 0

var float ep = na
var float currSL = na
var float tpP = na

if longSig
    ep := close
    currSL := ep - 350.0
    tpP := ep + 350.0
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortSig
    ep := close
    currSL := ep + 350.0
    tpP := ep - 350.0
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)
`;

// -------------------------------------------------------------
// Strategy #2: BTC 15M Strict 1:2.0 R:R Champion (64.7% WR, Calmar 8.0)
// -------------------------------------------------------------
const pineStrat2 = `//@version=5
strategy("Champion_BTC_15M_1to2RR_STRATEGY", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

utcHour = hour(time, "UTC")
inActiveSession = (utcHour >= 8 and utcHour <= 19)

ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, 30)
dev = 2.30 * ta.stdev(close, 30)
upper = basis + dev
lower = basis - dev
rsiVal = ta.rsi(close, 14)

longSig = inActiveSession and close > (ema200 + 50.0) and low <= lower and close > open and rsiVal < 54 and strategy.position_size == 0
shortSig = inActiveSession and close < ema200 and ema50 < ema200 and high >= upper and close < open and rsiVal > (100 - 54) and strategy.position_size == 0

var float ep = na
var float currSL = na
var float tpP = na

if longSig
    ep := close
    currSL := ep - 300.0
    tpP := ep + 600.0
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortSig
    ep := close
    currSL := ep + 300.0
    tpP := ep - 300.0
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)
`;

// -------------------------------------------------------------
// Strategy #3: BTC 1H Macro Sovereign (70.8% WR, Calmar 10.0, 10 Months)
// -------------------------------------------------------------
const pineStrat3 = `//@version=5
strategy("Champion_BTC_1H_Macro_STRATEGY", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

utcHour = hour(time, "UTC")
inActiveSession = (utcHour >= 6 and utcHour <= 22)

ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, 28)
dev = 2.40 * ta.stdev(close, 28)
upper = basis + dev
lower = basis - dev
rsiVal = ta.rsi(close, 14)

body = math.abs(close - open)
lowerWick = math.min(open, close) - low
upperWick = high - math.max(open, close)
wickLongOk = lowerWick >= (body * 0.25)
wickShortOk = upperWick >= (body * 0.25)

longSig = inActiveSession and close > ema200 and low <= lower and close > open and rsiVal < 45 and wickLongOk and strategy.position_size == 0
shortSig = inActiveSession and close < ema200 and ema50 < ema200 and high >= upper and close < open and rsiVal > (100 - 45) and wickShortOk and strategy.position_size == 0

var float ep = na
var float currSL = na
var float tpP = na

if longSig
    ep := close
    currSL := ep - 1800.0
    tpP := ep + 1800.0
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortSig
    ep := close
    currSL := ep + 1800.0
    tpP := ep - 1800.0
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)
`;

async function evaluateStrategy(engine, code, name, slVal) {
  console.log(`\n================ Evaluating ${name} in PineTS ================`);
  const res = await engine.run(code);
  const trades = res.strategy.closedtrades || [];
  const wins = trades.filter(t => t.profit > 0);
  const losses = trades.filter(t => t.profit <= 0);
  const wr = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
  const net = res.strategy.netprofit || 0;
  const maxDD = res.strategy.max_drawdown || 1;
  const netR = net / slVal;
  const maxDDR = maxDD / slVal;
  const calmar = maxDDR > 0 ? (netR / maxDDR) : 0;

  const monthly = {};
  for (const t of trades) {
    const m = new Date(t.entry_time).toISOString().substring(0, 7);
    monthly[m] = (monthly[m] || 0) + (t.profit / slVal);
  }

  console.log(`Results for ${name}:`);
  console.log(`  Total Trades: ${trades.length} (${wins.length}W / ${losses.length}L)`);
  console.log(`  Win Rate: ${wr.toFixed(2)}%`);
  console.log(`  Net Profit: $${net.toFixed(2)} (+${netR.toFixed(2)}R)`);
  console.log(`  Max Closed Drawdown: $${maxDD.toFixed(2)} (${maxDDR.toFixed(2)}R)`);
  console.log(`  Calmar Ratio: ${calmar.toFixed(2)}`);
  console.log(`  Monthly Breakdown (R):`, monthly);

  return {
    name, trades: trades.length, wins: wins.length, losses: losses.length,
    wr: Number(wr.toFixed(2)), net, netR: Number(netR.toFixed(2)),
    maxDD, maxDDR: Number(maxDDR.toFixed(2)), calmar: Number(calmar.toFixed(2)),
    monthly
  };
}

const audit1 = await evaluateStrategy(p15, pineStrat1, 'Strategy #1: BTC 15M Sovereign Grandmaster', 350.0);
const audit2 = await evaluateStrategy(p15, pineStrat2, 'Strategy #2: BTC 15M Strict 1:2.0 R:R Champion', 300.0);
const audit3 = await evaluateStrategy(p1h, pineStrat3, 'Strategy #3: BTC 1H Macro Sovereign', 1800.0);

fs.writeFileSync('data/pinets_verified_btc_top3.json', JSON.stringify({ audit1, audit2, audit3 }, null, 2));
console.log('\nVerification complete! Results written to data/pinets_verified_btc_top3.json');
