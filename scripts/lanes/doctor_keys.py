"""Stable identity and filing guardrails for doctor-filed Linear issues (JOV-14452).

A raw alert key could embed volatile material — a worktree name, an error-text hash,
a commit SHA, a timestamp, a run or PR number — so the old title lookup missed on every
refire and each variant filed its own issue: 1,127 sweep-snapshot-secret:<worktree>
issues flapped Done↔Triage every ~2h (JOV-14030) and capacity:access-gaps-mac:<hash>
filed 33 twins of one condition (JOV-12257). This module is deliberately stdlib-only so
any lanes or capacity process can adopt it.

Guards, in order:
  * normalize() folds volatile key material (hex >=7, ISO stamps, run/PR references,
    counts) into placeholders, so a variant refire keeps one stable identity.
  * Every filed body carries `<!-- doctor-key:<sha256> -->`; the filer looks the marker
    up in ANY state before creating anything, so a closed owner is reopened, never
    twinned — no cool-off-expiry path back to a fresh issue exists.
  * Hysteresis: an alert must stay absent for 3 consecutive ticks and 30 minutes
    before its issue may close.
  * Flap damping: 3+ reopens within 24h freeze the issue (label doctor-flapping, at
    most one comment a day, no further state moves).
  * Rate cap: at most 3 creates+reopens per hour per key family (the prefix before
    the first ':'); the overflow and the no-impact classes (sweep holds, capacity
    access gaps, worktree or scanner) fold into one upserted per-host rollup
    checklist (Backlog, never Triage) plus a doctor-filer-anomaly line.
  * A sweep report with no readable secretHeld (missing, or a sweep in progress —
    startedAt only) is UNKNOWN coverage: a hold, never an empty set, so nothing
    closes mid-sweep (JOV-14452 P0, 2026-11-24 flap).
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

MARKER_PREFIX = "<!-- doctor-key:"
MARKER_SUFFIX = " -->"
ROLLOUP_KEY = "rollup"
ROLLOUP_TITLE_PREFIX = "Symphony doctor: rollup"
ANOMALY_CLASS = "doctor-filer-anomaly"
FLAP_LABEL = "doctor-flapping"
LEDGER_NAME = "doctor-filer.json"

CREATE_CAP_PER_HOUR = 3
CAP_WINDOW_S = 3600
HYSTERESIS_TICKS = 3
HYSTERESIS_S = 30 * 60
FLAP_REOPENS = 3
FLAP_WINDOW_S = 24 * 3600
FLAP_COMMENT_INTERVAL_S = 24 * 3600
CHECKLIST_ITEM_CAP = 60

_ISO_RE = re.compile(r"\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?Z?)?")
_HEX_RE = re.compile(r"[0-9a-fA-F]{7,}")
_REF_RE = re.compile(r"(?i)(?:^|(?<=[\s:._#-]))(?:pr|run|pull|issue|job|sha|commit|build)[\s:._#-]*#?\d+")
_COUNT_RE = re.compile(r"(?:^|(?<=[\s:._#-]))\d+(?=$|[\s:._#-])")

# Classes with no customer impact: they never own a Triage issue, only a rollup line.
_IMPACT_FREE_CLASSES = (
    ("sweep-snapshot-secret", re.compile(r"^sweep-snapshot-secret(:|$)")),
    ("capacity:access-gaps", re.compile(r"^capacity:access-gaps")),
    ("worktree-or-scanner", re.compile(r"^(worktree|scanner|scan-failed)(:|-|$)")),
)


def normalize(key: str) -> str:
    """Fold volatile material out of an alert key: hex runs (>=7 chars, so commit SHAs
    and error-text hashes), ISO timestamps, run/PR/job references, and bare counts all
    become placeholders. Stable class material survives untouched."""
    out = _ISO_RE.sub("<t>", str(key))
    out = _HEX_RE.sub("<h>", out)
    out = _REF_RE.sub("<n>", out)
    out = _COUNT_RE.sub("<n>", out)
    return out.strip() or "<key>"


def doctor_key(key: str, host: str) -> str:
    """The durable issue identity for one key on one host."""
    return hashlib.sha256(f"{host}\n{normalize(key)}".encode()).hexdigest()


def marker(key: str, host: str) -> str:
    """The body marker a filed issue carries so any later writer finds it in any state."""
    return f"{MARKER_PREFIX}{doctor_key(key, host)}{MARKER_SUFFIX}"


def stable_of(key: str) -> tuple[str, str | None]:
    """(normalized key, impact-free class name or None) for a raw alert key."""
    stable = normalize(key)
    return stable, impact_free_class(stable)


def impact_free_class(normalized: str) -> str | None:
    for name, pattern in _IMPACT_FREE_CLASSES:
        if pattern.match(normalized):
            return name
    return None


def issue_title(key: str, host: str) -> str:
    if key == ROLLOUP_KEY or impact_free_class(normalize(key)):
        return f"{ROLLOUP_TITLE_PREFIX} ({host})"
    return f"Symphony doctor: {normalize(key)} ({host})"


def owner_entry(key: str, issues: dict):
    """The prior entry owning this alert key: its own, or — when the raw key is a
    volatile variant — the shared owner filed under a sibling key of the same stable
    identity (JOV-14452)."""
    entry = issues.get(key)
    if entry is not None:
        return entry
    stable = normalize(key)
    for raw, row in issues.items():
        if row.get("id") and normalize(raw) == stable:
            return row
    return None


def absent_close_plan(issues: dict, alerts: dict, sweep_key: str, hysteresis: dict, now: float):
    """One pass of close hysteresis (JOV-14452): bump consecutive-absent counts per
    stable key (sibling variants count one absence per tick; a still-firing variant
    holds its owner open), prune settled keys, and return (firing stables, entries
    whose owner may close now — mature, or already pending an uncertain close)."""
    firing = {normalize(key) for key in alerts if key != sweep_key}
    counted, closable = set(), []
    for key, entry in issues.items():
        if key == sweep_key or key in alerts or not (entry.get("closedAt") is None or entry.get("pendingAction")):
            continue
        stable = normalize(key)
        if stable in firing:
            continue  # a variant of this stable key is still firing: its owner stays open
        tick = hysteresis.setdefault(stable, {"absentTicks": 0, "lastSeenAt": now})
        if stable not in counted:
            counted.add(stable)
            tick["absentTicks"] = int(tick.get("absentTicks") or 0) + 1
            if not isinstance(tick.get("lastSeenAt"), (int, float)):
                tick["lastSeenAt"] = now  # no recorded sighting: the first absence bounds the wait
        if (int(tick["absentTicks"]) >= HYSTERESIS_TICKS
                and now - float(tick["lastSeenAt"]) >= HYSTERESIS_S) or entry.get("pendingAction"):
            closable.append(key)
    live = firing | {normalize(key) for key, entry in issues.items()
                     if entry.get("closedAt") is None or entry.get("pendingAction")}
    for stable in list(hysteresis):
        if stable not in live:
            hysteresis.pop(stable)
    return firing, closable


def hold_breakdown(rows, coverage: str | None = None) -> str | None:
    """Classify sweep-hold rows by reason prefix: a scan failure (e.g.
    scan-failed:trufflehog=1) is a scanner error, not a finding — a real finding is
    the scanner's findings exit (183). Counts only; never a reason string, path or
    worktree name (redaction). Unknown coverage (missing rows, or a sweep in
    progress with startedAt only) is a HOLD, never an empty set (P0 2026-11-24)."""
    if coverage == "unknown" or rows is None:
        return ("sweep coverage unknown (in progress or unreadable) — hold state unchanged, "
                "nothing counted or cleared")
    scanner = findings = 0
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        reason = str(row.get("reason") or "")
        if reason.startswith("scan-failed"):
            scanner += 1
        elif reason.startswith("secret-finding"):
            findings += 1
    if not (scanner or findings):
        return None
    parts = []
    if scanner:
        parts.append(f"{scanner} scanner error(s) (scan failed, not findings)")
    if findings:
        parts.append(f"{findings} confirmed finding(s)")
    return ", ".join(parts)


def family_of(key: str) -> str:
    """The rate-cap family (P0 2026-11-24): the alert-key prefix before the first ':'.
    "capacity:access-gaps-mac" and "capacity:disk-low" share the family "capacity";
    a colon-less key is its own family."""
    return str(key).split(":", 1)[0]


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def default_ledger_path() -> Path | None:
    """The lanes state dir beside doctor.json, when one exists. Test contexts —
    the release self-test, or any pytest session (the structural conftest scrubs
    LANES_* before collection, so LANES_SELFTEST alone cannot mark one) — and
    hosts without a state dir get an in-memory ledger: Linear markers keep
    issue identity durable regardless."""
    if os.environ.get("LANES_SELFTEST") or "pytest" in sys.modules:
        return None
    base = Path(os.environ.get("LANES_STATE") or Path.home() / ".local/state/jovie-lanes")
    return base / LEDGER_NAME if base.is_dir() else None
