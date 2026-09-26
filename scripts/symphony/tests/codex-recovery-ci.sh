#!/usr/bin/env bash
# Codex account recovery and lease boundary gates.
#
# Each gate is an independent process with its own tempdir/HOME fixtures, and
# the suites are dominated by real subprocess timeouts, so they run with
# bounded concurrency (CODEX_RECOVERY_CI_JOBS, default: CPU count). Output is
# buffered per gate and printed in declaration order. The first failing gate
# stops new launches, in-flight gates finish, and the step exits non-zero.
set -euo pipefail

exec python3 - <<'PY'
import os
import subprocess
import sys
import tempfile
import time

# Longest-running gates first so the bounded pool packs well.
GATES = [
    "scripts/symphony/tests/run-codex-rotate-gate.py",
    "scripts/symphony/tests/codex-account-probe.test.py",
    "scripts/symphony/tests/run-issue-lease-gate.py",
    "scripts/symphony/tests/run-lease-gate.py",
    "scripts/symphony/tests/run-provider-promotion-gate.py",
    "scripts/symphony/tests/run-safe-restart-gate.py",
    "scripts/symphony/tests/run-frozen-generation-transition-gate.py",
    "scripts/symphony/tests/run-model-state-gate.py",
    "scripts/symphony/tests/run-priority-proof-gate.py",
    "scripts/symphony/tests/run-reconciler-gate.py",
    "scripts/symphony/tests/run-pr-discovery-gate.py",
]

raw_jobs = os.environ.get("CODEX_RECOVERY_CI_JOBS") or str(os.cpu_count() or 2)
if not raw_jobs.isdigit() or int(raw_jobs) < 1:
    print(f"invalid CODEX_RECOVERY_CI_JOBS: {raw_jobs}", file=sys.stderr)
    raise SystemExit(2)
jobs = int(raw_jobs)

status = {}
running = {}
failed = False
started = time.monotonic()
with tempfile.TemporaryDirectory() as logs:
    try:
        pending = list(enumerate(GATES))
        while pending or running:
            while pending and not failed and len(running) < jobs:
                index, gate = pending.pop(0)
                log = open(os.path.join(logs, f"{index}.log"), "w+b")
                process = subprocess.Popen(
                    ["python3", gate], stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT
                )
                running[index] = (process, log, time.monotonic())
            if failed:
                pending = []
            for index, (process, log, begun) in list(running.items()):
                code = process.poll()
                if code is None:
                    continue
                status[index] = (code, time.monotonic() - begun)
                log.close()
                del running[index]
                failed = failed or code != 0
            if running:
                time.sleep(0.05)
    finally:
        for process, log, _ in running.values():
            process.kill()
            process.wait()
            log.close()

    for index, gate in enumerate(GATES):
        if index not in status:
            continue
        code, elapsed = status[index]
        print(f"::group::{gate} (exit {code}, {elapsed:.1f}s)", flush=True)
        with open(os.path.join(logs, f"{index}.log"), "rb") as log:
            sys.stdout.buffer.write(log.read())
        sys.stdout.flush()
        print("::endgroup::", flush=True)

exit_code = 0
for index, gate in enumerate(GATES):
    if index not in status:
        print(f"NOT RUN (earlier gate failed): {gate}", file=sys.stderr)
    elif status[index][0] != 0:
        print(f"FAILED (exit {status[index][0]}): {gate}", file=sys.stderr)
        exit_code = exit_code or (status[index][0] if status[index][0] > 0 else 1)
print(f"codex recovery gates: {len(status)}/{len(GATES)} ran with jobs={jobs} in {time.monotonic() - started:.1f}s")
raise SystemExit(exit_code)
PY
