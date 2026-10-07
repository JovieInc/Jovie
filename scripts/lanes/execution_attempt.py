#!/usr/bin/env python3
"""Durable execution-attempt contract for costly or mutating runtimes."""
from __future__ import annotations
import base64, fcntl, hashlib, json, math, os, re, subprocess, time, uuid, zlib
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
import lifecycle  # noqa: E402
SCHEMA, GITHUB_LEDGER_ANCHOR = "jovie-execution-attempt/v1", "cd29469b1fa2c433135f23bbfca273e674934676"
TERMINAL = frozenset({"succeeded", "no_op_stale", "canceled", "failed_known", "failed_unknown", "budget_exhausted", "quarantined", "superseded", "dead_lettered"})
RETRYABLE = frozenset({"provider_outage", "flaky_infra", "repair_incomplete"})
def digest(value) -> str: return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
def identity(domain: str, work: dict, generation) -> dict:
    work_key, generation = f"{domain}:{digest(work)}", digest(generation)
    return {"workKey": work_key, "executionGeneration": generation, "identityDigest": digest({"workKey": work_key, "generation": generation})}
def _rows(path: Path) -> list[dict]:
    rows = [] if not path.exists() else [json.loads(line) for line in path.read_text().splitlines()]
    if any(row.get("schema") != SCHEMA or not row.get("identityDigest") for row in rows): raise RuntimeError("execution-ledger-malformed")
    return rows
def _file_locked(path: Path, fn):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(f"{path}.lock", "a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        result, additions = fn(_rows(path))
        if additions:
            with open(path, "a") as ledger:
                ledger.writelines(json.dumps(row, sort_keys=True) + "\n" for row in additions)
                ledger.flush(); os.fsync(ledger.fileno())
        return result
def _gh(coordination: dict, method: str, endpoint: str, body=None):
    token = os.environ.get(coordination.get("tokenEnv", "GH_TOKEN")) or os.environ.get("GITHUB_TOKEN")
    # No token in the environment means `gh` authenticates itself (the lanes' Jovie Bot shim mints
    # one per call); requiring GH_TOKEN here crashed every fix run once the shim landed.
    args = ["gh", "api", "-X", method, endpoint]
    args += ["--paginate", "--slurp"] if method == "GET" else ["--input", "-"]
    ran = lifecycle.run(args, input=None if body is None else json.dumps(body), capture_output=True, text=True,
                         env={**os.environ, "GH_TOKEN": token} if token else None, timeout=30)
    if ran.returncode:
        if body and body.get("ref") and "422" in ran.stderr: return None
        raise RuntimeError(f"execution-coordinator-http-{ran.returncode}")
    return json.loads(ran.stdout or "null")
def _pack(row: dict) -> str: return base64.urlsafe_b64encode(zlib.compress(json.dumps(row, separators=(",", ":")).encode(), 9)).decode().rstrip("=")
def _unpack(value: str) -> dict: return json.loads(zlib.decompress(base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))))
def _github_rows(coordination: dict, ident: dict) -> tuple[list[dict], int | None]:
    repository, sha = coordination.get("repository", ""), coordination.get("sha", "")
    if not re.fullmatch(r"[\w.-]+/[\w.-]+", repository) or not re.fullmatch(r"[0-9a-fA-F]{40}", sha): raise ValueError("execution-coordinator-malformed")
    pages = _gh(coordination, "GET", f"repos/{repository}/commits/{sha}/statuses?per_page=100")
    if not isinstance(pages, list) or len(pages) > 100 or any(not isinstance(page, list) for page in pages): raise RuntimeError("execution-coordinator-history-unbounded")
    context, children = f"jovie-execution/{ident['identityDigest']}", {}
    for status in (item for page in pages for item in page if item.get("context") == context):
        target = status.get("target_url") or ""
        if "#jovie-execution=" not in target: raise RuntimeError("execution-coordinator-receipt-malformed")
        row = _unpack(target.split("#jovie-execution=", 1)[1])
        if row.get("schema") != SCHEMA or row.get("identityDigest") != ident["identityDigest"]: raise RuntimeError("execution-coordinator-receipt-mismatch")
        remote = row.setdefault("_remote", {}); remote["statusId"] = int(status["id"])
        children.setdefault(remote.get("prevStatusId"), []).append((remote["statusId"], row))
    chain, head = [], None
    while children.get(head):
        head, row = min(children[head], key=lambda item: item[0]); chain.append(row)
    return chain, head
