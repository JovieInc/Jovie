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
NO_WORK_S = 5 * 60
PROVIDER_IDLE_S = 5 * 60
ESCALATION_S = 10 * 60
POOL_EMPTY_S = 30 * 60
HUD_STALE_S = 120
GATE_TIMEOUT_ALERT = 5
FAILED_RUN_ALERT = 10
DISK_MIN_PCT = 10
DISK_CRIT_PCT = 5
GITHUB_MIN_REMAINING = 300
# An open PR older than this is a governor signal (JOV-7079): the cockpit names it and its
# disposition instead of letting it age silently.
AGED_PR_S = 7 * 24 * 3600


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def epoch_iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


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
    all_receipts, receipts = [], []
    try:
        with open(state / "runs" / "ledger.jsonl") as handle:
            for line in handle:
                try:
                    receipt = json.loads(line)
                except ValueError:
                    continue
                all_receipts.append(receipt)
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
        qualified_by_provider = {name: linear.lane_issues(name) for name, spec in lane.load_providers().items()
                                 if spec.get("enabled", True)}
        pool_by_provider = {name: len(issues) for name, issues in qualified_by_provider.items()}
        qualified_jobs = {name: [issue.identifier for issue in issues]
                          for name, issues in qualified_by_provider.items()}
        pool = sum(pool_by_provider.values())
        linear_error = None
    except Exception as error:
        pool, pool_by_provider, qualified_jobs, linear_error = None, {}, {}, f"{type(error).__name__}: {error}"[:100]
    github = None
    merged, merged_error = [], None
    try:
        lane.load_github_env()
        budget = lane.graphql_budget()
        github = budget[0] if budget else None
        if not os.environ.get("LANES_SELFTEST"):
            merged = merged_prs_24h(lane, now)
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.SubprocessError):
        merged_error = "merged-pr-attribution-unreadable"
    held = read_json(state / "held.json", {})
    failures = read_json(state / "failures.json", {})
    disk = shutil.disk_usage("/")
    capacity_by_provider: dict[str, dict[str, int]] = {}
    for path in (state / "slots").glob("*.lock"):
        if path.name.startswith("gate."):
            continue
        provider = path.name.split(".")[0]
        capacity = capacity_by_provider.setdefault(provider, {"running": 0, "slots": 0})
        capacity["slots"] += 1
        capacity["running"] += 1 if _locked(path) else 0
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
        "capacityByProvider": capacity_by_provider,
        "codex": accounts, "pool": pool, "poolByProvider": pool_by_provider,
        "qualifiedJobsByProvider": qualified_jobs,
        "linearError": linear_error, "githubRemaining": github,
        "merged24h": merged, "mergedAttributionError": merged_error,
        "diskFreePct": round(100 * disk.free / disk.total, 1),
        "hudExpected": (state / "hud.expected").exists(), "hudBeatAge": hud_beat,
        "heldByReason": pr_events.by_reason(held, open_pr_numbers()),
        "reconcile": read_json(state / "reconcile.json", {}),
        "failedByReason": failed_by_reason(failures),
        "_receipts24h": receipts, "_allReceipts": all_receipts,
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


def merged_prs_24h(lane, now: float) -> list[dict]:
    since = datetime.fromtimestamp(now - 86400, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    result = subprocess.run(
        ["gh", "pr", "list", "--repo", lane.REPO_SLUG, "--state", "merged", "--limit", "100",
         "--search", f"merged:>={since}", "--json", "number,headRefName,createdAt,mergedAt"],
        capture_output=True, text=True, timeout=60,
    )
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "merged PR read failed")[-120:])
    rows = json.loads(result.stdout or "[]")
    return [row for row in rows if row.get("number") and row.get("mergedAt")]


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


def provider_idle_with_qualified_work(obs: dict, provider: str) -> bool:
    """The tick attempted recovery, but no worker owns any configured slot."""
    capacity = (obs.get("capacityByProvider") or {}).get(provider) or {}
    pool = (obs.get("poolByProvider") or {}).get(provider)
    tick = obs.get("tick") or {}
    account_ready = provider != "codex" or bool((obs.get("codex") or {}).get("available"))
    return bool(pool and account_ready and capacity.get("slots") and not capacity.get("running")
                and provider in (tick.get("spawned") or []) and provider not in (tick.get("unhealthy") or []))


