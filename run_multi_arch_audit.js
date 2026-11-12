const fs = require('fs');
const { PineTS } = require('./pine-backtester-nextjs/node_modules/pinets');

const rawCandles = JSON.parse(fs.readFileSync('pine-backtester-nextjs/public/data/xauusd_15m.json', 'utf8'));
const pineCandles = rawCandles.map(c => ({
  open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
  openTime: c.openTime, closeTime: c.openTime + 15 * 60000
}));

const champions = [
  { id: 'PS-01', name: 'Grandmaster Dual 10R / 8R', file: 'Champion_15M_Grandmaster_Dual10R_Oct8R_STRATEGY.pine', arch: 'Bollinger Bands (SMA 28 + 2.1 StDev) + Donchian + EMA 50/200' },
  { id: 'PS-02', name: 'Keltner Channel Volatility Expansion', file: 'Champion_15M_Keltner_ATR_STRATEGY.pine', arch: 'Keltner Channels (EMA 20 Center + 1.8 ATR 14 Envelope) + Macro EMA 200' },
  { id: 'PS-03', name: 'Dual-EMA Dynamic Volatility Envelope', file: 'Champion_15M_DualEMA_Envelope_STRATEGY.pine', arch: 'Dual-EMA Dynamic Envelope (EMA 50 Center + 1.65 ATR Channel) + Macro EMA 200' },
  { id: 'PS-04', name: 'London Keltner Volatility Scalper', file: 'Champion_15M_London_Keltner_STRATEGY.pine', arch: 'London Open Keltner (EMA 15 + 2.0 ATR Envelope, 03:00 - 14:00 UTC)' },
  { id: 'PS-05', name: 'NY Afternoon Momentum Reversal', file: 'Champion_15M_NY_Afternoon_STRATEGY.pine', arch: 'NY Afternoon Reversal (30 SMA + 2.0 StDev + Macro EMA 200, 15:00 - 22:00 UTC)' }
];

async function runPortfolioAudit() {
  const allResults = [];

  for (const c of champions) {
    let code = fs.readFileSync('15M_Champion_Strategies/' + c.file, 'utf8')
      .replace(/var table perfTable[\s\S]*?plot\(ema50/m, 'plot(ema50')
      .replace(/if showPositionBoxes[\s\S]*?var table/m, 'var table');

    const pts = new PineTS(pineCandles, 'FOREXCOM:XAUUSD', '15');
    await pts.ready();
    const res = await pts.run(code);
    const trades = res.strategy?.closedtrades || [];
    const wins = trades.filter(t => t.profit > 0).length;
    const losses = trades.length - wins;
    const wr = (wins / trades.length * 100);
    const net = trades.reduce((a, b) => a + b.profit, 0);

    let peak = 0, maxDd = 0, eq = 0;
    let mReturns = { 7: 0, 8: 0, 9: 0, 10: 0 };
    let gp = 0, gl = 0;

    for (const t of trades) {
      eq += t.profit;
      if (eq > peak) peak = eq;
      const dd = peak - eq;
      if (dd > maxDd) maxDd = dd;
      if (t.profit > 0) gp += t.profit; else gl += Math.abs(t.profit);

      const m = new Date(t.entry_time || t.entryTime).getUTCMonth();
      const r = t.profit / 13.75;
      if (mReturns[m] !== undefined) mReturns[m] += r;
    }

    const pf = gl === 0 ? 99 : (gp / gl);
    const calmar = maxDd === 0 ? 99 : (net / maxDd);
    const totalR = net / 13.75;

    allResults.push({
      id: c.id,
      name: c.name,
      file: c.file,
      arch: c.arch,
      tradesCount: trades.length,
      wins,
      losses,
      wr,
      net,
      totalR,
      pf,
      maxDd,
      calmar,
      mReturns,
      trades
    });
  }

  console.log('=== VERIFIED INSTITUTIONAL MULTI-ARCHITECTURE PERFORMANCE ===\n');
  console.table(allResults.map(r => ({
    ID: r.id,
    Name: r.name,
    Arch: r.arch.substring(0, 32) + '...',
    Trades: r.tradesCount,
    'Wins/Loss': r.wins + ' / ' + r.losses,
    'Win Rate': r.wr.toFixed(1) + '%',
    'Net ($)': '$' + r.net.toFixed(2),
    'Net (R)': '+' + r.totalR.toFixed(2) + 'R',
    PF: r.pf.toFixed(2),
    MaxDD: '$' + r.maxDd.toFixed(2),
    Calmar: r.calmar.toFixed(2),
    'Aug(R)': '+' + r.mReturns[7].toFixed(1) + 'R',
    'Sep(R)': '+' + r.mReturns[8].toFixed(1) + 'R',
    'Oct(R)': '+' + r.mReturns[9].toFixed(1) + 'R',
    'Nov(R)': '+' + r.mReturns[10].toFixed(1) + 'R'
  })));

  // Pairwise overlap matrix
  console.log('\n=== PAIRWISE TRADE OVERLAP MATRIX ===');
  for (let i = 0; i < allResults.length; i++) {
    for (let j = i + 1; j < allResults.length; j++) {
      const a = allResults[i];
      const b = allResults[j];
      const timesA = new Set(a.trades.map(t => t.entry_time || t.entryTime));
      let shared = 0;
      for (const t of b.trades) {
        if (timesA.has(t.entry_time || t.entryTime)) shared++;
      }
      const pctA = ((a.tradesCount - shared) / a.tradesCount * 100).toFixed(1);
      const pctB = ((b.tradesCount - shared) / b.tradesCount * 100).toFixed(1);
      console.log(a.id + ' vs ' + b.id + ': ' + shared + ' shared trades (' + pctA + '% unique for ' + a.id + ', ' + pctB + '% unique for ' + b.id + ')');
    }
  }

  fs.writeFileSync('C:/Users/samee/Desktop/Pine/verified_multi_arch_results.json', JSON.stringify(allResults, null, 2), 'utf8');
}

runPortfolioAudit();
