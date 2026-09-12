#!/usr/bin/env python3
"""Finalize a fallback unit and safely compensate an orphaned Linear claim."""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
TERMINAL_SCHEMA = "symphony-fallback-terminal/v1"
FAILURE_CATEGORIES = {
    "provider_exhausted",
    "admission_failed",
    "agent_failed_no_pr",
}


def _atomic_json(path: pathlib.Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def compensation_blockers(
    expected: dict[str, object],
    observed: dict[str, object] | None,
    evidence: dict[str, bool | None],
) -> list[str]:
    if observed is None:
        return ["linear_unreachable"]
    blockers: list[str] = []
    if observed.get("id") != expected.get("issueId"):
        blockers.append("issue_identity_changed")
    if observed.get("updatedAt") != expected.get("issueRevision"):
        blockers.append("issue_revision_changed")
    expected_owner = expected.get("ownerId")
    observed_assignee = observed.get("assignee")
    observed_owner = (
        observed_assignee.get("id") if isinstance(observed_assignee, dict) else None
    )
    if observed_owner != expected_owner:
        blockers.append("owner_changed")
    claim_state = expected.get("claimState")
    observed_state = observed.get("state")
    expected_state_id = claim_state.get("id") if isinstance(claim_state, dict) else None
    observed_state_id = (
        observed_state.get("id") if isinstance(observed_state, dict) else None
    )
    if observed_state_id != expected_state_id:
        blockers.append("issue_state_changed")
    for key, active_reason, unknown_reason in (
        ("prExists", "pr_exists", "pr_unverifiable"),
        ("officialProcess", "official_process_active", "official_process_unverifiable"),
        ("fallbackProcess", "fallback_process_active", "fallback_process_unverifiable"),
        ("validLease", "valid_lease_active", "valid_lease_unverifiable"),
    ):
        value = evidence.get(key)
        if value is None:
            blockers.append(unknown_reason)
        elif value is True:
            blockers.append(active_reason)
    return blockers


def _graphql(query: str, variables: dict[str, object]) -> dict[str, object] | None:
    key = os.environ.get("LINEAR_API_KEY")
    if not key:
        return None
    request = urllib.request.Request(
        os.environ.get("LINEAR_API_URL", "https://api.linear.app/graphql"),
        data=json.dumps({"query": query, "variables": variables}).encode(),
        headers={"Authorization": key, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.load(response)
    except (OSError, TypeError, ValueError, urllib.error.URLError):
        return None
    if not isinstance(payload, dict) or payload.get("errors"):
        return None
    return payload


def _fetch_issue(issue_id: str) -> dict[str, object] | None:
    payload = _graphql(
        "query($id:String!){issue(id:$id){id identifier updatedAt state{id name} assignee{id}}}",
        {"id": issue_id},
    )
    issue = ((payload or {}).get("data") or {}).get("issue")
    return issue if isinstance(issue, dict) else None


def _update_state(issue_id: str, state_id: str) -> bool:
    payload = _graphql(
        "mutation($id:String!,$input:IssueUpdateInput!){issueUpdate(id:$id,input:$input){success}}",
        {"id": issue_id, "input": {"stateId": state_id}},
    )
    update = ((payload or {}).get("data") or {}).get("issueUpdate")
    return isinstance(update, dict) and update.get("success") is True


def _run(command: list[str]) -> subprocess.CompletedProcess[str] | None:
    try:
        return subprocess.run(
            command, check=False, capture_output=True, text=True, timeout=20
        )
    except (OSError, subprocess.TimeoutExpired):
        return None


def _pr_exists(identifier: str) -> bool | None:
    result = _run(["symphony-codex-exhausted", "open-pr-verdict", identifier])
    if result is None or result.returncode != 0:
        return None
    try:
        return json.loads(result.stdout).get("verdict") != "none"
    except (AttributeError, TypeError, ValueError):
        return None


def _official_issue_active(identifier: str) -> bool | None:
    request = urllib.request.Request(
        os.environ.get("SYMPHONY_OFFICIAL_STATE_URL", "http://127.0.0.1:4041/api/v1/state")
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            payload = json.load(response)
    except (OSError, TypeError, ValueError, urllib.error.URLError):
        return None
    if (
        not isinstance(payload, dict)
        or not isinstance(payload.get("running"), list)
        or not isinstance(payload.get("retrying"), list)
    ):
        return None
    text = json.dumps({key: payload[key] for key in ("running", "retrying")}, sort_keys=True)
    return identifier in text


def _fallback_process_active(identifier: str, own_unit: str) -> bool | None:
    result = _run(
        [
            "systemctl",
            "--user",
            "list-units",
            "--type=service",
            "--state=active,activating,deactivating",
            "--no-legend",
            "--no-pager",
        ]
    )
    if result is None or result.returncode != 0:
        return None
    for line in result.stdout.splitlines():
        unit = line.split(maxsplit=1)[0] if line.strip() else ""
        if identifier not in unit or unit == f"{own_unit}.service":
            continue
        if re.fullmatch(r"(?:fallback|grok|kimi)-ship-.+\.service", unit):
            return True
    return False


def _valid_lease(identifier: str) -> bool | None:
    lease_dir = pathlib.Path(
        os.path.expanduser(
            os.environ.get(
                "SYMPHONY_FALLBACK_LEASE_DIR",
                "~/.local/state/symphony-fallback/leases",
            )
        )
    )
    path = lease_dir / f"{identifier}.lock"
    if not path.exists():
        return False
    try:
        with path.open("a+") as handle:
            try:
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return True
            age = max(0, time.time() - path.stat().st_mtime)
            return age < 90 * 60
    except OSError:
        return None


def _mark_provider_exhausted(model_id: str, reason: str) -> bool:
    router = pathlib.Path(__file__).resolve().with_name("model-router.py")
    result = _run(
        [
            sys.executable,
            str(router),
            "mark-exhausted",
            "--model-id",
            model_id,
            "--reason",
            reason,
        ]
    )
    return result is not None and result.returncode == 0


def _load_json(path: pathlib.Path) -> dict[str, object]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, TypeError, ValueError):
        return {}
    return payload if isinstance(payload, dict) else {}


def finalize(identifier: str) -> tuple[int, dict[str, object]]:
    receipt_dir = pathlib.Path(
        os.path.expanduser(
            os.environ.get(
                "SYMPHONY_FALLBACK_RECEIPT_DIR",
                "~/.local/state/symphony-fallback/receipts",
            )
        )
    )
    launch = _load_json(receipt_dir / f"{identifier}.json")
    revision = str(
        launch.get("issueRevision")
        or os.environ.get("SYMPHONY_FALLBACK_ISSUE_REVISION", "unknown")
    )
    suffix = hashlib.sha256(revision.encode()).hexdigest()[:12]
    terminal_path = receipt_dir / f"{identifier}-{suffix}.terminal.json"
    existing = _load_json(terminal_path)
    if existing.get("terminalComplete") is True:
        return (
            0
            if existing.get("terminalCategory")
            in {"success_pr_open", "compensation_restored"}
            else 2,
            existing,
        )
    outcome = _load_json(receipt_dir / f"{identifier}-{suffix}.outcome.json")
    provider = str(launch.get("provider") or outcome.get("provider") or "unknown")
    model_id = str(launch.get("modelId") or outcome.get("modelId") or "unknown")
    pr_status = _pr_exists(identifier)
    category = str(outcome.get("category") or "admission_failed")
    if category not in FAILURE_CATEGORIES and pr_status is True:
        category = "success_pr_open"
    provider_marked = True
    if category == "provider_exhausted":
        provider_marked = _mark_provider_exhausted(model_id, "weekly_http_403")
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    observed = _fetch_issue(str(launch.get("issueId") or identifier))
    official = _official_issue_active(identifier)
    fallback = _fallback_process_active(identifier, str(launch.get("unit") or ""))
    lease = _valid_lease(identifier)
    evidence = {
        "prExists": pr_status,
        "officialProcess": official,
        "fallbackProcess": fallback,
        "validLease": lease,
    }
    expected = {
        "issueId": launch.get("issueId"),
        "issueRevision": launch.get("issueRevision"),
        "ownerId": launch.get("ownerId"),
        "claimState": launch.get("claimState"),
    }
    blockers = (
        compensation_blockers(expected, observed, evidence)
        if category in FAILURE_CATEGORIES
        else []
    )
    compensation = "not_required"
    final_issue = observed
    safe_state = launch.get("safeState")
    if category in FAILURE_CATEGORIES:
        if not provider_marked:
            blockers.append("provider_exhaustion_persist_failed")
        if not isinstance(safe_state, dict) or not safe_state.get("id"):
            blockers.append("safe_state_missing")
        if blockers:
            category = "compensation_blocked"
            compensation = "blocked"
        else:
            # Last pre-mutation read closes the evidence-to-write window as far
            # as Linear's API permits; readback is still mandatory.
            current = _fetch_issue(str(expected["issueId"]))
            blockers = compensation_blockers(expected, current, evidence)
            if blockers or not _update_state(
                str(expected["issueId"]), str(safe_state["id"])
            ):
                category = "compensation_blocked"
                compensation = "blocked"
                if not blockers:
                    blockers = ["linear_update_failed"]
            else:
                final_issue = _fetch_issue(str(expected["issueId"]))
                final_state = (final_issue or {}).get("state")
                if not isinstance(final_state, dict) or final_state.get("id") != safe_state["id"]:
                    category = "compensation_blocked"
                    compensation = "blocked"
                    blockers = ["compensation_readback_failed"]
                else:
                    category = "compensation_restored"
                    compensation = "restored"
    payload: dict[str, object] = {
        "schema": TERMINAL_SCHEMA,
        "terminalComplete": True,
        "identifier": identifier,
        "issueId": launch.get("issueId"),
        "issueRevision": launch.get("issueRevision"),
        "baseRevision": launch.get("baseRevision"),
        "bundleRevision": launch.get("bundleRevision"),
        "provider": provider,
        "model": launch.get("model"),
        "modelId": model_id,
        "unit": launch.get("unit") or os.environ.get("SYMPHONY_FALLBACK_UNIT"),
        "lease": {"active": evidence["validLease"]},
        "process": {
            "officialActive": evidence["officialProcess"],
            "fallbackActive": evidence["fallbackProcess"],
            "serviceResult": os.environ.get("SERVICE_RESULT", "unknown"),
            "exitCode": outcome.get("exitCode", os.environ.get("EXIT_STATUS")),
        },
        "timestamps": {
            "admittedAt": launch.get("admittedAt"),
            "startedAt": launch.get("startedAt"),
            "finishedAt": now,
        },
        "heartbeat": {"phase": "terminal", "observedAt": now},
        "providerOutcome": outcome.get("category", category),
        "terminalCategory": category,
        "priorState": launch.get("originalState"),
        "claimState": launch.get("claimState"),
        "finalState": (final_issue or {}).get("state") if isinstance(final_issue, dict) else None,
        "compensation": {
            "decision": compensation,
            "reasons": blockers,
            "expected": expected,
            "observed": observed,
        },
        "pr": {"exists": pr_status},
    }
    _atomic_json(terminal_path, payload)
    print(json.dumps(payload, sort_keys=True))
    return (0 if category in {"success_pr_open", "compensation_restored"} else 2), payload


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("identifier")
    args = parser.parse_args()
    return finalize(args.identifier)[0]


if __name__ == "__main__":
    raise SystemExit(main())
