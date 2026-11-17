"""Native reason scheduling: local admission, detached queue check and durable scheduling evidence."""
from __future__ import annotations

import fcntl
import hashlib
import itertools
import json
import os
import re
import stat
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import lifecycle
import ownership
from atomic_state import append_json_object, atomic_write_text

HERE = Path(__file__).resolve().parent


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def schedule_tick(host, lane, spawn=None) -> dict:
    """Request the existing queue check without making code dispatch wait on Linear."""
    if os.environ.get("LANES_SELFTEST") or os.environ.get("LANES_EXECUTION_BACKEND") == "local-test":
        return {"status": "selftest-skipped"}
    probe = lane.Locked(host.state / "reason.lock", blocking=False)
    try:
        if not probe.held:
            return {"status": "busy"}
    finally:
        probe.release()
    (spawn or subprocess.Popen)([sys.executable, str(HERE / "reason_lane.py"), "tick"],
                               stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                               start_new_session=True, **lifecycle.spawn_kwargs())
    return {"status": "scheduled"}


def tick(host, lane, linear_factory, config: dict, *, queued_jobs, spawn, queue_refresh=False) -> dict:
    """Dispatch hook: a queued job starts a detached drain unless one is already running."""
    # Refresh before probing an active drain: it either observes this shared cache
    # next, or has exited by the post-refresh probe and a replacement can start.
    if queue_refresh:
        try:
            jobs = queued_jobs(linear_factory(), config["label"], refresh=True)
        except lane.LinearRateLimited as error:
            return {"status": "linear-rate-limited", "resetAt": error.reset_at}
    probe = lane.Locked(host.state / "reason.lock", blocking=False)
    try:
        if not probe.held:
            return {"status": "running"}
        if not queue_refresh:
            try:
                jobs = queued_jobs(linear_factory(), config["label"])
            except lane.LinearRateLimited as error:
                return {"status": "linear-rate-limited", "resetAt": error.reset_at}
    finally:
        probe.release()
    if not jobs:
        return {"status": "idle"}
    spawn([sys.executable, str(HERE / "reason_lane.py"), "drain"], stdin=subprocess.DEVNULL,
          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True,
          **lifecycle.spawn_kwargs())
    return {"status": "spawned", "queued": len(jobs)}


def source_provenance() -> dict:
    source = {"producer": "scripts/lanes/reason_dispatch.py", "status": "unavailable",
              "sourceCommit": None, "bundleDigest": None}
    try:
        raw, _ = lifecycle._read_regular(HERE / ".release.json", limit=1024 * 1024)
        manifest = lifecycle.checked_manifest(json.loads(raw))
        source.update(status="available", sourceCommit=manifest["sourceCommit"],
                      bundleDigest=manifest["bundleDigest"], laneTree=manifest["objects"]["scripts/lanes"])
    except (Exception, SystemExit) as error:
        source["reason"] = f"{type(error).__name__}: {error}"[:200]
    return source


def _event_time(value):
    if value is None:
        return None
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z", value):
        raise ValueError("event timestamp must be UTC ISO-8601 or null")
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def event_key(event: dict) -> str:
    revision = _event_time(event["issueUpdatedAt"]).isoformat(timespec="microseconds")
    return hashlib.sha256((event["issueId"] + "\n" + revision).encode()).hexdigest()


def _private_json(path, limit=4096):
    raw, info = lifecycle._read_regular(Path(path), limit=limit)
    if info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError("event evidence must be private and owned by the current native user")
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("duplicate event metadata key")
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=unique)


def _event_metadata(value):
    fields = {"schema", "issueId", "issueIdentifier", "issueUpdatedAt", "deliveryId", "providerAt", "receivedAt"}
    if not isinstance(value, dict) or set(value) != fields or value.get("schema") != "jovie.reason-event/v1":
        raise ValueError("invalid reason event metadata schema")
    if str(uuid.UUID(value["issueId"])) != value["issueId"] or not re.fullmatch(r"JOV-[1-9]\d*", value["issueIdentifier"]):
        raise ValueError("invalid reason event issue identity")
    if not re.fullmatch(r"[0-9a-f]{64}", value["deliveryId"]) or _event_time(value["issueUpdatedAt"]) is None:
        raise ValueError("invalid reason event revision or delivery")
    _event_time(value["providerAt"])
    _event_time(value["receivedAt"])
    return value


def _event_directory(path):
    created = not (path.exists() or path.is_symlink())
    if created:
        if not path.parent.exists():
            _event_directory(path.parent)
        path.mkdir(mode=0o700, exist_ok=True)
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError("reason event state must be a private native-owned directory")
    if created:
        lifecycle._sync_directory(path.parent)  # persist each newly created ancestor link before admission
    return path


