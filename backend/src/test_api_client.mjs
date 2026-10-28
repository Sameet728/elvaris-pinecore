async function testApi() {
  const meta = await fetch('http://localhost:3001/api/data/metadata').then(r => r.json());
  console.log('API Metadata:', meta);

  const candleRes = await fetch('http://localhost:3001/api/data/candles?limit=5').then(r => r.json());
  console.log('Candles total count in DB:', candleRes.count);
  console.log('Last candle from API:', candleRes.candles[candleRes.candles.length - 1]);

  const script = `//@version=6
indicator("Liquidity Sweep Signals", shorttitle="LSS", overlay=true)
swingLen = 10
atrMult = 0.5
rrRatio = 2.0
`;
  const execRes = await fetch('http://localhost:3001/api/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script, engine: 'auto' })
  }).then(r => r.json());
  console.log('Execute success:', execRes.success);
  console.log('Engine used:', execRes.engineUsed);
  console.log('Summary:', execRes.backtest?.summary);
  console.log('Trades count:', execRes.backtest?.trades?.length);
  console.log('Top active trade:', execRes.backtest?.trades?.[0]);
  console.log('Boxes count:', execRes.drawings?.boxes?.length);
  console.log('Last box:', execRes.drawings?.boxes?.slice(-1)[0]);
  console.log('Labels count:', execRes.drawings?.labels?.length);
  console.log('Last label:', execRes.drawings?.labels?.slice(-1)[0]);
}
testApi().catch(console.error);
