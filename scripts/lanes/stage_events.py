"""`jovie-stage-event/v1` rows for the lanes stages of docs/metrics/STAGE_EVENTS.md.

Derived from runs/ledger.jsonl on every publish, so the 28-day rolling file needs no state
of its own and the first publish is the backfill. Published as `stage-events.ndjson` in the
lanes status gist (doctor.publish_status), which the stage collector reads.

- shipping / worker-start: a Jovie issue run, entityId `JovieInc/Jovie#<pr>` once the run
  has a PR, else the issue id; enteredAt/exitedAt = the receipt's startedAt/endedAt.
- remediation / repair-start: a fix-red run, entityId
  `JovieInc/Jovie#<pr>@<first 12 chars of the red head sha>`.
- incident / undetected, unfiled, open, cleared: one doctor condition generation, from
  runs/incidents.jsonl (journal_incidents, written by the doctor on every transition).
- board-task / posted, running, closed: one mesh board task the lanes claimed, from
  runs/board-intake.jsonl (scripts/lanes/board_intake.py).
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
    result = [found] if found else []
    learning = row.get("repairLearning")
    if found and row.get("kind") == "fix-red" and isinstance(learning, dict):
        retrieval = learning.get("retrieval")
        retrieval = retrieval if isinstance(retrieval, dict) else {}
        for name, span, advanced in (
                ("learning-retrieval", retrieval, retrieval.get("gbrain") == "retrieved"),
                ("learning-record", learning, learning.get("status") == "source-and-brain-bound-ci-pending")):
            if not isinstance(span, dict):
                continue
            entered, exited = _epoch(span.get("enteredAt")), _epoch(span.get("exitedAt"))
            if entered is not None and exited is not None and exited >= entered:
                result.append({**found, "stage": name, "enteredAt": _iso(entered), "exitedAt": _iso(exited),
                               "outcome": "advanced" if advanced else "failed"})
    return result


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
    state_dir = Path(ledger).parent.parent
    for row in [*mirror_events(state_dir, now), *incident_events(state_dir, now), *board_events(state_dir, now)]:
        key = (row["sourceReceipt"], row["stage"])
        if key not in seen:
            seen.add(key)
            rows.append(row)
    # Open stages (exitedAt null) sort by entry; every publish re-derives them.
    rows.sort(key=lambda row: (row["exitedAt"] or row["enteredAt"], row["sourceReceipt"], row["stage"]))
    lines = [json.dumps(row, separators=(",", ":"), sort_keys=True) for row in rows]
    kept, size = [], 0
    for line in reversed(lines):
        size += len(line.encode("utf-8")) + 1
        if size > MAX_BYTES:
            break
        kept.append(line)
    return "".join(line + "\n" for line in reversed(kept))


# ------------------------------------------------------------------ incidents (doctor conditions)

INCIDENT_JOURNAL = "runs/incidents.jsonl"


def _active(conditions: dict) -> dict:
    return {key: row for key, row in (conditions or {}).items()
            if isinstance(row, dict) and row.get("state") == "active"}


def journal_incidents(state: Path, previous: dict, result: dict, host: str, now: float) -> list[dict]:
    """Append one `jovie.incident/v1` row per doctor-condition transition (detected, filed, cleared).

    `previous` and `result` are consecutive doctor.json reports. detected carries the last proof of
    life (lastGoodEpoch on the condition), filed the tick its Linear issue was filed or reopened, cleared
    the resolve time.
    Returns the rows written (the journal is append-only; a lost write only drops a sample)."""
    before, after = (previous or {}).get("conditions") or {}, (result or {}).get("conditions") or {}
    issues_before, issues_after = (previous or {}).get("issues") or {}, (result or {}).get("issues") or {}
    rows = []
    for key, row in _active(after).items():
        old = before.get(key) or {}
        generation = row.get("generation")
        base = {"schema": "jovie.incident/v1", "host": host, "key": key, "generation": generation}
        if not (old.get("state") == "active" and old.get("generation") == generation):
            rows.append({**base, "event": "detected", "detectedEpoch": row.get("firstObservedEpoch"),
                         "lastGoodEpoch": row.get("lastGoodEpoch")})
        issue, prior = issues_after.get(key) or {}, issues_before.get(key) or {}
        is_open = bool(issue.get("id")) and issue.get("closedAt") is None
        was_open = bool(prior.get("id")) and prior.get("closedAt") is None and not prior.get("pendingAction")
        if is_open and not issue.get("pendingAction") and not was_open:
            rows.append({**base, "event": "filed", "filedEpoch": now})
    for key, row in after.items():
        if isinstance(row, dict) and row.get("state") == "resolved" and (before.get(key) or {}).get("state") == "active":
            rows.append({"schema": "jovie.incident/v1", "host": host, "key": key, "generation": row.get("generation"),
                         "event": "cleared", "clearedEpoch": now})
    if rows:
        path = Path(state) / INCIDENT_JOURNAL
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            with open(path, "a", encoding="utf-8") as out:
                for row in rows:
                    out.write(json.dumps(row, sort_keys=True) + "\n")
        except OSError:
            return []
    return rows


def _journal_rows(path: Path):
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return
    for line in lines:
        try:
            item = json.loads(line)
        except ValueError:
            continue
        if isinstance(item, dict):
            yield item


def _num(value) -> float | None:
    return float(value) if type(value) in (int, float) else None


def incident_events(state: Path, now: float) -> list[dict]:
    """incident undetected -> unfiled -> open -> cleared rows, one entity per condition generation.

    undetected = last proof of life -> condition raised (time to detect); unfiled = raised -> Linear
    issue (time to file); open = issue (or raise, when never filed) -> cleared (time to fix and verify;
    the claim / PR / merge split of the same issue is the detector-issue entity from summer-config)."""
    merged: dict[tuple, dict] = {}
    for item in _journal_rows(Path(state) / INCIDENT_JOURNAL):
        if not isinstance(item.get("key"), str) or not isinstance(item.get("host"), str):
            continue
        ident = (item["host"], item["key"], item.get("generation"))
        entry = merged.setdefault(ident, {})
        for field in ("detectedEpoch", "lastGoodEpoch", "filedEpoch", "clearedEpoch"):
            value = _num(item.get(field))
            if value is not None and field not in entry:
                entry[field] = value
    rows = []
    for (host, key, generation), entry in merged.items():
        detected = entry.get("detectedEpoch")
        if detected is None:
            continue
        cleared, filed, good = entry.get("clearedEpoch"), entry.get("filedEpoch"), entry.get("lastGoodEpoch")
        if filed is not None and (filed < detected or (cleared is not None and filed > cleared)):
            filed = None  # an issue reused from an earlier generation is not this incident's filing
        last = cleared if cleared is not None else detected
        if now - last > WINDOW_S:
            continue
        base = {"schema": SCHEMA, "entityType": "incident", "entityId": f"{host}:{key}#{generation}",
                "actor": "doctor", "sourceReceipt": f"doctor:{host}:{key}:{generation}"}
        if good is not None and good <= detected:
            rows.append({**base, "stage": "undetected", "enteredAt": _iso(good), "exitedAt": _iso(detected),
                         "outcome": "advanced"})
        if filed is not None:
            rows.append({**base, "stage": "unfiled", "enteredAt": _iso(detected), "exitedAt": _iso(filed),
                         "outcome": "advanced"})
        opened = filed if filed is not None else detected
        rows.append({**base, "stage": "open", "enteredAt": _iso(opened),
                     "exitedAt": _iso(cleared) if cleared is not None else None,
                     "outcome": "completed" if cleared is not None else "open"})
        if cleared is not None:
            rows.append({**base, "stage": "cleared", "enteredAt": _iso(cleared), "exitedAt": _iso(cleared),
                         "outcome": "completed"})
    return rows


# ------------------------------------------------------------------ mesh board intake (board_intake.py)

BOARD_JOURNAL = "runs/board-intake.jsonl"


def board_events(state: Path, now: float) -> list[dict]:
    """board-task posted -> running -> closed rows from the lanes board-intake journal.

    posted = posted on the hub -> claimed by lanes (claim latency); running = claimed -> done/failed
    (run time; outcome completed or failed, so the terminal row's failRate is 1 - success rate)."""
    tasks: dict[str, dict] = {}
    for item in _journal_rows(Path(state) / BOARD_JOURNAL):
        tid = item.get("id")
        if not isinstance(tid, str) or item.get("event") not in ("claimed", "done", "failed"):
            continue
        entry = tasks.setdefault(tid, {"kind": item.get("kind")})
        for field in ("postedEpoch", "claimedEpoch"):
            value = _num(item.get(field))
            if value is not None:
                entry.setdefault(field, value)
        if item["event"] != "claimed" and _num(item.get("closedEpoch")) is not None:
            entry.update(closedEpoch=float(item["closedEpoch"]), status=item["event"])
    rows = []
    for tid, entry in tasks.items():
        posted, claimed, closed = entry.get("postedEpoch"), entry.get("claimedEpoch"), entry.get("closedEpoch")
        if claimed is None or now - (closed if closed is not None else claimed) > WINDOW_S:
            continue
        base = {"schema": SCHEMA, "entityType": "board-task", "entityId": tid,
                "actor": f"lanes:{entry.get('kind') or 'task'}", "sourceReceipt": f"board-intake:{tid}"}
        if posted is not None and posted <= claimed:
            rows.append({**base, "stage": "posted", "enteredAt": _iso(posted), "exitedAt": _iso(claimed),
                         "outcome": "advanced"})
        ok = entry.get("status") == "done"
        rows.append({**base, "stage": "running", "enteredAt": _iso(claimed),
                     "exitedAt": _iso(closed) if closed is not None else None,
                     "outcome": "open" if closed is None else "completed" if ok else "failed"})
        if closed is not None:
            rows.append({**base, "stage": "closed", "enteredAt": _iso(closed), "exitedAt": _iso(closed),
                         "outcome": "completed" if ok else "failed"})
    return rows
