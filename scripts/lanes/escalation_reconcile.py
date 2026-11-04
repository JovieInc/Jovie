"""Escalation reconcile: `lane-fix-escalating` is consumed, never a dead drop.

2026-11-02: 64 open PRs carried `lane-fix-escalating`, 40 of them untouched for more than two days
(#23301, the chat-first Home, sat red from 10-26). `pr_is_terminal` treats the label as terminal, so
ordinary repair skips the PR, while only the exact lane named in `pendingEscalation` may pick it up.
49 of the 64 had no escalation state at all for their head (a new head generation reset the record but
the label stayed), and 15 waited on a lane with one seat. Nothing consumed either.

Every RECONCILE_S the dispatch tick reads the labeled PRs once and decides per PR (pure `disposition`):

- ``orphan``: no pending escalation and no escalation rung for this head, not surfaced. The label is a
  stale signal: remove it, and the PR is back in ordinary repair, where its `lane-fix-red` /
  `lane-fix-conflict` labels put it first.
- ``stale``: a pending escalation older than STALE_S, or one aimed at a lane that cannot run repairs
  (disabled, `repairs: false`, zero slots). Record a failed rung for that lane and drop the pending
  entry, so the ladder retries another lane and, when every lane is spent, surfaces to Summer through
  the existing Linear path (`_surface_exhausted`).
- ``idle``: escalation rungs exist for this head but none pending and the last is older than STALE_S.
  Remove the label so the escalation pass can plan the next rung.
- ``live`` / ``surfaced``: leave it.

Each decision is journaled (`runs/escalation-reconcile.jsonl`) for detect/act timing.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

LABEL = "lane-fix-escalating"
STALE_S = int(os.environ.get("LANES_ESCALATION_STALE_S", str(6 * 3600)))
RECONCILE_S = int(os.environ.get("LANES_ESCALATION_RECONCILE_S", "1800"))
SCHEMA = "jovie.escalation-reconcile/v1"
# PRs another agent owns right now (e.g. 2026-11-02 #23301, the chat-first Home): never reconciled.
HOLD_LABELS = frozenset({"hold", "gated", "incident", "queue-deferred", "agent-owned"})


def skipped() -> set[int]:
    return {int(x) for x in os.environ.get("LANES_ESCALATION_SKIP", "").replace(" ", "").split(",") if x.isdigit()}


def untouched_s(pr: dict, now: float) -> float | None:
    from datetime import datetime
    try:
        return now - datetime.fromisoformat(str(pr.get("updatedAt")).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def _rows(record: dict, head: str) -> list[dict]:
    return [row for row in record.get("escalations") or []
            if isinstance(row, dict) and row.get("head") == head]


def lane_can_repair(providers: dict, lane: str | None, slots=None) -> bool:
    spec = providers.get(lane) if lane else None
    if not isinstance(spec, dict) or not spec.get("enabled", True) or spec.get("repairs") is False:
        return False
    return slots is None or slots(lane, spec.get("slots", 1)) > 0


def disposition(pr: dict, record: dict | None, providers: dict, now: float, slots=None) -> str:
    record = record if isinstance(record, dict) else {}
    head = pr.get("headRefOid") or ""
    if record.get("escalated"):
        return "surfaced"
    pending = record.get("pendingEscalation")
    if isinstance(pending, dict) and pending:
        at = pending.get("at")
        if pending.get("lane") and not lane_can_repair(providers, pending["lane"], slots):
            return "stale"
        if type(at) in (int, float) and now - at >= STALE_S:
            return "stale"
        return "live"
    rows = _rows(record, head)
    if not rows:
        return "orphan"
    latest = max((float(row.get("at") or 0) for row in rows), default=0.0)
    return "idle" if now - latest >= STALE_S else "live"


def expire_pending(record: dict, now: float) -> dict:
    """The pending lane never ran it: a failed rung for that lane, so the ladder moves on."""
    entry = dict(record)
    pending = entry.pop("pendingEscalation", None) or {}
    rows = list(entry.get("escalations") or [])
    rows.append({"rung": "stale-escalation", "lane": pending.get("lane"), "cls": pending.get("cls") or "fixable-by-model",
                 "at": now, "head": pending.get("head"), "kind": "model", "topRung": bool(pending.get("topRung")),
                 "ok": False})
    entry["escalations"] = rows
    return entry


def product_rank(pr: dict) -> tuple:
    """Closest to product and revenue first: product surfaces, then features, then the rest; oldest first."""
    title = (pr.get("title") or "").lower()
    files = " ".join(f.get("path", "") for f in pr.get("files") or [] if isinstance(f, dict))
    product = any(key in title for key in ("home", "checkout", "pricing", "billing", "onboarding", "chat", "profile",
                                           "waitlist", "invite", "signup", "paywall", "activation")) \
        or "apps/web/app" in files
    feature = title.startswith(("feat", "fix")) and not title.startswith(("feat(lanes", "fix(lanes", "feat(ci", "fix(ci"))
    return (0 if product else 1 if feature else 2, pr.get("updatedAt") or "")


def reconcile(state: Path, prs: list[dict], providers: dict, *, update_attempts, remove_label, now: float | None = None,
              slots=None) -> dict:
    """Apply dispositions. `update_attempts(change)` mutates fix-attempts.json under the lanes' own writer;
    `remove_label(number)` drops the label. Returns the tick receipt."""
    now = time.time() if now is None else now
    path = state / "fix-attempts.json"
    try:
        attempts = json.loads(path.read_text())
    except (OSError, ValueError):
        return {"at": now, "error": "attempts-unreadable"}
    receipt = {"at": now, "seen": len(prs), "orphan": [], "stale": [], "idle": [], "live": 0, "surfaced": 0, "errors": []}
    expire = []
    skip = skipped()
    receipt["skipped"] = []
    for pr in sorted(prs, key=product_rank):
        number = pr.get("number")
        labels = {(l.get("name") if isinstance(l, dict) else str(l)) for l in pr.get("labels") or []}
        idle_for = untouched_s(pr, now)
        if number in skip or labels & HOLD_LABELS or idle_for is None or idle_for < STALE_S:
            receipt["skipped"].append(number)  # owned elsewhere, held, or touched within STALE_S
            continue
        kind = disposition(pr, attempts.get(str(number)), providers, now, slots)
        if kind in ("live", "surfaced"):
            receipt[kind] += 1
            continue
        try:
            if kind == "stale":
                expire.append(str(number))
            elif remove_label(number) is False:
                receipt["errors"].append(f"{number}:label")
                continue
            receipt[kind].append(number)
            _journal(state, {"pr": number, "disposition": kind, "at": now, "head": pr.get("headRefOid"),
                             "title": (pr.get("title") or "")[:120], "updatedAt": pr.get("updatedAt")})
        except Exception as error:  # one PR never stops the rest
            receipt["errors"].append(f"{number}:{type(error).__name__}")
    if expire:
        def change(current: dict) -> None:
            for key in expire:
                record = current.get(key)
                if isinstance(record, dict) and isinstance(record.get("pendingEscalation"), dict):
                    current[key] = expire_pending(record, now)
        update_attempts(change)
    return receipt


def due(state: Path, now: float | None = None) -> bool:
    now = time.time() if now is None else now
    stamp = state / "escalation-reconcile.json"
    try:
        last = float(json.loads(stamp.read_text()).get("at") or 0)
    except (OSError, ValueError, AttributeError):
        last = 0.0
    return now - last >= RECONCILE_S


def stamp(state: Path, receipt: dict) -> None:
    tmp = state / "escalation-reconcile.json.tmp"
    tmp.write_text(json.dumps({**receipt, "schema": SCHEMA}, sort_keys=True))
    os.replace(tmp, state / "escalation-reconcile.json")


def _journal(state: Path, row: dict) -> None:
    runs = state / "runs"
    runs.mkdir(parents=True, exist_ok=True)
    with open(runs / "escalation-reconcile.jsonl", "a") as out:
        out.write(json.dumps({"schema": SCHEMA, **row}, sort_keys=True) + "\n")


def fetch_labeled(gh=None) -> list[dict] | None:
    """Every open PR carrying the label, one budgeted read."""
    if gh is None:
        from gh_budget import gh_call as gh
    result = gh(["pr", "list", "--repo", "JovieInc/Jovie", "--label", LABEL, "--state", "open", "--limit", "300",
                 "--json", "number,title,headRefOid,updatedAt,files,labels"], priority="repair")
    if result.returncode != 0:
        return None
    try:
        rows = json.loads(result.stdout or "[]")
    except ValueError:
        return None
    return rows if isinstance(rows, list) else None


def remove_label_via(gh=None):
    if gh is None:
        from gh_budget import gh_call as gh

    def remove(number: int) -> bool:
        return gh(["api", "-X", "DELETE", f"repos/JovieInc/Jovie/issues/{number}/labels/{LABEL}"],
                  priority="repair").returncode == 0
    return remove
