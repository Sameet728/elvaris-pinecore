import { loadCachedCandles } from '../dist/dukascopy/downloader.js';
import { PineTS } from 'pinets';
import fs from 'fs';

async function main() {
  const candles = loadCachedCandles();
  const sampleCandles = candles.map(c => ({
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
    openTime: c.openTime,
    closeTime: c.openTime + 300000,
  }));
  const pts = new PineTS(sampleCandles);
  await pts.ready();

  const backendCode = fs.readFileSync('./src/test_lss_backend.mjs', 'utf8');
  const startMark = 'const script = `';
  const endMark = 'plot(setupSLS != 0 ? setupSLS : na, "Setup SL Short", color=color.red, style=plot.style_circles, linewidth=2)\n`;';
  const script = backendCode.substring(backendCode.indexOf(startMark) + startMark.length, backendCode.indexOf(endMark) + endMark.length - 2);

  const res = await pts.run(script);
  console.log('Result top keys:', Object.keys(res));
  console.log('Plots keys:', Object.keys(res.plots || {}));
  for (const k of Object.keys(res.plots || {})) {
    const val = res.plots[k];
    if (k.startsWith('__')) {
      console.log(`\n=== DRAWING: ${k} ===`);
      console.log('Type/Length:', Array.isArray(val) ? val.length : typeof val);
      if (Array.isArray(val) && val.length > 0) {
        console.log('First 2 items:', JSON.stringify(val.slice(0, 2), null, 2));
      } else {
        console.log('Dump:', JSON.stringify(val, null, 2)?.slice(0, 300));
      }
    }
  }

  const getArr = (v) => {
    if (!v) return null;
    const target = v.data ? v.data[v.data.length - 1] : v;
    if (target && target.array) return target.array;
    if (Array.isArray(target)) return target;
    return target;
  };

  console.log('\n=== BACKTEST SIGNALS ===');
  console.log('sigDir:', getArr(res.var['glb1_sigDir']));
  console.log('sigEntry:', getArr(res.var['glb1_sigEntry']));
  console.log('sigSL:', getArr(res.var['glb1_sigSL']));
  console.log('sigTP:', getArr(res.var['glb1_sigTP']));
  console.log('sigResult:', getArr(res.var['glb1_sigResult']));
  console.log('sigBar:', getArr(res.var['glb1_sigBar']));

  console.log('\n=== MONTHLY STATS ===');
  console.log('monthKeys:', getArr(res.var['glb1_monthKeys']));
  console.log('monthWins:', getArr(res.var['glb1_monthWins']));
  console.log('monthLosses:', getArr(res.var['glb1_monthLosses']));
  console.log('monthR:', getArr(res.var['glb1_monthR']));
  console.log('maxDrawdown:', getArr(res.var['glb1_maxDrawdown']));
  console.log('cumulativeR:', getArr(res.var['glb1_cumulativeR']));
  console.log('maxConsWinR:', getArr(res.var['glb1_maxConsWinR']));
  const labels = res.plots.__labels__?.data?.slice(-1)[0]?.value || [];
  const boxes = res.plots.__boxes__?.data?.slice(-1)[0]?.value || [];
  const lines = res.plots.__lines__?.data?.slice(-1)[0]?.value || [];
  console.log('Total Active Labels:', labels.length);
  if (labels.length > 0) console.log('Sample Labels:', JSON.stringify(labels.slice(0, 5), null, 2));
  console.log('Total Active Boxes:', boxes.length);
  if (boxes.length > 0) console.log('Sample Boxes:', JSON.stringify(boxes.slice(0, 3), null, 2));
  console.log('Total Active Lines:', lines.length);
  if (lines.length > 0) console.log('Sample Lines:', JSON.stringify(lines.slice(0, 3), null, 2));
}

main().catch(console.error);
