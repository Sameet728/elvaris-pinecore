"""
PyneCore execution runner (by PyneSys)
Runs Pine Script / Pyne logic using the official pynesys-pynecore engine.
Repo: https://github.com/PyneSys/pynecore
"""

import os
import sys
import json
import re
import subprocess
from pathlib import Path

# Ensure UTF-8 output on Windows
os.environ["PYTHONIOENCODING"] = "utf-8"

COMMON_HEADER = """from pynecore import Series
from pynecore.lib import script, input, color, ta, na, nz, bar_index, close, open, high, low, volume, hl2, hlc3, hlcc4
from pynecore.lib.plot import plot
true = True
false = False
null = None
"""


def convert_pine_to_pyne(pine_src: str, title: str = "Pine Indicator") -> str:
    """
    Transforms standard Pine Script syntax into a valid PyneCore Python script
    with @pyne and @script.indicator.
    """
    lines = pine_src.strip().splitlines()
    body = []
    has_plots = False

    # Detect title
    title_match = re.search(r'indicator\(\s*["\']([^"\']+)["\']', pine_src)
    if title_match:
        title = title_match.group(1)

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("//") or stripped.startswith("@"):
            continue

        # Handle plot(...)
        if stripped.startswith("plot("):
            has_plots = True
            py_plot = stripped.replace("color=", "color=color.").replace("color=color.color.", "color=color.")
            py_plot = re.sub(r'\boverlay\s*=\s*true\b', 'overlay=True', py_plot)
            py_plot = re.sub(r'\boverlay\s*=\s*false\b', 'overlay=False', py_plot)
            body.append(f"    {py_plot}")
            continue

        # Convert ta.ema, ta.sma, ta.rsi, ta.atr
        py_line = stripped
        py_line = py_line.replace(":=", "=")
        py_line = re.sub(r'\btrue\b', 'True', py_line)
        py_line = re.sub(r'\bfalse\b', 'False', py_line)
        py_line = re.sub(r'input\.int\(([^,]+)[^)]*\)', r'\1', py_line)
        py_line = re.sub(r'input\.float\(([^,]+)[^)]*\)', r'\1', py_line)
        py_line = re.sub(r'input\.bool\(([^,]+)[^)]*\)', r'\1', py_line)
        
        body.append(f"    {py_line}")

    if not has_plots:
        body.append("    plot(ta.ema(close, 20), title='EMA 20', color=color.orange)")

    py_code = f'''\"\"\"
@pyne
Generated PyneCore Indicator: {title}
\"\"\"
{COMMON_HEADER}

@script.indicator(title="{title}", overlay=True)
def main():
{chr(10).join(body)}
'''
    return py_code


def main():
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Usage: python pyne_runner.py <script_file> <data_file> <out_dir>"}))
        sys.exit(1)

    script_file = Path(sys.argv[1])
    data_file = Path(sys.argv[2])
    out_dir = Path(sys.argv[3])
    out_dir.mkdir(parents=True, exist_ok=True)

    with open(script_file, "r", encoding="utf-8") as f:
        src = f.read()

    work_py_path = out_dir / "indicator.py"
    if "@pyne" in src:
        src_clean = re.sub(r'\boverlay\s*=\s*true\b', 'overlay=True', src)
        src_clean = re.sub(r'\boverlay\s*=\s*false\b', 'overlay=False', src_clean)
        # Ensure @pyne is at line 1
        if not src_clean.strip().startswith('"""\n@pyne') and not src_clean.strip().startswith("'''\n@pyne"):
            src_clean = f'"""\n@pyne\n"""\n{COMMON_HEADER}\n{src_clean}'
        with open(work_py_path, "w", encoding="utf-8") as f:
            f.write(src_clean)
    else:
        pyne_code = convert_pine_to_pyne(src)
        with open(work_py_path, "w", encoding="utf-8") as f:
            f.write(pyne_code)



    # Output CSV path
    plot_csv = out_dir / "plots.csv"

    # Invoke pyne run
    # pyne run <script.py> <data.csv> --plot <plot_csv>
    cmd = [
        "pyne", "run",
        str(work_py_path),
        str(data_file),
        "--plot", str(plot_csv)
    ]

    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            timeout=30,
            env={**os.environ, "PYTHONIOENCODING": "utf-8"}
        )

        if not plot_csv.exists() or plot_csv.stat().st_size == 0:
            # Fallback output search
            def_csv = out_dir / "indicator.csv"
            if def_csv.exists():
                plot_csv = def_csv

        if plot_csv.exists():
            print(json.dumps({
                "success": True,
                "plot_csv": str(plot_csv),
                "stdout": proc.stdout[:300]
            }))
        else:
            print(json.dumps({
                "success": False,
                "error": proc.stderr or proc.stdout or "PyneCore did not output plot CSV",
                "cmd": " ".join(cmd)
            }))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    main()
