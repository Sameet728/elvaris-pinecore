import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runTimeframeSim, runMonteCarlo } from './comprehensive_multitf_master_evaluator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

async function searchHTF() {
  const timeframes = [
    {
      tf: '15M',
      file: 'xauusd_15m_tv.json',
      tpList: [35, 45, 50, 60, 75, 80],
      emaList: [50, 100, 150, 200],
      swList: [[2, 4], [3, 5], [3, 7], [4, 6]],
      beList: [0.3, 0.4, 0.5, 0.8, 1.0],
      lockTriggerList: [0.8, 1.0, 1.2, 1.4],
      lockValList: [0.6, 0.8, 1.0],
      coolList: [6, 10, 14]
    },
    {
      tf: '30M',
      file: 'xauusd_30m_tv.json',
      tpList: [50, 60, 80, 100, 120],
      emaList: [50, 100, 150],
      swList: [[2, 3], [2, 4], [3, 5]],
      beList: [0.3, 0.4, 0.5, 0.8, 1.0],
      lockTriggerList: [0.8, 1.0, 1.2, 1.4],
      lockValList: [0.6, 0.8, 1.0],
      coolList: [4, 8, 12]
    },
    {
      tf: '1H',
      file: 'xauusd_1h_tv.json',
      tpList: [60, 80, 100, 120, 150],
      emaList: [50, 100, 150],
      swList: [[2, 3], [2, 4], [3, 5]],
      beList: [0.3, 0.4, 0.5, 0.8, 1.0],
      lockTriggerList: [0.8, 1.0, 1.2, 1.4],
      lockValList: [0.6, 0.8, 1.0],
      coolList: [4, 8, 12]
    }
  ];

  const bestHTF = {};

  for (const item of timeframes) {
    const candles = JSON.parse(fs.readFileSync(path.join(DATA_DIR, item.file), 'utf8'));
    console.log(`\nSearching best setups on ${item.tf} (${candles.length} bars)...`);

    const candidates = [];

    for (const emaPeriod of item.emaList) {
      for (const [swMin, swMaj] of item.swList) {
        for (const tpPips of item.tpList) {
          for (const beTriggerR of item.beList) {
            for (const lockInTriggerR of item.lockTriggerList) {
              if (lockInTriggerR <= beTriggerR) continue;
              for (const lockInValR of item.lockValList) {
                if (lockInValR >= lockInTriggerR) continue;
                for (const cooldownBars of item.coolList) {
                  const cfg = {
                    emaPeriod,
                    swMin,
                    swMaj,
                    tpPips,
                    atrMult: 0.18,
                    beTriggerR,
                    lockInTriggerR,
                    lockInValR,
                    cooldownBars,
                    minHoldSec: 120,
                    maxHoldBars: 60
                  };

                  const res = runTimeframeSim(candles, cfg);
                  if (res.closed >= 20 && res.maxDrawdown <= 5.0 && res.calmarRatio >= 4.0 && res.cumulativeR > 15.0) {
                    candidates.push(res);
                  }
                }
              }
            }
          }
        }
      }
    }

    console.log(`Found ${candidates.length} candidates on ${item.tf} passing DD <= 5R and Calmar >= 4.0`);
    if (candidates.length > 0) {
      // Sort by highest win rate and score
      candidates.sort((a, b) => b.winRate - a.winRate || b.score - a.score);
      const topWR = candidates[0];
      candidates.sort((a, b) => b.score - a.score);
      const topScore = candidates[0];
      topWR.mc = runMonteCarlo(topWR.trades, 5000);
      topScore.mc = runMonteCarlo(topScore.trades, 5000);

      bestHTF[item.tf] = { topWR, topScore };

      console.log(`[Top WR on ${item.tf}] WR: ${topWR.winRate}% (Non-loss: ${topWR.nonLossRate}%) | Net: +${topWR.cumulativeR}R | Calmar: ${topWR.calmarRatio} | Max DD: -${topWR.maxDrawdown}R | Max Wins: ${topWR.maxConsecWin} | Max Losses: ${topWR.maxConsecLoss} | MC 95% DD: -${topWR.mc.worstDD95}R (Prob <=5R: ${topWR.mc.probDDUnder5}%) | Config: EMA${topWR.config.emaPeriod}, Sw:${topWR.config.swMin}_${topWR.config.swMaj}, TP:${topWR.config.tpPips}p, Lock:${topWR.config.lockInTriggerR}->+${topWR.config.lockInValR}R`);
      console.log(`[Top Score on ${item.tf}] Score: ${topScore.score} | WR: ${topScore.winRate}% | Net: +${topScore.cumulativeR}R | Calmar: ${topScore.calmarRatio} | Max DD: -${topScore.maxDrawdown}R | Max Wins: ${topScore.maxConsecWin} | Max Losses: ${topScore.maxConsecLoss} | MC 95% DD: -${topScore.mc.worstDD95}R (Prob <=5R: ${topScore.mc.probDDUnder5}%) | Config: EMA${topScore.config.emaPeriod}, Sw:${topScore.config.swMin}_${topScore.config.swMaj}, TP:${topScore.config.tpPips}p, Lock:${topScore.config.lockInTriggerR}->+${topScore.config.lockInValR}R`);
    }
  }

  fs.writeFileSync(path.join(DATA_DIR, 'htf_champions_oct14.json'), JSON.stringify(bestHTF, null, 2));
  console.log('\nSaved HTF champions to data/htf_champions_oct14.json');
}

searchHTF().catch(console.error);
