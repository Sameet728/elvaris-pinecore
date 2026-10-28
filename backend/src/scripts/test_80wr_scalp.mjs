import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

// Test High Win Rate Scalp Model (Sweep + RSI Extreme + Tight Target + Micro-BE)
const testCode = `//@version=6
strategy("HighWRScalp", overlay=true, 
         initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, 
         margin_long=0, margin_short=0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

tpPips = 16.0
slPips = 22.0
tpDist = tpPips / 10.0 // $1.60
slDist = slPips / 10.0 // $2.20

rsi = ta.rsi(close, 7)
ema = ta.ema(close, 50)

sH = ta.pivothigh(high, 4, 4)
sL = ta.pivotlow(low,  4, 4)

var float bsl = na
var float ssl = na
if not na(sH)
    bsl := sH
if not na(sL)
    ssl := sL

sslSweep = not na(ssl) and low < ssl and close > ssl
bslSweep = not na(bsl) and high > bsl and close < bsl

// Long: SSL sweep with RSI oversold (< 35) or close > ema
longSig = sslSweep and (rsi < 38 or close > ema) and strategy.position_size == 0
// Short: BSL sweep with RSI overbought (> 65) or close < ema
shortSig = bslSweep and (rsi > 62 or close < ema) and strategy.position_size == 0

var float entryP = na
var float currSL = na
var float tpP = na
var bool isBE = false
var int entryBar = 0

if longSig and strategy.position_size == 0
    entryP := close
    currSL := close - slDist
    tpP    := close + tpDist
    isBE   := false
    entryBar := bar_index
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortSig and strategy.position_size == 0
    entryP := close
    currSL := close + slDist
    tpP    := close - tpDist
    isBE   := false
    entryBar := bar_index
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)

if strategy.position_size != 0
    dir = strategy.position_size > 0 ? 1 : -1
    currentGain = dir == 1 ? (high - entryP) : (entryP - low)

    // Quick Breakeven at +8 pips (+0.80 dollars)
    if not isBE and currentGain >= 0.80
        targetBE = dir == 1 ? (entryP + syminfo.mintick * 5) : (entryP - syminfo.mintick * 5)
        if (dir == 1 and close > targetBE) or (dir == -1 and close < targetBE)
            currSL := targetBE
            isBE := true

    if (bar_index - entryBar) >= 25
        strategy.close_all(comment="Timeout")
    else
        exitComment = isBE ? "BREAKEVEN" : "SL HIT"
        if dir == 1
            strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL, comment_profit="TP HIT", comment_loss=exitComment)
        else
            strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL, comment_profit="TP HIT", comment_loss=exitComment)
`;

async function test() {
  const p = new PineTS(candles, 'XAUUSD', '5');
  await p.ready();
  const res = await p.run(testCode);
  const s = res.strategy;
  const trades = s.closedtrades || [];
  const wins = trades.filter(t => t.profit > 0);
  const losses = trades.filter(t => t.profit <= 0);
  const wr = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;

  console.log('--- HIGH WIN RATE SCALP MODEL ---');
  console.log(`Total Trades: ${trades.length}`);
  console.log(`Wins: ${wins.length} | Losses: ${losses.length}`);
  console.log(`Win Rate: ${wr.toFixed(1)}%`);
  console.log(`Net Profit: $${s.netprofit.toFixed(2)}`);
  console.log(`Max Drawdown: $${s.max_drawdown?.toFixed(2)} (${(s.max_drawdown_percent_value * 100).toFixed(2)}%)`);
}

test().catch(console.error);
