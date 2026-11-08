export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Trade {
  id: number;
  entryIndex: number;
  exitIndex: number;
  entryTime: number;
  exitTime: number;
  type: 'LONG' | 'SHORT';
  direction?: 'LONG' | 'SHORT'; // legacy alias
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  pnl: number;
  pnlR: number;
  rMultiple: number;
  profitCash?: number; // legacy alias
  profitR?: number; // legacy alias
  isWin: boolean;
  streakCount: number;
  streakType: 'WIN' | 'LOSS';
  durationBars?: number;
  barsHeld: number;
  durationHours: number;
  cumulativeEquity: number;
  drawdownFromPeak: number;
  exitReason?: string;
  // Quantitative extensions
  lots?: number;
  riskCash?: number;
  commission?: number;
  slippage?: number;
  grossPnl?: number;
  netPnl?: number;
  maeCash?: number;
  mfeCash?: number;
  maeR?: number;
  mfeR?: number;
  runupCash?: number;
  session?: 'Asia' | 'London' | 'NewYork';
  weekday?: string;
  hourUTC?: number;
  ambiguousBar?: boolean;
}

export interface SideStats {
  trades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  grossProfit: number;
  grossLoss: number;
  netProfit: number;
  profitFactor: number;
  avgTradeCash: number;
  avgTradeR: number;
  avgWinCash: number;
  avgLossCash: number;
  payoffRatio: number;
  largestWinCash: number;
  largestLossCash: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
}

export interface PerformanceSummary {
  all: SideStats;
  long: SideStats;
  short: SideStats;
  initialCapital: number;
  finalEquity: number;
  netProfitPct: number;
  commissionPaid: number;
  slippageCost: number;
  buyAndHoldReturnCash: number;
  buyAndHoldReturnPct: number;
  strategyOutperformancePct: number;
  maxRunupCash: number;
  maxRunupPct: number;
  maxDrawdownCash: number;
  maxDrawdownPct: number;
  maxDrawdownR: number;
  cagr: number;
  annualizedVolatility: number;
  returnOverMaxDD: number;
  recoveryFactor: number;
  calmarRatio: number;
}

export interface RiskStats {
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  omegaRatio: number;
  ulcerIndex: number;
  ulcerPerformanceIndex: number;
  recoveryFactor: number;
  painRatio: number;
  tailRatio: number;
  var95TradeR: number;
  cvar95TradeR: number;
  gainToPain: number;
  sqn: number;
  kellyPercent: number;
  timeInMarketPercent: number;
}

export interface DrawdownEpisode {
  id: number;
  startDate: string;
  troughDate: string;
  recoveryDate?: string;
  depthCash: number;
  depthPct: number;
  depthR: number;
  lengthDays: number;
  lengthTrades: number;
  recoveryDays?: number;
  isOpen: boolean;
}

export interface MonthlyRecord {
  year: number;
  month: number; // 0-11
  monthName: string;
  monthStr: string; // YYYY-MM
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitCash: number;
  profitR: number;
  profitPct: number;
  bestDayCash: number;
  worstDayCash: number;
  status: 'GREEN' | 'YELLOW' | 'RED';
}

export interface MonthlyHeatmapRow {
  year: number;
  months: (MonthlyRecord | null)[]; // 12 elements
  ytdReturnCash: number;
  ytdReturnPct: number;
  ytdReturnR: number;
}

export interface HistogramBin {
  binLabel: string;
  binStart: number;
  binEnd: number;
  count: number;
  frequencyPct: number;
}

export interface ScatterPoint {
  tradeId: number;
  type: 'LONG' | 'SHORT';
  maeR: number;
  mfeR: number;
  pnlR: number;
  isWin: boolean;
}

export interface ExitReasonStat {
  reason: string;
  count: number;
  winRate: number;
  avgR: number;
  totalPnlCash: number;
}

export interface TimeSliceStat {
  label: string;
  trades: number;
  winRate: number;
  profitR: number;
  profitCash: number;
}

export interface EquityCurvePoint {
  index: number;
  time: number;
  equity: number;
  cash: number;
  drawdownCash: number;
  drawdownPct: number;
  peakEquity: number;
  rMultiple: number;
  buyAndHoldEquity: number;
  tradeId?: number;
}

