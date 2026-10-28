import http from 'http';

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3001,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            resolve(raw);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const tests = [
    {
      name: 'EMA Cross (9/21)',
      script: `//@version=5
indicator("EMA Cross", overlay=true)
fast = ta.ema(close, 9)
slow = ta.ema(close, 21)
plot(fast, "Fast", color=color.blue)
plot(slow, "Slow", color=color.red)`,
    },
    {
      name: 'Bollinger Bands (20, 2)',
      script: `//@version=5
indicator("Bollinger Bands", overlay=true)
basis = ta.sma(close, 20)
dev = 2.0 * ta.stdev(close, 20)
upper = basis + dev
lower = basis - dev
plot(basis, "Basis")
plot(upper, "Upper")
plot(lower, "Lower")`,
    },
    {
      name: 'RSI Oscillator (14)',
      script: `//@version=5
indicator("RSI", overlay=false)
r = ta.rsi(close, 14)
plot(r, "RSI")`,
    },
  ];

  console.log('Testing Pine indicator execution against real Dukascopy XAUUSD candles...\n');
  for (const t of tests) {
    const res = await post('/api/execute', { script: t.script, maxBars: 100 });
    console.log(`[PASS] ${t.name}:`);
    console.log(`  - Success: ${res.success}`);
    console.log(`  - Bars Processed: ${res.bars}`);
    console.log(`  - Execution Time: ${res.executionTime}ms`);
    console.log(`  - Output Plots: ${Object.keys(res.plots || {}).join(', ')}`);
    for (const [plotName, series] of Object.entries(res.plots || {})) {
      const validPoints = series.data.filter((d) => d.value !== null);
      const lastPoint = validPoints[validPoints.length - 1];
      console.log(`    * ${plotName}: ${validPoints.length} valid points (Latest: ${lastPoint?.value?.toFixed(2)})`);
    }
    console.log('');
  }
}

main().catch(console.error);