def _github_append(coordination: dict, ident: dict, row: dict, head: int | None) -> str | None:
    candidate = {**row, "_remote": {"prevStatusId": head, "eventId": uuid.uuid4().hex}}
    repository, sha = coordination["repository"], coordination["sha"]
    if row["event"] == "attempt_started":
        ref = f"refs/jovie-execution/{ident['identityDigest']}/attempt-{row['attempt']}"
        if _gh(coordination, "POST", f"repos/{repository}/git/refs", {"ref": ref, "sha": sha}) is None: return None
    target = (coordination.get("targetUrl") or f"https://github.com/{repository}/commit/{sha}").split("#", 1)[0]
    target = f"{target}#jovie-execution={_pack(candidate)}"
    if len(target) > 2000: raise RuntimeError("execution-coordinator-receipt-too-large")
    terminal = candidate.get("terminalState")
    state = "success" if terminal in ("succeeded", "no_op_stale", "superseded") else "failure" if terminal else "pending"
    body = {"state": state, "context": f"jovie-execution/{ident['identityDigest']}", "target_url": target,
            "description": f"execution {candidate['event']} attempt={candidate.get('attempt', 0)} {ident['identityDigest'][:12]}"}
    _gh(coordination, "POST", f"repos/{repository}/statuses/{sha}", body)
    return candidate["_remote"]["eventId"]
def _locked(path: Path, ident: dict, coordination: dict | None, fn):
    kind = (coordination or {}).get("kind")
    if kind == "local-test": return _file_locked(path, fn)
    if kind != "github-status": raise ValueError("execution-coordination-required")
    for _ in range(4):
        rows, head = _github_rows(coordination, ident)
        result, additions = fn(rows)
        if not additions: return result
        if len(additions) != 1: raise RuntimeError("execution-coordinator-non-atomic-append")
        event_id = _github_append(coordination, ident, additions[0], head)
        if event_id is None: continue
        canonical, _ = _github_rows(coordination, ident)
        winner = next((row for row in canonical if row.get("_remote", {}).get("eventId") == event_id), None)
        if winner: _file_locked(path, lambda _rows: (None, [winner])); return result
    raise RuntimeError("execution-coordinator-contention")
def _for(rows: list[dict], ident: dict) -> list[dict]: return [row for row in rows if row["identityDigest"] == ident["identityDigest"]]
def _usage(rows: list[dict], now: float) -> dict:
    starts = [row for row in rows if row["event"] == "attempt_started"]
    finishes = {row["fencingToken"] for row in rows if row["event"] == "attempt_finished"}
    boundaries = [row for row in rows if row["event"] == "boundary_admitted"]
    return {"attempts": len(starts), "concurrency": sum(row["fencingToken"] not in finishes for row in starts),
            "wallSeconds": max(0, now - min((row["at"] for row in starts), default=now)),
            "spend": sum(row["reservation"]["spend"] for row in boundaries),
            "mutations": sum(row["reservation"]["mutations"] for row in boundaries)}
def _remaining(policy: dict, used: dict) -> dict: return {name: max(0, policy[name] - used[name]) for name in ("attempts", "concurrency", "wallSeconds", "spend", "mutations")}
def _diagnosis(rows: list[dict], terminal: str) -> dict:
    finished = [row for row in rows if row["event"] == "attempt_finished"]
    return {"schema": "jovie-execution-diagnosis/v1", "terminalState": terminal,
        "attempts": [{key: row.get(key) for key in ("attempt", "result", "failureClass", "failureFingerprint", "evidenceDigest", "costs")} for row in finished],
        "attemptDiffs": [a.get("failureFingerprint") != b.get("failureFingerprint") for a, b in zip(finished, finished[1:])],
        "suspectedRootCauses": sorted({row.get("failureClass") for row in finished if row.get("failureClass")}),
        "dependencies": sorted({item for row in finished for item in row.get("dependencies", [])}),
        "nextAction": "collect new authoritative evidence or certify a bounded policy override"}
