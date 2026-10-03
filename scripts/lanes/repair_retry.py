"""Read-only admission hints; the canonical execution ledger still owns retries."""
from __future__ import annotations

import base64
import json
import math
import zlib

import execution_attempt as execution


def pending(check: dict) -> bool:
    return check.get("status") in {"IN_PROGRESS", "QUEUED", "PENDING"} or check.get("state") == "PENDING"


def hint(pr: dict, repository: str) -> dict | None:
    """Only one bounded, finished retry receipt may explain an otherwise settled head."""
    waiting = [check for check in pr.get("statusCheckRollup") or [] if pending(check)]
    if len(waiting) != 1 or pr.get("isDraft") or pr.get("isCrossRepository"):
        return None
    check = waiting[0]
    context = check.get("context", "")
    target = check.get("targetUrl", "")
    prefix = f"https://github.com/{repository}/commit/{pr['headRefOid']}#jovie-execution="
    if not context.startswith("jovie-execution/") or not target.startswith(prefix) or len(target) > 2000:
        return None
    try:
        packed = target[len(prefix):]
        decoder = zlib.decompressobj()
        raw = decoder.decompress(base64.urlsafe_b64decode(packed + "=" * (-len(packed) % 4)), 16384)
        if not decoder.eof or decoder.unused_data:
            return None
        row = json.loads(raw)
        work, generation = row["workKey"], row["executionGeneration"]
        if (row["schema"] != execution.SCHEMA or not work.startswith("pr-remediation:")
            or generation != execution.digest({"headSha": pr["headRefOid"]})
            or row["identityDigest"] != execution.digest({"workKey": work, "generation": generation})
            or context != f"jovie-execution/{row['identityDigest']}"
            or row["event"] != "attempt_finished" or row["result"] != "failed_known"
            or row.get("terminalState") is not None or row["retryDecision"] != "retry"
            or row["failureClass"] not in execution.RETRYABLE or not row.get("fencingToken")):
            return None
        remaining = row["remainingBudgets"]
        for key in ("attempts", "wallSeconds"):
            value = remaining[key]
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
                return None
        if not row.get("_remote", {}).get("eventId"):
            return None
        return row
    except (ValueError, TypeError, KeyError, AttributeError, zlib.error):
        return None


def canonical_identity(pr: dict, row: dict, coordination: dict) -> dict:
    """Refresh canonical history and prove this hint belongs to this PR and stopped turn."""
    ident = {key: row[key] for key in ("workKey", "executionGeneration", "identityDigest")}
    rows, _ = execution._github_rows(coordination, ident)
    if not rows or rows[-1].get("_remote", {}).get("eventId") != row["_remote"]["eventId"]:
        raise RuntimeError("retry-receipt-changed")
    finished = rows[-1]
    start = next((item for item in reversed(rows) if item["event"] == "attempt_started"
                  and item.get("fencingToken") == finished.get("fencingToken")), None)
    if (finished.get("event") != "attempt_finished" or finished.get("terminalState") is not None
        or finished.get("retryDecision") != "retry" or not start
        or start.get("trigger", {}).get("correlationId") != f"pr-{pr['number']}"
        or start.get("trigger", {}).get("causationId") != pr["headRefOid"]):
        raise RuntimeError("retry-receipt-owner-mismatch")
    return ident
