const fs = require('fs');

async function testPineScript(filePath) {
  const script = fs.readFileSync(filePath, 'utf8');
  console.log(`Testing Pine Script: ${filePath}`);
  const startTime = Date.now();
  const res = await fetch('http://127.0.0.1:3005/api/backtest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      script,
      datasetName: 'xauusd_15m',
      symbol: 'FOREXCOM:XAUUSD',
      timeframe: '15'
    })
  });
  const data = await res.json();
  const dur = Date.now() - startTime;
  if (!data.success) {
    console.error('Backtest Error:', data.error);
    return null;
  }
  const m = data.result.metrics;
  console.log(`Backtest Finished in ${dur}ms:`);
  console.log(`- Total Trades: ${m.totalTrades}`);
  console.log(`- Wins / Losses: ${m.wins}W / ${m.losses}L`);
  console.log(`- Win Rate: ${m.winRate.toFixed(2)}%`);
  console.log(`- Net Profit: $${m.netProfitCash.toFixed(2)}`);
  console.log(`- Max Drawdown: $${m.maxDrawdownCash.toFixed(2)}`);
  console.log(`- Calmar Ratio: ${m.calmarRatio.toFixed(2)}`);
  console.log(`- Profit Factor: ${m.profitFactor.toFixed(2)}`);
  return data.result;
}

module.exports = { testPineScript };

if (require.main === module) {
  const file = process.argv[2] || '15M_Champion_Strategies/Champion_15M_Grandmaster_Dual10R_Oct8R_STRATEGY.pine';
  testPineScript(file);
}

