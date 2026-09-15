#!/usr/bin/env python3
"""Compose and optionally submit one source-bound Summer bottleneck snapshot.

The producer reads Gem's canonical fleet receipt, the official Symphony
state endpoint, and the existing gem-service attestation. Runner source
attestation stays fail-closed unless that file is fresh within 600s
(EVIDENCE_MAX_AGE_SECONDS). Signing and OIDC delivery remain in the
existing Jovie production bridge; this process never reads or prints its
credentials.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import sys
import urllib.request
from datetime import datetime, timezone
from typing import Any

from summer_admissions import admission_projection
from summer_ci_audit import SCHEMA as CI_AUDIT_V2, validate_projection as validate_ci_audit_v2
from summer_existing_repair import (
    load_existing_repair_reference,
    load_existing_repair_task_admissions,
    task_admissions_match,
)

FLEET_PATH = pathlib.Path.home() / "gem-workspace/state/gem-priority-gate/latest.json"
ATTESTATION_PATH = (
    pathlib.Path.home() / "gem-workspace/state/gem-service-attestation.json"
)
CONCURRENCY_PATH = pathlib.Path.home() / "gem-workspace/state/symphony-concurrency.json"
RUNTIME_URL = "http://127.0.0.1:4041/api/v1/state"
BRIDGE_URL = "https://jov.ie/api/internal/ovie/summer-bottleneck"
MAX_SOURCE_AGE_SECONDS = 15 * 60
MAX_CLOCK_SKEW_SECONDS = 60
# Match symphony-concurrency-controller. Do not coarsen.
EVIDENCE_MAX_AGE_SECONDS = 600
MAX_BYTES = 64 * 1024
SHA = set("0123456789abcdef")
DIGEST = set("0123456789abcdef")
CI_CLASS_IDS = {
    "merge-group-flake-baseline-ratchet",
    "controller-cascade-coalescing",
    "auto-enroll-self-cancel-churn",
    "controller-check-run-pagination-cap",
    "obsolete-unaffected-native-lanes",
    "affected-only-unit-selection",
}


def canonical(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def digest(value: object) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


def semantic_identity(value: object) -> object:
    if isinstance(value, list):
        return [semantic_identity(item) for item in value]
    if isinstance(value, dict):
        return {
            key: semantic_identity(child)
            for key, child in value.items()
            if key != "observedAt"
        }
    return value


def record(value: object, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise TypeError(f"{label} is not an object")
    return value


def parse_time(value: object, label: str) -> datetime:
    if not isinstance(value, str):
        raise TypeError(f"{label} timestamp is missing")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(f"{label} timestamp is invalid") from error
    if parsed.tzinfo is None:
        raise ValueError(f"{label} timestamp has no timezone")
    return parsed.astimezone(timezone.utc)


def require_fresh(value: object, label: str, now: datetime) -> str:
    parsed = parse_time(value, label)
    age = (now - parsed).total_seconds()
    if age < -MAX_CLOCK_SKEW_SECONDS or age > MAX_SOURCE_AGE_SECONDS:
        raise ValueError(f"{label} authority is stale or in the future")
    return parsed.isoformat().replace("+00:00", "Z")


def optional_blocked_since(
    value: object, label: str, now: datetime
) -> str | None:
    if value is None:
        return None
    parsed = parse_time(value, label)
    if parsed > now:
        raise ValueError(f"{label} blockedSince is in the future")
    return parsed.isoformat().replace("+00:00", "Z")


def count(value: object, label: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ValueError(f"{label} is not a nonnegative integer")
    return value


def exact_sha(value: object, label: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 40
        or any(character not in SHA for character in value)
    ):
        raise ValueError(f"{label} is not an exact SHA")
    return value


def exact_digest(value: object, label: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 64
        or any(character not in DIGEST for character in value)
    ):
        raise ValueError(f"{label} is not an exact digest")
    return value


def source_fields(
    *,
    observed_at: str,
    source_revision: str | None,
    source_value: object,
) -> dict[str, str | None]:
    return {
        "observedAt": observed_at,
        "sourceRevision": source_revision,
        "sourceDigest": digest(source_value),
    }


def audit_projection(
    value: object, source_version: str, now: datetime
) -> dict[str, Any] | None:
    if value is None:
        return None
    audit = record(value, "CI audit")
    if audit.get("schema") == CI_AUDIT_V2:
        return validate_ci_audit_v2(audit, source_version, now, MAX_SOURCE_AGE_SECONDS)
    if audit.get("schema") != "jovie-ci-bottleneck-audit/v1":
        raise ValueError("CI audit schema is invalid")
    observed_at = require_fresh(audit.get("observedAt"), "CI audit", now)
    if exact_sha(audit.get("sourceRevision"), "CI audit source revision") != source_version:
        raise ValueError("CI audit source revision does not match main")
    exact_digest(audit.get("sourceDigest"), "CI audit source digest")
    classes = audit.get("classes")
    if not isinstance(classes, list) or len(classes) != 6:
        raise ValueError("CI audit classes are incomplete")
    if not all(isinstance(item, dict) for item in classes):
        raise TypeError("CI audit class is not an object")
    if {item.get("id") for item in classes} != CI_CLASS_IDS:
        raise ValueError("CI audit classes are not canonical")
    for item in classes:
        if item.get("state") not in {"open", "partial", "implemented"}:
            raise ValueError("CI audit class state is invalid")
        optional_blocked_since(item.get("blockedSince"), "CI audit class", now)
        impact = item.get("impact")
        if (
            not isinstance(impact, int)
            or isinstance(impact, bool)
            or not 0 < impact <= 100
        ):
            raise ValueError("CI audit class impact is invalid")
        if not isinstance(item.get("owner"), str) or not item["owner"]:
            raise ValueError("CI audit class owner is invalid")
        if not isinstance(item.get("handle"), str) or not item["handle"]:
            raise ValueError("CI audit class handle is invalid")
    return {
        "schema": "jovie-ci-bottleneck-audit/v1",
        "observedAt": observed_at,
        "sourceRevision": source_version,
        "sourceDigest": exact_digest(
            audit.get("sourceDigest"), "CI audit source digest"
        ),
        "classes": classes,
    }


def optional_sha(value: object) -> str | None:
    try:
        return exact_sha(value, "runtime source revision")
    except ValueError:
        return None


def runtime_identity_revision(value: object) -> str | None:
    if (
        not isinstance(value, dict)
        or value.get("schema") != "symphony-runtime-identity/v1"
        or value.get("service") != "symphony-elixir.service"
    ):
        return None
    return optional_sha(value.get("sourceRevision"))


def service_attestation_revision(value: object, now: datetime) -> str | None:
    if not isinstance(value, dict) or value.get("schema") != "gem-service-attestation/v1":
        return None
    listener = value.get("listener")
    if (
        value.get("active") is not True
        or value.get("healthy") is not True
        or not isinstance(listener, dict)
        or listener.get("port") != 4041
        or listener.get("boundToService") is not True
    ):
        return None
    service = value.get("service")
    if service is not None and service != "symphony-elixir.service":
        return None
    try:
        observed = parse_time(value.get("observedAt"), "service attestation")
    except (TypeError, ValueError):
        return None
    age = (now - observed).total_seconds()
    if age < -MAX_CLOCK_SKEW_SECONDS or age > EVIDENCE_MAX_AGE_SECONDS:
        return None
    return optional_sha(value.get("sourceRevision"))


def load_service_attestation() -> dict[str, Any] | None:
    try:
        value = json.loads(ATTESTATION_PATH.read_text())
    except (OSError, ValueError, json.JSONDecodeError):
        return None
    return value if isinstance(value, dict) else None


def attested_runtime_revision(
    signals: dict[str, Any],
    runtime: dict[str, Any],
    now: datetime,
    attestation: dict[str, Any] | None = None,
) -> str | None:
    """Emit a runner SHA only from a fresh gem-service attestation.

    A valid but stale file (observedAt older than 600s) stays null. That is
    the live JOV-6163 hold: Symphony concurrency then reports
    source-attestation-unavailable. Do not copy the stale SHA, do not use
    fleet/state identity to bypass freshness, and do not coarsen 600s.
    """
    if attestation is None:
        attestation = load_service_attestation()
    revision = service_attestation_revision(attestation, now)
    if revision is None:
        return None
    evidence = signals.get("concurrencyEvidence")
    fleet_revision = (
        runtime_identity_revision(evidence.get("runtime"))
        if isinstance(evidence, dict)
        else None
    )
    state_revision = optional_sha(runtime.get("sourceRevision"))
    if fleet_revision is not None and fleet_revision != revision:
        return None
    if state_revision is not None and state_revision != revision:
        return None
    return revision


def load_concurrency_observation():
    try:
        return json.loads(CONCURRENCY_PATH.read_text())
    except (OSError, ValueError):
        return None


def compose_snapshot(
    fleet: dict[str, Any],
    runtime: dict[str, Any],
    now: datetime,
    attestation: dict[str, Any] | None = None,
    concurrency: dict[str, Any] | None = None,
    existing_repair: dict[str, Any] | None = None,
    task_admissions: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if now.tzinfo is None:
        raise ValueError("current time must be timezone-aware")
    fleet = record(fleet, "fleet receipt")
    runtime = record(runtime, "Symphony runtime")
    if fleet.get("schema") != "jovie-fleet-gate/v1":
        raise ValueError("fleet receipt schema is invalid")
    fleet_at = require_fresh(fleet.get("observedAt"), "fleet receipt", now)
    signals = record(fleet.get("signals"), "fleet receipt signals")
    closure = record(signals.get("closureHealth"), "closure authority")
    queue = record(signals.get("queue"), "queue authority")
    lease = record(signals.get("lease"), "lease authority")
    main = record(signals.get("main"), "main authority")
    production = record(signals.get("production"), "production authority")
    if queue.get("status") != "known" or queue.get("source") != "live":
        raise ValueError("merge queue authority is not a known live observation")
    if lease.get("status") != "ok":
        raise ValueError("lease authority is not healthy")
    lease_at = require_fresh(lease.get("observedAt"), "lease authority", now)
    runtime_at = require_fresh(
        runtime.get("generated_at"), "Symphony runtime", now
    )
    attestation = attestation if attestation is not None else load_service_attestation()
    runtime_revision = attested_runtime_revision(
        signals, runtime, now, attestation
    )
    main_sha = exact_sha(main.get("sha"), "main SHA")
    production_sha_raw = production.get("deployedSha")
    production_sha = (
        exact_sha(production_sha_raw, "production SHA")
        if production_sha_raw is not None
        else None
    )
    closure_status = closure.get("status")
    if closure_status not in {"healthy", "grace", "red"}:
        raise ValueError("closure status is invalid")
    open_prs = count(closure.get("openPrs"), "open PR count")
    eligible = count(queue.get("greenReadyPrs"), "eligible clean PR count")
    queued = count(
        queue.get("nativeQueueCount", closure.get("nativeQueueCount")),
        "queued PR count",
    )
    capacity = record(lease.get("capacity"), "lease capacity")
    available = count(capacity.get("available"), "available capacity")
    running = runtime.get("running")
    retrying = runtime.get("retrying")
    blocked = runtime.get("blocked")
    for name, value in (("running", running), ("retrying", retrying), ("blocked", blocked)):
        if not isinstance(value, list):
            raise TypeError(f"runtime {name} is missing")
        if not all(isinstance(item, dict) for item in value):
            raise TypeError(f"runtime {name} contains an invalid item")
    work_items = [*running, *retrying, *blocked]
    blocked_since_values = [
        optional_blocked_since(item.get("blocked_at"), "runtime item", now)
        for item in blocked
        if item.get("blocked_at") is not None
    ]
    blocked_since = min(blocked_since_values) if blocked_since_values else None
    ci_audit = audit_projection(signals.get("ciAudit"), main_sha, now)
    closure_value = {
        "status": closure_status,
        "openPullRequests": open_prs,
        "blockedSince": closure.get("blockedSince"),
    }
    queue_value = {
        "eligibleCleanPrs": eligible,
        "queuedPrs": queued,
        "blockedSince": queue.get("blockedSince"),
    }
    release_value = {
        "mainSha": main_sha,
        "productionSha": production_sha,
        "blockedSince": production.get("blockedSince"),
    }
    capacity_source = {
        "schema": "symphony-lease-guard-report/v1",
        **source_fields(
            observed_at=lease_at,
            source_revision=main_sha,
            source_value=capacity,
        ),
    }
    work_source = {
        "schema": "symphony-runtime-state/v1",
        **source_fields(
            observed_at=runtime_at,
            source_revision=runtime_revision,
            source_value=work_items,
        ),
    }
    runner_value = {
        "capacityAvailable": available,
        "queuedWork": len(work_items) if runtime_revision is not None else None,
        "blockedSince": blocked_since,
        "capacitySource": capacity_source,
        "workSource": work_source,
    }
    attested_runtime = attestation.get("runtime", {}) if isinstance(attestation, dict) else {}
    if runtime_revision is not None and isinstance(attested_runtime, dict):
        generation = attested_runtime.get("generation")
        invocation = attested_runtime.get("invocationId")
        if (isinstance(generation, str) and len(generation) == 64 and set(generation) <= DIGEST
                and isinstance(invocation, str) and len(invocation) == 32 and set(invocation) <= DIGEST):
            runner_value.update(runtimeGeneration=generation, runtimeInvocationId=invocation)
    observed_at = now.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    admissions = admission_projection(fleet, concurrency, now, main_sha, runtime_revision, attestation)
    repair_signal = {"existingRepair": existing_repair} if existing_repair is not None else {}
    runtime_binding = {"runtimeRevision": runtime_revision,
                       "runtimeGeneration": runner_value.get("runtimeGeneration"),
                       "runtimeInvocationId": runner_value.get("runtimeInvocationId")}
    if task_admissions_match(task_admissions, existing_repair, ci_audit, main_sha, runtime_binding):
        repair_signal["taskAdmissions"] = task_admissions
    semantic_sources = {
        **repair_signal,
        "admissions": admissions,
        # A new measured authority observation needs a new event after a missed
        # delivery or expired grant. Existing task fingerprints still dedupe work.
        "admissionSourceObservations": {
            key: admissions[key]["observedAt"] for key in
            ("newImplementation", "ownedRemediation", "push", "providerEligibility", "downstreamHealth")
        },
        **({"taskAdmissionSourceObservations": {
            key: task_admissions.get(key, {}).get("observedAt")
            for key in ("providerEligibility", "downstreamHealth")
        }} if "taskAdmissions" in repair_signal else {}),
        "closure": closure_value,
        "queue": queue_value,
        "release": release_value,
        "runner": runner_value,
        "ciAudit": ci_audit,
    }
    snapshot = {
        "schema": "jovie.eve.summer-bottleneck-snapshot/v1",
        "eventId": (
            f"summer_{main_sha[:12]}_"
            f"{digest(semantic_identity(semantic_sources))[:16]}"
        ),
        "observedAt": observed_at,
        "sourceVersion": main_sha,
        "signals": {
            **repair_signal,
            "admissions": admissions,            "closure": {
                "schema": "jovie.eve.summer-closure-projection/v1",
                "sourceSchema": "jovie-closure-health/v1",
                **source_fields(
                    observed_at=fleet_at,
                    source_revision=main_sha,
                    source_value=closure_value,
                ),
                "status": closure_status,
                "blockedSince": optional_blocked_since(
                    closure.get("blockedSince"), "closure authority", now
                ),
                "openPullRequests": open_prs,
            },
            "queue": {
                "schema": "jovie.eve.summer-queue-projection/v1",
                "sourceSchema": "github-merge-queue-entry/v1",
                **source_fields(
                    observed_at=fleet_at,
                    source_revision=main_sha,
                    source_value=queue_value,
                ),
                "blockedSince": optional_blocked_since(
                    queue.get("blockedSince"), "queue authority", now
                ),
                "eligibleCleanPrs": eligible,
                "queuedPrs": queued,
            },
            "release": {
                "schema": "jovie.eve.summer-release-projection/v1",
                "sourceSchema": "jovie-controller-snapshot/v1",
                **source_fields(
                    observed_at=fleet_at,
                    source_revision=main_sha,
                    source_value=release_value,
                ),
                "blockedSince": optional_blocked_since(
                    production.get("blockedSince"), "production authority", now
                ),
                "mainSha": main_sha,
                "productionSha": production_sha,
                "unverifiedMerges": int(main_sha != production_sha),
            },
            "runner": {
                "schema": "jovie.eve.summer-runner-projection/v1",
                "sourceSchema": "symphony-runner-projection/v1",
                **source_fields(
                    observed_at=runtime_at,
                    source_revision=runtime_revision,
                    source_value=semantic_identity(runner_value),
                ),
                **runner_value,
            },
            "ciAudit": ci_audit,
        },
    }
    return snapshot


def submit(
    snapshot: dict[str, Any], secret: str, opener=urllib.request.urlopen
) -> dict[str, Any]:
    if not secret:
        raise ValueError("CRON_SECRET is unavailable")
    body = canonical(snapshot)
    if len(body) > MAX_BYTES:
        raise ValueError("snapshot exceeds the bridge limit")
    request = urllib.request.Request(
        BRIDGE_URL,
        data=body,
        method="POST",
        headers={"authorization": f"Bearer {secret}", "content-type": "application/json"},
    )
    with opener(request, timeout=20) as response:
        raw = response.read(MAX_BYTES + 1)
        status = getattr(response, "status", 200)
    if not 200 <= status < 300:
        raise ValueError("bridge returned a non-success response")
    if len(raw) > MAX_BYTES:
        raise ValueError("bridge response exceeds the limit")
    result = json.loads(raw)
    receipt = result.get("eve", {}).get("receipt") if isinstance(result, dict) else None
    if (
        result.get("ok") is not True
        if isinstance(result, dict)
        else True
    ) or not isinstance(receipt, dict) or receipt.get("eventId") != snapshot["eventId"]:
        raise ValueError("bridge returned an invalid event-bound receipt")
    return result


def read_sources(bundle: str | None) -> tuple[dict[str, Any], dict[str, Any]]:
    if bundle is not None:
        value = (
            json.load(sys.stdin)
            if bundle == "-"
            else json.loads(pathlib.Path(bundle).read_text())
        )
        if (
            not isinstance(value, dict)
            or not isinstance(value.get("fleet"), dict)
            or not isinstance(value.get("runtime"), dict)
        ):
            raise ValueError("source bundle is invalid")
        return value["fleet"], value["runtime"]
    fleet = json.loads(FLEET_PATH.read_text())
    with urllib.request.urlopen(RUNTIME_URL, timeout=3) as response:
        raw = response.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError("runtime authority response exceeds the limit")
    runtime = json.loads(raw)
    return record(fleet, "fleet receipt"), record(runtime, "Symphony runtime")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-bundle")
    parser.add_argument("--submit", action="store_true")
    args = parser.parse_args()
    fleet, runtime = read_sources(args.source_bundle)
    concurrency = None if args.source_bundle else load_concurrency_observation()
    existing_repair = None if args.source_bundle else load_existing_repair_reference()
    attestation = load_service_attestation()
    now = datetime.now(timezone.utc)
    snapshot = compose_snapshot(fleet, runtime, now, attestation=attestation,
                                concurrency=concurrency, existing_repair=existing_repair)
    if not args.source_bundle and existing_repair is not None:
        runner = snapshot["signals"]["runner"]
        task_admissions = load_existing_repair_task_admissions(
            existing_repair, snapshot["signals"]["ciAudit"], snapshot["sourceVersion"],
            {"runtimeRevision": runner["sourceRevision"],
             "runtimeGeneration": runner.get("runtimeGeneration"),
             "runtimeInvocationId": runner.get("runtimeInvocationId")},
        )
        # Recompose with the same measured sources. The observation supplies its
        # own timestamps; composing a snapshot never refreshes old evidence.
        snapshot = compose_snapshot(fleet, runtime, datetime.now(timezone.utc), attestation=attestation,
                                    concurrency=concurrency, existing_repair=existing_repair,
                                    task_admissions=task_admissions)
    result = submit(snapshot, os.environ.get("CRON_SECRET", "")) if args.submit else snapshot
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
