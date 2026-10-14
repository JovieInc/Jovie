#!/usr/bin/env python3
"""Durable execution-attempt contract for costly or mutating runtimes."""
from __future__ import annotations
import base64, fcntl, hashlib, json, math, os, re, socket, subprocess, time, uuid, zlib
from datetime import datetime
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
import lifecycle  # noqa: E402
SCHEMA, GITHUB_LEDGER_ANCHOR = "jovie-execution-attempt/v1", "cd29469b1fa2c433135f23bbfca273e674934676"
TERMINAL = frozenset({"succeeded", "no_op_stale", "canceled", "failed_known", "failed_unknown", "budget_exhausted", "quarantined", "superseded", "dead_lettered"})
RETRYABLE = frozenset({"provider_outage", "flaky_infra", "repair_incomplete", "target_state_unavailable"})
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
def _status_pages(pages) -> list[dict]:
    if not isinstance(pages, list) or len(pages) > 100 or any(not isinstance(page, list) for page in pages): raise RuntimeError("execution-coordinator-history-unbounded")
    statuses = [item for page in pages for item in page]
    if any(not isinstance(item, dict) for item in statuses): raise RuntimeError("execution-coordinator-history-malformed")
    return statuses
def _trusted_creator(creator) -> bool:
    return isinstance(creator, dict) and creator.get("login") == "jovie-bot[bot]" and creator.get("type") == "Bot"
SUCCESS_TERMINAL = frozenset({"succeeded", "no_op_stale", "superseded"})
LIVE_EVENTS = frozenset({"attempt_started", "boundary_admitted"})
# A completion seal stays pending until the same reconcile operation appends its
# disposition; an interrupted reconcile resumes from it (operator-owned, never swept).
PENDING_EVENTS = LIVE_EVENTS | {"completion_fenced"}
# A GitHub-only receipt that ends a status the ledger already ended. It links the
# status chain but is never a ledger row, so claim/finish/reconcile never see it.
FINALIZED = "status_finalized"
def status_state(row: dict) -> str:
    """Commit-status state for one ledger row: pending only while a fenced attempt or seal is open.

    An ended attempt that may be retried (or a sealed completion) is no longer running, so
    its status is terminal; leaving it pending kept PR heads UNSTABLE forever, because a
    retry on that exact identity may never come. Retry eligibility lives in the ledger rows.
    """
    terminal = row.get("terminalState")
    if terminal in SUCCESS_TERMINAL: return "success"
    if terminal: return "failure"
    return "pending" if row.get("event") in PENDING_EVENTS else "success"
def _status_rows(statuses: list[dict], ident: dict, *, strict=False, coordination=None) -> tuple[list[dict], int | str | None]:
    context, children = f"jovie-execution/{ident['identityDigest']}", {}
    seen, status_ids, candidates, objects = set(), set(), {}, {}
    for status in (item for item in statuses if item.get("context") == context):
        if strict and not _trusted_creator(status.get("creator")):
            raise RuntimeError("reconciliation-untrusted-status-creator")
        target = status.get("target_url") or ""
        if "#jovie-execution=" not in target: raise RuntimeError("execution-coordinator-receipt-malformed")
        row = _unpack(target.split("#jovie-execution=", 1)[1])
        if row.get("schema") != SCHEMA or row.get("identityDigest") != ident["identityDigest"]: raise RuntimeError("execution-coordinator-receipt-mismatch")
        if strict and any(row.get(key) != value for key, value in ident.items()): raise RuntimeError("reconciliation-identity-mismatch")
        remote = row.setdefault("_remote", {}); remote["statusId"] = int(status["id"])
        # Receipts written before ended attempts became terminal still read pending.
        legacy = "reservationSha" not in remote and status.get("state") == "pending" and not row.get("terminalState") and row.get("event") != FINALIZED
        if strict and (remote["statusId"] in status_ids or (status.get("state") != status_state(row) and not legacy)):
            raise RuntimeError("reconciliation-status-mismatch")
        status_ids.add(remote["statusId"])
        key = remote.get("reservationSha", remote["statusId"])
        if "reservationSha" in remote:
            if coordination is None: raise RuntimeError("execution-coordinator-candidate-unverified")
            if key not in objects:
                objects[key] = _read_candidate(coordination, ident, remote.get("prevStatusId"), key)
                _verify_reservations(coordination, ident, objects[key])
            if _without_status(row) != objects[key]: raise RuntimeError("execution-coordinator-candidate-mismatch")
            # GitHub status POST has no idempotency key. Two helpers may project
            # the EXACT immutable candidate; its object SHA is the stable link,
            # never the response-dependent numeric status ID. All other forks
            # retain the existing strict rejection/canonical selection rules.
            if key in candidates:
                previous = candidates[key]
                if _without_status(previous) != _without_status(row): raise RuntimeError("execution-coordinator-candidate-mismatch")
                if remote["statusId"] < previous["_remote"]["statusId"]: previous["_remote"]["statusId"] = remote["statusId"]
                continue
            candidates[key] = row
        seen.add(key)
        children.setdefault(remote.get("prevStatusId"), []).append((remote["statusId"], row))
    chain, head, linked = [], None, 0
    while children.get(head):
        if strict and len(children[head]) != 1: raise RuntimeError("reconciliation-ambiguous-history")
        _, row = min(children[head], key=lambda item: item[1]["_remote"]["statusId"]); head = row["_remote"].get("reservationSha", row["_remote"]["statusId"]); linked += 1
        if row.get("event") != FINALIZED: chain.append(row)
    if strict and linked != len(seen): raise RuntimeError("reconciliation-orphan-history")
    return chain, head
