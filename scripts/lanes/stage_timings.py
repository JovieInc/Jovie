#!/usr/bin/env python3
"""Lane stage timings for Summer's improvement portfolio and Ovie.

Schema ``symphony-lane-stage-timings/v1``: per stage (provider/kind) run counts, outcome mix and
duration p50/p95 in seconds over a trailing window, computed from runs/ledger.jsonl only (no GitHub
or Linear calls). autoscale.apply_tick refreshes ``stage-timings.json`` at most every REFRESH_S and the
result is embedded in autoscale.json ``metrics.stages`` and in lanes-status.json ``autoscale.metrics.stages``.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

SCHEMA, FILE, REFRESH_S, WINDOW_S = "symphony-lane-stage-timings/v1", "stage-timings.json", 600, 7 * 86400
CONVERTED = frozenset({"pushed", "fix-pushed", "pr-opened", "landing", "decomposed"})
# Rows that are bookkeeping, not an attempt a worker made.
NOT_ATTEMPTS = frozenset({"remote-held", "skipped", "duplicate-active", "duplicate_active", "epic-children-active",
                          "defaulted", "held", "gate-deferred", "quarantined"})


def _epoch(value):
    try:
        return datetime.strptime(str(value), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()
    except ValueError:
        return None


def _pct(values: list, q: float):
    values = sorted(values)
    return round(values[min(len(values) - 1, int(len(values) * q))], 1) if values else None


def compute(state_dir, now: float, window_s: int = WINDOW_S) -> dict:
    stages: dict = {}
    try:
        handle = open(Path(state_dir) / "runs" / "ledger.jsonl", "rb")
    except OSError:
        release = release_stage(state_dir, now, window_s)
        return {"schema": SCHEMA, "windowS": window_s, "observedAt": now, "error": "ledger-unreadable",
                "stages": {RELEASE_STAGE: release} if release else {}}
    with handle:
        for raw in handle:
            if b"jovie-lane-run" not in raw:
                continue
            try:
                row = json.loads(raw)
            except ValueError:
                continue
            began, ended = _epoch(row.get("startedAt")), _epoch(row.get("endedAt"))
            verdict, provider = row.get("verdict"), row.get("provider")
            if began is None or ended is None or not 0 <= now - began <= window_s or not provider or verdict in NOT_ATTEMPTS:
                continue
            claim = any(isinstance(r, str) and r.startswith("claim-error:") for r in row.get("reasons") or [])
            slot = stages.setdefault(f"{provider}/{row.get('kind') or 'issue'}", {"durations": [], "converted": 0, "claimErrors": 0})
            slot["durations"].append(max(0.0, ended - began))
            slot["converted"] += verdict in CONVERTED
            slot["claimErrors"] += claim
    out = {}
    for name, slot in sorted(stages.items()):
        n = len(slot["durations"])
        out[name] = {"count": n, "convertedPerAttempt": round(slot["converted"] / n, 3), "claimErrors": slot["claimErrors"],
                     "p50S": _pct(slot["durations"], .5), "p95S": _pct(slot["durations"], .95)}
    release = release_stage(state_dir, now, window_s)
    if release:
        out[RELEASE_STAGE] = release
    return {"schema": SCHEMA, "windowS": window_s, "observedAt": now, "stages": out}


# Merge -> production lead time per release, recorded by deploy_health when the SHA jov.ie serves changes
# (deploy-lag-jovie.json `releases`; leadTimeS is the release's newest merge to its production deploy).
RELEASE_STAGE, RELEASE_FILE = "release/merge-to-production", "deploy-lag-jovie.json"


def release_stage(state_dir, now: float, window_s: int = WINDOW_S) -> dict | None:
    try:
        rows = json.loads((Path(state_dir) / RELEASE_FILE).read_text()).get("releases") or []
    except (OSError, ValueError, AttributeError):
        return None
    lead = [float(r["leadTimeS"]) for r in rows if isinstance(r, dict) and isinstance(r.get("leadTimeS"), int)
            and isinstance(r.get("at"), (int, float)) and 0 <= now - r["at"] <= window_s]
    if not lead:
        return None
    return {"count": len(lead), "p50S": _pct(lead, .5), "p95S": _pct(lead, .95)}


def cached(state_dir, now: float) -> dict:
    path = Path(state_dir) / FILE
    try:
        prior = json.loads(path.read_text())
        if prior.get("schema") == SCHEMA and 0 <= now - prior.get("observedAt", 0) < REFRESH_S:
            return prior
    except (OSError, ValueError):
        pass
    fresh = compute(state_dir, now)
    tmp = path.with_name(f".{FILE}.{os.getpid()}.tmp")
    try:
        tmp.write_text(json.dumps(fresh, sort_keys=True)); os.chmod(tmp, 0o644); os.replace(tmp, path)
    except OSError:
        pass
    return fresh
