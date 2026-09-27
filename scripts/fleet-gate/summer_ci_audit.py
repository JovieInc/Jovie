"""Read-only CI observations. One accepted class mapping; checks stay non-dispatchable."""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone

SCHEMA = "jovie-ci-bottleneck-audit/v2"
CLASS_IDS = (
    "affected-only-unit-selection", "auto-enroll-self-cancel-churn",
    "controller-cascade-coalescing", "controller-check-run-pagination-cap",
    "merge-group-flake-baseline-ratchet", "obsolete-unaffected-native-lanes",
)
# Smallest CI execute class. Owner is the catalog owner for this id.
# The impact rule stays on affected unit paths. Action is the existing
# CI-class repair verb. Handle is the admission check key.
ACCEPTED_CLASS_ID = "affected-only-unit-selection"
ACCEPTED_CLASS = {
    "id": ACCEPTED_CLASS_ID,
    "state": "open",
    "owner": "ci-risk-classifier",
    "impact-rule": "affected-unit-paths-only",
    "action": "remediate-selected-ci-audit-class",
    "handle": "audit:affected-only-units",
}
ACCEPTED_CLASS_FIELDS = frozenset(ACCEPTED_CLASS)
SHA = re.compile(r"^[a-f0-9]{40}$")
MAX_PAGES = 10
MAX_TARGETS = 3
MAX_MEASUREMENTS = 25
MAX_SAFE_INTEGER = 2**53 - 1
REASONS = ("class-unmapped", "owner-unaccepted", "impact-rule-unaccepted", "action-unaccepted")


def excluded_classes():
    return [{"id": name, "reason": "mapping-unaccepted"}
            for name in CLASS_IDS if name != ACCEPTED_CLASS_ID]


def class_mapping_accepted(item):
    """Accept only the one mapped class, as open or partial."""
    return (isinstance(item, dict) and set(item) == ACCEPTED_CLASS_FIELDS
            and item["id"] == ACCEPTED_CLASS_ID
            and item["state"] in {"open", "partial"}
            and all(item[key] == ACCEPTED_CLASS[key]
                    for key in ("owner", "impact-rule", "action", "handle")))


def _digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                     ensure_ascii=False).encode()).hexdigest()


def _sha(value):
    return isinstance(value, str) and SHA.fullmatch(value) and value != "0" * 40


def _time(value):
    if not isinstance(value, str):
        raise ValueError("observation-time-invalid")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("observation-time-invalid")
    return parsed


def _head(reader, repo, pr):
    value = reader(repo, f"pulls/{pr}" if pr else "branches/main")
    if pr:
        if value.get("state") != "open":
            raise ValueError("target-closed")
        value = value.get("head", {}).get("sha")
    else:
        value = value.get("commit", {}).get("sha")
    if not _sha(value):
        raise ValueError("target-head-unavailable")
    return value


def observe_ci_audit(repo, revision, reader, *, targets=(), clock=None):
    """Reuse the fleet's authenticated reader and existing repair inventory.

    This bounded sample preserves failures without granting per-check dispatch.
    One class mapping is accepted. The other five stay excluded.
    A fresh read of an old check does not change its completion timestamp.
    """
    if repo != "JovieInc/Jovie" or not _sha(revision):
        return None
    clock = clock or (lambda: datetime.now(timezone.utc))
    selected = {}
    for row in targets if isinstance(targets, (list, tuple)) else ():
        if (isinstance(row, dict) and row.get("repository") == repo
                and row.get("schema") == "jovie-pr-lifecycle-action/v1"
                and row.get("sourceState") == "repair" and row.get("terminal") is False
                and type(row.get("pr")) is int
                and 0 < row["pr"] <= MAX_SAFE_INTEGER and _sha(row.get("headSha"))):
            selected[row["pr"]] = row["headSha"]
    target_count = len(selected)
    selected = [(None, revision), *sorted(selected.items())[:MAX_TARGETS]]
    failures, issues, evidence = [], set(), []
    checked = 0
    for pr, expected in selected:
        runs, total = {}, None
        try:
            if _head(reader, repo, pr) != expected:
                raise ValueError("head-changed")
            for page in range(1, MAX_PAGES + 1):
                value = reader(repo, f"commits/{expected}/check-runs?per_page=100&page={page}")
                rows, count = value.get("check_runs"), value.get("total_count")
                if (not isinstance(rows, list) or len(rows) > 100 or type(count) is not int
                        or count < 0 or (total is not None and total != count)):
                    raise ValueError("pagination-incomplete")
                total = count
                for row in rows:
                    identifier = row.get("id") if isinstance(row, dict) else None
                    if type(identifier) is not int or not 0 < identifier <= MAX_SAFE_INTEGER or row.get("head_sha") != expected:
                        raise ValueError("check-identity-invalid")
                    if identifier in runs and runs[identifier] != row:
                        raise ValueError("check-identity-conflict")
                    runs[identifier] = row
                if len(rows) < 100:
                    break
            if len(runs) != total:
                raise ValueError("pagination-incomplete")
            if _head(reader, repo, pr) != expected:
                raise ValueError("head-changed")
        except (OSError, ValueError, TypeError, KeyError, AttributeError, RuntimeError, subprocess.SubprocessError) as error:
            issues.add("incomplete-observation")
            if isinstance(error, ValueError) and str(error) == "head-changed":
                issues.add("head-drift")
        # Even partial reads are useful diagnostics. They never add a class.
        checked += len(runs)
        evidence.append({"pr": pr, "head": expected, "checks": list(runs.values()), "total": total})
        for row in runs.values():
            if row.get("status") != "completed" or row.get("conclusion") not in {
                "failure", "timed_out", "action_required", "startup_failure", "cancelled"
            }:
                continue
            name = row.get("name")
            try:
                finished = _time(row.get("completed_at"))
                if (not isinstance(name, str) or not 1 <= len(name) <= 160
                        or any(ord(c) < 32 for c in name) or finished > clock()):
                    raise ValueError("check-observation-invalid")
            except (ValueError, TypeError, OverflowError):
                issues.add("incomplete-observation")
                continue
            failures.append({
                "repository": repo, "pr": pr, "headSha": expected,
                "checkId": row["id"], "checkName": name,
                "conclusion": row["conclusion"], "completedAt": row["completed_at"],
                "dispatchable": False, "nonDispatchableReasons": list(REASONS),
            })
    # Commit drift anywhere in the read window invalidates admission, not the
    # usefulness of the bounded diagnostic observations already collected.
    try:
        if _head(reader, repo, None) != revision:
            issues.add("head-drift")
    except (OSError, ValueError, TypeError, KeyError, AttributeError, RuntimeError, subprocess.SubprocessError):
        issues.add("incomplete-observation")
    observed_at = clock().astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    failures.sort(key=lambda row: (row["pr"] or 0, row["checkId"]))
    result = {
        "schema": SCHEMA, "observedAt": observed_at, "sourceRevision": revision,
        "sourceDigest": _digest(evidence), "classes": [dict(ACCEPTED_CLASS)],
        "excludedClasses": excluded_classes(),
        "measurements": failures[:MAX_MEASUREMENTS],
        "sample": {"checkRunsObserved": checked, "failuresObserved": len(failures),
                   "failuresOmitted": max(0, len(failures) - MAX_MEASUREMENTS),
                   "targetsOmitted": max(0, target_count - MAX_TARGETS),
                   "complete": not issues and target_count <= MAX_TARGETS,
                   "reasons": sorted(issues)},
    }
    return result


