import fs from 'fs';

// Load Daily datasets
const btcDaily = JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_daily.json', 'utf8'));
const goldDaily = JSON.parse(fs.readFileSync('quant_seasonality/data/xauusd_daily.json', 'utf8'));

console.log('========================================================================');
console.log('       QUANTITATIVE RESEARCH: DAY-OF-WEEK SEASONALITY ANOMALIES         ');
console.log('========================================================================');
console.log(`BTC Daily: ${btcDaily.length} bars (${new Date(btcDaily[0].time).toISOString().substring(0, 10)} to ${new Date(btcDaily[btcDaily.length - 1].time).toISOString().substring(0, 10)})`);
console.log(`Gold Daily: ${goldDaily.length} bars (${new Date(goldDaily[0].time).toISOString().substring(0, 10)} to ${new Date(goldDaily[goldDaily.length - 1].time).toISOString().substring(0, 10)})`);

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function analyzeSingleDays(bars, symbol) {
  console.log(`\n------------------------------------------------------------------------`);
  console.log(`  1. SINGLE-DAY HOLD ANALYSIS FOR ${symbol} (Buy Open -> Sell Close)`);
  console.log(`------------------------------------------------------------------------`);

  const dayStats = {};
  for (let d = 0; d < 7; d++) {
    dayStats[d] = {
      name: dayNames[d],
      trades: 0,
      wins: 0,
      losses: 0,
      returns: [],
      cumReturnPct: 0,
      equityCurve: [100],
      peak: 100,
      maxDD: 0
    };
  }

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const d = new Date(bar.time).getUTCDay();
    const retPct = ((bar.close - bar.open) / bar.open) * 100;

    const s = dayStats[d];
    s.trades++;
    if (retPct > 0) s.wins++;
    else if (retPct < 0) s.losses++;
    s.returns.push(retPct);

    // Compounded equity
    const prevEq = s.equityCurve[s.equityCurve.length - 1];
    const newEq = prevEq * (1 + retPct / 100);
    s.equityCurve.push(newEq);
    if (newEq > s.peak) s.peak = newEq;
    const dd = ((s.peak - newEq) / s.peak) * 100;
    if (dd > s.maxDD) s.maxDD = dd;
  }

  console.log(`Day\t\tTrades\tWinRate\tAvgRet%\tTotalRet%\tMaxDD%\tProfitFactor\tSharpe`);
  console.log(`---------------------------------------------------------------------------------------`);

  const ranked = [];

  for (let d = 0; d < 7; d++) {
    const s = dayStats[d];
    if (s.trades === 0) continue;
    const wr = (s.wins / s.trades) * 100;
    const avgRet = s.returns.reduce((a, b) => a + b, 0) / s.trades;
    const totalRet = s.equityCurve[s.equityCurve.length - 1] - 100;

    const grossWin = s.returns.filter(r => r > 0).reduce((a, b) => a + b, 0);
    const grossLoss = Math.abs(s.returns.filter(r => r < 0).reduce((a, b) => a + b, 0));
    const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin;

    const mean = avgRet;
    const variance = s.returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / s.trades;
    const stdDev = Math.sqrt(variance);
    const sharpe = stdDev > 0 ? (mean / stdDev) * Math.sqrt(52) : 0; // annualized for 52 weeks

    ranked.push({ day: s.name, dayNum: d, trades: s.trades, wr, avgRet, totalRet, maxDD: s.maxDD, pf, sharpe });

    console.log(`${s.name.padEnd(10)}\t${s.trades}\t${wr.toFixed(1)}%\t${avgRet >= 0 ? '+' : ''}${avgRet.toFixed(2)}%\t${totalRet >= 0 ? '+' : ''}${totalRet.toFixed(1)}%\t${s.maxDD.toFixed(1)}%\t${pf.toFixed(2)}\t\t${sharpe.toFixed(2)}`);
  }

  return ranked;
}