export interface MonteCarloBand {
  tradeIndex: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

export interface MonteCarloSimulation {
  iterations: number;
  fanBands: MonteCarloBand[];
  medianFinalEquity: number;
  p5FinalEquity: number;
  p95MaxDrawdownPct: number;
  probProfit: number;
  probDrawdownBreach: number;
  riskOfRuin: number;
  expectedMaxLossStreak: number;
}

export interface PropFirmComplianceRule {
  ruleName: string;
  isCompliant: boolean;
  value: string;
  limit: string;
  details: string;
  worstDate?: string;
}

export interface PropFirmEvaluation {
  profileName: string;
  passedAllRules: boolean;
  rules: PropFirmComplianceRule[];
  passProbability: number;
  maxSingleDayProfitCash: number;
  maxSingleDayProfitPct: number;
  trailingDrawdownPeakCash: number;
  trailingDrawdownPeakPct: number;
}

export interface ReportProperties {
  strategyTitle: string;
  scriptHash: string;
  symbol: string;
  timeframe: string;
  barCount: number;
  firstDate: string;
  lastDate: string;
  initialCapital: number;
  riskDollars: number;
  commissionPerLot: number;
  slippagePoints: number;
  intrabarAssumption: string;
  ambiguousBarCount: number;
  engineUsed: 'pinets' | 'quant-native' | 'hybrid';
  executionTimeMs: number;
  generatedAt: string;
  appVersion: string;
}

export interface ReportVerdict {
  status: 'Robust' | 'Acceptable' | 'Fragile';
  score: number; // 0-100
  reasons: string[];
}

export interface ReportAnalytics {
  kpis: {
    netProfitCash: number;
    netProfitPct: number;
    netProfitR: number;
    totalTrades: number;
    winRate: number;
    profitFactor: number;
    maxDrawdownCash: number;
    maxDrawdownPct: number;
    maxDrawdownR: number;
    avgTradeCash: number;
    avgTradeR: number;
    sharpeRatio: number;
    sortinoRatio: number;
    expectancyR: number;
    verdict: ReportVerdict;
  };
  summary: PerformanceSummary;
  risk: RiskStats;
  drawdownEpisodes: DrawdownEpisode[];
  monthly: {
    records: MonthlyRecord[];
    heatmap: MonthlyHeatmapRow[];
  };
  distributions: {
    rHistogram: HistogramBin[];
    durationHistogram: HistogramBin[];
    scatterMaeMfe: ScatterPoint[];
    exitReasons: ExitReasonStat[];
  };
  timeStats: {
    byHour: TimeSliceStat[];
    byWeekday: TimeSliceStat[];
    bySession: TimeSliceStat[];
  };
  equityCurve: EquityCurvePoint[];
  monteCarlo: MonteCarloSimulation;
  compliance: PropFirmEvaluation;
  properties: ReportProperties;
  trades: Trade[];
}

export interface StrategySettings {
  initialCapital: number;
  riskDollars: number;
  riskPercent?: number;
  sizingMode?: 'risk_dollars' | 'risk_percent' | 'fixed_lots';
  fixedLots?: number;
  commissionPerLot: number;
  slippagePoints: number;
  intrabarAssumption: 'sl_first' | 'tp_first';
  riskFreeRate: number; // e.g. 0.0
}

export interface IndicatorPlotPoint {
  time: number;
  value: number | null;
}

export interface IndicatorPlots {
  ema50?: IndicatorPlotPoint[];
  ema200?: IndicatorPlotPoint[];
  upperBand?: IndicatorPlotPoint[];
  lowerBand?: IndicatorPlotPoint[];
  basisBand?: IndicatorPlotPoint[];
  [key: string]: IndicatorPlotPoint[] | undefined;
}

export type ExecutedTrade = Trade;
export type StreakStats = any;
export type TradeifySummary = any;

// Backward compatibility container
export interface BacktestResult {
  symbol: string;
  timeframe: string;
  datasetName: string;
  candleCount: number;
  dateRange: {
    start: string;
    end: string;
  };
  // Top-level aliases for components
  strategyTitle?: string;
  initialCapital?: number;
  riskDollars?: number;
  netProfit: number;
  winRate: number;
  totalTrades: number;
  totalWins?: number;
  totalLosses?: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  calmarRatio?: number;
  realizedRR?: number;
  analytics?: any;
  metadata?: any;
  // Full report analytics (Primary)
  report?: ReportAnalytics;
  // Legacy aliases
  metrics: {
    initialCapital: number;
    finalEquity: number;
    netProfitCash: number;
    netProfitPercent: number;
    grossProfitCash: number;
    grossLossCash: number;
    totalReturnR: number;
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    profitFactor: number;
    calmarRatio: number;
    sharpeRatio: number;
    sortinoRatio: number;
    maxDrawdownCash: number;
    maxDrawdownR: number;
    maxDrawdownPercent: number;
    averageTradeR: number;
    averageTradeCash: number;
    avgWinCash: number;
    avgLossCash: number;
    winLossRatio: number;
    expectancyR: number;
    riskRewardRatio: number;
    largestWinCash: number;
    largestLossCash: number;
    avgTradeDurationBars: number;
    avgTradeDurationHours: number;
    buyAndHoldReturnCash: number;
    buyAndHoldReturnPercent: number;
  };
  streaks: {
    maxConsecutiveWins: number;
    maxConsecutiveLosses: number;
    currentStreakCount: number;
    currentStreakType: 'WIN' | 'LOSS' | 'NONE';
    averageWinStreak: number;
    averageLossStreak: number;
    totalWinStreaks: number;
    totalLossStreaks: number;
  };
  monthly: any[];
  tradeify: any;
  trades: Trade[];
  equityCurve: any[];
  plots?: IndicatorPlots;
  engineUsed: 'pinets' | 'quant-native' | 'hybrid';
  executionTimeMs: number;
  error?: string;
}
