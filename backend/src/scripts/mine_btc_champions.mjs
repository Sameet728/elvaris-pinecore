import fs from 'fs';
import { PineTS } from 'pinets';

const candles15M = JSON.parse(fs.readFileSync('data/btcusdt_15m_tv.json', 'utf8'));
const candles1H = JSON.parse(fs.readFileSync('data/btcusdt_1h_tv.json', 'utf8'));

console.log(`Loaded BTCUSDT 15M (${candles15M.length} bars) and 1H (${candles1H.length} bars)`);

const p15 = new PineTS(candles15M, 'BTCUSDT', '15');
const p1h = new PineTS(candles1H, 'BTCUSDT', '60');
await Promise.all([p15.ready(), p1h.ready()]);

// Fast matrix evaluator for 15M
async function search15M() {
  console.log('\n--- Grid Searching BTC 15M Champions ---');
  const bandLens = [20, 24, 26, 28, 30];
  const bandMults = [2.2, 2.3, 2.4, 2.5, 2.6];
  const rsis = [48, 50, 52, 55];
  const slList = [500, 600, 700, 800, 1000];
  const rrMultipliers = [1.2, 1.5, 2.0]; // strict RR
  const wicks = [0.0, 0.10, 0.15];

  const results = [];

  for (const bLen of bandLens) {
    for (const bMult of bandMults) {
      for (const rsi of rsis) {
        for (const sl of slList) {
          for (const rr of rrMultipliers) {
            const tp = sl * rr;
            for (const wick of wicks) {
              const wickStrLong = wick > 0 ? ` and (math.min(open, close) - low) >= (math.abs(close - open) * ${wick})` : '';
              const wickStrShort = wick > 0 ? ` and (high - math.max(open, close)) >= (math.abs(close - open) * ${wick})` : '';

              const code = `//@version=5
strategy("BTC15M", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, ${bLen})
dev = ${bMult} * ta.stdev(close, ${bLen})
upper = basis + dev
lower = basis - dev
rsiVal = ta.rsi(close, 14)

longSig = close > ema200 and low <= lower and close > open and rsiVal < ${rsi}${wickStrLong} and strategy.position_size == 0
shortSig = close < ema200 and ema50 < ema200 and high >= upper and close < open and rsiVal > (100 - ${rsi})${wickStrShort} and strategy.position_size == 0

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

              const res = await p15.run(code);
              const trades = res.strategy.closedtrades || [];
              const wins = trades.filter(t => t.profit > 0);
              const wr = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
              const net = res.strategy.netprofit || 0;
              const maxDD = res.strategy.max_drawdown || 1;
              const netR = net / sl;
              const maxDDR = maxDD / sl;
              const calmar = maxDDR > 0 ? (netR / maxDDR) : 0;

              // Filter for high quality
              if (trades.length >= 15 && wr >= 70.0 && calmar >= 5.0 && net > 0) {
                // Compute monthly breakdown
                const mR = {};
                for (const t of trades) {
                  const m = new Date(t.entry_time).toISOString().substring(0, 7);
                  mR[m] = (mR[m] || 0) + (t.profit / sl);
                }
                results.push({
                  bLen, bMult, rsi, sl, tp, rr, wick,
                  trades: trades.length,
                  wins: wins.length,
                  losses: trades.length - wins.length,
                  wr: Number(wr.toFixed(2)),
                  net: Number(net.toFixed(2)),
                  netR: Number(netR.toFixed(2)),
                  maxDD: Number(maxDD.toFixed(2)),
                  maxDDR: Number(maxDDR.toFixed(2)),
                  calmar: Number(calmar.toFixed(2)),
                  monthly: mR
                });
              }
            }
          }
        }
      }
    }
  }

  results.sort((a, b) => b.calmar - a.calmar || b.wr - a.wr);
  console.log(`Found ${results.length} 15M BTC candidates meeting institutional criteria!`);
  console.log('\nTop 5 15M Candidates:');
  results.slice(0, 5).forEach((r, i) => {
    console.log(`\n#${i+1}: BB(${r.bLen}, ${r.bMult}) | SL: $${r.sl} / TP: $${r.tp} (1:${r.rr}) | RSI: <${r.rsi} | Wick: ${r.wick}`);
    console.log(`    Trades: ${r.trades} | WR: ${r.wr}% | Net: $${r.net} (+${r.netR}R) | MaxDD: $${r.maxDD} (${r.maxDDR}R) | Calmar: ${r.calmar}`);
    console.log(`    Monthly: ${JSON.stringify(r.monthly)}`);
  });

  return results;
}

// Search 1H
async function search1H() {
  console.log('\n--- Grid Searching BTC 1H Champions (10-Month Dataset) ---');
  const bandLens = [20, 24, 28, 30];
  const bandMults = [2.2, 2.4, 2.5, 2.6];
  const rsis = [48, 50, 52];
  const slList = [800, 1000, 1200, 1500];
  const rrMultipliers = [1.2, 1.5, 2.0];
  const wicks = [0.0, 0.10];

  const results = [];

  for (const bLen of bandLens) {
    for (const bMult of bandMults) {
      for (const rsi of rsis) {
        for (const sl of slList) {
          for (const rr of rrMultipliers) {
            const tp = sl * rr;
            for (const wick of wicks) {
              const wickStrLong = wick > 0 ? ` and (math.min(open, close) - low) >= (math.abs(close - open) * ${wick})` : '';
              const wickStrShort = wick > 0 ? ` and (high - math.max(open, close)) >= (math.abs(close - open) * ${wick})` : '';

              const code = `//@version=5
strategy("BTC1H", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, ${bLen})
dev = ${bMult} * ta.stdev(close, ${bLen})
upper = basis + dev
lower = basis - dev
rsiVal = ta.rsi(close, 14)

longSig = close > ema200 and low <= lower and close > open and rsiVal < ${rsi}${wickStrLong} and strategy.position_size == 0
shortSig = close < ema200 and ema50 < ema200 and high >= upper and close < open and rsiVal > (100 - ${rsi})${wickStrShort} and strategy.position_size == 0

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

              const res = await p1h.run(code);
              const trades = res.strategy.closedtrades || [];
              const wins = trades.filter(t => t.profit > 0);
              const wr = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
              const net = res.strategy.netprofit || 0;
              const maxDD = res.strategy.max_drawdown || 1;
              const netR = net / sl;
              const maxDDR = maxDD / sl;
              const calmar = maxDDR > 0 ? (netR / maxDDR) : 0;

              if (trades.length >= 25 && wr >= 65.0 && calmar >= 5.0 && net > 0) {
                const mR = {};
                for (const t of trades) {
                  const m = new Date(t.entry_time).toISOString().substring(0, 7);
                  mR[m] = (mR[m] || 0) + (t.profit / sl);
                }
                results.push({
                  bLen, bMult, rsi, sl, tp, rr, wick,
                  trades: trades.length,
                  wins: wins.length,
                  losses: trades.length - wins.length,
                  wr: Number(wr.toFixed(2)),
                  net: Number(net.toFixed(2)),
                  netR: Number(netR.toFixed(2)),
                  maxDD: Number(maxDD.toFixed(2)),
                  maxDDR: Number(maxDDR.toFixed(2)),
                  calmar: Number(calmar.toFixed(2)),
                  monthly: mR
                });
              }
            }
          }
        }
      }
    }
  }

  results.sort((a, b) => b.calmar - a.calmar || b.wr - a.wr);
  console.log(`Found ${results.length} 1H BTC candidates meeting institutional criteria!`);
  console.log('\nTop 5 1H Candidates:');
  results.slice(0, 5).forEach((r, i) => {
    console.log(`\n#${i+1}: BB(${r.bLen}, ${r.bMult}) | SL: $${r.sl} / TP: $${r.tp} (1:${r.rr}) | RSI: <${r.rsi} | Wick: ${r.wick}`);
    console.log(`    Trades: ${r.trades} | WR: ${r.wr}% | Net: $${r.net} (+${r.netR}R) | MaxDD: $${r.maxDD} (${r.maxDDR}R) | Calmar: ${r.calmar}`);
    console.log(`    Monthly: ${JSON.stringify(r.monthly)}`);
  });

  return results;
}

const res15 = await search15M();
const res1H = await search1H();

fs.writeFileSync('data/btc_optimization_results.json', JSON.stringify({ res15: res15.slice(0, 20), res1H: res1H.slice(0, 20) }, null, 2));
console.log('\nOptimization results saved to data/btc_optimization_results.json');
