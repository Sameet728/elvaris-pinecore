import json
import glob
import os

data_dir = r'c:\Users\samee\Desktop\Pine\quant_sector_etf\data'
for f in glob.glob(os.path.join(data_dir, '*.json')):
    fname = os.path.basename(f)
    if 'daily' in fname:
        continue
    size = os.path.getsize(f)
    print(f'\n=== File: {fname} ({size} bytes) ===')
    try:
        with open(f, 'r', encoding='utf-8') as fp:
            d = json.load(fp)
            if isinstance(d, list):
                print(f'  Type: List of {len(d)} items.')
                if len(d) > 0 and isinstance(d[0], dict):
                    print(f'  Item 0: {json.dumps(d[0], indent=2)[:300]}')
            elif isinstance(d, dict):
                print(f'  Type: Dict with keys: {list(d.keys())[:10]}')
                # sample
                first_k = list(d.keys())[0]
                print(f'  Sample [{first_k}]: {str(d[first_k])[:200]}')
    except Exception as e:
        print(f'  Error: {e}')
