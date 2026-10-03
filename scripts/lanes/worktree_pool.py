#!/usr/bin/env python3
"""Ready-to-test worktrees in seconds: a small pool of pre-installed worktrees (JOV-7705).

A fresh `git worktree add` + `pnpm install` costs ~5 minutes on this repo under agent
load: pnpm materialises ~230k files per worktree and every one is a filesystem op,
whatever the import method. A pooled slot already has `node_modules` and a warm
`apps/web/.cache/tsbuildinfo`; taking one is a rename (`git worktree move`), a checkout
of the diff since the slot was built, and an incremental install (~35s measured).
Finished clean worktrees go back into the pool (`recycle`) instead of being deleted:
removing 230k files took 3 to 32 minutes per worktree under load (JOV-7723).

This is the local analogue of a Cursor cloud-agent Build snapshot: prepare the disk
once in the background, start every agent from the prepared disk.

    scripts/agent/worktree-new <dest> -b <branch> [--base origin/main]
    scripts/agent/worktree-new --fill [--size N]     # build slots (background-safe)
    scripts/agent/worktree-new --recycle <dir>       # done with a clean worktree: back to the pool
    scripts/agent/worktree-new --drain               # remove every idle slot
    scripts/agent/worktree-new --status

Every shared cache lives under one root, `$JOVIE_CACHE_ROOT` (default `~/.cache/jovie`).
The pool is regenerable: it never fills below MIN_FREE_GB, `disk_guard` drains it at
critical disk, and a slot older than SLOT_MAX_AGE_S is rebuilt. The pnpm store
(`pnpm store path`) is shared too and is never pruned while worktrees install from it.
"""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import os
import shutil
import subprocess
import sys
import time
import uuid
from pathlib import Path

CACHE_ROOT = Path(os.environ.get("JOVIE_CACHE_ROOT", Path.home() / ".cache" / "jovie"))
POOL_SIZE = int(os.environ.get("JOVIE_WORKTREE_POOL_SIZE", "2"))
MIN_FREE_GB = float(os.environ.get("JOVIE_WORKTREE_POOL_MIN_FREE_GB", "30"))
SLOT_MAX_AGE_S = 3 * 24 * 3600
# Same flags the lanes harness has always used: hardlinks from the shared store avoid
# the concurrent-install reflink race and cost no data blocks.
INSTALL = ["pnpm", "install", "--frozen-lockfile", "--prefer-offline", "--package-import-method=hardlink"]
WARM = ["pnpm", "--filter", "@jovie/web", "run", "typecheck"]
READY = ".ready"
PRESERVED_REPAIR = ".jovie-preserved-repair.json"  # disk_guard's marker; never recycle those
# Build output that would otherwise ride along into the next agent's checkout. Installed
# dependencies and the tsc cache (`.cache/`) are what make a slot worth keeping.
RECYCLE_KEEP = ["node_modules", ".cache"]
CLAIMED = ".claimed"
CLAIM_GRACE_S = 15 * 60


def enabled() -> bool:
    """Tests of callers (the lanes harness) must never consume a developer's real pool."""
    return os.environ.get("LANES_EXECUTION_BACKEND") != "local-test" and \
        os.environ.get("JOVIE_WORKTREE_POOL", "1") != "0"


def run(args: list[str], cwd: Path | None = None, log=None, timeout: int = 1800, env=None):
    if log is not None:
        log.write(f"$ {' '.join(args)[:300]}\n")
        log.flush()
    try:
        stream = log if log is not None and log.fileno() >= 0 else None
    except (AttributeError, OSError, ValueError):
        stream = None  # an in-memory log: capture, then copy the output in
    result = subprocess.run(args, cwd=cwd, stdout=stream or subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, timeout=timeout, env=env)
    if stream is None and log is not None:
        log.write(result.stdout or "")
    result.check_returncode()
    return result


def git_common_dir(repo: Path) -> Path:
    out = subprocess.run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], cwd=repo,
                         capture_output=True, text=True, check=True).stdout.strip()
    return Path(out).resolve()


def pool_dir(repo: Path, root: Path | None = None) -> Path:
    """One pool per repository object store, so two clones never trade slots."""
    key = hashlib.sha1(str(git_common_dir(repo)).encode()).hexdigest()[:12]
    return (root or CACHE_ROOT) / "worktree-pool" / key


def existing_parent(path: Path) -> Path:
    path = path.absolute()
    while not path.exists():
        path = path.parent
    return path


