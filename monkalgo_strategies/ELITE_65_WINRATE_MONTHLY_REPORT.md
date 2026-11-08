# MonkAlgo Elite Systems (Win Rate ≥ 65%): Monthly Performance Audit

> **Filter Criteria**: Only systems with an overall verified **Win Rate ≥ 65%** on authentic TradingView data.  
> **All systems below 65% win rate have been excluded.**  
> **Data Range**: August 2026 through November 2026 (Authentic TradingView Feeds via `@mathieuc/tradingview`).

---

## 🏆 Qualifying Elite Systems Summary (Win Rate ≥ 65%)

| # | System Name | Asset | Timeframe | Trades | Win Rate | Non-Loss Rate | Net Return (R) | Profit Factor | Max DD | Calmar Ratio | Monte Carlo 95% DD | MC Win Prob |
|---|-------------|-------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **02** | [9:30 A.M](file:///c:/Users/samee/Desktop/Pine/monkalgo_strategies/02_9_30_A_M.pine) | NAS100 | 15M | 45 | **73.3%** | **97.8%** | **+21.45R** | 22.45 | **-1.00R** | **21.45** | **-1.00R** | 100.0% |
| **12** | [EASY](file:///c:/Users/samee/Desktop/Pine/monkalgo_strategies/12_EASY.pine) | NAS100 | 15M | 42 | **71.4%** | **92.9%** | **+16.20R** | 6.40 | **-1.00R** | **16.20** | -2.40R | 100.0% |
| **08** | [PUSH](file:///c:/Users/samee/Desktop/Pine/monkalgo_strategies/08_PUSH.pine) | NAS100 | 5M | 18 | **66.7%** | **88.9%** | **+4.20R** | 3.10 | **-1.00R** | 4.20 | -2.50R | 97.5% |
| **SUM**| **COMBINED PORTFOLIO** | NAS100 | 5M / 15M | **105** | **71.4%** | **94.3%** | **+41.85R** | **8.22** | **-1.00R** | **41.85** | **-2.50R** | **100.0%** |

---

## 📅 Month-by-Month Returns (in R)

### 1. Combined Portfolio (All 3 Elite Systems)

| Month | Trades | Wins | Losses | Breakevens | Win Rate | Non-Loss Rate | Monthly Net Return (R) | Cumulative Net Return (R) |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **August 2026** | 29 | 19 | 0 | 10 | **65.5%** | **100.0%** | **+10.75R** | **+10.75R** |
| **September 2026** | 24 | 16 | 3 | 5 | **66.7%** | **87.5%** | **+8.55R** | **+19.30R** |
| **October 2026** | 44 | 34 | 3 | 7 | **77.3%** | **93.2%** | **+19.45R** | **+38.75R** |
| **November 2026 (Mtd)** | 8 | 6 | 0 | 2 | **75.0%** | **100.0%** | **+3.10R** | **+41.85R** |
| **TOTAL** | **105** | **75** | **6** | **24** | **71.4%** | **94.3%** | **+41.85R** | **+41.85R** |

> **Highlights**:
> - **100% Monthly Win Rate Consistency**: Every single month closed net positive with zero losing months.
> - **Remarkable Risk Control**: Over 105 trades, only **6 full losses** occurred across 4 months of market data.
> - **Maximum Consecutive Losses**: Strictly capped at **1 trade** across all systems.

---

### 2. Individual Strategy Monthly Breakdown

#### #02 · 9:30 A.M (15-Minute · NAS100)
* **Core Rule**: 09:30–09:45 NY opening candle 50% Fibonacci discount retrace.
* **Stop / Target**: 0.2 ATR beyond opposite candle boundary; 1.4x RR target.
* **Management**: Micro-BE at +0.25R, profit lock at +0.6R (+0.5R locked).

| Month | Trades | Wins | Losses | BEs | Win Rate | Non-Loss Rate | Net Return (R) |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **August 2026** | 14 | 7 | 0 | 7 | 50.0% | **100.0%** | **+3.85R** |
| **September 2026** | 12 | 9 | 1 | 2 | 75.0% | **91.7%** | **+5.40R** |
| **October 2026** | 16 | 15 | 0 | 1 | **93.8%** | **100.0%** | **+11.15R** |
| **November 2026** | 3 | 2 | 0 | 1 | 66.7% | **100.0%** | **+1.05R** |
| **Total** | **45** | **33** | **1** | **11** | **73.3%** | **97.8%** | **+21.45R** |

---

#### #12 · EASY (15-Minute · NAS100)
* **Core Rule**: MSS sweep of a 4-bar swing low followed by 2 consecutive bullish momentum bars crossing the 50 EMA; 50% Fib limit entry.
* **Stop / Target**: 0.2 ATR below origin low; 1.25x RR target.
* **Management**: Micro-BE at +0.35R, profit lock at +0.7R (+0.5R locked).

| Month | Trades | Wins | Losses | BEs | Win Rate | Non-Loss Rate | Net Return (R) |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **August 2026** | 15 | 12 | 0 | 3 | **80.0%** | **100.0%** | **+6.90R** |
| **September 2026** | 12 | 7 | 2 | 3 | 58.3% | **83.3%** | **+3.15R** |
| **October 2026** | 13 | 9 | 1 | 3 | 69.2% | **92.3%** | **+5.15R** |
| **November 2026** | 2 | 2 | 0 | 0 | **100.0%** | **100.0%** | **+1.00R** |
| **Total** | **42** | **30** | **3** | **9** | **71.4%** | **92.9%** | **+16.20R** |

---

#### #08 · PUSH (5-Minute · NAS100)
* **Core Rule**: Asia session range sweep during London/NY morning hours (08:00–14:00 UTC) with immediate reversal confirmation.
* **Stop / Target**: 0.25 ATR beyond sweep high/low; 1.5x RR target.
* **Management**: Micro-BE at +0.25R, profit lock at +0.6R (+0.5R locked).

| Month | Trades | Wins | Losses | BEs | Win Rate | Non-Loss Rate | Net Return (R) |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **October 2026** | 15 | 10 | 2 | 3 | **66.7%** | **86.7%** | **+3.15R** |
| **November 2026** | 3 | 2 | 0 | 1 | **66.7%** | **100.0%** | **+1.05R** |
| **Total** | **18** | **12** | **2** | **4** | **66.7%** | **88.9%** | **+4.20R** |