def _github_rows(coordination: dict, ident: dict) -> tuple[list[dict], int | str | None]:
    repository, sha = coordination.get("repository", ""), coordination.get("sha", "")
    if not re.fullmatch(r"[\w.-]+/[\w.-]+", repository) or not re.fullmatch(r"[0-9a-fA-F]{40}", sha): raise ValueError("execution-coordinator-malformed")
    pages = _gh(coordination, "GET", f"repos/{repository}/commits/{sha}/statuses?per_page=100")
    return _status_rows(_status_pages(pages), ident, coordination=coordination)
RESERVATION_SCHEMA = "jovie-execution-reservation/v1"
def _append_ref(ident: dict, head) -> str:
    return f"refs/jovie-execution/{ident['identityDigest']}/append-{head if head is not None else 'root'}"
def _without_status(row: dict) -> dict:
    return {**row, "_remote": {key: value for key, value in row["_remote"].items() if key != "statusId"}}
def _read_ref(coord: dict, ref: str):
    refs = _status_pages(_gh(coord, "GET", f"repos/{coord['repository']}/git/matching-refs/{ref.removeprefix('refs/')}"))
    exact = [item for item in refs if item.get("ref") == ref]
    if not exact: return None
    if len(exact) != 1: raise RuntimeError("execution-coordinator-reservation-unverified")
    obj = exact[0].get("object") or {}
    return {"type": obj.get("type"), "sha": obj.get("sha")}
def _candidate(coord: dict, ident: dict, head, sha: str, obj: dict) -> dict:
    """Validate the immutable Git object, never common source SHA or tagger text as ownership."""
    try:
        record = json.loads(obj["message"])
        row = record["candidate"]
        remote = row["_remote"]
        event = remote["eventId"]
        valid = (re.fullmatch(r"[0-9a-f]{40}", sha) and obj["sha"] == sha
                 and obj["object"]["type"] == "commit" and obj["object"]["sha"] == coord["sha"]
                 and record["schema"] == RESERVATION_SCHEMA and record["repository"] == coord["repository"]
                 and record["sourceSha"] == coord["sha"] and row["schema"] == SCHEMA
                 and all(row.get(key) == value for key, value in ident.items())
                 and ident["identityDigest"] == digest({"workKey": ident["workKey"], "generation": ident["executionGeneration"]})
                 and re.fullmatch(r"[0-9a-f]{32}", event)
                 and remote == {"prevStatusId": head, "eventId": event}
                 and obj["tag"] == f"jovie-execution/{ident['identityDigest']}/{event}")
    except (KeyError, TypeError, ValueError, AttributeError):
        valid = False
    if valid and row.get("event") == "attempt_started":
        who = row.get("owner")
        valid = (isinstance(who, dict) and all(isinstance(who.get(key), str) and who[key].strip()
                 for key in ("owner", "runtime", "provider", "model", "tool", "accountPool"))
                 and isinstance(row.get("fencingToken"), str) and re.fullmatch(r"[0-9a-f]{64}", row["fencingToken"]))
    if not valid: raise RuntimeError("execution-coordinator-candidate-unverified")
    return {**row, "_remote": {**remote, "reservationSha": sha}}
def _read_candidate(coord: dict, ident: dict, head, sha: str) -> dict:
    if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{40}", sha): raise RuntimeError("execution-coordinator-candidate-unverified")
    objects = _gh(coord, "GET", f"repos/{coord['repository']}/git/tags/{sha}")
    if not isinstance(objects, list) or len(objects) != 1 or not isinstance(objects[0], dict): raise RuntimeError("execution-coordinator-candidate-unverified")
    return _candidate(coord, ident, head, sha, objects[0])
def _status_body(coord: dict, ident: dict, candidate: dict) -> dict:
    target = (coord.get("targetUrl") or f"https://github.com/{coord['repository']}/commit/{coord['sha']}").split("#", 1)[0]
    target = f"{target}#jovie-execution={_pack(candidate)}"
    if len(target) > 2000: raise RuntimeError("execution-coordinator-receipt-too-large")
    return {"state": status_state(candidate), "context": f"jovie-execution/{ident['identityDigest']}", "target_url": target,
            "description": f"execution {candidate['event']} attempt={candidate.get('attempt', 0)} {ident['identityDigest'][:12]}"}
