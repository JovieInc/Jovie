#!/usr/bin/env python3
"""Disk-pressure guard: reclaim space before ENOSPC takes every lane down (JOV-6769).

Runs inside the existing event paths — the dispatch tick and each worker spawn —
never on its own timer. Below LOW_PCT free on the state filesystem the guard sweeps,
in order: DerivedData idle > 5h, clean worktrees idle > 12h (branches kept),
.next/test-results inside idle worktrees that stay, `xcrun simctl delete
unavailable`, `pnpm store prune`. Free space at or below CRITICAL_PCT after the
sweep is `critical` in the receipt; the doctor turns that reading into a Linear
Triage signal for Summer. Every step fails soft: one bad path never stops the rest.

The store prune runs under an exclusive flock on `state/pnpm-store.lock`; lane
installs hold it shared (lane_runner.install_deps). Without it a prune racing an
in-flight install deletes content files the install still links, failing the lane
gate with `ERR_PNPM_GenericFailure ... No such file or directory ... reflink`
(JOV-7301).
"""
from __future__ import annotations

import fcntl
import json
import os
import shutil
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

LOW_PCT = 15.0
CRITICAL_PCT = 5.0
DERIVED_DATA_IDLE_S = 5 * 3600
WORKTREE_IDLE_S = 12 * 3600
DERIVED_DATA_ROOT = Path(os.environ.get("LANES_DERIVED_DATA",
                                        Path.home() / "Library/Developer/Xcode/DerivedData"))
# Reclaimed inside idle worktrees that are kept; .git and node_modules are never walked.
PRUNE_DIRS = frozenset({".next", "test-results"})
SKIP_DIRS = PRUNE_DIRS | {".git", "node_modules"}
STORE_LOCK_NAME = "pnpm-store.lock"


def store_lock(host, exclusive: bool, wait: bool = False) -> int | None:
    """flock the shared pnpm-store lock; returns the held fd or None. Installs take it
    shared and block; the store prune takes it exclusive and skips when contended."""
    try:
        host.state.mkdir(parents=True, exist_ok=True)
        fd = os.open(host.state / STORE_LOCK_NAME, os.O_CREAT | os.O_RDWR, 0o644)
    except OSError:
        return None
    try:
        fcntl.flock(fd, (fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH) | (0 if wait else fcntl.LOCK_NB))
    except OSError:
        os.close(fd)
        return None
    return fd


def pnpm_install_running(run) -> bool:
    """Belt for installs that bypass the lock (manual/agent shells): pgrep the host."""
    try:
        result = run(["pgrep", "-f", "pnpm install"], capture_output=True, text=True, timeout=30)
    except Exception:
        return False
    return result.returncode == 0


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def free_pct(path: Path) -> float | None:
    try:
        usage = shutil.disk_usage(path)
    except OSError:
        return None
    return round(100 * usage.free / usage.total, 1) if usage.total else None


def recently_touched(path: Path, idle_s: float, now: float) -> bool:
    """Any entry inside newer than the cutoff counts the tree as active; the walk stops there."""
    cutoff = now - idle_s
    try:
        if path.stat().st_mtime > cutoff:
            return True
    except OSError:
        return False
    for root, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in (*dirs, *files):
            try:
                if (Path(root) / name).stat().st_mtime > cutoff:
                    return True
            except OSError:
                continue
    return False


def worktree_paths(repo: Path, run) -> list[Path]:
    """Every linked worktree of `repo`, excluding the main checkout."""
    result = run(["git", "worktree", "list", "--porcelain"], cwd=repo, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        return []
    paths = [line.split(" ", 1)[1] for line in result.stdout.splitlines() if line.startswith("worktree ")]
    return [Path(p) for p in paths[1:]]  # paths[0] is the main checkout


def is_clean(path: Path, run) -> bool:
    """Clean = no tracked modifications and no untracked (non-ignored) files."""
    result = run(["git", "-C", str(path), "status", "--porcelain"], capture_output=True, text=True, timeout=120)
    return result.returncode == 0 and not result.stdout.strip()


def prune_build_dirs(path: Path, report: dict) -> None:
    for root, dirs, _files in os.walk(path):
        keep = []
        for name in dirs:
            child = Path(root) / name
            if name in PRUNE_DIRS:
                shutil.rmtree(child, ignore_errors=True)
                report["actions"].append(f"removed {child}")
            elif name not in SKIP_DIRS:
                keep.append(name)
        dirs[:] = keep


def sweep_derived_data(now: float, report: dict, root: Path = DERIVED_DATA_ROOT) -> None:
    if not root.exists():
        return
    for child in root.iterdir():
        if not child.is_dir() or recently_touched(child, DERIVED_DATA_IDLE_S, now):
            continue
        shutil.rmtree(child, ignore_errors=True)
        report["actions"].append(f"removed DerivedData {child}")


def sweep_worktrees(host, run, now: float, report: dict) -> None:
    """Clean+idle worktrees go entirely (their branches stay); dirty-but-idle ones
    keep the checkout and lose only regenerable build output."""
    for path in worktree_paths(host.repo, run):
        if not path.exists() or recently_touched(path, WORKTREE_IDLE_S, now):
            continue
        if is_clean(path, run):
            removed = run(["git", "worktree", "remove", "--force", str(path)],
                          cwd=host.repo, capture_output=True, text=True, timeout=300)
            if removed.returncode == 0:
                report["actions"].append(f"removed worktree {path}")
            else:
                report["errors"].append(f"worktree-remove:{path}:{removed.stderr.strip()[:120]}")
        else:
            prune_build_dirs(path, report)


def sweep_host_tools(host, run, report: dict) -> None:
    for cmd in (["xcrun", "simctl", "delete", "unavailable"], ["pnpm", "store", "prune"]):
        if shutil.which(cmd[0]) is None:
            continue
        lock = None
        if cmd[0] == "pnpm":
            lock = store_lock(host, exclusive=True)
            if lock is None or pnpm_install_running(run):
                if lock is not None:
                    os.close(lock)
                report["actions"].append("skipped pnpm store prune: install in progress")
                continue
        try:
            # launchd starts lanes in "/" (read-only); pnpm writes a temp file into its cwd and exits 226 (EROFS).
            result = run(cmd, capture_output=True, text=True, timeout=600, cwd=Path.home())
            (report["actions"] if result.returncode == 0 else report["errors"]).append(
                f"{' '.join(cmd)} -> {result.returncode}" if result.returncode else f"ran {' '.join(cmd)}")
        finally:
            if lock is not None:
                os.close(lock)


def check(host, *, run=subprocess.run, now: float | None = None) -> dict:
    """Measure, sweep under pressure, and leave a receipt. Never raises into the caller."""
    now = time.time() if now is None else now
    pct = free_pct(host.state)
    report = {"at": now_iso(), "freePct": pct, "low": False, "critical": False, "actions": [], "errors": []}
    if pct is not None and pct < LOW_PCT:
        report["low"] = True
        for step in (lambda: sweep_derived_data(now, report),
                     lambda: sweep_worktrees(host, run, now, report),
                     lambda: sweep_host_tools(host, run, report)):
            try:
                step()
            except Exception as error:
                report["errors"].append(f"{type(error).__name__}: {error}"[:200])
        pct = free_pct(host.state)
        report["freePctAfter"] = pct
    report["critical"] = pct is not None and pct < CRITICAL_PCT
    try:
        host.state.mkdir(parents=True, exist_ok=True)
        (host.state / "disk-pressure.json").write_text(json.dumps(report, indent=1))
    except OSError:
        pass
    return report
