import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runTimeframeSim, runMonteCarlo } from './comprehensive_multitf_master_evaluator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

async function search4Hand1M() {
  const timeframes = [
    {
      tf: '4H',
      file: 'xauusd_4h_tv.json',
      tpList: [120, 150, 180, 200, 250],
      emaList: [50, 100],
      swList: [[2, 3], [2, 4]],
      beList: [0.3, 0.5, 0.8],
      lockTriggerList: [0.8, 1.0, 1.2],
      lockValList: [0.6, 0.8],
      coolList: [4, 6]
    },
    {
      tf: '1M',
      file: 'xauusd_1m_tv.json',
      tpList: [25, 30, 40, 50],
      emaList: [50, 100],
      swList: [[3, 5], [4, 6], [5, 10]],
      beList: [0.3, 0.4, 0.5],
      lockTriggerList: [0.8, 1.0],
      lockValList: [0.6, 0.8],
      coolList: [15, 30]
    }
  ];

  const results = {};

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
                    maxHoldBars: item.tf === '4H' ? 90 : 45
                  };

                  const res = runTimeframeSim(candles, cfg);
                  if (res.closed >= 15 && res.maxDrawdown <= 5.0 && res.calmarRatio >= 4.0 && res.cumulativeR > 10.0) {
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
      candidates.sort((a, b) => b.winRate - a.winRate || b.score - a.score);
      const topWR = candidates[0];
      candidates.sort((a, b) => b.score - a.score);
      const topScore = candidates[0];
      topWR.mc = runMonteCarlo(topWR.trades, 5000);
      topScore.mc = runMonteCarlo(topScore.trades, 5000);

      results[item.tf] = { topWR, topScore };

      console.log(`[Top WR on ${item.tf}] WR: ${topWR.winRate}% (Non-loss: ${topWR.nonLossRate}%) | Net: +${topWR.cumulativeR}R | Calmar: ${topWR.calmarRatio} | Max DD: -${topWR.maxDrawdown}R | Max Wins: ${topWR.maxConsecWin} | Max Losses: ${topWR.maxConsecLoss} | MC 95% DD: -${topWR.mc.worstDD95}R | Config: EMA${topWR.config.emaPeriod}, Sw:${topWR.config.swMin}_${topWR.config.swMaj}, TP:${topWR.config.tpPips}p`);
      console.log(`[Top Score on ${item.tf}] Score: ${topScore.score} | WR: ${topScore.winRate}% | Net: +${topScore.cumulativeR}R | Calmar: ${topScore.calmarRatio} | Max DD: -${topScore.maxDrawdown}R | Max Wins: ${topScore.maxConsecWin} | Max Losses: ${topScore.maxConsecLoss} | MC 95% DD: -${topScore.mc.worstDD95}R | Config: EMA${topScore.config.emaPeriod}, Sw:${topScore.config.swMin}_${topScore.config.swMaj}, TP:${topScore.config.tpPips}p`);
    }
  }

  fs.writeFileSync(path.join(DATA_DIR, 'extra_tf_champions_oct14.json'), JSON.stringify(results, null, 2));
}

search4Hand1M().catch(console.error);
