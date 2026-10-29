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
import hashlib
import json
import os
import re
import shutil
import statistics
import subprocess
import sys
import tempfile
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import lifecycle  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
import autoscale  # noqa: E402  (sibling module of the release)
import pr_events  # noqa: E402  (sibling module of the release)
import design_gate  # noqa: E402  (design-brief admission census)
import gh_app_token  # noqa: E402  (canonical GitHub read-budget floor)
import merge_evidence  # noqa: E402  (shared complete merge-window reader)
import file_overlap  # noqa: E402
import fleet_ledger  # noqa: E402  (claim ledger view, ready-work recorder)
import factory_intake  # noqa: E402  (fleet-improvement signals -> agent-ready issues)
import factory_signals  # noqa: E402  (recurring-alarm adapter)
import linear_sync  # noqa: E402  (local Linear mirror and outbox status)
import pathlib as _pl, sys as _sys  # noqa: E402
_sys.path[:0] = [p for p in [str(_pl.Path(__file__).resolve().parent)] if p not in _sys.path]  # sibling module of the release
from atomic_state import atomic_write_text  # noqa: E402
import remediation  # noqa: E402
import shipping_attribution  # noqa: E402  (company merge provenance report)
import stage_events  # noqa: E402  (jovie-stage-event/v1 rows for the stage collector)
import ledger_archive  # noqa: E402  (bounded runs/ledger.jsonl)
import throughput_sentinel  # noqa: E402
import deploy_health  # noqa: E402  (production deploy failure and lag incidents, Jovie + LogYourBody)

COOL_OFF_S = 6 * 3600
NO_LANDING_S = 6 * 3600
# Workers spawning but no agent run starting or ending: the 2026-09-28 spawn-exit deadlock
# (every worker exited on claim), which looked busy to every other rule.
NO_WORK_S = 5 * 60
PROVIDER_IDLE_S = 5 * 60
# The idle-fallback tick runs every 5 min (install.sh); two cadences still prove a live tick.
TICK_FRESH_S = 10 * 60
ADMISSION_REPAIR_S = 5 * 60
DELIVERY_STALE_S = 2 * 3600
ESCALATION_S = 10 * 60
POOL_EMPTY_S = 30 * 60
HUD_STALE_S = 120
GATE_TIMEOUT_ALERT = 5
FAILED_RUN_ALERT = 10
# JOV-8931: a relayed red check must be claimed within this window of red_at.
RED_DISPATCH_CLAIM_GRACE_S = 180
RED_DISPATCH_LEDGER_LIMIT = 1024 * 1024
# The doctor judges 24h of receipts; ~8 days of the ledger at 2026-10-24 volume.
LEDGER_TAIL_BYTES = 16 * 1024 * 1024
# Repairs that ended before any agent work: each still spends one of the PR's bounded fix
# attempts (no refunds, by design), so a run of them exhausts PRs on infrastructure alone.
NO_WORK_REPAIR_VERDICTS = frozenset({"recovery-handoff", "reconcile-unavailable", "skipped"})
NO_WORK_REPAIR_ALERT = 6
DISK_MIN_PCT = 10
DISK_CRIT_PCT = 5
# Autoscale blocks growth (capacity held below base, blocker "disk-low") at or below
# autoscale.DISK_INCREASE_MIN free. Held that long with no alarm let merges collapse unseen
# on 2026-10-25, so a sustained hold raises its own incident naming the top consumers.
DISK_HELD_S = 30 * 60
DISK_TOP_REFRESH_S = 10 * 60
DISK_TOP_BUDGET_S = 45
GITHUB_MIN_REMAINING = gh_app_token.FLOOR
# An open PR older than this is a governor signal (JOV-7079): the cockpit names it and its
# disposition instead of letting it age silently.
AGED_PR_S = 7 * 24 * 3600
MERGE_THROUGHPUT_REFRESH_S = 5 * 60
MERGE_THROUGHPUT_CACHE_S = 10 * 60
PROMOTION_SCRIPT = Path(__file__).resolve().parents[1] / "promotion-loss-metrics.mjs"
QUOTA_DEFERRED_SCRIPT = Path(__file__).resolve().parents[1] / "quota-deferred-heads.mjs"
QUOTA_DEFERRED_REFRESH_S = 15 * 60  # about 100 REST reads per refresh; the lanes clock calls often
QUOTA_DRAIN_SCRIPT = Path(__file__).resolve().parents[1] / "lib" / "api-quota-report.mjs"
QUOTA_DRAIN_REFRESH_S = 15 * 60  # about 40 REST reads per refresh (one Enroll job list per run)
REPO_ROOT = Path(__file__).resolve().parents[2]
OPS_REPORT_SCRIPT = Path(__file__).resolve().with_name("ops-report.mjs")


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

def host_capacity(host, lane, now: float | None = None) -> dict:
    """Configured seats, including draining workers but not stale lock files."""
    now = time.time() if now is None else now
    capacity = {}
    for name, spec in lane.load_providers().items():
        enabled = spec.get("enabled", True)
        configured = spec.get("slots", 1)
        base = host.base_slots(name, configured) if enabled else 0
        slots = max(0, host.slots(name, configured)) if enabled else 0
        leases = [_active_lease(path, now) for path in (host.state / "slots").glob(f"{name}.*.lock")]
        leases = [lease for lease in leases if lease is not None]
        row = {"slots": slots, "running": len(leases), "base": base}
        if leases:
            ages = [lease["age"] for lease in leases if lease.get("age") is not None]
            row["leaseAgesComplete"] = len(ages) == len(leases)
            row["oldestLeaseAge"] = max(ages) if ages else None
        capacity[name] = row
    return capacity


def provider_payloads(state: Path, providers, proc: Path = Path("/proc")) -> dict:
    """Observe native Codex/Grok payload processes, separately from slot/account locks.

    A missing probe, unreadable candidate or changing PID stays unknown. A worker
    without a payload can be scanning, waiting or qualifying; never call it idle.
    """
    result = {name: {"known": False, "running": None, "pids": [],
                     "reason": "payload-probe-unavailable"} for name in providers}
    supported = set(providers) & {"codex", "grok"}
    if not proc.is_dir():
        return result
    try:
        entries = list(proc.iterdir())
    except OSError:
        return result
    for name in supported:
        result[name] = {"known": True, "running": 0, "pids": [], "reason": None}
    root = (state / "worktrees").resolve()
    binding_root = (state / "bindings").resolve()
    for entry in entries:
        if not entry.name.isdecimal():
            continue
        try:
            name = (entry / "comm").read_text().strip()
        except FileNotFoundError:
            if entry.exists():
                for provider in supported:
                    result[provider].update(known=False, reason="process-inventory-unreadable")
            continue  # A process that exited during enumeration cannot be executing.
        except (OSError, UnicodeError):
            for name in supported:
                result[name].update(known=False, reason="process-inventory-unreadable")
            continue
        if name not in supported:
            continue
        try:
            before = (entry / "stat").read_text().rsplit(") ", 1)[1].split()[19]
            args = (entry / "cmdline").read_bytes().split(b"\0")
            cwd = (entry / "cwd").resolve(strict=True)
            binding_parts = cwd.relative_to(binding_root).parts if binding_root in cwd.parents else ()
            managed_binding = len(binding_parts) >= 3 and binding_parts[1] == "worktrees"
            if cwd != root and root not in cwd.parents and not managed_binding:
                continue
            if Path(os.fsdecode(args[0])).name != name:
                continue
            if name == "codex":
                if b"exec" not in args[1:6]:
                    continue
            elif not any(arg == b"--prompt-file" and index + 1 < len(args)
                         and args[index + 1] and not args[index + 1].startswith(b"-")
                         for index, arg in enumerate(args)):
                continue
            after = (entry / "stat").read_text().rsplit(") ", 1)[1].split()[19]
            if before != after or (entry / "cwd").resolve(strict=True) != cwd:
                raise ValueError("process identity changed")
            result[name]["pids"].append(int(entry.name))
        except FileNotFoundError:
            if entry.exists():
                result[name].update(known=False, reason="payload-identity-unreadable")
        except (OSError, UnicodeError, ValueError, IndexError):
            result[name].update(known=False, reason="payload-identity-unreadable")
    for name in supported:
        result[name]["pids"].sort()
        result[name]["running"] = len(result[name]["pids"]) if result[name]["known"] else None
    return result


def _linear_app_credential(lane) -> bool | None:
    """Installed Jovie Lanes app credential (presence only; never read into the report).
    None where no host file applies (self-test, fixtures)."""
    tokens = getattr(lane, "linear_app_token", None)
    path = tokens.default_path() if tokens else None
    return None if path is None else bool(tokens.credentials(path))


# #22354 shipped the registry at canon/ (the repo-root allowlist rejects new top-level dirs).
# Reading a path that is not on main must alert, never read as "nothing silent" (2026-10-21:
# the doctor watched ops/automation/registry.jsonl, which never existed, so no row was checked).
AUTOMATION_REGISTRY = "canon/automation-registry.jsonl"
OUTCOME_OWED_MAX_S = 24 * 3600
OUTCOME_QUEUE_SILENT_S = 2 * 3600
AUTOMATION_LIVENESS_WORKFLOW = "automation-liveness.yml"
AUTOMATION_LIVENESS_MAX_S = 60 * 60
AUTOMATION_LIVENESS_TTL_S = 600


def _iso_epoch(value) -> float | None:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp() if value else None
    except ValueError:
        return None


def automation_registry(repo: Path, run=subprocess.run) -> list[dict] | None:
    """The canonical automation registry as merged on origin/main (never the checkout)."""
    try:
        shown = run(["git", "-C", str(repo), "show", f"origin/main:{AUTOMATION_REGISTRY}"],
                    capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.SubprocessError):
        return None
    if getattr(shown, "returncode", 1) != 0:
        return None
    rows = []
    for line in (shown.stdout or "").splitlines():
        try:
            row = json.loads(line)
        except ValueError:
            return None
        if isinstance(row, dict) and row.get("id"):
            rows.append(row)
    return rows


TEAM_RECEIPT = re.compile(r"^[A-Z][A-Z0-9]*$")


def _newest_receipt_mtime(path: Path) -> float:
    """mtime of a receipt. A `<TEAM>` path component is a per-team template (refill/<TEAM>.json): the newest
    receipt of any team counts. The watcher used to stat the literal `<TEAM>.json`, so gem:backlog-refill and
    gem:backlog-decompose read `missing` while their receipts were minutes old (2026-10-25)."""
    if "<TEAM>" not in path.name:
        return path.stat().st_mtime
    stem_prefix, _, suffix = path.name.partition("<TEAM>")
    found = []
    for candidate in path.parent.glob(f"{stem_prefix}*{suffix}"):
        team = candidate.name[len(stem_prefix):len(candidate.name) - len(suffix) if suffix else None]
        if TEAM_RECEIPT.fullmatch(team):
            found.append(candidate.stat().st_mtime)
    if not found:
        raise FileNotFoundError(str(path))
    return max(found)


def automation_watch(rows: list[dict] | None, host_name: str, now: float, home: Path | None = None) -> dict:
    """Host-local receipts of this host's live automations: missing or older than
    maxStalenessMinutes is silence. The hosted automation-liveness check watches Gem."""
    home = Path.home() if home is None else home
    if rows is None:
        return {"known": False, "silent": {}}
    silent = {}
    for row in rows:
        receipt = row.get("receipt") or {}
        if row.get("status") != "live" or row.get("host") != host_name or receipt.get("kind") != "host-local":
            continue
        location = str(receipt.get("location") or "")
        if not location.startswith(f"{host_name}:"):
            continue
        path = Path(location.split(":", 1)[1].replace("~", str(home), 1))
        limit = float(row.get("maxStalenessMinutes") or 0) * 60
        try:
            age = now - _newest_receipt_mtime(path)
        except OSError:
            silent[row["id"]] = {"location": location, "ageS": None}
            continue
        if limit and age > limit:
            silent[row["id"]] = {"location": location, "ageS": round(age)}
    return {"known": True, "silent": silent}


def automation_liveness(lane, now: float) -> dict:
    """Latest *successful* run of the hosted automation-liveness workflow (Gem watches it back).

    It follows Production Continuity Guard and runs its job only every 5th trigger, so most
    runs are job-skipped: the latest run of any conclusion would make a dead check look alive."""
    def fetch():
        result = lane.sh(["gh", "api", f"repos/{lane.REPO_SLUG}/actions/workflows/{AUTOMATION_LIVENESS_WORKFLOW}"
                          "/runs?branch=main&status=success&per_page=1",
                          "--jq", "[.workflow_runs[0].created_at // \"\"]"], timeout=30)
        if result.returncode != 0:
            text = f"{result.stdout or ''} {result.stderr or ''}"
            return {"installed": False} if "404" in text or "Not Found" in text else None
        try:
            created = json.loads(result.stdout)[0]
        except (ValueError, IndexError, TypeError):
            return None
        return {"installed": True, "lastRunAt": created or None}
    found = lane.shared("automation-liveness-success", AUTOMATION_LIVENESS_TTL_S, fetch)
    return found if isinstance(found, dict) else {"installed": None}


def automation_observation(host, lane, now: float) -> dict:
    """Registry watch for observe(); fixtures and self-tests read no registry or GitHub."""
    if os.environ.get("LANES_SELFTEST") or os.environ.get("LANES_EXECUTION_BACKEND") == "local-test":
        return {"automation": {"known": False, "silent": {}, "skipped": True},
                "automationLiveness": {"installed": None}}
    try:
        watch = automation_watch(automation_registry(host.repo), lane.HOST, now)
    except Exception as error:  # observability never takes the doctor down
        watch = {"known": False, "silent": {}, "error": type(error).__name__}
    try:
        liveness = automation_liveness(lane, now)
    except Exception as error:
        liveness = {"installed": None, "error": type(error).__name__}
    return {"automation": watch, "automationLiveness": liveness}


