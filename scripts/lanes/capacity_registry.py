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


# ---------------------------------------------------------------- pace-aware routing
PACE_FREE_FLOOR = -0.9  # a lane behind pace on use-or-lose quota costs a tenth: the quota is sunk
PACE_AHEAD_CAP = 0.5


def _quota_delta(quota: dict, now: float, max_age_s: float) -> float | None:
    """used% minus elapsed% of the window for a routing-fresh live reading, else None."""
    observed = _epoch(quota.get("observedAt"))
    resets, window = _epoch(quota.get("resetsAt")), quota.get("windowMins")
    used = quota.get("usedPercent")
    if used is None and isinstance(quota.get("remainingPercent"), (int, float)):
        used = 100 - quota["remainingPercent"]
    if observed is None or now - observed > max_age_s or used is None or resets is None or not window or resets <= now:
        return None
    elapsed = min(100.0, max(0.0, (now - (resets - window * 60)) / (window * 60) * 100))
    return used - elapsed


def live_deltas(registry: dict, state_dir: Path | None, provider_id: str, now: float) -> dict:
    """{account_id: used-minus-elapsed points} from the LIVE overlay only, for active accounts whose
    reading is newer than thresholds.routingMaxAgeMinutes. The reviewed registry snapshot is history,
    never a routing measurement."""
    max_age = float((registry.get("thresholds") or {}).get("routingMaxAgeMinutes", 120)) * 60
    live = read_live(state_dir).get("accounts") or {}
    provider = next((p for p in registry.get("providers", []) if p.get("id") == provider_id), {})
    out = {}
    for account in provider.get("accounts", []):
        quota = (live.get(f"{provider_id}/{account['id']}") or {}).get("quota")
        if account.get("status", "active") == "active" and quota:
            delta = _quota_delta(quota, now, max_age)
            if delta is not None:
                out[account["id"]] = delta
    return out


def pace_adjust(registry: dict, state_dir: Path | None, lane: str, now: float) -> dict:
    """Routing pressure adjustment for a lane from its provider's pace policy.

    free-when-behind (use-or-lose quota): mean account delta below -PACE_BAND -> effective cost x0.1
    until the lane is back within the band. back-off-when-ahead (shared pool): mean delta above 0
    adds delta/100 (capped), so a pool burning faster than its window costs more. Lanes, slots and
    cooldowns stay authoritative; this only orders candidates."""
    provider = provider_for_lane(registry, lane)
    mode = ((registry.get("policies") or {}).get((provider.get("policy") or {}).get("id")) or {}).get("paceRouting")
    if not provider or not mode:
        return {"adjust": 0.0, "why": "no-pace-policy", "deltas": {}}
    deltas = live_deltas(registry, state_dir, provider["id"], now)
    if not deltas:
        return {"adjust": 0.0, "why": "no-fresh-live-reading", "deltas": {}}
    mean = sum(deltas.values()) / len(deltas)
    if mode == "free-when-behind" and mean < -PACE_BAND:
        return {"adjust": PACE_FREE_FLOOR, "why": f"behind-pace:{mean:.0f}pts", "deltas": deltas}
    if mode == "back-off-when-ahead" and mean > 0:
        return {"adjust": round(min(PACE_AHEAD_CAP, mean / 100), 3), "why": f"ahead-of-pace:{mean:.0f}pts", "deltas": deltas}
    return {"adjust": 0.0, "why": f"on-pace:{mean:.0f}pts", "deltas": deltas}


def live_seats(registry: dict, state_dir: Path | None, provider_id: str | None, now: float) -> dict:
    """{account_id: {usedPercent, elapsedPercent}} from routing-fresh LIVE readings (see live_deltas)."""
    max_age = float((registry.get("thresholds") or {}).get("routingMaxAgeMinutes", 120)) * 60
    live = read_live(state_dir).get("accounts") or {}
    provider = next((p for p in registry.get("providers", []) if p.get("id") == provider_id), {})
    out = {}
    for account in provider.get("accounts", []):
        quota = (live.get(f"{provider_id}/{account['id']}") or {}).get("quota")
        if not quota or account.get("status", "active") != "active":
            continue
        observed, resets, window = _epoch(quota.get("observedAt")), _epoch(quota.get("resetsAt")), quota.get("windowMins")
        used = quota.get("usedPercent")
        if used is None and isinstance(quota.get("remainingPercent"), (int, float)):
            used = 100 - quota["remainingPercent"]
        if observed is None or now - observed > max_age or used is None or resets is None or not window or resets <= now:
            continue
        out[account["id"]] = {"usedPercent": used,
                              "elapsedPercent": min(100.0, max(0.0, (now - (resets - window * 60)) / (window * 60) * 100))}
    return out


def resolve_role(registry: dict, role_id: str, watch_models: dict | None = None) -> dict | None:
    """The model to use now for a role. A preferred candidate that is only being watched never wins until
    a watch row confirms it (available: true); then the first available candidate; else None."""
    role = (registry.get("roles") or {}).get(role_id)
    if not role:
        return None
    watch_models = watch_models or {}
    ranked = []
    for c in role.get("candidates", []):
        seen = watch_models.get(c["model"]) or {}
        state = "available" if seen.get("available") is True else (c.get("availability") or {}).get("status", "unknown")
        ranked.append({**c, "state": state, "evidence": seen or None})
    chosen = next((c for c in ranked if c.get("preferred") and c["state"] == "available"), None) \
        or next((c for c in ranked if c["state"] == "available"), None)
    return {"role": role_id, "description": role.get("description"),
            "chosen": {k: chosen[k] for k in ("model", "label", "pathId")} if chosen else None,
            "candidates": [{"model": c["model"], "label": c.get("label"), "pathId": c.get("pathId"),
                            "preferred": bool(c.get("preferred")), "state": c["state"], "evidence": c["evidence"]} for c in ranked]}
