#!/usr/bin/env python3
"""Volume headroom, alarm events and the daily disk report (extracted from worktree_sweep, 2026-11-08)."""
from __future__ import annotations

import json
import os
import shutil
import sys
import time
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import lifecycle
from atomic_state import atomic_write_text

HEADROOM_WARN_PCT = 70
HEADROOM_CRIT_PCT = 85
REPORT_INTERVAL_S = 86400
STRIP_ONLY_STAMP = "strip-only.json"
STRIP_ONLY_THROTTLE_S = 120


def tree_kib(path: Path, run) -> int | None:
    try:
        result = run(["du", "-sk", "--", str(path)], capture_output=True, text=True, timeout=300)
    except (OSError, subprocess.SubprocessError):
        return None
    try:
        return int(result.stdout.split()[0])
    except (IndexError, ValueError):
        return None


def volumes(home: Path, state: Path, mounts: list[Path] | None = None) -> list[Path]:
    """Mount points holding agent data: root, the home and state volumes, and every /srv/* mount."""
    if mounts is None:
        mounts = [p for p in sorted(Path("/srv").glob("*")) if os.path.ismount(p)] if Path("/srv").is_dir() else []
    found = [Path("/"), *mounts]
    for anchor in (home, state):
        probe = anchor
        while not os.path.ismount(probe) and probe != probe.parent:
            probe = probe.parent
        found.append(probe)
    return list(dict.fromkeys(found))


def headroom(vols: list[Path], *, usage=shutil.disk_usage) -> dict:
    rows, alarms = [], []
    for mount in vols:
        try:
            total, _, free = usage(mount)
        except OSError:
            continue
        used_pct = round(100 * (total - free) / total, 1) if total else 0.0
        level = "crit" if used_pct >= HEADROOM_CRIT_PCT else "warn" if used_pct >= HEADROOM_WARN_PCT else "ok"
        rows.append({"mount": str(mount), "usedPct": used_pct, "freeGiB": round(free / 2**30, 1),
                     "totalGiB": round(total / 2**30, 1), "level": level})
        if level != "ok":
            alarms.append({"mount": str(mount), "level": level, "usedPct": used_pct})
    return {"volumes": rows, "alarms": alarms, "thresholds": {"warn": HEADROOM_WARN_PCT, "crit": HEADROOM_CRIT_PCT}}


def publish_headroom(state: Path, current: dict, now: float) -> None:
    """state/disk-headroom.json is the sentinel's input; an alarm event is appended on each level change."""
    path = state / "disk-headroom.json"
    try:
        before = {v["mount"]: v["level"] for v in json.loads(path.read_text()).get("volumes", [])}
    except (OSError, ValueError, AttributeError, KeyError, TypeError):
        before = {}
    at = datetime.fromtimestamp(now, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    atomic_write_text(path, json.dumps({"at": at, **current}, indent=1))
    changed = [v for v in current["volumes"] if v["level"] != before.get(v["mount"], "ok")]
    if changed:
        with open(state / "host-alarms.jsonl", "a") as handle:
            for row in changed:
                handle.write(json.dumps({"at": at, "kind": "disk-headroom", **row}) + "\n")


def report_targets(home: Path, state: Path) -> list[Path]:
    roots = [state / "runs", state / "worktrees", state / "bindings", state / "releases",
             state / "preserved-artifacts", state / "cache", home / "codex-worktrees", home / "grok-wt",
             home / "grok-ship-workspaces", home / "gem-workspace", home / ".cache", home / ".local/share",
             home / ".npm"]
    srv = Path("/srv")
    if srv.is_dir():
        roots += [p for p in sorted(srv.glob("*")) if p.is_dir()]
    return [p for p in roots if p.exists()]


def daily_report(home: Path, state: Path, now: float, *, run=lifecycle.run, targets: list[Path] | None = None,
                 interval_s: float = REPORT_INTERVAL_S) -> str:
    """Per-volume usage plus the biggest growers since the last report; at most once per interval."""
    path = state / "disk-report.json"
    try:
        previous = json.loads(path.read_text())
    except (OSError, ValueError):
        previous = {}
    if now - previous.get("epoch", 0) < interval_s:
        return "not-due"
    sizes = {}
    for target in (targets if targets is not None else report_targets(home, state)):
        kib = tree_kib(target, lambda args, **kw: run(["nice", "-n", "19", *args], **kw))
        if kib is not None:
            sizes[str(target)] = kib
    before = previous.get("sizes", {})
    growers = sorted(({"path": p, "gib": round(k / 2**20, 2), "deltaGiB": round((k - before.get(p, k)) / 2**20, 2)}
                      for p, k in sizes.items()), key=lambda row: row["deltaGiB"], reverse=True)
    atomic_write_text(path, json.dumps({
        "at": datetime.fromtimestamp(now, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "epoch": now,
        "volumes": headroom(volumes(home, state))["volumes"], "sizes": sizes,
        "topGrowers": growers[:10], "largest": sorted(growers, key=lambda r: -r["gib"])[:10]}, indent=1))
    return "written"


def alarm_strip(state: Path, repo: Path, current: dict, *, now: float | None = None) -> str:
    """Event trigger: a headroom reading at or above the critical alarm starts one detached strip-only
    pass at once (not on a timer). Coalesces with a running sweep via disk-cleanup.lock and with a
    recent trigger via the stamp; `triggeredAt` is the stage timestamp."""
    if not any(v.get("level") == "crit" for v in current.get("volumes", [])) or not (repo / ".git").is_dir():
        return "no-alarm"
    now = time.time() if now is None else now
    stamp = state / STRIP_ONLY_STAMP
    try:
        last = json.loads(stamp.read_text()).get("triggeredAt", 0)
    except (OSError, ValueError, AttributeError):
        last = 0
    if now - last < STRIP_ONLY_THROTTLE_S:
        return "coalesced"
    atomic_write_text(stamp, json.dumps({"triggeredAt": now}))
    subprocess.Popen([sys.executable, str(Path(__file__).resolve().with_name("worktree_sweep.py")), "--strip-only", "--state", str(state),
                      "--repo", str(repo)], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                     stderr=subprocess.DEVNULL, start_new_session=True, **lifecycle.spawn_kwargs())
    return "spawned"