def _number(value) -> bool: return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
def claim(path: Path, ident: dict, owner: dict, policy: dict, trigger: dict, now: float | None = None, coordination: dict | None = None) -> dict:
    now = time.time() if now is None else now
    required = ("attempts", "concurrency", "wallSeconds", "spend", "mutations", "leaseSeconds")
    if any(not _number(policy.get(key)) or policy[key] < 0 for key in required) or any(policy[key] <= 0 for key in required[:3] + ("leaseSeconds",)): raise ValueError("execution-policy-malformed")
    def decide(all_rows):
        rows = _for(all_rows, ident)
        terminal = next((row for row in reversed(rows) if row.get("terminalState") in TERMINAL), None)
        if terminal: return {"admitted": False, "reason": "generation_terminal", "terminalState": terminal["terminalState"]}, []
        starts = [row for row in rows if row["event"] == "attempt_started"]
        finishes = {row["fencingToken"] for row in rows if row["event"] == "attempt_finished"}
        active = next((row for row in reversed(starts) if row["fencingToken"] not in finishes), None)
        if active and active["leaseExpiresAt"] > now: return {"admitted": False, "reason": "duplicate_active", "fencingToken": active["fencingToken"]}, []
        if active:
            expired = {**ident, "schema": SCHEMA, "event": "attempt_finished", "at": now, "attempt": active["attempt"], "fencingToken": active["fencingToken"],
                "result": "failed_unknown", "terminalState": "failed_unknown", "retryDecision": "reconcile", "failureClass": "lost_worker",
                "failureFingerprint": "lease_expired_without_result", "evidenceDigest": active.get("evidenceDigest"), "costs": {}, "dependencies": []}
            expired["diagnosis"] = _diagnosis([*rows, expired], "failed_unknown")
            return {"admitted": False, "reason": "expired_attempt_reconciled", "terminalState": "failed_unknown"}, [expired]
        used = _usage(rows, now)
        exhausted = next((key for key in ("attempts", "concurrency", "wallSeconds", "spend", "mutations") if used[key] >= policy[key]), None)
        if exhausted:
            row = {**ident, "schema": SCHEMA, "event": "decision", "at": now, "terminalState": "budget_exhausted", "retryDecision": "stop",
                   "reason": f"{exhausted}_budget_exhausted", "diagnosis": _diagnosis(rows, "budget_exhausted")}
            return {"admitted": False, "reason": row["reason"], "terminalState": row["terminalState"]}, [row]
        number = used["attempts"] + 1; fence = digest({"identity": ident["identityDigest"], "attempt": number, "owner": owner, "nonce": uuid.uuid4().hex})
        row = {**ident, "schema": SCHEMA, "event": "attempt_started", "at": now, "attempt": number, "fencingToken": fence, "owner": owner,
            "leaseExpiresAt": now + policy["leaseSeconds"], "trigger": trigger, "policy": policy,
            "remainingBudgets": _remaining(policy, {**used, "attempts": number, "concurrency": used["concurrency"] + 1})}
        return {"admitted": True, **row}, [row]
    return _locked(Path(path), ident, coordination, decide)
def resume(path: Path, ident: dict, fence: str, owner: dict, now: float | None = None, coordination: dict | None = None) -> dict:
    """Resume the same live fenced attempt; never renew its lease or budgets.

    The caller additionally holds its provider journal lock. No terminal or
    expired attempt can be revived, and ownership must match exactly.
    """
    now = time.time() if now is None else now
    def decide(all_rows):
        rows = _for(all_rows, ident)
        start = next((r for r in reversed(rows) if r["event"] == "attempt_started" and r.get("fencingToken") == fence), None)
        if (not start or start["owner"] != owner or start["leaseExpiresAt"] <= now
            or any(r.get("terminalState") in TERMINAL or (r["event"] == "attempt_finished" and r.get("fencingToken") == fence) for r in rows)):
            return {"admitted": False, "reason": "resume_not_admitted"}, []
        return {"admitted": True, **start, "resumed": True}, []
    return _locked(Path(path), ident, coordination, decide)