def _event_write(path, value):
    if path.is_symlink():
        raise ValueError("symlinked event result")
    # atomic_write_text follows preexisting symlinks; refuse them before using it.
    atomic_write_text(path, json.dumps(value))
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        os.fchmod(fd, 0o600)
        os.fsync(fd)
    finally:
        os.close(fd)
    lifecycle._sync_directory(path.parent)


def _read_control(path, key, host):
    control = _private_json(path, limit=16384)
    event = _event_metadata(control.get("event"))
    if control.get("schema") != "jovie.reason-event-result/v1" or control.get("owner") != "reason-lane" \
            or control.get("eventKey") != key or event_key(event) != key or Path(path).name != key + ".json" \
            or control.get("host") != host or not isinstance(control.get("source"), dict) \
            or control.get("disposition") not in ("checking", "blocked", "checked") \
            or control.get("status") not in ("checking", "idle", "running", "spawned", "blocked", "linear-rate-limited") \
            or not re.fullmatch(r"[0-9a-f]{32}", str(control.get("checkId") or "")) \
            or _event_time(control.get("observedAt")) is None or not control.get("nextAction"):
        raise ValueError("unobservable prior reason event control")
    source = control["source"]
    if source.get("producer") != "scripts/lanes/reason_dispatch.py" or source.get("status") not in ("available", "unavailable"):
        raise ValueError("invalid prior reason event source")
    if source["status"] == "available":
        if any(not re.fullmatch(r"[0-9a-f]{%d}" % size, str(source.get(field) or ""))
               for field, size in (("sourceCommit", 40), ("bundleDigest", 64), ("laneTree", 40))):
            raise ValueError("incomplete prior reason event provenance")
    elif not isinstance(source.get("reason"), str) or not source["reason"] or source.get("sourceCommit") is not None or source.get("bundleDigest") is not None:
        raise ValueError("unexplained unavailable reason event provenance")
    if control["disposition"] == "checked" and control["status"] not in ("idle", "spawned"):
        raise ValueError("unchecked prior reason capacity handoff")
    return control


def _prepare_events(host, receipt, event_file):
    root = _event_directory(host.state / "reason-events")
    pending, checked = (_event_directory(root / name) for name in ("pending", "checked"))
    controls = []
    if event_file is not None:
        event = _event_metadata(_private_json(event_file))
        key = event_key(event)
        prior = checked / f"{key}.json"
        unresolved = pending / f"{key}.json"
        if not (unresolved.exists() or unresolved.is_symlink()) and (prior.exists() or prior.is_symlink()):
            result = _read_control(prior, key, receipt["host"])
            if result["disposition"] != "checked" or result["event"]["issueIdentifier"] != event["issueIdentifier"]:
                raise ValueError("unobservable prior reason event result")
            receipt.update(status="coalesced", priorCheckId=result["checkId"],
                           nextAction="Observe the prior guarded queue check; worker acceptance and result remain separate")
            controls = [(key, event)]
        else:
            if unresolved.exists() or unresolved.is_symlink():
                previous = _read_control(unresolved, key, receipt["host"])
                if previous["event"]["issueIdentifier"] != event["issueIdentifier"]:
                    raise ValueError("pending reason event issue identity changed")
            controls = [(key, event)]
    else:
        # Only unresolved control records are enumerated; completed audit is addressed by exact key.
        with os.scandir(pending) as entries:
            for entry in itertools.islice(entries, 32):
                if not re.fullmatch(r"[0-9a-f]{64}\.json", entry.name):
                    raise ValueError("unknown pending reason event evidence")
                key = entry.name.removesuffix(".json")
                result = _read_control(entry.path, key, receipt["host"])
                event = result["event"]
                controls.append((key, event))
    receipt["events"] = [{**event, "eventKey": key, "timing": {
        "providerToReceived": {"enteredAt": event["providerAt"], "exitedAt": event["receivedAt"], "qualified": False},
        "receivedToCheck": {"enteredAt": event["receivedAt"], "exitedAt": receipt["startedAt"], "qualified": False},
        "qualification": "native-producer-unverified"}} for key, event in controls]
    if receipt["status"] != "coalesced":
        _save_events(host, receipt, controls, "checking")
    return controls


def _save_events(host, receipt, controls, disposition):
    root = host.state / "reason-events"
    for key, event in controls:
        value = {"schema": "jovie.reason-event-result/v1", "eventKey": key, "event": event,
                 "checkId": receipt["checkId"], "status": receipt["status"], "disposition": disposition,
                 "owner": receipt["owner"], "nextAction": receipt["nextAction"], "source": receipt["source"],
                 "host": receipt["host"],
                 "observedAt": receipt.get("observedAt", receipt["startedAt"])}
        path = root / "pending" / f"{key}.json"
        _event_write(path, value)
        if disposition == "checked":
            os.replace(path, root / "checked" / path.name)
            lifecycle._sync_directory(root / "checked")
            lifecycle._sync_directory(root / "pending")


