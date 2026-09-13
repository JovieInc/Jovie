#!/usr/bin/env python3
"""Run one policy-checked rehabilitation pass per allowlisted repository."""

from __future__ import annotations

import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gem_repo_registry import pr_drain_repos
import publisher_self_repair
import symphony_accepted_completion

JOVIE_REPOSITORY = "JovieInc/Jovie"
TASK_KEY = re.compile(r"^[a-f0-9]{64}$")
SOURCE_SHA = re.compile(r"^(?!0{40})[a-f0-9]{40}$")
ISSUE_ID = re.compile(r"^JOV-[1-9][0-9]*$")
NATIVE_QUEUE_ACTION = "reconcile-native-queue-starvation"
RELEASE_CERT_ACTION = "reconcile-release-certification-starvation"
ENROLLABLE_ACTIONS = frozenset({NATIVE_QUEUE_ACTION, RELEASE_CERT_ACTION})


def report_delivery(stage: str, result, **extra) -> None:
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
            for key in ("eventId", "taskKey", "status", "state", "reason", "detail"):
                item = value.get(key) or (receipt.get(key) if isinstance(receipt, dict) else None)
                if isinstance(item, str) and re.fullmatch(r"[A-Za-z0-9_.:# /-]{1,240}", item):
                    report[key] = item
        pr = value.get("pr") if isinstance(value, dict) else None
        if isinstance(pr, int) and not isinstance(pr, bool) and pr > 0:
            report["pr"] = pr
    for key, item in extra.items():
        if isinstance(item, str) and re.fullmatch(r"[A-Za-z0-9_.:# /-]{1,240}", item):
            report[key] = item
    print(json.dumps(report, sort_keys=True), flush=True)

# The Node consumer already emits a cycle result on stdout, but the parent
# timer wrapper previously discarded it. Keep the durable wrapper receipt
# additive to the consumer's state schema so a `started` receipt identifies a
# missing terminal observation without changing consumer ownership.
CONSUMER_CYCLE_SCHEMA = "jovie.summer-symphony-consumer-cycle/v1"
CONSUMER_INVOCATION_SCHEMA = "jovie.summer-symphony-consumer-invocation/v1"
CONSUMER_INVOCATION_RECEIPT = "invocation-latest.json"
CONSUMER_REJECTION_RETURN_CODE = 78
_CONSUMER_STATUSES = frozenset(
    {
        "idle",
        "scan-deferred",
        "execution-held",
        "execution-recorded",
        "projection-recorded",
    }
)
_CONSUMER_OUTCOME_FIELDS = (
    "schema",
    "status",
    "taskKey",
    "reason",
    "acknowledgement",
    "issueIdentifier",
)
_CONSUMER_TASK_KEY = re.compile(r"^[a-f0-9]{64}$")
_CONSUMER_ISSUE = re.compile(r"^JOV-[1-9][0-9]*$")
_CONSUMER_ACKNOWLEDGEMENTS = frozenset({"recorded", "replay"})
_CONSUMER_REJECTION = re.compile(
    r"^SUMMER_SYMPHONY_CONSUMER_REJECTED reason=(?P<reason>.+)$"
)
_REDACTION_PATTERNS = (
    re.compile(
        r"(?i)\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]+",
    ),
    re.compile(
        r"(?i)\b(?:[A-Za-z0-9_-]*(?:token|secret|password|api[_-]?key|"
        r"authorization|private[_-]?key))\s*[:=]\s*[^\s,;]+",
    ),
    re.compile(r"(?i)\b(?:ghp|github_pat|xai|sk)-[A-Za-z0-9_-]{8,}\b"),
    re.compile(
        r"(?s)-----BEGIN [^-]+-----.*?-----END [^-]+-----",
    ),
)


def _utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace(
        "+00:00", "Z"
    )


def _consumer_workspace(workspace: str | Path | None = None) -> Path:
    value = workspace if workspace is not None else os.environ.get("GEM_WORKSPACE")
    resolved = Path(value) if value else Path(__file__).resolve().parents[1]
    resolved = resolved.expanduser()
    if not resolved.is_absolute():
        raise ValueError("GEM_WORKSPACE-must-be-absolute")
    return resolved


