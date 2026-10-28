import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));

const testCode = `//@version=5
strategy("Champion_15M_82WR_Dual10R_STRATEGY", overlay=true,
         initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0,
         margin_long=0, margin_short=0,
         commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

// Inputs
tpDistInput  = input.float(16.0, "Take Profit Distance ($)")
slDistInput  = input.float(14.0, "Stop Loss Distance ($)")
bandLen      = input.int(30, "Volatility Band Length")
bandMult     = input.float(2.2, "Volatility Band Multiplier")
rsiFilter    = input.int(52, "RSI Filter")
sessionStart = input.int(1, "Session Start UTC")
sessionEnd   = input.int(20, "Session End UTC")

// Indicators
atr = ta.atr(14)
ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, bandLen)
dev = bandMult * ta.stdev(close, bandLen)
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

// Session check
inActiveSession = (hour >= sessionStart and hour <= sessionEnd)

// Signal logic (Confirmed Bar Close)
longSig = inActiveSession and close > ema200 and low <= lower and close > open and rsi < rsiFilter and strategy.position_size == 0
shortSig = inActiveSession and close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > (100 - rsiFilter) and strategy.position_size == 0

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

async function main() {
  console.log("Compiling & Executing in PineTS...");
  const p = new PineTS(candles, 'XAUUSD', '15');
  await p.ready();
  const res = await p.run(testCode);
  const s = res.strategy;
  const trades = s.closedtrades || [];
  const wins = trades.filter(t => t.profit > 0);
  const losses = trades.filter(t => t.profit <= 0);
  const wr = (wins.length / trades.length) * 100;

  console.log(`\n======================================================`);
  console.log(`🏆 PINRETS RESULT (Exact TradingView Engine Emulation):`);
  console.log(`Total Trades: ${trades.length}`);
  console.log(`Wins: ${wins.length} | Losses: ${losses.length}`);
  console.log(`Win Rate: ${wr.toFixed(2)}%`);
  console.log(`Net Profit: $${s.netprofit.toFixed(2)}`);
  console.log(`Max Drawdown: $${s.max_drawdown?.toFixed(2)}`);

  const monthlyTrades = {};
  const monthlyProfit = {};

  for (const t of trades) {
    const d = new Date(t.entry_time);
    const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    monthlyTrades[m] = (monthlyTrades[m] || 0) + 1;
    monthlyProfit[m] = (monthlyProfit[m] || 0) + t.profit;
  }

  console.log(`Monthly Trades:`, monthlyTrades);
  console.log(`Monthly Profit ($):`, monthlyProfit);
  console.log(`Monthly R (where 1R = $14):`);
  for (const m of Object.keys(monthlyProfit)) {
    console.log(`  ${m}: +${(monthlyProfit[m] / 14.0).toFixed(2)}R`);
  }
}

main().catch(console.error);
