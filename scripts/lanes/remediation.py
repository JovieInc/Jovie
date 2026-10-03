#!/usr/bin/env python3
"""Symphony's central remediation path: one event, one classifier, one ladder.

Stuck PRs, main and scheduled CI failures, deploy failures and Sentry issues
become ``jovie.remediation-event/v1`` records. A Linear issue on JOV or LYB labeled
``remediation:<fingerprint>`` is the same kind of event: one open event per
fingerprint, claimed on the tick that reads it. The classifier names the blocker.
Deterministic rungs run before any model. A providers.json router (tier, health,
cooldown) picks the next enabled lane, Hyperagent included only when its registry
entry is enabled. Needs-human and ladder-exhausted share one deduped surface.
"""
from __future__ import annotations

import hashlib
import os
import re
from datetime import datetime, timezone

SCHEMA = "jovie.remediation-event/v1"
CLASSES = (
    "ready",
    "needs-rebase",
    "flaky-infra",
    "fixable-by-model",
    "needs-human-decision",
    "obsolete",
    "main-red",
)
# Linear label `needs-human` (JOV). Writes stay behind LANES_ESCALATION_NOTIFY_TIM.
NEEDS_HUMAN_LABEL_ID = "ccf5eaaa-8705-49f0-b264-ec3558d678b7"
REMEDIATION_LABEL = "remediation"
# Detector contract: label `remediation:<fingerprint>` on a JOV or LYB issue.
LABEL_PREFIX = "remediation:"
# One label-filtered Linear read per tick. No pagination, no per-issue read.
LABELED_EVENT_QUERY = (
    'query{issues(first:100,filter:{team:{key:{in:["JOV","LYB"]}},'
    'labels:{name:{startsWith:"remediation:"}}}){nodes{id identifier title description '
    'url createdAt updatedAt state{name type} team{key states{nodes{id name type}}} '
    'labels{nodes{id name}}}}}'
)
EVENT_CLAIM_TTL_S = 2 * 3600
# MusicFetch gaps route at the in-house resolver cutover. Never a renewal.
MUSICFETCH_CUTOVER = "JOV-7323"
CLOSED_STATE_TYPES = frozenset({"completed", "canceled", "cancelled"})
HUMAN_ASKS = {
    "spend": "Tim needs to approve the spend. An agent must not start a paid plan or raise a limit.",
    "billing action": "Tim needs to perform the billing action. An agent must not change live billing.",
    "env/DNS/secrets": "Tim needs to change env, DNS, or secrets. An agent must not write credentials or DNS.",
    "store submission": "Tim needs to complete the store submission or agreement. An agent must not submit the store listing.",
    "outside human": "Tim needs a person outside the lanes to act.",
    "manual deploy": "Tim needs to run the manual deploy. An agent must not deploy by hand.",
}
INTAKE_LABEL = "symphony-remediation"
SURFACE_MARKER = "symphony-surface"
CLAIM_WINDOW_S = 30 * 60
HOLD_NAG_S = 24 * 3600
LOCKFILES = frozenset({"pnpm-lock.yaml"})
DIFF_POLICY = frozenset({"secret-file", "diff-too-large", "lockfile-without-manifest"})
STALE_LABELS = frozenset({"lane-fix-exhausted", "queue-poison", "lane-fix-escalating"})
FLAKY_CONCLUSIONS = frozenset({"CANCELLED", "TIMED_OUT", "STARTUP_FAILURE", "CANCELED"})
RED_CONCLUSIONS = FLAKY_CONCLUSIONS | {"FAILURE"}
PENDING_STATUS = frozenset({"IN_PROGRESS", "QUEUED", "PENDING", "WAITING", "REQUESTED"})
INFRA_TEXT = re.compile(
    r"runner has (?:been )?lost|The runner has received a shutdown|ETIMEDOUT|i/o timeout|"
    r"\bOOM\b|out of memory|Killed process|ENOMEM|\b5\d\d\b",
    re.IGNORECASE,
)
STRATEGY_TEXT = re.compile(
    r"canon/strategy|founder strategy|pricing|taste\b|credential",
    re.IGNORECASE,
)
ACTIONABLE_FIX = re.compile(
    r"computeRatePercent|use `|replace `|change `|fix:|add (?:the |a )?(?:story|test|colocated)|"
    r"@coverage-via|remove [`']?hold",
    re.IGNORECASE,
)
WS_BY_SOURCE = {
    "pr": "ci",
    "main-ci": "ci",
    "schedule": "ci",
    "golden-path": "ci",
    "deploy": "release-deploy",
    "sentry": "reliability",
}


