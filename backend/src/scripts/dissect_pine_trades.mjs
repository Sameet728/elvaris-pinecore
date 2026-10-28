import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

async function inspectAllTrades() {
  const code = fs.readFileSync('pine_scripts/Champion_5M_200Pip_Sovereign_STRATEGY.pine', 'utf8');
  const p = new PineTS(candles, 'XAUUSD', '5');
  await p.ready();
  const res = await p.run(code);
  const trades = res.strategy.closedtrades;
  
  console.log(`Total trades: ${trades.length}`);
  let microWins = 0;
  let smallWins = 0;
  let bigWins = 0;
  let bigLosses = 0;
  let smallLosses = 0;

  trades.forEach((t, i) => {
    const profit = t.profit;
    if (profit > 0 && profit < 0.50) microWins++;
    else if (profit >= 0.50 && profit < 2.50) smallWins++;
    else if (profit >= 2.50) bigWins++;
    else if (profit < 0 && profit > -0.50) smallLosses++;
    else if (profit <= -0.50) bigLosses++;

    console.log(`[${i+1}] bar=${t.entry_bar_index}->${t.exit_bar_index} ${t.entry_id} in=${t.entry_price} out=${t.exit_price} pnl=${profit.toFixed(3)} comment=${t.exit_comment}`);
  });

  console.log('\n--- Breakdown ---');
  console.log(`Micro Wins (0.00 to 0.50): ${microWins}`);
  console.log(`Small Wins (0.50 to 2.50): ${smallWins}`);
  console.log(`Big Wins (>= 2.50): ${bigWins}`);
  console.log(`Small Losses (-0.50 to 0.00): ${smallLosses}`);
  console.log(`Big Losses (<= -0.50): ${bigLosses}`);
}

inspectAllTrades().catch(console.error);
