"""`jovie-stage-event/v1` rows for the lanes stages of docs/metrics/STAGE_EVENTS.md.

Derived from runs/ledger.jsonl on every publish, so the 28-day rolling file needs no state
of its own and the first publish is the backfill. Published as `stage-events.ndjson` in the
lanes status gist (doctor.publish_status), which the stage collector reads.

- shipping / worker-start: a Jovie issue run, entityId `JovieInc/Jovie#<pr>` once the run
  has a PR, else the issue id; enteredAt/exitedAt = the receipt's startedAt/endedAt.
- remediation / repair-start: a fix-red run, entityId
  `JovieInc/Jovie#<pr>@<first 12 chars of the red head sha>`.
- shipping / gate-seat and gate: a lane adopt (gate) run on `JovieInc/Jovie#<pr>`.
  gate-seat = startedAt → startedAt + gateWaitS (waiting for a host gate seat; a run
  deferred before any seat, e.g. gate-admission-busy, exits at endedAt as abandoned).
  gate = seat acquired → endedAt; advanced for landing / verified-not-queued, failed for a
  held or timed-out gate, abandoned otherwise.
actor = provider; outcome = failed for failed / provider-error / fix-no-change, advanced
when the run opened a PR or pushed, abandoned otherwise; sourceReceipt =
`lanes-ledger:<runId>`.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import ledger_archive

SCHEMA = "jovie-stage-event/v1"
WINDOW_S = 28 * 86400
MAX_BYTES = 8 * 1024 * 1024
REPO = "JovieInc/Jovie"
FAILED = frozenset({"failed", "provider-error", "fix-no-change"})
ADVANCED = frozenset({"pr-opened", "landing", "verified-not-queued", "held", "gate-timeout", "gate-in-progress",
                      "gate-deferred", "gate-already-completed", "pushed", "fix-pushed", "decomposed"})


def _epoch(value) -> float | None:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.timestamp() if parsed.tzinfo else None


def _iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _outcome(row: dict) -> str:
    verdict = row.get("verdict")
    if verdict in FAILED:
        return "failed"
    if verdict in ADVANCED or row.get("pr") or row.get("headSha"):
        return "advanced"
    return "abandoned"


GATE_PASSED = frozenset({"landing", "verified-not-queued"})
GATE_FAILED = frozenset({"held", "gate-timeout"})


def gate_events(row: dict, started: float, ended: float) -> list[dict]:
    """The gate-seat and gate rows one adopt receipt yields (JOV measure-everything)."""
    pr = row.get("pr")
    if not isinstance(pr, int) or pr <= 0:
        return []
    base = {"schema": SCHEMA, "entityType": "shipping", "entityId": f"{REPO}#{pr}", "actor": row["provider"],
            "sourceReceipt": f"lanes-ledger:{row['runId']}"}
    wait = row.get("gateWaitS")
    if type(wait) not in (int, float) or wait < 0 or started + wait > ended:
        return [{**base, "stage": "gate-seat", "enteredAt": _iso(started), "exitedAt": _iso(ended),
                 "outcome": "abandoned"}]
    seated = started + wait
    verdict = row.get("verdict")
    outcome = "advanced" if verdict in GATE_PASSED else "failed" if verdict in GATE_FAILED else "abandoned"
    return [{**base, "stage": "gate-seat", "enteredAt": _iso(started), "exitedAt": _iso(seated),
             "outcome": "advanced"},
            {**base, "stage": "gate", "enteredAt": _iso(seated), "exitedAt": _iso(ended), "outcome": outcome}]


def events(row: dict) -> list[dict]:
    """Every contract row one ledger receipt yields."""
    if not isinstance(row, dict) or row.get("binding") or not row.get("runId") or not row.get("provider"):
        return []
    if row.get("kind") == "outcome-verify":
        started, ended = _epoch(row.get("startedAt")), _epoch(row.get("endedAt"))
        issue = str(row.get("issue") or "")
        if started is None or ended is None or ended < started or not issue.startswith("JOV-"):
            return []
        outcome = ("advanced" if row.get("verdict") == "recorded" and row.get("decision") == "pass"
                   else "failed" if row.get("verdict") == "recorded" else "abandoned")
        return [{"schema": SCHEMA, "entityType": "shipping", "entityId": issue, "stage": "outcome-receipt",
                 "enteredAt": _iso(started), "exitedAt": _iso(ended), "actor": row["provider"],
                 "outcome": outcome, "sourceReceipt": f"lanes-ledger:{row['runId']}"}]
    if row.get("kind") == "taste-decision":
        started, ended = _epoch(row.get("startedAt")), _epoch(row.get("endedAt"))
        issue = str(row.get("issue") or "")
        if started is None or ended is None or ended < started or not issue.startswith("JOV-"):
            return []
        base = {"schema": SCHEMA, "entityType": "taste-decision", "entityId": issue, "actor": row["provider"],
                "sourceReceipt": f"lanes-ledger:{row['runId']}"}
        return [{**base, "stage": "waiting", "enteredAt": _iso(started), "exitedAt": _iso(ended), "outcome": "advanced"},
                {**base, "stage": "decided", "enteredAt": _iso(ended), "exitedAt": _iso(ended), "outcome": "completed"}]
    if row.get("kind") == "adopt":
        started, ended = _epoch(row.get("startedAt")), _epoch(row.get("endedAt"))
        if started is None or ended is None or ended < started:
            return []
        return gate_events(row, started, ended)
    found = event(row)
    return [found] if found else []


def event(row: dict) -> dict | None:
    """The contract row one ledger receipt yields, or None."""
    if not isinstance(row, dict) or row.get("binding") or not row.get("runId") or not row.get("provider"):
        return None
    started, ended = _epoch(row.get("startedAt")), _epoch(row.get("endedAt"))
    if started is None or ended is None or ended < started:
        return None
    kind = row.get("kind")
    if kind is None and str(row.get("issue") or "").startswith("JOV-"):
        pr = row.get("pr")
        entity, stage, entity_id = "shipping", "worker-start", (
            f"{REPO}#{pr}" if isinstance(pr, int) and pr > 0 else row["issue"])
    elif kind == "fix-red" and isinstance(row.get("pr"), int) and isinstance(row.get("headBefore"), str) \
            and len(row["headBefore"]) >= 12:
        entity, stage, entity_id = "remediation", "repair-start", f"{REPO}#{row['pr']}@{row['headBefore'][:12]}"
    else:
        return None
    return {"schema": SCHEMA, "entityType": entity, "entityId": entity_id, "stage": stage,
            "enteredAt": _iso(started), "exitedAt": _iso(ended), "actor": row["provider"],
            "outcome": _outcome(row), "sourceReceipt": f"lanes-ledger:{row['runId']}"}


def mirror_events(state: Path, now: float) -> list[dict]:
    """linear-mirror stale -> mirrored rows: oldest change in a pass -> the mirror holding it (target under 5 min)."""
    rows = []
    try:
        lines = (Path(state) / "mirror-sync.jsonl").read_text().splitlines()
    except OSError:
        return rows
    for line in lines:
        try:
            item = json.loads(line)
        except ValueError:
            continue
        entered, exited = _epoch(item.get("enteredAt")), _epoch(item.get("exitedAt"))
        if not isinstance(item.get("team"), str) or entered is None or exited is None or exited < entered \
                or now - exited > WINDOW_S:
            continue
        base = {"schema": SCHEMA, "entityType": "linear-mirror", "entityId": item["team"], "actor": "lanes",
                "sourceReceipt": f"linear-mirror:{item['team']}@{_iso(exited)}"}
        rows.append({**base, "stage": "stale", "enteredAt": _iso(entered), "exitedAt": _iso(exited), "outcome": "advanced"})
        rows.append({**base, "stage": "mirrored", "enteredAt": _iso(exited), "exitedAt": _iso(exited), "outcome": "completed"})
    return rows


def ndjson(ledger: Path, now: float) -> str:
    """Rolling 28-day NDJSON (by exitedAt), newest kept when the 8 MB cap is reached."""
    rows, seen = [], set()
    # Rotated rows (ledger_archive.py) still belong to the 28-day window.
    sources = [*ledger_archive.archive_files(Path(ledger).parent.parent, now - WINDOW_S), Path(ledger)]
    for source in sources:
        try:
            with open(source, encoding="utf-8", errors="replace") as handle:
                for line in handle:
                    try:
                        found = events(json.loads(line))
                    except ValueError:
                        continue
                    for row in found:
                        key = (row["sourceReceipt"], row["stage"])
                        if now - (_epoch(row["exitedAt"]) or 0) <= WINDOW_S and key not in seen:
                            seen.add(key)
                            rows.append(row)
        except OSError:
            continue
    for row in mirror_events(Path(ledger).parent.parent, now):
        key = (row["sourceReceipt"], row["stage"])
        if key not in seen:
            seen.add(key)
            rows.append(row)
    rows.sort(key=lambda row: (row["exitedAt"], row["sourceReceipt"], row["stage"]))
    lines = [json.dumps(row, separators=(",", ":"), sort_keys=True) for row in rows]
    kept, size = [], 0
    for line in reversed(lines):
        size += len(line.encode("utf-8")) + 1
        if size > MAX_BYTES:
            break
        kept.append(line)
    return "".join(line + "\n" for line in reversed(kept))
