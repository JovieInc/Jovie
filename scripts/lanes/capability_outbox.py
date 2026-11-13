"""Capability requests use the existing Linear outbox, lock, budget and dispatch tick."""
import json
import subprocess
import time
from pathlib import Path

import linear_sync as sync
import execution_attempt

BRIDGE = Path(__file__).resolve().parents[1] / "lib" / "native-capability-adapter.mjs"
READBACK = 'query($id:String!){issue(id:$id){comments(first:100){nodes{id body} pageInfo{hasNextPage}}}}'


def denied(error):
    diagnostic = getattr(error, "diagnostic", {})
    return (getattr(error, "status", None) in (401, 403) or getattr(error, "code", None) in (401, 403)
            or diagnostic.get("httpStatus") in (401, 403)
            or diagnostic.get("code") in {"FORBIDDEN", "UNAUTHENTICATED", "AUTHENTICATION_ERROR"})


def reconcile(state, limit=10):
    """Repair checkpoint -> outbox crashes from the existing verified execution mirror, never dispatch."""
    ledger = state / "runs" / "execution-attempts.jsonl"
    if ledger.exists() and ledger.stat().st_size > 8 * 1024 * 1024:
        raise ValueError("capability-execution-mirror-too-large")
    rows = execution_attempt._rows(ledger)
    starts = {row["fencingToken"]: row for row in rows if row["event"] == "attempt_started"}
    latest = {row["fencingToken"]: row for row in rows if row.get("capability")}
    existing = sync._read(sync._outbox_path(state), sync.OUTBOX).get("capabilityRequests", {})
    restored = 0
    for fence, row in latest.items():
        if restored >= limit:
            break
        record, start = row["capability"], starts.get(fence)
        requests = record.get("capabilityRequests", [])
        if not requests or all(request["id"] in existing for request in requests):
            continue
        issue_id = record["job"].get("linearIssueId")
        if not start or not issue_id or issue_id != start.get("trigger", {}).get("causationId"):
            continue  # missing destination provenance never manufactures a recipient
        messages = transition({"op": "render", "record": record})["messages"]
        enqueue(state, issue_id, record, messages)
        restored += 1


def transition(payload):
    result = subprocess.run(["node", str(BRIDGE)], input=json.dumps(payload), text=True,
                            capture_output=True, timeout=10, check=True)
    if len(result.stdout) > 262144:
        raise ValueError("capability-result-too-large")
    return json.loads(result.stdout)


def enqueue(state, issue_id, record, messages):
    """No approval is imported here. Retain terminal delivery history across heads."""
    with sync._mutating(sync._outbox_path(state), sync.OUTBOX) as data:
        requests = data.setdefault("capabilityRequests", {})
        for request, body in zip(record["capabilityRequests"], messages, strict=True):
            key = request["id"]
            if key in requests:
                continue
            prior = [row["record"]["capabilityRequests"][0] for row in requests.values() if row["issueId"] == issue_id]
            request = json.loads(json.dumps(request))
            if any(row["delivery"]["status"] == "denied" for row in prior):
                request = {**request, "delivery": {**request["delivery"], "status": "denied"}}
            scope = [row for row in prior if all(row["binding"][field] == request["binding"][field]
                                               for field in ("jobId", "capability", "scope"))]
            request["delivery"]["attempts"] = max([request["delivery"]["attempts"],
                                                   *[row["delivery"]["attempts"] for row in scope]])
            terminal = next((row["status"] for row in scope if row["status"] in {"denied", "expired"}), None)
            if terminal:
                request["status"] = terminal
            requests[key] = {"issueId": issue_id, "body": body,
                             "record": {"job": record["job"], "capabilityRequests": [request]}}


def _update(state, key, op, now, **extra):
    with sync._mutating(sync._outbox_path(state), sync.OUTBOX) as data:
        row = data.get("capabilityRequests", {}).get(key)
        if row is None:
            return {"reason": "request-missing"}
        if op == "delivery-select" and any(other["issueId"] == row["issueId"]
                and other["record"]["capabilityRequests"][0]["delivery"]["status"] == "denied"
                for other in data.get("capabilityRequests", {}).values()):
            row["record"]["capabilityRequests"][0]["delivery"]["status"] = "denied"
            return {"reason": "delivery-denied"}
        if op == "delivery-select":
            others = [other["record"]["capabilityRequests"][0] for other_key, other in
                      data.get("capabilityRequests", {}).items() if other_key != key and other["issueId"] == row["issueId"]]
            for other in others:
                delivery = other["delivery"]
                if delivery["status"] in {"sending", "checking"}:
                    try:
                        age = now - sync.datetime.fromisoformat(delivery["startedAt"].replace("Z", "+00:00")).timestamp()
                    except (KeyError, ValueError):
                        age = 300
                    if 0 <= age < 300:
                        return {"reason": "destination-delivery-in-flight"}
                    delivery["status"] = "unknown"
                if delivery["status"] == "unknown" and row["record"]["capabilityRequests"][0]["delivery"]["status"] not in {"unknown", "checking"}:
                    return {"reason": "destination-delivery-uncertain"}
        result = transition({"op": op, "record": row["record"], "requestId": key,
                             "nowMs": now * 1000, **extra})
        row["record"] = result["record"]
        return result["result"]


def flush(state, linear, admit, *, limit=10, now=None, budget_s=45):
    """Unknown sends only read back; reservation precedes I/O, settlement is generation fenced."""
    now = time.time() if now is None else now
    reconcile(state, limit=limit)
    rows = sync._read(sync._outbox_path(state), sync.OUTBOX).get("capabilityRequests", {})
    results = []
    started = time.monotonic()
    for key, row in rows.items():
        if len(results) >= limit or time.monotonic() - started >= budget_s:
            break
        request = row["record"]["capabilityRequests"][0]
        if request["status"] in {"denied", "expired", "superseded"} or request["delivery"]["status"] in {"denied", "confirmed"}:
            continue
        if not admit(2):
            break
        selected = _update(state, key, "delivery-select", now)
        if "request" not in selected:
            continue
        sent, receipt = None, None
        if not selected["readOnly"]:
            try:
                response = linear.gql(sync.COMMENT_MUTATION, {"id": row["issueId"], "b": row["body"]})
                errors = (response or {}).get("errors", [])
                rejected = any(error.get("extensions", {}).get("code") in
                             {"FORBIDDEN", "UNAUTHORIZED", "PERMISSION_DENIED", "AUTHENTICATION_ERROR"}
                             for error in errors)
                sent = {"status": "denied" if rejected else "unknown"}
            except Exception as error:
                # A timeout/disconnect is uncertain; never turn it into a known not-sent retry.
                sent = {"status": "denied" if denied(error) else "unknown"}
        if not sent or sent["status"] != "denied":
            try:
                comments = (linear.gql(READBACK, {"id": row["issueId"]}) or {}).get("issue", {}).get("comments", {})
                match = next((node for node in comments.get("nodes", [])
                              if node.get("body") == row["body"] and node.get("id")), None)
                if match:
                    receipt = {"requestId": key, "bindingDigest": key, "id": match["id"]}
                # Absence, including a truncated page, is never evidence that a send did not happen.
            except Exception as error:
                if denied(error):
                    sent = {"status": "denied", "mutationOutcome": "unknown"}
        result = _update(state, key, "delivery-settle", now, selected=selected, sent=sent, receipt=receipt)
        results.append({"key": key, **result})
    return results
