import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open(r'c:\Users\samee\Desktop\Pine\quant_sector_etf\data\beat_sameet_results.json', 'r', encoding='utf-8') as f:
    items = json.load(f)

print(f"Total configurations in beat_sameet_results.json: {len(items)}")

# Sort by Calmar
items_calmar = sorted(items, key=lambda x: x.get('calmar', 0), reverse=True)

print("\n================ TOP 10 BY CALMAR RATIO ================")
for i, item in enumerate(items_calmar[:10]):
    name = item.get('name')
    cagr = item.get('cagr')
    dd = item.get('max_dd')
    calmar = item.get('calmar')
    sharpe = item.get('sharpe')
    cap = item.get('final_capital', 0)
    wr = item.get('win_rate')
    trades = item.get('total_trades')
    pf = item.get('profit_factor')
    yr = item.get('yearly_returns', {})
    print(f"{i+1:2d}. {name:<35} | CAGR: {cagr:5.2f}% | MaxDD: {dd:6.2f}% | Calmar: {calmar:4.2f} | Sharpe: {sharpe:4.2f} | WR: {wr:4.1f}% | ₹{cap:,.0f} | Yearly: {yr}")

# Sort by CAGR
items_cagr = sorted(items, key=lambda x: x.get('cagr', 0), reverse=True)
print("\n================ TOP 10 BY CAGR ================")
for i, item in enumerate(items_cagr[:10]):
    name = item.get('name')
    cagr = item.get('cagr')
    dd = item.get('max_dd')
    calmar = item.get('calmar')
    sharpe = item.get('sharpe')
    cap = item.get('final_capital', 0)
    wr = item.get('win_rate')
    trades = item.get('total_trades')
    yr = item.get('yearly_returns', {})
    print(f"{i+1:2d}. {name:<35} | CAGR: {cagr:5.2f}% | MaxDD: {dd:6.2f}% | Calmar: {calmar:4.2f} | Sharpe: {sharpe:4.2f} | WR: {wr:4.1f}% | ₹{cap:,.0f} | Yearly: {yr}")

print("\n================ ALL BASELINE / SAMEET VARIATIONS ================")
for item in items:
    name = item.get('name', '')
    if 'Base' in name or 'Hold 96' in name or 'Original' in name:
        cagr = item.get('cagr')
        dd = item.get('max_dd')
        calmar = item.get('calmar')
        sharpe = item.get('sharpe')
        cap = item.get('final_capital', 0)
        wr = item.get('win_rate')
        yr = item.get('yearly_returns', {})
        print(f" * {name:<35} | CAGR: {cagr:5.2f}% | MaxDD: {dd:6.2f}% | Calmar: {calmar:4.2f} | Sharpe: {sharpe:4.2f} | WR: {wr:4.1f}% | ₹{cap:,.0f} | Yearly: {yr}")
