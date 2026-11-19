"""No-abandon router: one red/dequeue/review event on a PR -> lease + the right worker, in the same event.

Called from Lane Fix Relay (the one topology-approved remediation dispatcher) after its label step.
Kill switch: NOABANDON_ENABLED != "true" -> exit 0 before any API call. Every GitHub call goes through
the injected `gh(args) -> (rc, stdout)` so tests run with a fake and production uses the repo's
budgeted client (`python3 -m apiclient gh --priority repair -- ...`). Linear delivery goes through the
shared apiclient LinearClient with the SAME LINEAR_API_KEY secret linear-sync-on-merge.yml uses — the
external-api guard keeps provider hosts inside scripts/apiclient, and no new secret is added.

Calls per event (budget): 1 comments read, 1 jobs read, <=3 annotation reads, 1 workflow-state read,
1 files read, 1 comment write, <=1 label write (only when a new lease is granted), <=1 dispatch.
No polling: lease expiry of OTHER items is checked lazily by invariant.py on the same wake, bounded
to 20 items.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from noabandon import ledger as L  # noqa: E402

INFRA_HINTS = ("lost communication with the server", "runner has received a shutdown signal",
               "The operation was canceled", "No space left on device", "rate limit", "502 Bad Gateway")
SWARM_WORKFLOW = "pr-remediation-swarm.yml"
LEASE_LABEL = "noabandon-leased"
GITHUB_LANES = frozenset({"swarm", "deterministic", "lanes"})  # delivered by dispatch or the existing label
ITEM_KEY = re.compile(r"\b((?:JOV|LYB|SYM)-\d+)\b", re.I)


def budgeted_gh(args: list[str]) -> tuple[int, str]:
    """gh through the shared ledger, in-process (the external-api guard bans gh subprocesses outside
    scripts/apiclient). run_gh classifies the call, budgets it at repair priority and strips the
    `--include` header block, so callers see exactly (code, body)."""
    from apiclient.gh import run_gh
    result = run_gh(args, priority="repair")
    return int(result.get("code", 1)), result.get("stdout", "")


def _json(gh, args, default):
    rc, out = gh(args)
    if rc != 0:
        return default
    try:
        return json.loads(out or "null") or default
    except ValueError:
        return default


def find_lease(gh, repo: str, pr: int) -> tuple[int | None, dict | None]:
    comments = _json(gh, ["api", f"repos/{repo}/issues/{pr}/comments?per_page=100"], [])
    for c in reversed(comments):
        lease = L.parse_lease(c.get("body"))
        if lease:
            return c.get("id"), lease
    return None, None


def failing(gh, repo: str, run_id: int, merge_base: str) -> list[dict]:
    jobs = _json(gh, ["api", f"repos/{repo}/actions/runs/{run_id}/jobs?filter=latest&per_page=100"], {})
    out = []
    for job in (jobs.get("jobs") or []):
        if job.get("conclusion") not in ("failure", "timed_out"):
            continue
        first = ""
        if len(out) < 3:
            notes = _json(gh, ["api", f"repos/{repo}/check-runs/{job.get('id')}/annotations?per_page=5"], [])
            first = next((n.get("message", "") for n in notes if n.get("annotation_level") == "failure"), "")
        out.append({"check": job.get("name", ""), "run_id": run_id, "job_id": job.get("id"),
                    "log_url": job.get("html_url"), "extract": first,
                    "sig": L.signature(job.get("name", ""), first, merge_base)})
    return out


def receivers(gh, repo: str) -> dict:
    wf = _json(gh, ["api", f"repos/{repo}/actions/workflows/{SWARM_WORKFLOW}"], {})
    return {"swarm": wf.get("state") == "active" and os.environ.get("SWARM_ENABLED", "true") == "true"}


def deterministic_action(event: dict, fails: list[dict]) -> list[str] | None:
    """$0 fixes only: rerun an infra-shaped first failure once; update a BEHIND branch. Else None."""
    repo, pr = event["repo"], event["pr"]
    if event.get("mergeable_state") == "behind":
        return ["api", "-X", "PUT", f"repos/{repo}/pulls/{pr}/update-branch", "-f", f"expected_head_sha={event['head']}"]
    if int(event.get("run_attempt") or 1) < 2 and fails and all(
            any(h.lower() in (f.get("extract") or "").lower() for h in INFRA_HINTS) for f in fails):
        return ["api", "-X", "POST", f"repos/{repo}/actions/runs/{event['run_id']}/rerun-failed-jobs"]
    return None


def item_key(*texts: str) -> str | None:
    for text in texts:
        match = ITEM_KEY.search(text or "")
        if match:
            return match.group(1).upper()
    return None


def notify(item: str, handoff: dict, post=None) -> str:
    """Linear-first bus (Tim 9:38): the handoff lands as a comment on the item, where Symphony, Eve Runtime
    Owner/Codex and Hyperagent lanes already read. No key or no item -> 'skipped:<why>' in the receipt, and
    the invariant reports the item; it is never treated as delivered. Production transport is the shared
    apiclient LinearClient (same LINEAR_API_KEY secret linear-sync-on-merge.yml uses; external-api guard:
    no provider host outside scripts/apiclient)."""
    key = os.environ.get("LINEAR_API_KEY")
    if not key or not ITEM_KEY.fullmatch(item or ""):
        return "skipped:" + ("no-key" if not key else "no-item")
    body = "noabandon handoff\n```json\n" + json.dumps(handoff, indent=1, sort_keys=True)[:12000] + "\n```"
    query = ("mutation($id:String!,$body:String!){commentCreate(input:{issueId:$id,body:$body}){success}}")
    try:
        if post is None:
            from apiclient import LinearClient
            data = LinearClient(key, lambda rejected=None: key).graphql(query, {"id": item, "body": body})
        else:
            data = ((post(json.dumps({"id": item, "body": body}).encode()) or {}).get("data"))
        ok = ((data or {}).get("commentCreate") or {}).get("success")
    except Exception as error:  # delivery failure is reported, never raised into the relay
        return f"error:{type(error).__name__}"
    return "ok" if ok else "error:not-success"


def write_lease(gh, repo: str, pr: int, comment_id: int | None, lease: dict) -> bool:
    body = L.render_lease(lease)
    if comment_id:
        rc, _ = gh(["api", "-X", "PATCH", f"repos/{repo}/issues/comments/{comment_id}", "-f", f"body={body}"])
    else:
        rc, _ = gh(["api", "-X", "POST", f"repos/{repo}/issues/{pr}/comments", "-f", f"body={body}"])
    return rc == 0


def ensure_label(gh, repo: str, pr: int, label: str = LEASE_LABEL) -> bool:
    """PR-4b's relay sweep finds leased PRs by this label; added once per grant, idempotent."""
    rc, _ = gh(["api", "-X", "POST", f"repos/{repo}/issues/{pr}/labels", "-f", f"labels[]={label}"])
    return rc == 0


