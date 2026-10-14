#!/usr/bin/env python3
"""Disk-pressure guard: reclaim space before ENOSPC takes every lane down (JOV-6769).

Runs inside the existing event paths — the dispatch tick and each worker spawn —
never on its own timer: the tick spawns a detached sweep (maybe_sweep) when its
interval has elapsed, and a worker holding the cleanup lock sweeps in-process. Below LOW_PCT free on the state filesystem the guard sweeps,
in order: DerivedData idle > 5h, clean worktrees idle > 12h (branches kept),
.next/test-results inside idle worktrees that stay, idle worktree-pool slots once
free space is under the pool's floor (`worktree_pool.shed`), transient `_work` output of
idle self-hosted runners, retired Symphony workspaces (backed up to a branch first when they
hold work), lane logs older than LOG_IDLE_S, `xcrun simctl delete unavailable`. The runner,
workspace and log steps took over from Gem's retired gem-disk-reclaim timer (2026-10-11). The shared pnpm store stays intact: pruning it while active worktrees
install with copy imports amplifies disk use. Free space at or below CRITICAL_PCT
after the sweep is `critical` in the receipt; the doctor turns that reading into a
Linear Triage signal for Summer. Every step fails soft: one bad path never stops the rest.
"""
from __future__ import annotations

import json
import fcntl
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent))
import autoscale  # noqa: E402  (sibling module of the release)
import worktree_pool  # noqa: E402  (sibling module of the release)

# One threshold (Gem 2026-10-12 04:12Z): autoscale stops growth at or below this free %, so the
# sweep must already run there. At exactly 15% growth was blocked and nothing was reclaimed
# while ~178 GB of retired workspaces sat on disk.
LOW_PCT = float(autoscale.DISK_INCREASE_MIN)
CRITICAL_PCT = 5.0
DERIVED_DATA_IDLE_S = 5 * 3600
WORKTREE_IDLE_S = 12 * 3600
DERIVED_DATA_ROOT = Path(os.environ.get("LANES_DERIVED_DATA",
                                        Path.home() / "Library/Developer/Xcode/DerivedData"))
# Reclaimed inside idle worktrees that are kept; .git and node_modules are never walked.
PRUNE_DIRS = frozenset({".next", "test-results"})
SKIP_DIRS = PRUNE_DIRS | {".git", "node_modules"}
PRESERVED_REPAIR = ".jovie-preserved-repair.json"
# Files the harness itself writes into a checkout. They are never source: counting them as
# uncommitted work preserved clean checkouts, locked their PR branches and burned every
# repair attempt on "already used by worktree" (2026-10-11, 25 PRs fix-exhausted).
HARNESS_ARTIFACTS = (PRESERVED_REPAIR, ".codex-last-message.txt")
SOURCE_PATHSPEC = ("--", ".", *(f":(exclude){name}" for name in HARNESS_ARTIFACTS))
# What gem-disk-reclaim removed from an idle runner's _work: the job checkouts stay warm.
RUNNER_TRANSIENT = ("_actions", "_temp", "_tool", "_update")
# Elixir Symphony is retired; its workspaces only shrink. Linux mount table for mount safety.
RETIRED_WORKSPACE_DIRS = ("symphony-elixir-workspaces", "symphony-workspaces")
RETIRED_WORKSPACE_ABSOLUTE = ("/srv/worktrees/jovie",)
MOUNTINFO = Path("/proc/self/mountinfo")
LOG_IDLE_S = 14 * 86400
LOG_NAME = re.compile(r".*\.(log|log\.\d+(\.gz)?|log\.gz|prompt\.md)$")
RETIRED_SWEEP_BUDGET_S = 300


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
    result = run(["git", "-C", str(path), "status", "--porcelain", *SOURCE_PATHSPEC], capture_output=True, text=True, timeout=120)
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


