#!/usr/bin/env python3
"""Versioned Gem fleet gate with separate work and promotion admission.

Gem observes main, production, queue, controller, and explicit integrity
receipts. Symphony remains the only implementation owner, so the legacy direct
Gem ship loop is held even while the fleet work-admission gate permits approved
Linear leases.
"""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


SCHEMA = "jovie-fleet-gate/v1"
INTEGRITY_SCHEMA = "jovie-integrity/v1"
CONCURRENCY_SCHEMA = "gem-concurrency-evidence/v1"
INDEPENDENT_REVIEW_SCHEMA = "jovie-independent-review/v1"
INDEPENDENT_REVIEW_AUTHORITY = "Gem"
INDEPENDENT_REVIEW_SCOPE = "exact-main-head"
# Schema-padding sentinel for evaluation-failed receipts. Auto-Enroll jq
# requires a 40-hex main SHA; this value never authorizes promotion.
UNKNOWN_MAIN_SHA = "0" * 40
# Keep in sync with the consumer fail-closed window
# (scripts/backlog-orchestrator/admitter.mjs CONTROLLER_RECEIPT_MAX_AGE_MS).
RECEIPT_STALE_AFTER = timedelta(minutes=10)
WRITER_LOCK_TIMEOUT_SECONDS = 60.0
SEVERE_REASONS = {
    "credential-compromise",
    "unsafe-migration-or-data-corruption",
    "broken-worktree-isolation",
    "repository-or-artifact-corruption",
    "severe-integrity-incident",
}
DEFAULT_GEM_CONCURRENCY = 4
UTC = timezone.utc


def utc_now() -> datetime:
    return datetime.now(UTC)


