import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));

async function runGrid() {
  const p = new PineTS(candles, 'XAUUSD', '15');
  await p.ready();

  const candidates = [];

  // Focused grid around the strong region
  const tpList = [15.0, 16.0, 17.0, 18.0, 19.0, 20.0];
  const slList = [11.0, 12.0, 13.0, 14.0];
  const bandLens = [25, 30, 35];
  const bandMults = [2.0, 2.1, 2.2, 2.3];
  const rsiFilters = [50, 52, 54];
  const sessionStarts = [0, 1, 2];
  const sessionEnds = [20, 21, 22];

  console.log(`Starting PineTS grid search...`);
  let tested = 0;

  for (const tp of tpList) {
    for (const sl of slList) {
      for (const bLen of bandLens) {
        for (const bMult of bandMults) {
          for (const rsiF of rsiFilters) {
            for (const sStart of sessionStarts) {
              for (const sEnd of sessionEnds) {
                tested++;
                const code = `//@version=5
strategy("TestGrid", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

atr = ta.atr(14)
ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, ${bLen})
dev = ${bMult} * ta.stdev(close, ${bLen})
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

inActiveSession = (hour >= ${sStart} and hour <= ${sEnd})

longSig = inActiveSession and close > ema200 and low <= lower and close > open and rsi < ${rsiF} and strategy.position_size == 0
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
                  const res = await p.run(code);
                  const trades = res.strategy.closedtrades || [];
                  if (trades.length < 25) continue;

                  const wins = trades.filter(t => t.profit > 0);
                  const wr = (wins.length / trades.length) * 100;

                  const mProfit = {};
                  const mTrades = {};
                  const mWins = {};
                  for (const t of trades) {
                    const d = new Date(t.entry_time);
                    const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
                    mProfit[m] = (mProfit[m] || 0) + t.profit;
                    mTrades[m] = (mTrades[m] || 0) + 1;
                    if (t.profit > 0) mWins[m] = (mWins[m] || 0) + 1;
                  }

                  const rAug = (mProfit['2026-08'] || 0) / sl;
                  const rSep = (mProfit['2026-09'] || 0) / sl;
                  const rOct = (mProfit['2026-10'] || 0) / sl;

                  const netR = res.strategy.netprofit / sl;
                  const maxDD_R = (res.strategy.max_drawdown || 1) / sl;
                  const calmar = maxDD_R > 0 ? (netR / maxDD_R) : 0;

                  // User requirement check:
                  // August >= 10.0R, September >= 10.0R, October >= 8.0R, WR >= 80.0%
                  if (wr >= 80.0 && rAug >= 10.0 && rSep >= 10.0 && rOct >= 8.0) {
                    candidates.push({
                      tp, sl, bLen, bMult, rsiF, sStart, sEnd,
                      trades: trades.length,
                      wins: wins.length,
                      losses: trades.length - wins.length,
                      winRate: wr,
                      netProfit: res.strategy.netprofit,
                      netR,
                      maxDD_R,
                      calmar,
                      rAug,
                      rSep,
                      rOct,
                      mTrades,
                      mWins,
                      mProfit
                    });
                    console.log(`🎯 QUALIFIER FOUND! TP: $${tp} / SL: $${sl} | BB(${bLen}, ${bMult}) | RSI<${rsiF} | Hours ${sStart}-${sEnd} | WR: ${wr.toFixed(1)}% | Aug: +${rAug.toFixed(1)}R, Sep: +${rSep.toFixed(1)}R, Oct: +${rOct.toFixed(1)}R | Net: +${netR.toFixed(1)}R | Calmar: ${calmar.toFixed(1)}`);
                  }
                } catch (e) {
                  // ignore individual run errors
                }
              }
            }
          }
        }
      }
    }
  }

  console.log(`\nTested ${tested} combinations. Found ${candidates.length} candidates meeting ALL criteria!`);
  fs.writeFileSync('data/pinets_dual10r_oct8r_candidates.json', JSON.stringify(candidates, null, 2));

  // Sort by Calmar * NetR
  candidates.sort((a, b) => (b.calmar * b.netR) - (a.calmar * a.netR));

  console.log('\nTop 5 Candidates:');
  for (let i = 0; i < Math.min(5, candidates.length); i++) {
    const c = candidates[i];
    console.log(`#${i + 1}: TP: $${c.tp} / SL: $${c.sl} | BB(${c.bLen}, ${c.bMult}) | RSI<${c.rsiF} | Hours ${c.sStart}-${c.sEnd}`);
    console.log(`   Trades: ${c.trades} | WR: ${c.winRate.toFixed(2)}% | Net: +${c.netR.toFixed(2)}R | MaxDD: ${c.maxDD_R.toFixed(2)}R | Calmar: ${c.calmar.toFixed(2)}`);
    console.log(`   Aug: +${c.rAug.toFixed(2)}R | Sep: +${c.rSep.toFixed(2)}R | Oct: +${c.rOct.toFixed(2)}R\n`);
  }
}

runGrid().catch(console.error);
