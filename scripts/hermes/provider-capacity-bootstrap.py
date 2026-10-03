#!/usr/bin/env python3
"""Bounded, read-only cold-start proof for configured Codex subscriptions.

This runs only for enrolled profiles without a fresh useful-turn row. Each
canary is pinned to one existing profile through codex-rotate's normal account
lease, uses an ephemeral/read-only Codex turn, and writes proof through the
same redacted ledger path as production work. Failure leaves capacity closed.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import fcntl
import json
import os
import pathlib
import signal
import subprocess
import tempfile
import time
from datetime import datetime, timezone

from provider_useful_turns import (
    MAX_CAPACITY,
    build_capacity_receipt,
    profile_identity,
)


STATE_SCHEMA = "symphony-capacity-bootstrap-state/v1"
BASE_BACKOFF_SECONDS = 300
MAX_BACKOFF_SECONDS = 21_600
DEFAULT_BATCH = 8


def enrolled_labels(root: pathlib.Path) -> list[str]:
    try:
        return sorted(
            path.name
            for path in root.iterdir()
            if path.is_dir()
            and (path / "auth.json").is_file()
            and (path / "config.toml").is_file()
        )
    except OSError:
        return []


def run_canary(
    profile: str,
    *,
    launcher: pathlib.Path,
    helper: pathlib.Path,
    ledger: pathlib.Path,
    accounts_root: pathlib.Path,
    model: str,
    timeout_seconds: int,
) -> bool:
    environment = os.environ.copy()
    environment.update(
        {
            "CODEX_ACCOUNTS_ROOT": str(accounts_root),
            "CODEX_REQUIRED_ACCOUNT": profile,
            "CODEX_ACCOUNT_WAIT_SECONDS": str(min(timeout_seconds, 30)),
            "GEM_PROVIDER_TURN_LEDGER": str(ledger),
            "SYMPHONY_USEFUL_TURN_HELPER": str(helper),
        }
    )
    command = [
        str(launcher),
        "--config",
        f"model={model}",
        "exec",
        "--ephemeral",
        "--json",
        "--skip-git-repo-check",
        "--sandbox",
        "read-only",
        "Reply with exactly SYMPHONY_CAPACITY_OK. Do not use tools.",
    ]
    try:
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=environment,
            start_new_session=True,
        )
    except OSError:
        return False
    try:
        process.communicate(timeout=timeout_seconds)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            process.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.communicate()
        return False
    return process.returncode == 0


def read_state(path: pathlib.Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, TypeError, ValueError):
        return {"schema": STATE_SCHEMA, "profiles": {}}
    if (
        not isinstance(value, dict)
        or value.get("schema") != STATE_SCHEMA
        or not isinstance(value.get("profiles"), dict)
    ):
        return {"schema": STATE_SCHEMA, "profiles": {}}
    return value


def atomic_write_state(path: pathlib.Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def select_attempts(
    labels: list[str],
    proven: set[str],
    state: dict,
    *,
    now_epoch: int,
    maximum: int,
) -> tuple[list[str], int]:
    attempts = state.get("profiles") if isinstance(state.get("profiles"), dict) else {}
    candidates: list[str] = []
    deferred = 0
    for profile in labels:
        identity = profile_identity("openai", profile)
        if identity in proven:
            continue
        record = attempts.get(identity)
        next_attempt = record.get("nextAttemptAt") if isinstance(record, dict) else 0
        if isinstance(next_attempt, int) and next_attempt > now_epoch:
            deferred += 1
            continue
        candidates.append(profile)
    return candidates[:maximum], deferred + max(0, len(candidates) - maximum)


def update_attempt_state(
    state: dict,
    outcomes: dict[str, bool],
    *,
    now_epoch: int,
) -> dict:
    profiles = state.setdefault("profiles", {})
    if not isinstance(profiles, dict):
        profiles = {}
        state["profiles"] = profiles
    for profile, succeeded in outcomes.items():
        identity = profile_identity("openai", profile)
        if succeeded:
            profiles.pop(identity, None)
            continue
        previous = profiles.get(identity)
        previous_failures = (
            previous.get("failures", 0) if isinstance(previous, dict) else 0
        )
        failures = previous_failures + 1 if isinstance(previous_failures, int) else 1
        delay = min(MAX_BACKOFF_SECONDS, BASE_BACKOFF_SECONDS * (2 ** (failures - 1)))
        profiles[identity] = {
            "failures": failures,
            "lastAttemptAt": now_epoch,
            "nextAttemptAt": now_epoch + delay,
            "lastResult": "failed",
        }
    state["schema"] = STATE_SCHEMA
    return state


def main() -> int:
    directory = pathlib.Path(__file__).resolve().parent
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--accounts-root",
        type=pathlib.Path,
        default=pathlib.Path(
            os.environ.get("CODEX_ACCOUNTS_ROOT", pathlib.Path.home() / ".codex-accounts")
        ),
    )
    parser.add_argument(
        "--ledger",
        type=pathlib.Path,
        default=pathlib.Path(
            os.environ.get(
                "GEM_PROVIDER_TURN_LEDGER",
                pathlib.Path.home() / "gem-workspace/state/provider-useful-turns.jsonl",
            )
        ),
    )
    parser.add_argument(
        "--launcher",
        type=pathlib.Path,
        default=pathlib.Path.home() / ".local/bin/codex-rotate",
    )
    parser.add_argument(
        "--helper", type=pathlib.Path, default=directory / "provider_useful_turns.py"
    )
    parser.add_argument("--model", default="gpt-5.6-sol")
    parser.add_argument("--timeout-seconds", type=int, default=120)
    parser.add_argument(
        "--state",
        type=pathlib.Path,
        default=pathlib.Path.home()
        / "gem-workspace/state/provider-capacity-bootstrap.json",
    )
    parser.add_argument("--max-attempts-per-run", type=int, default=DEFAULT_BATCH)
    args = parser.parse_args()

    args.state.parent.mkdir(parents=True, exist_ok=True)
    lock_path = pathlib.Path(f"{args.state}.lock")
    with lock_path.open("a+", encoding="utf-8") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        labels = enrolled_labels(args.accounts_root)[:MAX_CAPACITY]
        enrollment = {
            "openai": [profile_identity("openai", profile) for profile in labels]
        }
        before = build_capacity_receipt(
            args.ledger, datetime.now(timezone.utc), enrollment
        )
        proven = {row["profile"] for row in before["rows"]}
        state = read_state(args.state)
        now_epoch = int(time.time())
        missing, deferred = select_attempts(
            labels,
            proven,
            state,
            now_epoch=now_epoch,
            maximum=max(1, min(args.max_attempts_per_run, MAX_CAPACITY)),
        )
        outcomes: dict[str, bool] = {}
        if missing and args.launcher.is_file() and args.helper.is_file():
            with concurrent.futures.ThreadPoolExecutor(max_workers=len(missing)) as pool:
                futures = {
                    profile: pool.submit(
                        run_canary,
                        profile,
                        launcher=args.launcher,
                        helper=args.helper,
                        ledger=args.ledger,
                        accounts_root=args.accounts_root,
                        model=args.model,
                        timeout_seconds=max(1, min(args.timeout_seconds, 600)),
                    )
                    for profile in missing
                }
                for profile, future in futures.items():
                    try:
                        outcomes[profile] = bool(future.result())
                    except Exception:
                        outcomes[profile] = False
        else:
            outcomes = {profile: False for profile in missing}
        after = build_capacity_receipt(
            args.ledger, datetime.now(timezone.utc), enrollment
        )
        proven_after = {row["profile"] for row in after["rows"]}
        outcomes = {
            profile: succeeded
            and profile_identity("openai", profile) in proven_after
            for profile, succeeded in outcomes.items()
        }
        atomic_write_state(
            args.state,
            update_attempt_state(state, outcomes, now_epoch=now_epoch),
        )
    succeeded = sum(outcomes.values())
    print(
        json.dumps(
            {
                "schema": "symphony-capacity-bootstrap/v1",
                "enrolled": len(labels),
                "attempted": len(missing),
                "deferred": deferred,
                "succeeded": succeeded,
                "ready": after["target"],
            },
            sort_keys=True,
        )
    )
    # The evidence generator must still publish a typed zero receipt when
    # canaries fail, so bootstrap failure never blocks fail-closed evaluation.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
