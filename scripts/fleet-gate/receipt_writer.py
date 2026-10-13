#!/usr/bin/env python3
"""Pick where Fleet Gate Refresh persists its receipt.

The lanes fleet-gate emitter (scripts/lanes/fleet_gate_emitter.py) is the one
writer of the canonical Gem receipt (state/gem-priority-gate/latest.json). The
Gem runner .env files fence Fleet Gate Refresh to a scratch state dir so it can
never clobber that receipt. Fleet Gate Refresh is the fallback writer: only
when the canonical receipt is missing, malformed, or older than
STALE_AFTER_SECONDS (the emitter or Gem is down) does it write canonical, so a
dead emitter can never freeze issue admission (2026-10-12: 19 h of
`controller-stale`).

A fresh receipt also means Fleet Gate Refresh does not run the gate at all
(one gate run is ~44 Jovie Bot API calls whose output would only land in
scratch). The emitter's receipt is snapshotted to `receipt_path` for the
stack-actions consumer instead.

Prints `mode=<emitter|fallback>`, `state_dir=<dir>`, `age_seconds=<n>` and, in
emitter mode, `receipt_path=<file>` lines for $GITHUB_OUTPUT.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

STALE_AFTER_SECONDS = 15 * 60
SCHEMA = "jovie-fleet-gate/v1"
DEFAULT_WORKSPACE = "/home/timwhite/gem-workspace"
SCRATCH_DIR_NAME = "gem-priority-gate-fleet-scratch"


def canonical_dir(workspace: str) -> Path:
    return Path(workspace, "state", "gem-priority-gate")


def read_receipt(receipt: Path, now: datetime) -> tuple[float, str] | None:
    """(age seconds, exact bytes) of a well-formed receipt; None when unusable."""
    try:
        text = receipt.read_text(encoding="utf-8")
        data = json.loads(text)
        observed = datetime.fromisoformat(str(data["observedAt"]).replace("Z", "+00:00"))
    except (OSError, ValueError, TypeError, KeyError):
        return None
    if data.get("schema") != SCHEMA or observed.tzinfo is None:
        return None
    age = (now - observed).total_seconds()
    return (age, text) if age >= 0 else None


def capacity_receipt_stale(
    receipt: Path, main_tip: str, now: datetime | None = None
) -> bool | None:
    """Whether the receipt's Capacity Workpad block is STALE.

    STALE when the capacity block's mainSha does not match the current main
    tip (the cohort was computed against an older main). None when the
    receipt or its capacity block is unusable (the caller fails closed).
    Fresh requires a well-formed receipt with a capacity block whose mainSha
    equals the live tip.
    """
    found = read_receipt(receipt, now or datetime.now(timezone.utc))
    if found is None:
        return None
    try:
        data = json.loads(found[1])
        capacity = data["capacity"]
    except (ValueError, TypeError, KeyError):
        return None
    if not isinstance(capacity, dict):
        return None
    main_sha = capacity.get("mainSha")
    if not isinstance(main_sha, str) or not main_sha:
        return None
    return main_sha != main_tip


def receipt_age_seconds(receipt: Path, now: datetime) -> float | None:
    found = read_receipt(receipt, now)
    return None if found is None else found[0]


def choose(workspace: str, fence: str, now: datetime, snapshot_dir: str = "") -> dict[str, str]:
    canonical = canonical_dir(workspace)
    found = read_receipt(canonical / "latest.json", now)
    age = None if found is None else found[0]
    if age is None or age > STALE_AFTER_SECONDS:
        return {
            "mode": "fallback",
            "state_dir": str(canonical),
            "age_seconds": "unknown" if age is None else str(int(age)),
        }
    # The emitter is live: stay inside the runner fence. An unfenced runner
    # falls back to the scratch dir, never to canonical.
    scratch = fence.strip() or str(Path(workspace, "state", SCRATCH_DIR_NAME))
    if Path(scratch).resolve() == canonical.resolve():
        scratch = str(Path(workspace, "state", SCRATCH_DIR_NAME))
    result = {"mode": "emitter", "state_dir": scratch, "age_seconds": str(int(age))}
    if snapshot_dir:
        # Snapshot the exact bytes judged fresh, so the consumer never reads a
        # receipt the emitter replaced after this decision.
        snapshot = Path(snapshot_dir, "jovie-fleet-gate.json")
        snapshot.parent.mkdir(parents=True, exist_ok=True)
        snapshot.write_text(found[1], encoding="utf-8")
        result["receipt_path"] = str(snapshot)
    return result


def main(env: dict[str, str] | None = None, now: datetime | None = None) -> int:
    env = os.environ if env is None else env
    result = choose(
        env.get("GEM_WORKSPACE") or DEFAULT_WORKSPACE,
        env.get("GEM_PRIORITY_GATE_STATE_DIR", ""),
        now or datetime.now(timezone.utc),
        env.get("RUNNER_TEMP", ""),
    )
    for key in ("mode", "state_dir", "age_seconds", "receipt_path"):
        if key in result:
            print(f"{key}={result[key]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
