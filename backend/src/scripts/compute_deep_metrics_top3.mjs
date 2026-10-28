import fs from 'fs';
import { PineTS } from 'pinets';

const data15M = JSON.parse(fs.readFileSync('data/btcusdt_15m_tv.json', 'utf8'));
const data1H = JSON.parse(fs.readFileSync('data/btcusdt_1h_tv.json', 'utf8'));

const p15 = new PineTS(data15M, 'BTCUSDT', '15');
const p1h = new PineTS(data1H, 'BTCUSDT', '60');
await Promise.all([p15.ready(), p1h.ready()]);

async function getDetailedMetrics(engine, filePath, slDist, timeframe) {
  const code = fs.readFileSync(filePath, 'utf8');
  const res = await engine.run(code);
  const trades = res.strategy.closedtrades || [];

  const wins = trades.filter(t => t.profit > 0);
  const losses = trades.filter(t => t.profit <= 0);

  const longTrades = trades.filter(t => t.size > 0);
  const longWins = longTrades.filter(t => t.profit > 0);
  const longLosses = longTrades.filter(t => t.profit <= 0);
  const longNet = longTrades.reduce((acc, t) => acc + t.profit, 0);

  const shortTrades = trades.filter(t => t.size < 0);
  const shortWins = shortTrades.filter(t => t.profit > 0);
  const shortLosses = shortTrades.filter(t => t.profit <= 0);
  const shortNet = shortTrades.reduce((acc, t) => acc + t.profit, 0);

  const net = res.strategy.netprofit || 0;
  const maxDD = res.strategy.max_drawdown || 1;
  const wr = (wins.length / trades.length) * 100;
  const netR = net / slDist;
  const maxDDR = maxDD / slDist;
  const calmar = netR / maxDDR;

  const grossProfit = wins.reduce((acc, t) => acc + t.profit, 0);
  const grossLoss = Math.abs(losses.reduce((acc, t) => acc + t.profit, 0));
  const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : grossProfit;

  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
  const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin;

  // Monthly breakdown
  const monthly = {};
  for (const t of trades) {
    const m = new Date(t.entry_time).toISOString().substring(0, 7);
    if (!monthly[m]) {
      monthly[m] = { trades: 0, wins: 0, losses: 0, net_usd: 0, net_r: 0 };
    }
    monthly[m].trades++;
    if (t.profit > 0) monthly[m].wins++; else monthly[m].losses++;
    monthly[m].net_usd += t.profit;
    monthly[m].net_r += (t.profit / slDist);
  }

  // Calculate Sharpe & Sortino
  const returnsR = trades.map(t => t.profit / slDist);
  const meanR = returnsR.reduce((a, b) => a + b, 0) / returnsR.length;
  const varR = returnsR.reduce((a, b) => a + Math.pow(b - meanR, 2), 0) / returnsR.length;
  const stdR = Math.sqrt(varR);
  const sharpe = stdR > 0 ? (meanR / stdR) * Math.sqrt(trades.length) : 0;

  const downReturns = returnsR.filter(r => r < 0);
  const downVar = downReturns.length > 0 ? downReturns.reduce((a, b) => a + Math.pow(b, 2), 0) / downReturns.length : 0;
  const downStd = Math.sqrt(downVar);
  const sortino = downStd > 0 ? (meanR / downStd) * Math.sqrt(trades.length) : 0;

  return {
    tradesCount: trades.length,
    winsCount: wins.length,
    lossesCount: losses.length,
    wr: Number(wr.toFixed(2)),
    netUsd: Number(net.toFixed(2)),
    netR: Number(netR.toFixed(2)),
    netPct: Number(((net / 100000) * 100).toFixed(2)),
    maxDDUsd: Number(maxDD.toFixed(2)),
    maxDDR: Number(maxDDR.toFixed(2)),
    maxDDPct: Number(((maxDD / 100000) * 100).toFixed(2)),
    profitFactor: Number(profitFactor.toFixed(2)),
    calmar: Number(calmar.toFixed(2)),
    sharpe: Number(sharpe.toFixed(2)),
    sortino: Number(sortino.toFixed(2)),
    avgWin: Number(avgWin.toFixed(2)),
    avgLoss: Number(avgLoss.toFixed(2)),
    payoffRatio: Number(payoffRatio.toFixed(2)),
    expectedValueR: Number(meanR.toFixed(3)),
    long: {
      trades: longTrades.length,
      wins: longWins.length,
      losses: longLosses.length,
      wr: longTrades.length > 0 ? Number(((longWins.length / longTrades.length) * 100).toFixed(1)) : 0,
      netUsd: Number(longNet.toFixed(2)),
      netR: Number((longNet / slDist).toFixed(2))
    },
    short: {
      trades: shortTrades.length,
      wins: shortWins.length,
      losses: shortLosses.length,
      wr: shortTrades.length > 0 ? Number(((shortWins.length / shortTrades.length) * 100).toFixed(1)) : 0,
      netUsd: Number(shortNet.toFixed(2)),
      netR: Number((shortNet / slDist).toFixed(2))
    },
    monthly
  };
}

const m1 = await getDetailedMetrics(p15, 'pine_scripts/Champion_BTC_15M_Grandmaster_STRATEGY.pine', 350.0, '15M');
const m2 = await getDetailedMetrics(p15, 'pine_scripts/Champion_BTC_15M_1to2RR_STRATEGY.pine', 300.0, '15M');
const m3 = await getDetailedMetrics(p1h, 'pine_scripts/Champion_BTC_1H_Macro_STRATEGY.pine', 1800.0, '1H');

fs.writeFileSync('data/deep_metrics_top3_btc.json', JSON.stringify({ m1, m2, m3 }, null, 2));
console.log('Deep metrics computed and saved to data/deep_metrics_top3_btc.json');
