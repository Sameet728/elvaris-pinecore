const { scpUpload, runRemote } = require('./vps_tool');
const path = require('path');

const files = [
  'Champion_15M_Grandmaster_Dual10R_Oct8R_STRATEGY.pine',
  'Champion_15M_Grandmaster_Dual10R_Oct8R_INDICATOR.pine',
  'Champion_15M_US_Momentum_STRATEGY.pine',
  'Champion_15M_London_Core_STRATEGY.pine'
];

for (const file of files) {
  const local = path.join(__dirname, '15M_Champion_Strategies', file);
  const remote = `/opt/stratmarket/vps/strategies/${file}`;
  console.log(`Uploading ${file} -> ${remote}...`);
  scpUpload(local, remote);
}

console.log('Verifying remote files:');
console.log(runRemote('ls -la /opt/stratmarket/vps/strategies/'));

