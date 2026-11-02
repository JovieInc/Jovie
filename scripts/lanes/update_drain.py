"""Drain-on-pending-update: stop admitting new gate runs while a lanes update waits for idle seats.

Gem 2026-10-23..25, 59 releases: install lag p50 22 min, p80 85, p95 215. The updater needs the gate
admission lock and every gate seat at once; a continuous stream of gate runs kept taking seats, so the
non-waiting proof lost tick after tick (gate-admission-busy / release-proof-gate-active; #23123 waited
60 min, #23268 20+ min). Once an update has been pending past UPDATE_DRAIN_AFTER_S, new gate admissions
wait; in-flight gates finish, the update installs at the first idle point, admission resumes. The drain is
bounded by the measured p95 length of a gated run, so it can never starve the lanes: past the bound it
expires, admission resumes, and the expiry is recorded.
"""
import json
import os
import time
from pathlib import Path

UPDATE_DRAIN_AFTER_S = int(os.environ.get("LANES_UPDATE_DRAIN_AFTER_S", "600"))  # starts near 10 min
BOUND_MIN_S, BOUND_MAX_S, BOUND_DEFAULT_S = 15 * 60, 90 * 60, 80 * 60  # default = measured p95 (80 min, n=211)
LEDGER_TAIL_BYTES = 2_000_000


def _read(path: Path) -> dict:
    try:
        data = json.loads(path.read_text())
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _write(path: Path, data: dict) -> None:
    from atomic_state import atomic_write_text
    atomic_write_text(path, json.dumps(data))


def drain_bound_s(state: Path) -> int:
    """p95 duration of recent runs that went through the gate (rows with gateWaitS), clamped."""
    import datetime
    path = Path(state) / "runs" / "ledger.jsonl"
    durations = []
    try:
        with path.open("rb") as handle:
            handle.seek(0, os.SEEK_END)
            start = max(0, handle.tell() - LEDGER_TAIL_BYTES)
            handle.seek(start)
            lines = handle.read().decode("utf-8", "replace").splitlines()[1 if start else 0:]
    except OSError:
        return BOUND_DEFAULT_S
    stamp = lambda value: datetime.datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    for line in lines:
        if '"gateWaitS"' not in line:
            continue
        try:
            row = json.loads(line)
            durations.append(stamp(row["endedAt"]) - stamp(row["startedAt"]))
        except (ValueError, KeyError, TypeError, AttributeError):
            continue
    if len(durations) < 20:
        return BOUND_DEFAULT_S
    durations.sort()
    p95 = durations[max(0, int(len(durations) * 0.95) - 1)]
    return int(min(BOUND_MAX_S, max(BOUND_MIN_S, p95)))


def status(state: Path, now: float | None = None) -> dict:
    """{'active': bool, 'reason': str, ...}. Reads update.json (behindS) and arms update-drain.json."""
    state, now = Path(state), time.time() if now is None else now
    update = _read(state / "update.json")
    behind, commit = update.get("behindS"), update.get("behindCommit")
    marker = state / "update-drain.json"
    if not isinstance(behind, (int, float)) or behind < UPDATE_DRAIN_AFTER_S or not commit:
        return {"active": False, "reason": "no-pending-update"}
    drain = _read(marker)
    if drain.get("commit") != commit:
        drain = {"commit": commit, "startedAt": now, "boundS": drain_bound_s(state), "behindAtStartS": behind}
        _write(marker, drain)
    if drain.get("expired"):
        return {"active": False, "reason": "drain-expired", **drain}
    if now - drain["startedAt"] > drain["boundS"]:
        drain["expired"] = True
        _write(marker, drain)
        return {"active": False, "reason": "drain-expired", **drain}
    return {"active": True, "reason": "update-pending-drain", **drain}


def finish(state: Path, behind_s, now: float | None = None) -> dict | None:
    """After an update attempt: when the pending update installed, record the drain and clear it."""
    state, now = Path(state), time.time() if now is None else now
    marker = state / "update-drain.json"
    drain = _read(marker)
    if not drain or behind_s != 0:
        return None
    row = {"schema": "jovie-update-drain/v1", "commit": drain.get("commit"), "startedAt": drain.get("startedAt"),
           "endedAt": now, "durationS": round(now - float(drain.get("startedAt") or now)),
           "boundS": drain.get("boundS"), "behindAtStartS": drain.get("behindAtStartS"),
           "outcome": "expired-then-installed" if drain.get("expired") else "installed"}
    with open(state / "update-drain.jsonl", "a") as out:
        out.write(json.dumps(row) + "\n")
    marker.unlink(missing_ok=True)
    return row
