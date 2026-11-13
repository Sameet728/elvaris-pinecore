const fs = require('fs');

async function testConfig(p) {
  const code = `
//@version=5
strategy("Test_${p.id}", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0)

atr = ta.atr(14)
emaFast = ta.ema(close, ${p.emaFast || 50})
emaSlow = ta.ema(close, ${p.emaSlow || 200})

${p.useKeltner ? `
basis = ta.ema(close, ${p.bandLen})
upper = basis + ${p.bandMult} * atr
lower = basis - ${p.bandMult} * atr
` : `
basis = ta.sma(close, ${p.bandLen})
dev = ${p.bandMult} * ta.stdev(close, ${p.bandLen})
upper = basis + dev
lower = basis - dev
`}

rsi = ta.rsi(close, 14)

utcHour = hour(time, "UTC")
inActiveSession = (utcHour >= ${p.sessionStart || 1} and utcHour <= ${p.sessionEnd || 20}) and (${p.excludeH12 ? 'utcHour != 12' : 'true'})

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

canTrade = dayLossCount < ${p.maxDailyLosses || 1} and dayTradeCount < ${p.maxDailyTrades || 2}
passCrash = ${p.crashFilter > 0 ? `close >= (emaFast - ${p.crashFilter} * atr)` : 'true'}

${p.useWick ? `
body = math.abs(close - open)
lowerWick = math.min(open, close) - low
upperWick = high - math.max(open, close)
wickLongOk = lowerWick >= (body * ${p.wickRatio || 0.15})
wickShortOk = upperWick >= (body * ${p.wickRatio || 0.15})
` : `
wickLongOk = true
wickShortOk = true
`}

longSig = inActiveSession and canTrade and passCrash and close > (emaSlow + ${p.emaOffset || 0}) and low <= lower and close > open and rsi < ${p.rsiLong || 52} and wickLongOk and strategy.position_size == 0
shortSig = inActiveSession and canTrade and close < emaSlow and emaFast < emaSlow and high >= upper and close < open and rsi > ${p.rsiShort || 50} and wickShortOk and strategy.position_size == 0

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

  const res = await fetch('http://127.0.0.1:3005/api/backtest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script: code, datasetName: 'xauusd_15m', symbol: 'FOREXCOM:XAUUSD', timeframe: '15' })
  });
  const d = await res.json();
  if (!d.success) return null;

  const m = d.result.metrics;
  const trades = d.result.trades;
  const months = {};
  for (const t of trades) {
    const dt = new Date(t.entryTime);
    const mKey = dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0');
    if (!months[mKey]) months[mKey] = { trades: 0, wins: 0, r: 0 };
    months[mKey].trades++;
    const pnl = t.pnl ?? t.profitCash ?? 0;
    if (pnl > 0) months[mKey].wins++;
    const slDist = Math.abs(t.entryPrice - t.stopLoss);
    const r = slDist > 0 ? (pnl / slDist) : 0;
    months[mKey].r += r;
  }

  const augR = months['2026-08']?.r || 0;
  const sepR = months['2026-09']?.r || 0;
  const octR = months['2026-10']?.r || 0;
  const novR = months['2026-11']?.r || 0;
  const totR = augR + sepR + octR + novR;

  return {
    id: p.id,
    p,
    code,
    trades: trades.length,
    winRate: m.winRate,
    calmar: m.calmarRatio,
    netProfit: m.netProfitCash,
    maxDD: m.maxDrawdownCash,
    augR, sepR, octR, novR, totR,
    tradesList: trades
  };
}

async function run() {
  // S1 official trades
  const s1Script = fs.readFileSync('15M_Champion_Strategies/Champion_15M_Grandmaster_Dual10R_Oct8R_STRATEGY.pine', 'utf8');
  const resS1 = await fetch('http://127.0.0.1:3005/api/backtest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script: s1Script, datasetName: 'xauusd_15m', symbol: 'FOREXCOM:XAUUSD', timeframe: '15' })
  });
  const s1Trades = (await resS1.json()).result.trades;

  console.log(`Loaded Strategy 1: ${s1Trades.length} trades.`);

  const list = [];
  let id = 1;

  // Let's test combinations with different band lengths, multipliers, offsets, sessions, and wick ratios
  for (const session of [
    { sessionStart: 1, sessionEnd: 20, excludeH12: true },
    { sessionStart: 1, sessionEnd: 19, excludeH12: true },
    { sessionStart: 1, sessionEnd: 18, excludeH12: true },
    { sessionStart: 6, sessionEnd: 20, excludeH12: false },
    { sessionStart: 6, sessionEnd: 19, excludeH12: true }
  ]) {
    for (const bandLen of [24, 26, 28, 30]) {
      for (const bandMult of [2.05, 2.1, 2.15, 2.2]) {
        for (const emaOffset of [2.0, 3.0, 4.0]) {
          for (const tp of [14.0, 14.5, 15.0]) {
            for (const sl of [13.75, 14.0]) {
              for (const useWick of [false, true]) {
                list.push({
                  id: id++,
                  bandLen, bandMult, emaOffset, tp, sl,
                  useWick, wickRatio: 0.15,
                  crashFilter: 1.25, rsiLong: 52, rsiShort: 50,
                  ...session
                });
              }
            }
          }
        }
      }
    }
  }

  console.log(`Generated ${list.length} candidate parameter sets. Sampling best candidates...`);

  const viable = [];

  // Test promising subset
  for (let i = 0; i < list.length; i += 3) {
    const p = list[i];
    const r = await testConfig(p);
    if (!r) continue;

    // Check criteria: WR >= 80%, Calmar >= 4.0, Aug >= 7.0R, Sep >= 7.0R, Oct >= 6.5R, Nov >= 1.5R
    if (r.winRate >= 80.0 && r.calmar >= 4.0 && r.augR >= 7.0 && r.sepR >= 7.0 && r.octR >= 6.5 && r.novR >= 1.5) {
      let shared = 0;
      for (const t of r.tradesList) {
        if (s1Trades.some(s1t => Math.abs(s1t.entryTime - t.entryTime) <= 45 * 60 * 1000)) shared++;
      }
      const jaccard = (shared / (r.trades + s1Trades.length - shared)) * 100;
      r.sharedWithS1 = shared;
      r.jaccard = jaccard;
      viable.push(r);
      console.log(`[VIABLE #${viable.length}] ${p.sessionStart}-${p.sessionEnd}UTC | L${p.bandLen} M${p.bandMult} Off${p.emaOffset} TP${p.tp} Wick=${p.useWick} | Trades=${r.trades} | WR=${r.winRate}% | Calmar=${r.calmar} | TotR=+${r.totR.toFixed(2)}R | Jaccard=${jaccard.toFixed(1)}%`);
      console.log(`   Aug: +${r.augR.toFixed(2)}R | Sep: +${r.sepR.toFixed(2)}R | Oct: +${r.octR.toFixed(2)}R | Nov: +${r.novR.toFixed(2)}R`);
    }
  }

  console.log(`\nTotal viable candidates found: ${viable.length}`);
  fs.writeFileSync('viable_8r_candidates.json', JSON.stringify(viable, null, 2));
}

run().catch(console.error);

