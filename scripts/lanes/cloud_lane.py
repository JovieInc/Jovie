"""Dormant Codex Cloud adapter; no runtime routing or configuration activation.

Subscription-backed submission only, with an explicitly configured real Codex
binary and cloud environment. No Claude Code route or API-key fallback.
Unknown outcomes hold the task/branch until reconciled instead of duplicating it.
The dispatcher owns activation, subscription-headroom admission and result apply.
"""
from __future__ import annotations

import fcntl
import json
import math
import os
import re
import subprocess
import sys
import time
from pathlib import Path

LEDGER = Path(os.environ.get("CLOUD_LANE_LEDGER", Path.home() / ".local/state/jovie-lanes/cloud-lane.jsonl"))
OPT_IN_LABEL = "cloud-lane"
DENY_LABELS = {"auth", "billing", "infra", "security", "migration", "codex-blocked", "no-cloud",
               "hold", "ws:security-auth", "ws:release-deploy", "protected", "governance"}
DENY_TEXT = re.compile(r"(doppler|\.env\b|secret|credential|api[_ -]?key|token|DATABASE_URL|"
                       r"production (db|database)|prod db|stripe live|private data|migration)", re.I)
LIMITS = {"codex": {"concurrent": 2, "per_day": 8}}
BACKOFF_S = (900, 3600, 14400)  # consecutive limit hits: 15m, 1h, 4h
LIMIT_TEXT = re.compile(r"(rate.?limit|usage limit|quota|429|overloaded|capacity)", re.I)


def eligible(labels, text):
    """(ok, reason). Opt-in label required; any secret/private/protected signal keeps it on Gem."""
    labels = {str(l).lower() for l in labels}
    if OPT_IN_LABEL not in labels:
        return False, "not-opted-in"
    hit = labels & DENY_LABELS
    if hit:
        return False, f"label:{sorted(hit)[0]}"
    m = DENY_TEXT.search(text or "")
    if m:
        return False, f"text:{m.group(0).lower()}"
    return True, "ok"


def read(path=None):
    path = Path(path or LEDGER)
    if not path.exists():
        return []
    out = []
    for line in path.read_text().splitlines():
        event = json.loads(line)
        if not isinstance(event, dict) or not {"task", "provider", "stage", "at"} <= event.keys():
            raise ValueError("invalid cloud ledger event")
        if (not isinstance(event["task"], str) or not event["task"] or
                not isinstance(event["provider"], str) or not event["provider"] or
                event["stage"] not in ("submitted", "accepted", "held", "limit", "failed", "pr_opened") or
                not isinstance(event["at"], (int, float)) or isinstance(event["at"], bool) or
                event["at"] > 1e12 or not math.isfinite(event["at"]) or event["at"] < 0 or
                ("branch" in event and not isinstance(event["branch"], str)) or
                (event.get("remote") is not None and not isinstance(event["remote"], str))):
            raise ValueError("invalid cloud ledger values")
        out.append(event)
    return out


def append(event, path=None):
    path = Path(path or LEDGER)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as f:
        f.write(json.dumps(event, sort_keys=True) + "\n")


def admit(provider, now, events):
    """(ok, reason): concurrency, daily cap and limit backoff from the ledger alone."""
    cap = LIMITS.get(provider)
    if not cap:
        return False, "unknown-provider"
    mine = [e for e in events if e.get("provider") == provider]
    hits = 0
    last_hit = 0.0
    for e in mine:
        if e["stage"] == "limit":
            hits, last_hit = hits + 1, e["at"]
        elif e["stage"] == "pr_opened":
            hits = 0
    if hits and now < last_hit + BACKOFF_S[min(hits, len(BACKOFF_S)) - 1]:
        return False, "backoff"
    latest = {e["task"]: e for e in mine}
    if sum(e["stage"] not in ("pr_opened", "limit") for e in latest.values()) >= cap["concurrent"]:
        return False, "concurrency"
    if sum(e["stage"] == "submitted" and now - e["at"] < 86400 for e in mine) >= cap["per_day"]:
        return False, "daily-cap"
    return True, "ok"


def command(provider, branch, prompt, env=None, binary=None):
    if provider != "codex":
        return None
    env = env or os.environ.get("CODEX_CLOUD_ENV")
    binary = binary or os.environ.get("CODEX_CLOUD_BINARY")
    if not env or not binary or not Path(binary).is_absolute():
        return None
    return [binary, "cloud", "exec", "--env", env, "--attempts", "1", "--branch", branch, prompt]