def provider_idle_since(obs: dict, previous: dict) -> dict[str, float]:
    """Preserve the first failed restart tick independently for every provider family."""
    started = dict(previous.get("providerIdleSince") or {})
    legacy_codex = previous.get("codexIdleSince")
    if legacy_codex and "codex" not in started:
        started["codex"] = legacy_codex
    for provider in (obs.get("capacityByProvider") or {}):
        if provider_idle_with_qualified_work(obs, provider):
            started.setdefault(provider, obs["now"])
        else:
            started.pop(provider, None)
    return started


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
    for provider, idle_since in ((previous or {}).get("providerIdleSince") or {}).items():
        if not provider_idle_with_qualified_work(obs, provider) or obs["now"] - idle_since < PROVIDER_IDLE_S:
            continue
        capacity = (obs.get("capacityByProvider") or {}).get(provider) or {}
        pool_for_provider = (obs.get("poolByProvider") or {}).get(provider)
        accounts = f", {len(codex['available'])} available account(s)" if provider == "codex" else ""
        alerts[f"provider-idle:{provider}"] = (f"{provider} has {pool_for_provider} compatible issue(s){accounts}, "
                                               f"but 0/{capacity['slots']} workers after dispatch retried for "
                                               f"{PROVIDER_IDLE_S // 60}m")
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
    if swept_age is not None and swept_age < 2 * pr_events.RECONCILE_S:
        aged = [row for row in sweep.get("dispositions") or []
                if (row.get("ageH") or 0) * 3600 >= AGED_PR_S and row.get("state") != "closing"]
        if aged:
            listed = ", ".join(f"#{row['pr']} {row['ageH'] // 24}d {row['state']}"
                               + (f" ({row['reason']})" if row.get("reason") else "")
                               for row in aged[:8])
            alerts["aged-prs"] = (f"{len(aged)} open PRs are older than {AGED_PR_S // 86400}d: {listed}")
    if obs.get("hudExpected") and (obs.get("hudBeatAge") is None or obs["hudBeatAge"] > HUD_STALE_S):
        beat = "never" if obs.get("hudBeatAge") is None else f"{int(obs['hudBeatAge'])}s ago"
        alerts["hud-stale"] = f"tty1 HUD heartbeat {beat}; the console is not showing current truth"
    return alerts


