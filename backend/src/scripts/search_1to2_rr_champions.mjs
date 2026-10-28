import fs from 'fs';
import { PineTS } from 'pinets';

const candles15 = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));
const candles1h = JSON.parse(fs.readFileSync('data/xauusd_1h_tv.json', 'utf8'));

console.log(`15M candles: ${candles15.length} | 1H candles: ${candles1h.length}`);

async function runSearch() {
  const p15 = new PineTS(candles15, 'XAUUSD', '15');
  await p15.ready();

  const p1h = new PineTS(candles1h, 'XAUUSD', '60');
  await p1h.ready();

  const qualifiers15 = [];
  const qualifiers1h = [];

  // --- PART 1: 15M Search (Strict 1:2 R:R) ---
  console.log(`\n=== Scanning 15M for 1:2 R:R (Win Rate >= 70%, Calmar > 4) ===`);
  const slList15 = [8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0];
  const bLens15 = [20, 25, 28, 30, 35];
  const bMults15 = [2.0, 2.1, 2.2, 2.3, 2.4, 2.5];
  const rsiFilters15 = [45, 48, 50, 52];
  const emaOffsets15 = [0.0, 2.0, 4.0];

  for (const sl of slList15) {
    const tp = sl * 2.0; // Strict 1:2 R:R!
    for (const bLen of bLens15) {
      for (const bMult of bMults15) {
        for (const rsiF of rsiFilters15) {
          for (const emaOffset of emaOffsets15) {
            const code = `//@version=5
strategy("S15", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0)
ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, ${bLen})
dev = ${bMult} * ta.stdev(close, ${bLen})
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

utcH = hour(time, "UTC")
inActiveSession = (utcH >= 1 and utcH <= 20) and (utcH != 12)

longSig = inActiveSession and close > (ema200 + ${emaOffset}) and low <= lower and close > open and rsi < ${rsiF} and strategy.position_size == 0
shortSig = inActiveSession and close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > (100 - ${rsiF}) and strategy.position_size == 0

var float ep = na
var float currSL = na
var float tpP = na

if longSig
    ep := close
    currSL := ep - ${sl}
    tpP := ep + ${tp}
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortSig
    ep := close
    currSL := ep + ${sl}
    tpP := ep - ${tp}
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)
`;
            try {
              const res = await p15.run(code);
              const trades = res.strategy.closedtrades || [];
              if (trades.length < 20) continue;

              const wins = trades.filter(t => t.profit > 0);
              const wr = (wins.length / trades.length) * 100;
              const netR = res.strategy.netprofit / sl;
              const maxDDR = (res.strategy.max_drawdown || 1) / sl;
              const calmar = maxDDR > 0 ? (netR / maxDDR) : 0;

              if (wr >= 70.0 && calmar >= 4.0) {
                qualifiers15.push({
                  tf: '15M', sl, tp, rr: '1:2.0', bLen, bMult, rsiF, emaOffset,
                  trades: trades.length, wins: wins.length, losses: trades.length - wins.length,
                  winRate: wr, netProfit: res.strategy.netprofit, netR, maxDDR, calmar
                });
                console.log(`🎯 15M QUALIFIER! SL: $${sl} / TP: $${tp} (1:2) | BB(${bLen}, ${bMult}) | Trades: ${trades.length} | WR: ${wr.toFixed(1)}% | Net: +${netR.toFixed(1)}R | Calmar: ${calmar.toFixed(1)}`);
              }
            } catch (e) {
              // ignore
            }
          }
        }
      }
    }
  }

  // --- PART 2: 1H Search (Strict 1:2 R:R) ---
  console.log(`\n=== Scanning 1H for 1:2 R:R (Win Rate >= 70%, Calmar > 4) ===`);
  const slList1h = [10.0, 12.0, 14.0, 15.0, 16.0, 18.0, 20.0];
  const bLens1h = [25, 30, 35, 40];
  const bMults1h = [2.0, 2.2, 2.4, 2.6];
  const rsiFilters1h = [40, 45, 50];

  for (const sl of slList1h) {
    const tp = sl * 2.0; // Strict 1:2 R:R!
    for (const bLen of bLens1h) {
      for (const bMult of bMults1h) {
        for (const rsiF of rsiFilters1h) {
          const code = `//@version=5
strategy("S1H", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0)
ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, ${bLen})
dev = ${bMult} * ta.stdev(close, ${bLen})
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

longSig = close > ema200 and low <= lower and close > open and rsi < ${rsiF} and strategy.position_size == 0
shortSig = close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > (100 - ${rsiF}) and strategy.position_size == 0

var float ep = na
var float currSL = na
var float tpP = na

if longSig
    ep := close
    currSL := ep - ${sl}
    tpP := ep + ${tp}
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortSig
    ep := close
    currSL := ep + ${sl}
    tpP := ep - ${tp}
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)
`;
          try {
            const res = await p1h.run(code);
            const trades = res.strategy.closedtrades || [];
            if (trades.length < 20) continue;

            const wins = trades.filter(t => t.profit > 0);
            const wr = (wins.length / trades.length) * 100;
            const netR = res.strategy.netprofit / sl;
            const maxDDR = (res.strategy.max_drawdown || 1) / sl;
            const calmar = maxDDR > 0 ? (netR / maxDDR) : 0;

            if (wr >= 70.0 && calmar >= 4.0) {
              qualifiers1h.push({
                tf: '1H', sl, tp, rr: '1:2.0', bLen, bMult, rsiF,
                trades: trades.length, wins: wins.length, losses: trades.length - wins.length,
                winRate: wr, netProfit: res.strategy.netprofit, netR, maxDDR, calmar
              });
              console.log(`🎯 1H QUALIFIER! SL: $${sl} / TP: $${tp} (1:2) | BB(${bLen}, ${bMult}) | Trades: ${trades.length} | WR: ${wr.toFixed(1)}% | Net: +${netR.toFixed(1)}R | Calmar: ${calmar.toFixed(1)}`);
            }
          } catch (e) {
            // ignore
          }
        }
      }
    }
  }

  console.log(`\nSearch Complete! Found ${qualifiers15.length} qualifiers on 15M and ${qualifiers1h.length} qualifiers on 1H.`);

  fs.writeFileSync('data/qualifiers_1to2_rr.json', JSON.stringify({ q15: qualifiers15, q1h: qualifiers1h }, null, 2));

  // Sort and display top 5 for each timeframe
  qualifiers15.sort((a, b) => (b.winRate * b.calmar) - (a.winRate * a.calmar));
  qualifiers1h.sort((a, b) => (b.winRate * b.calmar) - (a.winRate * a.calmar));

  console.log('\nTop 15M Qualifiers (Strict 1:2 R:R):');
  for (let i = 0; i < Math.min(5, qualifiers15.length); i++) {
    console.log(qualifiers15[i]);
  }

  console.log('\nTop 1H Qualifiers (Strict 1:2 R:R):');
  for (let i = 0; i < Math.min(5, qualifiers1h.length); i++) {
    console.log(qualifiers1h[i]);
  }
}

runSearch().catch(console.error);
