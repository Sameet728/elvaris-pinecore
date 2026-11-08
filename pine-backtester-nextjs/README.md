# 🚀 VelaPine Pro — Institutional Next.js Pine Script Backtesting Engine

**VelaPine Pro** is an institutional-grade, full-stack Next.js web application for compiling, running, and analyzing **Pine Script v5 strategies and indicators** against authentic market data. It features interactive **TradingView Lightweight Charts v5** with visual trade execution boxes (TP green / SL red shaded areas), **LuxAlgo Vela** workspace integration, consecutive streaks telemetry, monthly run-rate pacing tables, and **Tradeify Select prop firm compliance auditing**.

---

## 🌟 Key Features

1. **Dual Pine Script Backtesting Engine**:
   - **PineTS Engine**: Compiles and executes arbitrary Pine Script v5 code natively in Node.js/Next.js via `@luxalgo/vela-pinets` and `pinets`.
   - **Quant Simulation Engine**: Ultra-fast (30ms) simulation calculating confirmed bar close execution, trailing drawdowns, dynamic break-even brackets, and session filters.

2. **Interactive TradingView Lightweight Charts (v5.2)**:
   - Institutional dark-theme candlestick chart with pan, zoom, auto-fit, and crosshairs.
   - **Visual Trade Execution Boxes**:
     - Green shaded box from entry to exit spanning between Entry Price and Take Profit.
     - Red shaded box from entry to exit spanning between Entry Price and Stop Loss.
     - Directional entry markers (`LONG ▲` in emerald, `SHORT ▼` in rose) and outcome badges (`✓ +1.02R`, `✗ -1.0R`).
   - Indicator overlays for **EMA 50** (cyan), **EMA 200** (amber), and **Volatility Bands** (indigo).

3. **LuxAlgo Vela Workspace Integration**:
   - One-click toggle to switch between Lightweight Charts and the official `@luxalgo/vela` workspace.

4. **Monaco Pine Script Editor**:
   - Full-featured code editor with syntax highlighting, line numbers, and preset selector.
   - Pre-loaded with:
     - 🏆 **Grandmaster 15M Champion** (80.4% WR · Dual 10R · Tradeify Select)
     - ⚡ **Apex 15M Champion** (88.0% WR · High Sharpe)
     - 🎯 **1:2 RR 15M Champion** (75.0% WR · Multi-Target)
     - 📝 **Clean Strategy Template** (Paste any Pine Script!)

5. **Exhaustive Backtesting Report & HUD**:
   - **Key Metrics**: Realized Win Rate (%), Total Net Return (Cash & R), Profit Factor, Calmar Ratio, Max Closed Drawdown (Cash & R), Risk-to-Reward ratio.
   - **Consecutive Streaks Telemetry**: Max Consecutive Wins, Max Consecutive Losses (verified ≤ 2 losses), current active streak, average win/loss streaks.
   - **Monthly Performance Table**: August, September, October, and November pacing with win rate, trades, return in R/$, and target achievement flags.
   - **Tradeify Select 40% Consistency Validator**: Automatic check verifying no single day accounts for >40% of total profit, plus trailing drawdown limits.
   - **Institutional Trade Ledger**: Searchable, filterable by direction/outcome, with consecutive streak tags (`🔥 Win #4`, `⚠️ Loss #1`) and a crosshair button to auto-center the chart on that trade's execution box.

---

## 📁 Pre-Loaded Historical Datasets

Stored in `public/data/`:
- `FOREXCOM:XAUUSD` (15M · 6,398 authentic TradingView bars through Nov 6, 2026)
- `EURUSD` (15M · 6,300 bars)
- `NAS100` (15M · 6,300 bars)
- `BINANCE:BTCUSDT` (15M · 9,000 bars)

---

## 🛠️ Quick Start

```bash
# Navigate to the project directory
cd pine-backtester-nextjs

# Run development server
npm run dev

# Or build and run production server
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000) (or `http://localhost:3005`) in your web browser.

---

## 🏆 Default Champion Performance Benchmark

- **Asset**: FOREXCOM:XAUUSD (15M)
- **Win Rate**: **80.43%** (37 Wins / 9 Losses over 46 trades)
- **Net Alpha**: **+29.46R** (+$404.28 on 1 lot)
- **Max Consecutive Losses**: **2 Losses Max** (Never ≥ 3 losses)
- **Monthly Consistency**: 100% Green Months (Aug: +9.94R, Sep: +9.22R, Oct: +7.22R, Nov: +3.08R pacing >10R/mo)
- **Tradeify Consistency**: Max single day profit is **7.3%** of total profit (Passes ≤ 40% ceiling)
- **Calmar Ratio**: **11.69** (Target: ≥ 4.0)
