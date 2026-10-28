import fs from 'fs';

async function verifyPine(scriptPath) {
  const script = fs.readFileSync(scriptPath, 'utf8');
  const res = await fetch('http://localhost:3001/api/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script, engine: 'auto' })
  }).then(r => r.json());

  console.log(`\n=== Verification: ${scriptPath} ===`);
  console.log('Execute success:', res.success);
  console.log('Engine used:', res.engineUsed);
  if (res.error) console.error('Execution Error:', res.error);
  if (res.backtest?.summary) console.log('Summary:', res.backtest.summary);
  console.log('Trades count:', res.backtest?.trades?.length);
  console.log('Boxes count:', res.drawings?.boxes?.length);
  console.log('Labels count:', res.drawings?.labels?.length);
  if (res.drawings?.labels?.length > 0) {
    console.log('Sample label:', res.drawings.labels[res.drawings.labels.length - 1]);
  }
}

async function main() {
  await verifyPine('pine_scripts/Champion_80to100Pip_Dual10R_PropPassed.pine');
  await verifyPine('pine_scripts/Champion_80to100Pip_Dual10R_STRATEGY_NativeOrders.pine');
}

main().catch(console.error);
