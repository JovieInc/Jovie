#!/usr/bin/env python3
"""Per-PR merge-group failure breaker.

2026-10-29: #23471 failed merge-group CI four times at four heads. Each failure re-formed every group
behind it (about 10 min of CI apiece) and a per-head breaker never tripped because the head kept
changing. Two merge-group CI failures for one PR within WINDOW_S dequeue it, label it `lane-fix-red`
(an admission hold label, so the enroll path will not re-enqueue it), and comment with the failing
check and its first error line. Failures count per PR head: a merge-group run that started before the
PR's current head existed belongs to an older head and is ignored, so a fix pushed after a trip never
inherits the old head's failures. The hold stays while the head is the one that failed (the sweep puts
the label back if the relay cleared it); when a new head is pushed the sweep removes `lane-fix-red`
itself, for PRs this breaker tripped only (a human or hold-contract label is never touched). State: queue-breaker.json, log:
queue-breaker.jsonl. HEADGREEN grouping (live 2026-10-29): only a group head's build gates the merge, so a failed
build of an entry that is still queued on that same synthetic commit did not eject it and is not counted. All GitHub access goes through the injected budgeted gh runner."""
from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

WINDOW_S, TRIP_FAILURES, STATE_KEEP_S, MAX_TRIPS_PER_TICK = 3 * 3600, 2, 24 * 3600, 2
STATE_FILE, LOG_FILE, HOLD_LABEL = "queue-breaker.json", "queue-breaker.jsonl", "lane-fix-red"
QUEUE_QUERY = ("query($o:String!,$r:String!){repository(owner:$o,name:$r){mergeQueue(branch:\"main\"){entries(first:50)"
               "{nodes{state headCommit{oid} pullRequest{id number headRefOid}}}}}}")
DEQUEUE = "mutation($id:ID!){dequeuePullRequest(input:{id:$id}){clientMutationId}}"
BRANCH = re.compile(r"^gh-readonly-queue/main/pr-(\d+)-")
AGGREGATORS = ("ci-fast", "PR Ready", "Product Lane Receipt")


