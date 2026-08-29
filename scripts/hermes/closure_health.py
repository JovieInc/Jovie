#!/usr/bin/env python3
"""Summer-owned closed-loop PR health observer.

Invariant consumer: JOV-INV-011.

This extends the existing fleet gate; it is not another controller or writer.
Summer classifies every open PR and may stop only *new* implementation intake.
Gem remains the sole native-queue/promotion writer, and remediation continues
while the stop-line is active.
"""

from __future__ import annotations

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
    expected_values: list[int] = []
    if total_count is not None:
        parsed_total = _non_negative_int(total_count)
        if parsed_total is None:
            return {"status": "malformed"}
        expected_values.append(parsed_total)
    if changed_files is not None:
        parsed_changed = _non_negative_int(changed_files)
        if parsed_changed is None:
            return {"status": "malformed"}
        expected_values.append(parsed_changed)
    if len(set(expected_values)) > 1:
        return {"status": "malformed"}
    observed = len(paths)
    expected = expected_values[0] if expected_values else observed
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
        classified_numbers = [number for number in numbers if number in complete]
        if len(classified_numbers) < 2:
            continue
        overlap: set[str] = set()
        overlapping_numbers: set[int] = set()
        for index, left in enumerate(classified_numbers):
            for right in classified_numbers[index + 1 :]:
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


def classify_open_prs(prs: list[dict[str, Any]], now: datetime) -> dict[str, Any]:
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
    return {
        "dispositions": dispositions,
        "counts": counts,
        "unclassified": sorted(unclassified, key=lambda item: int(item.get("number") or 0)),
        "duplicateIssueLanes": duplicates,
        "expiredHolds": sorted(expired_holds),
        "changedFileEvidence": changed_file_evidence,
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
    observer_unknown = not shape_valid or controller_status not in {
        "green",
        "failed",
        "recovering",
        "unknown",
    }
    dispositions = classifications.get("dispositions")
    unclassified = classifications.get("unclassified")
    duplicates = classifications.get("duplicateIssueLanes")
    expired_holds = classifications.get("expiredHolds")
    observer_unknown = observer_unknown or not all(
        isinstance(value, list)
        for value in (dispositions, unclassified, duplicates, expired_holds)
    )
    dispositions = dispositions if isinstance(dispositions, list) else []
    unclassified = unclassified if isinstance(unclassified, list) else []
    duplicates = duplicates if isinstance(duplicates, list) else []
    expired_holds = expired_holds if isinstance(expired_holds, list) else []

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
        episode, duration = _active_episode(previous, key, is_active, now)
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
        number title body headRefName isDraft isCrossRepository mergeStateStatus createdAt updatedAt
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
        classifications = classify_open_prs(prs, now)
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
