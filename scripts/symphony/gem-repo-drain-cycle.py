#!/usr/bin/env python3
"""Run one policy-checked rehabilitation pass per allowlisted repository."""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gem_repo_registry import pr_drain_repos
import publisher_self_repair
import symphony_accepted_completion

JOVIE_REPOSITORY = "JovieInc/Jovie"
TASK_KEY = re.compile(r"^[a-f0-9]{64}$")
SOURCE_SHA = re.compile(r"^[a-f0-9]{40}$")
ISSUE_ID = re.compile(r"^JOV-[1-9][0-9]*$")
NATIVE_QUEUE_ACTION = "reconcile-native-queue-starvation"


def report_delivery(stage: str, result) -> None:
    """Expose bounded correlation/error metadata, never raw child output or keys."""
    report = {"schema": "jovie.summer-delivery-observation/v1",
              "stage": stage, "returncode": result.returncode}
    stdout = getattr(result, "stdout", "") or ""
    stderr = getattr(result, "stderr", "") or ""
    if result.returncode:
        report["stderrSha256"] = hashlib.sha256(stderr.encode()).hexdigest()
        error = re.search(r"(?:^|\n)(HTTPError|URLError|ValueError|TypeError|KeyError|OSError|TimeoutError|JSONDecodeError|FileNotFoundError|PermissionError):", stderr)
        report["errorType"] = error.group(1) if error else "child-process-failed"
        http = re.search(r"HTTP Error ([1-5][0-9]{2}):", stderr)
        if http:
            report["httpStatus"] = int(http.group(1))
    else:
        try:
            value = json.loads(stdout)
        except (ValueError, TypeError):
            value = {}
        if isinstance(value, dict):
            receipt = value.get("eve", {})
            receipt = receipt.get("receipt", {}) if isinstance(receipt, dict) else {}
            for key in ("eventId", "taskKey", "status", "state", "reason"):
                item = value.get(key) or (receipt.get(key) if isinstance(receipt, dict) else None)
                if isinstance(item, str) and re.fullmatch(r"[A-Za-z0-9_.:-]{1,160}", item):
                    report[key] = item
    print(json.dumps(report, sort_keys=True), flush=True)


