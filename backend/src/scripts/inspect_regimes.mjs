import fs from 'fs';

const candles = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

// Inspect candles between Sep 21 and Oct 05
for (let i = 0; i < candles.length; i += 500) {
  const c = candles[i];
  const d = new Date(c.time || c.openTime).toISOString().slice(0, 10);
  console.log(`Bar ${i}: Date=${d} Close=${c.close}`);
}
