const fs = require('fs');

async function testCandidate(scriptText, label) {
  const res = await fetch('http://127.0.0.1:3005/api/backtest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script: scriptText, datasetName: 'xauusd_15m', symbol: 'FOREXCOM:XAUUSD', timeframe: '15' })
  });
  const d = await res.json();
  if (!d.success) return null;
  const m = d.result.metrics;
  const trades = d.result.trades;

  // Monthly R breakdown
  const months = {};
  for (const t of trades) {
    const dt = new Date(t.entryTime);
    const mKey = dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0');
    if (!months[mKey]) months[mKey] = { trades: 0, wins: 0, r: 0, cash: 0 };
    months[mKey].trades++;
    const pnl = t.pnl ?? t.profitCash ?? 0;
    if (pnl > 0) months[mKey].wins++;
    const slDist = Math.abs(t.entryPrice - t.stopLoss);
    const r = slDist > 0 ? (pnl / slDist) : 0;
    months[mKey].r += r;
    months[mKey].cash += pnl;
  }

  const augR = months['2026-08']?.r || 0;
  const sepR = months['2026-09']?.r || 0;
  const octR = months['2026-10']?.r || 0;
  const novR = months['2026-11']?.r || 0;
  const totR = augR + sepR + octR + novR;

  return {
    label,
    trades: trades.length,
    winRate: m.winRate,
    calmar: m.calmarRatio,
    netProfit: m.netProfitCash,
    maxDD: m.maxDrawdownCash,
    augR, sepR, octR, novR, totR,
    tradesList: trades
  };
}

// Let's test Apex 88WR (3.txt) with various presets & crash filter
async function runApexSweep() {
  const baseApex = fs.readFileSync('MyPine/3.txt', 'utf8');
  console.log('--- Testing Apex 88WR Variations ---');

  for (let tp of [15.0, 16.0, 17.0, 18.0]) {
    for (let sl of [13.5, 13.75, 14.0]) {
      for (let crash of [0.0, 1.0, 1.25]) {
        for (let breaker of [false, true]) {
          let code = baseApex;
          code = code.replace(/tpDistInput  = input\.float\(17\.0/g, `tpDistInput  = input.float(${tp.toFixed(1)}`);
          code = code.replace(/slDistInput  = input\.float\(14\.0/g, `slDistInput  = input.float(${sl.toFixed(2)}`);

          if (crash > 0 || breaker) {
            const addCode = `
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

canTradeToday = ${breaker ? 'dayLossCount < 1 and dayTradeCount < 2' : 'true'}
passCrash = ${crash > 0 ? `close >= (ema50 - ${crash} * atr)` : 'true'}
`;
            code = code.replace('// ─── Institutional Session Guard', addCode + '\n// ─── Institutional Session Guard');
            code = code.replace(/longSig = inActiveSession and /g, 'longSig = inActiveSession and canTradeToday and passCrash and ');
            code = code.replace(/shortSig = inActiveSession and /g, 'shortSig = inActiveSession and canTradeToday and ');
          }

          const res = await testCandidate(code, `Apex_TP${tp}_SL${sl}_Crash${crash}_Breaker${breaker}`);
          if (res && res.winRate >= 80.0 && res.calmar >= 4.0) {
            console.log(`[MATCH] ${res.label} | Trades: ${res.trades} | WR: ${res.winRate}% | Calmar: ${res.calmar}`);
            console.log(`   Aug: +${res.augR.toFixed(2)}R | Sep: +${res.sepR.toFixed(2)}R | Oct: +${res.octR.toFixed(2)}R | Nov: +${res.novR.toFixed(2)}R | Tot: +${res.totR.toFixed(2)}R`);
          }
        }
      }
    }
  }
}

runApexSweep().catch(console.error);

