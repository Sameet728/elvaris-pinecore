import fs from 'fs';

const btc4H = JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_4h.json', 'utf8'));
const gold4H = JSON.parse(fs.readFileSync('quant_seasonality/data/xauusd_4h.json', 'utf8'));

console.log('========================================================================');
console.log('   QUANTITATIVE RESEARCH: INTRADAY SESSION & DAY VS NIGHT ANOMALIES     ');
console.log('========================================================================');
console.log(`BTC 4H: ${btc4H.length} bars (${new Date(btc4H[0].time).toISOString().substring(0, 10)} to ${new Date(btc4H[btc4H.length - 1].time).toISOString().substring(0, 10)})`);
console.log(`Gold 4H: ${gold4H.length} bars (${new Date(gold4H[0].time).toISOString().substring(0, 10)} to ${new Date(gold4H[gold4H.length - 1].time).toISOString().substring(0, 10)})`);

function analyzeIndividual4HBars(bars, symbol) {
  console.log(`\n------------------------------------------------------------------------`);
  console.log(`  1. 4-HOUR BAR PROFILE BY UTC TIME FOR ${symbol}`);
  console.log(`------------------------------------------------------------------------`);

  const uniqueHours = Array.from(new Set(bars.map(b => new Date(b.time).getUTCHours()))).sort((a, b) => a - b);
  const hourStats = {};
  for (const h of uniqueHours) {
    hourStats[h] = { hour: h, trades: 0, wins: 0, losses: 0, returns: [], eq: [100], peak: 100, maxDD: 0 };
  }

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const h = new Date(bar.time).getUTCHours();
    if (hourStats[h] === undefined) continue;

    const retPct = ((bar.close - bar.open) / bar.open) * 100;
    const s = hourStats[h];
    s.trades++;
    if (retPct > 0) s.wins++;
    else if (retPct < 0) s.losses++;
    s.returns.push(retPct);

    const prevEq = s.eq[s.eq.length - 1];
    const newEq = prevEq * (1 + retPct / 100);
    s.eq.push(newEq);
    if (newEq > s.peak) s.peak = newEq;
    const dd = ((s.peak - newEq) / s.peak) * 100;
    if (dd > s.maxDD) s.maxDD = dd;
  }

  console.log(`UTC Hour\tSession Region\t\tTrades\tWinRate\tAvgRet%\tTotalRet%\tMaxDD%\tPF\tSharpe`);
  console.log(`-------------------------------------------------------------------------------------------------------`);

  const sessionNames = {
    0: 'Asia Early (00-04 UTC)',
    3: 'Asia Mid (03-07 UTC)',
    4: 'Asia Late (04-08 UTC)',
    7: 'London Open (07-11 UTC)',
    8: 'London Open (08-12 UTC)',
    11: 'London/NY Overlap (11-15 UTC)',
    12: 'London/NY Overlap (12-16 UTC)',
    15: 'NY Afternoon (15-19 UTC)',
    16: 'NY Afternoon (16-20 UTC)',
    19: 'US Close (19-23 UTC)',
    20: 'US Close / Overnight (20-24 UTC)',
    23: 'Overnight Asia Open (23-03 UTC)'
  };

  const ranked = [];

  for (const h of uniqueHours) {
    const s = hourStats[h];
    if (s.trades === 0) continue;
    const wr = (s.wins / s.trades) * 100;
    const avgRet = s.returns.reduce((a, b) => a + b, 0) / s.trades;
    const totalRet = s.eq[s.eq.length - 1] - 100;

    const grossWin = s.returns.filter(r => r > 0).reduce((a, b) => a + b, 0);
    const grossLoss = Math.abs(s.returns.filter(r => r < 0).reduce((a, b) => a + b, 0));
    const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin;

    const mean = avgRet;
    const variance = s.returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / s.trades;
    const stdDev = Math.sqrt(variance);
    const sharpe = stdDev > 0 ? (mean / stdDev) * Math.sqrt(365 * (symbol.includes('XAU') ? 250/365 : 1)) : 0;

    const sName = sessionNames[h] || `Hour ${h}:00 UTC`;
    ranked.push({ hour: h, session: sName, trades: s.trades, wr, avgRet, totalRet, maxDD: s.maxDD, pf, sharpe });

    console.log(`${String(h).padStart(2, '0')}:00 UTC\t${sName.padEnd(25)}\t${s.trades}\t${wr.toFixed(1)}%\t${avgRet >= 0 ? '+' : ''}${avgRet.toFixed(3)}%\t${totalRet >= 0 ? '+' : ''}${totalRet.toFixed(1)}%\t${s.maxDD.toFixed(1)}%\t${pf.toFixed(2)}\t${sharpe.toFixed(2)}`);
  }

  return ranked;
}

