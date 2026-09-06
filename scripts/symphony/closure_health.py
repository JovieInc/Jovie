#!/usr/bin/env python3
"""Summer-owned closed-loop PR health observer.

Invariant consumer: JOV-INV-011.

This extends the existing fleet gate; it is not another controller or writer.
Summer classifies every open PR and may stop only *new* implementation intake.
Gem remains the sole native-queue/promotion writer, and remediation continues
while the stop-line is active.
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import time
from concurrent.futures import Future, ThreadPoolExecutor, wait
from datetime import datetime, timedelta, timezone
from typing import Any


SCHEMA = "jovie-closure-health/v1"
AUTHORITY = "Summer"
CONTROLLER_RED_AFTER = timedelta(minutes=10)
EMPTY_QUEUE_RED_AFTER = timedelta(minutes=15)
UNCLASSIFIED_RED_AFTER = timedelta(minutes=15)
# Merge-queue group rebuilds transiently mark entries UNMERGEABLE; only a
# persistent entry past this threshold is real.
UNMERGEABLE_QUEUE_RED_AFTER = timedelta(minutes=15)
NO_MERGE_PROGRESS_AFTER = timedelta(hours=1)
HOLD_EXPIRY = timedelta(days=7)
STACK_MAX_DEPTH = 4  # JOV-INV-020
STACK_DEADLINE_MAX = timedelta(days=7)
STACK_ROOT_BASE = "main"
STACK_REPAIR_ACTION = "split-or-retarget-draft-stack"
LIFECYCLE_ACTION_SCHEMA = "jovie-pr-lifecycle-action/v1"
PROTECTED_PR_EXCLUSIONS = frozenset({17156})
LIFECYCLE_MACHINE_OWNERS = frozenset(
    {"controller", "gem", "github-native-merge-queue", "symphony"}
)
UTC = timezone.utc


def empty_stack_health() -> dict[str, Any]:
    """Bounded empty JOV-INV-020 stack contract for fail-closed receipts."""
    return {
        "maxDepth": STACK_MAX_DEPTH,
        "roots": [],
        "violations": [],
        "repairActions": [],
    }


def bounded_stack_health(value: object) -> dict[str, Any]:
    """Keep stack diagnostics persistable even when observation is incomplete."""
    empty = empty_stack_health()
    if not isinstance(value, dict):
        return empty
    max_depth = value.get("maxDepth")
    roots = value.get("roots")
    violations = value.get("violations")
    repair_actions = value.get("repairActions")
    return {
        "maxDepth": (
            max_depth
            if isinstance(max_depth, int)
            and not isinstance(max_depth, bool)
            and max_depth > 0
            else STACK_MAX_DEPTH
        ),
        "roots": roots if isinstance(roots, list) else [],
        "violations": violations if isinstance(violations, list) else [],
        "repairActions": repair_actions if isinstance(repair_actions, list) else [],
    }
ISSUE_REFERENCE = re.compile(r"\b(?:JOV|LYB)-\d+\b", re.IGNORECASE)
EXPLICIT_ISSUE_MARKER = re.compile(
    r"<!--\s*linear-issue-(?:id|identifier)\s*:\s*((?:JOV|LYB)-\d+)\s*-->",
    re.IGNORECASE,
)
HOLD_LABELS = {"hold", "gated", "queue-deferred"}
CLOSE_LABELS = {"duplicate"}
ACTIVE_WRITER_STATES = frozenset({"repair", "promote", "queued"})
CHANGED_FILES_PAGE = 100
EVIDENCE_STATUSES = frozenset({"complete", "missing", "malformed", "truncated"})
GIT_OID = re.compile(r"^[0-9a-f]{40}$")
# Mirrors the required contexts in .github/rulesets/branch-protection.yml. Live
# `gh pr checks --required` output must match this complete set before a PR can
# be classified as promotable; drift fails closed instead of silently dropping
# a newly required check.
EXPECTED_REQUIRED_CHECKS = frozenset(
    {"Fork PR Gate", "Migration Guard", "PR Ready", "PR Size Guard"}
)
CHECKABLE_MERGE_STATES = frozenset({"CLEAN", "HAS_HOOKS", "UNSTABLE"})
ACCEPTED_CHECK_RUN_CONCLUSIONS = frozenset({"NEUTRAL", "SKIPPED", "SUCCESS"})
SNAPSHOT_ATTEMPTS = 3
CLOSURE_OBSERVATION_SECONDS = 120
PROMOTION_COMMAND_TIMEOUT_SECONDS = 12
PROMOTION_EVIDENCE_PHASE_SECONDS = 30
PROMOTION_EVIDENCE_WORKERS = 8
PROMOTION_READBACK_BATCH = 4
PROMOTION_READBACK_WORKERS = 4
REQUIRED_CHECK_SUITE_PAGE = 50
REQUIRED_CHECK_RUN_PAGE = 5
COMPLETE_CHANGED_FILE_TYPES = frozenset(
    {"ADDED", "CHANGED", "COPIED", "DELETED", "MODIFIED"}
)
STACK_INTEGRATOR_MARKER = re.compile(
    r"<!--\s*stack-integrator\s*:\s*@?([A-Za-z0-9][A-Za-z0-9-]{0,38})\s*-->",
    re.IGNORECASE,
)
STACK_DEADLINE_MARKER = re.compile(
    r"<!--\s*stack-deadline\s*:\s*([^\s<]+)\s*-->", re.IGNORECASE
)
STACK_HEAD_SHA = re.compile(r"^[0-9a-f]{40}$", re.IGNORECASE)
REPOSITORY_NAME = re.compile(r"^[^/\s]+/[^/\s]+$")
# JOV-INV-020 native-stack evidence for the duplicate-lane detector (JOV-INV-011):
# same-issue active writers that verifiably stack are one lane, not duplicates.
STACK_CONTRACT_HEADING = re.compile(r"\bstack\s+contract\b", re.IGNORECASE)
STACK_LAYER_DECLARATION = re.compile(
    r"\blayer\s+\d+\s*(?:\bof\b|/)\s*\d+\b", re.IGNORECASE
)
STACK_PARENT_DECLARATION = re.compile(
    r"\b(?:immediate\s+parent|parent\s+pr|parent|extends|stacked\s+on|based\s+on"
    r"|builds\s+on|depends\s+on|supersedes)\b\s*:?\s*#(\d{1,9})\b",
    re.IGNORECASE,
)
STACK_NUMBERED_TITLE = re.compile(r"(?<![\d/.])(\d{1,2})\s*/\s*(\d{1,2})(?![\d/])")


def isoformat(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def parse_time(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)
    except (ValueError, OverflowError):
        return None


def _labels(pr: dict[str, Any]) -> set[str]:
    value = pr.get("labels")
    nodes = value.get("nodes", []) if isinstance(value, dict) else value or []
    return {
        str(node.get("name") if isinstance(node, dict) else node).strip()
        for node in nodes
        if str(node.get("name") if isinstance(node, dict) else node).strip()
    }


def _label_evidence(pr: dict[str, Any]) -> dict[str, Any]:
    """Prove lifecycle labels were read completely before classifying a PR."""
    value = pr.get("labels")
    if isinstance(value, dict):
        nodes = value.get("nodes")
        total_count = _non_negative_int(value.get("totalCount"))
    else:
        return {"status": "missing"}
    if not isinstance(nodes, list) or total_count is None:
        return {"status": "malformed"}
    if not all(
        isinstance(node, (str, dict))
        and isinstance(node if isinstance(node, str) else node.get("name"), str)
        and bool((node if isinstance(node, str) else node.get("name")).strip())
        for node in nodes
    ):
        return {"status": "malformed"}
    normalized = [
        (node if isinstance(node, str) else str(node["name"])).strip()
        for node in nodes
    ]
    if len(normalized) != len(set(normalized)):
        return {"status": "malformed"}
    if len(nodes) < total_count:
        return {
            "status": "truncated",
            "observedCount": len(nodes),
            "expectedCount": total_count,
        }
    if len(nodes) > total_count:
        return {"status": "malformed"}
    return {"status": "complete"}


def _author(pr: dict[str, Any]) -> str | None:
    value = pr.get("author")
    login = value.get("login") if isinstance(value, dict) else None
    return login if isinstance(login, str) and login.strip() else None


def _issue_references(pr: dict[str, Any]) -> list[str]:
    # Linear is the source of record. A canonical body marker can replace a
    # stale parent identifier embedded in a legacy branch/title. Ordinary body
    # prose still commonly names dependencies and must never become identity.
    body = pr.get("body")
    explicit = (
        sorted({match.upper() for match in EXPLICIT_ISSUE_MARKER.findall(body)})
        if isinstance(body, str)
        else []
    )
    if explicit:
        return explicit
    text = f"{pr.get('headRefName') or ''} {pr.get('title') or ''}"
    return sorted({match.upper() for match in ISSUE_REFERENCE.findall(text)})


def _non_negative_int(value: object) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        return None
    return value


def _changed_file_evidence(pr: dict[str, Any]) -> dict[str, Any]:
    """Classify GitHub changed-file evidence. Truncation fails closed."""
    files = pr.get("files")
    changed_files = pr.get("changedFiles")
    if files is None:
        return {"status": "missing"}
    if not isinstance(files, dict):
        return {"status": "malformed"}
    nodes = files.get("nodes")
    if not isinstance(nodes, list):
        return {"status": "malformed"}
    paths: list[str] = []
    seen: set[str] = set()
    for node in nodes:
        if not isinstance(node, dict):
            return {"status": "malformed"}
        path = node.get("path")
        change_type = node.get("changeType")
        if not isinstance(path, str) or not path.strip():
            return {"status": "malformed"}
        if change_type not in COMPLETE_CHANGED_FILE_TYPES:
            return {"status": "malformed"}
        normalized = path.strip()
        if normalized in seen:
            return {"status": "malformed"}
        seen.add(normalized)
        paths.append(normalized)
    total_count = files.get("totalCount")
    parsed_total = _non_negative_int(total_count)
    parsed_changed = _non_negative_int(changed_files)
    if parsed_total is None or parsed_changed is None:
        return {"status": "malformed"}
    if parsed_total != parsed_changed:
        return {"status": "malformed"}
    observed = len(paths)
    expected = parsed_total
    if expected > observed:
        return {
            "status": "truncated",
            "observedCount": observed,
            "expectedCount": expected,
        }
    if expected < observed:
        return {"status": "malformed"}
    return {"status": "complete", "files": sorted(paths)}


def _changed_file_record(number: int, pr: dict[str, Any]) -> dict[str, Any]:
    evidence = _changed_file_evidence(pr)
    record: dict[str, Any] = {"number": number, "status": evidence["status"]}
    if evidence["status"] == "complete":
        record["files"] = evidence["files"]
    if "observedCount" in evidence:
        record["observedCount"] = evidence["observedCount"]
    if "expectedCount" in evidence:
        record["expectedCount"] = evidence["expectedCount"]
    return record


def _stack_deadline(value: str) -> datetime | None:
    parsed = parse_time(value)
    if parsed is not None:
        return parsed
    try:
        return datetime.fromisoformat(f"{value}T00:00:00+00:00").astimezone(UTC)
    except (ValueError, OverflowError):
        return None


def _stack_metadata(pr: dict[str, Any]) -> dict[str, Any]:
    body = pr.get("body") if isinstance(pr.get("body"), str) else ""
    integrators = STACK_INTEGRATOR_MARKER.findall(body)
    deadlines = STACK_DEADLINE_MARKER.findall(body)
    integrator_status = "valid" if len(integrators) == 1 else "missing" if not integrators else "malformed"
    deadline = _stack_deadline(deadlines[0]) if len(deadlines) == 1 else None
    deadline_status = "valid" if deadline is not None else "missing" if not deadlines else "malformed"
    return {
        "integrator": integrators[0] if integrator_status == "valid" else None,
        "integratorStatus": integrator_status,
        "deadline": isoformat(deadline) if deadline is not None else None,
        "deadlineAt": deadline,
        "deadlineStatus": deadline_status,
    }


def _stack_head_sha(pr: dict[str, Any]) -> str | None:
    value = pr.get("headRefOid")
    return value.lower() if isinstance(value, str) and STACK_HEAD_SHA.fullmatch(value) else None


def _stack_path(numbers: list[int], prs_by_number: dict[int, dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {"pr": number, "base": prs_by_number[number].get("baseRefName"), "head": prs_by_number[number].get("headRefName")}
        for number in numbers
    ]


def _stack_action(
    repository: str,
    root: dict[str, Any],
    members: list[int],
    longest_path: list[int],
    violations: list[str],
    metadata: dict[str, Any],
    prs_by_number: dict[int, dict[str, Any]],
    issue: str | None,
    max_depth: int,
) -> dict[str, Any] | None:
    root_number = int(root["number"])
    head_by_number = {number: _stack_head_sha(prs_by_number[number]) for number in members}
    if any(head_sha is None for head_sha in head_by_number.values()):
        return None
    member_heads = [{"pr": number, "headSha": head_by_number[number]} for number in members]
    promotion_path = [
        {
            "pr": number,
            "base": prs_by_number[number].get("baseRefName"),
            "head": prs_by_number[number].get("headRefName"),
            "headSha": head_by_number[number],
        }
        for number in longest_path
    ]
    root_head_sha = head_by_number[root_number]
    fingerprint = {
        "repository": repository,
        "rootPr": root_number,
        "prNumbers": members,
        "memberHeads": member_heads,
        "promotionPath": promotion_path,
        "integrator": metadata["integrator"],
        "deadline": metadata["deadline"],
        "issue": issue,
        "violations": violations,
    }
    task_key = hashlib.sha256(
        json.dumps(fingerprint, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return {
        "schema": "jovie-stack-health-action/v1",
        "repository": repository,
        "taskKey": task_key,
        "deliveryKey": f"closure-stack:{task_key}",
        "action": STACK_REPAIR_ACTION,
        "owner": "symphony",
        "writer": "symphony",
        "issue": issue,
        "rootPr": root_number,
        "rootHeadSha": root_head_sha,
        "prNumbers": members,
        "memberHeads": member_heads,
        "maxDepth": max_depth,
        "promotionPath": promotion_path,
        "integrator": metadata["integrator"],
        "deadline": metadata["deadline"],
        "violations": violations,
        "safety": "receipt-only; requalify exact heads before split-or-retarget",
    }


def _draft_stack_health(
    repository: str,
    prs: list[dict[str, Any]],
    prs_by_number: dict[int, dict[str, Any]],
    now: datetime,
) -> dict[str, Any]:
    """Build bounded open-PR stack diagnostics and one action per bad root."""
    internal = {
        int(pr["number"]): pr
        for pr in prs
        if (
            isinstance(pr.get("number"), int)
            and not isinstance(pr.get("number"), bool)
            and pr["number"] > 0
            and pr.get("isCrossRepository") is False
        )
    }
    heads: dict[str, list[int]] = {}
    for number, pr in internal.items():
        head = pr.get("headRefName")
        if isinstance(head, str) and head:
            heads.setdefault(head, []).append(number)
    parents: dict[int, int] = {}
    parent_errors: dict[int, set[str]] = {}
    children: dict[int, list[int]] = {}
    for number, pr in internal.items():
        base = pr.get("baseRefName")
        if not isinstance(base, str) or not base:
            parent_errors[number] = {"missing-stack-base"}
            continue
        if base == STACK_ROOT_BASE:
            continue
        candidates = sorted(heads.get(base, []))
        if len(candidates) == 1:
            parents[number] = candidates[0]
            children.setdefault(candidates[0], []).append(number)
        elif len(candidates) == 0:
            parent_errors[number] = {"orphaned-stack-base"}
        else:
            parent_errors[number] = {"ambiguous-stack-parent"}
    memo: dict[int, tuple[str, list[int], set[str]]] = {}

    def resolve(number: int, trail: tuple[int, ...] = ()) -> tuple[str, list[int], set[str]]:
        if number in memo:
            return memo[number]
        if number in trail:
            cycle = list(trail[trail.index(number) :])
            anchor = cycle.index(min(cycle))
            cycle = cycle[anchor:] + cycle[:anchor]
            key = f"cycle:{min(cycle)}"
            result = (key, cycle, {"cyclic-promotion-path"})
            return result
        if number in parent_errors:
            base = internal[number].get("baseRefName")
            key = f"broken:{base or number}"
            result = (key, [number], set(parent_errors[number]))
            memo[number] = result
            return result
        parent = parents.get(number)
        if parent is None:
            result = (str(number), [number], set())
            memo[number] = result
            return result
        key, path, errors = resolve(parent, trail + (number,))
        result = (key, path if number in path else path + [number], set(errors))
        memo[number] = result
        return result
    groups: dict[str, dict[str, Any]] = {}
    for number in sorted(internal):
        key, path, errors = resolve(number)
        group = groups.setdefault(
            key,
            {"members": set(), "paths": [], "violations": set()},
        )
        group["members"].update(path)
        group["paths"].append(path)
        group["violations"].update(errors)
    roots: list[dict[str, Any]] = []
    actions: list[dict[str, Any]] = []
    for group in groups.values():
        members = sorted(group["members"])
        if not members or not any(
            internal[number].get("isDraft") is True for number in members
        ):
            continue
        root_candidates = [
            number
            for number in members
            if internal[number].get("baseRefName") == STACK_ROOT_BASE
        ]
        root_number = min(root_candidates or members)
        root = internal[root_number]
        metadata = _stack_metadata(root)
        has_stack_marker = metadata["integratorStatus"] != "missing" or metadata[
            "deadlineStatus"
        ] != "missing"
        if len(members) == 1 and not has_stack_marker and not group["violations"]:
            continue
        paths = sorted(
            {tuple(path) for path in group["paths"]},
            key=lambda path: (-len(path), path),
        )
        longest_path = list(paths[0]) if paths else [root_number]
        violations = set(group["violations"])
        max_depth = max((len(path) for path in paths), default=1)
        if max_depth > STACK_MAX_DEPTH:
            violations.add("stack-depth-over-4")
        if any(len(children.get(number, [])) > 1 for number in members):
            violations.add("ambiguous-promotion-path")
        if len(members) > 1 and not any(len(path) > 1 for path in paths):
            violations.add("missing-promotion-path")
        if any(
            internal[number].get("mergeStateStatus") != "CLEAN" for number in members
        ):
            violations.add("non-clean-stack-ancestor")
        if metadata["integratorStatus"] != "valid":
            violations.add({"missing": "missing-stack-integrator"}.get(metadata["integratorStatus"], "malformed-stack-integrator"))
        root_created = parse_time(root.get("createdAt"))
        deadline_at = metadata["deadlineAt"]
        if metadata["deadlineStatus"] != "valid":
            violations.add({"missing": "missing-stack-deadline"}.get(metadata["deadlineStatus"], "malformed-stack-deadline"))
        elif root_created is None:
            violations.add("missing-stack-root-created-at")
        elif deadline_at <= now:
            violations.add("expired-stack-deadline")
        elif deadline_at - root_created > STACK_DEADLINE_MAX:
            violations.add("stack-deadline-over-7d")
        elif deadline_at <= root_created:
            violations.add("stack-deadline-before-root")
        sorted_violations = sorted(violations)
        root_issue_refs = _issue_references(root)
        issue = root_issue_refs[0] if len(root_issue_refs) == 1 else None
        diagnostic = {
            "rootPr": root_number,
            "prNumbers": members,
            "maxDepth": max_depth,
            "violations": sorted_violations,
            "promotionPath": _stack_path(longest_path, internal),
        }
        roots.append(diagnostic)
        if sorted_violations:
            action = (
                _stack_action(
                    repository,
                    root,
                    members,
                    longest_path,
                    sorted_violations,
                    metadata,
                    internal,
                    issue,
                    max_depth,
                )
            )
            if action is not None:
                actions.append(action)
    return {
        "maxDepth": STACK_MAX_DEPTH,
        "roots": sorted(roots, key=lambda item: item["rootPr"]),
        "violations": [
            {
                "rootPr": item["rootPr"],
                "prNumbers": item["prNumbers"],
                "codes": item["violations"],
            }
            for item in sorted(roots, key=lambda value: value["rootPr"])
            if item["violations"]
        ],
        "repairActions": sorted(actions, key=lambda item: item["rootPr"]),
    }
def _valid_oid(value: object) -> bool:
    return isinstance(value, str) and GIT_OID.fullmatch(value) is not None


def _remaining_timeout(deadline: float, cap_seconds: float) -> float:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError("closure observation deadline exceeded")
    return max(0.1, min(cap_seconds, remaining))


def _run_json_command(
    command: list[str],
    *,
    deadline: float,
    timeout_cap: float = PROMOTION_COMMAND_TIMEOUT_SECONDS,
    allowed_returncodes: frozenset[int] = frozenset({0}),
    run_impl: Any = subprocess.run,
) -> Any:
    completed = run_impl(
        command,
        check=False,
        capture_output=True,
        text=True,
        timeout=_remaining_timeout(deadline, timeout_cap),
    )
    if completed.returncode not in allowed_returncodes:
        stderr = completed.stderr.strip() if isinstance(completed.stderr, str) else ""
        detail = stderr.splitlines()[-1][:240] if stderr else f"exit {completed.returncode}"
        raise ValueError(f"GitHub promotion evidence command failed: {detail}")
    return json.loads(completed.stdout)


def _needs_promotion_evidence(pr: dict[str, Any]) -> bool:
    if _label_evidence(pr).get("status") != "complete":
        return False
    labels = _labels(pr)
    return bool(
        pr.get("mergeStateStatus") in CHECKABLE_MERGE_STATES
        and pr.get("baseRefName") == "main"
        and not pr.get("isDraft")
        and not pr.get("isCrossRepository")
        and not pr.get("mergeQueueEntry")
        and not labels.intersection(HOLD_LABELS | CLOSE_LABELS)
    )


def _observe_live_required_checks(
    repo: str, deadline: float, *, run_impl: Any = subprocess.run
) -> frozenset[str]:
    payload = _run_json_command(
        ["gh", "api", f"repos/{repo}/rules/branches/main"],
        deadline=deadline,
        run_impl=run_impl,
    )
    if not isinstance(payload, list):
        raise ValueError("GitHub evaluated main rules are malformed")
    matches = [
        rule
        for rule in payload
        if isinstance(rule, dict) and rule.get("type") == "required_status_checks"
    ]
    if not matches:
        raise ValueError("GitHub evaluated main rules omit required checks")
    contexts: list[Any] = []
    for rule in matches:
        parameters = rule.get("parameters")
        required = (
            parameters.get("required_status_checks")
            if isinstance(parameters, dict)
            else None
        )
        if not isinstance(required, list):
            raise ValueError("GitHub evaluated required checks are malformed")
        contexts.extend(required)
    names = [
        context.get("context") if isinstance(context, dict) else None
        for context in contexts
    ]
    if not names or not all(isinstance(name, str) and name for name in names):
        raise ValueError("GitHub required-check contexts are malformed")
    return frozenset(names)


def _observe_one_comparison(
    repo: str,
    pr: dict[str, Any],
    current_base_oid: str,
    deadline: float,
    *,
    run_impl: Any = subprocess.run,
) -> dict[str, Any]:
    """Prove base freshness for one exact-head, required-check-green candidate."""
    number = pr.get("number")
    head_oid = pr.get("headRefOid")
    if (
        isinstance(number, bool)
        or not isinstance(number, int)
        or number <= 0
        or not _valid_oid(head_oid)
        or not _valid_oid(current_base_oid)
    ):
        return {"status": "malformed"}

    try:
        comparison = _run_json_command(
            [
                "gh",
                "api",
                f"repos/{repo}/compare/{current_base_oid}...{head_oid}",
            ],
            deadline=deadline,
            run_impl=run_impl,
        )
    except (OSError, subprocess.SubprocessError, ValueError, json.JSONDecodeError):
        return {"status": "error", "headOid": head_oid, "baseOid": current_base_oid}

    if not isinstance(comparison, dict):
        return {"status": "malformed", "headOid": head_oid, "baseOid": current_base_oid}

    behind_by = _non_negative_int(comparison.get("behind_by"))
    ahead_by = _non_negative_int(comparison.get("ahead_by"))
    base_commit = comparison.get("base_commit")
    comparison_base = base_commit.get("sha") if isinstance(base_commit, dict) else None
    comparison_status = comparison.get("status")
    if (
        behind_by is None
        or ahead_by is None
        or comparison_base != current_base_oid
        or not isinstance(comparison_status, str)
        or not comparison_status
    ):
        return {"status": "malformed", "headOid": head_oid, "baseOid": current_base_oid}

    return {
        "status": "complete",
        "headOid": head_oid,
        "baseOid": current_base_oid,
        "comparisonStatus": comparison_status,
        "aheadBy": ahead_by,
        "behindBy": behind_by,
    }


def _complete_connection(value: object, label: str) -> list[dict[str, Any]]:
    if not isinstance(value, dict):
        raise ValueError(f"GitHub {label} connection is missing")
    total = _non_negative_int(value.get("totalCount"))
    nodes = value.get("nodes")
    if total is None or not isinstance(nodes, list) or total != len(nodes):
        raise ValueError(f"GitHub {label} connection is incomplete")
    if not all(isinstance(node, dict) for node in nodes):
        raise ValueError(f"GitHub {label} connection is malformed")
    return nodes


def _required_check_fields(required_names: frozenset[str]) -> str:
    legacy = " ".join(
        f"legacy_{index}:context(name:{json.dumps(name)})"
        "{context state createdAt}"
        for index, name in enumerate(sorted(required_names))
    )
    runs = " ".join(
        f"runs_{index}:checkRuns(first:{REQUIRED_CHECK_RUN_PAGE},filterBy:"
        f"{{checkName:{json.dumps(name)}}})"
        "{totalCount nodes{databaseId name status conclusion}}"
        for index, name in enumerate(sorted(required_names))
    )
    suites = (
        f"requiredSuites:checkSuites(first:{REQUIRED_CHECK_SUITE_PAGE})"
        f"{{totalCount nodes{{app{{id slug}} {runs}}}}}"
    )
    return f"status{{{legacy}}} {suites}"


def _normalize_named_required_checks(
    commit: dict[str, Any], required_names: frozenset[str]
) -> list[dict[str, Any]]:
    status = commit.get("status")
    if status is not None and not isinstance(status, dict):
        raise ValueError("GitHub exact status evidence is malformed")
    suites = _complete_connection(
        commit.get("requiredSuites"), "required-check suites"
    )
    checks: list[dict[str, Any]] = []
    for index, name in enumerate(sorted(required_names)):
        evidence_by_producer: dict[str, list[tuple[int, dict[str, Any]]]] = {}
        legacy = status.get(f"legacy_{index}") if isinstance(status, dict) else None
        if legacy is not None:
            if (
                not isinstance(legacy, dict)
                or legacy.get("context") != name
                or parse_time(legacy.get("createdAt")) is None
            ):
                raise ValueError("GitHub exact legacy status is malformed")
            evidence_by_producer["legacy-status"] = [
                (
                    0,
                    {"name": name, "kind": "status-context", "state": legacy.get("state")},
                )
            ]
        for suite in suites:
            runs = _complete_connection(suite.get(f"runs_{index}"), f"{name} check runs")
            if not runs:
                continue
            app = suite.get("app")
            app_id = app.get("id") if isinstance(app, dict) else None
            app_slug = app.get("slug") if isinstance(app, dict) else None
            if (
                not isinstance(app_id, str)
                or not app_id
                or not isinstance(app_slug, str)
                or not app_slug
            ):
                raise ValueError("GitHub exact check suite identity is malformed")
            for run in runs:
                database_id = _non_negative_int(run.get("databaseId"))
                if run.get("name") != name or database_id is None:
                    raise ValueError("GitHub exact check name is malformed")
                evidence_by_producer.setdefault(f"check-app:{app_id}", []).append(
                    (
                        database_id,
                        {
                            "name": name,
                            "kind": "check-run",
                            "producer": app_slug,
                            "status": run.get("status"),
                            "conclusion": run.get("conclusion"),
                        },
                    )
                )
        if not evidence_by_producer:
            continue
        sources: list[dict[str, Any]] = []
        for producer, evidence in sorted(evidence_by_producer.items()):
            newest_id = max(item[0] for item in evidence)
            latest = [item[1] for item in evidence if item[0] == newest_id]
            if len(latest) != 1:
                raise ValueError("GitHub exact required-check evidence is ambiguous")
            sources.append({"producer": producer, **latest[0]})
        checks.append({"name": name, "kind": "required-check", "sources": sources})
    return checks


def _readback_promotion_batch(
    repo: str,
    candidates: list[dict[str, Any]],
    required_names: frozenset[str],
    deadline: float,
    *,
    run_impl: Any = subprocess.run,
) -> dict[str, Any]:
    owner, name = _repo_parts(repo)
    pr_fields = " ".join(
        f"pr_{int(pr['number'])}:pullRequest(number:{int(pr['number'])}){{"
        "state headRefOid baseRefName isDraft isCrossRepository mergeStateStatus "
        "updatedAt author{login} labels(first:100){totalCount nodes{name}} "
        "mergeQueueEntry{position enqueuedAt state}}"
        for pr in candidates
    )
    check_fields = _required_check_fields(required_names)
    commit_fields = " ".join(
        f'commit_{int(pr["number"])}:object(oid:"{pr["headRefOid"]}"){{'
        f"... on Commit{{oid {check_fields}}}}}"
        for pr in candidates
    )
    query = (
        "query($owner:String!,$name:String!){repository(owner:$owner,name:$name){"
        'base:ref(qualifiedName:"refs/heads/main"){target{oid}} '
        f"{pr_fields} {commit_fields}}}}}"
    )
    payload = _run_json_command(
        [
            "gh",
            "api",
            "graphql",
            "-f",
            f"query={query}",
            "-F",
            f"owner={owner}",
            "-F",
            f"name={name}",
        ],
        deadline=deadline,
        run_impl=run_impl,
    )
    repository = (
        payload.get("data", {}).get("repository")
        if isinstance(payload, dict)
        else None
    )
    if not isinstance(repository, dict):
        raise ValueError("GitHub promotion readback omitted repository")
    base = repository.get("base")
    target = base.get("target") if isinstance(base, dict) else None
    base_oid = target.get("oid") if isinstance(target, dict) else None
    if not _valid_oid(base_oid):
        raise ValueError("GitHub promotion readback omitted main OID")
    prs: dict[int, dict[str, Any]] = {}
    for candidate in candidates:
        number = int(candidate["number"])
        pr = repository.get(f"pr_{number}")
        commit = repository.get(f"commit_{number}")
        if not isinstance(pr, dict) or not isinstance(commit, dict):
            raise ValueError("GitHub promotion readback omitted pull request")
        if commit.get("oid") != candidate.get("headRefOid"):
            raise ValueError("GitHub promotion readback returned the wrong commit")
        try:
            required_checks = _normalize_named_required_checks(commit, required_names)
            check_evidence_status = "complete"
        except ValueError:
            required_checks = []
            check_evidence_status = "malformed"
        prs[number] = {
            **pr,
            "headOid": pr.get("headRefOid"),
            "checkEvidenceStatus": check_evidence_status,
            "requiredChecks": required_checks,
        }
    return {"baseOid": base_oid, "prs": prs}


def _readback_promotion_state(
    repo: str,
    candidates: list[dict[str, Any]],
    required_names: frozenset[str],
    deadline: float,
    *,
    run_impl: Any = subprocess.run,
) -> dict[str, Any]:
    """Bound GraphQL cost while requiring one main identity across all batches."""
    if not candidates:
        raise ValueError("GitHub promotion readback requires candidates")
    batches = [
        candidates[offset : offset + PROMOTION_READBACK_BATCH]
        for offset in range(0, len(candidates), PROMOTION_READBACK_BATCH)
    ]
    executor = ThreadPoolExecutor(
        max_workers=min(PROMOTION_READBACK_WORKERS, len(batches))
    )
    futures = [
        executor.submit(
            _readback_promotion_batch,
            repo,
            batch,
            required_names,
            deadline,
            run_impl=run_impl,
        )
        for batch in batches
    ]
    completed: set[Future[dict[str, Any]]] = set()
    pending: set[Future[dict[str, Any]]] = set()
    try:
        completed, pending = wait(
            futures,
            timeout=_remaining_timeout(deadline, PROMOTION_EVIDENCE_PHASE_SECONDS),
        )
        if pending:
            raise TimeoutError("GitHub promotion readback deadline exceeded")
        readbacks = [future.result() for future in futures]
    finally:
        for future in pending:
            future.cancel()
        executor.shutdown(wait=False, cancel_futures=True)
    base_oid: str | None = None
    prs: dict[int, dict[str, Any]] = {}
    for readback in readbacks:
        observed_base = readback.get("baseOid")
        if base_oid is None:
            base_oid = observed_base
        elif observed_base != base_oid:
            raise ValueError("GitHub main changed across promotion batches")
        observed_prs = readback.get("prs")
        if not isinstance(observed_prs, dict):
            raise ValueError("GitHub promotion batch omitted pull requests")
        prs.update(observed_prs)
    if not _valid_oid(base_oid) or len(prs) != len(candidates):
        raise ValueError("GitHub promotion batches are incomplete")
    return {"baseOid": base_oid, "prs": prs}


def _required_checks_green(evidence: dict[str, Any]) -> bool:
    checks = evidence.get("requiredChecks")
    if not isinstance(checks, list):
        return False
    observed_names = [
        check.get("name") for check in checks if isinstance(check, dict)
    ]
    required_names = evidence.get("requiredCheckNames")
    if (
        not isinstance(required_names, list)
        or set(observed_names) != set(required_names)
        or len(observed_names) != len(set(observed_names))
    ):
        return False
    return all(
        check.get("kind") == "required-check"
        and isinstance(check.get("sources"), list)
        and bool(check["sources"])
        and all(
            (
                source.get("kind") == "check-run"
                and source.get("status") == "COMPLETED"
                and source.get("conclusion") in ACCEPTED_CHECK_RUN_CONCLUSIONS
            )
            or (
                source.get("kind") == "status-context"
                and source.get("state") == "SUCCESS"
            )
            for source in check["sources"]
            if isinstance(source, dict)
        )
        and all(isinstance(source, dict) for source in check["sources"])
        for check in checks
        if isinstance(check, dict)
    )


def _native_stack_declaration(pr: dict[str, Any]) -> bool:
    """JOV-INV-020: the PR itself declares membership in a native stack."""
    body = pr.get("body") if isinstance(pr.get("body"), str) else ""
    title = pr.get("title") if isinstance(pr.get("title"), str) else ""
    if STACK_CONTRACT_HEADING.search(body):
        return True
    if STACK_INTEGRATOR_MARKER.search(body) or STACK_DEADLINE_MARKER.search(body):
        return True
    if STACK_LAYER_DECLARATION.search(body):
        return True
    match = STACK_NUMBERED_TITLE.search(title)
    if match:
        part, whole = int(match.group(1)), int(match.group(2))
        return whole >= 2 and 1 <= part <= whole
    return False


def _native_stack_components(
    numbers: list[int],
    prs_by_number: dict[int, dict[str, Any]],
    complete: dict[int, frozenset[str]],
) -> dict[int, int]:
    """Union same-issue PRs linked by positive JOV-INV-020 stack evidence.

    Returns number -> component root. A singleton component means the PR has no
    stack evidence and stays subject to duplicate-lane flagging (fail closed).
    Evidence: an immediate-parent declaration naming a lane member, a branch
    chain (base is a member's head), shared stack membership declarations, or
    cumulative nesting (one changed-file set strictly contains the other).
    """
    parent: dict[int, int] = {number: number for number in numbers}

    def find(number: int) -> int:
        while parent[number] != number:
            parent[number] = parent[parent[number]]
            number = parent[number]
        return number

    def union(left: int, right: int) -> None:
        parent[find(left)] = find(right)

    members = {number: prs_by_number.get(number) for number in numbers}
    heads: dict[str, int] = {}
    for number in numbers:
        pr = members[number]
        head = pr.get("headRefName") if isinstance(pr, dict) else None
        if isinstance(head, str) and head:
            heads.setdefault(head, number)
    for number in numbers:
        pr = members[number]
        if not isinstance(pr, dict):
            continue
        base = pr.get("baseRefName")
        if (
            isinstance(base, str)
            and base != STACK_ROOT_BASE
            and base in heads
            and heads[base] != number
        ):
            union(number, heads[base])
        body = pr.get("body") if isinstance(pr.get("body"), str) else ""
        for declared in STACK_PARENT_DECLARATION.findall(body):
            declared_number = int(declared)
            if declared_number in members and declared_number != number:
                union(number, declared_number)
    declared = [
        number
        for number in numbers
        if isinstance(members[number], dict)
        and _native_stack_declaration(members[number])
    ]
    if len(declared) >= 2:
        for number in declared[1:]:
            union(declared[0], number)
    for index, left in enumerate(numbers):
        for right in numbers[index + 1 :]:
            left_files = complete.get(left)
            right_files = complete.get(right)
            if left_files is None or right_files is None:
                continue
            if left_files < right_files or right_files < left_files:
                union(left, right)
    return {number: find(number) for number in numbers}



def observe_promotion_evidence(
    repo: str,
    prs: list[dict[str, Any]],
    current_base_oid: str,
    deadline: float | None = None,
    *,
    run_impl: Any = subprocess.run,
) -> list[dict[str, Any]]:
    """Attach exact-head, live-policy evidence to every checkable candidate."""
    observation_deadline = deadline or time.monotonic() + CLOSURE_OBSERVATION_SECONDS
    observed: list[dict[str, Any]] = []
    candidates: list[dict[str, Any]] = []
    for pr in prs:
        enriched = dict(pr)
        if enriched.get("baseRefName") == "main":
            enriched["currentBaseOid"] = current_base_oid
        if _needs_promotion_evidence(enriched):
            candidates.append(enriched)
        observed.append(enriched)
    if not candidates:
        return observed
    try:
        live_required = _observe_live_required_checks(
            repo, observation_deadline, run_impl=run_impl
        )
    except (OSError, subprocess.SubprocessError, ValueError, json.JSONDecodeError):
        live_required = None
    if live_required != EXPECTED_REQUIRED_CHECKS:
        status = "policy-drift" if isinstance(live_required, frozenset) else "policy-error"
        for candidate in candidates:
            candidate["promotionEvidence"] = {
                "status": status,
                "headOid": candidate.get("headRefOid"),
                "baseOid": current_base_oid,
                "requiredCheckNames": sorted(live_required or []),
            }
        return observed
    try:
        readback = _readback_promotion_state(
            repo,
            candidates,
            live_required,
            observation_deadline,
            run_impl=run_impl,
        )
    except (OSError, subprocess.SubprocessError, ValueError, json.JSONDecodeError):
        readback = None
    comparison_candidates: list[dict[str, Any]] = []
    for candidate in candidates:
        number = int(candidate["number"])
        current = readback.get("prs", {}).get(number) if isinstance(readback, dict) else None
        if (
            not isinstance(readback, dict)
            or readback.get("baseOid") != current_base_oid
            or not isinstance(current, dict)
            or current.get("headOid") != candidate.get("headRefOid")
            or current.get("baseRefName") != "main"
        ):
            candidate["promotionEvidence"] = {
                "status": "stale" if isinstance(readback, dict) else "error",
                "headOid": candidate.get("headRefOid"),
                "baseOid": current_base_oid,
            }
            continue
        check_evidence_status = current.get("checkEvidenceStatus")
        if check_evidence_status != "complete":
            candidate["promotionEvidence"] = {
                "status": (
                    check_evidence_status
                    if isinstance(check_evidence_status, str)
                    and check_evidence_status
                    else "malformed"
                ),
                "headOid": candidate.get("headRefOid"),
                "baseOid": current_base_oid,
            }
            continue
        candidate["promotionEvidence"] = {
            "status": "complete",
            "headOid": candidate.get("headRefOid"),
            "baseOid": current_base_oid,
            "requiredCheckNames": sorted(live_required),
            "requiredChecks": current["requiredChecks"],
        }
        if _required_checks_green(candidate["promotionEvidence"]):
            comparison_candidates.append(candidate)
    comparison_candidates.sort(key=lambda item: int(item["number"]))
    workers = min(PROMOTION_EVIDENCE_WORKERS, len(comparison_candidates))
    if workers:
        executor = ThreadPoolExecutor(max_workers=workers)
        futures: dict[Future[dict[str, Any]], dict[str, Any]] = {}
        completed: set[Future[dict[str, Any]]] = set()
        pending: set[Future[dict[str, Any]]] = set()
        try:
            for candidate in comparison_candidates:
                future = executor.submit(
                    _observe_one_comparison,
                    repo,
                    candidate,
                    current_base_oid,
                    observation_deadline,
                    run_impl=run_impl,
                )
                futures[future] = candidate
            completed, pending = wait(
                futures,
                timeout=_remaining_timeout(
                    observation_deadline, PROMOTION_EVIDENCE_PHASE_SECONDS
                ),
            )
            for future in completed:
                candidate = futures[future]
                try:
                    comparison = future.result()
                except Exception:  # fail closed if a bounded evidence worker crashes
                    comparison = {
                        "status": "error",
                        "headOid": candidate.get("headRefOid"),
                        "baseOid": current_base_oid,
                    }
                evidence = candidate["promotionEvidence"]
                if comparison.get("status") == "complete":
                    evidence.update(
                        {
                            key: value
                            for key, value in comparison.items()
                            if key not in {"requiredCheckNames", "requiredChecks"}
                        }
                    )
                else:
                    candidate["promotionEvidence"] = comparison
            for future in pending:
                candidate = futures[future]
                candidate["promotionEvidence"] = {
                    "status": "deadline-exceeded",
                    "headOid": candidate.get("headRefOid"),
                    "baseOid": current_base_oid,
                }
                future.cancel()
        except Exception:
            for future, candidate in futures.items():
                if future not in completed:
                    candidate["promotionEvidence"] = {
                        "status": "error",
                        "headOid": candidate.get("headRefOid"),
                        "baseOid": current_base_oid,
                    }
                    future.cancel()
        finally:
            # Comparison workers return values only, so ignored late results
            # cannot overwrite the deadline disposition.
            executor.shutdown(wait=False, cancel_futures=True)
    try:
        final_required = _observe_live_required_checks(
            repo, observation_deadline, run_impl=run_impl
        )
        if final_required != live_required:
            raise ValueError("GitHub required-check policy changed during observation")
        final_readback = _readback_promotion_state(
            repo,
            candidates,
            final_required,
            observation_deadline,
            run_impl=run_impl,
        )
    except (OSError, subprocess.SubprocessError, ValueError, json.JSONDecodeError):
        final_readback = None
    for candidate in candidates:
        number = int(candidate["number"])
        final = (
            final_readback.get("prs", {}).get(number)
            if isinstance(final_readback, dict)
            else None
        )
        if isinstance(final, dict):
            for key in (
                "author",
                "baseRefName",
                "isCrossRepository",
                "isDraft",
                "labels",
                "mergeQueueEntry",
                "mergeStateStatus",
                "updatedAt",
            ):
                candidate[key] = final.get(key)
            if final.get("state") in {"CLOSED", "MERGED"}:
                candidate["observedTerminalState"] = final["state"]
                continue
        if (
            not isinstance(final_readback, dict)
            or final_readback.get("baseOid") != current_base_oid
            or not isinstance(final, dict)
            or final.get("headOid") != candidate.get("headRefOid")
            or final.get("baseRefName") != "main"
            or final.get("state") != "OPEN"
        ):
            candidate["promotionEvidence"] = {
                "status": "stale" if isinstance(final_readback, dict) else "error",
                "headOid": candidate.get("headRefOid"),
                "baseOid": current_base_oid,
            }
            continue
        final_check_status = final.get("checkEvidenceStatus")
        if final_check_status != "complete":
            candidate["promotionEvidence"] = {
                "status": (
                    final_check_status
                    if isinstance(final_check_status, str) and final_check_status
                    else "malformed"
                ),
                "headOid": candidate.get("headRefOid"),
                "baseOid": current_base_oid,
            }
            continue
        evidence = candidate.get("promotionEvidence")
        if isinstance(evidence, dict) and evidence.get("status") == "complete":
            evidence["requiredCheckNames"] = sorted(final_required)
            evidence["requiredChecks"] = final["requiredChecks"]
    return [pr for pr in observed if "observedTerminalState" not in pr]
def _duplicate_active_lanes(
    dispositions: list[dict[str, Any]],
    evidence_by_number: dict[int, dict[str, Any]],
    prs_by_number: dict[int, dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Held/draft PRs are not writers. Split work is allowed only when disjoint."""
    active_by_issue: dict[str, list[int]] = {}
    for disposition in dispositions:
        issue = disposition.get("issue")
        parsed_number = _non_negative_int(disposition.get("number"))
        if (
            disposition.get("state") not in ACTIVE_WRITER_STATES
            or not isinstance(issue, str)
            or not issue
            or parsed_number is None
            or parsed_number == 0
        ):
            continue
        active_by_issue.setdefault(issue, []).append(parsed_number)

    duplicates: list[dict[str, Any]] = []
    extra_unclassified: list[dict[str, Any]] = []
    seen_unclassified: set[int] = set()
    for issue, numbers in sorted(active_by_issue.items()):
        if len(numbers) < 2:
            continue
        complete: dict[int, frozenset[str]] = {}
        lane_incomplete = False
        for number in numbers:
            evidence = evidence_by_number.get(number) or {"status": "missing"}
            status = evidence.get("status")
            if status == "complete":
                files = evidence.get("files")
                if not isinstance(files, list) or not all(
                    isinstance(path, str) and path for path in files
                ):
                    status = "malformed"
                else:
                    complete[number] = frozenset(files)
                    continue
            reason_status = status if status in EVIDENCE_STATUSES else "missing"
            if number not in seen_unclassified:
                extra_unclassified.append(
                    {
                        "number": number,
                        "reason": f"changed-file-evidence-{reason_status}",
                    }
                )
                seen_unclassified.add(number)
            lane_incomplete = True
        if lane_incomplete:
            for number in numbers:
                if number not in seen_unclassified:
                    extra_unclassified.append(
                        {
                            "number": number,
                            "reason": "changed-file-evidence-incomplete-peer",
                        }
                    )
                    seen_unclassified.add(number)
            continue
        components = _native_stack_components(numbers, prs_by_number, complete)
        component_sizes: dict[int, int] = {}
        for root in components.values():
            component_sizes[root] = component_sizes.get(root, 0) + 1
        overlap: set[str] = set()
        overlapping_numbers: set[int] = set()
        for index, left in enumerate(numbers):
            for right in numbers[index + 1 :]:
                if (
                    components[left] == components[right]
                    and component_sizes[components[left]] > 1
                ):
                    # One declared JOV-INV-020 native stack is a single lane;
                    # overlapping cumulative layers are not duplicates.
                    continue
                pair_overlap = complete[left] & complete[right]
                if pair_overlap:
                    overlap |= pair_overlap
                    overlapping_numbers.update((left, right))
        if overlap:
            duplicates.append(
                {
                    "issue": issue,
                    "prs": sorted(overlapping_numbers),
                    "overlap": sorted(overlap),
                }
            )
    return duplicates, extra_unclassified


def _promotion_disposition(
    pr: dict[str, Any], base: dict[str, Any]
) -> dict[str, Any]:
    if pr.get("baseRefName") != "main":
        return {**base, "state": "repair", "reason": "non-main-base"}
    if pr.get("mergeStateStatus") not in CHECKABLE_MERGE_STATES:
        return {
            **base,
            "state": "repair",
            "reason": f"merge-state-{str(pr.get('mergeStateStatus') or 'unknown').lower()}",
        }

    evidence = pr.get("promotionEvidence")
    if not isinstance(evidence, dict):
        return {**base, "state": "repair", "reason": "promotion-evidence-missing"}
    status = evidence.get("status")
    if status != "complete":
        suffix = status if isinstance(status, str) and status else "malformed"
        return {**base, "state": "repair", "reason": f"promotion-evidence-{suffix}"}
    if (
        evidence.get("headOid") != pr.get("headRefOid")
        or evidence.get("baseOid") != pr.get("currentBaseOid")
    ):
        return {**base, "state": "repair", "reason": "promotion-evidence-stale"}
    required_names = evidence.get("requiredCheckNames")
    if (
        not isinstance(required_names, list)
        or not all(isinstance(name, str) and name for name in required_names)
        or len(required_names) != len(set(required_names))
        or set(required_names) != EXPECTED_REQUIRED_CHECKS
    ):
        return {**base, "state": "repair", "reason": "required-check-policy-drift"}
    checks = evidence.get("requiredChecks")
    if not isinstance(checks, list):
        return {**base, "state": "repair", "reason": "required-check-evidence-missing"}
    check_names = {
        item.get("name")
        for item in checks
        if isinstance(item, dict) and isinstance(item.get("name"), str)
    }
    if check_names != set(required_names) or len(checks) != len(check_names):
        return {**base, "state": "repair", "reason": "required-check-evidence-missing"}
    if not _required_checks_green(evidence):
        return {**base, "state": "repair", "reason": "required-checks-not-green"}
    behind_by = _non_negative_int(evidence.get("behindBy"))
    if behind_by is None:
        return {**base, "state": "repair", "reason": "promotion-evidence-malformed"}
    if behind_by > 0:
        return {
            **base,
            "state": "repair",
            "reason": "stale-base",
            "behindBy": behind_by,
        }
    return {
        **base,
        "state": "promote",
        "reason": "exact-head-current-required-checks-green",
        "behindBy": 0,
        "requiredChecks": sorted(check_names),
    }


def _lifecycle_action(
    pr: dict[str, Any],
    inventory_index: int,
    disposition: dict[str, Any] | None,
    unclassified: dict[str, Any] | None,
    now: datetime,
    repository: str,
) -> dict[str, Any]:
    """Give every observed row one machine-owned lifecycle disposition."""
    number = pr.get("number")
    valid_number = (
        isinstance(number, int) and not isinstance(number, bool) and number > 0
    )
    head_oid = pr.get("headRefOid") if _valid_oid(pr.get("headRefOid")) else None
    issue = disposition.get("issue") if isinstance(disposition, dict) else None

    if valid_number and number in PROTECTED_PR_EXCLUSIONS:
        route = {
            "disposition": "terminal",
            "sourceState": "protected",
            "owner": "gem",
            "writer": "gem",
            "action": "preserve-protected-pr-exclusion",
            "reason": f"protected-machine-exclusion:{number}",
            "terminal": True,
        }
    elif disposition is None:
        reason = (
            unclassified.get("reason")
            if isinstance(unclassified, dict)
            else "missing-pr-number"
        )
        route = {
            "disposition": "active-remediation",
            "sourceState": "unclassified",
            "owner": "controller",
            "writer": "controller",
            "action": "collect-missing-pr-evidence",
            "reason": reason,
            "terminal": False,
        }
    else:
        state = disposition["state"]
        reason = str(disposition.get("reason") or state)
        if state == "close":
            route = {
                "disposition": "terminal",
                "sourceState": state,
                "owner": "gem",
                "writer": "gem",
                "action": "preserve-explicit-duplicate-terminal",
                "reason": reason,
                "terminal": True,
            }
        elif state == "queued":
            route = {
                "disposition": "active-remediation",
                "sourceState": state,
                "owner": "github-native-merge-queue",
                "writer": "github-native-merge-queue",
                "action": "preserve-native-queue-ownership",
                "reason": reason,
                "terminal": False,
            }
        elif state == "promote":
            route = {
                "disposition": "active-remediation",
                "sourceState": state,
                "owner": "gem",
                "writer": "gem",
                "action": "reconcile-exact-head-queue-admission",
                "reason": reason,
                "terminal": False,
            }
        elif state == "held":
            expires_at = parse_time(disposition.get("expiresAt"))
            expired = expires_at is not None and expires_at <= now
            route = {
                "disposition": "active-remediation",
                "sourceState": state,
                "owner": "symphony",
                "writer": "symphony",
                "action": (
                    "reconcile-expired-machine-hold"
                    if expired
                    else "promote-or-supersede-before-expiry"
                ),
                "reason": reason,
                "terminal": False,
            }
        else:
            evidence_reasons = {
                "required-check-policy-drift",
                "required-check-evidence-missing",
            }
            evidence_only = reason in evidence_reasons or reason.startswith(
                "promotion-evidence-"
            )
            branch_repair = reason == "stale-base" or reason.startswith(
                "merge-state-"
            )
            owner = "controller" if evidence_only else (
                "gem"
                if reason == "non-main-base" or branch_repair
                else "symphony"
            )
            action = (
                "collect-missing-pr-evidence"
                if evidence_only
                else "retarget-pr-base-to-main"
                if reason == "non-main-base"
                else "exact-head-branch-update"
                if branch_repair
                else "create-bounded-ci-repair-pr"
            )
            route = {
                "disposition": "active-remediation",
                "sourceState": state,
                "owner": owner,
                "writer": owner,
                "action": action,
                "reason": reason,
                "terminal": False,
            }

    identity = {
        "repository": repository,
        "inventoryIndex": inventory_index,
        "pr": number if valid_number else None,
        "headSha": head_oid,
        "issue": issue,
        **route,
    }
    action_identity = _lifecycle_action_identity(identity)
    return {
        "schema": LIFECYCLE_ACTION_SCHEMA,
        **identity,
        "lifecycleKey": (
            f"{repository}:pr:{number}"
            if valid_number
            else f"{repository}:inventory-row:{inventory_index}"
        ),
        "actionKey": _lifecycle_action_digest(action_identity),
        "observedAt": isoformat(now),
        "externalMutations": 0,
    }


def classify_open_prs(
    prs: list[dict[str, Any]], now: datetime, repository: str = "JovieInc/Jovie"
) -> dict[str, Any]:
    """Map every usable open PR to close/repair/promote/queued/held."""
    refs_by_number: dict[int, list[str]] = {}
    unclassified: list[dict[str, Any]] = []
    usable: list[dict[str, Any]] = []

    for pr in prs:
        number = pr.get("number")
        if isinstance(number, bool) or not isinstance(number, int) or number <= 0:
            unclassified.append({"number": number, "reason": "missing-pr-number"})
            continue
        usable.append(pr)
        label_evidence = _label_evidence(pr)
        if label_evidence.get("status") != "complete":
            unclassified.append(
                {
                    "number": number,
                    "reason": (
                        "label-evidence-"
                        f"{label_evidence.get('status') or 'malformed'}"
                    ),
                }
            )
            refs_by_number[number] = []
            continue
        cross_repository = pr.get("isCrossRepository")
        if not isinstance(cross_repository, bool):
            refs_by_number[number] = []
            unclassified.append(
                {"number": number, "reason": "missing-repository-provenance"}
            )
            continue
        if (
            not isinstance(pr.get("baseRefName"), str)
            or not pr.get("baseRefName")
            or not _valid_oid(pr.get("headRefOid"))
            or not _valid_oid(pr.get("baseRefOid"))
        ):
            refs_by_number[number] = []
            unclassified.append({"number": number, "reason": "missing-ref-provenance"})
            continue
        if cross_repository:
            refs_by_number[number] = []
            continue
        references = _issue_references(pr)
        refs_by_number[number] = references
        if len(references) > 1:
            unclassified.append(
                {"number": number, "reason": "multiple-issue-lane-identities"}
            )

    dispositions: list[dict[str, Any]] = []
    expired_holds: list[int] = []
    prs_by_number: dict[int, dict[str, Any]] = {}
    for pr in sorted(usable, key=lambda item: int(item["number"])):
        number = int(pr["number"])
        prs_by_number[number] = pr
        if any(item.get("number") == number for item in unclassified):
            continue
        labels = _labels(pr)
        updated = parse_time(pr.get("updatedAt"))
        if updated is None:
            unclassified.append({"number": number, "reason": "missing-updated-at"})
            continue
        base = {
            "number": number,
            "issue": refs_by_number[number][0] if refs_by_number[number] else None,
            "headOid": pr["headRefOid"],
            "baseOid": pr.get("currentBaseOid") or pr["baseRefOid"],
            "eventBaseOid": pr["baseRefOid"],
            "baseRefName": pr["baseRefName"],
        }
        close_reasons = sorted(labels.intersection(CLOSE_LABELS))
        if close_reasons:
            dispositions.append(
                {**base, "state": "close", "reason": "+".join(close_reasons)}
            )
            continue
        hold_reasons = sorted(labels.intersection(HOLD_LABELS))
        if pr.get("isDraft") or hold_reasons:
            owner = _author(pr)
            if owner is None:
                unclassified.append({"number": number, "reason": "missing-hold-owner"})
                continue
            expiry = updated + HOLD_EXPIRY
            reason = "+".join(hold_reasons) if hold_reasons else "draft"
            dispositions.append(
                {
                    **base,
                    "state": "held",
                    "owner": owner,
                    "reason": reason,
                    "nextAction": "promote-or-supersede-before-expiry",
                    "expiresAt": isoformat(expiry),
                }
            )
            if expiry <= now:
                expired_holds.append(number)
            continue
        queue_entry = pr.get("mergeQueueEntry")
        if isinstance(queue_entry, dict):
            queue_state = queue_entry.get("state")
            enqueued_at = parse_time(queue_entry.get("enqueuedAt"))
            if not isinstance(queue_state, str) or not queue_state or enqueued_at is None:
                unclassified.append(
                    {"number": number, "reason": "malformed-native-queue-entry"}
                )
                continue
            dispositions.append(
                {
                    **base,
                    "state": "queued",
                    "reason": "native-queue-entry",
                    "queueState": queue_state,
                    "enqueuedAt": isoformat(enqueued_at),
                }
            )
            continue
        dispositions.append(_promotion_disposition(pr, base))

    changed_file_evidence = [
        _changed_file_record(number, prs_by_number[number])
        for number in sorted(prs_by_number)
    ]
    evidence_by_number = {item["number"]: item for item in changed_file_evidence}
    promotion_evidence = [
        {
            "number": number,
            **(
                prs_by_number[number]["promotionEvidence"]
                if isinstance(prs_by_number[number].get("promotionEvidence"), dict)
                else {"status": "missing"}
            ),
        }
        for number in sorted(prs_by_number)
        if _needs_promotion_evidence(prs_by_number[number])
    ]
    duplicates, extra_unclassified = _duplicate_active_lanes(
        dispositions, evidence_by_number, prs_by_number
    )
    drop = {item["number"] for item in extra_unclassified}
    if drop:
        dispositions = [item for item in dispositions if item["number"] not in drop]
        unclassified.extend(extra_unclassified)

    counts = {state: 0 for state in ("close", "repair", "promote", "queued", "held")}
    for disposition in dispositions:
        counts[disposition["state"]] += 1
    disposition_by_number = {item["number"]: item for item in dispositions}
    unclassified_by_number = {
        item.get("number"): item
        for item in unclassified
        if isinstance(item.get("number"), int)
        and not isinstance(item.get("number"), bool)
        and item.get("number") > 0
    }
    lifecycle_actions = [
        _lifecycle_action(
            pr,
            index,
            disposition_by_number.get(pr.get("number")),
            unclassified_by_number.get(pr.get("number")),
            now,
            repository,
        )
        for index, pr in enumerate(prs)
    ]
    stack_health = _draft_stack_health(repository, usable, prs_by_number, now)
    return {
        "dispositions": dispositions,
        "counts": counts,
        "unclassified": sorted(unclassified, key=lambda item: int(item.get("number") or 0)),
        "duplicateIssueLanes": duplicates,
        "expiredHolds": sorted(expired_holds),
        "changedFileEvidence": changed_file_evidence,
        "stackHealth": stack_health,
        "repairActions": stack_health["repairActions"],
        "lifecycleActions": lifecycle_actions,
        "promotionEvidence": promotion_evidence,
    }


def _episode_since(
    previous: dict[str, Any] | None, key: str, now: datetime
) -> datetime:
    episodes = (previous or {}).get("episodes")
    if not isinstance(episodes, dict):
        return now
    episode = episodes.get(key)
    if not isinstance(episode, dict):
        return now
    candidate = episode.get("since")
    parsed = parse_time(candidate)
    return parsed if parsed is not None and parsed <= now else now


def _lifecycle_action_identity(action: dict[str, Any]) -> dict[str, Any]:
    """Canonical content-addressed identity shared by emission and validation."""
    fields = (
        "repository",
        "inventoryIndex",
        "pr",
        "headSha",
        "issue",
        "disposition",
        "sourceState",
        "owner",
        "writer",
        "action",
        "reason",
        "terminal",
    )
    identity = {field: action.get(field) for field in fields}
    if isinstance(identity["pr"], int) and not isinstance(identity["pr"], bool):
        identity.pop("inventoryIndex")
    return identity


def _lifecycle_action_digest(identity: dict[str, Any]) -> str:
    return hashlib.sha256(
        json.dumps(
            identity,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode()
    ).hexdigest()


def _lifecycle_route_valid(action: dict[str, Any]) -> bool:
    source_state = action.get("sourceState")
    owner = action.get("owner")
    next_action = action.get("action")
    disposition = action.get("disposition")
    route = (disposition, owner, next_action)
    expected = {
        "protected": ("terminal", "gem", "preserve-protected-pr-exclusion"),
        "unclassified": (
            "active-remediation",
            "controller",
            "collect-missing-pr-evidence",
        ),
        "close": ("terminal", "gem", "preserve-explicit-duplicate-terminal"),
        "queued": (
            "active-remediation",
            "github-native-merge-queue",
            "preserve-native-queue-ownership",
        ),
        "promote": (
            "active-remediation",
            "gem",
            "reconcile-exact-head-queue-admission",
        ),
    }
    if source_state in expected:
        return route == expected[source_state]
    if source_state == "held":
        return route in {
            ("active-remediation", "symphony", "reconcile-expired-machine-hold"),
            (
                "active-remediation",
                "symphony",
                "promote-or-supersede-before-expiry",
            ),
        }
    if source_state != "repair":
        return False
    return route in {
        ("active-remediation", "controller", "collect-missing-pr-evidence"),
        ("active-remediation", "gem", "retarget-pr-base-to-main"),
        ("active-remediation", "gem", "exact-head-branch-update"),
        ("active-remediation", "symphony", "create-bounded-ci-repair-pr"),
    }


def _lifecycle_inventory_valid(
    actions: object, open_prs: object, expected_repository: object
) -> bool:
    if (
        not isinstance(actions, list)
        or not isinstance(open_prs, int)
        or isinstance(open_prs, bool)
        or len(actions) != open_prs
    ):
        return False
    lifecycle_keys: set[str] = set()
    inventory_indexes: set[int] = set()
    for action in actions:
        if not isinstance(action, dict):
            return False
        lifecycle_key = action.get("lifecycleKey")
        action_key = action.get("actionKey")
        repository = action.get("repository")
        inventory_index = action.get("inventoryIndex")
        pr = action.get("pr")
        head_sha = action.get("headSha")
        issue = action.get("issue")
        owner = action.get("owner")
        disposition = action.get("disposition")
        source_state = action.get("sourceState")
        next_action = action.get("action")
        reason = action.get("reason")
        observed_at = action.get("observedAt")
        parsed_observed_at = parse_time(observed_at)
        route = (disposition, owner, next_action)
        valid_pr = isinstance(pr, int) and not isinstance(pr, bool) and pr > 0
        expected_lifecycle_key = (
            f"{repository}:pr:{pr}"
            if valid_pr
            else f"{repository}:inventory-row:{inventory_index}"
        )
        if (
            action.get("schema") != LIFECYCLE_ACTION_SCHEMA
            or not isinstance(repository, str)
            or REPOSITORY_NAME.fullmatch(repository) is None
            or repository != expected_repository
            or not isinstance(inventory_index, int)
            or isinstance(inventory_index, bool)
            or inventory_index < 0
            or inventory_index >= open_prs
            or inventory_index in inventory_indexes
            or (not valid_pr and pr is not None)
            or (not valid_pr and source_state != "unclassified")
            or (head_sha is not None and not _valid_oid(head_sha))
            or (head_sha is None and source_state != "unclassified")
            or (
                issue is not None
                and (
                    not isinstance(issue, str)
                    or ISSUE_REFERENCE.fullmatch(issue) is None
                )
            )
            or not isinstance(lifecycle_key, str)
            or lifecycle_key != expected_lifecycle_key
            or lifecycle_key in lifecycle_keys
            or not isinstance(action_key, str)
            or re.fullmatch(r"[0-9a-f]{64}", action_key) is None
            or action_key != _lifecycle_action_digest(
                _lifecycle_action_identity(action)
            )
            or owner not in LIFECYCLE_MACHINE_OWNERS
            or action.get("writer") != owner
            or disposition not in {"active-remediation", "terminal"}
            or not isinstance(next_action, str)
            or not next_action
            or len(next_action) > 160
            or not isinstance(reason, str)
            or not reason
            or len(reason) > 240
            or parsed_observed_at is None
            or isoformat(parsed_observed_at) != observed_at
            or not _lifecycle_route_valid(action)
            or action.get("terminal") != (disposition == "terminal")
            or action.get("externalMutations") != 0
            or (
                pr == 17156
                and route
                != ("terminal", "gem", "preserve-protected-pr-exclusion")
            )
        ):
            return False
        lifecycle_keys.add(lifecycle_key)
        inventory_indexes.add(inventory_index)
    return inventory_indexes == set(range(open_prs))


def _previous_for_repository(
    previous: dict[str, Any] | None, repository: str | None
) -> dict[str, Any] | None:
    if not isinstance(previous, dict) or not isinstance(repository, str):
        return None
    return previous if previous.get("repository") == repository else None


def _active_episode(
    previous: dict[str, Any] | None,
    key: str,
    active: bool,
    now: datetime,
) -> tuple[dict[str, Any] | None, timedelta]:
    if not active:
        return None, timedelta(0)
    since = _episode_since(previous, key, now)
    return {"since": isoformat(since), "active": True}, now - since


def evaluate_closure_health(
    snapshot: dict[str, Any],
    previous: dict[str, Any] | None,
    now: datetime,
) -> dict[str, Any]:
    """Apply Summer's bounded stop-line without touching promotion authority."""
    repository = snapshot.get("repository")
    repository_valid = isinstance(repository, str) and REPOSITORY_NAME.fullmatch(repository)
    scoped_previous = _previous_for_repository(previous, repository)
    classifications = snapshot.get("classifications")
    if not isinstance(classifications, dict):
        classifications = {}
    controller = snapshot.get("controller")
    controller_status = controller.get("status") if isinstance(controller, dict) else "unknown"
    open_prs = snapshot.get("openPrs")
    eligible_prs = snapshot.get("eligiblePrs")
    green_ready_prs = snapshot.get("greenReadyPrs")
    native_queue_count = snapshot.get("nativeQueueCount")
    shape_valid = all(
        isinstance(value, int) and not isinstance(value, bool) and value >= 0
        for value in (open_prs, eligible_prs, green_ready_prs, native_queue_count)
    )
    observer_unknown = not repository_valid or not shape_valid or controller_status not in {
        "green",
        "failed",
        "recovering",
        "unknown",
    }
    dispositions = classifications.get("dispositions")
    unclassified = classifications.get("unclassified")
    duplicates = classifications.get("duplicateIssueLanes")
    expired_holds = classifications.get("expiredHolds")
    stack_health = classifications.get("stackHealth")
    repair_actions = classifications.get("repairActions")
    lifecycle_actions = classifications.get("lifecycleActions")
    observer_unknown = observer_unknown or not all(
        isinstance(value, list)
        for value in (dispositions, unclassified, duplicates, expired_holds)
    )
    if stack_health is not None:
        observer_unknown = observer_unknown or not isinstance(stack_health, dict)
        if isinstance(stack_health, dict):
            observer_unknown = observer_unknown or not all(
                isinstance(stack_health.get(key), list)
                for key in ("roots", "violations", "repairActions")
            )
    else:
        stack_health = empty_stack_health()
    if repair_actions is None:
        repair_actions = []
    observer_unknown = observer_unknown or not isinstance(repair_actions, list)
    if lifecycle_actions is None:
        lifecycle_actions = []
    lifecycle_inventory_valid = _lifecycle_inventory_valid(
        lifecycle_actions, open_prs, repository
    )
    observer_unknown = observer_unknown or not isinstance(lifecycle_actions, list)
    dispositions = dispositions if isinstance(dispositions, list) else []
    unclassified = unclassified if isinstance(unclassified, list) else []
    duplicates = duplicates if isinstance(duplicates, list) else []
    expired_holds = expired_holds if isinstance(expired_holds, list) else []
    stack_violations = (
        stack_health.get("violations", [])
        if isinstance(stack_health, dict)
        and isinstance(stack_health.get("violations"), list)
        else []
    )
    repair_actions = repair_actions if isinstance(repair_actions, list) else []
    lifecycle_actions = (
        lifecycle_actions if isinstance(lifecycle_actions, list) else []
    )

    unmergeable_queue_prs = sorted(
        item.get("number")
        for item in dispositions
        if isinstance(item, dict)
        and item.get("state") == "queued"
        and item.get("queueState") == "UNMERGEABLE"
        and isinstance(item.get("number"), int)
    )
    active = {
        "controller": controller_status != "green",
        "emptyNativeQueue": bool(
            shape_valid and green_ready_prs > 0 and native_queue_count == 0
        ),
        "unclassified": bool(unclassified),
        "unmergeableQueue": bool(unmergeable_queue_prs),
    }
    episodes: dict[str, Any] = {}
    durations: dict[str, timedelta] = {}
    for key, is_active in active.items():
        episode, duration = _active_episode(scoped_previous, key, is_active, now)
        if episode is not None:
            episodes[key] = episode
        durations[key] = duration

    reasons: list[str] = []
    if observer_unknown:
        reasons.append("closure-observation-unknown")
    if not lifecycle_inventory_valid:
        reasons.append("lifecycle-action-inventory-incomplete")
    if duplicates:
        reasons.append("duplicate-issue-lanes-unresolved")
    if expired_holds:
        reasons.append("expired-held-prs")
    if stack_violations:
        reasons.append("draft-stack-policy-violation")
        roots = {
            item.get("rootPr")
            for item in stack_violations
            if isinstance(item, dict)
        }
        action_roots = {
            item.get("rootPr")
            for item in repair_actions
            if isinstance(item, dict)
        }
        if roots != action_roots:
            reasons.append("draft-stack-repair-action-unavailable")
    repair_prs = sorted(
        item.get("number")
        for item in dispositions
        if isinstance(item, dict)
        and item.get("state") == "repair"
        and isinstance(item.get("number"), int)
    )
    close_prs = sorted(
        item.get("number")
        for item in dispositions
        if isinstance(item, dict)
        and item.get("state") == "close"
        and isinstance(item.get("number"), int)
    )
    if repair_prs:
        reasons.append("internally-repairable-prs-open")
    if close_prs:
        reasons.append("closure-actions-pending")
    unmergeable_queue_prs = sorted(
        item.get("number")
        for item in dispositions
        if isinstance(item, dict)
        and item.get("state") == "queued"
        and item.get("queueState") == "UNMERGEABLE"
        and isinstance(item.get("number"), int)
    )
    if (
        active["unmergeableQueue"]
        and durations["unmergeableQueue"] >= UNMERGEABLE_QUEUE_RED_AFTER
    ):
        reasons.append("native-queue-unmergeable")
    if active["controller"] and durations["controller"] >= CONTROLLER_RED_AFTER:
        reasons.append("queue-controller-red-over-10m")
    if (
        active["emptyNativeQueue"]
        and durations["emptyNativeQueue"] >= EMPTY_QUEUE_RED_AFTER
    ):
        reasons.append("native-queue-empty-with-eligible-over-15m")
    if active["unclassified"] and durations["unclassified"] >= UNCLASSIFIED_RED_AFTER:
        reasons.append("unclassified-open-pr-over-15m")

    latest_merge_at = parse_time(snapshot.get("latestMergeAt"))
    oldest_open_at = parse_time(snapshot.get("oldestOpenAt"))
    progress_anchor = latest_merge_at or oldest_open_at
    if (
        shape_valid
        and open_prs > 0
        and (progress_anchor is None or now - progress_anchor >= NO_MERGE_PROGRESS_AFTER)
    ):
        reasons.append("no-merge-progress-over-1h")

    grace_active = any(active.values())
    status = "red" if reasons else "grace" if grace_active else "healthy"
    return {
        "schema": SCHEMA,
        "repository": repository if repository_valid else None,
        "status": status,
        "authority": AUTHORITY,
        "observedAt": isoformat(now),
        "newIssueIntakeAllowed": status == "healthy",
        "promotionContinues": True,
        "remediationContinues": True,
        "blockedActivities": (
            ["new-issue-lease", "new-implementation", "fallback-pr-generation"]
            if status != "healthy"
            else []
        ),
        "reasons": sorted(set(reasons)),
        "episodes": episodes,
        "controller": controller if isinstance(controller, dict) else {"status": "unknown"},
        "openPrs": open_prs if shape_valid else None,
        "eligiblePrs": eligible_prs if shape_valid else None,
        "greenReadyPrs": green_ready_prs if shape_valid else None,
        "nativeQueueCount": native_queue_count if shape_valid else None,
        "unmergeableNativeQueuePrs": unmergeable_queue_prs,
        "repairPrs": repair_prs,
        "closePrs": close_prs,
        "latestMergeAt": snapshot.get("latestMergeAt"),
        "stackHealth": bounded_stack_health(stack_health),
        "repairActions": repair_actions if isinstance(repair_actions, list) else [],
        "lifecycleActions": lifecycle_actions,
        "classifications": classifications,
    }


def _repo_parts(repo: str) -> tuple[str, str]:
    pieces = repo.split("/", 1)
    if len(pieces) != 2 or not all(pieces):
        raise ValueError("repository must be owner/name")
    return pieces[0], pieces[1]


def _run_graphql_snapshot_once(
    repo: str, deadline: float | None = None
) -> dict[str, Any]:
    observation_deadline = deadline or time.monotonic() + CLOSURE_OBSERVATION_SECONDS
    owner, name = _repo_parts(repo)
    query = """
query($owner:String!,$name:String!,$endCursor:String){
  repository(owner:$owner,name:$name){
    main:ref(qualifiedName:"refs/heads/main"){target{oid}}
    pullRequests(first:100,after:$endCursor,states:OPEN,orderBy:{field:CREATED_AT,direction:ASC}){
      totalCount
      pageInfo{hasNextPage endCursor}
      nodes{
        number title body headRefName headRefOid baseRefName baseRefOid
        isDraft isCrossRepository mergeStateStatus createdAt updatedAt
        author{login}
        labels(first:100){totalCount nodes{name}}
        mergeQueueEntry{position enqueuedAt state}
        changedFiles
        files(first:__FILES_PAGE__){totalCount nodes{path changeType}}
      }
    }
    merged:pullRequests(first:100,states:MERGED,orderBy:{field:UPDATED_AT,direction:DESC}){
      nodes{number mergedAt}
    }
  }
}
""".replace("__FILES_PAGE__", str(CHANGED_FILES_PAGE)).strip()
    completed = subprocess.run(
        [
            "gh",
            "api",
            "graphql",
            "--paginate",
            "--slurp",
            "-f",
            f"query={query}",
            "-F",
            f"owner={owner}",
            "-F",
            f"name={name}",
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=_remaining_timeout(observation_deadline, 30),
    )
    pages = json.loads(completed.stdout)
    if not isinstance(pages, list) or not pages:
        raise ValueError("GitHub closure snapshot returned no pages")
    repository = pages[0].get("data", {}).get("repository")
    if not isinstance(repository, dict):
        raise ValueError("GitHub closure snapshot omitted repository")
    main = repository.get("main")
    main_target = main.get("target") if isinstance(main, dict) else None
    main_oid = main_target.get("oid") if isinstance(main_target, dict) else None
    if not _valid_oid(main_oid):
        raise ValueError("GitHub closure snapshot omitted main OID")
    prs: list[dict[str, Any]] = []
    for page in pages:
        if page.get("errors"):
            raise ValueError("GitHub closure snapshot contained GraphQL errors")
        nodes = page.get("data", {}).get("repository", {}).get("pullRequests", {}).get("nodes")
        if not isinstance(nodes, list):
            raise ValueError("GitHub closure snapshot omitted pull request nodes")
        prs.extend(node for node in nodes if isinstance(node, dict))
    total = repository.get("pullRequests", {}).get("totalCount")
    if total != len(prs):
        raise ValueError(f"GitHub closure snapshot incomplete: expected {total}, got {len(prs)}")
    merged_nodes = repository.get("merged", {}).get("nodes", [])
    merged_times = (
        [parse_time(node.get("mergedAt")) for node in merged_nodes if isinstance(node, dict)]
        if isinstance(merged_nodes, list)
        else []
    )
    latest_merge = max((value for value in merged_times if value is not None), default=None)
    return {
        "prs": prs,
        "mainOid": main_oid,
        "latestMergeAt": isoformat(latest_merge) if latest_merge is not None else None,
    }


def _run_graphql_snapshot(repo: str, deadline: float | None = None) -> dict[str, Any]:
    """Retry a fleet read when open/close churn crosses a pagination boundary."""
    observation_deadline = deadline or time.monotonic() + CLOSURE_OBSERVATION_SECONDS
    last_error: ValueError | None = None
    for _attempt in range(SNAPSHOT_ATTEMPTS):
        try:
            return _run_graphql_snapshot_once(repo, observation_deadline)
        except ValueError as error:
            last_error = error
        except subprocess.CalledProcessError as error:
            detail = re.sub(
                r"(?i)(bearer|authorization|token|api[-_ ]?key|secret|password)(\s*[:=]?\s*)\S+",
                r"\1\2[REDACTED]",
                str(error.stderr or error),
            )
            detail = " ".join(detail.split())[:512]
            last_error = ValueError(
                f"GitHub closure snapshot command failed (exit {error.returncode}): {detail}"
            )
            # A rate-limit response is an authoritative cooldown, not a
            # transient transport failure. Leave it for the next event instead
            # of spending more of the exhausted budget in this observation.
            if re.search(r"(?i)rate limit|HTTP 429", detail):
                break
    raise last_error or ValueError("GitHub closure snapshot failed")


def _observe_queue_controller(
    repo: str, deadline: float | None = None
) -> dict[str, Any]:
    observation_deadline = deadline or time.monotonic() + CLOSURE_OBSERVATION_SECONDS
    completed = subprocess.run(
        [
            "gh",
            "api",
            f"repos/{repo}/actions/workflows/merge-queue-autoenroll.yml/runs?per_page=5",
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=_remaining_timeout(observation_deadline, 20),
    )
    payload = json.loads(completed.stdout)
    runs = payload.get("workflow_runs") if isinstance(payload, dict) else None
    if not isinstance(runs, list) or not runs:
        return {"status": "unknown", "reason": "controller-run-missing"}
    latest = runs[0]
    # Judge green/failed from the latest completed run, not the latest run:
    # a busy fleet almost always has an in-progress autoenroll run, and a
    # busy queue is not a stalled controller. Also skip `cancelled` runs:
    # the autoenroll concurrency group supersedes older runs constantly, and
    # supersession churn carries no health verdict. "recovering" covers the
    # abnormal case where the fetched page has no verdict-bearing run at all;
    # the CONTROLLER_RED_AFTER episode threshold guards real stalls.
    verdict_runs = [
        run
        for run in runs
        if isinstance(run, dict)
        and run.get("status") == "completed"
        and run.get("conclusion") not in (None, "cancelled")
    ]
    if verdict_runs:
        judged = verdict_runs[0]
        status = judged.get("status")
        conclusion = judged.get("conclusion")
        controller_status = "green" if conclusion == "success" else "failed"
    else:
        judged = latest
        status = judged.get("status")
        conclusion = judged.get("conclusion")
        if status in {"queued", "in_progress", "waiting", "pending"} or status == "completed":
            controller_status = "recovering"
        else:
            controller_status = "unknown"
    receipt: dict[str, Any] = {
        "status": controller_status,
        "runId": judged.get("id"),
        "runStatus": status,
        "conclusion": conclusion,
        "url": judged.get("html_url"),
        "observedAt": judged.get("updated_at") or judged.get("created_at"),
    }
    if judged is not latest and isinstance(latest, dict):
        receipt["activeRunId"] = latest.get("id")
    return receipt


def observe_closure_health(
    repo: str,
    previous: dict[str, Any] | None,
    now: datetime,
) -> dict[str, Any]:
    """Read GitHub closure state and emit a typed Summer admission signal."""
    deadline = time.monotonic() + CLOSURE_OBSERVATION_SECONDS
    try:
        observed = _run_graphql_snapshot(repo, deadline)
        prs = observe_promotion_evidence(
            repo, observed["prs"], observed["mainOid"], deadline
        )
        classifications = classify_open_prs(prs, now, repo)
        labels_by_pr = {int(pr["number"]): _labels(pr) for pr in prs}
        eligible = [
            pr
            for pr in prs
            if _label_evidence(pr).get("status") == "complete"
            and not pr.get("isDraft")
            and not labels_by_pr[int(pr["number"])].intersection(HOLD_LABELS)
        ]
        green_ready = [
            disposition
            for disposition in classifications["dispositions"]
            if disposition.get("state") == "promote"
        ]
        native_queue = [pr for pr in prs if pr.get("mergeQueueEntry")]
        oldest_open = min(
            (parse_time(pr.get("createdAt")) for pr in prs),
            default=None,
            key=lambda value: value or now,
        )
        snapshot = {
            "repository": repo,
            "controller": _observe_queue_controller(repo, deadline),
            "openPrs": len(prs),
            "eligiblePrs": len(eligible),
            "greenReadyPrs": len(green_ready),
            "nativeQueueCount": len(native_queue),
            "latestMergeAt": observed.get("latestMergeAt"),
            "oldestOpenAt": isoformat(oldest_open) if oldest_open else None,
            "classifications": classifications,
        }
        return evaluate_closure_health(snapshot, previous, now)
    except (OSError, subprocess.SubprocessError, ValueError, json.JSONDecodeError) as error:
        return {
            "schema": SCHEMA,
            "repository": repo,
            "status": "red",
            "authority": AUTHORITY,
            "observedAt": isoformat(now),
            "newIssueIntakeAllowed": False,
            "promotionContinues": True,
            "remediationContinues": True,
            "blockedActivities": [
                "new-issue-lease",
                "new-implementation",
                "fallback-pr-generation",
            ],
            "reasons": ["closure-observation-unknown"],
            "episodes": {},
            "error": f"closure-observation-failed: {error}",
            # The observation is non-authoritative, so an empty action set
            # must not resolve prior work. It still has to satisfy the bounded
            # JOV-INV-020 ingress contract used by Fleet Gate Refresh.
            "stackHealth": empty_stack_health(),
            "repairActions": [],
            "lifecycleActions": [],
            "classifications": {
                "dispositions": [],
                "counts": {},
                "unclassified": [],
                "duplicateIssueLanes": [],
                "expiredHolds": [],
                "changedFileEvidence": [],
                "lifecycleActions": [],
            },
        }