def route(event: dict, gh, now: float | None = None, cooldowns: dict | None = None) -> dict:
    """Decide and act for one event. Returns a receipt (also printed as one JSON line)."""
    now = time.time() if now is None else now
    repo, pr, head = event["repo"], event["pr"], event["head"]
    comment_id, lease = find_lease(gh, repo, pr)
    fails = failing(gh, repo, event["run_id"], event.get("merge_base", "")) if event.get("run_id") else []
    sig = fails[0]["sig"] if fails else L.signature(event.get("kind", "event"), event.get("reason", ""))
    origin = L.original_lane(event.get("branch", ""), event.get("body", ""))
    if event.get("paths") is None:  # one read; sensitive paths skip the cheap model rungs
        files = _json(gh, ["api", f"repos/{repo}/pulls/{pr}/files?per_page=100"], [])
        event = {**event, "paths": [f.get("filename", "") for f in files]}
    if lease and lease.get("holder_lane") and lease.get("head_sha") == head and fails:
        lease = L.record_attempt(lease, {"lane": lease["holder_lane"], "sig": sig, "head": head,
                                         "outcome": "red", "at": now})
    enabled = receivers(gh, repo)
    lane = L.next_rung(lease, origin=origin, head=head, sig=sig, is_sensitive=L.sensitive(event.get("paths")),
                       cooldowns=cooldowns or {}, now=now, receivers_enabled=enabled)
    action = None
    if lane == "deterministic":
        action = deterministic_action(event, fails)
        if action is None:  # not $0-fixable: this rung is spent for (head, sig), move on now
            lease = L.record_attempt(lease or {}, {"lane": "deterministic", "sig": sig, "head": head,
                                                   "outcome": "n/a", "at": now})
            lane = L.next_rung(lease, origin=origin, head=head, sig=sig,
                               is_sensitive=L.sensitive(event.get("paths")), cooldowns=cooldowns or {}, now=now,
                               receivers_enabled=enabled)
    if lane == "swarm":
        action = ["api", f"repos/{repo}/dispatches", "-f", "event_type=swarm-remediate",
                  "-f", f"client_payload[pr]={pr}", "-f", f"client_payload[sha]={head}"]
    holder_changed = not lease or lease.get("holder_lane") != lane or lease.get("released")
    new = L.grant(lease, lane=lane, worker_id=f"{lane}:{event.get('branch', '')}", head=head, now=now,
                  next_kind="ci_result", item=event.get("item") or f"{repo}#{pr}", pr=pr) if holder_changed else \
        dict(lease, next_event={"kind": "ci_result", "due_at": now + L.TTL_S.get(lane, 7200)})
    new["handoff"] = L.handoff(item=new["item"], repo=repo, pr=pr, head=head, base=event.get("merge_base", ""),
                               lease=new, frm={"lane": (lease or {}).get("holder_lane"), "reason": event.get("kind")},
                               to_lane=lane, failing=fails, usd_left_today=None)
    new["handoff"]["failing"] = [{k: v for k, v in f.items() if k != "extract"} for f in fails]  # keep comment small
    ok = write_lease(gh, repo, pr, comment_id, new)
    labeled = ensure_label(gh, repo, pr) if (ok and holder_changed) else None
    acted = gh(action)[0] == 0 if (action and ok) else None
    receipt = {"pr": pr, "head": head, "sig": sig, "lane": lane, "epoch": new["epoch"], "lease_written": ok,
               "labeled": labeled,
               "action": action[2] if action and len(action) > 2 else (action[1] if action else None),
               "acted": acted, "swarm_receiver_enabled": enabled.get("swarm"),
               "delivery": "github" if lane in GITHUB_LANES else "linear"}
    if receipt["delivery"] == "linear" and holder_changed:
        receipt["linear"] = notify(new["item"], new["handoff"])
    print(json.dumps({"schema": "noabandon.route-receipt/v1", **receipt}, sort_keys=True))
    return receipt


