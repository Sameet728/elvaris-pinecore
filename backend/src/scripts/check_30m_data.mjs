import fs from 'fs';

const c30 = JSON.parse(fs.readFileSync('data/xauusd_30m_tv.json', 'utf8'));
console.log('30M candle count:', c30.length);
console.log('First:', new Date(c30[0].openTime || c30[0].time).toISOString());
console.log('Last:', new Date(c30[c30.length-1].openTime || c30[c30.length-1].time).toISOString());
