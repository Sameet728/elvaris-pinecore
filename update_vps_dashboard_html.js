const { runRemote } = require('./vps_tool');

const updateScript = `
python3 -c "
with open('/opt/stratmarket/vps/dashboard.html', 'r') as f:
    content = f.read()

old_table = '''                <tr>
                  <td><strong style=\"font-family: var(--mono); color: var(--gold);\">PS-01</strong></td>
                  <td>Grandmaster Dual 10R / 8R</td>
                  <td><span class=\"tag tag-pine\">Pine / TV</span></td>
                  <td>XAUUSD</td>
                  <td>15M</td>
                  <td>TP: +$18 | SL: -$14 | 82.6% WR</td>
                  <td><span class=\"tag tag-long\">MONITORING</span></td>
                </tr>
                <tr>
                  <td><strong style=\"font-family: var(--mono); color: var(--gold);\">PS-02</strong></td>
                  <td>Apex Sovereign 88% WR</td>
                  <td><span class=\"tag tag-pine\">Pine / TV</span></td>
                  <td>XAUUSD</td>
                  <td>15M</td>
                  <td>TP: +$17 | SL: -$14 | PF 9.31</td>
                  <td><span class=\"tag tag-long\">MONITORING</span></td>
                </tr>
                <tr>
                  <td><strong style=\"font-family: var(--mono); color: var(--gold);\">PS-03</strong></td>
                  <td>Strict 1:2 R:R Champion</td>
                  <td><span class=\"tag tag-pine\">Pine / TV</span></td>
                  <td>XAUUSD</td>
                  <td>15M</td>
                  <td>TP: +$20 | SL: -$10 | 74.1% WR</td>
                  <td><span class=\"tag tag-long\">MONITORING</span></td>
                </tr>
                <tr>
                  <td><strong style=\"font-family: var(--mono); color: var(--gold);\">PS-04</strong></td>
                  <td>Elite 80% WR Sovereign</td>
                  <td><span class=\"tag tag-pine\">Pine / TV</span></td>
                  <td>XAUUSD</td>
                  <td>15M</td>
                  <td>TP: +$17 | SL: -$14 | 80.6% WR</td>
                  <td><span class=\"tag tag-long\">MONITORING</span></td>
                </tr>'''

new_table = '''                <tr>
                  <td><strong style=\"font-family: var(--mono); color: var(--gold);\">PS-01</strong></td>
                  <td>Grandmaster Dual 10R / 8R</td>
                  <td><span class=\"tag tag-pine\">Pine / TV</span></td>
                  <td>XAUUSD</td>
                  <td>15M</td>
                  <td>TP: +$14.00 | SL: -$13.75 | 80.0% WR | Calmar 13.83</td>
                  <td><span class=\"tag tag-long\">MONITORING</span></td>
                </tr>
                <tr>
                  <td><strong style=\"font-family: var(--mono); color: var(--gold);\">PS-02</strong></td>
                  <td>US Afternoon Reversal</td>
                  <td><span class=\"tag tag-pine\">Pine / TV</span></td>
                  <td>XAUUSD</td>
                  <td>15M</td>
                  <td>TP: +$18.00 | SL: -$13.75 | 83.3% WR | Calmar 22.18</td>
                  <td><span class=\"tag tag-long\">MONITORING</span></td>
                </tr>
                <tr>
                  <td><strong style=\"font-family: var(--mono); color: var(--gold);\">PS-03</strong></td>
                  <td>London Core Expansion</td>
                  <td><span class=\"tag tag-pine\">Pine / TV</span></td>
                  <td>XAUUSD</td>
                  <td>15M</td>
                  <td>TP: +$16.00 | SL: -$13.75 | 80.0% WR | Calmar 25.58</td>
                  <td><span class=\"tag tag-long\">MONITORING</span></td>
                </tr>'''

if old_table in content:
    content = content.replace(old_table, new_table)
    with open('/opt/stratmarket/vps/dashboard.html', 'w') as f:
        f.write(content)
    print('Updated dashboard.html successfully!')
else:
    print('Target table block not matched directly, checking...')
"
`;

console.log(runRemote(updateScript));

