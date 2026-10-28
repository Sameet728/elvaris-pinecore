import fs from 'fs';

const f1 = fs.readFileSync('pine_scripts/Champion_1H_Pure_Sovereign_STRATEGY.pine', 'utf8');
const f2 = fs.readFileSync('backend/src/scripts/verify_smooth_growth_champion.mjs', 'utf8');
const code2 = f2.split('const code = `')[1].split('`;')[0];

const lines1 = f1.split('\n');
const lines2 = code2.split('\n');

console.log('F1 line count:', lines1.length, 'F2 line count:', lines2.length);

// Compare logic lines
['longCond', 'shortCond', 'if longSig', 'if shortSig', 'if strategy.position_size != 0', 'strategy.exit'].forEach(term => {
  console.log(`\n=== MATCH FOR: ${term} ===`);
  console.log('F1:', lines1.filter(l => l.includes(term)));
  console.log('F2:', lines2.filter(l => l.includes(term)));
});
