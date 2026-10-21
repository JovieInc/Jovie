"""Response cache for ETag/Last-Modified and TTL reads (mirror of cache.ts).

A GitHub 304 does not count against the primary limit, so a cached ETag makes a repeat poll free.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
from collections import OrderedDict
from pathlib import Path
from typing import Optional

from .store import write_json_atomic

MAX_CACHED_BODY_BYTES = 1_000_000
KEEP_HEADERS = ("content-type", "etag", "last-modified", "link")


def cache_key(parts) -> str:
    return hashlib.sha256("\0".join(parts).encode()).hexdigest()


def cacheable(status: int, headers: dict, body: str) -> bool:
    return (status == 200 and len(body) <= MAX_CACHED_BODY_BYTES
            and not re.search("no-store", headers.get("cache-control", ""), re.I))


def to_cached(status: int, headers: dict, body: str, now_ms: int) -> dict:
    kept = {k: headers[k] for k in KEEP_HEADERS if k in headers}
    return {"status": status, "headers": kept, "body": body, "etag": headers.get("etag"),
            "lastModified": headers.get("last-modified"), "storedAt": now_ms}


class MemoryResponseCache:
    def __init__(self, max_entries: int = 500):
        self.max = max_entries
        self.entries: "OrderedDict[str, dict]" = OrderedDict()

    def get(self, key: str) -> Optional[dict]:
        hit = self.entries.get(key)
        if hit is not None:
            self.entries.move_to_end(key)
        return hit

    def set(self, key: str, value: dict) -> None:
        self.entries[key] = value
        self.entries.move_to_end(key)
        while len(self.entries) > self.max:
            self.entries.popitem(last=False)


class FileResponseCache:
    """One file per key under <root>/api-cache/<provider>/, shared across processes."""

    def __init__(self, root, provider: str, max_age_ms: int = 86_400_000):
        self.dir = Path(root) / "api-cache" / provider
        self.max_age_ms = max_age_ms
        self.writes = 0

    def get(self, key: str) -> Optional[dict]:
        try:
            return json.loads((self.dir / f"{key}.json").read_text())
        except (OSError, ValueError):
            return None

    def set(self, key: str, value: dict) -> None:
        try:
            self.dir.mkdir(parents=True, exist_ok=True, mode=0o700)
            write_json_atomic(self.dir / f"{key}.json", value)
            self.writes += 1
            if self.writes % 50 == 1:
                self._prune(value["storedAt"])
        except OSError:
            pass  # a cache write failure only costs a future full read

    def _prune(self, now: int) -> None:
        for path in self.dir.iterdir():
            try:
                if now - path.stat().st_mtime * 1000 > self.max_age_ms:
                    os.remove(path)
            except OSError:
                continue
