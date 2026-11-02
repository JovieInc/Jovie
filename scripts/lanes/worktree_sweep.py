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
  checkout is untouched) and pushed as `refs/jovie-preserved/sweep/<host>/<name>-<date>-<snapshot>`
  (never a branch). A snapshot that is not proven secret-free is not published and the
  checkout stays untouched. If the push fails, the checkout stays and loses only
  regenerable build output.
- Preserved repairs (`.jovie-preserved-repair.json`) expire once their PR is closed or
  after `preserved_ttl_s`, through the same backup-then-remove path.
- Standalone clones (own `.git` directory: ship workspaces, `bindings/*/worktrees/*`,
  `runs/owner-*/checkout`) retire after 7 idle days only when clean, fully published (on a remote,
  or already applied to origin/main) and unreferenced; each removal is logged to
  `disk-reclaim.jsonl` first. A `.sweep-keep` file in a checkout exempts it.
- Every run publishes per-volume headroom (`disk-headroom.json`, alarm events in `host-alarms.jsonl`
  at 70% warn / 85% crit) and, daily, `disk-report.json` with the biggest growers.
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

sys.path.insert(0, str(Path(__file__).resolve().parent))
from disk_guard import LOW_PCT as DISK_LOW_PCT, ensure_sbin_on_path  # noqa: E402  (sibling module of the release)
import git_housekeeping  # noqa: E402  (detached git maintenance vs cleanup)
import lifecycle  # noqa: E402
import pathlib as _pl, sys as _sys  # noqa: E402
_sys.path[:0] = [p for p in [str(_pl.Path(__file__).resolve().parent)] if p not in _sys.path]  # sibling module of the release
from atomic_state import atomic_write_text  # noqa: E402

PRESERVED_REPAIR = ".jovie-preserved-repair.json"
IDLE_S = 12 * 3600
CLOSED_GRACE_S = 3600
PRESERVED_TTL_S = 3 * 86400
INTERVAL_S = 3600
LINKED_SWEEP_BUDGET_S = 20 * 60  # linked-worktree phase; the standalone reclaim runs after it, always
LOW_INTERVAL_S = 600
# Regenerable output, plus per-checkout pnpm stores (never the shared store, which lives outside checkouts).
BUILD_DIRS = frozenset({"node_modules", ".next", ".turbo", "test-results", ".build", "DerivedData",
                        ".pnpm-store", ".pnpm-store-private"})
# Retired Elixir workspaces used this private store. Keep its cache bytes out of backups.
LEGACY_PRIVATE_STORE = ".symphony/package-cache/pnpm-store"
# Generated outputs and archive blobs never belong in a snapshot: JovieInc/Jovie is public and
# refs/jovie-preserved/* is fetchable. On 2026-10-09 an `add -A` snapshot carried 1.3 GB of
# outputs/ tarballs and builds (48 scanner hits, the weekly full scan red since 10-12).
ARCHIVE_GLOBS = ("*.tar.gz", "*.tgz", "*.tar", "*.tar.bz2", "*.tar.xz", "*.zip", "*.7z")
EXCLUDE = [f":(exclude,glob)**/{name}/**" for name in sorted(BUILD_DIRS)] + [f":(exclude){PRESERVED_REPAIR}",
                                                                          ":(exclude).codex-last-message.txt",
                                                                          f":(exclude){LEGACY_PRIVATE_STORE}",
                                                                          ":(exclude,glob)outputs/**"] + [
    f":(exclude,glob)**/{pattern}" for pattern in ARCHIVE_GLOBS]


def default_roots(home: Path, state: Path) -> list[Path]:
    """Where agent checkouts live; anything else is out of scope."""
    return [state / "worktrees", state / "bindings", home / ".codex/worktrees", home / "conductor/workspaces",
            home / "jovie-worktrees", home / "worktrees", home / "LogYourBody-wt",
            home / "jovie-wt-*", Path("/private/tmp/claude-501"), Path("/private/tmp/jovie-*"),
            home / "codex-worktrees", home / "grok-wt", home / "grok-ship-workspaces",
            home / "codex-ship-workspaces", home / "wt-*", Path("/srv/worktrees/codex-worktrees")]


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
    merged = git_housekeeping.apply_housekeeping_env({**os.environ, **(env or {})})
    return run(["git", "-C", str(path), *args], capture_output=True, text=True, timeout=timeout,
               env=merged)


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