def wake_pending(host, lane, spawn=None) -> dict:
    """One guarded continuation after event finalization or an accepted drain exits; no polling."""
    pending = host.state / "reason-events" / "pending"
    if not pending.exists() and not pending.is_symlink():
        return {"status": "inactive"}
    receipt = {"schema": "jovie.reason-handoff/v1", "handoffId": uuid.uuid4().hex,
               "observedAt": now_iso(), "source": source_provenance(), "owner": "reason-lane"}
    try:
        _event_directory(host.state / "reason-events")
        _event_directory(pending)
        with os.scandir(pending) as entries:
            entry = next(entries, None)
        if entry is None:
            return {"status": "idle"}
        if os.environ.get("LANES_REASON_WAKE") != "1":
            raise ValueError("native continuation disabled; opt-in must be propagated to every accepted drain environment")
        if not re.fullmatch(r"[0-9a-f]{64}\.json", entry.name):
            raise ValueError("unknown pending reason event evidence")
        control = _read_control(entry.path, entry.name.removesuffix(".json"), getattr(lane, "HOST", "unknown"))
        if control["source"]["status"] != "available":
            raise ValueError("native pending control/source is unqualified")
        receipt.update(schedule_tick(host, lane, spawn=spawn))
        receipt["nextAction"] = ("Await the guarded child queue check; acceptance and result remain separate"
                                 if receipt["status"] == "scheduled" else "Await the accepted drain exit; guarded backstop recovers lost handoffs")
    except (Exception, SystemExit) as error:
        receipt.update(status="blocked", blockedOn="native-handoff", error=f"{type(error).__name__}: {error}"[:200],
                       nextAction="Gem/Summer owner: verify private pending evidence and opt-in on every accepted drain; JOV-12872 owns activation")
    try:
        history = _event_directory(host.state / "runs" / "reason-checks") / (receipt["observedAt"][:10] + ".jsonl")
        append_json_object(history, receipt)
    except (Exception, SystemExit) as error:
        receipt.update(observedStatus=receipt["status"], status="blocked", blockedOn="receipt-history",
                       error=f"{type(error).__name__}: {error}"[:200],
                       nextAction="Restore private receipt storage and inspect pending control/worker leases before retry")
    print(json.dumps(receipt), file=sys.stderr)
    return receipt


