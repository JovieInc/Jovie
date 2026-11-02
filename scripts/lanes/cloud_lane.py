"""Cloud lane: hosted coding workers at $0 marginal cost, Gem as the fallback.

Opt-in (label `cloud-lane`), repo-only work only. Providers (verified 2026-11-01):
  claude  `claude --cloud` on the Max subscription. No VM charge; shares the plan's
          limits with local use (code.claude.com/docs/en/claude-code-on-the-web).
  codex   `codex cloud exec --env <ENV_ID>`; dormant until CODEX_CLOUD_ENV is set.
Cursor (needs an API key) and Copilot (no seats) are not routed.

Nothing here spends: no API keys, no credits, no extra usage. Any doubt returns
`gem` so the existing lane keeps the issue. An unknown submit outcome never retries.

  cloud_lane.py stats   # per-provider tasks, success rate, p50/p95 time to PR
"""
from __future__ import annotations

import json
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
LIMITS = {"claude": {"concurrent": 2, "per_day": 8}, "codex": {"concurrent": 2, "per_day": 8}}
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
        try:
            out.append(json.loads(line))
        except ValueError:
            pass
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
    submitted = {e["task"]: e["at"] for e in mine if e["stage"] == "submitted"}
    closed = {e["task"] for e in mine if e["stage"] in ("pr_opened", "failed", "limit")}
    if sum(1 for t in submitted if t not in closed) >= cap["concurrent"]:
        return False, "concurrency"
    if sum(1 for at in submitted.values() if now - at < 86400) >= cap["per_day"]:
        return False, "daily-cap"
    return True, "ok"


def command(provider, branch, prompt, env=None):
    if provider == "claude":
        return ["claude", "--cloud", prompt]
    if provider == "codex":
        env = env or os.environ.get("CODEX_CLOUD_ENV")
        if not env:
            return None
        return ["/opt/homebrew/bin/codex", "cloud", "exec", "--env", env, "--branch", branch, prompt]
    return None


def route(task, provider, labels, text, branch, prompt, run=subprocess.run, now=time.time, path=None):
    """Submit one task. Returns {"route": "cloud"|"gem", "reason", ...}; never raises."""
    ok, why = eligible(labels, text)
    if not ok:
        return {"route": "gem", "reason": why}
    t = now()
    ok, why = admit(provider, t, read(path))
    if not ok:
        return {"route": "gem", "reason": why}
    cmd = command(provider, branch, prompt)
    if not cmd:
        return {"route": "gem", "reason": "provider-unconfigured"}
    base = {"task": task, "provider": provider, "branch": branch, "cost_usd": 0.0}
    append({**base, "stage": "submitted", "at": t}, path)
    try:
        r = run(cmd, capture_output=True, text=True, timeout=300)
    except Exception as error:  # unknown outcome: do not retry, do not fall back
        append({**base, "stage": "failed", "at": now(), "reason": f"unknown:{type(error).__name__}"}, path)
        return {"route": "held", "reason": "unknown-submit-outcome"}
    out = (r.stdout or "") + (r.stderr or "")
    if r.returncode != 0:
        stage = "limit" if LIMIT_TEXT.search(out) else "failed"
        append({**base, "stage": stage, "at": now(), "reason": out[-200:]}, path)
        return {"route": "gem", "reason": stage}
    m = re.search(r"(session_[A-Za-z0-9]+|task_[A-Za-z0-9_-]+)", out)
    append({**base, "stage": "accepted", "at": now(), "remote": m.group(1) if m else None}, path)
    return {"route": "cloud", "reason": "ok", "remote": m.group(1) if m else None}


def poll(task, provider, branch, gh=subprocess.run, now=time.time, path=None):
    """Result capture: the cloud worker's PR on `branch` closes the task (stage pr_opened)."""
    r = gh(["gh", "pr", "list", "--repo", "JovieInc/Jovie", "--head", branch, "--json", "number,url", "--limit", "1"],
           capture_output=True, text=True, timeout=60)
    try:
        prs = json.loads(r.stdout or "[]")
    except ValueError:
        prs = []
    if prs:
        append({"task": task, "provider": provider, "branch": branch, "stage": "pr_opened", "at": now(),
                "pr": prs[0]["number"], "cost_usd": 0.0}, path)
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
                  "cost_usd": sum(e.get("cost_usd", 0) for e in mine if e["stage"] == "submitted")}
    return out


def main(argv=None):
    if (argv if argv is not None else sys.argv[1:])[:1] != ["stats"]:
        print("usage: cloud_lane.py stats", file=sys.stderr)
        return 2
    print(json.dumps(stats(read()), indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
