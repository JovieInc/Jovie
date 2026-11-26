"""Repo headroom: raise one doctor alert while origin/main leaves under 20% of its tracked-bytes budget free.

The budget is `maxTrackedBytes` in scripts/lib/repo-hygiene-limits.mjs, read from origin/main
so the alert and the hygiene guard never disagree. The count matches the guard and the
merge_group counter: tracked regular files only (modes 100644 and 100755), so symlinks and
submodules are skipped. One `git ls-tree` per tick, local and read-only. The alert opens the
usual "Symphony doctor: repo-headroom-low" issue in Triage, where Summer routes a prune of
dead or regenerable bytes (docs/ci/repository-health.md), never a raise of the budget.
"""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

LIMITS_PATH = "scripts/lib/repo-hygiene-limits.mjs"
HEADROOM_MIN_RATIO = 0.2
REGULAR_MODES = frozenset({"100644", "100755"})
_MIB = 1024 * 1024
_BUDGET_RE = re.compile(r"maxTrackedBytes:\s*(\d+)\s*\*\s*MiB\b")


def budget_bytes(limits_source: str) -> int | None:
    """`maxTrackedBytes` from the limits module's source, or None when its shape changed."""
    match = _BUDGET_RE.search(limits_source or "")
    return int(match.group(1)) * _MIB if match else None


def tracked_bytes(ls_tree: str) -> int:
    """Sum of regular-file blob sizes in `git ls-tree -r -l` output."""
    total = 0
    for line in (ls_tree or "").splitlines():
        meta, _, _path = line.partition("\t")
        fields = meta.split()
        if len(fields) == 4 and fields[0] in REGULAR_MODES and fields[3].isdigit():
            total += int(fields[3])
    return total


def measure(repo: Path, ref: str = "origin/main", run=subprocess.run) -> dict:
    """{bytes, budget, ref} for `ref`, or {error} when git or the limits file can't be read."""
    try:
        limits = run(["git", "-C", str(repo), "show", f"{ref}:{LIMITS_PATH}"],
                     capture_output=True, text=True, timeout=30)
        tree = run(["git", "-C", str(repo), "ls-tree", "-r", "-l", ref],
                   capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.SubprocessError) as error:
        return {"error": f"git unavailable: {str(error)[:80]}"}
    if getattr(limits, "returncode", 1) != 0 or getattr(tree, "returncode", 1) != 0:
        return {"error": f"{ref} unreadable in {repo}"}
    budget = budget_bytes(limits.stdout)
    if budget is None:
        return {"error": f"maxTrackedBytes not found in {ref}:{LIMITS_PATH}"}
    return {"bytes": tracked_bytes(tree.stdout), "budget": budget, "ref": ref}


def alert_line(observed: dict | None) -> str | None:
    """One-line cause while free space is under HEADROOM_MIN_RATIO of the budget, else None."""
    if not isinstance(observed, dict) or observed.get("error"):
        return None
    used, budget = observed.get("bytes"), observed.get("budget")
    if not isinstance(used, int) or not isinstance(budget, int) or budget <= 0:
        return None
    free = budget - used
    if free >= budget * HEADROOM_MIN_RATIO:
        return None
    floor = int(budget * (1 - HEADROOM_MIN_RATIO))
    return (f"{observed.get('ref', 'origin/main')} tracks {used} of {budget} budget bytes "
            f"({used / budget * 100:.2f}% used, {free / budget * 100:.2f}% free, under the "
            f"{HEADROOM_MIN_RATIO:.0%} headroom line); Summer: route a prune of dead or regenerable "
            f"bytes down to {floor} (docs/ci/repository-health.md), never a budget raise")
