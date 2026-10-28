import fs from 'fs';

const candles = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

for (let i = 98; i <= 102; i++) {
  const c = candles[i];
  console.log(`bar ${i}: O=${c.open} H=${c.high} L=${c.low} C=${c.close}`);
}
