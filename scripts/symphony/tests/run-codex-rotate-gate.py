#!/usr/bin/env python3
"""Exercise account selection and existing launcher leases with measured coverage."""
import ast
import dis
import json
from pathlib import Path
import runpy
import shutil
import sys
import trace

ROOT = Path(__file__).resolve().parents[3]
launcher = ROOT / "scripts/symphony/codex-rotate"
suite = ROOT / "scripts/symphony/tests/codex-rotate.test.py"
if not shutil.which("flock"):
    raise SystemExit("codex-rotate gate requires real flock; skipped launcher tests are not proof")
source = launcher.read_text().split("python3 - <<'PY'\n", 1)[1].split("\nPY", 1)[0]
filename = str(launcher) + ":account_order"
node = next(node for node in ast.parse(source).body if isinstance(node, ast.FunctionDef) and node.name == "codex_account")
code = next(value for value in compile(source, filename, "exec").co_consts if hasattr(value, "co_name") and value.co_name == "codex_account")
expected = {line for _, line in dis.findlinestarts(code) if node.lineno < line <= node.end_lineno}
tracer = trace.Trace(count=True, trace=False)
sys.argv = [str(suite)]
status = 0
try:
    tracer.runfunc(runpy.run_path, str(suite), run_name="__main__")
except SystemExit as exc:
    status = int(exc.code or 0)
executed = {line for (file, line), count in tracer.results().counts.items() if file == filename and count}
missing = sorted(expected - executed)
print(json.dumps({"selector": str(suite.relative_to(ROOT)), "account_filter": {"executed": len(expected - set(missing)), "statements": len(expected), "missing": missing}}, indent=2))
raise SystemExit(status or bool(missing))
