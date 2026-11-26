"""Thin Python reader for scripts/lib/usage-ledger.mjs state (JOV-13050).

Lanes code should treat the JSON ledger file as read-only input. Writers live in the
Node module; this module never duplicates scheduling or provider credentials.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


LEDGER_SCHEMA = "jovie.usage-ledger/v1"


def _parse_iso(value: str | None) -> float | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return stamp.timestamp() if stamp.tzinfo is not None else None
    except ValueError:
        return None


def load(path: Path | str) -> dict:
    target = Path(path)
    try:
        data = json.loads(target.read_text())
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) and data.get("schema") == LEDGER_SCHEMA else {}


def _latest_event(ledger: dict, provider: str, account_id: str, pool: str) -> dict | None:
    latest, latest_at = None, -1.0
    for event in ledger.get("events") or []:
        if not isinstance(event, dict):
            continue
        if event.get("provider") != provider or event.get("accountId") != account_id or event.get("pool") != pool:
            continue
        at = _parse_iso(event.get("observedAt")) or 0.0
        if at >= latest_at:
            latest_at = at
            latest = event
    return latest


def pool_state(
    ledger: dict,
    provider: str,
    account_id: str,
    pool: str,
    *,
    now: float | None = None,
    max_age_s: float = 3600.0,
) -> dict[str, Any]:
    """Mirror the JS readPoolState contract for lane consumers."""
    now = datetime.now(timezone.utc).timestamp() if now is None else now
    event = _latest_event(ledger, provider, account_id, pool)
    observed_at = event.get("observedAt") if event else None
    observed = _parse_iso(observed_at)
    age = None if observed is None else max(0.0, now - observed)
    fresh = age is not None and age <= max_age_s
    remaining = None
    if event and isinstance(event.get("remaining"), dict):
        remaining = event["remaining"].get("value")
    condition = (event or {}).get("condition") or "unknown"
    if condition == "recovered":
        condition = "available"
    return {
        "provider": provider,
        "accountId": account_id,
        "pool": pool,
        "condition": condition,
        "remaining": remaining,
        "observedAt": observed_at,
        "freshness": "fresh" if fresh else ("stale" if observed_at else "unknown"),
        "resetsAt": (event or {}).get("resetsAt"),
        "limitScope": (event or {}).get("limitScope"),
    }


def project_ovie_pools(ledger: dict, *, now: float | None = None) -> dict[str, Any]:
    """Read-only projection without receipts or identity fields."""
    now = datetime.now(timezone.utc).timestamp() if now is None else now
    keys: set[tuple[str, str, str]] = set()
    for event in ledger.get("events") or []:
        if not isinstance(event, dict):
            continue
        keys.add((event.get("provider", ""), event.get("accountId", ""), event.get("pool", "")))
    pools = []
    for provider, account_id, pool in sorted(keys):
        if not provider or not account_id or not pool:
            continue
        state = pool_state(ledger, provider, account_id, pool, now=now)
        pools.append(
            {
                "provider": provider,
                "accountId": account_id,
                "pool": pool,
                "condition": state["condition"],
                "remaining": state["remaining"],
                "observedAt": state["observedAt"],
                "freshness": state["freshness"],
                "resetsAt": state["resetsAt"],
            }
        )
    return {
        "schema": "jovie.usage-ledger-ovie-projection/v1",
        "generatedAt": datetime.fromtimestamp(now, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "pools": pools,
        "controls": "read-only",
        "sourceLedger": LEDGER_SCHEMA,
    }