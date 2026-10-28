import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_1h_tv.json', 'utf8'));
const code = fs.readFileSync('pine_scripts/Champion_1H_Pure_Sovereign_STRATEGY.pine', 'utf8');

async function verify() {
  const p = new PineTS(candles, 'XAUUSD', '60');
  await p.ready();
  const res = await p.run(code);
  const s = res.strategy;
  const trades = s.closedtrades || [];
  const wins = trades.filter(t => t.profit > 0);
  const losses = trades.filter(t => t.profit <= 0);

  console.log('\n=== 1H PURE SOVEREIGN STRATEGY RESULTS ===');
  console.log(`Total Trades: ${trades.length}`);
  console.log(`Wins: ${wins.length} | Losses: ${losses.length}`);
  console.log(`Win Rate: ${trades.length > 0 ? ((wins.length / trades.length) * 100).toFixed(1) + '%' : '0%'}`);
  console.log(`Net Profit: $${s.netprofit.toFixed(2)}`);
  console.log(`Max Drawdown: $${s.max_drawdown?.toFixed(2)} (${(s.max_drawdown_percent_value * 100).toFixed(2)}%)`);
  
  console.log('\n--- TRADE LOG ---');
  trades.forEach((t, i) => {
    const d = new Date(t.entry_time);
    console.log(`Trade #${i+1} | ${d.toISOString().substring(0, 16)} | Size: ${t.size} | Entry: ${t.entry_price.toFixed(2)} | Exit: ${t.exit_price.toFixed(2)} | PnL: $${t.profit.toFixed(2)} | Result: ${t.profit > 0 ? 'WIN 🏆' : 'SL ❌'}`);
  });
}

verify().catch(console.error);
