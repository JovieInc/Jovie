"""Whole-file state writes. A truncating `Path.write_text` leaves a window where a reader that does
not hold the writer's lock sees an empty file (JSONDecodeError in ClaimScanCacheTest, 8 of 150 loaded
runs; it refused a Gem release). Stage the content beside the target and swap it in atomically."""
import os
import subprocess
import time
import uuid
import fcntl
import json
import math
import stat
from datetime import datetime, timezone
from pathlib import Path


def atomic_write_text(path, text: str, encoding: str = "utf-8") -> None:
    # A symlinked state file must keep pointing at its target: replace the target, never the link.
    path = Path(os.path.realpath(path))
    staged = path.with_name(f".{path.name}.{os.getpid()}.{uuid.uuid4().hex[:8]}.tmp")
    try:
        staged.write_text(text, encoding=encoding)
        os.replace(staged, path)
    finally:
        staged.unlink(missing_ok=True)


def ledger_lock_path(path: Path) -> Path:
    """Stable inode shared by appenders and rotation. Never unlink this lock."""
    return Path(path).with_name(Path(path).name + ".lock")


def _ledger_number(text: str) -> float:
    value = float(text)
    if not math.isfinite(value):
        raise ValueError("ledger-nonfinite-number")
    return value


def append_json_object(path: Path, record: dict, *, before_append=None) -> None:
    """Validate before I/O, then append a durable record under the rotation lock.

    All writers must adopt this protocol before use. Advisory locks cannot exclude
    legacy writers. A killed process may leave a partial tail, which fails closed.
    On a caught write/fsync failure restore the original length while still locked;
    a rollback failure is an explicit uncertain outcome, never a successful append.
    before_append reads the locked ledger and must not mutate it.
    """
    if not isinstance(record, dict):
        raise ValueError("ledger-record-not-object")
    text = json.dumps(record, allow_nan=False)
    # Check the serialized representation too, including injected/custom encoders.
    parsed = json.loads(text, parse_float=_ledger_number, parse_constant=_ledger_number)
    if not isinstance(parsed, dict) or "\n" in text or "\r" in text:
        raise ValueError("ledger-record-invalid-serialization")
    json.dumps(parsed, allow_nan=False)
    payload = (text + "\n").encode("utf-8")
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with os.fdopen(os.open(ledger_lock_path(path), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600), "rb+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        with os.fdopen(os.open(path, os.O_CREAT | os.O_RDWR | os.O_APPEND | os.O_NOFOLLOW, 0o600), "rb+") as handle:
            fcntl.flock(handle, fcntl.LOCK_EX)  # compatible with origin writers on this inode
            info = os.fstat(handle.fileno())
            current = path.stat(follow_symlinks=False)
            if not stat.S_ISREG(info.st_mode) or (info.st_dev, info.st_ino) != (current.st_dev, current.st_ino):
                raise OSError("ledger-path-changed")
            size = info.st_size
            if size:
                handle.seek(-1, os.SEEK_END)
                if handle.read(1) != b"\n":
                    raise OSError("ledger-unterminated-tail")
            handle.seek(0)
            if before_append is not None:
                before_append(handle, parsed)
            try:
                remaining = memoryview(payload)
                while remaining:
                    written = os.write(handle.fileno(), remaining)
                    if written <= 0:
                        raise OSError("ledger-short-write")
                    remaining = remaining[written:]
                os.fsync(handle.fileno())
            except BaseException:
                try:
                    os.ftruncate(handle.fileno(), size)
                    os.fsync(handle.fileno())
                except OSError as error:
                    raise OSError("ledger-append-rollback-uncertain") from error
                raise


# Gem install receipt (JOV-14764): what the updater installed and why it refused, readable
# off-host as the lanes-status.json 'release' block. The shape is contractual — Part B's
# doctor closer consumes it — so these four keys are the whole block.
RELEASE_RECEIPT_NAME = "release-receipt.json"
RELEASE_RECEIPT_KEYS = ("sourceCommit", "bundleDigest", "installedAt", "refused")


def now_iso_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _read_json_object(path) -> dict:
    try:
        data = json.loads(Path(path).read_text())
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def read_release_receipt(state) -> dict:
    """The install receipt read back for off-host consumers; {} before the first install."""
    data = _read_json_object(Path(state) / RELEASE_RECEIPT_NAME)
    return {key: data.get(key) for key in RELEASE_RECEIPT_KEYS} if data else {}


def release_status(state, marker=None):
    """The lanes-status.json 'release' block: the receipt, falling back to the legacy
    installed-digest string until the first receipt exists."""
    return read_release_receipt(state) or marker


def write_release_receipt(state, *, bundle=None, refused=None) -> bool:
    """Record install state only (JOV-14764): a successful install pins the installed bundle's
    source commit and digest with refused null; a refusal keeps the installed release's fields
    and names the exact failing release test or check. Atomic (tmp+rename), so a crash mid-write
    or two installs racing leave one complete receipt. Returns False — and never raises — so a
    receipt failure cannot gate or alter the install."""
    try:
        data = _read_json_object(Path(state) / RELEASE_RECEIPT_NAME)
        if bundle is not None:
            data = {"sourceCommit": bundle["sourceCommit"], "bundleDigest": bundle["bundleDigest"],
                    "installedAt": now_iso_utc(), "refused": None}
        else:
            if not data.get("sourceCommit") or not data.get("bundleDigest"):
                active = _read_json_object(Path(state) / "current" / "scripts" / "lanes" / ".release.json")
                data.update(sourceCommit=data.get("sourceCommit") or active.get("sourceCommit"),
                            bundleDigest=data.get("bundleDigest") or active.get("bundleDigest"))
            data.setdefault("installedAt", None)
            data["refused"] = {"reason": refused[0], "at": refused[1]}
        atomic_write_text(Path(state) / RELEASE_RECEIPT_NAME, json.dumps(data, sort_keys=True))
        return True
    except Exception:
        return False


def selftest_refusal_reason(staging):
    """The exact failing release test from the staged self-test's own diagnostic (JOV-14764):
    'release tests failed' alone is why a Gem refusal was invisible off-host."""
    try:
        failed = json.loads((Path(staging) / ".selftest-diagnostic.json").read_text()).get("failedSelectors")
    except (OSError, ValueError):
        return None
    return failed[0] if isinstance(failed, list) and failed and isinstance(failed[0], str) else None


def record_release_refusal(state, staging, tree, why) -> None:
    """Write the refused-tree record AND the receipt (JOV-14764), naming the exact failing
    release test when the staged self-test's diagnostic has one, else the refusing check."""
    atomic_write_text(Path(state) / "update-refused.json", json.dumps({"tree": tree, "at": time.time(), "why": why}))
    write_release_receipt(state, refused=(selftest_refusal_reason(staging) or why, now_iso_utc()))


def release_activated(state, bundle, refused_path) -> None:
    """Resolve the refusal the activation answers and pin the installed bundle (JOV-14764)."""
    Path(refused_path).unlink(missing_ok=True)
    write_release_receipt(state, bundle=bundle)


def note_update_exception(state, failure, error) -> str:
    """An exception refusal (fetch, bundle identity, custody) names its check. A refuse()-then-
    raise (self-test timeout) already wrote the exact reason — keep it, not the exception
    string (JOV-14764)."""
    if not isinstance(failure, subprocess.TimeoutExpired):
        write_release_receipt(state, refused=(error, now_iso_utc()))
    return error
