import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PineTS } from 'pinets';
import { getDb } from '../../dist/db/database.js';
import { getCandles as getTVCandles } from '@mathieuc/tradingview';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PINE_DIR = path.join(ROOT_DIR, 'pine_scripts');
const M1_CACHE = path.join(DATA_DIR, 'xauusd_1m.json');

export async function loadAllTimeframes() {
  const readTvFile = (fileName) => {
    const fPath = path.join(DATA_DIR, fileName);
    if (fs.existsSync(fPath)) {
      return JSON.parse(fs.readFileSync(fPath, 'utf8'));
    }
    return [];
  };

  const m1 = readTvFile('xauusd_1m_tv.json');
  const m5 = readTvFile('xauusd_5m_tv.json');
  const m15 = readTvFile('xauusd_15m_tv.json');
  const m30 = readTvFile('xauusd_30m_tv.json');
  const h1 = readTvFile('xauusd_1h_tv.json');
  const h4 = readTvFile('xauusd_4h_tv.json');

  console.log('[Multi-TF Direct TV Data Loaded]');
  console.log(`  -> 1m:  ${m1.length} authentic TradingView candles`);
  console.log(`  -> 5m:  ${m5.length} authentic TradingView candles`);
  console.log(`  -> 15m: ${m15.length} authentic TradingView candles`);
  console.log(`  -> 30m: ${m30.length} authentic TradingView candles`);
  console.log(`  -> 1h:  ${h1.length} authentic TradingView candles`);
  console.log(`  -> 4h:  ${h4.length} authentic TradingView candles`);

  return {
    '1m': m1,
    '5m': m5,
    '15m': m15,
    '30m': m30,
    '1h': h1,
    '4h': h4
  };
}

export function runMonteCarlo(trades, iterations = 5000) {
  if (trades.length < 3) return { worstDrawdownR: 9.9, probDrawdownUnder4R: 0, probProfitable: 0 };
  const profits = trades.map(t => t.profitR);
  let worstDds = [];
  let finalReturns = [];

  for (let iter = 0; iter < iterations; iter++) {
    let peak = 0;
    let cum = 0;
    let maxDd = 0;
    for (let i = 0; i < trades.length; i++) {
      const idx = Math.floor(Math.random() * profits.length);
      cum += profits[idx];
      if (cum > peak) peak = cum;
      const dd = peak - cum;
      if (dd > maxDd) maxDd = dd;
    }
    worstDds.push(maxDd);
    finalReturns.push(cum);
  }

  worstDds.sort((a, b) => a - b);
  finalReturns.sort((a, b) => a - b);

  const p95WorstDd = worstDds[Math.floor(iterations * 0.95)];
  const safeCount = worstDds.filter(dd => dd <= 4.0).length;
  const profitableCount = finalReturns.filter(r => r > 0).length;

  return {
    worstDrawdownR: Number(p95WorstDd.toFixed(1)),
    probDrawdownUnder4R: Number(((safeCount / iterations) * 100).toFixed(1)),
    probProfitable: Number(((profitableCount / iterations) * 100).toFixed(1))
  };
}

export async function runBacktestOnTimeframe(candles, tfCode, pineScript) {
  if (!candles || candles.length === 0) return { success: false, error: 'No candles for ' + tfCode };

  const pineTS = new PineTS(candles, 'XAUUSD', tfCode);
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
  let sumTpPips = 0;

  for (let i = 0; i < sigDirs.length; i++) {
    const r = sigResults[i];
    const dir = sigDirs[i] === 1 ? 'LONG' : 'SHORT';
    const entry = Number(sigEntries[i]);
    const tp = Number(sigTPs[i]);
    const tpPips = Math.abs(tp - entry) * 10;
    sumTpPips += tpPips;
    const rWin = sigRVal[i] ? Number(sigRVal[i]) : 2.0;

    if (r === 1) {
      wins++;
      trades.push({ id: i + 1, dir, entry, tp, tpPips, result: 'WIN', profitR: rWin });
    } else if (r === -1) {
      losses++;
      trades.push({ id: i + 1, dir, entry, tp, tpPips, result: 'LOSS', profitR: -1.0 });
    }
  }

  const closed = wins + losses;
  const winRate = closed > 0 ? (wins / closed) * 100 : 0;
  const avgTp = sigDirs.length > 0 ? sumTpPips / sigDirs.length : 0;
  const cumR = Number(getVarValue('cumulativeR', wins * 2 - losses));
  const maxDD = Math.abs(Number(getVarValue('maxDrawdown', 3)));
  const calmar = maxDD > 0 ? cumR / maxDD : cumR;

  const monthly = {};
  for (let i = 0; i < mKeys.length; i++) {
    monthly[mKeys[i]] = {
      wins: mWins[i] || 0,
      losses: mLosses[i] || 0,
      returnsR: Number((mR[i] || 0).toFixed(1))
    };
  }

  const mc = runMonteCarlo(trades, 3000);

  return {
    success: true,
    timeframe: tfCode,
    candlesCount: candles.length,
    closed,
    wins,
    losses,
    winRate: Number(winRate.toFixed(1)),
    avgTpPips: Number(avgTp.toFixed(1)),
    cumulativeR: Number(cumR.toFixed(1)),
    maxDrawdown: Number(maxDD.toFixed(1)),
    calmarRatio: Number(calmar.toFixed(2)),
    sepR: monthly['2026-09']?.returnsR || 0,
    octR: monthly['2026-10']?.returnsR || 0,
    monthly,
    monteCarlo: mc
  };
}
