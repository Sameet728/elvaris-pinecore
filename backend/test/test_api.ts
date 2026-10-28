async function testApi() {
  const metaRes = await fetch('http://localhost:3001/api/data/metadata');
  const meta = await metaRes.json();
  console.log('✓ Metadata endpoint:', meta);

  const candleRes = await fetch('http://localhost:3001/api/data/candles?limit=3');
  const candles = await candleRes.json();
  console.log('✓ Candles endpoint count:', candles.count);
  console.log('✓ First candle:', candles.candles[0]);

  const script = `//@version=5
indicator("EMA Cross", overlay=true)
plot(ta.ema(close, 9), "Fast", color=color.blue)
plot(ta.ema(close, 21), "Slow", color=color.red)
`;

  const execRes = await fetch('http://localhost:3001/api/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script, maxBars: 50 }),
  });
  const exec = await execRes.json();
  console.log('✓ Execution success:', exec.success);
  console.log('✓ Plots returned:', Object.keys(exec.plots));
  console.log('✓ Bars processed:', exec.bars);
  console.log('✓ Execution time:', exec.executionTime + 'ms');

  const fastPlot = exec.plots['Fast'];
  console.log('✓ Fast plot sample value:', fastPlot.data[fastPlot.data.length - 1]);
}

testApi().catch(console.error);
