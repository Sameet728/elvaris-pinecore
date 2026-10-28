import fs from 'fs';
import path from 'path';

const files = [
  'Champion_15M_Pure_Sovereign_STRATEGY.pine',
  'Champion_1H_Pure_Sovereign_STRATEGY.pine',
  'Champion_1H_200Pip_GiantTarget_STRATEGY.pine',
  'Champion_1H_V1_HighWinRate82_STRATEGY.pine',
  'Champion_1H_V2_StrictRR_STRATEGY.pine',
  'Champion_5M_200Pip_Sovereign_STRATEGY.pine',
  'Champion_5M_HighFrequency_Prop_STRATEGY.pine',
  'Champion_5M_Pure_Sovereign_STRATEGY.pine',
  'Champion_80to100Pip_Dual10R_STRATEGY_NativeOrders.pine',
  'Champion_83pct_WinRate_HighPrecision_STRATEGY.pine',
  'Champion_91pct_WinRate_Sovereign_STRATEGY.pine',
  'Champion_AllTime_Score6000_STRATEGY.pine',
  'Champion_Macro_110to140Pip_HighRR_STRATEGY.pine',
  'Champion_MultiTF_Universal_STRATEGY.pine',
  'Champion_MultiTier_ZeroLossStreak_STRATEGY.pine',
  'Champion_M1_Calmar6.4_PropFirm.pine',
  'Champion_M5_Calmar22.0_DualMonth_PropPassed.pine',
  'Champion_M5_Calmar9.0_DualMonth_PropPassed.pine',
  'Champion_M5_Calmar7.5_DualMonth_PropPassed.pine',
  'Champion_M5_DualMonth_PropPassed.pine',
  'Champion_M5_Dual10R_STRATEGY_NativeOrders.pine',
  'Champion_M30_LSS.pine',
  'Champion_H4_LSS.pine',
  'Champion_M1_LSS.pine'
];

for (const f of files) {
  const p = path.join('pine_scripts', f);
  if (!fs.existsSync(p)) continue;
  const content = fs.readFileSync(p, 'utf8');
  const lines = content.split('\n').slice(0, 25);
  console.log('====================================================');
  console.log('FILE:', f);
  lines.forEach(l => {
    if (l.startsWith('//') || l.startsWith('strategy(') || l.startsWith('indicator(')) {
      console.log(l);
    }
  });
}
