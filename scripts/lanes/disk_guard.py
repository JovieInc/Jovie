#!/usr/bin/env python3
"""Disk-pressure guard: reclaim space before ENOSPC takes every lane down (JOV-6769).

Runs inside the existing event paths — the dispatch tick and each worker spawn —
never on its own timer. Below LOW_PCT free on the state filesystem the guard sweeps,
in order: DerivedData idle > 5h, clean worktrees idle > 12h (branches kept),
.next/test-results inside idle worktrees that stay, `xcrun simctl delete
unavailable`. The shared pnpm store stays intact: pruning it while active worktrees
install with copy imports amplifies disk use. Free space at or below CRITICAL_PCT
after the sweep is `critical` in the receipt; the doctor turns that reading into a
Linear Triage signal for Summer. Every step fails soft: one bad path never stops the rest.
"""
from __future__ import annotations

import json
import fcntl
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
PRESERVED_REPAIR = ".jovie-preserved-repair.json"


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


def index_locked(path: Path) -> bool:
    """A live git operation holds `<gitdir>/index.lock`; linked worktrees resolve
    their real git dir through the `.git` pointer file."""
    gitdir = path / ".git"
    try:
        pointer = gitdir.read_text()
    except (OSError, UnicodeDecodeError):
        pass  # embedded repo dir or unreadable pointer: check the literal path
    else:
        if pointer.startswith("gitdir:"):
            target = Path(pointer.split(":", 1)[1].strip())
            gitdir = target if target.is_absolute() else (path / target).resolve()
    try:
        return (gitdir / "index.lock").exists()
    except OSError:
        return False


def lsof_command() -> str:
    """launchd's PATH omits /usr/sbin, where macOS ships lsof; without it every
    liveness check fails closed and no cleanup ever runs."""
    if shutil.which("lsof") is None and Path("/usr/sbin/lsof").exists():
        return "/usr/sbin/lsof"
    return "lsof"


def busy_reason(path: Path, run=subprocess.run) -> str | None:
    """Why a worktree must not be destroyed; None only when it is provably idle.

    Path-based, never PID-based: a stale PID can be reused after a reboot, but a
    live process holding this directory as its cwd means an agent is still working.
    Any failed observation fails closed — an unreadable process inventory is not
    proof of idleness."""
    if index_locked(path):
        return "git-index-locked"
    try:
        active = run([lsof_command(), "-nP", "-a", "-d", "cwd", "-F", "pn"],
                     capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.SubprocessError):
        return "process-state-unavailable"
    if getattr(active, "returncode", None) not in (0, 1) or getattr(active, "stderr", ""):
        return "process-state-unavailable"
    resolved = path.resolve()
    for line in active.stdout.splitlines():
        if not line.startswith("n"):
            continue
        try:
            cwd = Path(line[1:]).resolve()
        except OSError:
            continue
        if cwd == resolved or resolved in cwd.parents:
            return "process-still-running"
    return None


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
        # The repository can also own user/Codex checkouts and dependency lenders.
        # Cleanup authority is limited to this lane host's own generated worktrees.
        if not path.resolve().is_relative_to((host.state / "worktrees").resolve()):
            continue
        if (path / PRESERVED_REPAIR).exists():
            continue
        if not path.exists() or recently_touched(path, WORKTREE_IDLE_S, now):
            continue
        busy = busy_reason(path, run)
        if busy:
            report["actions"].append(f"preserved busy worktree {path}: {busy}")
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


def sweep_host_tools(run, report: dict) -> None:
    for cmd in (["xcrun", "simctl", "delete", "unavailable"],):
        if shutil.which(cmd[0]) is None:
            continue
        result = run(cmd, capture_output=True, text=True, timeout=600, cwd=Path.home())
        (report["actions"] if result.returncode == 0 else report["errors"]).append(
            f"{' '.join(cmd)} -> {result.returncode}" if result.returncode else f"ran {' '.join(cmd)}")
    report["actions"].append("preserved shared pnpm store")


def check(host, *, run=subprocess.run, now: float | None = None, sweep: bool = False) -> dict:
    """Observe by default. Only a worker holding a slot requests serialized cleanup.

    Critical or unknown disk never admits work or sweeps. Every caller gets an
    explicit admission result even when another worker owns cleanup.
    """
    now = time.time() if now is None else now
    pct = free_pct(host.state)
    report = {"at": now_iso(), "freePct": pct, "low": False, "critical": False, "actions": [], "errors": []}
    report["low"] = pct is not None and pct < LOW_PCT
    if sweep and pct is not None and CRITICAL_PCT < pct < LOW_PCT:
        try:
            with open(host.state / "disk-cleanup.lock", "a") as lock:
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    report["cleanup"] = "busy"
                else:
                    report["cleanup"] = "acquired"
                    for step in (lambda: sweep_derived_data(now, report),
                                 lambda: sweep_worktrees(host, run, now, report),
                                 lambda: sweep_host_tools(run, report)):
                        # Pressure can change between steps; never keep sweeping critically low disk.
                        current = free_pct(host.state)
                        if current is None or current <= CRITICAL_PCT:
                            break
                        try:
                            step()
                        except Exception as error:
                            report["errors"].append(f"{type(error).__name__}: {error}"[:200])
        except OSError as error:
            report["errors"].append(f"cleanup-lock:{error}"[:200])
        pct = free_pct(host.state)
    report["freePctAfter"] = pct
    report["critical"] = pct is not None and pct <= CRITICAL_PCT
    report["admitted"] = pct is not None and pct > CRITICAL_PCT
    report["reason"] = "disk-unobservable" if pct is None else "disk-critical" if report["critical"] else "disk-available"
    try:
        host.state.mkdir(parents=True, exist_ok=True)
        (host.state / "disk-pressure.json").write_text(json.dumps(report, indent=1))
    except OSError:
        pass
    return report