def event_from_env() -> dict | None:
    path = os.environ.get("GITHUB_EVENT_PATH")
    if not path:
        return None
    ev = json.load(open(path))
    run = ev.get("workflow_run") or {}
    prs = run.get("pull_requests") or []
    if run and prs and run.get("conclusion") in ("failure", "timed_out"):
        return {"repo": os.environ["GITHUB_REPOSITORY"], "pr": prs[0]["number"], "head": run["head_sha"],
                "branch": run.get("head_branch", ""), "run_id": run["id"], "run_attempt": run.get("run_attempt"),
                "kind": "ci_red", "merge_base": prs[0].get("base", {}).get("sha", ""),
                "item": item_key(run.get("display_title", ""), run.get("head_branch", ""))}
    pr = ev.get("pull_request") or {}
    if pr and (ev.get("action") == "dequeued" or (ev.get("review") or {}).get("state") == "changes_requested"):
        return {"repo": os.environ["GITHUB_REPOSITORY"], "pr": pr["number"], "head": pr["head"]["sha"],
                "branch": pr["head"]["ref"], "body": pr.get("body") or "", "run_id": None,
                "kind": "dequeued" if ev.get("action") == "dequeued" else "review",
                "reason": ev.get("reason") or "", "merge_base": pr.get("base", {}).get("sha", ""),
                "item": item_key(pr.get("title", ""), pr["head"]["ref"]),
                "paths": None}
    return None


def main() -> int:
    if os.environ.get("NOABANDON_ENABLED") != "true":
        print("noabandon: disabled (NOABANDON_ENABLED != true)")
        return 0
    event = event_from_env()
    if not event:
        print("noabandon: not a routable event")
        return 0
    route(event, budgeted_gh)
    return 0


if __name__ == "__main__":
    sys.exit(main())
