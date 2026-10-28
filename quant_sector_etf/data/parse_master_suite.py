import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open(r'c:\Users\samee\Desktop\Pine\quant_sector_etf\data\master_etf_reallocation_suite_results.json', 'r', encoding='utf-8') as f:
    items = json.load(f)

print(f"Total strategies in master suite: {len(items)}")
for i, item in enumerate(items):
    name = item.get('name')
    cagr = item.get('cagr')
    dd = item.get('maxDrawdown')
    calmar = item.get('calmar')
    sharpe = item.get('sharpe')
    tot = item.get('totalReturnPct')
    cap = item.get('finalCapital', 0)
    print(f"{i+1:2d}. {name:<55} | CAGR: {cagr:5.2f}% | MaxDD: {dd:5.2f}% | Calmar: {calmar:4.2f} | Sharpe: {sharpe:4.2f} | Return: +{tot:,.1f}% | ₹{cap:,.0f}")
