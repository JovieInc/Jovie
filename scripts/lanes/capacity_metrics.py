"""Cost per merged PR by provider, from lane receipts and the merged-evidence ledger (read-only).

Receipt-first: the canonical runs ledger says which provider created or repaired a PR; the
complete merge window (merge_evidence, GitHub's merged: search) says it merged. Cost is amortized plan price for the window (subscription
accounts are shared with interactive use) or the recorded credit burn rate; both are labelled as
estimates. PRs outside the lane ledger (agent-started threads) are not counted here.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

WINDOW_DAYS = 7
TAIL_BYTES = 12 * 1024 * 1024
DAY_S = 86400


def _epoch(value) -> float | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc).timestamp()
    except ValueError:
        return None


def read_ledger_tail(path: Path, tail_bytes: int = TAIL_BYTES) -> list[dict]:
    try:
        with open(path, "rb") as handle:
            handle.seek(0, 2)
            handle.seek(max(0, handle.tell() - tail_bytes))
            lines = handle.read().decode(errors="replace").splitlines()[1:]
    except OSError:
        return []
    rows = []
    for line in lines:
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if isinstance(row, dict):
            rows.append(row)
    return rows


def window_cost_usd(provider: dict, days: float, spend_burn: float | None) -> tuple[float | None, str]:
    """(usd, basis) for the window: amortized active plan prices, else the recorded credit burn."""
    total, basis = 0.0, None
    for account in provider.get("accounts", []):
        if account.get("status", "active") != "active":
            continue
        plan = {**(provider.get("plan") or {}), **(account.get("plan") or {})}
        if isinstance(plan.get("usdYearly"), (int, float)):
            total += plan["usdYearly"] / 365 * days
            basis = "amortized-plan"
        elif isinstance(plan.get("billedUsdMonthly"), (int, float)):
            total += plan["billedUsdMonthly"] / 30.4375 * days
            basis = "amortized-plan"
    if provider.get("usageModel") == "credits" and isinstance(spend_burn, (int, float)):
        return spend_burn * days, "credit-burn-estimate"
    return (total if basis else None), (basis or "unknown")


def compute(registry: dict, rows: list[dict], merged: set[str], spend: dict, now: float, days: int = WINDOW_DAYS,
            repository: str = "JovieInc/Jovie") -> dict:
    """`merged` is {'JovieInc/Jovie#123'} for PRs merged in the window (complete GitHub evidence).
    Only rows for `repository` count: the merge window is that repository's, and plan cost is not split by repo."""
    since = now - days * DAY_S
    burn = {p.get("id"): ((p.get("burnPerDayUsd") or {}).get("value") if isinstance(p.get("burnPerDayUsd"), dict) else p.get("burnPerDayUsd"))
            for p in (spend or {}).get("providers", [])}
    metrics = {}
    for provider in registry.get("providers", []):
        lane = provider.get("lane")
        if not lane:
            continue
        created, repaired, runs = set(), set(), 0
        for row in rows:
            started = _epoch(row.get("startedAt"))
            if row.get("provider") != lane or row.get("repository") != repository or started is None or started < since or row.get("kind") == "terminal-revisit":
                continue
            runs += 1
            result = row.get("result") if isinstance(row.get("result"), dict) else {}
            pr = row.get("pr") or result.get("pr")
            if not pr:
                continue
            key = f"{repository}#{pr}"
            category = (row.get("attribution") or {}).get("category") if isinstance(row.get("attribution"), dict) else None
            if category == "autonomous-created":
                created.add(key)
            elif category == "autonomous-remediation":
                repaired.add(key)
        spend_burn = next((burn.get(i) for i in provider.get("spendIds", []) if burn.get(i)), None)
        cost, basis = window_cost_usd(provider, days, spend_burn)
        merged_created, merged_repaired = len(created & merged), len(repaired & merged)
        metrics[provider["id"]] = {
            "windowDays": days, "runs": runs, "prsCreated": len(created), "mergedCreated": merged_created,
            "mergedRepaired": merged_repaired, "costUsd": None if cost is None else round(cost, 2), "costBasis": basis,
            "costPerMergedUsd": round(cost / merged_created, 2) if cost is not None and merged_created else None}
    return metrics
