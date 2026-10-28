import fs from 'fs';
import { PineTS } from 'pinets';

const candles5m = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));
const candles15m = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));

console.log(`Loaded ${candles5m.length} 5M candles and ${candles15m.length} 15M candles`);

// Build Strategy template
// Pure Sovereign rules:
// - Macro Trend: close > ema200 (Long), close < ema200 & ema50 < ema200 (Short)
// - Volatility Band (Bollinger/SMA + Dev): low <= lower (Long), high >= upper (Short)
// - Confirmed Candle Close: close > open (Long), close < open (Short)
// - RSI Filter: rsi < rsiL (Long), rsi > (100 - rsiL) (Short)
// - Confirmed Bar Close Execution: zero lookahead bias
const makeCode = (tp, sl, blen, bmult, rsiL, beTrigger, cool, tf) => `//@version=6
strategy("Target_Champion", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, margin_long=0, margin_short=0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

atr = ta.atr(14)
ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, ${blen})
dev = ${bmult} * ta.stdev(close, ${blen})
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

var int lastLossBar = -999

longCond = (bar_index - lastLossBar > ${cool}) and close > ema200 and low <= lower and close > open and rsi < ${rsiL} and strategy.position_size == 0
shortCond = (bar_index - lastLossBar > ${cool}) and close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > ${100 - rsiL} and strategy.position_size == 0

var float ep = na
var float currSL = na
var float tpP = na
var bool isBE = false

if longCond
    ep := close
    currSL := ep - ${sl}
    tpP := ep + ${tp}
    isBE := false
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortCond
    ep := close
    currSL := ep + ${sl}
    tpP := ep - ${tp}
    isBE := false
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)

if strategy.position_size != 0
    dir = strategy.position_size > 0 ? 1 : -1
    currentGain = dir == 1 ? (high - ep) : (ep - low)

    ${beTrigger > 0 ? `
    if not isBE and currentGain >= ${sl} * ${beTrigger}
        currSL := dir == 1 ? (ep + syminfo.mintick * 10) : (ep - syminfo.mintick * 10)
        isBE := true
    ` : ''}

    exitComment = isBE ? "BREAKEVEN" : "SL HIT"
    strategy.exit(dir == 1 ? "Exit Long" : "Exit Short", dir == 1 ? "Long" : "Short", limit=tpP, stop=currSL, comment_profit="TP HIT", comment_loss=exitComment)

if strategy.closedtrades > strategy.closedtrades[1]
    if strategy.closedtrades.profit(strategy.closedtrades - 1) < -0.05
        lastLossBar := bar_index
`;

async function searchDataset(candles, tfName, tfCode, tpRange, slRange) {
  console.log(`\n======================================================`);
  console.log(`=== SEARCHING ${tfName} FOR TARGET >= 10R/MONTH, WR >= 75-80%, R:R >= 1:1 ===`);
  console.log(`======================================================`);

  const champions = [];

  for (const sl of slRange) {
    for (const tp of tpRange) {
      if (tp < sl * 0.95) continue; // Ensure R:R >= 1:1
      for (const blen of [20, 25, 30]) {
        for (const bmult of [2.0, 2.2, 2.4, 2.6]) {
          for (const rsiL of [40, 45, 50]) {
            for (const beTrigger of [0.0, 0.35, 0.40, 0.50]) {
              for (const cool of [0, 2, 4]) {
                try {
                  const code = makeCode(tp, sl, blen, bmult, rsiL, beTrigger, cool, tfCode);
                  const p = new PineTS(candles, 'XAUUSD', tfCode);
                  await p.ready();
                  const res = await p.run(code);
                  const s = res.strategy;
                  const trades = s.closedtrades || [];

                  // Require substantial trade count
                  const minTrades = tfCode === '5' ? 25 : 20;
                  if (trades.length < minTrades) continue;

                  const wins = trades.filter(t => t.profit > 0);
                  const losses = trades.filter(t => t.profit <= 0);
                  const wr = (wins.length / trades.length) * 100;
                  const net = s.netprofit;
                  const dd = s.max_drawdown || 1;
                  const calmar = net / dd;

                  // Realized R:R
                  const avgWin = wins.reduce((acc, t) => acc + t.profit, 0) / (wins.length || 1);
                  const avgLoss = losses.length ? Math.abs(losses.reduce((acc, t) => acc + t.profit, 0) / losses.length) : 1;
                  const realRR = avgWin / avgLoss;

                  // Target filters: WR >= 75%, Calmar >= 4.0, Realized R:R >= 0.95
                  if (wr >= 75.0 && calmar >= 4.0 && realRR >= 0.95) {
                    // Calculate Monthly R
                    // 1R = sl dollars
                    const totalR = net / sl;
                    
                    // Monthly breakdown
                    const monthly = {};
                    trades.forEach(t => {
                      const d = new Date(t.entry_time);
                      const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
                      monthly[mKey] = (monthly[mKey] || 0) + (t.profit / sl);
                    });
                    const mKeys = Object.keys(monthly);
                    const avgMonthlyR = totalR / Math.max(mKeys.length, 1);

                    console.log(`⭐ [${tfName} MATCH] TP: $${tp.toFixed(1)} (${(tp*10).toFixed(0)}p) | SL: $${sl.toFixed(1)} (${(sl*10).toFixed(0)}p) | BB(${blen}, ${bmult}) | RSI<${rsiL} | BE:${beTrigger} -> Trades: ${trades.length} | WR: ${wr.toFixed(1)}% | Net: +$${net.toFixed(1)} (+${totalR.toFixed(1)}R) | AvgMoR: +${avgMonthlyR.toFixed(1)}R/mo | DD: $${dd.toFixed(1)} | Calmar: ${calmar.toFixed(2)} | Real R:R: 1:${realRR.toFixed(2)}`);

                    champions.push({
                      tfName, tfCode, tp, sl, blen, bmult, rsiL, beTrigger, cool,
                      trades: trades.length, wins: wins.length, losses: losses.length,
                      wr, net, dd, calmar, realRR, avgWin, avgLoss, totalR, avgMonthlyR, monthly
                    });
                  }
                } catch (e) {}
              }
            }
          }
        }
      }
    }
  }

  // Sort by Win Rate & Monthly R
  champions.sort((a, b) => (b.wr * b.avgMonthlyR) - (a.wr * a.avgMonthlyR));
  return champions;
}

