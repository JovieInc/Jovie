#!/usr/bin/env python3
"""Slot ceilings from measured merged-PRs per dollar, per provider.

Hyperagent cost 333 USD in 7 days for 5 proven merges while Grok landed a merge per 1.42 USD. A hand-set
LANES_SLOTS_HYPERAGENT=1 followed that evidence once and would not follow it again. The ceiling here is
derived from the same numbers the capacity metrics already publish (capacity-metrics.json: costUsd and
merged counts per provider, written by the capacity metrics reader), so capacity flows to what lands:

    yield(provider)   = merged PRs / USD over the metrics window
    reference         = best yield among the other providers with at least MIN_MERGES merges
    ceiling(lane)     = clamp(floor(base * yield / reference), PROBE, base)

Only pay-per-use providers (cost basis `credit-*`) are gated. Subscription seats (amortized plan) are
paced by the quota-pace routing instead: their marginal price is near zero while the seat is behind pace.
A provider with no cost, a stale reading or no reference keeps its configured base (fail open, reported).
The PROBE slot keeps measuring a gated provider so a recovered provider earns its slots back.
No second cost model: this reads the registry's provider ids and the metrics file, nothing else.
"""
from __future__ import annotations

import json
import math
import time
from datetime import datetime, timezone
from pathlib import Path

METRICS_FILE = "capacity-metrics.json"
MIN_MERGES, PROBE = 5, 1
STALE_S = 36 * 3600


def _merged(row: dict) -> int:
    return sum(int(row.get(key) or 0) for key in ("mergedCreated", "mergedRepaired", "mergedAgentProven"))


def _yield(row: dict) -> float | None:
    cost = row.get("costUsd")
    if not isinstance(cost, (int, float)) or isinstance(cost, bool) or cost <= 0:
        return None
    return _merged(row) / cost


def _age(metrics: dict, now: float) -> float | None:
    try:
        return now - datetime.fromisoformat(str(metrics["readAt"]).replace("Z", "+00:00")).astimezone(timezone.utc).timestamp()
    except (KeyError, ValueError):
        return None


def read(state: Path) -> dict:
    try:
        data = json.loads((Path(state) / METRICS_FILE).read_text())
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def provider_id(registry: dict, lane: str) -> str | None:
    for row in (registry or {}).get("providers", []):
        if isinstance(row, dict) and row.get("lane") == lane:
            return row.get("id")
    return None


def ceiling(state: Path, lane: str, base: int, registry: dict | None = None, now: float | None = None) -> tuple[int, dict]:
    """(slots, why). Never raises; any missing evidence returns (base, {"gated": False, "why": ...})."""
    now = time.time() if now is None else now
    if base <= PROBE:
        return base, {"gated": False, "why": "base-at-probe"}
    metrics = read(state)
    age = _age(metrics, now)
    if age is None or age > STALE_S:
        return base, {"gated": False, "why": "metrics-stale"}
    if registry is None:
        try:
            import capacity_registry
            registry = capacity_registry.load()
        except Exception:  # the gate is advisory; a broken registry keeps the base
            registry = {}
    rows = metrics.get("providers") or {}
    row = rows.get(provider_id(registry, lane) or lane)
    if not isinstance(row, dict) or not str(row.get("costBasis") or "").startswith("credit"):
        return base, {"gated": False, "why": "not-pay-per-use"}
    own = _yield(row)
    best = max((y for other, r in rows.items() if r is not row and isinstance(r, dict) and _merged(r) >= MIN_MERGES
                for y in [_yield(r)] if y), default=None)  # compared against the others, never against itself
    if own is None or best is None:
        return base, {"gated": False, "why": "no-yield-evidence"}
    slots = min(base, max(PROBE, math.floor(base * own / best)))
    return slots, {"gated": slots < base, "why": "merged-per-usd", "mergedPerUsd": round(own, 4),
                   "referencePerUsd": round(best, 4), "merged": _merged(row), "costUsd": row.get("costUsd")}