def _reserve(coord: dict, ident: dict, candidate: dict, ref: str) -> bool:
    sha, head = candidate["_remote"]["reservationSha"], candidate["_remote"]["prevStatusId"]
    # A lost create response is unknown until the exact immutable candidate is
    # read back. A contender's ref (including a legacy equal-source-SHA ref) is
    # never removed, rewritten, or inferred to be ours.
    try: created = _gh(coord, "POST", f"repos/{coord['repository']}/git/refs", {"ref": ref, "sha": sha})
    except RuntimeError:
        observed = _read_ref(coord, ref)
        if observed != {"type": "tag", "sha": sha}: raise
    else:
        if created is not None:
            if (not isinstance(created, dict) or created.get("ref") != ref
                or created.get("object", {}).get("type") != "tag" or created.get("object", {}).get("sha") != sha):
                raise RuntimeError("execution-coordinator-reservation-unverified")
            return True
        observed = _read_ref(coord, ref)
        if observed != {"type": "tag", "sha": sha}: return False
    return _read_candidate(coord, ident, head, sha) == candidate
def _attempt_reservation(ident: dict, candidate: dict):
    if candidate["event"] == "attempt_started": return _completion_ref(ident, candidate["attempt"])
    if candidate["event"] == "completion_fenced": return _completion_ref(ident, candidate["sealedAttempt"])
    return None
def _verify_reservations(coord: dict, ident: dict, candidate: dict):
    expected = {"type": "tag", "sha": candidate["_remote"]["reservationSha"]}
    refs = [_append_ref(ident, candidate["_remote"]["prevStatusId"]), _attempt_reservation(ident, candidate)]
    if any(ref and _read_ref(coord, ref) != expected for ref in refs):
        raise RuntimeError("execution-coordinator-reservation-unverified")
def _recover_append(coord: dict, ident: dict, head):
    ref = _append_ref(ident, head)
    observed = _read_ref(coord, ref)
    if observed is None: return None
    if observed.get("type") != "tag": raise RuntimeError("execution-coordinator-reservation-unverified")
    candidate = _read_candidate(coord, ident, head, observed.get("sha"))
    attempt_ref = _attempt_reservation(ident, candidate)
    if attempt_ref and not _reserve(coord, ident, candidate, attempt_ref): raise RuntimeError("execution-coordinator-attempt-reserved")
    _verify_reservations(coord, ident, candidate)
    # This only completes the winning receipt. It never grants the helper the
    # winner's fence, renews a lease, or chooses a replacement outcome.
    _gh(coord, "POST", f"repos/{coord['repository']}/statuses/{coord['sha']}", _status_body(coord, ident, candidate))
    return candidate
def _github_append(coordination: dict, ident: dict, row: dict, head) -> str | None:
    candidate = {**row, "_remote": {"prevStatusId": head, "eventId": uuid.uuid4().hex}}
    # Include the fixed-size object proof in the preflight; an oversize status
    # must not strand a reservation. Candidate creation precedes every CAS.
    _status_body(coordination, ident, {**candidate, "_remote": {**candidate["_remote"], "reservationSha": "0" * 40}})
    record = {"schema": RESERVATION_SCHEMA, "repository": coordination["repository"], "sourceSha": coordination["sha"], "candidate": candidate}
    obj = _gh(coordination, "POST", f"repos/{coordination['repository']}/git/tags",
              {"tag": f"jovie-execution/{ident['identityDigest']}/{candidate['_remote']['eventId']}",
               "message": json.dumps(record, sort_keys=True, separators=(",", ":")), "object": coordination["sha"], "type": "commit"})
    candidate = _candidate(coordination, ident, head, obj.get("sha", ""), obj)
    body = _status_body(coordination, ident, candidate)
    if not _reserve(coordination, ident, candidate, _append_ref(ident, head)): return None
    ref = _attempt_reservation(ident, candidate)
    if ref and not _reserve(coordination, ident, candidate, ref): return None
    _verify_reservations(coordination, ident, candidate)
    _gh(coordination, "POST", f"repos/{coordination['repository']}/statuses/{coordination['sha']}", body)
    return candidate["_remote"]["eventId"]
