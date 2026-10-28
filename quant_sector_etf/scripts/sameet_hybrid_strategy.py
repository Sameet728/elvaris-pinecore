# ==========================================
# SAMEET HYBRID ETF STRATEGY — FINAL PRO API
# (CORE LOGIC PRESERVED + ANALYTICS ADDED)
# ==========================================

import json
import sys
from datetime import datetime
import yfinance as yf
import pandas as pd
import numpy as np
import math


# =====================================================
# JSON CLEANER
# =====================================================
def clean_for_json(obj):
    if isinstance(obj, dict):
        return {k: clean_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_for_json(v) for v in obj]
    elif isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    else:
        return obj


# =====================================================
# MAIN STRATEGY
# =====================================================
def run_strategy(MIN_HOLD_DAYS=96):

    # ================================
    # SETTINGS (UNCHANGED)
    # ================================
    initial_capital = 100000
    risk_free = 0.05
    SWITCH_BUFFER = 0.02

    w1 = 0.5
    w2 = 0.5

    start_date = "2020-01-01"
    end_date = datetime.today().strftime("%Y-%m-%d")
    benchmark = "NIFTYBEES.NS"

    SLIPPAGE = 0.0005
    STT_SELL = 0.001
    DP_CHARGE = 20

    # =====================================================
    # 🔹 STRATEGY 1 — DAILY MOMENTUM
    # =====================================================
    tickers1 = ["MOM50.NS", "CPSEETF.NS", "MID150BEES.NS", "LIQUIDBEES.NS"]

    data1 = yf.download(tickers1 + [benchmark], start=start_date, end=end_date)["Close"]
    data1 = data1.ffill().dropna(thresh=len(tickers1))

    if len(data1) < 70:
        return {"error": "Not enough data"}

    ret_short = data1[tickers1].pct_change(21)
    ret_long = data1[tickers1].pct_change(63)
    scores = ret_short * 0.4 + ret_long * 0.6

    capital = initial_capital * w1
    position = None
    shares = 0
    entry_price = 0
    entry_date = None

    trade_log = []
    equity1_curve = []
    days_in_market = 0

    for i in range(64, len(data1)):

        date = data1.index[i]
        sc = scores.iloc[i - 1].dropna()

        if len(sc) == 0:
            equity1_curve.append(capital)
            continue

        best = sc.idxmax()

        if position is not None and position in sc.index:
            if sc[best] < sc[position] + SWITCH_BUFFER:
                best = position

        if "LIQUIDBEES.NS" in sc.index and sc[best] < sc["LIQUIDBEES.NS"]:
            best = "LIQUIDBEES.NS"

        holding_days_now = (date - entry_date).days if entry_date else 0

        # ===== SELL =====
        if (
            position is not None
            and best != position
            and holding_days_now >= MIN_HOLD_DAYS
        ):
            sell_raw = float(data1[position].iloc[i])
            sell_price = sell_raw * (1 - SLIPPAGE)

            sell_value = shares * sell_price
            stt = sell_value * STT_SELL
            total_cost = stt + DP_CHARGE

            capital += sell_value - total_cost

            pnl = (sell_price - entry_price) * shares - total_cost
            holding_days = (date - entry_date).days

            trade_log.append(
                {
                    "Date": str(date.date()),
                    "Action": "SELL",
                    "Symbol": position,
                    "Price": float(sell_price),
                    "Shares": int(shares),
                    "PnL": float(pnl),
                    "Holding Days": int(holding_days),
                }
            )

            position = None
            shares = 0

        # ===== BUY =====
        if position is None and best in data1.columns:
            buy_raw = float(data1[best].iloc[i])
            buy_price = buy_raw * (1 + SLIPPAGE)

            qty = int(capital // buy_price)

            if qty > 0:
                capital -= qty * buy_price
                position = best
                shares = qty
                entry_price = buy_price
                entry_date = date

                trade_log.append(
                    {
                        "Date": str(date.date()),
                        "Action": "BUY",
                        "Symbol": position,
                        "Price": float(buy_price),
                        "Shares": int(shares),
                        "PnL": 0.0,
                        "Holding Days": 0,
                    }
                )

        if position is not None:
            days_in_market += 1
            equity_now = capital + shares * float(data1[position].iloc[i])
        else:
            equity_now = capital

        equity1_curve.append(float(equity_now))

    df1 = pd.DataFrame({"Equity1": equity1_curve}, index=data1.index[64:])

    # =====================================================
    # 🔹 STRATEGY 2 — MONTHLY
    # =====================================================
    symbols2 = {
        "NIFTY": "NIFTYBEES.NS",
        "BANK": "BANKBEES.NS",
        "GOLD": "GOLDBEES.NS",
    }

    data2 = {}
    for k, v in symbols2.items():
        d = yf.download(v, start=start_date, end=end_date)
        if isinstance(d.columns, pd.MultiIndex):
            d.columns = d.columns.get_level_values(0)
        data2[k] = d["Close"]

    prices = pd.DataFrame(data2).dropna()
    prices_m = prices.resample("ME").last()
    mom = prices_m.pct_change(6)

    capital2 = initial_capital * w2
    shares2 = 0
    current = None
    eq2 = []
    last_trade_s2 = None

    for i in range(6, len(prices_m)):
        row = prices_m.iloc[i]
        m = mom.iloc[i]

        best = m.idxmax()
        if m.max() < 0:
            best = None

        if best != current:

            if current is not None and shares2 > 0:
                capital2 = shares2 * row[current]
                shares2 = 0
                last_trade_s2 = {
                    "Date": str(prices_m.index[i].date()),
                    "Action": "SELL",
                    "Symbol": current,
                    "Price": float(row[current]),
                }

            if best is not None:
                shares2 = capital2 / row[best]
                capital2 = 0
                last_trade_s2 = {
                    "Date": str(prices_m.index[i].date()),
                    "Action": "BUY",
                    "Symbol": best,
                    "Price": float(row[best]),
                }

            current = best

        total = shares2 * row[current] if current is not None else capital2
        eq2.append(float(total))

    df2 = pd.DataFrame({"Equity2": eq2}, index=prices_m.index[6:])

    # =====================================================
    # MERGE
    # =====================================================
    df1_daily = df1.resample("D").ffill()
    df2_daily = df2.resample("D").ffill()

    common_index = df1_daily.index.intersection(df2_daily.index)

    combined = pd.DataFrame(index=common_index)
    combined["Hybrid"] = (
        df1_daily.loc[common_index, "Equity1"]
        + df2_daily.loc[common_index, "Equity2"]
    )

    # =====================================================
    # METRICS
    # =====================================================
    returns = combined["Hybrid"].pct_change().dropna()

    days = (combined.index[-1] - combined.index[0]).days
    years = days / 365

    cagr = ((combined["Hybrid"].iloc[-1] / initial_capital) ** (1 / years) - 1) * 100

    peak = combined["Hybrid"].cummax()
    dd = combined["Hybrid"] / peak - 1
    mdd = dd.min() * 100

    sharpe = 0
    if returns.std() != 0:
        sharpe = (returns.mean() * 252 - risk_free) / (
            returns.std() * np.sqrt(252)
        )

    # =====================================================
    # 🔥 TRADE ANALYTICS (ADDED — SAFE)
    # =====================================================
    trades_df = pd.DataFrame(trade_log)
    sell_trades = trades_df[trades_df["Action"] == "SELL"]

    if not sell_trades.empty:
        wins = sell_trades[sell_trades["PnL"] > 0]
        losses = sell_trades[sell_trades["PnL"] < 0]

        win_rate = (len(wins) / len(sell_trades)) * 100

        gross_profit = wins["PnL"].sum() if not wins.empty else 0
        gross_loss = losses["PnL"].sum() if not losses.empty else 0

        profit_factor = abs(gross_profit / gross_loss) if gross_loss != 0 else None
        avg_win = wins["PnL"].mean() if not wins.empty else 0
        avg_loss = losses["PnL"].mean() if not losses.empty else 0
    else:
        win_rate = 0
        profit_factor = None
        avg_win = 0
        avg_loss = 0

    exposure_pct = (days_in_market / len(data1)) * 100

    # =====================================================
    # RETURNS TABLES (FIXED)
    # =====================================================
    yearly_returns = (
        combined["Hybrid"].resample("YE").last().pct_change() * 100
    )
    yearly_returns.index = yearly_returns.index.year
    yearly_returns_dict = yearly_returns.dropna().round(2).to_dict()

    monthly_returns = (
        combined["Hybrid"].resample("ME").last().pct_change() * 100
    )

    monthly_df = monthly_returns.to_frame("Return")
    monthly_df["Year"] = monthly_df.index.year
    monthly_df["Month"] = monthly_df.index.month

    monthly_heatmap = monthly_df.pivot(
        index="Year", columns="Month", values="Return"
    ).round(2)

    monthly_dict = monthly_heatmap.where(pd.notna(monthly_heatmap), None).to_dict()

    # =====================================================
    # FINAL JSON
    # =====================================================
    return {
        "MIN_HOLD_DAYS": int(MIN_HOLD_DAYS),
        "final_capital": float(combined["Hybrid"].iloc[-1]),
        "CAGR": float(cagr),
        "MaxDD": float(mdd),
        "Sharpe": float(sharpe),
        "total_trades": int(len(trade_log)),
        "win_rate": float(win_rate),
        "profit_factor": None if profit_factor is None else float(profit_factor),
        "avg_win": float(avg_win),
        "avg_loss": float(avg_loss),
        "exposure_pct": float(exposure_pct),
        "last_signal_strategy1": position,
        "last_signal_strategy2": current,
        "date_of_last_trade": str(trade_log[-1]["Date"]) if trade_log else None,
        "today": str(datetime.today().date()),
        "new_trade_generated": False,
        "new_trade": None,
        "last_trade_strategy1": trade_log[-1] if trade_log else None,
        "last_trade_strategy2": last_trade_s2,
        "yearly_returns": yearly_returns_dict,
        # "monthly_returns": monthly_dict,
        # "trade_log": trade_log,
    }


# =====================================================
# CLI ENTRY
# =====================================================
if __name__ == "__main__":
    try:
        hold_days = int(sys.argv[1]) if len(sys.argv) > 1 else 96
        result = run_strategy(hold_days)
        cleaned = clean_for_json(result)
        print(json.dumps(cleaned, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
