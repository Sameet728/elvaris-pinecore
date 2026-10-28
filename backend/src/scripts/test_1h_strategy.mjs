import fs from 'fs';
import { PineTS } from 'pinets';

const c60 = JSON.parse(fs.readFileSync('data/xauusd_1h_tv.json', 'utf8'));

async function test1H() {
  const code = fs.readFileSync('pine_scripts/Champion_1H_200Pip_GiantTarget_STRATEGY.pine', 'utf8');
  const p = new PineTS(c60, 'XAUUSD', '60');
  await p.ready();
  const res = await p.run(code);
  const s = res.strategy;
  const trades = s.closedtrades || [];
  const wins = trades.filter(t => t.profit > 0);
  const losses = trades.filter(t => t.profit <= 0);

  console.log('--- 1H 200-Pip Giant Target Strategy on 1H Data ---');
  console.log(`Total Trades: ${trades.length}`);
  console.log(`Wins: ${wins.length} | Losses: ${losses.length}`);
  if (trades.length > 0) {
    console.log(`Win Rate: ${((wins.length / trades.length) * 100).toFixed(1)}%`);
  }
  console.log(`Net Profit: $${s.netprofit.toFixed(2)}`);
  console.log(`Max Drawdown: $${s.max_drawdown?.toFixed(2)} (${(s.max_drawdown_percent_value * 100).toFixed(2)}%)`);
}

test1H().catch(console.error);
