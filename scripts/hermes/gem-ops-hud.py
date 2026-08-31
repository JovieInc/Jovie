#!/usr/bin/env python3
"""Low-overhead, read-only operations HUD for Gem's Linux console.

JOV-INV-017: the HUD is display-only. Summer's red-loop queue is rendered from
the same canonical persisted file the controller writes; this process never
invents stall items or issues control-plane writes.
"""

from __future__ import annotations

import argparse
import datetime as dt
import html.parser
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import termios
import textwrap
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


REPO = "JovieInc/Jovie"
LOCAL_INTERVAL = max(10, int(os.environ.get("HUD_LOCAL_INTERVAL", "15")))
REMOTE_INTERVAL = max(60, int(os.environ.get("HUD_REMOTE_INTERVAL", "120")))
FLEET_RECEIPT_STALE_SECONDS = 10 * 60
FLEET_RECEIPT_FUTURE_SKEW_SECONDS = 5
STALE_AFTER = {
    "symphony": LOCAL_INTERVAL * 3,
    "fleet": FLEET_RECEIPT_STALE_SECONDS,
    "delivery": REMOTE_INTERVAL * 3,
    "issues": REMOTE_INTERVAL * 3,
    "ops": REMOTE_INTERVAL * 3,
}
MEASURED_METRICS_FILE = Path(
    os.environ.get("HUD_METRICS_FILE", "~/.local/state/gem-ops-hud/measured.json")
).expanduser()
STATE_DIR = Path(os.environ.get("HUD_STATE_DIR", "~/.local/state/gem-ops-hud")).expanduser()
STATE_FILE = STATE_DIR / "state.json"
FLEET_GATE_RECEIPT = Path(
    os.environ.get(
        "HUD_FLEET_GATE_RECEIPT",
        "/home/timwhite/gem-workspace/state/gem-priority-gate/latest.json",
    )
).expanduser()
FLEET_GATE_SCHEMA = "jovie-fleet-gate/v1"
PR_FLEET_CLOSURE_AUDIT_SCHEMA = "jovie-pr-fleet-closure-audit/v1"
PR_FLEET_CLOSURE_AUDIT_PATH = Path(
    os.environ.get(
        "HUD_PR_FLEET_CLOSURE_AUDIT",
        "/home/timwhite/gem-workspace/state/ownerless-recovery/pr-fleet-closure-audit.json",
    )
).expanduser()
SUMMER_QUEUE_SCHEMA = "jovie-summer-red-queue/v2"
SUMMER_QUEUE_STALE_SECONDS = 90 * 60
SUMMER_QUEUE_PATH = Path(
    os.environ.get(
        "HUD_SUMMER_QUEUE",
        "/home/timwhite/gem-workspace/state/jovie-delivery-controller/summer-queue.json",
    )
).expanduser()
WORKFLOWS = {
    "CI",
    "Production Controller",
    "Fleet Gate Refresh",
    "Merge Queue Auto-Enroll",
    "Queue-Deferred Release",
    "Delivery Control Receipts",
}
LINEAR_API = "https://api.linear.app/graphql"
LINEAR_TEAM_KEY = "JOV"
GITHUB_READY_LABELS = {"agent-ready", "ready-for-intake"}
GITHUB_ISSUE_FALLBACK_RETIRED = True


class IssueSourceUnavailable(RuntimeError):
    """Both read-only issue sources were unavailable."""


def now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def iso(ts: dt.datetime | None = None) -> str:
    return (ts or now()).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_time(value: str | None) -> dt.datetime | None:
    if not value:
        return None
    try:
        return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _typed_bool(value: Any, name: str) -> bool:
    if not isinstance(value, bool):
        raise ValueError(f"{name} must be boolean")
    return value


def fetch_fleet_gate(path: Path | None = None) -> dict[str, Any]:
    """Read the canonical typed fleet receipt without inventing lane state."""
    source = path or FLEET_GATE_RECEIPT
    receipt = json.loads(source.read_text(encoding="utf-8"))
    if not isinstance(receipt, dict) or receipt.get("schema") != FLEET_GATE_SCHEMA:
        raise ValueError("invalid fleet gate schema")
    observed_at = receipt.get("observedAt")
    observed_stamp = parse_time(observed_at) if isinstance(observed_at, str) else None
    if (
        observed_stamp is None
        or observed_stamp.tzinfo is None
        or observed_stamp.utcoffset() is None
        or (observed_stamp - now()).total_seconds()
        > FLEET_RECEIPT_FUTURE_SKEW_SECONDS
    ):
        raise ValueError("invalid fleet gate observedAt")
    if receipt.get("state") not in {"GREEN", "AMBER", "RED"}:
        raise ValueError("invalid fleet gate state")
    if receipt.get("promotionMode") not in {
        "normal",
        "isolated-only",
        "draft-only",
        "hold-intake",
        "blocked",
    }:
        raise ValueError("invalid fleet promotion mode")
    if not isinstance(receipt.get("reasons"), list):
        raise ValueError("invalid fleet gate reasons")

    cohort = receipt.get("alreadyAdmittedCohort")
    if not isinstance(cohort, dict):
        raise ValueError("missing admitted cohort contract")
    _typed_bool(cohort.get("newIntakeAllowed"), "alreadyAdmittedCohort.newIntakeAllowed")

    required_admissions = {
        "workAdmission": ("allowed", "newIssueLeaseAllowed"),
        "promotionAdmission": ("allowed",),
        "remediationAdmission": ("allowed", "localAllowed", "pushAllowed"),
        "deploymentAdmission": ("allowed",),
    }
    for section_name, fields in required_admissions.items():
        section = receipt.get(section_name)
        if not isinstance(section, dict):
            raise ValueError(f"missing {section_name}")
        for field in fields:
            _typed_bool(section.get(field), f"{section_name}.{field}")

    result = dict(receipt)
    result["updated"] = observed_at
    result["error"] = None
    return result


