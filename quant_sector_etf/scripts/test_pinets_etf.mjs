import { PineTS } from 'pinets';
import fs from 'fs';
import path from 'path';

async function testPine() {
  const pineCode = fs.readFileSync('c:/Users/samee/Desktop/Pine/quant_sector_etf/pine_scripts/Quant_Sector_ETF_Dip_Strategy.pine', 'utf8');
  const btcData = JSON.parse(fs.readFileSync('c:/Users/samee/Desktop/Pine/quant_sector_etf/data/niftybees_daily.json', 'utf8')).slice(-500);

  const pineCandles = btcData.map(c => ({
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
    openTime: c.time,
    closeTime: c.time + 86400000
  }));

  console.log(`Testing PineTS execution with ${pineCandles.length} NIFTYBEES daily candles...`);
  try {
    const pine = new PineTS(pineCandles, 'NIFTYBEES', 'D');
    await pine.ready();
    const result = await pine.run(pineCode);
    console.log('✅ PineTS compilation and execution SUCCESSFUL!');
    console.log('Result plots count:', Object.keys(result.plots || {}).length);
  } catch (e) {
    console.error('❌ PineTS execution failed:', e.message);
  }
}

testPine();
