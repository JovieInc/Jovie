#!/usr/bin/env python3
"""Host worktree sweeper: retire idle or merged-PR checkouts without losing work (JOV-7704).

The lanes tick spawns this at most once per interval (`maybe_spawn`), so it needs no daemon.
It covers lanes, Codex, Conductor, Claude-scratch and manual `jovie-wt-*` checkouts:

- Only linked worktrees of known repositories under an allowlisted root are candidates.
  Primary clones, bare mirrors, the pnpm store and `~/.cache` are never touched.
- A checkout any live process uses (argv path or cwd) is never removed. An unreadable
  process inventory removes nothing.
- A checkout retires when its branch's PR closed or merged (after a short grace), or when it
  has been idle for `idle_s`. Idle is the newest reflog entry or dirty-file mtime, never the
  directory mtime (git status and maintenance bump those).
- Dirty or unpushed state is first committed off-index (`commit-tree`, no hooks, the
  checkout is untouched) and pushed as `backup/<host>/<name>-<date>`. If that push fails,
  the checkout stays and loses only regenerable build output.
- Preserved repairs (`.jovie-preserved-repair.json`) expire once their PR is closed or
  after `preserved_ttl_s`, through the same backup-then-remove path.
"""
from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

PRESERVED_REPAIR = ".jovie-preserved-repair.json"
IDLE_S = 12 * 3600
CLOSED_GRACE_S = 3600
PRESERVED_TTL_S = 3 * 86400
INTERVAL_S = 3600
LOW_INTERVAL_S = 600
BUILD_DIRS = frozenset({"node_modules", ".next", ".turbo", "test-results", ".build", "DerivedData"})
EXCLUDE = [f":(exclude,glob)**/{name}/**" for name in sorted(BUILD_DIRS)] + [f":(exclude){PRESERVED_REPAIR}"]


def default_roots(home: Path, state: Path) -> list[Path]:
    """Where agent checkouts live; anything else is out of scope."""
    return [state / "worktrees", home / ".codex/worktrees", home / "conductor/workspaces",
            home / "jovie-worktrees", home / "worktrees", home / "LogYourBody-wt",
            home / "jovie-wt-*", Path("/private/tmp/claude-501"), Path("/private/tmp/jovie-*")]


def default_never(home: Path) -> list[Path]:
    return [home / ".cache", home / "Library", home / ".hermes", home / ".claude", home / "Documents",
            home / ".local/share/pnpm"]


def default_repos(home: Path, repo: Path) -> list[Path]:
    extra = [Path(p) for p in os.environ.get("LANES_SWEEP_REPOS", "").split(":") if p]
    found = [repo, home / "Jovie", home / "JovieInc/Jovie", home / "code/jovie-v1",
             home / "LogYourBody", home / "summer-config", *extra]
    return list(dict.fromkeys(p for p in found if (p / ".git").is_dir()))


def in_scope(path: Path, roots: list[Path], never: list[Path]) -> bool:
    if any(path == n or n in path.parents for n in never):
        return False
    for root in roots:
        if "*" in root.name:
            if any(p.parent == root.parent and p.match(str(root)) for p in (path, *path.parents)):
                return True
        elif root in path.parents:
            return True
    return False


def live_paths(run) -> set[Path] | None:
    """Every absolute path in a process argv or cwd; None when either inventory fails."""
    try:
        ps = run(["ps", "-axo", "args="], capture_output=True, text=True, timeout=30)
        lsof = run(["lsof", "-nP", "-a", "-d", "cwd", "-F", "n"], capture_output=True, text=True, timeout=120)
    except (OSError, subprocess.SubprocessError):
        return None
    if ps.returncode != 0 or lsof.returncode not in (0, 1):
        return None
    paths = {Path(token) for token in re.findall(r"(/[^\s'\"]+)", ps.stdout)}
    paths |= {Path(line[1:]) for line in lsof.stdout.splitlines() if line.startswith("n/")}
    return paths


def busy(path: Path, live: set[Path]) -> bool:
    return any(p == path or path in p.parents for p in live)