def qualified_pool(host, lane, capacity: dict, now: float) -> tuple[dict, int, dict, dict, dict]:
    """Apply the worker predicate instead of treating label inventory as runnable."""
    linear = lane.Linear(host.linear_env)
    failures = read_json(host.state / "failures.json", {})
    lane.load_github_env()
    in_flight = lane.in_flight_issues()
    if in_flight is None:
        raise RuntimeError("in-flight PR ownership unreadable; runnable pool unknown")
    in_flight = frozenset(identifier.lower() for identifier in in_flight)
    holds = lane.open_hotspot_holds()
    held_back = lane.held_back_issues(host, now)
    inventory = lane.overlap_inventory(host, linear)
    if inventory is None:
        raise RuntimeError("file-overlap ownership unreadable; runnable pool unknown")
    overlap_prs, overlap_tasks = inventory
    try:
        target_files = lane.pr_events.capture_target_file_witnesses(
            lane, overlap_prs, lane._SUMMARY.get("sourceAt"))
    except Exception:
        target_files = {}  # Unknown witness retains the ordinary conservative prediction.
    specs = lane.load_providers()
    candidates = {name: linear.lane_issues(specs[name]["label"])
                  for name, seats in capacity.items() if seats["slots"] > 0}
    # Confirmation and candidate reads happen after observe() sampled now.
    scope_now = max(now, time.time())
    target_files = lane.pr_events.revalidate_target_file_witnesses(target_files, overlap_prs, scope_now,
                                                                  lane.REPO_SLUG)
    qualified, rejected = {}, {}
    rejected_issues = {}
    for name in capacity:
        qualified[name], rejected[name] = [], {}
        # Work the router sends to another lane is not this lane's idle capacity (JOV-7706).
        route = lane.issue_router(host, name, specs) if hasattr(lane, "issue_router") else None
        duplicates = lane.pool_rejections(candidates.get(name, []), holds, target_files, scope_now)
        for issue in candidates.get(name, []):
            # Census key stays bounded: one bucket for all duplicate candidates.
            reason = duplicates.get(issue.identifier)
            if reason and not reason.startswith("hotspot-held:"):
                reason = "duplicate-candidate"
            if reason is None and issue.identifier in held_back:
                reason = "preserved-or-recovery-held"
            if reason is None:
                reason = lane.admission_rejection(issue, failures, now, in_flight, name, route)
            if reason is None:
                decision = file_overlap.admission_policy(
                    issue, overlap_prs, overlap_tasks, lane.workstreams.classify, target_files, scope_now)
                if not decision["allowed"]:
                    reason = "file-overlap-held"
            if reason is None:
                qualified[name].append(issue)
            else:
                bucket = "hotspot-held" if reason.startswith("hotspot-held:") else reason
                rejected[name][bucket] = rejected[name].get(bucket, 0) + 1
                # Per-issue view (bounded): the remediator surfaces
                # route-held/over-budget per selected issue without host access.
                rejected_issues[issue.identifier] = reason
    counts = {name: len(candidates.get(name, [])) for name in capacity}
    return (
        qualified,
        len({issue.identifier for issues in candidates.values() for issue in issues}),
        counts,
        rejected,
        rejected_issues,
    )


def observe(host, lane, codex, now: float | None = None) -> dict:
    """Everything the doctor judges, gathered once from local state and bounded API reads."""
    sample_clock = time.time if now is None else lambda: now
    now = sample_clock()
    state = host.state
    tick = read_json(state / "tick.json", {})
    ledger_evidence = shipping_attribution.read_ledger(state / "runs" / "ledger.jsonl", tail_bytes=LEDGER_TAIL_BYTES)
    ledger_evidence["remoteIngest"] = tick.get("shippingOriginIngest")
    all_receipts = ledger_evidence["rows"]
    receipts = [receipt for receipt in all_receipts
                if (ended := age_s(receipt.get("endedAt"), now)) is not None and ended <= 86400]
    landings = [age_s(r.get("endedAt"), now) for r in receipts if r.get("verdict") in ("landing", "verified-not-queued")]
    try:
        accounts = codex.status()
    except Exception as error:
        accounts = {"error": str(error)[:80], "accounts": {}, "available": []}
    account_observed_at = sample_clock()
    capacity_by_provider = host_capacity(host, lane, now)
    busy_capacity = [row for row in capacity_by_provider.values() if row["running"]]
    known_lease_ages = [row["oldestLeaseAge"] for row in busy_capacity
                        if row.get("oldestLeaseAge") is not None]
    design_census = None
    linear_skipped = None
    try:
        client = lane.Linear(host.linear_env)
        if lane.linear_cooldown_until(client.key) is not None:
            linear_skipped = "cooldown"
    except (Exception, SystemExit):
        linear_skipped = None
    # The runnable pool comes from the local Linear mirror, so a Linear cooldown no longer
    # hides it; the cooldown still skips the doctor's own Linear writes below.
    try:
        (qualified_by_provider, candidate_pool, candidate_counts,
         rejected, rejected_issues) = qualified_pool(host, lane, capacity_by_provider, now)
        design_census = design_gate.apply_to_pool(
            qualified_by_provider, read_text=design_gate.repo_reader(host.repo))
        eligible_by_provider = {name: len(issues) for name, issues in qualified_by_provider.items()}
        eligible_pool = len({issue.identifier for issues in qualified_by_provider.values() for issue in issues})
        budgets = {name: lane.read_new_issue_budget(name, seats.get("base", seats["slots"]))
                   for name, seats in capacity_by_provider.items()}
        qualified_by_provider = {name: issues if budgets[name]["allowed"] else []
                                 for name, issues in qualified_by_provider.items()}
        pool_by_provider = {name: len(issues) for name, issues in qualified_by_provider.items()}
        qualified_jobs = {name: [issue.identifier for issue in issues]
                          for name, issues in qualified_by_provider.items()}
        pool = (None if any(value is None for value in pool_by_provider.values()) else
                len({issue.identifier for issues in qualified_by_provider.values() for issue in issues}))
        linear_error = None
    except (Exception, SystemExit) as error:
        design_census = None
        pool, candidate_pool, pool_by_provider, qualified_jobs, linear_error = None, None, {}, {}, f"{type(error).__name__}: {error}"[:100]
        candidate_counts, rejected, rejected_issues = {}, {}, {}
        eligible_pool, eligible_by_provider, budgets = None, {}, {}
    github = None
    merged, merged_error, merged_window, merge_throughput, merge_throughput_error = [], None, None, None, None
    merged_projects = {}
    try:
        lane.load_github_env()
        budget = lane.graphql_budget()
        github = budget[0] if budget else None
        if not os.environ.get("LANES_SELFTEST"):
            merged_window = merge_evidence.collect_shared(lane.REPO_SLUG, now - 86400, now,
                                                          state / "merge-window.json")
            merged_projects[lane.REPO_SLUG] = merged_window
            # Keep validated observed events for positive exact-head joins even
            # when the provider cannot certify the population denominator.
            merged = merged_window.get("prs") or []
            merged = merge_evidence.require_complete(merged_window)
    except merge_evidence.IncompleteMergeEvidence as error:
        merged_error = str(error)
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.SubprocessError):
        merged_error = "github-budget-unreadable"
    if not os.environ.get("LANES_SELFTEST"):
        for project in shipping_attribution.PROJECTS:
            repository = project["repository"]
            if repository in merged_projects:
                continue
            cache_name = "merge-window-" + repository.rsplit("/", 1)[-1].lower() + ".json"
            try:
                merged_projects[repository] = merge_evidence.collect_shared(
                    repository, now - 86400, now, state / cache_name)
            except (OSError, ValueError, KeyError, RuntimeError, subprocess.SubprocessError):
                merged_projects[repository] = {
                    "schema": "jovie-merge-window/v1", "complete": False,
                    "reason": "fetch_failed", "window": {"since": now - 86400, "until": now},
                    "pages": 0, "scans": 0, "prs": [],
                }
    if not os.environ.get("LANES_SELFTEST"):
        try:
            merge_throughput, merge_throughput_error = sample_merge_throughput(state, now)
        except (OSError, ValueError, KeyError, RuntimeError, subprocess.SubprocessError) as error:
            merge_throughput_error = f"{type(error).__name__}: {error}"[:200]
    quota_deferred, quota_deferred_error = None, None
    if not os.environ.get("LANES_SELFTEST"):
        quota_deferred, quota_deferred_error = sample_quota_deferred_heads(state, now)
    quota_drain, quota_drain_error = None, None
    if not os.environ.get("LANES_SELFTEST"):
        quota_drain, quota_drain_error = sample_quota_drain(state, now)
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
    stranded_claims = fleet_ledger.stranded(state, now)
    if not os.environ.get("LANES_SELFTEST"):
        fleet_ledger.record_ready(state, now, capacity_by_provider, eligible_by_provider)
    return {
        "now": now, "tick": tick, "tickAge": age_s(tick.get("at"), now),
        "gateTimeouts24h": sum(1 for r in receipts if r.get("verdict") == "gate-timeout"),
        # Per-PR seat-queue time from run receipts: the measured input for gate-capacity
        # decisions (more seats vs a second host), not an assumption.
        "gateWaits24h": len(gate_waits),
        "gateWaitMedianS24h": int(statistics.median(gate_waits)) if gate_waits else None,
        "gateWaitMaxS24h": int(max(gate_waits)) if gate_waits else None,
        "failed24h": sum(1 for r in receipts if r.get("verdict") == "failed"),
        "noWorkRepairs24h": dict(Counter(
            (r.get("reasons") or ["?"])[0].split(":", 1)[0] for r in receipts
            if r.get("kind") == "fix-red" and r.get("verdict") in NO_WORK_REPAIR_VERDICTS)),
        "refundedNoWorkRepairs24h": sum(1 for r in receipts if r.get("kind") == "fix-red"
                                       and r.get("verdict") in NO_WORK_REPAIR_VERDICTS
                                       and r.get("attemptRefunded")),
        "lastLandingAge": min(landings) if landings else None, "runs24h": len(receipts),
        "lastWorkAge": min((age_s(r.get("endedAt"), now) for r in receipts if r.get("kind") != "sync-main"), default=None),
        # Per-provider age of the last clean claim-scan exit: proves spawned workers reach the
        # scan, so their exit is 'nothing claimable', not the spawn-exit deadlock.
        "idleExitAge": {name: age_s((row or {}).get("at"), now)
                        for name, row in idle_exit.items() if isinstance(row, dict)},
        "worktrees": len(list((state / "worktrees").glob("*"))),
        "busy": sum(seats["running"] for seats in capacity_by_provider.values()),
        "leaseAgesComplete": all(row.get("leaseAgesComplete") is True for row in busy_capacity),
        "oldestLeaseAge": max(known_lease_ages) if known_lease_ages else None,
        "capacityByProvider": capacity_by_provider,
        "providerPayloads": provider_payloads(state, capacity_by_provider),
        "codex": accounts, "pool": pool, "candidatePool": candidate_pool, "poolByProvider": pool_by_provider,
        "eligiblePool": eligible_pool, "eligiblePoolByProvider": eligible_by_provider,
        "newIssueBudgetByProvider": budgets, "openPRCount": len(open_numbers) if open_numbers is not None else None,
        "codexAttribution": codex_attribution(accounts, account_observed_at),
        "qualifiedJobsByProvider": qualified_jobs,
        "candidatePoolByProvider": candidate_counts, "rejectedByProvider": rejected,
        # Per-issue rejection reasons (bounded to 20, deterministic order) so
        # route-held:frontier / over-budget on a specific bridged/agent-ready
        # issue is visible without host access (read by the remediator).
        "rejectedIssues": dict(sorted(rejected_issues.items())[:20]),
        "designGate": design_census,
        "fileOverlap": file_overlap.doctor_view(state),
        **automation_observation(host, lane, now),
        "outcomeQueue": read_json(state / "outcome-queue.json", {}),
        "deployHealth": deploy_health.sample(state, now)[0] if not os.environ.get("LANES_SELFTEST") else None,
        "sentinel": throughput_sentinel.observe(
            state, now, receipts,
            {"inventoryBytes": getattr(lane, "REPAIR_INVENTORY_MAX_BYTES", 16 * 1024 * 1024)},
            fetch_remote=not os.environ.get("LANES_SELFTEST")),
        "linearError": linear_error, "linearSkipped": linear_skipped, "githubRemaining": github,
        "linearSync": linear_sync.status(state, now),
        "publicFeed": read_json(state / "public-feed-sizes.json", {}),
        "installLag": {key: read_json(state / "update.json", {}).get(key) for key in ("behindS", "behindCommit", "error", "at")},
        "linearAppCredential": _linear_app_credential(lane),
        "strandedClaims": stranded_claims,
        "ownership": {key: value for key, value in read_json(state / "ownership.json", {}).items()
                      if key not in ("ownerlessSince", "evidenceNoted", "moved", "claimsReleased")},
        "merged24h": merged, "mergedAttributionError": merged_error,
        "mergeThroughput": merge_throughput, "mergeThroughputError": merge_throughput_error,
        "autoscale": _autoscale_block(host),
        "mergedWindow": ({k: v for k, v in merged_window.items() if k != "prs"} if merged_window else None),
        "diskFreePct": round(100 * disk.free / disk.total, 1),
        "sweepSecretHeld": [row for row in (read_json(state / "worktree-sweep.json", {}).get("secretHeld") or [])
                            if isinstance(row, dict) and row.get("path") and Path(row["path"]).exists()],
        "hudExpected": (state / "hud.expected").exists(), "hudBeatAge": hud_beat,
        "heldByReason": pr_events.by_reason(held, open_numbers),
        "reconcile": read_json(state / "reconcile.json", {}),
        "quotaDeferredHeads": quota_deferred, "quotaDeferredHeadsError": quota_deferred_error,
        "quotaDrain": quota_drain, "quotaDrainError": quota_drain_error,
        "redDispatch": red_dispatch_summary(state, now),
        "failedByReason": failed_by_reason(failures),
        "escalation": remediation.escalation_summary(read_json(state / "escalation.json", {}), all_receipts, now),
        "remediation": remediation.remediation_summary(read_json(state / "escalation.json", {}), all_receipts, now),
        "operatorDraining": lifecycle.draining(state),
        "_receipts24h": receipts, "_allReceipts": all_receipts,
        "_ledgerEvidence": ledger_evidence, "_mergeEvidenceByRepository": merged_projects,
    }


