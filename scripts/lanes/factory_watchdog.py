#!/usr/bin/env python3
"""Independent, bounded recovery for a dark or non-writing lanes factory.

The primary five-minute factory tick cannot recover itself when its timer or
process is dark.  This watchdog runs from a separate one-minute host timer,
restarts only the installed lanes service, and accepts recovery only after a
new tick proves that the factory is admitting work (and writing when work is
waiting).  Every incident is bounded to three attempts and leaves an atomic
latest receipt plus an append-only journal.
"""
from __future__ import annotations

import fcntl
import json
import math
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable


SCHEMA = "jovie.factory-stay-up/v1"
TICK_STALE_S = 10 * 60
# A newly installed release may spend 15 minutes in its full self-test and five
# more in one bounded selector retry. Do not interrupt that legitimate service
# run; after this grace, an active service with no tick is itself hung.
ACTIVE_TICK_GRACE_S = 22 * 60
ZERO_WORKER_S = 5 * 60
ATTEMPT_COOLDOWN_S = 2 * 60
MAX_RECOVERY_ATTEMPTS = 3
VERIFY_TIMEOUT_S = 90
VERIFY_POLL_S = 2
ALERT_RETRY_S = 15 * 60
RECOVERABLE_CONDITIONS = frozenset({"spawn-exit", "tick-error"})
CAPACITY_BLOCK = re.compile(r"banked|credit|quota|token|usage.limit", re.IGNORECASE)
ACTIVE_STATUSES = frozenset({"observing", "recovering", "exhausted", "decision-required"})


def epoch_iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_epoch(value) -> float | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return stamp.timestamp() if stamp.tzinfo is not None else None
    except ValueError:
        return None


def read_json(path: Path, default):
    try:
        value = json.loads(path.read_text())
        return value if isinstance(value, dict) else default
    except (OSError, ValueError):
        return default


def _elapsed_seconds(value: str) -> int | None:
    """Parse portable `ps -o etime=` output: [[days-]hh:]mm:ss."""
    try:
        days, _, clock = value.strip().rpartition("-")
        parts = [int(part) for part in (clock if _ else days).split(":")]
        if len(parts) == 2:
            hours, minutes, seconds = 0, *parts
        elif len(parts) == 3:
            hours, minutes, seconds = parts
        else:
            return None
        day_count = int(days) if _ else 0
        return day_count * 86400 + hours * 3600 + minutes * 60 + seconds
    except (TypeError, ValueError):
        return None


def service_status(platform: str = sys.platform, run=subprocess.run, monotonic=time.monotonic) -> dict:
    """Read only the local service manager; this is not a recovery side effect."""
    try:
        if platform.startswith("linux"):
            result = run(
                ["systemctl", "--user", "show", "jovie-lanes.service",
                 "--property=ActiveState", "--property=ExecMainStartTimestampMonotonic"],
                capture_output=True, text=True, timeout=5, check=False,
            )
            fields = dict(line.split("=", 1) for line in result.stdout.splitlines() if "=" in line)
            started = int(fields.get("ExecMainStartTimestampMonotonic") or 0) / 1_000_000
            active = result.returncode == 0 and fields.get("ActiveState") in {"activating", "active"}
            age = max(0, int(monotonic() - started)) if active and started > 0 else None
            return {"active": active, "ageSeconds": age, "manager": "systemd"}
        if platform == "darwin":
            result = run(
                ["launchctl", "print", f"gui/{os.getuid()}/com.jovie.lanes"],
                capture_output=True, text=True, timeout=5, check=False,
            )
            active = result.returncode == 0 and re.search(r"^\s*state\s*=\s*running\s*$", result.stdout, re.M)
            found = re.search(r"^\s*pid\s*=\s*(\d+)\s*$", result.stdout, re.M) if active else None
            age = None
            if found:
                elapsed = run(["ps", "-o", "etime=", "-p", found.group(1)], capture_output=True,
                              text=True, timeout=5, check=False)
                age = _elapsed_seconds(elapsed.stdout) if elapsed.returncode == 0 else None
            return {"active": bool(active), "ageSeconds": age, "manager": "launchd"}
    except (OSError, subprocess.SubprocessError, ValueError):
        pass
    return {"active": None, "ageSeconds": None, "manager": "unknown"}