def route(task, provider, labels, text, branch, prompt, run=subprocess.run, now=time.time, path=None):
    """Reserve and submit once; a shared ledger lock serializes admission across processes."""
    ok, why = eligible(labels, text + "\n" + prompt)
    if not ok:
        return {"route": "gem", "reason": why}
    cmd = command(provider, branch, prompt)
    if not cmd:
        return {"route": "gem", "reason": "provider-unconfigured"}
    path = Path(path or LEDGER)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.with_suffix(path.suffix + ".lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            events = read(path)
        except (ValueError, OSError):
            return {"route": "held", "reason": "ledger-unreadable"}
        # A task or branch is single-writer, including accepted and unknown outcomes.
        # Only a definite quota rejection permits fallback and a later fresh attempt.
        matching = [e for e in events if e.get("task") == task or e.get("branch") == branch]
        attempts = {(e["task"], e.get("branch")): e for e in matching}
        if any(e["stage"] != "limit" for e in attempts.values()):
            return {"route": "held", "reason": "already-submitted"}
        t = now()
        ok, why = admit(provider, t, events)
        if not ok:
            return {"route": "gem", "reason": why}
        base = {"task": task, "provider": provider, "branch": branch}
        append({**base, "stage": "submitted", "at": t}, path)
    try:
        r = run(cmd, capture_output=True, text=True, timeout=300)
    except Exception as error:
        append({**base, "stage": "held", "at": now(), "reason": type(error).__name__}, path)
        return {"route": "held", "reason": "unknown-submit-outcome"}
    out = (r.stdout or "") + (r.stderr or "")
    # CLI diagnostics do not prove rejection; every ambiguous outcome stays held.
    m = re.search(r"\b(task_[A-Za-z0-9_-]+)\b", out)
    if r.returncode != 0 or not m:
        append({**base, "stage": "held", "at": now(), "remote": m.group(1) if m else None}, path)
        return {"route": "held", "reason": "unknown-submit-outcome"}
    append({**base, "stage": "accepted", "at": now(), "remote": m.group(1)}, path)
    return {"route": "cloud", "reason": "ok", "remote": m.group(1)}


def status(task, run=subprocess.run, path=None):
    """Read remote status on demand, without resubmission or inferred completion."""
    try:
        events = read(path)
    except (ValueError, OSError):
        return {"route": "held", "reason": "ledger-unreadable"}
    accepted = [e for e in events if e.get("task") == task and e.get("remote")]
    if not accepted:
        return {"route": "held", "reason": "remote-id-missing"}
    binary = os.environ.get("CODEX_CLOUD_BINARY")
    if not binary or not Path(binary).is_absolute():
        return {"route": "held", "reason": "provider-unconfigured"}
    remote = accepted[-1]["remote"]
    try:
        result = run([binary, "cloud", "status", remote], capture_output=True, text=True, timeout=60)
    except Exception:
        return {"route": "held", "reason": "status-unavailable", "remote": remote}
    return {"route": "cloud" if result.returncode == 0 else "held", "remote": remote,
            "reason": "status-observed" if result.returncode == 0 else "status-unavailable",
            "status": result.stdout if result.returncode == 0 else None}


def poll(task, provider, branch, gh=None, now=time.time, path=None):
    """Result capture: the cloud worker's PR on `branch` closes the task (stage pr_opened)."""
    if gh is None:
        from gh_budget import gh_call as gh  # budgeted gh (external-api-guard)
    try:
        events = read(path)
    except (ValueError, OSError):
        return None
    accepted = [e for e in events if e.get("task") == task and e.get("branch") == branch
                and e.get("stage") == "accepted" and e.get("remote")]
    if not accepted:
        return None
    remote = accepted[-1]["remote"]
    r = gh(["pr", "list", "--repo", "JovieInc/Jovie", "--head", branch, "--json", "number,url,body", "--limit", "1"])
    if r.returncode != 0:
        return None
    try:
        prs = json.loads(r.stdout or "[]")
    except ValueError:
        prs = []
    if not isinstance(prs, list):
        return None
    prs = [pr for pr in prs if isinstance(pr, dict) and
           re.search(r"(?<![A-Za-z0-9_-])" + re.escape(remote) + r"(?![A-Za-z0-9_-])", pr.get("body") or "")]
    if prs and not any(e.get("task") == task and e.get("stage") == "pr_opened" for e in read(path)):
        append({"task": task, "provider": provider, "branch": branch, "stage": "pr_opened", "at": now(),
                "pr": prs[0]["number"], "remote": remote}, path)
    return prs[0] if prs else None


def pct(values, q):
    if not values:
        return None
    values = sorted(values)
    return values[min(len(values) - 1, int(q * len(values)))]


def stats(events):
    out = {}
    for p in sorted({e["provider"] for e in events}):
        mine = [e for e in events if e["provider"] == p]
        sub = {e["task"]: e["at"] for e in mine if e["stage"] == "submitted"}
        done = {e["task"]: e["at"] for e in mine if e["stage"] == "pr_opened"}
        times = [done[t] - sub[t] for t in done if t in sub]
        out[p] = {"tasks": len(sub), "prs": len(done), "success_rate": len(done) / len(sub) if sub else None,
                  "time_to_pr_p50_s": pct(times, .5), "time_to_pr_p95_s": pct(times, .95),
                  "cost_usd": None, "cost_basis": "subscription; marginal spend unmeasured"}
    return out


def main(argv=None):
    if (argv if argv is not None else sys.argv[1:])[:1] != ["stats"]:
        print("usage: cloud_lane.py stats", file=sys.stderr)
        return 2
    print(json.dumps(stats(read()), indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