def red_dispatch_summary(state: Path, now: float) -> dict:
    """JOV-8931: relayed red checks with no lane claim inside the grace window.
    Rows join the CI timing collector (JOV-8933) on (pr, sha, runId, runAttempt)."""
    rows = []
    try:
        raw = (state / "runs/red-dispatch.jsonl").read_text()
    except OSError:
        raw = ""
    if len(raw) <= RED_DISPATCH_LEDGER_LIMIT:
        for line in raw.splitlines():
            try:
                row = json.loads(line)
            except ValueError:
                continue
            if isinstance(row, dict):
                rows.append(row)
    claimed = {(row.get("pr"), row.get("sha"))
               for row in rows if row.get("status") == "claimed"}
    unclaimed = []
    for row in rows:
        if row.get("status") != "dispatched":
            continue
        epoch = row.get("redAtEpoch")
        pr = row.get("pr")
        if not isinstance(epoch, (int, float)) or not isinstance(pr, int):
            continue
        if (pr, row.get("sha")) in claimed:
            continue
        age = now - epoch
        if age < RED_DISPATCH_CLAIM_GRACE_S:
            continue
        unclaimed.append({"pr": pr, "sha": row.get("sha"), "redAt": row.get("redAt"),
                          "dispatchedAt": row.get("dispatchedAt"), "ageS": age})
    return {"graceS": RED_DISPATCH_CLAIM_GRACE_S, "unclaimed": unclaimed}


def open_pr_numbers() -> set[int] | None:
    """Open PR numbers, so held counts leave out merged and closed PRs; None counts every record."""
    if os.environ.get("LANES_SELFTEST"):
        return None
    try:
        result = lifecycle.run(["gh", "pr", "list", "--repo", pr_events.REPO, "--state", "open", "--limit", "500",
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
    state = lane.lane_state_dir()
    return merge_evidence.require_complete(merge_evidence.collect_shared(
        lane.REPO_SLUG, now - 86400, now, state / "merge-window.json" if state else None))


def sample_merge_throughput(state: Path, now: float, run=lifecycle.run) -> tuple[dict | None, str | None]:
    """Refresh the one-hour GitHub queue signal at most every five minutes."""
    path = Path(state) / "merge-throughput.json"
    cached = read_json(path, {})
    observed = cached.get("observedAt")
    if isinstance(observed, (int, float)) and not isinstance(observed, bool) \
            and 0 <= now - observed < MERGE_THROUGHPUT_REFRESH_S:
        return cached, None
    try:
        result = run(
            ["node", str(PROMOTION_SCRIPT), "--since", "1h", "--until", epoch_iso(now), "--json", "--autoscale"],
            capture_output=True, text=True, timeout=90)
        if result.returncode != 0:
            raise RuntimeError((result.stderr or result.stdout or f"exit {result.returncode}").strip()[-160:])
        metrics = json.loads(result.stdout)
        occupancy, wait, intake, ejections = (
            metrics.get("occupancy") or {}, metrics.get("queueWaitMinutes") or {},
            metrics.get("intake") or {}, metrics.get("ejections") or {})
        signal = {
            "schema": "symphony-merge-throughput/v1",
            "observedAt": now,
            "windowHours": (metrics.get("window") or {}).get("hours"),
            "queueDepth": occupancy.get("inQueue"),
            "queueWaitP50Minutes": wait.get("p50"),
            "mergedPerHour": intake.get("mergesPerHour"),
            "openedPerHour": intake.get("opensPerHour"),
            "ejectionRate": ejections.get("rate"),
        }
        required = ("queueDepth", "mergedPerHour", "openedPerHour")
        if any(isinstance(signal[key], bool) or not isinstance(signal[key], (int, float)) for key in required):
            raise ValueError("merge-throughput output missing required numeric signals")
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(signal, indent=1, sort_keys=True))
        os.replace(tmp, path)
        return signal, None
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        if isinstance(observed, (int, float)) and not isinstance(observed, bool) \
                and 0 <= now - observed <= MERGE_THROUGHPUT_CACHE_S:
            return cached, f"{type(error).__name__}: {error}"[:200]
        return None, f"{type(error).__name__}: {error}"[:200]


def sample_quota_deferred_heads(state: Path, now: float, run=lifecycle.run) -> tuple[dict | None, str | None]:
    """Open PR heads whose Fleet Rules verdict stayed quota-deferred past an hour (a deferred
    result is infrastructure, never a verdict, and must have been re-run). Refreshed at most
    every QUOTA_DEFERRED_REFRESH_S; the script exits 1 when there are any, so both codes parse."""
    path = Path(state) / "quota-deferred-heads.json"
    cached = read_json(path, {})
    observed = cached.get("observedAt")
    if isinstance(observed, (int, float)) and not isinstance(observed, bool) \
            and 0 <= now - observed < QUOTA_DEFERRED_REFRESH_S:
        return cached, None
    try:
        result = run(["node", str(QUOTA_DEFERRED_SCRIPT)], capture_output=True, text=True, timeout=240)
        if result.returncode not in (0, 1):
            raise RuntimeError((result.stderr or result.stdout or f"exit {result.returncode}").strip()[-160:])
        metric = json.loads(result.stdout)
        if metric.get("metric") != "quota_deferred_heads_older_than_1h" \
                or isinstance(metric.get("value"), bool) or not isinstance(metric.get("value"), int):
            raise ValueError("quota-deferred-heads output missing the metric")
        signal = {"schema": "jovie-quota-deferred-heads/v1", "observedAt": now,
                  "value": metric["value"], "heads": (metric.get("heads") or [])[:20]}
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(signal, indent=1, sort_keys=True))
        os.replace(tmp, path)
        return signal, None
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        return (cached if cached.get("schema") else None), f"{type(error).__name__}: {error}"[:200]


def sample_quota_drain(state: Path, now: float, run=lifecycle.run) -> tuple[dict | None, str | None]:
    """Buckets of the repo's GitHub installation projected to run dry before their hourly reset,
    from `api-quota-report.mjs drain --json` (exit 3 when there are any, so 0 and 3 both parse).
    Refreshed at most every QUOTA_DRAIN_REFRESH_S; a failed read keeps the last good signal."""
    path = Path(state) / "quota-drain.json"
    cached = read_json(path, {})
    observed = cached.get("observedAt")
    if isinstance(observed, (int, float)) and not isinstance(observed, bool) \
            and 0 <= now - observed < QUOTA_DRAIN_REFRESH_S:
        return cached, None
    try:
        result = run(["node", str(QUOTA_DRAIN_SCRIPT), "drain", "--json", "--hours", "1"],
                     capture_output=True, text=True, timeout=240)
        if result.returncode not in (0, 3):
            raise RuntimeError((result.stderr or result.stdout or f"exit {result.returncode}").strip()[-160:])
        line = next((row for row in (result.stdout or "").splitlines() if row.startswith("{")), "")
        report = json.loads(line)
        if report.get("schema") != "jovie-actions-quota-drain/v1" or not isinstance(report.get("alerts"), list):
            raise ValueError("quota drain output missing the schema")
        signal = {"schema": "jovie-quota-drain/v1", "observedAt": now, "alerts": report["alerts"][:8]}
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(signal, indent=1, sort_keys=True))
        os.replace(tmp, path)
        return signal, None
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        return (cached if cached.get("schema") else None), f"{type(error).__name__}: {error}"[:200]


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


def delivery_evidence(obs: dict, previous: dict) -> dict:
    """Join observed merge events to local exact-head coding receipts.

    Gate success and another host's merge cannot clear a local delivery failure.
    No added collector, API calls, claim authority or provider routes.
    """
    now = obs["now"]
    window = obs.get("mergedWindow") or {}
    bounds = window.get("window") or {}
    fresh = (isinstance(bounds.get("until"), (int, float))
                and 0 <= now - bounds["until"] <= MERGE_THROUGHPUT_CACHE_S
                and isinstance(bounds.get("since"), (int, float))
                and bounds["since"] <= now - DELIVERY_STALE_S)
    complete = fresh and window.get("complete") is True and not obs.get("mergedAttributionError")
    observed = (fresh and merge_evidence.search_observations(
                    {**window, "prs": obs.get("merged24h") or []}, "JovieInc/Jovie")
                and window.get("providerEnumerationComplete") is True
                and window.get("reason") == merge_evidence.SEARCH_COVERAGE_REASON)
    delivered = []
    useful = []
    for row in obs.get("_allReceipts") or []:
        head = row.get("headAfter") if row.get("kind") == "fix-red" else row.get("headSha")
        ended = age_s(row.get("endedAt"), now)
        if (row.get("agentExit") != 0 or isinstance(row.get("agentExit"), bool)
                or row.get("verdict") not in ("fix-pushed", "landing", "verified-not-queued")
                or (row.get("kind") == "fix-red" and head == row.get("headBefore"))
                or not isinstance(head, str) or not re.fullmatch(r"[0-9a-f]{40}", head)
                or type(row.get("pr")) is not int or ended is None or ended < 0):
            continue
        useful.append({"pr": row["pr"], "headSha": head, "runId": row.get("runId"),
                       "provider": row.get("provider"), "endedAt": row["endedAt"]})
        if not (complete or observed):
            continue
        for pr in obs.get("merged24h") or []:
            merge_age = age_s(pr.get("mergedAt"), now)
            merge_commit = (pr.get("mergeCommit") or {}).get("oid")
            if (pr.get("number") == row["pr"] and pr.get("headRefOid") == head
                    and isinstance(merge_commit, str) and re.fullmatch(r"[0-9a-f]{40}", merge_commit)
                    and merge_age is not None and 0 <= merge_age <= ended):
                delivered.append({**useful[-1], "mergedAt": pr["mergedAt"], "mergeCommit": merge_commit})
    latest = max(delivered, key=lambda row: row["mergedAt"], default=None)
    capacity = obs.get("capacityByProvider") or {}
    # Lifecycle intentionally holds on malformed/unreadable requests too. A hold
    # blocks intake but never proves an authorized pause or delivery recovery.
    held = obs.get("operatorDraining") is True
    paused = bool(capacity) and all(row.get("base", row.get("slots")) == 0 for row in capacity.values())
    # Only post-budget qualified work grants demand. Held work is diagnosed by
    # its existing admission/ownership condition, never force-admitted here.
    known = (type(obs.get("pool")) is int and not obs.get("linearSkipped") and bool(capacity)
             and isinstance(obs.get("tickAge"), (int, float)) and 0 <= obs["tickAge"] <= TICK_FRESH_S)
    tick = obs.get("tick") or {}
    healthy = [name for name, seats in capacity.items() if seats.get("slots", 0) > 0
               and name in tick.get("spawned", []) and not tick.get("error")
               and (tick.get("disk") or {}).get("admitted") is True
               and name not in tick.get("unhealthy", [])]
    qualified = obs.get("poolByProvider") or {}
    runnable = sum(qualified.get(name) or 0 for name in healthy)
    census = obs.get("reconcile") or {}
    census_age = age_s(census.get("at"), now)
    admitted = []
    if census_age is not None and 0 <= census_age <= pr_events.RECONCILE_S:
        for row in census.get("dispositions") or []:
            if row.get("state") not in ("ready", "queued"):
                continue
            matched = next((run for run in useful if run["pr"] == row.get("pr")
                            and run["headSha"] == row.get("headSha")), None)
            if matched:
                admitted.append({"pr": row["pr"], "headSha": row["headSha"], "state": row["state"]})
    waiting = known and (runnable > 0 or bool(admitted)) and not paused and not held
    since = previous.get("deliveryDemandSince")
    if held or paused or (known and not waiting):
        since = None
    elif waiting:
        since = since if isinstance(since, (float, int)) else now
    if latest and since is not None:
        merged_epoch = now - age_s(latest["mergedAt"], now)
        if merged_epoch >= since:
            since = now if waiting else None
    status = ("controller-held" if held else "intentional-pause" if paused else "no-eligible-work" if known and new_work_empty(obs)
              else "unknown" if not complete or not known
              else "eligible-work" if waiting else "admission-blocked")
    stale = status == "eligible-work" and since is not None and now - since >= DELIVERY_STALE_S
    return {"schema": "jovie-lane-delivery/v1", "state": "stalled" if stale else status,
            "demandSince": since, "staleAfterSeconds": DELIVERY_STALE_S,
            "mergeEvidenceComplete": complete, "lastUsefulExecution": max(useful, key=lambda r: r["endedAt"], default=None),
            "observedMergeEvidence": bool(observed),
            "lastDeliveredMerge": latest, "deployedVerification": None,
            "admission": {"eligiblePool": obs.get("eligiblePool"), "runnablePool": runnable if known else None,
                          "admittedLocalOutputs": admitted,
                          "budgets": obs.get("newIssueBudgetByProvider") or {}},
            "workerLiveness": {"busySlots": obs.get("busy"), "capacity": capacity,
                               "providerPayloads": obs.get("providerPayloads")}}


def _active_lease(path: Path, now: float) -> dict | None:
    """Current kernel ownership plus best-effort acquisition age from its fenced writer."""
    if not _locked(path):
        return None
    owner = read_json(path, {})
    age = age_s(owner.get("acquiredAt"), now)
    return {"age": max(0.0, age) if age is not None else None}


def provider_idle_with_qualified_work(obs: dict, provider: str) -> bool:
    """The tick attempted recovery, but at least one configured slot remains vacant."""
    capacity = (obs.get("capacityByProvider") or {}).get(provider) or {}
    pool = (obs.get("poolByProvider") or {}).get(provider)
    tick = obs.get("tick") or {}
    account_state = obs.get("codexAttribution") or codex_attribution(obs.get("codex") or {}, obs["now"])
    account_ready = provider != "codex" or bool(account_state.get("unleasedAvailable"))
    slots, running = capacity.get("slots"), capacity.get("running")
    vacant = (type(slots) is int and type(running) is int and 0 <= running < slots)
    return bool(pool and account_ready and vacant
                and provider in (tick.get("spawned") or []) and provider not in (tick.get("unhealthy") or []))


def disk_held(obs: dict) -> bool:
    free = obs.get("diskFreePct")
    return free is not None and free <= autoscale.DISK_INCREASE_MIN


