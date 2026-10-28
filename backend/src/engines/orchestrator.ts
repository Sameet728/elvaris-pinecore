// Master Multi-Engine Orchestrator
// Integrates 4 top open-source Pine Script repositories:
// 1. PineTS (by LuxAlgo) - https://github.com/LuxAlgo/PineTS
// 2. PyneCore (by PyneSys) - https://github.com/PyneSys/pynecore
// 3. OpenPineScript (by be-thomas) - https://github.com/be-thomas/OpenPineScript
// 4. Native TA Engine (open-source technicalindicators suite)
//
// Plus PineCoders Community standards (https://github.com/pinecoders)

import type { Candle, ExecuteScriptRequest, PineScriptResult, EngineInfo } from '../types/index.js';
import { loadCachedCandles, loadCandlesInRange } from '../dukascopy/downloader.js';
import { executePineScript as runPineTS } from '../pinets/engine.js';
import { executePyneCore as runPyneCore } from './pynecore_engine.js';
import { executeOpenPineScript as runOpenPineScript } from './openpine_engine.js';
import { executeNativeTA as runNativeTA } from './native_engine.js';

export const SUPPORTED_ENGINES: EngineInfo[] = [
  {
    id: 'auto',
    name: '⚡ Auto (Smart Multi-Engine)',
    repo: 'Antigravity Unified Engine',
    version: '2.0.0',
    license: 'Dual / Unified',
    description: 'Intelligently routes scripts to the best open-source runtime with instant fallback.',
    status: 'active',
    features: ['Auto-Detection', 'Pine Script v1-v6', 'Drawings & Shapes', 'Backtest Metrics', 'Zero-Crash Fallback'],
  },
  {
    id: 'pinets',
    name: '🌲 PineTS (by LuxAlgo)',
    repo: 'https://github.com/LuxAlgo/PineTS',
    version: '0.11.0 (Pine v5/v6 Transpiler)',
    license: 'AGPL-3.0',
    description: 'Native TypeScript/JavaScript transpiler bringing TradingView Pine Script v5/v6 to Node.js.',
    status: 'active',
    features: ['1:1 TV Syntax', '60+ TA Functions', 'Full Drawing Types (Boxes/Lines/Labels)', 'Time Series Semantics'],
  },
  {
    id: 'pynecore',
    name: '🐍 PyneCore (by PyneSys)',
    repo: 'https://github.com/PyneSys/pynecore',
    version: '6.10.9 (CPython 3.13 Runtime)',
    license: 'Apache-2.0',
    description: 'High-performance Python runtime executing TradingView Pine Script bar-by-bar with bit-exact TV match.',
    status: 'active',
    features: ['C-Extension Speed', 'Bar-by-Bar State Engine', 'Python ML/Data Science Bridge', 'Broker Emulator'],
  },
  {
    id: 'openpinescript',
    name: '📜 OpenPineScript (by be-thomas)',
    repo: 'https://github.com/be-thomas/OpenPineScript',
    version: '0.0.1 (ANTLR4 Engine)',
    license: 'MIT',
    description: 'Open-source local TypeScript compiler for Pine Script v1/v2/v3 without quotas or sandboxes.',
    status: 'active',
    features: ['ANTLR4 Lexer/Parser', 'Pure TypeScript', 'v1/v2/v3 Grammar', 'CSV & JSON Performance Export'],
  },
  {
    id: 'native',
    name: '📐 Native TA Engine (Fail-Safe)',
    repo: 'https://github.com/anandanand84/technicalindicators',
    version: '3.1.0 (Full TA Library)',
    license: 'MIT',
    description: 'Direct institutional indicator calculations on Dukascopy gold bars — 100% reliable execution.',
    status: 'active',
    features: ['Institutional Accuracy', '15+ Core Indicators', 'Zero Transpilation Lag', 'TradingView Signals'],
  },
];

