#!/usr/bin/env python3
"""Claim-expiry policy for the prod-errors loop, extracted from prod_errors.advance()
so that file's size-500 budget only shrinks (JOV-10504).

One decision per expired claim: stand down when the linked Linear issue was completed
or canceled externally (JOV-10213), PARK after MAX_CLAIM_ESCALATIONS re-arms with no
PR instead of re-arming forever (JOV-10504 -- the loop posted 'Claim expired with no
PR. Escalated ... re-arming claim.' every CLAIM_S on an open issue), else re-arm the
window and escalate once. advance() treats status 'parked' like 'claimed' for PR
binding, so a later open/merged PR unparks the entry; parked entries never re-enter
this expiry branch, so no further comments or alerts fire while parked.

Terminal notices (stand-down / park) are one-shot per episode: ledger flags plus a
Linear comment-body check so competing writers / lost closed|parked status cannot
re-post the same notice while still allowing a genuine new regression (handle_issue
clears the flags on reopen)."""
from __future__ import annotations

STAND_DOWN_NEEDLE = "standing the claim down, no further claim-expired alerts"
PARK_NEEDLE = "Parking this claim; a fix PR re-opens it."


def _already_notified(linear, ident: str | None, needle: str, ledger_flag) -> bool:
    if ledger_flag:
        return True
    if not ident:
        return False
    try:
        bodies = linear.comment_bodies(ident) if hasattr(linear, "comment_bodies") else []
    except Exception:
        return False
    return any(needle in (b or "") for b in bodies)


def escalate_or_park(sid: str, e: dict, linear, at: float, state, pe=None) -> int:
    """Handle one claim expiry in place. Returns 1 when a stale Linear link was refiled.

    `pe` must be the live prod_errors module (pass sys.modules[__name__] from advance).
    A bare `import prod_errors` here would load a second module object when the script
    runs as __main__ (Gem run.sh), so LinearIssueMissing catches and CLAIM_S/MAX would
    disagree with the caller (JOV-14113 / Seer 20813183)."""
    if pe is None:
        import prod_errors as pe  # import-path / unittest callers only

    try:
        linked_state = linear.state_type(e["linear"]) or ""
    except pe.LinearIssueMissing:
        linked_state = ""  # fall through: escalation's own refile handles a dead link
    if linked_state in ("completed", "canceled"):
        # The linked issue was completed/canceled externally (e.g. closed with receipts
        # while this claim was live, the merged fix PR sitting outside the PR fetch
        # window). Respect it and stand down: escalating re-files a duplicate
        # claim-expired alert on a DONE issue every cycle (JOV-10213).
        notified = _already_notified(linear, e.get("linear"), STAND_DOWN_NEEDLE,
                                     e.get("standDownNotifiedAt"))
        e.update(status="closed", closedAt=at, standDownNotifiedAt=e.get("standDownNotifiedAt") or at)
        if notified:
            return 0
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
        notified = _already_notified(linear, e.get("linear"), PARK_NEEDLE, e.get("parkNotifiedAt"))
        e.update(status="parked", parkedAt=at, parkReason="claim-expired-cap",
                 parkNotifiedAt=e.get("parkNotifiedAt") or at)
        if notified:
            return 0
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
