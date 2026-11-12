const { scpUpload, runRemote } = require('./vps_tool');

console.log('Uploading pine_evaluator.ts...');
scpUpload('pine_evaluator.ts', '/opt/stratmarket/vps/pine_runner/pine_evaluator.ts');

console.log('Uploading config.json...');
scpUpload('vps_config.json', '/opt/stratmarket/vps/config.json');

console.log('Checking runner.ts on VPS...');
// Let us update runner.ts console message to reflect Champion 3-Strategy portfolio
const runnerUpdate = `sed -i 's/Grandmaster, Apex, Strict 1:2 R:R, Elite/Grandmaster Dual10R, US Afternoon Reversal, London Core Expansion/g' /opt/stratmarket/vps/runner.ts`;
console.log(runRemote(runnerUpdate));

console.log('Upload complete.');

