const { runRemote } = require('./vps_tool');

console.log('Restarting PM2 processes on VPS...');
console.log(runRemote('pm2 restart all'));

console.log('\nPM2 Status:');
console.log(runRemote('pm2 status'));

console.log('\nPM2 Supervisor Logs (last 35 lines):');
console.log(runRemote('pm2 logs stratmarket-vps-supervisor --lines 35 --nostream'));

