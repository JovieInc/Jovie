#!/usr/bin/env python3
"""Execution-proven provider capacity shared by Gem admission controllers.

Invariant consumer: JOV-INV-007.

The live JSONL proof ledger contains one ``gem-provider-useful-turn/v1`` object
per completed turn and is append-only between lock-safe compactions. Compaction
keeps only the latest still-fresh proof per subscription identity and writes a
typed cumulative receipt, bounding the every-minute admission hot path without
turning the ledger into business-state authority. Credential files are
enrollment inventory only; they never establish readiness. A capacity receipt
keeps the completion time of its newest accepted row, so periodic regeneration
cannot freshen stale proof.
"""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import pathlib
import re
import tempfile
from datetime import datetime, timedelta, timezone
from typing import Any


TURN_SCHEMA = "gem-provider-useful-turn/v1"
CAPACITY_SCHEMA = "gem-concurrency-evidence/v1"
CAPACITY_SOURCE = "execution-proven-useful-turns"
EVIDENCE_WINDOW = timedelta(hours=24)
MAX_CAPTURE_DURATION = timedelta(minutes=10)
MAX_CAPACITY = 40
MAX_LEDGER_ROWS = 512
MAX_LEDGER_BYTES = 1024 * 1024
COMPACTION_SCHEMA = "gem-provider-useful-turn-compaction/v1"
DIGEST = re.compile(r"^(?:sha256:)?[0-9a-f]{64}$")
PROVIDER_IDENTITY = re.compile(r"^[a-z][a-z0-9._-]{0,63}$")
PROFILE_IDENTITY = re.compile(r"^[0-9a-f]{64}$")
ISO_TIMESTAMP = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$"
)
PROFILE_IDENTITY_CONTEXT = b"symphony-provider-profile/v1\0"


def profile_identity(provider: str, profile: str) -> str:
    """Return a stable opaque join key without exposing the account label."""
    material = (
        PROFILE_IDENTITY_CONTEXT
        + provider.strip().encode("utf-8")
        + b"\0"
        + profile.strip().encode("utf-8")
    )
    return hashlib.sha256(material).hexdigest()


def parse_time(value: object) -> datetime | None:
    if not isinstance(value, str) or ISO_TIMESTAMP.fullmatch(value) is None:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, OverflowError):
        return None
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        return None
    return parsed.astimezone(timezone.utc)