def condition_receipts(alerts: dict[str, str], previous: dict, obs: dict, host_name: str) -> dict[str, dict]:
    """Typed, generation-deduped evidence for every actionable doctor condition."""
    prior = previous.get("conditions") or {}
    receipts: dict[str, dict] = {}
    now = float(obs["now"])
    critical = ("tick-error", "linear-down", "spawn-exit", "no-landing", "disk-critical")
    actions = {
        "tick-error": "retry-dispatch-tick",
        "linear-down": "retry-linear-read-and-publish-independent-receipt",
        "spawn-exit": "dispatch-provider-workers",
        "hud-stale": "restart-hud-service",
        "orphan-prs": "reconcile-pr-ownership",
    }
    resources = {
        "linear-down": ["linear", "pool"],
        "pool-empty": ["linear-pool"],
        "tick-error": ["dispatch-tick"],
        "spawn-exit": ["dispatch-tick", "worker-pool"],
        "hud-stale": ["tty1-hud", "status-feed"],
        "no-landing": ["shipping-throughput"],
    }
    for key, evidence in alerts.items():
        old = prior.get(key) or {}
        continuing = old.get("state") == "active"
        generation = int(old.get("generation") or 0) + (0 if continuing else 1)
        provider = key.split(":", 1)[1] if ":" in key else None
        first = (float(old["firstObservedEpoch"]) if continuing and old.get("firstObservedEpoch") is not None
                 else float((previous.get("providerIdleSince") or {}).get(provider, now)))
        source_status = "unknown" if key == "linear-down" else "stale" if key == "hud-stale" else "degraded"
        freshness = (obs.get("hudBeatAge") if key == "hud-stale" else
                     obs.get("tickAge") if key.startswith(("tick-", "provider-", "spawn-")) else 0)
        action = ("dispatch-provider-workers" if key.startswith("provider-idle:") else
                  "retry-provider-health-probe" if key.startswith("provider-down:") else
                  actions.get(key, "reconcile-control-plane-condition"))
        affected = resources.get(key) or ([provider] if provider else [key])
        receipts[key] = {
            "schema": "jovie.control-plane-liveness-condition/v1",
            "idempotencyKey": f"{host_name}:{key}:{generation}",
            "condition": key,
            "generation": generation,
            "state": "active",
            "severity": "critical" if key in critical or key.startswith(("provider-idle:", "provider-down:")) else "degraded",
            "owner": "symphony-lanes-doctor",
            "owningInvariant": "JOV-6004",
            "affectedResources": affected,
            "firstObservedAt": epoch_iso(first),
            "firstObservedEpoch": first,
            "source": {"producer": "scripts/lanes/doctor.py", "status": source_status,
                       "observedAt": epoch_iso(now), "freshnessSeconds": freshness},
            "deadlineAt": epoch_iso(first + ESCALATION_S),
            "recovery": {"action": action, "outcome": "failed" if key.startswith("provider-idle:") or key == "spawn-exit" else "retrying"},
            "nextAction": "wake-summer-via-linear-or-independent-status-feed",
            "terminalOutcome": None,
            "evidence": evidence,
        }
    for key, old in prior.items():
        if key in alerts or old.get("state") != "active":
            if key not in receipts:
                receipts[key] = old
            continue
        receipts[key] = {**old, "state": "resolved", "resolvedAt": epoch_iso(now),
                         "nextAction": "none", "terminalOutcome": "health-proven"}
    return receipts


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
            priority = 1 if key.startswith(("provider-idle:", "provider-down:")) or key in (
                "linear-down", "spawn-exit", "tick-error") else 2
            team = self.linear.gql('query{teams(filter:{key:{eq:"JOV"}}){nodes{id states{nodes{id name}} labels{nodes{id name}}}}}', {})["teams"]["nodes"][0]
            triage = next(s["id"] for s in team["states"]["nodes"] if s["name"] == "Triage")
            labels = [l["id"] for l in team["labels"]["nodes"] if l["name"] == "symphony"]
            data = self.linear.gql(
                'mutation($i:IssueCreateInput!){issueCreate(input:$i){issue{id identifier}}}',
                {"i": {"teamId": team["id"], "stateId": triage, "labelIds": labels, "priority": priority,
                       "title": self.title(key),
                       "description": f"**{text}**\n\nHost `{self.host}`, {now_iso()}. Raised by `scripts/lanes/doctor.py`; "
                                      "it will move this issue to Done when the condition clears.\n\n"
                                      "Runbook: `scripts/lanes/README.md`; state under `~/.local/state/jovie-lanes` "
                                      "(`tick.json`, `runs/ledger.jsonl`, `doctor.json`)."}})
            return data["issueCreate"]["issue"]["id"]
        except Exception:
            return None

    def contradict_invariant(self, event: dict) -> None:
        """Reopen the liveness owner only when a new typed generation contradicts its proof."""
        try:
            data = self.linear.gql(
                'query($n:Float!){issues(filter:{team:{key:{eq:"JOV"}},number:{eq:$n}})'
                '{nodes{id state{type}}}}', {"n": 6004.0})
            owner = data["issues"]["nodes"][0]
            if owner["state"]["type"] == "completed":
                self.linear.move(owner["id"], "Triage")
            self.linear.comment(
                owner["id"],
                f"🤖 liveness contradiction `{event['idempotencyKey']}`: {event['evidence']}\n\n"
                f"First observed: {event['firstObservedAt']}; deadline: {event['deadlineAt']}; "
                f"next: `{event['nextAction']}`.",
            )
        except Exception:
            pass

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