def _locked(path: Path, ident: dict, coordination: dict | None, fn):
    kind = (coordination or {}).get("kind")
    if kind == "local-test": return _file_locked(path, fn)
    if kind != "github-status": raise ValueError("execution-coordination-required")
    for _ in range(4):
        rows, head = _github_rows(coordination, ident)
        recovered = _recover_append(coordination, ident, head)
        if recovered:
            rows, head = _github_rows(coordination, ident)
            winner = next((row for row in rows if row.get("_remote", {}).get("eventId") == recovered["_remote"]["eventId"]), None)
            if winner is None: raise RuntimeError("execution-coordinator-outcome-unknown")
            _file_locked(path, lambda local: (None, [] if any(row.get("_remote", {}).get("eventId") == recovered["_remote"]["eventId"] for row in local) else [winner]))
            # A recovered boundary is already charged and its dispatch outcome
            # is unknown. Do not turn this invocation into another authorization.
            if recovered["event"] == "boundary_admitted": raise RuntimeError("execution-coordinator-recovered-boundary")
        result, additions = fn(rows)
        if not additions: return result
        if len(additions) != 1: raise RuntimeError("execution-coordinator-non-atomic-append")
        event_id = _github_append(coordination, ident, additions[0], head)
        if event_id is None: continue
        canonical, _ = _github_rows(coordination, ident)
        winner = next((row for row in canonical if row.get("_remote", {}).get("eventId") == event_id), None)
        if winner:
            _file_locked(path, lambda _rows: (None, [winner]))
            if isinstance(result, dict) and result.get("admitted") and any(row.get("terminalState") in TERMINAL or row.get("event") == "completion_fenced"
                or (row.get("event") == "attempt_finished" and row.get("fencingToken") == winner.get("fencingToken")) for row in canonical):
                raise RuntimeError("stale-fencing-token")
            return result
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
def _expired_row(rows: list[dict], ident: dict, active: dict, now: float) -> dict:
    expired = {**ident, "schema": SCHEMA, "event": "attempt_finished", "at": now, "attempt": active["attempt"], "fencingToken": active["fencingToken"],
        "result": "failed_unknown", "terminalState": "failed_unknown", "retryDecision": "reconcile", "failureClass": "lost_worker",
        "failureFingerprint": "lease_expired_without_result", "evidenceDigest": active.get("evidenceDigest"), "costs": {}, "dependencies": []}
    expired["diagnosis"] = _diagnosis([*rows, expired], "failed_unknown")
    return expired
def _number(value) -> bool: return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
def claim(path: Path, ident: dict, owner: dict, policy: dict, trigger: dict, now: float | None = None, coordination: dict | None = None) -> dict:
    now = time.time() if now is None else now
    required = ("attempts", "concurrency", "wallSeconds", "spend", "mutations", "leaseSeconds")
    if any(not _number(policy.get(key)) or policy[key] < 0 for key in required) or any(policy[key] <= 0 for key in required[:3] + ("leaseSeconds",)): raise ValueError("execution-policy-malformed")
    def decide(all_rows):
        rows = _for(all_rows, ident)
        if any(row.get("event") == "completion_fenced" for row in rows):
            terminal = next((row.get("terminalState") for row in reversed(rows) if row.get("terminalState") in TERMINAL), None)
            return {"admitted": False, "reason": "generation_terminal" if terminal else "generation_completion_fenced", "terminalState": terminal}, []
        terminal = next((row for row in reversed(rows) if row.get("terminalState") in TERMINAL), None)
        if terminal: return {"admitted": False, "reason": "generation_terminal", "terminalState": terminal["terminalState"]}, []
        starts = [row for row in rows if row["event"] == "attempt_started"]
        finishes = {row["fencingToken"] for row in rows if row["event"] == "attempt_finished"}
        active = next((row for row in reversed(starts) if row["fencingToken"] not in finishes), None)
        if active and active["leaseExpiresAt"] > now: return {"admitted": False, "reason": "duplicate_active", "fencingToken": active["fencingToken"]}, []
        if active:
            return {"admitted": False, "reason": "expired_attempt_reconciled", "terminalState": "failed_unknown"}, [_expired_row(rows, ident, active, now)]
        used = _usage(rows, now)
        # Zero-cost work can claim a zero-spend/mutation policy. Its first
        # positive boundary still fails closed; positive exhausted caps retain
        # their existing stop semantics. This never grants a provider route.
        exhausted = next((key for key in ("attempts", "concurrency", "wallSeconds", "spend", "mutations")
                          if used[key] >= policy[key] and not
                          (key in {"spend", "mutations"} and used[key] == policy[key] == 0)), None)
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
        if (not start or start["leaseExpiresAt"] <= now
                or any(row.get("terminalState") in TERMINAL
                       or (row["event"] == "attempt_finished" and row.get("fencingToken") == fence)
                       for row in rows)):
            raise RuntimeError("stale-fencing-token")
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

