import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

async function traceTrade() {
  const code = fs.readFileSync('pine_scripts/Champion_5M_200Pip_Sovereign_STRATEGY.pine', 'utf8');
  const p = new PineTS(candles.slice(0, 400), 'XAUUSD', '5');
  await p.ready();
  const res = await p.run(code);
  const trades = res.strategy.closedtrades;
  console.log('Trades up to bar 400:');
  trades.forEach((t, i) => {
    console.log(`Trade ${i+1}: ${t.entry_id} entry_bar=${t.entry_bar_index} exit_bar=${t.exit_bar_index} entry_price=${t.entry_price} exit_price=${t.exit_price} profit=${t.profit} comment=${t.exit_comment}`);
  });
}
traceTrade().catch(console.error);
