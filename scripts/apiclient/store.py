"""Host-wide ledger storage (mirror of store.ts).

One JSON file per provider under <root>/api-ledger/, guarded by the same mkdir lock the TS
client takes (<provider>.lock.d), so TS and Python processes share one budget.
"""
from __future__ import annotations

import hashlib
import json
import os
import random
import re
import shutil
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Callable, Optional

from .policy import LEDGER_SCHEMA, empty_ledger, prune_ledger

LOCK_STALE_MS = 10_000  # a lock dir older than this belongs to a crashed holder
LOCK_TIMEOUT_MS = 5_000  # wait this long for another process, then run without persisting
_PROCESS_LOCKS: dict = {}
_PROCESS_LOCKS_GUARD = threading.Lock()


def now_ms() -> int:
    return int(time.time() * 1000)


def hash_credential(salt: str, secret: str) -> str:
    return hashlib.sha256(f"{salt}\0{secret}".encode()).hexdigest()


def credential_label(cid: str) -> str:
    """Hashes print as a 12-char prefix; readable labels (app-installation:1) stay whole."""
    return cid[:12] if re.fullmatch(r"[0-9a-f]{64}", cid) else cid


def default_state_root(env=None, home: Optional[str] = None) -> Path:
    env = os.environ if env is None else env
    if env.get("JOVIE_API_STATE_DIR"):
        return Path(env["JOVIE_API_STATE_DIR"])
    if env.get("LANES_STATE"):
        return Path(env["LANES_STATE"])
    return Path(home or Path.home()) / ".local" / "state" / "jovie-lanes"


def _valid(value, provider: str) -> bool:
    return (isinstance(value, dict) and value.get("schema") == LEDGER_SCHEMA
            and value.get("provider") == provider and isinstance(value.get("credentials"), dict))


def write_json_atomic(path: Path, value, mode: int = 0o600) -> None:
    tmp = path.with_name(f"{path.name}.{os.getpid()}.{uuid.uuid4()}.tmp")
    fd = os.open(str(tmp), os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    with os.fdopen(fd, "w") as handle:
        handle.write(json.dumps(value))
    os.replace(tmp, path)


class MemoryLedgerStore:
    def __init__(self):
        self._ledgers: dict = {}
        self._lock = threading.Lock()

    def transact(self, provider: str, fn: Callable[[dict], object]):
        with self._lock:
            ledger = self._ledgers.get(provider) or empty_ledger(provider)
            result = fn(ledger)
            self._ledgers[provider] = ledger
            return result

    def read(self, provider: str) -> dict:
        return json.loads(json.dumps(self._ledgers.get(provider) or empty_ledger(provider)))


def _wall_ms() -> int:
    return int(time.time() * 1000)


def _claim_owner(path: Path) -> Optional[str]:
    """Exclusive-create the owner file in the lock dir we just made; None if we lost it."""
    token = f"{os.getpid()}-{uuid.uuid4()}"
    try:
        fd = os.open(str(path / "owner"), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except (FileExistsError, FileNotFoundError):
        return None
    with os.fdopen(fd, "w") as handle:
        handle.write(token)
    return token


def _is_stale(path: Path) -> bool:
    try:
        return _wall_ms() - path.stat().st_mtime * 1000 > LOCK_STALE_MS
    except OSError:
        return False  # released between mkdir and stat


def _break_stale(path: Path) -> None:
    """Only the holder of <lock>.break may remove a stale lock, and only if it is still stale."""
    breaker = path.with_name(path.name + ".break")
    try:
        os.mkdir(breaker, 0o700)
    except FileExistsError:
        if _is_stale(breaker):
            shutil.rmtree(breaker, ignore_errors=True)
        time.sleep(0.005)
        return
    try:
        if _is_stale(path):
            shutil.rmtree(path, ignore_errors=True)
    finally:
        shutil.rmtree(breaker, ignore_errors=True)


class FileLedgerStore:
    """Lock protocol shared with store.ts: see the FileLedgerStore comment there.

    mkdir lock + owner token, stale locks broken under <lock>.break after a re-check,
    and on timeout the transaction runs on a fresh read but is not persisted. Threads
    in one process queue on an in-process lock first.
    """

    def __init__(self, root=None, now: Callable[[], int] = now_ms, lock_timeout_ms: int = LOCK_TIMEOUT_MS):
        self.dir = Path(root if root is not None else default_state_root()) / "api-ledger"
        self.now = now
        self.lock_timeout_ms = lock_timeout_ms
        # Transactions that ran without persisting after a lock timeout (see store.ts).
        self.unpersisted = 0

    def path(self, provider: str) -> Path:
        return self.dir / f"{provider}.json"

    def read(self, provider: str) -> dict:
        try:
            parsed = json.loads(self.path(provider).read_text())
            if _valid(parsed, provider):
                return parsed
        except (OSError, ValueError):
            pass  # an unreadable budget never blocks work
        return empty_ledger(provider)

    def transact(self, provider: str, fn: Callable[[dict], object]):
        self.dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        lock = self.dir / f"{provider}.lock.d"
        with _PROCESS_LOCKS_GUARD:
            local = _PROCESS_LOCKS.setdefault(str(lock), threading.RLock())
        with local:
            token = self._lock(lock)
            try:
                ledger = self.read(provider)
                result = fn(ledger)
                if token:
                    prune_ledger(ledger, self.now())
                    write_json_atomic(self.path(provider), ledger)
                return result
            finally:
                if token:
                    self._release(lock, token)

    def _lock(self, path: Path) -> Optional[str]:
        """Returns the owner token, or None after a timeout (caller must not persist)."""
        deadline = _wall_ms() + self.lock_timeout_ms
        while True:
            try:
                os.mkdir(path, 0o700)
            except FileExistsError:
                pass
            else:
                token = _claim_owner(path)
                if token:
                    return token
            if _is_stale(path):
                _break_stale(path)
                continue
            if _wall_ms() > deadline:
                self.unpersisted += 1
                sys.stderr.write(json.dumps({"schema": "jovie.api-client.lock/v1", "lock": str(path),
                                             "outcome": "timeout-unpersisted", "count": self.unpersisted}) + "\n")
                return None
            time.sleep((5 + random.randint(0, 19)) / 1000)

    @staticmethod
    def _release(path: Path, token: str) -> None:
        try:
            owner = (path / "owner").read_text()
        except OSError:
            return
        if owner == token:
            shutil.rmtree(path, ignore_errors=True)


def default_store(env=None):
    env = os.environ if env is None else env
    if env.get("VERCEL") or env.get("JOVIE_API_STATE") == "memory":
        return MemoryLedgerStore()
    return FileLedgerStore(default_state_root(env))
