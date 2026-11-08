import { Trade } from '@/types/backtest';

export interface BuildTradeLayerOptions {
  showBoxes?: boolean;
  showMarks?: boolean;
  selectedTradeId?: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildTradeLayer(chart: any, trades: Trade[], options: BuildTradeLayerOptions = {}) {
  if (!chart || !chart.drawings || !trades) return;

  const { showBoxes = true, showMarks = true, selectedTradeId } = options;

  // 1. Remove existing trade drawings
  try {
    const allDrawings = chart.drawings.all() || [];
    for (const d of allDrawings) {
      if (d.id && d.id.startsWith('trade_')) {
        chart.drawings.remove(d.id);
      }
    }
  } catch (err) {
    console.warn('Error clearing trade drawings:', err);
  }

  // 2. Build Trade Position Boxes, Lines, Price Levels and Outcome Badges
  if (showBoxes) {
    for (const trade of trades) {
      const isSelected = selectedTradeId === trade.id;
      const isLong = trade.type === 'LONG';
      const isWin = trade.pnl > 0;

      const tpColor = '#089981';
      const slColor = '#F23645';

      const entryTime = trade.entryTime;
      const exitTime = trade.exitTime || entryTime + 15 * 60 * 1000 * 4;
      const entryPrice = trade.entryPrice;
      const slPrice = trade.stopLoss;
      const tpPrice = trade.takeProfit;
      const exitPrice = trade.exitPrice;

      const tpDelta = Math.abs(tpPrice - entryPrice).toFixed(2);
      const slDelta = Math.abs(entryPrice - slPrice).toFixed(2);

      const rMultiple = trade.rMultiple ?? trade.pnlR ?? (trade.pnl > 0 ? 1.02 : -1.0);
      const outcomeLabel = isWin ? 'TP HIT' : 'SL HIT';
      const pnlFormatted = `${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}`;
      const rFormatted = `${rMultiple >= 0 ? '+' : ''}${rMultiple.toFixed(2)}R`;

      try {
        // A. TP Zone Box with Price Label
        const tpBoxId = `trade_tp_${trade.id}`;
        chart.drawings.add('box', {
          id: tpBoxId,
          paneId: 'price',
          anchors: isLong
            ? [
                { time: entryTime, price: tpPrice },
                { time: exitTime, price: entryPrice },
              ]
            : [
                { time: entryTime, price: entryPrice },
                { time: exitTime, price: tpPrice },
              ],
          text: {
            value: `TP $${tpPrice.toFixed(2)} (+${tpDelta})`,
            color: '#0A7A55',
            size: 'small',
            bold: true,
          },
          style: {
            lineColor: tpColor,
            lineWidth: isSelected ? 2 : 1,
            lineStyle: 'solid',
            fillColor: isSelected ? 'rgba(8, 153, 129, 0.28)' : 'rgba(8, 153, 129, 0.16)',
          },
        });
        chart.drawings.lock(tpBoxId);

        // B. SL Zone Box with Price Label
        const slBoxId = `trade_sl_${trade.id}`;
        chart.drawings.add('box', {
          id: slBoxId,
          paneId: 'price',
          anchors: isLong
            ? [
                { time: entryTime, price: entryPrice },
                { time: exitTime, price: slPrice },
              ]
            : [
                { time: entryTime, price: slPrice },
                { time: exitTime, price: entryPrice },
              ],
          text: {
            value: `SL $${slPrice.toFixed(2)} (-${slDelta})`,
            color: '#C0223A',
            size: 'small',
            bold: true,
          },
          style: {
            lineColor: slColor,
            lineWidth: isSelected ? 2 : 1,
            lineStyle: 'solid',
            fillColor: isSelected ? 'rgba(242, 54, 69, 0.28)' : 'rgba(242, 54, 69, 0.16)',
          },
        });
        chart.drawings.lock(slBoxId);

        // C. Entry Line with Entry Price Label
        const entryLineId = `trade_line_${trade.id}`;
        chart.drawings.add('trendline', {
          id: entryLineId,
          paneId: 'price',
          anchors: [
            { time: entryTime, price: entryPrice },
            { time: exitTime, price: entryPrice },
          ],
          text: {
            value: `${trade.type} Entry $${entryPrice.toFixed(2)}`,
            color: isSelected ? '#2B59FF' : '#475266',
            size: 'small',
            bold: true,
          },
          style: {
            lineColor: isSelected ? '#2B59FF' : '#94A3B8',
            lineWidth: isSelected ? 2 : 1,
            lineStyle: 'dashed',
          },
        });
        chart.drawings.lock(entryLineId);

        // D. Outcome Badge at Exit Candle: Whether it was TP HIT or SL HIT with P&L and Exit Price
        if (trade.exitTime) {
          const outcomeBadgeId = `trade_outcome_${trade.id}`;
          chart.drawings.add('text', {
            id: outcomeBadgeId,
            paneId: 'price',
            anchors: [
              {
                time: exitTime,
                price: isLong 
                  ? (isWin ? Math.max(exitPrice, tpPrice) : Math.min(exitPrice, slPrice))
                  : (isWin ? Math.min(exitPrice, tpPrice) : Math.max(exitPrice, slPrice)),
              },
            ],
            text: {
              value: `${outcomeLabel} ${pnlFormatted} (${rFormatted})\nExit: $${exitPrice.toFixed(2)}`,
              color: isWin ? '#089981' : '#F23645',
              size: isSelected ? 'normal' : 'small',
              bold: true,
            },
          });
          chart.drawings.lock(outcomeBadgeId);
        }
      } catch (e) {
        console.warn('Failed to place drawing for trade', trade.id, e);
      }
    }
  }

  // 3. Build Timeline Marks (Marks lane above time axis)
  if (chart.marks && showMarks) {
    try {
      chart.marks.defineGroup({ id: 'trades', label: 'Strategy Trades' });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const markItems: any[] = [];

      for (const trade of trades) {
        const isLong = trade.type === 'LONG';
        const isWin = trade.pnl > 0;
        const rMultiple = trade.rMultiple ?? trade.pnlR ?? (trade.pnl > 0 ? 1.02 : -1.0);
        const outcomeLabel = isWin ? 'TP HIT' : 'SL HIT';
        const pnlFormatted = `${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}`;
        const rFormatted = `${rMultiple >= 0 ? '+' : ''}${rMultiple.toFixed(2)}R`;

        // Entry Mark
        markItems.push({
          id: `trade_entry_mark_${trade.id}`,
          time: trade.entryTime,
          group: 'trades',
          title: `#${trade.id} ${trade.type} Entry`,
          tooltip: `#${trade.id} ${trade.type} Entry @ $${trade.entryPrice.toFixed(2)} | TP: $${trade.takeProfit.toFixed(2)} | SL: $${trade.stopLoss.toFixed(2)}`,
          glyph: {
            shape: 'triangle',
            color: isLong ? '#089981' : '#F23645',
            letter: isLong ? 'L' : 'S',
          },
          content: {
            panel: {
              items: [
                { type: 'field', label: 'Trade', value: `#${trade.id} ${trade.type}` },
                { type: 'field', label: 'Entry Price', value: `$${trade.entryPrice.toFixed(2)}` },
                { type: 'field', label: 'Take Profit', value: `$${trade.takeProfit.toFixed(2)}` },
                { type: 'field', label: 'Stop Loss', value: `$${trade.stopLoss.toFixed(2)}` },
                { type: 'field', label: 'Entry Time', value: new Date(trade.entryTime).toUTCString() },
              ],
            },
          },
        });

        // Exit Mark
        if (trade.exitTime) {
          markItems.push({
            id: `trade_exit_mark_${trade.id}`,
            time: trade.exitTime,
            group: 'trades',
            title: `#${trade.id} ${outcomeLabel} (${rFormatted})`,
            tooltip: `#${trade.id} ${outcomeLabel}: ${pnlFormatted} (${rFormatted}) @ $${trade.exitPrice.toFixed(2)}`,
            glyph: {
              shape: 'circle',
              color: isWin ? '#089981' : '#F23645',
              letter: isWin ? '✓' : '✗',
            },
            content: {
              panel: {
                items: [
                  { type: 'field', label: 'Trade', value: `#${trade.id} Exit` },
                  { type: 'field', label: 'Outcome', value: outcomeLabel },
                  {
                    type: 'field',
                    label: 'P&L',
                    value: `${pnlFormatted} (${rFormatted})`,
                  },
                  { type: 'field', label: 'Exit Price', value: `$${trade.exitPrice.toFixed(2)}` },
                  { type: 'field', label: 'Reason', value: trade.exitReason || outcomeLabel },
                  { type: 'field', label: 'Duration', value: `${trade.barsHeld || 8} bars` },
                ],
              },
            },
          });
        }
      }

      chart.marks.set(markItems);
    } catch (e) {
      console.warn('Error setting timeline marks:', e);
    }
  }
}