def finalize_stale_statuses(path: Path, coordination: dict, now: float | None = None) -> list[dict]:
    """End every jovie-execution/* status on one head that no live attempt owns.

    A status is stale when its latest receipt is pending and either (a) the ledger row behind
    it already ended (written before ended attempts became terminal), which gets a
    FINALIZED success receipt, or (b) its fenced attempt's lease expired without a result,
    which gets the same lost_worker failure a later claim would append. A live lease is left
    alone. Only jovie-bot receipts are touched; contention is skipped for the next sweep.
    """
    now = time.time() if now is None else now
    if coordination.get("kind") != "github-status": raise ValueError("execution-coordination-required")
    repository, sha = coordination.get("repository", ""), coordination.get("sha", "")
    if not re.fullmatch(r"[\w.-]+/[\w.-]+", repository) or not re.fullmatch(r"[0-9a-fA-F]{40}", sha): raise ValueError("execution-coordinator-malformed")
    statuses = _status_pages(_gh(coordination, "GET", f"repos/{repository}/commits/{sha}/statuses?per_page=100"))
    latest = {}
    for status in statuses:
        context = status.get("context") or ""
        if context.startswith("jovie-execution/") and isinstance(status.get("id"), int):
            if context not in latest or status["id"] > latest[context]["id"]: latest[context] = status
    outcomes = []
    for context, status in sorted(latest.items()):
        if status.get("state") != "pending" or not _trusted_creator(status.get("creator")): continue
        packed = (status.get("target_url") or "").split("#jovie-execution=", 1)
        try:
            row = _unpack(packed[1]) if len(packed) == 2 else {}
        except (ValueError, zlib.error):
            row = {}
        ident = {key: row.get(key) for key in ("workKey", "executionGeneration", "identityDigest")}
        if (row.get("schema") != SCHEMA or context != f"jovie-execution/{ident['identityDigest']}"
                or ident["identityDigest"] != digest({"workKey": ident["workKey"], "generation": ident["executionGeneration"]})):
            outcomes.append({"context": context, "outcome": "skipped-malformed"}); continue
        try:
            chain, head = _status_rows(statuses, ident, coordination=coordination)
        except (RuntimeError, ValueError, KeyError, zlib.error):
            outcomes.append({"context": context, "outcome": "skipped-malformed"}); continue
        if not chain or head != row.get("_remote", {}).get("reservationSha", status["id"]):
            outcomes.append({"context": context, "outcome": "skipped-unlinked"}); continue
        last = chain[-1]
        if last.get("terminalState"):  # A terminal row always posts a terminal state; never restate it.
            outcomes.append({"context": context, "outcome": "skipped-inconsistent"}); continue
        if last.get("event") == "completion_fenced":
            outcomes.append({"context": context, "outcome": "skipped-sealed"}); continue
        if last.get("event") not in LIVE_EVENTS:
            marker = {**ident, "schema": SCHEMA, "event": FINALIZED, "at": now, "attempt": last.get("attempt", 0),
                      "finalizes": last.get("event"), "fencingToken": last.get("fencingToken")}
            done = _github_append(coordination, ident, marker, head)
            outcomes.append({"context": context, "outcome": "finalized" if done else "contended"}); continue
        def expire(all_rows):
            rows = _for(all_rows, ident)
            if any(r.get("terminalState") in TERMINAL or r.get("event") == "completion_fenced" for r in rows): return "ended", []
            finishes = {r["fencingToken"] for r in rows if r["event"] == "attempt_finished"}
            active = next((r for r in reversed(rows) if r["event"] == "attempt_started" and r["fencingToken"] not in finishes), None)
            if not active: return "ended", []
            if active["leaseExpiresAt"] > now: return "live", []
            return "expired", [_expired_row(rows, ident, active, now)]
        try:
            outcomes.append({"context": context, "outcome": _locked(Path(path), ident, coordination, expire)})
        except RuntimeError as error:
            outcomes.append({"context": context, "outcome": f"contended:{error}"})
    return outcomes

RECONCILE_CHECKS = frozenset({"Source Validation", "PR Ready", "PR Size Guard", "Migration Guard", "Security Evidence", "Exact-head Coverage"})
def _timestamp(value) -> float:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None: raise RuntimeError("reconciliation-timestamp-without-zone")
    return parsed.timestamp()