async function main() {
  // Search 5M: TP 40 to 100 pips ($4.00 to $10.00), SL 30 to 80 pips ($3.00 to $8.00)
  const champs5m = await searchDataset(candles5m, '5M (5 Minutes)', '5', 
    [4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0], 
    [3.0, 4.0, 5.0, 6.0, 7.0, 8.0]
  );

  // Search 15M: TP 60 to 120 pips ($6.00 to $12.00), SL 50 to 100 pips ($5.00 to $10.00)
  const champs15m = await searchDataset(candles15m, '15M (15 Minutes)', '15',
    [6.0, 7.0, 8.0, 9.0, 10.0, 12.0],
    [5.0, 6.0, 7.0, 8.0, 10.0]
  );

  console.log('\n======================================================');
  console.log('=== TOP 3 5-MINUTE CHAMPIONS ===');
  console.log('======================================================');
  champs5m.slice(0, 3).forEach((c, i) => {
    console.log(`#${i+1}: WR: ${c.wr.toFixed(1)}% (${c.wins}W/${c.losses}L) | Trades: ${c.trades} | Net: +$${c.net.toFixed(2)} (+${c.totalR.toFixed(1)}R) | ${c.avgMonthlyR.toFixed(1)}R/mo | Calmar: ${c.calmar.toFixed(2)} | Real R:R: 1:${c.realRR.toFixed(2)} (+$${c.avgWin.toFixed(2)} / -$${c.avgLoss.toFixed(2)})`);
    console.log(`Params: TP=$${c.tp} (${c.tp*10}p), SL=$${c.sl} (${c.sl*10}p), BB(${c.blen}, ${c.bmult}), RSI<${c.rsiL}, BE=${c.beTrigger}, Cool=${c.cool}`);
    console.log('Monthly R:', c.monthly, '\n');
  });

  console.log('\n======================================================');
  console.log('=== TOP 3 15-MINUTE CHAMPIONS ===');
  console.log('======================================================');
  champs15m.slice(0, 3).forEach((c, i) => {
    console.log(`#${i+1}: WR: ${c.wr.toFixed(1)}% (${c.wins}W/${c.losses}L) | Trades: ${c.trades} | Net: +$${c.net.toFixed(2)} (+${c.totalR.toFixed(1)}R) | ${c.avgMonthlyR.toFixed(1)}R/mo | Calmar: ${c.calmar.toFixed(2)} | Real R:R: 1:${c.realRR.toFixed(2)} (+$${c.avgWin.toFixed(2)} / -$${c.avgLoss.toFixed(2)})`);
    console.log(`Params: TP=$${c.tp} (${c.tp*10}p), SL=$${c.sl} (${c.sl*10}p), BB(${c.blen}, ${c.bmult}), RSI<${c.rsiL}, BE=${c.beTrigger}, Cool=${c.cool}`);
    console.log('Monthly R:', c.monthly, '\n');
  });

  fs.writeFileSync('backend/src/scripts/target_champions_results.json', JSON.stringify({ champs5m, champs15m }, null, 2));
}

main().catch(console.error);
