#!/usr/bin/env python3
"""Run frozen generation transition regressions with source coverage."""

import ast
import dis
import json
from pathlib import Path
import runpy
import sys
import trace
import types


ROOT = Path(__file__).resolve().parents[3]
SUITE = ROOT / "scripts/symphony/tests/frozen-generation-transition.test.py"
TARGET = ROOT / "scripts/symphony/symphony-frozen-generation-transition"
SELECTED = {
    "verify_provider_generation",
    "workspace_snapshot",
    "cgroup_pids",
    "kill_frozen_cgroup",
    "process_snapshot",
    "atomic_install",
    "frozen_service_snapshot",
    "transition",
}


def executable_lines(code):
    result = {line for _, line in dis.findlinestarts(code) if line > 0}
    for child in code.co_consts:
        if isinstance(child, types.CodeType):
            result.update(executable_lines(child))
    return result


sys.path.insert(0, str(SUITE.parent))
sys.argv = [str(SUITE)]
tracer = trace.Trace(count=True, trace=False)
status = 0
try:
    tracer.runfunc(runpy.run_path, str(SUITE), run_name="__main__")
except SystemExit as exc:
    status = int(exc.code or 0)

tree = ast.parse(TARGET.read_text())
scope = set()
found = set()
for node in tree.body:
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in SELECTED:
        found.add(node.name)
        scope.update(range(node.lineno, node.end_lineno + 1))
if found != SELECTED:
    raise RuntimeError(f"missing coverage targets: {SELECTED - found}")
executable = executable_lines(compile(TARGET.read_text(), str(TARGET), "exec")) & scope
counts = tracer.results().counts
executed = {line for (path, line), count in counts.items() if path == str(TARGET) and count}
missing = sorted(executable - executed)
percent = 100 * (len(executable) - len(missing)) / len(executable)
report = {"selector": str(SUITE.relative_to(ROOT)), "coverage": {"target": str(TARGET.relative_to(ROOT)), "percent": round(percent, 2), "executed": len(executable) - len(missing), "statements": len(executable), "missing": missing}}
print(json.dumps(report, indent=2))
if percent < 90:
    status = 1
raise SystemExit(status)
