const path = require('path');
const fs = require('fs');

// Load candles from local backtester
const candlesRaw = JSON.parse(fs.readFileSync('pine-backtester-nextjs/public/data/xauusd_15m.json', 'utf8'));
const candles = candlesRaw.slice(-500).map(c => ({
  time: c.openTime,
  open: c.open,
  high: c.high,
  low: c.low,
  close: c.close,
  volume: c.volume || 100
}));

console.log(`Loaded ${candles.length} candles for test.`);

// Let's test the strategyExecutionRunner
const stratMarketPath = path.resolve('C:/Users/samee/Desktop/StratMarket/StratMarket');
const { strategyExecutionRunner } = require(path.join(stratMarketPath, 'node_modules', 'tsx', 'dist', 'cli.mjs'));

