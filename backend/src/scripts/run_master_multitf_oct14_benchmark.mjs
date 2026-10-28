import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runTimeframeSim } from './comprehensive_multitf_master_evaluator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

async function evaluateAllTimeframes() {
  console.log('Evaluating Multi-Timeframe Master Benchmark across all 6 timeframes (October 14, 2026 data)...');

  const tfDefinitions = [
    {
      tf: '5M-UltraWR',
      name: '5M Sovereign 91.7% Ultra Win-Rate Engine',
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
      tf: '5M-MaxScore',
      name: '5M All-Time Score Champion (Score: 5,886)',
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
      tf: '5M-GreaterTP40p',
      name: '5M Greater TP (40 Pips) 82.7% Win Rate',
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
      tf: '5M-Rec82p',
      name: '5M Double-Digit Calmar 82-Pip Record',
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
      tf: '15M',
      name: '15-Minute Intraday Trend Flow',
      file: 'xauusd_15m_tv.json',
      config: {
        emaPeriod: 200,
        swMin: 3,
        swMaj: 7,
        tpPips: 80,
        atrMult: 0.18,
        beTriggerR: 1.2,
        lockInTriggerR: 1.5,
        lockInValR: 1.2,
        cooldownBars: 16,
        minHoldSec: 120,
        maxHoldBars: 60
      }
    },
    {
      tf: '30M',
      name: '30-Minute Balanced Consistency',
      file: 'xauusd_30m_tv.json',
      config: {
        emaPeriod: 50,
        swMin: 2,
        swMaj: 3,
        tpPips: 100,
        atrMult: 0.18,
        beTriggerR: 1.0,
        lockInTriggerR: 1.4,
        lockInValR: 1.2,
        cooldownBars: 10,
        minHoldSec: 120,
        maxHoldBars: 60
      }
    },
    {
      tf: '1H',
      name: '1-Hour Macro Low-Drawdown Alpha',
      file: 'xauusd_1h_tv.json',
      config: {
        emaPeriod: 100,
        swMin: 2,
        swMaj: 3,
        tpPips: 150,
        atrMult: 0.18,
        beTriggerR: 1.0,
        lockInTriggerR: 1.4,
        lockInValR: 1.2,
        cooldownBars: 8,
        minHoldSec: 120,
        maxHoldBars: 72
      }
    },
    {
      tf: '4H',
      name: '4-Hour Capital Preservation Anchor',
      file: 'xauusd_4h_tv.json',
      config: {
        emaPeriod: 50,
        swMin: 2,
        swMaj: 3,
        tpPips: 250,
        atrMult: 0.18,
        beTriggerR: 1.0,
        lockInTriggerR: 1.4,
        lockInValR: 1.2,
        cooldownBars: 6,
        minHoldSec: 120,
        maxHoldBars: 90
      }
    },
    {
      tf: '1M',
      name: '1-Minute High Frequency Scalper',
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

  const summaryResults = [];

  for (const def of tfDefinitions) {
    const filePath = path.join(DATA_DIR, def.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filePath}`);
      continue;
    }

    const candles = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const t0 = candles[0].openTime || candles[0].time;
    const t1 = candles[candles.length - 1].openTime || candles[candles.length - 1].time;
    const d0 = new Date(t0).toISOString().split('T')[0];
    const d1 = new Date(t1).toISOString().split('T')[0];

    console.log(`\nSimulating ${def.name} (${candles.length} bars, ${d0} to ${d1})...`);
    const res = runTimeframeSim(candles, def.config);

    const out = {
      tfKey: def.tf,
      name: def.name,
      file: def.file,
      bars: candles.length,
      startDate: d0,
      endDate: d1,
      tpPips: def.config.tpPips,
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
      mc: res.mc
    };

    summaryResults.push(out);

    console.log(`[Result] WR: ${out.winRate}% (Non-loss: ${out.nonLossRate}%) | Net: +${out.totalR}R | Sep: +${out.sepR}R | Oct: +${out.octR}R | Calmar: ${out.calmar} | Max DD: -${out.maxDD}R (-${out.eqDD}%) | Max Wins: ${out.maxConsecWin} | Max Losses: ${out.maxConsecLoss} | MC 95% DD: -${out.mc.worstDD95}R (Prob <=5R: ${out.mc.probDDUnder5}%)`);
  }

  const outPath = path.join(DATA_DIR, 'multitf_master_benchmarks_oct14.json');
  fs.writeFileSync(outPath, JSON.stringify(summaryResults, null, 2));
  console.log(`\nSuccessfully exported multi-timeframe benchmarks to ${outPath}`);
}

evaluateAllTimeframes().catch(console.error);
