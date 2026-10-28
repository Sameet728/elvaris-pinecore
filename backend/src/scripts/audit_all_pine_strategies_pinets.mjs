import fs from 'fs';
import path from 'path';
import { PineTS } from 'pinets';

const data15M = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));
const data1H = JSON.parse(fs.readFileSync('data/xauusd_1h_tv.json', 'utf8'));
const data5M = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));
const data30M = fs.existsSync('data/xauusd_30m_tv.json') ? JSON.parse(fs.readFileSync('data/xauusd_30m_tv.json', 'utf8')) : [];
const data4H = fs.existsSync('data/xauusd_4h_tv.json') ? JSON.parse(fs.readFileSync('data/xauusd_4h_tv.json', 'utf8')) : [];
const data1M = fs.existsSync('data/xauusd_1m_tv.json') ? JSON.parse(fs.readFileSync('data/xauusd_1m_tv.json', 'utf8')) : [];

console.log('Candle datasets loaded:');
console.log(`- 15M: ${data15M.length} bars`);
console.log(`- 1H:  ${data1H.length} bars`);
console.log(`- 5M:  ${data5M.length} bars`);
console.log(`- 30M: ${data30M.length} bars`);
console.log(`- 4H:  ${data4H.length} bars`);
console.log(`- 1M:  ${data1M.length} bars`);

const p15 = new PineTS(data15M, 'XAUUSD', '15');
const p1h = new PineTS(data1H, 'XAUUSD', '60');
const p5 = new PineTS(data5M, 'XAUUSD', '5');
const p30 = data30M.length > 0 ? new PineTS(data30M, 'XAUUSD', '30') : null;
const p4h = data4H.length > 0 ? new PineTS(data4H, 'XAUUSD', '240') : null;
const p1m = data1M.length > 0 ? new PineTS(data1M, 'XAUUSD', '1') : null;

await Promise.all([
  p15.ready(),
  p1h.ready(),
  p5.ready(),
  p30 ? p30.ready() : Promise.resolve(),
  p4h ? p4h.ready() : Promise.resolve(),
  p1m ? p1m.ready() : Promise.resolve()
]);

const strategyFiles = fs.readdirSync('pine_scripts').filter(f => f.startsWith('Champion_') && (f.endsWith('_STRATEGY.pine') || (!f.includes('_INDICATOR.pine') && f.endsWith('.pine'))));

console.log(`\nFound ${strategyFiles.length} strategy scripts to test.`);

const auditResults = [];

for (const file of strategyFiles) {
  const filePath = path.join('pine_scripts', file);
  let code = fs.readFileSync(filePath, 'utf8');

  // Determine timeframe
  let tf = '15';
  let engine = p15;
  if (file.includes('_1H_') || file.includes('_H1_')) {
    tf = '60'; engine = p1h;
  } else if (file.includes('_5M_') || file.includes('_M5_')) {
    tf = '5'; engine = p5;
  } else if (file.includes('_30M_') || file.includes('_M30_')) {
    tf = '30'; engine = p30 || p15;
  } else if (file.includes('_4H_') || file.includes('_H4_')) {
    tf = '240'; engine = p4h || p1h;
  } else if (file.includes('_1M_') || file.includes('_M1_')) {
    tf = '1'; engine = p1m || p5;
  }

  // If the file is declared as indicator, PineTS won't execute strategy trades.
  const isIndicator = code.includes('indicator(');
  if (isIndicator) {
    auditResults.push({
      file,
      tf,
      status: 'IS_INDICATOR_ONLY',
      note: 'File is an indicator, not a strategy. Cannot run in Strategy Tester.'
    });
    continue;
  }

  try {
    const res = await engine.run(code);
    const trades = res.strategy?.closedtrades || [];
    const wins = trades.filter(t => t.profit > 0);
    const wr = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
    const net = res.strategy?.netprofit || 0;
    const maxDD = res.strategy?.max_drawdown || 0;
    const pf = res.strategy?.profit_factor || 0;

    const working = trades.length >= 10 && wr >= 55.0 && net > 0;

    auditResults.push({
      file,
      tf,
      trades: trades.length,
      wins: wins.length,
      losses: trades.length - wins.length,
      winRate: Number(wr.toFixed(2)),
      netProfit: Number(net.toFixed(2)),
      maxDrawdown: Number(maxDD.toFixed(2)),
      profitFactor: Number(pf.toFixed(2)),
      status: working ? 'WORKING_EXCELLENT' : (net > 0 ? 'SUB_PAR' : 'FAILED_NOT_WORKING')
    });
  } catch (err) {
    auditResults.push({
      file,
      tf,
      status: 'RUNTIME_ERROR',
      error: err.message
    });
  }
}

console.log('\n======================================================');
console.log('📊 COMPREHENSIVE PINENET / TRADINGVIEW EXECUTION AUDIT:');
console.log('======================================================');

auditResults.forEach(r => {
  if (r.status === 'WORKING_EXCELLENT') {
    console.log(`✅ [WORKING] ${r.file} (${r.tf}m): ${r.trades} trades | WR: ${r.winRate}% | Net: $${r.netProfit} | DD: $${r.maxDrawdown} | PF: ${r.profitFactor}`);
  } else if (r.status === 'SUB_PAR') {
    console.log(`⚠️ [SUB_PAR] ${r.file} (${r.tf}m): ${r.trades} trades | WR: ${r.winRate}% | Net: $${r.netProfit} | DD: $${r.maxDrawdown} | PF: ${r.profitFactor}`);
  } else if (r.status === 'FAILED_NOT_WORKING') {
    console.log(`❌ [FAILED]  ${r.file} (${r.tf}m): ${r.trades} trades | WR: ${r.winRate}% | Net: $${r.netProfit} | DD: $${r.maxDrawdown} | PF: ${r.profitFactor}`);
  } else if (r.status === 'IS_INDICATOR_ONLY') {
    console.log(`ℹ️ [INDICATOR] ${r.file}: ${r.note}`);
  } else {
    console.log(`💥 [ERROR]   ${r.file}: ${r.error}`);
  }
});

fs.writeFileSync('data/strategy_reality_audit.json', JSON.stringify(auditResults, null, 2));
console.log('\nAudit saved to data/strategy_reality_audit.json');
