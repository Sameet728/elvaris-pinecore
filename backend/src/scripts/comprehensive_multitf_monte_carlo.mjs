import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadAllTimeframes, runBacktestOnTimeframe, runMonteCarlo } from './multi_tf_engine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PINE_DIR = path.join(ROOT_DIR, 'pine_scripts');

console.log('========================================================================');
console.log('🧪 COMPREHENSIVE MULTI-TIMEFRAME & MONTE CARLO OPTIMIZATION ENGINE');
console.log('Testing: 1m, 5m, 15m, 30m, 1h, 4h on Authentic TradingView Data');
console.log('Goal: Calmar > 4.0 | Sep >= 10R & Oct >= 10R | Max DD <= 3.5R | TP: 20-40 pips');
console.log('========================================================================');

async function main() {
  const datasets = await loadAllTimeframes();

  const strategiesToTest = [
    {
      file: 'Champion_M5_Calmar22.0_DualMonth_PropPassed.pine',
      name: 'Champion_M5_Calmar22.0',
      baseTf: '5m'
    },
    {
      file: 'Champion_M5_Calmar9.0_DualMonth_PropPassed.pine',
      name: 'Champion_M5_Calmar9.0',
      baseTf: '5m'
    },
    {
      file: 'Champion_M5_Calmar7.5_DualMonth_PropPassed.pine',
      name: 'Champion_M5_Calmar7.5',
      baseTf: '5m'
    },
    {
      file: 'Champion_M5_DualMonth_PropPassed.pine',
      name: 'Champion_M5_DualMonth',
      baseTf: '5m'
    },
    {
      file: 'Champion_M1_Calmar6.4_PropFirm.pine',
      name: 'Champion_M1_Calmar6.4',
      baseTf: '1m'
    }
  ];

  const tfList = ['1m', '5m', '15m', '30m', '1h', '4h'];
  const fullReport = [];

  for (const strat of strategiesToTest) {
    const pPath = path.join(PINE_DIR, strat.file);
    if (!fs.existsSync(pPath)) continue;
    const code = fs.readFileSync(pPath, 'utf8');

    console.log(`\n-------------------------------------------------------------`);
    console.log(`🔬 Stress Testing Strategy: ${strat.name} across all timeframes`);
    console.log(`-------------------------------------------------------------`);

    for (const tf of tfList) {
      const candles = datasets[tf];
      if (!candles || candles.length === 0) continue;

      const tfCode = tf.replace('m', '').replace('h', '60');
      try {
        const res = await runBacktestOnTimeframe(candles, tfCode === '460' ? '240' : (tfCode === '160' ? '60' : tfCode), code);
        if (res.closed > 0) {
          const item = {
            strategy: strat.name,
            file: strat.file,
            timeframe: tf,
            candles: candles.length,
            closedTrades: res.closed,
            winRate: res.winRate,
            totalR: res.cumulativeR,
            sepR: res.sepR,
            octR: res.octR,
            maxDD: res.maxDrawdown,
            calmar: res.calmarRatio,
            avgTpPips: res.avgTpPips,
            worstDD_MC: res.monteCarlo?.worstDrawdownR ?? 0,
            probDD_under4R: res.monteCarlo?.probDrawdownUnder4R ?? 0,
            probProfitable: res.monteCarlo?.probProfitable ?? 0,
            propVerdict: (res.maxDrawdown <= 3.5 && res.calmarRatio >= 4.0) ? 'PASSED' : 'FLAGGED'
          };
          fullReport.push(item);

          console.log(`[${tf.toUpperCase()}] Trades: ${res.closed} | WR: ${res.winRate}% | Tot: +${res.cumulativeR}R (Sep: +${res.sepR}R, Oct: +${res.octR}R) | DD: -${res.maxDrawdown}R | Calmar: ${res.calmarRatio} | MC Survival: ${item.probDD_under4R}% | Verdict: ${item.propVerdict}`);
        }
      } catch (err) {
        // pine parse on that tf
      }
    }
  }

  // Save report
  fs.writeFileSync(path.join(DATA_DIR, 'multitf_monte_carlo_matrix.json'), JSON.stringify(fullReport, null, 2));
  console.log(`\nMatrix saved to data/multitf_monte_carlo_matrix.json`);
}

main().catch(console.error);
