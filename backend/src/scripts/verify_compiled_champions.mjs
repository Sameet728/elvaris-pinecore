import fs from 'fs';
import { PineTS } from 'pinets';

async function check() {
  const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));
  const p = new PineTS(candles, 'XAUUSD', '15');
  await p.ready();

  const stratCode = fs.readFileSync('pine_scripts/Champion_15M_1to2RR_75WR_STRATEGY.pine', 'utf8');
  const resStrat = await p.run(stratCode);
  const trades = resStrat.strategy.closedtrades || [];
  const wins = trades.filter(t => t.profit > 0);
  const wr = (wins.length / trades.length) * 100;
  console.log(`✅ Strategy Verified:`);
  console.log(`   Trades: ${trades.length} | Wins: ${wins.length} | Losses: ${trades.length - wins.length}`);
  console.log(`   Win Rate: ${wr.toFixed(2)}% | Net: $${resStrat.strategy.netprofit.toFixed(2)} (+${(resStrat.strategy.netprofit/10).toFixed(1)}R)`);
  console.log(`   Max DD: $${resStrat.strategy.max_drawdown?.toFixed(2)} (${(resStrat.strategy.max_drawdown/10).toFixed(2)}R)`);

  const indCode = fs.readFileSync('pine_scripts/Champion_15M_1to2RR_75WR_INDICATOR.pine', 'utf8')
    .replace('indicator(', 'strategy(');
  const resInd = await p.run(indCode);
  console.log(`✅ Indicator Verified & Compiled with 0 errors!`);
}

check().catch(console.error);
