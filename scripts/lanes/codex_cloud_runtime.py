"""Public cloud entrypoints: disabled by default, no ambient account or acceptance fallback."""
import time
from pathlib import Path

import cloud_lane_state as journal
from codex_cloud_occupancy import publication_reason, reservations


def route(issue, provider, labels, text, prompt, *, occupancy=None, **kwargs):
    claim = journal.live_claim(issue)
    if claim and not kwargs.get("previous"):
        return {"route": "held", "reason": "account-occupancy"}
    if not journal.enabled():
        return {"route": "held" if claim else "gem", "reason": "account-occupancy" if claim else "disabled"}
    if occupancy is None:
        return {"route": "held", "reason": "cloud-compatibility-unverified"}
    import cloud_lane
    ok, why = journal.eligible(labels, text)
    if not ok or not cloud_lane.command(provider, prompt):
        return {"route": "held" if claim else "gem", "reason": why if not ok else "provider-unconfigured"}
    return occupancy.submit(cloud_lane._submit, (issue, provider, labels, text, prompt), kwargs)


def reconcile(*, occupancy=None, **kwargs):
    if not journal.enabled():
        return []
    if occupancy is None:
        return [{"disposition": "held", "reason": "cloud-compatibility-unverified"}]
    if Path(kwargs.get("path") or journal.ledger_path()) != occupancy.path:
        return [{"disposition": "held", "reason": "occupancy-journal-mismatch"}]
    try:
        rows = reservations(journal.read(occupancy.path))
        for row in rows.values():
            result = occupancy.reconcile(row["reservationId"])
            if not result["ok"]:
                return [{"disposition": "held", "reason": result["reason"]}]
        events = journal.read(occupancy.path)
        claims = {e["issue"]: e for e in events if e["stage"] in journal.CLAIM_STAGES}
        for claim in claims.values():
            if claim["stage"] == "cloud-pending":
                reason = publication_reason(events, claim["issue"], claim.get("task"), claim.get("fencingToken"), time.time())
                if reason:
                    return [{"disposition": "held", "reason": reason}]
    except (ValueError, OSError, KeyError):
        return [{"disposition": "held", "reason": "occupancy-unreadable"}]
    import cloud_lane
    return cloud_lane._reconcile(**kwargs)


def publish_candidate(issue, task, *args, path=None, fencing_token=None, **kwargs):
    if not journal.enabled():
        return {"route": "held", "reason": "disabled"}
    try:
        reason = publication_reason(journal.read(path), issue, task, fencing_token, time.time())
    except (ValueError, OSError, KeyError):
        reason = "occupancy-unreadable"
    if reason:
        return {"route": "held", "reason": reason}
    import cloud_lane
    return cloud_lane._publish_candidate(issue, task, *args, path=path, fencing_token=fencing_token, **kwargs)
