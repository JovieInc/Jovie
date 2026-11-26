"""Carry worktree hold evidence across partial linked sweeps, separately from cadence."""
from __future__ import annotations

import json
from pathlib import Path

SWEEP_REPORT = "worktree-sweep.json"
SWEEP_LAUNCH = "worktree-sweep-launch.json"


def read_stamp(path: Path) -> dict:
    try:
        data = json.loads(path.read_text())
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def started_at(state: Path) -> float:
    for key in (SWEEP_LAUNCH, SWEEP_REPORT):
        started = read_stamp(state / key).get("startedAt")
        if isinstance(started, (int, float)) and not isinstance(started, bool):
            return started
    return 0


class HoldLedger:
    def __init__(self, state: Path | None, *, repositories_present: bool):
        stamp = read_stamp(state / SWEEP_REPORT) if state is not None else {}
        rows = stamp.get("secretHeld")
        self.unproven_visit = not repositories_present
        self.held: dict[str, dict] = {}
        for row in rows if isinstance(rows, list) else []:
            if (not isinstance(row, dict) or not isinstance(row.get("path"), str)
                    or not (path := Path(row["path"])).is_absolute() or "\x00" in row["path"]):
                continue
            try:
                path.lstat()
            except FileNotFoundError:
                continue
            except OSError:
                pass  # unknown filesystem state is not evidence of removal
            self.held[str(path)] = row

    def visited(self, path: Path, verified: bool) -> None:
        if verified:
            self.held.pop(str(path), None)
        else:
            self.unproven_visit = True

    def finish(self, report: dict) -> dict:
        self.held.update((row["path"], row) for row in report["secretHeld"])
        report["secretHeld"] = [self.held[path] for path in sorted(self.held)]
        incomplete = self.unproven_visit or report["errors"] or report.get("budgetSpent") or report.get("drained")
        # Even last sweep's known census says nothing about newly held or unvisited worktrees.
        report["secretHeldCoverage"] = "unknown" if incomplete else "known"
        return report