def consumer_invocation_receipt_path(workspace: str | Path | None = None) -> Path:
    """Return the additive receipt path beside the consumer's private journal."""
    return (
        _consumer_workspace(workspace)
        / "state"
        / "summer-symphony-consumer"
        / CONSUMER_INVOCATION_RECEIPT
    )


def _assert_owned_directory(path: Path, exact_mode: int | None = None) -> None:
    metadata = path.lstat()
    if not stat.S_ISDIR(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode):
        raise PermissionError("consumer-state-directory-unsafe")
    if exact_mode is None and stat.S_IMODE(metadata.st_mode) & 0o022:
        raise PermissionError("consumer-state-directory-unsafe")
    if exact_mode is not None and stat.S_IMODE(metadata.st_mode) != exact_mode:
        raise PermissionError("consumer-state-directory-unsafe")
    if hasattr(os, "getuid") and metadata.st_uid != os.getuid():
        raise PermissionError("consumer-state-directory-unsafe")


def _ensure_consumer_receipt_directory(workspace: str | Path | None = None) -> Path:
    root = _consumer_workspace(workspace)
    _assert_owned_directory(root)
    shared = root / "state"
    try:
        shared.mkdir(mode=0o700)
    except FileExistsError:
        pass
    _assert_owned_directory(shared)
    private = shared / "summer-symphony-consumer"
    try:
        private.mkdir(mode=0o700)
    except FileExistsError:
        pass
    _assert_owned_directory(private, exact_mode=0o700)
    try:
        private.resolve(strict=True).relative_to(root.resolve(strict=True))
    except ValueError as error:
        raise PermissionError("consumer-state-directory-unsafe") from error
    return private


def _assert_owned_receipt(path: Path) -> None:
    metadata = path.lstat()
    if not stat.S_ISREG(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode):
        raise PermissionError("consumer-invocation-receipt-unsafe")
    if stat.S_IMODE(metadata.st_mode) != 0o600:
        raise PermissionError("consumer-invocation-receipt-unsafe")
    if hasattr(os, "getuid") and metadata.st_uid != os.getuid():
        raise PermissionError("consumer-invocation-receipt-unsafe")


def _read_consumer_receipt(path: Path) -> dict[str, object] | None:
    try:
        _assert_owned_receipt(path)
    except FileNotFoundError:
        return None
    try:
        with path.open("r", encoding="utf-8") as stream:
            value = json.load(stream)
    except json.JSONDecodeError as error:
        raise ValueError("consumer-invocation-receipt-invalid") from error
    if not isinstance(value, dict):
        raise ValueError("consumer-invocation-receipt-invalid")
    if value.get("schema") != CONSUMER_INVOCATION_SCHEMA:
        raise ValueError("consumer-invocation-receipt-invalid")
    if not isinstance(value.get("runId"), str) or not re.fullmatch(
        r"[a-f0-9]{32}", value["runId"]
    ):
        raise ValueError("consumer-invocation-receipt-invalid")
    if not isinstance(value.get("startedAt"), str) or len(value["startedAt"]) > 40:
        raise ValueError("consumer-invocation-receipt-invalid")
    if value.get("invocationState") not in {
        "started",
        "completed",
        "rejected",
        "nonzero",
        "invalid-output",
        "spawn-error",
        "interrupted",
    }:
        raise ValueError("consumer-invocation-receipt-invalid")
    return value


def _write_consumer_receipt(path: Path, receipt: dict[str, object]) -> None:
    path.parent.mkdir(mode=0o700, exist_ok=True)
    _assert_owned_directory(path.parent, exact_mode=0o700)
    try:
        _assert_owned_receipt(path)
    except FileNotFoundError:
        pass
    temporary = path.with_name(
        f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp"
    )
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    file_descriptor = os.open(temporary, flags, 0o600)
    try:
        os.fchmod(file_descriptor, 0o600)
        with os.fdopen(file_descriptor, "w", encoding="utf-8") as stream:
            file_descriptor = -1
            json.dump(receipt, stream, sort_keys=True, separators=(",", ":"))
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory_descriptor = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory_descriptor)
        finally:
            os.close(directory_descriptor)
    finally:
        if file_descriptor >= 0:
            os.close(file_descriptor)
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def _redact_text(value: str) -> str:
    text = re.sub(r"\s+", " ", value).strip()
    for pattern in _REDACTION_PATTERNS:
        text = pattern.sub("[REDACTED]", text)
    return text[:240]


