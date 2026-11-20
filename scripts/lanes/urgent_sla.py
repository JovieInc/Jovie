"""Urgent claim SLA and production-breakage ranking (JOV-11615).

With ~160 Urgent rows in Todo, FIFO among Urgent left a fresh prod outage unclaimed ~6h. Production
breakage now ranks first among Urgent, and any Urgent Todo row unclaimed past the SLA records a stage
timestamp (`urgent-sla.jsonl`, once per issue), a snapshot (`urgent-sla.json`) and a doctor alert.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import backlog_rank
import binding_refill

URGENT_SLA_S = 30 * 60
PROD_BREAKAGE = re.compile(r"\bprod(?:uction)?\s+synthetic\b|^\s*\[ci\]|\bmain-failure\b"
                           r"|\bgolden[- ]path\b.*\b(?:broken|red|failing|never)\b|\bproduction\s+(?:release|controller)\b", re.I)


def production_breakage(title, priority) -> bool:
    """Explicit Urgent (P1) work reporting production breakage; never inferred for other tiers."""
    return priority == 1 and bool(PROD_BREAKAGE.search(str(title or "")))


def rank(title, priority) -> int:
    """First claim-order element: 0 production-breakage Urgent, 1 other Urgent, 2 the rest."""
    return 0 if production_breakage(title, priority) else 1 if priority == 1 else 2


def breaches(todo: list[dict], now: float, sla_s: int = URGENT_SLA_S) -> list[dict]:
    """Unclaimed Urgent Todo rows older than the SLA, longest-waiting first."""
    out = []
    for row in todo:
        created = backlog_rank._epoch(row.get("createdAt"))
        if row.get("priority") == 1 and created is not None and now - created > sla_s:
            out.append({"id": row["identifier"], "issueId": row["id"], "createdAt": row.get("createdAt"),
                        "waitingS": round(now - created), "productionBreakage": production_breakage(row.get("title"), 1)})
    return sorted(out, key=lambda item: -item["waitingS"])


def record(state, team: str, todo: list[dict], now: float) -> dict:
    """Log each new breach once with its stage timestamp and write the snapshot the doctor reads."""
    state, found = Path(state), breaches(todo, now)
    try:
        seen = {json.loads(line)["id"] for line in (state / "urgent-sla.jsonl").read_text().splitlines() if line}
    except (OSError, ValueError, KeyError):
        seen = set()
    try:
        with open(state / "urgent-sla.jsonl", "a") as handle:
            for item in found:
                if item["id"] not in seen:
                    handle.write(json.dumps({**item, "breachedAt": now, "team": team}) + "\n")
    except OSError:
        pass
    summary = {"slaS": URGENT_SLA_S, "breaches": len(found), "worst": found[:10]}
    binding_refill._write(state / "urgent-sla.json", {"at": now, "team": team, **summary})
    return summary


def view(state) -> dict:
    try:
        data = json.loads((Path(state) / "urgent-sla.json").read_text())
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def alerts(observation: dict) -> dict[str, str]:
    sla = (observation or {}).get("urgentSla") or {}
    if not sla.get("breaches"):
        return {}
    worst = (sla.get("worst") or [{}])[0]
    return {"urgent-sla-breach": f"{sla['breaches']} Urgent Todo issue(s) unclaimed past {int((sla.get('slaS') or 0) // 60)}m; "
                                 f"worst {worst.get('id')} waiting {int((worst.get('waitingS') or 0) // 60)}m"}
