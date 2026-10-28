import { getDb } from '../../dist/db/database.js';
import { PineTS } from 'pinets';
import fs from 'fs';

export async function runBacktest(pineScript) {
  const db = getDb();
  const rows = db.prepare('SELECT open_time, open, high, low, close, volume FROM candles ORDER BY open_time ASC').all();
  
  const candles = rows.map(r => ({
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
    openTime: r.open_time,
    closeTime: r.open_time + 300000
  }));

  const pineTS = new PineTS(candles, 'XAUUSD', '5');
  await pineTS.ready();
  const t0 = Date.now();
  const res = await pineTS.run(pineScript);
  const execTime = Date.now() - t0;

  // Extract variables
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
  const sigSLs = getVarArray('sigSL');
  const sigTPs = getVarArray('sigTP');
  const sigResults = getVarArray('sigResult');
  const sigBars = getVarArray('sigBar');

  const mKeys = getVarArray('monthKeys');
  const mWins = getVarArray('monthWins');
  const mLosses = getVarArray('monthLosses');
  const mR = getVarArray('monthR');

  const trades = [];
  let totalWins = 0;
  let totalLosses = 0;
  let totalOpen = 0;
  let totalTPDistance = 0;

  for (let i = 0; i < sigDirs.length; i++) {
    const r = sigResults[i];
    const dir = sigDirs[i] === 1 ? 'LONG' : 'SHORT';
    const entry = Number(sigEntries[i]);
    const sl = Number(sigSLs[i]);
    const tp = Number(sigTPs[i]);
    const tpDistPips = Math.abs(tp - entry) * 10; // Gold 0.10 = 1 pip
    totalTPDistance += tpDistPips;

    if (r === 1) {
      totalWins++;
      trades.push({ id: i + 1, dir, entry, sl, tp, tpPips: tpDistPips.toFixed(1), result: 'WIN', profitR: 2.0 });
    } else if (r === -1) {
      totalLosses++;
      trades.push({ id: i + 1, dir, entry, sl, tp, tpPips: tpDistPips.toFixed(1), result: 'LOSS', profitR: -1.0 });
    } else {
      totalOpen++;
    }
  }

  const closedTrades = totalWins + totalLosses;
  const winRate = closedTrades > 0 ? (totalWins / closedTrades) * 100 : 0;
  const avgTpPips = closedTrades > 0 ? (totalTPDistance / sigDirs.length) : 0;
  const cumulativeR = Number(getVarValue('cumulativeR', totalWins * 2 - totalLosses));
  const maxDrawdown = Math.abs(Number(getVarValue('maxDrawdown', 3)));
  const calmarRatio = maxDrawdown > 0 ? cumulativeR / maxDrawdown : cumulativeR;
  const maxConsLoss = Number(getVarValue('maxConsLossR', 1));

  const monthly = {};
  for (let i = 0; i < mKeys.length; i++) {
    monthly[mKeys[i]] = {
      wins: mWins[i],
      losses: mLosses[i],
      returnsR: mR[i],
      trades: mWins[i] + mLosses[i]
    };
  }

  return {
    execTime,
    closedTrades,
    totalWins,
    totalLosses,
    totalOpen,
    winRate: Number(winRate.toFixed(1)),
    avgTpPips: Number(avgTpPips.toFixed(1)),
    cumulativeR: Number(cumulativeR.toFixed(1)),
    maxDrawdown: Number(maxDrawdown.toFixed(1)),
    calmarRatio: Number(calmarRatio.toFixed(2)),
    maxConsLoss,
    monthly,
    trades: trades.slice(-10) // last 10 trades
  };
}

async function main() {
  const code = fs.readFileSync('pine_scripts/LSS_Tight_Rejection_FullUI.pine', 'utf8');
  const res = await runBacktest(code);
  console.log('Backtest Evaluation Results:');
  console.log(JSON.stringify(res, null, 2));
}

main().catch(console.error);
