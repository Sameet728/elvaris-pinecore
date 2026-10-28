import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeATR, simulateDualPivot } from './fast_evaluator.mjs';
import { runBacktestOnTimeframe } from './multi_tf_engine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PINE_DIR = path.join(ROOT_DIR, 'pine_scripts');
const LEADERBOARD_JSON = path.join(DATA_DIR, 'strategy_leaderboard.json');

const c5 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_5m_tv.json'), 'utf8'));
const c15 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_15m_tv.json'), 'utf8'));
const c30 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_30m_tv.json'), 'utf8'));

console.log(`Loaded authentic data: 5M=${c5.length}, 15M=${c15.length}, 30M=${c30.length}`);

const atr5 = computeATR(c5, 14);
const atr15 = computeATR(c15, 14);
const atr30 = computeATR(c30, 14);

const tfDatasets = [
  { tf: '5', name: 'M5', candles: c5, atr: atr5 },
  { tf: '15', name: 'M15', candles: c15, atr: atr15 },
  { tf: '30', name: 'M30', candles: c30, atr: atr30 }
];

console.log(`Searching for 80-100 Pip TP Strategies (Sep >= 10R, Oct >= 10R, Calmar > 4.0, MaxDD <= 3.5R)...`);

const swMinVals = [3, 4, 5];
const swMajVals = [7, 8, 9, 10];
const rrVals = [2.8, 3.0, 3.3, 3.5];
const atrMultVals = [0.35, 0.40, 0.45, 0.50];
const expireVals = [25, 35, 45];
const minTpVals = [7.5, 8.0]; // 75 to 80 pips
const maxTpVals = [10.0, 11.0, 12.0]; // 100 to 120 pips

const candidates = [];
const allHits = [];
let evaluated = 0;
const tStart = Date.now();

for (const tfObj of tfDatasets) {
  console.log(`\nScanning Timeframe: ${tfObj.name}...`);
  for (const swMin of swMinVals) {
    for (const swMaj of swMajVals) {
      if (swMaj <= swMin) continue;
      for (const rr of rrVals) {
        for (const atrMult of atrMultVals) {
          for (const expireBars of expireVals) {
            for (const minTp of minTpVals) {
              for (const maxTp of maxTpVals) {
                evaluated++;
                const res = simulateDualPivot(tfObj.candles, tfObj.atr, {
                  swMin, swMaj, rr, atrMult, expireBars, minTp, maxTp, minHoldSeconds: 120
                });

                if (res.closed >= 4 && res.avgTpPips >= 70 && res.avgTpPips <= 115) {
                  const item = {
                    tf: tfObj.tf,
                    tfName: tfObj.name,
                    swMin, swMaj, rr, atrMult, expireBars, minTp, maxTp,
                    ...res
                  };
                  allHits.push(item);
                  if (res.sepR >= 10.0 && res.octR >= 10.0 && res.maxDrawdown <= 3.5 && res.calmarRatio >= 4.0) {
                    candidates.push(item);
                    console.log(`\n🎉 TARGET MET 80-100 PIPS & DUAL 10R! [${tfObj.name}]`);
                    console.log(` -> SwMin: ${swMin}, SwMaj: ${swMaj}, RR: ${rr}, ATR: ${atrMult}, Exp: ${expireBars}, MinTP: ${minTp}, MaxTP: ${maxTp}`);
                    console.log(` -> Sep: +${res.sepR}R | Oct: +${res.octR}R | Total: +${res.cumulativeR}R | Calmar: ${res.calmarRatio} | DD: -${res.maxDrawdown}R | WR: ${res.winRate.toFixed(1)}% | Trades: ${res.closed} | AvgTP: ${res.avgTpPips}pips`);
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

const elapsedSec = ((Date.now() - tStart) / 1000).toFixed(1);
console.log(`\nEvaluated ${evaluated} combinations across 3 timeframes in ${elapsedSec}s!`);
console.log(`Candidates meeting all strict constraints (Dual 10R + Calmar>4 + DD<=3.5): ${candidates.length}`);

// Sort allHits by balanced score
allHits.sort((a, b) => Math.min(b.sepR, b.octR) - Math.min(a.sepR, a.octR) || b.cumulativeR - a.cumulativeR);
console.log('\nTop 10 Balanced 80-100 Pip Strategies:');
allHits.slice(0, 10).forEach(c => {
  console.log(`[${c.tfName}] SwMin:${c.swMin} Maj:${c.swMaj} RR:${c.rr} ATR:${c.atrMult} Exp:${c.expireBars} TP:[${c.minTp}-${c.maxTp}] -> Sep:+${c.sepR}R Oct:+${c.octR}R Total:+${c.cumulativeR}R Calmar:${c.calmarRatio} DD:-${c.maxDrawdown}R WR:${c.winRate.toFixed(1)}% AvgTP:${c.avgTpPips}pips Trades:${c.closed}`);
});
