const fs = require('fs');
const { PineTS } = require('./pine-backtester-nextjs/node_modules/pinets');

const rawCandles = JSON.parse(fs.readFileSync('pine-backtester-nextjs/public/data/xauusd_15m.json', 'utf8'));
const pineCandles = rawCandles.map(c => ({
  open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
  openTime: c.openTime, closeTime: c.openTime + 15 * 60000
}));

// Strategy 1: Tradeify Grandmaster Dual10R Oct8R (01:00 - 20:00 UTC, exc 12)
const s1Script = fs.readFileSync('15M_Champion_Strategies/Champion_15M_Grandmaster_Dual10R_Oct8R_STRATEGY.pine', 'utf8')
  .replace(/var table perfTable[\s\S]*?plot\(ema50/m, 'plot(ema50')
  .replace(/if showPositionBoxes[\s\S]*?var table/m, 'var table');

// Strategy 2: US Session Reversal (12:00 - 21:00 UTC)
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

// Strategy 3: London Institutional Core (05:00 - 20:00 UTC, exc 12)
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

async function runBacktest(script, name, slVal) {
  const pts = new PineTS(pineCandles, 'FOREXCOM:XAUUSD', '15');
  await pts.ready();
  const res = await pts.run(script);
  const trades = res.strategy.closedtrades;
  const wins = trades.filter(t => t.profit > 0).length;
  const wr = (wins / trades.length) * 100;
  const net = trades.reduce((acc, t) => acc + (t.profit || 0), 0);

  let peak = 0;
  let running = 0;
  let maxDD = 0;
  for (const t of trades) {
    running += (t.profit || 0);
    if (running > peak) peak = running;
    const dd = peak - running;
    if (dd > maxDD) maxDD = dd;
  }
  const calmar = maxDD > 0 ? net / maxDD : 999;

  const mo = {};
  for (const t of trades) {
    const dt = new Date(t.entry_time || pineCandles[t.entry_bar_index]?.openTime);
    const mKey = dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0');
    if (!mo[mKey]) mo[mKey] = { trades: 0, wins: 0, cash: 0, r: 0 };
    mo[mKey].trades++;
    if (t.profit > 0) mo[mKey].wins++;
    mo[mKey].cash += t.profit;
    mo[mKey].r += t.profit / slVal;
  }

  return { name, trades, wins, wr, net, maxDD, calmar, mo };
}

async function main() {
  console.log('=== RUNNING OFFICIAL 3-WAY VERIFICATION ===');
  const r1 = await runBacktest(s1Script, 'Strategy 1: Tradeify Grandmaster', 13.75);
  const r2 = await runBacktest(s2Script, 'Strategy 2: US Session Reversal', 13.75);
  const r3 = await runBacktest(s3Script, 'Strategy 3: London Institutional Core', 13.75);

  const list = [r1, r2, r3];
  for (const r of list) {
    console.log(`\n--------------------------------------------------`);
    console.log(`🏆 ${r.name}`);
    console.log(`Total Trades: ${r.trades.length} | Win Rate: ${r.wr.toFixed(2)}% (${r.wins}W / ${r.trades.length - r.wins}L)`);
    console.log(`Net Return: +$${r.net.toFixed(2)} (+${(r.net / 13.75).toFixed(2)}R) | Calmar: ${r.calmar.toFixed(2)} | Max DD: $${r.maxDD.toFixed(2)}`);
    console.log(`Monthly R Breakdown:`);
    for (const [k, v] of Object.entries(r.mo)) {
      console.log(`  • ${k}: +${v.r.toFixed(2)}R (${v.trades} trades | ${v.wins}W / ${v.trades - v.wins}L | ${((v.wins / v.trades) * 100).toFixed(1)}% WR)`);
    }
  }

  // Overlap analysis
  function calcOverlap(a, b) {
    let shared = 0;
    for (const ta of a) {
      const taTime = ta.entry_time || pineCandles[ta.entry_bar_index]?.openTime;
      if (b.some(tb => {
        const tbTime = tb.entry_time || pineCandles[tb.entry_bar_index]?.openTime;
        return Math.abs(tbTime - taTime) <= 45 * 60 * 1000;
      })) {
        shared++;
      }
    }
    const jaccard = (shared / (a.length + b.length - shared)) * 100;
    return {
      shared,
      pctA: ((shared / a.length) * 100).toFixed(1),
      pctB: ((shared / b.length) * 100).toFixed(1),
      jaccard: jaccard.toFixed(1)
    };
  }

  const ov12 = calcOverlap(r1.trades, r2.trades);
  const ov13 = calcOverlap(r1.trades, r3.trades);
  const ov23 = calcOverlap(r2.trades, r3.trades);

  console.log(`\n==================================================`);
  console.log(`📊 PAIRWISE TRADE OVERLAP & DECORRELATION MATRIX`);
  console.log(`• Strategy 1 vs Strategy 2:`);
  console.log(`    Shared: ${ov12.shared} trades | S2 Overlap: ${ov12.pctB}% (${(100 - ov12.pctB).toFixed(1)}% UNIQUE S2 trades!) | Jaccard Similarity: ${ov12.jaccard}%`);
  console.log(`• Strategy 1 vs Strategy 3:`);
  console.log(`    Shared: ${ov13.shared} trades | S3 Overlap: ${ov13.pctB}% (${(100 - ov13.pctB).toFixed(1)}% UNIQUE S3 trades!) | Jaccard Similarity: ${ov13.jaccard}%`);
  console.log(`• Strategy 2 vs Strategy 3:`);
  console.log(`    Shared: ${ov23.shared} trades | Overlap: ${ov23.pctA}% vs ${ov23.pctB}% | Jaccard Similarity: ${ov23.jaccard}%`);

  // Save official verification json
  fs.writeFileSync('trio_official_results.json', JSON.stringify({ r1, r2, r3, ov12, ov13, ov23 }, null, 2));
}

main().catch(console.error);

