const fs = require('fs');
const scriptStr = fs.readFileSync('frontend/src/components/CodeEditor.tsx', 'utf8');
const match = scriptStr.match(/liquidity_sweep_signals: \{[\s\S]*?script: \`([\s\S]*?)\`/);
const script = match[1];

fetch('http://localhost:3001/api/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ script, maxBars: 7458 }) // Request all available bars
}).then(r => r.json()).then(d => {
  const trades = d.backtest.trades;
  let md = '| Trade # | Date & Time (IST) | Direction | Entry Price | Stop Loss | Take Profit | Result | Profit (R) |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n';
  trades.forEach(t => {
    const dObj = new Date(t.time);
    const dateStr = dObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
    const timeStr = dObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
    const dirStr = t.direction === 'LONG' ? '🟢 LONG' : '🔴 SHORT';
    const entry = t.entryPrice.toLocaleString('en-US', {minimumFractionDigits: 2});
    const sl = t.stopLoss.toLocaleString('en-US', {minimumFractionDigits: 2});
    const tp = t.takeProfit.toLocaleString('en-US', {minimumFractionDigits: 2});
    const res = t.result === 'OPEN' ? '**OPEN**' : (t.result === 'WIN' ? '**WIN**' : 'LOSS');
    const r = (t.profitR > 0 ? '+' : '') + t.profitR.toFixed(1) + ' R';
    md += `| **#${t.id}** | ${dateStr} ${timeStr} | ${dirStr} | ${entry} | ${sl} | ${tp} | ${res} | ${r} |\n`;
  });
  console.log(md);
}).catch(console.error);
