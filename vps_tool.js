const { execFileSync } = require('child_process');

const SSH_KEY = 'C:\\Users\\samee\\.ssh\\statmarket.key';
const SSH_HOST = 'ubuntu@130.210.35.246';

function runRemote(cmd) {
  const args = [
    '-i', SSH_KEY,
    '-o', 'StrictHostKeyChecking=no',
    SSH_HOST,
    cmd
  ];
  return execFileSync('ssh', args, { encoding: 'utf-8' });
}

function scpUpload(localPath, remotePath) {
  const args = [
    '-i', SSH_KEY,
    '-o', 'StrictHostKeyChecking=no',
    localPath,
    `${SSH_HOST}:${remotePath}`
  ];
  return execFileSync('scp', args, { encoding: 'utf-8' });
}

module.exports = { runRemote, scpUpload };

if (require.main === module) {
  const arg = process.argv[2] || 'uptime';
  console.log(runRemote(arg));
}
