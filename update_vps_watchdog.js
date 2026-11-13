const { runRemote } = require('./vps_tool');

const patchCode = `
// Periodic Autonomous Parity Watchdog trigger (every 30s)
const RECONCILE_INTERVAL_MS = 30000;
setInterval(async () => {
  try {
    const endpoints = [
      'https://strat-market-chi.vercel.app/api/internal/reconcile',
      'https://stratmarket.elvariscapital.in/api/internal/reconcile'
    ];
    for (const ep of endpoints) {
      try {
        const res = await fetch(ep, { method: 'POST' });
        if (res.ok) break;
      } catch (_) {}
    }
  } catch (_) {}
}, RECONCILE_INTERVAL_MS);
`;

async function update() {
  console.log('Checking current runner.ts on VPS...');
  const current = runRemote('cat /opt/stratmarket/vps/runner.ts');
  if (current.includes('RECONCILE_INTERVAL_MS')) {
    console.log('Watchdog interval already installed in runner.ts');
  } else {
    console.log('Appending watchdog trigger to runner.ts...');
    const appendCmd = `cat << 'EOF' >> /opt/stratmarket/vps/runner.ts
${patchCode}
EOF`;
    runRemote(appendCmd);
    console.log('Restarting PM2 supervisor on VPS...');
    console.log(runRemote('pm2 restart stratmarket-vps-supervisor'));
  }
}

update().catch(console.error);

