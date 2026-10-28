import fs from 'fs';

const d = JSON.parse(fs.readFileSync('src/scripts/comparison_results.json'));
const c3 = d.case3.trades;
const c1 = d.case1.trades;
const c2 = d.case2.trades;

console.log('### OVERALL PERFORMANCE COMPARISON TABLE\n');
console.log('| Metric | Case 3: Original (Midpoint Entry, 1:2 RR) | Case 1: Close Entry (Orig TP/SL, Dynamic RR) | Case 2: Close Entry (Recalculated 1:2 RR) |');
console.log('| :--- | :---: | :---: | :---: |');

const s3 = d.case3.summary;
const s1 = d.case1.summary;
const s2 = d.case2.summary;

// Calculate dynamic R for case 1 accurately
const octR1 = Number(s1.monthly?.find(m => m.month === '2026-10')?.returnsR?.toFixed(2) || '0');
const sepR1 = Number(s1.monthly?.find(m => m.month === '2026-09')?.returnsR?.toFixed(2) || '0');
const totalR1 = Number((octR1 + sepR1).toFixed(2));

console.log(`| **Win Rate** | **${s3.winRate}%** | **${s1.winRate}%** | **${s2.winRate}%** |`);
console.log(`| **Wins / Losses** | ${s3.wins} W / ${s3.losses} L | ${s1.wins} W / ${s1.losses} L | ${s2.wins} W / ${s2.losses} L |`);
console.log(`| **Open / Expired** | ${s3.open} Open / ${s3.expired} Exp | ${s1.open} Open / ${s1.expired} Exp | ${s2.open} Open / ${s2.expired} Exp |`);
console.log(`| **Total Trades** | ${c3.length} | ${c1.length} | ${c2.length} |`);
console.log(`| **Total Cumulative Returns** | **+${s3.cumulativeR} R** | **+${totalR1} R** | **+${s2.cumulativeR} R** |`);
console.log(`| **Oct 2026 Returns** | **+${s3.monthly.find(m => m.month === '2026-10').returnsR} R** (${s3.monthly.find(m => m.month === '2026-10').winRate}%) | **+${octR1} R** (${s1.monthly.find(m => m.month === '2026-10').winRate}%) | **+${s2.monthly.find(m => m.month === '2026-10').returnsR} R** (${s2.monthly.find(m => m.month === '2026-10').winRate}%) |`);
console.log(`| **Sep 2026 Returns** | **+${s3.monthly.find(m => m.month === '2026-09').returnsR} R** (${s3.monthly.find(m => m.month === '2026-09').winRate}%) | **${sepR1} R** (${s1.monthly.find(m => m.month === '2026-09').winRate}%) | **${s2.monthly.find(m => m.month === '2026-09').returnsR} R** (${s2.monthly.find(m => m.month === '2026-09').winRate}%) |`);
console.log(`| **Profit Factor** | **${s3.profitFactor}** | **${s1.profitFactor}** | **${s2.profitFactor}** |`);

console.log('\n\n### OCTOBER 2026 DETAILED TRADE-BY-TRADE BREAKDOWN\n');
console.log('| # | Date & Time (IST) | Dir | Case 3 (Midpoint 1:2) | Case 1 (Close Dynamic RR) | Case 2 (Close 1:2 RR) | Key Difference / Note |');
console.log('| :---: | :--- | :---: | :--- | :--- | :--- | :--- |');

const oct3 = c3.filter(t => new Date(t.time).getMonth() === 9).reverse();
oct3.forEach((t, i) => {
  const timeIST = new Date(t.time + 5.5 * 3600000).toISOString().replace('T', ' ').slice(0, 16);
  const match1 = c1.find(x => Math.abs(x.time - t.time) <= 900000 && x.direction === t.direction);
  const match2 = c2.find(x => Math.abs(x.time - t.time) <= 900000 && x.direction === t.direction);

  const c3Str = `Entry: ${t.entryPrice}<br>TP: ${t.takeProfit}<br>**${t.result}** (${t.profitR > 0 ? '+' : ''}${t.profitR}R)`;
  
  // Calculate exact dynamic R for case 1
  let c1R = 0;
  if (match1) {
    if (match1.result === 'WIN') {
      const risk = Math.abs(match1.entryPrice - match1.stopLoss);
      const rew = Math.abs(match1.takeProfit - match1.entryPrice);
      c1R = Number((rew / risk).toFixed(2));
    } else if (match1.result === 'LOSS') {
      c1R = -1.0;
    }
  }
  const c1Str = match1 ? `Entry: ${match1.entryPrice}<br>TP: ${match1.takeProfit}<br>**${match1.result}** (${c1R > 0 ? '+' : ''}${c1R}R)` : 'No Entry';
  const c2Str = match2 ? `Entry: ${match2.entryPrice}<br>TP: ${match2.takeProfit}<br>**${match2.result}** (${match2.profitR > 0 ? '+' : ''}${match2.profitR}R)` : 'No Entry';

  let note = '';
  if (t.time === oct3[4]?.time) {
    note = 'Your screenshot trade (05 Oct 10:40). All 3 hit SL at 11:10.';
  } else if (match2 && match2.result === 'LOSS' && t.result === 'WIN') {
    note = 'TP pushed too far in Case 2; price reversed to SL.';
  } else if (match1 && match1.result === 'WIN' && c1R < 1.0) {
    note = `Close entry reduced reward (${c1R}R vs +2.0R).`;
  } else {
    note = 'Identical outcome direction.';
  }

  console.log(`| ${i + 1} | ${timeIST} | ${t.direction === 'LONG' ? '🟢 LONG' : '🔴 SHORT'} | ${c3Str} | ${c1Str} | ${c2Str} | ${note} |`);
});