def atomic_write(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, indent=1, sort_keys=True) + "\n")
    os.replace(temporary, path)


def journal(state: Path, event: dict) -> None:
    runs = state / "runs"
    runs.mkdir(parents=True, exist_ok=True)
    with open(runs / "factory-watchdog.jsonl", "a") as handle:
        handle.write(json.dumps(event, sort_keys=True) + "\n")
        handle.flush()
        os.fsync(handle.fileno())


def snapshot(state: Path, now: float) -> dict:
    """Small local-only factory observation; no API call or credential read."""
    tick = read_json(state / "tick.json", {})
    report = read_json(state / "doctor.json", {})
    observed = report.get("observed") if isinstance(report.get("observed"), dict) else {}
    conditions = report.get("conditions") if isinstance(report.get("conditions"), dict) else {}
    capacity = observed.get("capacityByProvider") if isinstance(observed.get("capacityByProvider"), dict) else {}
    enabled = sorted(name for name, row in capacity.items()
                     if isinstance(row, dict) and isinstance(row.get("slots"), int) and row["slots"] > 0)
    running = sum(row.get("running", 0) for row in capacity.values() if isinstance(row, dict)
                  and isinstance(row.get("running"), int))
    tick_epoch = parse_epoch(tick.get("at"))
    doctor_epoch = parse_epoch(report.get("at"))
    last_work_age = observed.get("lastWorkAge")
    last_work_epoch = (doctor_epoch - last_work_age if doctor_epoch is not None
                       and isinstance(last_work_age, (int, float)) and math.isfinite(last_work_age)
                       and last_work_age >= 0 else None)
    eligible, open_prs = observed.get("eligiblePool"), observed.get("openPRCount")
    demand_known = type(eligible) is int and type(open_prs) is int
    active_conditions = sorted(key for key, row in conditions.items()
                               if isinstance(row, dict) and row.get("state") == "active")
    quota_blocked = tick.get("quotaBlocked") if isinstance(tick.get("quotaBlocked"), dict) else {}
    unhealthy = sorted(name for name in tick.get("unhealthy", []) if isinstance(name, str))
    spawned = sorted(set(name for name in tick.get("spawned", []) if isinstance(name, str)))
    service = service_status()
    return {
        "observedAt": epoch_iso(now),
        "tickAt": tick.get("at"),
        "tickEpoch": tick_epoch,
        "tickAgeSeconds": None if tick_epoch is None else int(now - tick_epoch),
        "doctorAt": report.get("at"),
        "doctorEpoch": doctor_epoch,
        "doctorAgeSeconds": None if doctor_epoch is None else int(now - doctor_epoch),
        "service": service,
        "tickError": tick.get("error"),
        "admissionDenied": tick.get("admissionDenied"),
        "enabledProviders": enabled,
        "spawnedProviders": spawned,
        "unhealthyProviders": unhealthy,
        "quotaBlocked": {name: str(reason)[:120] for name, reason in sorted(quota_blocked.items())},
        "runningWorkers": running,
        "eligibleWork": eligible,
        "openPullRequests": open_prs,
        "demandKnown": demand_known,
        "demand": eligible + open_prs if demand_known else None,
        "lastWorkEpoch": last_work_epoch,
        "activeConditions": active_conditions,
    }