def _rejection_reason(stderr: str) -> str | None:
    if not isinstance(stderr, str):
        return None
    for line in reversed(stderr.splitlines()):
        match = _CONSUMER_REJECTION.match(line.strip())
        if not match:
            continue
        try:
            reason = json.loads(match.group("reason"))
        except json.JSONDecodeError:
            return None
        if isinstance(reason, str) and reason:
            return _redact_text(reason)
    return None


def _validated_consumer_outcome(
    stdout: str,
) -> tuple[dict[str, str] | None, str | None]:
    """Keep only the known, bounded fields from the consumer's JSON line."""
    if not isinstance(stdout, str):
        return None, "consumer-output-not-text"
    lines = [line.strip() for line in stdout.splitlines() if line.strip()]
    if len(lines) != 1:
        return None, "consumer-output-json-invalid"
    try:
        parsed = json.loads(lines[0])
    except json.JSONDecodeError:
        return None, "consumer-output-json-invalid"
    if not isinstance(parsed, dict):
        return None, "consumer-output-shape-invalid"
    if parsed.get("schema") != CONSUMER_CYCLE_SCHEMA:
        return None, "consumer-output-schema-invalid"
    status = parsed.get("status")
    if not isinstance(status, str) or status not in _CONSUMER_STATUSES:
        return None, "consumer-output-status-invalid"

    outcome: dict[str, str] = {
        "schema": CONSUMER_CYCLE_SCHEMA,
        "status": status,
    }
    for field in _CONSUMER_OUTCOME_FIELDS[2:]:
        if field not in parsed:
            continue
        value = parsed[field]
        if not isinstance(value, str) or not value or len(value) > 240:
            return None, f"consumer-output-{field}-invalid"
        if field == "taskKey" and not _CONSUMER_TASK_KEY.fullmatch(value):
            return None, "consumer-output-taskKey-invalid"
        if field == "issueIdentifier" and not _CONSUMER_ISSUE.fullmatch(value):
            return None, "consumer-output-issueIdentifier-invalid"
        if field == "acknowledgement" and value not in _CONSUMER_ACKNOWLEDGEMENTS:
            return None, "consumer-output-acknowledgement-invalid"
        if field in {"reason", "acknowledgement"}:
            value = _redact_text(value)
        outcome[field] = value

    required = {
        "execution-held": {"taskKey", "reason"},
        "execution-recorded": {"taskKey", "acknowledgement"},
        "projection-recorded": {"taskKey", "issueIdentifier", "acknowledgement"},
    }.get(status, set())
    if not required.issubset(outcome):
        return None, "consumer-output-fields-missing"
    return outcome, None


def _begin_consumer_invocation() -> tuple[Path, dict[str, object]]:
    receipt_path = consumer_invocation_receipt_path()
    _ensure_consumer_receipt_directory()
    previous = _read_consumer_receipt(receipt_path)
    now = _utc_timestamp()
    receipt: dict[str, object] = {
        "schema": CONSUMER_INVOCATION_SCHEMA,
        "runId": uuid.uuid4().hex,
        "startedAt": now,
        "finishedAt": None,
        "invocationState": "started",
        "exitCode": None,
        "outcome": None,
        "previousInvocation": None,
    }
    if previous and previous.get("invocationState") == "started":
        receipt["previousInvocation"] = {
            "state": "stale-start",
            "runId": previous["runId"],
            "startedAt": previous["startedAt"],
            "observedAt": now,
        }
    _write_consumer_receipt(receipt_path, receipt)
    return receipt_path, receipt


