import fs from 'fs';
import { PineTS } from 'pinets';

async function testTimezoneAndExits() {
  const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));
  const p = new PineTS(candles, 'XAUUSD', '15');
  await p.ready();

  const code = `//@version=5
strategy("TestStrategy", overlay=true)
plot(hour, "H_bare")
plot(hour(time, "UTC"), "H_utc")
plot(hour(time, "America/New_York"), "H_ny")
`;

  const res = await p.run(code);
  const hBare = res.plots['H_bare'].data;
  const hUtc = res.plots['H_utc'].data;
  const hNy = res.plots['H_ny'].data;

  for (let i = 300; i < 305; i++) {
    const t = candles[i].openTime || candles[i].time;
    const d = new Date(t);
    console.log(`Candle ${i}: ${d.toISOString()} -> UTC Hour: ${d.getUTCHours()} | H_bare: ${hBare[i]?.value} | H_utc: ${hUtc[i]?.value} | H_ny: ${hNy[i]?.value}`);
  }
}

testTimezoneAndExits().catch(console.error);