# Same namespace as lane_runner.PRESERVED_ARCHIVE_REF. A sweep snapshot is never a branch:
# refs/heads/backup/* pushes started GitHub Actions and Vercel builds (77 queued on
# 2026-10-20, stalling production); refs/jovie-preserved/* trigger neither.
PRESERVED_REF = "refs/jovie-preserved/"


def sweep_prefix() -> str:
    """`sweep/<host>` under PRESERVED_REF (`sweep/mac` on a Mac)."""
    return "sweep/mac" if sys.platform == "darwin" else f"sweep/{os.uname().nodename.split('.')[0]}"


class SnapshotHeld(RuntimeError):
    """The snapshot must not be published (secret finding, or the scan could not prove it
    clean). Callers keep the checkout exactly as it is: no strip, no removal."""

    def __init__(self, name: str, reason: str):
        super().__init__(f"{name}: {reason}")
        self.name, self.reason = name, reason


SCAN_TIMEOUT_S = 600
TRUFFLEHOG_FINDINGS = 183  # trufflehog --fail exit code when it found results


def scanner(name: str) -> str | None:
    found = shutil.which(name)
    if found:
        return found
    local = Path.home() / ".local/bin" / name
    return str(local) if local.is_file() and os.access(local, os.X_OK) else None


def scan_snapshot(path: Path, run, remote: str, sha: str) -> str | None:
    """None only when gitleaks and trufflehog both prove base..sha clean. Fail closed:
    a missing scanner, unknown base or scanner error is a reason to hold."""
    trufflehog, gitleaks = scanner("trufflehog"), scanner("gitleaks")
    if not trufflehog or not gitleaks:
        return "scan-unavailable"
    base = None
    for candidate in (f"refs/remotes/{remote}/HEAD", f"refs/remotes/{remote}/main"):
        found = git(path, run, "merge-base", sha, candidate)
        if found.returncode == 0 and found.stdout.strip():
            base = found.stdout.strip()
            break
    if base is None:
        return "scan-base-unknown"
    if base == sha:
        return None
    # trufflehog --branch takes a commit SHA or short branch name: a full ref path
    # (refs/...) silently scans nothing and exits 0 (probed on Gem, trufflehog 3.95.5).
    try:
        truffle = run([trufflehog, "git", f"file://{path}", "--branch", sha, "--since-commit", base,
                       "--no-verification", "--fail", "--no-update", "--json"],
                      capture_output=True, text=True, timeout=SCAN_TIMEOUT_S)
        leaks = run([gitleaks, "git", str(path), "--log-opts", f"{base}..{sha}", "--no-banner",
                     "--redact", "--exit-code", "1"],
                    capture_output=True, text=True, timeout=SCAN_TIMEOUT_S)
    except (OSError, subprocess.SubprocessError) as error:
        return f"scan-failed:{type(error).__name__}"
    if truffle.returncode == TRUFFLEHOG_FINDINGS:
        return "secret-finding:trufflehog"
    if leaks.returncode == 1:
        return "secret-finding:gitleaks"
    if truffle.returncode != 0 or leaks.returncode != 0:
        return f"scan-failed:trufflehog={truffle.returncode},gitleaks={leaks.returncode}"
    return None


def backup(path: Path, info: dict, run, prefix: str, date: str) -> str | None:
    """Snapshot the checkout (tracked + untracked, minus build output) to
    refs/jovie-preserved/<prefix>/<name>-<date>-<snapshot>; returns that full ref.
    Raises SnapshotHeld when the snapshot is not proven secret-free (the ref is public)."""
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
    if held := scan_snapshot(path, run, info["remote"], sha):
        raise SnapshotHeld(name, held)
    # Leave room for the date, snapshot and Git's ref lock suffix on long checkout names.
    name = re.sub(r"[^A-Za-z0-9._-]", "-", name)[:160]
    ref = f"{PRESERVED_REF}{prefix}/{name}-{date}-{sha}"
    # Same-named checkouts and repeated sweeps must never overwrite an earlier snapshot.
    # The empty expected value permits only creation (or an already identical ref),
    # including when another writer races this push. Normal pre-push hooks still run.
    pushed = git(path, run, "push", "-q", f"--force-with-lease={ref}:", info["remote"],
                 f"{sha}:{ref}", timeout=900)
    return ref if pushed.returncode == 0 else None


