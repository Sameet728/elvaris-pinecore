import { getCandles as getTVCandles } from '@mathieuc/tradingview';

async function testM1() {
  const endDate = new Date('2026-10-09T22:00:00.000Z');
  const startDate = new Date('2026-10-02T00:00:00.000Z'); // 1 week of M1
  console.log('Testing M1 fetch from TradingView...');
  try {
    const candles = await getTVCandles({
      symbol: 'FOREXCOM:XAUUSD',
      timeframe: '1',
      from: startDate,
      to: endDate
    });
    console.log(`Fetched ${candles?.length || 0} M1 candles!`);
    if (candles && candles.length > 0) {
      console.log('Sample M1 candle:', candles[0]);
    }
  } catch (err) {
    console.error('M1 fetch error:', err.message);
  }
}

testM1();
