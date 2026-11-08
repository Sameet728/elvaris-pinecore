import { Trade, MonthlyRecord, MonthlyHeatmapRow, TimeSliceStat } from '@/types/backtest';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function computeTimeStats(trades: Trade[], initialCapital: number) {
  // 1. Group by Year and Month
  const monthMap: Record<
    string,
    {
      year: number;
      month: number;
      trades: Trade[];
      dailyProfitMap: Record<string, number>;
    }
  > = {};

  for (const t of trades) {
    const d = new Date(t.entryTime);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth();
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;

    if (!monthMap[key]) {
      monthMap[key] = { year, month, trades: [], dailyProfitMap: {} };
    }
    monthMap[key].trades.push(t);

    const dayKey = d.toISOString().split('T')[0];
    monthMap[key].dailyProfitMap[dayKey] =
      (monthMap[key].dailyProfitMap[dayKey] || 0) + t.pnl;
  }

  const sortedMonthKeys = Object.keys(monthMap).sort();
  const records: MonthlyRecord[] = [];

  for (const key of sortedMonthKeys) {
    const { year, month, trades: mTrades, dailyProfitMap } = monthMap[key];
    const wins = mTrades.filter((t) => t.isWin).length;
    const losses = mTrades.filter((t) => !t.isWin).length;
    const winRate = mTrades.length > 0 ? (wins / mTrades.length) * 100 : 0;
    const profitCash = mTrades.reduce((sum, t) => sum + t.pnl, 0);
    const profitR = mTrades.reduce(
      (sum, t) => sum + (t.pnlR ?? t.rMultiple ?? (t.pnl > 0 ? 1.02 : -1.0)),
      0
    );
    const profitPct = (profitCash / initialCapital) * 100;

    const dailyProfits = Object.values(dailyProfitMap);
    const bestDayCash = dailyProfits.length > 0 ? Math.max(...dailyProfits) : 0;
    const worstDayCash = dailyProfits.length > 0 ? Math.min(...dailyProfits) : 0;

    let status: 'GREEN' | 'YELLOW' | 'RED' = 'RED';
    if (profitR >= 8.0) status = 'GREEN';
    else if (profitR > 0) status = 'YELLOW';

    records.push({
      year,
      month,
      monthName: `${MONTH_NAMES[month]} ${year}`,
      monthStr: key,
      trades: mTrades.length,
      wins,
      losses,
      winRate: Math.round(winRate * 10) / 10,
      profitCash: Math.round(profitCash * 100) / 100,
      profitR: Math.round(profitR * 100) / 100,
      profitPct: Math.round(profitPct * 100) / 100,
      bestDayCash: Math.round(bestDayCash * 100) / 100,
      worstDayCash: Math.round(worstDayCash * 100) / 100,
      status,
    });
  }

  // 2. Build Heatmap Rows (Grouped by Year)
  const years = Array.from(new Set(records.map((r) => r.year))).sort((a, b) => b - a);
  const heatmap: MonthlyHeatmapRow[] = years.map((yr) => {
    const yrRecords = records.filter((r) => r.year === yr);
    const monthsArray: (MonthlyRecord | null)[] = new Array(12).fill(null);

    let ytdCash = 0;
    let ytdR = 0;

    for (const rec of yrRecords) {
      monthsArray[rec.month] = rec;
      ytdCash += rec.profitCash;
      ytdR += rec.profitR;
    }

    return {
      year: yr,
      months: monthsArray,
      ytdReturnCash: Math.round(ytdCash * 100) / 100,
      ytdReturnPct: Math.round((ytdCash / initialCapital) * 1000) / 10,
      ytdReturnR: Math.round(ytdR * 100) / 100,
    };
  });

  // 3. Hour of Day Breakdown (0 to 23 UTC)
  const hourBins = Array.from({ length: 24 }, (_, h) => ({
    label: `${String(h).padStart(2, '0')}:00 UTC`,
    trades: 0,
    wins: 0,
    profitR: 0,
    profitCash: 0,
  }));

  // 4. Weekday Breakdown (Monday to Friday)
  const weekdayBins = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day) => ({
    label: day,
    trades: 0,
    wins: 0,
    profitR: 0,
    profitCash: 0,
  }));

  // 5. Session Breakdown (Asia 00-08 UTC, London 07-16 UTC, NY 12-21 UTC)
  const sessionBins = [
    { label: 'Asia (00-08 UTC)', trades: 0, wins: 0, profitR: 0, profitCash: 0 },
    { label: 'London (07-16 UTC)', trades: 0, wins: 0, profitR: 0, profitCash: 0 },
    { label: 'New York (12-21 UTC)', trades: 0, wins: 0, profitR: 0, profitCash: 0 },
  ];

  for (const t of trades) {
    const d = new Date(t.entryTime);
    const h = d.getUTCHours();
    const w = d.getUTCDay();
    const r = t.pnlR ?? t.rMultiple ?? (t.pnl > 0 ? 1.02 : -1.0);

    // Hour
    hourBins[h].trades++;
    if (t.isWin) hourBins[h].wins++;
    hourBins[h].profitR += r;
    hourBins[h].profitCash += t.pnl;

    // Weekday (1 = Mon ... 5 = Fri)
    if (w >= 1 && w <= 5) {
      weekdayBins[w - 1].trades++;
      if (t.isWin) weekdayBins[w - 1].wins++;
      weekdayBins[w - 1].profitR += r;
      weekdayBins[w - 1].profitCash += t.pnl;
    }

    // Sessions
    if (h >= 0 && h < 8) {
      sessionBins[0].trades++;
      if (t.isWin) sessionBins[0].wins++;
      sessionBins[0].profitR += r;
      sessionBins[0].profitCash += t.pnl;
    }
    if (h >= 7 && h < 16) {
      sessionBins[1].trades++;
      if (t.isWin) sessionBins[1].wins++;
      sessionBins[1].profitR += r;
      sessionBins[1].profitCash += t.pnl;
    }
    if (h >= 12 && h < 21) {
      sessionBins[2].trades++;
      if (t.isWin) sessionBins[2].wins++;
      sessionBins[2].profitR += r;
      sessionBins[2].profitCash += t.pnl;
    }
  }

  const formatSlice = (slice: { label: string; trades: number; wins: number; profitR: number; profitCash: number }): TimeSliceStat => ({
    label: slice.label,
    trades: slice.trades,
    winRate: slice.trades > 0 ? Math.round((slice.wins / slice.trades) * 1000) / 10 : 0,
    profitR: Math.round(slice.profitR * 100) / 100,
    profitCash: Math.round(slice.profitCash * 100) / 100,
  });

  return {
    records,
    heatmap,
    byHour: hourBins.map(formatSlice),
    byWeekday: weekdayBins.map(formatSlice),
    bySession: sessionBins.map(formatSlice),
  };
}

