import fs from 'fs';

const candles = JSON.parse(fs.readFileSync('data/xauusd_1h_tv.json', 'utf8'));

// Find candles around Oct 9, 2026
const targetTime = new Date('2026-10-09T01:00:00Z').getTime(); // 06:30 IST is 01:00 UTC
console.log('Searching for target time:', targetTime);

const matched = candles.filter(c => Math.abs(c.time - targetTime) <= 24 * 3600 * 1000);
matched.forEach(c => {
  const d = new Date(c.time);
  console.log(`${d.toISOString()} (UTC) | Open: ${c.open} | High: ${c.high} | Low: ${c.low} | Close: ${c.close}`);
});
