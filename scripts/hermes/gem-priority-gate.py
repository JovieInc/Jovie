#!/usr/bin/env python3
"""Versioned Gem fleet gate with separate work and promotion admission.

Gem observes main, queue, controller, and explicit integrity receipts. Symphony
remains the only implementation owner, so the legacy direct Gem ship loop is
held even while the fleet work-admission gate permits approved Linear leases.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


SCHEMA = "jovie-fleet-gate/v1"
INTEGRITY_SCHEMA = "jovie-integrity/v1"
CONCURRENCY_SCHEMA = "gem-concurrency-evidence/v1"
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
        checks = gh_json(repo, f"commits/{sha}/check-runs?per_page=100")
        failed: list[str] = []
        pending: list[str] = []
        for run in checks.get("check_runs", []):
            name = str(run.get("name") or "unnamed-check")
            if run.get("status") != "completed":
                pending.append(name)
            elif run.get("conclusion") not in {"success", "neutral", "skipped"}:
                failed.append(name)
        combined_state = str(combined.get("state") or "unknown")
        green = combined_state == "success" and not failed and not pending
        return {
            "status": "green" if green else "red",
            "sha": sha,
            "combinedStatus": combined_state,
            "failedChecks": sorted(set(failed)),
            "pendingChecks": sorted(set(pending)),
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


def observe_queue(repo: str, target: int) -> dict[str, Any]:
    try:
        result = subprocess.run(
            [
                "gh",
                "pr",
                "list",
                "--repo",
                repo,
                "--state",
                "open",
                "--json",
                "isDraft,labels",
                "--limit",
                "100",
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=20,
        )
        prs = json.loads(result.stdout)
        eligible = [
            pr
            for pr in prs
            if not pr.get("isDraft")
            and not {
                str(label.get("name")) for label in pr.get("labels", [])
            }.intersection({"hold", "gated", "queue-deferred", "needs-human"})
        ]
        return {"status": "known", "eligiblePrs": len(eligible), "target": target}
    except (OSError, subprocess.SubprocessError, ValueError, json.JSONDecodeError) as error:
        return {
            "status": "unknown",
            "eligiblePrs": None,
            "target": target,
            "error": f"queue-observation-failed: {error}",
        }


def evaluate(signals: dict[str, Any], observed_at: str) -> dict[str, Any]:
    reasons: list[dict[str, str]] = []
    integrity = signals.get("integrity") or {"status": "clear"}
    main = signals.get("main") or {"status": "unknown"}
    controller = signals.get("controller") or {"status": "unknown"}
    queue = signals.get("queue") or {"status": "unknown"}

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
        if queue.get("status") != "known":
            reasons.append(
                typed_reason(
                    "queue-unknown",
                    "promotion",
                    "warning",
                    "Promotion queue is unknown.",
                )
            )
        elif int(queue.get("eligiblePrs") or 0) > int(queue.get("target") or 0):
            reasons.append(
                typed_reason(
                    "queue-above-target",
                    "promotion",
                    "warning",
                    "Promotion queue is above its target.",
                )
            )

    critical = any(reason["severity"] == "critical" for reason in reasons)
    state = "RED" if critical else "AMBER" if reasons else "GREEN"
    evidence = signals.get("concurrencyEvidence") or {}
    gem_concurrency = 8 if evidence.get("accepted") is True else DEFAULT_GEM_CONCURRENCY
    return {
        "schema": SCHEMA,
        "observedAt": observed_at,
        "state": state,
        "signals": signals,
        "reasons": reasons,
        "workAdmission": {
            "allowed": state != "RED",
            "activities": []
            if state == "RED"
            else ["approved-issue-lease", "isolated-implementation", "tests", "review", "draft-pr"],
        },
        "promotionAdmission": {
            "allowed": state == "GREEN",
            "activities": ["ready-for-merge", "merge", "deploy", "production-promotion"]
            if state == "GREEN"
            else [],
        },
        "ownership": {
            "controller": "Gem",
            "implementation": "Symphony",
            "directGemPickup": False,
            "reason": "single implementation owner prevents duplicate pickup",
        },
        "concurrency": {
            "gem": {
                "maxConcurrent": gem_concurrency,
                "evidenceAccepted": gem_concurrency == 8,
            },
            "symphonyImplementation": 1,
        },
    }


def write_receipt(receipt: dict[str, Any], state_dir: Path) -> None:
    state_dir.mkdir(parents=True, exist_ok=True)
    destination = state_dir / "latest.json"
    temporary = state_dir / "latest.json.tmp"
    temporary.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(destination)
    pause_file = state_dir.parent.parent / ".gem-ship-paused-pr-queue"
    pause_file.write_text(
        json.dumps(
            {
                "schema": "gem-direct-pickup-hold/v1",
                "observedAt": receipt["observedAt"],
                "reason": receipt["ownership"]["reason"],
            },
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--evaluate-json")
    parser.add_argument(
        "--consumer", choices=("direct-gem", "fleet", "promotion"), default="direct-gem"
    )
    parser.add_argument("--repo", default="itstimwhite/Jovie")
    parser.add_argument("--queue-target", type=int, default=5)
    parser.add_argument("--symphony-url", default="http://127.0.0.1:4041/api/v1/state")
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
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    now = utc_now()
    observed_at = isoformat(now)
    if args.evaluate_json:
        signals = json.loads(args.evaluate_json)
        if not isinstance(signals, dict):
            raise ValueError("--evaluate-json must be a JSON object")
    else:
        integrity_path = args.integrity_receipt or args.state_dir.parent / "integrity.json"
        concurrency_path = args.concurrency_evidence or args.state_dir.parent / "concurrency.json"
        signals = {
            "main": observe_main(args.repo),
            "controller": observe_controller(args.symphony_url),
            "integrity": observe_integrity(integrity_path),
            "queue": observe_queue(args.repo, args.queue_target),
            "concurrencyEvidence": observe_concurrency(concurrency_path, now),
        }
    receipt = evaluate(signals, observed_at)
    if not args.dry_run and not args.evaluate_json:
        write_receipt(receipt, args.state_dir)
    print(json.dumps(receipt, indent=2, sort_keys=True))
    allowed = {
        "direct-gem": receipt["ownership"]["directGemPickup"],
        "fleet": receipt["workAdmission"]["allowed"],
        "promotion": receipt["promotionAdmission"]["allowed"],
    }[args.consumer]
    return 0 if allowed else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(
            json.dumps(
                {
                    "schema": SCHEMA,
                    "state": "RED",
                    "workAdmission": {"allowed": False},
                    "promotionAdmission": {"allowed": False},
                    "reasons": [
                        typed_reason(
                            "gate-evaluation-failed",
                            "integrity",
                            "critical",
                            str(error),
                        )
                    ],
                },
                indent=2,
                sort_keys=True,
            )
        )
        raise SystemExit(2)
