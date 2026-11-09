const { MongoClient } = require('mongodb');

const uri = 'mongodb://sameetpisal_db_user:0op4uoeZpcVTooaP@ac-ozckia6-shard-00-00.syikpx1.mongodb.net:27017,ac-ozckia6-shard-00-01.syikpx1.mongodb.net:27017,ac-ozckia6-shard-00-02.syikpx1.mongodb.net:27017/stratmarket?ssl=true&replicaSet=atlas-11286g-shard-0&authSource=admin';

async function updateDb() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log('Connected to MongoDB Atlas...');
    const db = client.db('stratmarket');
    const col = db.collection('strategies');

    // 1. Update PS-01
    await col.updateOne(
      { id: 'PS-01' },
      {
        $set: {
          name: 'Grandmaster Dual 10R / 8R',
          slug: 'ps-01',
          category: 'Mean reversion',
          instrument: 'XAUUSD',
          timeframe: 'M15',
          description: 'Fades 2.1-sigma band excursions along 200 EMA with RSI pullback filter, ATR flash crash protective shield, and 1:1.02 payoff ($13.75 SL / $14.00 TP). 80.43% win rate (+28.67R).',
          netProfitUsd: '+$7,167.50',
          'metrics.netReturn': 28.67,
          'metrics.maxDrawdown': 2.00,
          'metrics.profitFactor': 4.19,
          'metrics.winRate': 80.4,
          'metrics.totalTrades': 46,
          'metrics.averageTrade': 0.62,
          'metrics.sharpeRatio': 8.12,
          'metrics.calmar': 14.33,
          'metrics.calmarRatio': 14.33,
          'metrics.backtestPeriod': '2026-08-02 to 2026-11-09 (6,800 M15 bars)',
          'metrics.transactionCosts': 'Spread $0.20/oz, slippage $0.05/oz, 1.0% risk per trade',
          'metrics.slippageAssumptions': 'Fixed $0.05/oz slippage model on next-bar-open execution',
          'metrics.dataSource': 'TradingView Institutional Feed (XAUUSD M15)',
          'researchReport.hypothesis': 'Institutional mean-reversion with dynamic ATR flash crash filters, 200 EMA macro trend clearance, and Dual 10R/8R monthly consistency targets.',
          'researchReport.riskRules': 'SL = $13.75, TP = $14.00. Max 1 loss/day, max 2 trades/day.',
          'researchReport.executionProtocol': 'TradingView Pine Script v5 strategy file: Champion_15M_Grandmaster_Dual10R_Oct8R_STRATEGY.pine. Dispatched 24x7 via VPS runner.'
        }
      }
    );
    console.log('Updated PS-01 (Grandmaster Dual 10R / 8R)');

    // 2. Update PS-02
    await col.updateOne(
      { id: 'PS-02' },
      {
        $set: {
          name: 'US Afternoon Reversal',
          slug: 'ps-02',
          category: 'Mean reversion',
          instrument: 'XAUUSD',
          timeframe: 'M15',
          description: 'High-alpha NY afternoon session reversal fading 2.0-sigma volatility band excursions along 200 EMA with 87.50% win rate and 24.49 Calmar ($18.00 TP / $13.75 SL, +24.49R).',
          netProfitUsd: '+$6,122.50',
          'metrics.netReturn': 24.49,
          'metrics.maxDrawdown': 1.00,
          'metrics.profitFactor': 9.16,
          'metrics.winRate': 87.5,
          'metrics.totalTrades': 24,
          'metrics.averageTrade': 1.02,
          'metrics.sharpeRatio': 9.45,
          'metrics.calmar': 24.49,
          'metrics.calmarRatio': 24.49,
          'metrics.backtestPeriod': '2026-08-02 to 2026-11-09 (6,800 M15 bars)',
          'metrics.transactionCosts': 'Spread $0.20/oz, slippage $0.05/oz, 1.0% risk per trade',
          'metrics.slippageAssumptions': 'Fixed $0.05/oz slippage model on next-bar-open execution',
          'metrics.dataSource': 'TradingView Institutional Feed (XAUUSD M15)',
          'researchReport.hypothesis': 'Fades overextended momentum during the US afternoon window (14:00-22:00 UTC) capitalizing on late-day liquidity exhaustion.',
          'researchReport.riskRules': 'SL = $13.75, TP = $18.00. Max 1 loss/day, max 2 trades/day.',
          'researchReport.executionProtocol': 'TradingView Pine Script v5 strategy file: Champion_15M_US_Momentum_STRATEGY.pine. Dispatched 24x7 via VPS runner.'
        }
      }
    );
    console.log('Updated PS-02 (US Afternoon Reversal)');

    // 3. Update PS-03
    await col.updateOne(
      { id: 'PS-03' },
      {
        $set: {
          name: 'London Core Expansion',
          slug: 'ps-03',
          category: 'Mean reversion',
          instrument: 'XAUUSD',
          timeframe: 'M15',
          description: 'Institutional London & Frankfurt expansion mean-reversion with 82.86% win rate and 27.75 Calmar (1:1.16 R:R, $16.00 TP / $13.75 SL, +27.75R).',
          netProfitUsd: '+$6,937.50',
          'metrics.netReturn': 27.75,
          'metrics.maxDrawdown': 1.00,
          'metrics.profitFactor': 5.62,
          'metrics.winRate': 82.9,
          'metrics.totalTrades': 35,
          'metrics.averageTrade': 0.79,
          'metrics.sharpeRatio': 8.85,
          'metrics.calmar': 27.75,
          'metrics.calmarRatio': 27.75,
          'metrics.backtestPeriod': '2026-08-02 to 2026-11-09 (6,800 M15 bars)',
          'metrics.transactionCosts': 'Spread $0.20/oz, slippage $0.05/oz, 1.0% risk per trade',
          'metrics.slippageAssumptions': 'Fixed $0.05/oz slippage model on next-bar-open execution',
          'metrics.dataSource': 'TradingView Institutional Feed (XAUUSD M15)',
          'researchReport.hypothesis': 'Captures European morning and early afternoon institutional expansions using 28-period 2.1-sigma envelope while excluding 12:00 UTC chop.',
          'researchReport.riskRules': 'SL = $13.75, TP = $16.00. Max 1 loss/day, max 2 trades/day.',
          'researchReport.executionProtocol': 'TradingView Pine Script v5 strategy file: Champion_15M_London_Core_STRATEGY.pine. Dispatched 24x7 via VPS runner.'
        }
      }
    );
    console.log('Updated PS-03 (London Core Expansion)');

    // 4. Ensure PS-04 is completely removed
    const delRes = await col.deleteOne({ id: 'PS-04' });
    console.log('Ensured PS-04 removed, deletedCount:', delRes.deletedCount);

    const active = await col.find({}).project({ id: 1, name: 1, slug: 1, metrics: 1 }).toArray();
    console.log('Active strategies in Atlas:', JSON.stringify(active, null, 2));

  } finally {
    await client.close();
  }
}

updateDb().catch(console.error);
