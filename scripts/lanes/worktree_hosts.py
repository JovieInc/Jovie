#!/usr/bin/env python3
"""Which hosts may create lane worktrees, and how many at once (JOV-10172).

A lane checkout is the biggest per-host disk cost this harness creates: one installed
Jovie worktree is ~4.3 GiB (node_modules plus the turbo/tsc caches), and the Mac's
disk filled at ~85 GiB/day while every host's tick spawned the same local lanes. The
policy is gem-first: only the hosts named in LANES_WORKTREE_HOSTS (default `gem`) may
create lane worktrees, and every host after the first is an explicit fallback that is
additionally capped at LANES_MAX_WORKTREES concurrent checkouts of the repository.
Remote-only lanes (a provider with `repairs: false` or `remote: true`, e.g. the
Hyperagent lane) never create a local worktree and stay available on any host.

Pure policy: no I/O at import, every branch is unit-tested; the one git read
(counting a repository's linked worktrees) is injected so tests and the tick can
supply their own runner. The dispatch tick publishes `worktree_hosts.status()` as
`tick.worktreeHosts` so a denied host is visible in the HUD instead of silently idle.

The release self-test and hosted CI run the lane suite on arbitrary hostnames with
`LANES_SELFTEST=1` (or `LANES_EXECUTION_BACKEND=local-test`), never on gem: those
runs are the primary host for the duration of the test, the same fixture
`execution_coordination()` uses. Production ticks set neither variable.
"""
from __future__ import annotations

import os
import re

HOSTS_ENV = "LANES_WORKTREE_HOSTS"
MAX_WORKTREES_ENV = "LANES_MAX_WORKTREES"
DEFAULT_HOSTS = "gem"
DEFAULT_MAX_WORKTREES = 3
_SPLIT = re.compile(r"[\s,]+")


def _short(name: str) -> str:
    return str(name or "").split(".")[0].strip().lower()


def hosts(environ=None) -> list[str]:
    """Hosts allowed to create lane worktrees, primary first; default `gem` only.

    Entries are normalized to short lowercased names (a `Tims-MacBook-Pro.local`
    listing matches the host that reports itself as `Tims-MacBook-Pro`). An unset,
    empty or unreadable value is the default, never open: fail closed."""
    raw = (environ or os.environ).get(HOSTS_ENV) or DEFAULT_HOSTS
    names = [name for name in (_short(part) for part in _SPLIT.split(str(raw))) if name]
    return list(dict.fromkeys(names)) or [DEFAULT_HOSTS]


def _selftest(environ=None) -> bool:
    env = environ or os.environ
    return env.get("LANES_SELFTEST") == "1" or env.get("LANES_EXECUTION_BACKEND") == "local-test"


def role(host_name: str, environ=None) -> str:
    """"primary" (first allowed host), "fallback" (a later one) or "not-owner".

    A self-test environment (CI, the release gate) is primary for whatever host it
    runs on: the suite must exercise the real checkout paths off gem too."""
    if _selftest(environ):
        return "primary"
    listed = hosts(environ)
    short = _short(host_name)
    if short and short in listed:
        return "primary" if listed.index(short) == 0 else "fallback"
    return "not-owner"


def allowed(host_name: str, environ=None) -> bool:
    return role(host_name, environ) != "not-owner"


def max_worktrees(host_name: str, environ=None):
    """Concurrent-checkout cap for this host; None (uncapped) on the primary.

    The primary host's concurrency is already bounded by worker slots and autoscale;
    the cap exists so an explicitly added fallback host cannot fill its own disk."""
    if role(host_name, environ) != "fallback":
        return None
    raw = str((environ or os.environ).get(MAX_WORKTREES_ENV) or DEFAULT_MAX_WORKTREES)
    try:
        cap = int(raw)
    except ValueError:
        return DEFAULT_MAX_WORKTREES
    return cap if cap > 0 else DEFAULT_MAX_WORKTREES


def lane_needs_worktree(spec: dict) -> bool:
    """False only for remote-only lanes, which never check out code locally."""
    return not (spec.get("remote") is True or spec.get("repairs") is False)


def spawn_allowed(host_name: str, spec: dict, environ=None) -> bool:
    """May this host spawn workers of this lane? Remote lanes run anywhere;
    checkout lanes only on an allowed host (the cap is enforced per run, at creation)."""
    return not lane_needs_worktree(spec) or allowed(host_name, environ)


def count_worktrees(repo, run) -> int | None:
    """Linked worktrees of `repo` (every location: run checkouts, pool slots);
    None when git could not answer — unknown never authorizes more."""
    try:
        result = run(["git", "-C", str(repo), "worktree", "list", "--porcelain"],
                     capture_output=True, text=True, timeout=60)
    except Exception:
        return None
    if result.returncode != 0:
        return None
    # The first entry is the primary checkout; every later block is one linked worktree.
    # An empty or main-only-less listing is not a real answer (git always prints the
    # primary checkout), so it reads as unknown: fail closed.
    count = sum(1 for line in result.stdout.splitlines() if line.startswith("worktree ")) - 1
    return count if count >= 0 else None


def admission(host_name: str, repo, run, environ=None):
    """None when this host may create one more lane worktree now, else the reason.

    The primary host is always admitted (slots govern it); a fallback host is
    admitted only under its cap, fail-closed when the count is unreadable."""
    where = role(host_name, environ)
    if where == "primary":
        return None
    if where == "not-owner":
        return f"worktree-host-not-allowed:{_short(host_name) or 'unknown'}"
    cap = max_worktrees(host_name, environ)
    count = count_worktrees(repo, run)
    if count is None:
        return "worktree-count-unavailable"
    if count >= cap:
        return f"worktree-cap:{count}/{cap}"
    return None


def status(host_name: str, repo, run, environ=None) -> dict:
    """One row for the dispatch tick: the host's role and live checkout count."""
    row = {"host": _short(host_name) or "unknown", "role": role(host_name, environ),
           "hosts": hosts(environ)}
    if row["role"] == "fallback":
        row["maxWorktrees"] = max_worktrees(host_name, environ)
        row["worktrees"] = count_worktrees(repo, run)
    return row