def assess(observation: dict) -> dict:
    """Classify factory-down, zero-worker, stuck-retry, and zero-capacity states."""
    reasons: list[str] = []
    tick_age = observation.get("tickAgeSeconds")
    doctor_age = observation.get("doctorAgeSeconds")
    waiting = False
    if not isinstance(tick_age, (int, float)) or tick_age < -30 or tick_age > TICK_STALE_S:
        service = observation.get("service") if isinstance(observation.get("service"), dict) else {}
        service_age = service.get("ageSeconds")
        if service.get("active") is True and isinstance(service_age, (int, float)) \
                and 0 <= service_age <= ACTIVE_TICK_GRACE_S:
            reasons.append("factory-tick-in-progress")
            waiting = True
        else:
            reasons.append("factory-down")
    elif observation.get("tickError"):
        reasons.append("tick-error")

    enabled = set(observation.get("enabledProviders") or [])
    blocked = observation.get("quotaBlocked") or {}
    zero_capacity = not waiting and bool(enabled) and enabled <= set(blocked) and all(
        CAPACITY_BLOCK.search(str(blocked[name])) for name in enabled)
    if zero_capacity:
        reasons.append("zero-provider-capacity")

    doctor_fresh = isinstance(doctor_age, (int, float)) and -30 <= doctor_age <= TICK_STALE_S
    if doctor_fresh and not waiting and not reasons[:1] == ["factory-down"]:
        conditions = observation.get("activeConditions") or []
        if any(key in RECOVERABLE_CONDITIONS or key.startswith(("provider-idle:", "provider-down:"))
               for key in conditions):
            reasons.append("stuck-retry")
        if observation.get("demandKnown") and observation.get("demand", 0) > 0 \
                and observation.get("runningWorkers") == 0:
            reasons.append("zero-worker")

    reasons = list(dict.fromkeys(reasons))
    return {
        "healthy": not reasons,
        "reasons": reasons,
        "decisionRequired": "zero-provider-capacity" in reasons,
        "waiting": waiting,
    }


def service_recovery(platform: str = sys.platform, run=subprocess.run) -> dict:
    """Use the installed host service path; never spawn a second factory directly."""
    if platform.startswith("linux"):
        commands = [
            ["systemctl", "--user", "reset-failed", "jovie-lanes.service"],
            ["systemctl", "--user", "--no-block", "restart", "jovie-lanes.timer", "jovie-lanes.service"],
        ]
        action = "restart-systemd-lanes-service"
    elif platform == "darwin":
        commands = [["launchctl", "kickstart", "-k", f"gui/{os.getuid()}/com.jovie.lanes"]]
        action = "kickstart-launchd-lanes-service"
    else:
        return {"action": "unsupported-platform", "returncodes": [2], "accepted": False}
    codes = []
    for command in commands:
        try:
            result = run(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL, timeout=15, check=False)
            codes.append(result.returncode)
        except (OSError, subprocess.SubprocessError):
            codes.append(1)
    return {"action": action, "returncodes": codes, "accepted": codes[-1:] == [0]}


def verification(after: dict, attempt_epoch: float) -> dict:
    result = assess(after)
    tick_epoch, doctor_epoch = after.get("tickEpoch"), after.get("doctorEpoch")
    if result["reasons"] or not isinstance(tick_epoch, (int, float)) or tick_epoch < attempt_epoch:
        return {"status": "pending", "reasons": result["reasons"] or ["no-new-tick"]}
    if not isinstance(doctor_epoch, (int, float)) or doctor_epoch < attempt_epoch:
        return {"status": "pending", "reasons": ["no-new-doctor-observation"]}
    if after.get("demandKnown") and after.get("demand", 0) > 0:
        wrote = (after.get("runningWorkers", 0) > 0
                 or isinstance(after.get("lastWorkEpoch"), (int, float))
                 and after["lastWorkEpoch"] >= attempt_epoch)
        return ({"status": "passed", "mode": "admitting-and-writing"} if wrote else
                {"status": "pending", "reasons": ["no-post-recovery-worker-proof"]})
    admitting = bool(set(after.get("spawnedProviders") or []) - set(after.get("unhealthyProviders") or []))
    return ({"status": "passed", "mode": "admitting-no-demand"} if admitting else
            {"status": "pending", "reasons": ["no-healthy-provider-spawn"]})


def operator_alert(record: dict, issue_id: str | None = None, resolve: bool = False):
    """Reuse the doctor transport only after recovery exhausts or needs a decision."""
    try:
        import doctor
        import lane_runner
        host = lane_runner.Host()
        tracker = doctor.Tracker(lane_runner.Linear(host.linear_env), lane_runner.HOST)
        if resolve:
            return tracker.close(issue_id, "factory-stay-up") if issue_id else True
        reasons = ", ".join(record.get("reasons") or ["unknown"])
        attempts = len(record.get("attempts") or [])
        text = (f"Factory stay-up recovery is {record.get('status')}: {reasons}; "
                f"{attempts}/{MAX_RECOVERY_ATTEMPTS} bounded service attempts used. "
                "Inspect factory-watchdog.json and its journal before any manual action.")
        return tracker.open("factory-stay-up", text)
    except Exception:
        return None


