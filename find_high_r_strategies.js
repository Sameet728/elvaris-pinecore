const fs = require('fs');

async function testPineCode(code, name) {
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
    name,
    trades: trades.length,
    winRate: m.winRate,
    calmar: m.calmarRatio,
    netProfit: m.netProfitCash,
    maxDD: m.maxDrawdownCash,
    augR, sepR, octR, novR, totR,
    tradesList: trades
  };
}

// Generate Pine Script with custom parameters
function generateScript(title, p) {
  return `
//@version=5
strategy("${title}", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0)

atr = ta.atr(14)
ema50 = ta.ema(close, ${p.emaFast || 50})
ema200 = ta.ema(close, ${p.emaSlow || 200})

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

var int prevClosedTrades = 0
if strategy.closedtrades > prevClosedTrades
    lastProfit = strategy.closedtrades.profit(strategy.closedtrades - 1)
    if lastProfit <= 0
        dayLossCount += 1
    dayTradeCount += 1
    prevClosedTrades := strategy.closedtrades

canTradeToday = (dayLossCount < ${p.maxDailyLosses || 1}) and (dayTradeCount < ${p.maxDailyTrades || 2})
passCrash = ${p.crashFilter > 0 ? `close >= (ema50 - ${p.crashFilter} * atr)` : 'true'}

${p.useWick ? `
body = math.abs(close - open)
lowerWick = math.min(open, close) - low
upperWick = high - math.max(open, close)
wickLongOk = lowerWick >= (body * ${p.wickRatio || 0.2})
wickShortOk = upperWick >= (body * ${p.wickRatio || 0.2})
` : `
wickLongOk = true
wickShortOk = true
`}

longSig = inActiveSession and canTradeToday and passCrash and close > (ema200 + ${p.emaOffset || 0}) and low <= lower and close > open and rsi < ${p.rsiLong || 52} and wickLongOk and strategy.position_size == 0
shortSig = inActiveSession and canTradeToday and close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > ${p.rsiShort || 50} and wickShortOk and strategy.position_size == 0

var float ep = na
var float slP = na
var float tpP = na

if longSig
    ep := close
    slP := ep - ${p.sl}
    tpP := ep + ${p.tp}
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", stop=slP, limit=tpP)

if shortSig
    ep := close
    slP := ep + ${p.sl}
    tpP := ep - ${p.tp}
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", stop=slP, limit=tpP)
`;
}

