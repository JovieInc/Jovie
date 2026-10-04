"""Bounded remote provider adapter used by the existing lane runner.

The installed Hyperagent CLI supplies transport, not model/cap/repository proof.
Its list_agents API exposes only id, name and execution mode, so the proof joins
two sources (JOV-7706): a live list_agents identity readback on every attempt, and
the owner's settings attestation on the host (model, repository, current
instructions, all-in cap, balance), which expires. Missing or expired attestation,
or a live identity that no longer matches, leaves the lane held and unhealthy.
Receipts live in the existing runs directory; unknown creation outcomes never retry.

  hyperagent_lane.py health   # exit 0 when a fresh proof can be built right now
"""
import fcntl
import hashlib
import json
import math
import os
import re
import sys
import time
from pathlib import Path

REPO = "JovieInc/Jovie"
PROOF_SOURCES = ("hyperagent-settings-readback", "hyperagent-identity+owner-attestation")
PROOF_TTL_S = 300
ATTESTATION = Path(os.environ.get("HYPERAGENT_LANE_ATTESTATION",
                                  Path.home() / ".config/jovie-lanes/hyperagent-attestation.json"))


def verified(spec, now):
    proof = spec.get("verifiedRemote") or {}
    if not isinstance(proof, dict):
        return False
    number = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
    return (isinstance(proof.get("agentId"), str) and bool(proof["agentId"])
            and proof.get("model") == spec.get("model") and proof.get("model") not in (None, "auto")
            and proof.get("repository") == REPO and proof.get("currentInstructions") is True
            and proof.get("source") in PROOF_SOURCES
            and isinstance(proof.get("evidenceSha256"), str) and re.fullmatch(r"[a-f0-9]{64}", proof["evidenceSha256"]) is not None
            and proof.get("executionMode") == "auto" and proof.get("allInCap") is True
            and all(number(proof.get(k)) for k in ("balanceUsd", "maxCostUsd", "verifiedAt", "expiresAt"))
            and 0 < proof["maxCostUsd"] <= proof["balanceUsd"]
            and 0 <= now - proof["verifiedAt"] <= PROOF_TTL_S and now < proof["expiresAt"])


def refresh_proof(spec, call, now, attestation=None):
    """Build `verifiedRemote` from a live identity read plus the owner's attestation.

    Returns (proof, None) or (None, reason). The live agent must be the configured id,
    name and `auto` mode; the attestation must name the same agent and model, this
    repository, current instructions and an all-in cap that fits the balance.
    """
    try:
        owner = json.loads(Path(ATTESTATION if attestation is None else attestation).read_text())
    except FileNotFoundError:
        return None, "owner-attestation-missing"
    except (OSError, ValueError):
        return None, "owner-attestation-unreadable"
    if not isinstance(owner, dict):
        return None, "owner-attestation-unreadable"
    number = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
    if not (number(owner.get("expiresAt")) and now < owner["expiresAt"]):
        return None, "owner-attestation-expired"
    if owner.get("agentId") != spec.get("agentId") or owner.get("model") != spec.get("model"):
        return None, "owner-attestation-mismatch"
    try:
        agents = call("list_agents", {}).get("agents", [])
    except Exception as error:
        return None, failure(error)
    live = next((a for a in agents if isinstance(a, dict) and a.get("id") == spec.get("agentId")), None)
    if live is None or live.get("name") != spec.get("agentName"):
        return None, "remote-agent-identity-unverified"
    if live.get("executionMode") != "auto":
        return None, "remote-agent-not-auto"
    evidence = json.dumps({"live": live, "owner": owner}, sort_keys=True).encode()
    proof = {"agentId": live["id"], "model": owner.get("model"), "repository": owner.get("repository"),
             "currentInstructions": owner.get("currentInstructions"), "allInCap": owner.get("allInCap"),
             "balanceUsd": owner.get("balanceUsd"), "maxCostUsd": owner.get("maxCostUsd"),
             "executionMode": live["executionMode"], "source": PROOF_SOURCES[1],
             "evidenceSha256": hashlib.sha256(evidence).hexdigest(),
             "verifiedAt": now, "expiresAt": min(now + PROOF_TTL_S, owner["expiresAt"])}
    spec = {**spec, "verifiedRemote": proof}
    return (proof, None) if verified(spec, now) else (None, "owner-attestation-incomplete")


def main(argv=None, call=None, clock=time.time):
    """`health`: the providers.json probe. Builds the same proof a run would use."""
    import runpy
    import shutil
    args = sys.argv[1:] if argv is None else argv
    if args[:1] != ["health"]:
        print("usage: hyperagent_lane.py health", file=sys.stderr)
        return 2
    spec = json.loads((Path(__file__).resolve().parent / "providers.json").read_text())["hyperagent"]
    if call is None:
        executable = shutil.which("hyperagent")
        if not executable:
            print("available: false reason=transport-missing")
            return 1
        try:
            call = runpy.run_path(executable)["mcp_call"]
        except (Exception, SystemExit):
            print("available: false reason=transport-unreadable")
            return 1
    proof, reason = refresh_proof(spec, call, clock())
    if proof is None:
        print(f"available: false reason={reason}")
        return 1
    print(f"available: true agent={spec.get('agentName')} model={proof['model']} "
          f"cap={proof['maxCostUsd']} balance={proof['balanceUsd']}")
    return 0


def failure(error):
    text = str(error).lower()
    if any(word in text for word in ("oauth", "401", "invalid_grant")):
        return "remote-oauth-expired"
    if any(word in text for word in ("quota", "402", "insufficient credit")):
        return "remote-quota-exhausted"
    return "remote-read-unavailable"


def run(spec, issue, attempt, branch, prompt, receipt_path, call, find_pr, gate,
        timeout=1800, clock=time.time, pause=time.sleep, before_dispatch=lambda: None, refresh=None):
    """One existing attempt: create once, read/resume its thread, gate its same PR.

    Settings proof must be refreshed even on resume. The file lock spans the
    bounded attempt; a concurrent invocation cannot dispatch or adopt twice.
    Approval and timeout only pause polling; neither cancels a remote job.
    `refresh(spec, now)` rebuilds an expired proof; a long remote run outlives its TTL.
    """
    def fresh(current):
        if verified(current, clock()) or refresh is None:
            return current
        proof, _reason = refresh(current, clock())
        return {**current, "verifiedRemote": proof} if proof else current
    spec = fresh(spec)
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
                spec = fresh(spec)
                if not verified(spec, clock()) or spec["verifiedRemote"]["agentId"] != proof["agentId"]:
                    return held("remote-preflight-unverified", thread)
                save(gateIntent=True, headSha=pr["headRefOid"])
                result = {**gate(pr), "remoteThreadId": thread, "remoteAgentId": proof["agentId"],
                          "modelSettingsProof": proof["model"]}
                save(result=result)
                return result
            return held("remote-running-timeout", thread)
        except Exception as error:
            return held(failure(error), thread)


if __name__ == "__main__":
    sys.exit(main())
