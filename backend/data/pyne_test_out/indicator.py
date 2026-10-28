"""
@pyne
Generated PyneCore Indicator: Pine Indicator
"""
from pynecore import Series
from pynecore.lib import script, input, plot, color, ta, na, nz, bar_index, close, open, high, low, volume, hl2, hlc3, hlcc4
true = True
false = False
null = None


@script.indicator(title="Pine Indicator", overlay=True)
def main():
    len = 14
    src = close
    mySma = sma(src, len)
    plot(mySma, color=color.red)