def validate_projection(value, revision, now, max_age_seconds):
    """Keep the publisher's existing 900-second source bound, not a new clock."""
    if set(value) != {"schema", "observedAt", "sourceRevision", "sourceDigest", "classes",
                      "excludedClasses", "measurements", "sample"}:
        raise ValueError("CI audit fields invalid")
    age = (now - _time(value["observedAt"])).total_seconds()
    if (value["schema"] != SCHEMA or value["sourceRevision"] != revision
            or not -60 <= age <= max_age_seconds
            or not isinstance(value["sourceDigest"], str)
            or not re.fullmatch(r"[a-f0-9]{64}", value["sourceDigest"])):
        raise ValueError("CI audit binding invalid")
    classes = value["classes"]
    if (not isinstance(classes, list) or len(classes) != 1
            or not class_mapping_accepted(classes[0])):
        raise ValueError("CI audit class mapping invalid")
    if value["excludedClasses"] != excluded_classes():
        raise ValueError("CI audit exclusions invalid")
    rows = value["measurements"]
    if not isinstance(rows, list) or len(rows) > MAX_MEASUREMENTS:
        raise ValueError("CI audit measurements invalid")
    identities = set()
    for row in rows:
        if (not isinstance(row, dict) or set(row) != {"repository", "pr", "headSha", "checkId", "checkName",
                "conclusion", "completedAt", "dispatchable", "nonDispatchableReasons"}
                or row["repository"] != "JovieInc/Jovie" or not _sha(row["headSha"])
                or not (row["pr"] is None or type(row["pr"]) is int and 0 < row["pr"] <= MAX_SAFE_INTEGER)
                or type(row["checkId"]) is not int or not 0 < row["checkId"] <= MAX_SAFE_INTEGER
                or not isinstance(row["checkName"], str) or not 1 <= len(row["checkName"]) <= 160
                or any(ord(c) < 32 for c in row["checkName"])
                or row["conclusion"] not in {"failure", "timed_out", "action_required", "startup_failure", "cancelled"}
                or row["dispatchable"] is not False or row["nonDispatchableReasons"] != list(REASONS)
                or _time(row["completedAt"]) > _time(value["observedAt"])):
            raise ValueError("CI audit measurement invalid")
        identity = (row["pr"], row["headSha"], row["checkId"])
        if identity in identities:
            raise ValueError("CI audit duplicate measurement")
        identities.add(identity)
    sample = value["sample"]
    counts = ("checkRunsObserved", "failuresObserved", "failuresOmitted", "targetsOmitted")
    if (not isinstance(sample, dict) or set(sample) != {*counts, "complete", "reasons"}
            or any(type(sample[k]) is not int or not 0 <= sample[k] <= MAX_SAFE_INTEGER for k in counts)
            or type(sample["complete"]) is not bool or not isinstance(sample["reasons"], list)
            or sample["reasons"] != sorted(set(sample["reasons"]))
            or any(r not in {"incomplete-observation", "head-drift"} for r in sample["reasons"])
            or sample["failuresObserved"] != len(rows) + sample["failuresOmitted"]
            or sample["checkRunsObserved"] < sample["failuresObserved"]
            or sample["complete"] != (not sample["reasons"] and sample["targetsOmitted"] == 0)):
        raise ValueError("CI audit sample invalid")
    return value