def _epoch(value):
    try:
        return datetime.strptime(str(value), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()
    except ValueError:
        return None


def _gh(run, *args):
    done = run(list(args), capture_output=True, text=True, timeout=60)
    if done.returncode != 0:
        raise RuntimeError((done.stderr or done.stdout or f"exit {done.returncode}").strip()[-200:])
    return done.stdout


def failures_by_pr(runs: list[dict], now: float) -> dict[int, list[dict]]:
    """CI merge_group runs that failed inside the window, keyed by the PR the group branch names."""
    found: dict[int, list[dict]] = {}
    for row in runs:
        match = BRANCH.match(str(row.get("head_branch") or ""))
        ended = _epoch(row.get("updated_at"))
        if row.get("conclusion") != "failure" or not match or ended is None or not 0 <= now - ended <= WINDOW_S:
            continue
        found.setdefault(int(match[1]), []).append({"id": row["id"], "at": ended, "head": row.get("head_sha"),
                                                    "started": _epoch(row.get("created_at"))})
    return found


def head_since(run, repo: str, sha: str | None) -> float | None:
    """When the PR's current head commit was created; None when unknown (then nothing is discounted)."""
    if not sha:
        return None
    try:
        commit = json.loads(_gh(run, "api", f"repos/{repo}/commits/{sha}")).get("commit") or {}
    except (RuntimeError, ValueError):
        return None
    return _epoch((commit.get("committer") or {}).get("date"))


def current_head_failures(fails: list[dict], since: float | None) -> list[dict]:
    """Failures of the current head only: a group run that started before the head existed ran an older head."""
    if since is None:
        return fails
    return [f for f in fails if f.get("started") is None or f["started"] >= since]


def failing_check(run, repo: str, run_id: int) -> dict:
    """The first leaf job and step that failed (aggregators skipped) and its first error line."""
    jobs = json.loads(_gh(run, "api", f"repos/{repo}/actions/runs/{run_id}/jobs?per_page=100")).get("jobs") or []
    leaf = [job for job in jobs if job.get("conclusion") == "failure" and job.get("name") not in AGGREGATORS]
    job = (leaf or [job for job in jobs if job.get("conclusion") == "failure"] or [{}])[0]
    step = next((s.get("name") for s in job.get("steps") or [] if s.get("conclusion") == "failure"), None)
    line = None
    if job.get("id"):
        try:
            for text in _gh(run, "api", f"repos/{repo}/actions/jobs/{job['id']}/logs").splitlines():
                if "##[error]" in text:
                    line = text.split("##[error]", 1)[1].strip()[:240]
                    break
        except RuntimeError:
            pass
    return {"job": job.get("name"), "step": step, "line": line}


def sweep(state, run, now: float | None = None, repo: str = "JovieInc/Jovie") -> dict:
    now, state = time.time() if now is None else now, Path(state)
    owner, name = repo.split("/")
    out = {"tripped": [], "reblocked": [], "errors": []}
    try:
        saved = json.loads((state / STATE_FILE).read_text())
    except (OSError, ValueError):
        saved = {}
    saved = {k: v for k, v in saved.items() if now - v.get("at", 0) < STATE_KEEP_S}
    try:
        runs = json.loads(_gh(run, "api", f"repos/{repo}/actions/workflows/ci.yml/runs?event=merge_group&status=failure&per_page=100")).get("workflow_runs") or []
        queue = json.loads(_gh(run, "api", "graphql", "-f", f"query={QUEUE_QUERY}", "-f", f"o={owner}", "-f", f"r={name}"))
        entries = ((((queue.get("data") or {}).get("repository") or {}).get("mergeQueue") or {}).get("entries") or {}).get("nodes") or []
    except (RuntimeError, ValueError) as error:
        out["errors"].append(f"read: {error}")
        return out
    queued = {(e.get("pullRequest") or {}).get("number"): e["pullRequest"] for e in entries if e.get("pullRequest")}
    live_commits = {(e.get("pullRequest") or {}).get("number"): ((e.get("headCommit") or {}).get("oid") or "").lower()
                    for e in entries if e.get("pullRequest")}
    for number, fails in sorted(failures_by_pr(runs, now).items()):
        pr = queued.get(number)
        if len(fails) < TRIP_FAILURES or pr is None or len(out["tripped"]) >= MAX_TRIPS_PER_TICK:
            continue
        live = live_commits.get(number)
        fails = [f for f in fails if not live or str(f.get("head") or "").lower() != live]
        if len(fails) < TRIP_FAILURES:
            continue
        fails = current_head_failures(fails, head_since(run, repo, pr.get("headRefOid")))
        if len(fails) < TRIP_FAILURES:
            continue
        try:
            check = failing_check(run, repo, max(fails, key=lambda f: f["at"])["id"])
            _gh(run, "api", "graphql", "-f", f"query={DEQUEUE}", "-f", f"id={pr['id']}")
            marker = json.dumps({"code": "merge-group-breaker", "by": "lanes/queue_breaker", "failures": len(fails), "check": check.get("job")})
            body = (f"Dequeued from the merge queue: {len(fails)} merge-group CI failures in {WINDOW_S // 3600}h, each of which "
                    f"re-formed every group behind it. Failing check: `{check.get('job')}` / `{check.get('step')}`.\n"
                    f"First error: `{check.get('line')}`\n\nIt is held with `{HOLD_LABEL}` and will not be re-enqueued until its head changes "
                    f"and the check passes at PR time.\n<!-- queue-dequeue {marker} -->")
            for args in (("api", f"repos/{repo}/issues/{number}/comments", "-f", f"body={body}"),
                         ("api", f"repos/{repo}/issues/{number}/labels", "-f", f"labels[]={HOLD_LABEL}")):
                try:
                    _gh(run, *args)
                except RuntimeError as error:
                    out["errors"].append(f"#{number} {args[1].rsplit('/', 1)[-1]}: {error}")
            saved[str(number)] = {"head": pr.get("headRefOid"), "at": now, "check": check}
            out["tripped"].append(number)
            with open(state / LOG_FILE, "a") as log:
                log.write(json.dumps({"at": now, "pr": number, "failures": len(fails), "check": check, "head": pr.get("headRefOid"),
                                      "action": "dequeued+held"}) + "\n")
        except RuntimeError as error:
            out["errors"].append(f"#{number} trip: {error}")
    # Keep a tripped PR held while its head is unchanged: Source Validation passing on the same head is not a fix.
    for number, record in list(saved.items()):
        if str(number) in map(str, out["tripped"]):
            continue
        try:
            current = json.loads(_gh(run, "api", f"repos/{repo}/pulls/{number}"))
            if current.get("state") != "open":
                saved.pop(number, None)
                continue
            if (current.get("head") or {}).get("sha") != record.get("head"):
                # New head: the breaker's own hold is released. Only this label, and only for a PR it tripped.
                labels = [l.get("name") for l in current.get("labels") or []]
                if HOLD_LABEL in labels:
                    _gh(run, "api", "-X", "DELETE", f"repos/{repo}/issues/{number}/labels/{HOLD_LABEL}")
                saved.pop(number, None)
                out.setdefault("released", []).append(int(number))
                with open(state / LOG_FILE, "a") as log:
                    log.write(json.dumps({"at": now, "pr": int(number), "head": (current.get("head") or {}).get("sha"),
                                          "action": "released-new-head"}) + "\n")
            else:
                labels = [l.get("name") for l in current.get("labels") or []]
                if HOLD_LABEL not in labels:
                    _gh(run, "api", f"repos/{repo}/issues/{number}/labels", "-f", f"labels[]={HOLD_LABEL}")
                    out["reblocked"].append(int(number))
                    with open(state / LOG_FILE, "a") as log:
                        log.write(json.dumps({"at": now, "pr": int(number), "head": record.get("head"), "action": "reblocked-same-head"}) + "\n")
        except (RuntimeError, ValueError) as error:
            out["errors"].append(f"#{number} recheck: {error}")
    tmp = state / f".{STATE_FILE}.{os.getpid()}.tmp"
    tmp.write_text(json.dumps(saved, sort_keys=True))
    os.replace(tmp, state / STATE_FILE)
    return out
