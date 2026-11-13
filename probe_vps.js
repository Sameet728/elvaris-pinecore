const { execSync } = require('child_process');

const hosts = [
  '98.94.8.157',
  '100.53.131.150',
  '44.195.128.243',
  '54.221.113.112',
  '3.108.220.73',
  '13.232.82.86',
  '13.203.209.243',
  '130.210.35.246',
  '137.23.45.131'
];
const keys = [
  'C:\\Users\\samee\\Desktop\\elvariscapital.pem',
  'C:\\Users\\samee\\.ssh\\statmarket.key',
  'C:\\Users\\samee\\.ssh\\sameet1_new'
];
const users = ['ubuntu', 'root', 'ec2-user'];

console.log('Probing hosts...');
for (const h of hosts) {
  for (const k of keys) {
    for (const u of users) {
      try {
        const cmd = `ssh -i "${k}" -o ConnectTimeout=2 -o StrictHostKeyChecking=no ${u}@${h} "uptime"`;
        const res = execSync(cmd, { timeout: 3500, stdio: ['pipe', 'pipe', 'ignore'] }).toString();
        console.log(`SUCCESS: ${u}@${h} with ${k} => ${res.trim()}`);
        process.exit(0);
      } catch (e) {
      }
    }
  }
}
console.log('Done probing. No active hosts found in known list.');
