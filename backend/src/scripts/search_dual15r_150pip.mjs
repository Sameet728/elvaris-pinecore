import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

function computeEMA(candles, period) {
  const ema = new Float64Array(candles.length);
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += candles[i].close;
  ema[period - 1] = sum / period;
  for (let i = period; i < candles.length; i++) {
    ema[i] = candles[i].close * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

function computeATR(candles, period = 14) {
  const atr = new Float64Array(candles.length);
  let sum = 0;
  for (let i = 1; i <= period; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    sum += tr;
  }
  atr[period] = sum / period;
  for (let i = period + 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    atr[i] = (atr[i - 1] * (period - 1) + tr) / period;
  }
  return atr;
}

function precomputeSweeps(candles, swMin, swMaj) {
  const n = candles.length;
  const bslLvls = [];
  const sslLvls = [];

  for (let i = swMaj * 2; i < n; i++) {
    const p1 = i - swMin;
    let isH1 = true, isL1 = true;
    for (let j = i - swMin * 2; j <= i; j++) {
      if (j !== p1) {
        if (candles[j].high > candles[p1].high) isH1 = false;
        if (candles[j].low < candles[p1].low) isL1 = false;
      }
    }
    if (isH1) bslLvls.push({ bar: p1, price: candles[p1].high });
    if (isL1) sslLvls.push({ bar: p1, price: candles[p1].low });

    const p2 = i - swMaj;
    let isH2 = true, isL2 = true;
    for (let j = i - swMaj * 2; j <= i; j++) {
      if (j !== p2) {
        if (candles[j].high > candles[p2].high) isH2 = false;
        if (candles[j].low < candles[p2].low) isL2 = false;
      }
    }
    if (isH2) bslLvls.push({ bar: p2, price: candles[p2].high });
    if (isL2) sslLvls.push({ bar: p2, price: candles[p2].low });
  }

  const sweeps = new Array(n);
  const activeBsl = [];
  const activeSsl = [];
  let bslPtr = 0, sslPtr = 0;

  for (let i = 0; i < n; i++) {
    sweeps[i] = { sslSweep: false, bslSweep: false };
    if (i < 2) continue;
    const c = candles[i];

    while (bslPtr < bslLvls.length && bslLvls[bslPtr].bar <= i) {
      activeBsl.push({ price: bslLvls[bslPtr].price, swept: false });
      if (activeBsl.length > 20) activeBsl.shift();
      bslPtr++;
    }
    while (sslPtr < sslLvls.length && sslLvls[sslPtr].bar <= i) {
      activeSsl.push({ price: sslLvls[sslPtr].price, swept: false });
      if (activeSsl.length > 20) activeSsl.shift();
      sslPtr++;
    }

    for (let k = 0; k < activeSsl.length; k++) {
      if (!activeSsl[k].swept && c.low < activeSsl[k].price && c.close > activeSsl[k].price) {
        activeSsl[k].swept = true;
        sweeps[i].sslSweep = true;
      }
    }
    for (let k = 0; k < activeBsl.length; k++) {
      if (!activeBsl[k].swept && c.high > activeBsl[k].price && c.close < activeBsl[k].price) {
        activeBsl[k].swept = true;
        sweeps[i].bslSweep = true;
      }
    }
  }

  return sweeps;
}

function runSim(candles, config) {
  const n = candles.length;
  const ema = computeEMA(candles, config.emaPeriod);
  const atr = computeATR(candles, 14);
  const sweeps = precomputeSweeps(candles, config.swMin, config.swMaj);

  const timeMsArr = new Float64Array(n);
  const dayKeys = new Array(n);
  const monthKeys = new Array(n);

  for (let i = 0; i < n; i++) {
    const t = candles[i].openTime || candles[i].time;
    timeMsArr[i] = t;
    const d = new Date(t);
    dayKeys[i] = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
    monthKeys[i] = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
  }

  const bFvgsPerBar = new Array(n);
  const sFvgsPerBar = new Array(n);
  const curBFvg = [];
  const curSFvg = [];

  for (let i = 0; i < n; i++) {
    if (i >= 2) {
      if (candles[i].low > candles[i - 2].high) {
        curBFvg.push({ bar: i, top: candles[i].low, bot: candles[i - 2].high });
        if (curBFvg.length > 10) curBFvg.shift();
      }
      if (candles[i].high < candles[i - 2].low) {
        curSFvg.push({ bar: i, top: candles[i - 2].low, bot: candles[i].high });
        if (curSFvg.length > 10) curSFvg.shift();
      }
    }
    bFvgsPerBar[i] = [...curBFvg];
    sFvgsPerBar[i] = [...curSFvg];
  }

  const tpDist = config.tpPips / 10.0;
  const monthlyR = {};

  let cumulativeR = 0, peakR = 0, maxDD = 0;
  let lookLong = false, lookShort = false;
  let setupBarL = 0, setupBarS = 0;

  let consecutiveLosses = 0;
  let maxConsecLoss = 0;
  let cooldownUntilBar = -1;
  const dailyLossCount = {};
  let openTrade = null;
  const trades = [];

  for (let i = 2; i < n; i++) {
    const c = candles[i];
    const timeMs = timeMsArr[i];
    const dayKey = dayKeys[i];

    const isCooldown = i < cooldownUntilBar;
    const isDailyBlocked = (dailyLossCount[dayKey] || 0) >= (config.maxDailyLosses || 3);

    const s = sweeps[i];
    if (s.sslSweep && c.close > ema[i] && !isCooldown && !isDailyBlocked) {
      lookLong = true; lookShort = false; setupBarL = i;
    }
    if (s.bslSweep && c.close < ema[i] && !isCooldown && !isDailyBlocked) {
      lookShort = true; lookLong = false; setupBarS = i;
    }

    if (openTrade !== null) {
      const t = openTrade;
      const dir = t.dir;
      const tp = t.tp;
      const entry = t.entry;
      const age = i - t.bar;
      const holdSec = (timeMs - t.entryTime) / 1000;
      let resolved = false;
      let finalRes = 0;

      const slDistInit = Math.abs(entry - t.initSL);
      const currentGain = dir === 1 ? (c.high - entry) : (entry - c.low);

      if (config.beTriggerR > 0 && !t.isBE) {
        if (currentGain >= slDistInit * config.beTriggerR) {
          t.sl = entry;
          t.isBE = true;
        }
      }

      if (config.lock1TriggerR > 0 && !t.isLocked1) {
        if (currentGain >= slDistInit * config.lock1TriggerR) {
          t.sl = dir === 1 ? (entry + slDistInit * config.lock1ValR) : (entry - slDistInit * config.lock1ValR);
          t.isLocked1 = true;
        }
      }

      if (config.lock2TriggerR > 0 && !t.isLocked2) {
        if (currentGain >= slDistInit * config.lock2TriggerR) {
          t.sl = dir === 1 ? (entry + slDistInit * config.lock2ValR) : (entry - slDistInit * config.lock2ValR);
          t.isLocked2 = true;
        }
      }

      const maxHoldBars = config.maxHoldBars || 60;
      if (age >= maxHoldBars) {
        finalRes = 2; resolved = true;
      } else if (holdSec >= (config.minHoldSec || 120)) {
        if (dir === 1) {
          if (c.high >= tp) { finalRes = 1; resolved = true; }
          else if (c.low <= t.sl) {
            finalRes = t.isLocked2 ? 5 : t.isLocked1 ? 4 : t.isBE ? 3 : -1;
            resolved = true;
          }
        } else {
          if (c.low <= tp) { finalRes = 1; resolved = true; }
          else if (c.high >= t.sl) {
            finalRes = t.isLocked2 ? 5 : t.isLocked1 ? 4 : t.isBE ? 3 : -1;
            resolved = true;
          }
        }
      }

      if (resolved) {
        const rOutcome = finalRes === 1 ? t.rVal :
                         finalRes === 5 ? config.lock2ValR :
                         finalRes === 4 ? config.lock1ValR :
                         finalRes === 3 ? 0.0 : -1.0;

        if (finalRes === 1 || finalRes === -1 || finalRes === 3 || finalRes === 4 || finalRes === 5) {
          const mKey = monthKeys[t.bar];
          const tDayKey = dayKeys[t.bar];
          if (!monthlyR[mKey]) monthlyR[mKey] = 0;

          if (finalRes === 1 || finalRes === 4 || finalRes === 5) {
            monthlyR[mKey] += rOutcome;
            cumulativeR += rOutcome;
            if (cumulativeR > peakR) peakR = cumulativeR;
            consecutiveLosses = 0;
          } else if (finalRes === -1) {
            monthlyR[mKey] -= 1.0;
            cumulativeR -= 1.0;
            const dd = peakR - cumulativeR;
            if (dd > maxDD) maxDD = dd;
            dailyLossCount[tDayKey] = (dailyLossCount[tDayKey] || 0) + 1;
            consecutiveLosses++;
            if (consecutiveLosses > maxConsecLoss) maxConsecLoss = consecutiveLosses;
            if (consecutiveLosses >= 1 && config.cooldownBars > 0) {
              cooldownUntilBar = i + config.cooldownBars;
            }
          }

          trades.push({
            bar: t.bar,
            entryTime: t.entryTime,
            exitTime: timeMs,
            rOutcome,
            rVal: t.rVal,
            finalRes,
            month: mKey
          });
        }
        openTrade = null;
      }
    }

    const expireBars = config.expireBars || 25;
    if (lookLong && (i - setupBarL) > expireBars) lookLong = false;
    if (lookShort && (i - setupBarS) > expireBars) lookShort = false;

    if (lookLong && openTrade === null && !isCooldown && !isDailyBlocked) {
      const activeBFvgs = bFvgsPerBar[i];
      for (let f = activeBFvgs.length - 1; f >= 0; f--) {
        if (activeBFvgs[f].bar > setupBarL) {
          const { top: fTop, bot: fBot } = activeBFvgs[f];
          if (c.low <= fTop && c.close > fBot) {
            const entryP = c.close;
            const slP = fBot - atr[i] * config.atrMult;
            const slDist = entryP - slP;
            const maxSlAllowed = Math.max(2.0, tpDist / 1.5);
            if (slDist > 0.4 && slDist < maxSlAllowed) {
              const tpP = entryP + tpDist;
              openTrade = {
                dir: 1, entry: entryP, sl: slP, initSL: slP, tp: tpP,
                bar: i, entryTime: timeMs,
                rVal: Number((tpDist / slDist).toFixed(2)),
                isBE: false, isLocked1: false, isLocked2: false
              };
              lookLong = false;
              break;
            }
          }
        }
      }
    }

    if (lookShort && openTrade === null && !isCooldown && !isDailyBlocked) {
      const activeSFvgs = sFvgsPerBar[i];
      for (let f = activeSFvgs.length - 1; f >= 0; f--) {
        if (activeSFvgs[f].bar > setupBarS) {
          const { top: fTop, bot: fBot } = activeSFvgs[f];
          if (c.high >= fBot && c.close < fTop) {
            const entryP = c.close;
            const slP = fTop + atr[i] * config.atrMult;
            const slDist = slP - entryP;
            const maxSlAllowed = Math.max(2.0, tpDist / 1.5);
            if (slDist > 0.4 && slDist < maxSlAllowed) {
              const tpP = entryP - tpDist;
              openTrade = {
                dir: -1, entry: entryP, sl: slP, initSL: slP, tp: tpP,
                bar: i, entryTime: timeMs,
                rVal: Number((tpDist / slDist).toFixed(2)),
                isBE: false, isLocked1: false, isLocked2: false
              };
              lookShort = false;
              break;
            }
          }
        }
      }
    }
  }

  const closed = trades.length;
  if (closed < 5) return null;

  const wins = trades.filter(t => t.rOutcome > 0).length;
  const losses = trades.filter(t => t.rOutcome < 0).length;
  const beCount = trades.filter(t => t.rOutcome === 0).length;
  const decTrades = wins + losses;
  const winRate = decTrades > 0 ? Number(((wins / decTrades) * 100).toFixed(1)) : 0;
  const calmarRatio = maxDD > 0 ? Number((cumulativeR / maxDD).toFixed(2)) : Number((cumulativeR * 10).toFixed(2));

  const sepR = Number((monthlyR['2026-09'] || 0).toFixed(2));
  const octR = Number((monthlyR['2026-10'] || 0).toFixed(2));

  return {
    closed, wins, losses, beCount, winRate, cumulativeR, maxDrawdown: maxDD, calmarRatio, sepR, octR, monthlyR, maxConsecLoss, trades
  };
}

async function search() {
  const timeframes = ['5m', '15m', '30m', '1h'];
  console.log('Finding highest return & highest win rate strategies with TP >= 150 pips...');

  const topOverall = [];

  for (const tf of timeframes) {
    const filePath = path.join(DATA_DIR, `xauusd_${tf}_tv.json`);
    if (!fs.existsSync(filePath)) continue;
    const candles = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    const tpList = [150, 160, 180, 200];
    const swPairs = [[2, 3], [2, 4], [3, 5], [4, 6]];
    const emaList = [50, 100];
    const atrMultList = [0.15, 0.18, 0.22];
    const holdList = tf === '5m' ? [60, 90] : [60, 72];

    for (const tpPips of tpList) {
      for (const [swMin, swMaj] of swPairs) {
        for (const emaPeriod of emaList) {
          for (const atrMult of atrMultList) {
            for (const maxHoldBars of holdList) {
              const config = {
                tpPips,
                swMin,
                swMaj,
                emaPeriod,
                atrMult,
                cooldownBars: 6,
                maxHoldBars,
                minHoldSec: 120,
                expireBars: 25,
                beTriggerR: 0.25,
                lock1TriggerR: 0.80,
                lock1ValR: 0.60,
                lock2TriggerR: 1.40,
                lock2ValR: 1.20
              };

              const res = runSim(candles, config);
              if (!res) continue;

              topOverall.push({
                tf: tf.toUpperCase(),
                tpPips,
                config,
                res
              });
            }
          }
        }
      }
    }
  }

  for (const tf of timeframes) {
    const tfList = topOverall.filter(c => c.tf === tf.toUpperCase());
    tfList.sort((a, b) => b.res.winRate - a.res.winRate);
    console.log(`\n=== TOP RESULTS FOR ${tf.toUpperCase()} (TP >= 150p) ===`);
    tfList.slice(0, 3).forEach((c, idx) => {
      console.log(`#${idx+1} [${c.tf}] TP: ${c.tpPips}p | WR: ${c.res.winRate}% (${c.res.wins}W/${c.res.losses}L/${c.res.beCount}BE) | Net: +${c.res.cumulativeR}R | Calmar: ${c.res.calmarRatio} | MaxLoss: ${c.res.maxConsecLoss} | DD: -${c.res.maxDrawdown}R`);
      console.log(`    Monthly:`, c.res.monthlyR);
      console.log(`    Config: EMA ${c.config.emaPeriod}, Sw (${c.config.swMin}/${c.config.swMaj}), ATR ${c.config.atrMult}, Hold ${c.config.maxHoldBars}`);
    });
  }
}

search().catch(console.error);