def _finish_consumer_invocation(
    receipt_path: Path,
    started: dict[str, object],
    invocation_state: str,
    return_code: int | None,
    outcome: dict[str, str] | None,
) -> None:
    receipt = dict(started)
    receipt.update(
        {
            "finishedAt": _utc_timestamp(),
            "invocationState": invocation_state,
            "exitCode": return_code,
            "outcome": outcome,
        }
    )
    _write_consumer_receipt(receipt_path, receipt)


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
    action = value.get("action")
    if action not in ENROLLABLE_ACTIONS:
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
        action,
    ]


def run_native_queue_starvation_execute(stdout: str) -> int:
    """Record the signed terminal for the just-projected native-queue child."""
    workspace = Path(
        os.environ.get("GEM_WORKSPACE", Path(__file__).resolve().parents[1])
    )
    fleet_path = workspace / "state/gem-priority-gate/latest.json"
    argv = native_queue_execution_argv(stdout, fleet_path)
    if argv is None:
        try:
            payload = json.loads(stdout or "")
        except (ValueError, TypeError):
            payload = {}
        if (
            isinstance(payload, dict)
            and payload.get("status") == "projection-recorded"
        ):
            print(
                json.dumps(
                    {
                        "schema": "jovie.summer-delivery-observation/v1",
                        "stage": "native-queue-execution",
                        "returncode": 1,
                        "status": "executor-unbound-action",
                        "action": payload.get("action"),
                        "taskKey": payload.get("taskKey"),
                    },
                    sort_keys=True,
                    default=str,
                ),
                flush=True,
            )
            return 1
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
    if executed.returncode:
        err_path = workspace / "state/last-native-queue-execute.stderr"
        err_path.parent.mkdir(parents=True, exist_ok=True)
        err_path.write_text((executed.stderr or "")[-4000:])
        detail = (executed.stderr or "").strip().splitlines()
        detail = next((line for line in reversed(detail) if line.strip()), "")[:240]
        # One stdout line per delivery stage: surface the execute failure detail
        # as a bounded field on the native-queue-execution receipt itself.
        report_delivery("native-queue-execution", executed, detail=detail)
    else:
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
    receipt_path, started = _begin_consumer_invocation()
    try:
        consumer = subprocess.run(
            [
                "node",
                str(Path(__file__).with_name("summer-symphony-outbox-consumer.mjs")),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
    except BaseException as error:
        _finish_consumer_invocation(
            receipt_path,
            started,
            "interrupted"
            if isinstance(error, (KeyboardInterrupt, SystemExit, GeneratorExit))
            else "spawn-error",
            None,
            {
                "schema": CONSUMER_CYCLE_SCHEMA,
                "status": "interrupted"
                if isinstance(error, (KeyboardInterrupt, SystemExit, GeneratorExit))
                else "spawn-error",
            },
        )
        raise

    return_code = consumer.returncode
    if not isinstance(return_code, int) or isinstance(return_code, bool):
        _finish_consumer_invocation(
            receipt_path,
            started,
            "invalid-output",
            None,
            {"schema": CONSUMER_CYCLE_SCHEMA, "status": "invalid-output"},
        )
        raise TypeError("consumer-return-code-invalid")

    outcome, parse_error = _validated_consumer_outcome(consumer.stdout)
    rejection_reason = _rejection_reason(consumer.stderr)
    if return_code == CONSUMER_REJECTION_RETURN_CODE:
        outcome = {
            "schema": CONSUMER_CYCLE_SCHEMA,
            "status": "rejected",
            "reason": rejection_reason or "typed-rejection",
        }
        invocation_state = "rejected"
    elif outcome is None:
        outcome = {
            "schema": CONSUMER_CYCLE_SCHEMA,
            "status": "invalid-output",
            "reason": parse_error or "consumer-output-invalid",
        }
        invocation_state = "invalid-output" if return_code == 0 else "nonzero"
    else:
        invocation_state = "completed" if return_code == 0 else "nonzero"
    _finish_consumer_invocation(
        receipt_path,
        started,
        invocation_state,
        return_code,
        outcome,
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
