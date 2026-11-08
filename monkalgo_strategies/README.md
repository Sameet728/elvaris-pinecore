# 🏛️ Monk Algo Strategy Lab — Pine Script Collection

Official collection of all 18 Pine Script (v6) indicators and automated strategies downloaded from [Monk Algo Strategy Lab](https://monkalgo.com/strategy-lab).

> **Full Quantitative Backtest Report**: Check the comprehensive institutional audit across all 18 systems on authentic TradingView data:  
> 📊 **[MONKALGO_MASTER_LEADERBOARD.md](file:///c:/Users/samee/Desktop/Pine/monkalgo_strategies/MONKALGO_MASTER_LEADERBOARD.md)**

Each script is preserved with full original source code, syntax, and companion banner preview images.

---

## 📊 Summary Table of All 18 Indicators & Strategies

| # | Filename | Script Type | Target Instrument | Official Title & Pine Declaration | Lines | Size |
|---|---|:---:|:---:|---|:---:|:---:|
| **01** | [`01_SWING.pine`](file:///c:/Users/samee/Desktop/Pine/monkalgo_strategies/01_SWING.pine) | `indicator` | **NAS100** | `indicator("HTF Swing Structure Signals", overlay = true)` | 218 | 9.1 KB |
| **02** | [`02_9_30_A_M.pine`](file:///c:/Users/samee/Desktop/Pine/monkalgo_strategies/02_9_30_A_M.pine) | `indicator` | **NAS100** | `indicator("9:30 AM 15m Fib Breakout", overlay = true)` | 79 | 3.4 KB |
| **03** | [`03_MANIPULATION.pine`](file:///c:/Users/samee/Desktop/Pine/monkalgo_strategies/03_MANIPULATION.pine) | `indicator` | **NAS100** | `indicator("CRT Sweep & Setup Highlighter", overlay = true)` | 222 | 9.9 KB |
| **04** | [`04_LIQUIDITY.pine`](file:///c:/Users/samee/Desktop/Pine/monkalgo_strategies/04_LIQUIDITY.pine) | `indicator` | **SPX500** | `indicator("MSS Sweeps", overlay = true)` | 193 | 10.1 KB |
| **05** | [`05_WICK.pine`](file:///c:/Users/samee/Desktop/Pine/monkalgo_strategies/05_WICK.pine) | `indicator` | **SPX500** | `indicator("No-Wick Retest Levels", shorttitle = "No-Wick Retests")` | 218 | 13.3 KB |
| **06** | [`06_FVG.pine`](file:///c:/Users/samee/Desktop/Pine/monkalgo_strategies/06_FVG.pine) | `indicator` | **NAS100** | `indicator("Displacement Sweep Reversal with FVG", shorttitle="Sweep + FVG Shift")` | 178 | 11.1 KB |
| **07** | [`07_ROADMAP.pine`](file:///c:/Users/samee/Desktop/Pine/monkalgo_strategies/07_ROADMAP.pine) | `indicator` | **NAS100** | `indicator("8am Road Map Zone", overlay = true)` | 96 | 3.8 KB |
| **08** | [`08_PUSH.pine`](file:///c:/Users/samee/Desktop/Pine/monkalgo_strategies/08_PUSH.pine) | `indicator` | **NAS100** | `indicator("Session Ranges & Asia Sweep", overlay = true)` | 178 | 10.7 KB |
| **09** | [`09_SWEEP_IFVG.pine`](file:///c:/Users/samee/Desktop/Pine/monkalgo_strategies/09_SWEEP_IFVG.pine) | `indicator` | **NAS100** | `indicator("Session Sweep & iFVG RR", overlay = true)` | 389 | 15.7 KB |
| **10** | [`10_IFVG.pine`](file:///c:/Users/samee/Desktop/Pine/monkalgo_strategies/10_IFVG.pine) | `indicator` | **NAS100** | `indicator("Liquidity Sweeps & Inverse FVGs", overlay = true)` | 303 | 11.9 KB |
| **11** | [`11_PROFILE.pine`](file:///c:/Users/samee/Desktop/Pine/monkalgo_strategies/11_PROFILE.pine) | `indicator` | **NAS100** | `indicator("Value Area Reversion Signals", "VARS", overlay = false)` | 517 | 33.6 KB |
| **12** | [`12_EASY.pine`](file:///c:/Users/samee/Desktop/Pine/monkalgo_strategies/12_EASY.pine) | `indicator` | **NAS100** | `indicator("MSS Sweep Fib Retrace", overlay = true)` | 238 | 9.9 KB |
| **13** | [`13_GAP.pine`](file:///c:/Users/samee/Desktop/Pine/monkalgo_strategies/13_GAP.pine) | `indicator` | **Gold (XAUUSD)** | `indicator("Gap Fill Breakouts", overlay = true)` | 161 | 6.9 KB |
| **14** | [`14_8_A_M_INDICATOR.pine`](file:///c:/Users/samee/Desktop/Pine/monkalgo_strategies/14_8_A_M_INDICATOR.pine) | `indicator` | **NAS100** | `indicator("8AM 1H Range & Breaks", overlay = true)` | 220 | 10.2 KB |
| **15** | [`15_SWEEP_SHIFT.pine`](file:///c:/Users/samee/Desktop/Pine/monkalgo_strategies/15_SWEEP_SHIFT.pine) | `indicator` | **NAS100** | `indicator("Session Sweep & MSS", overlay = true)` | 295 | 11.6 KB |
| **16** | [`16_8_12_TO_9_12_ORB.pine`](file:///c:/Users/samee/Desktop/Pine/monkalgo_strategies/16_8_12_TO_9_12_ORB.pine) | `strategy` | **NAS100** | `strategy("Monk Algo · Range Fade — Sahil", shorttitle = "MA·FADE")` | 461 | 29.6 KB |
| **17** | [`17_ASIA_SWEEP_INDCATOR.pine`](file:///c:/Users/samee/Desktop/Pine/monkalgo_strategies/17_ASIA_SWEEP_INDCATOR.pine) | `indicator` | **EUR/USD** | `indicator("Monk Algo · Asia Range", "MA Asia Range", overlay = true)` | 454 | 23.0 KB |
| **18** | [`18_AMD_FVG.pine`](file:///c:/Users/samee/Desktop/Pine/monkalgo_strategies/18_AMD_FVG.pine) | `strategy` | **NAS100** | `strategy("Ultimate AMD FVG Strategy", overlay = true)` | 296 | 18.6 KB |

---

## 🛠️ Detailed Breakdown of Each Strategy

### 1. `01_SWING.pine` — HTF Swing Structure Signals
* **Core Logic:** Tracks Higher Timeframe (HTF) market structure by plotting dynamic HTF EMAs, marking higher highs/higher lows (HH/HL) and lower highs/lower lows (LH/LL), with market structure break alerts.
* **Target:** NAS100 (Default HTF: Daily / 4H).

### 2. `02_9_30_A_M.pine` — 9:30 AM 15m Fib Breakout
* **Core Logic:** Captures the US New York cash session open (9:30 AM EST). Identifies the opening 15-minute range, calculates institutional Fibonacci extension levels (0.5, 0.618, 1.0, 1.618), and projects directional breakout targets.
* **Target:** NAS100 / US100.

### 3. `03_MANIPULATION.pine` — CRT Sweep & Setup Highlighter
* **Core Logic:** Candle Range Theory (CRT) manipulation detector. Identifies session liquidity grabs, Judas swings, and wick sweeps above/below previous candle extremes.
* **Target:** NAS100.

### 4. `04_LIQUIDITY.pine` — MSS Sweeps
* **Core Logic:** Market Structure Shift (MSS) coupled with liquidity sweeps. Scans for buyside/sellside liquidity raids followed by displacement and an instant structural break.
* **Target:** SPX500 / US500.

### 5. `05_WICK.pine` — No-Wick Retest Levels
* **Core Logic:** Identifies candles that formed zero or minimal wicks at key institutional price points, marking these as high-probability unfilled liquidity magnets for future retests.
* **Target:** SPX500.

### 6. `06_FVG.pine` — Displacement Sweep Reversal with FVG
* **Core Logic:** Combines liquidity sweeps with Fair Value Gap (FVG) creation and immediate mitigation/inversion signals.
* **Target:** NAS100.

### 7. `07_ROADMAP.pine` — 8am Road Map Zone
* **Core Logic:** Maps the crucial 8:00 AM New York pre-market institutional baseline zone to predict directionality into the 9:30 AM open.
* **Target:** NAS100.

### 8. `08_PUSH.pine` — Session Ranges & Asia Sweep
* **Core Logic:** Automatically draws Asian, London, and New York session boxes with high/low liquidity levels, highlighting Asian session sweeps during the London/NY crossover.
* **Target:** NAS100.

### 9. `09_SWEEP_IFVG.pine` — Session Sweep & iFVG RR
* **Core Logic:** Detects session sweeps that trigger Inverse Fair Value Gap (iFVG) formations, complete with automatic Risk-to-Reward projection lines (1:2, 1:3).
* **Target:** NAS100.

### 10. `10_IFVG.pine` — Liquidity Sweeps & Inverse FVGs
* **Core Logic:** Tracks failed Fair Value Gaps that turn into support/resistance inversion blocks after major buyside/sellside liquidity sweeps.
* **Target:** NAS100.

### 11. `11_PROFILE.pine` — Value Area Reversion Signals (VARS)
* **Core Logic:** Sub-pane oscillator indicator computing Point of Control (POC), Value Area High (VAH), and Value Area Low (VAL) mean reversion momentum signals.
* **Target:** NAS100.

### 12. `12_EASY.pine` — MSS Sweep Fib Retrace
* **Core Logic:** Streamlined ICT model: Liquidity Sweep -> Market Structure Shift (MSS) -> Optimal Trade Entry (OTE) Fib Retracement zone (61.8%–78.6%).
* **Target:** NAS100.

### 13. `13_GAP.pine` — Gap Fill Breakouts
* **Core Logic:** Focuses on Gold price gaps (opening gaps, session gaps, weekend rollover gaps) and projects exhaustion/fill breakout entries.
* **Target:** Gold (XAUUSD).

### 14. `14_8_A_M_INDICATOR.pine` — 8AM 1H Range & Breaks
* **Core Logic:** Establishes the 8:00 AM – 9:00 AM 1-hour pre-market trading range, plotting breakout boundaries and target buffers for the regular trading hours (RTH) expansion.
* **Target:** NAS100.

### 15. `15_SWEEP_SHIFT.pine` — Session Sweep & MSS
* **Core Logic:** Institutional session high/low liquidity tracking with strict candle close confirmation for Market Structure Shifts.
* **Target:** NAS100.

### 16. `16_8_12_TO_9_12_ORB.pine` — Monk Algo Range Fade Strategy (Strategy Tester Ready)
* **Core Logic:** Quantitative trading **strategy** (`strategy(...)`) fading range extremes between 8:12 AM and 9:12 AM pre-market with automated SL/TP order execution and performance tracking.
* **Target:** NAS100.

### 17. `17_ASIA_SWEEP_INDCATOR.pine` — Monk Algo Asia Range
* **Core Logic:** Dedicated Forex session indicator mapping Tokyo/Asian liquidity pools and detecting London session sweep manipulation on EUR/USD.
* **Target:** EUR/USD.

### 18. `18_AMD_FVG.pine` — Ultimate AMD FVG Strategy (Strategy Tester Ready)
* **Core Logic:** Complete automated **strategy** (`strategy(...)`) encoding Accumulation, Manipulation, and Distribution (AMD) phases with Fair Value Gap mitigation entries.
* **Target:** NAS100.

---

## 🚀 How to Use

1. **In TradingView**:
   * Open TradingView, open the **Pine Editor** at the bottom.
   * Open any of the `.pine` files in this directory, copy and paste into the editor, and click **Add to Chart** (or test on the **Strategy Tester** tab for #16 & #18).
2. **In Local Pine Platform**:
   * Use the web console at `http://localhost:5173` to run and visualize these Pine scripts using the local **PineTS** / **PyneCore** engines!

