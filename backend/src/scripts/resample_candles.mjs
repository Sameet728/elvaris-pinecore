import fs from 'fs';

const c5 = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

function resample(candles, intervalMin) {
  const res = [];
  const intervalMs = intervalMin * 60 * 1000;
  let curBucket = null;

  for (const c of candles) {
    const t = c.time || c.openTime;
    const bucketTime = Math.floor(t / intervalMs) * intervalMs;

    if (!curBucket || curBucket.time !== bucketTime) {
      if (curBucket) res.push(curBucket);
      curBucket = {
        time: bucketTime,
        openTime: bucketTime,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0
      };
    } else {
      curBucket.high = Math.max(curBucket.high, c.high);
      curBucket.low = Math.min(curBucket.low, c.low);
      curBucket.close = c.close;
      curBucket.volume += (c.volume || 0);
    }
  }
  if (curBucket) res.push(curBucket);
  return res;
}

const c15 = resample(c5, 15);
const c60 = resample(c5, 60);

fs.writeFileSync('data/xauusd_15m_tv.json', JSON.stringify(c15));
fs.writeFileSync('data/xauusd_1h_tv.json', JSON.stringify(c60));

console.log(`Resampled: 5M (${c5.length}) -> 15M (${c15.length}) -> 1H (${c60.length})`);
