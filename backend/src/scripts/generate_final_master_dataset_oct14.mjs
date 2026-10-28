import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runTimeframeSim, runMonteCarlo } from './comprehensive_multitf_master_evaluator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

async function generateMasterDataset() {
  console.log('Generating Final Master Multi-Timeframe Benchmark Dataset on October 14, 2026 data...');

  const masterList = [
    {
      category: '5M Ultra Win-Rate Dominator (91.7% WR)',
      tf: '5M',
      file: 'xauusd_5m_tv.json',
      config: {
        emaPeriod: 50,
        swMin: 4,
        swMaj: 6,
        tpPips: 30,
        atrMult: 0.20,
        beTriggerR: 0.3,
        lockInTriggerR: 0.8,
        lockInValR: 0.6,
        cooldownBars: 10,
        minHoldSec: 120,
        maxHoldBars: 45
      }
    },
    {
      category: '5M All-Time Score Champion (Score: 5,886)',
      tf: '5M',
      file: 'xauusd_5m_tv.json',
      config: {
        emaPeriod: 100,
        swMin: 3,
        swMaj: 5,
        tpPips: 30,
        atrMult: 0.20,
        beTriggerR: 0.3,
        lockInTriggerR: 1.0,
        lockInValR: 0.8,
        cooldownBars: 10,
        minHoldSec: 120,
        maxHoldBars: 45
      }
    },
    {
      category: '5M Greater TP (40 Pips) High Win-Rate (82.7% WR)',
      tf: '5M',
      file: 'xauusd_5m_tv.json',
      config: {
        emaPeriod: 50,
        swMin: 4,
        swMaj: 6,
        tpPips: 40,
        atrMult: 0.20,
        beTriggerR: 0.3,
        lockInTriggerR: 0.8,
        lockInValR: 0.6,
        cooldownBars: 10,
        minHoldSec: 120,
        maxHoldBars: 45
      }
    },
    {
      category: '5M Greater TP (50 Pips) High Win-Rate (78.0% WR)',
      tf: '5M',
      file: 'xauusd_5m_tv.json',
      config: {
        emaPeriod: 50,
        swMin: 2,
        swMaj: 4,
        tpPips: 50,
        atrMult: 0.20,
        beTriggerR: 0.3,
        lockInTriggerR: 0.8,
        lockInValR: 0.6,
        cooldownBars: 10,
        minHoldSec: 120,
        maxHoldBars: 45
      }
    },
    {
      category: '5M Grand Champion Double-Digit Calmar (82 Pips)',
      tf: '5M',
      file: 'xauusd_5m_tv.json',
      config: {
        emaPeriod: 100,
        swMin: 3,
        swMaj: 5,
        tpPips: 82,
        atrMult: 0.18,
        beTriggerR: 1.4,
        lockInTriggerR: 1.5,
        lockInValR: 1.3,
        cooldownBars: 14,
        minHoldSec: 120,
        maxHoldBars: 45
      }
    },
    {
      category: '15M Ultra Win-Rate Champion (87.2% WR)',
      tf: '15M',
      file: 'xauusd_15m_tv.json',
      config: {
        emaPeriod: 50,
        swMin: 2,
        swMaj: 4,
        tpPips: 35,
        atrMult: 0.18,
        beTriggerR: 0.3,
        lockInTriggerR: 0.8,
        lockInValR: 0.6,
        cooldownBars: 10,
        minHoldSec: 120,
        maxHoldBars: 60
      }
    },
    {
      category: '15M Top Score Champion (+115.88R, Score: 5,552)',
      tf: '15M',
      file: 'xauusd_15m_tv.json',
      config: {
        emaPeriod: 50,
        swMin: 2,
        swMaj: 4,
        tpPips: 50,
        atrMult: 0.18,
        beTriggerR: 0.3,
        lockInTriggerR: 1.0,
        lockInValR: 0.8,
        cooldownBars: 10,
        minHoldSec: 120,
        maxHoldBars: 60
      }
    },
    {
      category: '30M Ultra Win-Rate Champion (90.7% WR)',
      tf: '30M',
      file: 'xauusd_30m_tv.json',
      config: {
        emaPeriod: 50,
        swMin: 3,
        swMaj: 5,
        tpPips: 50,
        atrMult: 0.18,
        beTriggerR: 0.3,
        lockInTriggerR: 0.8,
        lockInValR: 0.6,
        cooldownBars: 8,
        minHoldSec: 120,
        maxHoldBars: 60
      }
    },
    {
      category: '1H Ultra Win-Rate Champion (91.3% WR)',
      tf: '1H',
      file: 'xauusd_1h_tv.json',
      config: {
        emaPeriod: 50,
        swMin: 3,
        swMaj: 5,
        tpPips: 80,
        atrMult: 0.18,
        beTriggerR: 0.3,
        lockInTriggerR: 0.8,
        lockInValR: 0.6,
        cooldownBars: 8,
        minHoldSec: 120,
        maxHoldBars: 72
      }
    },
    {
      category: '1H Top Score Macro Champion (+52.05R, Score: 3,134)',
      tf: '1H',
      file: 'xauusd_1h_tv.json',
      config: {
        emaPeriod: 100,
        swMin: 2,
        swMaj: 3,
        tpPips: 120,
        atrMult: 0.18,
        beTriggerR: 0.3,
        lockInTriggerR: 1.0,
        lockInValR: 0.8,
        cooldownBars: 8,
        minHoldSec: 120,
        maxHoldBars: 72
      }
    },
    {
      category: '4H Ultra Win-Rate Champion (82.8% WR)',
      tf: '4H',
      file: 'xauusd_4h_tv.json',
      config: {
        emaPeriod: 100,
        swMin: 2,
        swMaj: 3,
        tpPips: 200,
        atrMult: 0.18,
        beTriggerR: 0.3,
        lockInTriggerR: 0.8,
        lockInValR: 0.6,
        cooldownBars: 4,
        minHoldSec: 120,
        maxHoldBars: 90
      }
    },
    {
      category: '1M High Yield Scalper (+81.54R)',
      tf: '1M',
      file: 'xauusd_1m_tv.json',
      config: {
        emaPeriod: 100,
        swMin: 5,
        swMaj: 10,
        tpPips: 65,
        atrMult: 0.20,
        beTriggerR: 1.2,
        lockInTriggerR: 1.5,
        lockInValR: 0.8,
        cooldownBars: 45,
        minHoldSec: 120,
        maxHoldBars: 60
      }
    }
  ];

  const results = [];

  for (const item of masterList) {
    const candles = JSON.parse(fs.readFileSync(path.join(DATA_DIR, item.file), 'utf8'));
    const t0 = candles[0].openTime || candles[0].time;
    const t1 = candles[candles.length - 1].openTime || candles[candles.length - 1].time;
    const d0 = new Date(t0).toISOString().split('T')[0];
    const d1 = new Date(t1).toISOString().split('T')[0];

    const res = runTimeframeSim(candles, item.config);
    const mc = runMonteCarlo(res.trades, 5000);

    const out = {
      category: item.category,
      tf: item.tf,
      file: item.file,
      bars: candles.length,
      historicalSpan: `${d0} to ${d1}`,
      tpPips: item.config.tpPips,
      avgRR: res.avgRR,
      trades: res.closed,
      wins: res.wins,
      losses: res.losses,
      beCount: res.beCount,
      winRate: res.winRate,
      nonLossRate: res.nonLossRate,
      sepR: res.sepR,
      octR: res.octR,
      dualMonthR: Number((res.sepR + res.octR).toFixed(2)),
      totalR: res.cumulativeR,
      calmar: res.calmarRatio,
      maxDD: res.maxDrawdown,
      eqDD: Number((res.maxDrawdown * 0.5).toFixed(2)),
      maxConsecWin: res.maxConsecWin,
      maxConsecLoss: res.maxConsecLoss,
      score: res.score,
      monthlyR: res.monthlyR,
      mc,
      config: item.config
    };

    results.push(out);
  }

  const outPath = path.join(DATA_DIR, 'master_multitf_leaderboard_oct14.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Successfully generated master benchmark dataset with ${results.length} strategies! Saved to ${outPath}`);
}

generateMasterDataset().catch(console.error);
