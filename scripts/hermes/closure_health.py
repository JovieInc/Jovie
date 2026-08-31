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
from datetime import datetime, timedelta, timezone
from typing import Any


SCHEMA = "jovie-closure-health/v1"
AUTHORITY = "Summer"
CONTROLLER_RED_AFTER = timedelta(minutes=10)
EMPTY_QUEUE_RED_AFTER = timedelta(minutes=15)
UNCLASSIFIED_RED_AFTER = timedelta(minutes=15)
NO_MERGE_PROGRESS_AFTER = timedelta(hours=1)
HOLD_EXPIRY = timedelta(days=7)
STACK_MAX_DEPTH = 4  # JOV-INV-020
STACK_DEADLINE_MAX = timedelta(days=7)
STACK_ROOT_BASE = "main"
STACK_REPAIR_ACTION = "split-or-retarget-draft-stack"
UTC = timezone.utc
ISSUE_REFERENCE = re.compile(r"\b(?:JOV|LYB)-\d+\b", re.IGNORECASE)
EXPLICIT_ISSUE_MARKER = re.compile(
    r"<!--\s*linear-issue-(?:id|identifier)\s*:\s*((?:JOV|LYB)-\d+)\s*-->",
    re.IGNORECASE,
)
HOLD_LABELS = {"hold", "gated", "queue-deferred", "needs-human"}
CLOSE_LABELS = {"duplicate"}
ACTIVE_WRITER_STATES = frozenset({"repair", "promote", "queued"})
CHANGED_FILES_PAGE = 100
EVIDENCE_STATUSES = frozenset({"complete", "missing", "malformed", "truncated"})
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
) -> dict[str, Any]:
    root_number = int(root["number"])
    promotion_path = _stack_path(longest_path, prs_by_number)
    root_head_sha = _stack_head_sha(root)
    fingerprint = {
        "repository": repository,
        "rootPr": root_number,
        "rootHeadSha": root_head_sha,
        "prNumbers": members,
        "promotionPath": promotion_path,
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
        result = (key, path + [number], set(errors))
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
        if not members:
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
            actions.append(
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


def _duplicate_active_lanes(
    dispositions: list[dict[str, Any]],
    evidence_by_number: dict[int, dict[str, Any]],
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
        overlap: set[str] = set()
        overlapping_numbers: set[int] = set()
        for index, left in enumerate(numbers):
            for right in numbers[index + 1 :]:
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
        cross_repository = pr.get("isCrossRepository")
        if not isinstance(cross_repository, bool):
            refs_by_number[number] = []
            unclassified.append(
                {"number": number, "reason": "missing-repository-provenance"}
            )
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
        }
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
                    "expiresAt": isoformat(expiry),
                }
            )
            if expiry <= now:
                expired_holds.append(number)
            continue
        if pr.get("mergeStateStatus") == "CLEAN":
            dispositions.append({**base, "state": "promote", "reason": "clean-ready"})
        else:
            dispositions.append(
                {
                    **base,
                    "state": "repair",
                    "reason": f"merge-state-{str(pr.get('mergeStateStatus') or 'unknown').lower()}",
                }
            )

    changed_file_evidence = [
        _changed_file_record(number, prs_by_number[number])
        for number in sorted(prs_by_number)
    ]
    evidence_by_number = {item["number"]: item for item in changed_file_evidence}
    duplicates, extra_unclassified = _duplicate_active_lanes(
        dispositions, evidence_by_number
    )
    drop = {item["number"] for item in extra_unclassified}
    if drop:
        dispositions = [item for item in dispositions if item["number"] not in drop]
        unclassified.extend(extra_unclassified)

    counts = {state: 0 for state in ("close", "repair", "promote", "queued", "held")}
    for disposition in dispositions:
        counts[disposition["state"]] += 1
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
        stack_health = {"maxDepth": STACK_MAX_DEPTH, "roots": [], "violations": []}
    if repair_actions is None:
        repair_actions = []
    observer_unknown = observer_unknown or not isinstance(repair_actions, list)
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

    active = {
        "controller": controller_status != "green",
        "emptyNativeQueue": bool(
            shape_valid and green_ready_prs > 0 and native_queue_count == 0
        ),
        "unclassified": bool(unclassified),
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
    unmergeable_queue_prs = sorted(
        item.get("number")
        for item in dispositions
        if isinstance(item, dict)
        and item.get("state") == "queued"
        and item.get("queueState") == "UNMERGEABLE"
        and isinstance(item.get("number"), int)
    )
    if unmergeable_queue_prs:
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
        "latestMergeAt": snapshot.get("latestMergeAt"),
        "stackHealth": stack_health,
        "repairActions": repair_actions,
        "classifications": classifications,
    }


