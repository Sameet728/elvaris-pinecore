# 🏛️ Elvaris Capital · Official Tradeify Quant Strategy Specification & Rulebook
**Document Version:** 2.0 · Comprehensive Consolidated Edition  
**Target Account:** Tradeify Select Account ($100,000 Capital Baseline)  
**Prop Firm Standards:** Tradeify Select, FTMO Institutional, Topstep  
**Asset Class / Instrument:** FOREXCOM:XAUUSD (Spot Gold vs US Dollar)  
**Chart Timeframe:** Strictly 15-Minute (15M)  

---

## 📌 Executive Summary
This document codifies the mandatory quantitative trading, risk management, and statistical execution rules established across all research phases for the **Elvaris Capital Quantitative Trading Portfolio**. Every strategy developed, tested, optimized, and deployed to live execution environments (including VPS and Next.js terminals) must strictly comply with all rules defined herein.

---

## 📐 Rule 1: Market Data & Timeframe Parity
1. **Instrument:** Strictly `FOREXCOM:XAUUSD` (Spot Gold).
2. **Timeframe:** Strictly **15-Minute (15M)** candlestick intervals.
3. **Data Integrity:** Only authentic TradingView historical bar data is permitted (6,398 confirmed bars spanning August 2026 to November 2026).
4. **Zero Fabrication:** Synthetic, randomized, smoothed, or unverified candles are strictly prohibited.
5. **Lookahead Bias Standard:** All calculations, indicators, and conditional signals must execute strictly on confirmed candle closes (`close`). Lookahead bias, tick replay interpolation, or intra-bar repainting is strictly forbidden (`calc_on_order_fills=false`, `process_orders_on_close=true`).

---

## 🛡️ Rule 2: Tradeify Prop Firm Risk Management
1. **Daily Drawdown Limit:** Maximum loss across any single UTC calendar day must not exceed 2.5% ($2,500 on $100K capital). Individual strategy max drawdown must remain below 2.0R (< $27.50/contract), providing a 98%+ safety buffer.
2. **Consistency Rule (40% Ceiling):** No single calendar day's net profit may account for more than 40% of the total cumulative account profit.
3. **Daily Loss Circuit Breaker:** Maximum **1 loss per day**. If a strategy experiences 1 closed loss on a calendar day (00:00 - 23:59 UTC), all further entries are halted until the next UTC day.
4. **Daily Trade Limit:** Maximum **2 trades per day** per strategy to prevent overtrading and commission drag.
5. **Stop Loss Protection:** Fixed capital protection of **-$13.75** ($13.75 per oz, equivalent to 137.5 pips on XAUUSD standard contract) or tight ATR dynamic stop. No unhedged, martingale, or grid positions.
6. **Execution Orders:** Pre-defined static limit (TP) and stop (SL) orders submitted simultaneously upon bar close confirmation.

---

## 🎯 Rule 3: Strategy Performance Benchmarks (Hard Minimums)
Every strategy must satisfy all of the following statistical thresholds over the complete verification dataset:
1. **Win Rate:** Strictly **>= 80.0%** (80.0% - 90.0%+).
2. **Monthly Return Target:** Minimum **>= 8R to 10R net return per full month**:
   - August 2026: >= +8.0R (Target >= +10.0R)
   - September 2026: >= +8.0R (Target >= +10.0R)
   - October 2026: >= +8.0R (Target >= +10.0R)
   - November 2026: Current month run-rate strictly positive and pacing towards >= +10.0R.
3. **Calmar Ratio:** Strictly **>= 4.0** (Annualized / Period Return relative to Max Drawdown; institutional ultra-grade standard).
4. **Risk-to-Reward Ratio (R:R):** Realized or nominal R:R must be at least equal or greater than risk (`TP >= SL`, e.g. TP $14.00 - $18.00 vs SL $13.75, nominal R:R >= 1.0 : 1.0 to 1.3 : 1.0).
5. **Profit Factor:** Greater than **3.0** (institutional target >= 4.0).
6. **Trade Count:** Statistically significant sample size (minimum 20+ verified trades across the 3-month sample, demonstrating real statistical edge).

---

## 🧩 Rule 4: Multi-Strategy Portfolio Decorrelation & Independence
1. **Zero Trade Overlap:** Concurrently running strategies **MUST NOT generate identical trades at the exact same timestamp/bar**. Duplicate entries across multiple strategies double risk and violate portfolio diversification.
2. **Session / Regime Diversity:** Strategies must exploit distinct market regimes, trading sessions (e.g., London Open vs US Session vs Asian Session), or structural price behaviors.
3. **Architectural Non-Similarity:**
   - Previous versions clustered on Bollinger Bands (28-30 length).
   - Diverse strategies must utilize **distinct mathematical frameworks**:
     - *Model 1: Donchian & Keltner Volatility Channel Expansion*
     - *Model 2: Dynamic Multi-EMA / SMA Trend Ribbon Momentum*
     - *Model 3: Liquidity Sweeps & Session High/Low Mean Reversion*
     - *Model 4: RSI / Stochastic Volatility Breakout & Reversal*
     - *Model 5: SuperTrend / ATR Directional Trailing Flow*

---

## 💻 Rule 5: Pine Script v5 & Production Deployment Standards
1. **Clean Compilation:** Strict Pine Script v5 syntax. Zero compilation errors or warnings in TradingView Pine Editor. `strategy(...)` declaration must be syntactically valid on a single line or cleanly tab-indented.
2. **TradingView Parity:** Outputs in local PineTS engine must match TradingView Bar Magnifier / candle close results with 100% correlation.
3. **VPS Execution Ready:** Strategy must support alert payloads / webhooks for automated order execution to Tradeify via VPS 24/7 background runner.
4. **UI Dashboard Parity:** Backtest metrics, trade lists, and equity curves must seamlessly populate the Next.js quantitative analytics dashboard.

---
*Certified by Elvaris Capital Quantitative Trading Research Group.*

