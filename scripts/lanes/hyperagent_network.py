"""Network-access grants and the honest no-PR verdict for Hyperagent lane threads.

Hyperagent has no account allowlist and no create_thread option for domains: a sandbox
asks per thread ("Asked to access registry.npmjs.org") and the owner approves it. The
approvals API exposes that decision (`resolve_approval`, kind `network_access`), so the
lane that created a thread grants exactly the package registries `pnpm install` needs
(Tim, 2026-11-07) and nothing else. Every other domain, every other approval kind and
every other thread is left untouched for a human.

api-budget: hyperagent 30/hr - per awaiting-approval poll: one list_pending_approvals, then one get_pending_approval and one resolve_approval per allowed row (at most a handful per thread)
"""
import json
import re
import time
from pathlib import Path

ALLOWED_DOMAINS = frozenset({"registry.npmjs.org", "npm.jsr.io"})
MAX_GRANTS_PER_THREAD = 6  # a looping agent must not turn this into an open door

_ENV_BLOCKED = re.compile(
    r"ERR_PNPM_FETCH_40[13]|\b403 forbidden\b|(?:could(?:n't| ?not)|can(?:'t|not)|unable to|fail(?:ed)? to)\s+"
    r"(?:\w+\s+){0,3}(?:install|reach|access|fetch)|no network access|network access (?:denied|blocked)"
    r"|not shippable|sandbox (?:firewall|blocked)", re.I)


def missing_pr_reason(final_text):
    """`remote-env-blocked` when the agent says the sandbox could not install; else `remote-pr-missing`."""
    return "remote-env-blocked" if _ENV_BLOCKED.search(final_text or "") else "remote-pr-missing"


def grant_registry_access(call, thread, issue, journal_dir, clock=time.time):
    """Approve this thread's pending network requests for the two registries; return how many.

    Appends one JSON line per decision to hyperagent-network-grants.jsonl. Never raises: a
    failure here leaves the run in its normal awaiting-approval hold."""
    path = Path(journal_dir) / "hyperagent-network-grants.jsonl"
    try:
        rows = call("list_pending_approvals", {"limit": 50}).get("approvals", [])
        done = sum(1 for l in path.read_text().splitlines() if l.strip()
                   and json.loads(l).get("threadId") == thread and json.loads(l).get("decision") == "approve") if path.exists() else 0
    except Exception:
        return 0
    granted = 0
    for row in rows:
        if not (isinstance(row, dict) and row.get("kind") == "network_access" and row.get("threadId") == thread):
            continue
        domain = row.get("domain")
        entry = {"at": clock(), "issue": issue, "threadId": thread, "approvalId": row.get("approvalId"), "domain": domain}
        try:
            if domain not in ALLOWED_DOMAINS or (row.get("payload") or {}).get("domain", domain) != domain:
                entry["decision"] = "refused-domain-not-allowed"
            elif done + granted >= MAX_GRANTS_PER_THREAD:
                entry["decision"] = "refused-grant-limit"
            else:
                full = call("get_pending_approval", {"kind": "network_access", "approvalId": row["approvalId"]})
                review = full.get("review") or {}
                args = {"kind": "network_access", "approvalId": row["approvalId"], "decision": "approve"}
                if review.get("reviewToken"):
                    args["reviewToken"] = review["reviewToken"]
                if review.get("domain") != domain:
                    entry["decision"] = "refused-domain-mismatch"
                else:
                    call("resolve_approval", args)
                    entry["decision"] = "approve"
                    granted += 1
        except Exception as error:
            entry["decision"] = "error"
            entry["error"] = str(error)[:200]
        with path.open("a") as out:
            out.write(json.dumps(entry) + "\n")
    return granted