def same_volume(a: Path, b: Path) -> bool:
    """`git worktree move` is a rename; across volumes it would copy 4 GB instead."""
    return os.stat(existing_parent(a)).st_dev == os.stat(existing_parent(b)).st_dev


def free_gb(path: Path) -> float:
    return shutil.disk_usage(existing_parent(path)).free / 2**30


def ready_slots(pool: Path, now: float | None = None) -> list[Path]:
    """Fresh slots, newest first (the newest has the smallest checkout and install delta)."""
    now = time.time() if now is None else now
    slots = []
    for marker in pool.glob(f"*{READY}") if pool.exists() else []:
        slot = marker.with_suffix("")
        try:
            built = marker.stat().st_mtime
        except FileNotFoundError:
            continue  # claimed between glob and stat
        if slot.is_dir() and now - built < SLOT_MAX_AGE_S:
            slots.append((built, slot))
    return [slot for _built, slot in sorted(slots, reverse=True)]


def claim(slot: Path) -> bool:
    """Atomic: exactly one taker renames the ready marker. The claimed marker keeps a
    filler's stale sweep off the slot while `take` moves it out of the pool."""
    try:
        os.rename(slot.parent / f"{slot.name}{READY}", slot.parent / f"{slot.name}{CLAIMED}")
        return True
    except FileNotFoundError:
        return False


def release(slot: Path) -> None:
    (slot.parent / f"{slot.name}{CLAIMED}").unlink(missing_ok=True)


def recently_claimed(slot: Path, now: float) -> bool:
    try:
        return now - (slot.parent / f"{slot.name}{CLAIMED}").stat().st_mtime < CLAIM_GRACE_S
    except FileNotFoundError:
        return False


def branch_exists(repo: Path, branch: str) -> bool:
    return subprocess.run(["git", "rev-parse", "-q", "--verify", f"refs/heads/{branch}"], cwd=repo,
                          capture_output=True).returncode == 0


def is_clean(path: Path) -> bool:
    result = subprocess.run(["git", "status", "--porcelain"], cwd=path, capture_output=True, text=True)
    return result.returncode == 0 and not result.stdout.strip()


def remove_worktree(repo: Path, path: Path, log=None) -> None:
    try:
        run(["git", "worktree", "remove", "--force", str(path)], cwd=repo, log=log, timeout=600)
    except (subprocess.SubprocessError, OSError):
        pass  # already gone or never registered; the rmtree below covers both
    shutil.rmtree(path, ignore_errors=True)


def take(repo: Path, dest: Path, branch: str | None, base: str = "origin/main", log=None,
         sh=None, root: Path | None = None) -> str:
    """Create worktree `dest` on new `branch` (detached when None) from `base`.

    Returns "pool" when a pre-installed slot was used, else "fresh". `sh(args, cwd=, log=)`
    lets the lanes harness record (and its tests intercept) the fresh-path git call."""
    repo, dest = Path(repo), Path(dest)
    # An existing branch fails `worktree add -b` too; don't burn a slot to find out.
    try:
        pool = pool_dir(repo, root) if enabled() and not (branch and branch_exists(repo, branch)) else None
    except (subprocess.SubprocessError, OSError):
        pool = None  # not a git checkout: the fresh path reports the real error
    if pool is not None and same_volume(pool, dest):
        for slot in ready_slots(pool):
            if not claim(slot):
                continue
            try:
                run(["git", "worktree", "move", str(slot), str(dest)], cwd=repo, log=log, timeout=120)
            except (subprocess.SubprocessError, OSError):
                remove_worktree(repo, slot, log)
                continue
            finally:
                release(slot)
            try:
                if not is_clean(dest):
                    raise RuntimeError(f"pool slot {slot.name} was dirty")
                checkout = ["git", "checkout", "-q"] + (["-b", branch] if branch else ["--detach"]) + [base]
                run(checkout, cwd=dest, log=log, timeout=300)
                return "pool"
            except (subprocess.SubprocessError, OSError, RuntimeError) as error:
                if log is not None:
                    log.write(f"worktree-pool: discarding slot: {error}\n")
                remove_worktree(repo, dest, log)
    args = ["git", "worktree", "add", "-q"] + (["-b", branch] if branch else ["--detach"]) + [str(dest), base]
    result = (sh or (lambda a, cwd=None, log=None: run(a, cwd=cwd, log=log, timeout=600)))(args, cwd=repo, log=log)
    # The lanes `sh` records and returns instead of raising; a failed add must not
    # let the caller install into, and hand an agent, a directory that is not there.
    if getattr(result, "returncode", 0):
        raise subprocess.CalledProcessError(result.returncode, args, getattr(result, "stdout", ""))
    return "fresh"


