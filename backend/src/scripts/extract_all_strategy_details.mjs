import fs from 'fs';
import path from 'path';

const dir = 'pine_scripts';
const files = fs.readdirSync(dir).filter(f => f.startsWith('Champion_') && (f.endsWith('_STRATEGY.pine') || (!f.includes('_INDICATOR.pine') && f.endsWith('.pine'))));

const strategies = [];

for (const file of files) {
  const fullPath = path.join(dir, file);
  const content = fs.readFileSync(fullPath, 'utf8');
  
  // Extract key header lines
  const lines = content.split('\n').slice(0, 40);
  
  let name = file.replace('.pine', '');
  let tf = 'Unknown';
  let winRate = null;
  let rrRatio = 'N/A';
  let netReturn = 'N/A';
  let monthlyReturns = 'N/A';
  let maxDD = 'N/A';
  let calmar = 'N/A';
  let description = '';
  
  for (const line of lines) {
    if (line.includes('Instrument:') || line.includes('Timeframe:')) {
      const tfMatch = line.match(/Timeframe:\s*(?:STRICTLY\s*)?([0-9]+[MH]|Multi-TF|15M|1H|5M|1M|30M|4H)/i);
      if (tfMatch) tf = tfMatch[1].toUpperCase();
    }
    if (tf === 'Unknown') {
      if (file.includes('_15M_') || file.includes('_M15_')) tf = '15M';
      else if (file.includes('_1H_') || file.includes('_H1_')) tf = '1H';
      else if (file.includes('_5M_') || file.includes('_M5_')) tf = '5M';
      else if (file.includes('_1M_') || file.includes('_M1_')) tf = '1M';
      else if (file.includes('_30M_') || file.includes('_M30_')) tf = '30M';
      else if (file.includes('_4H_') || file.includes('_H4_')) tf = '4H';
      else if (file.includes('MultiTF')) tf = 'Multi-TF';
    }
    
    if (line.includes('Win Rate') || line.includes('winrate')) {
      const wrMatch = line.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
      if (wrMatch) winRate = parseFloat(wrMatch[1]);
    }
    if (line.includes('Risk:Reward') || line.includes('Risk to Reward') || line.includes('R:R')) {
      const rrMatch = line.match(/(?:1\s*:\s*[0-9]+(?:\.[0-9]+)?(?:[^\n•|]+)?)/);
      if (rrMatch) rrRatio = rrMatch[0].trim();
    }
    if (line.includes('Net Return') || line.includes('Total Net') || line.includes('Return')) {
      if (line.includes('+') && line.includes('R')) {
        const netMatch = line.match(/\+?[0-9]+(?:\.[0-9]+)?\s*R/);
        if (netMatch && !netReturn.includes('R')) netReturn = line.trim().replace(/^\/\/\s*•?\s*/, '');
      }
    }
    if (line.includes('Monthly') || line.includes('August') || line.includes('September') || line.includes('October')) {
      if (line.includes('Aug') || line.includes('Sep') || line.includes('Oct')) {
        monthlyReturns = line.trim().replace(/^\/\/\s*•?\s*/, '');
      }
    }
    if (line.includes('Drawdown') || line.includes('Max DD')) {
      maxDD = line.trim().replace(/^\/\/\s*•?\s*/, '');
    }
    if (line.includes('Calmar')) {
      calmar = line.trim().replace(/^\/\/\s*•?\s*/, '');
    }
    if (line.startsWith('// ©') || line.startsWith('// Instrument:')) {
      if (!description) description = line.replace('// ©', '').trim();
    }
  }

  strategies.push({
    file,
    name,
    timeframe: tf,
    winRate,
    rrRatio,
    netReturn,
    monthlyReturns,
    maxDD,
    calmar,
    description
  });
}

console.log(JSON.stringify(strategies, null, 2));