// Baseline Strategy 1 trades for comparison
async function run() {
  const s1Script = fs.readFileSync('15M_Champion_Strategies/Champion_15M_Grandmaster_Dual10R_Oct8R_STRATEGY.pine', 'utf8');
  const s1 = await testPineCode(s1Script, 'Strategy 1 Baseline');
  console.log(`Strategy 1: Trades=${s1.trades}, WR=${s1.winRate}%, Calmar=${s1.calmar}, Aug=+${s1.augR.toFixed(2)}R, Sep=+${s1.sepR.toFixed(2)}R, Oct=+${s1.octR.toFixed(2)}R, Nov=+${s1.novR.toFixed(2)}R, Tot=+${s1.totR.toFixed(2)}R`);

  const results = [];

  // Parameter space to explore
  const tests = [
    // 1. Faster Lookback BB (20 to 24)
    { bandLen: 22, bandMult: 2.1, tp: 14.0, sl: 13.75, emaOffset: 2.0, crashFilter: 1.25, sessionStart: 1, sessionEnd: 20, excludeH12: true, rsiLong: 52, rsiShort: 50 },
    { bandLen: 24, bandMult: 2.1, tp: 14.0, sl: 13.75, emaOffset: 3.0, crashFilter: 1.25, sessionStart: 1, sessionEnd: 20, excludeH12: true, rsiLong: 52, rsiShort: 50 },
    { bandLen: 26, bandMult: 2.1, tp: 14.0, sl: 13.75, emaOffset: 3.0, crashFilter: 1.25, sessionStart: 1, sessionEnd: 20, excludeH12: true, rsiLong: 52, rsiShort: 50 },

    // 2. Different Sessions (London Focus 06 to 20, or 06 to 18)
    { bandLen: 26, bandMult: 2.1, tp: 14.0, sl: 13.75, emaOffset: 3.0, crashFilter: 1.25, sessionStart: 6, sessionEnd: 20, excludeH12: false, rsiLong: 52, rsiShort: 50 },
    { bandLen: 28, bandMult: 2.1, tp: 14.0, sl: 13.75, emaOffset: 3.0, crashFilter: 1.25, sessionStart: 6, sessionEnd: 20, excludeH12: false, rsiLong: 52, rsiShort: 50 },
    { bandLen: 28, bandMult: 2.1, tp: 14.0, sl: 13.75, emaOffset: 2.0, crashFilter: 1.25, sessionStart: 6, sessionEnd: 18, excludeH12: true, rsiLong: 52, rsiShort: 50 },

    // 3. Lookback with Wick Filter (from 3.txt Apex)
    { bandLen: 28, bandMult: 2.1, tp: 14.0, sl: 13.75, emaOffset: 2.0, crashFilter: 1.25, sessionStart: 1, sessionEnd: 20, excludeH12: true, rsiLong: 52, rsiShort: 50, useWick: true, wickRatio: 0.15 },
    { bandLen: 26, bandMult: 2.15, tp: 14.0, sl: 13.75, emaOffset: 2.5, crashFilter: 1.25, sessionStart: 1, sessionEnd: 20, excludeH12: true, rsiLong: 52, rsiShort: 50, useWick: true, wickRatio: 0.15 },

    // 4. Keltner Channels with 1.8 - 2.0 ATR
    { useKeltner: true, bandLen: 20, bandMult: 1.8, tp: 14.0, sl: 13.75, emaOffset: 2.0, crashFilter: 1.25, sessionStart: 1, sessionEnd: 20, excludeH12: true, rsiLong: 52, rsiShort: 50 },
    { useKeltner: true, bandLen: 24, bandMult: 1.9, tp: 14.0, sl: 13.75, emaOffset: 2.0, crashFilter: 1.25, sessionStart: 1, sessionEnd: 20, excludeH12: true, rsiLong: 52, rsiShort: 50 },

    // 5. Slightly higher TP (15.0 or 16.0) with tighter offset
    { bandLen: 24, bandMult: 2.15, tp: 15.0, sl: 13.75, emaOffset: 3.0, crashFilter: 1.25, sessionStart: 1, sessionEnd: 20, excludeH12: true, rsiLong: 52, rsiShort: 50 },
    { bandLen: 26, bandMult: 2.15, tp: 15.0, sl: 13.75, emaOffset: 3.5, crashFilter: 1.25, sessionStart: 1, sessionEnd: 20, excludeH12: true, rsiLong: 52, rsiShort: 50 }
  ];

  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    const script = generateScript(`Cand_${i + 1}`, t);
    const r = await testPineCode(script, `Candidate_${i + 1}`);
    if (r) {
      // Calculate overlap with S1
      let shared = 0;
      for (const trade of r.tradesList) {
        if (s1.tradesList.some(s1t => Math.abs(s1t.entryTime - trade.entryTime) <= 45 * 60 * 1000)) {
          shared++;
        }
      }
      const jaccard = (shared / (r.trades + s1.trades - shared)) * 100;
      r.params = t;
      r.sharedWithS1 = shared;
      r.jaccard = jaccard;
      results.push(r);

      console.log(`\n[#${i + 1}] Trades=${r.trades} | WR=${r.winRate}% | Calmar=${r.calmar} | Net=$${r.netProfit} | DD=$${r.maxDD}`);
      console.log(`     Monthly: Aug=+${r.augR.toFixed(2)}R | Sep=+${r.sepR.toFixed(2)}R | Oct=+${r.octR.toFixed(2)}R | Nov=+${r.novR.toFixed(2)}R | Tot=+${r.totR.toFixed(2)}R`);
      console.log(`     S1 Overlap: ${shared}/${r.trades} trades (${jaccard.toFixed(1)}% Jaccard)`);
    }
  }

  fs.writeFileSync('high_r_candidates.json', JSON.stringify(results, null, 2));
}

run().catch(console.error);

