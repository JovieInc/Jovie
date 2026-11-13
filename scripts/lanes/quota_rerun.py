"""One rerun for a quota-deferred head, after the log's advertised reset.

A rerun before that instant returns the same exit 75. Spending the claim then
would dispatch a model on the next pass. The lane ticks again after the reset.
Logs with no reset keep one immediate rerun. lane_runner owns the side effects
and passes them in, so this module stays free of the runner.
"""
from __future__ import annotations

import re
import time
from datetime import datetime

_QUOTA_RESET_AT = re.compile(
    r"until (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)"
)


def quota_reset_epoch(text: str) -> float | None:
    """Latest `until <ISO-8601 Z>` stamp in a quota-deferred log, else None."""
    epochs = []
    for stamp in _QUOTA_RESET_AT.findall(text or ""):
        try:
            epochs.append(
                datetime.fromisoformat(stamp.replace("Z", "+00:00")).timestamp()
            )
        except ValueError:
            continue
    return max(epochs) if epochs else None


def quota_rerun_decision(stored, head: str, reset_at: float | None, now: float):
    """Return `(decision, replacement)` for one PR entry in infra-reruns.json.

    `decision` is `wait`, `rerun`, or `spent`. A claim taken before the reset,
    including a legacy entry that is only the head sha, still allows one rerun
    after it. A legacy head string with no reset stays that string once spent,
    so a later pass cannot treat a null claimedAt as a fresh claim.
    """
    if (
        not isinstance(head, str)
        or not head
        or isinstance(now, bool)
        or not isinstance(now, (int, float))
    ):
        raise ValueError("quota rerun needs a head and a timestamp")
    if isinstance(stored, str):
        row = (
            {"head": head, "claimedAt": None, "reset": None}
            if stored == head
            else None
        )
        legacy = stored == head
    elif isinstance(stored, dict) and stored.get("head") == head:
        row = {
            "head": head,
            "claimedAt": stored.get("claimedAt"),
            "reset": stored.get("reset"),
        }
        legacy = False
    else:
        row, legacy = None, False
    if reset_at is not None and now < float(reset_at):
        waiting = row or {"head": head, "claimedAt": None, "reset": None}
        waiting["reset"] = float(reset_at)
        return "wait", waiting
    claimed_at = None if row is None else row.get("claimedAt")
    claimed = isinstance(claimed_at, (int, float)) and not isinstance(claimed_at, bool)
    if reset_at is None:
        if row is not None and (legacy or claimed):
            return "spent", stored if isinstance(stored, str) else row
        return "rerun", {"head": head, "claimedAt": float(now), "reset": None}
    reset_at = float(reset_at)
    if (
        isinstance(claimed_at, (int, float))
        and not isinstance(claimed_at, bool)
        and claimed_at >= reset_at
    ):
        return "spent", row
    return "rerun", {"head": head, "claimedAt": float(now), "reset": reset_at}


def deferred_rerun(host, pr, read_logs, update_json, rerun_failed) -> str | None:
    """Rerun a quota-deferred head once after the log's advertised reset."""
    logs = read_logs(host, pr) or {}
    reset_at = quota_reset_epoch("\n".join(logs.values()))
    decision = "spent"

    def change(data: dict) -> None:
        nonlocal decision
        key = str(pr["number"])
        decision, data[key] = quota_rerun_decision(
            data.get(key), pr["headRefOid"], reset_at, time.time()
        )

    try:
        update_json(host.state / "infra-reruns.json", change)
    except (OSError, ValueError):
        return None
    if decision == "wait":
        return "infra-rerun:quota-deferred-until"
    if decision != "rerun":
        return None
    return "infra-rerun:quota-deferred" if rerun_failed(pr) else None
