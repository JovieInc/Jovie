#!/usr/bin/env python3
"""Durable, append-only execution-attempt contract shared by costly runtimes."""
from __future__ import annotations

import fcntl
import hashlib
import json
import os
import sys
import time
import uuid
from pathlib import Path

SCHEMA = "jovie-execution-attempt/v1"
TERMINAL = frozenset({"succeeded", "no_op_stale", "canceled", "failed_known", "failed_unknown",
                      "budget_exhausted", "quarantined", "superseded", "dead_lettered"})
RETRYABLE = frozenset({"provider_outage", "flaky_infra"})
def digest(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
def identity(domain: str, work: dict, generation) -> dict:
    """Redelivery/process/thread IDs belong in triggers, never in this identity."""
    work_key = f"{domain}:{digest(work)}"
    return {"workKey": work_key, "executionGeneration": digest(generation),
            "identityDigest": digest({"workKey": work_key, "generation": digest(generation)})}
def _rows(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text().splitlines():
        row = json.loads(line)
        if row.get("schema") != SCHEMA or not row.get("identityDigest"):
            raise RuntimeError("execution-ledger-malformed")
        rows.append(row)
    return rows
def _locked(path: Path, fn):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(f"{path}.lock", "a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        rows = _rows(path)
        result, additions = fn(rows)
        if additions:
            with open(path, "a") as ledger:
                for row in additions:
                    ledger.write(json.dumps(row, sort_keys=True) + "\n")
                ledger.flush()
                os.fsync(ledger.fileno())
        return result
def _for(rows: list[dict], ident: dict) -> list[dict]:
    return [row for row in rows if row["identityDigest"] == ident["identityDigest"]]
def _usage(rows: list[dict], now: float) -> dict:
    starts = [row for row in rows if row["event"] == "attempt_started"]
    boundaries = [row for row in rows if row["event"] == "boundary_admitted"]
    first = min((row["at"] for row in starts), default=now)
    return {"attempts": len(starts), "concurrency": len(starts) - len({row["fencingToken"] for row in rows if row["event"] == "attempt_finished"}), "wallSeconds": max(0, now - first),
            "spend": sum(row["reservation"]["spend"] for row in boundaries),
            "mutations": sum(row["reservation"]["mutations"] for row in boundaries)}
def _remaining(policy: dict, used: dict) -> dict:
    return {name: max(0, policy[name] - used[name]) for name in
            ("attempts", "concurrency", "wallSeconds", "spend", "mutations")}
def _diagnosis(rows: list[dict], terminal: str) -> dict:
    finished = [row for row in rows if row["event"] == "attempt_finished"]
    return {"schema": "jovie-execution-diagnosis/v1", "terminalState": terminal,
            "attempts": [{key: row.get(key) for key in ("attempt", "result", "failureClass",
                                                         "failureFingerprint", "evidenceDigest", "costs")}
                         for row in finished],
            "attemptDiffs": [a.get("failureFingerprint") != b.get("failureFingerprint")
                             for a, b in zip(finished, finished[1:])],
            "suspectedRootCauses": sorted({row.get("failureClass") for row in finished
                                            if row.get("failureClass")}),
            "dependencies": sorted({item for row in finished for item in row.get("dependencies", [])}),
            "nextAction": "collect new authoritative evidence or certify a bounded policy override"}
def claim(path: Path, ident: dict, owner: dict, policy: dict, trigger: dict, now: float | None = None) -> dict:
    now = time.time() if now is None else now
    required = ("attempts", "concurrency", "wallSeconds", "spend", "mutations", "leaseSeconds")
    if any(not isinstance(policy.get(key), (int, float)) or policy[key] < 0 for key in required):
        raise ValueError("execution-policy-malformed")

    def decide(all_rows):
        rows, additions = _for(all_rows, ident), []
        terminal = next((row for row in reversed(rows) if row.get("terminalState") in TERMINAL), None)
        if terminal:
            return {"admitted": False, "reason": "generation_terminal", "terminalState": terminal["terminalState"]}, []
        starts = [row for row in rows if row["event"] == "attempt_started"]
        finishes = {row["fencingToken"] for row in rows if row["event"] == "attempt_finished"}
        active = next((row for row in reversed(starts) if row["fencingToken"] not in finishes), None)
        if active:
            if active["leaseExpiresAt"] > now:
                return {"admitted": False, "reason": "duplicate_active", "fencingToken": active["fencingToken"]}, []
            terminal = "failed_unknown"
            expired = {**ident, "schema": SCHEMA, "event": "attempt_finished", "at": now,
                       "attempt": active["attempt"], "fencingToken": active["fencingToken"],
                       "result": terminal, "terminalState": terminal, "retryDecision": "reconcile",
                       "failureClass": "lost_worker", "failureFingerprint": "lease_expired_without_result",
                       "evidenceDigest": active.get("evidenceDigest"), "costs": {}, "dependencies": [],
                       "diagnosis": _diagnosis(rows, terminal)}
            return {"admitted": False, "reason": "expired_attempt_reconciled", "terminalState": terminal}, [expired]
        used = _usage(rows, now)
        exhausted = next((key for key in ("attempts", "wallSeconds", "spend", "mutations")
                          if used[key] >= policy[key]), None)
        if exhausted:
            row = {**ident, "schema": SCHEMA, "event": "decision", "at": now,
                   "terminalState": "budget_exhausted", "retryDecision": "stop",
                   "reason": f"{exhausted}_budget_exhausted", "diagnosis": _diagnosis(rows, "budget_exhausted")}
            return {"admitted": False, "reason": row["reason"], "terminalState": row["terminalState"]}, [row]
        attempt = used["attempts"] + 1
        fence = digest({"identity": ident["identityDigest"], "attempt": attempt,
                        "owner": owner, "nonce": uuid.uuid4().hex})
        row = {**ident, "schema": SCHEMA, "event": "attempt_started", "at": now, "attempt": attempt,
               "fencingToken": fence, "owner": owner, "leaseExpiresAt": now + policy["leaseSeconds"],
               "trigger": trigger, "policy": policy, "remainingBudgets": _remaining(policy, {**used, "attempts": attempt, "concurrency": 1})}
        return {"admitted": True, **row}, [row]
    return _locked(Path(path), decide)
def boundary(path: Path, ident: dict, fence: str, reservation: dict, now: float | None = None) -> dict:
    now = time.time() if now is None else now
    reservation = {"spend": reservation.get("spend", 0), "mutations": reservation.get("mutations", 0)}
    def decide(all_rows):
        rows = _for(all_rows, ident)
        start = next((row for row in reversed(rows) if row.get("fencingToken") == fence and
                      row["event"] == "attempt_started"), None)
        if not start or start["leaseExpiresAt"] <= now or any(row.get("terminalState") in TERMINAL for row in rows):
            raise RuntimeError("stale-fencing-token")
        used, policy = _usage(rows, now), start["policy"]
        if used["wallSeconds"] >= policy["wallSeconds"] or any(
                used[key] + reservation[key] > policy[key] for key in ("spend", "mutations")):
            raise RuntimeError("execution-budget-exhausted")
        row = {**ident, "schema": SCHEMA, "event": "boundary_admitted", "at": now,
               "attempt": start["attempt"], "fencingToken": fence, "reservation": reservation}
        return {"admitted": True, **row}, [row]
    return _locked(Path(path), decide)
def finish(path: Path, ident: dict, fence: str, result: str, detail: dict,
           now: float | None = None) -> dict:
    now = time.time() if now is None else now
    def decide(all_rows):
        rows = _for(all_rows, ident)
        start = next((row for row in reversed(rows) if row.get("fencingToken") == fence and
                      row["event"] == "attempt_started"), None)
        if not start or any(row["event"] == "attempt_finished" and row.get("fencingToken") == fence for row in rows):
            raise RuntimeError("stale-fencing-token")
        fingerprints = [row.get("failureFingerprint") for row in rows if row["event"] == "attempt_finished"]
        failure_class, fingerprint = detail.get("failureClass"), detail.get("failureFingerprint")
        terminal, retry = (result, "stop") if result in TERMINAL else (None, "retry")
        if result == "failed_known":
            terminal, retry = (None, "retry") if failure_class in RETRYABLE else ("failed_known", "stop")
        if result == "failed_known" and fingerprint and fingerprints.count(fingerprint) >= 1:
            terminal, retry = "quarantined", "quarantine"
        used = _usage(rows, now)
        if retry == "retry" and (used["attempts"] >= start["policy"]["attempts"] or
                                  used["wallSeconds"] >= start["policy"]["wallSeconds"]):
            terminal, retry = "budget_exhausted", "stop"
        detail["costs"] = {"tokens": None, "computeSeconds": None, "apiCost": None, **detail.get("costs", {})}
        row = {**ident, "schema": SCHEMA, "event": "attempt_finished", "at": now,
               "attempt": start["attempt"], "fencingToken": fence, "result": result,
               "terminalState": terminal, "retryDecision": retry, "wallSeconds": max(0, now - start["at"]), **detail,
               "remainingBudgets": _remaining(start["policy"], used)}
        if terminal and terminal != "succeeded":
            row["diagnosis"] = _diagnosis([*rows, row], terminal)
        return row, [row]
    return _locked(Path(path), decide)
if __name__ == "__main__":
    request = json.load(sys.stdin)
    command = request.pop("command")
    if command == "identity":
        print(json.dumps(identity(**request)))
        raise SystemExit(0)
    request["path"] = Path(request["path"])
    try:
        print(json.dumps({"claim": claim, "boundary": boundary, "finish": finish}[command](**request)))
    except Exception as error:
        print(json.dumps({"error": str(error)}))
        raise SystemExit(2)
