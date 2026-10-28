import { PineTS } from 'pinets';
import fs from 'fs';
import path from 'path';

async function test1H() {
  const candles1h = JSON.parse(fs.readFileSync('./data/xauusd_1h_tv.json', 'utf8')).map(c => ({
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume || 100,
    openTime: c.openTime || c.time,
    closeTime: (c.openTime || c.time) + 3600000
  }));

  const scriptContent = fs.readFileSync('./pine_scripts/Champion_1H_200Pip_GiantTarget_INDICATOR.pine', 'utf8');

  console.log('Running 1H 200p Indicator on', candles1h.length, 'candles...');
  const pineTS = new PineTS(candles1h);
  await pineTS.ready();
  const res = await pineTS.run(scriptContent);
  console.log('Executed successfully!');

  if (res.var) {
    const keys = Object.keys(res.var);
    for (const k of keys) {
      if (k.includes('month') || k.includes('cumulative') || k.includes('total') || k.includes('maxDrawdown') || k.includes('maxConsec')) {
        const v = res.var[k];
        const val = v?.data ? v.data[v.data.length - 1] : v;
        if (val && val.array) {
          console.log(k, ':', val.array);
        } else {
          console.log(k, ':', val);
        }
      }
    }
  }
}

test1H().catch(console.error);
