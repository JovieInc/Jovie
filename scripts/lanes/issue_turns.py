"""Fair share of a provider seat between PR repairs and new Linear issues.

2026-11-07: the worker took a red or adoptable PR whenever one existed and only looked for an
issue when none did. With dozens of red PRs failing on the same host blockers (Git 2.43, a red
size guard on main), the issues filed to fix those blockers never got a turn. After a turn that
served a repair, the next turn looks for an issue first. If that turn finds none, issue turns
pause for EMPTY_BACKOFF_S on this seat so repairs aren't slowed by empty scans.
"""
from __future__ import annotations

import time
from pathlib import Path

EMPTY_BACKOFF_S = 900


def _dir(state: Path) -> Path:
    return Path(state) / "issue-turns"


def due(state: Path, name: str, now: float | None = None, *, skip: bool = False) -> bool:
    """True when this provider's last turn served a repair and no recent issue turn came up empty.

    `skip` is set for maintenance-only seats, which never scan for issues: an issue turn there
    would waste a pass and start a false empty backoff (Sentry review on #24434)."""
    root = _dir(state)
    if skip:
        return False
    if not (root / f"{name}.repair").exists():
        return False
    try:
        empty_at = (root / f"{name}.empty").stat().st_mtime
    except OSError:
        return True
    return (time.time() if now is None else now) - empty_at >= EMPTY_BACKOFF_S


def record(state: Path, name: str, *, served_repair: bool, found_issue: bool, skip: bool = False) -> None:
    """Remember what this turn served. Best-effort: never blocks a turn. Maintenance-only seats
    (`skip`) share the provider's marker but never scan issues, so they leave it untouched."""
    root = _dir(state)
    if skip:
        return
    try:
        root.mkdir(parents=True, exist_ok=True)
        repair, empty = root / f"{name}.repair", root / f"{name}.empty"
        if served_repair:
            repair.touch()
            return
        repair.unlink(missing_ok=True)
        if found_issue:
            empty.unlink(missing_ok=True)
        else:
            empty.touch()
    except OSError:
        pass
