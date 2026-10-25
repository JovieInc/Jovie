#!/usr/bin/env python3
"""GitHub API headroom for the public lanes status feed (Ovie Fleet tile).

`node scripts/lib/api-quota-report.mjs headroom --json` (schema
jovie-actions-quota-headroom/v1, #23218) samples the `api-quota` notices that
Merge Queue Green Enroll emits. It costs a few dozen `gh` reads, so the doctor
never waits on it: `read_block` returns the cached report and, when the cache
is older than REFRESH_AFTER_S, starts one detached refresh (guarded by a lock).
A failed refresh keeps the previous report, whose `generatedAt` lets readers
see its age; the feed never fails on this optional block.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

SCHEMA = "jovie-actions-quota-headroom/v1"
CACHE_FILE = "github-headroom.json"
LOCK_FILE = "github-headroom.lock"
REFRESH_AFTER_S = 600
LOCK_TTL_S = 180
MAX_SAMPLES = 12
NODE_TIMEOUT_S = 150


def _read(path: Path) -> dict | None:
    try:
        value = json.loads(path.read_text())
    except (OSError, ValueError):
        return None
    if isinstance(value, dict) and value.get("schema") == SCHEMA and isinstance(value.get("windows"), list):
        return value
    return None


def _fresh(path: Path, ttl: float, now: float) -> bool:
    try:
        return now - path.stat().st_mtime < ttl
    except OSError:
        return False


def read_block(state: Path, repo: Path, now: float | None = None, spawn=subprocess.Popen) -> dict | None:
    """The cached headroom report (possibly stale); refreshes in the background when old."""
    now = time.time() if now is None else now
    cache, lock = state / CACHE_FILE, state / LOCK_FILE
    report = _read(cache)
    if report is not None and _fresh(cache, REFRESH_AFTER_S, now):
        return report
    if _fresh(lock, LOCK_TTL_S, now):
        return report
    try:
        lock.write_text(str(int(now)))
        spawn([sys.executable, str(Path(__file__).resolve()), "refresh", str(state), str(repo)],
              stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
              start_new_session=True)
    except OSError:
        pass
    return report


def refresh(state: Path, repo: Path, run=subprocess.run) -> bool:
    """Run the report once; replace the cache only with a valid document."""
    lock = state / LOCK_FILE
    try:
        done = run(["node", str(repo / "scripts/lib/api-quota-report.mjs"), "headroom", "--hours", "1",
                    "--max-samples", str(MAX_SAMPLES), "--json"],
                   capture_output=True, text=True, timeout=NODE_TIMEOUT_S, cwd=str(repo))
        if done.returncode != 0:
            return False
        value = json.loads(done.stdout)
        if not (isinstance(value, dict) and value.get("schema") == SCHEMA and isinstance(value.get("windows"), list)):
            return False
        tmp = state / (CACHE_FILE + ".tmp")
        tmp.write_text(json.dumps(value, separators=(",", ":")))
        os.replace(tmp, state / CACHE_FILE)
        return True
    except (OSError, ValueError, subprocess.SubprocessError):
        return False
    finally:
        try:
            lock.unlink()
        except OSError:
            pass


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "refresh":
        sys.exit(0 if refresh(Path(sys.argv[2]), Path(sys.argv[3])) else 1)
    sys.exit(2)
