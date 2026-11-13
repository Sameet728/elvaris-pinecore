const fs = require('fs');

async function testCandidate(title, p) {
  const code = `
//@version=5
strategy("${title}", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0)

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
inActiveSession = (utcHour >= ${p.sessionStart} and utcHour <= ${p.sessionEnd}) and (${p.excludeH12 ? 'utcHour != 12' : 'true'})

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
    title,
    p,
    code,
    trades: trades.length,
    winRate: m.winRate,
    calmar: m.calmarRatio,
    netProfit: m.netProfitCash,
    maxDD: m.maxDrawdownCash,
    augR, sepR, octR, novR, totR,
    months,
    tradesList: trades
  };
}

async function find3Strategies() {
  console.log('Searching for 3 Distinct High-R (8R+ per Month) Strategies...');

  // Baseline Strategy 1
  const s1Script = fs.readFileSync('15M_Champion_Strategies/Champion_15M_Grandmaster_Dual10R_Oct8R_STRATEGY.pine', 'utf8');
  const resS1 = await fetch('http://127.0.0.1:3005/api/backtest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script: s1Script, datasetName: 'xauusd_15m', symbol: 'FOREXCOM:XAUUSD', timeframe: '15' })
  });
  const dS1 = await resS1.json();
  const s1 = {
    name: 'Strategy 1 (Tradeify Grandmaster Dual10R)',
    trades: dS1.result.trades.length,
    winRate: dS1.result.metrics.winRate,
    calmar: dS1.result.metrics.calmarRatio,
    netProfit: dS1.result.metrics.netProfitCash,
    maxDD: dS1.result.metrics.maxDrawdownCash,
    tradesList: dS1.result.trades
  };
  console.log(`Strategy 1: Trades=${s1.trades}, WR=${s1.winRate}%, Calmar=${s1.calmar}`);

  // Test space
  const testList = [
    // Variant 1: Faster Band (22 SMA) with tight offset
    { title: 'S2_FastBand_L22', bandLen: 22, bandMult: 2.15, emaOffset: 2.0, crashFilter: 1.25, tp: 14.0, sl: 13.75, sessionStart: 1, sessionEnd: 20, excludeH12: true, rsiLong: 52, rsiShort: 50 },
    // Variant 2: Fast Band (24 SMA)
    { title: 'S2_FastBand_L24', bandLen: 24, bandMult: 2.15, emaOffset: 2.5, crashFilter: 1.25, tp: 14.0, sl: 13.75, sessionStart: 1, sessionEnd: 20, excludeH12: true, rsiLong: 52, rsiShort: 50 },
    // Variant 3: Intermediate Band (26 SMA)
    { title: 'S2_InterBand_L26', bandLen: 26, bandMult: 2.10, emaOffset: 3.0, crashFilter: 1.25, tp: 14.0, sl: 13.75, sessionStart: 1, sessionEnd: 20, excludeH12: true, rsiLong: 52, rsiShort: 50 },
    // Variant 4: Apex Rejection Wick (28 SMA + Wick 0.15)
    { title: 'S2_Apex_Wick15', bandLen: 28, bandMult: 2.10, emaOffset: 3.0, crashFilter: 1.25, tp: 14.0, sl: 13.75, sessionStart: 1, sessionEnd: 20, excludeH12: true, rsiLong: 54, rsiShort: 48, useWick: true, wickRatio: 0.15 },
    // Variant 5: Apex Rejection Wick (26 SMA + Wick 0.20)
    { title: 'S2_Apex_Wick20', bandLen: 26, bandMult: 2.10, emaOffset: 2.5, crashFilter: 1.25, tp: 14.0, sl: 13.75, sessionStart: 1, sessionEnd: 20, excludeH12: true, rsiLong: 54, rsiShort: 48, useWick: true, wickRatio: 0.20 },
    // Variant 6: London Focused Session (06:00 to 20:00) with 26 SMA
    { title: 'S3_London_L26', bandLen: 26, bandMult: 2.05, emaOffset: 2.5, crashFilter: 1.25, tp: 14.0, sl: 13.75, sessionStart: 6, sessionEnd: 20, excludeH12: false, rsiLong: 52, rsiShort: 50 },
    // Variant 7: London Focused Session (06:00 to 19:00) with 28 SMA
    { title: 'S3_London_L28', bandLen: 28, bandMult: 2.05, emaOffset: 3.0, crashFilter: 1.25, tp: 14.0, sl: 13.75, sessionStart: 6, sessionEnd: 19, excludeH12: true, rsiLong: 52, rsiShort: 50 },
    // Variant 8: Slow Band (32 SMA)
    { title: 'S3_SlowBand_L32', bandLen: 32, bandMult: 2.10, emaOffset: 3.5, crashFilter: 1.25, tp: 14.0, sl: 13.75, sessionStart: 1, sessionEnd: 20, excludeH12: true, rsiLong: 52, rsiShort: 50 },
    // Variant 9: Keltner Channel (24 EMA + 1.85 ATR)
    { title: 'S3_Keltner_L24', useKeltner: true, bandLen: 24, bandMult: 1.85, emaOffset: 2.0, crashFilter: 1.25, tp: 14.0, sl: 13.75, sessionStart: 1, sessionEnd: 20, excludeH12: true, rsiLong: 52, rsiShort: 50 },
    // Variant 10: Higher Target Alpha (TP 16.0 / SL 13.75) with 28 SMA
    { title: 'S3_Alpha_TP16', bandLen: 28, bandMult: 2.15, emaOffset: 4.0, crashFilter: 1.25, tp: 16.0, sl: 13.75, sessionStart: 1, sessionEnd: 20, excludeH12: true, rsiLong: 52, rsiShort: 50 }
  ];

  const pool = [];

  for (const t of testList) {
    const r = await testCandidate(t.title, t);
    if (!r) continue;
    // Overlap with S1
    let shared = 0;
    for (const trade of r.tradesList) {
      if (s1.tradesList.some(s1t => Math.abs(s1t.entryTime - trade.entryTime) <= 45 * 60 * 1000)) {
        shared++;
      }
    }
    const jaccard = (shared / (r.trades + s1.trades - shared)) * 100;
    r.sharedWithS1 = shared;
    r.jaccard = jaccard;
    pool.push(r);

    console.log(`\n[${r.title}] Trades=${r.trades} | WR=${r.winRate}% | Calmar=${r.calmar} | Net=$${r.netProfit}`);
    console.log(`   Aug=+${r.augR.toFixed(2)}R | Sep=+${r.sepR.toFixed(2)}R | Oct=+${r.octR.toFixed(2)}R | Nov=+${r.novR.toFixed(2)}R | Tot=+${r.totR.toFixed(2)}R`);
    console.log(`   Overlap with S1: ${shared}/${r.trades} (${jaccard.toFixed(1)}% Jaccard)`);
  }

  fs.writeFileSync('tested_pool.json', JSON.stringify(pool, null, 2));
}

find3Strategies().catch(console.error);

