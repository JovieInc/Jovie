#!/usr/bin/env python3
"""Provider-local adaptive admission for isolated Symphony workers.

The official Symphony launcher remains Codex app-server only.  This module is
used by the existing isolated fallback worker, whose executor contract is
ordinary CLI argv and therefore also supports Cursor's print/worker-shaped CLI.
"""

from __future__ import annotations

import datetime as dt
import fcntl
import hashlib
import json
import os
import pathlib
import tempfile
from typing import Any, Callable


SCHEMA = "symphony-provider-capacity/v1"
LANE_SCHEMA = "jovie-lane-capacity/v2"
PROVIDERS = frozenset(("cursor", "grok", "kimi"))
PRESSURE_KINDS = frozenset(
    ("quota_pressure", "auth_pressure", "host_pressure", "downstream_pressure")
)
RECOVERY_SECONDS = {
    "quota_pressure": 30 * 60,
    "auth_pressure": 15 * 60,
    "host_pressure": 5 * 60,
    "downstream_pressure": 2 * 60,
}
MAX_INCIDENT_PROBES = 3
INCIDENT_SCHEMA = "symphony-provider-incident/v1"


def _utc(value: str) -> dt.datetime:
    parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("timestamp must include a timezone")
    return parsed.astimezone(dt.timezone.utc)


def _iso(value: dt.datetime) -> str:
    return value.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def empty_state(observed_at: str) -> dict[str, Any]:
    _utc(observed_at)
    return {
        "schema": SCHEMA,
        "observedAt": observed_at,
        "providers": {},
        "events": {},
        "incidents": {},
    }


def validate_state(value: object) -> dict[str, Any]:
    if not isinstance(value, dict) or value.get("schema") != SCHEMA:
        raise ValueError("provider capacity state has invalid schema")
    _utc(str(value.get("observedAt") or ""))
    providers = value.get("providers")
    events = value.get("events")
    incidents = value.setdefault("incidents", {})
    if not isinstance(providers, dict) or not isinstance(events, dict) or not isinstance(incidents, dict):
        raise ValueError("provider capacity state has invalid shape")
    for provider, item in providers.items():
        if provider not in PROVIDERS or not isinstance(item, dict):
            raise ValueError("provider capacity state has unknown provider")
        limit = item.get("limit")
        if not isinstance(limit, int) or isinstance(limit, bool) or limit < 0:
            raise ValueError("provider capacity limit must be non-negative")
        if item.get("status") not in {"available", "cooling", "recovering"}:
            raise ValueError("provider capacity status is invalid")
        for name in ("pressureCount", "usefulCompletions"):
            count = item.get(name, 0)
            if not isinstance(count, int) or isinstance(count, bool) or count < 0:
                raise ValueError(f"provider capacity {name} must be non-negative")
        if item.get("recoverAfter") is not None:
            _utc(str(item["recoverAfter"]))
    for event_id, fingerprint in events.items():
        if not isinstance(event_id, str) or not event_id or not isinstance(fingerprint, str):
            raise ValueError("provider capacity event ledger is invalid")
    for fingerprint, incident in incidents.items():
        if not isinstance(fingerprint, str) or not fingerprint or not isinstance(incident, dict):
            raise ValueError("provider capacity incident ledger is invalid")
        if incident.get("schema") != INCIDENT_SCHEMA:
            raise ValueError("provider capacity incident schema is invalid")
        if not isinstance(incident.get("affectedIssues"), list) or not all(
            isinstance(issue, str) and issue for issue in incident["affectedIssues"]
        ):
            raise ValueError("provider capacity incident issues are invalid")
        if incident.get("status") not in {"active", "resolved"}:
            raise ValueError("provider capacity incident status is invalid")
        if not isinstance(incident.get("attempts"), list) or not isinstance(
            incident.get("probeCount"), int
        ) or incident["probeCount"] < 0:
            raise ValueError("provider capacity incident evidence is invalid")
        for timestamp in ("firstOccurrenceAt", "lastOccurrenceAt", "nextRecoveryAt"):
            if incident.get(timestamp) is not None:
                _utc(str(incident[timestamp]))
    return value


def provider_record(
    state: dict[str, Any], provider: str, now: str, observed_capacity: int | None = None
) -> dict[str, Any]:
    validate_state(state)
    if provider not in PROVIDERS:
        raise ValueError("provider is not an isolated fallback provider")
    existed = provider in state["providers"]
    current = dict(state["providers"].get(provider) or {})
    if observed_capacity is not None:
        if (
            not isinstance(observed_capacity, int)
            or isinstance(observed_capacity, bool)
            or observed_capacity < 0
        ):
            raise ValueError("observed capacity must be a non-negative integer")
        # A live measurement seeds a new provider and can lower a stale state,
        # but it must not erase an adaptive decrease on every reconcile.
        if not existed:
            current["limit"] = observed_capacity
            current["source"] = "live-observation"
    current.setdefault("limit", 1)
    current.setdefault("source", "runtime-floor")
    current.setdefault("status", "available")
    current.setdefault("pressureCount", 0)
    current.setdefault("usefulCompletions", 0)
    deadline = current.get("recoverAfter")
    if deadline and _utc(deadline) <= _utc(now):
        current.update(
            {
                "limit": max(1, current["limit"]),
                "status": "recovering",
                "recoverAfter": None,
                "source": "automatic-recovery",
            }
        )
    return current


