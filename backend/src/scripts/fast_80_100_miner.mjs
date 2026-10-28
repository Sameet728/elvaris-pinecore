import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

console.log('Loading candle datasets...');
const c5 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_5m_tv.json'), 'utf8'));
const c15 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_15m_tv.json'), 'utf8'));
const c30 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_30m_tv.json'), 'utf8'));
const c1 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_1m_tv.json'), 'utf8'));

console.log(`Loaded M1 (${c1.length} bars), M5 (${c5.length} bars), M15 (${c15.length} bars), M30 (${c30.length} bars)`);

function computeATR(candles, period = 14) {
  const atr = new Float64Array(candles.length);
  const tr = new Float64Array(candles.length);
  tr[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    tr[i] = Math.max(hl, hc, lc);
  }
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  atr[period - 1] = sum / period;
  for (let i = period; i < candles.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  }
  return atr;
}

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

// Ultra-fast simulator
function runSimulation(candles, setups, {
  targetTpPips,
  atrMult,
  beTriggerR,
  minHoldSeconds = 120,
  maxHoldBars = 120
}) {
  const monthlyWins = {};
  const monthlyLosses = {};
  const monthlyR = {};

  let cumulativeR = 0;
  let peakR = 0;
  let maxDD = 0;
  let wins = 0;
  let losses = 0;
  let beCount = 0;
  let sumTpPips = 0;

  let activeTradeUntilBar = -1;

  for (let s = 0; s < setups.length; s++) {
    const setup = setups[s];
    if (setup.bar < activeTradeUntilBar) continue; // One trade at a time

    const dir = setup.dir;
    const entryP = setup.entryPrice;
    const sweepExt = setup.sweepExt;
    const atrVal = setup.atr;

    // SL distance
    let slP = dir === 1 ? (sweepExt - atrVal * atrMult) : (sweepExt + atrVal * atrMult);
    let slDist = Math.abs(entryP - slP);
    const slPips = slDist * 10;

    // SL sanity check: Between 10 and 38 pips ($1.00 to $3.80)
    if (slPips < 10 || slPips > 38) continue;

    const tpDist = targetTpPips / 10;
    const tpP = dir === 1 ? (entryP + tpDist) : (entryP - tpDist);
    const rr = tpDist / slDist;

    let tradeResolved = false;
    let isBE = false;
    let currSL = slP;
    const entryTime = setup.time;

    const maxBar = Math.min(candles.length - 1, setup.bar + maxHoldBars);
    for (let i = setup.bar; i <= maxBar; i++) {
      const c = candles[i];
      const holdSec = (c.time - entryTime) / 1000;

      // Breakeven check
      if (beTriggerR > 0 && !isBE) {
        const gain = dir === 1 ? (c.high - entryP) : (entryP - c.low);
        if (gain >= slDist * beTriggerR) {
          currSL = entryP;
          isBE = true;
        }
      }

      if (i === maxBar) {
        // Expired/timeout scratch
        tradeResolved = true;
        activeTradeUntilBar = i;
        break;
      }

      if (holdSec >= minHoldSeconds) {
        if (dir === 1) {
          if (c.high >= tpP) {
            wins++;
            sumTpPips += targetTpPips;
            const rGain = rr;
            const d = new Date(entryTime);
            const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
            monthlyWins[mKey] = (monthlyWins[mKey] || 0) + 1;
            monthlyR[mKey] = (monthlyR[mKey] || 0) + rGain;
            cumulativeR += rGain;
            if (cumulativeR > peakR) peakR = cumulativeR;
            tradeResolved = true;
            activeTradeUntilBar = i;
            break;
          } else if (c.low <= currSL) {
            if (isBE) {
              beCount++;
              sumTpPips += targetTpPips;
            } else {
              losses++;
              sumTpPips += targetTpPips;
              const d = new Date(entryTime);
              const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
              monthlyLosses[mKey] = (monthlyLosses[mKey] || 0) + 1;
              monthlyR[mKey] = (monthlyR[mKey] || 0) - 1.0;
              cumulativeR -= 1.0;
              const dd = peakR - cumulativeR;
              if (dd > maxDD) maxDD = dd;
            }
            tradeResolved = true;
            activeTradeUntilBar = i;
            break;
          }
        } else {
          if (c.low <= tpP) {
            wins++;
            sumTpPips += targetTpPips;
            const rGain = rr;
            const d = new Date(entryTime);
            const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
            monthlyWins[mKey] = (monthlyWins[mKey] || 0) + 1;
            monthlyR[mKey] = (monthlyR[mKey] || 0) + rGain;
            cumulativeR += rGain;
            if (cumulativeR > peakR) peakR = cumulativeR;
            tradeResolved = true;
            activeTradeUntilBar = i;
            break;
          } else if (c.high >= currSL) {
            if (isBE) {
              beCount++;
              sumTpPips += targetTpPips;
            } else {
              losses++;
              sumTpPips += targetTpPips;
              const d = new Date(entryTime);
              const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
              monthlyLosses[mKey] = (monthlyLosses[mKey] || 0) + 1;
              monthlyR[mKey] = (monthlyR[mKey] || 0) - 1.0;
              cumulativeR -= 1.0;
              const dd = peakR - cumulativeR;
              if (dd > maxDD) maxDD = dd;
            }
            tradeResolved = true;
            activeTradeUntilBar = i;
            break;
          }
        }
      }
    }
  }

  const closed = wins + losses + beCount;
  const calmar = maxDD > 0 ? cumulativeR / maxDD : cumulativeR;
  const avgTp = closed > 0 ? sumTpPips / closed : 0;
  const sepR = monthlyR['2026-09'] || 0;
  const octR = monthlyR['2026-10'] || 0;

  return {
    closed, wins, losses, beCount,
    winRate: (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0,
    cumulativeR: Number(cumulativeR.toFixed(1)),
    maxDrawdown: Number(maxDD.toFixed(1)),
    calmarRatio: Number(calmar.toFixed(2)),
    avgTpPips: Number(avgTp.toFixed(1)),
    sepR: Number(sepR.toFixed(1)),
    octR: Number(octR.toFixed(1)),
    monthlyWins, monthlyLosses, monthlyR
  };
}

// Generate raw setups from candles
function extractSetups(candles, atr, ema, swMin, swMaj, useEma, expireBars = 35) {
  const n = candles.length;
  const bslLvls = [], bslSwept = [];
  const sslLvls = [], sslSwept = [];
  const bFvgTop = [], bFvgBot = [], bFvgBar = [];
  const sFvgTop = [], sFvgBot = [], sFvgBar = [];

  let lookLong = false, lookShort = false;
  let setupBarL = 0, setupBarS = 0;
  let sweepLow = 0, sweepHigh = 0;

  const setups = [];

  for (let i = 2; i < n; i++) {
    const c = candles[i];
    const prev2C = candles[i - 2];
    const timeMs = c.openTime || c.time;

    // Minor Pivots
    if (i >= swMin * 2) {
      const pIdx = i - swMin;
      let isH = true, isL = true;
      const pH = candles[pIdx].high, pL = candles[pIdx].low;
      for (let j = i - swMin * 2; j <= i; j++) {
        if (j !== pIdx) {
          if (candles[j].high > pH) isH = false;
          if (candles[j].low < pL) isL = false;
        }
      }
      if (isH) { bslLvls.push(pH); bslSwept.push(false); if (bslLvls.length > 15) { bslLvls.shift(); bslSwept.shift(); } }
      if (isL) { sslLvls.push(pL); sslSwept.push(false); if (sslLvls.length > 15) { sslLvls.shift(); sslSwept.shift(); } }
    }

    // Major Pivots
    if (i >= swMaj * 2) {
      const pIdx = i - swMaj;
      let isH = true, isL = true;
      const pH = candles[pIdx].high, pL = candles[pIdx].low;
      for (let j = i - swMaj * 2; j <= i; j++) {
        if (j !== pIdx) {
          if (candles[j].high > pH) isH = false;
          if (candles[j].low < pL) isL = false;
        }
      }
      if (isH) { bslLvls.push(pH); bslSwept.push(false); if (bslLvls.length > 15) { bslLvls.shift(); bslSwept.shift(); } }
      if (isL) { sslLvls.push(pL); sslSwept.push(false); if (sslLvls.length > 15) { sslLvls.shift(); sslSwept.shift(); } }
    }

    // FVG
    if (c.low > prev2C.high) {
      bFvgTop.push(c.low); bFvgBot.push(prev2C.high); bFvgBar.push(i);
      if (bFvgTop.length > 30) { bFvgTop.shift(); bFvgBot.shift(); bFvgBar.shift(); }
    }
    if (c.high < prev2C.low) {
      sFvgTop.push(prev2C.low); sFvgBot.push(c.high); sFvgBar.push(i);
      if (sFvgTop.length > 30) { sFvgTop.shift(); sFvgBot.shift(); sFvgBar.shift(); }
    }

    // Sweeps
    for (let k = 0; k < sslLvls.length; k++) {
      if (!sslSwept[k] && c.low < sslLvls[k] && c.close > sslLvls[k]) {
        sslSwept[k] = true;
        if (!useEma || (ema && c.close > ema[i])) {
          lookLong = true; lookShort = false; setupBarL = i; sweepLow = c.low;
        }
      }
    }
    for (let k = 0; k < bslLvls.length; k++) {
      if (!bslSwept[k] && c.high > bslLvls[k] && c.close < bslLvls[k]) {
        bslSwept[k] = true;
        if (!useEma || (ema && c.close < ema[i])) {
          lookShort = true; lookLong = false; setupBarS = i; sweepHigh = c.high;
        }
      }
    }

    if (lookLong && (i - setupBarL) > expireBars) lookLong = false;
    if (lookShort && (i - setupBarS) > expireBars) lookShort = false;

    if (lookLong) {
      for (let f = bFvgBar.length - 1; f >= 0; f--) {
        if (bFvgBar[f] > setupBarL) {
          const fTop = bFvgTop[f], fBot = bFvgBot[f];
          if (c.low <= fTop && c.close > fBot) {
            setups.push({
              bar: i,
              time: timeMs,
              dir: 1,
              entryPrice: c.close,
              sweepExt: sweepLow,
              atr: atr[i]
            });
            lookLong = false;
            break;
          }
        }
      }
    }

    if (lookShort) {
      for (let f = sFvgBar.length - 1; f >= 0; f--) {
        if (sFvgBar[f] > setupBarS) {
          const fTop = sFvgTop[f], fBot = sFvgBot[f];
          if (c.high >= fBot && c.close < fTop) {
            setups.push({
              bar: i,
              time: timeMs,
              dir: -1,
              entryPrice: c.close,
              sweepExt: sweepHigh,
              atr: atr[i]
            });
            lookShort = false;
            break;
          }
        }
      }
    }
  }

  return setups;
}

// Search across timeframes
const tfList = [
  { name: 'M5', candles: c5, atr: computeATR(c5, 14), ema: computeEMA(c5, 100), maxHoldBars: 180 },
  { name: 'M15', candles: c15, atr: computeATR(c15, 14), ema: computeEMA(c15, 100), maxHoldBars: 90 },
  { name: 'M30', candles: c30, atr: computeATR(c30, 14), ema: computeEMA(c30, 100), maxHoldBars: 60 }
];

const champions = [];
const allResults = [];

console.log('Beginning Lightning-Speed 80-100 Pip Exploration...');
const startTime = Date.now();

for (const tf of tfList) {
  for (const swMin of [2, 3, 4, 5]) {
    for (const swMaj of [4, 5, 6, 7, 8, 9, 10]) {
      if (swMaj <= swMin) continue;
      for (const useEma of [false, true]) {
        const setups = extractSetups(tf.candles, tf.atr, tf.ema, swMin, swMaj, useEma, 40);
        if (setups.length < 5) continue;

        for (const targetTpPips of [80, 85, 90, 95, 100]) {
          for (const atrMult of [0.25, 0.35, 0.45, 0.55]) {
            for (const beTriggerR of [0.0, 0.8, 1.0, 1.2, 1.5]) {
              const res = runSimulation(tf.candles, setups, {
                targetTpPips,
                atrMult,
                beTriggerR,
                minHoldSeconds: 120,
                maxHoldBars: tf.maxHoldBars
              });

              allResults.push({
                tfName: tf.name,
                swMin,
                swMaj,
                useEma,
                targetTpPips,
                atrMult,
                beTriggerR,
                ...res
              });

              if (res.sepR >= 10.0 && res.octR >= 10.0 && res.maxDrawdown <= 3.5 && res.calmarRatio >= 4.0) {
                champions.push({
                  tfName: tf.name,
                  swMin,
                  swMaj,
                  useEma,
                  targetTpPips,
                  atrMult,
                  beTriggerR,
                  ...res
                });
              }
            }
          }
        }
      }
    }
  }
}

const elapsedMs = Date.now() - startTime;
console.log(`Exploration completed in ${elapsedMs} ms! Evaluated ${allResults.length} configurations.`);

allResults.sort((a, b) => (Math.min(b.sepR, b.octR) - Math.min(a.sepR, a.octR)) || (b.cumulativeR - a.cumulativeR));
console.log('\nTop 15 Closest Strategies to Dual 10R:');
allResults.slice(0, 15).forEach((c, idx) => {
  console.log(`#${idx + 1}: [${c.tfName}] SwMin:${c.swMin} Maj:${c.swMaj} EMA:${c.useEma} TP:${c.targetTpPips}p ATR:${c.atrMult} BE:${c.beTriggerR}R -> Sep:+${c.sepR}R Oct:+${c.octR}R Total:+${c.cumulativeR}R Calmar:${c.calmarRatio} MaxDD:-${c.maxDrawdown}R WR:${c.winRate.toFixed(1)}% Trades:${c.closed}`);
});

if (champions.length > 0) {
  champions.sort((a, b) => (b.cumulativeR * 1.5 + b.calmarRatio * 2) - (a.cumulativeR * 1.5 + a.calmarRatio * 2));
  console.log('\nTop 10 Champions Meeting ALL Prop Firm & User Rules:');
  champions.slice(0, 10).forEach((c, idx) => {
    console.log(`#${idx + 1}: [${c.tfName}] SwMin:${c.swMin} Maj:${c.swMaj} EMA:${c.useEma} TP:${c.targetTpPips}p ATR:${c.atrMult} BE:${c.beTriggerR}R -> Sep:+${c.sepR}R Oct:+${c.octR}R Total:+${c.cumulativeR}R Calmar:${c.calmarRatio} MaxDD:-${c.maxDrawdown}R WR:${c.winRate.toFixed(1)}% Trades:${c.closed}`);
  });

  // Save top champions to file
  fs.writeFileSync(
    path.join(DATA_DIR, 'champions_80_100_pips.json'),
    JSON.stringify(champions, null, 2)
  );
  console.log('Saved champions to champions_80_100_pips.json');
} else {
  console.log('No exact matches in standard dual-pivot. Exploring session sweeps, multi-trend and M1 setups...');
}
