import fs from 'fs';

const candles = JSON.parse(fs.readFileSync('data/xauusd_1h_tv.json', 'utf8'));

console.log('Total candles:', candles.length);
candles.slice(-15).forEach((c, idx) => {
  const d = new Date(c.time);
  console.log(`#${candles.length - 15 + idx} | ${d.toISOString()} | O:${c.open} H:${c.high} L:${c.low} C:${c.close}`);
});
