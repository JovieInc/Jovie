"""Fair order for repair claims: the head this host tried least goes first, then the longest wait.

Lowest PR number first was head-of-line blocking. A no-push attempt never parks a PR (FIX_LEASE_S
in pr_events.py) and a no-work refund gives the attempt back, so a low-numbered PR no lane could
fix took claim after claim on the same head while the rest of the queue waited unseen
(2026-11-08: #23714 claimed 10 times on one head between Oct 31 and Nov 7; 21 of 27 labelled
PRs never claimed, #24265 waiting since Nov 2).

Pure: reads only the host-local attempt record and the inventory row the selectors already
hold, so the order costs no GitHub call. It never decides eligibility, only who goes first.
"""
from __future__ import annotations

import math
from datetime import datetime


def head_claims(record, sha) -> int:
    """Claims this host charged on `sha`. Refunds give back the attempt budget (`count`) but not
    the claim, so `headClaims` keeps counting; records written before it fall back to `count`,
    and to one claim when only the claim time shows the head was taken."""
    if not isinstance(record, dict) or not isinstance(sha, str) or not sha or record.get("sha") != sha:
        return 0
    for value in (record.get("headClaims"), record.get("count")):
        if type(value) is int and value > 0:
            return value
    return 1 if record.get("at") else 0


def waiting_since(pr: dict) -> float:
    """When the current head was pushed: the cheapest start of its wait the inventory carries.
    Unknown sorts last, so a row without evidence never jumps the queue."""
    stamp = pr.get("lastCommitAt")
    if not isinstance(stamp, str):
        return math.inf
    try:
        return datetime.fromisoformat(stamp.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return math.inf


def key(pr: dict, attempts) -> tuple:
    """Fewest prior claims on the current head, then the oldest wait, then PR number."""
    record = attempts.get(str(pr.get("number"))) if isinstance(attempts, dict) else None
    return head_claims(record, pr.get("headRefOid")), waiting_since(pr), pr["number"]
