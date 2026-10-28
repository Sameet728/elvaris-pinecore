import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));

async function testPine() {
  const p = new PineTS(candles, 'XAUUSD', '15');
  await p.ready();

  const code = `//@version=5
strategy("Champion_15M_90WR_Apex_STRATEGY", overlay=true,
         initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0,
         margin_long=0, margin_short=0,
         commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

// Inputs
tpDistInput  = input.float(17.0, "Take Profit Distance ($)")
slDistInput  = input.float(14.0, "Stop Loss Distance ($)")
bandLen      = input.int(28, "Volatility Band Length")
bandMult     = input.float(2.1, "Volatility Band Multiplier")
rsiFilter    = input.int(54, "RSI Boundary Filter")
wickMinRatio = input.float(0.25, "Minimum Rejection Wick Ratio")
sessionStart = input.int(6, "Session Start Hour (UTC)")
sessionEnd   = input.int(20, "Session End Hour (UTC)")

// Technical Indicators
atr = ta.atr(14)
ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, bandLen)
dev = bandMult * ta.stdev(close, bandLen)
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

inActiveSession = (hour >= sessionStart and hour <= sessionEnd)

// Rejection Wick Calculation
body = math.abs(close - open)
lowerWick = math.min(open, close) - low
upperWick = high - math.max(open, close)
wickLongOk = lowerWick >= (body * wickMinRatio)
wickShortOk = upperWick >= (body * wickMinRatio)

longSig = inActiveSession and close > ema200 and low <= lower and close > open and rsi < rsiFilter and wickLongOk and strategy.position_size == 0
shortSig = inActiveSession and close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > (100 - rsiFilter) and wickShortOk and strategy.position_size == 0

var float ep = na
var float currSL = na
var float tpP = na

if longSig
    ep := close
    currSL := ep - slDistInput
    tpP := ep + tpDistInput
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortSig
    ep := close
    currSL := ep + slDistInput
    tpP := ep - tpDistInput
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)
`;

  const res = await p.run(code);
  const trades = res.strategy.closedtrades || [];
  const wins = trades.filter(t => t.profit > 0);
  const losses = trades.filter(t => t.profit <= 0);
  const wr = (wins.length / trades.length) * 100;

  console.log(`\n======================================================`);
  console.log(`🏆 APEX CHAMPION TEST IN PINRETS:`);
  console.log(`Total Trades: ${trades.length}`);
  console.log(`Wins: ${wins.length} | Losses: ${losses.length}`);
  console.log(`Win Rate: ${wr.toFixed(2)}%`);
  console.log(`Net Profit: $${res.strategy.netprofit.toFixed(2)} (+${(res.strategy.netprofit / 14.0).toFixed(2)}R)`);
  console.log(`Max Drawdown: $${res.strategy.max_drawdown?.toFixed(2)} (${(res.strategy.max_drawdown / 14.0).toFixed(2)}R)`);
  console.log(`Calmar Ratio: ${(res.strategy.netprofit / res.strategy.max_drawdown).toFixed(2)}`);

  const mTrades = {};
  const mWins = {};
  const mProfit = {};

  for (const t of trades) {
    const d = new Date(t.entry_time);
    const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    mTrades[m] = (mTrades[m] || 0) + 1;
    mProfit[m] = (mProfit[m] || 0) + t.profit;
    if (t.profit > 0) mWins[m] = (mWins[m] || 0) + 1;
  }

  console.log(`\nMonthly Breakdown:`);
  for (const m of Object.keys(mTrades)) {
    const w = mWins[m] || 0;
    const l = mTrades[m] - w;
    const pnl = mProfit[m];
    console.log(`  ${m}: ${mTrades[m]} trades | ${w}W / ${l}L (${(w / mTrades[m] * 100).toFixed(1)}% WR) | PnL: +$${pnl.toFixed(2)} (+${(pnl / 14.0).toFixed(2)}R)`);
  }
}

testPine().catch(console.error);
