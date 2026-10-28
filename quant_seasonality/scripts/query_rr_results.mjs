import fs from 'fs';

const list = JSON.parse(fs.readFileSync('quant_seasonality/data/strict_rr_ge_1_cagr_30_leaderboard.json', 'utf8'));

console.log(`Total candidates: ${list.length}`);

// Group by asset and timeframe
const byAssetTF = {};
for (const s of list) {
  const k = `${s.asset}_${s.timeframe}`;
  if (!byAssetTF[k]) byAssetTF[k] = [];
  byAssetTF[k].push(s);
}

for (const [k, arr] of Object.entries(byAssetTF)) {
  console.log(`\n=== Asset/TF: ${k} (Total: ${arr.length}) ===`);
  // Sort by Win Rate
  arr.sort((a, b) => b.wr - a.wr);
  arr.slice(0, 3).forEach((s, idx) => {
    console.log(`  #${idx+1}: ${s.name}`);
    console.log(`     WR: ${s.wr.toFixed(2)}% | Realized RR: ${s.realizedRR.toFixed(2)}:1 (Planned: ${s.plannedRR})`);
    console.log(`     CAGR: +${s.cagr.toFixed(2)}%/yr | MaxDD: ${s.maxDD.toFixed(2)}% | Calmar: ${s.calmar.toFixed(2)} | Trades: ${s.tradesCount}`);
    console.log(`     Rules: ${s.setup} | ${s.riskRules}`);
  });
}
