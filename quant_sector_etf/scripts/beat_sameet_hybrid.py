import json
import sys
from datetime import datetime
import yfinance as yf
import pandas as pd
import numpy as np
import math

def run_experiment():
    initial_capital = 100000
    risk_free = 0.05
    start_date = "2020-01-01"
    end_date = datetime.today().strftime("%Y-%m-%d")
    benchmark = "NIFTYBEES.NS"

    SLIPPAGE = 0.0005
    STT_SELL = 0.001
    DP_CHARGE = 20

    # Extended Universe
    extended_universe = [
        "MOM50.NS", "CPSEETF.NS", "MID150BEES.NS", "AUTOBEES.NS", 
        "ITBEES.NS", "PHARMABEES.NS", "GOLDBEES.NS", "SILVERBEES.NS", 
        "NIFTYBEES.NS", "BANKBEES.NS", "LIQUIDBEES.NS"
    ]

    print("Downloading historical data...")
    raw_data = yf.download(extended_universe, start=start_date, end=end_date)["Close"]
    raw_data = raw_data.ffill()

    # Precalculate returns
    results = []

    # Let's test configurations
    # Configurations to test:
    # 1. Baseline Sameet: universe=[MOM50, CPSEETF, MID150BEES, LIQUIDBEES], hold=96, w1=0.5, w2=0.5
    # 2. Sameet varying MIN_HOLD_DAYS: [42, 63, 75, 96, 110, 126, 150]
    # 3. Enhanced S1 Lookbacks: (21, 63), (21, 63, 126), (10, 30, 60), Risk-adjusted Sharpe Momentum
    # 4. Strategy 2 Enhancements: 3m momentum, 6m momentum, Gold/Liquidbees parking when negative
    # 5. Dynamic Allocation: 60/40, 70/30, Regime-adaptive (EMA 200 on Nifty)
    # 6. Expanded Universe: Adding AUTOBEES, GOLDBEES, SILVERBEES
    # 7. Volatility Targeting / Trailing Stop

    def evaluate_system(
        universe1, 
        s1_lookback_type, # 'standard', 'triple', 'sharpe'
        min_hold_days, 
        switch_buffer,
        w1, 
        w2, 
        s2_lookback_months, 
        s2_cash_to_gold,
        use_regime_switch=False,
        trailing_stop_pct=None
    ):
        # Slice data
        u1_tickers = [t for t in universe1 if t in raw_data.columns]
        data1 = raw_data[u1_tickers + [benchmark]].dropna(thresh=len(u1_tickers))
        
        if len(data1) < 130:
            return None

        # S1 Momentum calculation
        if s1_lookback_type == 'standard':
            r_short = data1[u1_tickers].pct_change(21)
            r_long = data1[u1_tickers].pct_change(63)
            scores = r_short * 0.4 + r_long * 0.6
            start_bar = 64
        elif s1_lookback_type == 'triple':
            r_s = data1[u1_tickers].pct_change(21)
            r_m = data1[u1_tickers].pct_change(63)
            r_l = data1[u1_tickers].pct_change(126)
            scores = r_s * 0.25 + r_m * 0.45 + r_l * 0.30
            start_bar = 127
        elif s1_lookback_type == 'sharpe':
            r_m = data1[u1_tickers].pct_change(63)
            vol = data1[u1_tickers].pct_change(1).rolling(63).std() * np.sqrt(252)
            scores = r_m / (vol + 1e-4)
            start_bar = 64

        # Regime indicator: Nifty > 200 EMA
        nifty_close = data1[benchmark]
        nifty_ema200 = nifty_close.ewm(span=200, adjust=False).mean()
        regime_bull = (nifty_close > nifty_ema200)

        # Simulation S1
        capital1 = initial_capital * w1
        pos1 = None
        shares1 = 0
        entry_price1 = 0
        entry_date1 = None
        highest_price1 = 0

        trade_log1 = []
        eq1_curve = []
        days_in_mkt = 0

        for i in range(start_bar, len(data1)):
            date = data1.index[i]
            sc = scores.iloc[i - 1].dropna()
            
            if len(sc) == 0:
                eq1_curve.append(capital1)
                continue
                
            best = sc.idxmax()

            if pos1 is not None and pos1 in sc.index:
                if sc[best] < sc[pos1] + switch_buffer:
                    best = pos1

            if "LIQUIDBEES.NS" in sc.index and sc[best] < sc["LIQUIDBEES.NS"]:
                best = "LIQUIDBEES.NS"

            hold_days = (date - entry_date1).days if entry_date1 else 0

            # Trailing stop check
            triggered_ts = False
            if pos1 is not None and pos1 != "LIQUIDBEES.NS" and trailing_stop_pct is not None:
                curr_p = float(data1[pos1].iloc[i])
                highest_price1 = max(highest_price1, curr_p)
                if curr_p < highest_price1 * (1 - trailing_stop_pct):
                    triggered_ts = True

            # Sell S1
            if pos1 is not None and ((best != pos1 and hold_days >= min_hold_days) or triggered_ts):
                sell_raw = float(data1[pos1].iloc[i])
                sell_price = sell_raw * (1 - SLIPPAGE)
                sell_val = shares1 * sell_price
                stt = sell_val * STT_SELL
                total_c = stt + DP_CHARGE
                capital1 += sell_val - total_c

                pnl = (sell_price - entry_price1) * shares1 - total_c
                trade_log1.append({
                    "Date": str(date.date()), "Action": "SELL", "Symbol": pos1,
                    "Price": sell_price, "Shares": shares1, "PnL": pnl, "HoldDays": hold_days
                })
                pos1 = None
                shares1 = 0
                highest_price1 = 0

            # Buy S1
            if pos1 is None and best in data1.columns:
                buy_raw = float(data1[best].iloc[i])
                buy_price = buy_raw * (1 + SLIPPAGE)
                qty = int(capital1 // buy_price)
                if qty > 0:
                    capital1 -= qty * buy_price
                    pos1 = best
                    shares1 = qty
                    entry_price1 = buy_price
                    entry_date1 = date
                    highest_price1 = buy_price
                    trade_log1.append({
                        "Date": str(date.date()), "Action": "BUY", "Symbol": pos1,
                        "Price": buy_price, "Shares": shares1, "PnL": 0.0, "HoldDays": 0
                    })

            if pos1 is not None:
                days_in_mkt += 1
                eq_now = capital1 + shares1 * float(data1[pos1].iloc[i])
            else:
                eq_now = capital1
            eq1_curve.append(float(eq_now))

        df1 = pd.DataFrame({"Equity1": eq1_curve}, index=data1.index[start_bar:])

        # Strategy 2: Monthly Rebalance
        symbols2 = {"NIFTY": "NIFTYBEES.NS", "BANK": "BANKBEES.NS", "GOLD": "GOLDBEES.NS"}
        if "SILVERBEES.NS" in raw_data.columns:
            symbols2["SILVER"] = "SILVERBEES.NS"

        d2 = {}
        for k, v in symbols2.items():
            if v in raw_data.columns:
                d2[k] = raw_data[v]
        p2 = pd.DataFrame(d2).dropna()
        p2_m = p2.resample("ME").last()
        mom2 = p2_m.pct_change(s2_lookback_months)

        capital2 = initial_capital * w2
        shares2 = 0
        curr2 = None
        eq2_curve = []

        start_s2 = s2_lookback_months
        for i in range(start_s2, len(p2_m)):
            row = p2_m.iloc[i]
            m = mom2.iloc[i]
            best2 = m.idxmax()

            if m.max() < 0:
                if s2_cash_to_gold and "GOLD" in row and row["GOLD"] > 0:
                    best2 = "GOLD" if m.get("GOLD", -1) > -0.02 else None
                else:
                    best2 = None

            if best2 != curr2:
                if curr2 is not None and shares2 > 0:
                    capital2 = shares2 * row[curr2] * (1 - SLIPPAGE - STT_SELL) - DP_CHARGE
                    shares2 = 0
                if best2 is not None:
                    buy_p = row[best2] * (1 + SLIPPAGE)
                    shares2 = capital2 / buy_p
                    capital2 = 0
                curr2 = best2

            tot2 = shares2 * row[curr2] if curr2 is not None else capital2
            eq2_curve.append(float(tot2))

        df2 = pd.DataFrame({"Equity2": eq2_curve}, index=p2_m.index[start_s2:])

        # Merge daily
        df1_d = df1.resample("D").ffill()
        df2_d = df2.resample("D").ffill()
        common = df1_d.index.intersection(df2_d.index)

        comb = pd.DataFrame(index=common)
        
        if use_regime_switch:
            # When regime is bull, 70% S1 / 30% S2; when regime is bear, 30% S1 / 70% S2
            # Rebalance daily or weekly is complex, so let's weight based on normal
            comb["Hybrid"] = df1_d.loc[common, "Equity1"] + df2_d.loc[common, "Equity2"]
        else:
            comb["Hybrid"] = df1_d.loc[common, "Equity1"] + df2_d.loc[common, "Equity2"]

        ret = comb["Hybrid"].pct_change().dropna()
        days = (comb.index[-1] - comb.index[0]).days
        years = days / 365.25
        if years <= 0: return None

        final_cap = comb["Hybrid"].iloc[-1]
        cagr = ((final_cap / initial_capital) ** (1 / years) - 1) * 100
        peak = comb["Hybrid"].cummax()
        dd = comb["Hybrid"] / peak - 1
        mdd = dd.min() * 100
        calmar = abs(cagr / mdd) if mdd != 0 else 0

        sharpe = 0
        if ret.std() != 0:
            sharpe = (ret.mean() * 252 - risk_free) / (ret.std() * np.sqrt(252))

        # Win rate & Trade analytics S1
        tdf = pd.DataFrame(trade_log1)
        sells = tdf[tdf["Action"] == "SELL"] if not tdf.empty else pd.DataFrame()
        if not sells.empty:
            wins = sells[sells["PnL"] > 0]
            losses = sells[sells["PnL"] < 0]
            wr = (len(wins) / len(sells)) * 100
            gp = wins["PnL"].sum() if not wins.empty else 0
            gl = abs(losses["PnL"].sum()) if not losses.empty else 1e-4
            pf = gp / gl
            avg_w = wins["PnL"].mean() if not wins.empty else 0
            avg_l = losses["PnL"].mean() if not losses.empty else 0
        else:
            wr, pf, avg_w, avg_l = 0, 0, 0, 0

        # Yearly returns
        yr = comb["Hybrid"].resample("YE").last().pct_change() * 100
        yr.index = yr.index.year
        yearly_dict = yr.dropna().round(2).to_dict()

        return {
            "cagr": round(cagr, 2),
            "max_dd": round(mdd, 2),
            "calmar": round(calmar, 2),
            "sharpe": round(sharpe, 2),
            "final_capital": round(final_cap, 2),
            "win_rate": round(wr, 1),
            "profit_factor": round(pf, 2),
            "total_trades": len(trade_log1),
            "closed_trades": len(sells),
            "yearly_returns": yearly_dict
        }

    # Grid search
    base_u = ["MOM50.NS", "CPSEETF.NS", "MID150BEES.NS", "LIQUIDBEES.NS"]
    elite_u = ["MOM50.NS", "CPSEETF.NS", "MID150BEES.NS", "AUTOBEES.NS", "GOLDBEES.NS", "LIQUIDBEES.NS"]
    expanded_u = ["MOM50.NS", "CPSEETF.NS", "MID150BEES.NS", "AUTOBEES.NS", "ITBEES.NS", "PHARMABEES.NS", "GOLDBEES.NS", "SILVERBEES.NS", "LIQUIDBEES.NS"]

    configs = []

    # 1. Baseline
    configs.append({
        "name": "Sameet Baseline (96 Hold, 50/50)",
        "u1": base_u, "lookback": "standard", "hold": 96, "buff": 0.02,
        "w1": 0.5, "w2": 0.5, "s2_m": 6, "s2_gold": False, "ts": None
    })

    # 2. Hold days variation on base
    for h in [42, 63, 75, 96, 110, 126]:
        configs.append({
            "name": f"Base + Hold {h}d",
            "u1": base_u, "lookback": "standard", "hold": h, "buff": 0.02,
            "w1": 0.5, "w2": 0.5, "s2_m": 6, "s2_gold": False, "ts": None
        })

    # 3. Triple Momentum on Base
    for h in [63, 75, 96, 110]:
        configs.append({
            "name": f"Base + Triple Lookback + Hold {h}d",
            "u1": base_u, "lookback": "triple", "hold": h, "buff": 0.02,
            "w1": 0.5, "w2": 0.5, "s2_m": 6, "s2_gold": False, "ts": None
        })

    # 4. Weighting shifts (60/40, 70/30)
    for w in [(0.6, 0.4), (0.7, 0.3), (0.75, 0.25)]:
        configs.append({
            "name": f"Base + Alloc S1:{int(w[0]*100)}/S2:{int(w[1]*100)}",
            "u1": base_u, "lookback": "standard", "hold": 96, "buff": 0.02,
            "w1": w[0], "w2": w[1], "s2_m": 6, "s2_gold": False, "ts": None
        })

    # 5. Elite Universe (adding AUTOBEES & GOLDBEES)
    for h in [63, 75, 96, 110]:
        for w in [(0.5, 0.5), (0.6, 0.4), (0.7, 0.3)]:
            configs.append({
                "name": f"Elite Universe + Hold {h}d + S1:{int(w[0]*100)}",
                "u1": elite_u, "lookback": "standard", "hold": h, "buff": 0.02,
                "w1": w[0], "w2": w[1], "s2_m": 6, "s2_gold": True, "ts": None
            })
            configs.append({
                "name": f"Elite Universe + Triple Lookback + Hold {h}d + S1:{int(w[0]*100)}",
                "u1": elite_u, "lookback": "triple", "hold": h, "buff": 0.02,
                "w1": w[0], "w2": w[1], "s2_m": 6, "s2_gold": True, "ts": None
            })

    # 6. Trailing Stop Protection
    for ts in [0.08, 0.10, 0.12]:
        configs.append({
            "name": f"Elite Universe + TrailingStop {int(ts*100)}% + Hold 96d",
            "u1": elite_u, "lookback": "triple", "hold": 96, "buff": 0.02,
            "w1": 0.65, "w2": 0.35, "s2_m": 6, "s2_gold": True, "ts": ts
        })

    all_res = []
    print(f"Running grid test across {len(configs)} configurations...")
    for c in configs:
        res = evaluate_system(
            universe1=c["u1"],
            s1_lookback_type=c["lookback"],
            min_hold_days=c["hold"],
            switch_buffer=c["buff"],
            w1=c["w1"],
            w2=c["w2"],
            s2_lookback_months=c["s2_m"],
            s2_cash_to_gold=c["s2_gold"],
            trailing_stop_pct=c["ts"]
        )
        if res:
            res["name"] = c["name"]
            res["config"] = c
            all_res.append(res)

    # Sort by Calmar
    all_res.sort(key=lambda x: x["calmar"], reverse=True)

    with open("c:/Users/samee/Desktop/Pine/quant_sector_etf/data/beat_sameet_results.json", "w") as f:
        json.dump(all_res, f, indent=2)

    print("\n=== TOP 10 STRATEGIES BY CALMAR RATIO ===")
    for idx, r in enumerate(all_res[:10]):
        print(f"#{idx+1}: {r['name']}")
        print(f"   CAGR: {r['cagr']}% | MaxDD: {r['max_dd']}% | Calmar: {r['calmar']} | Sharpe: {r['sharpe']} | WR: {r['win_rate']}% | PF: {r['profit_factor']} | Final Cap: ${r['final_capital']}")

if __name__ == "__main__":
    run_experiment()
