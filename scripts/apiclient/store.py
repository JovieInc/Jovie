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

LOCK_STALE_MS = 10_000
LOCK_TIMEOUT_MS = 2_000


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


class FileLedgerStore:
    def __init__(self, root=None, now: Callable[[], int] = now_ms):
        self.dir = Path(root if root is not None else default_state_root()) / "api-ledger"
        self.now = now
        self._warned = False

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
        held = self._lock(lock)
        try:
            ledger = self.read(provider)
            result = fn(ledger)
            prune_ledger(ledger, self.now())
            write_json_atomic(self.path(provider), ledger)
            return result
        finally:
            if held:
                shutil.rmtree(lock, ignore_errors=True)

    def _lock(self, path: Path) -> bool:
        """mkdir is atomic; a stale lock is renamed away so only one breaker wins."""
        deadline = self.now() + LOCK_TIMEOUT_MS
        while True:
            try:
                os.mkdir(path, 0o700)
                return True
            except FileExistsError:
                pass
            try:
                if self.now() - path.stat().st_mtime * 1000 > LOCK_STALE_MS:
                    stale = path.with_name(f"{path.name}.stale-{os.getpid()}-{uuid.uuid4()}")
                    os.rename(path, stale)
                    shutil.rmtree(stale, ignore_errors=True)
                    continue
            except OSError:
                continue  # released between mkdir and stat
            if self.now() > deadline:
                if not self._warned:
                    self._warned = True
                    sys.stderr.write(json.dumps({"schema": "jovie.api-client.lock/v1", "lock": str(path),
                                                 "outcome": "timeout-unlocked"}) + "\n")
                return False
            time.sleep((5 + random.randint(0, 19)) / 1000)


def default_store(env=None):
    env = os.environ if env is None else env
    if env.get("VERCEL") or env.get("JOVIE_API_STATE") == "memory":
        return MemoryLedgerStore()
    return FileLedgerStore(default_state_root(env))