def top_disk_consumers(state: Path, budget_s: float = DISK_TOP_BUDGET_S, run=subprocess.run) -> list[dict]:
    """Largest of the usual suspects, measured with a shared time budget (du over a full
    worktree tree can take minutes on a loaded host; whatever finishes is reported)."""
    home = Path.home()
    roots = [state / "worktrees", state / "runs", home / "codex-worktrees", home / "grok-wt", home / "gem-workspace",
             home / ".cache", home / ".npm", home / "symphony-elixir-workspaces", Path("/tmp")]
    deadline, rows = time.monotonic() + budget_s, []
    for root in roots:
        left = deadline - time.monotonic()
        if left <= 1 or not root.exists():
            continue
        try:
            out = run(["du", "-xsk", str(root)], capture_output=True, text=True, timeout=left).stdout.split()
            rows.append({"path": str(root), "gib": round(int(out[0]) / 1048576, 1)})
        except (OSError, subprocess.SubprocessError, ValueError, IndexError):
            continue
    return sorted(rows, key=lambda row: -row["gib"])[:5]


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
        free = row.get("freeSlots", 0 if row["leased"] else 1)
        counts["unleasedAvailable"] += (free if type(free) is int and free >= 0 else int(not row["leased"])) \
            if row["available"] else 0
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


def admission_repair_holds(obs: dict) -> list[str] | None:
    """Providers whose known PR budgets block an otherwise qualified pool.

    A transient cap is normal backpressure while existing PR recovery starts. Unknown
    inventory cannot prove either a new alarm or recovery of an existing one.
    """
    budgets = obs.get("newIssueBudgetByProvider") or {}
    if obs.get("eligiblePool") is None or obs.get("pool") is None or any(
            budget.get("reason") == "pr-inventory-unavailable" for budget in budgets.values()):
        return None
    if not obs.get("eligiblePool") or obs.get("pool") != 0:
        return []
    return sorted(name for name, budget in budgets.items()
                  if budget.get("reason") in {"over-budget", "terminal-pr-backlog"})


# ---------------------------------------------------------------- judgement

# Measured on Gem (59 releases since 2026-10-23): install lag p50 22 min, p80 85, p95 215. Alert past p80.
INSTALL_LAG_ALERT_S = 90 * 60
# SLO: a lane-affecting main commit is installed on Gem within 2h. Past it with the updater refusing
# or backing off the cause is a defect, not a wait, so it is critical and owned (2026-10-26 to 10-29:
# Gem sat three days on one release while `install-lag` stayed a degraded alert nobody acted on).
INSTALL_LAG_P0_S = 2 * 3600


def judge(obs: dict, previous: dict | None = None) -> dict[str, str]:
    """Stable key -> one-line cause. Pure, so every rule has a test."""
    alerts = {}
    tick = obs.get("tick") or {}
    if tick.get("error"):
        alerts["tick-error"] = f"last dispatch tick failed: {tick['error'][:140]}"
    if tick.get("uncleanPreviousRun"):
        # A run-intent marker survived its own tick: that tick was killed (crash, SIGKILL,
        # power loss). Its bounded recovery already refunded stranded fix-attempt charges.
        refunded = len(((tick.get("uncleanRecovery") or {}).get("refundedFixAttempts")) or [])
        alerts["lanes-tick-unclean"] = (f"the previous lanes tick terminated without a clean receipt "
                                        f"(pid {tick['uncleanPreviousRun'].get('pid')}); recovery refunded "
                                        f"{refunded} stranded fix-attempt charge(s); check the host journal for the kill cause")
    # JOV-8931: the relay's wake path fired, fix-now dispatched, but no lane
    # agent claimed within the grace window — the fast path is silently down.
    for row in (obs.get("redDispatch") or {}).get("unclaimed") or []:
        alerts[f"red-dispatch-unclaimed:{row.get('pr')}"] = (
            f"PR {row.get('pr')} went red at {row.get('redAt')}, dispatched to the lanes at "
            f"{row.get('dispatchedAt')}, still unclaimed {int(row.get('ageS') or 0)}s after red_at; "
            "check gem worker slots and the wake dir")
    delivery = tick.get("remediationEvents") or {}
    delivery_error = tick.get("remediationEventsError")
    if delivery.get("deliveryFailed") or delivery.get("deliveryExhausted"):
        # Terminal exhausted rows are a visible failure, not silence: they never retry.
        alerts["remediation-delivery"] = (
            "remediation action lacks authoritative acknowledgement; "
            f"failed={delivery.get('deliveryFailed', 'unknown')}, "
            f"exhausted={delivery.get('deliveryExhausted', 'unknown')}, "
            f"next retry={delivery.get('deliveryNextAt', 'unknown')}"
            + (f", reconciliation error={delivery_error}" if delivery_error else "")
            + "; inspect event-delivery.json")
    elif delivery_error:
        status_error = tick.get("remediationDeliveryStatusError")
        journal = ("journal status unavailable"
                   if status_error else
                   f"journal failed={delivery.get('deliveryFailed', 'unknown')}, "
                   f"exhausted={delivery.get('deliveryExhausted', 'unknown')}, "
                   f"next retry={delivery.get('deliveryNextAt', 'unknown')}")
        alerts["remediation-delivery"] = (
            f"remediation reconciliation failed before a healthy delivery pass; error={delivery_error}; "
            f"{journal}"
            + (f", status error={status_error}" if status_error else "")
            + "; inspect event-delivery.json")
    elif ((previous or {}).get("conditions") or {}).get("remediation-delivery", {}).get("state") == "active":
        observed = delivery.get("deliveryObservedAt")
        confirmed = (isinstance(observed, (int, float)) and 0 <= obs["now"] - observed <= 180
                     and not delivery.get("deliveryBusy") and delivery.get("deliveryPending") == 0
                     and delivery.get("deliveryFailed") == 0)
        if not confirmed:
            alerts["remediation-delivery"] = "remediation delivery remains unverified; retain prior failure owner and deadline"
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
    delivery = obs.get("delivery") or {}
    if delivery.get("state") == "stalled":
        alerts["delivery-stalled"] = (
            "qualified admitted work has no exact-head locally executed merge for 2h; "
            "investigate, repair and verify through existing leases and native delivery gates. "
            "Routine recovery is authorized. Receipt: " + json.dumps(delivery, sort_keys=True))
    elif (previous or {}).get("alerts", {}).get("delivery-stalled"):
        old = ((previous or {}).get("conditions") or {}).get("delivery-stalled") or {}
        merged = delivery.get("lastDeliveredMerge") or {}
        delivered_after_alarm = ((delivery.get("mergeEvidenceComplete") or delivery.get("observedMergeEvidence"))
                                 and merged.get("mergedAt")
                                 and merged["mergedAt"] >= old.get("firstObservedAt", "~"))
        if not delivered_after_alarm and delivery.get("state") not in ("no-eligible-work", "intentional-pause"):
            alerts["delivery-stalled"] = previous["alerts"]["delivery-stalled"]
    waiting = pool or obs.get("openPRCount")
    github_reads_held = (obs.get("githubRemaining") is not None
                         and obs["githubRemaining"] < GITHUB_MIN_REMAINING)
    for name, budget in (obs.get("newIssueBudgetByProvider") or {}).items():
        if budget.get("reason") == "pr-inventory-unavailable":
            # The shared GitHub guard deliberately stops polling below its read floor.
            # Report that once as github-quota instead of opening one derivative issue
            # per provider; new-issue admission remains fail-closed either way.
            if github_reads_held and budget.get("error") == "pr-read-failed":
                continue
            alerts[f"pr-inventory-unavailable:{name}"] = (
                f"{name} new-issue PR budget unknown: {budget.get('error') or 'incomplete read'}; new claims deferred")
    alerts.update(linear_sync.alerts(obs.get("linearSync") or {}))
    gaps = alert_issue_gaps(dict(alerts), ((previous or {}).get("issues") or {}), time.time())
    if gaps:
        shown = "; ".join(f"{key} ({why[:80]})" for key, why in list(gaps.items())[:4])
        alerts["alert-issue-missing"] = (f"{len(gaps)} active doctor alert(s) older than {ALERT_ISSUE_GRACE_S // 60} min "
                                         f"have no Linear issue: {shown}")
    feed_size = obs.get("publicFeed") or {}
    if isinstance(feed_size.get("ratio"), (int, float)) and feed_size["ratio"] >= PUBLIC_FEED_WARN_RATIO:
        top = ", ".join(f"{name} {size // 1024}K" for name, size in list((feed_size.get("sections") or {}).items())[:3])
        alerts["public-feed-near-limit"] = (f"public lanes status feed is {feed_size['bytes']} bytes, "
                                            f"{round(feed_size['ratio'] * 100)}% of the {feed_size['maxBytes']} byte cap "
                                            f"(largest: {top}); past the cap every HUD tile and dead-man check reads unavailable")
    ttl = feed_size.get("secondsToCap")
    if isinstance(ttl, (int, float)) and 0 <= ttl < FEED_GROWTH_ALERT_S and "public-feed-near-limit" not in alerts:
        alerts["public-feed-growth"] = (f"public lanes status feed grows {feed_size.get('growthBytesPerHour')} bytes/h "
                                        f"and reaches the {feed_size.get('maxBytes')} byte cap in about {round(ttl / 3600, 1)}h "
                                        f"(now {feed_size.get('bytes')}, {round((feed_size.get('ratio') or 0) * 100)}%)")
    lag = obs.get("installLag") or {}
    if isinstance(lag.get("behindS"), (int, float)) and lag["behindS"] > INSTALL_LAG_ALERT_S:
        alerts["install-lag"] = (f"main's lane bundle {str(lag.get('behindCommit'))[:8]} is {round(lag['behindS'] / 60)}m "
                                 f"from installed (alert past {INSTALL_LAG_ALERT_S // 60}m); "
                                 f"last update: {lag.get('error') or 'waiting on a free gate seat or drain'}")
    if (isinstance(lag.get("behindS"), (int, float)) and lag["behindS"] > INSTALL_LAG_P0_S and lag.get("error")):
        alerts["install-lag-refused"] = (
            f"P0 install SLO breached: Gem is {round(lag['behindS'] / 3600, 1)}h behind main's lane bundle "
            f"{str(lag.get('behindCommit'))[:8]} (SLO {INSTALL_LAG_P0_S // 3600}h) and the updater is refusing: "
            f"{lag.get('error')}; owner gem-lanes updater (scripts/lanes/lane_runner.py install_release); "
            "runbook: update-refused.json holds the tree and reason, ensure_dependency_pool refills an aged pool")
    if obs.get("linearAppCredential") is False:
        alerts["linear-app-credential-missing"] = (
            "no Jovie Lanes Linear app credential (~/.config/jovie-lanes/linear-app.env); lanes Linear "
            "access fails closed (no personal-key fallback) until the lanes host owner reinstalls it")
    for automation_id, row in sorted(((obs.get("automation") or {}).get("silent") or {}).items()):
        age = row.get("ageS")
        alerts[f"automation-silent:{automation_id}"] = (
            f"registered automation {automation_id} left no fresh receipt at {row.get('location')} "
            f"({'missing' if age is None else f'{round(age / 60)} min old'}); owner per {AUTOMATION_REGISTRY}")
    watched = obs.get("automation") or {}
    if watched.get("known") is False and not watched.get("skipped"):
        alerts["automation-registry-unreadable"] = (
            f"origin/main:{AUTOMATION_REGISTRY} is unreadable ({watched.get('error') or 'missing or not JSONL'}); "
            "no Gem host-local automation receipt is being watched")
    alerts.update(throughput_sentinel.judge(obs))
    alerts.update(deploy_health.judge(obs.get("deployHealth"), obs.get("now") or time.time()))
    # Closed loop, last hop: Validating issues owing an `outcome` receipt wait on the outcome
    # lane. Its daily budget exhausted (or the drain gone silent) with owed receipts older than
    # OUTCOME_OWED_MAX_S used to stall in silence for the rest of the UTC day.
    queue = obs.get("outcomeQueue") or {}
    if queue.get("queued"):
        oldest = _iso_epoch(queue.get("oldestOwedAt"))
        refreshed = queue.get("at") if isinstance(queue.get("at"), (int, float)) else None
        owed_age = None if oldest is None else obs["now"] - oldest
        silent = refreshed is None or obs["now"] - refreshed > OUTCOME_QUEUE_SILENT_S
        if owed_age is not None and owed_age > OUTCOME_OWED_MAX_S and (
                queue.get("status") == "budget-exhausted" or silent):
            cause = (f"daily budget exhausted ({queue.get('spentToday')}/{queue.get('perDay')}; LANES_OUTCOME_PER_DAY)"
                     if queue.get("status") == "budget-exhausted" and not silent else
                     "outcome drain has not run for "
                     + ("ever" if refreshed is None else f"{round((obs['now'] - refreshed) / 60)} min"))
            alerts["outcome-lane-stalled"] = (
                f"{queue['queued']} Validating issue(s) owe an outcome receipt, oldest {round(owed_age / 3600)}h; {cause}; "
                "owner gem-lanes (scripts/lanes/outcome_lane.py)")
    liveness = obs.get("automationLiveness") or {}
    if liveness.get("installed"):
        last = _iso_epoch(liveness.get("lastRunAt"))
        if last is None or obs["now"] - last > AUTOMATION_LIVENESS_MAX_S:
            ran = "never" if last is None else f"{round((obs['now'] - last) / 60)} min ago"
            alerts["automation-liveness-silent"] = (
                f"the hosted {AUTOMATION_LIVENESS_WORKFLOW} check last ran {ran}; "
                "it and the Gem doctor watch each other")
    feed_error = (previous or {}).get("statusFeedError")
    if feed_error:
        # The last publish of the public status gist failed (Gem 2026-10-20 18:01-19:47:
        # a 403 froze it while lanes-status.json stayed fresh; Summer read STALE).
        alerts["status-feed-stale"] = (f"the public lanes status gist was not updated on the last doctor pass "
                                       f"({str(feed_error)[:120]}); Summer's shipping card reads it as stale")
    owned = obs.get("ownership") or {}
    if owned.get("overGrace"):
        # The started-state invariant (ownership.py): escalated as a lanes repair, never to Tim.
        alerts["started-without-owner"] = (
            f"{owned['overGrace']} started JOV issues have had no live owner past the grace period "
            f"(oldest {round((owned.get('oldestOwnerlessS') or 0) / 3600, 1)}h; unresolved "
            f"{owned.get('unresolved') or {}}); ownership.reconcile moves them each tick")
    if obs.get("strandedClaims"):
        alerts["stranded-claims"] = (
            f"{len(obs['strandedClaims'])} active claims have had no live lease for over "
            f"{fleet_ledger.STRANDED_S // 3600}h ({', '.join(obs['strandedClaims'][:6])}); "
            "ownership.reconcile releases them; if this persists the release path is broken")
    if obs.get("linearError"):
        alerts["linear-down"] = f"Linear unreadable: {obs['linearError']}"
    elif obs.get("linearSkipped") or obs.get("pool") is None:
        prior_alarm = ((previous or {}).get("alerts") or {}).get("linear-down")
        if prior_alarm:
            alerts["linear-down"] = prior_alarm
    elif new_work_empty(obs):
        since = (previous or {}).get("poolEmptySince") or obs["now"]
        if obs["now"] - since >= POOL_EMPTY_S:
            alerts["pool-empty"] = "no eligible new Todo issues and no open PR maintenance; Summer: route work to the lanes"
    if waiting and busy and obs.get("runs24h") and (obs.get("lastLandingAge") is None or obs["lastLandingAge"] > NO_LANDING_S):
        last = "never in 24h" if obs.get("lastLandingAge") is None else f"{int(obs['lastLandingAge'] // 3600)}h ago"
        alerts["no-landing"] = (f"{busy} slots busy with {pool if pool is not None else 'unknown'} eligible new issues "
                                f"and {obs.get('openPRCount', 'unknown')} open PRs but nothing passed the gate ({last})")
    elif (obs.get("lastLandingAge") is None or obs["lastLandingAge"] > NO_LANDING_S) and not new_work_empty(obs):
        # Losing demand/worker visibility is not a new landing or observed absence of demand.
        prior_alarm = ((previous or {}).get("alerts") or {}).get("no-landing")
        if prior_alarm:
            alerts["no-landing"] = prior_alarm
    current_lease_stale = (obs.get("leaseAgesComplete") is not True
                           or (isinstance(obs.get("oldestLeaseAge"), (int, float))
                               and obs["oldestLeaseAge"] > 3600))
    if (busy and waiting and isinstance(obs.get("lastWorkAge"), (int, float))
            and obs["lastWorkAge"] > 3600 and current_lease_stale):
        lease_age = ("current lease ages unknown" if obs.get("leaseAgesComplete") is not True else
                     f"oldest current lease {int(obs['oldestLeaseAge'] // 60)}m")
        alerts["workers-without-completions"] = (
            f"{busy} slot leases occupied but no completed run for {int(obs['lastWorkAge'] // 60)}m; "
            f"{lease_age}; check current processes, fenced ownership and repair holds before adding workers")
    inventory_holds = admission_repair_holds(obs)
    prior_admission_alarm = ((previous or {}).get("alerts") or {}).get("admission-repair-needed")
    blocked_since = (previous or {}).get("admissionRepairSince")
    if inventory_holds and (prior_admission_alarm or (
            isinstance(blocked_since, (int, float)) and obs["now"] - blocked_since >= ADMISSION_REPAIR_S)):
        alerts["admission-repair-needed"] = (
            f"{obs['eligiblePool']} qualified issues await PR inventory recovery on {', '.join(sorted(inventory_holds))}; "
            "repair existing owned PRs or reconcile held dependencies; retain concurrency and retry limits")
    elif inventory_holds is None and prior_admission_alarm:
        alerts["admission-repair-needed"] = prior_admission_alarm
    if obs.get("lastWorkAge") is None:
        prior_alarm = ((previous or {}).get("alerts") or {}).get("workers-without-completions")
        if prior_alarm:
            alerts["workers-without-completions"] = prior_alarm
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
                                               f"but {capacity['running']}/{capacity['slots']} workers after dispatch retried for "
                                               f"{PROVIDER_IDLE_S // 60}m")
    if obs.get("gateTimeouts24h", 0) >= GATE_TIMEOUT_ALERT:
        alerts["gate-timeouts"] = f"{obs['gateTimeouts24h']} gate timeouts in 24h: host too slow for the gate (fewer slots or a longer LANES_GATE_TIMEOUT_S)"
    if obs.get("failed24h", 0) >= FAILED_RUN_ALERT:
        alerts["failed-runs"] = f"{obs['failed24h']} harness-failed runs in 24h; read runs/ledger.jsonl reasons"
    no_work = obs.get("noWorkRepairs24h") or {}
    if sum(no_work.values()) >= NO_WORK_REPAIR_ALERT:
        causes = ", ".join(f"{reason} {count}" for reason, count in sorted(no_work.items(), key=lambda kv: -kv[1])[:3])
        requeued = obs.get("refundedNoWorkRepairs24h") or 0
        alerts["repairs-without-work"] = (f"{sum(no_work.values())} PR repairs in 24h stopped before any "
                                          f"agent work ({causes}); {sum(no_work.values()) - requeued} spent a fix "
                                          f"attempt and {requeued} were refunded and requeued with backoff; "
                                          "infrastructure, not the PRs, is exhausting them")
    # No design-brief-stale alert: since 2026-10-11 no issue is held for a brief (the
    # claiming run writes it), so a held brief is no longer a condition to watch.
    for row in obs.get("sweepSecretHeld") or []:
        # The public repo's refs/jovie-preserved/* must never carry a secret; the checkout is kept.
        alerts[f"sweep-snapshot-secret:{row.get('name')}"] = (
            f"worktree sweep did not publish a snapshot of {row.get('path')}: {row.get('reason')}; "
            "the checkout is kept untouched until its owner reviews it")
    if obs.get("diskFreePct") is not None and obs["diskFreePct"] < DISK_CRIT_PCT:
        alerts["disk-critical"] = (f"root disk {obs['diskFreePct']}% free even after the disk-pressure "
                                 f"guard swept; ENOSPC imminent — Summer: reclaim space on this host now")
    elif obs.get("diskFreePct") is not None and obs["diskFreePct"] < DISK_MIN_PCT:
        alerts["disk-low"] = f"root disk {obs['diskFreePct']}% free; worktrees and installs will start failing"
    held_since = (previous or {}).get("diskHeldSince")
    if disk_held(obs) and isinstance(held_since, (int, float)) and obs["now"] - held_since >= DISK_HELD_S:
        top = obs.get("diskTop") or (previous or {}).get("diskTop") or []
        named = ", ".join(f"{row['path']} {row['gib']} GiB" for row in top) or "consumers not yet measured"
        alerts["disk-capacity-held"] = (
            f"root disk {obs['diskFreePct']}% free (growth floor {autoscale.DISK_INCREASE_MIN}%) for "
            f"{int((obs['now'] - held_since) // 60)}m: lane capacity is held below base. Top consumers: {named}")
    if github_reads_held:
        alerts["github-quota"] = (f"GitHub GraphQL budget {obs['githubRemaining']} left this hour; read-only polling "
                                  f"held below the {GITHUB_MIN_REMAINING}-point floor to preserve writes")
    elif obs.get("githubRemaining") is None:
        prior_alarm = ((previous or {}).get("alerts") or {}).get("github-quota")
        if prior_alarm:
            alerts["github-quota"] = prior_alarm
    brake = (obs.get("autoscale") or {}).get("throughputBrake") or {}
    held_for = brake.get("heldForS")
    interval = brake.get("intervalS")
    if brake.get("active") and isinstance(held_for, (int, float)) and isinstance(interval, (int, float)) \
            and held_for > interval:
        signal = brake.get("signal") or {}
        alerts["bottleneck:merge-queue"] = (
            f"merge-throughput brake held {int(held_for // 60)}m: queue {signal.get('queueDepth', 'unknown')}, "
            f"p50 wait {signal.get('queueWaitP50Minutes', 'unknown')}m, "
            f"{signal.get('mergedPerHour', 'unknown')} merged/h vs {signal.get('openedPerHour', 'unknown')} opened/h, "
            f"ejection rate {signal.get('ejectionRate', 'unknown')}")
    sweep_view = obs.get("reconcile") or {}
    dispositions = sweep_view.get("dispositions")
    open_prs = ({row.get("pr") for row in dispositions if isinstance(row, dict)}
                if isinstance(dispositions, list) and (sweep_view.get("counts") or {}).get("open") == len(dispositions)
                else None)  # an incomplete open-PR view keeps every surfaced PR
    escalation_line = remediation.alert_reason(obs.get("escalation") or {}, open_prs)
    if escalation_line:
        alerts["escalation-surfaced"] = escalation_line
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
    deferred = obs.get("quotaDeferredHeads") or {}
    if deferred.get("value"):
        listed = ", ".join(f"#{row.get('number')} {row.get('ageMinutes')}m" for row in (deferred.get("heads") or [])[:8])
        alerts["quota-deferred-heads"] = (f"{deferred['value']} open PR heads sit on a quota-deferred Fleet Rules "
                                          f"verdict past 1h (never a verdict; the re-run loop is broken): {listed}")
    drain = (obs.get("quotaDrain") or {}).get("alerts") or []
    if drain:
        listed = "; ".join(f"{row.get('bucket')} has {row.get('remaining')} left at ~{row.get('ratePerMinute')}/min, empty "
                           f"{row.get('minutesEarly')} min before its reset ({row.get('emptyAt')})" for row in drain[:4])
        alerts["quota-drain"] = (f"GitHub API budget is projected to run dry before it resets: {listed}. Pause bulk reruns "
                                 f"and bulk gh work until the reset.")
    if obs.get("hudExpected") and (obs.get("hudBeatAge") is None or obs["hudBeatAge"] > HUD_STALE_S):
        beat = "never" if obs.get("hudBeatAge") is None else f"{int(obs['hudBeatAge'])}s ago"
        alerts["hud-stale"] = f"tty1 HUD heartbeat {beat}; the console is not showing current truth"
    return alerts


