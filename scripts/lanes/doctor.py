#!/usr/bin/env python3
"""Nothing fails silently: the lanes' doctor runs every tick and raises each problem once.

An alert is a stable key plus a one-line cause. New keys open a Linear issue in Triage
(label `symphony`, title "Symphony doctor: <key>") so Summer routes it; a key that clears
moves its issue to Done with a comment; a key that fires again within the cool-off reopens
the same issue instead of spamming a new one. While `LANES_ESCALATION` is on, open, reopen,
and close also apply `remediation:<alert-key-slug>` (created on the JOV team when missing,
color `#E5484D`). `doctor.json` is what the HUD renders.
"""
from __future__ import annotations

import fcntl
import json
import os
import shutil
import statistics
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import autoscale  # noqa: E402  (sibling module of the release)
import pr_events  # noqa: E402  (sibling module of the release)
import design_gate  # noqa: E402  (design-brief admission census)
import merge_evidence  # noqa: E402  (shared complete merge-window reader)
import file_overlap  # noqa: E402
import remediation  # noqa: E402

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
    if not isinstance(stamp, str) or not stamp:
        return None
    try:
        return now - datetime.fromisoformat(stamp.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


# ---------------------------------------------------------------- observations

def host_capacity(host, lane) -> dict:
    """Configured seats, including draining workers but not stale lock files."""
    capacity = {}
    for name, spec in lane.load_providers().items():
        enabled = spec.get("enabled", True)
        configured = spec.get("slots", 1)
        base = host.base_slots(name, configured) if enabled else 0
        slots = max(0, host.slots(name, configured)) if enabled else 0
        running = sum(_locked(path) for path in (host.state / "slots").glob(f"{name}.*.lock"))
        capacity[name] = {"slots": slots, "running": running, "base": base}
    return capacity


def qualified_pool(host, lane, capacity: dict, now: float) -> tuple[dict, int, dict, dict]:
    """Apply the worker predicate instead of treating label inventory as runnable."""
    linear = lane.Linear(host.linear_env)
    failures = read_json(host.state / "failures.json", {})
    lane.load_github_env()
    in_flight = lane.in_flight_issues()
    if in_flight is None:
        raise RuntimeError("in-flight PR ownership unreadable; runnable pool unknown")
    in_flight = frozenset(identifier.lower() for identifier in in_flight)
    specs = lane.load_providers()
    candidates = {name: linear.lane_issues(specs[name]["label"])
                  for name, seats in capacity.items() if seats["slots"] > 0}
    qualified, rejected = {}, {}
    for name in capacity:
        qualified[name], rejected[name] = [], {}
        # Work the router sends to another lane is not this lane's idle capacity (JOV-7706).
        route = lane.issue_router(host, name, specs) if hasattr(lane, "issue_router") else None
        duplicates = lane.pool_rejections(candidates.get(name, []))
        for issue in candidates.get(name, []):
            # Census key stays bounded: one bucket for all duplicate candidates.
            reason = ("duplicate-candidate" if issue.identifier in duplicates
                      else lane.admission_rejection(issue, failures, now, in_flight, name, route))
            if reason is None:
                qualified[name].append(issue)
            else:
                rejected[name][reason] = rejected[name].get(reason, 0) + 1
    counts = {name: len(candidates.get(name, [])) for name in capacity}
    return qualified, len({issue.identifier for issues in candidates.values() for issue in issues}), counts, rejected


def observe(host, lane, codex, now: float | None = None) -> dict:
    """Everything the doctor judges, gathered once (cheap: local files plus two API reads)."""
    sample_clock = time.time if now is None else lambda: now
    now = sample_clock()
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
    account_observed_at = sample_clock()
    capacity_by_provider = host_capacity(host, lane)
    design_census = None
    linear_skipped = None
    try:
        client = lane.Linear(host.linear_env)
        if lane.linear_cooldown_until(client.key) is not None:
            linear_skipped = "cooldown"
    except (Exception, SystemExit):
        linear_skipped = None
    if linear_skipped:
        pool, candidate_pool, pool_by_provider, qualified_jobs = None, None, {}, {}
        candidate_counts, rejected = {}, {}
        eligible_pool, eligible_by_provider, budgets = None, {}, {}
        linear_error = None
    else:
        try:
            qualified_by_provider, candidate_pool, candidate_counts, rejected = qualified_pool(host, lane, capacity_by_provider, now)
            design_census = design_gate.apply_to_pool(
                qualified_by_provider, rejected, read_text=design_gate.repo_reader(host.repo), now=now)
            eligible_by_provider = {name: len(issues) for name, issues in qualified_by_provider.items()}
            eligible_pool = len({issue.identifier for issues in qualified_by_provider.values() for issue in issues})
            budgets = {name: lane.read_new_issue_budget(name, seats["base"] if "base" in seats else seats["slots"])
                       for name, seats in capacity_by_provider.items()}
            qualified_by_provider = {name: issues if budgets[name]["allowed"] else []
                                     for name, issues in qualified_by_provider.items()}
            pool_by_provider = {name: (None if budgets[name]["used"] is None else len(issues))
                                for name, issues in qualified_by_provider.items()}
            qualified_jobs = {name: [issue.identifier for issue in issues]
                              for name, issues in qualified_by_provider.items()}
            pool = (None if any(value is None for value in pool_by_provider.values()) else
                    len({issue.identifier for issues in qualified_by_provider.values() for issue in issues}))
            linear_error = None
        except (Exception, SystemExit) as error:
            design_census = None
            pool, candidate_pool, pool_by_provider, qualified_jobs, linear_error = None, None, {}, {}, f"{type(error).__name__}: {error}"[:100]
            candidate_counts, rejected = {}, {}
            eligible_pool, eligible_by_provider, budgets = None, {}, {}
    github = None
    merged, merged_error, merged_window = [], None, None
    try:
        lane.load_github_env()
        budget = lane.graphql_budget()
        github = budget[0] if budget else None
        if not os.environ.get("LANES_SELFTEST"):
            merged_window = merge_evidence.collect(lane.REPO_SLUG, now - 86400, now)
            merged = merge_evidence.require_complete(merged_window)
    except merge_evidence.IncompleteMergeEvidence as error:
        merged_error = str(error)
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.SubprocessError):
        merged_error = "merged-pr-attribution-unreadable"
    held = read_json(state / "held.json", {})
    failures = read_json(state / "failures.json", {})
    idle_exit = read_json(state / "worker-idle.json", {})
    disk = shutil.disk_usage("/")
    hud_beat = None
    try:
        hud_beat = now - (state / "hud.heartbeat").stat().st_mtime
    except OSError:
        pass
    gate_waits = [r["gateWaitS"] for r in receipts if isinstance(r.get("gateWaitS"), (int, float))]
    open_numbers = open_pr_numbers()
    return {
        "now": now, "tick": tick, "tickAge": age_s(tick.get("at"), now),
        "gateTimeouts24h": sum(1 for r in receipts if r.get("verdict") == "gate-timeout"),
        # Per-PR seat-queue time from run receipts: the measured input for gate-capacity
        # decisions (more seats vs a second host), not an assumption.
        "gateWaits24h": len(gate_waits),
        "gateWaitMedianS24h": int(statistics.median(gate_waits)) if gate_waits else None,
        "gateWaitMaxS24h": int(max(gate_waits)) if gate_waits else None,
        "failed24h": sum(1 for r in receipts if r.get("verdict") == "failed"),
        "lastLandingAge": min(landings) if landings else None, "runs24h": len(receipts),
        "lastWorkAge": min((age_s(r.get("endedAt"), now) for r in receipts if r.get("kind") != "sync-main"), default=None),
        # Per-provider age of the last clean claim-scan exit: proves spawned workers reach the
        # scan, so their exit is 'nothing claimable', not the spawn-exit deadlock.
        "idleExitAge": {name: age_s((row or {}).get("at"), now)
                        for name, row in idle_exit.items() if isinstance(row, dict)},
        "worktrees": len(list((state / "worktrees").glob("*"))),
        "busy": sum(seats["running"] for seats in capacity_by_provider.values()),
        "capacityByProvider": capacity_by_provider,
        "codex": accounts, "pool": pool, "candidatePool": candidate_pool, "poolByProvider": pool_by_provider,
        "eligiblePool": eligible_pool, "eligiblePoolByProvider": eligible_by_provider,
        "newIssueBudgetByProvider": budgets, "openPRCount": len(open_numbers) if open_numbers is not None else None,
        "codexAttribution": codex_attribution(accounts, account_observed_at),
        "qualifiedJobsByProvider": qualified_jobs,
        "candidatePoolByProvider": candidate_counts, "rejectedByProvider": rejected,
        "designGate": design_census,
        "fileOverlap": file_overlap.doctor_view(state),
        "linearError": linear_error, "linearSkipped": linear_skipped, "githubRemaining": github,
        "merged24h": merged, "mergedAttributionError": merged_error,
        "mergedWindow": ({k: v for k, v in merged_window.items() if k != "prs"} if merged_window else None),
        "diskFreePct": round(100 * disk.free / disk.total, 1),
        "hudExpected": (state / "hud.expected").exists(), "hudBeatAge": hud_beat,
        "heldByReason": pr_events.by_reason(held, open_numbers),
        "reconcile": read_json(state / "reconcile.json", {}),
        "failedByReason": failed_by_reason(failures),
        "escalation": remediation.escalation_summary(read_json(state / "escalation.json", {}), all_receipts, now),
        "remediation": remediation.remediation_summary(read_json(state / "escalation.json", {}), all_receipts, now),
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
    values = result.stdout.split()
    if len(values) >= 500 or any(not value.isdigit() for value in values):
        return None
    return {int(value) for value in values}


def merged_prs_24h(lane, now: float) -> list[dict]:
    return merge_evidence.require_complete(merge_evidence.collect(lane.REPO_SLUG, now - 86400, now))


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
    account_state = obs.get("codexAttribution") or codex_attribution(obs.get("codex") or {}, obs["now"])
    account_ready = provider != "codex" or bool(account_state.get("unleasedAvailable"))
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


def codex_attribution(report: dict, now: float) -> dict:
    """Attribute existing lease/cooldown policy; never treat it as a live quota probe."""
    unknown = {"state": "unknown", "reason": "account-status-unavailable"}
    if not isinstance(report, dict) or report.get("error"):
        return unknown
    age = age_s(report.get("generatedAt"), now)
    rows, count = report.get("accounts"), report.get("count")
    if (age is None or age < 0 or age > HUD_STALE_S or type(count) is not int or count < 0
            or not isinstance(rows, dict) or len(rows) != count):
        return unknown
    counts = {"leased": 0, "eligibleByCooldown": 0, "unleasedAvailable": 0,
              "quotaBanked": 0, "authCooldown": 0, "rateCooldown": 0, "unknownCooldown": 0}
    resets = []
    for row in rows.values():
        if not isinstance(row, dict) or type(row.get("available")) is not bool or type(row.get("leased")) is not bool:
            return unknown
        counts["leased"] += int(row["leased"])
        counts["eligibleByCooldown"] += int(row["available"])
        counts["unleasedAvailable"] += int(row["available"] and not row["leased"])
        if not row["available"]:
            until = age_s(row.get("exhaustedUntil"), now)
            if until is None or until >= 0:
                return unknown
            kind = row.get("lastKind")
            if kind is not None and not isinstance(kind, str):
                return unknown
            key = {"limit": "quotaBanked", "auth": "authCooldown", "rate": "rateCooldown"}.get(kind, "unknownCooldown")
            counts[key] += 1
            resets.append(int(-until))
    state = ("none-configured" if count == 0 else
             "unleased-available" if counts["unleasedAvailable"] else
             "leases-occupied" if counts["eligibleByCooldown"] else
             "quota-banked" if counts["quotaBanked"] == count else
             "cooldown")
    return {"state": state, "count": count, **counts,
            "earliestCooldownS": min(resets) if resets else None, "observedAt": report["generatedAt"],
            "semantics": "existing cooldown policy and lease occupancy; not live quota health"}


def new_work_empty(obs: dict) -> bool:
    """Only assert empty demand when eligibility and absence of PR work are known."""
    budgets = obs.get("newIssueBudgetByProvider") or {}
    return (not obs.get("linearError") and obs.get("eligiblePool", obs.get("pool")) == 0
            and obs.get("openPRCount") == 0
            and any(row.get("reason") == "within-budget" for row in budgets.values())
            and all(row.get("reason") in {"within-budget", "provider-disabled"}
                    for row in budgets.values()))


# ---------------------------------------------------------------- judgement

def judge(obs: dict, previous: dict | None = None) -> dict[str, str]:
    """Stable key -> one-line cause. Pure, so every rule has a test."""
    alerts = {}
    tick = obs.get("tick") or {}
    if tick.get("error"):
        alerts["tick-error"] = f"last dispatch tick failed: {tick['error'][:140]}"
    account_state = obs.get("codexAttribution") or codex_attribution(obs.get("codex") or {}, obs["now"])
    for name in tick.get("unhealthy", []):
        if name == "codex" and account_state["state"] in {"leases-occupied", "quota-banked", "cooldown"}:
            continue
        alerts[f"provider-down:{name}"] = f"{name} lane health check failing; slots idle while work waits"
    codex = obs.get("codex") or {}
    if codex.get("error"):
        alerts["codex-broken"] = f"codex account probe failed: {codex['error']}"
    elif account_state["state"] == "quota-banked":
        alerts["codex-all-banked"] = (f"all {account_state['count']} codex accounts have recorded usage-limit holds; "
                                      f"earliest reset in {account_state['earliestCooldownS'] // 60}m")
    pool, busy = obs.get("eligiblePool", obs.get("pool")), obs.get("busy", 0)
    waiting = pool or obs.get("openPRCount")
    for name, budget in (obs.get("newIssueBudgetByProvider") or {}).items():
        if budget.get("reason") == "pr-inventory-unavailable":
            alerts[f"pr-inventory-unavailable:{name}"] = (
                f"{name} new-issue PR budget unknown: {budget.get('error') or 'incomplete read'}; new claims deferred")
    if obs.get("linearError"):
        alerts["linear-down"] = f"Linear unreadable: {obs['linearError']}"
    elif new_work_empty(obs):
        since = (previous or {}).get("poolEmptySince") or obs["now"]
        if obs["now"] - since >= POOL_EMPTY_S:
            alerts["pool-empty"] = "no eligible new Todo issues and no open PR maintenance; Summer: route work to the lanes"
    if waiting and busy and obs.get("runs24h") and (obs.get("lastLandingAge") is None or obs["lastLandingAge"] > NO_LANDING_S):
        last = "never in 24h" if obs.get("lastLandingAge") is None else f"{int(obs['lastLandingAge'] // 3600)}h ago"
        alerts["no-landing"] = (f"{busy} slots busy with {pool if pool is not None else 'unknown'} eligible new issues "
                                f"and {obs.get('openPRCount', 'unknown')} open PRs but nothing passed the gate ({last})")
    spawned = (obs.get("tick") or {}).get("spawned") or []
    idle_ages = obs.get("idleExitAge") or {}
    clean_exit = bool(spawned) and all(
        (idle_ages.get(provider) if idle_ages.get(provider) is not None else NO_WORK_S + 1) <= NO_WORK_S
        for provider in set(spawned))
    if waiting and spawned and not clean_exit and not obs.get("worktrees", 1) \
            and (obs.get("lastWorkAge") or NO_WORK_S + 1) > NO_WORK_S:
        alerts["spawn-exit"] = (f"{len(spawned)} workers spawn each tick but no agent run started or ended in "
                                f"{NO_WORK_S // 60}m with work waiting; workers exit on claim")
    for provider, idle_since in ((previous or {}).get("providerIdleSince") or {}).items():
        if not provider_idle_with_qualified_work(obs, provider) or obs["now"] - idle_since < PROVIDER_IDLE_S:
            continue
        capacity = (obs.get("capacityByProvider") or {}).get(provider) or {}
        pool_for_provider = (obs.get("poolByProvider") or {}).get(provider)
        accounts = f", {account_state['unleasedAvailable']} available account(s)" if provider == "codex" else ""
        alerts[f"provider-idle:{provider}"] = (f"{provider} has {pool_for_provider} compatible issue(s){accounts}, "
                                               f"but 0/{capacity['slots']} workers after dispatch retried for "
                                               f"{PROVIDER_IDLE_S // 60}m")
    if obs.get("gateTimeouts24h", 0) >= GATE_TIMEOUT_ALERT:
        alerts["gate-timeouts"] = f"{obs['gateTimeouts24h']} gate timeouts in 24h: host too slow for the gate (fewer slots or a longer LANES_GATE_TIMEOUT_S)"
    if obs.get("failed24h", 0) >= FAILED_RUN_ALERT:
        alerts["failed-runs"] = f"{obs['failed24h']} harness-failed runs in 24h; read runs/ledger.jsonl reasons"
    stale_briefs = (obs.get("designGate") or {}).get("stale") or []
    if stale_briefs:
        alerts["design-brief-stale"] = (f"{len(stale_briefs)} needs-design-brief issue(s) held past 24h "
                                        f"without a build claim ({', '.join(stale_briefs[:5])})")
    if obs.get("diskFreePct") is not None and obs["diskFreePct"] < DISK_CRIT_PCT:
        alerts["disk-critical"] = (f"root disk {obs['diskFreePct']}% free even after the disk-pressure "
                                 f"guard swept; ENOSPC imminent — Summer: reclaim space on this host now")
    elif obs.get("diskFreePct") is not None and obs["diskFreePct"] < DISK_MIN_PCT:
        alerts["disk-low"] = f"root disk {obs['diskFreePct']}% free; worktrees and installs will start failing"
    if obs.get("githubRemaining") is not None and obs["githubRemaining"] < GITHUB_MIN_REMAINING:
        alerts["github-quota"] = f"GitHub GraphQL budget {obs['githubRemaining']} left this hour; enqueues and listings will fail"
    escalation_line = remediation.alert_reason(obs.get("escalation") or {})
    if escalation_line:
        alerts["escalation-needs-human"] = escalation_line
    sweep = obs.get("reconcile") or {}
    swept_age = obs["now"] - float(sweep.get("atEpoch") or 0) if obs.get("now") else None
    if sweep.get("orphans") and swept_age is not None and swept_age < 2 * pr_events.RECONCILE_S:
        listed = " ".join(f"#{number}" for number in sweep["orphans"][:20])
        alerts["orphan-prs"] = (f"{len(sweep['orphans'])} open PRs have no owner (not queued, no live lane-fix label, "
                                f"no hold): {listed}")
    if swept_age is not None and swept_age < 2 * pr_events.RECONCILE_S:
        # Held dispositions (explicit hold, fix-exhausted, dependency wait) are already
        # decided and named in the feed's oldest_prs; the alert exists for aged PRs the
        # lanes can still act on — otherwise held PRs keep it firing forever.
        aged = [row for row in sweep.get("dispositions") or []
                if (row.get("ageH") or 0) * 3600 >= AGED_PR_S
                and row.get("state") != "closing"
                and not (row.get("state") or "").startswith("hold:")]
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
        self._team_node = None

    def title(self, key: str) -> str:
        return f"Symphony doctor: {key} ({self.host})"

    def _team(self) -> dict:
        if self._team_node is None:
            self._team_node = self.linear.gql(
                'query{teams(filter:{key:{eq:"JOV"}}){nodes{id states{nodes{id name}} labels{nodes{id name}}}}}',
                {})["teams"]["nodes"][0]
        return self._team_node

    def _remediation_label_id(self, key: str) -> str | None:
        """`remediation:<slug>` on the JOV team. Created when missing, color #E5484D."""
        if not remediation.escalation_enabled():
            return None
        name = remediation.remediation_label_for_alert(key)
        if not name:
            return None
        team = self._team()
        for label in team["labels"]["nodes"]:
            if label.get("name") == name and label.get("id"):
                return label["id"]
        created = self.linear.gql(
            'mutation($i:IssueLabelCreateInput!){issueLabelCreate(input:$i){issueLabel{id name}}}',
            {"i": {"teamId": team["id"], "name": name, "color": remediation.REMEDIATION_LABEL_COLOR}})
        label = ((created or {}).get("issueLabelCreate") or {}).get("issueLabel") or {}
        if not label.get("id"):
            return None
        team["labels"]["nodes"].append({"id": label["id"], "name": label.get("name") or name})
        return label["id"]

    def apply_alert_label(self, issue_id: str | None, key: str) -> None:
        """Attach the alert's remediation label. No-op when the router flag is off."""
        if not issue_id:
            return
        try:
            label_id = self._remediation_label_id(key)
            if not label_id:
                return
            self.linear.gql(
                'mutation($id:String!,$l:String!){issueAddLabel(id:$id,labelId:$l){success}}',
                {"id": issue_id, "l": label_id})
        except Exception:
            return

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
            self.apply_alert_label(found, key)
            return found
        try:
            priority = 1 if key.startswith(("provider-idle:", "provider-down:", "pr-inventory-unavailable:")) or key in (
                "linear-down", "spawn-exit", "tick-error") else 2
            team = self._team()
            triage = next(s["id"] for s in team["states"]["nodes"] if s["name"] == "Triage")
            labels = [l["id"] for l in team["labels"]["nodes"] if l["name"] == "symphony"]
            remediation_label = self._remediation_label_id(key)
            if remediation_label:
                labels.append(remediation_label)
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

    def reopen(self, issue_id: str, text: str, key: str | None = None) -> None:
        try:
            self.linear.move(issue_id, "Triage")
            self.linear.comment(issue_id, f"🤖 doctor: fired again on `{self.host}` at {now_iso()}: {text}")
            if key:
                self.apply_alert_label(issue_id, key)
        except Exception:
            pass

    def close(self, issue_id: str, key: str | None = None) -> None:
        try:
            self.linear.comment(issue_id, f"🤖 doctor: cleared on `{self.host}` at {now_iso()}.")
            self.linear.move(issue_id, "Done")
            if key:
                self.apply_alert_label(issue_id, key)
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
                tracker.reopen(entry["id"], text, key)
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
                tracker.close(entry["id"], key)
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
    counts = obs.get("capacityByProvider") or {}
    throughput = lane.provider_throughput(
        obs.get("_receipts24h") or [],
        counts,
        obs.get("merged24h") or [],
        attribution_receipts=obs.get("_allReceipts") or [],
    )
    if obs.get("mergedAttributionError"):
        throughput["landedByAttribution"] = None
        throughput["landedByOrigin"] = None
        for metric in throughput["providers"].values():
            metric["landedOutput"] = None
            metric["issueToMergeSecondsP50"] = None
    idle_since = dict((previous or {}).get("idleQualifiedSince") or {})
    next_idle_since = {}
    account_state = obs.get("codexAttribution") or codex_attribution(obs.get("codex") or {}, obs["now"])
    for provider, metric in throughput["providers"].items():
        capacity = counts.get(provider, {"running": 0, "slots": 0})
        qualified = (obs.get("poolByProvider") or {}).get(provider)
        account_available = (account_state.get("unleasedAvailable") if provider == "codex" else None)
        metric["qualifiedWorkWaiting"] = qualified
        metric["eligibleNewWorkWaiting"] = (obs.get("eligiblePoolByProvider") or {}).get(provider)
        budget = (obs.get("newIssueBudgetByProvider") or {}).get(provider) or {}
        metric["newIssueBudget"] = budget
        metric["idleSlots"] = max(0, capacity["slots"] - capacity["running"])
        metric["idleReason"] = (
            "provider-disabled" if not capacity["slots"] else
            "admission-unreadable" if obs.get("linearError") else
            "pr-inventory-unavailable" if budget.get("reason") == "pr-inventory-unavailable" else
            "fully-utilized" if not metric["idleSlots"] else
            "open-pr-budget" if budget.get("reason") == "over-budget" else
            "terminal-pr-backlog" if budget.get("reason") == "terminal-pr-backlog" else
            "account-status-unknown" if provider == "codex" and account_state["state"] == "unknown" else
            "account-leases-occupied" if provider == "codex" and account_state["state"] == "leases-occupied" else
            "account-quota-banked" if provider == "codex" and account_state["state"] == "quota-banked" else
            "account-cooldown" if provider == "codex" and account_state["state"] == "cooldown" else
            "provider-unhealthy" if provider in (tick.get("unhealthy") or []) else
            "no-account-available" if provider == "codex" and account_available == 0 else
            "new-issue-admission-unknown" if qualified is None else
            "no-eligible-new-work" if not qualified else
            "capacity-idle-with-qualified-work" if metric["idleSlots"] else
            "fully-utilized"
        )
        wasting_codex = provider == "codex" and bool(qualified) and bool(account_available) and bool(metric["idleSlots"])
        if wasting_codex:
            started = float(idle_since.get(provider) or obs.get("now") or time.time())
            next_idle_since[provider] = started
            metric["accountIdleSecondsWhileQualifiedWorkExists"] = max(0, int((obs.get("now") or time.time()) - started))
        else:
            metric["accountIdleSecondsWhileQualifiedWorkExists"] = (
                None if obs.get("linearError") or qualified is None or
                (provider == "codex" and account_available is None) else 0)
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
    overlap = obs.get("fileOverlap")
    if not overlap:
        overlap = (file_overlap.doctor_view(host.state) if getattr(host, "state", None) else
                   {"mode": file_overlap.guard_mode(), "pairs": [], "metrics": {}})
    return {"schema": "symphony-lanes-status/v1", "at": now_iso(), "host": lane.HOST, "release": tick.get("release"),
            "fileOverlap": overlap,
            "lanes": counts, "running": sum(c["running"] for c in counts.values()),
            "idle": sum(max(0, c["slots"] - c["running"]) for c in counts.values()),
            "pool": obs.get("pool"), "candidatePool": obs.get("candidatePool"), "lastLandingAgeS": obs.get("lastLandingAge"),
            "admission": {"pool": obs.get("pool"), "candidatePool": obs.get("candidatePool"),
                          "semantics": "new Todo work after PR budget; slots, leases and PR maintenance are separate",
                          "eligiblePool": obs.get("eligiblePool"),
                          "eligiblePoolByProvider": obs.get("eligiblePoolByProvider") or {},
                          "newIssuePool": obs.get("pool"),
                          "newIssueBudgetByProvider": obs.get("newIssueBudgetByProvider") or {},
                          "poolByProvider": obs.get("poolByProvider") or {},
                          "candidatePoolByProvider": obs.get("candidatePoolByProvider") or {},
                          "rejectedByProvider": obs.get("rejectedByProvider") or {},
                          "designGate": obs.get("designGate"),
                          "error": obs.get("linearError")},
            "gateWaits24h": obs.get("gateWaits24h"),
            "gateWaitMedianS24h": obs.get("gateWaitMedianS24h"),
            "gateWaitMaxS24h": obs.get("gateWaitMaxS24h"),
            "codexAvailable": account_state.get("unleasedAvailable"),
            "codexAttribution": account_state,
            "alerts": alerts, "conditions": conditions or {},
            "diskFreePct": obs.get("diskFreePct"), "githubRemaining": obs.get("githubRemaining"),
            "held_by_reason": obs.get("heldByReason") or {}, "failed_by_reason": obs.get("failedByReason") or {},
            "throughput": throughput, "throughputError": obs.get("mergedAttributionError"),
            "mergedWindow": obs.get("mergedWindow"),
            "capacity": capacity,
            "prs": (obs.get("reconcile") or {}).get("counts") or {}, "_idleQualifiedSince": next_idle_since,
            "orphan_prs": (obs.get("reconcile") or {}).get("orphans") or [],
            "oldest_prs": [row for row in (obs.get("reconcile") or {}).get("dispositions") or []][:10],
            "dep_holds": (obs.get("reconcile") or {}).get("depHolds") or [],
            "slo": obs.get("slo"),
            "escalation": obs.get("escalation") or remediation.empty_escalation(),
            "remediation": obs.get("remediation") or remediation.empty_remediation(),
            "autoscale": _autoscale_block(host)}


def _autoscale_block(host) -> dict:
    state = getattr(host, "state", None)
    if state is None:
        return {"mode": autoscale.mode(), "lanes": {}, "history": []}
    try:
        return autoscale.public_block(state)
    except Exception:
        return {"mode": autoscale.mode(), "lanes": {}, "history": []}


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


def apply_linear_budget(result: dict, state: Path) -> None:
    """Copy the best-effort Linear snapshot onto the doctor report. Never raises."""
    try:
        budget = read_json(state / "api-budget.json", None)
        if not isinstance(budget, dict):
            return
        result["linearBudget"] = {key: budget.get(key)
                                  for key in ("remaining", "limit", "reset", "rateLimitedAt", "observedAt")}
    except Exception:
        return


def locked_doctor_write(state: Path, write) -> None:
    """Serialize doctor.json updates with the lane's budget stamp. A missing lock still writes."""
    handle = None
    try:
        state.mkdir(parents=True, exist_ok=True)
        handle = open(state / "doctor.lock", "a")
        fcntl.flock(handle, fcntl.LOCK_EX)
    except OSError:
        # flock can fail after open. Dropping the handle without closing it leaks an fd
        # on every doctor tick.
        if handle is not None:
            handle.close()
        handle = None
    try:
        write()
    finally:
        if handle is not None:
            fcntl.flock(handle, fcntl.LOCK_UN)
            handle.close()


def run(host, lane, codex, tracker: Tracker | None = None) -> dict:
    path = host.state / "doctor.json"
    previous = read_json(path, {})
    obs = observe(host, lane, codex)
    # remember when the pool first went empty so the alert needs 30 sustained minutes
    if new_work_empty(obs):
        previous["poolEmptySince"] = previous.get("poolEmptySince") or obs["now"]
    else:
        previous["poolEmptySince"] = None
    previous["providerIdleSince"] = provider_idle_since(obs, previous)
    previous["codexIdleSince"] = previous["providerIdleSince"].get("codex")  # old readers
    alerts = judge(obs, previous)
    conditions = condition_receipts(alerts, previous, obs, lane.HOST)
    if obs.get("linearSkipped"):
        tracker = None
    elif tracker is None and not os.environ.get("LANES_SELFTEST"):
        try:
            tracker = Tracker(lane.Linear(host.linear_env), lane.HOST)
        except Exception:
            tracker = None
    result = reconcile(alerts, previous, tracker, obs["now"], conditions)
    result["poolEmptySince"] = previous["poolEmptySince"]
    result["codexIdleSince"] = previous["codexIdleSince"]
    result["providerIdleSince"] = previous["providerIdleSince"]
    result["escalation"] = obs.get("escalation") or remediation.empty_escalation()
    result["remediation"] = obs.get("remediation") or remediation.empty_remediation()
    result["fileOverlap"] = obs.get("fileOverlap") or file_overlap.doctor_view(host.state)
    for key in ("eventsOpen", "eventsClaimed", "eventsHuman", "eventsExhausted"):
        result[key] = result["remediation"].get(key, 0)
    result["byFingerprint"] = result["remediation"].get("byFingerprint") or {}
    result["observed"] = {k: v for k, v in obs.items() if k not in ("tick", "codex", "_receipts24h", "_allReceipts")}
    result["autoscale"] = _autoscale_block(host)
    if obs.get("linearSkipped"):
        result["linearSkipped"] = obs["linearSkipped"]
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
    def write_report():
        apply_linear_budget(result, host.state)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(result, indent=1, default=str))
        os.replace(tmp, path)
    locked_doctor_write(host.state, write_report)
    return result
