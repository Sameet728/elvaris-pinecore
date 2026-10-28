import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

// Test what happens when we enforce that currSL is valid relative to close:
// For Long: currSL must be < close
// For Short: currSL must be > close
// OR: only trigger BE / Lock when close confirms the move!

async function testCloseBasedLocks() {
  const code = `//@version=6
strategy("TestCloseLock", overlay=true, 
         initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, 
         margin_long=0, margin_short=0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

tpPips = 30.0
tpDist = tpPips / 10.0
ema = ta.ema(close, 50)
atr = ta.atr(14)

sH1 = ta.pivothigh(high, 4, 4)
sL1 = ta.pivotlow(low,  4, 4)
sH2 = ta.pivothigh(high, 6, 6)
sL2 = ta.pivotlow(low,  6, 6)

var float bsl = na
var float ssl = na
if not na(sH1)
    bsl := sH1
if not na(sH2)
    bsl := sH2
if not na(sL1)
    ssl := sL1
if not na(sL2)
    ssl := sL2

sslSweep = not na(ssl) and low < ssl and close > ssl
bslSweep = not na(bsl) and high > bsl and close < bsl

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
    if array.size(bFvgTop) > 15
        array.shift(bFvgTop)
        array.shift(bFvgBot)
        array.shift(bFvgBar)

if bearFVG
    array.push(sFvgTop, low[2])
    array.push(sFvgBot, high)
    array.push(sFvgBar, bar_index)
    if array.size(sFvgTop) > 15
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
var bool isLock1 = false
var bool isLock2 = false

// Entry
if lookLong and strategy.position_size == 0 and array.size(bFvgTop) > 0
    for f = array.size(bFvgTop) - 1 to 0
        if array.get(bFvgBar, f) > setupBarL
            fTop = array.get(bFvgTop, f)
            fBot = array.get(bFvgBot, f)
            if low <= fTop and close > fBot
                e = close
                s = fBot - atr * 0.22
                slDist = e - s
                if slDist > 0.4 and slDist < math.max(2.0, tpDist / 1.5)
                    entryP := e
                    initSL := s
                    currSL := s
                    tpP := e + tpDist
                    isBE := false
                    isLock1 := false
                    isLock2 := false
                    lookLong := false
                    strategy.entry("Long", strategy.long)
                    break

if lookShort and strategy.position_size == 0 and array.size(sFvgTop) > 0
    for f = array.size(sFvgTop) - 1 to 0
        if array.get(sFvgBar, f) > setupBarS
            fTop = array.get(sFvgTop, f)
            fBot = array.get(sFvgBot, f)
            if high >= fBot and close < fTop
                e = close
                s = fTop + atr * 0.22
                slDist = s - e
                if slDist > 0.4 and slDist < math.max(2.0, tpDist / 1.5)
                    entryP := e
                    initSL := s
                    currSL := s
                    tpP := e - tpDist
                    isBE := false
                    isLock1 := false
                    isLock2 := false
                    lookShort := false
                    strategy.entry("Short", strategy.short)
                    break

// Position Management
if strategy.position_size != 0
    dir = strategy.position_size > 0 ? 1 : -1
    slDistInit = math.abs(entryP - initSL)
    currentGain = dir == 1 ? (high - entryP) : (entryP - low)

    // BE: Only update stop if it guarantees positive profit AND doesn't violate current close
    if not isBE and currentGain >= slDistInit * 0.4
        bePrice = dir == 1 ? (entryP + syminfo.mintick * 5) : (entryP - syminfo.mintick * 5)
        // Ensure for Long that stop is below close; for Short that stop is above close
        if (dir == 1 and close > bePrice) or (dir == -1 and close < bePrice)
            currSL := bePrice
            isBE := true

    // Lock 1:
    if not isLock1 and currentGain >= slDistInit * 0.8
        l1Price = dir == 1 ? (entryP + slDistInit * 0.6) : (entryP - slDistInit * 0.6)
        if (dir == 1 and close > l1Price) or (dir == -1 and close < l1Price)
            currSL := l1Price
            isLock1 := true

    // Lock 2:
    if not isLock2 and currentGain >= slDistInit * 1.4
        l2Price = dir == 1 ? (entryP + slDistInit * 1.2) : (entryP - slDistInit * 1.2)
        if (dir == 1 and close > l2Price) or (dir == -1 and close < l2Price)
            currSL := l2Price
            isLock2 := true

    // Persistent exit call
    exitComment = isLock2 ? "LOCK 2 WIN" : isLock1 ? "LOCK 1 WIN" : isBE ? "BREAKEVEN" : "SL HIT"
    if dir == 1
        strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL, comment_profit="TP HIT", comment_loss=exitComment)
    else
        strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL, comment_loss=exitComment)
`;

  const p = new PineTS(candles, 'XAUUSD', '5');
  await p.ready();
  const res = await p.run(code);
  const trades = res.strategy.closedtrades;
  console.log('--- Strategy with Validated Stop Orders ---');
  console.log('Total Closed Trades:', trades.length);
  const wins = trades.filter(t => t.profit > 0);
  const losses = trades.filter(t => t.profit <= 0);
  console.log('Wins:', wins.length, 'Losses:', losses.length);
  console.log('Win Rate:', ((wins.length / trades.length) * 100).toFixed(1) + '%');
  console.log('Net Profit: $' + res.strategy.netprofit.toFixed(2));
  console.log('Max Drawdown %:', res.strategy.max_drawdown_percent_value);

  // Inspect any losses remaining:
  console.log('\nRemaining Losses:');
  losses.forEach((l, i) => {
    console.log(`[Loss ${i+1}] bar=${l.entry_bar_index}->${l.exit_bar_index} ${l.entry_id} profit=${l.profit.toFixed(2)} comment=${l.exit_comment}`);
  });
}

testCloseBasedLocks().catch(console.error);