def recycle(repo: Path, path: Path, base: str = "origin/main", size: int = POOL_SIZE, log=None,
            root: Path | None = None, min_free_gb: float = MIN_FREE_GB) -> str | None:
    """Return a finished worktree to the pool instead of deleting it. Returns the slot name,
    or None when it must be removed the normal way: pool off or full, low disk, another
    volume, a preserved repair, or any uncommitted change. The caller decides whether its
    commits are published; the branch ref itself survives in the repository either way."""
    repo, path = Path(repo), Path(path)
    try:
        if not enabled() or not path.is_dir() or (path / PRESERVED_REPAIR).exists() or not is_clean(path):
            return None
        pool = pool_dir(repo, root)
        if not same_volume(pool, path) or len(ready_slots(pool)) >= size or free_gb(pool) < min_free_gb:
            return None
        slot = pool / f"slot-{uuid.uuid4().hex[:8]}"
        run(["git", "checkout", "-q", "--detach", base], cwd=path, log=log, timeout=300)
        run(["git", "clean", "-ffdxq"] + [arg for keep in RECYCLE_KEEP for arg in ("-e", keep)],
            cwd=path, log=log, timeout=900)
        pool.mkdir(parents=True, exist_ok=True)
        run(["git", "worktree", "move", str(path), str(slot)], cwd=repo, log=log, timeout=120)
    except (subprocess.SubprocessError, OSError) as error:
        if log is not None:
            log.write(f"worktree-pool: not recycled: {error}\n")
        return None
    (pool / f"{slot.name}{READY}").touch()
    return slot.name


def fill(repo: Path, size: int = POOL_SIZE, base: str = "origin/main", warm: bool = True, log=None,
         root: Path | None = None, min_free_gb: float = MIN_FREE_GB) -> list[str]:
    """Top the pool up to `size` slots. One filler per pool (non-blocking lock); refuses
    to spend disk below `min_free_gb`. Returns the actions taken."""
    pool = pool_dir(repo, root)
    pool.mkdir(parents=True, exist_ok=True)
    actions: list[str] = []
    with open(pool / ".fill.lock", "w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return ["busy: another filler holds the lock"]
        fresh, now = set(ready_slots(pool)), time.time()
        for child in pool.iterdir():
            # Stale ready slots and half-built ones a crashed filler left behind; a slot
            # `take` is moving out right now keeps its claimed marker and is left alone.
            if child.is_dir() and child not in fresh and not recently_claimed(child, now):
                (pool / f"{child.name}{READY}").unlink(missing_ok=True)
                release(child)
                remove_worktree(repo, child, log)
                actions.append(f"removed stale {child.name}")
        subprocess.run(["git", "worktree", "prune"], cwd=repo, capture_output=True)
        while len(ready_slots(pool)) < size:
            if free_gb(pool) < min_free_gb:
                actions.append(f"stopped: {free_gb(pool):.0f} GiB free < {min_free_gb:.0f} GiB floor")
                break
            slot = pool / f"slot-{uuid.uuid4().hex[:8]}"
            try:
                run(["git", "worktree", "add", "-q", "--detach", str(slot), base], cwd=repo, log=log, timeout=600)
                run(INSTALL, cwd=slot, log=log)
                if warm:
                    # A warm tsbuildinfo turns the first web typecheck from ~2 min into ~30s.
                    # tsc writes it even when main has type errors, so a red check is fine.
                    subprocess.run(WARM, cwd=slot, stdout=log or subprocess.DEVNULL,
                                   stderr=subprocess.STDOUT, timeout=1800)
                if not is_clean(slot):
                    raise RuntimeError("install or warm-up left tracked changes")
            except (subprocess.SubprocessError, OSError, RuntimeError) as error:
                remove_worktree(repo, slot, log)
                actions.append(f"failed {slot.name}: {str(error)[:200]}")
                break
            (pool / f"{slot.name}{READY}").touch()
            actions.append(f"built {slot.name}")
    return actions


def drain(repo: Path, root: Path | None = None, log=None) -> list[str]:
    """Remove every idle slot (disk pressure). Slots being built stay with their filler."""
    pool = pool_dir(repo, root)
    removed = []
    for marker in list(pool.glob(f"*{READY}")) if pool.exists() else []:
        slot = marker.with_suffix("")
        if claim(slot):
            remove_worktree(repo, slot, log)
            release(slot)
            removed.append(slot.name)
    return removed


def shed(repo: Path, root: Path | None = None, min_free_gb: float = MIN_FREE_GB) -> list[str]:
    """Disk pressure: below the same floor `fill` refuses to build under, the pool goes,
    so a sweep and a refill never fight over the same gigabytes."""
    try:
        pool = pool_dir(repo, root)
    except (subprocess.SubprocessError, OSError):
        return []  # not a git checkout, so it has no pool
    if not pool.exists() or free_gb(pool) >= min_free_gb:
        return []
    return drain(repo, root)


def refill_in_background(repo: Path, log_path: Path | None = None) -> None:
    """Detached so the caller's agent starts now; the next caller finds a slot."""
    if not enabled():
        return
    log_path = log_path or pool_dir(repo) / "fill.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with open(log_path, "a") as log:
        subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "--repo", str(repo), "--fill"],
                         cwd=repo, stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                         start_new_session=True)


