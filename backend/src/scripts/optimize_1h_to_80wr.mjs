import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_1h_tv.json', 'utf8'));

console.log(`Starting Optimization on ${candles.length} 1H candles...`);

const template = (c) => `//@version=6
strategy("Opt1H", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0)

tpDist = ${c.tpPips} / 10.0
atr = ta.atr(14)
ema200 = ta.ema(close, ${c.emaLen})
basis = ta.sma(close, ${c.bandLen})
dev = ${c.bandMult} * ta.stdev(close, ${c.bandLen})
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

var int lastLossBar = -999
cooldown = ${c.cooldownBars}

longCond = (bar_index - lastLossBar > cooldown) and close > ema200 and low <= lower and close > open and rsi < ${c.rsiLong} and strategy.position_size == 0
shortCond = (bar_index - lastLossBar > cooldown) and close < ema200 and high >= upper and close < open and rsi > ${c.rsiShort} and strategy.position_size == 0

var float ep = na
var float initSL = na
var float currSL = na
var float tpP = na
var bool isBE = false

if longCond
    ep := close
    rawSL = low - atr * ${c.slMult}
    slDist = ep - rawSL
    if slDist <= ${c.maxSL}
        initSL := rawSL
        currSL := initSL
        tpP := ep + tpDist
        isBE := false
        strategy.entry("L", strategy.long)
        strategy.exit("XL", "L", limit=tpP, stop=currSL)

if shortCond
    ep := close
    rawSL = high + atr * ${c.slMult}
    slDist = rawSL - ep
    if slDist <= ${c.maxSL}
        initSL := rawSL
        currSL := initSL
        tpP := ep - tpDist
        isBE := false
        strategy.entry("S", strategy.short)
        strategy.exit("XS", "S", limit=tpP, stop=currSL)

if strategy.position_size != 0
    dir = strategy.position_size > 0 ? 1 : -1
    slDistInit = math.abs(ep - initSL)
    currentGain = dir == 1 ? (high - ep) : (ep - low)

    ${c.useBE ? `
    if not isBE and currentGain >= slDistInit * ${c.beTrigger}
        currSL := dir == 1 ? (ep + syminfo.mintick * 10) : (ep - syminfo.mintick * 10)
        isBE := true
    ` : ''}

    strategy.exit(dir == 1 ? "XL" : "XS", dir == 1 ? "L" : "S", limit=tpP, stop=currSL)

if strategy.closedtrades > strategy.closedtrades[1]
    if strategy.closedtrades.profit(strategy.closedtrades - 1) < -0.05
        lastLossBar := bar_index
`;

async function run() {
  const configs = [];
  for (const tpPips of [80, 100, 120, 140]) {
    for (const bandLen of [20, 25, 30]) {
      for (const bandMult of [2.0, 2.2, 2.4]) {
        for (const maxSL of [25.0, 30.0, 35.0]) {
          for (const slMult of [1.0, 1.2]) {
            for (const rsiLong of [40, 45, 50]) {
              for (const beTrigger of [0.4, 0.5]) {
                for (const cooldownBars of [0, 4]) {
                  configs.push({
                    tpPips, bandLen, bandMult, maxSL, slMult,
                    emaLen: 200,
                    rsiLong,
                    rsiShort: 100 - rsiLong,
                    useBE: true,
                    beTrigger,
                    cooldownBars
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  console.log(`Generated ${configs.length} configurations to test.`);
  let champions = [];

  for (let i = 0; i < configs.length; i++) {
    const c = configs[i];
    try {
      const code = template(c);
      const p = new PineTS(candles, 'XAUUSD', '60');
      await p.ready();
      const res = await p.run(code);
      const s = res.strategy;
      const trades = s.closedtrades || [];
      if (trades.length < 50) continue;
      const wins = trades.filter(t => t.profit > 0);
      const wr = (wins.length / trades.length) * 100;

      if (wr >= 80.0 && s.netprofit > 300) {
        console.log(`⭐ CHAMPION FOUND! WR: ${wr.toFixed(1)}% | Net: $${s.netprofit.toFixed(2)} | Trades: ${trades.length} | DD: $${s.max_drawdown.toFixed(2)} | TP: ${c.tpPips}p | Band: ${c.bandLen}/${c.bandMult} | MaxSL: $${c.maxSL} | BE: ${c.beTrigger} | Cool: ${c.cooldownBars}`);
        champions.push({ c, wr, net: s.netprofit, dd: s.max_drawdown, trades: trades.length });
      }
    } catch (e) {}

    if (i % 100 === 0) {
      console.log(`Progress: ${i}/${configs.length} tested... Champions so far: ${champions.length}`);
    }
  }

  champions.sort((a, b) => b.wr - a.wr);
  console.log('\n=== TOP 5 VERIFIED CHAMPIONS (>80% WR) ===');
  champions.slice(0, 5).forEach((ch, idx) => {
    console.log(`#${idx+1}: WR: ${ch.wr.toFixed(1)}% | Net: $${ch.net.toFixed(2)} | DD: $${ch.dd.toFixed(2)} | Trades: ${ch.trades}`);
    console.log('Config:', ch.c);
  });
}

run().catch(console.error);
