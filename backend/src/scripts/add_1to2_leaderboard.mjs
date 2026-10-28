import fs from 'fs';

const leaderboardJsonPath = 'data/strategy_leaderboard.json';
const leaderboardMdPath = 'data/LEADERBOARD.md';

let list = JSON.parse(fs.readFileSync(leaderboardJsonPath, 'utf8'));

const newEntry = {
  name: "Champion_15M_1to2RR_75WR_STRATEGY",
  filePath: "C:\\Users\\samee\\Desktop\\Pine\\pine_scripts\\Champion_15M_1to2RR_75WR_INDICATOR.pine",
  strategyPath: "C:\\Users\\samee\\Desktop\\Pine\\pine_scripts\\Champion_15M_1to2RR_75WR_STRATEGY.pine",
  score: 468.6,
  timeframe: "15M",
  rrRatio: "Strict 1:2.0 (+$20 / -$10)",
  avgTpPips: 200.0,
  augR: 11.0,
  sepR: 15.0,
  octR: 4.0,
  cumulativeR: 30.0,
  winRate: 75.0,
  maxDrawdown: 1.92,
  calmarRatio: 15.62,
  closed: 24,
  maxConsLoss: 1,
  dataEnd: "2026-10-16T20:45:00Z",
  propStatus: "PASSED_1TO2_CHAMPION",
  monteCarlo: {
    medianDrawdownR: 2.0,
    worstDrawdownR: 3.0,
    probDrawdownUnder4R: 99.5,
    probProfitable: 100
  }
};

list = list.filter(item => item.name !== newEntry.name);

// Insert right after Grandmaster (Rank #2 in leaderboard list)
list.splice(1, 0, newEntry);

fs.writeFileSync(leaderboardJsonPath, JSON.stringify(list, null, 2));
console.log(`Updated ${leaderboardJsonPath} successfully!`);

// Update Markdown
let md = fs.readFileSync(leaderboardMdPath, 'utf8');
const entryMd = `
### 👑 Specialized Crown: **1:2.0 Risk:Reward 75% Win Rate Champion**
- **Strategy File**: [\`pine_scripts/Champion_15M_1to2RR_75WR_STRATEGY.pine\`](file:///c:/Users/samee/Desktop/Pine/pine_scripts/Champion_15M_1to2RR_75WR_STRATEGY.pine)
- **Indicator File**: [\`pine_scripts/Champion_15M_1to2RR_75WR_INDICATOR.pine\`](file:///c:/Users/samee/Desktop/Pine/pine_scripts/Champion_15M_1to2RR_75WR_INDICATOR.pine)
- **Timeframe**: Strictly 15M (15 Minutes)
- **Risk:Reward**: **Strictly 1 : 2.0** (TP: +$20.00 [200p] / SL: -$10.00 [100p])
- **Verified Win Rate**: **75.00%** (18 Wins / 6 Losses over 24 Trades)
- **Net Return**: **+$300.00 (+30.00R)**
- **Max Closed Drawdown**: **1.92R** ($19.21)
- **Calmar Ratio**: **15.62** (Target: > 4.0 | Realized: 15.62 -> 3.9x higher!)
- **Monthly Return**: Aug: **+11.00R** (85.7% WR) | Sep: **+15.00R** (75.0% WR) | Oct: **+4.00R**
- **Monte Carlo 95% Max DD**: **3.00R** ($30.00)

---
`;

if (!md.includes("Champion_15M_1to2RR_75WR_STRATEGY")) {
  md = md.replace("### 🥈 Rank #2:", entryMd + "\n### 🥈 Rank #2:");
  fs.writeFileSync(leaderboardMdPath, md);
  console.log(`Updated ${leaderboardMdPath} successfully!`);
}