def load_summer_queue(path: Path | None = None) -> dict[str, Any]:
    """Read Summer's persisted red-loop queue. Display-only; never invent items."""
    source = path or SUMMER_QUEUE_PATH
    empty = {
        "schema": SUMMER_QUEUE_SCHEMA,
        "authority": "Summer",
        "observedAt": None,
        "items": [],
        "terminalTombstones": [],
        "updated": None,
    }
    try:
        payload = json.loads(source.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        return {**empty, "error": f"summer-queue-unavailable:{type(error).__name__}"}
    if (
        not isinstance(payload, dict)
        or payload.get("schema") != SUMMER_QUEUE_SCHEMA
        or payload.get("authority") != "Summer"
        or not isinstance(payload.get("items"), list)
        or not isinstance(payload.get("terminalTombstones"), list)
    ):
        return {**empty, "error": "summer-queue-malformed"}
    observed_at = payload.get("observedAt")
    observed_stamp = parse_time(observed_at) if isinstance(observed_at, str) else None
    if (
        observed_stamp is None
        or observed_stamp.tzinfo is None
        or observed_stamp.utcoffset() is None
    ):
        return {**empty, "error": "summer-queue-invalid-observedAt"}
    queue_age = (now() - observed_stamp).total_seconds()
    if queue_age < -FLEET_RECEIPT_FUTURE_SKEW_SECONDS:
        return {
            **empty,
            "observedAt": observed_at,
            "updated": observed_at,
            "error": "summer-queue-future-observedAt",
        }
    if queue_age > SUMMER_QUEUE_STALE_SECONDS:
        return {
            **empty,
            "observedAt": observed_at,
            "updated": observed_at,
            "error": "summer-queue-stale",
        }

    terminal_tombstones: list[dict[str, Any]] = []
    for raw_tombstone in payload["terminalTombstones"]:
        if not isinstance(raw_tombstone, dict):
            return {**empty, "error": "summer-queue-malformed-tombstone"}
        tombstone = dict(raw_tombstone)
        tombstone_observed_at = tombstone.get("observedAt")
        tombstone_stamp = (
            parse_time(tombstone_observed_at)
            if isinstance(tombstone_observed_at, str)
            else None
        )
        has_identity = (
            isinstance(tombstone.get("issue"), str)
            and bool(tombstone["issue"].strip())
        ) or (
            isinstance(tombstone.get("issueKey"), str)
            and bool(tombstone["issueKey"].strip())
        ) or (
            isinstance(tombstone.get("pr"), int)
            and not isinstance(tombstone.get("pr"), bool)
            and tombstone["pr"] > 0
        )
        if (
            tombstone.get("outcome") != "healthy"
            or tombstone.get("terminal") is not True
            or tombstone_stamp is None
            or tombstone_stamp.tzinfo is None
            or tombstone_stamp.utcoffset() is None
            or not has_identity
        ):
            return {**empty, "error": "summer-queue-malformed-tombstone"}
        terminal_tombstones.append(tombstone)

    items: list[dict[str, Any]] = []
    stale_items = 0
    malformed_items = 0
    terminal_items = 0
    for raw_item in payload["items"]:
        if not isinstance(raw_item, dict):
            malformed_items += 1
            continue
        item = dict(raw_item)
        outcome = item.get("outcome")
        terminal = item.get("terminal")
        if outcome not in {"open", "healthy", "escalated"} or not isinstance(
            terminal, bool
        ):
            malformed_items += 1
            continue
        if outcome == "healthy":
            if terminal is not True:
                malformed_items += 1
                continue
            terminal_tombstones.append(item)
            terminal_items += 1
            continue
        if outcome == "escalated":
            if terminal is not True:
                malformed_items += 1
                continue
            items.append(item)
            continue
        item_observed_at = item.get("observedAt")
        item_stamp = (
            parse_time(item_observed_at)
            if isinstance(item_observed_at, str)
            else None
        )
        if terminal is True or item_stamp is None or item_stamp.tzinfo is None:
            malformed_items += 1
            continue
        item_age = (now() - item_stamp).total_seconds()
        if (
            item_stamp.utcoffset() is None
            or item_age < -FLEET_RECEIPT_FUTURE_SKEW_SECONDS
        ):
            malformed_items += 1
            continue
        if item_age > SUMMER_QUEUE_STALE_SECONDS:
            stale_items += 1
            continue
        items.append(item)

    result = dict(payload)
    result["items"] = items
    result["terminalTombstones"] = terminal_tombstones
    result["updated"] = observed_at
    result["suppressed"] = {
        "stale": stale_items,
        "terminal": terminal_items,
        "malformed": malformed_items,
    }
    result["error"] = (
        "summer-queue-items-rejected:"
        f"stale={stale_items},malformed={malformed_items}"
        if stale_items or malformed_items
        else None
    )
    return result


PR_FLEET_CATEGORIES = (
    ("draft", "Draft", ("draft", "drafts")),
    (
        "ready",
        "Green / ready",
        ("ready", "green", "greenReady", "greenReadyPrs", "green_ready"),
    ),
    (
        "queued",
        "Native queue",
        ("queued", "nativeQueue", "native_queue", "mergeQueue", "merge_queue"),
    ),
    ("remediating", "Remediating", ("remediating", "inRemediation", "in_remediation")),
    (
        "blocked",
        "Blocked",
        (
            "blocked",
            "founderBlocked",
            "externalBlocked",
            "founder_external_blocked",
        ),
    ),
    (
        "conflict",
        "Conflict / unstable",
        ("conflict", "conflicts", "unstable", "conflictUnstable", "conflict_unstable"),
    ),
    (
        "ownerless",
        "Ownerless / stalled",
        ("ownerless", "stalled", "ownerlessStalled", "ownerless_stalled"),
    ),
    ("superseded", "Superseded", ("superseded", "supersession")),
)
PR_FLEET_UNKNOWN_COUNTS = {
    key: None for key, _label, _aliases in PR_FLEET_CATEGORIES
}


def _unknown_pr_fleet_receipt(
    error: str, updated: str | None = None, source: str | None = None
) -> dict[str, Any]:
    return {
        "schema": PR_FLEET_CLOSURE_AUDIT_SCHEMA,
        "updated": updated,
        "error": error,
        "source": source or "typed PR fleet closure audit",
        "total": None,
        "counts": dict(PR_FLEET_UNKNOWN_COUNTS),
        "queue": [],
    }


def _strict_count(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{name} must be a non-negative integer")
    return value


def _count_from_aliases(
    source: dict[str, Any], aliases: tuple[str, ...], name: str
) -> int:
    for alias in aliases:
        if alias in source:
            return _strict_count(source[alias], name)
    raise ValueError(f"missing {name}")


def _partial_pr_fleet_receipt(receipt: dict[str, Any]) -> bool:
    if receipt.get("partial") is True or receipt.get("incomplete") is True:
        return True
    if receipt.get("complete") is False:
        return True
    page_info = receipt.get("pageInfo") or receipt.get("pagination") or {}
    if isinstance(page_info, dict) and page_info.get("hasNextPage") is True:
        return True
    if receipt.get("complete") is True:
        return False
    return not (isinstance(page_info, dict) and page_info.get("hasNextPage") is False)


def _normalize_pr_fleet_queue(queue: Any) -> list[dict[str, Any]]:
    if not isinstance(queue, list):
        return []
    normalized: list[dict[str, Any]] = []
    for item in queue[:20]:
        if not isinstance(item, dict):
            continue
        number = item.get("number") or item.get("pr")
        position = item.get("position")
        if (
            isinstance(number, bool)
            or isinstance(position, bool)
            or not isinstance(number, int)
            or not isinstance(position, int)
            or number <= 0
            or position <= 0
        ):
            continue
        normalized.append(
            {
                "number": number,
                "position": position,
                "title": compact(item.get("title") or "title unavailable", 56),
            }
        )
    return sorted(normalized, key=lambda item: item["position"])


def load_pr_fleet_closure_audit(path: Path | None = None) -> dict[str, Any]:
    source_path = path or PR_FLEET_CLOSURE_AUDIT_PATH
    try:
        receipt = json.loads(source_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return _unknown_pr_fleet_receipt("pr-fleet-closure-audit-unavailable")
    except (OSError, json.JSONDecodeError) as exc:
        return _unknown_pr_fleet_receipt(type(exc).__name__)

    source_name = receipt.get("source") if isinstance(receipt, dict) else None
    observed_at = receipt.get("observedAt") if isinstance(receipt, dict) else None
    try:
        if not isinstance(receipt, dict):
            raise ValueError("pr-fleet-closure-audit-malformed")
        if receipt.get("schema") != PR_FLEET_CLOSURE_AUDIT_SCHEMA:
            raise ValueError("pr-fleet-closure-audit-schema-mismatch")
        repo = receipt.get("repo") or receipt.get("repository")
        if repo != REPO:
            raise ValueError("pr-fleet-closure-audit-source-mismatch")
        observed_stamp = parse_time(observed_at) if isinstance(observed_at, str) else None
        if (
            observed_stamp is None
            or observed_stamp.tzinfo is None
            or observed_stamp.utcoffset() is None
        ):
            raise ValueError("pr-fleet-closure-audit-invalid-observedAt")
        age_seconds = (now() - observed_stamp).total_seconds()
        if age_seconds < -FLEET_RECEIPT_FUTURE_SKEW_SECONDS:
            raise ValueError("pr-fleet-closure-audit-future-observedAt")
        if age_seconds > FLEET_RECEIPT_STALE_SECONDS:
            raise ValueError("pr-fleet-closure-audit-stale")
        if _partial_pr_fleet_receipt(receipt):
            raise ValueError("pr-fleet-closure-audit-partial-pagination")
        counts_source = receipt.get("counts")
        if not isinstance(counts_source, dict):
            raise ValueError("pr-fleet-closure-audit-missing-counts")
        total = _count_from_aliases(
            receipt,
            ("totalOpenPrs", "total", "open", "openPrs", "open_prs"),
            "totalOpenPrs",
        )
        counts = {
            key: _count_from_aliases(counts_source, aliases, key)
            for key, _label, aliases in PR_FLEET_CATEGORIES
        }
        if sum(counts.values()) != total:
            raise ValueError("pr-fleet-closure-audit-total-mismatch")
    except ValueError as exc:
        return _unknown_pr_fleet_receipt(str(exc), observed_at, source_name)

    return {
        "schema": PR_FLEET_CLOSURE_AUDIT_SCHEMA,
        "updated": observed_at,
        "error": None,
        "source": source_name or "typed PR fleet closure audit",
        "repo": repo,
        "total": total,
        "counts": counts,
        "queue": _normalize_pr_fleet_queue(receipt.get("queue")),
    }


def fleet_lane_statuses(receipt: dict[str, Any]) -> dict[str, tuple[str, str]]:
    """Project independent fleet lanes; unknown input always fails closed."""
    unknown = (
        "NOT PROVEN",
        "refresh typed fleet receipt; admission stays closed until authority is proven",
    )
    unknown_lanes = {
        lane: unknown
        for lane in (
            "work",
            "leases",
            "remediation",
            "queue",
            "promotion",
            "deployment",
        )
    }
    try:
        observed_at = receipt["observedAt"]
        observed_stamp = parse_time(observed_at)
        if (
            receipt.get("error")
            or observed_stamp is None
            or observed_stamp.tzinfo is None
            or observed_stamp.utcoffset() is None
        ):
            return unknown_lanes
        age_seconds = (now() - observed_stamp).total_seconds()
        if (
            age_seconds > FLEET_RECEIPT_STALE_SECONDS
            or age_seconds < -FLEET_RECEIPT_FUTURE_SKEW_SECONDS
        ):
            return unknown_lanes
        work = _typed_bool(receipt["workAdmission"]["allowed"], "work")
        leases = _typed_bool(
            receipt["workAdmission"]["newIssueLeaseAllowed"], "leases"
        )
        remediation_local = _typed_bool(
            receipt["remediationAdmission"]["localAllowed"], "remediation.local"
        )
        remediation_push = _typed_bool(
            receipt["remediationAdmission"]["pushAllowed"], "remediation.push"
        )
        promotion = _typed_bool(
            receipt["promotionAdmission"]["allowed"], "promotion"
        )
        deployment = _typed_bool(
            receipt["deploymentAdmission"]["allowed"], "deployment"
        )
        cohort_intake = _typed_bool(
            receipt["alreadyAdmittedCohort"]["newIntakeAllowed"], "cohort intake"
        )
        state = receipt["state"]
        mode = receipt["promotionMode"]
        reasons = {
            reason.get("code")
            for reason in receipt.get("reasons", [])
            if isinstance(reason, dict)
        }
    except (KeyError, TypeError, ValueError):
        return unknown_lanes

    work_lane = (
        ("ACTIVE", "implementation, tests, and review remain admitted")
        if work
        else ("BLOCKED", "fleet work admission is closed")
    )
    if leases:
        lease_lane = ("ACTIVE", "approved issue leases may be claimed")
    elif work:
        queue = receipt.get("signals", {}).get("queue", {})
        ready = queue.get("greenReadyPrs", "?") if isinstance(queue, dict) else "?"
        target = queue.get("target", "?") if isinstance(queue, dict) else "?"
        lease_lane = (
            "BACKPRESSURE",
            f"new issue leases paused at green-ready {ready}/{target}; total open is not used",
        )
    else:
        lease_lane = ("BLOCKED", "fleet work admission is closed")

    if remediation_local and remediation_push:
        remediation_lane = (
            "ACTIVE",
            "bounded exact-head diagnosis, tests, repair, and push are admitted",
        )
    elif remediation_local:
        remediation_lane = (
            "LOCAL ONLY",
            "diagnosis/tests allowed; remote PR head mutation is closed",
        )
    else:
        remediation_lane = ("BLOCKED", "PR remediation admission is closed")

    if state == "RED" or not work:
        queue_lane = ("BLOCKED", "native queue controller is fail-closed")
    elif mode == "normal":
        queue_lane = (
            "ACTIVE",
            "exact-head checks, review, labels, conflicts, and dependencies still apply",
        )
    elif mode in {"hold-intake", "draft-only"} and cohort_intake:
        queue_lane = (
            "FLOWING",
            "clean unrelated PRs continue; PR-specific dependency gates still apply",
        )
    elif mode == "isolated-only":
        queue_lane = (
            "BOUNDED",
            "only exact-head semantically isolated admission is allowed",
        )
    else:
        queue_lane = ("BLOCKED", "native queue admission is paused by fleet policy")

    if promotion:
        promotion_lane = ("ACTIVE", "release promotion authority is open")
    elif mode == "hold-intake" and reasons == {"production-deployment-unbound"}:
        promotion_lane = (
            "PAUSED",
            "exact-main release only; fleet work, remediation, and clean queue stay separate",
        )
    else:
        promotion_lane = ("BLOCKED", "release promotion authority is closed")

    deployment_lane = (
        ("ACTIVE", "exact-main Production Controller catch-up is authorized")
        if deployment
        else ("BLOCKED", "production deployment authority is closed")
    )
    return {
        "work": work_lane,
        "leases": lease_lane,
        "remediation": remediation_lane,
        "queue": queue_lane,
        "promotion": promotion_lane,
        "deployment": deployment_lane,
    }


def age_text(value: str | None) -> str:
    stamp = parse_time(value)
    if not stamp:
        return "unknown"
    seconds = max(0, int((now() - stamp).total_seconds()))
    if seconds < 60:
        return f"{seconds}s"
    if seconds < 3600:
        return f"{seconds // 60}m"
    if seconds < 86400:
        return f"{seconds // 3600}h{(seconds % 3600) // 60:02d}m"
    return f"{seconds // 86400}d{(seconds % 86400) // 3600:02d}h"


def elapsed_text(value: str | None) -> str:
    return age_text(value) if value else "unknown"


def compact(text: Any, limit: int = 72) -> str:
    value = re.sub(r"\s+", " ", "" if text is None else str(text)).strip()
    return value if len(value) <= limit else value[: max(1, limit - 3)] + "..."


def clip_line(text: Any, limit: int) -> str:
    value = str(text).rstrip()
    return value if len(value) <= limit else value[: max(1, limit - 3)] + "..."


def error_kind(text: Any) -> str:
    value = str(text or "").lower()
    if "no available orchestrator slots" in value:
        return "capacity"
    if "response_timeout" in value or "timed out" in value or "timeout" in value:
        return "timeout"
    match = re.search(r"port_exit[, :]\s*(\d+)", value)
    if match:
        return "launcher_failure"
    if "rate" in value and "limit" in value:
        return "timeout"
    if any(term in value for term in ("merge queue", "merge-queue", "merge_queue")):
        return "merge_queue_wait"
    if any(term in value for term in ("ci failure", "check failure", "required check", "test failure")):
        return "ci_check_failure"
    if any(term in value for term in ("operator input", "approval required", "owner input", "human review")):
        return "ownership_input"
    return "other"


def configured_slots() -> int | None:
    path = Path("/home/timwhite/symphony-runtime/elixir/WORKFLOW.jovie-ui-pilot.md")
    try:
        match = re.search(r"^\s*max_concurrent_agents:\s*([1-9][0-9]*)\s*$", path.read_text(), re.MULTILINE)
        return int(match.group(1)) if match else None
    except OSError:
        return None


def duration_text(seconds: float | int | None) -> str:
    if seconds is None:
        return "unknown"
    value = max(0, int(seconds))
    if value < 60:
        return f"{value}s"
    if value < 3600:
        return f"{value // 60}m {value % 60:02d}s"
    return f"{value // 3600}h {(value % 3600) // 60:02d}m"


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, int((len(ordered) - 1) * fraction + 0.5)))
    return ordered[index]


def until_text(value: str | None) -> str:
    stamp = parse_time(value)
    if not stamp:
        return "time unknown"
    seconds = int((stamp - now()).total_seconds())
    if seconds <= 0:
        return "due now"
    return f"in {duration_text(seconds)}"


def color_enabled() -> bool:
    mode = os.environ.get("HUD_COLOR", "auto").lower()
    if mode == "never" or "NO_COLOR" in os.environ:
        return False
    return mode == "always" or (sys.stdout.isatty() and os.environ.get("TERM", "") != "dumb")


ANSI_TOKEN_ROLES = {
    # Gem's Linux virtual console advertises eight colors. The Noir Ion surface
    # ladder therefore collapses to black; spacing and border contrast carry
    # elevation while semantic foreground roles keep their nearest ANSI hue.
    "surface.canvas": "black",
    "surface.shell": "black",
    "surface.panel": "black",
    "surface.card": "black",
    "text.primary": "bold/default",
    "text.secondary": "default",
    "text.tertiary": "dim/default",
    "border.subtle": "dim/cyan",
    "border.default": "cyan",
    "border.strong": "bold/cyan",
    "accent.ion": "cyan",
    "status.success": "green",
    "status.warning": "yellow",
    "status.error": "red",
    "accent.ultra": "magenta",
}


def _ansi(text: str, *codes: str) -> str:
    return f"\x1b[{';'.join(codes)}m{text}\x1b[0m"


STATUS_TOKEN_STYLES = (
    (("ERROR", "FAILING", "FAILED", "BLOCKED", "DEFAULT DEAD"), ("1", "31")),
    (("OWNER INPUT", "HUMAN ACTION", "DECISION"), ("1", "35")),
    (("UNAVAILABLE", "UNKNOWN", "NOT PROVEN", "STALE", "DEGRADED", "PENDING", "ATTENTION", "RETRY", "BACKPRESSURE", "PAUSED", "BELOW BAR"), ("1", "33")),
    (("ACTIVE", "RUNNING", "CLEAR", "EXACT", "HEALTHY", "DEFAULT ALIVE", "READY"), ("1", "32")),
)
STATUS_TOKEN_CODES = {
    token: codes for tokens, codes in STATUS_TOKEN_STYLES for token in tokens
}
STATUS_TOKEN_PATTERN = re.compile(
    "|".join(
        re.escape(token)
        for token in sorted(STATUS_TOKEN_CODES, key=len, reverse=True)
    )
)


def _style_status_tokens(text: str, restore_codes: tuple[str, ...] = ()) -> str:
    restore = f"\x1b[{';'.join(restore_codes)}m" if restore_codes else ""
    return STATUS_TOKEN_PATTERN.sub(
        lambda match: _ansi(match.group(0), *STATUS_TOKEN_CODES[match.group(0)])
        + restore,
        text,
    )


def colorize_line(line: str) -> str:
    if not color_enabled():
        return line
    if line.startswith("┌─") or "GEM OPERATIONS" in line:
        strong_titles = (
            "GEM OPERATIONS",
            "IMMEDIATE ATTENTION",
            "#1 BOTTLENECK",
            "RECENT DELIVERY LOG",
            "IMPLEMENTING NOW",
            "RETRY WAIT",
            "NATIVE QUEUE",
        )
        return _ansi(line, *("1", "36") if any(title in line for title in strong_titles) else ("36",))
    if line.startswith("└"):
        return _ansi(line, "2", "36")
    if not line.strip(" │"):
        return _ansi(line, "2")
    if "UTC " in line and "host gem" in line:
        return _ansi(line, "2")
    if "█" in line:
        return _ansi(line, "1")

    # Source, freshness, and provenance after the semantic value are tertiary.
    metadata = re.compile(r"( · [^│]+)(?= │)")
    pieces: list[str] = []
    cursor = 0
    for match in metadata.finditer(line):
        pieces.append(_style_status_tokens(line[cursor : match.start()]))
        pieces.append(_ansi(_style_status_tokens(match.group(1), ("2",)), "2"))
        cursor = match.end()
    pieces.append(_style_status_tokens(line[cursor:]))
    return "".join(pieces)


GRID_WIDTH = 160
GRID_LABEL = 24
GRID_VALUE = 14
GRID_STATE = 16
GRID_DETAIL = 93


def grid_bar(fill: str = "-") -> str:
    return "+" + (fill * (GRID_WIDTH - 2)) + "+"


def grid_title(text: str) -> str:
    value = clip_line(text, GRID_WIDTH - 4)
    return f"| {value:<{GRID_WIDTH - 4}} |"


def grid_row(label: Any, value: Any = "", status: Any = "", detail: Any = "") -> str:
    label_text = compact(label, GRID_LABEL)
    value_text = compact(value, GRID_VALUE)
    status_text = compact(status, GRID_STATE)
    detail_text = compact(detail, GRID_DETAIL)
    return (
        f"| {label_text:<{GRID_LABEL}} | {value_text:>{GRID_VALUE}} | "
        f"{status_text:<{GRID_STATE}} | {detail_text:<{GRID_DETAIL}} |"
    )


def http_json(url: str, timeout: float = 5.0) -> Any:
    request = urllib.request.Request(url, headers={"User-Agent": "gem-ops-hud/1"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read(1_000_000).decode("utf-8"))


def http_text(url: str, timeout: float = 4.0) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "gem-ops-hud/1"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read(1_000_000).decode("utf-8", "replace")


def run_json(command: list[str], timeout: float = 20.0) -> Any:
    completed = subprocess.run(
        command,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=timeout,
        check=True,
        env={**os.environ, "GH_PAGER": "cat", "PAGER": "cat"},
    )
    return json.loads(completed.stdout)


def linear_graphql(
    query: str, variables: dict[str, Any], timeout: float = 8.0
) -> dict[str, Any]:
    token = os.environ.get("LINEAR_API_KEY")
    if not token:
        raise RuntimeError("linear_unconfigured")
    request = urllib.request.Request(
        LINEAR_API,
        data=json.dumps({"query": query, "variables": variables}).encode("utf-8"),
        headers={
            "Authorization": token,
            "Content-Type": "application/json",
            "User-Agent": "gem-ops-hud/1",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read(1_000_000).decode("utf-8"))
    if payload.get("errors") or not isinstance(payload.get("data"), dict):
        raise RuntimeError("linear_invalid_response")
    return payload["data"]


def linear_error_kind(exc: Exception) -> str:
    if isinstance(exc, urllib.error.HTTPError) and exc.code in {401, 403}:
        return "unauthorized"
    if str(exc) == "linear_unconfigured":
        return "unconfigured"
    if isinstance(exc, (TimeoutError, urllib.error.URLError)):
        return "unavailable"
    return "error"


def fetch_linear_issues() -> dict[str, Any]:
    team_payload = linear_graphql(
        """
        query HudTeam($key: String!) {
          teams(first: 1, filter: {key: {eq: $key}}) { nodes { id } }
        }
        """,
        {"key": LINEAR_TEAM_KEY},
    )
    teams = team_payload.get("teams", {}).get("nodes", [])
    if len(teams) != 1 or not teams[0].get("id"):
        raise RuntimeError("linear_team_missing")

    state_types: list[str] = []
    cursor: str | None = None
    for _ in range(40):
        payload = linear_graphql(
            """
            query HudIssues($teamId: ID!, $after: String) {
              issues(
                first: 250
                after: $after
                filter: {
                  team: {id: {eq: $teamId}}
                  state: {type: {nin: ["completed", "canceled"]}}
                }
              ) {
                nodes { state { type } }
                pageInfo { hasNextPage endCursor }
              }
            }
            """,
            {"teamId": teams[0]["id"], "after": cursor},
        )
        issues = payload.get("issues", {})
        for issue in issues.get("nodes", []):
            state_type = issue.get("state", {}).get("type")
            if isinstance(state_type, str):
                state_types.append(state_type)
        page_info = issues.get("pageInfo", {})
        if not page_info.get("hasNextPage"):
            break
        cursor = page_info.get("endCursor")
        if not cursor:
            raise RuntimeError("linear_invalid_cursor")
    else:
        raise RuntimeError("linear_page_limit")

    return {
        "open": len(state_types),
        "backlog": sum(1 for state in state_types if state == "backlog"),
        "ready": sum(1 for state in state_types if state == "unstarted"),
    }


def fetch_github_issues() -> dict[str, Any]:
    if GITHUB_ISSUE_FALLBACK_RETIRED:
        raise RuntimeError("GitHub Issue fallback retired; Linear is canonical")
    pages = run_json(
        ["gh", "api", "--paginate", "--slurp", f"repos/{REPO}/issues?state=open&per_page=100"]
    )
    issues = [
        item for page in pages for item in page if not item.get("pull_request")
    ]
    ready = 0
    for issue in issues:
        labels = {
            label.get("name", "").lower()
            for label in issue.get("labels", [])
            if isinstance(label, dict)
        }
        if labels & GITHUB_READY_LABELS:
            ready += 1
    return {"open": len(issues), "backlog": len(issues), "ready": ready}


def fetch_issue_source() -> dict[str, Any]:
    try:
        counts = fetch_linear_issues()
        return {
            "updated": iso(),
            "error": None,
            "source": "linear",
            "degraded": False,
            **counts,
        }
    except Exception as exc:
        linear_error = linear_error_kind(exc)

    if GITHUB_ISSUE_FALLBACK_RETIRED:
        return {
            "updated": iso(),
            "error": f"linear_{linear_error}",
            "source": "linear",
            "degraded": True,
        }

    try:
        counts = fetch_github_issues()
        return {
            "updated": iso(),
            "error": None,
            "source": "github",
            "degraded": True,
            "linear_error": linear_error,
            **counts,
        }
    except Exception as exc:
        raise IssueSourceUnavailable(
            f"linear_{linear_error};github_{type(exc).__name__}"
        ) from None


def process_count(needle: str) -> int:
    count = 0
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            command = (entry / "cmdline").read_bytes().replace(b"\0", b" ").decode("utf-8", "ignore")
        except (OSError, UnicodeError):
            continue
        if needle in command and "gem-ops-hud" not in command:
            count += 1
    return count


def prepare_console() -> None:
    """Prevent a stale software-flow-control stop from freezing HUD refreshes."""
    if not sys.stdout.isatty():
        return
    try:
        attrs = termios.tcgetattr(sys.stdout.fileno())
        attrs[0] &= ~(termios.IXON | termios.IXOFF)
        termios.tcsetattr(sys.stdout.fileno(), termios.TCSANOW, attrs)
        termios.tcflow(sys.stdout.fileno(), termios.TCOON)
    except (OSError, termios.error):
        pass


def fetch_symphony() -> dict[str, Any]:
    jobs: list[dict[str, Any]] = []
    blockers: list[dict[str, Any]] = []
    runtime_errors: list[str] = []
    runtime_payload_seen = False
    counts = {"implementing": 0, "retrying": 0, "queued": 0, "blocked": 0}
    reasons = {
        "capacity": 0,
        "timeout": 0,
        "launcher_failure": 0,
        "ci_check_failure": 0,
        "merge_queue_wait": 0,
        "ownership_input": 0,
        "other": 0,
    }
    retry_deadlines: list[str] = []
    for label, port in (("JOV", 4041), ("LYB", 4042)):
        base = f"http://127.0.0.1:{port}"
        try:
            body = http_text(base + "/")
            runtime_payload_seen = True
            identifiers = sorted(set(re.findall(r'href="/api/v1/([A-Za-z0-9_-]+)"', body)))[:40]
            titles = {
                identifier: slug.replace("-", " ").strip().title()
                for identifier, slug in re.findall(
                    r"linear\.app/[^/]+/issue/([A-Za-z0-9_-]+)/([A-Za-z0-9_-]+)", body
                )
            }
            for identifier in identifiers:
                try:
                    item = http_json(f"{base}/api/v1/{identifier}")
                except Exception:
                    continue
                status = compact(item.get("status") or "unknown", 18)
                running = item.get("running") or {}
                retry = item.get("retry") or {}
                if status == "running":
                    counts["implementing"] += 1
                    jobs.append(
                        {
                            "id": compact(identifier, 18),
                            "title": compact(titles.get(identifier) or "title unavailable", 64),
                            "lane": label,
                            "status": status,
                            "activity": compact(running.get("last_activity") or "active", 50),
                            "started": running.get("started_at") or running.get("start_time") or running.get("claimed_at"),
                        }
                    )
                elif status in {"retrying", "blocked"}:
                    counts[status] += 1
                    due = retry.get("due_at") or (item.get("blocked") or {}).get("since")
                    reason = "ownership_input" if status == "blocked" else error_kind(item.get("last_error") or retry.get("error"))
                    reasons[reason] += 1
                    if status == "retrying" and parse_time(due):
                        retry_deadlines.append(str(due))
                    blockers.append(
                        {
                            "id": compact(identifier, 18),
                            "title": compact(titles.get(identifier) or "title unavailable", 56),
                            "owner": f"Symphony/{label}",
                            "reason": reason,
                            "next": "automatic retry" if status == "retrying" else "operator review",
                            "deadline": compact(due or "none", 25),
                            "attempt": int((item.get("attempts") or {}).get("current_retry_attempt") or 0),
                        }
                    )
                elif status in {"queued", "pending", "todo"}:
                    counts["queued"] += 1
        except Exception as exc:
            runtime_errors.append(f"{label}:{type(exc).__name__}")
    return {
        "updated": iso(),
        "error": ", ".join(runtime_errors) or None,
        "synthesized": bool(runtime_errors) and not runtime_payload_seen,
        "workers": {
            "runner_listeners": process_count("Runner.Listener"),
            "runner_jobs": process_count("Runner.Worker"),
            "symphony_jobs": len(jobs),
        },
        "counts": counts,
        "reason_buckets": reasons,
        "slots": {
            "total": configured_slots(),
            "available": (
                0
                if reasons["capacity"] > 0
                else max(0, (configured_slots() or counts["implementing"]) - counts["implementing"])
            ),
            "basis": "configured max plus live capacity signal",
        },
        "next_retry": min(retry_deadlines) if retry_deadlines else None,
        "jobs": jobs[:8],
        "blockers": sorted(
            blockers,
            key=lambda item: (-int(item.get("attempt") or 0), item.get("deadline") or ""),
        )[:8],
    }


GRAPHQL_QUERY = """
query {
  repository(owner: "JovieInc", name: "Jovie") {
    defaultBranchRef { target { ... on Commit { oid } } }
    merged: pullRequests(first: 50, states: MERGED, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes { number title mergedAt }
    }
  }
}
"""


def fetch_delivery() -> dict[str, Any]:
    graph = run_json(["gh", "api", "graphql", "-f", f"query={GRAPHQL_QUERY}"])
    repo = graph["data"]["repository"]
    merged = repo["merged"]["nodes"]
    pr_fleet = load_pr_fleet_closure_audit()
    pr_fleet_counts = pr_fleet.get("counts") or {}
    window_start = now() - dt.timedelta(hours=24)
    merged_recent = [pr for pr in merged if (parse_time(pr.get("mergedAt")) or dt.datetime.min.replace(tzinfo=dt.timezone.utc)) >= window_start]
    queue = pr_fleet.get("queue") or []
    runs_payload = run_json(["gh", "api", f"repos/{REPO}/actions/runs?per_page=40"])
    runs = []
    for item in runs_payload.get("workflow_runs", []):
        if item.get("name") not in WORKFLOWS:
            continue
        runs.append(
            {
                "id": item.get("id"),
                "name": compact(item.get("name"), 28),
                "status": compact(item.get("status"), 14),
                "conclusion": compact(item.get("conclusion") or "-", 12),
                "sha": compact(item.get("head_sha"), 8),
                "updated": item.get("updated_at"),
            }
        )
        if len(runs) >= 10:
            break
    production_payload = run_json(
        ["gh", "api", f"repos/{REPO}/actions/workflows/production-controller.yml/runs?per_page=30&status=success"]
    )
    production_successes = [
        run
        for run in production_payload.get("workflow_runs", [])
        if run.get("conclusion") == "success"
        and (parse_time(run.get("updated_at")) or dt.datetime.min.replace(tzinfo=dt.timezone.utc)) >= window_start
    ]
    production_completions: int | str = len(production_successes)
    if len(production_successes) == 30:
        production_completions = "30+"
    ci_payload = run_json(
        ["gh", "api", f"repos/{REPO}/actions/workflows/ci.yml/runs?per_page=30&status=success"]
    )
    ci_durations = []
    for run in ci_payload.get("workflow_runs", []):
        created = parse_time(run.get("created_at"))
        updated = parse_time(run.get("updated_at"))
        if created and updated and updated >= window_start and updated >= created:
            ci_durations.append((updated - created).total_seconds())
    build = http_json("https://jov.ie/api/health/build-info")
    deploy = http_json("https://jov.ie/api/health/deploy")
    main_sha = repo["defaultBranchRef"]["target"]["oid"]
    prod_sha = build.get("commitSha") or build.get("gitSha") or build.get("sha")
    summer_queue = load_summer_queue()
    return {
        "updated": iso(),
        "error": None,
        "main_sha": compact(main_sha, 40),
        "prod_sha": compact(prod_sha, 40),
        "deploy_status": compact(deploy.get("status") or "unknown", 20),
        "exact": bool(main_sha and prod_sha and main_sha == prod_sha),
        "pr_fleet": pr_fleet,
        "prs": {
            "total": pr_fleet.get("total"),
            "draft": pr_fleet_counts.get("draft"),
            "ready": pr_fleet_counts.get("ready"),
            "queued": pr_fleet_counts.get("queued"),
        },
        "queue": queue[:8],
        "summer_queue": summer_queue,
        "runs": runs,
        "success_window_hours": 24,
        "merged_recent": len(merged_recent),
        "production_completions": production_completions,
        "latency": {
            "pickup": None,
            "implementation": None,
            "ci": {
                "sample": len(ci_durations),
                "typical_seconds": percentile(ci_durations, 0.50),
                "slow_tail_seconds": percentile(ci_durations, 0.95),
                "window_hours": 24,
            },
            "merge": None,
        },
    }



def optional_float(name: str) -> float | None:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return None
    try:
        value = float(raw)
    except ValueError:
        return None
    if not math.isfinite(value) or value < 0:
        return None
    return value


def optional_int(name: str) -> int | None:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return None
    try:
        value = int(raw)
    except ValueError:
        return None
    if value < 0:
        return None
    return value


def optional_text(name: str) -> str | None:
    raw = os.environ.get(name)
    if raw is None:
        return None
    text = raw.strip()
    return text or None


def money_text(value: float | None) -> str:
    if value is None:
        return "UNKNOWN"
    sign = "-" if value < 0 else ""
    return f"{sign}${abs(value):,.0f}"


def pct_text(value: float | None) -> str:
    if value is None:
        return "UNKNOWN"
    return f"{value:.1f}%"


def _path_mtime_iso(path: Path) -> str | None:
    try:
        timestamp = path.stat().st_mtime
    except OSError:
        return None
    return iso(dt.datetime.fromtimestamp(timestamp, dt.timezone.utc))


def _overlay_observed_at(
    overlay: dict[str, Any], fallback: str | None
) -> str | None:
    for key in ("observedAt", "updated", "capturedAt"):
        value = overlay.get(key)
        if isinstance(value, str) and parse_time(value) is not None:
            return value
    return fallback


def load_measured_overlay() -> tuple[dict[str, Any], str | None, str | None, bool]:
    try:
        raw = MEASURED_METRICS_FILE.read_text(encoding="utf-8")
    except FileNotFoundError:
        return ({}, None, "measured-overlay-missing", False)
    except OSError as exc:
        return ({}, None, type(exc).__name__, False)
    source_mtime = _path_mtime_iso(MEASURED_METRICS_FILE)
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return ({}, source_mtime, "measured-overlay-malformed", True)
    if not isinstance(payload, dict):
        return ({}, source_mtime, "measured-overlay-malformed", True)
    return (payload, _overlay_observed_at(payload, source_mtime), None, True)


def first_measured(*values: Any) -> Any:
    for value in values:
        if value is not None:
            return value
    return None


def default_alive_verdict(
    cash: float | None,
    weekly_burn: float | None,
    weekly_revenue: float | None,
    weekly_revenue_prev: float | None,
) -> tuple[str, str, str]:
    """Return (verdict, status, detail). Never treat missing revenue as $0."""
    if weekly_revenue is None or weekly_burn is None:
        return (
            "UNKNOWN",
            "UNKNOWN",
            "need measured weekly revenue and weekly burn; unmeasured is not $0",
        )
    if weekly_revenue == 0 and weekly_burn > 0:
        return (
            "DEFAULT DEAD",
            "DEFAULT DEAD",
            "$0 measured revenue + any burn = default dead; no fake P&L",
        )
    if weekly_revenue >= weekly_burn:
        return (
            "DEFAULT ALIVE",
            "DEFAULT ALIVE",
            "measured weekly revenue covers weekly burn",
        )
    net_burn = weekly_burn - weekly_revenue
    detail = (
        f"revenue {money_text(weekly_revenue)}/wk is below burn "
        f"{money_text(weekly_burn)}/wk by {money_text(net_burn)}/wk; "
        "default alive requires revenue covering all-in burn"
    )
    if cash is not None:
        weeks_of_cash = cash / net_burn if net_burn else None
        if weeks_of_cash is not None:
            detail += f"; cash covers ~{weeks_of_cash:.1f} wk of deficit"
    if weekly_revenue_prev is not None:
        weekly_growth = weekly_revenue - weekly_revenue_prev
        if weekly_growth > 0:
            weeks_to_cover = net_burn / weekly_growth
            detail += (
                f"; trend projects burn coverage in ~{weeks_to_cover:.1f} wk "
                "but verdict stays dead until revenue covers burn"
            )
    return (
        "DEFAULT DEAD",
        "DEFAULT DEAD",
        detail,
    )


def wow_growth(
    weekly_revenue: float | None,
    weekly_revenue_prev: float | None,
    active_users: int | None,
    active_users_prev: int | None,
) -> dict[str, Any]:
    if weekly_revenue is not None and weekly_revenue_prev is not None:
        if weekly_revenue_prev == 0:
            return {
                "series": "revenue",
                "this": weekly_revenue,
                "last": weekly_revenue_prev,
                "pct": 0.0 if weekly_revenue == 0 else None,
                "detail": (
                    "revenue $0 this week and last; 0%"
                    if weekly_revenue == 0
                    else "revenue series measured; prior week $0 so percent is undefined"
                ),
            }
        pct = ((weekly_revenue - weekly_revenue_prev) / weekly_revenue_prev) * 100.0
        return {
            "series": "revenue",
            "this": weekly_revenue,
            "last": weekly_revenue_prev,
            "pct": pct,
            "detail": "revenue first; not signups/pageviews",
        }
    if active_users is not None and active_users_prev is not None:
        if active_users == 0 and active_users_prev == 0:
            return {
                "series": "active users",
                "this": 0,
                "last": 0,
                "pct": 0.0,
                "detail": "0 users is 0%, not a chart; YC bar 5-7%/wk",
            }
        if active_users_prev == 0:
            return {
                "series": "active users",
                "this": active_users,
                "last": active_users_prev,
                "pct": None,
                "detail": "prior week 0 users; percent undefined, not invented",
            }
        pct = ((active_users - active_users_prev) / active_users_prev) * 100.0
        return {
            "series": "active users",
            "this": active_users,
            "last": active_users_prev,
            "pct": pct,
            "detail": "no measured revenue WoW; active users only; never signups/pageviews",
        }
    if active_users == 0:
        return {
            "series": "active users",
            "this": 0,
            "last": active_users_prev,
            "pct": None,
            "detail": "0 users measured; prior week unmeasured so percent is undefined",
        }
    return {
        "series": "UNKNOWN",
        "this": None,
        "last": None,
        "pct": None,
        "detail": "no measured revenue WoW and no measured active-user WoW",
    }


def yc_bar_status(pct: float | None) -> tuple[str, str]:
    if pct is None:
        return ("UNKNOWN", "YC bar 5-7%/wk good, 10% exceptional, 1% not figured out")
    if pct >= 10:
        return ("EXCEPTIONAL", "YC: 10%+/wk exceptional")
    if pct >= 5:
        return ("YC BAR", "YC: 5-7%/wk good")
    if pct >= 1:
        return ("BELOW BAR", "YC: 1%/wk means not figured out")
    return ("BELOW BAR", "YC bar 5-7%/wk; this week is below")


def fetch_ops_metrics() -> dict[str, Any]:
    overlay, overlay_updated, overlay_error, overlay_present = load_measured_overlay()

    def overlay_num(key: str) -> float | None:
        value = overlay.get(key)
        if isinstance(value, bool) or value is None:
            return None
        if isinstance(value, (int, float)):
            numeric = float(value)
            if math.isfinite(numeric) and numeric >= 0:
                return numeric
        return None

    def overlay_int(key: str) -> int | None:
        value = overlay.get(key)
        if isinstance(value, bool) or value is None:
            return None
        if isinstance(value, int):
            return value if value >= 0 else None
        if isinstance(value, float) and value.is_integer():
            integer = int(value)
            return integer if integer >= 0 else None
        return None

    def overlay_text(key: str) -> str | None:
        value = overlay.get(key)
        if not isinstance(value, str):
            return None
        text = value.strip()
        return text or None

    env_values = {
        "cash": optional_float("HUD_CASH_USD"),
        "weekly_burn": optional_float("HUD_WEEKLY_BURN_USD"),
        "weekly_revenue": optional_float("HUD_WEEKLY_REVENUE_USD"),
        "weekly_revenue_prev": optional_float("HUD_WEEKLY_REVENUE_PREV_USD"),
        "active_users": optional_int("HUD_ACTIVE_USERS"),
        "active_users_prev": optional_int("HUD_ACTIVE_USERS_PREV"),
        "ships_this": optional_int("HUD_SHIPS_THIS_WEEK"),
        "ships_last": optional_int("HUD_SHIPS_LAST_WEEK"),
        "bottleneck": optional_text("HUD_BOTTLENECK"),
        "bottleneck_owner": optional_text("HUD_BOTTLENECK_OWNER"),
        "bottleneck_start": optional_text("HUD_BOTTLENECK_START"),
        "bottleneck_handle": optional_text("HUD_BOTTLENECK_HANDLE"),
    }
    overlay_values = {
        "cash": overlay_num("cash_usd"),
        "weekly_burn": overlay_num("weekly_burn_usd"),
        "weekly_revenue": overlay_num("weekly_revenue_usd"),
        "weekly_revenue_prev": overlay_num("weekly_revenue_prev_usd"),
        "active_users": overlay_int("active_users"),
        "active_users_prev": overlay_int("active_users_prev"),
        "ships_this": overlay_int("ships_this_week"),
        "ships_last": overlay_int("ships_last_week"),
        "bottleneck": overlay_text("bottleneck"),
        "bottleneck_owner": overlay_text("bottleneck_owner"),
        "bottleneck_start": overlay_text("bottleneck_start"),
        "bottleneck_handle": overlay_text("bottleneck_handle"),
    }
    env_present = any(value is not None for value in env_values.values())
    overlay_used = any(
        env_values[key] is None and overlay_values[key] is not None
        for key in overlay_values
    )

    cash = first_measured(env_values["cash"], overlay_values["cash"])
    weekly_burn = first_measured(env_values["weekly_burn"], overlay_values["weekly_burn"])
    weekly_revenue = first_measured(
        env_values["weekly_revenue"], overlay_values["weekly_revenue"]
    )
    weekly_revenue_prev = first_measured(
        env_values["weekly_revenue_prev"], overlay_values["weekly_revenue_prev"]
    )
    active_users = first_measured(env_values["active_users"], overlay_values["active_users"])
    active_users_prev = first_measured(
        env_values["active_users_prev"], overlay_values["active_users_prev"]
    )
    ships_this = first_measured(env_values["ships_this"], overlay_values["ships_this"])
    ships_last = first_measured(env_values["ships_last"], overlay_values["ships_last"])

    bottleneck = first_measured(env_values["bottleneck"], overlay_values["bottleneck"])
    bottleneck_owner = first_measured(
        env_values["bottleneck_owner"], overlay_values["bottleneck_owner"]
    )
    bottleneck_start = first_measured(
        env_values["bottleneck_start"], overlay_values["bottleneck_start"]
    )
    bottleneck_handle = first_measured(
        env_values["bottleneck_handle"], overlay_values["bottleneck_handle"]
    )

    verdict, verdict_status, verdict_detail = default_alive_verdict(
        cash, weekly_burn, weekly_revenue, weekly_revenue_prev
    )
    growth = wow_growth(weekly_revenue, weekly_revenue_prev, active_users, active_users_prev)
    yc_status, yc_detail = yc_bar_status(growth["pct"])
    if ships_this is None or ships_last is None:
        ship_detail = "dogfood-receipted ships only; merges without receipts do not count; ledger unmeasured"
    else:
        ship_detail = "dogfood-receipted ships (Linear->Symphony->MQ->prod SHA->receipt); merges do not count"

    if overlay_used:
        source_updated = overlay_updated
        source_error = overlay_error
    elif env_present:
        source_updated = iso()
        source_error = None
    else:
        source_updated = overlay_updated
        source_error = overlay_error

    overlay_source = str(overlay.get("source") or "measured-overlay")
    if overlay_used and env_present:
        source_name = f"{overlay_source}+env"
    elif overlay_used:
        source_name = overlay_source
    elif env_present:
        source_name = "env"
    else:
        source_name = str(overlay.get("source") or "measured-overlay-or-env")
    return {
        "updated": source_updated,
        "error": source_error,
        "source": source_name,
        "cash_usd": cash,
        "weekly_burn_usd": weekly_burn,
        "weekly_revenue_usd": weekly_revenue,
        "weekly_revenue_prev_usd": weekly_revenue_prev,
        "active_users": active_users,
        "active_users_prev": active_users_prev,
        "verdict": verdict,
        "verdict_status": verdict_status,
        "verdict_detail": verdict_detail,
        "growth": growth,
        "yc_status": yc_status,
        "yc_detail": yc_detail,
        "ships_this_week": ships_this,
        "ships_last_week": ships_last,
        "ship_detail": ship_detail,
        "bottleneck": bottleneck,
        "bottleneck_owner": bottleneck_owner,
        "bottleneck_start": bottleneck_start,
        "bottleneck_handle": bottleneck_handle,
        "overlay_present": overlay_present,
    }


def load_state() -> dict[str, Any]:
    try:
        state = json.loads(STATE_FILE.read_text())
        return state if isinstance(state, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def save_state(state: dict[str, Any]) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temporary = tempfile.mkstemp(prefix="state.", dir=STATE_DIR)
    try:
        with os.fdopen(fd, "w") as handle:
            json.dump(state, handle, separators=(",", ":"), sort_keys=True)
            handle.write("\n")
        os.chmod(temporary, 0o600)
        os.replace(temporary, STATE_FILE)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


SECTION_METADATA_KEYS = {
    "updated",
    "error",
    "source",
    "degraded",
    "linear_error",
    "overlay_present",
    "verdict",
    "verdict_status",
    "verdict_detail",
    "growth",
    "yc_status",
    "yc_detail",
    "ship_detail",
    "synthesized",
}


def _section_has_payload(section: dict[str, Any]) -> bool:
    return any(
        value is not None
        for key, value in section.items()
        if key not in SECTION_METADATA_KEYS
    )


def section_evidence(state: dict[str, Any], key: str) -> tuple[str, str]:
    """Return the evidence state and the operator-facing consequence.

    The renderer deliberately separates source availability, proof, freshness, and
    failure. Domain-specific missing receipts are classified by the panel that
    knows which receipt is required; this function classifies collector health.
    """
    section = state.get(key)
    if not isinstance(section, dict) or not section:
        return ("UNAVAILABLE", "source has no usable receipt; restore the source")
    stamp = parse_time(section.get("updated"))
    if stamp is None or stamp.tzinfo is None or stamp.utcoffset() is None:
        return ("UNAVAILABLE", "source timestamp is absent or invalid; restore the source")
    age_seconds = (now() - stamp).total_seconds()
    age = age_text(section.get("updated"))
    if age_seconds < -FLEET_RECEIPT_FUTURE_SKEW_SECONDS:
        return ("UNAVAILABLE", "source timestamp is in the future; verify host time")
    if age_seconds > STALE_AFTER[key]:
        return ("STALE", f"{age} old; refresh source, values are last-known")
    if section.get("error") or section.get("degraded"):
        error = compact(section.get("error") or "degraded source", 32)
        if section.get("synthesized"):
            return ("UNAVAILABLE", f"source cannot provide values ({error}); restore source")
        if _section_has_payload(section):
            return ("DEGRADED", f"refresh problem {error}; values are last-good")
        return ("UNAVAILABLE", f"source cannot provide values ({error}); restore source")
    if not _section_has_payload(section):
        return ("UNAVAILABLE", "source has no measured payload; restore the source")
    return ("HEALTHY", f"age {age}; no operator action")


def section_health(state: dict[str, Any], key: str) -> str:
    evidence, detail = section_evidence(state, key)
    return f"{evidence} {detail}"


def _box(title: str, body: list[str], width: int, height: int | None = None) -> list[str]:
    """Render one labelled panel without changing the meaning of its rows."""
    width = max(24, width)
    inner = width - 2
    title_text = f" {compact(title, max(1, inner - 3))} "
    top = "┌─" + title_text + ("─" * max(0, width - len(title_text) - 3)) + "┐"
    lines = [top[:width]]
    available = None if height is None else max(0, height - 2)
    selected = body if available is None else body[:available]
    for item in selected:
        value = clip_line(item, inner - 2)
        lines.append(f"│ {value:<{inner - 2}} │")
    if available is not None:
        while len(lines) < height - 1:
            lines.append(f"│ {'':<{inner - 2}} │")
    lines.append("└" + ("─" * inner) + "┘")
    return lines


def _join_panels(panels: list[list[str]], gap: int = 2) -> list[str]:
    target = max((len(panel) for panel in panels), default=0)
    padded: list[list[str]] = []
    for panel in panels:
        width = len(panel[0]) if panel else 0
        padded.append(panel + ([" " * width] * (target - len(panel))))
    return [(" " * gap).join(panel[row] for panel in padded) for row in range(target)]


def _metric(label: Any, value: Any, status: Any, detail: Any, width: int) -> str:
    if width >= 180:
        label_width = min(34, max(24, width // 7))
        value_width = min(20, max(12, width // 12))
        status_width = min(24, max(14, width // 10))
    elif width >= 120:
        label_width = min(26, max(18, width // 7))
        value_width = min(16, max(12, width // 12))
        status_width = min(20, max(12, width // 9))
    else:
        label_width = min(18, max(10, width // 7))
        value_width = min(12, max(7, width // 10))
        status_width = min(15, max(9, width // 9))
    detail_width = max(1, width - label_width - value_width - status_width - 6)
    return (
        f"{compact(label, label_width):<{label_width}}  "
        f"{compact(value, value_width):>{value_width}}  "
        f"{compact(status, status_width):<{status_width}}  "
        f"{compact(detail, detail_width):<{detail_width}}"
    )


def _section_is_current(state: dict[str, Any], key: str) -> bool:
    return section_evidence(state, key)[0] == "HEALTHY"


def _pr_fleet_receipt(delivery: dict[str, Any]) -> dict[str, Any]:
    receipt = delivery.get("pr_fleet")
    if isinstance(receipt, dict):
        return receipt
    return _unknown_pr_fleet_receipt("pr-fleet-closure-audit-missing")


def pr_fleet_evidence(receipt: dict[str, Any]) -> tuple[str, str]:
    error = receipt.get("error")
    if error:
        return (
            "UNKNOWN",
            f"{error}; refresh typed {PR_FLEET_CLOSURE_AUDIT_SCHEMA}; counts unknown",
        )
    stamp = parse_time(receipt.get("updated"))
    if stamp is None or stamp.tzinfo is None or stamp.utcoffset() is None:
        return (
            "UNKNOWN",
            f"missing freshness; refresh typed {PR_FLEET_CLOSURE_AUDIT_SCHEMA}; counts unknown",
        )
    age_seconds = (now() - stamp).total_seconds()
    if age_seconds < -FLEET_RECEIPT_FUTURE_SKEW_SECONDS:
        return (
            "UNKNOWN",
            f"future freshness; refresh typed {PR_FLEET_CLOSURE_AUDIT_SCHEMA}; counts unknown",
        )
    if age_seconds > FLEET_RECEIPT_STALE_SECONDS:
        return (
            "UNKNOWN",
            f"{age_text(receipt.get('updated'))} old; refresh typed {PR_FLEET_CLOSURE_AUDIT_SCHEMA}; counts unknown",
        )
    counts = receipt.get("counts")
    if (
        not isinstance(counts, dict)
        or any(counts.get(key) is None for key, _label, _aliases in PR_FLEET_CATEGORIES)
        or receipt.get("total") is None
    ):
        return (
            "UNKNOWN",
            f"incomplete counts; refresh typed {PR_FLEET_CLOSURE_AUDIT_SCHEMA}; counts unknown",
        )
    return (
        "HEALTHY",
        f"{receipt.get('source') or 'typed PR fleet closure audit'} · age {age_text(receipt.get('updated'))}",
    )


def _attention_rows(state: dict[str, Any], width: int) -> list[str]:
    local = state.get("symphony") or {}
    fleet = state.get("fleet") or {}
    delivery = state.get("delivery") or {}
    ops = state.get("ops") or {}
    counts = local.get("counts") or {}
    summer_queue = delivery.get("summer_queue") or {}
    summer_items = (
        summer_queue.get("items") if isinstance(summer_queue.get("items"), list) else []
    )
    items: list[tuple[str, str, str]] = []

    ops_evidence, ops_evidence_detail = section_evidence(state, "ops")
    delivery_evidence, delivery_evidence_detail = section_evidence(state, "delivery")

    def append_summer_queue_items() -> None:
        if not isinstance(summer_queue, dict) or not (
            summer_queue.get("error") or summer_items
        ):
            return

        def status_with_delivery_evidence(status: str) -> str:
            return status if delivery_evidence == "HEALTHY" else delivery_evidence

        def detail_with_delivery_evidence(detail: str) -> str:
            suffix = "canonical persisted stall state; HUD display-only"
            if delivery_evidence == "HEALTHY":
                return f"{detail} · {suffix}"
            return f"{delivery_evidence_detail} · last-known {detail} · {suffix}"

        if summer_queue.get("error"):
            items.append(
                (
                    status_with_delivery_evidence("DEGRADED"),
                    "Summer red queue",
                    detail_with_delivery_evidence(str(summer_queue.get("error"))),
                )
            )
        for item in summer_items[:3]:
            identity = item.get("issue") or f"PR #{item.get('pr', '?')}"
            outcome = str(item.get("outcome") or "open").upper()
            status = "OWNER INPUT" if outcome == "ESCALATED" else "PENDING"
            detail = item.get("reason") or item.get("action") or item.get("stallClass")
            items.append(
                (
                    status_with_delivery_evidence(status),
                    str(identity),
                    detail_with_delivery_evidence(
                        str(detail or "inspect persisted queue item")
                    ),
                )
            )

    if ops.get("bottleneck") and ops_evidence != "UNAVAILABLE":
        handle = ops.get("bottleneck_handle") or "measured handle unavailable"
        bottleneck_status = (
            "BOTTLENECK" if ops_evidence == "HEALTHY" else ops_evidence
        )
        action = (
            f"{handle} · measured overlay"
            if ops_evidence == "HEALTHY"
            else f"{ops_evidence_detail} · {handle}"
        )
        items.append(
            (
                bottleneck_status,
                str(ops.get("bottleneck")),
                action,
            )
        )

    append_summer_queue_items()

    for key, source in (
        ("symphony", "local Symphony 4041/4042"),
        ("fleet", "typed fleet receipt"),
        ("delivery", "GitHub + public production"),
        ("issues", "Linear issue source"),
        ("ops", "measured ops overlay"),
    ):
        evidence, evidence_detail = section_evidence(state, key)
        if evidence != "HEALTHY":
            section = state.get(key) or {}
            if key == "issues" and section.get("error") == "linear_unconfigured":
                recovery = "restore configured Linear env; counts unavailable"
            elif key == "issues" and not any(
                isinstance(section.get(field), int)
                for field in ("open", "backlog", "ready")
            ):
                recovery = "restore Linear source; counts unavailable"
            else:
                recovery = evidence_detail
            items.append((evidence, source, recovery))

    if _section_is_current(state, "symphony"):
        if int(counts.get("blocked") or 0) > 0:
            items.append(("OWNER INPUT", f"{counts.get('blocked')} blocked", "named operator decision/action required · Symphony"))
        if int(counts.get("retrying") or 0) > 0:
            items.append(("PENDING", f"{counts.get('retrying')} automatic retries", f"next {until_text(local.get('next_retry'))} · Symphony"))
    if _section_is_current(state, "fleet") and fleet.get("state") != "GREEN":
        reason_codes = [
            str(reason.get("code"))
            for reason in fleet.get("reasons", [])
            if isinstance(reason, dict) and reason.get("code")
        ]
        reason_text = ", ".join(reason_codes[:3]) or "no reason code supplied"
        fleet_state = fleet.get("state")
        evidence = "FAILING" if fleet_state == "RED" else "DEGRADED"
        items.append(
            (
                evidence,
                f"Fleet {fleet.get('promotionMode', 'mode unavailable')}",
                f"{reason_text} · typed {fleet_state} fleet receipt",
            )
        )
    if _section_is_current(state, "delivery") and delivery.get("exact") is False:
        items.append(("NOT PROVEN", "current main at production", "await or inspect release-controller receipt · GitHub/public health"))
    if not items:
        items.append(("CLEAR", "no source-backed action", "all configured sources current; no blocked/retry signal"))
    status_width = min(14, max(9, width // 12))
    available = max(2, width - status_width - 4)
    longest_subject = max(len(subject) for _status, subject, _action in items)
    longest_action = max(len(action) for _status, _subject, action in items)
    subject_width = min(
        max(24, longest_subject),
        max(24, available - min(max(24, longest_action), available // 2)),
    )
    action_width = max(1, width - status_width - subject_width - 4)
    return [
        f"{compact(status, status_width):<{status_width}}  "
        f"{compact(subject, subject_width):<{subject_width}}  "
        f"{compact(action, action_width):<{action_width}}"
        for status, subject, action in items[:8]
    ]


def _work_rows(state: dict[str, Any], width: int) -> list[str]:
    local = state.get("symphony") or {}
    delivery = state.get("delivery") or {}
    counts = local.get("counts") or {}
    pr_fleet = _pr_fleet_receipt(delivery)
    pr_fleet_counts = pr_fleet.get("counts") or {}
    local_evidence, local_detail = section_evidence(state, "symphony")
    delivery_evidence, delivery_detail = section_evidence(state, "delivery")
    pr_fleet_status, pr_fleet_detail = pr_fleet_evidence(pr_fleet)

    def work_row(
        label: str,
        raw_value: Any,
        active_status: str,
        empty_status: str,
        detail: str,
    ) -> str:
        if local_evidence == "UNAVAILABLE":
            return _metric(label, "UNAVAILABLE", local_evidence, local_detail, width)
        status = (
            active_status if raw_value not in (0, "0", None) else empty_status
        )
        if local_evidence != "HEALTHY":
            status = local_evidence
            detail = f"{local_detail} · last-known {raw_value}"
        return _metric(label, raw_value if raw_value is not None else "UNAVAILABLE", status, detail, width)

    rows = [
        work_row("Implementing", counts.get("implementing"), "RUNNING", "IDLE", "Symphony live runtime"),
        work_row("First-run queue", counts.get("queued"), "PENDING", "CLEAR", "retries excluded · Symphony"),
        work_row("Retry wait", counts.get("retrying"), "PENDING", "CLEAR", f"automatic · next {until_text(local.get('next_retry'))}"),
    ]
    native_queue = pr_fleet_counts.get("queued")
    if pr_fleet_status != "HEALTHY":
        rows.append(_metric("Native queue", "UNKNOWN", pr_fleet_status, pr_fleet_detail, width))
    elif delivery_evidence == "UNAVAILABLE":
        rows.append(_metric("Native queue", "UNKNOWN", delivery_evidence, delivery_detail, width))
    else:
        native_status = "PENDING" if native_queue not in (0, "0", None) else "CLEAR"
        if delivery_evidence != "HEALTHY":
            native_status = delivery_evidence
        native_detail = (
            "mergeQueueEntry · GitHub"
            if delivery_evidence == "HEALTHY"
            else f"{delivery_detail}; mergeQueueEntry · GitHub"
        )
        rows.append(_metric("Native queue", native_queue, native_status, native_detail, width))
    for job in (local.get("jobs") or [])[:7]:
        if local_evidence == "HEALTHY":
            rows.append(_metric(job.get("id", "job"), elapsed_text(job.get("started")), "RUNNING", job.get("title", "title unavailable"), width))
        else:
            value = "UNAVAILABLE" if local_evidence == "UNAVAILABLE" else elapsed_text(job.get("started"))
            rows.append(_metric(job.get("id", "job"), value, local_evidence, f"{local_detail} · last-known {job.get('title', 'title unavailable')}", width))
    if not local.get("jobs"):
        active_value = "UNAVAILABLE" if local_evidence == "UNAVAILABLE" else "none"
        active_status = "IDLE" if local_evidence == "HEALTHY" else local_evidence
        active_detail = (
            "no code work reported; retry/queue remain separate"
            if local_evidence == "HEALTHY"
            else local_detail
        )
        rows.append(
            _metric("Active work", active_value, active_status, active_detail, width)
        )
    return rows


def _health_rows(state: dict[str, Any], width: int) -> list[str]:
    rows = []
    for key, label, source in (
        ("symphony", "Symphony", "localhost 4041/4042 · 15s"),
        ("fleet", "Fleet gate", "typed local receipt · ≤10m"),
        ("delivery", "Delivery", "GitHub/public health · 120s"),
        ("issues", "Issue source", "Linear · 120s"),
        ("ops", "Business pulse", "measured overlay · 15s"),
    ):
        section = state.get(key) or {}
        evidence, evidence_detail = section_evidence(state, key)
        rows.append(_metric(label, age_text(section.get("updated")), evidence, f"{evidence_detail} · {source}", width))

    fleet = state.get("fleet") or {}
    for lane, (status, detail) in fleet_lane_statuses(fleet).items():
        rows.append(_metric(lane.title(), status, "ADMISSION", detail, width))
    return rows


def _throughput_rows(state: dict[str, Any], width: int) -> list[str]:
    delivery = state.get("delivery") or {}
    pr_fleet = _pr_fleet_receipt(delivery)
    pr_fleet_counts = pr_fleet.get("counts") or {}
    ci = (delivery.get("latency") or {}).get("ci") or {}
    main = str(delivery.get("main_sha") or "????????")[:8]
    prod = str(delivery.get("prod_sha") or "????????")[:8]
    delivery_evidence, delivery_detail = section_evidence(state, "delivery")
    pr_fleet_status, pr_fleet_detail = pr_fleet_evidence(pr_fleet)

    def delivery_value_or_unavailable(value: Any) -> Any:
        return "UNAVAILABLE" if delivery_evidence == "UNAVAILABLE" else value

    def delivery_status(status: str) -> str:
        return status if delivery_evidence == "HEALTHY" else delivery_evidence

    def delivery_row_detail(detail: str) -> str:
        if delivery_evidence == "HEALTHY":
            return detail
        return f"{delivery_detail}; {detail}"

    def pr_fleet_value(value: Any) -> Any:
        if pr_fleet_status != "HEALTHY":
            return "UNKNOWN"
        if delivery_evidence == "UNAVAILABLE":
            return "UNKNOWN"
        return value

    def pr_fleet_row_status(value: Any, active_status: str) -> str:
        if pr_fleet_status != "HEALTHY":
            return pr_fleet_status
        if delivery_evidence != "HEALTHY":
            return delivery_evidence
        return active_status if value not in (0, "0", None) else "CLEAR"

    def pr_fleet_row_detail(detail: str) -> str:
        if pr_fleet_status != "HEALTHY":
            return pr_fleet_detail
        if delivery_evidence != "HEALTHY":
            return f"{delivery_detail}; {detail} · {pr_fleet_detail}"
        return f"{detail} · {pr_fleet_detail}"

    rows = [
        _metric(
            "Open PRs",
            pr_fleet_value(pr_fleet.get("total")),
            pr_fleet_row_status(pr_fleet.get("total"), "EXACT"),
            pr_fleet_row_detail(
                f"sum of {len(PR_FLEET_CATEGORIES)} mutually exclusive categories"
            ),
            width,
        )
    ]
    category_statuses = {
        "draft": "DRAFT",
        "ready": "READY",
        "queued": "NATIVE",
        "remediating": "ACTIVE",
        "blocked": "OWNER INPUT",
        "conflict": "ATTENTION",
        "ownerless": "ATTENTION",
        "superseded": "ACCOUNTED",
    }
    for key, label, _aliases in PR_FLEET_CATEGORIES:
        rows.append(
            _metric(
                label,
                pr_fleet_value(pr_fleet_counts.get(key)),
                pr_fleet_row_status(pr_fleet_counts.get(key), category_statuses[key]),
                pr_fleet_row_detail(f"{key} · typed closure audit"),
                width,
            )
        )
    rows.extend(
        [
            _metric("Merged", delivery_value_or_unavailable(delivery.get("merged_recent", "?")), delivery_status("ROLLING 24H"), delivery_row_detail("merged pull requests · GitHub"), width),
            _metric("Prod controllers", delivery_value_or_unavailable(delivery.get("production_completions", "?")), delivery_status("ROLLING 24H"), delivery_row_detail("successful Production Controller runs"), width),
            _metric("CI p50", delivery_value_or_unavailable(duration_text(ci.get("typical_seconds"))), delivery_status(f"n={ci.get('sample',0)}"), delivery_row_detail("successful CI runs · rolling 24h"), width),
            _metric("CI p95", delivery_value_or_unavailable(duration_text(ci.get("slow_tail_seconds"))), delivery_status(f"n={ci.get('sample',0)}"), delivery_row_detail("successful CI runs · rolling 24h"), width),
            _metric("Runtime lineage", delivery_value_or_unavailable("MATCH" if delivery.get("exact") else "MISMATCH"), delivery_status("EXACT" if delivery.get("exact") else "NOT PROVEN"), delivery_row_detail(f"main {main} · prod {prod} · await/inspect release receipt"), width),
            _metric("Pickup", delivery_value_or_unavailable("unmeasured"), delivery_status("NOT PROVEN"), delivery_row_detail("capture pickup receipt; missing receipt timestamps; not inferred"), width),
            _metric("Implementation", delivery_value_or_unavailable("unmeasured"), delivery_status("NOT PROVEN"), delivery_row_detail("capture start/end receipt; missing receipt timestamps; not inferred"), width),
            _metric("Queue entry", delivery_value_or_unavailable("unmeasured"), delivery_status("NOT PROVEN"), delivery_row_detail("capture native queue receipt; missing receipt timestamps; not inferred"), width),
        ]
    )
    return rows


def _secondary_rows(
    state: dict[str, Any], width: int, expanded: bool = False
) -> list[str]:
    local = state.get("symphony") or {}
    counts = local.get("counts") or {}
    slots = local.get("slots") or {}
    workers = local.get("workers") or {}
    issues = state.get("issues") or {}
    throughput_rows = _throughput_rows(state, width)
    local_evidence, local_detail = section_evidence(state, "symphony")
    issue_evidence, issue_detail = section_evidence(state, "issues")
    owner_count = counts.get("blocked")
    owner_status = (
        "OWNER INPUT" if owner_count not in (0, "0", None) else "CLEAR"
    )
    if local_evidence != "HEALTHY":
        owner_status = local_evidence
    slot_value = (
        f"{slots.get('available')}/{slots.get('total')}"
        if isinstance(slots.get("available"), int)
        and isinstance(slots.get("total"), int)
        else "UNAVAILABLE"
    )
    slot_status = (
        "AVAILABLE"
        if isinstance(slots.get("available"), int) and slots.get("available") > 0
        else "FULL"
        if isinstance(slots.get("available"), int)
        else "NOT PROVEN"
    )
    if local_evidence != "HEALTHY":
        slot_status = local_evidence
    runner_value = (
        "UNAVAILABLE"
        if local_evidence == "UNAVAILABLE"
        else f"{workers.get('runner_jobs','?')}/{workers.get('runner_listeners','?')}"
    )
    runner_status = (
        "JOBS/LISTENERS" if local_evidence == "HEALTHY" else local_evidence
    )
    issue_value = issues.get("open") if issue_evidence != "UNAVAILABLE" else "UNAVAILABLE"
    rows = [
        "CAPACITY / OWNERS · SECONDARY",
        _metric("Owner input", owner_count if owner_count is not None else "UNAVAILABLE", owner_status, local_detail if local_evidence != "HEALTHY" else "Symphony blocked state", width),
        _metric("Execution slots", slot_value, slot_status, "configured JOV capacity", width),
        _metric("Runner jobs", runner_value, runner_status, "GitHub runners, not agent slots", width),
        _metric("Linear open", issue_value if issue_value is not None else "UNAVAILABLE", issue_evidence, issue_detail if issue_evidence != "HEALTHY" else f"backlog {issues.get('backlog','?')} · ready {issues.get('ready','?')}", width),
        "THROUGHPUT / DELIVERY · SECONDARY",
        *throughput_rows,
        "DEEP DETAIL",
        *_detail_rows(state, width, expanded=expanded),
    ]
    return rows


def _detail_rows(state: dict[str, Any], width: int, expanded: bool = False) -> list[str]:
    local = state.get("symphony") or {}
    reasons = local.get("reason_buckets") or {}
    ops = state.get("ops") or {}
    local_evidence, local_detail = section_evidence(state, "symphony")
    ops_evidence, ops_detail = section_evidence(state, "ops")

    def ops_secondary_row(
        label: str,
        value: str | None,
        healthy_value: str,
        healthy_status: str,
        missing_status: str,
        missing_detail: str,
    ) -> str:
        if ops_evidence == "UNAVAILABLE":
            return _metric(label, "UNAVAILABLE", ops_evidence, ops_detail, width)
        if ops_evidence != "HEALTHY":
            displayed = healthy_value if value else "UNAVAILABLE"
            detail = value or missing_detail
            return _metric(label, displayed, ops_evidence, f"{ops_detail} · last-known {detail}", width)
        return _metric(
            label,
            healthy_value if value else "UNAVAILABLE",
            healthy_status if value else missing_status,
            value or missing_detail,
            width,
        )

    bottleneck = ops.get("bottleneck")
    bottleneck_owner = ops.get("bottleneck_owner")
    bottleneck_handle = ops.get("bottleneck_handle")
    rows = [
        ops_secondary_row("#1 bottleneck", bottleneck, "NAMED", "ATTENTION", "UNAVAILABLE", "publish measured bottleneck into overlay"),
        ops_secondary_row("Owner", bottleneck_owner, "NAMED", "OWNER INPUT", "UNAVAILABLE", "publish accountable owner if operator action is required"),
        ops_secondary_row("Handle", bottleneck_handle, "NAMED", "SOURCE", "NOT PROVEN", "publish PR/Linear/runtime receipt handle"),
    ]
    reason_rows = (
        ("capacity", "Capacity", "slots busy/cooling; not a code/CI failure"),
        ("timeout", "Timeout", "automatic retry; inspect only if persistent"),
        ("launcher_failure", "Launcher", "inspect routing/launcher evidence"),
        ("ci_check_failure", "CI / check", "PR owner fixes required check"),
        ("merge_queue_wait", "Merge queue", "native automatic progression"),
        ("ownership_input", "Ownership", "named human action required"),
        ("other", "Other", "inspect sanitized evidence"),
    )
    if not expanded:
        reason_rows = tuple(
            item for item in reason_rows if reasons.get(item[0], 0) not in (0, "0", None)
        )
    for reason, label, action in reason_rows:
        count = reasons.get(reason)
        if count is None:
            status = local_evidence if local_evidence != "HEALTHY" else "UNAVAILABLE"
            detail = local_detail if local_evidence != "HEALTHY" else "reason bucket count unavailable"
            rows.append(_metric(label, "UNAVAILABLE", status, detail, width))
            continue
        status = "ATTENTION" if count not in (0, "0") else "CLEAR"
        detail = action
        if local_evidence != "HEALTHY":
            status = local_evidence
            detail = f"{local_detail} · last-known {count}"
        rows.append(_metric(label, count, status, detail, width))
    for blocker in (local.get("blockers") or [])[:6]:
        rows.append(_metric(blocker.get("id", "blocker"), f"try {blocker.get('attempt',0)}", blocker.get("reason", "UNAVAILABLE"), f"{blocker.get('next','?')} · {blocker.get('owner','?')}", width))
    return rows


def _log_rows(state: dict[str, Any], width: int) -> list[str]:
    delivery = state.get("delivery") or {}
    delivery_evidence, delivery_detail = section_evidence(state, "delivery")
    rows: list[str] = []

    def log_value(value: Any) -> Any:
        return "UNAVAILABLE" if delivery_evidence == "UNAVAILABLE" else value

    def log_status(status: str) -> str:
        return status if delivery_evidence == "HEALTHY" else delivery_evidence

    def log_detail(detail: str) -> str:
        if delivery_evidence == "HEALTHY":
            return detail
        return f"{delivery_detail} · last-known {detail}"

    for item in (delivery.get("queue") or [])[:8]:
        rows.append(_metric(f"MQ #{item.get('number','?')}", log_value(f"pos {item.get('position','?')}"), log_status("PENDING"), log_detail(item.get("title", "")), width))
    for run in (delivery.get("runs") or [])[:10]:
        run_state = run.get("status", "")
        if run_state == "completed":
            conclusion = str(run.get("conclusion") or "").lower()
            if conclusion == "success":
                run_state = "HEALTHY"
            elif conclusion in {"failure", "timed_out", "startup_failure"}:
                run_state = "FAILED"
            else:
                run_state = conclusion or "NOT PROVEN"
        elif run_state in {"queued", "pending", "requested", "waiting"}:
            run_state = "PENDING"
        elif run_state == "in_progress":
            run_state = "RUNNING"
        rows.append(_metric(run.get("name", "workflow"), log_value(run.get("sha", "")), log_status(str(run_state).upper()), log_detail(f"age {age_text(run.get('updated'))} · GitHub"), width))
    if not rows:
        evidence, detail = delivery_evidence, delivery_detail
        if evidence == "HEALTHY":
            evidence, detail = "NOT PROVEN", "no current queue/workflow receipt rows"
        rows.append(_metric("Delivery log", "none", evidence, detail, width))
    return rows


def _primary_region_row(label: str, value: str, width: int) -> str:
    label_width = min(24, max(14, width // 5))
    value_width = max(1, width - label_width - 2)
    return (
        f"{compact(label, label_width):<{label_width}}  "
        f"{compact(value, value_width):<{value_width}}"
    )


def _business_pulse_rows(state: dict[str, Any], width: int) -> list[str]:
    ops = state.get("ops") or {}
    source_evidence, source_detail = section_evidence(state, "ops")
    usable = source_evidence != "UNAVAILABLE"
    growth = ops.get("growth") or {}
    growth_pct = growth.get("pct") if usable else None
    active_users = ops.get("active_users") if usable else None
    weekly_revenue = ops.get("weekly_revenue_usd") if usable else None
    weekly_burn = ops.get("weekly_burn_usd") if usable else None

    growth_text = pct_text(growth_pct) if isinstance(growth_pct, (int, float)) else "UNAVAILABLE"
    active_text = f"{active_users:,}" if isinstance(active_users, int) and not isinstance(active_users, bool) else "UNAVAILABLE"
    revenue_text = money_text(weekly_revenue) if isinstance(weekly_revenue, (int, float)) and not isinstance(weekly_revenue, bool) else "UNAVAILABLE"
    burn_measured = isinstance(weekly_burn, (int, float)) and not isinstance(weekly_burn, bool)
    source = str(ops.get("source") or "measured overlay/env")
    verdict = str(ops.get("verdict") or "UNAVAILABLE")
    verdict_detail = str(
        ops.get("verdict_detail") or "cash/burn/revenue unmeasured"
    )
    survival_measured = (
        source_evidence != "UNAVAILABLE"
        and verdict in {"DEFAULT ALIVE", "DEFAULT DEAD"}
        and revenue_text != "UNAVAILABLE"
    )
    any_metrics = any(
        value != "UNAVAILABLE" for value in (growth_text, active_text, revenue_text)
    )
    evidence = source_evidence if any_metrics or survival_measured else "UNAVAILABLE"
    if evidence == "HEALTHY":
        if verdict == "UNKNOWN":
            missing = []
            if revenue_text == "UNAVAILABLE":
                missing.append("weekly revenue")
            if not burn_measured:
                missing.append("weekly burn")
            missing_text = " and ".join(missing) if missing else "survival inputs"
            action = f"publish measured {missing_text}; survival verdict unavailable"
        elif growth_text == "UNAVAILABLE" and (active_text != "UNAVAILABLE" or revenue_text != "UNAVAILABLE"):
            action = "publish prior-week denominator for WoW; survival verdict remains measured"
        else:
            action = "no action · measured source within freshness contract"
    elif evidence == "UNAVAILABLE":
        action = "connect measured business source; do not infer $0"
    else:
        action = source_detail
    if verdict == "UNKNOWN" or (evidence == "UNAVAILABLE" and not survival_measured):
        reported_unknown = verdict == "UNKNOWN"
        verdict = "UNAVAILABLE"
        if not reported_unknown:
            verdict_detail = "not proven without measured weekly revenue and burn"
    growth_label = (
        "ACTIVE USER WOW"
        if str(growth.get("series") or "").strip().lower() == "active users"
        else "WOW GROWTH"
    )
    return [
        _primary_region_row("EVIDENCE", evidence, width),
        _primary_region_row(growth_label, growth_text, width),
        _primary_region_row("ACTIVE USERS", active_text, width),
        _primary_region_row("WEEKLY REVENUE", revenue_text, width),
        clip_line(f"ACTION · {action} · {source}", width),
        _primary_region_row(
            "DEFAULT ALIVE",
            verdict,
            width,
        ),
        clip_line(
            verdict_detail,
            width,
        ),
    ]


def _delivery_speed_rows(state: dict[str, Any], width: int) -> list[str]:
    delivery = state.get("delivery") or {}
    merge = (delivery.get("latency") or {}).get("merge")
    source_evidence, source_detail = section_evidence(state, "delivery")
    usable = source_evidence != "UNAVAILABLE" and isinstance(merge, dict)
    p50 = merge.get("typical_seconds") if usable else None
    p95 = merge.get("slow_tail_seconds") if usable else None
    p50_text = duration_text(p50) if isinstance(p50, (int, float)) else "UNAVAILABLE"
    p95_text = duration_text(p95) if isinstance(p95, (int, float)) else "UNAVAILABLE"
    sample = merge.get("sample") if usable else None
    window = merge.get("window_days") if usable else None
    if isinstance(sample, int) and sample > 0:
        evidence = source_evidence
        receipt_detail = f"n={sample}"
        if isinstance(window, int) and window > 0:
            receipt_detail += f" · rolling {window}d"
        receipt_detail += " · authoritative issue-open → landed receipts"
        action = (
            "no action · measured receipts current"
            if evidence == "HEALTHY"
            else source_detail
        )
    elif source_evidence in {"UNAVAILABLE", "STALE", "DEGRADED"}:
        evidence = source_evidence
        receipt_detail = source_detail
        action = (
            "restore GitHub/public delivery source"
            if evidence == "UNAVAILABLE"
            else source_detail
        )
    else:
        evidence = "NOT PROVEN"
        receipt_detail = "receipt timestamps absent · no CI-duration proxy"
        action = "capture issue-open + landed receipt timestamps"
    return [
        _primary_region_row("EVIDENCE", evidence, width),
        _primary_region_row("P50", p50_text, width),
        _primary_region_row("P95", p95_text, width),
        clip_line(f"ACTION · {action}", width),
        clip_line(f"SOURCE · {receipt_detail}", width),
    ]


def _bottleneck_region_rows(state: dict[str, Any], width: int) -> list[str]:
    ops = state.get("ops") or {}
    source_evidence, source_detail = section_evidence(state, "ops")
    usable = source_evidence != "UNAVAILABLE"
    bottleneck = str(ops.get("bottleneck") or "").strip() if usable else ""
    if not bottleneck:
        return [
            _primary_region_row("EVIDENCE", "UNAVAILABLE", width),
            "measured bottleneck unavailable",
            clip_line("ACTION · publish current bottleneck + receipt handle", width),
            clip_line(f"SOURCE · {source_detail}", width),
        ]

    body = textwrap.wrap(
        bottleneck,
        width=max(20, width),
        break_long_words=False,
        break_on_hyphens=False,
    )[:3]
    has_handle = bool(str(ops.get("bottleneck_handle") or "").strip())
    handle = str(ops.get("bottleneck_handle") or "measured handle unavailable")
    start = elapsed_text(ops.get("bottleneck_start"))
    source = str(ops.get("source") or "measured overlay/env")
    action = (
        "follow named handle above"
        if source_evidence == "HEALTHY" and has_handle
        else "publish bottleneck handle; operator action needs source receipt"
        if source_evidence == "HEALTHY"
        else source_detail
    )
    return [
        _primary_region_row("EVIDENCE", source_evidence, width),
        *body,
        clip_line(f"ACTION · {action}", width),
        clip_line(f"HANDLE · {handle}", width),
        clip_line(f"OPEN {start} · {source}", width),
    ]


def _metrics_strip(state: dict[str, Any], width: int, height: int) -> list[str]:
    gap = 2
    panel_width = (width - (gap * 2)) // 3
    widths = [panel_width, panel_width, width - (gap * 2) - (panel_width * 2)]
    specs = (
        ("BUSINESS PULSE", _business_pulse_rows),
        ("DELIVERY SPEED · ISSUE OPEN → LANDED", _delivery_speed_rows),
        ("CURRENT LARGEST BOTTLENECK", _bottleneck_region_rows),
    )
    panels = [
        _box(title, rows(state, panel_width - 4), panel_width, height)
        for (title, rows), panel_width in zip(specs, widths)
    ]
    return _join_panels(panels, gap)


def _screen(lines: list[str], width: int, height: int) -> str:
    target = max(20, height - 1)
    plain = [clip_line(line, width).ljust(width) for line in lines[:target]]
    while len(plain) < target:
        plain.append(" " * width)
    return "\n".join(colorize_line(line) for line in plain) + "\n"


ANSI_ESCAPE = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")


def _frame_geometry(output: str) -> tuple[int, int]:
    lines = ANSI_ESCAPE.sub("", output).splitlines()
    return (max((len(line) for line in lines), default=0), len(lines))


def _terminal_frame_payload(output: str, clear: bool) -> bytes:
    prefix = "\x1b[?25l"
    if clear:
        prefix += "\x1b[2J"
    return (prefix + "\x1b[H" + output.rstrip("\n") + "\x1b[0m\x1b[?25h").encode(
        "utf-8"
    )


def _write_terminal_frame(output: str, clear: bool) -> None:
    payload = memoryview(_terminal_frame_payload(output, clear))
    descriptor = sys.stdout.fileno()
    while payload:
        written = os.write(descriptor, payload)
        if written <= 0:
            raise OSError("terminal frame write made no progress")
        payload = payload[written:]


class TerminalFrameWriter:
    """Build each frame off-screen and replace the visible TTY in one write."""

    def __init__(self, allow_clear: bool = True) -> None:
        self.allow_clear = allow_clear
        self.last_geometry: tuple[int, int] | None = None

    def write(self, output: str) -> None:
        geometry = _frame_geometry(output)
        clear = self.allow_clear and geometry != self.last_geometry
        _write_terminal_frame(output, clear)
        self.last_geometry = geometry


def _render_ultrawide(state: dict[str, Any], width: int, height: int, details: bool) -> str:
    gap = 2
    halves = (width - gap) // 2
    half_widths = [halves, width - gap - halves]
    heartbeat = iso()
    expanded_heights = (13, 24, 29, 14)
    expanded_frame_rows = 3 + 4 + sum(expanded_heights)
    if height - 1 >= expanded_frame_rows:
        attention_height, middle_height, lower_height, strip_height = 13, 24, 29, 14
    else:
        attention_height, middle_height, lower_height, strip_height = 8, 18, 13, 12
    header = _box(
        "GEM OPERATIONS · READ ONLY · NO CONTROL-PLANE WRITES",
        [
            f"UTC {heartbeat}   host gem / Ubuntu tty1   3440×1440   canvas {width}×{height}",
        ],
        width,
        3,
    )
    attention = _box(
        "IMMEDIATE ATTENTION · #1 BOTTLENECK FIRST",
        _attention_rows(state, width - 4),
        width,
        attention_height,
    )
    middle = _join_panels(
        [
            _box("CURRENT WORK", _work_rows(state, half_widths[0] - 4), half_widths[0], middle_height),
            _box("RECENT DELIVERY LOG", _log_rows(state, half_widths[1] - 4), half_widths[1], middle_height),
        ],
        gap,
    )
    detail_title = (
        "SECONDARY CAPACITY / OWNERS / ALL DETAIL"
        if details
        else "SECONDARY CAPACITY / OWNERS / DETAIL"
    )
    lower = _join_panels(
        [
            _box("SYSTEM HEALTH / ADMISSION", _health_rows(state, half_widths[0] - 4), half_widths[0], lower_height),
            _box(detail_title, _secondary_rows(state, half_widths[1] - 4, expanded=details), half_widths[1], lower_height),
        ],
        gap,
    )
    metrics = _metrics_strip(state, width, strip_height)
    lines = header + [""] + attention + [""] + middle + [""] + lower + [""] + metrics
    return _screen(lines, width, height)


def _render_compact(state: dict[str, Any], width: int, height: int, details: bool) -> str:
    body_width = width - 4
    lines = _box("GEM OPERATIONS · READ ONLY", [f"UTC {iso()} · compact {width}×{height}"], width)
    sections = [
        ("ATTENTION / ACTION", _attention_rows(state, body_width)),
        ("CURRENT WORK", _work_rows(state, body_width)),
        ("BUSINESS PULSE", _business_pulse_rows(state, body_width)),
        ("DELIVERY SPEED · ISSUE OPEN → LANDED", _delivery_speed_rows(state, body_width)),
        ("CURRENT LARGEST BOTTLENECK", _bottleneck_region_rows(state, body_width)),
        ("DELIVERY LOG", _log_rows(state, body_width)),
        ("SYSTEM HEALTH / ADMISSION", _health_rows(state, body_width)),
        ("SECONDARY CAPACITY / OWNERS / DETAIL", _secondary_rows(state, body_width, expanded=details)),
    ]
    for title, rows in sections:
        lines += [""] + _box(title, rows, width)
    return _screen(lines, width, height)


def render(
    state: dict[str, Any],
    width: int | None = None,
    height: int | None = None,
    view: str = "overview",
) -> str:
    size = shutil.get_terminal_size((160, 50))
    canvas_width = max(80, min(500, width or size.columns))
    canvas_height = max(30, min(120, height or size.lines))
    if canvas_width >= 220:
        return _render_ultrawide(state, canvas_width, canvas_height, view == "details")
    return _render_compact(state, canvas_width, canvas_height, view == "details")


def _refresh_one(
    state: dict[str, Any], key: str, collector: Any
) -> None:
    try:
        state[key] = collector()
    except Exception as exc:
        section = state.setdefault(key, {})
        section["error"] = type(exc).__name__


def refresh(state: dict[str, Any], remote: bool) -> dict[str, Any]:
    _refresh_one(state, "symphony", fetch_symphony)
    _refresh_one(state, "fleet", fetch_fleet_gate)
    _refresh_one(state, "ops", fetch_ops_metrics)
    if remote:
        _refresh_one(state, "delivery", fetch_delivery)
        _refresh_one(state, "issues", fetch_issue_source)
    save_state(state)
    return state


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="refresh and render once")
    parser.add_argument("--no-clear", action="store_true", help="do not clear the terminal")
    parser.add_argument(
        "--view",
        choices=("overview", "details"),
        default="overview",
        help="keyboard-accessible overview or expanded detail view",
    )
    parser.add_argument("--width", type=int, help="override terminal width for capture/tests")
    parser.add_argument("--height", type=int, help="override terminal height for capture/tests")
    args = parser.parse_args()
    prepare_console()
    state = refresh(load_state(), remote=True)
    if args.once:
        sys.stdout.write(render(state, args.width, args.height, args.view))
        return 0
    next_remote = time.monotonic() + REMOTE_INTERVAL
    frame_writer = TerminalFrameWriter(allow_clear=not args.no_clear)
    while True:
        output = render(state, args.width, args.height, args.view)
        frame_writer.write(output)
        time.sleep(LOCAL_INTERVAL)
        due = time.monotonic() >= next_remote
        state = refresh(state, remote=due)
        if due:
            next_remote = time.monotonic() + REMOTE_INTERVAL


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(0)
