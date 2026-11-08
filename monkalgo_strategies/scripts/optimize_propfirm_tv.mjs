import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('monkalgo_strategies/data');
const nas = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'nas100_15m.json'), 'utf8'));
const xau = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_15m.json'), 'utf8'));
const spx = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'spx500_15m.json'), 'utf8'));

function computeATR(candles, period = 14) {
  const atrs = new Float64Array(candles.length);
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    atrs[i] = (atrs[i - 1] * (period - 1) + tr) / period;
  }
  return atrs;
}

function computeEMA(candles, period = 50) {
  const emas = new Float64Array(candles.length);
  const k = 2 / (period + 1);
  let s = 0;
  for (let i = 0; i < period; i++) s += candles[i].close;
  emas[period - 1] = s / period;
  for (let i = period; i < candles.length; i++) emas[i] = candles[i].close * k + emas[i - 1] * (1 - k);
  return emas;
}

function runOptimization(candles, assetName) {
  const atrs = computeATR(candles, 14);
  const ema50 = computeEMA(candles, 50);
  const ema200 = computeEMA(candles, 200);

  const results = [];

  for (const minGap of [0.4, 0.6, 0.8, 1.0]) {
    for (const tpR of [1.0, 1.1, 1.2, 1.3]) {
      for (const beTrigger of [0.4, 0.5, 0.6, 0.7]) {
        for (const useTrend of [true, false]) {
          for (const useSession of [true, false]) {
            let trades = 0, wins = 0, losses = 0, totalR = 0;
            let inTrade = false, active = null, lastExit = -999;
            let peak = 0, maxDD = 0, currentEq = 0;

            let bullMid = null, bullSl = null, bullExp = 0;
            let bearMid = null, bearSl = null, bearExp = 0;

            for (let i = 2; i < candles.length; i++) {
              const c = candles[i];
              const c2 = candles[i - 2];
              const d = new Date(c.openTime);
              const utcHour = d.getUTCHours();
              const inKillzone = utcHour >= 7 && utcHour <= 17; // London & NY killzones

              // If in trade, check exit
              if (inTrade) {
                const t = active;
                let exitR = null;

                if (t.dir === 1) { // LONG
                  const isGreen = c.close >= c.open;
                  if (isGreen) {
                    if (c.low <= t.sl) {
                      exitR = (t.sl - t.entry) / t.risk;
                    } else {
                      const gainR = (c.high - t.entry) / t.risk;
                      if (gainR >= beTrigger && !t.be) { t.sl = t.entry + t.risk * 0.05; t.be = true; }
                      if (c.high >= t.tp) exitR = tpR;
                    }
                  } else {
                    const gainR = (c.high - t.entry) / t.risk;
                    if (gainR >= beTrigger && !t.be) { t.sl = t.entry + t.risk * 0.05; t.be = true; }
                    if (c.high >= t.tp) exitR = tpR;
                    else if (c.low <= t.sl) exitR = (t.sl - t.entry) / t.risk;
                  }
                } else { // SHORT
                  const isRed = c.close <= c.open;
                  if (isRed) {
                    if (c.high >= t.sl) {
                      exitR = (t.entry - t.sl) / t.risk;
                    } else {
                      const gainR = (t.entry - c.low) / t.risk;
                      if (gainR >= beTrigger && !t.be) { t.sl = t.entry - t.risk * 0.05; t.be = true; }
                      if (c.low <= t.tp) exitR = tpR;
                    }
                  } else {
                    const gainR = (t.entry - c.low) / t.risk;
                    if (gainR >= beTrigger && !t.be) { t.sl = t.entry - t.risk * 0.05; t.be = true; }
                    if (c.low <= t.tp) exitR = tpR;
                    else if (c.high >= t.sl) exitR = (t.entry - t.sl) / t.risk;
                  }
                }

                if (exitR === null && (i - t.entryBar >= 35)) {
                  exitR = t.dir === 1 ? (c.close - t.entry) / t.risk : (t.entry - c.close) / t.risk;
                }

                if (exitR !== null) {
                  trades++;
                  totalR += exitR;
                  currentEq += exitR;
                  if (currentEq > peak) peak = currentEq;
                  if (peak - currentEq > maxDD) maxDD = peak - currentEq;
                  if (exitR > 0) wins++; else losses++;
                  inTrade = false;
                  active = null;
                  lastExit = i;
                  continue;
                }
              }

              // Gap Detection
              if (c.low - c2.high > atrs[i] * minGap) {
                bullMid = (c.low + c2.high) / 2;
                bullSl = c2.high - atrs[i] * 0.2;
                bullExp = i + 15;
              }
              if (c2.low - c.high > atrs[i] * minGap) {
                bearMid = (c2.low + c.high) / 2;
                bearSl = c2.low + atrs[i] * 0.2;
                bearExp = i + 15;
              }

              // Entry trigger
              if (!inTrade && i > lastExit + 2) {
                if (useSession && !inKillzone) continue;

                if (bullMid && i <= bullExp && c.low <= bullMid && c.close > bullMid) {
                  if (!useTrend || c.close > ema50[i]) {
                    const entry = c.close;
                    const sl = bullSl;
                    const risk = entry - sl;
                    if (risk > 0) {
                      inTrade = true;
                      active = { dir: 1, entry, sl, tp: entry + risk * tpR, risk, entryBar: i, be: false };
                      bullMid = null;
                    }
                  }
                } else if (bearMid && i <= bearExp && c.high >= bearMid && c.close < bearMid) {
                  if (!useTrend || c.close < ema50[i]) {
                    const entry = c.close;
                    const sl = bearSl;
                    const risk = sl - entry;
                    if (risk > 0) {
                      inTrade = true;
                      active = { dir: -1, entry, sl, tp: entry - risk * tpR, risk, entryBar: i, be: false };
                      bearMid = null;
                    }
                  }
                }
              }
            }

            const wr = trades >= 30 ? (wins / trades) * 100 : 0;
            const pf = losses > 0 ? (wins * tpR / losses) : 99;
            if (wr >= 68 && pf >= 1.8 && totalR > 20) {
              results.push({
                asset: assetName,
                minGap,
                tpR,
                beTrigger,
                useTrend,
                useSession,
                trades,
                wins,
                losses,
                wr: Number(wr.toFixed(1)),
                pf: Number(pf.toFixed(2)),
                maxDD: Number(maxDD.toFixed(2)),
                netR: Number(totalR.toFixed(2)),
              });
            }
          }
        }
      }
    }
  }

  results.sort((a, b) => b.wr - a.wr);
  return results.slice(0, 10);
}

console.log('=== OPTIMIZING FOR STRICT TRADINGVIEW 70%+ PROP FIRM EDGE ===');
const topNas = runOptimization(nas, 'NAS100');
const topXau = runOptimization(xau, 'XAUUSD');
const topSpx = runOptimization(spx, 'SPX500');

console.log('\nTop NAS100 configurations:');
console.table(topNas);

console.log('\nTop XAUUSD configurations:');
console.table(topXau);

console.log('\nTop SPX500 configurations:');
console.table(topSpx);

