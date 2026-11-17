"""Ledger measurement for fix-red runs.

Split from fix_red_classes.py so that module stays within its size budget.
Callers still reach these functions through fix_red_classes.
"""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path


def _epoch(row: dict) -> float | None:
    for key in ("startedAt", "endedAt"):
        try:
            return datetime.fromisoformat(str(row.get(key)).replace("Z", "+00:00")).timestamp()
        except ValueError:
            continue
    return None


def historic_key(row: dict) -> str:
    """Ledger rows keep the failing check names, not the log: coarser than the live fingerprint, stable."""
    from fix_red_classes import real_failures
    from fix_red_failure_routing import fingerprint_key

    source = row.get("requestSource") or {}
    names = [str(check.get("name")) for check in real_failures({"statusCheckRollup": [
        {"name": name, "conclusion": verdict} for name, verdict in source.get("checks") or []]})]
    kinds = ",".join(source.get("eventKinds") or [])
    return fingerprint_key("history", names or [f"event:{kinds}"])


def fix_rows(rows: list[dict]) -> list[dict]:
    return sorted((row for row in rows if row.get("kind") == "fix-red"), key=lambda row: _epoch(row) or 0.0)


def breaker_n(rows: list[dict]) -> int:
    """How many no-push LLM runs on one (PR, fingerprint) before the next run is not worth paying for:
    the smallest k where the push rate after k misses falls to half the first-run rate (cells of at least
    MIN_CELL_RUNS runs), else the default. Measured from the ledger so it follows the fleet."""
    from fix_red_classes import DEFAULT_BREAKER_N, LLM_VERDICTS, MAX_BREAKER_N, MIN_CELL_RUNS

    seen = defaultdict(int)
    cells = defaultdict(lambda: [0, 0])
    for row in fix_rows(rows):
        if row.get("verdict") not in LLM_VERDICTS or row.get("attemptRefunded"):
            continue
        group = (row.get("pr"), historic_key(row))
        misses = min(seen[group], MAX_BREAKER_N + 2)
        pushed = row.get("verdict") == "fix-pushed"
        cells[misses][0] += 1
        cells[misses][1] += pushed
        seen[group] = 0 if pushed else seen[group] + 1
    first = cells[0]
    if first[0] < MIN_CELL_RUNS or not first[1]:
        return DEFAULT_BREAKER_N
    base = first[1] / first[0]
    for k in range(2, MAX_BREAKER_N + 1):  # 1 would stop after a single miss: the key is coarse
        runs, pushes = cells[k]
        if runs >= MIN_CELL_RUNS and pushes / runs <= base / 2:
            return k
    return DEFAULT_BREAKER_N


def measure(rows: list[dict], now: float, days: int = 5, cost_per_run: dict | None = None,
            merged_prs: set | None = None) -> dict:
    """Fix-red runs/day, push rate and $ per fix push (and per merged fix when `merged_prs` is given) over
    the last `days`. `cost_per_run` maps lane name to USD per run (capacity-metrics.json costUsd / runs)."""
    from fix_red_classes import LLM_VERDICTS

    cost_per_run = cost_per_run or {}
    window = [row for row in fix_rows(rows) if (_epoch(row) or 0) >= now - days * 86400]
    llm = [row for row in window if row.get("verdict") in LLM_VERDICTS and not row.get("attemptRefunded")]
    routed = [row for row in window if str((row.get("reasons") or [""])[0]).startswith("infra-rerun:")]
    pushed = [row for row in llm if row.get("verdict") == "fix-pushed"]
    spend = sum(float(cost_per_run.get(row.get("provider")) or 0) for row in llm)
    merged = {row.get("pr") for row in pushed if merged_prs is not None and row.get("pr") in merged_prs}
    by_class = defaultdict(int)
    for row in routed:
        by_class[str(row["reasons"][0]).split(":", 1)[1].split("+")[0][:40]] += 1
    return {"windowDays": days, "fixRedRuns": len(window), "llmRuns": len(llm), "llmRunsPerDay": round(len(llm) / days, 1),
            "routedWithoutModel": len(routed), "routedByClass": dict(by_class), "pushed": len(pushed),
            "pushRate": round(len(pushed) / len(llm), 3) if llm else None, "spendUsd": round(spend, 2),
            "usdPerPush": round(spend / len(pushed), 2) if pushed and spend else None,
            "usdPerMergedFix": round(spend / len(merged), 2) if merged and spend else None,
            "mergedFixes": len(merged) if merged_prs is not None else None, "breakerN": breaker_n(rows)}


def read_ledger(state: Path) -> list[dict]:
    rows = []
    runs = Path(state) / "runs"
    for path in [*sorted((runs / "ledger-archive").glob("ledger-*.jsonl")), runs / "ledger.jsonl"]:
        try:
            lines = path.read_text(errors="replace").splitlines()
        except OSError:
            continue
        for line in lines:
            if line.startswith("{"):
                try:
                    rows.append(json.loads(line))
                except ValueError:
                    pass
    return rows


def costs_from_metrics(state: Path) -> dict:
    """Lane name -> USD per run, from the capacity metrics the doctor already writes."""
    try:
        data = json.loads((Path(state) / "capacity-metrics.json").read_text())
    except (OSError, ValueError):
        return {}
    lanes = {"openai-codex": "codex", "xai-grok": "grok", "hyperagent": "hyperagent", "anthropic-claude": "claude"}
    out = {}
    for name, row in (data.get("providers") or {}).items():
        if isinstance(row.get("costUsd"), (int, float)) and row.get("runs"):
            out[lanes.get(name, name)] = row["costUsd"] / row["runs"]
    return out