function analyzeDayVsNightClusters(bars, symbol) {
  console.log(`\n------------------------------------------------------------------------`);
  console.log(`  2. DAY VS NIGHT STRATEGY CLUSTERS FOR ${symbol}`);
  console.log(`------------------------------------------------------------------------`);

  const isGold = symbol.includes('XAU');
  // BTC: London/NY Day is 08:00 to 20:00 UTC, Overnight is 20:00 to 08:00 UTC
  // Gold: London/NY Day is 07:00 to 19:00 UTC, Overnight is 19:00 to 07:00 UTC
  const dayStartH = isGold ? 7 : 8;
  const nightStartH = isGold ? 19 : 20;

  const clusters = [
    {
      name: `Buy Day, Sell Night (${dayStartH}:00 -> ${nightStartH}:00 UTC Long)`,
      eval: (bars, i) => {
        const h = new Date(bars[i].time).getUTCHours();
        if (h === dayStartH && i + 2 < bars.length) {
          const entry = bars[i].open;
          const exit = bars[i + 2].close;
          return ((exit - entry) / entry) * 100;
        }
        return null;
      }
    },
    {
      name: `Buy Night, Sell Day (${nightStartH}:00 -> ${dayStartH}:00 UTC Overnight Long)`,
      eval: (bars, i) => {
        const h = new Date(bars[i].time).getUTCHours();
        if (h === nightStartH && i + 2 < bars.length) {
          const entry = bars[i].open;
          const exit = bars[i + 2].close;
          return ((exit - entry) / entry) * 100;
        }
        return null;
      }
    },
    {
      name: `Short Day, Long Night (Short ${dayStartH}-${nightStartH}, Long ${nightStartH}-${dayStartH})`,
      eval: (bars, i) => {
        const h = new Date(bars[i].time).getUTCHours();
        if (h === dayStartH && i + 2 < bars.length) {
          const entry = bars[i].open;
          const exit = bars[i + 2].close;
          return ((entry - exit) / entry) * 100; // Short
        }
        if (h === nightStartH && i + 2 < bars.length) {
          const entry = bars[i].open;
          const exit = bars[i + 2].close;
          return ((exit - entry) / entry) * 100; // Long
        }
        return null;
      }
    },
    {
      name: `Long Day, Short Night (Long ${dayStartH}-${nightStartH}, Short ${nightStartH}-${dayStartH})`,
      eval: (bars, i) => {
        const h = new Date(bars[i].time).getUTCHours();
        if (h === dayStartH && i + 2 < bars.length) {
          const entry = bars[i].open;
          const exit = bars[i + 2].close;
          return ((exit - entry) / entry) * 100; // Long
        }
        if (h === nightStartH && i + 2 < bars.length) {
          const entry = bars[i].open;
          const exit = bars[i + 2].close;
          return ((entry - exit) / entry) * 100; // Short
        }
        return null;
      }
    }
  ];

  console.log(`Cluster Strategy\t\t\t\t\tTrades\tWinRate\tTotalRet%\tMaxDD%\tPF\tSharpe`);
  console.log(`---------------------------------------------------------------------------------------------------`);

  const results = [];

  for (const c of clusters) {
    const returns = [];
    let eq = 100;
    let peak = 100;
    let maxDD = 0;

    for (let i = 0; i < bars.length; i++) {
      const ret = c.eval(bars, i);
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
    const sharpe = stdDev > 0 ? (mean / stdDev) * Math.sqrt(365) : 0;

    results.push({ name: c.name, trades: returns.length, wr, totalRet, maxDD, pf, sharpe });

    console.log(`${c.name.padEnd(45)}\t${returns.length}\t${wr.toFixed(1)}%\t${totalRet >= 0 ? '+' : ''}${totalRet.toFixed(1)}%\t${maxDD.toFixed(1)}%\t${pf.toFixed(2)}\t${sharpe.toFixed(2)}`);
  }

  return results;
}

const btcBars = analyzeIndividual4HBars(btc4H, 'BITCOIN (BINANCE:BTCUSDT)');
const btcClusters = analyzeDayVsNightClusters(btc4H, 'BITCOIN (BINANCE:BTCUSDT)');

const goldBars = analyzeIndividual4HBars(gold4H, 'GOLD (FOREXCOM:XAUUSD)');
const goldClusters = analyzeDayVsNightClusters(gold4H, 'GOLD (FOREXCOM:XAUUSD)');

fs.writeFileSync('quant_seasonality/data/day_vs_night_results.json', JSON.stringify({
  btcBars, btcClusters, goldBars, goldClusters
}, null, 2));

console.log('\nDay vs Night & Session analysis saved to quant_seasonality/data/day_vs_night_results.json');