def _repo_parts(repo: str) -> tuple[str, str]:
    pieces = repo.split("/", 1)
    if len(pieces) != 2 or not all(pieces):
        raise ValueError("repository must be owner/name")
    return pieces[0], pieces[1]


def _run_graphql_snapshot(repo: str) -> dict[str, Any]:
    owner, name = _repo_parts(repo)
    query = """
query($owner:String!,$name:String!,$endCursor:String){
  repository(owner:$owner,name:$name){
    pullRequests(first:100,after:$endCursor,states:OPEN,orderBy:{field:CREATED_AT,direction:ASC}){
      totalCount
      pageInfo{hasNextPage endCursor}
      nodes{
        number title body baseRefName headRefName headRefOid isDraft isCrossRepository mergeStateStatus createdAt updatedAt
        author{login}
        labels(first:50){nodes{name}}
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
        timeout=30,
    )
    pages = json.loads(completed.stdout)
    if not isinstance(pages, list) or not pages:
        raise ValueError("GitHub closure snapshot returned no pages")
    repository = pages[0].get("data", {}).get("repository")
    if not isinstance(repository, dict):
        raise ValueError("GitHub closure snapshot omitted repository")
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
        "latestMergeAt": isoformat(latest_merge) if latest_merge is not None else None,
    }


def _observe_queue_controller(repo: str) -> dict[str, Any]:
    completed = subprocess.run(
        [
            "gh",
            "api",
            f"repos/{repo}/actions/workflows/merge-queue-autoenroll.yml/runs?per_page=5",
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=20,
    )
    payload = json.loads(completed.stdout)
    runs = payload.get("workflow_runs") if isinstance(payload, dict) else None
    if not isinstance(runs, list) or not runs:
        return {"status": "unknown", "reason": "controller-run-missing"}
    latest = runs[0]
    status = latest.get("status")
    conclusion = latest.get("conclusion")
    if status == "completed":
        controller_status = "green" if conclusion == "success" else "failed"
    elif status in {"queued", "in_progress", "waiting", "pending"}:
        controller_status = "recovering"
    else:
        controller_status = "unknown"
    return {
        "status": controller_status,
        "runId": latest.get("id"),
        "runStatus": status,
        "conclusion": conclusion,
        "url": latest.get("html_url"),
        "observedAt": latest.get("updated_at") or latest.get("created_at"),
    }


def observe_closure_health(
    repo: str,
    previous: dict[str, Any] | None,
    now: datetime,
) -> dict[str, Any]:
    """Read GitHub closure state and emit a typed Summer admission signal."""
    try:
        observed = _run_graphql_snapshot(repo)
        prs = observed["prs"]
        classifications = classify_open_prs(prs, now, repo)
        labels_by_pr = {int(pr["number"]): _labels(pr) for pr in prs}
        eligible = [
            pr
            for pr in prs
            if not pr.get("isDraft")
            and not labels_by_pr[int(pr["number"])].intersection(HOLD_LABELS)
        ]
        green_ready = [pr for pr in eligible if pr.get("mergeStateStatus") == "CLEAN"]
        native_queue = [pr for pr in prs if pr.get("mergeQueueEntry")]
        oldest_open = min(
            (parse_time(pr.get("createdAt")) for pr in prs),
            default=None,
            key=lambda value: value or now,
        )
        snapshot = {
            "repository": repo,
            "controller": _observe_queue_controller(repo),
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
            "classifications": {
                "dispositions": [],
                "counts": {},
                "unclassified": [],
                "duplicateIssueLanes": [],
                "expiredHolds": [],
                "changedFileEvidence": [],
            },
        }
