# Pine Platform — LuxAlgo/Vela Charting with Real Dukascopy XAUUSD Data & PineTS Runtime

> 🏆 **Master Strategy Documentation & Prop Firm Passing Guide:**  
> Please see [PROJECT_DOCUMENTATION.md](file:///c:/Users/samee/Desktop/Pine/PROJECT_DOCUMENTATION.md) for full quantitative architecture, dual-month backtest results (September +23.6R, October +17.8R, Score 384.1), multi-timeframe Monte Carlo benchmarks across all timeframes (1M, 5M, 15M, 30M, 1H, 4H), authentic market data up to today, leaderboard, and Pine Script v6 strategy & indicator files.

A full-stack quantitative trading application that connects **authentic Swiss historical market data from Dukascopy** to **LuxAlgo's Vela charting engine** and executes user-provided **TradingView Pine Script® (v5/v6)** code via **PineTS**.

---

## Architecture Overview

```
                      ┌────────────────────────────────────────┐
                      │        Dukascopy Public Servers        │
                      │  (Authentic .bi5 LZMA Tick Data Files) │
                      └──────────────────┬─────────────────────┘
                                         │
                                         ▼ [dukascopy-node]
┌────────────────────────────────────────────────────────────────────────┐
│                        Backend Server (Express)                        │
│                                                                        │
│  ┌─────────────────────────┐           ┌────────────────────────────┐  │
│  │   Dukascopy Pipeline    │           │    PineTS Runtime Engine   │  │
│  │ - Fetches XAUUSD ticks  │           │ - Transpiles Pine v5/v6    │  │
│  │ - Aggregates to 5m OHLC │           │ - Runs ta.ema, ta.rsi, etc │  │
│  │ - Validates & cleanses  │           │ - Zero fabricated outputs  │  │
│  └────────────┬────────────┘           └─────────────┬──────────────┘  │
│               │                                      │                 │
│               ▼                                      ▼                 │
│  ┌─────────────────────────┐           ┌────────────────────────────┐  │
│  │ Local SQLite (WAL Mode) │           │    REST / SSE API Layer    │  │
│  │ - xauusd.db (candles)   │           │ - /api/data/download (SSE) │  │
│  │ - UPSERT deduplication  │           │ - /api/data/candles        │  │
│  │ - Script persistence    │           │ - /api/execute             │  │
│  └─────────────────────────┘           └─────────────┬──────────────┘  │
└──────────────────────────────────────────────────────┼─────────────────┘
                                                       │ HTTP / SSE
                                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Frontend (React + Vite)                         │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      LuxAlgo / Vela Charting                     │  │
│  │  - @luxalgo/vela & @luxalgo/vela-pinets                          │  │
│  │  - Custom Dukascopy 5m Candlestick rendering                     │  │
│  │  - HTML5 Canvas high-performance fallback engine                 │  │
│  │  - Overlay indicator line/histogram rendering                    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌─────────────────────────┐           ┌────────────────────────────┐  │
│  │ Monaco PineScript Editor│           │     Interactive Console    │  │
│  │ - Syntax highlighting   │           │ - Real-time plot inspector │  │
│  │ - Presets (EMA/RSI/MACD)│           │ - Dukascopy candle table   │  │
│  │ - Ctrl+Enter execution  │           │ - Execution logs & metrics │  │
│  └─────────────────────────┘           └────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Key Features

1. **Authentic Dukascopy XAUUSD 5-Minute Data**:
   - Zero synthetic, fabricated, or randomized bars.
   - Fetches official Swiss Forex & CFD historical `.bi5` tick packages via `dukascopy-node`.
   - Strictly validates timestamps, open/high/low/close boundaries, and preserves actual volume.
   - Stored in a high-speed SQLite database with Write-Ahead Logging (`WAL`).

2. **Official LuxAlgo / Vela Charting Integration**:
   - Integrates `@luxalgo/vela` and `@luxalgo/vela-pinets`.
   - Fallback to custom Canvas engine with pan, zoom, crosshair, dynamic grid, and timestamp labels.
   - TradingView Lightweight Charts is strictly excluded.

3. **PineTS Pine Script Runtime**:
   - Powered by LuxAlgo's `pinets` engine.
   - Executes Pine Script v5 / v6 indicators natively in Node.js.
   - Output plots are aligned with Dukascopy bar timestamps and visualized directly on the chart.

4. **Monaco Editor with Trading Terminal UX**:
   - Dark theme tailored for quantitative trading.
   - Built-in presets: EMA 9/21 Cross, RSI 14, Bollinger Bands (20, 2), MACD (12, 26, 9), SMA Ribbon.
   - Save / Load custom scripts in SQLite.
   - Run script with `Ctrl + Enter`.

---

## Quick Start & Installation

### Prerequisites
- Node.js >= 18.0.0 (v20+ or v22+ recommended)
- npm >= 9.0.0

### Setup Commands

```bash
# 1. Clone or navigate to the workspace
cd C:\Users\samee\Desktop\Pine

# 2. Install monorepo dependencies
npm install

# 3. Start both backend and frontend concurrently
npm run dev
```

- **Frontend**: `http://localhost:5173`
- **Backend**: `http://localhost:3001`
- **API Health**: `http://localhost:3001/health`

---

## Verified Compatibility Matrix

| Feature | Support | Verified Implementation |
|---|---|---|
| Historical XAUUSD 5m Data | ✅ Fully Supported | Downloaded from Dukascopy public servers via `dukascopy-node` |
| Local Data Persistence | ✅ Fully Supported | SQLite (`better-sqlite3`) in WAL mode with indexing |
| `ta.ema()` | ✅ Fully Supported | PineTS runtime calculation |
| `ta.sma()` | ✅ Fully Supported | PineTS runtime calculation |
| `ta.rsi()` | ✅ Fully Supported | PineTS runtime calculation |
| `ta.macd()` | ✅ Fully Supported | PineTS runtime calculation |
| `ta.stdev()` | ✅ Fully Supported | PineTS runtime calculation |
| `plot()` | ✅ Fully Supported | Extracted from PineTS result and rendered on chart |
| Monaco Code Editor | ✅ Fully Supported | Integrated with keyboard shortcuts & preset library |
| LuxAlgo Vela | ✅ Verified / Integrated | `@luxalgo/vela` + fallback canvas renderer |
| `request.security()` | ⚠️ Documented Limitation | PineTS roadmap item (single timeframe M5 active) |

---

## Tests

To run the backend integration and verification suite:

```bash
npm run test --workspace=backend
```