def isoformat(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def parse_time(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)
    except ValueError:
        return None


def typed_reason(code: str, layer: str, severity: str, detail: str) -> dict[str, str]:
    return {"code": code, "layer": layer, "severity": severity, "detail": detail}


def already_admitted_cohort_semantics(promotion_mode: str) -> dict[str, Any]:
    if promotion_mode == "hold-intake":
        return {
            "preserve": True,
            "newIntakeAllowed": True,
            "semantics": "preserve-cohort-and-continue-isolated-implementation",
        }
    if promotion_mode == "blocked":
        return {
            "preserve": False,
            "newIntakeAllowed": False,
            "semantics": "dequeue-until-exact-production-recovers",
        }
    if promotion_mode == "isolated-only":
        return {
            "preserve": False,
            "newIntakeAllowed": True,
            "semantics": "isolated-only",
        }
    if promotion_mode == "draft-only":
        return {
            "preserve": False,
            "newIntakeAllowed": False,
            "semantics": "draft-only",
        }
    return {
        "preserve": True,
        "newIntakeAllowed": True,
        "semantics": "normal",
    }


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("receipt must be a JSON object")
    return value


def gh_json(repo: str, endpoint: str) -> dict[str, Any]:
    result = subprocess.run(
        ["gh", "api", f"repos/{repo}/{endpoint}"],
        check=True,
        capture_output=True,
        text=True,
        timeout=20,
    )
    value = json.loads(result.stdout)
    if not isinstance(value, dict):
        raise ValueError("GitHub response was not an object")
    return value


def observe_main(repo: str) -> dict[str, Any]:
    try:
        branch = gh_json(repo, "branches/main")
        sha = branch.get("commit", {}).get("sha")
        if not sha:
            raise ValueError("main SHA missing")
        combined = gh_json(repo, f"commits/{sha}/status")
        release_attempts: list[dict[str, Any]] = []
        for page in range(1, 11):
            checks = gh_json(repo, f"commits/{sha}/check-runs?per_page=100&page={page}")
            page_runs = checks.get("check_runs", [])
            release_attempts.extend(
                run for run in page_runs if run.get("name") == "Main Release Ready"
            )
            if len(page_runs) < 100:
                break
        if not release_attempts:
            raise ValueError("Main Release Ready check is missing")
        release_attempts.sort(
            key=lambda run: str(run.get("started_at") or run.get("completed_at") or ""),
            reverse=True,
        )
        latest = release_attempts[0]
        combined_state = str(combined.get("state") or "unknown")
        if latest.get("status") != "completed":
            status = "unknown"
        else:
            status = "green" if latest.get("conclusion") == "success" else "red"
        return {
            "status": status,
            "sha": sha,
            "combinedStatus": combined_state,
            "sourceGate": {
                "name": "Main Release Ready",
                "status": latest.get("status"),
                "conclusion": latest.get("conclusion"),
                "startedAt": latest.get("started_at"),
                "completedAt": latest.get("completed_at"),
            },
        }
    except (OSError, subprocess.SubprocessError, ValueError, json.JSONDecodeError) as error:
        return {"status": "unknown", "error": f"github-observation-failed: {error}"}


def observe_controller(url: str) -> dict[str, Any]:
    try:
        with urllib.request.urlopen(url, timeout=5) as response:  # noqa: S310 - fixed local URL by default
            value = json.loads(response.read().decode("utf-8"))
        if not isinstance(value, dict):
            raise ValueError("controller state was not an object")
        return {
            "status": "green",
            "kind": "symphony",
            "url": url,
            "activeRuns": len(value.get("running", [])),
        }
    except (OSError, ValueError, json.JSONDecodeError, urllib.error.URLError) as error:
        return {
            "status": "failed",
            "kind": "symphony",
            "url": url,
            "error": f"controller-observation-failed: {error}",
        }


def observe_build_info(build_info_url: str) -> dict[str, Any]:
    """Read the public production identity receipt for deployed-SHA binding."""
    try:
        with urllib.request.urlopen(build_info_url, timeout=5) as response:  # noqa: S310 - derived from the configured health URL
            if response.status < 200 or response.status >= 300:
                return {"deployedSha": None, "buildInfoHttpStatus": response.status}
            final_url = response.geturl()
            if final_url.rstrip("/") != build_info_url.rstrip("/"):
                return {
                    "deployedSha": None,
                    "buildInfoError": "build-info redirected away from the configured alias",
                }
            value = json.loads(response.read().decode("utf-8"))
        if not isinstance(value, dict):
            raise ValueError("build-info was not an object")
        commit_sha = value.get("commitSha")
        return {
            "deployedSha": commit_sha
            if isinstance(commit_sha, str) and commit_sha
            else None
        }
    except urllib.error.HTTPError as error:
        return {"deployedSha": None, "buildInfoHttpStatus": error.code}
    except (OSError, ValueError, json.JSONDecodeError, urllib.error.URLError) as error:
        return {
            "deployedSha": None,
            "buildInfoError": f"build-info-observation-failed: {error}",
        }


def observe_lease(guard_bin: str) -> dict[str, Any]:
    """JOV-5031: additive, observation-only lease health signal.

    Runs the lease guard's report (tombstones, redispatch-suppression
    counters, orphan-launcher count, typed account capacity) and embeds it
    verbatim. Missing guard, timeouts, and malformed reports degrade to a
    typed unknown and never gate the fleet receipt.
    """
    try:
        result = subprocess.run(
            [guard_bin, "report"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError) as error:
        return {"status": "unknown", "reason": f"lease-report-unavailable: {error}"}
    if result.returncode != 0:
        return {"status": "unknown", "reason": f"lease-report-rc-{result.returncode}"}
    try:
        value = json.loads(result.stdout.decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as error:
        return {"status": "unknown", "reason": f"lease-report-malformed: {error}"}
    if not isinstance(value, dict) or value.get("schema") != "symphony-lease-guard-report/v1":
        return {"status": "unknown", "reason": "lease-report-schema-mismatch"}
    return {
        "status": "ok",
        "observedAt": value.get("ts"),
        "tombstones": len(value.get("tombstones") or {}),
        "counters": value.get("counters") or {},
        "orphanLaunchers": value.get("orphanLaunchers"),
        "capacity": value.get("capacity") or {"state": "unknown", "reason": "missing"},
    }


def observe_production(url: str) -> dict[str, Any]:
    try:
        with urllib.request.urlopen(url, timeout=5) as response:  # noqa: S310 - configured health URL
            if response.status < 200 or response.status >= 300:
                return {"status": "red", "url": url, "httpStatus": response.status}
            final_url = response.geturl()
            if final_url.rstrip("/") != url.rstrip("/"):
                return {
                    "status": "red",
                    "url": url,
                    "finalUrl": final_url,
                    "detail": "production health redirected away from the configured alias",
                }
            value = json.loads(response.read().decode("utf-8"))
        if not isinstance(value, dict):
            raise ValueError("production health was not an object")
        reported_status = value.get("status")
        observed: dict[str, Any] = {
            "status": "green" if reported_status in ("healthy", "ok") else "red",
            "url": url,
            "reportedStatus": reported_status,
        }
    except urllib.error.HTTPError as error:
        return {
            "status": "red",
            "url": url,
            "httpStatus": error.code,
            "error": "production-observation-http-error",
        }
    except (OSError, ValueError, json.JSONDecodeError, urllib.error.URLError) as error:
        return {
            "status": "unknown",
            "url": url,
            "error": f"production-observation-failed: {error}",
        }
    if observed["status"] == "green":
        # A healthy payload alone is not deployment authority: bind the green
        # signal to the immutable deployed SHA advertised by build-info so a
        # stale production deploy can never pass as current-main proof.
        observed.update(observe_build_info(url.rsplit("/", 1)[0] + "/build-info"))
    return observed


def deployment_bound(main_sha: object, deployed_sha: object) -> bool:
    """True only when production is provably running the exact main SHA."""
    return (
        valid_commit_sha(main_sha, exact=True)
        and valid_commit_sha(deployed_sha, exact=True)
        and main_sha == deployed_sha
    )


def valid_commit_sha(value: object, *, exact: bool = False) -> bool:
    """Validate a full or GitHub-style abbreviated lowercase commit SHA."""
    return (
        isinstance(value, str)
        and (len(value) == 40 if exact else 7 <= len(value) <= 40)
        and all(character in "0123456789abcdef" for character in value)
    )


def observe_integrity(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"status": "clear", "source": "no-active-receipt"}
    try:
        receipt = read_json(path)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return {
            "status": "invalid",
            "reason": "invalid-integrity-receipt",
            "detail": str(error),
            "source": str(path),
        }
    status = receipt.get("status")
    reason = receipt.get("reason")
    if receipt.get("schema") != INTEGRITY_SCHEMA or status not in {
        "clear",
        "active",
        "resolved",
    }:
        return {
            "status": "invalid",
            "reason": "invalid-integrity-receipt",
            "detail": "receipt schema or status is invalid",
            "source": str(path),
        }
    if status == "active" and reason not in SEVERE_REASONS:
        return {
            "status": "invalid",
            "reason": "invalid-integrity-receipt",
            "detail": "active receipt does not name an allowed severe incident",
            "source": str(path),
        }
    return {
        "status": status,
        "reason": reason,
        "detail": receipt.get("detail"),
        "source": str(path),
    }


def observe_concurrency(path: Path, now: datetime) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        receipt = read_json(path)
    except (OSError, ValueError, json.JSONDecodeError):
        return None
    observed_at = parse_time(receipt.get("observedAt"))
    eligible = (
        receipt.get("schema") == CONCURRENCY_SCHEMA
        and receipt.get("target") == 8
        and receipt.get("approved") is True
        and isinstance(receipt.get("cleanRuns"), int)
        and receipt["cleanRuns"] >= 20
        and receipt.get("severeIncidents") == 0
        and observed_at is not None
        and timedelta(0) <= now - observed_at <= timedelta(hours=24)
    )
    return {**receipt, "accepted": eligible}


def validate_independent_review(
    receipt: object, expected_head_sha: object, now: datetime
) -> dict[str, Any]:
    """Accept only a typed, fresh review of the exact current main head."""
    if receipt is None:
        return {
            "schema": INDEPENDENT_REVIEW_SCHEMA,
            "status": "missing",
            "authority": None,
            "reviewer": None,
            "reviewId": None,
            "headSha": None,
            "scope": INDEPENDENT_REVIEW_SCOPE,
            "observedAt": None,
            "accepted": False,
            "reason": "independent-review-receipt-missing",
        }
    if not isinstance(receipt, dict):
        return {
            "schema": INDEPENDENT_REVIEW_SCHEMA,
            "status": None,
            "authority": None,
            "reviewer": None,
            "reviewId": None,
            "headSha": None,
            "scope": None,
            "observedAt": None,
            "accepted": False,
            "reason": "independent-review-receipt-malformed",
        }
    fields = {
        "schema": receipt.get("schema"),
        "status": receipt.get("status"),
        "authority": receipt.get("authority"),
        "reviewer": receipt.get("reviewer"),
        "reviewId": receipt.get("reviewId"),
        "headSha": receipt.get("headSha"),
        "scope": receipt.get("scope"),
        "observedAt": receipt.get("observedAt"),
    }
    required_shape = (
        fields["schema"] == INDEPENDENT_REVIEW_SCHEMA
        and fields["status"] == "passed"
        and fields["authority"] == INDEPENDENT_REVIEW_AUTHORITY
        and isinstance(fields["reviewer"], str)
        and bool(fields["reviewer"].strip())
        and fields["reviewer"].strip().casefold() != "symphony"
        and isinstance(fields["reviewId"], str)
        and bool(fields["reviewId"])
        and fields["scope"] == INDEPENDENT_REVIEW_SCOPE
        and valid_commit_sha(fields["headSha"], exact=True)
        and valid_commit_sha(expected_head_sha, exact=True)
    )
    if not required_shape:
        return {
            **fields,
            "accepted": False,
            "reason": "independent-review-receipt-malformed",
        }
    if fields["headSha"] != expected_head_sha:
        return {
            **fields,
            "accepted": False,
            "reason": "independent-review-head-mismatch",
        }
    observed_at = parse_time(fields["observedAt"])
    if observed_at is None:
        return {
            **fields,
            "accepted": False,
            "reason": "independent-review-receipt-malformed",
        }
    age = now - observed_at
    if age < -timedelta(minutes=1):
        return {
            **fields,
            "accepted": False,
            "reason": "independent-review-receipt-future",
        }
    if age > RECEIPT_STALE_AFTER:
        return {
            **fields,
            "accepted": False,
            "reason": "independent-review-receipt-stale",
        }
    return {
        **fields,
        "observedAt": isoformat(observed_at),
        "accepted": True,
        "reason": "fresh-exact-head-independent-review",
    }


def observe_independent_review(
    path: Path, expected_head_sha: object, now: datetime
) -> dict[str, Any]:
    if not path.exists():
        return {**validate_independent_review(None, expected_head_sha, now), "source": str(path)}
    try:
        receipt = read_json(path)
    except (OSError, ValueError, json.JSONDecodeError):
        return {
            **validate_independent_review({}, expected_head_sha, now),
            "source": str(path),
        }
    return {
        **validate_independent_review(receipt, expected_head_sha, now),
        "source": str(path),
    }


def transient_gh_observation_error(error: BaseException) -> bool:
    """Whether a GitHub CLI failure is worth a bounded observer retry."""
    if isinstance(error, subprocess.TimeoutExpired):
        return True
    if not isinstance(error, subprocess.CalledProcessError):
        return False
    detail = " ".join(
        str(value or "") for value in (error.stdout, error.stderr)
    ).lower()
    return any(
        marker in detail
        for marker in (
            "http 502",
            "http 503",
            "http 504",
            "gateway timeout",
            "timed out",
            "connection reset",
            "connection refused",
            "temporarily unavailable",
        )
    )


def run_gh_queue_snapshot(repo: str) -> subprocess.CompletedProcess[str]:
    """Fetch a compact queue snapshot with a short bounded retry budget."""
    command = [
        "gh", "pr", "list", "--repo", repo, "--state", "open", "--json",
        "number,isDraft,labels,mergeStateStatus", "--limit", "100",
    ]
    last_error: BaseException | None = None
    for attempt in range(3):
        try:
            return subprocess.run(
                command, check=True, capture_output=True, text=True, timeout=12
            )
        except (OSError, subprocess.SubprocessError) as error:
            last_error = error
            if attempt == 2 or not transient_gh_observation_error(error):
                raise
            # Observation only: provider blips get at most three seconds total.
            time.sleep(attempt + 1)
    assert last_error is not None
    raise last_error


def observe_queue(repo: str, target: int) -> dict[str, Any]:
    """Observe queue demand without a 100-PR nested check-rollup query.

    GitHub's ``mergeStateStatus == CLEAN`` is the compact merge-ready signal
    used here for throughput/backpressure. Exact-head queue admission still
    fetches and classifies required checks immediately before mutation.
    """
    try:
        result = run_gh_queue_snapshot(repo)
        prs = json.loads(result.stdout)
        eligible = [
            pr
            for pr in prs
            if not pr.get("isDraft")
            and not {
                str(label.get("name")) for label in pr.get("labels", [])
            }.intersection({"hold", "gated", "queue-deferred", "needs-human"})
        ]
        green_ready = [pr for pr in eligible if pr.get("mergeStateStatus") == "CLEAN"]
        return {
            "status": "known",
            "eligiblePrs": len(eligible),
            "greenReadyPrs": len(green_ready),
            "target": target,
        }
    except (OSError, subprocess.SubprocessError, ValueError, json.JSONDecodeError) as error:
        return {
            "status": "unknown",
            "eligiblePrs": None,
            "target": target,
            "error": f"queue-observation-failed: {error}",
        }


def evaluate(signals: dict[str, Any], observed_at: str) -> dict[str, Any]:
    reasons: list[dict[str, str]] = []
    integrity_value = signals.get("integrity")
    integrity = (
        integrity_value
        if isinstance(integrity_value, dict)
        else {
            "status": "invalid",
            "detail": "Integrity signal is missing or malformed.",
        }
    )
    main_value = signals.get("main")
    main = main_value if isinstance(main_value, dict) else {"status": "unknown"}
    production_value = signals.get("production")
    production = (
        production_value
        if isinstance(production_value, dict)
        else {"status": "unknown"}
    )
    controller_value = signals.get("controller")
    controller = (
        controller_value
        if isinstance(controller_value, dict)
        else {"status": "unknown"}
    )
    queue_value = signals.get("queue")
    queue = queue_value if isinstance(queue_value, dict) else {"status": "unknown"}
    review = validate_independent_review(
        signals.get("independentReview"),
        main.get("sha"),
        parse_time(observed_at) or utc_now(),
    )
    review_allowed = review["accepted"] is True

    if integrity.get("status") == "active" and integrity.get("reason") in SEVERE_REASONS:
        reasons.append(
            typed_reason(
                str(integrity["reason"]),
                "integrity",
                "critical",
                str(integrity.get("detail") or "Severe integrity incident is active."),
            )
        )
    elif integrity.get("status") not in {"clear", "resolved"}:
        reasons.append(
            typed_reason(
                "invalid-integrity-receipt",
                "integrity",
                "critical",
                str(integrity.get("detail") or "Integrity receipt is invalid."),
            )
        )

    # Cross-field invariant: green health is only deployment authority when
    # production is bound to the exact deployed main SHA. A healthy but
    # stale (or unverifiable) deployment freezes promotion and new leases.
    production_unbound = (
        main.get("status") == "green"
        and production.get("status") == "green"
        and not deployment_bound(main.get("sha"), production.get("deployedSha"))
    )

    if not any(reason["severity"] == "critical" for reason in reasons):
        if controller.get("status") != "green":
            reasons.append(
                typed_reason(
                    "controller-failure" if controller.get("status") == "failed" else "controller-unknown",
                    "controller",
                    "warning",
                    "Symphony controller is not green; promotion is frozen.",
                )
            )
        if main.get("status") != "green":
            reasons.append(
                typed_reason(
                    "main-not-green" if main.get("status") == "red" else "main-unknown",
                    "promotion",
                    "warning",
                    "Main is not green; ready, merge, deploy, and promotion are frozen.",
                )
            )
        if production.get("status") != "green":
            reasons.append(
                typed_reason(
                    "production-not-green"
                    if production.get("status") == "red"
                    else "production-unknown",
                    "promotion",
                    "warning",
                    "Production is not green; deployment and production promotion are frozen.",
                )
            )
        if production_unbound:
            reasons.append(
                typed_reason(
                    "production-deployment-unbound",
                    "promotion",
                    "warning",
                    "Production health is not bound to the exact deployed main SHA; "
                    "promotion is frozen while isolated implementation continues.",
                )
            )
        green_ready_prs = queue.get("greenReadyPrs", queue.get("eligiblePrs"))
        queue_target = queue.get("target")
        queue_shape_valid = (
            queue.get("status") == "known"
            and isinstance(green_ready_prs, int)
            and not isinstance(green_ready_prs, bool)
            and green_ready_prs >= 0
            and isinstance(queue_target, int)
            and not isinstance(queue_target, bool)
            and queue_target > 0
        )
        if not queue_shape_valid:
            reasons.append(
                typed_reason(
                    "queue-unknown",
                    "promotion",
                    "warning",
                    "Promotion queue is missing, unknown, or malformed.",
                )
            )
        # Queue pressure is demand for the promotion controller, not a reason
        # to disable it. Freezing promotion when green_ready_prs reaches the
        # target deadlocks the only path that can drain the backlog. The
        # observed count and target remain in signals.queue for alerting and
        # throughput reporting; malformed or unknown queue evidence still
        # fails closed above.

    critical = any(reason["severity"] == "critical" for reason in reasons)
    if not critical and not review_allowed:
        reasons.append(
            typed_reason(
                str(review["reason"]),
                "review",
                "warning",
                "Normal admission requires a fresh independent review of the exact current main head.",
            )
        )
    state = "RED" if critical else "AMBER" if reasons else "GREEN"
    # Deployment is the operation that can make an unbound healthy production
    # deployment catch up to current main. It therefore cannot require the
    # exact-main binding that only exists *after* deployment. Keep this
    # authority separate from merge/promotion admission and require a verified
    # current-main source SHA plus a known healthy production identity. The
    # Production Controller independently binds signals.main.sha to its exact
    # workflow subject before using this authority.
    deployment_allowed = (
        not critical
        and controller.get("status") == "green"
        and main.get("status") == "green"
        and valid_commit_sha(main.get("sha"), exact=True)
        and production.get("status") == "green"
        and valid_commit_sha(production.get("deployedSha"))
        and review_allowed
    )
    evidence = signals.get("concurrencyEvidence") or {}
    gem_concurrency = 8 if evidence.get("accepted") is True else DEFAULT_GEM_CONCURRENCY
    green_ready_prs = queue.get("greenReadyPrs", queue.get("eligiblePrs"))
    queue_target = queue.get("target")
    queue_shape_valid = (
        queue.get("status") == "known"
        and isinstance(green_ready_prs, int)
        and not isinstance(green_ready_prs, bool)
        and green_ready_prs >= 0
        and isinstance(queue_target, int)
        and not isinstance(queue_target, bool)
        and queue_target > 0
    )
    queue_below_backpressure = queue_shape_valid and green_ready_prs < queue_target
    isolated_promotion_allowed = (
        state == "AMBER"
        and review_allowed
        and controller.get("status") == "green"
        and main.get("status") == "green"
        and production.get("status") == "red"
        and integrity.get("status") in {"clear", "resolved"}
        and queue_below_backpressure
        and all(reason["code"] == "production-not-green" for reason in reasons)
    )
    hold_intake_allowed = (
        state == "AMBER"
        and controller.get("status") == "green"
        and main.get("status") == "green"
        and production.get("status") == "green"
        and production_unbound
        and integrity.get("status") in {"clear", "resolved"}
        and len(reasons) == 1
        and reasons[0]["code"] == "production-deployment-unbound"
    )
    unbound_repair_allowed = (
        hold_intake_allowed
        and review_allowed
        and valid_commit_sha(main.get("sha"), exact=True)
        and valid_commit_sha(production.get("deployedSha"))
    )
    if isolated_promotion_allowed:
        promotion_mode = "isolated-only"
    elif state == "GREEN":
        promotion_mode = "normal"
    elif (
        state == "AMBER"
        and main.get("status") == "red"
        and integrity.get("status") in {"clear", "resolved"}
    ):
        promotion_mode = "draft-only"
    elif hold_intake_allowed:
        promotion_mode = "hold-intake"
    else:
        promotion_mode = "blocked"
    work_activities = (
        []
        if state == "RED"
        else (
            (
                ["approved-issue-lease"]
                if review_allowed and (not queue_shape_valid or queue_below_backpressure)
                else []
            )
            + ["isolated-implementation", "tests", "review", "draft-pr"]
        )
    )
    # Remediation is a liveness capability, not issue intake or promotion.
    # A fleet hold must never hide the evidence or disable the bounded local
    # work needed to diagnose and repair the hold.  Only a non-RED receipt may
    # authorize updating the remote PR head; merge/deploy remain separately
    # governed by their own typed admissions.
    remediation_local_activities = [
        "observe-pr",
        "diagnose-pr",
        "isolated-pr-repair",
        "focused-tests",
        "review",
    ]
    remediation_push_allowed = state != "RED"
    return {
        "schema": SCHEMA,
        "observedAt": observed_at,
        "state": state,
        "promotionMode": promotion_mode,
        "alreadyAdmittedCohort": already_admitted_cohort_semantics(promotion_mode),
        "signals": signals,
        "reasons": reasons,
        "reviewAdmission": {
            "allowed": review_allowed,
            "required": True,
            "authority": INDEPENDENT_REVIEW_AUTHORITY,
            "scope": INDEPENDENT_REVIEW_SCOPE,
            "headSha": review.get("headSha"),
            "observedAt": review.get("observedAt"),
            "reviewId": review.get("reviewId"),
            "reviewer": review.get("reviewer"),
            "reason": review.get("reason"),
        },
        "workAdmission": {
            "allowed": state != "RED",
            "activities": work_activities,
            "newIssueLeaseAllowed": "approved-issue-lease" in work_activities,
        },
        "promotionAdmission": {
            "allowed": state == "GREEN" and review_allowed,
            "activities": ["ready-for-merge", "merge"]
            if state == "GREEN"
            else [],
        },
        "remediationAdmission": {
            "allowed": True,
            "localAllowed": True,
            "pushAllowed": remediation_push_allowed,
            "activities": remediation_local_activities
            + (["expected-head-pr-update"] if remediation_push_allowed else []),
            "maxConcurrent": gem_concurrency,
            "authority": "single-pr-writer-exact-head",
        },
        "deploymentAdmission": {
            "allowed": deployment_allowed,
            "activities": ["deploy-current-main", "production-promotion"]
            if deployment_allowed
            else [],
            "authority": "exact-main-production-controller",
        },
        "productionUnboundRepairAdmission": {
            "allowed": unbound_repair_allowed,
            "condition": "production-deployment-unbound"
            if unbound_repair_allowed
            else None,
            "mainSha": main.get("sha") if unbound_repair_allowed else None,
            "deployedSha": production.get("deployedSha")
            if unbound_repair_allowed
            else None,
            "scope": "event-scoped-exact-pr-head-with-bound-repair-attestation",
            "maxConcurrent": 1,
            "deploymentsAllowed": False,
            "authority": "canonical-merge-queue-controller",
        },
        "isolatedPromotionAdmission": {
            "allowed": isolated_promotion_allowed,
            "activities": ["ready-for-merge", "native-merge-queue", "merge"]
            if isolated_promotion_allowed
            else [],
            "deploymentsAllowed": False,
            "scope": "exact-head-semantically-isolated-ui-docs",
            "maxConcurrent": 1,
            "authority": "canonical-merge-queue-controller",
        },
        "ownership": {
            "controller": "Gem",
            "implementation": "Symphony",
            "review": INDEPENDENT_REVIEW_AUTHORITY,
            "directGemPickup": False,
            "reason": "single implementation owner prevents duplicate pickup",
        },
        "concurrency": {
            "gem": {
                "maxConcurrent": gem_concurrency,
                "evidenceAccepted": gem_concurrency == 8,
            },
            "symphonyImplementation": "event-driven-backpressure",
        },
    }


def write_receipt(receipt: dict[str, Any], state_dir: Path) -> None:
    """Commit the hold first, then publish latest.json as the commit marker.

    A partial commit must never expose a fresh GREEN receipt while the
    direct-pickup hold is absent or stale, so the hold is written atomically
    and verified before latest.json is replaced. If the publish fails, the
    previous receipt stays in place and consumers fail closed on staleness.
    """
    state_dir.mkdir(parents=True, exist_ok=True)
    hold = {
        "schema": "gem-direct-pickup-hold/v1",
        "observedAt": receipt["observedAt"],
        "reason": receipt["ownership"]["reason"],
    }
    pause_file = state_dir.parent.parent / ".gem-ship-paused-pr-queue"
    hold_temporary = pause_file.with_name(pause_file.name + ".tmp")
    hold_temporary.write_text(json.dumps(hold, sort_keys=True) + "\n", encoding="utf-8")
    hold_temporary.replace(pause_file)
    persisted_hold = read_json(pause_file)
    if json.dumps(persisted_hold, sort_keys=True) != json.dumps(hold, sort_keys=True):
        raise ValueError("direct-pickup hold failed post-write readback")
    destination = state_dir / "latest.json"
    temporary = state_dir / "latest.json.tmp"
    temporary.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(destination)


def acquire_writer_lock(state_dir: Path, timeout_seconds: float = WRITER_LOCK_TIMEOUT_SECONDS) -> int:
    """Serialize the compare-and-commit section to one writer.

    The native merge queue owns promotion; this lock only orders receipt
    refreshes so a slower, older observation can never overwrite a fresher
    persisted receipt. Observation happens before the lock is taken; a
    contested lock past the timeout fails closed.
    """
    state_dir.mkdir(parents=True, exist_ok=True)
    fd = os.open(state_dir / ".writer.lock", os.O_RDWR | os.O_CREAT, 0o644)
    deadline = time.monotonic() + timeout_seconds
    while True:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return fd
        except BlockingIOError:
            if time.monotonic() >= deadline:
                os.close(fd)
                raise TimeoutError(
                    f"fleet gate writer lock stayed contested for {timeout_seconds}s"
                ) from None
            time.sleep(0.2)


def release_writer_lock(fd: int) -> None:
    try:
        fcntl.flock(fd, fcntl.LOCK_UN)
    finally:
        os.close(fd)


def alarm_if_previous_receipt_stale(state_dir: Path, now: datetime) -> None:
    """Surface stale persisted state before repairing it.

    The refresh still proceeds; the alarm records how long the canonical
    receipt went without a writer so the gap is visible in controller logs.
    """
    destination = state_dir / "latest.json"
    detail: str | None = None
    if not destination.exists():
        detail = "no persisted receipt exists"
    else:
        try:
            previous = read_json(destination)
            observed_at = parse_time(previous.get("observedAt"))
            if previous.get("schema") != SCHEMA or observed_at is None:
                detail = "persisted receipt is malformed"
            elif now - observed_at > RECEIPT_STALE_AFTER:
                age_seconds = int((now - observed_at).total_seconds())
                detail = f"persisted receipt was stale for {age_seconds}s before refresh"
        except (OSError, ValueError, json.JSONDecodeError):
            detail = "persisted receipt could not be read"
    if detail is None:
        return
    prefix = "::warning::" if os.environ.get("GITHUB_ACTIONS") == "true" else "WARNING:"
    print(f"{prefix} fleet gate receipt refresh repaired stale state: {detail}", file=sys.stderr)


def persisted_observed_at(state_dir: Path) -> datetime | None:
    """Observation time of the canonical receipt, or None when unusable."""
    try:
        persisted = read_json(state_dir / "latest.json")
    except (OSError, ValueError, json.JSONDecodeError):
        return None
    if persisted.get("schema") != SCHEMA:
        return None
    return parse_time(persisted.get("observedAt"))


def verify_persisted_receipt(state_dir: Path, receipt: dict[str, Any]) -> None:
    """Fail closed unless the canonical receipt holds exactly this evaluation."""
    persisted = read_json(state_dir / "latest.json")
    if json.dumps(persisted, sort_keys=True) != json.dumps(receipt, sort_keys=True):
        raise ValueError("persisted fleet gate receipt failed semantic post-write readback")


def failed_evaluation_receipt(
    error: BaseException, observed_at: str | None = None
) -> dict[str, Any]:
    """Schema-valid blocked receipt so Auto-Enroll can skip instead of going red.

    Built without calling evaluate(): that is the path that just failed.
    The previous stub only printed schema + admission booleans. Auto-Enroll
    jq then fail-closed (`Fleet gate emitted a malformed receipt.`) and the
    whole event-driven admit lane went red. A blocked receipt must still
    carry observedAt, signals, isolatedPromotionAdmission, and promotionMode.
    """
    promotion_mode = "blocked"
    return {
        "schema": SCHEMA,
        "observedAt": observed_at or isoformat(utc_now()),
        "state": "RED",
        "promotionMode": promotion_mode,
        "alreadyAdmittedCohort": already_admitted_cohort_semantics(promotion_mode),
        "signals": {
            "main": {"status": "unknown", "sha": UNKNOWN_MAIN_SHA},
            "production": {"status": "unknown"},
            "controller": {"status": "unknown"},
            "integrity": {"status": "invalid", "detail": str(error)},
            "queue": {"status": "unknown", "eligiblePrs": None, "target": 0},
            "independentReview": {
                "schema": INDEPENDENT_REVIEW_SCHEMA,
                "status": "unknown",
                "accepted": False,
                "reason": "independent-review-receipt-malformed",
            },
        },
        "reasons": [
            typed_reason(
                "gate-evaluation-failed",
                "integrity",
                "critical",
                str(error),
            )
        ],
        "reviewAdmission": {
            "allowed": False,
            "required": True,
            "authority": INDEPENDENT_REVIEW_AUTHORITY,
            "scope": INDEPENDENT_REVIEW_SCOPE,
            "headSha": None,
            "observedAt": None,
            "reviewId": None,
            "reviewer": None,
            "reason": "independent-review-receipt-malformed",
        },
        "workAdmission": {
            "allowed": False,
            "activities": [],
            "newIssueLeaseAllowed": False,
        },
        "promotionAdmission": {"allowed": False, "activities": []},
        "remediationAdmission": {
            "allowed": True,
            "localAllowed": True,
            "pushAllowed": False,
            "activities": [
                "observe-pr",
                "diagnose-pr",
                "isolated-pr-repair",
                "focused-tests",
                "review",
            ],
            "maxConcurrent": DEFAULT_GEM_CONCURRENCY,
            "authority": "single-pr-writer-exact-head",
        },
        "deploymentAdmission": {
            "allowed": False,
            "activities": [],
            "authority": "exact-main-production-controller",
        },
        "isolatedPromotionAdmission": {
            "allowed": False,
            "activities": [],
            "deploymentsAllowed": False,
            "scope": "exact-head-semantically-isolated-ui-docs",
            "maxConcurrent": 1,
            "authority": "canonical-merge-queue-controller",
        },
        "ownership": {
            "controller": "Gem",
            "implementation": "Symphony",
            "review": INDEPENDENT_REVIEW_AUTHORITY,
            "directGemPickup": False,
            "reason": "single implementation owner prevents duplicate pickup",
        },
        "concurrency": {
            "gem": {
                "maxConcurrent": DEFAULT_GEM_CONCURRENCY,
                "evidenceAccepted": False,
            },
            "symphonyImplementation": "event-driven-backpressure",
        },
    }


def warn_live_receipt_not_persisted(error: BaseException) -> None:
    prefix = "::warning::" if os.environ.get("GITHUB_ACTIONS") == "true" else "WARNING:"
    print(f"{prefix} fleet gate live receipt not persisted: {error}", file=sys.stderr)


def persist_live_receipt(
    receipt: dict[str, Any], state_dir: Path, now: datetime
) -> dict[str, Any]:
    """Best-effort persist. The live evaluation remains the printed authority.

    GitHub-hosted runners (and any host without /home/timwhite/gem-workspace)
    cannot create the Gem state dir. Throwing there used to replace a complete
    live receipt with an incomplete stub. Consumers must still receive the
    live evaluation so Auto-Enroll can skip or admit from schema-valid JSON.
    """
    try:
        lock_fd = acquire_writer_lock(state_dir)
    except (OSError, TimeoutError) as error:
        warn_live_receipt_not_persisted(error)
        return receipt
    try:
        persisted_at = persisted_observed_at(state_dir)
        if persisted_at is not None and persisted_at >= now:
            try:
                return read_json(state_dir / "latest.json")
            except (OSError, ValueError, json.JSONDecodeError) as error:
                warn_live_receipt_not_persisted(error)
                return receipt
        write_receipt(receipt, state_dir)
        verify_persisted_receipt(state_dir, receipt)
        return receipt
    except (OSError, ValueError, json.JSONDecodeError) as error:
        warn_live_receipt_not_persisted(error)
        return receipt
    finally:
        release_writer_lock(lock_fd)


def consumer_exit_code(receipt: dict[str, Any], consumer: str) -> int:
    allowed = {
        "direct-gem": receipt["ownership"]["directGemPickup"],
        "fleet": receipt["workAdmission"]["allowed"],
        "remediation": receipt["remediationAdmission"]["allowed"],
        "promotion": receipt["promotionAdmission"]["allowed"],
        "deployment": receipt["deploymentAdmission"]["allowed"],
    }[consumer]
    return 0 if allowed else 2


def emit_receipt(receipt: dict[str, Any], consumer: str) -> int:
    print(json.dumps(receipt, indent=2, sort_keys=True))
    return consumer_exit_code(receipt, consumer)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--evaluate-json")
    parser.add_argument(
        "--consumer",
        choices=("direct-gem", "fleet", "remediation", "promotion", "deployment"),
        default="direct-gem",
    )
    parser.add_argument(
        "--repo",
        default=os.environ.get("GEM_PRIORITY_GATE_REPO")
        or os.environ.get("GEM_PR_DRAIN_REPO")
        or "JovieInc/Jovie",
    )
    parser.add_argument("--queue-target", type=int, default=15)
    parser.add_argument(
        "--production-url",
        default=os.environ.get("JOVIE_PRODUCTION_HEALTH_URL")
        or "https://jov.ie/api/health/deploy",
    )
    parser.add_argument("--symphony-url", default="http://127.0.0.1:4041/api/v1/state")
    parser.add_argument(
        "--lease-guard-bin",
        default=os.environ.get("SYMPHONY_LEASE_GUARD_BIN")
        or str(Path.home() / ".local/bin/symphony-lease-guard"),
    )
    parser.add_argument(
        "--state-dir",
        type=Path,
        default=Path(
            os.environ.get(
                "GEM_PRIORITY_GATE_STATE_DIR",
                "/home/timwhite/gem-workspace/state/gem-priority-gate",
            )
        ),
    )
    parser.add_argument("--integrity-receipt", type=Path)
    parser.add_argument("--concurrency-evidence", type=Path)
    parser.add_argument("--independent-review-receipt", type=Path)
    return parser.parse_args()


def observe_signals(args: argparse.Namespace, now: datetime) -> dict[str, Any]:
    integrity_path = args.integrity_receipt or args.state_dir.parent / "integrity.json"
    concurrency_path = args.concurrency_evidence or args.state_dir.parent / "concurrency.json"
    main = observe_main(args.repo)
    review_path = (
        args.independent_review_receipt
        or args.state_dir.parent / "independent-review.json"
    )
    return {
        "main": main,
        "production": observe_production(args.production_url),
        "controller": observe_controller(args.symphony_url),
        "integrity": observe_integrity(integrity_path),
        "queue": observe_queue(args.repo, args.queue_target),
        "concurrencyEvidence": observe_concurrency(concurrency_path, now),
        "independentReview": observe_independent_review(
            review_path, main.get("sha"), now
        ),
        "lease": observe_lease(args.lease_guard_bin),
    }


def main() -> int:
    try:
        args = parse_args()
        if args.evaluate_json:
            signals = json.loads(args.evaluate_json)
            if not isinstance(signals, dict):
                raise ValueError("--evaluate-json must be a JSON object")
            receipt = evaluate(signals, isoformat(utc_now()))
        elif args.dry_run:
            now = utc_now()
            receipt = evaluate(observe_signals(args, now), isoformat(now))
        else:
            # Observe outside the writer lock: network observation can outlast
            # the competing-writer timeout, so only the fast compare-and-commit
            # section is serialized. A slower writer whose observation predates
            # the persisted receipt never overwrites fresher state.
            now = utc_now()
            alarm_if_previous_receipt_stale(args.state_dir, now)
            receipt = evaluate(observe_signals(args, now), isoformat(now))
            receipt = persist_live_receipt(receipt, args.state_dir, now)
        return emit_receipt(receipt, args.consumer)
    except (OSError, ValueError, json.JSONDecodeError, TimeoutError) as error:
        return emit_receipt(failed_evaluation_receipt(error), "fleet")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # noqa: BLE001 - last-resort schema-valid blocked receipt
        raise SystemExit(emit_receipt(failed_evaluation_receipt(error), "fleet"))
