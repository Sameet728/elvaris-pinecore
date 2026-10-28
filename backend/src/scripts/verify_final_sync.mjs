import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

// Test synchronized strategy and verify trade list
async function verify() {
  const code = fs.readFileSync('pine_scripts/Champion_5M_200Pip_Sovereign_STRATEGY.pine', 'utf8');
  const p = new PineTS(candles, 'XAUUSD', '5');
  await p.ready();
  const res = await p.run(code);
  const s = res.strategy;
  const trades = s.closedtrades || [];
  const wins = trades.filter(t => t.profit > 0);
  const losses = trades.filter(t => t.profit <= 0);

  console.log('Current Champion_5M_200Pip_Sovereign_STRATEGY results:');
  console.log(`Total trades: ${trades.length}`);
  console.log(`Wins: ${wins.length} | Losses: ${losses.length}`);
  console.log(`Win Rate: ${trades.length > 0 ? ((wins.length / trades.length) * 100).toFixed(1) + '%' : 'N/A'}`);
  console.log(`Net Profit: $${s.netprofit.toFixed(2)}`);
  console.log(`Max Drawdown: $${s.max_drawdown?.toFixed(2)} (${(s.max_drawdown_percent_value * 100).toFixed(2)}%)`);
}

verify().catch(console.error);