def condition_receipts(alerts: dict[str, str], previous: dict, obs: dict, host_name: str) -> dict[str, dict]:
    """Typed, generation-deduped evidence for every actionable doctor condition."""
    prior = previous.get("conditions") or {}
    receipts: dict[str, dict] = {}
    now = float(obs["now"])
    critical = ("tick-error", "linear-down", "spawn-exit", "no-landing", "disk-critical", "delivery-stalled", "install-lag-refused")
    actions = {
        "tick-error": "retry-dispatch-tick",
        "linear-down": "retry-linear-read-and-publish-independent-receipt",
        "spawn-exit": "dispatch-provider-workers",
        "hud-stale": "restart-hud-service",
        "orphan-prs": "reconcile-pr-ownership",
        "quota-deferred-heads": "rerun-quota-deferred-fleet-evidence",
        "quota-drain": "pause-bulk-reruns-and-bulk-api-work-until-the-reset",
        "bottleneck:merge-queue": "reduce-lane-slots-and-reconcile-merge-queue",
        "workers-without-completions": "verify-process-and-fenced-repair-ownership",
        "admission-repair-needed": "repair-existing-pr-inventory-before-new-intake",
        "disk-capacity-held": "reclaim-top-disk-consumers-then-restore-lane-seats",
        "delivery-stalled": "investigate-repair-and-verify-native-delivery",
        "remediation-delivery": "repair-and-read-back-existing-event-delivery",
        "install-lag-refused": "repair-updater-refusal-and-install-current-main",
    }
    resources = {
        "linear-down": ["linear", "pool"],
        "pool-empty": ["linear-pool"],
        "tick-error": ["dispatch-tick"],
        "spawn-exit": ["dispatch-tick", "worker-pool"],
        "hud-stale": ["tty1-hud", "status-feed"],
        "no-landing": ["shipping-throughput"],
        "delivery-stalled": ["local-useful-execution", "native-merge", "deployed-verification"],
        "bottleneck:merge-queue": ["merge-queue", "lane-slots"],
    }
    for key, evidence in alerts.items():
        old = prior.get(key) or {}
        continuing = old.get("state") == "active"
        generation = int(old.get("generation") or 0) + (0 if continuing else 1)
        provider = key.split(":", 1)[1] if ":" in key else None
        first = (float(old["firstObservedEpoch"]) if continuing and old.get("firstObservedEpoch") is not None
                 else float((previous.get("providerIdleSince") or {}).get(provider, now)))
        source_status = "unknown" if key == "linear-down" else "stale" if key == "hud-stale" else "degraded"
        if key == "delivery-stalled" and (obs.get("delivery") or {}).get("state") in ("unknown", "controller-held"):
            source_status = "unknown"
        if key == "admission-repair-needed" and (obs.get("eligiblePool") is None or obs.get("pool") is None
                or any(row.get("reason") == "pr-inventory-unavailable"
                       for row in (obs.get("newIssueBudgetByProvider") or {}).values())):
            source_status = "unknown"
        if key == "workers-without-completions" and (obs.get("lastWorkAge") is None
                or obs.get("leaseAgesComplete") is not True):
            source_status = "unknown"
        if key == "github-quota" and obs.get("githubRemaining") is None:
            source_status = "unknown"
        if key == "no-landing" and (obs.get("lastLandingAge") is None or obs.get("linearSkipped")
                or (obs.get("eligiblePool", obs.get("pool")) is None and obs.get("openPRCount") is None)):
            source_status = "unknown"
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
            "owner": "gem-lanes-updater" if key == "install-lag-refused" else "symphony-lanes-doctor",
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
        if key == "delivery-stalled":
            delivery = obs.get("delivery") or {}
            receipts[key]["terminalOutcome"] = (delivery["state"] if delivery.get("state") in
                                                  ("no-eligible-work", "intentional-pause") else "merge-proven")
            receipts[key]["recoveryEvidence"] = delivery
        fields = {"github-quota": ("githubRemaining",),
                  "linear-down": ("linearError", "linearSkipped", "pool", "eligiblePool"),
                  "no-landing": ("lastLandingAge", "pool", "eligiblePool", "openPRCount", "newIssueBudgetByProvider"),
                  "workers-without-completions": ("busy", "lastWorkAge", "leaseAgesComplete", "oldestLeaseAge")}
        if key in fields:
            receipts[key]["source"] = {**old.get("source", {}), "status": "healthy",
                                       "observedAt": epoch_iso(now), "freshnessSeconds": 0}
            receipts[key]["recoveryEvidence"] = {"observedAt": epoch_iso(now),
                                                  **{field: obs.get(field) for field in fields[key]}}
    return receipts


# ---------------------------------------------------------------- Linear actions

