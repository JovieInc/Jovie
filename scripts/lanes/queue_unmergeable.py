#!/usr/bin/env python3
"""Dequeue merge-queue entries that sit UNMERGEABLE, comment why, and route the PR to the lanes.

2026-10-29: #23519 sat UNMERGEABLE at position 3 for 3 hours and stalled the queue behind it until a
human dequeued it. An UNMERGEABLE entry cannot merge until its branch changes, so waiting is pure
loss. After GRACE_S observed UNMERGEABLE the entry is dequeued, a machine-readable comment says why,
and `lane-fix-conflict` hands it to the conflict lane. Every action is appended to
queue-unmergeable.jsonl. Reads and writes go through the injected gh runner (the budgeted client)."""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

GRACE_S, MAX_PER_TICK, SEEN_FILE, LOG_FILE = 600, 3, "queue-unmergeable.json", "queue-unmergeable.jsonl"
QUERY = ("query($o:String!,$r:String!){repository(owner:$o,name:$r){mergeQueue(branch:\"main\"){entries(first:50)"
         "{nodes{state position pullRequest{id number headRefOid}}}}}}")
DEQUEUE = "mutation($id:ID!){dequeuePullRequest(input:{id:$id}){clientMutationId}}"
ROUTE_LABEL = "lane-fix-conflict"


def _gh(run, *args):
    done = run(list(args), capture_output=True, text=True, timeout=60)
    if done.returncode != 0:
        raise RuntimeError((done.stderr or done.stdout or f"exit {done.returncode}").strip()[-200:])
    return done.stdout


def _write(path: Path, payload: dict) -> None:
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(payload, sort_keys=True))
    os.replace(tmp, path)


def sweep(state, run, now: float | None = None, repo: str = "JovieInc/Jovie") -> dict:
    """One pass. Returns {"seen": [...], "dequeued": [...], "errors": [...]}."""
    now, state = time.time() if now is None else now, Path(state)
    owner, name = repo.split("/")
    out = {"seen": [], "dequeued": [], "errors": []}
    try:
        data = json.loads(_gh(run, "api", "graphql", "-f", f"query={QUERY}", "-f", f"o={owner}", "-f", f"r={name}"))
        entries = ((((data.get("data") or {}).get("repository") or {}).get("mergeQueue") or {}).get("entries") or {}).get("nodes") or []
    except (RuntimeError, ValueError) as error:
        out["errors"].append(f"read: {error}")
        return out
    try:
        first_seen = json.loads((state / SEEN_FILE).read_text())
    except (OSError, ValueError):
        first_seen = {}
    current = {}
    for entry in entries:
        pr = entry.get("pullRequest") or {}
        if entry.get("state") != "UNMERGEABLE" or not pr.get("number"):
            continue
        key = f"{pr['number']}@{pr.get('headRefOid')}"
        current[key] = first_seen.get(key, now)
        out["seen"].append({"pr": pr["number"], "position": entry.get("position"), "ageS": round(now - current[key])})
        if now - current[key] < GRACE_S or len(out["dequeued"]) >= MAX_PER_TICK:
            continue
        try:
            _gh(run, "api", "graphql", "-f", f"query={DEQUEUE}", "-f", f"id={pr['id']}")
            marker = json.dumps({"code": "unmergeable", "by": "lanes/queue_unmergeable", "position": entry.get("position")})
            body = (f"Dequeued from the merge queue: this entry was UNMERGEABLE for {round((now - current[key]) / 60)} min "
                    f"at position {entry.get('position')} and blocked the entries behind it. It needs a rebase or conflict "
                    f"fix; `{ROUTE_LABEL}` routes it to the lanes.\n<!-- queue-dequeue {marker} -->")
            for args in (("api", f"repos/{repo}/issues/{pr['number']}/comments", "-f", f"body={body}"),
                         ("api", f"repos/{repo}/issues/{pr['number']}/labels", "-f", f"labels[]={ROUTE_LABEL}")):
                try:
                    _gh(run, *args)
                except RuntimeError as error:  # the dequeue stands; a failed comment or label is logged, not retried blind
                    out["errors"].append(f"#{pr['number']} {args[1].rsplit('/', 1)[-1]}: {error}")
            out["dequeued"].append(pr["number"])
            with open(state / LOG_FILE, "a") as log:
                log.write(json.dumps({"at": now, "pr": pr["number"], "head": pr.get("headRefOid"), "position": entry.get("position"),
                                      "unmergeableForS": round(now - current[key]), "action": "dequeued+routed"}) + "\n")
            current.pop(key, None)
        except RuntimeError as error:
            out["errors"].append(f"#{pr['number']} dequeue: {error}")
    _write(state / SEEN_FILE, current)
    return out
