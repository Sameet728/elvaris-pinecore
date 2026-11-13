const { execSync } = require('child_process');
const fs = require('fs');

const content = execSync('git -C C:/Users/samee/Desktop/StratMarket/StratMarket show e9ad2ac:src/lib/data/pineReports.json', { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
const data = JSON.parse(content);

console.log('=== PS-01 DUMP FROM E9AD2AC ===');
const ps01 = data['ps-01'];
console.log('mechLede:', ps01.mechLede);
console.log('mechRows (count):', ps01.mechRows?.length);
console.log('mechRows sample:', JSON.stringify(ps01.mechRows?.slice(0, 2), null, 2));
console.log('kpis (count):', ps01.kpis?.length);
console.log('kpis sample:', JSON.stringify(ps01.kpis?.slice(0, 4), null, 2));
console.log('longStats:', JSON.stringify(ps01.longStats, null, 2));
console.log('shortStats:', JSON.stringify(ps01.shortStats, null, 2));
console.log('regimes:', JSON.stringify(ps01.regimes, null, 2));
console.log('yearly:', JSON.stringify(ps01.yearly, null, 2));
console.log('scriptData keys:', Object.keys(ps01.scriptData || {}));
console.log('scriptData sample (without huge arrays):');
for (const k of Object.keys(ps01.scriptData || {})) {
  const val = ps01.scriptData[k];
  if (Array.isArray(val)) {
    console.log(`  ${k}: array of length ${val.length}, sample:`, JSON.stringify(val.slice(0, 2)));
  } else {
    console.log(`  ${k}:`, val);
  }
}