def _plain(row: dict) -> dict: return {key: value for key, value in row.items() if key != "_remote"}
def _completed_chain(rows: list[dict], ident: dict, journal: list[dict], pr: int, sha: str, branch: str, now: float) -> list[dict]:
    """Every excluded identity needs complete, same-host ownership and its own ended receipt."""
    if not rows or not ident["workKey"].startswith("pr-remediation:") or ident["executionGeneration"] != digest({"headSha": sha}):
        raise RuntimeError("reconciliation-generation-mismatch")
    starts, finishes, receipts = {}, {}, []
    for row in rows:
        if not _number(row.get("at")) or row["at"] > now: raise RuntimeError("reconciliation-event-time-invalid")
        fence, event = row.get("fencingToken"), row.get("event")
        if event == "attempt_started":
            who, trigger = row.get("owner") or {}, row.get("trigger") or {}
            if (any(not isinstance(who.get(key), str) or not who[key].strip() for key in ("owner", "runtime", "provider", "model", "tool", "accountPool"))
                or who["owner"] != socket.gethostname().split(".")[0] or who["runtime"] != "symphony-lanes" or who["tool"] != "fix_red_pr"
                or trigger.get("correlationId") != f"pr-{pr}" or trigger.get("causationId") != sha or not trigger.get("triggerId")):
                raise RuntimeError("reconciliation-owner-or-trigger-mismatch")
            if not fence or fence in starts or row.get("attempt") != len(starts) + 1: raise RuntimeError("reconciliation-ambiguous-attempt")
            starts[fence] = row
        elif event == "boundary_admitted":
            if fence not in starts or fence in finishes or row.get("attempt") != starts[fence]["attempt"]:
                raise RuntimeError("reconciliation-unbound-boundary")
        elif event == "attempt_finished":
            if (fence not in starts or fence in finishes or row.get("attempt") != starts[fence]["attempt"]
                or row.get("result") != "failed_known" or row.get("terminalState") is not None or row.get("retryDecision") != "retry"
                or row.get("failureClass") not in RETRYABLE or row.get("mutationsPerformed") != [] or row["at"] < starts[fence]["at"]):
                raise RuntimeError("reconciliation-not-ended-retryable-failure")
            start = starts[fence]
            matches = [item for item in journal if item.get("runId") == start["trigger"]["triggerId"]]
            if len(matches) != 1: raise RuntimeError("reconciliation-own-ended-receipt-missing-or-ambiguous")
            receipt = matches[0]
            if (receipt.get("schema") != "jovie-lane-run/v1" or receipt.get("kind") != "fix-red" or receipt.get("pr") != pr
                or receipt.get("provider") != start["owner"]["provider"] or receipt.get("branch") != branch
                or receipt.get("headBefore") != sha or receipt.get("requestSource", {}).get("head") != sha
                or receipt.get("headAfter") not in (None, sha) or receipt.get("verdict") not in {"fix-no-change", "reconcile-unavailable"}
                or receipt.get("execution") != _plain(row)):
                raise RuntimeError("reconciliation-own-ended-receipt-mismatch")
            ended = _timestamp(receipt.get("endedAt", ""))
            if ended > now or abs(ended - row["at"]) > 2: raise RuntimeError("reconciliation-ended-time-mismatch")
            finishes[fence] = row; receipts.append(receipt)
        elif event == "completion_fenced":
            if (not finishes or row.get("sealedAttempt") != len(starts) + 1 or row.get("result") != "failed_known"
                or row.get("terminalState") is not None or row.get("fencingToken") != next(reversed(finishes))
                or row.get("endedReceiptDigest") != digest(receipts[-1])
                or any(previous.get("event") == "completion_fenced" for previous in rows[:rows.index(row)])):
                raise RuntimeError("reconciliation-completion-fence-mismatch")
        elif event == "disposition_reconciled":
            if (row is not rows[-1] or not finishes or row.get("terminalState") != "no_op_stale" or row.get("result") != "failed_known"
                or row.get("reconciliationOutcome") != "source_intent_stale_after_recovery"
                or row.get("fencingToken") != next(reversed(finishes)) or row.get("endedReceiptDigest") != digest(receipts[-1])
                or not any(previous.get("event") == "completion_fenced" for previous in rows)):
                raise RuntimeError("reconciliation-prior-disposition-mismatch")
        else: raise RuntimeError("reconciliation-unsupported-history")
    if not starts or starts.keys() != finishes.keys(): raise RuntimeError("reconciliation-live-or-unfinished-attempt")
    return receipts
