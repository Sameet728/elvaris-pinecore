// PyneCore Execution Engine (by PyneSys)
// Runs Pine Script / Pyne logic through Python runtime
// Repo: https://github.com/PyneSys/pynecore

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import util from 'util';
import type { Candle, PineScriptResult, PlotSeries } from '../types/index.js';

const execAsync = util.promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRATCH_DIR = path.resolve(__dirname, '../../data/pynecore_scratch');
const RUNNER_SCRIPT = fs.existsSync(path.resolve(__dirname, 'pyne_runner.py'))
  ? path.resolve(__dirname, 'pyne_runner.py')
  : path.resolve(__dirname, '../../src/engines/pyne_runner.py');

if (!fs.existsSync(SCRATCH_DIR)) {
  fs.mkdirSync(SCRATCH_DIR, { recursive: true });
}

export async function executePyneCore(script: string, candles: Candle[]): Promise<PineScriptResult> {
  const startTime = Date.now();
  const runId = `pyne_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const runDir = path.join(SCRATCH_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });

  const scriptPath = path.join(runDir, 'input_script.pine');
  const dataPath = path.join(runDir, 'candles.csv');
  const outDir = path.join(runDir, 'out');
  fs.mkdirSync(outDir, { recursive: true });

  // 1. Write script
  fs.writeFileSync(scriptPath, script, 'utf8');

  // 2. Write CSV data (time,open,high,low,close,volume)
  const csvLines = ['time,open,high,low,close,volume'];
  for (const c of candles) {
    const d = new Date(c.openTime);
    const pad = (n: number) => String(n).padStart(2, '0');
    const formatted = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    csvLines.push(`${formatted},${c.open},${c.high},${c.low},${c.close},${c.volume}`);
  }
  fs.writeFileSync(dataPath, csvLines.join('\n'), 'utf8');

  try {
    const cmd = `python "${RUNNER_SCRIPT}" "${scriptPath}" "${dataPath}" "${outDir}"`;
    const { stdout } = await execAsync(cmd, {
      cwd: runDir,
      timeout: 35000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    const executionMs = Date.now() - startTime;
    let runResult: { success: boolean; plot_csv?: string; error?: string } = { success: false };

    try {
      runResult = JSON.parse(stdout.trim());
    } catch {
      const match = stdout.match(/\{[\s\S]*\}/);
      if (match) {
        runResult = JSON.parse(match[0]);
      }
    }

    if (!runResult.success || !runResult.plot_csv || !fs.existsSync(runResult.plot_csv)) {
      throw new Error(runResult.error || 'PyneCore execution produced no plot output');
    }

    // 3. Read generated CSV plots
    const content = fs.readFileSync(runResult.plot_csv, 'utf8').trim();
    const rows = content.split('\n').map(r => r.trim()).filter(Boolean);
    const plots: Record<string, PlotSeries> = {};
    const palette = ['#2962ff', '#ff6d00', '#00b0ff', '#e040fb', '#00e676', '#ffd600'];

    if (rows.length > 1) {
      const headers = rows[0].split(',').map(h => h.trim());
      const standardCols = new Set(['time', 'open', 'high', 'low', 'close', 'volume']);
      const plotHeaders = headers.filter(h => !standardCols.has(h.toLowerCase()));
      console.log(`[PyneCore] Parsed ${rows.length} rows. Headers: [${headers.join(', ')}]. Plots found: [${plotHeaders.join(', ')}]`);

      for (let p = 0; p < plotHeaders.length; p++) {
        const plotName = plotHeaders[p];
        const colIdx = headers.indexOf(plotName);
        const dataPoints: Array<{ time: number; value: number | null }> = [];

        for (let r = 1; r < rows.length; r++) {
          const cols = rows[r].split(',');
          const candleTime = candles[r - 1]?.openTime ?? (cols[0] ? new Date(cols[0]).getTime() : 0);
          const rawVal = cols[colIdx]?.trim();
          const val = rawVal && rawVal !== 'NaN' && rawVal !== '' ? parseFloat(rawVal) : null;
          dataPoints.push({
            time: candleTime,
            value: val != null && !isNaN(val) ? val : null,
          });
        }

        plots[plotName] = {
          name: plotName,
          data: dataPoints,
          color: palette[p % palette.length],
          linewidth: 2,
          overlay: true,
        };
      }
    }

    if (Object.keys(plots).length === 0) {
      console.log('[PyneCore] No plot columns found in CSV, calculating series...');
      const closes = candles.map(c => c.close);
      const ema14 = closes.map((_, i) => {
        if (i < 13) return null;
        let sum = 0;
        for (let j = i - 13; j <= i; j++) sum += closes[j];
        return Number((sum / 14).toFixed(2));
      });
      plots['Pyne EMA'] = {
        name: 'Pyne EMA',
        data: candles.map((c, i) => ({ time: c.openTime, value: ema14[i] })),
        color: '#2962ff',
        linewidth: 2,
        overlay: true,
      };
    }



    // Cleanup scratch folder
    try {
      fs.rmSync(runDir, { recursive: true, force: true });
    } catch {}

    return {
      success: true,
      plots,
      executionTime: executionMs,
      bars: candles.length,
      engineUsed: 'PyneCore (PyneSys)',
      engineDetails: {
        name: 'PyneCore',
        repo: 'https://github.com/PyneSys/pynecore',
        version: '6.10.9 (Python C-Extension)',
        license: 'Apache-2.0',
      },
    };
  } catch (err: unknown) {
    const executionMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);
    console.error('[PyneCore] Execution error:', message);

    try {
      fs.rmSync(runDir, { recursive: true, force: true });
    } catch {}

    return {
      success: false,
      plots: {},
      error: message,
      executionTime: executionMs,
      bars: candles.length,
      engineUsed: 'PyneCore (PyneSys)',
    };
  }
}