def reconcile(alerts: dict[str, str], previous: dict, tracker: Tracker | None, now: float,
              conditions: dict[str, dict] | None = None) -> dict:
    """Carry issue ids across ticks; open/reopen/close through the tracker; return the new doctor.json."""
    issues = dict(previous.get("issues", {}))      # key -> {"id", "closedAt"}
    for key, text in alerts.items():
        entry = issues.get(key)
        if entry and entry.get("closedAt") is None and entry.get("id"):
            continue  # still open
        if entry and entry.get("closedAt") is None and not entry.get("id"):
            issue_id = tracker.open(key, text) if tracker else None
            issues[key] = {"id": issue_id, "closedAt": None}  # retry a failed open
            contradict = getattr(tracker, "contradict_invariant", None) if issue_id else None
            if contradict and conditions and key in conditions:
                contradict(conditions[key])
            continue
        if entry and now - float(entry.get("closedAt") or 0) < COOL_OFF_S and entry.get("id"):
            if tracker:
                tracker.reopen(entry["id"], text)
                contradict = getattr(tracker, "contradict_invariant", None)
                if contradict and conditions and key in conditions:
                    contradict(conditions[key])
            issues[key] = {"id": entry["id"], "closedAt": None}
            continue
        issue_id = tracker.open(key, text) if tracker else None
        issues[key] = {"id": issue_id, "closedAt": None}
        if tracker and issue_id and conditions and key in conditions:
            contradict = getattr(tracker, "contradict_invariant", None)
            if contradict:
                contradict(conditions[key])
    for key, entry in issues.items():
        if key not in alerts and entry.get("closedAt") is None:
            if tracker and entry.get("id"):
                tracker.close(entry["id"])
            entry["closedAt"] = now
    receipts = {}
    for key, event in (conditions or {}).items():
        escalation = ("cleared" if event.get("state") == "resolved" else
                      "requested" if (issues.get(key) or {}).get("id") else "pending")
        receipts[key] = {**event, "summerEscalation": {"transport": "linear", "outcome": escalation}}
    return {"at": epoch_iso(now), "alerts": alerts, "issues": issues, "conditions": receipts}


# ---------------------------------------------------------------- status feed

SLO_CACHE_S = 3600


def fetch_slo(host, lane) -> dict | None:
    """Latest committed shipping-SLO snapshot (docs/metrics/shipping-slo-latest.json,
    written daily by .github/workflows/shipping-slo.yml), cached for an hour so
    ticks stay cheap. Best-effort: a failed fetch keeps the last cached copy."""
    cache = host.state / "slo.json"
    record = read_json(cache, {})
    try:
        fetched_at = datetime.fromisoformat(record["fetchedAt"].replace("Z", "+00:00")).timestamp()
    except (KeyError, ValueError, AttributeError):
        fetched_at = None
    if fetched_at is not None and time.time() - fetched_at < SLO_CACHE_S and record.get("snapshot"):
        return record["snapshot"]
    try:
        lane.load_github_env()
        raw = subprocess.run(
            ["gh", "api", "repos/JovieInc/Jovie/contents/docs/metrics/shipping-slo-latest.json",
             "-H", "Accept: application/vnd.github.raw"],
            capture_output=True, text=True, timeout=20)
        if raw.returncode == 0 and raw.stdout.strip():
            snapshot = json.loads(raw.stdout)
            cache.write_text(json.dumps({"fetchedAt": now_iso(), "snapshot": snapshot}))
            return snapshot
    except (OSError, ValueError, subprocess.SubprocessError):
        pass
    return record.get("snapshot")


