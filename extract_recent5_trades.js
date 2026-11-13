const fs = require('fs');
const { PineTS } = require('./pine-backtester-nextjs/node_modules/pinets');

const rawCandles = JSON.parse(fs.readFileSync('pine-backtester-nextjs/public/data/xauusd_15m.json', 'utf8'));
const pineCandles = rawCandles.map(c => ({
  open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
  openTime: c.openTime, closeTime: c.openTime + 15 * 60000
}));

const s1Script = fs.readFileSync('15M_Champion_Strategies/Champion_15M_Grandmaster_Dual10R_Oct8R_STRATEGY.pine', 'utf8')
  .replace(/var table perfTable[\s\S]*?plot\(ema50/m, 'plot(ema50')
  .replace(/if showPositionBoxes[\s\S]*?var table/m, 'var table');

const s2Script = `//@version=5
strategy("Champion_15M_US_Momentum_STRATEGY", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0)
atr = ta.atr(14)
emaFast = ta.ema(close, 50)
emaSlow = ta.ema(close, 200)
basis = ta.sma(close, 28)
dev = 2.1 * ta.stdev(close, 28)
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

utcHour = hour(time, "UTC")
inActiveSession = (utcHour >= 12 and utcHour <= 21)

dayNumber = dayofmonth(time, "UTC")
var int curDay = -1
var int dayTradeCount = 0
var int dayLossCount = 0
if dayNumber != curDay
    curDay := dayNumber
    dayTradeCount := 0
    dayLossCount := 0

var int prevClosed = 0
if strategy.closedtrades > prevClosed
    if strategy.closedtrades.profit(strategy.closedtrades - 1) <= 0
        dayLossCount += 1
    dayTradeCount += 1
    prevClosed := strategy.closedtrades

canTrade = dayLossCount < 1 and dayTradeCount < 2
passCrash = close >= (emaFast - 1.35 * atr)

longSig = inActiveSession and canTrade and passCrash and close > (emaSlow + 4.5) and low <= lower and close > open and rsi < 52 and strategy.position_size == 0
shortSig = inActiveSession and canTrade and close < emaSlow and emaFast < emaSlow and high >= upper and close < open and rsi > 50 and strategy.position_size == 0

var float ep = na
if longSig
    ep := close
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", stop=ep - 13.75, limit=ep + 15.0)
if shortSig
    ep := close
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", stop=ep + 13.75, limit=ep - 15.0)
`;

const s3Script = `//@version=5
strategy("Champion_15M_London_Core_STRATEGY", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0)
atr = ta.atr(14)
emaFast = ta.ema(close, 50)
emaSlow = ta.ema(close, 200)
basis = ta.sma(close, 28)
dev = 2.1 * ta.stdev(close, 28)
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

utcHour = hour(time, "UTC")
inActiveSession = (utcHour >= 5 and utcHour <= 20) and (utcHour != 12)

dayNumber = dayofmonth(time, "UTC")
var int curDay = -1
var int dayTradeCount = 0
var int dayLossCount = 0
if dayNumber != curDay
    curDay := dayNumber
    dayTradeCount := 0
    dayLossCount := 0

var int prevClosed = 0
if strategy.closedtrades > prevClosed
    if strategy.closedtrades.profit(strategy.closedtrades - 1) <= 0
        dayLossCount += 1
    dayTradeCount += 1
    prevClosed := strategy.closedtrades

canTrade = dayLossCount < 1 and dayTradeCount < 2
passCrash = close >= (emaFast - 1.35 * atr)

longSig = inActiveSession and canTrade and passCrash and close > (emaSlow + 4.5) and low <= lower and close > open and rsi < 52 and strategy.position_size == 0
shortSig = inActiveSession and canTrade and close < emaSlow and emaFast < emaSlow and high >= upper and close < open and rsi > 50 and strategy.position_size == 0

var float ep = na
if longSig
    ep := close
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", stop=ep - 13.75, limit=ep + 16.0)
if shortSig
    ep := close
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", stop=ep + 13.75, limit=ep - 16.0)
`;

async function getRecent5(script, name, slVal) {
  const pts = new PineTS(pineCandles, 'FOREXCOM:XAUUSD', '15');
  await pts.ready();
  const res = await pts.run(script);
  const trades = res.strategy.closedtrades;
  const last5 = trades.slice(-5);
  return {
    name,
    total: trades.length,
    recent5: last5.map((t, idx) => {
      const entryT = t.entry_time || pineCandles[t.entry_bar_index]?.openTime;
      const exitT = t.exit_time || pineCandles[t.exit_bar_index]?.openTime;
      const isLong = t.size > 0;
      const pnl = t.profit || 0;
      const isWin = pnl > 0;
      return {
        tradeNum: trades.length - 5 + idx + 1,
        direction: isLong ? 'LONG' : 'SHORT',
        entryTime: new Date(entryT).toISOString().replace('T', ' ').substring(0, 19) + ' UTC',
        exitTime: new Date(exitT).toISOString().replace('T', ' ').substring(0, 19) + ' UTC',
        entryPrice: t.entry_price.toFixed(2),
        exitPrice: t.exit_price.toFixed(2),
        pnlCash: (pnl >= 0 ? '+' : '') + pnl.toFixed(2),
        rMultiple: (pnl >= 0 ? '+' : '') + (pnl / slVal).toFixed(2) + 'R',
        outcome: isWin ? 'WIN (TP Target Hit)' : 'LOSS (Stop Hit)'
      };
    })
  };
}

async function main() {
  const s1 = await getRecent5(s1Script, 'Strategy 1: Tradeify Grandmaster Dual10R', 13.75);
  const s2 = await getRecent5(s2Script, 'Strategy 2: US Session Reversal', 13.75);
  const s3 = await getRecent5(s3Script, 'Strategy 3: London Institutional Core', 13.75);

  console.log(JSON.stringify({ s1, s2, s3 }, null, 2));
  fs.writeFileSync('official_recent5_trades.json', JSON.stringify({ s1, s2, s3 }, null, 2));
}

main().catch(console.error);

