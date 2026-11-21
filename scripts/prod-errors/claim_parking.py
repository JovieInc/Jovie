#!/usr/bin/env python3
"""Claim-expiry policy for the prod-errors loop, extracted from prod_errors.advance()
so that file's size-500 budget only shrinks (JOV-10504).

One decision per expired claim: stand down when the linked Linear issue was completed
or canceled externally (JOV-10213), PARK after MAX_CLAIM_ESCALATIONS re-arms with no
PR instead of re-arming forever (JOV-10504 -- the loop posted 'Claim expired with no
PR. Escalated ... re-arming claim.' every CLAIM_S on an open issue), else re-arm the
window and escalate once. advance() treats status 'parked' like 'claimed' for PR
binding, so a later open/merged PR unparks the entry; parked entries never re-enter
this expiry branch, so no further comments or alerts fire while parked."""
from __future__ import annotations


def escalate_or_park(sid: str, e: dict, linear, at: float, state) -> int:
    """Handle one claim expiry in place. Returns 1 when a stale Linear link was refiled."""
    import prod_errors as pe  # late import: prod_errors loads this module at import time

    try:
        linked_state = linear.state_type(e["linear"]) or ""
    except pe.LinearIssueMissing:
        linked_state = ""  # fall through: escalation's own refile handles a dead link
    if linked_state in ("completed", "canceled"):
        # The linked issue was completed/canceled externally (e.g. closed with receipts
        # while this claim was live, the merged fix PR sitting outside the PR fetch
        # window). Respect it and stand down: escalating re-files a duplicate
        # claim-expired alert on a DONE issue every cycle (JOV-10213).
        e.update(status="closed", closedAt=at)
        try:
            linear.comment(e["linear"], "prod-errors loop: the linked issue is already "
                           "completed/canceled -- standing the claim down, no further "
                           f"claim-expired alerts (Sentry {sid}).")
        except pe.LinearIssueMissing:
            pass
        return 0
    e["escalations"] = e.get("escalations", 0) + 1
    if e["escalations"] > pe.MAX_CLAIM_ESCALATIONS:
        # Cap reached (JOV-10504): park instead of re-arming, so an open linked issue
        # stops getting a claim-expired comment + alert every CLAIM_S. advance()
        # unparks when a later open/merged PR binds; a parked entry skips the expiry
        # branch entirely.
        e.update(status="parked", parkedAt=at, parkReason="claim-expired-cap")
        try:
            linear.comment(e["linear"], f"Claim expired with no PR {pe.MAX_CLAIM_ESCALATIONS} times "
                           f"(Sentry {sid}). Parking this claim; a fix PR re-opens it.")
        except pe.LinearIssueMissing:
            pass  # the entry parks either way; a dead link is handled on the next sweep
        pe.alert("claim-parked", f"Sentry {sid} ({e['linear']}) parked after {pe.MAX_CLAIM_ESCALATIONS} "
                 "claim expiries with no PR.", False, linear, state)
        return 0
    e["claimExpiresAt"] = at + pe.CLAIM_S
    stale = 0
    try:
        linear.comment(e["linear"], "Claim expired with no PR. Escalated to Jovie Owner; re-arming claim.")
    except pe.LinearIssueMissing as exc:
        pe.refile_missing(sid, e, linear, e.get("title") or "prod error",
                          f"Claim expired with no PR (Sentry {sid}); the previous Linear issue went away "
                          f"({exc}). The claim is re-armed on this fresh issue.",
                          [f"sentry:{sid}", "prod-error"] + (["golden-path"] if e.get("flow") else [])
                          + (["human-gate", "hold"] if e.get("gate") else ["agent-ready"]),
                          1 if e.get("flow") else 2, str(exc))
        stale = 1
    pe.alert("claim-expired", f"No PR for Sentry {sid} ({e['linear']}) within claim window.",
             e.get("flow") == "checkout", linear, state)
    return stale
