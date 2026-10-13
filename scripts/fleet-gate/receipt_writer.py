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

Prints `mode=<emitter|fallback>`, `state_dir=<dir>` and `age_seconds=<n>` lines
for $GITHUB_OUTPUT.
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


def receipt_age_seconds(receipt: Path, now: datetime) -> float | None:
    """Seconds since a well-formed receipt's observedAt; None when unusable."""
    try:
        data = json.loads(receipt.read_text(encoding="utf-8"))
        observed = datetime.fromisoformat(str(data["observedAt"]).replace("Z", "+00:00"))
    except (OSError, ValueError, TypeError, KeyError):
        return None
    if data.get("schema") != SCHEMA or observed.tzinfo is None:
        return None
    age = (now - observed).total_seconds()
    return age if age >= 0 else None


def choose(workspace: str, fence: str, now: datetime) -> dict[str, str]:
    canonical = canonical_dir(workspace)
    age = receipt_age_seconds(canonical / "latest.json", now)
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
    return {"mode": "emitter", "state_dir": scratch, "age_seconds": str(int(age))}


def main(env: dict[str, str] | None = None, now: datetime | None = None) -> int:
    env = os.environ if env is None else env
    result = choose(
        env.get("GEM_WORKSPACE") or DEFAULT_WORKSPACE,
        env.get("GEM_PRIORITY_GATE_STATE_DIR", ""),
        now or datetime.now(timezone.utc),
    )
    for key in ("mode", "state_dir", "age_seconds"):
        print(f"{key}={result[key]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