def ensure_sbin_on_path(environ=os.environ) -> None:
    """launchd's PATH omits /usr/sbin, where macOS ships lsof; without it every
    liveness check fails closed and no cleanup ever runs. Entry points call this
    so `lsof` resolves by name for the whole process tree."""
    parts = environ.get("PATH", "").split(os.pathsep)
    if "/usr/sbin" not in parts:
        environ["PATH"] = os.pathsep.join([p for p in parts if p] + ["/usr/sbin"])


def busy_reason(path: Path, run=subprocess.run) -> str | None:
    """Why a worktree must not be destroyed; None only when it is provably idle.

    Path-based, never PID-based: a stale PID can be reused after a reboot, but a
    live process holding this directory as its cwd means an agent is still working.
    Any failed observation fails closed — an unreadable process inventory is not
    proof of idleness."""
    if index_locked(path):
        return "git-index-locked"
    try:
        active = run(["lsof", "-nP", "-a", "-d", "cwd", "-F", "pn"],
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


def sweep_worktree_pool(host, report: dict) -> None:
    """Pre-installed pool slots are regenerable; below the pool's own floor they go."""
    report["actions"].extend(f"drained pool slot {name}" for name in worktree_pool.shed(host.repo))


def selftest() -> bool:
    return bool(os.environ.get("LANES_SELFTEST"))


def runner_roots() -> list[Path]:
    """Self-hosted runner installs on this host. A release self-test sees none: these are
    absolute host paths a fixture must never reach."""
    if selftest():
        return []
    home = Path.home()
    return [home / "actions-runner", *(home / f"actions-runner-{n}" for n in range(1, 6)),
            *sorted(Path("/srv/git").glob("actions-runner-*"))]


def retired_workspace_roots() -> list[Path]:
    if selftest():
        return []
    return [*(Path.home() / name for name in RETIRED_WORKSPACE_DIRS), *map(Path, RETIRED_WORKSPACE_ABSOLUTE)]


def reclaimable(host, roots=None) -> bool:
    """Cheap: a retired Symphony workspace root still holds a directory the sweep can remove."""
    for root in retired_workspace_roots() if roots is None else roots:
        try:
            if root.is_dir() and not root.is_symlink() and any(child.is_dir() for child in root.iterdir()):
                return True
        except OSError:
            continue
    return False


def log_dirs(host) -> list[Path]:
    return [host.state / "runs", *([] if selftest() else [Path.home() / "symphony-ui-pilot-logs"])]


def runner_workers(run) -> list[str] | None:
    """Command lines of running Runner.Worker processes; None when that cannot be observed."""
    try:
        ps = run(["ps", "-axo", "args="], capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.SubprocessError):
        return None
    if getattr(ps, "returncode", 1) != 0:
        return None
    return [line.strip() for line in ps.stdout.splitlines() if "Runner.Worker" in line]


def sweep_runner_work(run, report: dict, roots=None) -> None:
    """Transient _work output of runners with no job running. A worker whose install cannot
    be attributed holds every runner: an unknown job is never swept from under itself."""
    roots = runner_roots() if roots is None else roots
    if not any(root.is_dir() for root in roots):
        return
    workers = runner_workers(run)
    if workers is None or any(not re.search(r"(^|\s)/\S*Runner\.Worker", line) for line in workers):
        report["errors"].append("runner-state-unavailable")
        return
    for root in roots:
        if root.is_symlink() or not (root / ".runner").is_file() or not (root / "run.sh").exists():
            continue
        if any(f"{root.resolve()}/" in line for line in workers):
            report["actions"].append(f"preserved busy runner {root}")
            continue
        for name in RUNNER_TRANSIENT:
            child = root / "_work" / name
            if child.is_symlink() or not child.is_dir():
                continue
            shutil.rmtree(child, ignore_errors=True)
            (report["errors"] if child.exists() else report["actions"]).append(f"removed runner {child}")


def mount_points() -> set[Path] | None:
    """Every mount point on this host, or None when the table is unreadable (fail closed)."""
    try:
        lines = MOUNTINFO.read_text().splitlines()
    except OSError:
        return None
    decode = lambda text: re.sub(r"\\([0-7]{3})", lambda match: chr(int(match.group(1), 8)), text)
    return {Path(decode(line.split()[4])) for line in lines if len(line.split()) > 4}


def sweep_retired_workspaces(host, run, now: float, report: dict, roots=None,
                             budget_s: float = RETIRED_SWEEP_BUDGET_S) -> None:
    """Idle retired Symphony workspaces go, only from a filesystem that is itself under
    LOW_PCT. Never through a mount (a bind-mounted workspace is skipped whole), never a busy
    one, and never unsaved work: a git checkout with dirty or unpushed state is first pushed to
    `backup/<host>/...` exactly as worktree_sweep does; if that fails, or the directory is not
    a readable checkout, it only loses regenerable build output."""
    import worktree_sweep  # late: worktree_sweep imports this module
    roots = retired_workspace_roots() if roots is None else roots
    candidates = [root for root in roots if root.is_dir() and not root.is_symlink()]
    if not candidates:
        return
    mounts = mount_points()
    live = worktree_sweep.live_paths(run)
    if mounts is None or live is None:
        report["errors"].append("retired-workspaces:" + ("mounts-unavailable" if mounts is None
                                                        else "process-state-unavailable"))
        return
    prefix = "backup/mac" if sys.platform == "darwin" else f"backup/{os.uname().nodename.split('.')[0]}"
    date = datetime.fromtimestamp(now, timezone.utc).strftime("%Y%m%d")
    deadline = time.monotonic() + budget_s
    for root in candidates:
        for path in sorted(root.iterdir()):
            if time.monotonic() > deadline:
                report["actions"].append("retired workspaces: budget spent, continuing next sweep")
                return
            pct = free_pct(path)
            if path.is_symlink() or not path.is_dir() or pct is None or pct > LOW_PCT:
                continue
            resolved = path.resolve()
            if any(mount == resolved or resolved in mount.parents for mount in mounts):
                report["actions"].append(f"preserved mounted workspace {path}")
                continue
            if worktree_sweep.busy(resolved, live) or recently_touched(path, WORKTREE_IDLE_S, now):
                continue
            info = worktree_sweep.inspect(path, run) if (path / ".git").exists() else None
            if info is None:
                worktree_sweep.strip_build_dirs(path)
                report["actions"].append(f"stripped unverifiable workspace {path}")
                continue
            if info["dirty"] or info["unpushed"] != "0":
                saved = worktree_sweep.backup(path, info, run, prefix, date)
                if not saved:
                    worktree_sweep.strip_build_dirs(path)
                    report["actions"].append(f"stripped workspace {path}: backup failed")
                    continue
                report["actions"].append(f"backed up {path} to {saved}")
            shutil.rmtree(path, ignore_errors=True)
            (report["errors"] if path.exists() else report["actions"]).append(f"removed retired workspace {path}")


def sweep_old_logs(host, now: float, report: dict, dirs=None) -> None:
    """Lane run logs and prompts (never the jsonl ledgers) untouched for LOG_IDLE_S."""
    for directory in log_dirs(host) if dirs is None else dirs:
        if not directory.is_dir() or directory.is_symlink():
            continue
        removed = 0
        for path in directory.iterdir():
            try:
                if (LOG_NAME.match(path.name) and path.is_file() and not path.is_symlink()
                        and path.stat().st_mtime < now - LOG_IDLE_S):
                    path.unlink()
                    removed += 1
            except OSError:
                continue
        if removed:
            report["actions"].append(f"removed {removed} old log(s) from {directory}")


def sweep_host_tools(run, report: dict) -> None:
    for cmd in (["xcrun", "simctl", "delete", "unavailable"],):
        if shutil.which(cmd[0]) is None:
            continue
        result = run(cmd, capture_output=True, text=True, timeout=600, cwd=Path.home())
        (report["actions"] if result.returncode == 0 else report["errors"]).append(
            f"{' '.join(cmd)} -> {result.returncode}" if result.returncode else f"ran {' '.join(cmd)}")
    report["actions"].append("preserved shared pnpm store")


SWEEP_INTERVAL_S = 600  # a detached tick sweep at most this often; workers sweep whenever admitted


def maybe_sweep(host, free: float | None, *, now: float | None = None,
                popen=subprocess.Popen) -> str:
    """Called from the dispatch tick: start one detached sweep when its interval
    has elapsed and free space is low (the same model as worktree_sweep.maybe_spawn).
    Critical disk is exactly when the sweep must still run; a critical reading
    still spawns, the sweep itself re-checks and stops if disk stays critical."""
    if free is None or free > LOW_PCT:
        return "not-low"
    now = time.time() if now is None else now
    stamp = host.state / "disk-sweep.json"
    try:
        last = json.loads(stamp.read_text()).get("startedAt", 0)
    except (OSError, ValueError, AttributeError):
        last = 0
    if now - last < SWEEP_INTERVAL_S:
        return "not-due"
    host.state.mkdir(parents=True, exist_ok=True)
    stamp.write_text(json.dumps({"startedAt": now}))
    popen([sys.executable, str(Path(__file__).resolve()), "--state", str(host.state),
           "--repo", str(host.repo)], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
          stderr=subprocess.DEVNULL, start_new_session=True)
    return "spawned"


def sweep_main(state: Path, repo: Path) -> int:
    """Detached sweep entry point (the tick's maybe_sweep child)."""
    ensure_sbin_on_path()
    host = SimpleNamespace(state=state, repo=repo)
    check(host, sweep=True)
    return 0


def check(host, *, run=subprocess.run, now: float | None = None, sweep: bool = False) -> dict:
    """Observe by default. Only a worker holding a slot requests serialized cleanup.

    Critical or unknown disk never admits work or sweeps. Every caller gets an
    explicit admission result even when another worker owns cleanup.
    """
    now = time.time() if now is None else now
    pct = free_pct(host.state)
    report = {"at": now_iso(), "freePct": pct, "low": False, "critical": False, "actions": [], "errors": []}
    report["low"] = pct is not None and pct <= LOW_PCT
    if sweep and pct is not None and CRITICAL_PCT < pct <= LOW_PCT:
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
                                 lambda: sweep_worktree_pool(host, report),
                                 lambda: sweep_runner_work(run, report),
                                 lambda: sweep_retired_workspaces(host, run, now, report),
                                 lambda: sweep_old_logs(host, now, report),
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
    # An observation-only check never flattens the last real sweep's record: a
    # fresh receipt without its own sweep carries the last sweep's actions and
    # errors forward, so a worker sweep's results survive the next require_disk.
    if not sweep:
        try:
            prior = json.loads((host.state / "disk-pressure.json").read_text())
            if (isinstance(prior, dict) and prior.get("sweptAt")
                    and isinstance(prior.get("actions"), list) and not report["actions"]):
                report["actions"] = prior["actions"]
                if isinstance(prior.get("errors"), list):
                    report["errors"] = prior["errors"]
                report["carriedFrom"] = prior["sweptAt"]
        except (OSError, ValueError):
            pass
    else:
        report["sweptAt"] = now_iso()
    # Disk is a capacity limit only once nothing reclaimable is left (capacity_limit reads this).
    report["reclaimable"] = reclaimable(host)
    report["critical"] = pct is not None and pct <= CRITICAL_PCT
    report["admitted"] = pct is not None and pct > CRITICAL_PCT
    report["reason"] = "disk-unobservable" if pct is None else "disk-critical" if report["critical"] else "disk-available"
    try:
        host.state.mkdir(parents=True, exist_ok=True)
        (host.state / "disk-pressure.json").write_text(json.dumps(report, indent=1))
    except OSError:
        pass
    return report


if __name__ == "__main__":  # manual: python3 disk_guard.py --state <state> --repo <repo>
    import argparse

    parser = argparse.ArgumentParser(description="Detached disk-pressure sweep")
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--repo", type=Path, required=True)
    raise SystemExit(sweep_main(parser.parse_args().state, parser.parse_args().repo))
