#!/usr/bin/env python3
"""Measure the actual atomic guard writer and execute Linux restart boundary tests."""
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
source=helper.read_text().split("<<'GUARD_PY'\n",1)[1].split('\nGUARD_PY',1)[0]
filename=str(helper)+':stop_guard'
expected={line for _,line in dis.findlinestarts(compile(source,filename,'exec')) if line>0}
tracer=trace.Trace(count=True,trace=False)
sys.argv=[str(suite)]
status=0
try:tracer.runfunc(runpy.run_path,str(suite),run_name='__main__')
except SystemExit as exc:status=int(exc.code or 0)
executed={line for (file,line),count in tracer.results().counts.items() if file==filename and count}
missing=expected-executed
coverage=(len(expected)-len(missing))/len(expected)
print(json.dumps({'scope':'atomic stop guard writer','executed':len(expected)-len(missing),'statements':len(expected),'missing':sorted(missing),'coverage':coverage}))
raise SystemExit(status or (coverage<0.90))
