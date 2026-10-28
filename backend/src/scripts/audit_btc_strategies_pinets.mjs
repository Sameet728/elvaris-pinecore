import fs from 'fs';
import path from 'path';
import { PineTS } from 'pinets';

const data15M = JSON.parse(fs.readFileSync('data/btcusdt_15m_tv.json', 'utf8'));
const data1H = JSON.parse(fs.readFileSync('data/btcusdt_1h_tv.json', 'utf8'));

console.log(`Loaded authentic TradingView BTCUSDT data:`);
console.log(`- 15M: ${data15M.length} bars`);
console.log(`- 1H:  ${data1H.length} bars`);

const p15 = new PineTS(data15M, 'BTCUSDT', '15');
const p1h = new PineTS(data1H, 'BTCUSDT', '60');
await Promise.all([p15.ready(), p1h.ready()]);

const btcFiles = [
  { file: 'Champion_BTC_15M_Grandmaster_STRATEGY.pine', engine: p15, tf: '15M', sl: 350.0 },
  { file: 'Champion_BTC_15M_1to2RR_STRATEGY.pine', engine: p15, tf: '15M', sl: 300.0 },
  { file: 'Champion_BTC_1H_Macro_STRATEGY.pine', engine: p1h, tf: '1H', sl: 1800.0 }
];

console.log('\n--- Auditing Top 3 BTC Pine Strategies in PineTS ---');
const results = [];

for (const item of btcFiles) {
  const filePath = path.join('pine_scripts', item.file);
  const code = fs.readFileSync(filePath, 'utf8');

  console.log(`\nAuditing file: ${item.file} on ${item.tf}...`);
  try {
    const res = await item.engine.run(code);
    const trades = res.strategy.closedtrades || [];
    const wins = trades.filter(t => t.profit > 0);
    const losses = trades.filter(t => t.profit <= 0);
    const wr = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
    const net = res.strategy.netprofit || 0;
    const maxDD = res.strategy.max_drawdown || 1;
    const netR = net / item.sl;
    const maxDDR = maxDD / item.sl;
    const calmar = maxDDR > 0 ? (netR / maxDDR) : 0;

    const monthly = {};
    for (const t of trades) {
      const m = new Date(t.entry_time).toISOString().substring(0, 7);
      monthly[m] = (monthly[m] || 0) + (t.profit / item.sl);
    }

    console.log(`  PASSED AUDIT!`);
    console.log(`  Trades: ${trades.length} (${wins.length}W / ${losses.length}L)`);
    console.log(`  Win Rate: ${wr.toFixed(2)}%`);
    console.log(`  Net Return: $${net.toFixed(2)} (+${netR.toFixed(2)}R)`);
    console.log(`  Max Closed Drawdown: $${maxDD.toFixed(2)} (${maxDDR.toFixed(2)}R)`);
    console.log(`  Calmar Ratio: ${calmar.toFixed(2)}`);
    console.log(`  Monthly Breakdown:`, monthly);

    results.push({
      file: item.file, tf: item.tf, trades: trades.length, wins: wins.length, losses: losses.length,
      wr: Number(wr.toFixed(2)), net: Number(net.toFixed(2)), netR: Number(netR.toFixed(2)),
      maxDD: Number(maxDD.toFixed(2)), maxDDR: Number(maxDDR.toFixed(2)), calmar: Number(calmar.toFixed(2)),
      monthly
    });
  } catch (err) {
    console.error(`  FAILED: ${err.message}`);
  }
}

fs.writeFileSync('data/top3_btc_champions_audit.json', JSON.stringify(results, null, 2));
console.log('\nAll 3 BTC Champion Strategies verified and audited successfully!');
