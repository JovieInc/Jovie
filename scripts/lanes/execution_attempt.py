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
def _status_rows(statuses: list[dict], ident: dict, *, strict=False) -> tuple[list[dict], int | None]:
    context, children = f"jovie-execution/{ident['identityDigest']}", {}
    seen = set()
    for status in (item for item in statuses if item.get("context") == context):
        if strict and not _trusted_creator(status.get("creator")):
            raise RuntimeError("reconciliation-untrusted-status-creator")
        target = status.get("target_url") or ""
        if "#jovie-execution=" not in target: raise RuntimeError("execution-coordinator-receipt-malformed")
        row = _unpack(target.split("#jovie-execution=", 1)[1])
        if row.get("schema") != SCHEMA or row.get("identityDigest") != ident["identityDigest"]: raise RuntimeError("execution-coordinator-receipt-mismatch")
        if strict and any(row.get(key) != value for key, value in ident.items()): raise RuntimeError("reconciliation-identity-mismatch")
        remote = row.setdefault("_remote", {}); remote["statusId"] = int(status["id"])
        if strict and (remote["statusId"] in seen or status.get("state") != ("success" if row.get("terminalState") in {"succeeded", "no_op_stale", "superseded"} else "failure" if row.get("terminalState") else "pending")):
            raise RuntimeError("reconciliation-status-mismatch")
        seen.add(remote["statusId"])
        children.setdefault(remote.get("prevStatusId"), []).append((remote["statusId"], row))
    chain, head = [], None
    while children.get(head):
        if strict and len(children[head]) != 1: raise RuntimeError("reconciliation-ambiguous-history")
        head, row = min(children[head], key=lambda item: item[0]); chain.append(row)
    if strict and len(chain) != len(seen): raise RuntimeError("reconciliation-orphan-history")
    return chain, head
def _github_rows(coordination: dict, ident: dict) -> tuple[list[dict], int | None]:
    repository, sha = coordination.get("repository", ""), coordination.get("sha", "")
    if not re.fullmatch(r"[\w.-]+/[\w.-]+", repository) or not re.fullmatch(r"[0-9a-fA-F]{40}", sha): raise ValueError("execution-coordinator-malformed")
    pages = _gh(coordination, "GET", f"repos/{repository}/commits/{sha}/statuses?per_page=100")
    return _status_rows(_status_pages(pages), ident)
def _github_append(coordination: dict, ident: dict, row: dict, head: int | None) -> str | None:
    candidate = {**row, "_remote": {"prevStatusId": head, "eventId": uuid.uuid4().hex}}
    repository, sha = coordination["repository"], coordination["sha"]
    target = (coordination.get("targetUrl") or f"https://github.com/{repository}/commit/{sha}").split("#", 1)[0]
    target = f"{target}#jovie-execution={_pack(candidate)}"
    if len(target) > 2000: raise RuntimeError("execution-coordinator-receipt-too-large")
    terminal = candidate.get("terminalState")
    state = "success" if terminal in ("succeeded", "no_op_stale", "superseded") else "failure" if terminal else "pending"
    body = {"state": state, "context": f"jovie-execution/{ident['identityDigest']}", "target_url": target,
            "description": f"execution {candidate['event']} attempt={candidate.get('attempt', 0)} {ident['identityDigest'][:12]}"}
    # Serialize ALL dispositions, including budget decisions, against this exact
    # predecessor. The next-attempt ref alone only fences attempt_started.
    append_ref = f"refs/jovie-execution/{ident['identityDigest']}/append-{head if head is not None else 'root'}"
    if _gh(coordination, "POST", f"repos/{repository}/git/refs", {"ref": append_ref, "sha": sha}) is None: return None
    if row["event"] == "attempt_started":
        ref = f"refs/jovie-execution/{ident['identityDigest']}/attempt-{row['attempt']}"
        if _gh(coordination, "POST", f"repos/{repository}/git/refs", {"ref": ref, "sha": sha}) is None: return None
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
            expired = {**ident, "schema": SCHEMA, "event": "attempt_finished", "at": now, "attempt": active["attempt"], "fencingToken": active["fencingToken"],
                "result": "failed_unknown", "terminalState": "failed_unknown", "retryDecision": "reconcile", "failureClass": "lost_worker",
                "failureFingerprint": "lease_expired_without_result", "evidenceDigest": active.get("evidenceDigest"), "costs": {}, "dependencies": []}
            expired["diagnosis"] = _diagnosis([*rows, expired], "failed_unknown")
            return {"admitted": False, "reason": "expired_attempt_reconciled", "terminalState": "failed_unknown"}, [expired]
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
        chain, _ = _status_rows(statuses, candidate, strict=True)
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
        or observed[0].get("object", {}).get("sha") != coord["sha"]):
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
            ref = _completion_ref(ident, next_attempt)
            if _gh(coordination, "POST", f"repos/{coordination['repository']}/git/refs", {"ref": ref, "sha": coordination["sha"]}) is None:
                # A worker or another reconciler won, possibly without publishing
                # its receipt yet. Never infer ownership from an equal ref SHA.
                raise RuntimeError("reconciliation-next-slot-already-reserved")
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