export async function executeMultiEngine(req: ExecuteScriptRequest): Promise<PineScriptResult> {
  const targetEngine = req.engine ?? 'auto';

  // Load Dukascopy candles
  let candles: Candle[];
  if (req.startTime != null && req.endTime != null) {
    candles = loadCandlesInRange(req.startTime, req.endTime);
  } else {
    candles = loadCachedCandles();
  }

  if (candles.length === 0) {
    return {
      success: false,
      plots: {},
      error: 'No candle data available. Please download XAUUSD data first.',
      bars: 0,
    };
  }

  const limit = req.maxBars ?? candles.length;
  if (candles.length > limit) {
    candles = candles.slice(candles.length - limit);
  }

  console.log(`[Orchestrator] Requested engine: "${targetEngine}" against ${candles.length} candles`);

  // Explicit Engine Execution:
  if (targetEngine === 'pinets') {
    const res = await runPineTS(req);
    return {
      ...res,
      engineUsed: 'PineTS (LuxAlgo)',
      engineDetails: {
        name: 'PineTS',
        repo: 'https://github.com/LuxAlgo/PineTS',
        version: '0.11.0',
        license: 'AGPL-3.0',
      },
    };
  }

  if (targetEngine === 'pynecore') {
    return await runPyneCore(req.script, candles);
  }

  if (targetEngine === 'openpinescript') {
    return await runOpenPineScript(req.script, candles);
  }

  if (targetEngine === 'native') {
    return runNativeTA(req.script, candles);
  }

  // Auto Mode: Smart selection & cascade fallback
  // Step 1: Check if script explicitly targets Python/PyneCore
  if (req.script.includes('@pyne') || req.script.includes('def main(')) {
    console.log('[Orchestrator:Auto] Detected PyneCore script. Routing to PyneCore...');
    const pyneRes = await runPyneCore(req.script, candles);
    if (pyneRes.success) return pyneRes;
  }

  // Step 2: Check if script explicitly targets Pine Script v1 or v2
  if (req.script.includes('//@version=1') || req.script.includes('//@version=2')) {
    console.log('[Orchestrator:Auto] Detected Pine v1/v2 script. Routing to OpenPineScript...');
    const opsRes = await runOpenPineScript(req.script, candles);
    if (opsRes.success) return opsRes;
  }

  // Step 3: Run modern PineTS (LuxAlgo) for v5/v6 scripts
  console.log('[Orchestrator:Auto] Attempting PineTS (LuxAlgo)...');
  const pinetsRes = await runPineTS(req);
  const hasPineTsOutput = pinetsRes.success && (
    Object.keys(pinetsRes.plots ?? {}).length > 0 ||
    Boolean(pinetsRes.backtest) ||
    Boolean(pinetsRes.drawings && (pinetsRes.drawings.boxes.length > 0 || pinetsRes.drawings.labels.length > 0))
  );
  if (hasPineTsOutput) {
    return {
      ...pinetsRes,
      engineUsed: 'PineTS (LuxAlgo)',
      engineDetails: {
        name: 'PineTS',
        repo: 'https://github.com/LuxAlgo/PineTS',
        version: '0.11.0',
        license: 'AGPL-3.0',
      },
    };
  }

  // Step 4: If PineTS reported an error or 0 plots, try OpenPineScript
  console.log('[Orchestrator:Auto] PineTS did not produce plots. Falling back to OpenPineScript...');
  const opsRes = await runOpenPineScript(req.script, candles);
  if (opsRes.success && Object.keys(opsRes.plots ?? {}).length > 0) {
    return opsRes;
  }

  // Step 5: Try PyneCore
  console.log('[Orchestrator:Auto] Falling back to PyneCore (PyneSys)...');
  const pyneRes = await runPyneCore(req.script, candles);
  if (pyneRes.success && Object.keys(pyneRes.plots ?? {}).length > 0) {
    return pyneRes;
  }

  // Step 6: Fail-safe native TA fallback
  console.log('[Orchestrator:Auto] Falling back to Native TA Engine to guarantee result...');
  const nativeRes = runNativeTA(req.script, candles);
  return {
    ...nativeRes,
    engineUsed: 'Native TA Engine (Auto-Fallback)',
    engineDetails: {
      name: 'Native Technical Indicators',
      repo: 'https://github.com/anandanand84/technicalindicators',
      version: '3.1.0',
      license: 'MIT',
    },
  };
}
