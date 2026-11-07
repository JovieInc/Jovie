"""Python entry point for the System-1 router (scripts/system1.mjs).

    from system1 import call, label
    r = call("backlog-readiness", state_text, key="JOV-123")
    if r["decision"] == "ready": ...
    label("backlog-readiness", "JOV-123", "ready", source="lane-merged")

Never raises on a provider failure: a failed call returns status "error" with a
null decision and the caller keeps its existing path. The ledger is the same JSONL
the Node callers write (JOVIE_SYSTEM1_STATE, else <lanes state>/system1).
"""
import json
import os
import subprocess
from pathlib import Path

_CLI = Path(__file__).resolve().parents[1] / "system1.mjs"


def _run(args, stdin=None, timeout=60):
    proc = subprocess.run(
        ["node", str(_CLI), *args],
        input=stdin,
        capture_output=True,
        text=True,
        timeout=timeout,
        env=os.environ,
    )
    return proc


def call(task, state, key=None, caller="lanes", shadow=False, timeout=60):
    args = ["call", "--task", task, "--caller", caller]
    if key:
        args += ["--key", key]
    if shadow:
        args += ["--shadow"]
    try:
        proc = _run(args, stdin=state, timeout=timeout)
        return json.loads(proc.stdout)
    except (subprocess.TimeoutExpired, json.JSONDecodeError, OSError) as exc:
        return {"status": "error", "decision": None, "abstained": True, "errors": [str(exc)[:160]]}


def label(task, key, label_value, source, evidence=None):
    args = ["label", "--task", task, "--key", key, "--label", label_value, "--source", source]
    if evidence:
        args += ["--evidence", evidence]
    return json.loads(_run(args).stdout)
