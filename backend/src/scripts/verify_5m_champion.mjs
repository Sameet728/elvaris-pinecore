import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));
const code = fs.readFileSync('pine_scripts/Champion_5M_Pure_Sovereign_STRATEGY.pine', 'utf8');

async function verify() {
  const p = new PineTS(candles, 'XAUUSD', '5');
  await p.ready();
  const res = await p.run(code);
  const s = res.strategy;
  const trades = s.closedtrades || [];
  const wins = trades.filter(t => t.profit > 0);
  const losses = trades.filter(t => t.profit <= 0);

  console.log('\n=== 5M PURE SOVEREIGN STRATEGY RESULTS ===');
  console.log(`Total Trades: ${trades.length}`);
  console.log(`Wins: ${wins.length} | Losses: ${losses.length}`);
  console.log(`Win Rate: ${trades.length > 0 ? ((wins.length / trades.length) * 100).toFixed(1) + '%' : '0%'}`);
  console.log(`Net Profit: $${s.netprofit.toFixed(2)}`);
  console.log(`Max Drawdown: $${s.max_drawdown?.toFixed(2)} (${(s.max_drawdown_percent_value * 100).toFixed(2)}%)`);
  
  const monthly = {};
  trades.forEach(t => {
    const d = new Date(t.entry_time);
    const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    monthly[mKey] = (monthly[mKey] || 0) + t.profit;
  });
  console.log('Monthly Profit Breakdown:', monthly);

  let maxLoss = 0;
  trades.forEach(t => {
    if (t.profit < 0 && Math.abs(t.profit) > maxLoss) maxLoss = Math.abs(t.profit);
  });
  console.log(`Worst Single Loss: -$${maxLoss.toFixed(2)}`);
}

verify().catch(console.error);