def _fingerprint(event: dict[str, Any]) -> str:
    return hashlib.sha256(
        json.dumps(event, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def incident_fingerprint(*, provider: str, kind: str, root_reason: str | None = None) -> str:
    """Return a stable fingerprint that excludes issue and attempt timestamps."""
    return hashlib.sha256(
        json.dumps(
            {"provider": provider, "kind": kind, "rootReason": root_reason or kind},
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
    ).hexdigest()[:24]


def apply_observation(
    state: dict[str, Any],
    *,
    provider: str,
    kind: str,
    event_id: str,
    observed_at: str,
    observed_capacity: int | None = None,
    issue_identifier: str | None = None,
    evidence_reference: str | None = None,
    root_reason: str | None = None,
) -> dict[str, Any]:
    """Apply one idempotent observation; conflicting replay is refused."""
    validate_state(state)
    _utc(observed_at)
    if not event_id:
        raise ValueError("event id is required")
    if kind not in PRESSURE_KINDS and kind not in {"useful_completion", "capacity_observed"}:
        raise ValueError("provider capacity observation kind is invalid")
    record = provider_record(state, provider, observed_at, observed_capacity)
    event = {
        "provider": provider,
        "kind": kind,
        "observedAt": observed_at,
        "observedCapacity": observed_capacity,
    }
    fingerprint = _fingerprint(event)
    prior = state["events"].get(event_id)
    if prior is not None:
        if prior != fingerprint:
            raise ValueError("provider capacity event replay conflicts")
        return state
    if kind == "useful_completion":
        record.update(
            {
                "limit": record["limit"] + 1,
                "status": "available",
                "recoverAfter": None,
                "pressureCount": 0,
                "usefulCompletions": record["usefulCompletions"] + 1,
                "source": "useful-completion",
            }
        )
    elif kind in PRESSURE_KINDS:
        record.update(
            {
                "limit": max(0, record["limit"] // 2),
                "status": "cooling",
                "recoverAfter": _iso(
                    _utc(observed_at) + dt.timedelta(seconds=RECOVERY_SECONDS[kind])
                ),
                "pressureCount": record["pressureCount"] + 1,
                "source": kind,
            }
        )
    updated = json.loads(json.dumps(state))
    updated["observedAt"] = observed_at
    updated["providers"][provider] = record
    updated["events"][event_id] = fingerprint
    if kind in PRESSURE_KINDS:
        key = incident_fingerprint(provider=provider, kind=kind, root_reason=root_reason)
        incident = dict(updated["incidents"].get(key) or {})
        now = observed_at
        attempt = {
            "eventId": event_id,
            "observedAt": now,
            "issue": issue_identifier,
            "evidence": evidence_reference,
            "rootReason": root_reason or kind,
        }
        attempts = list(incident.get("attempts") or [])
        attempts.append(attempt)
        incident.update(
            {
                "schema": INCIDENT_SCHEMA,
                "fingerprint": key,
                "provider": provider,
                "rootReason": root_reason or kind,
                "status": "active",
                "affectedIssues": sorted(
                    set(incident.get("affectedIssues") or [])
                    | ({issue_identifier} if issue_identifier else set())
                ),
                "firstOccurrenceAt": incident.get("firstOccurrenceAt") or now,
                "lastOccurrenceAt": now,
                "evidenceReferences": sorted(
                    set(incident.get("evidenceReferences") or [])
                    | ({evidence_reference} if evidence_reference else set())
                ),
                "attempts": attempts,
                "owner": "symphony-reconciler",
                "firstFailingTransition": "provider_capacity_observed",
                "progressAt": incident.get("progressAt"),
                "remainingRecoveryBudget": max(
                    0, MAX_INCIDENT_PROBES - int(incident.get("probeCount") or 0)
                ),
                "hypothesis": f"{provider} {root_reason or kind} is blocking useful work",
                "preconditions": ["fresh capacity evidence", "no active duplicate probe"],
                "expectedEffect": "a useful completion or changed capacity evidence",
                "idempotencyKey": f"incident:{key}",
                "rollback": "release probe lease without changing issue ownership",
                "nextAction": (
                    "bounded_recovery_probe"
                    if int(incident.get("probeCount") or 0) < MAX_INCIDENT_PROBES
                    else "escalate_provider_capacity_incident"
                ),
                "nextRecoveryAt": _iso(
                    _utc(now) + dt.timedelta(seconds=RECOVERY_SECONDS[kind])
                ),
                "nextWakeupAt": _iso(
                    _utc(now) + dt.timedelta(seconds=RECOVERY_SECONDS[kind])
                ),
                "probeCount": int(incident.get("probeCount") or 0),
            }
        )
        updated["incidents"][key] = incident
    elif kind == "useful_completion":
        # Recovery evidence closes the matching provider incidents while
        # retaining all attempts and affected-issue links for auditability.
        for incident in updated["incidents"].values():
            if isinstance(incident, dict) and incident.get("provider") == provider:
                incident.update(
                    {
                        "status": "resolved",
                        "resolvedAt": observed_at,
                        "nextAction": "normal_admission_re_evaluation",
                        "nextRecoveryAt": None,
                        "nextWakeupAt": None,
                        "progressAt": observed_at,
                        "remainingRecoveryBudget": max(
                            0, MAX_INCIDENT_PROBES - int(incident.get("probeCount") or 0)
                        ),
                    }
                )
    return updated


def request_recovery_probe(
    state: dict[str, Any], *, fingerprint: str, probe_id: str, observed_at: str,
    evidence_reference: str | None = None,
) -> dict[str, Any]:
    """Consume one bounded, idempotent probe from an active incident."""
    validate_state(state)
    _utc(observed_at)
    incident = state["incidents"].get(fingerprint)
    if not isinstance(incident, dict):
        raise ValueError("provider capacity incident is unknown")
    if any(attempt.get("probeId") == probe_id for attempt in incident["attempts"]):
        return state
    if incident["status"] != "active" or incident["probeCount"] >= MAX_INCIDENT_PROBES:
        return state
    updated = json.loads(json.dumps(state))
    target = updated["incidents"][fingerprint]
    target["probeCount"] += 1
    target["remainingRecoveryBudget"] = MAX_INCIDENT_PROBES - target["probeCount"]
    target["nextAction"] = (
        "bounded_recovery_probe"
        if target["probeCount"] < MAX_INCIDENT_PROBES
        else "escalate_provider_capacity_incident"
    )
    target["attempts"].append(
        {
            "probeId": probe_id,
            "observedAt": observed_at,
            "kind": "recovery_probe",
            "evidence": evidence_reference,
        }
    )
    return updated


def admitted_limit(
    state: dict[str, Any],
    provider: str,
    *,
    active: int,
    now: str,
    observed_capacity: int | None = None,
) -> int:
    record = provider_record(state, provider, now, observed_capacity)
    if record["status"] == "cooling":
        return 0
    return max(0, record["limit"] - active)


def lane_allows(
    receipt: object,
    *,
    provider: str,
    lane: str,
    remediation: bool,
) -> bool:
    """Throttle only the affected lane and reserve its final slot for repair."""
    if not isinstance(receipt, dict) or receipt.get("schema") != LANE_SCHEMA:
        return False
    lanes = receipt.get("lanes")
    resources = receipt.get("sharedResources")
    if not isinstance(lanes, dict) or not isinstance(resources, dict):
        return False
    lane_capacity = lanes.get(lane)
    if lane_capacity is None:
        lane_capacity = {"ready": 0, "budget": receipt.get("defaultLaneBudget")}
    if not isinstance(lane_capacity, dict):
        return False
    ready, budget = lane_capacity.get("ready"), lane_capacity.get("budget")
    if not all(isinstance(value, int) and not isinstance(value, bool) for value in (ready, budget)):
        return False
    if ready < 0 or budget <= 0 or ready >= budget:
        return False
    for resource in resources.values():
        if not isinstance(resource, dict):
            return False
        consumers = resource.get("consumers")
        if lane not in (consumers if isinstance(consumers, list) else []):
            continue
        if resource.get("resource") not in {provider, f"provider:{provider}"}:
            continue
        resource_ready, resource_budget = resource.get("ready"), resource.get("budget")
        if not all(
            isinstance(value, int) and not isinstance(value, bool)
            for value in (resource_ready, resource_budget)
        ):
            return False
        remaining = resource_budget - resource_ready
        return remaining >= (1 if remediation else 2)
    return True


def read_state(path: pathlib.Path, now: str) -> dict[str, Any]:
    try:
        return validate_state(json.loads(path.read_text(encoding="utf-8")))
    except FileNotFoundError:
        return empty_state(now)
    except (OSError, TypeError, ValueError):
        # Corrupt state must fail closed.  The caller can report the typed
        # observation failure while retaining the last safe admission view.
        raise ValueError("provider capacity state is unreadable")


def write_state(path: pathlib.Path, state: dict[str, Any]) -> None:
    validate_state(state)
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(state, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def update_state(
    path: pathlib.Path,
    *,
    now: str,
    mutate: Callable[[dict[str, Any]], dict[str, Any]],
) -> dict[str, Any]:
    """Serialize read/transition/write so concurrent isolated workers converge."""
    path.parent.mkdir(parents=True, exist_ok=True)
    lock_path = path.with_name(f"{path.name}.lock")
    with lock_path.open("a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        state = read_state(path, now)
        updated = mutate(state)
        write_state(path, updated)
        return updated


def record_observation(path: pathlib.Path, **observation: Any) -> dict[str, Any]:
    now = str(observation.get("observed_at") or "")

    def transition(state: dict[str, Any]) -> dict[str, Any]:
        return apply_observation(state, **observation)

    return update_state(path, now=now, mutate=transition)
