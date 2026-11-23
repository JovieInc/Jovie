"""One existing Linear owner and a redacted note for the worktree sweep hold (JOV-14452)."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from atomic_state import atomic_write_text

KEY = "sweep-snapshot-secret"
GEM_TRACKER = 14452.0
COMMENT_INTERVAL_S = 24 * 3600


def without_legacy(rows: dict) -> dict:
    return {key: value for key, value in rows.items() if not key.startswith(f"{KEY}:")}


def migrate(previous: dict) -> dict:
    """Forget legacy IDs without touching Linear; retain an unknown-state signal after a bad stamp."""
    previous = dict(previous)
    for field in ("alerts", "issues", "conditions"):
        if field in previous:
            before = previous[field] or {}
            filtered = without_legacy(before)
            if field == "alerts" and len(filtered) < len(before):
                filtered.setdefault(KEY, "Prior worktree snapshot holds remain unverified; current sweep coverage is unknown.")
            previous[field] = filtered
    return previous


def observe(state: Path) -> dict:
    try:
        report = json.loads((state / "worktree-sweep.json").read_text())
        rows = report.get("secretHeld")
        if isinstance(rows, list) and all(isinstance(row, dict) and row.get("path") for row in rows):
            coverage = "known" if report.get("secretHeldCoverage") == "known" else "unknown"
            return {"sweepSecretHeld": rows, "sweepSecretHeldCoverage": coverage}
    except (OSError, ValueError, AttributeError):
        pass
    return {"sweepSecretHeld": None, "sweepSecretHeldCoverage": "unknown"}


def names(rows: list[dict] | None) -> list[str]:
    # Only sanitized checkout names, never paths or scanner/archive diagnostics.
    return sorted(re.sub(r"[^a-zA-Z0-9._-]", "-", str(row.get("name") or "unnamed"))[:160]
                  for row in (rows or []) if isinstance(row, dict))


def alert(obs: dict, previous: dict | None) -> str | None:
    held = names(obs.get("sweepSecretHeld"))
    if held:
        sample = ", ".join(held[:4]) + (", …" if len(held) > 4 else "")
        bound = "at least " if obs.get("sweepSecretHeldCoverage") == "unknown" else ""
        return (f"snapshot preservation is held for {bound}{len(held)} worktree(s) ({sample}); "
                "source checkouts are kept for review")
    if obs.get("sweepSecretHeld") is None or obs.get("sweepSecretHeldCoverage") == "unknown":
        return ((previous or {}).get("alerts") or {}).get(KEY)
    return None


def note(linear, host: str, state: Path, now: float, text: str,
         held_names: list[str]) -> tuple[str | None, bool]:
    """The existing Gem issue is human-owned: no creation, state or label mutation."""
    if host != "gem" or linear is None or not held_names:
        return None, False  # unknown ledger or another host: retain local health evidence
    owner = None
    try:
        stamp = state / "doctor-sweep-hold-note.json"
        try:
            delivery = json.loads(stamp.read_text())
        except FileNotFoundError:
            delivery = {}
        attempted = delivery.get("attemptedAt")
        if isinstance(attempted, (int, float)) and now - attempted < COMMENT_INTERVAL_S:
            return delivery.get("verifiedOwner"), False  # no delivery in this pass (possibly a new episode)
        data = linear.gql(
            'query($n:Float!){issues(filter:{team:{key:{eq:"JOV"}},number:{eq:$n}})'
            '{nodes{id identifier team{key}}}}', {"n": GEM_TRACKER})
        rows = data["issues"]["nodes"]
        if (len(rows) != 1 or rows[0].get("identifier") != "JOV-14452"
                or (rows[0].get("team") or {}).get("key") != "JOV" or not rows[0].get("id")):
            return None, False
        owner = rows[0]["id"]
        # run_doctor already serializes this pass; reserve before a possibly
        # uncertain send so a restart cannot duplicate a delivered comment.
        atomic_write_text(stamp, json.dumps({"attemptedAt": now, "verifiedOwner": owner}))
        listing = "\n".join(f"- `{name}`" for name in held_names)
        result = linear.gql(
            'mutation($id:String!,$b:String!){commentCreate(input:{issueId:$id,body:$b,'
            'doNotSubscribeToIssue:true}){success}}',
            {"id": owner, "b": f"🤖 doctor status on `{host}`: {text}\n\n{listing}"},
        )
        return owner, ((result or {}).get("commentCreate") or {}).get("success") is True
    except Exception as error:
        print(f"doctor: sweep hold tracking note unavailable ({type(error).__name__})", file=sys.stderr)
        return owner, False


def reconcile(text: str | None, prior: dict | None, now: float, deliver) -> dict | None:
    if not text:
        if not prior:
            return None
        return {"id": prior.get("id") if prior.get("ownerVerified") else None,
                "ownerVerified": prior.get("ownerVerified", False), "closedAt": prior.get("closedAt") or now}
    prior = prior or {}
    owner = prior.get("id") if prior.get("ownerVerified") else None
    acknowledged = False
    if deliver is not None:
        verified, noted = deliver(text)
        if verified:
            owner, acknowledged = verified, noted
    if (owner and owner == prior.get("id") and prior.get("closedAt") is None
            and not prior.get("pendingAction")):
        acknowledged = True
    result = {"id": owner, "ownerVerified": bool(owner), "closedAt": None}
    if not acknowledged:
        result.update(pendingAction="note", reason="sweep-tracker-note-not-acknowledged",
                      since=prior.get("since") or now)
    return result