function analyzeMultiDayHolding(bars, symbol) {
  console.log(`\n------------------------------------------------------------------------`);
  console.log(`  2. MULTI-DAY & WEEKEND ANOMALY CLUSTERS FOR ${symbol}`);
  console.log(`------------------------------------------------------------------------`);

  // Anomaly Clustered Strategies:
  // 1. "Turnaround Tuesday" -> Buy Monday Close, Sell Wednesday Close (Hold Tue-Wed)
  // 2. "Mid-Week Momentum"  -> Buy Tuesday Close, Sell Thursday Close
  // 3. "Weekend Long"       -> Buy Friday Close, Sell Monday Open
  // 4. "Weekend Short"      -> Sell Friday Close, Buy Monday Open
  // 5. "Weekday-Only Long"  -> Buy Monday Open, Sell Friday Close
  // 6. "Monday Reversal"    -> Buy Sunday Close / Monday Open, Sell Monday Close

  const strategies = [
    {
      name: "Turnaround Tuesday (Buy Mon Close -> Sell Wed Close)",
      test: (bars, i) => {
        const d = new Date(bars[i].time).getUTCDay();
        if (d === 1 && i + 2 < bars.length) { // Monday
          const entryPrice = bars[i].close;
          const exitPrice = bars[i + 2].close; // Wednesday close
          return ((exitPrice - entryPrice) / entryPrice) * 100;
        }
        return null;
      }
    },
    {
      name: "Mid-Week Thrust (Buy Tue Close -> Sell Thu Close)",
      test: (bars, i) => {
        const d = new Date(bars[i].time).getUTCDay();
        if (d === 2 && i + 2 < bars.length) { // Tuesday
          const entryPrice = bars[i].close;
          const exitPrice = bars[i + 2].close; // Thursday close
          return ((exitPrice - entryPrice) / entryPrice) * 100;
        }
        return null;
      }
    },
    {
      name: "Weekend Long (Buy Fri Close -> Sell Mon Close)",
      test: (bars, i) => {
        const d = new Date(bars[i].time).getUTCDay();
        if (d === 5) { // Friday
          // Find next Monday or Sunday
          let nextIdx = -1;
          for (let j = 1; j <= 4 && i + j < bars.length; j++) {
            const nextD = new Date(bars[i + j].time).getUTCDay();
            if (nextD === 1 || (symbol.includes('XAU') && nextD === 1)) {
              nextIdx = i + j;
              break;
            }
          }
          if (nextIdx !== -1) {
            const entryPrice = bars[i].close;
            const exitPrice = bars[nextIdx].close;
            return ((exitPrice - entryPrice) / entryPrice) * 100;
          }
        }
        return null;
      }
    },
    {
      name: "Weekend Short (Sell Fri Close -> Buy Mon Close)",
      test: (bars, i) => {
        const d = new Date(bars[i].time).getUTCDay();
        if (d === 5) { // Friday
          let nextIdx = -1;
          for (let j = 1; j <= 4 && i + j < bars.length; j++) {
            const nextD = new Date(bars[i + j].time).getUTCDay();
            if (nextD === 1) { nextIdx = i + j; break; }
          }
          if (nextIdx !== -1) {
            const entryPrice = bars[i].close;
            const exitPrice = bars[nextIdx].close;
            return ((entryPrice - exitPrice) / entryPrice) * 100; // Inverted for short
          }
        }
        return null;
      }
    },
    {
      name: "Weekday Pure Long (Buy Mon Open -> Sell Fri Close)",
      test: (bars, i) => {
        const d = new Date(bars[i].time).getUTCDay();
        if (d === 1) { // Monday
          let friIdx = -1;
          for (let j = 1; j <= 5 && i + j < bars.length; j++) {
            const nextD = new Date(bars[i + j].time).getUTCDay();
            if (nextD === 5) { friIdx = i + j; break; }
          }
          if (friIdx !== -1) {
            const entryPrice = bars[i].open;
            const exitPrice = bars[friIdx].close;
            return ((exitPrice - entryPrice) / entryPrice) * 100;
          }
        }
        return null;
      }
    }
  ];

  console.log(`Strategy Name\t\t\t\t\tTrades\tWinRate\tTotalRet%\tMaxDD%\tPF\tSharpe`);
  console.log(`---------------------------------------------------------------------------------------------------`);

  const results = [];

  for (const strat of strategies) {
    const returns = [];
    let eq = 100;
    let peak = 100;
    let maxDD = 0;

    for (let i = 0; i < bars.length; i++) {
      const ret = strat.test(bars, i);
      if (ret !== null) {
        returns.push(ret);
        eq = eq * (1 + ret / 100);
        if (eq > peak) peak = eq;
        const dd = ((peak - eq) / peak) * 100;
        if (dd > maxDD) maxDD = dd;
      }
    }

    if (returns.length === 0) continue;
    const wins = returns.filter(r => r > 0).length;
    const wr = (wins / returns.length) * 100;
    const totalRet = eq - 100;

    const grossWin = returns.filter(r => r > 0).reduce((a, b) => a + b, 0);
    const grossLoss = Math.abs(returns.filter(r => r < 0).reduce((a, b) => a + b, 0));
    const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin;

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const sharpe = stdDev > 0 ? (mean / stdDev) * Math.sqrt(52) : 0;

    results.push({ name: strat.name, trades: returns.length, wr, totalRet, maxDD, pf, sharpe });

    console.log(`${strat.name.padEnd(45)}\t${returns.length}\t${wr.toFixed(1)}%\t${totalRet >= 0 ? '+' : ''}${totalRet.toFixed(1)}%\t${maxDD.toFixed(1)}%\t${pf.toFixed(2)}\t${sharpe.toFixed(2)}`);
  }

  return results;
}

const btcSingle = analyzeSingleDays(btcDaily, 'BITCOIN (BINANCE:BTCUSDT)');
const btcMulti = analyzeMultiDayHolding(btcDaily, 'BITCOIN (BINANCE:BTCUSDT)');

const goldSingle = analyzeSingleDays(goldDaily, 'GOLD (FOREXCOM:XAUUSD)');
const goldMulti = analyzeMultiDayHolding(goldDaily, 'GOLD (FOREXCOM:XAUUSD)');

fs.writeFileSync('quant_seasonality/data/day_of_week_results.json', JSON.stringify({
  btcSingle, btcMulti, goldSingle, goldMulti
}, null, 2));

console.log('\nDay-of-Week Seasonality analysis saved to quant_seasonality/data/day_of_week_results.json');
