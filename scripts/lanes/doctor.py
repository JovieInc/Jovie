#!/usr/bin/env python3
"""Nothing fails silently: the lanes' doctor runs every tick and raises each problem once.

An alert is a stable key plus a one-line cause. New keys open a Linear issue in Triage
(label `symphony`, title "Symphony doctor: <key>") so Summer routes it; a key that clears
moves its issue to Done with a comment; a key that fires again within the cool-off reopens
the same issue instead of spamming a new one. `doctor.json` is what the HUD renders.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pr_events  # noqa: E402  (sibling module of the release)

COOL_OFF_S = 6 * 3600
NO_LANDING_S = 6 * 3600
# Workers spawning but no agent run starting or ending: the 2026-09-28 spawn-exit deadlock
# (every worker exited on claim), which looked busy to every other rule.
NO_WORK_S = 60 * 60
POOL_EMPTY_S = 30 * 60
HUD_STALE_S = 120
GATE_TIMEOUT_ALERT = 5
FAILED_RUN_ALERT = 10
DISK_MIN_PCT = 10
DISK_CRIT_PCT = 5
GITHUB_MIN_REMAINING = 300


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def read_json(path: Path, default):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return default


def age_s(stamp: str | None, now: float) -> float | None:
    if not stamp:
        return None
    try:
        return now - datetime.fromisoformat(stamp.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


# ---------------------------------------------------------------- observations

def observe(host, lane, codex, now: float | None = None) -> dict:
    """Everything the doctor judges, gathered once (cheap: local files plus two API reads)."""
    now = time.time() if now is None else now
    state = host.state
    tick = read_json(state / "tick.json", {})
    receipts = []
    try:
        with open(state / "runs" / "ledger.jsonl") as handle:
            for line in handle:
                try:
                    receipt = json.loads(line)
                except ValueError:
                    continue
                ended = age_s(receipt.get("endedAt"), now)
                if ended is not None and ended <= 86400:
                    receipts.append(receipt)
    except OSError:
        pass
    landings = [age_s(r.get("endedAt"), now) for r in receipts if r.get("verdict") in ("landing", "verified-not-queued")]
    try:
        accounts = codex.status()
    except Exception as error:
        accounts = {"error": str(error)[:80], "accounts": {}, "available": []}
    try:
        linear = lane.Linear(host.linear_env)
        pool = sum(len(linear.lane_issues(name)) for name, spec in lane.load_providers().items() if spec.get("enabled", True))
        linear_error = None
    except Exception as error:
        pool, linear_error = None, f"{type(error).__name__}: {error}"[:100]
    github = None
    try:
        lane.load_github_env()
        budget = lane.graphql_budget()
        github = budget[0] if budget else None
    except (OSError, ValueError, KeyError, subprocess.SubprocessError):
        pass
    held = read_json(state / "held.json", {})
    failures = read_json(state / "failures.json", {})
    disk = shutil.disk_usage("/")
    hud_beat = None
    try:
        hud_beat = now - (state / "hud.heartbeat").stat().st_mtime
    except OSError:
        pass
    return {
        "now": now, "tick": tick, "tickAge": age_s(tick.get("at"), now),
        "gateTimeouts24h": sum(1 for r in receipts if r.get("verdict") == "gate-timeout"),
        "failed24h": sum(1 for r in receipts if r.get("verdict") == "failed"),
        "lastLandingAge": min(landings) if landings else None, "runs24h": len(receipts),
        "lastWorkAge": min((age_s(r.get("endedAt"), now) for r in receipts if r.get("kind") != "sync-main"), default=None),
        "worktrees": len(list((state / "worktrees").glob("*"))),
        "busy": len([p for p in (state / "slots").glob("*.lock") if not p.name.startswith("gate.") and _locked(p)]),
        "codex": accounts, "pool": pool, "linearError": linear_error, "githubRemaining": github,
        "diskFreePct": round(100 * disk.free / disk.total, 1),
        "hudExpected": (state / "hud.expected").exists(), "hudBeatAge": hud_beat,
        "heldByReason": pr_events.by_reason(held, open_pr_numbers()),
        "reconcile": read_json(state / "reconcile.json", {}),
        "failedByReason": failed_by_reason(failures),
    }


def open_pr_numbers() -> set[int] | None:
    """Open PR numbers, so held counts leave out merged and closed PRs; None counts every record."""
    if os.environ.get("LANES_SELFTEST"):
        return None
    try:
        result = subprocess.run(["gh", "pr", "list", "--repo", pr_events.REPO, "--state", "open", "--limit", "500",
                                 "--json", "number", "--jq", ".[].number"], capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode != 0:
        return None
    return {int(line) for line in result.stdout.split() if line.isdigit()}


def failed_by_reason(failures: dict) -> dict[str, int]:
    """Issues whose last lane run failed, by reason code (records before reason codes: `legacy`)."""
    counts: dict[str, int] = {}
    for record in failures.values():
        code = record.get("reason", "legacy") if isinstance(record, dict) else "legacy"
        counts[code] = counts.get(code, 0) + 1
    return dict(sorted(counts.items()))


def _locked(path: Path) -> bool:
    import fcntl
    try:
        with open(path, "a") as handle:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            fcntl.flock(handle, fcntl.LOCK_UN)
            return False
    except (OSError, BlockingIOError):
        return True


# ---------------------------------------------------------------- judgement

def judge(obs: dict, previous: dict | None = None) -> dict[str, str]:
    """Stable key -> one-line cause. Pure, so every rule has a test."""
    alerts = {}
    tick = obs.get("tick") or {}
    if tick.get("error"):
        alerts["tick-error"] = f"last dispatch tick failed: {tick['error'][:140]}"
    for name in tick.get("unhealthy", []):
        alerts[f"provider-down:{name}"] = f"{name} lane health check failing; slots idle while work waits"
    codex = obs.get("codex") or {}
    if codex.get("error"):
        alerts["codex-broken"] = f"codex account probe failed: {codex['error']}"
    elif codex.get("count") and not codex.get("available"):
        soonest = min((row.get("resetsInS") or 0) for row in codex["accounts"].values())
        alerts["codex-all-banked"] = f"all {codex['count']} codex accounts exhausted; earliest reset in {soonest // 60}m"
    pool, busy = obs.get("pool"), obs.get("busy", 0)
    if obs.get("linearError"):
        alerts["linear-down"] = f"Linear unreadable: {obs['linearError']}"
    elif pool == 0:
        since = (previous or {}).get("poolEmptySince") or obs["now"]
        if obs["now"] - since >= POOL_EMPTY_S:
            alerts["pool-empty"] = "no Todo issues carry agent-ready/devin/codex; Summer: route work to the lanes"
    if pool and busy and obs.get("runs24h") and (obs.get("lastLandingAge") is None or obs["lastLandingAge"] > NO_LANDING_S):
        last = "never in 24h" if obs.get("lastLandingAge") is None else f"{int(obs['lastLandingAge'] // 3600)}h ago"
        alerts["no-landing"] = f"{busy} slots busy with {pool} issues waiting but nothing passed the gate ({last})"
    spawned = len((obs.get("tick") or {}).get("spawned") or [])
    if pool and spawned and not obs.get("worktrees", 1) and (obs.get("lastWorkAge") or NO_WORK_S + 1) > NO_WORK_S:
        alerts["spawn-exit"] = (f"{spawned} workers spawn each tick but no agent run started or ended in "
                                f"{NO_WORK_S // 60}m with {pool} issues waiting; workers exit on claim")
    if obs.get("gateTimeouts24h", 0) >= GATE_TIMEOUT_ALERT:
        alerts["gate-timeouts"] = f"{obs['gateTimeouts24h']} gate timeouts in 24h: host too slow for the gate (fewer slots or a longer LANES_GATE_TIMEOUT_S)"
    if obs.get("failed24h", 0) >= FAILED_RUN_ALERT:
        alerts["failed-runs"] = f"{obs['failed24h']} harness-failed runs in 24h; read runs/ledger.jsonl reasons"
    if obs.get("diskFreePct") is not None and obs["diskFreePct"] < DISK_CRIT_PCT:
        alerts["disk-critical"] = (f"root disk {obs['diskFreePct']}% free even after the disk-pressure "
                                 f"guard swept; ENOSPC imminent — Summer: reclaim space on this host now")
    elif obs.get("diskFreePct") is not None and obs["diskFreePct"] < DISK_MIN_PCT:
        alerts["disk-low"] = f"root disk {obs['diskFreePct']}% free; worktrees and installs will start failing"
    if obs.get("githubRemaining") is not None and obs["githubRemaining"] < GITHUB_MIN_REMAINING:
        alerts["github-quota"] = f"GitHub GraphQL budget {obs['githubRemaining']} left this hour; enqueues and listings will fail"
    sweep = obs.get("reconcile") or {}
    swept_age = obs["now"] - float(sweep.get("atEpoch") or 0) if obs.get("now") else None
    if sweep.get("orphans") and swept_age is not None and swept_age < 2 * pr_events.RECONCILE_S:
        listed = " ".join(f"#{number}" for number in sweep["orphans"][:20])
        alerts["orphan-prs"] = (f"{len(sweep['orphans'])} open PRs have no owner (not queued, no live lane-fix label, "
                                f"no hold): {listed}")
    if obs.get("hudExpected") and (obs.get("hudBeatAge") is None or obs["hudBeatAge"] > HUD_STALE_S):
        beat = "never" if obs.get("hudBeatAge") is None else f"{int(obs['hudBeatAge'])}s ago"
        alerts["hud-stale"] = f"tty1 HUD heartbeat {beat}; the console is not showing current truth"
    return alerts


# ---------------------------------------------------------------- Linear actions

class Tracker:
    """Linear Triage issues, one per alert key, reused within the cool-off."""
    def __init__(self, linear, host_name: str):
        self.linear, self.host = linear, host_name

    def title(self, key: str) -> str:
        return f"Symphony doctor: {key} ({self.host})"

    def existing(self, key: str) -> str | None:
        """An open issue for this key and host, if a previous tick (or a lost doctor.json)
        already raised it. Linear is the durable truth; local state is only a cache."""
        try:
            data = self.linear.gql(
                'query($t:String!){issues(first:5,filter:{team:{key:{eq:"JOV"}},title:{eq:$t},'
                'state:{type:{nin:["completed","canceled"]}}}){nodes{id}}}', {"t": self.title(key)})
            nodes = data["issues"]["nodes"]
            return nodes[0]["id"] if nodes else None
        except Exception:
            return None

    def open(self, key: str, text: str) -> str | None:
        found = self.existing(key)
        if found:
            return found
        try:
            team = self.linear.gql('query{teams(filter:{key:{eq:"JOV"}}){nodes{id states{nodes{id name}} labels{nodes{id name}}}}}', {})["teams"]["nodes"][0]
            triage = next(s["id"] for s in team["states"]["nodes"] if s["name"] == "Triage")
            labels = [l["id"] for l in team["labels"]["nodes"] if l["name"] == "symphony"]
            data = self.linear.gql(
                'mutation($i:IssueCreateInput!){issueCreate(input:$i){issue{id identifier}}}',
                {"i": {"teamId": team["id"], "stateId": triage, "labelIds": labels, "priority": 2,
                       "title": self.title(key),
                       "description": f"**{text}**\n\nHost `{self.host}`, {now_iso()}. Raised by `scripts/lanes/doctor.py`; "
                                      "it will move this issue to Done when the condition clears.\n\n"
                                      "Runbook: `scripts/lanes/README.md`; state under `~/.local/state/jovie-lanes` "
                                      "(`tick.json`, `runs/ledger.jsonl`, `doctor.json`)."}})
            return data["issueCreate"]["issue"]["id"]
        except Exception:
            return None

    def reopen(self, issue_id: str, text: str) -> None:
        try:
            self.linear.move(issue_id, "Triage")
            self.linear.comment(issue_id, f"🤖 doctor: fired again on `{self.host}` at {now_iso()}: {text}")
        except Exception:
            pass

    def close(self, issue_id: str) -> None:
        try:
            self.linear.comment(issue_id, f"🤖 doctor: cleared on `{self.host}` at {now_iso()}.")
            self.linear.move(issue_id, "Done")
        except Exception:
            pass


def reconcile(alerts: dict[str, str], previous: dict, tracker: Tracker | None, now: float) -> dict:
    """Carry issue ids across ticks; open/reopen/close through the tracker; return the new doctor.json."""
    issues = dict(previous.get("issues", {}))      # key -> {"id", "closedAt"}
    for key, text in alerts.items():
        entry = issues.get(key)
        if entry and entry.get("closedAt") is None and entry.get("id"):
            continue  # still open
        if entry and entry.get("closedAt") is None and not entry.get("id"):
            issues[key] = {"id": tracker.open(key, text) if tracker else None, "closedAt": None}  # retry a failed open
            continue
        if entry and now - float(entry.get("closedAt") or 0) < COOL_OFF_S and entry.get("id"):
            if tracker:
                tracker.reopen(entry["id"], text)
            issues[key] = {"id": entry["id"], "closedAt": None}
            continue
        issue_id = tracker.open(key, text) if tracker else None
        issues[key] = {"id": issue_id, "closedAt": None}
    for key, entry in issues.items():
        if key not in alerts and entry.get("closedAt") is None:
            if tracker and entry.get("id"):
                tracker.close(entry["id"])
            entry["closedAt"] = now
    return {"at": now_iso(), "alerts": alerts, "issues": issues}


# ---------------------------------------------------------------- status feed

def status_feed(host, lane, obs: dict, alerts: dict, tick: dict) -> dict:
    """The few numbers Summer and other agents need, in one small JSON."""
    counts = {}
    for path in (host.state / "slots").glob("*.lock"):
        if path.name.startswith("gate."):
            continue
        provider = path.name.split(".")[0]
        counts.setdefault(provider, {"running": 0, "slots": 0})
        counts[provider]["slots"] += 1
        counts[provider]["running"] += 1 if _locked(path) else 0
    return {"schema": "symphony-lanes-status/v1", "at": now_iso(), "host": lane.HOST, "release": tick.get("release"),
            "lanes": counts, "running": sum(c["running"] for c in counts.values()),
            "idle": sum(c["slots"] - c["running"] for c in counts.values()),
            "pool": obs.get("pool"), "lastLandingAgeS": obs.get("lastLandingAge"),
            "codexAvailable": len((obs.get("codex") or {}).get("available") or []),
            "alerts": alerts, "diskFreePct": obs.get("diskFreePct"), "githubRemaining": obs.get("githubRemaining"),
            "held_by_reason": obs.get("heldByReason") or {}, "failed_by_reason": obs.get("failedByReason") or {},
            "prs": (obs.get("reconcile") or {}).get("counts") or {},
            "orphan_prs": (obs.get("reconcile") or {}).get("orphans") or []}


PRIMARY_FLAG = Path.home() / ".config/jovie-lanes/primary"


def publish_status(host, lane, feed: dict, tracking_issue: str = "JOV-6637") -> str | None:
    """Keep one secret gist current with the status feed; create it once and announce its URL.
    Only the primary host (flag file ~/.config/jovie-lanes/primary) publishes, so a second
    host running the same release never creates a second feed."""
    if not PRIMARY_FLAG.exists():
        return None
    path = host.state / "status-gist.json"
    record = read_json(path, {})
    body = host.state / "lanes-status.json"
    body.write_text(json.dumps(feed, indent=1))
    lane.load_github_env()
    if not record.get("url"):
        created = subprocess.run(["gh", "gist", "create", "--desc", "Symphony lanes status (written every tick by doctor.py)",
                                  "--filename", "lanes-status.json", str(body)], capture_output=True, text=True, timeout=60)
        url = (created.stdout or "").strip().splitlines()[-1] if created.returncode == 0 and created.stdout.strip() else None
        if not url:
            return None
        record = {"url": url, "id": url.rstrip("/").split("/")[-1], "createdAt": now_iso()}
        path.write_text(json.dumps(record))
        try:
            lane.Linear(host.linear_env).comment(tracking_issue and _issue_id(lane, host, tracking_issue),
                                                  f"🤖 doctor: lanes status feed (raw JSON, refreshed every tick): {url}/raw/lanes-status.json")
        except Exception:
            pass
        return url
    subprocess.run(["gh", "gist", "edit", record["id"], "--filename", "lanes-status.json", str(body)],
                   capture_output=True, text=True, timeout=60)
    return record["url"]


def _issue_id(lane, host, identifier: str) -> str:
    data = lane.Linear(host.linear_env).gql('query($n:Float!){issues(filter:{team:{key:{eq:"JOV"}},number:{eq:$n}}){nodes{id}}}',
                                            {"n": float(identifier.split("-")[1])})
    return data["issues"]["nodes"][0]["id"]


def run(host, lane, codex, tracker: Tracker | None = None) -> dict:
    path = host.state / "doctor.json"
    previous = read_json(path, {})
    obs = observe(host, lane, codex)
    # remember when the pool first went empty so the alert needs 30 sustained minutes
    if obs.get("pool") == 0:
        previous["poolEmptySince"] = previous.get("poolEmptySince") or obs["now"]
    else:
        previous["poolEmptySince"] = None
    alerts = judge(obs, previous)
    if tracker is None and not os.environ.get("LANES_SELFTEST"):
        try:
            tracker = Tracker(lane.Linear(host.linear_env), lane.HOST)
        except Exception:
            tracker = None
    result = reconcile(alerts, previous, tracker, obs["now"])
    result["poolEmptySince"] = previous["poolEmptySince"]
    result["observed"] = {k: v for k, v in obs.items() if k not in ("tick", "codex")}
    if not os.environ.get("LANES_SELFTEST"):
        try:
            result["statusFeed"] = publish_status(host, lane, status_feed(host, lane, obs, alerts, obs.get("tick") or {}))
        except Exception as error:  # a broken feed never blocks the doctor
            result["statusFeedError"] = f"{type(error).__name__}: {error}"[:120]
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(result, indent=1, default=str))
    os.replace(tmp, path)
    return result
