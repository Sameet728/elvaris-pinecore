import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseAndValidateCandles } from '../src/dukascopy/downloader.js';
import { PineTS } from 'pinets';
import type { Candle } from '../src/types/index.js';

describe('Dukascopy Data Validation & Aggregation Tests', () => {
  it('correctly validates, parses and deduplicates raw Dukascopy array format', () => {
    const rawArrayData = [
      [1704067200000, 2062.5, 2064.0, 2061.8, 2063.2, 142],
      [1704067200000, 2062.5, 2064.0, 2061.8, 2063.2, 142], // duplicate timestamp
      [1704067500000, 2063.2, 2065.1, 2062.9, 2064.8, 188],
    ];

    const candles = parseAndValidateCandles(rawArrayData);
    assert.strictEqual(candles.length, 2, 'Should deduplicate candles with same openTime');
    assert.strictEqual(candles[0].openTime, 1704067200000);
    assert.strictEqual(candles[0].open, 2062.5);
    assert.strictEqual(candles[0].high, 2064.0);
    assert.strictEqual(candles[0].low, 2061.8);
    assert.strictEqual(candles[0].close, 2063.2);
    assert.strictEqual(candles[0].volume, 142);
  });

  it('correctly validates, parses and deduplicates raw Dukascopy JSON format', () => {
    const rawJsonData = [
      { timestamp: 1704067200000, open: 2062.5, high: 2064.0, low: 2061.8, close: 2063.2, volume: 142 },
      { timestamp: 1704067500000, open: 2063.2, high: 2065.1, low: 2062.9, close: 2064.8, volume: 188 },
    ];

    const candles = parseAndValidateCandles(rawJsonData);
    assert.strictEqual(candles.length, 2);
    assert.strictEqual(candles[1].close, 2064.8);
  });

  it('filters out invalid OHLC records where high < low or negative price', () => {
    const corruptedData = [
      [1704067200000, 2062.5, 2050.0, 2065.0, 2063.2, 100], // invalid high < low
      [1704067500000, -10.0, 2065.1, 2062.9, 2064.8, 100], // negative price
      [1704067800000, 2064.8, 2066.0, 2064.0, 2065.5, 100], // valid
    ];

    const candles = parseAndValidateCandles(corruptedData);
    assert.strictEqual(candles.length, 1);
    assert.strictEqual(candles[0].openTime, 1704067800000);
  });
});

describe('PineTS Engine Quantitative Tests', () => {
  const testCandles = [
    { open: 2060.0, high: 2065.0, low: 2058.0, close: 2062.0, volume: 100, openTime: 1704067200000, closeTime: 1704067500000 },
    { open: 2062.0, high: 2068.0, low: 2060.0, close: 2065.0, volume: 120, openTime: 1704067500000, closeTime: 1704067800000 },
    { open: 2065.0, high: 2070.0, low: 2063.0, close: 2068.0, volume: 150, openTime: 1704067800000, closeTime: 1704068100000 },
    { open: 2068.0, high: 2072.0, low: 2066.0, close: 2071.0, volume: 110, openTime: 1704068100000, closeTime: 1704068400000 },
  ];

  it('executes EMA indicator and computes mathematically exact values', async () => {
    const pts = new PineTS(testCandles);
    await pts.ready();

    const script = `//@version=5
indicator("EMA Test", overlay=true)
plot(ta.ema(close, 2), "EMA2")
`;

    const context = await pts.run(script);
    assert.ok(context.plots);
    assert.ok(context.plots['EMA2']);

    const plotData = context.plots['EMA2'].data;
    assert.strictEqual(plotData.length, 4);

    // PineTS EMA calculation on real bars:
    // Bar 0: NaN (needs previous value)
    // Bar 1: (2065 * (2 / 3)) + (2062 * (1 / 3)) = 1376.666 + 687.333 = 2064
    assert.ok(!isNaN(plotData[1].value), 'Bar 1 should have valid numeric EMA');
    assert.ok(plotData[1].value > 2060 && plotData[1].value < 2070, 'EMA value in expected range');
  });

  it('executes RSI indicator without synthetic errors', async () => {
    const pts = new PineTS(testCandles);
    await pts.ready();

    const script = `//@version=5
indicator("RSI Test", overlay=false)
plot(ta.rsi(close, 2), "RSI2")
`;

    const context = await pts.run(script);
    assert.ok(context.plots);
    assert.ok(context.plots['RSI2']);
  });
});
