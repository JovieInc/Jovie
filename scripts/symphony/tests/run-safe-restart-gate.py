#!/usr/bin/env python3
"""Measure embedded Python checks and execute Linux restart boundary tests."""
import dis
import json
from pathlib import Path
import runpy
import shutil
import sys
import trace
root=Path(__file__).resolve().parents[3]
helper=root/'scripts/symphony/symphony-elixir-safe-restart'
suite=root/'scripts/symphony/tests/symphony-safe-restart.test.py'
if not shutil.which('flock'):raise SystemExit('safe restart gate requires real flock')
scopes = {}
for marker, suffix in [('GUARD_PY', 'stop_guard'), ('PROCESS_REFS_PY', 'process_refs')]:
    source = helper.read_text().split("<<'" + marker + "'\n", 1)[1].split('\n' + marker, 1)[0]
    filename = str(helper) + ':' + suffix
    scopes[filename] = {line for _, line in dis.findlinestarts(compile(source, filename, 'exec')) if line > 0}
tracer=trace.Trace(count=True,trace=False)
sys.argv=[str(suite)]
status=0
try:tracer.runfunc(runpy.run_path,str(suite),run_name='__main__')
except SystemExit as exc:status=int(exc.code or 0)
failed = False
for filename, expected in scopes.items():
    executed = {line for (file, line), count in tracer.results().counts.items() if file == filename and count}
    missing = expected - executed
    coverage = (len(expected) - len(missing)) / len(expected)
    print(json.dumps({'scope': filename.rsplit(':', 1)[1], 'executed': len(expected) - len(missing),
                      'statements': len(expected), 'missing': sorted(missing), 'coverage': coverage}))
    failed = failed or coverage < 0.90
raise SystemExit(status or failed)
