"""Tolerant read of the append-only lanes run ledger (runs/ledger.jsonl).

On 2026-10-26 a full disk tore 11 lines (two records spliced into one). A reader that fails on any
bad line turned every preserved repair into `preserved-ledger-unreadable`, so no Jovie fix could
resume (2026-11-07). Callers get the parseable records plus a flag saying whether any line was
unparseable, so they can still fail closed when the record they need may be one of the torn lines.
"""
from __future__ import annotations

import json
from pathlib import Path


def rows(path: Path) -> tuple[list[dict], bool]:
    """(records that parse as JSON objects, whether any non-empty line did not). OSError propagates."""
    parsed: list[dict] = []
    malformed = False
    for line in Path(path).read_text().splitlines():
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except ValueError:
            malformed = True
            continue
        if isinstance(value, dict):
            parsed.append(value)
        else:
            malformed = True
    return parsed, malformed