def strip_build_dirs(path: Path) -> None:
    for root, dirs, _files in os.walk(path):
        keep = []
        for name in dirs:
            if name in BUILD_DIRS or (Path(root) / name).relative_to(path).as_posix() == LEGACY_PRIVATE_STORE:
                shutil.rmtree(Path(root) / name, ignore_errors=True)
            elif name != ".git":
                keep.append(name)
        dirs[:] = keep


def preserved_age(path: Path, now: float) -> float | None:
    try:
        return now - (path / PRESERVED_REPAIR).stat().st_mtime
    except OSError:
        return None


def cleanup_preserved(path: Path) -> bool:
    """A marker written by cleanup (reasons all `cleanup-*`), not by a cancelled repair."""
    try:
        reasons = json.loads((path / PRESERVED_REPAIR).read_text()).get("reason")
    except (OSError, ValueError, AttributeError):
        return False
    return isinstance(reasons, list) and bool(reasons) and all(
        isinstance(reason, str) and reason.startswith("cleanup-") for reason in reasons)


def decide(path: Path, branch: str | None, info: dict, now: float, closed: set[str], *,
           idle_s: float, preserved_ttl_s: float) -> str | None:
    """Why this checkout may retire now, or None to keep it."""
    idle = now - info["activity"]
    age = preserved_age(path, now)
    closed_pr = branch is not None and branch in closed
    if age is not None:
        if closed_pr and idle >= CLOSED_GRACE_S:
            return "preserved-pr-closed"
        # Cleanup preserved it only because its source looked unverified; once it is provably
        # clean and published, keeping it just locks the PR branch against every repair.
        if cleanup_preserved(path) and info["dirty"] == 0 and info["unpushed"] == "0" and idle >= CLOSED_GRACE_S:
            return "preserved-clean"
        return "preserved-expired" if age >= preserved_ttl_s and idle >= idle_s else None
    if closed_pr and idle >= CLOSED_GRACE_S:
        return "pr-closed"
    return "idle" if idle >= idle_s else None


def retire(repo: Path, path: Path, branch: str | None, live: set[Path], report: dict, *, run, now: float,
           closed: set[str], idle_s: float, preserved_ttl_s: float, prefix: str, date: str) -> None:
    if busy(path, live) or (path / ".sweep-keep").exists():
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
        try:
            saved = backup(path, info, run, prefix, date)
        except SnapshotHeld as held:
            # Keep the checkout untouched (no strip): the doctor raises sweep-snapshot-secret.
            report["kept"] += 1
            report.setdefault("secretHeld", []).append({"name": held.name, "path": str(path),
                                                        "reason": held.reason})
            return
        if not saved:
            strip_build_dirs(path)
            report["stripped"].append(str(path))
            return
        report["backups"].append(saved)
    removed, error = git_housekeeping.remove_linked_worktree(
        lambda args: git(repo, run, *args, timeout=900), path)
    if removed:
        report["removed"].append({"path": str(path), "reason": reason})
    else:
        report["errors"].append(f"remove:{path}:{error[:120]}")