def _source_version() -> str:
    explicit = os.environ.get("JOVIE_SOURCE_SHA", "").strip().lower()
    if re.fullmatch(r"[a-f0-9]{40}", explicit):
        return explicit
    try:
        status = subprocess.run(
            ["git", "status", "--porcelain=v1", "--untracked-files=all"], cwd=REPO_ROOT,
            capture_output=True, text=True, timeout=5, check=False)
        if status.returncode != 0 or status.stdout.strip():
            return "UNKNOWN"
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=REPO_ROOT, capture_output=True,
            text=True, timeout=5, check=False)
        resolved = result.stdout.strip().lower()
        return resolved if result.returncode == 0 and re.fullmatch(r"[a-f0-9]{40}", resolved) else "UNKNOWN"
    except (OSError, subprocess.SubprocessError):
        return "UNKNOWN"


def _emergency_ops_report(key: str, text: str, condition: dict, host_name: str, target: str) -> dict:
    """Preapproved deterministic notice when the observation-only reviewer is unavailable."""
    source = condition.get("source") or {}
    observed_at = source.get("observedAt") or "UNKNOWN"
    owner = condition.get("owner") or "UNKNOWN"
    next_action = condition.get("nextAction") or "inspect the existing Symphony doctor receipt"
    message = "\n".join([
        "Symphony emergency notice: report review is unavailable.",
        "Domain: company (JovieInc/Jovie)",
        f"Evidence observed: {observed_at}",
        f"Evidence source: {source.get('producer') or 'UNKNOWN'}",
        "Surface owner: Summer",
        f"Current owner: {owner}",
        f"Blocker: {text or 'UNKNOWN'}",
        "Root cause: UNKNOWN",
        f"Next action: {next_action}",
    ])
    message_digest = hashlib.sha256(message.encode()).hexdigest()
    evidence_digest = hashlib.sha256(json.dumps(condition, sort_keys=True, default=str).encode()).hexdigest()
    bindings = {
        "messageSha256": message_digest,
        "audience": "Founder and operators reading agent output",
        "destination": {"adapter": "linear-issue", "target": target},
        "evidenceFingerprint": evidence_digest,
        "policyVersion": "canon/VOICE.md action-only agent communication; FLEET admission policy",
        "resolvedModel": "NOT_APPLICABLE",
    }
    review_digest = hashlib.sha256(json.dumps(bindings, sort_keys=True).encode()).hexdigest()
    return {
        "message": message,
        "decision": "approved-template",
        "idempotencyKey": f"{host_name}:{key}:{condition.get('generation', 1)}",
        "review": {
            "schema": "jovie.agent-ops-report-delivery-review/v1",
            "mode": "observation",
            "outcome": "approved-template",
            "reviewStatus": "emergency-reviewer-unavailable",
            "revisionCount": 0,
            "requestFingerprint": None,
            "reviewedAt": now_iso(),
            "bindings": bindings,
            "reviewDigest": review_digest,
        },
    }


def _ops_report_input(key: str, text: str, condition: dict, target: str) -> dict:
    source = condition.get("source") or {}
    observed_at = source.get("observedAt") or "UNKNOWN"
    source_version = _source_version()
    proof = {
        name: {"status": "UNKNOWN", "observedAt": observed_at,
               "source": source.get("producer") or "UNKNOWN", "receipt": "UNKNOWN"}
        for name in ("source", "tests", "ciQueue", "merge", "deployment",
                     "authenticatedRuntime", "recurrence")
    }
    if source_version != "UNKNOWN":
        proof["source"].update(status="PROVEN", receipt=source_version)
    if int(condition.get("generation") or 1) > 1:
        proof["recurrence"].update(status="PROVEN", receipt=condition.get("idempotencyKey") or "UNKNOWN")
    else:
        proof["recurrence"].update(status="NOT_APPLICABLE", receipt="NOT_APPLICABLE")
    return {
        "domain": "company",
        "producer": "Symphony",
        "currentOwner": condition.get("owner"),
        "observedState": f"{condition.get('condition') or key} is {condition.get('state') or 'UNKNOWN'}",
        "blocker": text,
        "rootCause": None,
        "nextAction": condition.get("nextAction"),
        "evidence": {"observedAt": observed_at, "source": source.get("producer")},
        "sourceSha": source_version,
        "proofTiers": proof,
        "destination": {"adapter": "linear-issue", "target": target},
    }


def prepare_ops_report(key: str, text: str, condition: dict, host_name: str, target: str) -> dict:
    """Prepare, but never send, one company-scoped report through the Jev observation seam."""
    payload = _ops_report_input(key, text, condition, target)
    try:
        result = subprocess.run(
            ["node", str(OPS_REPORT_SCRIPT)], cwd=REPO_ROOT, input=json.dumps(payload),
            capture_output=True, text=True, timeout=20, check=False,
            env={**os.environ, "JOVIE_AGENT_PROFILE": "no_agent"})
        prepared = json.loads(result.stdout) if result.returncode == 0 else None
        if (not isinstance(prepared, dict) or not isinstance(prepared.get("review"), dict)
                or not isinstance(prepared.get("message"), str)
                or prepared.get("destination", {}).get("target") != target):
            raise ValueError("invalid ops report result")
        return prepared
    except (OSError, ValueError, subprocess.SubprocessError):
        return _emergency_ops_report(key, text, condition, host_name, target)


def verify_ops_report(prepared: dict, key: str, text: str, condition: dict,
                      host_name: str, target: str) -> dict:
    """Recheck the actual Linear payload; unavailable review uses the existing emergency notice."""
    review = prepared.get("review") if isinstance(prepared, dict) else None
    if isinstance(review, dict) and review.get("reviewStatus") == "emergency-reviewer-unavailable":
        return _emergency_ops_report(key, text, condition, host_name, target)
    try:
        result = subprocess.run(
            ["node", str(OPS_REPORT_SCRIPT), "--verify"], cwd=REPO_ROOT,
            input=json.dumps({"preparedReport": prepared,
                              "currentInput": _ops_report_input(key, text, condition, target)}),
            capture_output=True, text=True, timeout=5, check=False,
            env={**os.environ, "JOVIE_AGENT_PROFILE": "no_agent"})
        if result.returncode != 0 or json.loads(result.stdout) != {"verified": True}:
            raise ValueError("ops delivery review invalidated")
        return prepared
    except (OSError, ValueError, subprocess.SubprocessError):
        return _emergency_ops_report(key, text, condition, host_name, target)


class Tracker:
    """Linear Triage issues, one per alert key, reused within the cool-off."""
    def __init__(self, linear, host_name: str):
        self.linear, self.host = linear, host_name
        self._team_node = None
        self.last_writing_report = None
        self.last_error = None  # why the last open() returned no issue id (never swallowed silently)

    def title(self, key: str) -> str:
        if key == "bottleneck:merge-queue":
            return "remediation:symphony-bottleneck-merge-queue"
        return f"Symphony doctor: {key} ({self.host})"

    def _team(self) -> dict:
        if self._team_node is None:
            self._team_node = self.linear.gql(
                'query{teams(filter:{key:{eq:"JOV"}}){nodes{id states{nodes{id name}} labels{nodes{id name}}}}}',
                {})["teams"]["nodes"][0]
        return self._team_node

    def _label_by_name(self, name: str) -> str | None:
        try:
            data = self.linear.gql(
                'query($n:String!){issueLabels(first:1,filter:{team:{key:{eq:"JOV"}},name:{eq:$n}}){nodes{id name}}}',
                {"n": name})
            node = (((data or {}).get("issueLabels") or {}).get("nodes") or [None])[0]
            return node["id"] if node and node.get("id") else None
        except Exception:  # noqa: BLE001
            return None

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
        # The team query returns only the first 50 labels; the team has far more, so look the name up directly
        # before creating (the lanes app is FORBIDDEN from creating labels, which used to abort the whole incident).
        found = self._label_by_name(name)
        if found:
            team["labels"]["nodes"].append({"id": found, "name": name})
            return found
        try:
            created = self.linear.gql(
                'mutation($i:IssueLabelCreateInput!){issueLabelCreate(input:$i){issueLabel{id name}}}',
                {"i": {"teamId": team["id"], "name": name, "color": remediation.REMEDIATION_LABEL_COLOR}})
        except Exception:  # noqa: BLE001 - a label is decoration; the incident still opens without it
            return None
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
            if key == "bottleneck:merge-queue":
                data = self.linear.gql(
                    'query($t:String!){issues(first:5,filter:{team:{key:{eq:"JOV"}},title:{eq:$t}})'
                    '{nodes{id state{type}}}}', {"t": self.title(key)})
                nodes = data["issues"]["nodes"]
                if not nodes:
                    return None
                issue = nodes[0]
                if (issue.get("state") or {}).get("type") in ("completed", "canceled"):
                    self.linear.move(issue["id"], "Triage")
                    try:
                        self.linear.comment(issue["id"], f"🤖 doctor: merge-queue bottleneck fired again at {now_iso()}.")
                    except Exception as error:
                        print(f"doctor: reopened merge-queue owner; notification failed ({type(error).__name__})",
                              file=sys.stderr)
                return issue["id"]
            data = self.linear.gql(
                'query($t:String!){issues(first:5,filter:{team:{key:{eq:"JOV"}},title:{eq:$t},'
                'state:{type:{nin:["completed","canceled"]}}}){nodes{id}}}', {"t": self.title(key)})
            nodes = data["issues"]["nodes"]
            return nodes[0]["id"] if nodes else None
        except Exception as error:
            self.existing_error = f"{type(error).__name__}: {str(error)[:160]}"
            return None

    def open(self, key: str, text: str, condition: dict | None = None) -> str | None:
        self.last_writing_report = None
        self.last_error = None
        self.existing_error = None
        found = self.existing(key)
        if found:
            self.apply_alert_label(found, key)
            return found
        if found is None and getattr(self, "existing_error", None):
            self.last_error = f"lookup-failed:{self.existing_error}"
        try:
            priority = 1 if key.startswith(("provider-idle:", "provider-down:", "pr-inventory-unavailable:", "production-deploy:")) or key in (
                "linear-down", "spawn-exit", "tick-error", "delivery-stalled") else 2
            team = self._team()
            triage = next(s["id"] for s in team["states"]["nodes"] if s["name"] == "Triage")
            labels = [l["id"] for l in team["labels"]["nodes"] if l["name"] == "symphony"]
            try:
                remediation_label = self._remediation_label_id(key)
            except Exception:  # noqa: BLE001 - never lose an incident over its label
                remediation_label = None
            if remediation_label:
                labels.append(remediation_label)
            description = (f"**{text}**\n\nHost `{self.host}`, {now_iso()}. Raised by `scripts/lanes/doctor.py`; "
                           "it will move this issue to Done when the condition clears.\n\n"
                           "Runbook: `scripts/lanes/README.md`; state under `~/.local/state/jovie-lanes` "
                           "(`tick.json`, `runs/ledger.jsonl`, `doctor.json`).")
            if condition:
                prepared = prepare_ops_report(key, text, condition, self.host, self.title(key))
                prepared = verify_ops_report(prepared, key, text, condition, self.host, self.title(key))
                description = prepared["message"]
                self.last_writing_report = prepared
            data = self.linear.gql(
                'mutation($i:IssueCreateInput!){issueCreate(input:$i){issue{id identifier}}}',
                {"i": {"teamId": team["id"], "stateId": triage, "labelIds": labels, "priority": priority,
                       "title": self.title(key),
                       "description": description}})
            return data["issueCreate"]["issue"]["id"]
        except Exception as error:
            self.last_error = f"create-failed:{type(error).__name__}: {str(error)[:160]}"
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

    def _move_acknowledged(self, issue_id: str, target: str) -> bool:
        """The shared client's move is best-effort; only readback proves the state."""
        def acknowledged():
            if target == "Triage":
                data = self.linear.gql('query($id:String!){issue(id:$id){state{type}}}', {"id": issue_id})
                state = ((data.get("issue") or {}).get("state") or {}).get("type")
                # Intake may already have claimed or deferred the reopened issue.
                return state in ("triage", "backlog", "unstarted", "started")
            return self.linear.state_of(issue_id) == target

        try:
            if acknowledged():
                return True  # an earlier uncertain mutation already applied
            self.linear.move(issue_id, target)
            return acknowledged()
        except Exception as error:
            print(f"doctor: {target} acknowledgment pending ({type(error).__name__})", file=sys.stderr)
            return False

    def reopen(self, issue_id: str, text: str, key: str | None = None) -> bool:
        if not self._move_acknowledged(issue_id, "Triage"):
            return False
        try:
            self.linear.comment(issue_id, f"🤖 doctor: fired again on `{self.host}` at {now_iso()}: {text}")
        except Exception as error:
            print(f"doctor: reopened issue; notification failed ({type(error).__name__})", file=sys.stderr)
        if key:
            self.apply_alert_label(issue_id, key)
        return True

    def close(self, issue_id: str, key: str | None = None) -> bool:
        if not self._move_acknowledged(issue_id, "Done"):
            return False
        try:
            self.linear.comment(issue_id, f"🤖 doctor: cleared on `{self.host}` at {now_iso()}.")
        except Exception as error:
            print(f"doctor: closed issue; notification failed ({type(error).__name__})", file=sys.stderr)
        if key:
            self.apply_alert_label(issue_id, key)
        return True


ALERT_ISSUE_GRACE_S = 15 * 60


def alert_issue_gaps(alerts: dict, issues: dict, now: float, grace_s: int = ALERT_ISSUE_GRACE_S) -> dict[str, str]:
    """Invariant: no active alert older than 15 min without a Linear issue id or a logged reason.
    Returns key -> why for every violation or visible gap: an alert with no id past the grace (the reason
    when one is recorded, `untracked` when none is, which is itself a bug)."""
    gaps = {}
    for key in alerts:
        entry = issues.get(key) or {}
        if entry.get("id"):
            continue
        since = entry.get("since")
        if not isinstance(since, (int, float)):
            continue  # first sighting this tick: reconcile records it with a reason
        if now - since >= grace_s:
            gaps[key] = entry.get("reason") or "untracked"
    return gaps


