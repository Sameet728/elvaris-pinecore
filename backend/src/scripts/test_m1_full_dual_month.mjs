import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PineTS } from 'pinets';
import { runMonteCarlo } from './multi_tf_engine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../../data');
const PINE_DIR = path.resolve(__dirname, '../../../pine_scripts');

async function testFullDualMonth() {
  console.log('=== EVALUATING M1 CHAMPION ACROSS FULL DUAL MONTHS (SEP + OCT 2026) ===');
  const candles = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_1m_tv.json'), 'utf8'));
  console.log(`Loaded ${candles.length} total M1 candles.`);
  console.log(`From: ${new Date(candles[0].openTime).toISOString()} to ${new Date(candles[candles.length - 1].closeTime).toISOString()}`);

  const pinePath = path.join(PINE_DIR, 'Champion_M1_Calmar6.4_PropFirm.pine');
  const pineScript = fs.readFileSync(pinePath, 'utf8');

  const pineTS = new PineTS(candles, 'XAUUSD', '1');
  await pineTS.ready();
  const res = await pineTS.run(pineScript);

  const getVarArray = (varName) => {
    const key = Object.keys(res.var ?? {}).find(k => k === varName || k.endsWith('_' + varName));
    if (!key) return [];
    const v = res.var[key];
    const target = v?.data ? v.data[v.data.length - 1] : v;
    if (target && target.array && Array.isArray(target.array)) return target.array;
    if (Array.isArray(target)) return target;
    return [];
  };

  const getVarValue = (varName, defaultVal = 0) => {
    const key = Object.keys(res.var ?? {}).find(k => k === varName || k.endsWith('_' + varName));
    if (!key) return defaultVal;
    const v = res.var[key];
    const target = v?.data ? v.data[v.data.length - 1] : v;
    if (target != null && (typeof target === 'number' || typeof target === 'string')) return target;
    return defaultVal;
  };

  const sigDirs = getVarArray('sigDir');
  const sigEntries = getVarArray('sigEntry');
  const sigTPs = getVarArray('sigTP');
  const sigResults = getVarArray('sigResult');
  const sigRVal = getVarArray('sigRVal');
  const mKeys = getVarArray('monthKeys');
  const mWins = getVarArray('monthWins');
  const mLosses = getVarArray('monthLosses');
  const mR = getVarArray('monthR');

  const trades = [];
  let wins = 0;
  let losses = 0;
  let sumTp = 0;

  for (let i = 0; i < sigDirs.length; i++) {
    const r = sigResults[i];
    const entry = Number(sigEntries[i]);
    const tp = Number(sigTPs[i]);
    const tpPips = Math.abs(tp - entry) * 10;
    sumTp += tpPips;
    const rWin = sigRVal[i] ? Number(sigRVal[i]) : 2.5;

    if (r === 1) {
      wins++;
      trades.push({ result: 'WIN', profitR: rWin });
    } else if (r === -1) {
      losses++;
      trades.push({ result: 'LOSS', profitR: -1.0 });
    }
  }

  const closed = wins + losses;
  const winRate = closed > 0 ? (wins / closed) * 100 : 0;
  const avgTp = sigDirs.length > 0 ? sumTp / sigDirs.length : 0;
  const cumR = Number(getVarValue('cumulativeR', wins * 2.5 - losses));
  const maxDD = Math.abs(Number(getVarValue('maxDrawdown', 3)));
  const calmar = maxDD > 0 ? cumR / maxDD : cumR;

  console.log('\n=== MONTHLY BREAKDOWN ===');
  for (let i = 0; i < mKeys.length; i++) {
    const w = mWins[i] || 0;
    const l = mLosses[i] || 0;
    const r = mR[i] || 0;
    const wr = (w + l) > 0 ? ((w / (w + l)) * 100).toFixed(1) : 0;
    console.log(`Month ${mKeys[i]}: Returns: ${r > 0 ? '+' : ''}${r.toFixed(1)}R | Win Rate: ${wr}% (${w}W / ${l}L) | Trades: ${w + l}`);
  }

  const mc = runMonteCarlo(trades, 5000);

  console.log('\n=== OVERALL SUMMARY ===');
  console.log(`Closed Trades:  ${closed}`);
  console.log(`Win Rate:       ${winRate.toFixed(1)}%`);
  console.log(`Total Return:   +${cumR.toFixed(1)}R`);
  console.log(`Max Drawdown:   -${maxDD.toFixed(1)}R`);
  console.log(`Calmar Ratio:   ${calmar.toFixed(2)}`);
  console.log(`Average TP:     ${avgTp.toFixed(1)} pips`);
  console.log(`Monte Carlo 95% Worst DD: -${mc.worstDrawdownR}R`);
  console.log(`Monte Carlo Survival (DD <= 4R): ${mc.probDrawdownUnder4R}%`);
}

testFullDualMonth().catch(console.error);
