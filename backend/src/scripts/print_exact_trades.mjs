import fs from 'fs';
import { PineTS } from 'pinets';

const c5 = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));
const pine = fs.readFileSync('pine_scripts/Champion_M5_Dual10R_Verified_PropPassed.pine', 'utf8');

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
const sigEntries = getArr('sigEntry');
const sigSLs = getArr('sigSL');
const sigTPs = getArr('sigTP');
const sigResults = getArr('sigResult');
const sigBars = getArr('sigBar');
const sigEntryTimes = getArr('sigEntryTime');

console.log(`Found ${sigDirs.length} total signals.`);
for (let i = 0; i < sigDirs.length; i++) {
  const dir = sigDirs[i] === 1 ? 'BUY' : 'SELL';
  const entry = sigEntries[i];
  const sl = sigSLs[i];
  const tp = sigTPs[i];
  const result = sigResults[i] === 1 ? 'WIN' : sigResults[i] === -1 ? 'LOSS' : 'PENDING/EXPIRED';
  const bar = sigBars[i];
  const t = new Date(sigEntryTimes[i]).toISOString();
  console.log(`Trade #${i + 1}: [${result}] ${dir} at ${entry} | SL: ${sl} | TP: ${tp} | Bar: ${bar} | Time: ${t}`);
}