def reconcile(alerts: dict[str, str], previous: dict, tracker: Tracker | None, now: float,
              conditions: dict[str, dict] | None = None) -> dict:
    """Carry issue ids across ticks; acknowledge remote transitions before advancing receipts."""
    issues = {key: dict(entry) for key, entry in previous.get("issues", {}).items()}
    for key, text in alerts.items():
        entry = issues.get(key)
        if entry and entry.get("closedAt") is None and entry.get("id") and not entry.get("pendingAction"):
            continue  # still open
        if entry and entry.get("id") and (entry.get("pendingAction") or
                now - float(entry.get("closedAt") or 0) < COOL_OFF_S):
            # Retain the original issue across cooldown expiry and uncertain close/refire.
            if tracker and tracker.reopen(entry["id"], text, key) is True:
                issues[key] = {"id": entry["id"], "closedAt": None}
                contradict = getattr(tracker, "contradict_invariant", None)
                if contradict and conditions and key in conditions:
                    contradict(conditions[key])
            else:
                entry["pendingAction"] = "reopen"
            continue
        issue_id = tracker.open(key, text, (conditions or {}).get(key)) if tracker else None
        writing_report = getattr(tracker, "last_writing_report", None) if tracker else None
        if issue_id and writing_report and conditions and key in conditions:
            conditions[key] = {
                **conditions[key],
                "writingReview": writing_report["review"],
                "writingDecision": writing_report["decision"],
            }
        if issue_id:
            issues[key] = {"id": issue_id, "closedAt": None}
        else:
            # retry a failed open next tick, but never silently: keep when it started failing and why.
            reason = (getattr(tracker, "last_error", None) if tracker else None) or ("no-tracker" if tracker is None else "open-returned-no-id")
            issues[key] = {"id": None, "closedAt": None, "reason": reason,
                           "since": (entry or {}).get("since") or now}
            print(f"doctor: no Linear issue for alert {key}: {reason}", file=sys.stderr)
        if tracker and issue_id and conditions and key in conditions:
            contradict = getattr(tracker, "contradict_invariant", None)
            if contradict:
                contradict(conditions[key])
    for key, entry in issues.items():
        if key not in alerts and (entry.get("closedAt") is None or entry.get("pendingAction")):
            if not entry.get("id") or (tracker and tracker.close(entry["id"], key) is True):
                entry["closedAt"] = now
                entry.pop("pendingAction", None)
            else:
                entry["pendingAction"] = "close"
    receipts = {}
    for key, event in (conditions or {}).items():
        prior_event = (previous.get("conditions") or {}).get(key) or {}
        if (not event.get("writingReview") and prior_event.get("writingReview")
                and prior_event.get("idempotencyKey") == event.get("idempotencyKey")):
            event = {**event, "writingReview": prior_event["writingReview"],
                     "writingDecision": prior_event.get("writingDecision")}
        entry = issues.get(key) or {}
        acknowledged = bool(entry) and not entry.get("pendingAction")
        if event.get("state") == "resolved":
            escalation = "cleared" if acknowledged and entry.get("closedAt") is not None else "pending"
        else:
            escalation = "requested" if acknowledged and entry.get("id") and entry.get("closedAt") is None else "pending"
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
        raw = lifecycle.run(
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
            f"quota-blocked:{(tick.get('quotaBlocked') or {})[provider]}"
            if provider in (tick.get("quotaBlocked") or {}) else
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
    attribution = shipping_attribution.company_report(
        obs.get("_mergeEvidenceByRepository") or {},
        obs.get("_ledgerEvidence") or {"complete": False, "reason": "receipt-ledger-not-read",
                                       "corruptRows": 0, "observedAt": None, "rows": []},
        obs.get("now") or time.time())
    return {"schema": "symphony-lanes-status/v1", "at": now_iso(), "host": lane.HOST, "release": tick.get("release"),
            "fileOverlap": overlap, "linear": obs.get("linearSync") or tick.get("linear"),
            "deployHealth": deploy_health.feed_block(obs.get("deployHealth"), obs.get("now") or time.time()),
            "ownership": obs.get("ownership"),
            "lanes": counts, "providerPayloads": obs.get("providerPayloads"), "running": sum(c["running"] for c in counts.values()),
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
            "delivery": obs.get("delivery"),
            "diskFreePct": obs.get("diskFreePct"), "githubRemaining": obs.get("githubRemaining"),
            "held_by_reason": obs.get("heldByReason") or {}, "failed_by_reason": obs.get("failedByReason") or {},
            "throughput": throughput, "throughputError": obs.get("mergedAttributionError"),
            "shippingAttribution": attribution,
            "sentinel": {key: (obs.get("sentinel") or {}).get(key) for key in
                         ("pushes1h", "idleExits1h", "releaseFlow", "growth", "repos")},
            "mergeThroughput": obs.get("mergeThroughput"),
            "mergeThroughputError": obs.get("mergeThroughputError"),
            "mergedWindow": obs.get("mergedWindow"),
            "capacity": capacity,
            "prs": (obs.get("reconcile") or {}).get("counts") or {}, "_idleQualifiedSince": next_idle_since,
            "orphan_prs": (obs.get("reconcile") or {}).get("orphans") or [],
            "oldest_prs": [row for row in (obs.get("reconcile") or {}).get("dispositions") or []][:10],
            "dep_holds": (obs.get("reconcile") or {}).get("depHolds") or [],
            "slo": obs.get("slo"),
            "escalation": obs.get("escalation") or remediation.empty_escalation(),
            "remediation": obs.get("remediation") or remediation.empty_remediation(),
            "autoscale": _autoscale_block(host),
            "machine": _machine_block(host),
            # Real-limit record (jovie.capacity-limit): which measured limit holds lanes back.
            "capacityLimit": _capacity_limit_block(host)}


def _capacity_limit_block(host) -> dict | None:
    try:
        import capacity_limit
        return capacity_limit.read_record(host.state)
    except Exception:  # the feed never fails on an optional record
        return None


def _machine_block(host) -> dict | None:
    """Machine metrics (machine-made share of merges, 3+ repeat fingerprints, cost per merged PR by class, days
    from 3rd repeat to machine) plus any lane whose slots the merged-per-dollar gate is holding down. Small fields
    only: the public feed has a byte cap."""
    state = getattr(host, "state", None)
    if state is None:
        return None
    try:
        import machine_metrics
        import slot_yield
        block = machine_metrics.public_block(machine_metrics.refresh(state))
        gated = {}
        for lane_name in ("hyperagent", "claude", "devin", "kimi"):
            slots, why = slot_yield.ceiling(state, lane_name, 10)
            if why.get("gated"):
                gated[lane_name] = {"slots": slots, "mergedPerUsd": why.get("mergedPerUsd"), "referencePerUsd": why.get("referencePerUsd")}
        block["slotGate"] = gated
        return block
    except Exception:  # the feed never fails on an optional record
        return None


def _autoscale_block(host) -> dict:
    state = getattr(host, "state", None)
    if state is None:
        return {"mode": autoscale.mode(), "lanes": {}, "history": []}
    try:
        return autoscale.public_block(state)
    except Exception:
        return {"mode": autoscale.mode(), "lanes": {}, "history": []}


PRIMARY_FLAG = Path.home() / ".config/jovie-lanes/primary"


PUBLIC_FEED_MAX_BYTES = 256 * 1024
STATUS_DETAIL_NAME = "lanes-status-details.json"
STAGE_EVENTS_NAME = "stage-events.ndjson"


# 2026-10-25 13:50Z: the public feed hit 410,142 bytes against the 262,144 cap and every HUD tile and
# dead-man check read "unavailable". Measured sections (lanes-status.json, 557 KB complete):
# fileOverlap 217 KB (737 pair rows), remediation 82 KB (312 fingerprints, 72 KB of ask text), conditions
# 54 KB, shippingAttribution 153 KB of per-PR rows before the existing projection. The public feed keeps
# aggregates, top hotspots and operational identity; every dropped row stays in lanes-status-details.json
# (same gist) and local state, addressed by a jsonPointer.
PUBLIC_OVERLAP_TOP = 10
PUBLIC_FEED_WARN_RATIO = 0.70
PUBLIC_REMEDIATION_FIELDS = ("state", "issue", "cls", "lane")


def _compact_overlap(public: dict) -> None:
    overlap = public.get("fileOverlap")
    pairs = overlap.get("pairs") if isinstance(overlap, dict) else None
    if not isinstance(pairs, list):
        return
    rows = [pair for pair in pairs if isinstance(pair, dict)]
    files = Counter(name for pair in rows for name in pair.get("files") or [] if isinstance(name, str))
    overlap.pop("pairs")
    overlap["pairsSummary"] = {
        "count": len(pairs),
        "queueOwned": sum(1 for pair in rows if pair.get("queueOwned")),
        "byAction": dict(Counter(str(pair.get("actionTaken")) for pair in rows)),
        "topHotspots": [{"file": name, "pairs": count} for name, count in files.most_common(PUBLIC_OVERLAP_TOP)],
        "pairsRef": {"recordCount": len(pairs), "jsonPointer": "/fileOverlap/pairs"},
    }


# Conditions grew 54 KB -> 69 KB in about an hour (2026-10-25): 33 of 52 receipts were `resolved`, kept
# forever locally (generation numbers must survive for idempotency keys), each carrying its writing-review
# bindings (~1.5 KB). The public feed keeps every active condition and recent resolutions without the heavy
# review/evidence blobs, plus a count summary; the complete receipts stay in lanes-status-details.json.
PUBLIC_CONDITION_RESOLVED_KEEP_S = 6 * 3600
PUBLIC_CONDITION_DROP = ("writingReview", "writingDecision", "recoveryEvidence")  # heavy; full copy in the details file


def _compact_conditions(public: dict, now: float | None = None) -> None:
    conditions = public.get("conditions")
    if not isinstance(conditions, dict):
        return
    now = time.time() if now is None else now
    kept, omitted = {}, 0
    for key, event in conditions.items():
        if not isinstance(event, dict):
            kept[key] = event
            continue
        resolved = event.get("state") == "resolved"
        if resolved:
            stamp = event.get("resolvedAt")
            try:
                age = now - datetime.fromisoformat(str(stamp).replace("Z", "+00:00")).timestamp()
            except (TypeError, ValueError):
                age = None
            if age is None or age > PUBLIC_CONDITION_RESOLVED_KEEP_S:
                omitted += 1
                continue
        row = {name: value for name, value in event.items() if name not in PUBLIC_CONDITION_DROP}
        kept[key] = row
    states = Counter(str(event.get("state")) for event in conditions.values() if isinstance(event, dict))
    public["conditions"] = kept
    public["conditionsSummary"] = {
        "total": len(conditions), "byState": dict(states), "resolvedOmitted": omitted,
        "resolvedKeptForS": PUBLIC_CONDITION_RESOLVED_KEEP_S,
        "ref": {"recordCount": len(conditions), "jsonPointer": "/conditions"}}


def _compact_remediation(public: dict) -> None:
    remediation_block = public.get("remediation")
    rows = remediation_block.get("byFingerprint") if isinstance(remediation_block, dict) else None
    if not isinstance(rows, dict):
        return
    remediation_block["byFingerprint"] = {
        key: ({name: row.get(name) for name in PUBLIC_REMEDIATION_FIELDS} if isinstance(row, dict) else row)
        for key, row in rows.items()}
    remediation_block["byFingerprintRef"] = {"recordCount": len(rows), "jsonPointer": "/remediation/byFingerprint",
                                             "omitted": "ask, recurrence and history text"}


FEED_SAMPLE_WINDOW_S = 6 * 3600
FEED_SAMPLE_MIN_SPAN_S = 20 * 60
FEED_GROWTH_ALERT_S = 6 * 3600  # alert when the projected time to the cap is under 6 hours


def feed_growth(samples: list, now: float, total: int, cap: int = PUBLIC_FEED_MAX_BYTES) -> dict:
    """Bytes/hour over the retained samples and the projected seconds until the cap. Needs >=3 samples
    spanning >=20 min; a shrinking or flat feed projects nothing."""
    window = [row for row in (samples or []) if isinstance(row, list) and len(row) == 2
              and 0 <= now - row[0] <= FEED_SAMPLE_WINDOW_S]
    window.append([now, total])
    span = window[-1][0] - window[0][0]
    if len(window) < 3 or span < FEED_SAMPLE_MIN_SPAN_S:
        return {"samples": window, "growthBytesPerHour": None, "secondsToCap": None}
    rate = (window[-1][1] - window[0][1]) / span  # bytes per second
    return {"samples": window[-72:], "growthBytesPerHour": round(rate * 3600),
            "secondsToCap": round((cap - total) / rate) if rate > 0 else None}


def feed_section_sizes(text: str) -> dict:
    """Bytes per top-level section of the published feed, largest first, with the cap ratio."""
    data = json.loads(text)
    sizes = {key: len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
             for key, value in data.items()}
    total = len(text.encode("utf-8"))
    return {"bytes": total, "maxBytes": PUBLIC_FEED_MAX_BYTES, "ratio": round(total / PUBLIC_FEED_MAX_BYTES, 3),
            "sections": dict(sorted(sizes.items(), key=lambda item: -item[1])[:12])}


def public_status_projection(feed: dict, full_text: str) -> str:
    """Keep operational fields whole; detailed attribution lives in the same gist."""
    def identity(value, limit):
        return value if isinstance(value, str) and len(value) <= limit else None

    evidence = {
        "fileName": STATUS_DETAIL_NAME,
        "sha256": hashlib.sha256(full_text.encode("utf-8")).hexdigest(),
        "bytes": len(full_text.encode("utf-8")),
        "at": identity(feed.get("at"), 64),
        "host": identity(feed.get("host"), 64),
        "release": identity(feed.get("release"), 128),
        "binding": "declared-feed-identity",
    }
    public = json.loads(full_text)
    attribution = public.get("shippingAttribution")
    projects = attribution.get("projects") if isinstance(attribution, dict) else None
    if isinstance(projects, list):
        for index, project in enumerate(projects):
            if isinstance(project, dict) and isinstance(project.get("pullRequests"), list):
                rows = project.pop("pullRequests")
                # Absence with an explicit locator is not an empty evidence array.
                project["pullRequestsRef"] = {
                    "recordCount": len(rows),
                    "jsonPointer": f"/shippingAttribution/projects/{index}/pullRequests",
                }
    _compact_overlap(public)
    _compact_remediation(public)
    _compact_conditions(public)
    public["publicProjection"] = {
        "schema": "symphony-lanes-public-projection/v1", "fullEvidence": evidence,
    }
    text = json.dumps(public, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    if len(text.encode("utf-8")) <= PUBLIC_FEED_MAX_BYTES:
        return text
    # Never trim operational ownership/hold/attempt arrays to pretend they fit.
    # Existing schema-checking readers reject this as unknown, not an empty fleet.
    return json.dumps({
        "schema": "symphony-lanes-status-unavailable/v1", "status": "unavailable",
        "reason": "essential-public-feed-exceeds-byte-limit",
        "requiredBytes": len(text.encode("utf-8")), "maxBytes": PUBLIC_FEED_MAX_BYTES,
        "fullEvidence": evidence,
    }, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def _status_gist_raw_readback(stored: dict, name: str, expected: str, deadline: float) -> None:
    """Read only this API snapshot's immutable file, through the shared budget client."""
    scripts = str(Path(__file__).resolve().parents[1])
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    from apiclient import ApiClient, ApiError

    actual = stored["files"][name]
    owner = (stored.get("owner") or {}).get("login")
    raw_url = actual.get("raw_url")
    expected_bytes = expected.encode("utf-8")
    if (name not in ("lanes-status.json", STATUS_DETAIL_NAME) or
            not isinstance(owner, str) or not re.fullmatch(r"[A-Za-z0-9-]{1,39}", owner) or
            not isinstance(raw_url, str) or not re.fullmatch(
                rf"https://gist\.githubusercontent\.com/{re.escape(owner)}/{re.escape(stored['id'])}"
                rf"/raw/[a-f0-9]{{40}}/{re.escape(name)}", raw_url) or
            type(actual.get("size")) is not int or actual["size"] != len(expected_bytes)):
        raise ValueError("untrusted or incomplete gist raw evidence")

    def transport(method, url, headers, body, timeout_s):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise ValueError("gist raw deadline exceeded")
        version = lifecycle.run(["curl", "--disable", "--version"],
                                capture_output=True, text=True, timeout=remaining)
        match = re.match(r"curl (\d+)\.(\d+)\.(\d+)\b", version.stdout)
        if version.returncode != 0 or not match or tuple(map(int, match.groups())) < (8, 4, 0):
            raise ValueError("gist raw transfer requires curl 8.4 or newer")
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise ValueError("gist raw deadline exceeded")
        # curl has a whole-transfer deadline, unlike a per-socket idle timeout.
        # No redirects, curlrc, credentials or arbitrary URL input. The expected
        # length is also the download ceiling, including for chunked responses.
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "raw"
            try:
                result = lifecycle.run([
                    "curl", "--disable", "--silent", "--show-error", "--proto", "=https",
                    "--max-redirs", "0", "--max-time", str(remaining),
                    "--max-filesize", str(len(expected_bytes)), "--output", str(output),
                    "--write-out", "%{http_code}", "--url", raw_url,
                ], capture_output=True, text=True, timeout=remaining)
            except subprocess.TimeoutExpired:
                raise OSError("gist raw transfer timed out") from None
            if result.returncode != 0 or not re.fullmatch(r"[1-5][0-9]{2}", result.stdout):
                raise OSError("gist raw transfer unconfirmed")
            if result.stdout != "200":
                # Let the shared client account for rate limits and server failures.
                return int(result.stdout), {}, ""
            with output.open("rb") as handle:
                content = handle.read(len(expected_bytes) + 1)
        if (time.monotonic() >= deadline or len(content) != len(expected_bytes) or
                content != expected_bytes or hashlib.sha256(content).digest() !=
                hashlib.sha256(expected_bytes).digest()):
            raise ValueError("incomplete or changed gist raw evidence")
        return 200, {}, content.decode("utf-8")

    remaining_ms = int((deadline - time.monotonic()) * 1000)
    if remaining_ms <= 0:
        raise ValueError("gist raw deadline exceeded")
    # Raw gist reads are anonymous; never forward the API's bearer credential.
    try:
        response = ApiClient("github", "anonymous-gist-raw", transport=transport).request(
            raw_url, priority="report", max_attempts=1, max_wait_ms=0,
            timeout_ms=remaining_ms, conditional=False)
        if response.status != 200:
            raise ValueError("gist raw transfer unconfirmed")
    except ApiError:
        raise ValueError("gist raw readback unavailable") from None


def publish_status(host, lane, feed: dict, tracking_issue: str = "JOV-6637") -> str | None:
    """Publish one bounded status view plus complete evidence in the existing gist."""
    if not PRIMARY_FLAG.exists():
        return None
    # A readback belongs to one publisher generation, including its final local
    # receipt. Never let a second tick change the packet between check and write.
    with (host.state / "status-gist-publish.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("status-gist-publish-in-progress") from None
        return _publish_status(host, lane, feed, tracking_issue)


def _publish_status(host, lane, feed: dict, tracking_issue: str) -> str:
    deadline = time.monotonic() + 60
    path = host.state / "status-gist.json"
    record_generation = path.read_bytes() if path.exists() else b"{}"
    record = json.loads(record_generation)
    if not isinstance(record, dict):
        raise RuntimeError("status-gist-record-unavailable")
    full_text = json.dumps(feed, indent=1, ensure_ascii=False, allow_nan=False)
    body = host.state / "lanes-status.json"
    atomic_write_text(body, full_text, encoding="utf-8")
    if body.read_bytes() != full_text.encode("utf-8"):
        raise RuntimeError("status-feed-evidence-readback-changed")
    public_text = public_status_projection(feed, full_text)
    try:
        sizes = feed_section_sizes(public_text)
        previous_sizes = read_json(host.state / "public-feed-sizes.json", {})
        sizes.update(feed_growth(previous_sizes.get("samples") or [], time.time(), sizes["bytes"]))
        atomic_write_text(host.state / "public-feed-sizes.json", json.dumps({"at": now_iso(), **sizes}))
    except (OSError, ValueError):
        pass  # a metric never blocks the publish
    packet = {"files": {
        "lanes-status.json": {"content": public_text},
        STATUS_DETAIL_NAME: {"content": full_text},
    }}
    # docs/metrics/STAGE_EVENTS.md: the lanes stage rows, uploaded only when they changed.
    stage_text = stage_events.ndjson(host.state / "runs" / "ledger.jsonl", time.time())
    stage_digest = hashlib.sha256(stage_text.encode("utf-8")).hexdigest()
    if stage_text and record.get("stageEventsSha256") != stage_digest:
        packet["files"][STAGE_EVENTS_NAME] = {"content": stage_text}
    packet_path = host.state / "lanes-status-publish.json"
    created_now = not record.get("url")
    if created_now:
        if record:
            raise RuntimeError("status-gist-creation-reconcile-required")
        packet.update({"description": "Symphony lanes status (written every tick by doctor.py)", "public": False})
    elif not isinstance(record.get("id"), str) or not re.fullmatch(r"[a-f0-9]{1,64}", record["id"]):
        raise RuntimeError("status-gist-record-unavailable")
    packet_text = json.dumps(packet, ensure_ascii=False, allow_nan=False)
    atomic_write_text(packet_path, packet_text, encoding="utf-8")
    lane.load_github_env()

    def api(endpoint, method, input_path=None):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise RuntimeError("status-gist-deadline-exceeded")
        args = ["gh", "api", endpoint, "--method", method]
        if input_path is not None:
            args.extend(["--input", str(input_path)])
        result = lifecycle.run(args, capture_output=True, text=True, timeout=remaining)
        if result.returncode != 0:
            raise RuntimeError("status-gist-publish-unconfirmed")
        return result

    if created_now:
        # An uncertain create must not create another gist on the next tick.
        atomic_write_text(path, json.dumps({
            "creationAttemptedAt": now_iso(),
            "payloadSha256": hashlib.sha256(packet_text.encode("utf-8")).hexdigest(),
        }), encoding="utf-8")
        result = api("gists", "POST", packet_path)
        try:
            created = json.loads(result.stdout)
            if (not isinstance(created.get("id"), str) or not re.fullmatch(r"[a-f0-9]{1,64}", created["id"]) or
                    not isinstance(created.get("html_url"), str) or not created["html_url"]):
                raise ValueError("missing gist identity")
            record = {"url": created["html_url"], "id": created["id"], "createdAt": now_iso()}
        except (ValueError, AttributeError):
            raise RuntimeError("status-gist-create-unconfirmed") from None
        # Retain the known identity even if subsequent readback is unavailable.
        atomic_write_text(path, json.dumps(record), encoding="utf-8")
        record_generation = json.dumps(record).encode("utf-8")
    else:
        api(f"gists/{record['id']}", "PATCH", packet_path)

    result = api(f"gists/{record['id']}", "GET")
    try:
        stored = json.loads(result.stdout)
        files = stored.get("files")
        if stored.get("id") != record["id"] or not isinstance(files, dict):
            raise ValueError("gist identity mismatch")
        raw_readback = False
        for name, expected in packet["files"].items():
            actual = files.get(name)
            if not isinstance(actual, dict):
                raise ValueError("incomplete or changed gist evidence")
            if name == STAGE_EVENTS_NAME and actual.get("truncated") is True:
                # The API truncates files over 1 MB; the full size is the readback there.
                if actual.get("size") != len(expected["content"].encode("utf-8")):
                    raise ValueError("incomplete or changed gist evidence")
            elif actual.get("truncated") is True:
                _status_gist_raw_readback(stored, name, expected["content"], deadline)
                raw_readback = True
            elif actual.get("truncated") is not False or actual.get("content") != expected["content"]:
                raise ValueError("incomplete or changed gist evidence")
        if raw_readback and json.loads(api(f"gists/{record['id']}", "GET").stdout) != stored:
            raise ValueError("gist generation changed during raw readback")
    except (ValueError, AttributeError, OSError, subprocess.TimeoutExpired):
        raise RuntimeError("status-gist-readback-unconfirmed") from None
    record.update({
        "verifiedAt": now_iso(),
        "fullEvidenceSha256": hashlib.sha256(full_text.encode("utf-8")).hexdigest(),
        "publicFeedSha256": hashlib.sha256(public_text.encode("utf-8")).hexdigest(),
        **({"stageEventsSha256": stage_digest} if STAGE_EVENTS_NAME in packet["files"] else {}),
    })
    if (time.monotonic() >= deadline or path.read_bytes() != record_generation or
            body.read_bytes() != full_text.encode("utf-8") or
            packet_path.read_bytes() != packet_text.encode("utf-8")):
        raise RuntimeError("status-gist-readback-unconfirmed")
    atomic_write_text(path, json.dumps(record), encoding="utf-8")
    if created_now:
        try:
            lane.Linear(host.linear_env).comment(
                tracking_issue and _issue_id(lane, host, tracking_issue),
                f"🤖 doctor: lanes status feed (raw JSON, refreshed every tick): {record['url']}/raw/lanes-status.json")
        except Exception:
            pass
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
    rotation = None
    if not os.environ.get("LANES_SELFTEST") and ledger_archive.due(host.state, time.time()):
        try:
            rotation = ledger_archive.rotate(host.state)
        except (OSError, ValueError) as error:  # the ledger stays as it was; the growth-bound alarm keeps firing
            rotation = {"status": "error", "error": f"{type(error).__name__}: {error}"[:160]}
    obs = observe(host, lane, codex)
    obs["ledgerRotation"] = rotation
    # remember when the pool first went empty so the alert needs 30 sustained minutes
    if new_work_empty(obs):
        previous["poolEmptySince"] = previous.get("poolEmptySince") or obs["now"]
    else:
        previous["poolEmptySince"] = None
    repair_holds = admission_repair_holds(obs)
    if repair_holds:
        previous["admissionRepairSince"] = previous.get("admissionRepairSince") or obs["now"]
    elif repair_holds is not None or not (previous.get("alerts") or {}).get("admission-repair-needed"):
        previous["admissionRepairSince"] = None
    if disk_held(obs):
        previous["diskHeldSince"] = previous.get("diskHeldSince") or obs["now"]
        top_at = previous.get("diskTopAt")
        if obs["now"] - previous["diskHeldSince"] >= DISK_HELD_S and not os.environ.get("LANES_SELFTEST") \
                and not (isinstance(top_at, (int, float)) and obs["now"] - top_at < DISK_TOP_REFRESH_S):
            previous["diskTop"], previous["diskTopAt"] = top_disk_consumers(host.state), obs["now"]
    else:
        previous["diskHeldSince"] = previous["diskTop"] = previous["diskTopAt"] = None
    obs["diskTop"] = previous.get("diskTop")
    previous["providerIdleSince"] = provider_idle_since(obs, previous)
    previous["codexIdleSince"] = previous["providerIdleSince"].get("codex")  # old readers
    obs["delivery"] = delivery_evidence(obs, previous)
    previous["deliveryDemandSince"] = obs["delivery"]["demandSince"]
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
    if getattr(tracker, "linear", None) is not None:
        try:
            factory_signals.write(host.state, factory_signals.sentinel_signals(host.state))
        except Exception:  # an adapter fault never fails the doctor
            pass
    if getattr(tracker, "linear", None) is not None:
        result["factoryIntake"] = factory_intake.run_pass(host.state, tracker.linear)
    result["poolEmptySince"] = previous["poolEmptySince"]
    result["admissionRepairSince"] = previous.get("admissionRepairSince")
    for key in ("diskHeldSince", "diskTop", "diskTopAt"):
        result[key] = previous.get(key)
    result["deliveryDemandSince"] = previous.get("deliveryDemandSince")
    result["codexIdleSince"] = previous["codexIdleSince"]
    result["providerIdleSince"] = previous["providerIdleSince"]
    result["escalation"] = obs.get("escalation") or remediation.empty_escalation()
    result["remediation"] = obs.get("remediation") or remediation.empty_remediation()
    result["fileOverlap"] = obs.get("fileOverlap") or file_overlap.doctor_view(host.state)
    for key in ("eventsOpen", "eventsClaimed", "eventsHuman", "eventsExhausted"):
        result[key] = result["remediation"].get(key, 0)
    result["byFingerprint"] = result["remediation"].get("byFingerprint") or {}
    private = {"tick", "codex", "_receipts24h", "_allReceipts", "_ledgerEvidence",
               "_mergeEvidenceByRepository"}
    result["observed"] = {k: v for k, v in obs.items() if k not in private}
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
