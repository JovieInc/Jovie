"""Bounded remote provider adapter used by the existing lane runner.

The installed Hyperagent CLI supplies transport, not model/cap/repository proof.
Its list_agents API currently lacks those fields. An owner-verified settings
readback is required; missing proof leaves this disabled lane held. Receipts
live in the existing runs directory, and unknown creation outcomes never retry.
"""
import fcntl
import hashlib
import json
import math
import os
import re
import time
from pathlib import Path

REPO = "JovieInc/Jovie"


def verified(spec, now):
    proof = spec.get("verifiedRemote") or {}
    if not isinstance(proof, dict):
        return False
    number = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
    return (isinstance(proof.get("agentId"), str) and bool(proof["agentId"])
            and proof.get("model") == spec.get("model") and proof.get("model") not in (None, "auto")
            and proof.get("repository") == REPO and proof.get("currentInstructions") is True
            and proof.get("source") == "hyperagent-settings-readback"
            and isinstance(proof.get("evidenceSha256"), str) and re.fullmatch(r"[a-f0-9]{64}", proof["evidenceSha256"]) is not None
            and proof.get("executionMode") == "auto" and proof.get("allInCap") is True
            and all(number(proof.get(k)) for k in ("balanceUsd", "maxCostUsd", "verifiedAt", "expiresAt"))
            and 0 < proof["maxCostUsd"] <= proof["balanceUsd"]
            and 0 <= now - proof["verifiedAt"] <= 300 and now < proof["expiresAt"])


def failure(error):
    text = str(error).lower()
    if any(word in text for word in ("oauth", "401", "invalid_grant")):
        return "remote-oauth-expired"
    if any(word in text for word in ("quota", "402", "insufficient credit")):
        return "remote-quota-exhausted"
    return "remote-read-unavailable"


def run(spec, issue, attempt, branch, prompt, receipt_path, call, find_pr, gate,
        timeout=1800, clock=time.time, pause=time.sleep, before_dispatch=lambda: None):
    """One existing attempt: create once, read/resume its thread, gate its same PR.

    Settings proof must be refreshed even on resume. The file lock spans the
    bounded attempt; a concurrent invocation cannot dispatch or adopt twice.
    Approval and timeout only pause polling; neither cancels a remote job.
    """
    held = lambda reason, thread=None: {"verdict": "remote-held", "reasons": [reason],
                                       "remoteThreadId": thread, "next_action": "reconcile-existing-remote-attempt"}
    if not verified(spec, clock()):
        return held("remote-preflight-unverified")
    proof = spec["verifiedRemote"]
    binding = {"issue": issue, "attempt": attempt, "agentId": proof["agentId"], "model": spec["model"],
               "repository": REPO, "branch": branch}
    # Public attribution does not expose the private execution fencing token.
    marker = f"<!-- hyperagent-attempt-id:{hashlib.sha256(attempt.encode()).hexdigest()} -->"
    path = Path(receipt_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+") as journal:
        try:
            fcntl.flock(journal, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return held("remote-attempt-active")
        journal.seek(0)
        try:
            rows = [json.loads(line) for line in journal if line.strip()]
            state = rows[-1] if rows else {}
            if state and state.get("binding") != binding:
                return held("remote-receipt-attribution-mismatch")
        except (ValueError, AttributeError):
            return held("remote-receipt-unreadable")

        def save(**changes):
            state.update(binding=binding, **changes)
            journal.seek(0, os.SEEK_END)
            journal.write(json.dumps(state) + "\n")
            journal.flush()
            os.fsync(journal.fileno())

        thread = state.get("threadId")
        if state.get("result"):
            return state["result"]
        if state.get("gateIntent"):
            return held("remote-gate-outcome-unknown", thread)
        if state.get("intent") and not thread:
            return held("remote-create-outcome-unknown")
        try:
            if not state:
                save()
            agents = call("list_agents", {}).get("agents", [])
            live = next((a for a in agents if a.get("id") == proof["agentId"]), {})
            if live.get("executionMode") != proof["executionMode"]:
                return held("remote-agent-identity-unverified", thread)
            if not thread:
                # The intent is durable BEFORE transport. A lost response can
                # therefore never turn into a second paid create_thread call.
                before_dispatch()
                save(intent=True)
                try:
                    created = call("create_thread", {"agentId": proof["agentId"],
                        "message": prompt + f"\nUse branch {branch}. Include <!-- linear-issue-id:{issue} --> and "
                        f"{marker} in the PR body. Return the PR URL and head: FULL_SHA.",
                        "namingHint": f"{issue} {hashlib.sha256(attempt.encode()).hexdigest()[:16]}"})
                    thread = created.get("threadId") or created.get("thread_id") or (created.get("thread") or {}).get("id")
                    if not isinstance(thread, str) or not thread:
                        return held("remote-create-outcome-unknown")
                    save(threadId=thread)
                except Exception:
                    return held("remote-create-outcome-unknown")
            deadline = clock() + timeout
            while clock() < deadline:
                payload = call("get_thread", {"threadId": thread, "messageLimit": 50})
                identity = payload.get("thread") or {}
                if identity.get("id") != thread or identity.get("namedAgentId") != proof["agentId"]:
                    return held("remote-thread-attribution-mismatch", thread)
                if type(payload.get("isRunning")) is not bool or type(payload.get("awaitingApproval")) is not bool:
                    return held("remote-status-unverified", thread)
                if payload["awaitingApproval"]:
                    return held("remote-approval-required", thread)
                if payload["isRunning"]:
                    pause(min(4, max(0, deadline - clock())))
                    continue
                messages = payload.get("messages")
                if not isinstance(messages, list):
                    return held("remote-status-unverified", thread)
                text = "\n".join(m["content"] for m in messages if isinstance(m, dict)
                                 and m.get("role") == "assistant" and isinstance(m.get("content"), str))
                urls = set(re.findall(r"https://github\.com/[^\s/]+/[^\s/]+/pull/\d+", text))
                if len(urls) != 1:
                    return held("remote-pr-ambiguous" if urls else "remote-pr-missing", thread)
                url = urls.pop()
                if not re.fullmatch(r"https://github\.com/JovieInc/Jovie/pull/\d+", url):
                    return held("remote-pr-attribution-mismatch", thread)
                pr = find_pr(int(url.rsplit("/", 1)[1]))
                heads = set(re.findall(r"\bhead:\s*([a-f0-9]{40})\b", text))
                issue_pattern = rf"(?<![A-Za-z0-9]){re.escape(issue)}(?![A-Za-z0-9])"
                if (pr.get("url") != url or pr.get("state") != "OPEN" or pr.get("headRefName") != branch
                    or not re.search(issue_pattern, pr.get("title", ""))
                    or f"<!-- linear-issue-id:{issue} -->" not in pr.get("body", "")
                    or marker not in pr.get("body", "")
                    or heads != {pr.get("headRefOid")}):
                    return held("remote-pr-attribution-mismatch", thread)
                if not verified(spec, clock()):
                    return held("remote-preflight-unverified", thread)
                save(gateIntent=True, headSha=pr["headRefOid"])
                result = {**gate(pr), "remoteThreadId": thread, "remoteAgentId": proof["agentId"],
                          "modelSettingsProof": proof["model"]}
                save(result=result)
                return result
            return held("remote-running-timeout", thread)
        except Exception as error:
            return held(failure(error), thread)