def _flag(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _limit(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def escalation_enabled() -> bool:
    """Autonomous ladder. Default on: it spends only lanes already in the registry."""
    return _flag("LANES_ESCALATION", True)


def notify_tim() -> bool:
    return _flag("LANES_ESCALATION_NOTIFY_TIM", False)


def lift_human_holds() -> bool:
    return _flag("LANES_ESCALATION_LIFT_HUMAN_HOLDS", False)


def per_head_cap() -> int:
    return _limit("LANES_ESCALATION_PER_HEAD", 2)


def per_pr_cap() -> int:
    return _limit("LANES_ESCALATION_PER_PR", 4)


def cooldown_s() -> int:
    return _limit("LANES_ESCALATION_COOLDOWN_S", 30 * 60)


def blocker(cls: str, subtype: str | None, evidence, next_action: str) -> dict:
    return {"cls": cls, "subtype": subtype, "evidence": [str(item) for item in evidence if item],
            "next_action": next_action}


def fingerprint(parts: list[str]) -> str:
    text = "\n".join(sorted(str(part) for part in parts if part is not None))
    return hashlib.sha256(text.encode()).hexdigest()[:20]


def empty_escalation() -> dict:
    return {"by_class": {name: 0 for name in CLASSES}, "escalating": 0, "ladder_exhausted": 0,
            "surfaced": [], "attempts24h": 0, "landed_after_escalation24h": 0}


def empty_events() -> dict:
    return {"eventsOpen": 0, "eventsClaimed": 0, "eventsHuman": 0, "eventsExhausted": 0,
            "byFingerprint": {}}


def empty_remediation() -> dict:
    report = {"by_source": {}, "by_class": {name: 0 for name in CLASSES}, "routed_by_lane": {},
              "failovers24h": 0, "escalations24h": 0, "ladder_exhausted": 0, "surfaced": []}
    report.update(empty_events())
    return report


def _within(stamp, now: float) -> bool:
    try:
        return now - float(stamp) <= 86400
    except (TypeError, ValueError):
        return False


def escalation_summary(snapshot: dict | None, receipts: list[dict] | None, now: float) -> dict:
    snapshot = snapshot or {}
    report = empty_escalation()
    latest: dict[int, str] = {}
    for row in snapshot.get("classified") or []:
        if not isinstance(row, dict) or row.get("cls") not in report["by_class"]:
            continue
        number = row.get("pr")
        if number is not None:
            latest[int(number)] = row["cls"]
    for cls in latest.values():
        report["by_class"][cls] += 1
    report["escalating"] = len(snapshot.get("escalating") or [])
    report["ladder_exhausted"] = len(snapshot.get("ladderExhausted") or [])
    report["surfaced"] = [{"pr": row.get("pr"), "cls": row.get("cls"), "reason": row.get("reason")}
                          for row in (snapshot.get("surfaced") or []) if isinstance(row, dict)]
    report["attempts24h"] = sum(1 for row in (snapshot.get("attempts") or [])
                                if isinstance(row, dict) and _within(row.get("at"), now))
    landed = 0
    for receipt in receipts or []:
        if not isinstance(receipt, dict) or not receipt.get("escalation"):
            continue
        if receipt.get("verdict") in {"landing", "verified-not-queued"} and _within_iso(receipt.get("endedAt"), now):
            landed += 1
    report["landed_after_escalation24h"] = landed
    return report


def _within_iso(stamp, now: float) -> bool:
    if not stamp:
        return False
    try:
        parsed = datetime.fromisoformat(str(stamp).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return False
    return now - parsed <= 86400


def remediation_summary(snapshot: dict | None, receipts: list[dict] | None, now: float) -> dict:
    snapshot = snapshot or {}
    report = empty_remediation()
    for source, count in (snapshot.get("bySource") or {}).items():
        report["by_source"][str(source)] = int(count)
    escalation = escalation_summary(snapshot, receipts, now)
    report["by_class"] = escalation["by_class"]
    report["routed_by_lane"] = {str(lane): int(count) for lane, count in (snapshot.get("routedByLane") or {}).items()}
    report["failovers24h"] = sum(1 for row in (snapshot.get("failovers") or [])
                                 if isinstance(row, dict) and _within(row.get("at"), now))
    report["escalations24h"] = escalation["attempts24h"]
    report["ladder_exhausted"] = escalation["ladder_exhausted"]
    report["surfaced"] = escalation["surfaced"]
    report.update(events_summary(snapshot))
    return report


def alert_reason(report: dict) -> str | None:
    surfaced = report.get("surfaced") or []
    if not surfaced:
        return None
    listed = ", ".join(f"#{row.get('pr')} {row.get('cls')}" for row in surfaced[:12])
    return f"needs a human decision: {listed}"


def fingerprint_key(name: str) -> str:
    """Suffix of a `remediation:<fingerprint>` label. Other text is returned unchanged."""
    text = str(name or "").strip()
    if text.lower().startswith(LABEL_PREFIX):
        return text.split(":", 1)[1].strip()
    return text


def is_musicfetch(fingerprint: str) -> bool:
    key = fingerprint_key(fingerprint).lower()
    return key == "musicfetch" or key.startswith("musicfetch-")


def _label_nodes(issue: dict) -> list:
    raw = issue.get("labels") or []
    if isinstance(raw, dict):
        raw = raw.get("nodes") or []
    return list(raw)


def event_label(issue: dict) -> str | None:
    """First `remediation:<fingerprint>` label. The bare `remediation` label is not an event."""
    for node in _label_nodes(issue):
        name = node.get("name") if isinstance(node, dict) else str(node)
        key = fingerprint_key(name)
        if str(name).lower().startswith(LABEL_PREFIX) and key:
            return str(name)
    return None


def _state_type(issue: dict) -> str:
    state = issue.get("state") or {}
    return str(state.get("type") or "").lower()


def issue_open(issue: dict) -> bool:
    return _state_type(issue) not in CLOSED_STATE_TYPES


ALERT_SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
REMEDIATION_LABEL_COLOR = "#E5484D"
HISTORY_STATE_NAMES = frozenset({"done", "canceled", "cancelled", "closed"})


def stuck_pr_escalation_enabled() -> bool:
    """In-process stuck-PR ladder. Default off, and only while the router flag is on.

    Detection belongs to remediation-sweep. It files ordinary labeled issues:
    ``remediation:pr-<n>-hold`` and ``remediation:pr-<n>-conflict`` (the
    lane-fix-exhausted case). ``LANES_ESCALATION_STUCK_PRS=1`` restores the
    in-process ladder.
    """
    return escalation_enabled() and _flag("LANES_ESCALATION_STUCK_PRS", False)


def alert_key_slug(key: str) -> str | None:
    """Alert key as ``^[a-z0-9]+(-[a-z0-9]+)*$``. Colons become hyphens."""
    slug = re.sub(r"[^a-z0-9]+", "-", str(key or "").strip().lower())
    slug = re.sub(r"-{2,}", "-", slug).strip("-")
    if not slug or ALERT_SLUG.fullmatch(slug) is None:
        return None
    return slug


def remediation_label_for_alert(key: str) -> str | None:
    slug = alert_key_slug(key)
    if slug is None:
        return None
    return f"{LABEL_PREFIX}{slug}"


def has_remediation_event_label(labels) -> bool:
    """True for ``remediation:<fingerprint>``. The bare ``remediation`` label is not an event."""
    for label in labels or []:
        name = label.get("name") if isinstance(label, dict) else str(label)
        if event_label({"labels": [{"name": name}]}):
            return True
    return False


def events_summary(snapshot: dict | None) -> dict:
    """doctor.json counters. `byFingerprint` is one row per tracked fingerprint."""
    report = empty_events()
    rows = (snapshot or {}).get("events") or {}
    for fingerprint, row in rows.items():
        if not isinstance(row, dict):
            continue
        status = str(row.get("status") or "open")
        report["byFingerprint"][str(fingerprint)] = {
            "state": status, "issue": row.get("identifier"), "cls": row.get("cls"),
            "lane": row.get("lane"), "ask": row.get("ask"),
            "recurrence": int(row.get("recurrence") or 0),
            "attemptCount": int(row.get("attemptCount") if row.get("attemptCount") is not None
                                else len(row.get("attempts") or [])),
        }
        if status == "done":
            continue
        report["eventsOpen"] += 1
        if status == "claimed":
            report["eventsClaimed"] += 1
        elif status == "human":
            report["eventsHuman"] += 1
        elif status == "exhausted":
            report["eventsExhausted"] += 1
    return report