def isoformat(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _count(value: object, *, positive: bool = False) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    if value < (1 if positive else 0):
        return None
    return value


def _completion_key(row: dict[str, Any]) -> datetime:
    return parse_time(row.get("completedAt")) or datetime.min.replace(
        tzinfo=timezone.utc
    )


def _newest_completed_at(rows: list[dict[str, Any]]) -> str | None:
    if not rows:
        return None
    return max(rows, key=_completion_key)["completedAt"]


def validate_turn(
    value: object, now: datetime, window: timedelta = EVIDENCE_WINDOW
) -> tuple[dict[str, Any] | None, str]:
    if not isinstance(value, dict) or value.get("schema") != TURN_SCHEMA:
        return None, "turn-schema-invalid"
    if now.tzinfo is None or now.utcoffset() is None:
        return None, "turn-completion-invalid"
    provider = value.get("provider")
    profile = value.get("profile")
    model = value.get("model")
    if (
        not isinstance(provider, str)
        or PROVIDER_IDENTITY.fullmatch(provider) is None
        or not isinstance(profile, str)
        or PROFILE_IDENTITY.fullmatch(profile) is None
        or not isinstance(model, str)
        or not model
        or model != model.strip()
    ):
        return None, "turn-identity-invalid"
    completed = parse_time(value.get("completedAt"))
    if completed is None:
        return None, "turn-completion-invalid"
    age = now - completed
    if age < timedelta(0) or age > window:
        return None, "turn-completion-stale-or-future"
    rc = value.get("rc")
    if type(rc) is not int or rc != 0 or value.get("useful") is not True:
        return None, "turn-not-successful-useful"
    digest = value.get("outputDigest")
    if not isinstance(digest, str) or DIGEST.fullmatch(digest) is None:
        return None, "turn-output-digest-invalid"
    output_bytes = _count(value.get("outputBytes"), positive=True)
    tokens = value.get("tokens")
    if not isinstance(tokens, dict):
        return None, "turn-tokens-invalid"
    input_tokens = _count(tokens.get("input"))
    output_tokens = _count(tokens.get("output"), positive=True)
    total_tokens = _count(tokens.get("total"), positive=True)
    if (
        output_bytes is None
        or input_tokens is None
        or output_tokens is None
        or total_tokens != input_tokens + output_tokens
    ):
        return None, "turn-output-or-tokens-invalid"
    return (
        {
            "schema": TURN_SCHEMA,
            "provider": provider,
            "profile": profile,
            "model": model,
            "completedAt": isoformat(completed),
            "rc": 0,
            "useful": True,
            "outputDigest": digest,
            "outputBytes": output_bytes,
            "tokens": {
                "input": input_tokens,
                "output": output_tokens,
                "total": total_tokens,
            },
        },
        "accepted",
    )


def _enrollment_profiles(
    enrollment: dict[str, object] | None,
) -> dict[str, set[str]]:
    normalized: dict[str, set[str]] = {}
    if enrollment is None:
        return normalized
    for provider, profiles in enrollment.items():
        if (
            not isinstance(provider, str)
            or PROVIDER_IDENTITY.fullmatch(provider) is None
        ):
            continue
        if not isinstance(profiles, (list, tuple, set)):
            continue
        accepted = {
            profile
            for profile in profiles
            if isinstance(profile, str)
            and PROFILE_IDENTITY.fullmatch(profile) is not None
        }
        normalized[provider] = accepted
    return normalized


def _providers(
    rows: list[dict[str, Any]], enrollment: dict[str, object] | None = None
) -> dict[str, dict[str, Any]]:
    enrolled_profiles = _enrollment_profiles(enrollment)
    if enrollment is None:
        for row in rows:
            enrolled_profiles.setdefault(row["provider"], set()).add(row["profile"])
    ready: dict[str, int] = {}
    for row in rows:
        ready[row["provider"]] = ready.get(row["provider"], 0) + 1
    result: dict[str, dict[str, Any]] = {}
    for provider in sorted(set(ready) | set(enrolled_profiles)):
        profiles = sorted(enrolled_profiles.get(provider, set()))
        result[provider] = {
            "enrolled": len(profiles),
            "enrolledProfiles": profiles,
            "ready": ready.get(provider, 0),
            "enrollmentSource": "credential-file-presence-only",
            "readinessSource": CAPACITY_SOURCE,
        }
    return result


def _ledger_lock_path(ledger: pathlib.Path) -> pathlib.Path:
    return ledger.with_name(f".{ledger.name}.lock")


def _compaction_receipt_path(ledger: pathlib.Path) -> pathlib.Path:
    return ledger.with_name(f"{ledger.name}.compaction.json")


def _atomic_private_write(path: pathlib.Path, payload: bytes) -> None:
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def _read_compaction_receipt(ledger: pathlib.Path) -> dict[str, Any] | None:
    try:
        value = json.loads(_compaction_receipt_path(ledger).read_text(encoding="utf-8"))
    except (OSError, TypeError, ValueError, json.JSONDecodeError):
        return None
    if (
        not isinstance(value, dict)
        or value.get("schema") != COMPACTION_SCHEMA
        or _count(value.get("totalPruned")) is None
        or _count(value.get("retainedRows")) is None
    ):
        return None
    return value


def _read_locked_ledger(ledger: pathlib.Path) -> tuple[bytes, dict[str, Any] | None]:
    ledger.parent.mkdir(parents=True, exist_ok=True)
    lock_descriptor = os.open(
        _ledger_lock_path(ledger), os.O_RDWR | os.O_CREAT, 0o600
    )
    try:
        with os.fdopen(lock_descriptor, "rb") as lock_handle:
            fcntl.flock(lock_handle.fileno(), fcntl.LOCK_SH)
            try:
                raw = ledger.read_bytes()
            except OSError:
                raw = b""
            compaction = _read_compaction_receipt(ledger)
            fcntl.flock(lock_handle.fileno(), fcntl.LOCK_UN)
    except BaseException:
        try:
            os.close(lock_descriptor)
        except OSError:
            pass
        raise
    return raw, compaction


def _compact_locked_ledger(
    ledger: pathlib.Path, raw: bytes, now: datetime
) -> dict[str, Any] | None:
    lines = raw.splitlines()
    if len(lines) <= MAX_LEDGER_ROWS and len(raw) <= MAX_LEDGER_BYTES:
        return None
    latest: dict[tuple[str, str], dict[str, Any]] = {}
    for line in lines:
        try:
            candidate = json.loads(line)
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
        row, _ = validate_turn(candidate, now)
        if row is None:
            continue
        identity = (row["provider"], row["profile"])
        previous = latest.get(identity)
        if previous is None or _completion_key(row) > _completion_key(previous):
            latest[identity] = row
    retained = [latest[key] for key in sorted(latest)]
    compacted = b"".join(
        (json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n").encode(
            "utf-8"
        )
        for row in retained
    )
    prior = _read_compaction_receipt(ledger) or {}
    pruned = len(lines) - len(retained)
    receipt = {
        "schema": COMPACTION_SCHEMA,
        "observedAt": isoformat(now),
        "reason": "hot-ledger-bound",
        "beforeRows": len(lines),
        "retainedRows": len(retained),
        "prunedRows": pruned,
        "totalPruned": int(prior.get("totalPruned") or 0) + pruned,
        "windowSeconds": int(EVIDENCE_WINDOW.total_seconds()),
        "beforeSha256": hashlib.sha256(raw).hexdigest(),
        "afterSha256": hashlib.sha256(compacted).hexdigest(),
    }
    _atomic_private_write(ledger, compacted)
    _atomic_private_write(
        _compaction_receipt_path(ledger),
        (json.dumps(receipt, sort_keys=True, separators=(",", ":")) + "\n").encode(
            "utf-8"
        ),
    )
    return receipt


def build_capacity_receipt(
    ledger: pathlib.Path,
    now: datetime,
    enrollment: dict[str, object] | None = None,
) -> dict[str, Any]:
    try:
        raw, compaction = _read_locked_ledger(ledger)
    except OSError:
        raw = b""
        compaction = None
    seats: dict[tuple[str, str], dict[str, Any]] = {}
    rejected = 0
    unenrolled = 0
    enrolled_profiles = _enrollment_profiles(enrollment)
    for line in raw.splitlines():
        try:
            candidate = json.loads(line)
        except (TypeError, ValueError, json.JSONDecodeError):
            rejected += 1
            continue
        row, _ = validate_turn(candidate, now)
        if row is None:
            rejected += 1
            continue
        if enrollment is not None and row["profile"] not in enrolled_profiles.get(
            row["provider"], set()
        ):
            unenrolled += 1
            continue
        # A profile is one subscription lease regardless of which model it ran.
        key = (row["provider"], row["profile"])
        previous = seats.get(key)
        if previous is None or _completion_key(row) > _completion_key(previous):
            seats[key] = row
    rows = [seats[key] for key in sorted(seats)]
    observed_at = _newest_completed_at(rows)
    return {
        "schema": CAPACITY_SCHEMA,
        "source": CAPACITY_SOURCE,
        "observedAt": observed_at,
        "target": len(rows),
        "approved": bool(rows),
        "severeIncidents": 0,
        "rows": rows,
        "providers": _providers(rows, enrollment),
        "ledger": {
            "schema": TURN_SCHEMA,
            "sha256": hashlib.sha256(raw).hexdigest(),
            "totalRows": len(raw.splitlines()),
            "acceptedSeats": len(rows),
            "rejectedRows": rejected,
            "unenrolledRows": unenrolled,
            "compaction": compaction,
        },
    }


def validate_capacity_receipt(
    value: object, now: datetime
) -> tuple[dict[str, Any] | None, str]:
    if not isinstance(value, dict) or value.get("schema") != CAPACITY_SCHEMA:
        return None, "capacity-evidence-schema-invalid"
    if value.get("source") != CAPACITY_SOURCE:
        return None, "capacity-evidence-source-invalid"
    rows = value.get("rows")
    if not isinstance(rows, list):
        return None, "capacity-evidence-rows-invalid"
    normalized: list[dict[str, Any]] = []
    identities: set[tuple[str, str]] = set()
    for candidate in rows:
        row, reason = validate_turn(candidate, now)
        if row is None:
            return None, reason
        identity = (row["provider"], row["profile"])
        if identity in identities:
            return None, "capacity-evidence-duplicate-seat"
        identities.add(identity)
        normalized.append(row)
    target = _count(value.get("target"), positive=True)
    if target is None or target != len(normalized) or target > MAX_CAPACITY:
        return None, "capacity-evidence-target-mismatch-or-zero"
    observed_at = _newest_completed_at(normalized)
    if observed_at is None:
        return None, "capacity-evidence-observed-at-mismatch"
    if parse_time(value.get("observedAt")) != parse_time(observed_at):
        return None, "capacity-evidence-observed-at-mismatch"
    severe_incidents = _count(value.get("severeIncidents"))
    if value.get("approved") is not True or severe_incidents != 0:
        return None, "capacity-evidence-not-approved-clean"
    providers = value.get("providers")
    if not isinstance(providers, dict):
        return None, "capacity-evidence-providers-invalid"
    expected_ready: dict[str, int] = {}
    for row in normalized:
        expected_ready[row["provider"]] = expected_ready.get(row["provider"], 0) + 1
    for provider, ready in expected_ready.items():
        record = providers.get(provider)
        if not isinstance(record, dict) or record.get("ready") != ready:
            return None, "capacity-evidence-provider-row-mismatch"
    for provider, record in providers.items():
        if (
            not isinstance(provider, str)
            or PROVIDER_IDENTITY.fullmatch(provider) is None
            or not isinstance(record, dict)
        ):
            return None, "capacity-evidence-provider-row-mismatch"
        profiles = record.get("enrolledProfiles")
        enrolled = _count(record.get("enrolled"))
        provider_ready = _count(record.get("ready"))
        if (
            not isinstance(profiles, list)
            or any(
                not isinstance(profile, str)
                or PROFILE_IDENTITY.fullmatch(profile) is None
                for profile in profiles
            )
            or profiles != sorted(set(profiles))
            or enrolled != len(profiles)
            or provider_ready != expected_ready.get(provider, 0)
        ):
            return None, "capacity-evidence-provider-row-mismatch"
        ready_profiles = {
            row["profile"] for row in normalized if row["provider"] == provider
        }
        if not ready_profiles.issubset(set(profiles)):
            return None, "capacity-evidence-profile-not-enrolled"
    return {
        **value,
        "observedAt": observed_at,
        "rows": normalized,
        "accepted": True,
    }, "accepted"


def useful_turns_from_app_server(
    stream: pathlib.Path,
    *,
    provider: str,
    profile: str,
    model: str,
    completed_at: datetime,
) -> list[dict[str, Any]]:
    """Extract completed, nonempty, token-bearing v2 app-server turns.

    The stream itself is never persisted in the ledger. Only an output digest,
    byte count, token counts, and the opaque provider/profile/model identity
    are retained.
    """
    tokens: dict[str, dict[str, int]] = {}
    output: dict[str, list[str]] = {}
    completed: set[str] = set()
    current_turn: str | None = None
    try:
        lines = stream.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return []
    for line in lines:
        try:
            event = json.loads(line)
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
        if not isinstance(event, dict):
            continue
        method = event.get("method")
        params = event.get("params")
        if not isinstance(params, dict):
            continue
        turn = params.get("turn")
        turn_id = params.get("turnId")
        if method == "turn/started" and isinstance(turn, dict):
            current_turn = turn.get("id") if isinstance(turn.get("id"), str) else None
            continue
        if not isinstance(turn_id, str) or not turn_id:
            turn_id = current_turn
        if method == "thread/tokenUsage/updated" and isinstance(turn_id, str):
            usage = params.get("tokenUsage")
            last = usage.get("last") if isinstance(usage, dict) else None
            if isinstance(last, dict):
                candidate = {
                    "input": last.get("inputTokens"),
                    "output": last.get("outputTokens"),
                    "total": last.get("totalTokens"),
                }
                if all(_count(value) is not None for value in candidate.values()):
                    tokens[turn_id] = candidate  # type: ignore[assignment]
            continue
        if method == "item/completed" and isinstance(turn_id, str):
            item = params.get("item")
            text = item.get("text") if isinstance(item, dict) else None
            if (
                isinstance(item, dict)
                and item.get("type") == "agentMessage"
                and isinstance(text, str)
                and text
            ):
                output.setdefault(turn_id, []).append(text)
            continue
        if method == "turn/completed" and isinstance(turn, dict):
            identifier = turn.get("id")
            if isinstance(identifier, str) and turn.get("status") == "completed":
                completed.add(identifier)
    rows: list[dict[str, Any]] = []
    for turn_id in sorted(completed):
        usage = tokens.get(turn_id)
        text = "\n".join(output.get(turn_id, []))
        encoded = text.encode("utf-8")
        if (
            not text
            or usage is None
            or _count(usage.get("output"), positive=True) is None
            or usage.get("total") != usage.get("input", 0) + usage.get("output", 0)
        ):
            continue
        rows.append(
            {
                "schema": TURN_SCHEMA,
                "provider": provider,
                "profile": profile_identity(provider, profile),
                "model": model,
                "completedAt": isoformat(completed_at),
                "rc": 0,
                "useful": True,
                "outputDigest": hashlib.sha256(encoded).hexdigest(),
                "outputBytes": len(encoded),
                "tokens": usage,
            }
        )
    return rows


def useful_turns_from_exec(
    stream: pathlib.Path,
    *,
    provider: str,
    profile: str,
    model: str,
    completed_at: datetime,
) -> list[dict[str, Any]]:
    """Extract one successful noninteractive Codex JSONL turn.

    This is the bounded cold-start proof path. It requires a completed turn,
    a nonempty final agent message, positive provider-reported output tokens,
    and no terminal failure. Prompt/response text is reduced to a digest.
    """
    final_messages: list[str] = []
    usage: dict[str, int] | None = None
    failed = False
    try:
        lines = stream.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return []
    for line in lines:
        try:
            event = json.loads(line)
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
        if not isinstance(event, dict):
            continue
        event_type = event.get("type")
        if event_type in {"error", "turn.failed"}:
            failed = True
            continue
        if event_type == "item.completed":
            item = event.get("item")
            text = item.get("text") if isinstance(item, dict) else None
            if (
                isinstance(item, dict)
                and item.get("type") == "agent_message"
                and isinstance(text, str)
                and text
            ):
                final_messages.append(text)
            continue
        if event_type == "turn.completed":
            raw_usage = event.get("usage")
            if isinstance(raw_usage, dict):
                input_tokens = _count(raw_usage.get("input_tokens"))
                output_tokens = _count(raw_usage.get("output_tokens"), positive=True)
                if input_tokens is not None and output_tokens is not None:
                    usage = {
                        "input": input_tokens,
                        "output": output_tokens,
                        "total": input_tokens + output_tokens,
                    }
    text = "\n".join(final_messages)
    encoded = text.encode("utf-8")
    if failed or not text or usage is None:
        return []
    return [
        {
            "schema": TURN_SCHEMA,
            "provider": provider,
            "profile": profile_identity(provider, profile),
            "model": model,
            "completedAt": isoformat(completed_at),
            "rc": 0,
            "useful": True,
            "outputDigest": hashlib.sha256(encoded).hexdigest(),
            "outputBytes": len(encoded),
            "tokens": usage,
        }
    ]


def append_rows(
    ledger: pathlib.Path,
    rows: list[dict[str, Any]],
    *,
    now: datetime | None = None,
) -> int:
    if not rows:
        return 0
    ledger.parent.mkdir(parents=True, exist_ok=True)
    lock_descriptor = os.open(
        _ledger_lock_path(ledger), os.O_RDWR | os.O_CREAT, 0o600
    )
    try:
        with os.fdopen(lock_descriptor, "rb") as lock_handle:
            fcntl.flock(lock_handle.fileno(), fcntl.LOCK_EX)
            descriptor = os.open(
                ledger, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600
            )
            with os.fdopen(descriptor, "a", encoding="utf-8") as handle:
                os.fchmod(handle.fileno(), 0o600)
                for row in rows:
                    handle.write(
                        json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n"
                    )
                handle.flush()
                os.fsync(handle.fileno())
            raw = ledger.read_bytes()
            _compact_locked_ledger(ledger, raw, now or datetime.now(timezone.utc))
            fcntl.flock(lock_handle.fileno(), fcntl.LOCK_UN)
    except BaseException:
        try:
            os.close(lock_descriptor)
        except OSError:
            pass
        raise
    return len(rows)


def main() -> int:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    record = subparsers.add_parser("record-app-server")
    record.add_argument("--stream", type=pathlib.Path, required=True)
    record.add_argument("--ledger", type=pathlib.Path, required=True)
    record.add_argument("--provider", required=True)
    record.add_argument("--profile", required=True)
    record.add_argument("--model", required=True)
    record.add_argument("--started-at-epoch", type=float, required=True)
    record_exec = subparsers.add_parser("record-exec")
    record_exec.add_argument("--stream", type=pathlib.Path, required=True)
    record_exec.add_argument("--ledger", type=pathlib.Path, required=True)
    record_exec.add_argument("--provider", required=True)
    record_exec.add_argument("--profile", required=True)
    record_exec.add_argument("--model", required=True)
    record_exec.add_argument("--started-at-epoch", type=float, required=True)
    args = parser.parse_args()
    completed_at = datetime.now(timezone.utc)
    started_at = datetime.fromtimestamp(args.started_at_epoch, timezone.utc)
    duration = completed_at - started_at
    if duration < timedelta(0) or duration > MAX_CAPTURE_DURATION:
        rows = []
    elif args.command == "record-app-server":
        rows = useful_turns_from_app_server(
            args.stream,
            provider=args.provider,
            profile=args.profile,
            model=args.model,
            completed_at=completed_at,
        )
    else:
        rows = useful_turns_from_exec(
            args.stream,
            provider=args.provider,
            profile=args.profile,
            model=args.model,
            completed_at=completed_at,
        )
    written = append_rows(args.ledger, rows)
    print(json.dumps({"schema": TURN_SCHEMA, "written": written}, sort_keys=True))
    return 0 if written else 1


if __name__ == "__main__":
    raise SystemExit(main())
