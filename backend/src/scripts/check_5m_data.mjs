import fs from 'fs';

const candles = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));
const first = candles[0];
const last = candles[candles.length - 1];

console.log('5M candle count:', candles.length);
console.log('First candle:', new Date(first.openTime || first.time).toISOString());
console.log('Last candle:', new Date(last.openTime || last.time).toISOString());
console.log('Sample candle:', first);
