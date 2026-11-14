"""Stop the empty review dispatch (fix-red-e3b0c44298).

A lane-fix-review label with no active current-head body is not a failing check.
Inventory rows omit reviewAuthorityDigest, so the claim still reconciles. A completed
read with no body and no CHANGES_REQUESTED decision is idle: cleanup drops the label
and fix_red_pr does not install or run a model.
"""
from __future__ import annotations

RED = frozenset({"FAILURE", "TIMED_OUT", "STARTUP_FAILURE"})


def review_evidence_loaded(pr: dict) -> bool:
    """True after repair_review_authority attached its digest. Inventory copies omit it."""
    return "reviewAuthorityDigest" in pr


def active_review_bodies(pr: dict) -> bool:
    rows = list(pr.get("reviewSummaries") or []) + list(pr.get("reviewThreads") or [])
    return any(isinstance(row, dict) and str(row.get("body") or "").strip() for row in rows)


def review_needs_model(pr: dict) -> bool:
    """Unread reviews and GitHub changes-requested decisions stay work. A loaded empty read does not."""
    if pr.get("reviewDecision") == "CHANGES_REQUESTED":
        return True
    if not review_evidence_loaded(pr):
        return True
    return active_review_bodies(pr)


def stale_review_only(pr: dict) -> bool:
    """The only repair signal is a loaded review with nothing on this head to answer."""
    kinds = set(pr.get("eventKinds") or [])
    if "review" not in kinds or kinds & {"dequeued", "stale", "conflict", "red"}:
        return False
    if pr.get("mergeStateStatus") == "DIRTY" or pr.get("reviewDecision") == "CHANGES_REQUESTED":
        return False
    if not review_evidence_loaded(pr) or active_review_bodies(pr):
        return False
    return not any(
        str((check or {}).get("conclusion") or "").upper() in RED
        for check in pr.get("statusCheckRollup") or []
        if isinstance(check, dict)
    )


def unloaded_review_only(pr: dict, still_work) -> bool:
    """Inventory still looks like review work only because its evidence has not been read."""
    kinds = set(pr.get("eventKinds") or [])
    if "review" not in kinds or review_evidence_loaded(pr):
        return False
    without = {**pr, "eventKinds": [kind for kind in kinds if kind != "review"]}
    return not still_work(without)


def skip_model(pr: dict, consume) -> bool:
    """True when this fix must not install or run a model. Consumes the review label first."""
    if not stale_review_only(pr):
        return False
    consume()
    return True
