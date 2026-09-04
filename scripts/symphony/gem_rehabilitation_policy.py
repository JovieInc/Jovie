#!/usr/bin/env python3
"""Pure PR-rehabilitation policy: pause lattice, leases, receipts, and SLOs."""

from __future__ import annotations

import hashlib
import re
from typing import Any


SCHEMA = "gem-pr-rehabilitation-handoff/v1"
STAGES = (
    "pr_handed_off",
    "repair_started",
    "repair_ready",
    "queue_entered",
    "merged",
    "deployed",
    "runtime_verified",
)


class PolicyError(ValueError):
    """A repair request is stale, ambiguous, or outside its capability."""


def bounded_selection(items: list[dict[str, Any]], capacity: int) -> list[dict[str, Any]]:
    """Oldest first, one exact PR head per bounded worker."""
    if capacity < 0:
        raise PolicyError("capacity cannot be negative")
    unique: dict[tuple[int, str], dict[str, Any]] = {}
    for item in items:
        number = item.get("number")
        head = item.get("head", {}).get("sha")
        if not isinstance(number, int) or not isinstance(head, str) or not head:
            raise PolicyError("every repair candidate needs a PR number and exact head")
        unique.setdefault((number, head), item)
    ordered = sorted(
        unique.values(), key=lambda item: (item.get("created_at", ""), item["number"])
    )
    return ordered[:capacity]


def decide_action(
    *, state: str, push_allowed: bool, mergeable_state: str, expected_head: str, attempt: int
) -> str:
    """Return one mutation-free policy decision for an exact PR head."""
    if state not in {"GREEN", "AMBER", "RED"}:
        raise PolicyError("unknown fleet state")
    if not isinstance(expected_head, str) or not re.fullmatch(r"[0-9a-f]{40}", expected_head):
        raise PolicyError("exact full PR head is required")
    if attempt < 0:
        raise PolicyError("attempt cannot be negative")
    if attempt >= 3:
        return "retry_budget_exhausted"
    if state == "RED" or not push_allowed:
        return "local_diagnosis_only"
    if mergeable_state == "behind":
        return "exact_head_branch_update"
    if mergeable_state == "dirty":
        return "fresh_main_replant_required"
    if mergeable_state in {"blocked", "unstable"}:
        return "isolated_model_repair"
    return "observe_only"


def lease_key(repo: str, number: int, expected_head: str) -> str:
    value = f"{repo.casefold()}:{number}:{expected_head}".encode("utf-8")
    return hashlib.sha256(value).hexdigest()


def handoff_receipt(
    *, repo: str, number: int, expected_head: str, owner: str, failure_class: str,
    attempt: int, observed_at: str, stage_times: dict[str, str | None]
) -> dict[str, Any]:
    if set(stage_times) != set(STAGES):
        raise PolicyError("handoff must contain every lifecycle stage")
    receipt = {
        "schema": SCHEMA,
        "repo": repo,
        "pr": number,
        "expectedHead": expected_head,
        "leaseKey": lease_key(repo, number, expected_head),
        "owner": owner,
        "failureClass": failure_class,
        "attempt": attempt,
        "observedAt": observed_at,
        "stages": dict(stage_times),
    }
    validate_handoff(receipt)
    return receipt


def validate_handoff(receipt: dict[str, Any]) -> None:
    if receipt.get("schema") != SCHEMA:
        raise PolicyError("unsupported handoff schema")
    expected_head = receipt.get("expectedHead")
    if not isinstance(expected_head, str) or not re.fullmatch(r"[0-9a-f]{40}", expected_head):
        raise PolicyError("handoff exact head is invalid")
    if receipt.get("leaseKey") != lease_key(receipt.get("repo", ""), receipt.get("pr"), expected_head):
        raise PolicyError("handoff lease does not bind the exact head")
    if set(receipt.get("stages", {})) != set(STAGES):
        raise PolicyError("handoff lifecycle stages are incomplete")
    if not isinstance(receipt.get("attempt"), int) or receipt["attempt"] < 0:
        raise PolicyError("handoff attempt is invalid")


def rank_bottlenecks(blocked_seconds: dict[str, int], affected: dict[str, int]) -> list[str]:
    """Rank stage bottlenecks by founder-visible blocked time, not queue count alone."""
    if set(blocked_seconds) != set(affected):
        raise PolicyError("blocked time and affected counts must cover identical stages")
    return sorted(
        blocked_seconds,
        key=lambda stage: (blocked_seconds[stage] * affected[stage], stage),
        reverse=True,
    )
