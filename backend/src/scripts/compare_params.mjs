import fs from 'fs';

const f1 = fs.readFileSync('pine_scripts/Champion_1H_Pure_Sovereign_STRATEGY.pine', 'utf8');
const f2 = fs.readFileSync('backend/src/scripts/verify_smooth_growth_champion.mjs', 'utf8');

console.log('--- F1 Inputs ---');
f1.split('\n').slice(20, 45).forEach(l => console.log(l));

console.log('--- F2 Inputs ---');
f2.split('\n').slice(5, 25).forEach(l => console.log(l));
