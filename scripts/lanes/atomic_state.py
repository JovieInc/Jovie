"""Whole-file state writes. A truncating `Path.write_text` leaves a window where a reader that does
not hold the writer's lock sees an empty file (JSONDecodeError in ClaimScanCacheTest, 8 of 150 loaded
runs; it refused a Gem release). Stage the content beside the target and swap it in atomically."""
import os
import uuid
import fcntl
import json
import math
import stat
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