def checked_tick(host, lane, linear_factory, *, check, now_iso, event_file=None) -> dict:
    """Queue-check evidence only. The inactive adapter never supplies execution eligibility."""
    receipt = {"schema": "jovie.reason-check/v1", "checkId": uuid.uuid4().hex,
               "host": getattr(lane, "HOST", "unknown"), "source": source_provenance(),
               "startedAt": now_iso(), "owner": "reason-lane", "status": "checking",
               "nextAction": "Await the existing queue check; retry at the next guarded wake if its process is lost"}
    path, controls, event_lock = host.state / "reason-tick.json", [], None

    def storage_failure(kind, error):
        if receipt["status"] not in ("checking", "blocked"):
            receipt["observedStatus"] = receipt["status"]
        receipt.setdefault("storageErrors", []).append({"kind": kind, "error": f"{type(error).__name__}: {error}"[:200]})
        receipt.update(status="blocked", blockedOn=kind, error=f"{type(error).__name__}: {error}"[:200],
                       observedAt=now_iso(), nextAction="Restore private receipt storage, resolve the recorded blocker, "
                       "and inspect the existing reason worker/lease before retrying the guarded check")

    def persist():
        try:
            atomic_write_text(path, json.dumps(receipt))
            return True
        except (Exception, SystemExit) as error:
            storage_failure("receipt-storage", error)
            return False

    def finish():
        receipt.setdefault("observedAt", now_iso())
        try:
            # Locally generated check time selects the private daily audit partition.
            day = _event_time(receipt["observedAt"]).date().isoformat()
            history = _event_directory(host.state / "runs" / "reason-checks") / f"{day}.jsonl"
            append_json_object(history, receipt)
        except (Exception, SystemExit) as error:
            storage_failure("receipt-history", error)
            persist()
        try:
            if controls and receipt["status"] != "coalesced":
                disposition = "checked" if receipt["status"] in ("idle", "spawned") else "blocked"
                _save_events(host, receipt, controls, disposition)
        except (Exception, SystemExit) as error:
            storage_failure("event-storage", error)
            persist()
            try:
                _save_events(host, receipt, controls, "blocked")
            except (Exception, SystemExit) as recovery_error:
                storage_failure("event-storage", recovery_error)
            # Keep the prior audit row; contradictory outcomes are quarantined by the reader.
            try:
                append_json_object(history, receipt)
            except (Exception, SystemExit) as history_error:
                storage_failure("receipt-history", history_error)
        finally:
            if event_lock is not None:
                event_lock.close()
        if controls and receipt["status"] == "running":
            wake_pending(host, lane)
        return receipt

    if not persist():
        return finish()
    blocked_on = "disk-admission"
    try:
        disk = lane.disk_guard.check(host)
        if not isinstance(disk, dict):
            raise ValueError("disk admission is unobservable")
        json.dumps(disk, allow_nan=False)
        receipt["disk"] = disk
        if disk.get("admitted") is not True:
            receipt.update(status="blocked", blockedOn=blocked_on, error=disk.get("reason") or "disk-unobservable",
                           nextAction="Restore observable shared host disk admission and retry the existing guarded check")
        else:
            if event_file is not None or os.environ.get("LANES_REASON_WAKE") == "1":
                blocked_on = "event-admission"
                if os.environ.get("LANES_REASON_WAKE") != "1":
                    raise ValueError("reason event adapter disabled; JOV-12872 native owner must verify and wire the producer before opt-in")
                event_lock = os.fdopen(os.open(host.state / "reason-events.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600), "a+")
                lock_info = os.fstat(event_lock.fileno())
                if not stat.S_ISREG(lock_info.st_mode) or lock_info.st_uid != os.getuid() or lock_info.st_mode & 0o077:
                    raise ValueError("reason event lock must be private and native-owned")
                fcntl.flock(event_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                controls = _prepare_events(host, receipt, event_file)
            if receipt["status"] != "coalesced":
                blocked_on = "queue"
                receipt.update(check(host, lane, linear_factory, **({"refresh": True} if controls else {})))
                receipt["nextAction"] = ("Retry after the recorded Linear quota reset" if receipt["status"] == "linear-rate-limited"
                                         else "Await accepted run-lease and durable result receipts" if receipt["status"] == "spawned"
                                         else "Await accepted reason capacity and drain-exit handoff; backstop recovers process loss" if controls and receipt["status"] == "running"
                                         else "Observe the existing reason worker or next guarded wake")
    except (Exception, SystemExit) as error:
        receipt.update(status="blocked", blockedOn=blocked_on, error=f"{type(error).__name__}: {error}"[:200],
                       nextAction="Restore observable shared host disk admission and retry the existing guarded check"
                       if blocked_on == "disk-admission" else "Gem/Summer owner: verify native producer metadata and private event state; retry the guarded backstop"
                       if blocked_on == "event-admission" else "Restore the queue dependency and retry the existing guarded check")
    except BaseException:
        if event_lock is not None:
            event_lock.close()
        raise
    receipt["observedAt"] = now_iso()
    persist()
    return finish()


def accept_run(host, linear, issue):
    lease = ownership.begin_reason_run(host.state, issue)
    try:
        linear.move(issue["id"], "In Progress", owner="reason-run-lease")
    except BaseException:
        ownership.finish_reason_run(host.state, issue["id"], lease, settled=True, reason="reason:admission-failed")
        raise  # No job execution was started.
    return lease


def run_claimed(host, linear, issue, config, lease, *, one_job, run=lifecycle.run):
    settled = False
    try:
        record = one_job(linear, issue, config, host.state, run=run)
        publication = record.get("publication") or {}
        settled = not publication or ownership._reason_result(host.state, issue)
        if not settled and publication.get("status") != "blocked":
            return {**record, "publication": ownership.reason_run_block()}
        return record
    except Exception:
        return {"confidence": "failed", "publication": ownership.reason_run_block()}
    finally:
        ownership.finish_reason_run(host.state, issue["id"], lease, settled=settled)


def direct_run(host, lane, linear, issue, config, *, one_job, run=lifecycle.run) -> int:
    """Operator work uses the same local mutex, claim and lease as the automatic drain."""
    lock = lane.Locked(host.state / "reason.lock", blocking=False)
    try:
        if not lock.held:
            print(json.dumps({**ownership.reason_run_block("reason-run-already-owned"), "status": "busy"}))
            return 75
        claim = lane.Locked(host.state / "claim.lock", blocking=True)
        try:
            if lifecycle.draining(host.state):
                print(json.dumps({"status": "operator-draining", "owner": "reason-lane",
                                  "nextAction": "Wait for the existing operator drain to finish."}))
                return 75
            lease = accept_run(host, linear, issue)
        except ownership.ReasonRunHeld as error:
            print(json.dumps(error.receipt))
            return 75
        finally:
            claim.release()
        record = run_claimed(host, linear, issue, config, lease, one_job=one_job, run=run)
        print(json.dumps(record, indent=1))
        return 75 if (record.get("publication") or {}).get("status") == "blocked" else 0
    finally:
        lock.release()