def sweep(repos: list[Path], roots: list[Path], never: list[Path], *, run=lifecycle.run,
          now: float | None = None, closed: dict[Path, set[str]] | None = None, idle_s: float = IDLE_S,
          preserved_ttl_s: float = PRESERVED_TTL_S, prefix: str = "sweep/mac",
          date: str | None = None, state: Path | None = None, budget_s: float | None = None,
          clock=time.monotonic) -> dict:
    now = time.time() if now is None else now
    deadline = None if budget_s is None else clock() + budget_s
    date = date or datetime.fromtimestamp(now, timezone.utc).strftime("%Y%m%d")
    closed = closed or {}
    report = {"at": datetime.fromtimestamp(now, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
              "removed": [], "backups": [], "stripped": [], "kept": 0, "errors": []}
    def yield_to_drain():
        if state is not None and lifecycle.draining(state):
            report["drained"] = True
            return True
        if deadline is not None and clock() > deadline:
            # Retention starved 2026-10-25..11-01: this phase backs up and secret-scans dirty checkouts
            # one by one (up to the gate timeout each) and ran for hours, so the standalone-clone
            # reclaim, headroom alarm and daily report after it never ran. A spent budget ends the
            # phase; the next interval resumes where it stopped.
            report["budgetSpent"] = True
            return True
        return False

    if yield_to_drain():
        return report
    live = live_paths(run)
    if live is None:
        report["errors"].append("process-state-unavailable")
        return report
    for repo in repos:
        if yield_to_drain():
            return report
        try:
            entries = linked_worktrees(repo, run)
        except (OSError, subprocess.SubprocessError) as error:
            report["errors"].append(f"list:{repo}:{type(error).__name__}")
            continue
        for path, branch in entries:
            # A retirement is one unit: finish its preservation/removal before
            # yielding, retaining the inherited lifecycle lease throughout.
            if yield_to_drain():
                return report
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
        if yield_to_drain():
            return report
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
    interval = LOW_INTERVAL_S if free_pct is not None and free_pct <= DISK_LOW_PCT else INTERVAL_S
    if now - last < interval:
        return "not-due"
    state.mkdir(parents=True, exist_ok=True)
    atomic_write_text(stamp, json.dumps({"startedAt": now}))
    subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "--state", str(state), "--repo", str(repo)],
                     stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                     start_new_session=True, **lifecycle.spawn_kwargs())
    return "spawned"


# ---- standalone clones, volume headroom and the daily disk report (gem disk incident 2026-10-24) ----
# Standalone clones (own `.git` directory) are invisible to the linked-worktree sweep above: legacy
# grok/codex ship workspaces, lanes `bindings/*/worktrees/*` and `runs/owner-*/checkout` held ~130 GB
# nobody retired. They get the same safety bar: clean (untracked included), nothing unpublished on
# any branch, no stash, no linked worktrees, no live process, idle for STANDALONE_IDLE_S.
STANDALONE_IDLE_S = 7 * 86400
KEEP_MARKER = ".sweep-keep"
ARTIFACT_IDLE_S = 24 * 3600
# Retired lane roots: nothing dispatches there any more, so build output is dead weight even
# when the clone itself cannot be deleted yet (unpublished work awaiting archive).
RETIRED_ROOT_GLOBS = ("grok-ship-workspaces/*/*", "codex-ship-workspaces/*/*", "grok-wt/*")
HEADROOM_WARN_PCT = 70
HEADROOM_CRIT_PCT = 85
REPORT_INTERVAL_S = 86400
STATE_REF_MAX_BYTES = 8 * 1024 * 1024


def standalone_globs(home: Path, state: Path) -> list[tuple[Path, str]]:
    return [(home, "grok-ship-workspaces/*/*"), (home, "codex-ship-workspaces/*/*"), (home, "grok-wt/*"),
            (home, "codex-worktrees/*"), (home, "wt-*"), (Path("/srv/worktrees"), "codex-worktrees/*"), (state, "bindings/*/worktrees/*"),
            (state, "runs/owner-*/checkout")]


def standalone_candidates(home: Path, state: Path, repos: list[Path]) -> list[Path]:
    """Directories matching a standalone glob that own a `.git` directory (linked worktrees have a file)."""
    skip = {repo.resolve() for repo in repos}
    found: list[Path] = []
    for base, pattern in standalone_globs(home, state):
        for path in sorted(base.glob(pattern)):
            try:
                if (path / ".git").is_dir() and path.resolve() not in skip and path not in found:
                    found.append(path)
            except OSError:
                continue
    return found


