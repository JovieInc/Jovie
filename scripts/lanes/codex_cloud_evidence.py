"""Offline-verifiable evidence contract; no production cloud readback adapter exists yet.

A trusted adapter must bind supported cloud compatibility and worker readback to the
reservation. Local profile metadata, task IDs and status summaries cannot supply it.
"""
import math
import re
from datetime import datetime

import execution_attempt

SCHEMA = "jovie.cloud-account-occupancy/v1"
PHASES = {"reserved", "submitted", "unknown", "accepted", "completed"}


def number(value):
    return type(value) in (int, float) and -1e12 <= value <= 1e12 and math.isfinite(value)


def fresh(stamp, now, cadence):
    return number(stamp) and 0 <= now - stamp < cadence


def capacity_reason(lane, name, profile, row, now):
    if row.get("subscriptionBinding") != lane.subscription_binding(profile):
        return "identity-mismatch"
    if not fresh(row.get("subscriptionIdentityVerifiedAt"), now, lane.LEDGER_CADENCE_S):
        return "identity-stale"
    lease = row.get("capacityLease") or {}
    if any(lease.get(key) != expected for key, expected in {
            "schema": lane.LEDGER_SCHEMA, "provider": "openai", "account": name,
            "leaseId": f"codex:{name}", "capacityUnit": "percentOfIncludedWindow"}.items()):
        return "capacity-identity-mismatch"
    source = (lease.get("sources") or {}).get("capacity") or {}
    try:
        observed = datetime.fromisoformat(source["observedAt"].replace("Z", "+00:00")).timestamp()
    except (KeyError, TypeError, ValueError, AttributeError):
        return "capacity-stale"
    if (source.get("source") != "account/rateLimits/read" or
            source.get("reconciliation") != "authoritative" or
            not fresh(observed, now, lane.LEDGER_CADENCE_S)):
        return "capacity-stale"
    until = row.get("exhaustedUntil", 0)
    if not number(until):
        return "cooldown-unreadable"
    if until > now:
        return {"auth": "authentication-cooldown", "rate": "burst-rate-cooldown"}.get(
            row.get("lastKind"), "quota-cooldown")
    windows = lease.get("usableCapacityRemaining")
    if not isinstance(windows, dict) or not windows:
        return "capacity-unavailable"
    for key, window in windows.items():
        if not isinstance(window, dict) or not number(window.get("remainingPercent")) or not number(window.get("resetsAt")):
            return f"capacity-invalid:{key}"
        if not 0 <= window["remainingPercent"] <= 100:
            return f"capacity-invalid:{key}"
        if window["resetsAt"] <= now:
            return f"reset-unverified:{key}"
        if window["remainingPercent"] <= lane.floor_percent():
            return f"quota-floor:{key}"
    return None


def compatible(proof, account, binding, env, now, cadence):
    return (isinstance(proof, dict) and proof.get("supported") is True and
            proof.get("account") == account and proof.get("bindingDigest") == binding and
            proof.get("environment") == env and proof.get("cliVersion") == "0.162.1" and
            isinstance(proof.get("evidenceDigest"), str) and
            re.fullmatch(r"[0-9a-f]{64}", proof["evidenceDigest"]) is not None and
            fresh(proof.get("observedAt"), now, cadence))


def execution_live(row, now):
    context = row["execution"]
    return execution_attempt.resume(context["path"], context["identity"], row["fencingToken"],
                                    context["owner"], now=now,
                                    coordination=context.get("coordination")).get("admitted") is True


def checkpoint_valid(checkpoint, row):
    return (isinstance(checkpoint, dict) and checkpoint.get("kind") in
            {"saved-checkpoint", "pushed-artifact"} and checkpoint.get("sourceTask") == row.get("task") and
            checkpoint.get("sourceFence") == row["fencingToken"] and
            isinstance(checkpoint.get("reference"), str) and bool(checkpoint["reference"]) and
            isinstance(checkpoint.get("digest"), str) and
            re.fullmatch(r"[0-9a-f]{64}", checkpoint["digest"]) is not None)


def valid_record(row):
    required = ("reservationId", "submissionId", "account", "slot", "env", "bindingDigest", "fencingToken")
    return (row.get("schema") == SCHEMA and row.get("phase") in PHASES and
            all(isinstance(row.get(k), str) and row[k] for k in required) and
            isinstance(row.get("execution"), dict) and
            all(k in row["execution"] for k in ("path", "identity", "owner")) and
            isinstance(row.get("capacity"), dict) and bool(row["capacity"]) and
            number(row.get("capacityObservedAt")) and number(row.get("identityVerifiedAt")) and
            (row["phase"] not in {"submitted", "accepted", "completed"} or (isinstance(row.get("task"), str) and re.fullmatch(r"task_[A-Za-z0-9_-]+", row["task"]) is not None)) and
            (row["phase"] not in {"accepted", "completed"} or bool(row.get("workerId"))))


def readback_reason(proof, row, now, cadence):
    if not isinstance(proof, dict) or not fresh(proof.get("observedAt"), now, cadence):
        return "acceptance-stale"
    for key in ("account", "env", "bindingDigest", "submissionId", "fencingToken"):
        if proof.get(key) != row[key]:
            return f"acceptance-mismatch:{key}"
    if (proof.get("supported") is not True or not proof.get("workerId") or
            not isinstance(proof.get("task"), str) or not re.fullmatch(r"task_[A-Za-z0-9_-]+", proof["task"]) or
            proof.get("state") not in {"accepted", "completed"}):
        return "worker-acceptance-unverified"
    if row.get("task") and proof["task"] != row["task"]:
        return "acceptance-mismatch:task"
    if row.get("workerId") and proof["workerId"] != row["workerId"]:
        return "acceptance-mismatch:worker"
    if row.get("checkpoint") and proof.get("checkpointDigest") != row["checkpoint"]["digest"]:
        return "checkpoint-provenance-mismatch"
    if proof["state"] == "completed" and (row["phase"] != "accepted" or proof.get("writerStopped") is not True):
        return "completion-unverified"
    return None
