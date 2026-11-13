const fs = require('fs');

async function tuneLondonCore() {
  const code = (p) => `
//@version=5
strategy("LondonCore_Tuned", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0)
atr = ta.atr(14)
emaFast = ta.ema(close, 50)
emaSlow = ta.ema(close, 200)
basis = ta.sma(close, ${p.bandLen || 28})
dev = ${p.bandMult || 2.1} * ta.stdev(close, ${p.bandLen || 28})
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

utcHour = hour(time, "UTC")
inActiveSession = (utcHour >= ${p.sessionStart || 6} and utcHour <= ${p.sessionEnd || 20}) and (${p.excludeH12 ? 'utcHour != 12' : 'true'})

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
passCrash = close >= (emaFast - 1.25 * atr)

longSig = inActiveSession and canTrade and passCrash and close > (emaSlow + ${p.emaOffset || 3.0}) and low <= lower and close > open and rsi < ${p.rsiLong || 52} and strategy.position_size == 0
shortSig = inActiveSession and canTrade and close < emaSlow and emaFast < emaSlow and high >= upper and close < open and rsi > ${p.rsiShort || 50} and strategy.position_size == 0

var float ep = na
if longSig
    ep := close
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", stop=ep - ${p.sl}, limit=ep + ${p.tp})
if shortSig
    ep := close
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", stop=ep + ${p.sl}, limit=ep - ${p.tp})
`;

  // Get S1 baseline trades
  const s1Script = fs.readFileSync('15M_Champion_Strategies/Champion_15M_Grandmaster_Dual10R_Oct8R_STRATEGY.pine', 'utf8');
  const resS1 = await fetch('http://127.0.0.1:3005/api/backtest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script: s1Script, datasetName: 'xauusd_15m', symbol: 'FOREXCOM:XAUUSD', timeframe: '15' })
  });
  const s1Trades = (await resS1.json()).result.trades;

  for (let sessionStart of [5, 6, 7]) {
    for (let sessionEnd of [18, 19, 20]) {
      for (let excludeH12 of [false, true]) {
        for (let rsiLong of [50, 52]) {
          for (let emaOffset of [3.0, 4.0]) {
            for (let tp of [14.0, 14.5, 15.0]) {
              for (let sl of [13.75, 14.0]) {
                const res = await fetch('http://127.0.0.1:3005/api/backtest', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ script: code({ sessionStart, sessionEnd, excludeH12, rsiLong, emaOffset, tp, sl }), datasetName: 'xauusd_15m', symbol: 'FOREXCOM:XAUUSD', timeframe: '15' })
                });
                const d = await res.json();
                if (!d.success) continue;
                const m = d.result.metrics;
                if (m.winRate >= 80.0 && m.calmarRatio >= 4.0) {
                  const trades = d.result.trades;
                  const months = {};
                  for (const t of trades) {
                    const dt = new Date(t.entryTime);
                    const mKey = dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0');
                    if (!months[mKey]) months[mKey] = 0;
                    months[mKey] += (t.pnl ?? t.profitCash) / sl;
                  }
                  const aug = months['2026-08'] || 0;
                  const sep = months['2026-09'] || 0;
                  const oct = months['2026-10'] || 0;
                  const nov = months['2026-11'] || 0;
                  const tot = aug + sep + oct + nov;

                  let shared = 0;
                  for (const t of trades) {
                    if (s1Trades.some(s1t => Math.abs(s1t.entryTime - t.entryTime) <= 45 * 60 * 1000)) shared++;
                  }
                  const jaccard = (shared / (trades.length + s1Trades.length - shared)) * 100;

                  console.log(`[MATCH] ${sessionStart}-${sessionEnd}UTC exc12:${excludeH12} Off${emaOffset} TP${tp} SL${sl} | Trades=${trades.length} | WR=${m.winRate}% | Calmar=${m.calmarRatio} | TotR=+${tot.toFixed(2)}R | Jaccard=${jaccard.toFixed(1)}%`);
                  console.log(`   Aug: +${aug.toFixed(2)}R | Sep: +${sep.toFixed(2)}R | Oct: +${oct.toFixed(2)}R | Nov: +${nov.toFixed(2)}R`);
                }
              }
            }
          }
        }
      }
    }
  }
}

tuneLondonCore().catch(console.error);