def _reconciliation_proof(coord: dict, ident: dict, rows: list[dict], pr: int, state: Path, bank: dict, now: float) -> dict:
    repo, sha = coord["repository"], coord["sha"]
    current = _gh(coord, "GET", f"repos/{repo}/pulls/{pr}")
    if not isinstance(current, list) or len(current) != 1: raise RuntimeError("reconciliation-pr-unreadable")
    current = current[0]
    branch = current.get("head", {}).get("ref")
    if (current.get("number") != pr or current.get("state") != "open" or current.get("merged") is not False
        or current.get("head", {}).get("sha") != sha or not branch
        or any(label.get("name") == "hold" for label in current.get("labels", []))):
        raise RuntimeError("reconciliation-pr-changed-or-held")
    held = json.loads((state / "held.json").read_text()) if (state / "held.json").exists() else {}
    if str(pr) in held: raise RuntimeError("reconciliation-held-disposition")
    revocations = state / "runs/publication-revocations.jsonl"
    if revocations.exists():
        for line in revocations.read_text().splitlines():
            revoked = json.loads(line)
            if revoked.get("schema") != "jovie-publication-revocation/v1": raise RuntimeError("reconciliation-revocation-ledger-malformed")
            if revoked.get("branch") == branch: raise RuntimeError("reconciliation-publication-revoked")
    statuses = _status_pages(_gh(coord, "GET", f"repos/{repo}/commits/{sha}/statuses?per_page=100"))
    latest = {}
    for status in statuses:
        name = status.get("context")
        if not name or not isinstance(status.get("id"), int): raise RuntimeError("reconciliation-status-malformed")
        if name not in latest or status["id"] > latest[name]["id"]: latest[name] = status
    journal = [json.loads(line) for line in (state / "runs/ledger.jsonl").read_text().splitlines()]
    completed, excluded = [], []
    for context, status in latest.items():
        if not context.startswith("jovie-execution/"): continue
        packed = (status.get("target_url") or "").split("#jovie-execution=", 1)
        if len(packed) != 2: raise RuntimeError("reconciliation-execution-receipt-missing")
        row = _unpack(packed[1])
        candidate = {key: row.get(key) for key in ("workKey", "executionGeneration", "identityDigest")}
        if candidate["identityDigest"] != digest({"workKey": candidate["workKey"], "generation": candidate["executionGeneration"]}):
            raise RuntimeError("reconciliation-identity-invalid")
        chain, _ = _status_rows(statuses, candidate, strict=True, coordination=coord)
        # Successful unrelated execution is not excluded. Pending/failing non-remediation
        # work must remain a blocker rather than being labeled stale by this operation.
        if not str(candidate["workKey"]).startswith("pr-remediation:"):
            if status.get("state") != "success": raise RuntimeError("reconciliation-independent-execution-unresolved")
            continue
        receipts = _completed_chain(chain, candidate, journal, pr, sha, branch, now)
        if candidate == ident and chain != rows: raise RuntimeError("reconciliation-canonical-history-changed")
        completed.extend(receipts); excluded.append(context)
    if f"jovie-execution/{ident['identityDigest']}" not in excluded: raise RuntimeError("reconciliation-target-missing")
    entry = bank.get(str(pr), {})
    if (entry.get("sha") != sha or entry.get("pushed") is not False or not _number(entry.get("endedAt"))
        or not isinstance(entry.get("count"), int) or isinstance(entry.get("count"), bool)
        or entry["endedAt"] > now or entry.get("count") != len(completed) or entry.get("repairBranch") != branch
        or entry.get("repairHeadBefore") != sha): raise RuntimeError("reconciliation-bank-binding-mismatch")
    final = [receipt for receipt in completed if receipt["runId"] == entry.get("repairRunId")]
    if len(final) != 1 or entry.get("repairVerdict") != final[0]["verdict"] or abs(entry["endedAt"] - _timestamp(final[0]["endedAt"])) > 2:
        raise RuntimeError("reconciliation-bank-ended-run-mismatch")
    for status in latest.values():
        if status["context"] not in excluded and status.get("state") != "success": raise RuntimeError("reconciliation-current-status-unresolved")
    fork = latest.get("Fork PR Gate", {})
    if fork.get("state") != "success" or not _trusted_creator(fork.get("creator")):
        raise RuntimeError("reconciliation-fork-gate-unverified")
    pages = _gh(coord, "GET", f"repos/{repo}/commits/{sha}/check-runs?per_page=100&filter=latest")
    if not isinstance(pages, list) or not pages or len(pages) > 100: raise RuntimeError("reconciliation-checks-unreadable")
    checks = [check for page in pages for check in page["check_runs"]]
    if any(page["total_count"] != len(checks) for page in pages): raise RuntimeError("reconciliation-checks-incomplete")
    names = set()
    for check in checks:
        if check.get("head_sha") != sha: raise RuntimeError("reconciliation-check-head-mismatch")
        names.add(check["name"])
    if not RECONCILE_CHECKS <= names: raise RuntimeError("reconciliation-required-check-missing")
    # GitHub's filter=latest selects current runs. A display name is not an app
    # or suite identity: never hide an independent red/pending returned run.
    for check in checks:
        name = check["name"]
        if check.get("status") != "completed" or check.get("conclusion") not in ("success", "neutral", "skipped"):
            raise RuntimeError("reconciliation-current-check-unresolved")
        if name in RECONCILE_CHECKS and (check.get("conclusion") != "success" or check.get("app", {}).get("slug") != "github-actions"):
            raise RuntimeError("reconciliation-required-check-unverified")
    comments = _status_pages(_gh(coord, "GET", f"repos/{repo}/issues/{pr}/comments?per_page=100"))
    for comment in comments:
        body = comment.get("body", "")
        if not body.startswith("🤖 lane claim "): continue
        fields = dict(part.split("=", 1) for part in body.split()[3:] if "=" in part)
        if fields.get("sha") == sha and (not fields.get("host") or now - _timestamp(fields.get("at", "")) < 2 * 3600):
            raise RuntimeError("reconciliation-current-claim-active")
    return {"headSha": sha, "pr": pr, "branch": branch, "bankDigest": digest(bank), "endedReceiptDigests": [digest(item) for item in completed],
            "excludedContexts": sorted(excluded), "statusIds": sorted(item["id"] for item in latest.values()), "checkIds": sorted(item["id"] for item in checks)}
def _completion_ref(ident: dict, sealed_attempt: int) -> str:
    # This is the same atomic ref namespace that attempt_started must acquire.
    # Sealing the next slot blocks old as well as new workers; it is not a claim,
    # an attempt-start event, a charged retry, or permission to call a provider.
    return f"refs/jovie-execution/{ident['identityDigest']}/attempt-{sealed_attempt}"
