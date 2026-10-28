import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

// Test Session Liquidity Sweep (Asian High/Low swept in London, London High/Low swept in NY)
const sessionSweepPine = `//@version=6
strategy("SessionSweep_80WR", overlay=true, 
         initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, 
         margin_long=0, margin_short=0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

// Inputs
tpPips = input.float(25.0, "Take Profit (Pips)")
slPips = input.float(25.0, "Stop Loss (Pips)")
useTrendFilter = input.bool(true, "Trend EMA Filter")
emaLen = input.int(100, "Trend EMA Length")

tpDist = tpPips / 10.0
slDist = slPips / 10.0

ema = ta.ema(close, emaLen)

// Asian Session (00:00 - 06:00 UTC)
isAsia = not na(time(timeframe.period, "0000-0600:23456"))
isLondon = not na(time(timeframe.period, "0700-1100:23456"))
isNY = not na(time(timeframe.period, "1200-1600:23456"))

var float asiaHigh = na
var float asiaLow = na

if isAsia and not isAsia[1]
    asiaHigh := high
    asiaLow := low
else if isAsia
    asiaHigh := math.max(asiaHigh, high)
    asiaLow := math.min(asiaLow, low)

// Asian High swept during London/NY -> Short
asianHighSwept = not isAsia and (isLondon or isNY) and high > asiaHigh and close < asiaHigh and (not useTrendFilter or close < ema)
// Asian Low swept during London/NY -> Long
asianLowSwept = not isAsia and (isLondon or isNY) and low < asiaLow and close > asiaLow and (not useTrendFilter or close > ema)

var int lastEntryBar = -100

if asianLowSwept and strategy.position_size == 0 and (bar_index - lastEntryBar) > 10
    lastEntryBar := bar_index
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=close + tpDist, stop=close - slDist)

if asianHighSwept and strategy.position_size == 0 and (bar_index - lastEntryBar) > 10
    lastEntryBar := bar_index
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=close - tpDist, stop=close + slDist)
`;

async function testSessionSweep() {
  const p = new PineTS(candles, 'XAUUSD', '5');
  await p.ready();
  const res = await p.run(sessionSweepPine);
  const s = res.strategy;
  const trades = s.closedtrades || [];
  const wins = trades.filter(t => t.profit > 0);
  const losses = trades.filter(t => t.profit <= 0);
  console.log('Session Sweep Strategy:');
  console.log(`Total: ${trades.length} | Wins: ${wins.length} Losses: ${losses.length} | WR: ${trades.length > 0 ? ((wins.length/trades.length)*100).toFixed(1)+'%' : 'N/A'} | Net: $${s.netprofit.toFixed(2)}`);
}

testSessionSweep().catch(console.error);
