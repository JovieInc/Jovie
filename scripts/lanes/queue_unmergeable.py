#!/usr/bin/env python3
"""Request the existing hosted drain for parked native queue entries.

The hosted writer retains its exact-head stop receipt before dequeuing. A direct
host dequeue lost that receipt and let unchanged #26212 re-enter twice. Reserve
one request per head before dispatch; an ambiguous response never earns a retry.
"""
from __future__ import annotations

import fcntl
import json
import math
import os
import subprocess
import time
from pathlib import Path

GRACE_S, MAX_PER_TICK, SEEN_FILE, LOG_FILE = 600, 3, "queue-unmergeable.json", "queue-unmergeable.jsonl"
QUERY = ("query($o:String!,$r:String!){repository(owner:$o,name:$r){mergeQueue(branch:\"main\"){entries(first:50)"
         "{nodes{state position pullRequest{id number headRefOid}}}}}}")
WORKFLOW = "merge-queue-green-enroll.yml"


def _gh(run, *args):
    done = run(list(args), capture_output=True, text=True, timeout=60)
    if done.returncode != 0:
        raise RuntimeError((done.stderr or done.stdout or f"exit {done.returncode}").strip()[-200:])
    return done.stdout


def _write(path: Path, payload: dict) -> None:
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    with open(tmp, "w") as handle:
        handle.write(json.dumps(payload, sort_keys=True, allow_nan=False))
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp, path)


def sweep(state, run, now: float | None = None, repo: str = "JovieInc/Jovie") -> dict:
    """Serialize the existing observer's request claim, without waiting on another sweep."""
    state = Path(state)
    with open(state / (SEEN_FILE + ".lock"), "a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {"seen": [], "dequeued": [], "requested": [], "errors": ["queue recovery observation in progress"]}
        return _sweep_locked(state, run, now, repo)


def _sweep_locked(state, run, now: float | None, repo: str) -> dict:
    """One bounded pass; a request acknowledgement is not a dequeue receipt."""
    now, state = time.time() if now is None else now, Path(state)
    owner, name = repo.split("/")
    out = {"seen": [], "dequeued": [], "requested": [], "errors": []}
    try:
        data = json.loads(_gh(run, "api", "graphql", "-f", f"query={QUERY}", "-f", f"o={owner}", "-f", f"r={name}"))
        entries = ((((data.get("data") or {}).get("repository") or {}).get("mergeQueue") or {}).get("entries") or {}).get("nodes") or []
    except (RuntimeError, ValueError) as error:
        out["errors"].append(f"read: {error}")
        return out
    try:
        first_seen = json.loads((state / SEEN_FILE).read_text())
        if not isinstance(first_seen, dict):
            raise ValueError("queue recovery state must be an object")
        for key, value in first_seen.items():
            value = {"firstSeen": value} if isinstance(value, (int, float)) and not isinstance(value, bool) else value
            fields = ("firstSeen", "requestedAt") if isinstance(value, dict) and "requestedAt" in value else ("firstSeen",)
            if not isinstance(value, dict) or any(
                    not isinstance(value.get(field), (int, float)) or isinstance(value[field], bool)
                    or not math.isfinite(value[field]) for field in fields):
                raise ValueError("invalid queue recovery observation")
            first_seen[key] = value
    except FileNotFoundError:
        first_seen = {}
    except (OSError, ValueError, TypeError) as error:
        out["errors"].append(f"state: {error}")
        return out
    # Keep spent requests even after an entry disappears; reappearance is not a
    # new generation. A new source head has its own key and its own grace.
    current = {key: value for key, value in first_seen.items() if "requestedAt" in value}
    requests = 0
    for entry in entries:
        pr = entry.get("pullRequest") or {}
        if entry.get("state") != "UNMERGEABLE" or not pr.get("number"):
            continue
        head = pr.get("headRefOid") or ""
        if len(head) != 40 or any(c not in "0123456789abcdef" for c in head):
            out["errors"].append(f"#{pr['number']} missing exact source head")
            continue
        key = f"{pr['number']}@{pr.get('headRefOid')}"
        current[key] = first_seen.get(key, {"firstSeen": now})
        age = now - current[key]["firstSeen"]
        out["seen"].append({"pr": pr["number"], "position": entry.get("position"), "ageS": round(age)})
        if age < GRACE_S or "requestedAt" in current[key] or requests >= MAX_PER_TICK:
            continue
        current[key]["requestedAt"] = now
        _write(state / SEEN_FILE, {**first_seen, **current})
        requests += 1
        try:
            _gh(run, "workflow", "run", WORKFLOW, "--repo", repo, "--ref", "main", "-f", f"pr_number={pr['number']}")
            out["requested"].append(pr["number"])
            with open(state / LOG_FILE, "a") as log:
                log.write(json.dumps({"at": now, "pr": pr["number"], "head": pr.get("headRefOid"), "position": entry.get("position"),
                                      "unmergeableForS": round(age), "action": "central-dequeue-requested"}) + "\n")
        except (RuntimeError, OSError, subprocess.SubprocessError) as error:
            out["errors"].append(f"#{pr['number']} central drain request: {error}; request retained, no blind retry")
    _write(state / SEEN_FILE, current)
    return out
