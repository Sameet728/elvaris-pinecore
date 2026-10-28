import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

async function analyze() {
  const code = fs.readFileSync('pine_scripts/Champion_5M_200Pip_Sovereign_STRATEGY.pine', 'utf8');
  const p = new PineTS(candles, 'XAUUSD', '5');
  await p.ready();
  const res = await p.run(code);
  const trades = res.strategy.closedtrades;
  console.log('Total Trades:', trades.length);
  const wins = trades.filter(t => t.profit > 0);
  const losses = trades.filter(t => t.profit <= 0);
  console.log('Wins:', wins.length, 'Losses:', losses.length, 'Win Rate:', ((wins.length / trades.length) * 100).toFixed(1) + '%');
  console.log('Net Profit: $' + res.strategy.netprofit.toFixed(2));
  
  // Inspect all losses
  console.log('\n--- ALL LOSSES ---');
  losses.forEach((l, idx) => {
    console.log(`[Loss ${idx+1}] bar=${l.entry_bar_index}->${l.exit_bar_index} ${l.entry_id} entry=${l.entry_price} exit=${l.exit_price} profit=${l.profit.toFixed(2)} exit_comment=${l.exit_comment}`);
  });
}
analyze().catch(console.error);
