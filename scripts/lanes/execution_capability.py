"""Capability checkpoint in the accepted execution ledger, before a dispatch boundary."""
import json
import shutil
import subprocess

import capability_outbox
import execution_attempt as execution
import linear_sync


def checkpoint(path, ident, fence, owner, job, requirements, observations, *, now, coordination,
               resolution=None, probe=None):
    def decide(all_rows):
        rows = execution._for(all_rows, ident)
        start = next((row for row in reversed(rows) if row["event"] == "attempt_started"
                      and row.get("fencingToken") == fence), None)
        if (not start or start["owner"] != owner or start["leaseExpiresAt"] <= now
                or any(row.get("terminalState") in execution.TERMINAL
                       or row.get("event") == "completion_fenced"
                       or row.get("event") == "attempt_finished" and row.get("fencingToken") == fence
                       for row in rows)):
            return {"allowed": False, "reason": "accepted-custody-required"}, []
        if any(row["event"] == "boundary_admitted" and row.get("fencingToken") == fence for row in rows):
            return {"allowed": False, "reason": "execution-readback-required"}, []
        prior = next((row.get("capability") for row in reversed(rows)
                      if row.get("fencingToken") == fence and row.get("capability")), None)
        record = json.loads(json.dumps(prior)) if prior else {"job": job, "execution": {"outcome": "not-started"}}
        # Re-read by the same coordinator that accepted the attempt; never use a local issue claim.
        record["custody"] = {"accepted": True, "owner": owner["owner"], "lease": fence,
                             "head": record["job"]["head"], "observedAt": linear_sync._iso(now),
                             "expiresAt": linear_sync._iso(start["leaseExpiresAt"])}
        result = capability_outbox.transition({"op": "checkpoint", "record": record, "job": job,
                                              "requirements": requirements, "observations": observations,
                                              "nowMs": now * 1000, "resolution": resolution, "probe": probe})
        decision = {**result["result"], "record": result["record"], "messages": result.get("messages", [])}
        if not result["record"].get("capabilityRequests"):
            return decision, []
        if prior and {**prior, "custody": result["record"]["custody"]} == result["record"]:
            return decision, []  # repeated observations do not append another pending episode
        # A reservation has the coordinator's admitted readback fence as well as the capability CAS.
        if decision["allowed"]:
            decision["admitted"] = True
        event = {**ident, "schema": execution.SCHEMA, "event": "capability_checkpoint", "at": now,
                 "attempt": start["attempt"], "fencingToken": fence, "capability": result["record"]}
        return decision, [event]
    return execution._locked(path, ident, coordination, decide, now=now)


def before_local_dispatch(runner, host, name, spec, issue, receipt, ident, claimed, coordination):
    """The concrete initial adapter checks the configured executable before checkout/install/spend."""
    command = (spec.get("cmd") or [None])[0]
    if isinstance(command, str) and shutil.which(command):
        return None
    head = subprocess.run(["git", "rev-parse", "origin/main"], cwd=host.repo, text=True,
                          capture_output=True, timeout=10, check=True).stdout.strip()
    job = {"id": receipt["runId"], "head": head, "action": "issue-dispatch", "principal": name,
           "linearIssueId": issue.id,
           "environment": runner.HOST, "owner": claimed["owner"]["owner"],
           "policyRevision": execution.digest({"spec": spec, "identity": ident})}
    requirement = {"kind": "tool", "capability": command or "provider-command", "scope": name}
    result = checkpoint(host.state / "runs" / "execution-attempts.jsonl", ident, claimed["fencingToken"],
                        claimed["owner"], job, [requirement], {}, now=runner.time.time(), coordination=coordination)
    if result.get("record"):
        # Original run, branch, worktree and artifacts stay in the existing run receipt.
        receipt["capability"] = result["record"]
        capability_outbox.enqueue(host.state, issue.id, result["record"], result["messages"])
    receipt.update(verdict="capability-blocked", reasons=[result.get("reason", "resolve-required-capability")],
                   endedAt=runner.now_iso(), result={"verdict": "capability-blocked", "pr": None, "commit": None})
    runner.append_json_object(host.state / "runs" / "ledger.jsonl", receipt)
    return receipt


def finish_admission(runner, host, name, spec, issue, linear, receipt, ident, coordination):
    """Finish the existing claim/cloud gate before the local capability preflight."""
    runs = host.state / "runs"
    claimed = receipt.get("execution")
    if not receipt.get("verdict") and not claimed["admitted"]:
        receipt.update(verdict="duplicate-active" if claimed["reason"] == "duplicate_active" else "quarantined",
                       reasons=[claimed["reason"]])
    if receipt.get("verdict"):
        verdict = receipt["verdict"]
        receipt.update(endedAt=runner.now_iso(),
                       result={"verdict": verdict, "commit": None, "pr": None, "prUrl": None})
        runner.append_json_object(runs / "ledger.jsonl", receipt)
        return receipt
    cloud = runner.cloud_lane_dispatch.execution_gate(runner, host, issue, linear, name, claimed)
    if cloud is not None:
        return runner.cloud_lane_dispatch.record_receipt(runner, runs, receipt, cloud)
    try:
        capability_hold = before_local_dispatch(
            runner, host, name, spec, issue, receipt, ident, claimed, coordination)
    except (OSError, ValueError, subprocess.SubprocessError, RuntimeError) as error:
        # Unknown adapter/transport state is not a product failure or permission to dispatch.
        receipt.update(verdict="capability-blocked", reasons=[f"capability-adapter-unavailable:{type(error).__name__}"],
                       endedAt=runner.now_iso(), result={"verdict": "capability-blocked", "pr": None, "commit": None})
        runner.append_json_object(runs / "ledger.jsonl", receipt)
        capability_hold = receipt
    if capability_hold is not None:
        return capability_hold


def release_blocked(slot, verdict):
    """Retain the original run/fence/request without spending issue or provider retries."""
    if verdict != "capability-blocked":
        return False
    slot.release()
    return True
