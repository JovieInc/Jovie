#!/usr/bin/env python3
"""Compose and optionally submit one truthful Summer bottleneck snapshot.

The default authorities are fixed to Gem's canonical fleet receipt and the
official Symphony runtime. Submission is opt-in, one-shot, and never retried.
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

FLEET_PATH = pathlib.Path.home() / "gem-workspace/state/gem-priority-gate/latest.json"
RUNTIME_URL = "http://127.0.0.1:4041/api/v1/state"
BRIDGE_URL = "https://jov.ie/api/internal/ovie/summer-bottleneck"
MAX_SOURCE_AGE_SECONDS = 10 * 60
MAX_BYTES = 64 * 1024
SHA = set("0123456789abcdef")

CI_CLASSES = (
    ("controller-cascade-coalescing", "open", 100),
    ("merge-group-flake-baseline-ratchet", "open", 95),
    ("auto-enroll-self-cancel-churn", "partial", 90),
    ("controller-check-run-pagination-cap", "open", 80),
    ("affected-only-unit-selection", "open", 75),
    ("obsolete-unaffected-native-lanes", "partial", 70),
)
CI_BLOCKED_SINCE = "2026-09-02T02:33:00Z"


def canonical(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def digest(value: object) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


def parse_time(value: object) -> datetime:
    if not isinstance(value, str):
        raise TypeError("authority timestamp is missing")
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def require_fresh(value: object, now: datetime) -> str:
    parsed = parse_time(value)
    age = (now - parsed).total_seconds()
    if age < -60 or age > MAX_SOURCE_AGE_SECONDS:
        raise ValueError("authority timestamp is stale or in the future")
    return parsed.isoformat().replace("+00:00", "Z")


def count(value: object, label: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ValueError(f"{label} is not a nonnegative integer")
    return value


def exact_sha(value: object, label: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 40
        or any(c not in SHA for c in value)
    ):
        raise ValueError(f"{label} is not an exact SHA")
    return value


def _blocked_since(items: list[object], observed_at: str) -> str:
    candidates = [
        item.get("blocked_at")
        for item in items
        if isinstance(item, dict) and isinstance(item.get("blocked_at"), str)
    ]
    return min(candidates) if candidates else observed_at


def compose_snapshot(
    fleet: dict[str, Any], runtime: dict[str, Any], now: datetime
) -> dict[str, Any]:
    if now.tzinfo is None:
        raise ValueError("current time must be timezone-aware")
    observed_at = now.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    fleet_at = require_fresh(fleet.get("observedAt"), now)
    if fleet.get("schema") != "jovie-fleet-gate/v1":
        raise ValueError("fleet receipt schema is invalid")
    signals = fleet.get("signals")
    if not isinstance(signals, dict):
        raise TypeError("fleet receipt signals are missing")
    closure, queue, lease = (
        signals.get("closureHealth"),
        signals.get("queue"),
        signals.get("lease"),
    )
    main, production = signals.get("main"), signals.get("production")
    if not all(
        isinstance(item, dict) for item in (closure, queue, lease, main, production)
    ):
        raise ValueError("fleet receipt authority projection is incomplete")
    if queue.get("status") != "known" or queue.get("source") != "live":
        raise ValueError("merge queue authority is not a known live observation")
    if lease.get("status") != "ok":
        raise ValueError("lease authority is not healthy")
    require_fresh(lease.get("observedAt"), now)
    runtime_at = require_fresh(runtime.get("generated_at"), now)
    main_sha = exact_sha(main.get("sha"), "main SHA")
    production_sha_raw = production.get("deployedSha")
    production_sha = (
        exact_sha(production_sha_raw, "production SHA") if production_sha_raw else None
    )
    closure_status = closure.get("status")
    if closure_status not in {"healthy", "grace", "red"}:
        raise ValueError("closure status is invalid")
    open_prs = count(closure.get("openPrs"), "open PR count")
    eligible = count(queue.get("greenReadyPrs"), "eligible clean PR count")
    queued = count(closure.get("nativeQueueCount"), "queued PR count")
    capacity = lease.get("capacity")
    if not isinstance(capacity, dict):
        raise TypeError("lease capacity is missing")
    available = count(capacity.get("available"), "available capacity")
    work_items: list[object] = []
    for key in ("running", "retrying", "blocked"):
        value = runtime.get(key)
        if not isinstance(value, list):
            raise TypeError(f"runtime {key} is missing")
        work_items.extend(value)
    semantic_fleet = {
        "closure": {"status": closure_status, "openPullRequests": open_prs},
        "queue": {"eligibleCleanPrs": eligible, "queuedPrs": queued},
        "release": {"mainSha": main_sha, "productionSha": production_sha},
        "runner": {"capacityAvailable": available, "queuedWork": len(work_items)},
    }
    audit_classes = [
        {
            "id": ident,
            "state": state,
            "blockedSince": CI_BLOCKED_SINCE,
            "impact": impact,
            "owner": "Symphony",
            "handle": "JOV-5853",
        }
        for ident, state, impact in CI_CLASSES
    ]
    semantic_sources = {**semantic_fleet, "ciAudit": audit_classes}
    source = {"observedAt": observed_at, "sourceRevision": main_sha}
    snapshot = {
        "schema": "jovie.eve.summer-bottleneck-snapshot/v1",
        "observedAt": observed_at,
        "sourceVersion": main_sha,
        "signals": {
            "closure": {
                "schema": "jovie.eve.summer-closure-projection/v1",
                "sourceSchema": "jovie-closure-health/v1",
                **source,
                "sourceDigest": digest(semantic_fleet["closure"]),
                "status": closure_status,
                "blockedSince": fleet_at if closure_status == "red" else None,
                "openPullRequests": open_prs,
            },
            "queue": {
                "schema": "jovie.eve.summer-queue-projection/v1",
                "sourceSchema": "github-merge-queue-entry/v1",
                **source,
                "sourceDigest": digest(semantic_fleet["queue"]),
                "blockedSince": fleet_at if eligible > 0 and queued == 0 else None,
                "eligibleCleanPrs": eligible,
                "queuedPrs": queued,
            },
            "release": {
                "schema": "jovie.eve.summer-release-projection/v1",
                "sourceSchema": "jovie-controller-snapshot/v1",
                **source,
                "sourceDigest": digest(semantic_fleet["release"]),
                "blockedSince": fleet_at if main_sha != production_sha else None,
                "mainSha": main_sha,
                "productionSha": production_sha,
                "unverifiedMerges": int(main_sha != production_sha),
            },
            "runner": {
                "schema": "jovie.eve.summer-runner-projection/v1",
                "sourceSchema": "symphony-lease-guard-report/v1",
                **source,
                "observedAt": runtime_at,
                "sourceDigest": digest(semantic_fleet["runner"]),
                "blockedSince": _blocked_since(work_items, runtime_at)
                if available == 0 and work_items
                else None,
                "capacityAvailable": available,
                "queuedWork": len(work_items),
            },
            "ciAudit": {
                "schema": "jovie-ci-bottleneck-audit/v1",
                **source,
                "sourceDigest": digest(audit_classes),
                "classes": audit_classes,
            },
        },
    }
    snapshot["eventId"] = f"summer_{main_sha[:12]}_{digest(semantic_sources)[:16]}"
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
        headers={
            "authorization": f"Bearer {secret}",
            "content-type": "application/json",
        },
    )
    with opener(request, timeout=20) as response:
        raw = response.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError("bridge response exceeds the limit")
    result = json.loads(raw)
    if not isinstance(result, dict):
        raise TypeError("bridge returned an invalid event-bound receipt")
    receipt = result.get("eve", {}).get("receipt")
    if (
        result.get("ok") is not True
        or not isinstance(receipt, dict)
        or receipt.get("eventId") != snapshot["eventId"]
    ):
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
    return fleet, runtime


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-bundle")
    parser.add_argument("--submit", action="store_true")
    args = parser.parse_args()
    fleet, runtime = read_sources(args.source_bundle)
    snapshot = compose_snapshot(fleet, runtime, datetime.now(timezone.utc))
    result = (
        submit(snapshot, os.environ.get("CRON_SECRET", "")) if args.submit else snapshot
    )
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
