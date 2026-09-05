#!/usr/bin/env python3
"""Run issue lease regressions with kernel ownership coverage."""
import ast
import dis
import json
from pathlib import Path
import runpy
import sys
import trace
import types

ROOT = Path(__file__).resolve().parents[3]
SUITE = ROOT / "scripts/symphony/tests/symphony-codex-auth-fallback.test.py"
TARGETS = {
    "symphony-codex-exhausted.py": {"_fallback_lock_count", "_inherited_issue_lease_held", "expire_fallback_lock_decision", "gc_fallback_locks"},
}


def lines(code):
    result = {line for _, line in dis.findlinestarts(code) if line > 0}
    for child in code.co_consts:
        if isinstance(child, types.CodeType):
            result.update(lines(child))
    return result


sys.path.insert(0, str(SUITE.parent))
sys.argv = [str(SUITE), "FallbackLockGcTests"]
tracer = trace.Trace(count=True, trace=False)
status = 0
try:
    tracer.runfunc(runpy.run_path, str(SUITE), run_name="__main__")
except SystemExit as exc:
    status = int(exc.code or 0)
provider_suite = SUITE.parent / "symphony-agent-router.test.py"
sys.argv = [str(provider_suite)]
try:
    tracer.runfunc(runpy.run_path, str(provider_suite), run_name="__main__")
except SystemExit as exc:
    status = status or int(exc.code or 0)
counts = tracer.results().counts
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