def status_feed(host, lane, obs: dict, alerts: dict, tick: dict, previous: dict | None = None,
                conditions: dict[str, dict] | None = None) -> dict:
    """The few numbers Summer and other agents need, in one small JSON."""
    counts = {}
    for path in (host.state / "slots").glob("*.lock"):
        if path.name.startswith("gate."):
            continue
        provider = path.name.split(".")[0]
        counts.setdefault(provider, {"running": 0, "slots": 0})
        counts[provider]["slots"] += 1
        counts[provider]["running"] += 1 if _locked(path) else 0
    throughput = lane.provider_throughput(
        obs.get("_receipts24h") or [],
        counts,
        obs.get("merged24h") or [],
        attribution_receipts=obs.get("_allReceipts") or [],
    )
    idle_since = dict((previous or {}).get("idleQualifiedSince") or {})
    next_idle_since = {}
    for provider, metric in throughput["providers"].items():
        capacity = counts.get(provider, {"running": 0, "slots": 0})
        qualified = (obs.get("poolByProvider") or {}).get(provider)
        account_available = len((obs.get("codex") or {}).get("available") or []) if provider == "codex" else None
        metric["qualifiedWorkWaiting"] = qualified
        metric["idleSlots"] = max(0, capacity["slots"] - capacity["running"])
        metric["idleReason"] = (
            "linear-unreadable" if obs.get("linearError") else
            "provider-unhealthy" if provider in (tick.get("unhealthy") or []) else
            "no-account-available" if provider == "codex" and account_available == 0 else
            "no-qualified-work" if not qualified else
            "capacity-idle-with-qualified-work" if metric["idleSlots"] else
            "fully-utilized"
        )
        wasting_codex = provider == "codex" and bool(qualified) and bool(account_available) and bool(metric["idleSlots"])
        if wasting_codex:
            started = float(idle_since.get(provider) or obs.get("now") or time.time())
            next_idle_since[provider] = started
            metric["accountIdleSecondsWhileQualifiedWorkExists"] = max(0, int((obs.get("now") or time.time()) - started))
        else:
            metric["accountIdleSecondsWhileQualifiedWorkExists"] = None if obs.get("linearError") else 0
    idle_start = ((previous or {}).get("providerIdleSince", {}).get("codex") or
                  (previous or {}).get("idleQualifiedSince", {}).get("codex"))
    projector = getattr(lane, "capacity_horizon", None)
    capacity = projector(obs.get("codex") or {}, obs.get("_allReceipts") or [],
                         (obs.get("qualifiedJobsByProvider") or {}).get("codex") or [],
                         max(0, int((obs.get("now") or time.time()) - idle_start)) if idle_start else 0,
                         obs.get("now")) if projector else {
                             "schema": "jovie.capacity-horizon/v1", "generatedAt": now_iso(), "leases": [],
                             "outcomes": {key: 0 for key in ("useful", "certified", "duplicate", "retry", "failed", "unknown")},
                             "incidents": [], "topBlocker": "capacity projector unavailable",
                             "founderJudgmentRequired": False, "controls": "show-only"}
    return {"schema": "symphony-lanes-status/v1", "at": now_iso(), "host": lane.HOST, "release": tick.get("release"),
            "lanes": counts, "running": sum(c["running"] for c in counts.values()),
            "idle": sum(c["slots"] - c["running"] for c in counts.values()),
            "pool": obs.get("pool"), "lastLandingAgeS": obs.get("lastLandingAge"),
            "codexAvailable": len((obs.get("codex") or {}).get("available") or []),
            "alerts": alerts, "conditions": conditions or {},
            "diskFreePct": obs.get("diskFreePct"), "githubRemaining": obs.get("githubRemaining"),
            "held_by_reason": obs.get("heldByReason") or {}, "failed_by_reason": obs.get("failedByReason") or {},
            "throughput": throughput, "throughputError": obs.get("mergedAttributionError"),
            "capacity": capacity,
            "prs": (obs.get("reconcile") or {}).get("counts") or {}, "_idleQualifiedSince": next_idle_since,
            "orphan_prs": (obs.get("reconcile") or {}).get("orphans") or [],
            "oldest_prs": [row for row in (obs.get("reconcile") or {}).get("dispositions") or []][:10],
            "dep_holds": (obs.get("reconcile") or {}).get("depHolds") or [],
            "slo": obs.get("slo")}


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
    previous["providerIdleSince"] = provider_idle_since(obs, previous)
    previous["codexIdleSince"] = previous["providerIdleSince"].get("codex")  # old readers
    alerts = judge(obs, previous)
    conditions = condition_receipts(alerts, previous, obs, lane.HOST)
    if tracker is None and not os.environ.get("LANES_SELFTEST"):
        try:
            tracker = Tracker(lane.Linear(host.linear_env), lane.HOST)
        except Exception:
            tracker = None
    result = reconcile(alerts, previous, tracker, obs["now"], conditions)
    result["poolEmptySince"] = previous["poolEmptySince"]
    result["codexIdleSince"] = previous["codexIdleSince"]
    result["providerIdleSince"] = previous["providerIdleSince"]
    result["observed"] = {k: v for k, v in obs.items() if k not in ("tick", "codex", "_receipts24h", "_allReceipts")}
    if not os.environ.get("LANES_SELFTEST"):
        try:
            obs["slo"] = fetch_slo(host, lane)
        except Exception:
            obs["slo"] = obs.get("slo")
        try:
            feed = status_feed(host, lane, obs, alerts, obs.get("tick") or {}, previous, result["conditions"])
            result["idleQualifiedSince"] = feed.pop("_idleQualifiedSince", {})
            result["capacity"] = feed["capacity"]
            result["statusFeed"] = publish_status(host, lane, feed)
        except Exception as error:  # a broken feed never blocks the doctor
            result["statusFeedError"] = f"{type(error).__name__}: {error}"[:120]
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(result, indent=1, default=str))
    os.replace(tmp, path)
    return result
