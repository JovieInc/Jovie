"""Lane-side reader for ops/registry/capacity.json (the one agent-capacity registry).

Lanes read caps and policies here instead of constants: quota windows and soft run caps
(`lane_limits`), the per-run spend cap (`per_run_cap_usd`), and the delegation rules and routing
order the coordination layer gives non-lane agents. Pure functions over parsed JSON; a missing or
unreadable registry yields empty answers, never an exception. The live overlay
(`capacity-live.json`, written by capacity_live.py) replaces a snapshot only when newer.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_PATH = HERE.parents[1] / "ops/registry/capacity.json"
LIVE_FILE = "capacity-live.json"
PACE_BAND = 10.0
LIMIT_KEYS = ("softRuns", "windowS", "maxRuns")


def load(path: Path | None = None) -> dict:
    target = Path(os.environ.get("CAPACITY_REGISTRY") or path or DEFAULT_PATH)
    try:
        data = json.loads(target.read_text())
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) and isinstance(data.get("providers"), list) else {}


def provider_for_lane(registry: dict, lane: str) -> dict:
    return next((p for p in registry.get("providers", []) if p.get("lane") == lane), {})


def lane_limits(registry: dict, lane: str) -> dict:
    limits = provider_for_lane(registry, lane).get("limits")
    return limits if isinstance(limits, dict) else {}


def per_run_cap_usd(registry: dict, lane: str) -> float | None:
    cap = lane_limits(registry, lane).get("perRunCapUsd")
    return float(cap) if isinstance(cap, (int, float)) and not isinstance(cap, bool) else None


def apply_limits(providers: dict, registry: dict) -> dict:
    """Overlay registry quota limits (softRuns, windowS, maxRuns) onto each lane's `quota`.

    Only lanes whose spec already has a `quota` source are touched; the registry owns the numbers."""
    for lane, spec in providers.items():
        if not isinstance(spec, dict) or not isinstance(spec.get("quota"), dict):
            continue
        limits = lane_limits(registry, lane)
        spec["quota"].update({key: limits[key] for key in LIMIT_KEYS if key in limits})
    return providers


def _epoch(value) -> float | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc).timestamp()
    except ValueError:
        return None


def read_live(state_dir: Path | None) -> dict:
    if state_dir is None:
        return {}
    try:
        data = json.loads((Path(state_dir) / LIVE_FILE).read_text())
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def merged_quota(account: dict, live_row: dict | None) -> dict | None:
    """The newer of the registry snapshot and the live row."""
    snap, live = account.get("quota"), (live_row or {}).get("quota")
    if not snap or not live:
        return snap or live
    return {**snap, **live} if (_epoch(live.get("observedAt")) or 0) > (_epoch(snap.get("observedAt")) or 0) else snap


def freshness(fact: dict | None, registry: dict, now: float) -> str:
    observed = _epoch((fact or {}).get("observedAt"))
    if observed is None:
        return "unknown"
    t = registry.get("thresholds") or {}
    limit = (t.get("liveMaxAgeHours", 24) * 3600) if fact.get("live") else (t.get("manualMaxAgeDays", 8) * 86400)
    return "stale" if now - observed > limit else "fresh"


def pace_verdict(quota: dict | None, now: float) -> str:
    if not quota:
        return "unknown"
    used = quota.get("usedPercent")
    if used is None and isinstance(quota.get("remainingPercent"), (int, float)):
        used = 100 - quota["remainingPercent"]
    resets, window = _epoch(quota.get("resetsAt")), quota.get("windowMins")
    if resets is not None and resets <= now:
        return "reset-passed"
    if used is None or resets is None or not window:
        return "unknown"
    elapsed = min(100.0, max(0.0, (now - (resets - window * 60)) / (window * 60) * 100))
    delta = used - elapsed
    return "over-burning" if delta > PACE_BAND else "under-burning" if delta < -PACE_BAND else "on-pace"


def delegation_rule(registry: dict, agent: str) -> dict:
    """What an agent may delegate to, and what it costs: {provider, usageModel, policy, rule, delegation}."""
    for provider in registry.get("providers", []):
        if agent in provider.get("agents", []):
            policy = (registry.get("policies") or {}).get((provider.get("policy") or {}).get("id"), {})
            return {"provider": provider["id"], "usageModel": provider.get("usageModel"),
                    "policy": (provider.get("policy") or {}).get("id"), "rule": policy.get("rule"),
                    "delegation": (provider.get("policy") or {}).get("delegation")}
    return {}


def routing_order(registry: dict, now: float, state_dir: Path | None = None) -> list[dict]:
    """Delegation order: uncapped own model, then capped quota under pace, free, the shared pool, credits,
    pay-per-token. A capped provider at or over pace, or unread, ranks behind the pool."""
    live = (read_live(state_dir).get("accounts") or {})
    rows = []
    for provider in registry.get("providers", []):
        model = provider.get("usageModel")
        if (provider.get("policy") or {}).get("id") == "unavailable":
            continue
        verdicts, states = [], []
        for account in provider.get("accounts", []):
            quota = merged_quota(account, live.get(f"{provider['id']}/{account['id']}"))
            verdicts.append(pace_verdict(quota, now))
            if quota:
                states.append(freshness(quota, registry, now))
        if model == "uncapped-own-model":
            rank = 0
        elif model == "capped-quota":
            rank = 1 if set(verdicts) & {"under-burning", "reset-passed"} and "stale" not in states else 3
        elif model == "free":
            rank = 1.5
        elif model == "subscription-pool":
            rank = 2
        elif model == "credits":
            rank = 4
        else:
            rank = 5
        rows.append({"provider": provider["id"], "rank": rank, "verdicts": verdicts,
                     "freshness": "stale" if "stale" in states else "unknown" if not states else "fresh"})
    return sorted(rows, key=lambda r: (r["rank"], r["freshness"] != "fresh"))
