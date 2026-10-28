import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

async function testIndicator() {
  const code = fs.readFileSync('pine_scripts/Champion_5M_200Pip_Sovereign_INDICATOR.pine', 'utf8');
  const p = new PineTS(candles.slice(0, 500), 'XAUUSD', '5');
  await p.ready();
  const res = await p.run(code);
  console.log('Indicator compiled and ran successfully! Total bars processed:', res.plot?.length || 500);
}

testIndicator().catch(console.error);
