import { getCandles } from '@mathieuc/tradingview';

async function testNSE() {
  const testSymbols = [
    'NSE:NIFTYBEES',
    'NSE:BANKBEES',
    'NSE:GOLDBEES',
    'NSE:ITBEES',
    'NSE:PHARMABEES',
    'NSE:AUTOBEES',
    'NSE:SILVERBEES',
    'NSE:CPSEETF'
  ];

  for (const sym of testSymbols) {
    try {
      const candles = await getCandles({
        symbol: sym,
        timeframe: 'D',
        count: 500
      });
      console.log(`Symbol ${sym}: fetched ${candles?.length || 0} bars`);
      if (candles && candles.length > 0) {
        console.log(`   Latest: ${new Date(candles[candles.length - 1].time * 1000).toISOString().slice(0, 10)} Close: ${candles[candles.length - 1].close}`);
      }
    } catch (e) {
      console.log(`Symbol ${sym} failed: ${e.message}`);
    }
  }
}

testNSE();
