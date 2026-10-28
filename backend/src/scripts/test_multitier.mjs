import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

async function testMultiTier() {
  const code = fs.readFileSync('pine_scripts/Champion_MultiTier_ZeroLossStreak_STRATEGY.pine', 'utf8');
  const p = new PineTS(candles, 'XAUUSD', '5');
  await p.ready();
  const res = await p.run(code);
  const s = res.strategy;
  console.log('Champion_MultiTier_ZeroLossStreak_STRATEGY Results on 5M:');
  console.log('Total Closed Trades:', s.closedtrades?.length);
  const wins = s.closedtrades?.filter(t => t.profit > 0) || [];
  const losses = s.closedtrades?.filter(t => t.profit <= 0) || [];
  console.log('Wins:', wins.length, 'Losses:', losses.length);
  if (s.closedtrades?.length > 0) {
    console.log('Win Rate:', ((wins.length / s.closedtrades.length) * 100).toFixed(1) + '%');
  }
  console.log('Net Profit: $' + s.netprofit?.toFixed(2));
  console.log('Max Drawdown %:', (s.max_drawdown_percent_value * 100)?.toFixed(2) + '%');
}

testMultiTier().catch(console.error);
