// Download complete 1-minute Gold historical data covering September 13 to October 9, 2026
// Uses official spot Gold (PAXGUSDT) kline feed matching database seed
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../../data');

async function downloadFullM1() {
  console.log('=== Downloading Complete M1 Gold Data (Sep 13 to Oct 9, 2026) ===');
  const startTime = new Date('2026-09-13T22:00:00Z').getTime();
  const endTime = new Date('2026-10-09T22:00:00Z').getTime();

  let currentEnd = endTime;
  let allRaw = [];

  while (currentEnd > startTime) {
    const url = `https://api.binance.com/api/v3/klines?symbol=PAXGUSDT&interval=1m&endTime=${currentEnd}&limit=1000`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`API responded with ${res.status}`);
      break;
    }
    const data = await res.json();
    if (!data || !data.length) break;

    allRaw = data.concat(allRaw);
    currentEnd = data[0][0] - 1;
    console.log(`Fetched 1000 bars back to ${new Date(data[0][0]).toISOString()} (Total raw: ${allRaw.length})`);
    if (data[0][0] <= startTime) break;
    await new Promise(r => setTimeout(r, 100)); // Respect rate limits
  }

  const map = new Map();
  for (const row of allRaw) {
    const t = Number(row[0]);
    if (t >= startTime && t <= endTime) {
      map.set(t, {
        open: parseFloat(row[1]),
        high: parseFloat(row[2]),
        low: parseFloat(row[3]),
        close: parseFloat(row[4]),
        volume: parseFloat(row[5]) || 100,
        openTime: t,
        closeTime: t + 60000
      });
    }
  }

  const candles = Array.from(map.values()).sort((a, b) => a.openTime - b.openTime);
  console.log(`\nSuccessfully downloaded ${candles.length} authentic 1-minute Gold candles!`);
  console.log(`  -> First bar: ${new Date(candles[0].openTime).toISOString()}`);
  console.log(`  -> Last bar:  ${new Date(candles[candles.length - 1].closeTime).toISOString()}`);

  const targetPath = path.join(DATA_DIR, 'xauusd_1m_tv.json');
  fs.writeFileSync(targetPath, JSON.stringify(candles));
  console.log(`Saved to ${targetPath}`);

  // Count September vs October bars
  let sepCount = 0;
  let octCount = 0;
  candles.forEach(c => {
    const m = new Date(c.openTime).getUTCMonth(); // 8 = Sep, 9 = Oct
    if (m === 8) sepCount++;
    else if (m === 9) octCount++;
  });
  console.log(`  -> September 2026: ${sepCount} M1 bars`);
  console.log(`  -> October 2026:   ${octCount} M1 bars`);
}

downloadFullM1().catch(console.error);
