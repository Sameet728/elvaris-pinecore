import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

// Search parameter grid in PineTS directly to find >=80% Win Rate and positive high returns
async function search() {
  const tpList = [15.0, 20.0, 25.0, 30.0, 35.0, 40.0, 50.0];
  const slMultList = [0.15, 0.20, 0.25, 0.30];
  const beList = [0.30, 0.35, 0.40];
  const lockList = [0.70, 0.80, 0.90];
  
  console.log('Searching parameter space directly in PineTS...');

  // Let's test a clean, robust strategy structure:
  const baseCode = (tpPips, atrMult, beTrig, lockTrig, lockVal) => `//@version=6
strategy("Candidate", overlay=true, 
         initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, 
         margin_long=0, margin_short=0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

tpDist = ${tpPips} / 10.0
atr = ta.atr(14)
ema = ta.ema(close, 50)

sH1 = ta.pivothigh(high, 4, 4)
sL1 = ta.pivotlow(low, 4, 4)
sH2 = ta.pivothigh(high, 6, 6)
sL2 = ta.pivotlow(low, 6, 6)

var float[] bslLvls  = array.new_float()
var bool[]  bslSwept = array.new_bool()
var float[] sslLvls  = array.new_float()
var bool[]  sslSwept = array.new_bool()

if not na(sH1)
    array.push(bslLvls, sH1)
    array.push(bslSwept, false)
    if array.size(bslLvls) > 15
        array.shift(bslLvls)
        array.shift(bslSwept)

if not na(sL1)
    array.push(sslLvls, sL1)
    array.push(sslSwept, false)
    if array.size(sslLvls) > 15
        array.shift(sslLvls)
        array.shift(sslSwept)

if not na(sH2)
    array.push(bslLvls, sH2)
    array.push(bslSwept, false)
    if array.size(bslLvls) > 15
        array.shift(bslLvls)
        array.shift(bslSwept)

if not na(sL2)
    array.push(sslLvls, sL2)
    array.push(sslSwept, false)
    if array.size(sslLvls) > 15
        array.shift(sslLvls)
        array.shift(sslSwept)

sslSweep = false
bslSweep = false

if array.size(sslLvls) > 0
    for k = 0 to array.size(sslLvls) - 1
        if not array.get(sslSwept, k)
            lvl = array.get(sslLvls, k)
            if low < lvl and close > lvl
                array.set(sslSwept, k, true)
                sslSweep := true
                break

if array.size(bslLvls) > 0
    for k = 0 to array.size(bslLvls) - 1
        if not array.get(bslSwept, k)
            lvl = array.get(bslLvls, k)
            if high > lvl and close < lvl
                array.set(bslSwept, k, true)
                bslSweep := true
                break

bullFVG = low > high[2]
bearFVG = high < low[2]

var float[] bFvgTop = array.new_float()
var float[] bFvgBot = array.new_float()
var int[]   bFvgBar = array.new_int()

var float[] sFvgTop = array.new_float()
var float[] sFvgBot = array.new_float()
var int[]   sFvgBar = array.new_int()

if bullFVG
    array.push(bFvgTop, low)
    array.push(bFvgBot, high[2])
    array.push(bFvgBar, bar_index)
    if array.size(bFvgTop) > 10
        array.shift(bFvgTop)
        array.shift(bFvgBot)
        array.shift(bFvgBar)

if bearFVG
    array.push(sFvgTop, low[2])
    array.push(sFvgBot, high)
    array.push(sFvgBar, bar_index)
    if array.size(sFvgTop) > 10
        array.shift(sFvgTop)
        array.shift(sFvgBot)
        array.shift(sFvgBar)

var bool lookLong = false
var bool lookShort = false
var int setupBarL = 0
var int setupBarS = 0

if sslSweep and close > ema and strategy.position_size == 0
    lookLong := true
    lookShort := false
    setupBarL := bar_index

if bslSweep and close < ema and strategy.position_size == 0
    lookShort := true
    lookLong := false
    setupBarS := bar_index

if lookLong and (bar_index - setupBarL) > 25
    lookLong := false
if lookShort and (bar_index - setupBarS) > 25
    lookShort := false

var float entryP = na
var float initSL = na
var float currSL = na
var float tpP = na
var bool isBE = false
var bool isLock = false
var int entryBar = 0

// Strict Entry When Flat
if lookLong and strategy.position_size == 0 and array.size(bFvgTop) > 0
    for f = array.size(bFvgTop) - 1 to 0
        if array.get(bFvgBar, f) > setupBarL
            fTop = array.get(bFvgTop, f)
            fBot = array.get(bFvgBot, f)
            if low <= fTop and close > fBot
                e = close
                s = fBot - atr * ${atrMult}
                slDist = e - s
                if slDist > 0.4 and slDist < math.max(2.0, tpDist / 1.5)
                    entryP := e
                    initSL := s
                    currSL := s
                    tpP := e + tpDist
                    isBE := false
                    isLock := false
                    entryBar := bar_index
                    lookLong := false
                    strategy.entry("Long", strategy.long)
                    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)
                    break

if lookShort and strategy.position_size == 0 and array.size(sFvgTop) > 0
    for f = array.size(sFvgTop) - 1 to 0
        if array.get(sFvgBar, f) > setupBarS
            fTop = array.get(sFvgTop, f)
            fBot = array.get(sFvgBot, f)
            if high >= fBot and close < fTop
                e = close
                s = fTop + atr * ${atrMult}
                slDist = s - e
                if slDist > 0.4 and slDist < math.max(2.0, tpDist / 1.5)
                    entryP := e
                    initSL := s
                    currSL := s
                    tpP := e - tpDist
                    isBE := false
                    isLock := false
                    entryBar := bar_index
                    lookShort := false
                    strategy.entry("Short", strategy.short)
                    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)
                    break

// Position Trailing and Order Maintenance
if strategy.position_size != 0
    dir = strategy.position_size > 0 ? 1 : -1
    slDistInit = math.abs(entryP - initSL)
    currentGain = dir == 1 ? (high - entryP) : (entryP - low)

    // Positive Breakeven at +${beTrig}R (Secures +0.05 USD in TV!)
    if not isBE and currentGain >= slDistInit * ${beTrig}
        targetBE = dir == 1 ? (entryP + syminfo.mintick * 5) : (entryP - syminfo.mintick * 5)
        if (dir == 1 and close > targetBE) or (dir == -1 and close < targetBE)
            currSL := targetBE
            isBE := true

    // Profit Lock at +${lockTrig}R -> Secure +${lockVal}R
    if not isLock and currentGain >= slDistInit * ${lockTrig}
        targetLock = dir == 1 ? (entryP + slDistInit * ${lockVal}) : (entryP - slDistInit * ${lockVal})
        if (dir == 1 and close > targetLock) or (dir == -1 and close < targetLock)
            currSL := targetLock
            isLock := true

    if (bar_index - entryBar) >= 45
        strategy.close_all(comment="Timeout")
    else
        if dir == 1
            strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)
        else
            strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)
`;

  const results = [];
  for (const tp of [20.0, 25.0, 30.0, 35.0]) {
    for (const be of [0.30, 0.35]) {
      for (const lock of [0.70, 0.80]) {
        const lockVal = lock - 0.20;
        const code = baseCode(tp, 0.22, be, lock, lockVal);
        const p = new PineTS(candles, 'XAUUSD', '5');
        await p.ready();
        const res = await p.run(code);
        const s = res.strategy;
        const trades = s.closedtrades || [];
        const wins = trades.filter(t => t.profit > 0);
        const wr = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
        results.push({
          tp, be, lock, lockVal,
          total: trades.length,
          wins: wins.length,
          wr: wr.toFixed(1),
          profit: s.netprofit.toFixed(2),
          dd: (s.max_drawdown_percent_value * 100).toFixed(2)
        });
      }
    }
  }

  results.sort((a, b) => Number(b.wr) - Number(a.wr));
  console.log('Top Results:');
  results.slice(0, 10).forEach(r => {
    console.log(`TP=${r.tp} BE=${r.be} Lock=${r.lock}/${r.lockVal} -> Trades=${r.total} Wins=${r.wins} WR=${r.wr}% Profit=$${r.profit} DD=${r.dd}%`);
  });
}

search().catch(console.error);