def boundary(path: Path, ident: dict, fence: str, reservation: dict, now: float | None = None, coordination: dict | None = None) -> dict:
    now = time.time() if now is None else now
    reservation = {"spend": reservation.get("spend", 0), "mutations": reservation.get("mutations", 0)}
    if any(not _number(value) or value < 0 for value in reservation.values()): raise ValueError("execution-reservation-malformed")
    def decide(all_rows):
        rows = _for(all_rows, ident)
        start = next((row for row in reversed(rows) if row.get("fencingToken") == fence and row["event"] == "attempt_started"), None)
        if not start or start["leaseExpiresAt"] <= now or any(row.get("terminalState") in TERMINAL for row in rows): raise RuntimeError("stale-fencing-token")
        used, policy = _usage(rows, now), start["policy"]
        if used["wallSeconds"] >= policy["wallSeconds"] or any(used[key] + reservation[key] > policy[key] for key in ("spend", "mutations")): raise RuntimeError("execution-budget-exhausted")
        row = {**ident, "schema": SCHEMA, "event": "boundary_admitted", "at": now, "attempt": start["attempt"], "fencingToken": fence, "reservation": reservation}
        return {"admitted": True, **row}, [row]
    return _locked(Path(path), ident, coordination, decide)
def finish(path: Path, ident: dict, fence: str, result: str, detail: dict, now: float | None = None, coordination: dict | None = None) -> dict:
    now, detail = (time.time() if now is None else now), dict(detail)
    if result not in TERMINAL:
        detail.update(reportedResult=result, failureClass="malformed_result", failureFingerprint=digest({"unknownResult": result})); result = "failed_unknown"
    def decide(all_rows):
        rows = _for(all_rows, ident)
        start = next((row for row in reversed(rows) if row.get("fencingToken") == fence and row["event"] == "attempt_started"), None)
        if not start or any(row["event"] == "attempt_finished" and row.get("fencingToken") == fence for row in rows):
            raise RuntimeError("stale-fencing-token")
        fingerprints = [row.get("failureFingerprint") for row in rows if row["event"] == "attempt_finished"]
        failure_class, fingerprint = detail.get("failureClass"), detail.get("failureFingerprint")
        terminal, retry = result, "stop"
        if result == "failed_known" and failure_class in RETRYABLE:
            terminal, retry = None, "retry"
        if result == "failed_known" and fingerprint and fingerprints.count(fingerprint):
            terminal, retry = "quarantined", "quarantine"
        used = _usage(rows, now)
        if retry == "retry" and (used["attempts"] >= start["policy"]["attempts"] or used["wallSeconds"] >= start["policy"]["wallSeconds"]):
            terminal, retry = "budget_exhausted", "stop"
        detail["costs"] = {"tokens": None, "computeSeconds": None, "apiCost": None, **detail.get("costs", {})}
        row = {**ident, "schema": SCHEMA, "event": "attempt_finished", "at": now, "attempt": start["attempt"], "fencingToken": fence,
            "result": result, "terminalState": terminal, "retryDecision": retry, "wallSeconds": max(0, now - start["at"]), **detail,
            "remainingBudgets": _remaining(start["policy"], used)}
        if terminal and terminal != "succeeded":
            row["diagnosis"] = _diagnosis([*rows, row], terminal)
        return row, [row]
    return _locked(Path(path), ident, coordination, decide)
if __name__ == "__main__":
    request = json.load(__import__("sys").stdin); command = request.pop("command")
    if command == "identity": print(json.dumps(identity(**request))); raise SystemExit(0)
    request["path"] = Path(request["path"])
    try:
        print(json.dumps({"claim": claim, "boundary": boundary, "finish": finish}[command](**request)))
    except Exception as error: print(json.dumps({"error": str(error)})); raise SystemExit(2)
