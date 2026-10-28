import fs from 'fs';
import { PineTS } from 'pinets';

async function run() {
  const candles = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));
  console.log(`Loaded ${candles.length} 5M candles from data/xauusd_5m_tv.json`);
  console.log(`Time span: ${new Date(candles[0].openTime || candles[0].time).toISOString()} to ${new Date(candles[candles.length - 1].openTime || candles[candles.length - 1].time).toISOString()}`);

  const p = new PineTS(candles, 'XAUUSD', '5');
  await p.ready();

  const code = fs.readFileSync('pine_scripts/Champion_AllTime_Score6000_STRATEGY.pine', 'utf8');
  const res = await p.run(code);

  const trades = res.strategy.closedtrades || [];
  const wins = trades.filter(t => t.profit > 0);
  const wr = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
  console.log('=== PineTS Execution Results for Champion_AllTime_Score6000_STRATEGY ===');
  console.log(`Total Trades: ${trades.length}`);
  console.log(`Wins: ${wins.length} | Losses: ${trades.length - wins.length}`);
  console.log(`Win Rate: ${wr.toFixed(2)}%`);
  console.log(`Net Profit: $${res.strategy.netprofit?.toFixed(2)}`);
  console.log(`Max Drawdown: $${res.strategy.max_drawdown?.toFixed(2)}`);
}

run().catch(console.error);
