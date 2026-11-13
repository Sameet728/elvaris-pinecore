with open('/opt/stratmarket/vps/dashboard.html', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('"PS-04"', '"PS-03"')

with open('/opt/stratmarket/vps/dashboard.html', 'w', encoding='utf-8') as f:
    f.write(content)

print('Cleaned any lingering PS-04 strings from dashboard.html.')