def unpublished(path: Path, run) -> str | None:
    """Reason this clone holds commits no remote has, else None. Unreadable git state counts as unpublished."""
    refs = git(path, run, "for-each-ref", "--format=%(objectname)", "refs/remotes")
    if refs.returncode != 0:
        return "refs-unreadable"
    shas = sorted(set(refs.stdout.split()))
    valid: list[str] = []
    if shas:
        # Lanes clones carry dangling remote refs (objects living in an alternate); only real commits count.
        valid = [sha for sha in shas if git(path, run, "cat-file", "-e", f"{sha}^{{commit}}").returncode == 0]
    tips = git(path, run, "for-each-ref", "--format=%(objectname)", "refs/heads")
    head = git(path, run, "rev-parse", "HEAD")
    if tips.returncode != 0 or head.returncode != 0:
        return "rev-list-failed"
    main_tree = git(path, run, "rev-parse", "origin/main^{tree}").stdout.strip()
    open_tips = 0
    for tip in dict.fromkeys([*tips.stdout.split(), head.stdout.strip()]):
        ahead = git(path, run, "rev-list", "--count", tip, "--not", *valid)
        if ahead.returncode != 0:
            return "rev-list-failed"
        if ahead.stdout.strip() == "0":
            continue
        # Squash-merged work has no remote SHA; merging it into main changes nothing when it already landed.
        merged = git(path, run, "merge-tree", "--write-tree", "origin/main", tip)
        if main_tree and merged.returncode == 0 and merged.stdout.split("\n")[0] == main_tree:
            continue
        open_tips += 1
    return None if open_tips == 0 else f"{open_tips}-unpublished"


def state_references(state: Path, name: str) -> bool:
    """True when a lanes state file (json/jsonl/lock directly under state) mentions the checkout name."""
    needle = name.encode()
    for pattern in ("*.json", "*.jsonl", "*.lock"):
        for file in state.glob(pattern):
            try:
                if file.stat().st_size <= STATE_REF_MAX_BYTES and needle in file.read_bytes():
                    return True
            except OSError:
                continue
    return False


def newest_touch(path: Path) -> float:
    newest = 0.0
    for rel in (".", ".git/HEAD", ".git/index", ".git/logs/HEAD", ".git/FETCH_HEAD"):
        try:
            newest = max(newest, (path / rel).stat().st_mtime)
        except OSError:
            continue
    return newest


def standalone_verdict(path: Path, live: set[Path], run, now: float, state: Path, idle_s: float) -> str | None:
    """None when the clone may be deleted, else the first check it failed."""
    if (path / KEEP_MARKER).exists():
        return "keep-marker"
    if busy(path, live):
        return "busy"
    if now - newest_touch(path) < idle_s:
        return "recent"
    if path.name == "checkout" and not (path.parent / "receipt.json").exists():
        return "no-receipt"
    listing = git(path, run, "worktree", "list", "--porcelain")
    if listing.returncode != 0 or listing.stdout.count("worktree ") != 1:
        return "linked-worktrees"
    info = inspect(path, run)
    if info is None or info["dirty"]:
        return "dirty"
    stash = git(path, run, "stash", "list")
    if stash.returncode != 0 or stash.stdout.strip():
        return "stash"
    reason = unpublished(path, run)
    if reason and info["remote"]:
        # Stale remote-tracking refs make merged work look unpublished; one fetch settles it.
        git(path, run, "fetch", "-q", "--prune", info["remote"], timeout=300)
        reason = unpublished(path, run)
    if reason:
        return reason
    ref = path.parent.name if path.name == "checkout" else path.name
    if state_references(state, ref):
        return "state-referenced"
    return None


def tree_kib(path: Path, run) -> int | None:
    try:
        result = run(["du", "-sk", "--", str(path)], capture_output=True, text=True, timeout=300)
    except (OSError, subprocess.SubprocessError):
        return None
    try:
        return int(result.stdout.split()[0])
    except (IndexError, ValueError):
        return None


def retired_root(home: Path, path: Path) -> bool:
    return any(path in home.glob(pattern) for pattern in RETIRED_ROOT_GLOBS)


def prune_artifacts(path: Path) -> int:
    """Remove regenerable build output from a kept clone; tracked and untracked sources stay. Returns KiB freed."""
    freed = 0
    for root, dirs, _files in os.walk(path):
        keep = []
        for name in dirs:
            if name in BUILD_DIRS:
                target = Path(root) / name
                try:
                    freed += sum(f.stat().st_size for f in target.rglob("*") if f.is_file() and not f.is_symlink()) // 1024
                except OSError:
                    pass
                shutil.rmtree(target, ignore_errors=True)
            elif name != ".git":
                keep.append(name)
        dirs[:] = keep
    return freed