def run_capacity_projection() -> int:
    """Re-project useful-turn proofs into the capacity receipt every cycle.

    Completion acceptance is allowed to fail (attestation drift, GitHub
    outages, bootstrap with no enrolled identities); the fleet gate and the
    admitter still need a fresh, typed receipt so closed capacity is
    distinguishable from stale or missing evidence (JOV-INV-007).
    """
    try:
        projection = subprocess.run(
            [
                sys.executable,
                str(Path(__file__).with_name("symphony_capacity_evidence.py")),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return 1
    return projection.returncode


def run_summer_bottleneck_producer() -> int:
    """Refresh Jovie's fleet receipt and publish one snapshot per timer cadence."""
    workspace = Path(
        os.environ.get("GEM_WORKSPACE", Path(__file__).resolve().parents[1])
    )
    state_dir = workspace / "state/gem-priority-gate"
    gate = subprocess.run(
        [
            sys.executable,
            str(Path(__file__).with_name("gem-priority-gate.py")),
            "--consumer",
            "remediation",
            "--repo",
            JOVIE_REPOSITORY,
            "--state-dir",
            str(state_dir),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    # A policy hold is a valid, persisted observation for the producer. Other
    # exit codes identify an observation or contract failure.
    if gate.returncode not in {0, 2}:
        report_delivery("fleet-observation", gate)
        return gate.returncode or 1
    producer = subprocess.run(
        [
            sys.executable,
            str(Path(__file__).with_name("summer_bottleneck_producer.py")),
            "--submit",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    report_delivery("publication", producer)
    return producer.returncode


def native_queue_execution_argv(stdout: str, fleet_path: Path) -> list[str] | None:
    """Bind one consumer projection to the execute CLI, or skip."""
    try:
        value = json.loads(stdout)
    except (ValueError, TypeError):
        return None
    if not isinstance(value, dict):
        return None
    if value.get("status") != "projection-recorded":
        return None
    if value.get("action") != NATIVE_QUEUE_ACTION:
        return None
    task_key = value.get("taskKey")
    issue = value.get("issueIdentifier")
    source_version = value.get("sourceVersion")
    snapshot_digest = value.get("snapshotDigest")
    if not (
        isinstance(task_key, str)
        and TASK_KEY.fullmatch(task_key)
        and isinstance(issue, str)
        and ISSUE_ID.fullmatch(issue)
        and isinstance(source_version, str)
        and SOURCE_SHA.fullmatch(source_version)
        and isinstance(snapshot_digest, str)
        and TASK_KEY.fullmatch(snapshot_digest)
    ):
        return None
    return [
        "node",
        str(Path(__file__).with_name("run-native-queue-execution.mjs")),
        task_key,
        issue,
        source_version,
        snapshot_digest,
        str(fleet_path),
    ]


def run_native_queue_starvation_execute(stdout: str) -> int:
    """Record the signed terminal for the just-projected native-queue child."""
    workspace = Path(
        os.environ.get("GEM_WORKSPACE", Path(__file__).resolve().parents[1])
    )
    fleet_path = workspace / "state/gem-priority-gate/latest.json"
    argv = native_queue_execution_argv(stdout, fleet_path)
    if argv is None:
        return 0
    try:
        executed = subprocess.run(
            argv,
            capture_output=True,
            text=True,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return 1
    report_delivery("native-queue-execution", executed)
    return executed.returncode


def maybe_restart_publisher(consumer_status: str | None) -> None:
    """After 3 consecutive Gem publisher-missing holds, restart the allowlisted unit."""
    workspace = Path(
        os.environ.get("GEM_WORKSPACE", Path(__file__).resolve().parents[1])
    )
    fleet_path = workspace / "state/gem-priority-gate/latest.json"
    attest_path = workspace / "state/gem-service-attestation.json"
    streak_path = workspace / "state/publisher-self-repair-streak.json"
    try:
        fleet = json.loads(fleet_path.read_text())
        attestation = json.loads(attest_path.read_text())
        previous = (
            json.loads(streak_path.read_text()) if streak_path.exists() else None
        )
    except (OSError, ValueError, TypeError):
        fleet, attestation, previous = {}, {}, None
    queue = fleet.get("signals", {}).get("queue", {}) if isinstance(fleet, dict) else {}
    reason = publisher_self_repair.publisher_missing_reason(
        attestation_healthy=(
            isinstance(attestation, dict)
            and attestation.get("schema") == "gem-service-attestation/v1"
            and attestation.get("healthy") is True
        ),
        green_ready=queue.get("greenReadyPrs") if isinstance(queue, dict) else 0,
        blocked_since=queue.get("blockedSince") if isinstance(queue, dict) else None,
        consumer_status=consumer_status,
    )
    observed_at = (
        fleet.get("observedAt")
        if isinstance(fleet, dict) and isinstance(fleet.get("observedAt"), str)
        else ""
    )
    streak = publisher_self_repair.next_streak(previous, reason, observed_at)
    streak_path.parent.mkdir(parents=True, exist_ok=True)
    streak_path.write_text(json.dumps(streak, indent=2, sort_keys=True) + "\n")
    unit = streak.get("unit")
    if streak.get("restart") is True and isinstance(unit, str) and unit in publisher_self_repair.PUBLISHER_UNITS:
        subprocess.run(
            ["systemctl", "--user", "restart", unit],
            capture_output=True,
            text=True,
            check=False,
        )
        print(
            json.dumps(
                {
                    "schema": "jovie.summer-delivery-observation/v1",
                    "stage": "publisher-self-repair",
                    "reason": streak.get("reason"),
                    "count": streak.get("count"),
                    "unit": unit,
                },
                sort_keys=True,
            ),
            flush=True,
        )


def run_summer_symphony_consumer() -> int:
    """Consume at most one verified Summer task, then execute native-queue."""
    consumer = subprocess.run(
        [
            "node",
            str(Path(__file__).with_name("summer-symphony-outbox-consumer.mjs")),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    report_delivery("outbox-consumption", consumer)
    status = None
    if consumer.returncode == 0:
        try:
            payload = json.loads(consumer.stdout or "")
        except (ValueError, TypeError):
            payload = {}
        if isinstance(payload, dict) and isinstance(payload.get("status"), str):
            status = payload["status"]
    maybe_restart_publisher(status)
    if consumer.returncode != 0:
        return consumer.returncode
    return run_native_queue_starvation_execute(consumer.stdout or "")


def main() -> int:
    # Completion acceptance is independent of remediationAdmission. Running it
    # first lets a previously merged provider result restore measured capacity
    # when the prior receipt correctly failed closed at zero.
    try:
        symphony_accepted_completion.reconcile(
            symphony_accepted_completion.parser().parse_args([])
        )
        completion_returncode = 0
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        completion_returncode = 78
    # The projection runs even when acceptance fails: a fresh closed receipt is
    # observable, while a stale or missing one reads as evidence loss.
    projection_returncode = run_capacity_projection()
    results: list[tuple[str, int]] = []
    for repo in pr_drain_repos():
        environment = os.environ.copy()
        environment["GEM_PR_DRAIN_REPO"] = repo.github
        process = subprocess.run(
            [sys.executable, str(Path(__file__).with_name("gem-pr-drain.py")), *sys.argv[1:]],
            env=environment,
            text=True,
            check=False,
        )
        results.append((repo.github, process.returncode))
    # This cadence is fleet-wide, but the Summer bridge is Jovie-only and does
    # not depend on Jovie being enabled for PR drain. Run it after every repo so
    # its failure cannot prevent another repository's rehabilitation pass.
    try:
        summer_returncode = run_summer_bottleneck_producer()
    except (OSError, subprocess.SubprocessError):
        summer_returncode = 1
    # Consumer failure is separately observable and cannot suppress repository
    # drains or the next producer refresh.
    try:
        consumer_returncode = run_summer_symphony_consumer()
    except (OSError, subprocess.SubprocessError):
        consumer_returncode = 1
    print("Gem PR rehabilitation cycle:")
    print(f"Accepted completion reconciliation: rc={completion_returncode}")
    print(f"Capacity evidence projection: rc={projection_returncode}")
    for repo, returncode in results:
        print(f"  {repo}: rc={returncode}")
    print(f"Summer Jovie bottleneck snapshot: rc={summer_returncode}")
    print(f"Summer Symphony outbox consumer: rc={consumer_returncode}")
    # Repo rehabilitation failures stay printed above. The unit succeeds when
    # the Jovie Summer snapshot and consumer/execute path succeed so an Eve
    # terminal is not masked by an independent GateContractError on one repo.
    return 0 if summer_returncode == 0 and consumer_returncode == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
