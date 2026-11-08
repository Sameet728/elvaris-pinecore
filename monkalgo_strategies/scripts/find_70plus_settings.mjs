import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('monkalgo_strategies/data');
const nas = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'nas100_15m.json'), 'utf8'));

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

// Exactly simulate the Pine script from 13_GAP_STRATEGY.pine
function simulateExactPine(candles, options) {
  const {
    gapMinAtr = 0.40,
    slBufferAtr = 0.20,
    tpR = 1.20,
    beTriggerR = 0.40,
    lockTriggerR = 0.70,
    lockedProfitR = 0.50,
    useEmaFilter = true,
    useSession = false,
    maxBarsWait = 15,
    maxHoldBars = 35,
    cooldownBars = 2,
    riskPercent = 1.0,
    bodyFilter = 0.0, // Minimum candle body / ATR to avoid dojis
  } = options;

  const atrs = computeATR(candles, 14);
  const ema50 = computeEMA(candles, 50);

  let bullMid = null, bullSl = null, bullExp = 0;
  let bearMid = null, bearSl = null, bearExp = 0;

  let trades = 0, wins = 0, losses = 0, totalR = 0;
  let inTrade = false, active = null, lastExit = -999;
  let peak = 100000, maxDD = 0, equity = 100000;

  for (let i = 2; i < candles.length; i++) {
    const c = candles[i];
    const c2 = candles[i - 2];
    const d = new Date(c.openTime);
    const utcHour = d.getUTCHours();
    const inKillzone = !useSession || (utcHour >= 7 && utcHour <= 17);

    // In-trade management
    if (inTrade) {
      const t = active;
      const barsHeld = i - t.entryBar;
      let exitR = null;

      if (t.dir === 1) { // Long
        const gainR = (c.high - t.entry) / t.risk;
        if (gainR >= lockTriggerR && !t.locked) {
          t.sl = Math.max(t.sl, t.entry + t.risk * lockedProfitR);
          t.locked = true;
          t.be = true;
        } else if (gainR >= beTriggerR && !t.be) {
          t.sl = Math.max(t.sl, t.entry + t.risk * 0.05);
          t.be = true;
        }

        // Intra-bar check
        if (c.close >= c.open) {
          if (c.low <= t.sl) exitR = (t.sl - t.entry) / t.risk;
          else if (c.high >= t.tp) exitR = tpR;
        } else {
          if (c.high >= t.tp) exitR = tpR;
          else if (c.low <= t.sl) exitR = (t.sl - t.entry) / t.risk;
        }
      } else { // Short
        const gainR = (t.entry - c.low) / t.risk;
        if (gainR >= lockTriggerR && !t.locked) {
          t.sl = Math.min(t.sl, t.entry - t.risk * lockedProfitR);
          t.locked = true;
          t.be = true;
        } else if (gainR >= beTriggerR && !t.be) {
          t.sl = Math.min(t.sl, t.entry - t.risk * 0.05);
          t.be = true;
        }

        if (c.close <= c.open) {
          if (c.high >= t.sl) exitR = (t.entry - t.sl) / t.risk;
          else if (c.low <= t.tp) exitR = tpR;
        } else {
          if (c.low <= t.tp) exitR = tpR;
          else if (c.high >= t.sl) exitR = (t.entry - t.sl) / t.risk;
        }
      }

      if (exitR === null && barsHeld >= maxHoldBars) {
        exitR = t.dir === 1 ? (c.close - t.entry) / t.risk : (t.entry - c.close) / t.risk;
      }

      if (exitR !== null) {
        trades++;
        totalR += exitR;
        const dollarProfit = (equity * (riskPercent / 100)) * exitR;
        equity += dollarProfit;
        if (equity > peak) peak = equity;
        const dd = ((peak - equity) / peak) * 100;
        if (dd > maxDD) maxDD = dd;

        if (exitR > 0) wins++; else losses++;
        inTrade = false;
        active = null;
        lastExit = i;
        continue;
      }
    }

    // Gap detection
    if (c.low - c2.high > atrs[i] * gapMinAtr) {
      bullMid = (c.low + c2.high) / 2;
      bullSl = c2.high - atrs[i] * slBufferAtr;
      bullExp = i + maxBarsWait;
    }
    if (c2.low - c.high > atrs[i] * gapMinAtr) {
      bearMid = (c2.low + c.high) / 2;
      bearSl = c2.low + atrs[i] * slBufferAtr;
      bearExp = i + maxBarsWait;
    }

    // Entry signal
    if (!inTrade && i > lastExit + cooldownBars && inKillzone) {
      const isBullBody = c.close > c.open;
      const isBearBody = c.close < c.open;
      const bodySize = Math.abs(c.close - c.open);

      if (bullMid && i <= bullExp && c.low <= bullMid && c.close > bullMid) {
        if (!useEmaFilter || c.close > ema50[i]) {
          if (bodySize >= atrs[i] * bodyFilter && isBullBody) {
            const entry = c.close;
            const sl = bullSl;
            const risk = entry - sl;
            if (risk > 0) {
              inTrade = true;
              active = { dir: 1, entry, sl, tp: entry + risk * tpR, risk, entryBar: i, be: false, locked: false };
              bullMid = null;
            }
          }
        }
      } else if (bearMid && i <= bearExp && c.high >= bearMid && c.close < bearMid) {
        if (!useEmaFilter || c.close < ema50[i]) {
          if (bodySize >= atrs[i] * bodyFilter && isBearBody) {
            const entry = c.close;
            const sl = bearSl;
            const risk = sl - entry;
            if (risk > 0) {
              inTrade = true;
              active = { dir: -1, entry, sl, tp: entry - risk * tpR, risk, entryBar: i, be: false, locked: false };
              bearMid = null;
            }
          }
        }
      }
    }

    if (i > bullExp) bullMid = null;
    if (i > bearExp) bearMid = null;
  }

  const wr = trades ? ((wins / trades) * 100).toFixed(1) : 0;
  const pf = (wins * tpR / (losses || 1)).toFixed(2);
  const netProfitPct = (((equity - 100000) / 100000) * 100).toFixed(1);
  return { trades, wins, losses, wr: Number(wr), pf: Number(pf), maxDD: Number(maxDD.toFixed(2)), netProfitPct: Number(netProfitPct), netR: Number(totalR.toFixed(1)) };
}

console.log('--- Current Settings on NAS100 ---');
console.log(simulateExactPine(nas, { riskPercent: 1.0, tpR: 1.20, beTriggerR: 0.40 }));

console.log('\n--- Grid Search for 70%+ Win Rate & Prop Firm Drawdown < 4.0% ---');
for (const tp of [0.8, 0.9, 1.0, 1.1]) {
  for (const be of [0.35, 0.40, 0.50]) {
    for (const bodyFilter of [0.0, 0.2, 0.3, 0.4]) {
      for (const gapMin of [0.4, 0.5, 0.6]) {
        for (const risk of [0.5, 1.0]) {
          const res = simulateExactPine(nas, {
            tpR: tp,
            beTriggerR: be,
            bodyFilter,
            gapMinAtr: gapMin,
            riskPercent: risk,
          });
          if (res.wr >= 70.0 && res.maxDD <= 4.0 && res.trades >= 60) {
            console.log(`TP: ${tp}R | BE: ${be}R | Body: ${bodyFilter} | GapMin: ${gapMin} | Risk: ${risk}% -> Trades: ${res.trades}, WR: ${res.wr}%, PF: ${res.pf}, MaxDD: ${res.maxDD}%, Net: +${res.netProfitPct}% (+${res.netR}R)`);
          }
        }
      }
    }
  }
}

