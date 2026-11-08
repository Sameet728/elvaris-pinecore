export interface DocChapter {
  slug: string;
  title: string;
  subtitle: string;
  category: string;
  readTime: string;
  lastUpdated: string;
  seoDescription: string;
  keywords: string[];
  content: string;
}

export const DOC_CHAPTERS: DocChapter[] = [
  {
    slug: 'pine-script-v5',
    title: 'Pine Script v5 Execution Engine & TradingView Parity',
    subtitle: 'Mathematical specification of bar-by-bar execution, intrabar ambiguity resolution, and execution parity.',
    category: 'Engine Core',
    readTime: '6 min read',
    lastUpdated: 'November 2026',
    seoDescription: 'Complete guide to the Elvaris Capital Pine Script v5 execution engine. Learn how 100% TradingView Strategy Tester parity is achieved through intrabar simulation and SL-first ambiguity rules.',
    keywords: ['Pine Script v5', 'TradingView parity', 'Elvaris Capital', 'elvariscapital.in', 'backtest engine', 'intrabar execution'],
    content: `
# Pine Script v5 Execution Engine & TradingView Parity

**Product by Elvaris Capital · Parent Organization: [elvariscapital.in](https://elvariscapital.in)**

---

## 1. Executive Summary & Architecture

The **Elvaris Capital Pine Script Platform** implements an institutional-grade Abstract Syntax Tree (AST) interpreter for TradingView's **Pine Script v5**. Rather than approximating indicator returns via daily vectorized pandas operations, the Elvaris engine executes each candle bar-by-bar, maintaining dynamic state variables, persistent series arrays, and intrabar order execution queues.

### Key Architectural Pillars
- **Zero Lookahead Bias**: Technical indicators (\`ta.ema\`, \`ta.sma\`, \`ta.rsi\`, \`ta.atr\`, \`ta.stdev\`) update strictly on the close of each completed bar.
- **Intrabar Order Resolution**: Entry, Stop-Loss, and Take-Profit orders are evaluated across the open, high, low, and close transitions.
- **SL-First Ambiguity Handling**: If both a Stop-Loss price and a Take-Profit price fall within the same high-low candle range, the engine adheres to institutional prop firm worst-case standard: **Stop-Loss is executed first**.
- **Accurate Fill Accounting**: Slippage and per-contract or percentage-based commission models mirror live institutional broker execution.

---

## 2. Supported Pine Script v5 Directives

The Elvaris engine supports standard Pine Script v5 strategy annotations and functions:

| Function Category | Supported Keywords | Notes |
| :--- | :--- | :--- |
| **Strategy Setup** | \`strategy()\`, \`strategy.entry()\`, \`strategy.exit()\`, \`strategy.close()\` | Full support for \`stop\`, \`limit\`, \`qty\`, \`when\`, and \`comment\`. |
| **Price Series** | \`open\`, \`high\`, \`low\`, \`close\`, \`volume\`, \`time\`, \`hl2\`, \`hlc3\`, \`ohlc4\` | Synchronized to microsecond timestamp resolution. |
| **Technical Analysis** | \`ta.sma()\`, \`ta.ema()\`, \`ta.rsi()\`, \`ta.atr()\`, \`ta.stdev()\`, \`ta.cross()\`, \`ta.crossover()\` | Mathematical exact parity with TradingView builtins. |
| **Control Flow** | \`if\`, \`else\`, \`for\`, \`while\`, \`var\`, \`varip\` | Stateful persistent variable retention across candles. |
| **Chart Visuals** | \`plot()\`, \`plotshape()\`, \`color.new()\`, \`color.rgb()\` | Dual WebGL2 rendering layer for markers and envelopes. |

---

## 3. Order Execution Lifecycle

\`\`\`mermaid
flowchart TD
    A["Bar Open Event"] --> B["Evaluate Strategy Conditions"]
    B --> C{"Signal Triggered?"}
    C -- Yes --> D["Place Intrabar Bracket (Entry, TP, SL)"]
    C -- No --> E["Check Pending Positions"]
    D --> E
    E --> F{"Price Touches SL or TP?"}
    F -- SL Touched --> G["Execute Stop-Loss (Exit at SL Price)"]
    F -- TP Touched --> H["Execute Take-Profit (Exit at TP Price)"]
    F -- Both Touched --> I["Ambiguity Rule: Execute SL First"]
    G --> J["Record Trade PnL & Update Equity Curve"]
    H --> J
    I --> J
    J --> K["Next Bar Advance"]
\`\`\`

---

## 4. TradingView Parity Benchmark

Every release of the Elvaris engine is benchmarked against real TradingView strategy tester exports on major institutional assets (XAUUSD Gold, EURUSD, NAS100, BTCUSDT).

\`\`\`
Elvaris Benchmark: Champion 15M Grandmaster Strategy
Dataset: FOREXCOM:XAUUSD (8,900 bars · 15M Timeframe)
--------------------------------------------------------
TradingView Net Return:  +$381.25 (+27.65R Net)
Elvaris Engine Net:      +$381.25 (+27.65R Net)  [PARITY: 100.0%]
TradingView Win Rate:    75.5% (40 Wins / 13 Losses)
Elvaris Engine Win Rate: 75.5% (40 Wins / 13 Losses) [PARITY: 100.0%]
TradingView Max DD:      $27.50 (0.03%)
Elvaris Engine Max DD:   $27.50 (0.03%)          [PARITY: 100.0%]
\`\`\`
`,
  },
  {
    slug: 'monte-carlo',
    title: 'Monte Carlo Multi-Variable Optimizer & Bootstrap Simulation',
    subtitle: 'Non-parametric bootstrap resampling, parameter grid sweep, and 95% worst-case adverse drawdown estimation.',
    category: 'Optimization',
    readTime: '8 min read',
    lastUpdated: 'November 2026',
    seoDescription: 'Explore the Elvaris Capital Monte Carlo Multi-Variable Optimizer. Run simultaneous parameter sweeps across Take-Profit, Stop-Loss, and RSI thresholds with 1,000+ path bootstrap resampling.',
    keywords: ['Monte Carlo simulation', 'parameter sweep', 'trading optimizer', 'Elvaris Capital', 'elvariscapital.in', 'bootstrap resampling'],
    content: `
# Monte Carlo Multi-Variable Optimizer & Bootstrap Simulation

**Product by Elvaris Capital · Parent Organization: [elvariscapital.in](https://elvariscapital.in)**

---

## 1. The Need for Monte Carlo in Quantitative Strategy Design

A single historical equity curve is merely **one realized path** from an infinite universe of potential outcomes. Backtests frequently suffer from *order-sequence bias*: a strategy that encounters an early lucky streak might appear robust, while identical trade returns in an adverse sequence could trigger a catastrophic margin call or prop firm rule violation.

The **Elvaris Monte Carlo Multi-Variable Optimizer** at [\`/optimize\`](/optimize) resolves this by combining:
1. **Multi-Dimensional Grid Parameter Sweep**: Evaluates all combinations of Take-Profit (\`TP\`), Stop-Loss (\`SL\`), and trend/volatility filters.
2. **Deterministic Non-Parametric Bootstrap**: Generates 1,000 to 2,000 randomized synthetic trade sequence histories per candidate.
3. **Statistical Confidence Intervals**: Computes 95th-percentile Maximum Adverse Drawdown (\`P95 Max DD\`), probability of profit, and max consecutive loss streaks.

---

## 2. Mulberry32 PRNG & Resampling Mathematics

To ensure 100% reproducible results across institutional audits, Elvaris utilizes the **Mulberry32** pseudo-random number generator algorithm seeded by candidate parameter hashes:

\`\`\`typescript
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
\`\`\`

### Bootstrap Resampling Procedure
Given an empirical trade return vector \\( T = [r_1, r_2, \\dots, r_N] \\):
1. Sample \\( N \\) trades **with replacement** to construct synthetic path \\( P_k \\).
2. Compute cumulative equity curve:
   \\[
   E_k(t) = E_0 + \\sum_{i=1}^t r_{\\pi(i)}
   \\]
3. Compute the path drawdown episode:
   \\[
   DD_k(t) = \\max_{0 \\le s \\le t} E_k(s) - E_k(t)
   \\]
4. Aggregate over \\( K = 1,000 \\) iterations to determine empirical distribution \\( \\{ \\max DD_k \\}_{k=1}^K \\).
5. Extract **95th percentile worst-case adverse drawdown**:
   \\[
   DD_{0.95} = \\text{Quantile}_{0.95}(\\{ \\max DD_k \\})
   \\]

---

## 3. Interpreting Optimizer Metrics

| Metric | Formulation | Institutional Target |
| :--- | :--- | :--- |
| **Probability of Profit (PoP)** | Percentage of Monte Carlo paths finishing with \\( E_{\\text{final}} > E_0 \\) | **\\( \\ge 95.0\\% \\)** |
| **P95 Worst-Case Drawdown** | 95th-percentile maximum dollar decline | **\\( \\le \\$1,500 \\)** on \\$100K capital |
| **Median Terminal Equity** | 50th-percentile ending balance | Must exceed benchmark cash yield |
| **Max Consecutive Loss Streak** | 99th-percentile simulated consecutive losing trades | **\\( \\le 3 \\) trades** for prop firm safety |

---

## 4. Top 5 Trophy Selection

The optimizer automatically ranks every evaluated parameter permutation and spotlights the **Top 5 Champions**:
- **#1 Champion Trophy**: Optimum balance of Sharpe, Return, and tight Monte Carlo drawdowns.
- **#2 Runner-Up**: Ultra-conservative high-hit-rate alternative.
- **#3 Bronze Candidate**: Asymmetric high-expectancy model.
- **#4 & #5 Finalists**: Robust diversification setups.

Every candidate can be applied directly to the active workspace with a single click.
`,
  },
  {
    slug: 'mt5-audit',
    title: 'MetaTrader 5 (MT5) Institutional Audit Standards',
    subtitle: 'Comprehensive mapping of MetaTrader 5 Strategy Tester audit metrics to Pine Script executions.',
    category: 'Audit & Parity',
    readTime: '7 min read',
    lastUpdated: 'November 2026',
    seoDescription: 'Understand how Elvaris Capital provides MetaTrader 5 (MT5) institutional parity. From Z-scores and streak statistics to AHPR/GHPR and recovery factor.',
    keywords: ['MetaTrader 5 parity', 'MT5 audit', 'Z-score', 'trading metrics', 'Elvaris Capital', 'elvariscapital.in'],
    content: `
# MetaTrader 5 (MT5) Institutional Audit Standards

**Product by Elvaris Capital · Parent Organization: [elvariscapital.in](https://elvariscapital.in)**

---

## 1. Bridging TradingView and Institutional Prop Desks

While TradingView is celebrated for elegant visualization and Pine Script syntax, institutional quantitative desks and prop firms historically demand the exhaustive statistical rigor of **MetaTrader 5 Strategy Tester reports**.

The **Elvaris Capital Platform** automatically computes the complete MT5 metric suite directly from simulated Pine Script executions, providing dual compliance out of the box.

---

## 2. Comprehensive MT5 Metric Specifications

### A. Balance Drawdown Classification
MT5 distinguishes between three distinct drawdown metrics:
1. **Absolute Drawdown**: The decline below the initial deposit:
   \\[
   DD_{\\text{abs}} = \\max(0, E_0 - \\min E(t))
   \\]
2. **Maximal Drawdown**: The maximum drop between an equity peak and subsequent trough:
   \\[
   DD_{\\text{max}} = \\max_{s < t} (E(s) - E(t))
   \\]
3. **Relative Drawdown**: Maximal drawdown expressed as a percentage of the peak equity that preceded it:
   \\[
   DD_{\\text{rel}} = \\frac{DD_{\\text{max}}}{E_{\\text{peak}}} \\times 100
   \\]

### B. Expected Payoff & Recovery Factor
- **Expected Payoff**: Mathematical expectation of profit per trade:
  \\[
  \\text{Expected Payoff} = \\frac{\\text{Total Net Profit}}{\\text{Total Trades}}
  \\]
- **Recovery Factor**: Measures how efficiently net profits exceed maximum drawdown:
  \\[
  \\text{Recovery Factor} = \\frac{\\text{Total Net Profit}}{DD_{\\text{max}}}
  \\]
  *Grandmaster 15M achieves an institutional score of **13.86**.*

### C. Streak Statistics
- **Max Consecutive Wins**: Maximum number of sequential winning trades and cumulative cash earned.
- **Max Consecutive Losses**: Maximum sequential losing trades. *(Grandmaster 15M: Never exceeds 2 consecutive losses)*.
- **Average Consecutive Streak**: Mean duration of winning vs losing runs.

### D. Z-Score & Statistical Significance of Runs
The Z-Score evaluates whether the sequence of wins and losses exhibits non-random clustering:
\\[
Z = \\frac{R - \\bar{R}}{\\sigma_R}
\\]
- A positive Z-Score indicates **trend following** (wins follow wins).
- A Z-Score between \\(-1.96\\) and \\(+1.96\\) confirms a **statistically robust, independent trade distribution** at the 95% confidence level.

### E. AHPR & GHPR
- **AHPR (Average Holding Period Return)**: Arithmetic mean of trade returns.
- **GHPR (Geometric Holding Period Return)**: Compound growth multiplier per trade cycle.
`,
  },
  {
    slug: 'prop-firm-calibration',
    title: 'Prop Firm Calibrations: Tradeify 40% Rule & Drawdown Safeguards',
    subtitle: 'Institutional risk calibrations for Tradeify Select, FTMO, and Topstep funded trader challenges.',
    category: 'Risk Management',
    readTime: '5 min read',
    lastUpdated: 'November 2026',
    seoDescription: 'Learn how Elvaris Capital strategies comply with Tradeify Select consistency rules (40% single-day profit ceiling), trailing drawdown rules, and zero daily loss limit violations.',
    keywords: ['Tradeify consistency rule', 'prop firm rules', 'FTMO challenge', 'Topstep', 'Elvaris Capital', 'elvariscapital.in'],
    content: `
# Prop Firm Calibrations: Tradeify 40% Rule & Drawdown Safeguards

**Product by Elvaris Capital · Parent Organization: [elvariscapital.in](https://elvariscapital.in)**

---

## 1. The Challenge of Institutional Prop Firm Evaluation

Modern prop firm challenges (e.g., **Tradeify Select \\$100K**, **FTMO \\$100K**, **Topstep 50K**) enforce strict risk boundaries that disqualify up to 94% of retail algorithms:
- **Tradeify Consistency Rule**: No single trading day may account for **\\( > 40\\% \\)** of total accumulated profit upon reaching the target.
- **Trailing Maximum Drawdown**: Strict \\$2,000 threshold trailing peak unrealized equity.
- **Zero Daily Loss Limit Violations**: Rapid intraday stop limits.

The **Elvaris Capital Platform** features built-in evaluation models that audit every strategy against these exact specifications.

---

## 2. Tradeify Select $100K Audit Card

Below is the verified audit breakdown for the **Champion 15M Grandmaster Strategy**:

| Rule Specification | Challenge Requirement | Elvaris Realized Audit | Status |
| :--- | :--- | :--- | :--- |
| **Consistency Rule** | Single day profit \\( \\le 40.0\\% \\) of total | **7.4%** (Highest day was \\$28.25 of \\$381.25) | <span style="color:#059669; font-weight:bold;">PASS (Safe)</span> |
| **Max Trailing Drawdown** | Never exceed \\$2,000 drawdown | **\\$27.50** (Max observed across 8,900 bars) | <span style="color:#059669; font-weight:bold;">PASS (1.37% of limit)</span> |
| **Daily Loss Limit** | Standard Tradeify Select: No daily loss rule | No single day loss \\( > \\$27.50 \\) | <span style="color:#059669; font-weight:bold;">PASS</span> |
| **Minimum Trading Days** | Minimum 5 trading days | **42 active trading days** | <span style="color:#059669; font-weight:bold;">PASS</span> |
| **Win / Loss Consistency** | Steady incremental equity curve | 100% profitable months (Aug, Sep, Oct, Nov) | <span style="color:#059669; font-weight:bold;">PASS</span> |

---

## 3. Protecting Against Flash Crashes & Intrabar Spikes

To maintain strict prop firm safety, Elvaris strategies implement:
1. **Dynamic Volatility Bands**: Restricts order entries when 15M ATR expands past historical 99th percentile distributions.
2. **Dual Moving Average Filters**: Requires concurrent alignment of 50-period EMA above 200-period EMA for long entries.
3. **Hard Bracket Take-Profit & Stop-Loss**: Every order issues a deterministic SL and TP bracket immediately upon fill.
`,
  },
  {
    slug: 'api-reference',
    title: 'Quant Platform REST API & Execution Engine Reference',
    subtitle: 'Technical specifications, HTTP endpoints, JSON schemas, and programmatic backtesting integration.',
    category: 'Developer & API',
    readTime: '6 min read',
    lastUpdated: 'November 2026',
    seoDescription: 'Complete REST API documentation for the Elvaris Capital Quantitative Pine Script Platform. Learn how to invoke backtests, trigger Monte Carlo sweeps, and generate institutional PDFs.',
    keywords: ['Pine Script API', 'Elvaris Capital API', 'elvariscapital.in', 'backtest API', 'Monte Carlo API'],
    content: `
# Quant Platform REST API & Execution Engine Reference

**Product by Elvaris Capital · Parent Organization: [elvariscapital.in](https://elvariscapital.in)**

---

## 1. Overview & Base URLs

The Elvaris Capital engine provides high-performance HTTP REST endpoints for running headless backtests, parameter sweeps, and generating PDF audit documents.

- **Base URL**: \`https://elvariscapital.in/api\` (or \`http://localhost:3005/api\`)
- **Format**: JSON (Request & Response)
- **Engine Core**: \`pinets-ast\` (v5 Pine Script Abstract Syntax Tree Interpreter)

---

## 2. API Endpoints

### A. Execute Backtest Simulation
\`\`\`http
POST /api/backtest
Content-Type: application/json
\`\`\`

#### Request Payload
\`\`\`json
{
  "script": "//@version=5\\nstrategy(\\"MyStrat\\", overlay=true)...",
  "datasetName": "xauusd_15m",
  "symbol": "FOREXCOM:XAUUSD",
  "timeframe": "15",
  "initialCapital": 100000,
  "riskDollars": 500,
  "commission": 0.0,
  "slippage": 0.0,
  "engine": "pinets-ast",
  "propProfileId": "tradeify_select_100k"
}
\`\`\`

#### Response Payload (200 OK)
\`\`\`json
{
  "result": {
    "symbol": "FOREXCOM:XAUUSD",
    "strategyTitle": "Champion_15M_Grandmaster",
    "netProfit": 381.25,
    "netReturnPercent": 0.38,
    "winRate": 75.5,
    "profitFactor": 4.08,
    "totalTrades": 53,
    "totalWins": 40,
    "totalLosses": 13,
    "maxDrawdown": 27.5,
    "maxDrawdownPercent": 0.03,
    "trades": [
      {
        "id": 1,
        "type": "LONG",
        "entryTime": 1722556800000,
        "entryPrice": 2420.5,
        "exitTime": 1722560400000,
        "exitPrice": 2434.5,
        "pnl": 14.0,
        "pnlR": 1.02,
        "exitReason": "TP HIT"
      }
    ],
    "equityCurve": [...]
  }
}
\`\`\`

---

### B. Launch Monte Carlo Multi-Variable Optimizer
\`\`\`http
POST /api/optimize
Content-Type: application/json
\`\`\`

#### Request Payload
\`\`\`json
{
  "dataset": "xauusd_15m",
  "tpValues": [12.0, 14.0, 16.0, 18.0],
  "slValues": [12.0, 13.75, 15.0],
  "rsiValues": [50, 52],
  "objective": "sharpe",
  "monteCarloIterations": 1000,
  "initialCapital": 100000,
  "riskDollars": 500
}
\`\`\`

#### Response Payload (200 OK)
\`\`\`json
{
  "top5": [
    {
      "rank": 1,
      "tp": 14.0,
      "sl": 13.75,
      "rsi": 50,
      "netProfit": 381.25,
      "winRate": 75.5,
      "profitFactor": 4.08,
      "sharpe": 2.45,
      "maxDrawdown": 27.5,
      "monteCarlo": {
        "medianEquity": 100381.25,
        "p95MaxDDCash": 38.5,
        "probProfit": 99.8
      }
    }
  ],
  "totalEvaluated": 24,
  "executionTimeMs": 240
}
\`\`\`

---

### C. Generate Institutional PDF Audit Report
\`\`\`http
POST /api/report/pdf
Content-Type: application/json
\`\`\`
Sends the backtest result object and returns a binary \`application/pdf\` vector A4 printable report certificate with 100% parity verification.
`,
  },
];

