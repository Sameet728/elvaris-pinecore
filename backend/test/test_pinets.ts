import { PineTS } from 'pinets';

async function test() {
  const candles = [
    { open: 2000, high: 2010, low: 1995, close: 2005, volume: 100, openTime: 1700000000000, closeTime: 1700000300000 },
    { open: 2005, high: 2015, low: 2000, close: 2010, volume: 120, openTime: 1700000300000, closeTime: 1700000600000 },
    { open: 2010, high: 2020, low: 2005, close: 2015, volume: 140, openTime: 1700000600000, closeTime: 1700000900000 },
    { open: 2015, high: 2025, low: 2010, close: 2020, volume: 160, openTime: 1700000900000, closeTime: 1700001200000 },
  ];

  const pts = new PineTS(candles);
  await pts.ready();

  const script = `//@version=5
indicator("Test SMA", overlay=true)
plot(ta.sma(close, 2), "SMA")
`;

  const context = await pts.run(script);
  console.log('Result plots:', Object.keys(context.plots || {}));
  console.log('Plot values:', context.plots['SMA']);
}

test().catch(console.error);
