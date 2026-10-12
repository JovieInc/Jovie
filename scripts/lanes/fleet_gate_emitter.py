#!/usr/bin/env python3
"""The canonical Gem fleet-gate receipt (`jovie-fleet-gate/v1`, gem-workspace latest.json),
emitted from the lanes dispatch tick when its inputs change (JOV-INV-042 admission debt: this
replaces fleet-gate-refresh.yml's */5 cron, whose only job between pushes was keeping
`observedAt` inside consumers' 10-minute window).

Event-driven, no clock and no GitHub polling of its own: the input key hashes only state the
tick already holds locally. That state is main's head from the update step's fetch, the shared
open-PR cache, the gate's local integrity/concurrency evidence, the previous receipt's verdict,
and the installed release (a new release replays the receipt once). An unchanged key does
nothing. A changed key runs the exact-main gate code shipped with this release
(scripts/fleet-gate/gem-priority-gate.py --consumer fleet) detached, under the gate's own
writer lock, so a slow observation never delays a worker spawn. The receipt carries the key as
`FLEET_GATE_INPUT_GENERATION` for generation-based consumer freshness.
"""
from __future__ import annotations

import hashlib
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

GATE = Path(__file__).resolve().parents[1] / "fleet-gate" / "gem-priority-gate.py"
STATE_FILE = "fleet-gate-emit.json"
OPEN_PRS_CACHE = "cache/open-prs-labels-v2.json"
# Fields of a cached open-PR row that move the gate's queue/closure verdict.
PR_FIELDS = ("number", "headRefOid", "isDraft", "mergeStateStatus", "isInMergeQueue", "baseRefName")


def workspace(env=None) -> Path:
    env = os.environ if env is None else env
    return Path(env.get("GEM_WORKSPACE") or Path.home() / "gem-workspace")


def enabled(env=None, state_dir: Path | None = None) -> bool:
    """Only an installed release (this file under <state>/releases/, never a checkout or a
    release self-test) on a host with the gate's workspace (Gem), unless LANES_FLEET_GATE=1
    forces it; LANES_FLEET_GATE=0 turns it off."""
    env = os.environ if env is None else env
    flag = env.get("LANES_FLEET_GATE", "").strip().lower()
    if flag in ("0", "false", "off", "no") or not GATE.exists() or not (workspace(env) / "state").is_dir():
        return False
    if flag == "1":
        return True
    installed = state_dir is not None and Path(state_dir).resolve() / "releases" in GATE.resolve().parents
    return installed and env.get("LANES_SELFTEST") != "1"


def _read(path: Path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None


def _digest(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str).encode()).hexdigest()


def main_sha(repo: Path) -> str | None:
    """origin/main as the update step's fetch left it: a local read, not a GitHub API call."""
    try:
        done = subprocess.run(["git", "-C", str(repo), "rev-parse", "origin/main^{commit}"],
                              capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.SubprocessError):
        return None
    sha = done.stdout.strip()
    return sha if done.returncode == 0 and len(sha) == 40 else None


def inputs(state_dir: Path, repo: Path, gem: Path) -> dict | None:
    """The receipt's local inputs, or None while main's head is unknown (nothing to key on)."""
    sha = main_sha(repo)
    if sha is None:
        return None
    cached = _obj(_read(state_dir / OPEN_PRS_CACHE)).get("value")
    rows = sorted(({key: row.get(key) for key in PR_FIELDS} | {"labels": sorted(_labels(row))}
                   for row in cached if isinstance(row, dict)), key=lambda row: row.get("number") or 0) \
        if isinstance(cached, list) else None
    gate_state = gem / "state"
    receipt = _obj(_read(gate_state / "gem-priority-gate" / "latest.json"))
    return {"main": sha, "openPrs": _digest(rows) if rows is not None else None,
            "integrity": _digest(_read(gate_state / "integrity.json")),
            "concurrency": _digest(_read(gate_state / "concurrency.json")),
            "verdict": _digest({key: receipt.get(key) for key in ("state", "promotionMode", "reasons")})}


def _obj(value) -> dict:
    return value if isinstance(value, dict) else {}


def _labels(row: dict) -> list[str]:
    return [str(label.get("name") if isinstance(label, dict) else label).lower() for label in row.get("labels") or []]


def _alive(pid) -> bool:
    if not isinstance(pid, int) or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    try:  # a finished child we spawned is a zombie until reaped
        return os.waitpid(pid, os.WNOHANG) == (0, 0)
    except ChildProcessError:
        return True


def tick(state_dir, repo, release: str | None, *, env=None, spawn=None, now: float | None = None) -> dict:
    """Run from the dispatch tick. Returns a small status for tick.json; never raises."""
    env = os.environ if env is None else env
    now = time.time() if now is None else now
    state_dir, repo = Path(state_dir), Path(repo)
    try:
        if not enabled(env, state_dir):
            return {"status": "off"}
        path = state_dir / STATE_FILE
        record = _obj(_read(path))
        result = _read(state_dir / "fleet-gate-emit.rc")
        if record.get("pid") and isinstance(result, int):
            record.update(pid=None, lastExit=result, lastEndedAt=now)
        elif record.get("pid") and _alive(record.get("pid")):
            return {"status": "running", "since": record.get("startedAt")}
        seen = inputs(state_dir, repo, workspace(env))
        if seen is None:
            return {"status": "main-unknown"}
        key = _digest({**seen, "release": release})
        if key == record.get("key"):
            path.write_text(json.dumps(record))
            return {"status": "unchanged", "key": key[:12]}
        child_env = {k: v for k, v in env.items() if k not in ("FLEET_GATE_ALLOW_LIVE_PERSIST", "FLEET_GATE_DRY_RUN")}
        child_env.update(GEM_WORKSPACE=str(workspace(env)), FLEET_GATE_INPUT_GENERATION=key)
        out, rc = state_dir / "fleet-gate-emit.out.json", state_dir / "fleet-gate-emit.rc"
        rc.unlink(missing_ok=True)
        command = [sys.executable, str(GATE), "--consumer", "fleet"]
        pid = (spawn or _spawn)(command, child_env, out, rc)
        reason = "release" if release != record.get("release") else "inputs"
        record.update(key=key, release=release, inputs=seen, pid=pid, startedAt=now, reason=reason)
        path.write_text(json.dumps(record))
        return {"status": "emitting", "reason": reason, "key": key[:12]}
    except Exception as error:  # noqa: BLE001 - the receipt is never on dispatch's critical path
        return {"status": "error", "error": f"{type(error).__name__}: {error}"[:200]}


def _spawn(command: list[str], env: dict, out: Path, rc: Path) -> int:
    """Detached: the tick never waits for an observation (GitHub reads, production health)."""
    script = ('"$@" > "$FLEET_GATE_EMIT_OUT" 2>"$FLEET_GATE_EMIT_OUT.err"; echo $? > "$FLEET_GATE_EMIT_RC"')
    child = subprocess.Popen(["sh", "-c", script, "fleet-gate-emit", *command],
                             env={**env, "FLEET_GATE_EMIT_OUT": str(out), "FLEET_GATE_EMIT_RC": str(rc)},
                             stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                             start_new_session=True)
    return child.pid


if __name__ == "__main__":  # manual: python3 fleet_gate_emitter.py <state> <repo>
    signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    print(json.dumps(tick(sys.argv[1], sys.argv[2], None)))