def node_env(worktree: Path) -> dict:
    """Prefer the `.nvmrc` Node when nvm has it, so installs match the repo's engines pin."""
    env = dict(os.environ)
    try:
        want = (worktree / ".nvmrc").read_text().strip().lstrip("v")
    except OSError:
        return env
    bin_dir = Path.home() / ".nvm" / "versions" / "node" / f"v{want}" / "bin"
    if bin_dir.is_dir():
        env["PATH"] = f"{bin_dir}{os.pathsep}{env.get('PATH', '')}"
    return env


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="worktree-new", description=__doc__.split("\n\n")[0])
    parser.add_argument("dest", nargs="?", type=Path)
    parser.add_argument("-b", "--branch")
    parser.add_argument("--base", default="origin/main")
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--no-fetch", action="store_true")
    parser.add_argument("--no-install", action="store_true")
    parser.add_argument("--no-refill", action="store_true")
    parser.add_argument("--fill", action="store_true")
    parser.add_argument("--size", type=int, default=POOL_SIZE)
    parser.add_argument("--no-warm", action="store_true")
    parser.add_argument("--drain", action="store_true")
    parser.add_argument("--recycle", type=Path, metavar="DIR")
    parser.add_argument("--status", action="store_true")
    args = parser.parse_args(argv)
    repo = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], cwd=args.repo, capture_output=True,
                               text=True, check=True).stdout.strip())
    os.environ.update(node_env(repo))
    if args.status:
        pool = pool_dir(repo)
        print(f"pool {pool}\nready {len(ready_slots(pool))}/{args.size}\nfree {free_gb(pool):.0f} GiB "
              f"(floor {MIN_FREE_GB:.0f})\nenabled {enabled()}")
        return 0
    if args.drain:
        print("\n".join(drain(repo)) or "pool empty")
        return 0
    if args.recycle:
        slot = recycle(repo, args.recycle, args.base, args.size, log=sys.stdout)
        if slot:
            print(f"worktree-new: {args.recycle} recycled into the pool as {slot}")
            return 0
        if not is_clean(args.recycle):
            print(f"worktree-new: {args.recycle} has uncommitted changes; left in place", file=sys.stderr)
            return 1
        remove_worktree(repo, args.recycle, sys.stdout)
        print(f"worktree-new: {args.recycle} removed (pool full, off, or low on disk)")
        return 0
    if args.fill:
        if not args.no_fetch:
            subprocess.run(["git", "fetch", "-q", "origin", "main"], cwd=repo)
        print("\n".join(fill(repo, args.size, args.base, warm=not args.no_warm, log=sys.stdout)) or "pool full")
        return 0
    if args.dest is None:
        parser.error("dest is required unless --fill, --drain, --recycle or --status")
    started = time.monotonic()
    if not args.no_fetch:
        run(["git", "fetch", "-q", "origin", "main"], cwd=repo, timeout=300)
    source = take(repo, args.dest, args.branch, args.base, log=sys.stdout)
    if not args.no_install:
        run(INSTALL, cwd=args.dest, log=sys.stdout, env=node_env(args.dest))
    if not args.no_refill:
        refill_in_background(repo)
    print(f"worktree-new: {args.dest} ready from {source} in {time.monotonic() - started:.0f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
