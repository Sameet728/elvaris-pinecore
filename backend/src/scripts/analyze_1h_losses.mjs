import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_1h_tv.json', 'utf8'));
const code = fs.readFileSync('pine_scripts/Champion_1H_Pure_Sovereign_STRATEGY.pine', 'utf8');

async function analyzeLosses() {
  const p = new PineTS(candles, 'XAUUSD', '60');
  await p.ready();
  const res = await p.run(code);
  const s = res.strategy;
  const trades = s.closedtrades || [];
  const losses = trades.filter(t => t.profit <= 0);
  const wins = trades.filter(t => t.profit > 0);

  console.log(`Total Trades: ${trades.length} | Wins: ${wins.length} | Losses: ${losses.length}`);
  console.log(`Win Rate: ${((wins.length / trades.length) * 100).toFixed(2)}%`);

  // Analyze loss distribution
  let consecutiveLosses = 0;
  let maxConsecLoss = 0;
  let consecLossDist = {};
  let currentStreak = 0;

  trades.forEach(t => {
    if (t.profit <= 0) {
      currentStreak++;
      if (currentStreak > maxConsecLoss) maxConsecLoss = currentStreak;
    } else {
      if (currentStreak > 0) {
        consecLossDist[currentStreak] = (consecLossDist[currentStreak] || 0) + 1;
      }
      currentStreak = 0;
    }
  });
  if (currentStreak > 0) {
    consecLossDist[currentStreak] = (consecLossDist[currentStreak] || 0) + 1;
  }

  console.log('Max Consecutive Losses:', maxConsecLoss);
  console.log('Consecutive Loss Streaks Distribution:', consecLossDist);

  // Print worst 10 losses
  const sortedLosses = [...losses].sort((a, b) => a.profit - b.profit);
  console.log('\n--- TOP 10 WORST LOSSES ---');
  sortedLosses.slice(0, 10).forEach(l => {
    console.log(`Date: ${new Date(l.entry_time).toISOString()} | PnL: $${l.profit.toFixed(2)} | Entry: ${l.entry_price.toFixed(2)} | Exit: ${l.exit_price.toFixed(2)}`);
  });
}

analyzeLosses().catch(console.error);
