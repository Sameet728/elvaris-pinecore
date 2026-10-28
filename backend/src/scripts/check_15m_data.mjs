import fs from 'fs';

const c15 = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));
console.log('15M candle count:', c15.length);
console.log('First:', new Date(c15[0].openTime || c15[0].time).toISOString());
console.log('Last:', new Date(c15[c15.length-1].openTime || c15[c15.length-1].time).toISOString());