def sweep_standalone(home: Path, state: Path, repos: list[Path], never: list[Path], *, run=lifecycle.run,
                     now: float | None = None, idle_s: float = STANDALONE_IDLE_S,
                     remove=shutil.rmtree) -> dict:
    """Delete clean, fully published, idle standalone clones; log each removal (with its size) first."""
    now = time.time() if now is None else now
    report = {"removed": [], "kept": {}, "errors": [], "freedKiB": 0}
    live = live_paths(run)
    if live is None:
        report["errors"].append("process-state-unavailable")
        return report
    log = state / "disk-reclaim.jsonl"
    for path in standalone_candidates(home, state, repos):
        if lifecycle.draining(state):
            report["drained"] = True
            break
        if any(path == n or n in path.parents for n in never):
            continue
        try:
            verdict = standalone_verdict(path, live, run, now, state, idle_s)
            if verdict:
                report["kept"][verdict] = report["kept"].get(verdict, 0) + 1
                if verdict not in {"busy", "keep-marker", "state-referenced"} and retired_root(home, path) \
                        and now - newest_touch(path) >= ARTIFACT_IDLE_S:
                    freed = prune_artifacts(path)
                    if freed:
                        report["artifactsFreedKiB"] = report.get("artifactsFreedKiB", 0) + freed
                continue
            size = tree_kib(path, run)
            entry = {"at": datetime.fromtimestamp(now, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                     "path": str(path), "kib": size,
                     "checks": ["clean", "no-stash", "published", "no-linked-worktrees", "no-live-process",
                                f"idle>={int(idle_s)}s", "not-in-state"]}
            with open(log, "a") as handle:  # logged before deletion
                handle.write(json.dumps(entry) + "\n")
            remove(path)
            report["removed"].append(str(path))
            report["freedKiB"] += size or 0
        except (OSError, subprocess.SubprocessError) as error:
            report["errors"].append(f"{path}:{type(error).__name__}"[:200])
    return report


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


def guarded_main(args) -> int:
    ensure_sbin_on_path()
    home = Path.home()
    args.state.mkdir(parents=True, exist_ok=True)
    with open(args.state / "disk-cleanup.lock", "a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return 0  # disk_guard or an earlier sweep owns cleanup
        repos = default_repos(home, args.repo)
        closed = {}
        for repo in repos:
            if lifecycle.draining(args.state):
                break
            closed[repo] = closed_branches(repo, subprocess.run)
        prefix = sweep_prefix()
        # Alarm input first: it is a few statvfs calls and must not wait behind hours of cleanup.
        publish_headroom(args.state, headroom(volumes(home, args.state)), time.time())
        report = sweep(repos, default_roots(home, args.state), default_never(home),
                       closed=closed, prefix=prefix, state=args.state, budget_s=LINKED_SWEEP_BUDGET_S)
        if not report.get("drained") and not lifecycle.draining(args.state):
            report["standalone"] = sweep_standalone(home, args.state, repos, default_never(home))
            now = time.time()
            publish_headroom(args.state, headroom(volumes(home, args.state)), now)
            report["dailyReport"] = daily_report(home, args.state, now)
    stamp = args.state / "worktree-sweep.json"
    try:
        started = json.loads(stamp.read_text()).get("startedAt")
    except (OSError, ValueError, AttributeError):
        started = None
    atomic_write_text(stamp, json.dumps({"startedAt": started or time.time(), **report}, indent=1))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--state", type=Path, default=Path(os.environ.get(
        "LANES_STATE", Path.home() / ".local/state/jovie-lanes")))
    parser.add_argument("--repo", type=Path, default=Path(os.environ.get(
        "LANES_REPO", Path.home() / "devin-sweep/Jovie")))
    args = parser.parse_args(argv)
    try:
        with lifecycle.Guard(args.state):
            return guarded_main(args)
    except lifecycle.AdmissionHeld as error:
        print(f"lifecycle admission held: {error}", file=sys.stderr)
        return 75


if __name__ == "__main__":
    sys.exit(main())
