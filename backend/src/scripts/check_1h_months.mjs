import fs from 'fs';
import { PineTS } from 'pinets';

async function check1H() {
  const candles = JSON.parse(fs.readFileSync('data/xauusd_1h_tv.json', 'utf8'));
  const code = fs.readFileSync('pine_scripts/Champion_1H_Pure_Sovereign_STRATEGY.pine', 'utf8');
  const p = new PineTS(candles, 'XAUUSD', '60');
  await p.ready();
  const res = await p.run(code);
  const trades = res.strategy.closedtrades || [];

  console.log(`Total 1H Trades: ${trades.length}`);
  const wins = trades.filter(t => t.profit > 0);
  const losses = trades.filter(t => t.profit <= 0);
  console.log(`Wins: ${wins.length} | Losses: ${losses.length} | Win Rate: ${(wins.length / trades.length * 100).toFixed(2)}%`);
  console.log(`Net Profit: $${res.strategy.netprofit.toFixed(2)}`);

  const monthlyTrades = {};
  const monthlyProfit = {};

  for (const t of trades) {
    const d = new Date(t.entry_time);
    const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    monthlyTrades[m] = (monthlyTrades[m] || 0) + 1;
    monthlyProfit[m] = (monthlyProfit[m] || 0) + t.profit;
  }

  console.log(`Monthly Trades:`, monthlyTrades);
  console.log(`Monthly Profit ($):`, monthlyProfit);
}

check1H().catch(console.error);