def _verify_completion_fence(coord: dict, ident: dict, row: dict):
    ref = _completion_ref(ident, row["sealedAttempt"])
    observed = _gh(coord, "GET", f"repos/{coord['repository']}/git/ref/{ref.removeprefix('refs/')}")
    if (not isinstance(observed, list) or len(observed) != 1 or observed[0].get("ref") != ref
        or observed[0].get("object", {}).get("sha") != row.get("_remote", {}).get("reservationSha", coord["sha"])):
        raise RuntimeError("reconciliation-remote-fence-unverified")
def reconcile_completed_failure(path: Path, ident: dict, pr: int, *, coordination: dict, state: Path | None = None, now: float | None = None) -> dict:
    """Append a stale-intent disposition after authoritative recovery; never retry or rewrite failure.

    The maintained per-head bank mutex fences local repair claims. Each CAS retry
    re-reads current GitHub state and each identity's own ended-run journal.
    Activation must drain/update old writers on every participating host: legacy
    budget-decision writers do not honor the shared append-ref protocol.
    """
    if coordination.get("kind") != "github-status" or not isinstance(pr, int) or isinstance(pr, bool) or pr <= 0:
        raise ValueError("reconciliation-live-coordination-required")
    if ident.get("identityDigest") != digest({"workKey": ident.get("workKey"), "generation": ident.get("executionGeneration")}):
        raise ValueError("reconciliation-identity-invalid")
    state = Path(state or os.environ.get("LANES_STATE") or Path.home() / ".local/state/jovie-lanes")
    now = time.time() if now is None else now
    bank_path = state / "fix-attempts.json"
    with open(bank_path.with_suffix(".json.lock"), "a+") as lock:
        try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error: raise RuntimeError("reconciliation-bank-lock-busy") from error
        def fence(rows):
            proof = _reconciliation_proof(coordination, ident, rows, pr, state, json.loads(bank_path.read_text()), now)
            sealed = next((row for row in rows if row.get("event") == "completion_fenced"), None)
            if sealed:
                _verify_completion_fence(coordination, ident, sealed)
                return {"fenced": True}, []
            ended = rows[-1]
            next_attempt = ended["attempt"] + 1
            row = {**ident, "schema": SCHEMA, "event": "completion_fenced", "at": now, "attempt": ended["attempt"], "fencingToken": ended["fencingToken"],
                   "sealedAttempt": next_attempt, "result": "failed_known", "terminalState": None, "remainingBudgets": ended["remainingBudgets"],
                   "endedReceiptDigest": next(digest(item) for item in [json.loads(line) for line in (state / "runs/ledger.jsonl").read_text().splitlines()] if item.get("execution") == _plain(ended)),
                   "evidenceDigest": digest(proof)}
            return {"fenced": True}, [row]
        _locked(Path(path), ident, coordination, fence)
        def decide(rows):
            proof = _reconciliation_proof(coordination, ident, rows, pr, state, json.loads(bank_path.read_text()), now)
            sealed = next(row for row in rows if row.get("event") == "completion_fenced")
            _verify_completion_fence(coordination, ident, sealed)
            if rows[-1].get("event") == "disposition_reconciled":
                return {"reconciled": True, "alreadyReconciled": True, "result": "failed_known", "terminalState": "no_op_stale", "proof": proof}, []
            ended = next(row for row in reversed(rows) if row.get("event") == "attempt_finished")
            row = {**ident, "schema": SCHEMA, "event": "disposition_reconciled", "at": now, "attempt": ended["attempt"], "fencingToken": ended["fencingToken"],
                   "result": ended["result"], "terminalState": "no_op_stale", "retryDecision": "stop", "reconciliationOutcome": "source_intent_stale_after_recovery",
                   "failureClass": ended["failureClass"], "failureFingerprint": ended.get("failureFingerprint"), "remainingBudgets": ended["remainingBudgets"],
                   "endedReceiptDigest": sealed["endedReceiptDigest"],
                   "evidenceDigest": digest(proof), "bankDigest": proof["bankDigest"]}
            return {"reconciled": True, **row, "proof": proof}, [row]
        return _locked(Path(path), ident, coordination, decide)
if __name__ == "__main__":
    request = json.load(__import__("sys").stdin); command = request.pop("command")
    if command == "identity": print(json.dumps(identity(**request))); raise SystemExit(0)
    request["path"] = Path(request["path"])
    try:
        if command == "reconcile":
            # A JSON request cannot supply a replacement authority journal or clock.
            request.pop("state", None); request.pop("now", None)
        state = Path(os.environ.get("LANES_STATE") or Path.home() / ".local/state/jovie-lanes")
        with lifecycle.Guard(state):
            print(json.dumps({"claim": claim, "boundary": boundary, "finish": finish, "reconcile": reconcile_completed_failure}[command](**request)))
    except Exception as error: print(json.dumps({"error": str(error)})); raise SystemExit(2)
