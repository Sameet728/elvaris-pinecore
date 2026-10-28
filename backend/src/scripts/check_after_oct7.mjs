import fs from 'fs';
import { PineTS } from 'pinets';

const c5 = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));
const pine = fs.readFileSync('pine_scripts/Champion_M5_Dual10R_STRATEGY_NativeOrders.pine', 'utf8');

const p = new PineTS(c5, 'XAUUSD', '5');
await p.ready();
const res = await p.run(pine);

const getArr = (name) => {
  const k = Object.keys(res.var ?? {}).find(key => key === name || key.endsWith('_' + name));
  if (!k) return [];
  const v = res.var[k];
  const t = v?.data ? v.data[v.data.length - 1] : v;
  return t?.array || (Array.isArray(t) ? t : []);
};

const sigDirs = getArr('sigDir');
const sigResults = getArr('sigResult');
const sigBars = getArr('sigBar');
const sigEntries = getArr('sigEntry');
const sigTimes = getArr('sigEntryTime');

console.log('Total bars in dataset:', c5.length);
console.log('Last bar date in dataset:', new Date(c5[c5.length - 1].openTime || c5[c5.length - 1].time).toISOString());
console.log('Total signals:', sigDirs.length);

for (let i = 0; i < sigDirs.length; i++) {
  const d = new Date(sigTimes[i]).toISOString();
  console.log(`Trade #${i + 1}: Bar ${sigBars[i]} | ${d} | Dir ${sigDirs[i]} | Result: ${sigResults[i]}`);
}
