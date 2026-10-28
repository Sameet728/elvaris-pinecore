import { getCandles } from '@mathieuc/tradingview';

async function testCount() {
  try {
    const candles = await getCandles({
      symbol: 'NSE:NIFTYBEES',
      timeframe: 'D',
      count: 10000
    });
    console.log(`NSE:NIFTYBEES fetched ${candles.length} daily bars!`);
    const start = new Date(candles[0].time * 1000).toISOString().slice(0, 10);
    const end = new Date(candles[candles.length - 1].time * 1000).toISOString().slice(0, 10);
    console.log(`Period: ${start} to ${end}`);
  } catch (e) {
    console.error(e);
  }
}

testCount();
