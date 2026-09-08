#!/usr/bin/env python3
"""Run the existing runtime CI selector with parent and subprocess line coverage."""
import ast
import dis
import json
import os
import tempfile
from pathlib import Path
import runpy
import sys
import trace
import types

ROOT = Path(__file__).resolve().parents[3]
SUITE = ROOT / "scripts/symphony/tests/symphony-burrito-workflow.test.py"
TARGETS = {
    "symphony_official_runtime.py": {"run_official_binary_once", "read_dispatch_admission", "_closure_snapshot_verdict"},
}


def lines(code):
    result = {line for _, line in dis.findlinestarts(code) if line > 0}
    for child in code.co_consts:
        if isinstance(child, types.CodeType):
            result.update(lines(child))
    return result


sys.path.insert(0, str(SUITE.parent))
sys.argv = [str(SUITE)]
child_coverage = tempfile.TemporaryDirectory(prefix="symphony-runtime-coverage-")
os.environ["SYMPHONY_RUNTIME_COVERAGE_DIR"] = child_coverage.name
tracer = trace.Trace(count=True, trace=False)
status = 0
try:
    tracer.runfunc(runpy.run_path, str(SUITE), run_name="__main__")
except SystemExit as exc:
    status = int(exc.code or 0)
counts = tracer.results().counts
for receipt in Path(child_coverage.name).glob("*.json"):
    for file, line, count in json.loads(receipt.read_text()):
        counts[file, line] = counts.get((file, line), 0) + count
child_coverage.cleanup()
os.environ.pop("SYMPHONY_RUNTIME_COVERAGE_DIR", None)
report = {}
for name, selected in TARGETS.items():
    path = ROOT / "scripts/symphony" / name
    source = path.read_text()
    executable = lines(compile(source, str(path), "exec"))
    tree = ast.parse(source)
    if selected:
        scope = set()
        found = set()
        for node in tree.body:
            if isinstance(node, ast.FunctionDef) and node.name in selected:
                found.add(node.name)
                scope.update(range(node.lineno, node.end_lineno + 1))
        if found != selected:
            raise RuntimeError(f"Missing coverage targets: {selected - found}")
        executable &= scope
    executed = {line for (file, line), count in counts.items() if file == str(path) and count}
    missing = sorted(executable - executed)
    percent = 100 * (len(executable) - len(missing)) / len(executable)
    report[name] = {"percent": round(percent, 2), "executed": len(executable) - len(missing), "statements": len(executable), "missing": missing}
    if percent < 95:
        status = 1
print(json.dumps({"selector": str(SUITE.relative_to(ROOT)), "coverage": report}, indent=2))
raise SystemExit(status)
