import fs from 'fs';
import { PineTS } from 'pinets';

async function testScript(name, pinePath, dataPath, tf, isIndicator = false) {
  console.log(`\nTesting ${name}...`);
  const candles = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const code = fs.readFileSync(pinePath, 'utf8');
  const p = new PineTS(candles, 'XAUUSD', tf);
  await p.ready();
  const res = await p.run(code);

  if (isIndicator) {
    console.log(`✅ [${name}] INDICATOR COMPILED & EXECUTED 100% CLEAN! Plots: ${Object.keys(res.plots || {}).length}`);
    return;
  }

  const s = res.strategy;
  const trades = s.closedtrades || [];
  const wins = trades.filter(t => t.profit > 0);
  const losses = trades.filter(t => t.profit <= 0);
  const wr = (wins.length / trades.length) * 100;
  console.log(`✅ [${name}] COMPILED & EXECUTED 100% CLEAN!`);
  console.log(`Trades: ${trades.length} | Wins: ${wins.length} | Losses: ${losses.length} | Win Rate: ${wr.toFixed(2)}% | Net: $${s.netprofit.toFixed(2)} | Max DD: $${s.max_drawdown?.toFixed(2)}`);
}

async function main() {
  await testScript('15M 1:2 R:R 75% WR Champion STRATEGY', 'pine_scripts/Champion_15M_1to2RR_75WR_STRATEGY.pine', 'data/xauusd_15m_tv.json', '15');
  await testScript('15M 1:2 R:R 75% WR Champion INDICATOR', 'pine_scripts/Champion_15M_1to2RR_75WR_INDICATOR.pine', 'data/xauusd_15m_tv.json', '15', true);
  await testScript('15M Grandmaster Dual-10R Oct-8R STRATEGY', 'pine_scripts/Champion_15M_Grandmaster_Dual10R_Oct8R_STRATEGY.pine', 'data/xauusd_15m_tv.json', '15');
  await testScript('15M Grandmaster Dual-10R Oct-8R INDICATOR', 'pine_scripts/Champion_15M_Grandmaster_Dual10R_Oct8R_INDICATOR.pine', 'data/xauusd_15m_tv.json', '15', true);
  await testScript('15M Apex 88.5% Sovereign', 'pine_scripts/Champion_15M_Apex_88WR_STRATEGY.pine', 'data/xauusd_15m_tv.json', '15');
  await testScript('15M Elite 80%+ Sovereign', 'pine_scripts/Champion_15M_80WR_Elite_STRATEGY.pine', 'data/xauusd_15m_tv.json', '15');
  await testScript('15M Pure Sovereign', 'pine_scripts/Champion_15M_Pure_Sovereign_STRATEGY.pine', 'data/xauusd_15m_tv.json', '15');
  await testScript('5M High-Frequency Prop', 'pine_scripts/Champion_5M_HighFrequency_Prop_STRATEGY.pine', 'data/xauusd_5m_tv.json', '5');
  await testScript('1H Pure Sovereign', 'pine_scripts/Champion_1H_Pure_Sovereign_STRATEGY.pine', 'data/xauusd_1h_tv.json', '60');
}

main().catch(console.error);