def _persist(state: Path, record: dict, event: str) -> None:
    record["updatedAt"] = epoch_iso(time.time())
    atomic_write(state / "factory-watchdog.json", record)
    journal(state, {"schema": SCHEMA, "event": event, **record})


def _alert(record: dict, now: float, alert: Callable) -> None:
    status = record.setdefault("alert", {"status": "pending", "attempts": 0, "nextAttemptAt": 0})
    if status.get("status") == "acknowledged" or now < float(status.get("nextAttemptAt") or 0):
        return
    status["attempts"] = int(status.get("attempts") or 0) + 1
    issue_id = alert(record, status.get("issueId"), False)
    status["lastAttemptAt"] = epoch_iso(now)
    if issue_id:
        status.update(status="acknowledged", issueId=issue_id, nextAttemptAt=None)
    else:
        status.update(status="pending", nextAttemptAt=now + ALERT_RETRY_S)


def run_once(state: Path, *, clock=time.time, monotonic=time.monotonic, sleep=time.sleep,
             observe=snapshot, recover=service_recovery, alert=operator_alert,
             verify_timeout_s: float = VERIFY_TIMEOUT_S) -> dict:
    """Run one independently scheduled watchdog pass under a host-local lock."""
    state.mkdir(parents=True, exist_ok=True)
    with open(state / "factory-watchdog.lock", "a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {"schema": SCHEMA, "status": "busy"}
        path = state / "factory-watchdog.json"
        previous = read_json(path, {})
        if path.exists() and previous.get("schema") != SCHEMA:
            return {"schema": SCHEMA, "status": "state-unobservable"}
        now = clock()
        before = observe(state, now)
        health = assess(before)
        if health["healthy"]:
            if previous.get("status") in ACTIVE_STATUSES:
                attempts = previous.get("attempts") or []
                if attempts:
                    proof = verification(before, float(attempts[-1].get("requestedEpoch") or 0))
                    if proof["status"] != "passed":
                        previous.update(after=before, verification=proof,
                                        lastObservedAt=epoch_iso(now))
                        atomic_write(path, previous)
                        return previous
                previous.update(status="recovered", after=before,
                                verification=(proof if attempts else
                                              {"status": "passed", "mode": "subsequent-observation"}),
                                recoveredAt=epoch_iso(now), lastObservedAt=epoch_iso(now))
                alert_state = previous.get("alert") or {}
                if alert_state.get("issueId") and alert(previous, alert_state["issueId"], True) is True:
                    alert_state["status"] = "closed"
                _persist(state, previous, "recovered")
                return previous
            if previous.get("schema") == SCHEMA:
                previous["lastObservedAt"] = epoch_iso(now)
                atomic_write(path, previous)
                return previous
            healthy = {"schema": SCHEMA, "generation": 0, "status": "healthy",
                       "lastObservedAt": epoch_iso(now), "after": before, "attempts": []}
            _persist(state, healthy, "healthy")
            return healthy

        if previous.get("status") not in ACTIVE_STATUSES:
            generation = int(previous.get("generation") or 0) + 1
            previous = {
                "schema": SCHEMA,
                "generation": generation,
                "incidentId": f"{os.uname().nodename}:factory-stay-up:{generation}",
                "status": "observing",
                "firstObservedAt": epoch_iso(now),
                "firstObservedEpoch": now,
                "lastObservedAt": epoch_iso(now),
                "reasons": health["reasons"],
                "currentReasons": health["reasons"],
                "reasonFirstObservedEpoch": {reason: now for reason in health["reasons"]},
                "before": before,
                "attempts": [],
            }
            _persist(state, previous, "incident-opened")
        else:
            prior_current = set(previous.get("currentReasons") or previous.get("reasons") or [])
            prior_since = previous.get("reasonFirstObservedEpoch") or {}
            previous["reasonFirstObservedEpoch"] = {
                reason: float(prior_since.get(reason, now)) if reason in prior_current else now
                for reason in health["reasons"]
            }
            previous["currentReasons"] = health["reasons"]
            previous["reasons"] = list(dict.fromkeys([*(previous.get("reasons") or []), *health["reasons"]]))
            previous["lastObservedAt"] = epoch_iso(now)

        if health["decisionRequired"]:
            already_terminal = previous.get("status") == "decision-required"
            prior_alert = json.dumps(previous.get("alert"), sort_keys=True)
            previous["status"] = "decision-required"
            _alert(previous, now, alert)
            if not already_terminal or json.dumps(previous.get("alert"), sort_keys=True) != prior_alert:
                _persist(state, previous, "decision-required")
            else:
                atomic_write(path, previous)
            return previous

        if health["waiting"]:
            atomic_write(path, previous)
            return previous

        zero_worker_only = set(health["reasons"]) == {"zero-worker"}
        zero_worker_since = (previous.get("reasonFirstObservedEpoch") or {}).get("zero-worker", now)
        if zero_worker_only and now - float(zero_worker_since) < ZERO_WORKER_S:
            atomic_write(path, previous)
            return previous

        attempts = previous["attempts"]
        if len(attempts) >= MAX_RECOVERY_ATTEMPTS:
            already_terminal = previous.get("status") == "exhausted"
            prior_alert = json.dumps(previous.get("alert"), sort_keys=True)
            previous["status"] = "exhausted"
            _alert(previous, now, alert)
            if not already_terminal or json.dumps(previous.get("alert"), sort_keys=True) != prior_alert:
                _persist(state, previous, "recovery-exhausted")
            else:
                atomic_write(path, previous)
            return previous
        last_epoch = parse_epoch(attempts[-1].get("requestedAt")) if attempts else None
        if last_epoch is not None and now - last_epoch < ATTEMPT_COOLDOWN_S:
            atomic_write(path, previous)
            return previous

        attempt_epoch = math.floor(now)
        attempt = {"number": len(attempts) + 1, "requestedAt": epoch_iso(now),
                   "requestedEpoch": attempt_epoch, "before": before, "outcome": "requested"}
        attempts.append(attempt)
        previous["status"] = "recovering"
        _persist(state, previous, "recovery-requested")  # durable before the service mutation
        command = recover()
        attempt["action"] = command.get("action")
        attempt["command"] = {"accepted": command.get("accepted") is True,
                              "returncodes": command.get("returncodes") or []}
        if command.get("accepted") is True:
            deadline = monotonic() + max(0, verify_timeout_s)
            while True:
                after = observe(state, clock())
                proof = verification(after, attempt_epoch)
                if proof["status"] == "passed":
                    attempt.update(outcome="recovered", verifiedAt=epoch_iso(clock()), after=after,
                                   verification=proof)
                    previous.update(status="recovered", after=after, verification=proof,
                                    recoveredAt=attempt["verifiedAt"])
                    _persist(state, previous, "recovered")
                    return previous
                if monotonic() >= deadline:
                    attempt.update(outcome="verification-failed", after=after, verification=proof)
                    previous.update(after=after, verification=proof)
                    break
                sleep(min(VERIFY_POLL_S, max(0, deadline - monotonic())))
        else:
            attempt["outcome"] = "service-action-failed"

        previous["status"] = "exhausted" if len(attempts) >= MAX_RECOVERY_ATTEMPTS else "observing"
        if previous["status"] == "exhausted":
            _alert(previous, clock(), alert)
        _persist(state, previous, "recovery-exhausted" if previous["status"] == "exhausted" else "recovery-failed")
        return previous


def main() -> int:
    state = Path(os.environ.get("LANES_STATE", Path.home() / ".local/state/jovie-lanes"))
    result = run_once(state)
    print(json.dumps({key: result.get(key) for key in
                      ("schema", "incidentId", "status", "reasons", "updatedAt")}, sort_keys=True))
    return 1 if result.get("status") in {"exhausted", "state-unobservable"} else 0


if __name__ == "__main__":
    raise SystemExit(main())
