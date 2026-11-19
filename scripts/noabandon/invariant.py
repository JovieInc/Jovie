"""No-abandon invariant + verification receipts. Pure decisions; adapters are thin and DRY-RUN by default.

Abandoned (ledger.disposition): not terminal, no live lease, no scheduled next event, not a fresh
owner-reserved wait, not waiting on a live dependency. Violations fail LOUD to the owning agent: one
fingerprinted Linear issue `abandon:<item>` (label remediation:abandoned), never Tim, and it closes only
on verified recovery (JOV-12739 flapped Triage<->Done 59 times because the doctor auto-closed on blips).

Where it runs (no new schedule):
- Lane Fix Relay, on `push` to main (the merge cadence): `check_leased(slice=5)` over open PRs labeled
  `noabandon-leased`, oldest lease first.
- Remediation Sweep (existing daily 08:11 UTC): `reconcile_linear()` over In Progress / Merging /
  Validating, with `--dry-run` until the owning agent has read one dry-run receipt.
- Main CI `workflow_run.completed` on a push to main: `verify()` writes the receipt that is the ONLY
  way an item leaves Validating.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from noabandon import ledger as L  # noqa: E402

STALE_START_S = 72 * 3600
VALIDATING_GRACE_S = 48 * 3600
OWNER_LANE = {"JOV": "jovie-owner", "LYB": "lyb-owner", "SYM": "symphony-owner"}


def owning_agent(item: str, labels=()) -> str:
    for label in labels or ():
        if str(label).startswith("owner:"):
            return str(label)[6:]
    return OWNER_LANE.get((item or "").split("-")[0].upper(), "symphony-owner")


def abandon_fingerprint(item: str) -> str:
    return f"abandon:{item}"


def check_item(item: dict, now: float) -> dict | None:
    """-> None when fine, else the one upsert for the owning agent."""
    kind = L.disposition(item, now)
    if kind != "abandoned":
        return None
    lease = item.get("lease") or {}
    return {"fingerprint": abandon_fingerprint(item["item"]), "owner": owning_agent(item["item"], item.get("labels")),
            "label": "remediation:abandoned", "item": item["item"], "pr": item.get("pr"),
            "last_holder": lease.get("holder_lane"), "attempts": lease.get("lifetime_attempts", 0),
            "next": "transfer lease to next rung; if ladder exhausted, owning agent decides fix / split / close-with-reason",
            "close_when": "item verified, closed_with_reason, or a live lease with a progress event"}


def may_close_abandon(item: dict, now: float) -> bool:
    """Close the abandon issue only on real recovery, never on a blip (the doctor's flap)."""
    kind = L.disposition(item, now)
    if kind in L.TERMINAL:
        return True
    return kind == "live" and bool(item.get("progress_since_open"))


def _timestamp(value) -> float | None:
    """Parse a timestamp field. Missing, None or non-numeric values are UNKNOWN — never epoch 0
    (JOV-13158: defaulting to 0 made every PR-less issue look ~1.7e9 s idle and "stale"), and
    never a ValueError that aborts the sweep."""
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def reconcile_linear(issue: dict, pr: dict | None, now: float) -> dict | None:
    """One Linear issue in a started state -> the correction, or None.

    issue: {id, state, progress_at (last PR push/merge/receipt, NOT updatedAt; falls back to
    startedAt when absent), labels}
    pr:    {state: open|merged|closed, merge_sha, main_ci: success|failure|None} or None

    A missing/None/non-numeric progress_at falls back to startedAt; with neither timestamp the
    issue's age is UNKNOWN and stale reconciliation is skipped — an unknown age is never stale
    (JOV-13158). The PR-present branches never depend on the age.
    """
    state = issue.get("state")
    progress = _timestamp(issue.get("progress_at"))
    if progress is None:
        progress = _timestamp(issue.get("startedAt"))
    idle = None if progress is None else now - progress
    if pr and pr.get("state") == "merged":
        if pr.get("main_ci") == "success":
            return {"to": "Done", "receipt": {"merge_sha": pr["merge_sha"], "main_ci": "success"}}
        if pr.get("main_ci") == "failure":
            return {"to": "Rework", "why": "post-merge main CI red on merge SHA", "owner": owning_agent(issue["id"])}
        return None  # verification still running: the main CI event will decide
    if pr and pr.get("state") == "closed":
        return {"to": "Rework", "why": "PR closed without merge", "owner": owning_agent(issue["id"])}
    if pr and pr.get("state") == "open":
        return None  # the PR's lease and the PR invariant own it
    if state == "Validating" and idle is not None and idle >= VALIDATING_GRACE_S:
        return {"to": "Rework", "why": "Validating without a PR or receipt", "owner": owning_agent(issue["id"])}
    if state in ("In Progress", "Merging") and idle is not None and idle >= STALE_START_S:
        return {"to": "Todo", "why": f"{state} with no PR and no progress for {int(idle // 3600)}h; claim cleared",
                "owner": owning_agent(issue["id"]), "clear_assignee": True}
    return None


def verify(merge_sha: str, main_ci_conclusion: str, pr_number: int, item: str | None) -> dict:
    """The verification receipt (definition of done): merged SHA + post-merge main CI on that SHA."""
    ok = main_ci_conclusion == "success"
    return {"schema": "noabandon.verified/v1" if ok else "noabandon.regressed/v1", "item": item, "pr": pr_number,
            "merge_sha": merge_sha, "main_ci": main_ci_conclusion,
            "next": "Done" if ok else "lease to main-red lane (Main Red Eject / revert path)"}