def linked_worktrees(repo: Path, run) -> list[tuple[Path, str | None]]:
    """(path, branch) for each linked worktree; the primary checkout and bare entries are skipped."""
    result = run(["git", "-C", str(repo), "worktree", "list", "--porcelain"],
                 capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        return []
    entries = []
    for block in result.stdout.strip().split("\n\n")[1:]:
        fields = dict(line.split(" ", 1) if " " in line else (line, "") for line in block.splitlines())
        if "worktree" in fields and "bare" not in fields:
            branch = fields.get("branch", "").removeprefix("refs/heads/") or None
            entries.append((Path(fields["worktree"]), branch))
    return entries


def git(path: Path, run, *args, timeout=300, env=None):
    return run(["git", "-C", str(path), *args], capture_output=True, text=True, timeout=timeout,
               env={**os.environ, **env} if env else None)


def inspect(path: Path, run) -> dict | None:
    """Dirty paths, unpushed commit count, remote and last activity; None if unreadable."""
    status = git(path, run, "status", "--porcelain", "--", ".", *EXCLUDE)
    if status.returncode != 0:
        return None
    dirty = [line[3:].split(" -> ")[-1].strip('"') for line in status.stdout.splitlines() if line.strip()]
    remotes = git(path, run, "remote").stdout.split()
    remote = "origin" if "origin" in remotes else (remotes[0] if remotes else None)
    unpushed = git(path, run, "rev-list", "--count", "HEAD", "--not", "--remotes").stdout.strip()
    activity = 0.0
    match = re.search(r"\{(\d+)\}", git(path, run, "reflog", "-1", "--format=%gd", "--date=unix").stdout)
    if match:
        activity = float(match.group(1))
    for rel in dirty[:500]:
        try:
            activity = max(activity, (path / rel).lstat().st_mtime)
        except OSError:
            continue
    return {"dirty": len(dirty), "unpushed": unpushed or "?", "remote": remote, "activity": activity}


def backup(path: Path, info: dict, run, prefix: str, date: str) -> str | None:
    """Snapshot the checkout (tracked + untracked, minus build output) onto a backup branch."""
    head = git(path, run, "rev-parse", "HEAD").stdout.strip()
    if not head or not info["remote"]:
        return None
    sha = head
    if info["dirty"]:
        index = path.parent / f".{path.name}.sweep-index"
        env = {"GIT_INDEX_FILE": str(index)}
        try:
            # Seed from the real index so `add -A` reuses its stat cache instead of rehashing.
            real = git(path, run, "rev-parse", "--path-format=absolute", "--git-path", "index").stdout.strip()
            try:
                shutil.copyfile(real, index)
            except OSError:
                git(path, run, "read-tree", "HEAD", env=env)
            if git(path, run, "add", "-A", "--", ".", *EXCLUDE, env=env, timeout=900).returncode != 0:
                return None
            tree = git(path, run, "write-tree", env=env).stdout.strip()
            commit = git(path, run, "commit-tree", tree, "-p", head, "-m",
                         f"backup: uncommitted state of {path} ({date}, worktree sweep)")
            if commit.returncode != 0 or not tree:
                return None
            sha = commit.stdout.strip()
        finally:
            index.unlink(missing_ok=True)
    name = path.name if path.name not in {"Jovie", "LogYourBody"} else f"{path.parent.name}-{path.name}"
    branch = f"{prefix}/{re.sub(r'[^A-Za-z0-9._-]', '-', name)}-{date}"
    # Backup refs carry no PR or CI meaning; hooks would gate a snapshot, not a change.
    pushed = git(path, run, "push", "--no-verify", "--force", "-q", info["remote"],
                 f"{sha}:refs/heads/{branch}", timeout=900)
    return branch if pushed.returncode == 0 else None


def strip_build_dirs(path: Path) -> None:
    for root, dirs, _files in os.walk(path):
        keep = []
        for name in dirs:
            if name in BUILD_DIRS:
                shutil.rmtree(Path(root) / name, ignore_errors=True)
            elif name != ".git":
                keep.append(name)
        dirs[:] = keep


def preserved_age(path: Path, now: float) -> float | None:
    try:
        return now - (path / PRESERVED_REPAIR).stat().st_mtime
    except OSError:
        return None


def decide(path: Path, branch: str | None, info: dict, now: float, closed: set[str], *,
           idle_s: float, preserved_ttl_s: float) -> str | None:
    """Why this checkout may retire now, or None to keep it."""
    idle = now - info["activity"]
    age = preserved_age(path, now)
    closed_pr = branch is not None and branch in closed
    if age is not None:
        if closed_pr and idle >= CLOSED_GRACE_S:
            return "preserved-pr-closed"
        return "preserved-expired" if age >= preserved_ttl_s and idle >= idle_s else None
    if closed_pr and idle >= CLOSED_GRACE_S:
        return "pr-closed"
    return "idle" if idle >= idle_s else None


def retire(repo: Path, path: Path, branch: str | None, live: set[Path], report: dict, *, run, now: float,
           closed: set[str], idle_s: float, preserved_ttl_s: float, prefix: str, date: str) -> None:
    if busy(path, live):
        report["kept"] += 1
        return
    info = inspect(path, run)
    if info is None:
        report["kept"] += 1
        return
    reason = decide(path, branch, info, now, closed, idle_s=idle_s, preserved_ttl_s=preserved_ttl_s)
    if reason is None:
        report["kept"] += 1
        return
    if info["dirty"] or info["unpushed"] != "0":
        saved = backup(path, info, run, prefix, date)
        if not saved:
            strip_build_dirs(path)
            report["stripped"].append(str(path))
            return
        report["backups"].append(saved)
    removed = git(repo, run, "worktree", "remove", "--force", str(path), timeout=900)
    if removed.returncode == 0:
        report["removed"].append({"path": str(path), "reason": reason})
    else:
        report["errors"].append(f"remove:{path}:{removed.stderr.strip()[:120]}")


def sweep(repos: list[Path], roots: list[Path], never: list[Path], *, run=subprocess.run,
          now: float | None = None, closed: dict[Path, set[str]] | None = None, idle_s: float = IDLE_S,
          preserved_ttl_s: float = PRESERVED_TTL_S, prefix: str = "backup/mac",
          date: str | None = None) -> dict:
    now = time.time() if now is None else now
    date = date or datetime.fromtimestamp(now, timezone.utc).strftime("%Y%m%d")
    closed = closed or {}
    report = {"at": datetime.fromtimestamp(now, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
              "removed": [], "backups": [], "stripped": [], "kept": 0, "errors": []}
    live = live_paths(run)
    if live is None:
        report["errors"].append("process-state-unavailable")
        return report
    for repo in repos:
        try:
            entries = linked_worktrees(repo, run)
        except (OSError, subprocess.SubprocessError) as error:
            report["errors"].append(f"list:{repo}:{type(error).__name__}")
            continue
        for path, branch in entries:
            if not path.exists() or not in_scope(path, roots, never):
                continue
            try:
                retire(repo, path, branch, live, report, run=run, now=now, closed=closed.get(repo, set()),
                       idle_s=idle_s, preserved_ttl_s=preserved_ttl_s, prefix=prefix, date=date)
            except (OSError, subprocess.SubprocessError) as error:
                # One slow or broken checkout (e.g. `git add` timing out under load) must not end
                # the sweep; it stays in place and is retried next interval.
                report["kept"] += 1
                report["errors"].append(f"{path}:{type(error).__name__}"[:200])
        try:
            git(repo, run, "worktree", "prune", timeout=120)
        except (OSError, subprocess.SubprocessError):
            pass
    return report


def closed_branches(repo: Path, run) -> set[str]:
    """Head branches of the most recently closed or merged PRs (one REST call)."""
    url = git(repo, run, "remote", "get-url", "origin").stdout.strip()
    match = re.search(r"github\.com[:/]([^/]+/[^/.]+)", url)
    if not match:
        return set()
    try:
        result = run(["gh", "api", f"repos/{match.group(1)}/pulls?state=closed&sort=updated&direction=desc&per_page=100",
                      "--jq", ".[].head.ref"], capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.SubprocessError):
        return set()
    return set(result.stdout.split()) if result.returncode == 0 else set()


def maybe_spawn(state: Path, repo: Path, free_pct: float | None, *, now: float | None = None) -> str:
    """Called from the lanes tick: start one detached sweep when its interval has elapsed.

    The tick runs even when disk admission fails, so a critically full disk still gets swept."""
    if not (repo / ".git").is_dir():
        return "no-repo"
    now = time.time() if now is None else now
    stamp = state / "worktree-sweep.json"
    try:
        last = json.loads(stamp.read_text()).get("startedAt", 0)
    except (OSError, ValueError, AttributeError):
        last = 0
    interval = LOW_INTERVAL_S if free_pct is not None and free_pct < 15 else INTERVAL_S
    if now - last < interval:
        return "not-due"
    state.mkdir(parents=True, exist_ok=True)
    stamp.write_text(json.dumps({"startedAt": now}))
    subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "--state", str(state), "--repo", str(repo)],
                     stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                     start_new_session=True)
    return "spawned"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--state", type=Path, default=Path(os.environ.get(
        "LANES_STATE", Path.home() / ".local/state/jovie-lanes")))
    parser.add_argument("--repo", type=Path, default=Path(os.environ.get(
        "LANES_REPO", Path.home() / "devin-sweep/Jovie")))
    args = parser.parse_args(argv)
    home = Path.home()
    args.state.mkdir(parents=True, exist_ok=True)
    with open(args.state / "disk-cleanup.lock", "a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return 0  # disk_guard or an earlier sweep owns cleanup
        repos = default_repos(home, args.repo)
        closed = {repo: closed_branches(repo, subprocess.run) for repo in repos}
        prefix = "backup/mac" if sys.platform == "darwin" else f"backup/{os.uname().nodename.split('.')[0]}"
        report = sweep(repos, default_roots(home, args.state), default_never(home), closed=closed, prefix=prefix)
    stamp = args.state / "worktree-sweep.json"
    try:
        started = json.loads(stamp.read_text()).get("startedAt")
    except (OSError, ValueError, AttributeError):
        started = None
    stamp.write_text(json.dumps({"startedAt": started or time.time(), **report}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
