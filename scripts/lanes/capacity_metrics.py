"""Cost per merged PR by provider, from lane receipts and the merged-evidence ledger (read-only).

Receipt-first: the canonical runs ledger says which provider created or repaired a PR; the
complete merge window (merge_evidence, GitHub's merged: search) says it merged. Cost is amortized plan price for the window (subscription
accounts are shared with interactive use) or the recorded credit burn rate; both are labelled as
estimates. PRs outside the lane ledger (agent-started threads) are not counted here.
"""
from __future__ import annotations

import json
import re
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


# One convention for agent-originated PRs (Tim and the coordinator, 2026-10-25): the PR body carries
# `Agent-Path: <provider>/<account>` and, for Hyperagent threads, `Dispatch ID: thread <id>`.
AGENT_PATH = re.compile(r"^\s*Agent-Path:\s*([a-z0-9][a-z0-9._-]*)\s*/\s*(\S+?)\s*$", re.M)
THREAD_ID = re.compile(r"Dispatch ID:?\s*thread\s+([A-Za-z0-9][A-Za-z0-9_-]{5,63})\b", re.I)


def agent_provider(row: dict) -> tuple[str | None, str | None]:
    """(provider, evidence) for a merged PR with no lane receipt.

    `proven`: an Agent-Path trailer or a Hyperagent thread id in the body. `inferred`: the `glm/` branch prefix,
    which every Hyperagent GLM sandbox push used in the 10-18..10-25 sample (10 of 70 carried thread ids)."""
    body = str(row.get("body") or "")
    match = AGENT_PATH.search(body)
    if match:
        return match.group(1), "proven"
    if THREAD_ID.search(body):
        return "hyperagent", "proven"
    if str(row.get("headRefName", "")).startswith("glm/"):
        return "hyperagent", "inferred"
    return None, None


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
            repository: str = "JovieInc/Jovie", merged_rows: list[dict] | None = None) -> dict:
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
        # Merged PRs on this lane's own branch prefix (`<lane>/...`) that no receipt names. Counted apart
        # from receipted merges so the receipt join stays exact.
        unreceipted = {f"{repository}#{r['number']}" for r in (merged_rows or [])
                       if str(r.get("headRefName", "")).startswith(f"{lane}/")} - (created | repaired)
        # Agent-started PRs with no receipt, joined by trailer, thread id, or (inferred) branch prefix.
        by_evidence = {"proven": set(), "inferred": set()}
        for r in merged_rows or []:
            key = f"{repository}#{r['number']}"
            who, evidence = agent_provider(r)
            if who == lane and key not in (created | repaired) and not str(r.get("headRefName", "")).startswith(f"{lane}/"):
                by_evidence[evidence].add(key)
        metrics[provider["id"]] = {
            "windowDays": days, "runs": runs, "prsCreated": len(created), "mergedCreated": merged_created,
            "mergedRepaired": merged_repaired, "mergedUnreceipted": len(unreceipted), "mergedAgentProven": len(by_evidence["proven"]), "mergedAgentInferred": len(by_evidence["inferred"]), "costUsd": None if cost is None else round(cost, 2), "costBasis": basis,
            "costPerMergedUsd": round(cost / merged_created, 2) if cost is not None and merged_created else None}
        if basis == "credit-burn-estimate":
            # The burn covers every thread of the provider, so divide by every merge attributed to it: lane
            # receipts plus thread-attributed PRs (proven and inferred). An estimate, labelled as such.
            total = merged_created + len(by_evidence["proven"]) + len(by_evidence["inferred"])
            m = metrics[provider["id"]]
            m["costPerMergedUsd"] = round(cost / total, 2) if cost is not None and total else None
            m["costScope"] = "all-usage-over-receipted-plus-thread-attributed-merges"
    return metrics


def unattributed(rows: list[dict], merged_rows: list[dict], lanes: set[str], repository: str = "JovieInc/Jovie") -> dict:
    """Merged PRs with no lane receipt and no `<lane>/` branch prefix, grouped by branch prefix and author.

    A prefix such as `glm/` names a model, not an access path, and the author is the human account, so these
    cannot be priced per provider. They are reported, never assigned."""
    receipted = {f"{repository}#{r.get('pr') or (r.get('result') or {}).get('pr')}" for r in rows
                 if r.get("repository") == repository}
    by_prefix: dict[str, int] = {}
    total = 0
    for row in merged_rows:
        branch = str(row.get("headRefName", ""))
        prefix = branch.split("/", 1)[0] + "/" if "/" in branch else "(none)"
        if f"{repository}#{row.get('number')}" in receipted or prefix[:-1] in lanes or agent_provider(row)[0] in lanes:
            continue
        total += 1
        label = f"{prefix} ({(row.get('author') or {}).get('login', 'unknown')})"
        by_prefix[label] = by_prefix.get(label, 0) + 1
    return {"total": total, "byBranchPrefix": dict(sorted(by_prefix.items(), key=lambda kv: -kv[1])[:12])}
