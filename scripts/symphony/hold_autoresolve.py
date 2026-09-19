#!/usr/bin/env python3
"""Hold autoresolve (Tim lock 2026-09-19).

Flap-class holds must carry a typed reason + observedAt. A released hold
never reports active red, even when a stale Sep-5 payload still says
closureStatus=red. When the fleet/preflight gate is GREEN — including
Symphony --closure-observe-only + GREEN — auto-clear those stale red
fields instead of waiting for founder discovery.

Founder authority remains required only for deploy / permission-class /
external-recipient (approvals-policy-v1).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


HOLD_POLICY = "hold-autoresolve-v1"
CLOSURE_HOLD_SCHEMA = "symphony-closure-hold/v1"
ADMISSION_HOLD_SCHEMA = "symphony-admission-hold/v1"
DIRECT_PICKUP_HOLD_SCHEMA = "gem-direct-pickup-hold/v1"
ISSUE_HOLD_SCHEMA = "symphony-issue-hold/v1"

ACTIVE_HOLD_STATUSES = frozenset({"holding", "exhausted"})
CLEARED_HOLD_STATUSES = frozenset(
    {"released", "cleared", "autoresolved", "observed-cleared"}
)
GREEN_GATE_STATES = frozenset({"GREEN", "green", "healthy"})
FOUNDER_HOLD_CLASSES = frozenset(
    {"deploy", "permission-class", "external-recipient"}
)
FLAP_HOLD_KINDS = frozenset(
    {"admission_hold", "closure-hold", "sticky-gate-hold"}
)


def _iso(now: datetime | None = None) -> str:
    stamp = now or datetime.now(timezone.utc)
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return stamp.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _text(value: object) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def hold_kind(payload: object) -> str | None:
    if not isinstance(payload, dict):
        return None
    schema = payload.get("schema")
    if schema == CLOSURE_HOLD_SCHEMA or payload.get("kind") == "closure-hold":
        return "closure-hold"
    if schema == ADMISSION_HOLD_SCHEMA or payload.get("kind") == "admission_hold":
        return "admission_hold"
    if schema in {DIRECT_PICKUP_HOLD_SCHEMA, ISSUE_HOLD_SCHEMA}:
        return "sticky-gate-hold"
    kind = _text(payload.get("kind"))
    return kind if kind in FLAP_HOLD_KINDS else None


def typed_hold_errors(payload: object) -> list[str]:
    """Fail closed when a flap-class hold is missing reason or observedAt."""
    if not isinstance(payload, dict):
        return ["hold-not-object"]
    errors: list[str] = []
    if hold_kind(payload) is None and payload.get("schema") not in {
        CLOSURE_HOLD_SCHEMA,
        ADMISSION_HOLD_SCHEMA,
        DIRECT_PICKUP_HOLD_SCHEMA,
        ISSUE_HOLD_SCHEMA,
    }:
        errors.append("hold-kind-untyped")
    if _text(payload.get("reason")) is None:
        errors.append("hold-reason-required")
    observed = payload.get("observedAt")
    if not isinstance(observed, str) or not observed.strip():
        errors.append("hold-observed-at-required")
    else:
        try:
            datetime.fromisoformat(observed.replace("Z", "+00:00"))
        except ValueError:
            errors.append("hold-observed-at-invalid")
    return errors


def require_typed_hold(payload: object) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("hold-not-object")
    errors = typed_hold_errors(payload)
    if errors:
        raise ValueError(",".join(errors))
    return payload


def is_active_red_hold(payload: object) -> bool:
    """Readers must not treat released-but-red payloads as an active stop."""
    if not isinstance(payload, dict) or typed_hold_errors(payload):
        return False
    status = payload.get("status")
    if status in CLEARED_HOLD_STATUSES:
        return False
    if payload.get("active") is False:
        return False
    if status not in ACTIVE_HOLD_STATUSES and status is not None:
        return False
    closure_status = payload.get("closureStatus")
    if closure_status == "red":
        return True
    if payload.get("newIssueIntakeAllowed") is False and status in ACTIVE_HOLD_STATUSES:
        return True
    return False


def gate_is_green(gate_state: object) -> bool:
    if isinstance(gate_state, dict):
        state = gate_state.get("state") or gate_state.get("status")
        if state in GREEN_GATE_STATES:
            return True
        closure = gate_state.get("closureHealth")
        if isinstance(closure, dict) and closure.get("status") in GREEN_GATE_STATES:
            return True
        return False
    return _text(gate_state) in GREEN_GATE_STATES


def should_autoresolve(
    payload: object,
    *,
    gate_state: object = None,
    observe_only: bool = False,
) -> bool:
    if not isinstance(payload, dict):
        return False
    hold_class = _text(payload.get("holdClass"))
    if hold_class in FOUNDER_HOLD_CLASSES:
        return False
    if not gate_is_green(gate_state):
        return False
    if observe_only or gate_is_green(gate_state):
        if is_active_red_hold(payload):
            return True
        if payload.get("status") in CLEARED_HOLD_STATUSES and (
            payload.get("closureStatus") == "red"
            or payload.get("newIssueIntakeAllowed") is False
        ):
            return True
    return False


def cleared_hold(
    payload: dict[str, Any],
    *,
    now: datetime | None = None,
    reason: str = "gate-green-autoresolve",
) -> dict[str, Any]:
    observed = _iso(now)
    cleared = dict(payload)
    cleared.update(
        {
            "status": "cleared",
            "reason": reason,
            "observedAt": observed,
            "closureStatus": "healthy",
            "newIssueIntakeAllowed": True,
            "active": False,
            "autoresolved": True,
            "autoresolvePolicy": HOLD_POLICY,
            "clearedAt": observed,
        }
    )
    return require_typed_hold(cleared)


def autoresolve_hold(
    payload: object,
    *,
    gate_state: object = None,
    observe_only: bool = False,
    now: datetime | None = None,
) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("hold-not-object")
    if should_autoresolve(
        payload, gate_state=gate_state, observe_only=observe_only
    ):
        return cleared_hold(payload, now=now, reason="gate-green-autoresolve")
    if payload.get("status") in CLEARED_HOLD_STATUSES:
        sanitized = dict(payload)
        if sanitized.get("closureStatus") == "red":
            sanitized["closureStatus"] = "healthy"
        if sanitized.get("newIssueIntakeAllowed") is False:
            sanitized["newIssueIntakeAllowed"] = True
        sanitized["active"] = False
        if _text(sanitized.get("reason")) is None:
            sanitized["reason"] = "released-hold-inactive"
        if _text(sanitized.get("observedAt")) is None:
            sanitized["observedAt"] = _iso(now)
        return require_typed_hold(sanitized)
    return require_typed_hold(payload)


def closure_hold_write_fields(
    verdict: dict[str, Any],
    *,
    status: str,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Fields a closure-hold writer must persist for one status."""
    observed = _iso(now)
    reason = _text(verdict.get("reason"))
    if reason is None:
        raise ValueError("hold-reason-required")
    released = status in CLEARED_HOLD_STATUSES
    closure_status = verdict.get("closureStatus")
    intake = verdict.get("newIssueIntakeAllowed")
    if released:
        closure_status = "healthy" if closure_status == "red" else closure_status
        if closure_status is None:
            closure_status = "healthy"
        intake = True
    return {
        "reason": reason,
        "observedAt": observed,
        "closureStatus": closure_status,
        "newIssueIntakeAllowed": intake,
        "active": (not released) and status in ACTIVE_HOLD_STATUSES,
        "autoresolved": released and verdict.get("reason") == "closure-health-green",
        "autoresolvePolicy": HOLD_POLICY,
    }
