import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

// Test different parameter setups directly in PineTS to find >=80% WR with >10R net return
async function runPineTest(params) {
  const code = `//@version=6
strategy("Optimizer", overlay=true, 
         initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, 
         margin_long=0, margin_short=0,
         commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

tpPips = ${params.tpPips}
tpDist = tpPips / 10.0
swingLen = ${params.swingLen}
majSwingLen = ${params.majSwingLen}
emaLen = ${params.emaLen}
atrMult = ${params.atrMult}
beTriggerR = ${params.beTriggerR}
lockTriggerR = ${params.lockTriggerR}
lockValR = ${params.lockValR}
maxHoldBars = ${params.maxHoldBars}
useSession = ${params.useSession}

atr = ta.atr(14)
ema = ta.ema(close, emaLen)

// London & NY Session filter (07:00 to 20:00 UTC)
inSession = not useSession or (time(timeframe.period, "0700-2000:23456") != 0)

sH1 = ta.pivothigh(high, swingLen, swingLen)
sL1 = ta.pivotlow(low,  swingLen, swingLen)
sH2 = ta.pivothigh(high, majSwingLen, majSwingLen)
sL2 = ta.pivotlow(low,  majSwingLen, majSwingLen)

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

if sslSweep and close > ema and strategy.position_size == 0 and inSession
    lookLong := true
    lookShort := false
    setupBarL := bar_index

if bslSweep and close < ema and strategy.position_size == 0 and inSession
    lookShort := true
    lookLong := false
    setupBarS := bar_index

if lookLong and (bar_index - setupBarL) > 20
    lookLong := false
if lookShort and (bar_index - setupBarS) > 20
    lookShort := false

var float entryP = na
var float initSL = na
var float currSL = na
var float tpP = na
var bool isBE = false
var bool isLock = false
var int entryBar = 0

// Strictly entry when flat
if lookLong and strategy.position_size == 0 and inSession and array.size(bFvgTop) > 0
    for f = array.size(bFvgTop) - 1 to 0
        if array.get(bFvgBar, f) > setupBarL
            fTop = array.get(bFvgTop, f)
            fBot = array.get(bFvgBot, f)
            if low <= fTop and close > fBot
                e = close
                s = fBot - atr * atrMult
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

if lookShort and strategy.position_size == 0 and inSession and array.size(sFvgTop) > 0
    for f = array.size(sFvgTop) - 1 to 0
        if array.get(sFvgBar, f) > setupBarS
            fTop = array.get(sFvgTop, f)
            fBot = array.get(sFvgBot, f)
            if high >= fBot and close < fTop
                e = close
                s = fTop + atr * atrMult
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

if strategy.position_size != 0
    dir = strategy.position_size > 0 ? 1 : -1
    slDistInit = math.abs(entryP - initSL)
    currentGain = dir == 1 ? (high - entryP) : (entryP - low)

    // Positive Breakeven
    if not isBE and currentGain >= slDistInit * beTriggerR
        targetBE = dir == 1 ? (entryP + syminfo.mintick * 5) : (entryP - syminfo.mintick * 5)
        if (dir == 1 and close > targetBE) or (dir == -1 and close < targetBE)
            currSL := targetBE
            isBE := true

    // Profit Lock
    if not isLock and currentGain >= slDistInit * lockTriggerR
        targetLock = dir == 1 ? (entryP + slDistInit * lockValR) : (entryP - slDistInit * lockValR)
        if (dir == 1 and close > targetLock) or (dir == -1 and close < targetLock)
            currSL := targetLock
            isLock := true

    if (bar_index - entryBar) >= maxHoldBars
        strategy.close_all(comment="Timeout Exit")
    else
        if dir == 1
            strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)
        else
            strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)
`;

  const p = new PineTS(candles, 'XAUUSD', '5');
  await p.ready();
  const res = await p.run(code);
  const s = res.strategy;
  const trades = s.closedtrades || [];
  const wins = trades.filter(t => t.profit > 0).length;
  const losses = trades.filter(t => t.profit <= 0).length;
  const wr = trades.length > 0 ? (wins / trades.length) * 100 : 0;
  return {
    params,
    total: trades.length,
    wins,
    losses,
    wr: wr.toFixed(1) + '%',
    profit: s.netprofit.toFixed(2),
    dd: (s.max_drawdown_percent_value * 100).toFixed(2) + '%'
  };
}

async function main() {
  console.log('Testing parameter variations in PineTS...');
  const tests = [
    { tpPips: 25.0, swingLen: 3, majSwingLen: 5, emaLen: 50, atrMult: 0.22, beTriggerR: 0.35, lockTriggerR: 0.70, lockValR: 0.50, maxHoldBars: 40, useSession: false },
    { tpPips: 25.0, swingLen: 3, majSwingLen: 5, emaLen: 50, atrMult: 0.22, beTriggerR: 0.35, lockTriggerR: 0.70, lockValR: 0.50, maxHoldBars: 40, useSession: true },
    { tpPips: 20.0, swingLen: 4, majSwingLen: 6, emaLen: 50, atrMult: 0.25, beTriggerR: 0.30, lockTriggerR: 0.65, lockValR: 0.45, maxHoldBars: 35, useSession: false },
    { tpPips: 20.0, swingLen: 4, majSwingLen: 6, emaLen: 50, atrMult: 0.25, beTriggerR: 0.30, lockTriggerR: 0.65, lockValR: 0.45, maxHoldBars: 35, useSession: true },
    { tpPips: 30.0, swingLen: 5, majSwingLen: 8, emaLen: 100, atrMult: 0.20, beTriggerR: 0.35, lockTriggerR: 0.75, lockValR: 0.55, maxHoldBars: 45, useSession: false },
    { tpPips: 30.0, swingLen: 5, majSwingLen: 8, emaLen: 100, atrMult: 0.20, beTriggerR: 0.35, lockTriggerR: 0.75, lockValR: 0.55, maxHoldBars: 45, useSession: true },
  ];

  for (const t of tests) {
    const res = await runPineTest(t);
    console.log(`TP=${t.tpPips} Sw=${t.swingLen}/${t.majSwingLen} EMA=${t.emaLen} Sess=${t.useSession} -> Total: ${res.total} | Wins: ${res.wins} Losses: ${res.losses} | WR: ${res.wr} | Profit: $${res.profit} | DD: ${res.dd}`);
  }
}

main().catch(console.error);
