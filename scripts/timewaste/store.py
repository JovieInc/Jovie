"""Private store: aggregates and category events only. Default location is outside every repo."""
from __future__ import annotations

import json
import os
from pathlib import Path


def root() -> Path:
    path = Path(os.environ.get("JOVIE_TIMEWASTE_DIR") or Path.home() / ".local/state/jovie-timewaste")
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    return path


def write_json(path: Path, data) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=1, sort_keys=True))
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)


def read_json(path: Path, default=None):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return default


def replace_events(source: str, events: list[dict], base: Path | None = None) -> None:
    """One file per source; a collection run replaces its source's events (idempotent re-runs)."""
    base = base or root()
    path = base / f"events-{source}.jsonl"
    tmp = path.with_suffix(".tmp")
    tmp.write_text("".join(json.dumps(e, sort_keys=True) + "\n" for e in events))
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)


def load_events(base: Path | None = None, since: float = 0.0) -> list[dict]:
    base = base or root()
    out = []
    for path in sorted(base.glob("events-*.jsonl")):
        for line in path.read_text().splitlines():
            try:
                e = json.loads(line)
            except ValueError:
                continue
            if e.get("ts", 0) >= since:
                out.append(e)
    return out
