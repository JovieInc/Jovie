"""Bound runs/ledger.jsonl without losing history that something still reads.

The ledger is append-only and grew ~1.9 MB/day (52 MB at 28 days, 31k rows). Two readers scale
with its size: backlog admission refuses to admit anything above 64,000,000 bytes
(`native-attempt-ledger-read-bound`, fail-closed, about a week away on 2026-10-24) and the doctor
parsed all of it on every pass. Rotation keeps the live file to RETAIN_S of rows:

  * older rows move to `runs/ledger-archive/ledger-YYYYMMDD.jsonl` (the stage-event feed reads them
    for its 28-day window);
  * `runs/ledger-prior-attempts.json` keeps one entry per issue that ever had a native attempt, which is
    all backlog admission uses old rows for (any prior attempt holds an issue as unknown custody).

Appenders open the ledger by path with mode "a" and take no lock, so rotation never rewrites in place:
it renames the file away, waits for in-flight appends to land in the renamed inode, writes the retained
rows to a temp file and `link()`s it into place (EEXIST means an appender already recreated the file; the
retained rows are then appended to it). A crash leaves `ledger.rotating.jsonl`, merged on the next run.
"""
from __future__ import annotations

import fcntl
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

RETAIN_S = 10 * 86400
ROTATE_MIN_BYTES = 8 * 1024 * 1024
ROTATE_EVERY_S = 6 * 3600
SETTLE_S = 2.0
ARCHIVE_DIR = "ledger-archive"
INDEX_FILE = "ledger-prior-attempts.json"
STAMP_FILE = "ledger-rotate.json"
ROTATING = "ledger.rotating.jsonl"
TIME_KEYS = ("recordedAt", "endedAt", "startedAt", "at")


def _epoch(value) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.timestamp() if parsed.tzinfo else None


def row_time(row: dict) -> float | None:
    for key in TIME_KEYS:
        seen = _epoch(row.get(key))
        if seen is not None:
            return seen
    return None


def _day(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y%m%d")


def read_index(state: Path) -> dict:
    try:
        data = json.loads((Path(state) / "runs" / INDEX_FILE).read_text())
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _write_json(path: Path, data: dict) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, sort_keys=True))
    os.replace(tmp, path)


def archive_files(state: Path, since: float) -> list[Path]:
    """Archive files that can hold rows at or after `since` (named by UTC day), oldest first."""
    root = Path(state) / "runs" / ARCHIVE_DIR
    cutoff = _day(since)
    try:
        return sorted(p for p in root.glob("ledger-*.jsonl") if p.stem.split("-", 1)[1] >= cutoff)
    except OSError:
        return []


def due(state: Path, now: float) -> bool:
    try:
        last = float(json.loads((Path(state) / STAMP_FILE).read_text()).get("at") or 0)
    except (OSError, ValueError, TypeError, AttributeError):
        last = 0
    ledger = Path(state) / "runs" / "ledger.jsonl"
    try:
        size = ledger.stat().st_size
    except OSError:
        size = 0
    return (now - last >= ROTATE_EVERY_S and size >= ROTATE_MIN_BYTES) or (Path(state) / "runs" / ROTATING).exists()


def rotate(state: Path, now: float | None = None, settle_s: float = SETTLE_S, sleep=time.sleep) -> dict:
    state, now = Path(state), time.time() if now is None else now
    runs = state / "runs"
    ledger, rotating = runs / "ledger.jsonl", runs / ROTATING
    lock = open(state / "ledger-rotate.lock", "a")
    try:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {"status": "busy"}
        if not rotating.exists():
            if not ledger.exists():
                return {"status": "no-ledger"}
            os.rename(ledger, rotating)
            sleep(settle_s)  # in-flight appenders finish into the renamed inode
        raw = rotating.read_bytes()
        cutoff = now - RETAIN_S
        keep, old, by_day, index = [], 0, {}, read_index(state)
        for line in raw.splitlines():
            try:
                row = json.loads(line)
            except ValueError:
                keep.append(line)
                continue
            seen = row_time(row) if isinstance(row, dict) else None
            if seen is None or seen >= cutoff:
                keep.append(line)
                continue
            old += 1
            by_day.setdefault(_day(seen), []).append(line)
            ident = str(row.get("issue") or row.get("identifier") or "")
            if ident:
                entry = index.setdefault(ident.upper(), {"count": 0})
                entry["count"] += 1
                entry["lastStartedAt"] = max(str(entry.get("lastStartedAt") or ""), str(row.get("startedAt") or ""))
                entry["provider"] = row.get("provider") or entry.get("provider")
        archive = runs / ARCHIVE_DIR
        archive.mkdir(parents=True, exist_ok=True)
        for day, lines in by_day.items():
            with open(archive / f"ledger-{day}.jsonl", "ab") as out:
                out.write(b"\n".join(lines) + b"\n")
        if by_day:
            _write_json(runs / INDEX_FILE, index)
        retained = (b"\n".join(keep) + b"\n") if keep else b""
        tmp = runs / "ledger.retained.tmp"
        tmp.write_bytes(retained)
        try:
            os.link(tmp, ledger)
        except FileExistsError:  # an appender recreated it first: keep its rows, add ours
            with open(ledger, "ab") as out:
                out.write(retained)
        tmp.unlink()
        rotating.unlink()
        _write_json(state / STAMP_FILE, {"at": now, "kept": len(keep), "archived": old, "bytesBefore": len(raw)})
        return {"status": "rotated", "kept": len(keep), "archived": old, "days": sorted(by_day), "bytesBefore": len(raw),
                "bytesAfter": ledger.stat().st_size}
    finally:
        lock.close()
