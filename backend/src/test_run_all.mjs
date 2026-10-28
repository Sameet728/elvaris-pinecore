import { getDb } from '../dist/db/database.js';
import { PineTS } from 'pinets';
import fs from 'fs';

async function testScript() {
  const db = getDb();
  const rows = db.prepare('SELECT open_time, open, high, low, close, volume FROM candles ORDER BY open_time ASC').all();
  console.log('Loaded rows:', rows.length);
  const targetTs = new Date('2026-10-10T00:05:00.000+05:30').getTime();
  const idx = rows.findIndex(r => r.open_time === targetTs);
  console.log('Target bar idx:', idx);
  // Test with all candles up to the target replay bar
  const slicedRows = idx !== -1 ? rows.slice(0, idx + 1) : rows;
  console.log('Using sliced rows count:', slicedRows.length);

  const candles = slicedRows.map(r => ({
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
    openTime: r.open_time,
    closeTime: r.open_time + 300000
  }));

  const testFile = fs.readFileSync(new URL('./test_user_lss.mjs', import.meta.url), 'utf-8');
  const userScript = testFile.slice(testFile.indexOf('const userScript = `') + 20, testFile.indexOf('`;\n\n// Generate'));
  console.log('Script length:', userScript.length);

  const pineTS = new PineTS(candles);
  await pineTS.ready();
  const t0 = Date.now();
  const res = await pineTS.run(userScript);
  console.log('Executed in', Date.now() - t0, 'ms');
  console.log('Plot keys:', Object.keys(res.plots || {}));
  if (res.plots?.__boxes__) {
    const rawBoxes = res.plots.__boxes__.data?.slice(-1)[0]?.value ?? [];
    console.log('Boxes count:', rawBoxes.length);
    console.log('Last 4 boxes:', rawBoxes.slice(-4).map(b => ({ left: b.left, right: b.right, top: b.top, bottom: b.bottom, text: b.text })));
  }
  if (res.plots?.__labels__) {
    const rawLabels = res.plots.__labels__.data?.slice(-1)[0]?.value ?? [];
    console.log('Labels count:', rawLabels.length);
    console.log('Last 5 labels:', rawLabels.slice(-5).map(l => ({ x: l.x, y: l.y, text: l.text })));
  }
  if (res.var) {
    for (const [k, v] of Object.entries(res.var)) {
      if (k.includes('month') || k.includes('cumulative') || k.includes('Cons') || k.includes('Drawdown') || k.includes('sigDir') || k.includes('sigResult') || k.includes('sigEntry')) {
        const val = v?.data ? v.data[v.data.length - 1] : v;
        if (Array.isArray(val)) {
          console.log(k, 'array size:', val.length, 'sample:', val.slice(-5));
        } else if (val && val.array && Array.isArray(val.array)) {
          console.log(k, 'array size:', val.array.length, 'sample:', val.array.slice(-5));
        } else {
          console.log(k, 'val:', typeof val === 'object' ? Object.keys(val || {}) : val);
        }
      }
    }
  }
}
testScript().catch(console.error);
