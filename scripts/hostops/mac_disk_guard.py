#!/usr/bin/env python3
"""Ops Mac disk guard: keep the Data volume above a free-space floor.

The ops Mac hit 100% on 2026-10-21 (ENOSPC took down worker dev servers and
Playwright). A lead sweep then deleted node_modules in active worktrees because
its idle check used `find -newermt '-24 hours'`, which errors on macOS, so every
tree read as idle. This guard keeps the sweep in one tested place with a correct
idle check (os.lstat mtimes, no find/date parsing).

Every run (launchd, every 15 min) records free space. When free < TARGET_GB it
runs the safe sweep in order and stops as soon as the target is met:

  1. abandoned git tmp packs: `objects/pack/tmp_pack_*` older than 1h that no
     process holds open (failed fetches; git itself prunes them after 2 weeks).
  2. worktrees whose branch is merged into origin/main or gone on origin, that
     are clean (`git status --porcelain` empty), idle and have no process cwd
     inside: `git worktree remove` (never --force; the branch ref is kept).
  3. node_modules/.next/.turbo inside worktrees idle > IDLE_HOURS with no
     process cwd inside.
  4. `pnpm store prune` (skipped while any pnpm process runs).
  5. old Playwright browser revisions (newest revision per family is kept,
     and any revision a running process uses).
  6. simulator devices not booted in STALE_SIM_DAYS (keeps every device named
     in KEEP_SIM_NAMES, e.g. the LYB iPhone 17 Pro Max).

Below ALERT_GB after the sweep it posts a macOS notification and appends a line
to the ops LEDGER. Each step's freed bytes (df delta) go to the guard's own
ledger, ~/.local/state/mac-disk-guard/ledger.jsonl; receipt.json holds the
latest run for liveness.

Nothing here deletes unrecoverable work: every target is regenerable or, for
worktrees, refused by git when dirty. Kill switch: touch
~/.local/state/mac-disk-guard/disabled (or launchctl bootout, see install.sh).
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

HOME = Path.home()
VOLUME = Path(os.environ.get("MAC_DISK_GUARD_VOLUME", "/System/Volumes/Data"))
STATE_DIR = Path(os.environ.get("MAC_DISK_GUARD_STATE", HOME / ".local/state/mac-disk-guard"))
WORKTREE_ROOTS = [Path(p) for p in os.environ.get(
    "MAC_DISK_GUARD_ROOTS", str(HOME / "conductor/ops-wt")).split(":") if p]
OPS_LEDGER = Path(os.environ.get("MAC_DISK_GUARD_OPS_LEDGER", HOME / "conductor/ops-wt/LEDGER.md"))
PLAYWRIGHT_CACHE = Path(os.environ.get("PLAYWRIGHT_BROWSERS_PATH", HOME / "Library/Caches/ms-playwright"))

GB = 1024 ** 3
TARGET_GB = 50.0
ALERT_GB = 25.0
IDLE_HOURS = 24.0
# A merged worktree still gets a short quiet period so a worker that just
# created or switched it is never raced.
MERGED_IDLE_HOURS = 2.0
TMP_PACK_IDLE_S = 3600
TMP_PACK_RUNAWAY = 3
STALE_SIM_DAYS = 14
# LYB Golden iPhone 16 is the hard-coded destination of lyb-capture quality-gate.sh (no simctl create).
KEEP_SIM_NAMES = frozenset({"iPhone 17 Pro Max", "LYB Golden iPhone 16"})
BUILD_DIRS = frozenset({"node_modules", ".next", ".turbo"})
# Never walked by the idle check: regenerable output and git internals change
# without meaning a person or agent is working in the tree.
IDLE_SKIP = BUILD_DIRS | {".git", "test-results", "playwright-report", ".cache"}
PROTECTED_BRANCHES = frozenset({"main", "master"})
LOG_MAX_BYTES = 5 * 1024 * 1024


# ---------------------------------------------------------------- utilities

def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def free_bytes(volume: Path = VOLUME) -> int:
    return shutil.disk_usage(volume).free


def run(cmd: list[str], cwd: Path | None = None, timeout: float = 120) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)


def newest_mtime(root: Path, cutoff: float | None = None, skip: frozenset = IDLE_SKIP) -> float:
    """Newest mtime of any entry under root (lstat, symlinks not followed).

    Directories named in `skip` are not entered. With `cutoff`, the walk stops at
    the first entry newer than it (enough to prove the tree is active).
    """
    newest = 0.0
    stack = [root]
    while stack:
        current = stack.pop()
        try:
            st = os.lstat(current)
        except OSError:
            continue
        newest = max(newest, st.st_mtime)
        if cutoff is not None and newest > cutoff:
            return newest
        try:
            with os.scandir(current) as it:
                for entry in it:
                    if entry.name in skip:
                        continue
                    try:
                        if entry.is_dir(follow_symlinks=False):
                            stack.append(Path(entry.path))
                        else:
                            m = entry.stat(follow_symlinks=False).st_mtime
                            newest = max(newest, m)
                            if cutoff is not None and newest > cutoff:
                                return newest
                    except OSError:
                        continue
        except (NotADirectoryError, PermissionError, FileNotFoundError):
            continue
    return newest


def git_admin_dir(worktree: Path) -> Path | None:
    """The per-worktree admin dir (.git/worktrees/<name>) or the .git dir."""
    dotgit = worktree / ".git"
    if dotgit.is_dir():
        return dotgit
    try:
        text = dotgit.read_text().strip()
    except OSError:
        return None
    if text.startswith("gitdir:"):
        p = Path(text.split(":", 1)[1].strip())
        return p if p.is_absolute() else (worktree / p).resolve()
    return None


def is_idle(worktree: Path, idle_s: float, now: float | None = None) -> bool:
    """True when nothing in the tree (outside build output) and none of its git
    admin files (HEAD, index, logs) changed within idle_s."""
    now = time.time() if now is None else now
    cutoff = now - idle_s
    if newest_mtime(worktree, cutoff) > cutoff:
        return False
    admin = git_admin_dir(worktree)
    if admin is not None:
        # Not index or the reflog file's mtime: `git status` refreshes the index
        # and gc's reflog expire rewrites logs/* for every worktree. The last
        # reflog entry's own timestamp and HEAD's mtime are real activity.
        try:
            if os.lstat(admin / "HEAD").st_mtime > cutoff:
                return False
        except OSError:
            pass
        last = last_reflog_time(admin / "logs/HEAD")
        if last is not None and last > cutoff:
            return False
    return True


def last_reflog_time(path: Path) -> float | None:
    """Timestamp of the newest reflog entry (`<old> <new> <who> <epoch> <tz>\t<msg>`)."""
    try:
        with path.open("rb") as fh:
            fh.seek(0, os.SEEK_END)
            size = fh.tell()
            fh.seek(max(0, size - 4096))
            lines = fh.read().splitlines()
    except OSError:
        return None
    for raw in reversed(lines):
        head = raw.split(b"\t", 1)[0].split()
        if len(head) >= 2:
            try:
                return float(head[-2])
            except ValueError:
                continue
    return None


def process_cwds() -> list[str] | None:
    """Every process's cwd (lsof). None when lsof fails: callers must then treat
    every tree as busy (fail closed)."""
    try:
        out = run(["lsof", "-nP", "-w", "-d", "cwd", "-Fn"], timeout=60)
    except (OSError, subprocess.TimeoutExpired):
        return None
    if out.returncode not in (0, 1) or not out.stdout:
        return None
    return [line[1:] for line in out.stdout.splitlines() if line.startswith("n")]


def has_process_inside(path: Path, cwds: list[str] | None) -> bool:
    if cwds is None:
        return True
    roots = {str(path).rstrip("/"), os.path.realpath(path).rstrip("/")}
    for cwd in cwds:
        for candidate in (cwd, os.path.realpath(cwd)):
            if any(candidate == r or candidate.startswith(r + "/") for r in roots):
                return True
    return False


def open_paths_under(path: Path) -> set[str] | None:
    try:
        out = run(["lsof", "-nP", "-w", "+D", str(path), "-Fn"], timeout=120)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return {line[1:] for line in out.stdout.splitlines() if line.startswith("n")}


def dir_size(path: Path) -> int:
    total = 0
    stack = [path]
    while stack:
        current = stack.pop()
        try:
            with os.scandir(current) as it:
                for entry in it:
                    try:
                        if entry.is_dir(follow_symlinks=False):
                            stack.append(Path(entry.path))
                        else:
                            total += entry.stat(follow_symlinks=False).st_blocks * 512
                    except OSError:
                        continue
        except OSError:
            continue
    return total


# ---------------------------------------------------------------- discovery

def list_worktrees(repo: Path) -> list[dict]:
    """Parse `git worktree list --porcelain` into dicts (path, branch, head, detached)."""
    out = run(["git", "-C", str(repo), "worktree", "list", "--porcelain"])
    items: list[dict] = []
    cur: dict = {}
    for line in out.stdout.splitlines() + [""]:
        if not line:
            if cur:
                items.append(cur)
            cur = {}
            continue
        key, _, val = line.partition(" ")
        if key == "worktree":
            cur["path"] = Path(val)
        elif key == "branch":
            cur["branch"] = val.removeprefix("refs/heads/")
        elif key == "HEAD":
            cur["head"] = val
        elif key in ("detached", "bare", "locked", "prunable"):
            cur[key] = True
    return items


def main_repos(roots: list[Path]) -> list[Path]:
    """Repos (with a real .git dir) directly under the roots."""
    repos = []
    for root in roots:
        try:
            children = sorted(root.iterdir())
        except OSError:
            continue
        for child in children:
            if (child / ".git").is_dir():
                repos.append(child)
    return repos


def branch_disposition(repo: Path, branch: str | None, head: str) -> str | None:
    """'merged' / 'gone' when the worktree's work is already upstream, else None.

    merged: HEAD is an ancestor of origin/main (true merge or fast-forward).
    gone:   the branch tracked origin and origin no longer has it (upstream
            [gone], or origin/<branch> missing while every patch is in
            origin/main per `git cherry`). Squash-merged PRs land here.
    The branch ref itself is never deleted, so commits stay recoverable.
    """
    if branch in PROTECTED_BRANCHES:
        return None
    if run(["git", "-C", str(repo), "merge-base", "--is-ancestor", head, "origin/main"]).returncode == 0:
        return "merged"
    if not branch:
        return None
    track = run(["git", "-C", str(repo), "for-each-ref", "--format=%(upstream:track)",
                 f"refs/heads/{branch}"]).stdout.strip()
    if track == "[gone]":
        return "gone"
    has_remote = run(["git", "-C", str(repo), "rev-parse", "--verify", "-q",
                      f"refs/remotes/origin/{branch}"]).returncode == 0
    if not has_remote:
        cherry = run(["git", "-C", str(repo), "cherry", "origin/main", head])
        if cherry.returncode == 0 and not any(l.startswith("+") for l in cherry.stdout.splitlines()):
            return "gone"
    return None


def is_clean(worktree: Path) -> bool:
    out = run(["git", "-C", str(worktree), "status", "--porcelain", "--untracked-files=normal"])
    return out.returncode == 0 and out.stdout.strip() == ""


def build_dirs(worktree: Path) -> list[Path]:
    """Top-most node_modules/.next/.turbo dirs in the tree (not nested ones)."""
    found = []
    stack = [worktree]
    while stack:
        current = stack.pop()
        try:
            with os.scandir(current) as it:
                for entry in it:
                    if not entry.is_dir(follow_symlinks=False) or entry.name == ".git":
                        continue
                    if entry.name in BUILD_DIRS:
                        found.append(Path(entry.path))
                    else:
                        stack.append(Path(entry.path))
        except OSError:
            continue
    return found


def referenced_playwright_dirs(roots: list[Path]) -> set[str]:
    """Revision dir names (e.g. chromium-1223) that an installed playwright-core
    under the roots pins in its browsers.json. Removing those only forces a
    reinstall, but keeping them avoids churn for live checkouts."""
    names: set[str] = set()
    pattern = "*/node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/browsers.json"
    for root in roots:
        for path in root.glob(pattern):
            try:
                data = json.loads(path.read_text())
            except (OSError, ValueError):
                continue
            for browser in data.get("browsers", []):
                name, rev = browser.get("name"), browser.get("revision")
                if name and rev:
                    names.add(f"{name.replace('-', '_')}-{rev}")
    return names


def playwright_removals(cache: Path, in_use: set[str], referenced: frozenset | set = frozenset()) -> list[Path]:
    """Every revision dir except the newest per family, any in use by a running
    process and any pinned by an installed playwright-core."""
    families: dict[str, list[tuple[int, Path]]] = {}
    try:
        entries = list(cache.iterdir())
    except OSError:
        return []
    for entry in entries:
        m = re.fullmatch(r"(.+)-(\d+)", entry.name)
        if not m or not entry.is_dir():
            continue
        families.setdefault(m.group(1), []).append((int(m.group(2)), entry))
    out = []
    for revs in families.values():
        revs.sort()
        for _, path in revs[:-1]:
            if path.name in referenced:
                continue
            if not any(p == str(path) or p.startswith(str(path) + "/") for p in in_use):
                out.append(path)
    return out


def stale_simulators(devices_json: dict, now: float, stale_days: int = STALE_SIM_DAYS,
                     keep_names: frozenset = KEEP_SIM_NAMES) -> list[dict]:
    """Shutdown devices whose last boot (or, never booted, data dir mtime) is older than stale_days."""
    cutoff = now - stale_days * 86400
    out = []
    for runtime, devs in devices_json.get("devices", {}).items():
        for dev in devs:
            if dev.get("name") in keep_names or dev.get("state") != "Shutdown":
                continue
            last = None
            stamp = dev.get("lastBootedAt")
            if stamp:
                try:
                    last = datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()
                except ValueError:
                    last = None
            if last is None:
                try:
                    last = os.lstat(dev.get("dataPath", "")).st_mtime
                except OSError:
                    continue
            if last < cutoff:
                out.append({**dev, "runtime": runtime})
    return out


# ---------------------------------------------------------------- steps

class Sweep:
    def __init__(self, dry_run: bool, target: int, log):
        self.dry_run = dry_run
        self.target = target
        self.log = log
        self.cwds = process_cwds()
        self.steps: list[dict] = []

    def done(self) -> bool:
        return free_bytes() >= self.target

    def record(self, step: str, before: int, actions: list[str], estimate: int = 0) -> None:
        freed = max(0, free_bytes() - before) if not self.dry_run else estimate
        row = {"step": step, "freedGB": round(freed / GB, 2), "actions": len(actions),
               "dryRun": self.dry_run, "detail": actions[:50]}
        self.steps.append(row)
        self.log(row)

    def tmp_packs(self, repos: list[Path]) -> None:
        before, actions, est = free_bytes(), [], 0
        now = time.time()
        for repo in repos:
            pack = repo / ".git/objects/pack"
            try:
                cands = [p for p in pack.glob("tmp_pack_*") if now - p.lstat().st_mtime > TMP_PACK_IDLE_S]
            except OSError:
                continue
            if not cands:
                continue
            held = open_paths_under(pack)
            if held is None:
                continue  # fail closed
            for p in cands:
                if str(p) in held:
                    continue
                est += p.lstat().st_size
                actions.append(str(p))
                if not self.dry_run:
                    p.unlink(missing_ok=True)
        self.record("tmp-packs", before, actions, est)

    def merged_worktrees(self, repos: list[Path]) -> None:
        before, actions, est = free_bytes(), [], 0
        for repo in repos:
            run(["git", "-C", str(repo), "worktree", "prune"])
            for wt in list_worktrees(repo):
                path = wt.get("path")
                if not path or path == repo or wt.get("locked") or not path.exists():
                    continue
                if self.done() and not self.dry_run:
                    break
                disp = branch_disposition(repo, wt.get("branch"), wt.get("head", "HEAD"))
                if not disp or has_process_inside(path, self.cwds):
                    continue
                if not is_idle(path, MERGED_IDLE_HOURS * 3600) or not is_clean(path):
                    continue
                if self.dry_run:
                    est += dir_size(path)
                    actions.append(f"{path} ({disp})")
                    continue
                res = run(["git", "-C", str(repo), "worktree", "remove", str(path)], timeout=600)
                actions.append(f"{path} ({disp}) rc={res.returncode}{' ' + res.stderr.strip()[:120] if res.returncode else ''}")
        self.record("merged-worktrees", before, actions, est)

    def idle_build_dirs(self, repos: list[Path]) -> None:
        before, actions, est = free_bytes(), [], 0
        for repo in repos:
            for wt in list_worktrees(repo):
                path = wt.get("path")
                if not path or not path.exists() or path == repo:
                    continue
                if self.done() and not self.dry_run:
                    break
                if has_process_inside(path, self.cwds) or not is_idle(path, IDLE_HOURS * 3600):
                    continue
                for d in build_dirs(path):
                    size = dir_size(d)
                    est += size
                    actions.append(f"{d} {size / GB:.2f}GB")
                    if not self.dry_run:
                        shutil.rmtree(d, ignore_errors=True)
        self.record("idle-build-dirs", before, actions, est)

    def pnpm_prune(self) -> None:
        before, actions = free_bytes(), []
        busy = run(["pgrep", "-f", "pnpm"]).stdout.strip()
        pnpm = shutil.which("pnpm") or str(HOME / "Library/pnpm/pnpm")
        if busy:
            actions.append("skipped: pnpm running")
        elif not Path(pnpm).exists() and not shutil.which("pnpm"):
            actions.append("skipped: pnpm not found")
        elif self.dry_run:
            actions.append("would run: pnpm store prune")
        else:
            res = run([pnpm, "store", "prune"], timeout=1800)
            actions.append(f"pnpm store prune rc={res.returncode}")
        self.record("pnpm-store-prune", before, actions)

    def playwright(self) -> None:
        before, actions, est = free_bytes(), [], 0
        out = run(["ps", "-Ao", "command="]).stdout
        in_use = {line.split()[0] for line in out.splitlines() if str(PLAYWRIGHT_CACHE) in line}
        referenced = referenced_playwright_dirs(WORKTREE_ROOTS)
        for path in playwright_removals(PLAYWRIGHT_CACHE, in_use, referenced):
            est += dir_size(path)
            actions.append(str(path))
            if not self.dry_run:
                shutil.rmtree(path, ignore_errors=True)
        self.record("playwright-old-browsers", before, actions, est)

    def simulators(self) -> None:
        before, actions, est = free_bytes(), [], 0
        res = run(["xcrun", "simctl", "list", "devices", "-j"], timeout=120)
        if res.returncode == 0:
            for dev in stale_simulators(json.loads(res.stdout), time.time()):
                size = int(dev.get("dataPathSize") or 0)
                if self.dry_run:
                    est += size
                    actions.append(f"{dev['name']} {dev['udid']} {size / GB:.1f}GB")
                    continue
                r = run(["xcrun", "simctl", "delete", dev["udid"]], timeout=300)
                actions.append(f"{dev['name']} {dev['udid']} rc={r.returncode}")
        else:
            actions.append("skipped: simctl failed")
        self.record("stale-simulators", before, actions, est)


# ---------------------------------------------------------------- main

def notify(message: str) -> None:
    script = f'display notification "{message}" with title "Mac disk guard" sound name "Basso"'
    try:
        run(["osascript", "-e", script], timeout=20)
    except (OSError, subprocess.TimeoutExpired):
        pass


def append_ops_ledger(text: str) -> None:
    try:
        with OPS_LEDGER.open("a") as fh:
            fh.write(f"- {datetime.now(timezone.utc).strftime('%H:%MZ')} [mac-disk-guard] {text}\n")
    except OSError:
        pass


def append_jsonl(path: Path, row: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as fh:
        fh.write(json.dumps(row) + "\n")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dry-run", action="store_true", help="report what each step would remove")
    ap.add_argument("--force", action="store_true", help="sweep even when free space is above target")
    ap.add_argument("--target-gb", type=float, default=float(os.environ.get("MAC_DISK_GUARD_TARGET_GB", TARGET_GB)))
    ap.add_argument("--alert-gb", type=float, default=float(os.environ.get("MAC_DISK_GUARD_ALERT_GB", ALERT_GB)))
    ap.add_argument("--steps", default="tmp-packs,merged-worktrees,idle-build-dirs,pnpm,playwright,simulators")
    args = ap.parse_args(argv)

    STATE_DIR.mkdir(parents=True, exist_ok=True)
    ledger = STATE_DIR / "ledger.jsonl"
    for own_log in (ledger, STATE_DIR / "launchd.log"):
        try:  # the guard must never become a growing file itself
            if own_log.stat().st_size > LOG_MAX_BYTES:
                lines = own_log.read_bytes().splitlines(keepends=True)
                own_log.write_bytes(b"".join(lines[len(lines) // 2:]))
        except OSError:
            pass
    started = time.time()
    if (STATE_DIR / "disabled").exists():
        append_jsonl(ledger, {"at": now_iso(), "event": "disabled"})
        return 0
    lock = open(STATE_DIR / "lock", "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        append_jsonl(ledger, {"at": now_iso(), "event": "skipped-overlap"})
        return 0

    target = int(args.target_gb * GB)
    free_start = free_bytes()
    row = {"at": now_iso(), "event": "run", "freeStartGB": round(free_start / GB, 1),
           "targetGB": args.target_gb, "dryRun": args.dry_run, "steps": []}

    def log(step_row: dict) -> None:
        print(json.dumps(step_row), flush=True)

    if free_start < target or args.force or args.dry_run:
        sweep = Sweep(args.dry_run, target, log)
        repos = main_repos(WORKTREE_ROOTS)
        order = {
            "tmp-packs": lambda: sweep.tmp_packs(repos),
            "merged-worktrees": lambda: sweep.merged_worktrees(repos),
            "idle-build-dirs": lambda: sweep.idle_build_dirs(repos),
            "pnpm": sweep.pnpm_prune,
            "playwright": sweep.playwright,
            "simulators": sweep.simulators,
        }
        for name in [s for s in args.steps.split(",") if s]:
            if sweep.done() and not args.dry_run and not args.force:
                break
            try:
                order[name]()
            except Exception as exc:  # one bad step never stops the rest
                sweep.steps.append({"step": name, "error": repr(exc)[:300]})
        row["steps"] = sweep.steps

    # Several abandoned tmp packs in one sweep means a git process keeps dying
    # mid-write (2026-10-21: auto-gc cruft repack on a missing object leaked
    # ~230 MB per attempt). Cleaning up hides it, so say so loudly.
    leaked = next((s for s in row["steps"] if s.get("step") == "tmp-packs"), {})
    if leaked.get("actions", 0) >= TMP_PACK_RUNAWAY and not args.dry_run:
        row["runaway"] = f"{leaked['actions']} abandoned git tmp packs"
        notify(f"{row['runaway']}: a git repack/fetch keeps failing")
        append_ops_ledger(f"RUNAWAY {row['runaway']} removed ({leaked.get('freedGB')} GB); "
                          "a git repack/fetch keeps dying mid-write: check `git repack -d -l --cruft` stderr")

    free_end = free_bytes()
    row.update({"freeEndGB": round(free_end / GB, 1), "durationS": round(time.time() - started, 1)})
    if free_end < args.alert_gb * GB and not args.dry_run:
        row["alert"] = True
        msg = f"Data volume {free_end / GB:.1f} GB free (< {args.alert_gb:.0f} GB) after sweep"
        notify(msg)
        append_ops_ledger(f"ALERT {msg}; see {ledger}")
    append_jsonl(ledger, row)
    (STATE_DIR / "receipt.json").write_text(json.dumps(row, indent=1))
    print(json.dumps({k: v for k, v in row.items() if k != "steps"}))
    lock.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
