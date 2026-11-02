"""Access-path pricing for lanes and the coordination layer (port of scripts/lib/capacity-pricing.mjs).

The same model costs differently on an API, on given credits and on a subscription seat. Both ports must
agree on scripts/tests/fixtures/capacity-pricing-vectors.json. List prices are USD per million tokens from
scripts/backlog-orchestrator/config/model-registry.json; seat state comes from the LIVE capacity overlay only.
"""
from __future__ import annotations

import json
from pathlib import Path

import capacity_registry

MTOK = 1_000_000
MODEL_REGISTRY = capacity_registry.DEFAULT_PATH.parents[2] / "scripts/backlog-orchestrator/config/model-registry.json"
WINDOW_DAYS = 30.4375


def _num(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def list_prices(model_registry: dict) -> dict:
    out = {}
    for model in model_registry.get("models", []):
        if _num(model.get("list_price_in")) and _num(model.get("list_price_out")):
            out[model["id"]] = {"in": model["list_price_in"], "out": model["list_price_out"],
                                "cached": model.get("list_price_cached") if _num(model.get("list_price_cached")) else None}
    return out


def load_model_registry(path: Path | None = None) -> dict:
    try:
        return json.loads((path or MODEL_REGISTRY).read_text())
    except (OSError, ValueError):
        return {}


def api_list_usd(price: dict, task: dict) -> float:
    cached = price["cached"] if price.get("cached") is not None else price["in"]
    return ((task.get("inputTokens", 0) * price["in"] + task.get("outputTokens", 0) * price["out"]
             + task.get("cachedTokens", 0) * cached) / MTOK)


def subscription_marginal(api_usd: float, seat: dict, floor_fraction: float = 0.1, band: float = 10.0) -> dict:
    """Marginal USD for one task on a seat: floor x share behind pace, the share on pace, rising linearly to
    the API price as the account runs ahead of pace; exhausted or lapsed seats cost the API price and are not
    routable. USD is None when the usable quota is unmeasured (ranking then uses the pace class alone)."""
    used, elapsed = seat.get("usedPercent"), seat.get("elapsedPercent")
    if seat.get("status") and seat["status"] != "active":
        return {"usd": api_usd, "class": "unavailable", "routable": False, "reason": seat["status"]}
    if not _num(used) or not _num(elapsed):
        return {"usd": None, "class": "unknown", "routable": True, "reason": "no-live-reading"}
    if used >= 100:
        return {"usd": api_usd, "class": "exhausted", "routable": False, "reason": "exhausted"}
    delta = used - elapsed
    cls = "behind-pace" if delta < -band else "on-pace" if delta <= 0 else "ahead-of-pace"
    quota, window = seat.get("usableQuotaApiUsd"), seat.get("planWindowUsd")
    if not (_num(quota) and quota > 0 and _num(window)):
        return {"usd": None, "class": cls, "routable": True, "reason": "usable-quota-unmeasured"}
    base = window * (api_usd / quota)
    if cls == "behind-pace":
        usd = base * floor_fraction
    elif cls == "on-pace":
        usd = base
    else:
        t = min(1.0, max(0.0, delta / max(1.0, 100 - elapsed)))
        usd = base + (api_usd - base) * t
    return {"usd": usd, "class": cls, "routable": True, "reason": "priced", "baseUsd": base}


def price_task(row: dict, prices: dict, task: dict, seat: dict | None = None, **options) -> dict:
    price = prices.get(row.get("modelRegistryId"))
    if not price:
        return {"id": row["id"], "accessPath": row["accessPath"], "usd": None, "class": "unpriced", "routable": False,
                "reason": "no-list-price"}
    api = api_list_usd(price, task)
    if row["accessPath"] != "subscription":
        return {"id": row["id"], "accessPath": row["accessPath"], "usd": api, "apiUsd": api, "class": row["accessPath"],
                "routable": True, "reason": "list", "funding": row.get("funding")}
    return {"id": row["id"], "accessPath": "subscription", "apiUsd": api, **subscription_marginal(api, seat or {}, **options)}


def rank_paths(priced: list[dict]) -> list[dict]:
    def score(row):
        if not row["routable"]:
            return float("inf")
        if row["usd"] is not None:
            return row["usd"]
        return {"behind-pace": 0.0, "on-pace": 1e-6}.get(row["class"], 1e300)
    return sorted(priced, key=score)


def price_model(registry: dict, model_registry: dict, state_dir: Path | None, model: str, task: dict, now: float) -> list[dict]:
    """Every access path for `model` priced for `task`, cheapest routable first. Subscription seats use the
    live overlay's pace; no fresh live reading means class 'unknown' (routable, USD unknown)."""
    pricing = registry.get("pricing") or {}
    prices = list_prices(model_registry)
    out = []
    for row in pricing.get("paths", []):
        if row.get("model") != model:
            continue
        if row["accessPath"] != "subscription":
            out.append({**price_task(row, prices, task), "account": (row.get("accounts") or [None])[0]})
            continue
        provider = next((p for p in registry.get("providers", []) if p["id"] == row.get("provider")), {})
        deltas = capacity_registry.live_seats(registry, state_dir, provider.get("id"), now)
        for account_id in row.get("accounts", []):
            account = next((a for a in provider.get("accounts", []) if a["id"] == account_id), {})
            plan = {**(provider.get("plan") or {}), **(account.get("plan") or {})}
            monthly = plan.get("billedUsdMonthly") if _num(plan.get("billedUsdMonthly")) else plan.get("listUsdMonthly")
            seat = {**deltas.get(account_id, {}), "usableQuotaApiUsd": row.get("usableQuotaApiUsd"),
                    "planWindowUsd": (monthly or 0) * 7 / WINDOW_DAYS, "status": account.get("status", "active")}
            out.append({**price_task(row, prices, task, seat, floor_fraction=pricing.get("subscriptionFloorFraction", 0.1),
                                     band=pricing.get("paceBandPercent", 10)), "account": account_id})
    return rank_paths(out)
