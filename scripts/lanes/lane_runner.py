#!/usr/bin/env python3
"""Provider-agnostic shipping lanes for Jovie (Devin, Claude Code, Hyperagent, ...).

One harness owns everything the model should not: claiming, an isolated worktree,
a GBrain context pack, an independent verification gate, receipts and cleanup.
The provider is only the command that writes code (see providers.json).

  lane_runner.py dispatch   # start a worker per free slot of each healthy provider
  lane_runner.py worker --provider devin
  lane_runner.py update     # drain-safe self-update from origin/main (Gem, Mac)

Event-driven: a worker that finishes an issue re-execs the *current* release and
pulls the next one immediately; timers only restart idle lanes. Updates swap the
`current` symlink and never signal a running worker, so in-flight work finishes on
the release it started with and the next issue runs on the new one.
"""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import math
import json
import os
import random
import re
import shutil
import socket
import stat
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import continuity_clock  # noqa: E402
import lifecycle  # noqa: E402
import devin_free_policy  # noqa: E402
import autoscale  # noqa: E402
import disk_guard  # noqa: E402  (sibling module of the release)
import doctor  # noqa: E402  (sibling module of the release)
import execution_attempt  # noqa: E402
import file_overlap  # noqa: E402
import claude_lane  # noqa: E402  (subscription quota bank read by the router)
import hyperagent_lane  # noqa: E402
import pr_events  # noqa: E402
import remediation  # noqa: E402  (classifier, router, escalation ladder)
import workstreams  # noqa: E402  (shared workstream rank + duplicate identity)
import worktree_sweep  # noqa: E402  (idle / merged-PR checkout retirement, JOV-7704)
import worktree_pool  # noqa: E402  (pre-installed worktree pool, JOV-7705)
import reason_lane  # noqa: E402
import yc_corpus  # noqa: E402
import design_gate  # noqa: E402  (IA-first admission for UI and landing work)
import dependency_diff  # noqa: E402  (immutable dependency-version chore evidence)
# This module as imported: the event hooks take it as `lane`. Bound once, because other
# loaders (the HUD) may later rebind sys.modules["lane_runner"] to a fresh copy.
THIS = sys.modules[__name__]
REPO_SLUG = "JovieInc/Jovie"
# `agent-ready` is the shared pool every enabled lane drains (Symphony Elixir is retired);
# the rest stay with humans.
SHARED_LABEL = "agent-ready"
SENSITIVE_LABELS = frozenset({
    "billing", "blocked:payments", "stripe", "cost-monitoring", "blocked:auth", "auth",
    "area:auth", "infra", "area:infra", "infrastructure", "vercel",
})
EXCLUDED_LABELS = frozenset({"no-symphony", *SENSITIVE_LABELS, "type:epic", "codex-blocked", "reasoning-job"})
HARD_EXCLUDED_LABELS = frozenset({"no-symphony", "type:epic", "codex-blocked", "reasoning-job"})
SENSITIVE_PROVIDER = "codex"
# JOV-6896: codex lanes are implementation-only. Review work bills the leased ChatGPT
# accounts without producing code, so a codex slot never claims a review-only task kind
# (adopting/gating another lane's PR) and its worker never posts PR review comments.
# Coverage is unchanged: CI is the merge gate and sentry/sonar review every PR.
IMPLEMENTATION_ONLY_PROVIDERS = frozenset({"codex"})
REVIEW_ONLY_KINDS = frozenset({"adopt", "gate"})
SENSITIVE_REVIEWABLE_LINES = 500
SENSITIVE_RED_LINES = re.compile(
    r"\b(?:rotate|rotation|revoke|revocation)\b.{0,40}\b(?:secret|credential|token|key)s?\b|"
    r"\b(?:secret|credential|token|key)s?\b.{0,40}\b(?:rotate|rotation|revoke|revocation)\b|"
    r"\b(?:live|production|prod)\b.{0,40}\b(?:price|pricing)\b|"
    r"\b(?:price|pricing)\b.{0,40}\b(?:live|production|prod)\b",
    re.IGNORECASE,
)
MAX_FAILURES = 3
MAX_FIX_ATTEMPTS = 2
MAX_GATE_TIMEOUTS = 3
CLAIM_TTL_S = pr_events.CLAIM_TTL_S
HOST = socket.gethostname().split(".")[0]
# Every file a release must pass before `current` moves to it.
LANE_TESTS = ["scripts/tests/test_execution_attempt.py", "scripts/tests/test_lane_runner.py", "scripts/tests/test_hyperagent_lane.py",
              "scripts/tests/test_codex_lane.py", "scripts/tests/test_hud.py", "scripts/tests/test_devin_free_policy.py",
              "scripts/tests/test_doctor.py", "scripts/tests/test_pr_events.py",
              "scripts/tests/test_reason_lane.py", "scripts/tests/test_yc_corpus.py",
              "scripts/tests/test_gh_app_token.py",
              "scripts/tests/test_disk_guard.py", "scripts/tests/test_continuity_clock.py",
              "scripts/tests/test_worktree_sweep.py", "scripts/tests/test_service_census.py",
              "scripts/tests/test_worktree_pool.py",
              "scripts/tests/test_design_gate.py",
              "scripts/tests/test_file_overlap.py",
              "scripts/tests/test_remediation.py", "scripts/tests/test_autoscale.py",
              "scripts/tests/test_claude_lane.py", "scripts/tests/test_issue_routing.py"]
# Dependencies outside scripts/lanes for installed source admission and the HUD's
# PROMOTION line (JOV-6836).
RELEASE_EXTRAS = ["scripts/promotion-loss-metrics.mjs", "scripts/merge-group-failure-hold.mjs",
                  "scripts/lib/merge-group-admission.mjs",
                  "scripts/lib/source-admission-policy.mjs", "scripts/lib/merge-group-member-policy.mjs",
                  "scripts/lib/product-lane-classifier.mjs",
                  "scripts/lib/pr-size-guard-policy.mjs", "scripts/lib/repo-hygiene-limits.mjs",
                  "scripts/lib/pre-land-changelog.mjs", "scripts/version-fanout-guard.mjs",
                  "scripts/merge-queue-backend.mjs", "scripts/lib/merge-queue-guard.mjs",
                  ".nvmrc", "pnpm-lock.yaml", "packages/agent-transport-contracts/work-order.ts",
                  "scripts/backlog-orchestrator/summer-triage-assessment-client.mjs"]
# Preserve legacy dated run prefixes; only Hyperagent also owns the exact
# public 15-hex identity digest generated by run_hyperagent_issue.
LANE_BRANCH = re.compile(
    r"^(?=[a-z0-9-]+/jov-\d+-\d{8}|hyperagent/jov-\d+-[a-f0-9]{15}\Z)"
    r"(?P<lane>[a-z0-9-]+)/(?P<issue>jov-\d+)-(?:\d{8}|[a-f0-9]{15}\Z)"
)
RED = frozenset({"FAILURE", "TIMED_OUT", "STARTUP_FAILURE"})
RETRY_BACKOFF_S = 1800
# JOV-7690: a recovery-handoff run does no work, so the issue backs off exponentially
# (5 min doubling to 6 h) instead of being re-claimed on the next reexec. Linear hears
# about the first handoff and once more at HANDOFF_COMMENT_AT, never once per loop.
HANDOFF_BACKOFF_S = 300
HANDOFF_BACKOFF_CAP_S = 6 * 3600
HANDOFF_COMMENT_AT = 3
PRESERVED_RUN_NAME = re.compile(r"^\d{8}T\d{6}Z-(?P<issue>[A-Z]+-\d+)-")
# JOV-6833: a lane may hold this many open non-green PRs per slot before it stops claiming
# new issues and only fixes/adopts what it already opened.
OPEN_PRS_PER_SLOT = 2
# Held/exhausted lane PRs wait for a human and cannot be advanced by the owning lane
# (codex may not adopt/gate). They are bounded separately so they cannot pin the
# active budget at its cap forever (JOV-7514: codex idle with 7 terminal PRs).
TERMINAL_PRS_PER_SLOT = 4
LANE_ISSUE_PAGES = 5  # <=500 Todo candidates per lane read
STALE_DRAFT_S = 24 * 3600
SWEEP_EVERY_S = 1800
PROVIDER_COOLDOWN_S = 900
WORKTREE_INSTALL = ["pnpm", "install", "--frozen-lockfile", "--prefer-offline",
                    "--package-import-method=hardlink"]
# Waiting work gains one priority level per day, capped at urgent. This preserves
# urgent-first admission while guaranteeing that a sustained P1 stream cannot
# starve older work forever.
PRIORITY_AGING_S = 24 * 3600
# Generated files do not count toward the reviewable-size cap.
GENERATED = re.compile(r"(^|/)(drizzle/migrations/meta/|pnpm-lock\.yaml$|__snapshots__/|\.snap$)")
# Test files: JS/TS conventions plus Python test_*.py and Xcode *Tests/ dirs.
TEST_FILE = re.compile(r"(\.test\.|\.spec\.|/(?:tests?|__tests__|[^/]*Tests)/|(^|/)test_[^/]+\.py$)")
DOC_FILE = re.compile(r"(\.mdx?c?$|^docs/|^canon/|\.txt$)")
SECRET_FILE = re.compile(r"(^|/)\.env(\.|$)|\.pem$|credentials|id_rsa")
MAX_REVIEWABLE_LINES = 1500
PROVIDER_EVIDENCE_SCHEMA = "jovie-provider-lease/v1"
AUTONOMOUS_ORIGIN = "autonomous-lane"


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def read_provider_evidence(path: Path) -> list[dict]:
    """Read the provider's append-only lease evidence without letting a bad row hide a run."""
    rows = []
    try:
        for line in path.read_text().splitlines():
            try:
                row = json.loads(line)
            except ValueError:
                continue
            if row.get("schema") == PROVIDER_EVIDENCE_SCHEMA:
                rows.append(row)
    except OSError:
        pass
    return rows


def receipt_category(receipt: dict) -> str:
    """Stable attribution for new receipts, with conservative inference for old ledger rows."""
    explicit = (receipt.get("attribution") or {}).get("category")
    if explicit:
        return explicit
    kind = receipt.get("kind") or "issue"
    if kind == "fix-red":
        return "autonomous-remediation"
    if kind == "adopt":
        return "review-only"
    if kind in ("ready-green", "sync-main"):
        return "finalizer-only"
    if receipt.get("handoffs"):
        return "cross-provider-handoff"
    return "autonomous-created"


def pr_attribution(pr: dict, receipts: list[dict]) -> dict:
    """Attribute a PR from durable lane receipts; branch names are fallback evidence only."""
    number = int(pr["number"])
    matched = [row for row in receipts if row.get("pr") == number]
    created = [row for row in matched if row.get("issue") and (row.get("kind") or "issue") == "issue"]
    creator = min(created, key=lambda row: row.get("startedAt", "")) if created else None
    roles = []
    for row in matched:
        provider = row.get("provider")
        category = receipt_category(row)
        if provider:
            roles.append({"provider": provider, "category": category, "runId": row.get("runId")})

    if creator:
        category = receipt_category(creator)
        origin_category = category
        origin_provider = creator.get("provider")
        final_provider = creator.get("finishedBy") or origin_provider
        origin = AUTONOMOUS_ORIGIN
    else:
        branch = pr.get("headRefName") or ""
        created_at, merged_at = pr.get("createdAt"), pr.get("mergedAt")
        old = False
        try:
            age = datetime.fromisoformat(merged_at.replace("Z", "+00:00")) - \
                datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            old = age.total_seconds() >= 24 * 3600
        except (AttributeError, TypeError, ValueError):
            pass
        if branch.startswith("codex/") and old:
            category, origin, origin_provider = "old-codex-branch-landed-later", "branch-fallback", None
        elif branch.startswith("codex/"):
            category, origin, origin_provider = "manual-codex-app-created", "branch-fallback", "codex-app"
        else:
            category, origin, origin_provider = "unattributed", "unknown", None
        origin_category = category
        final_provider = origin_provider

    pushed = [row for row in matched if row.get("kind") == "fix-red" and row.get("verdict") == "fix-pushed"]
    if pushed:
        last = max(pushed, key=lambda row: row.get("endedAt", ""))
        finalizer = last.get("provider")
        if finalizer and finalizer != final_provider:
            category, final_provider = "cross-provider-finalizer", finalizer

    return {"category": category, "originCategory": origin_category, "origin": origin, "originProvider": origin_provider,
            "finalProvider": final_provider, "roles": roles}


def provider_throughput(receipts: list[dict], provider_names=(), merged_prs: list[dict] | None = None,
                        attribution_receipts: list[dict] | None = None) -> dict:
    """Matched-work throughput. Unknown evidence stays null instead of becoming a false zero."""
    names = set(provider_names)
    names.update(row.get("provider") for row in receipts if row.get("provider"))
    names.update(evidence.get("provider") for row in receipts for evidence in row.get("providerEvidence") or []
                 if evidence.get("provider"))
    metrics = {name: {"eligibleWorkOffered": 0, "accepted": 0, "workerStarts": 0,
                      "productiveRuns": 0, "prsCreated": 0, "firstPassGreen": 0,
                      "firstPassAttempts": 0, "remediationRuns": 0, "accountLeases": 0,
                      "landedOutput": 0, "terminalFailures": 0}
               for name in sorted(names)}
    issue_to_pr: dict[str, list[float]] = {name: [] for name in metrics}
    for row in receipts:
        provider = row.get("provider")
        if provider not in metrics:
            continue
        metric = metrics[provider]
        kind = row.get("kind") or "issue"
        if kind == "issue" and row.get("issue"):
            metric["eligibleWorkOffered"] += 1
            if (row.get("offer") or {}).get("accepted") or \
                    row.get("execution", {}).get("event") == "attempt_finished" or row.get("agentExit") is not None:
                metric["accepted"] += 1
            if row.get("agentExit") is not None:
                metric["workerStarts"] += 1
            if row.get("pr"):
                metric["prsCreated"] += 1
                metric["firstPassAttempts"] += 1
                if row.get("verdict") in ("landing", "verified-not-queued"):
                    metric["firstPassGreen"] += 1
                try:
                    elapsed = datetime.fromisoformat(row["endedAt"].replace("Z", "+00:00")) - \
                        datetime.fromisoformat(row["startedAt"].replace("Z", "+00:00"))
                    issue_to_pr[provider].append(max(0.0, elapsed.total_seconds()))
                except (KeyError, TypeError, ValueError):
                    pass
            if row.get("pr"):
                metric["productiveRuns"] += 1
        if kind == "fix-red":
            metric["remediationRuns"] += 1
        for evidence in row.get("providerEvidence") or []:
            evidence_provider = evidence.get("provider")
            if evidence_provider in metrics and evidence.get("event") == "account-leased":
                metrics[evidence_provider]["accountLeases"] += 1
        if row.get("verdict") in ("failed", "provider-error", "fix-no-change"):
            metric["terminalFailures"] += 1

    landed_categories: dict[str, int] = {}
    landed_origins: dict[str, int] = {}
    merge_times: dict[str, list[float]] = {name: [] for name in metrics}
    attribution_rows = attribution_receipts if attribution_receipts is not None else receipts
    for pr in merged_prs or []:
        attribution = pr_attribution(pr, attribution_rows)
        category = attribution["category"]
        landed_categories[category] = landed_categories.get(category, 0) + 1
        origin_category = attribution["originCategory"]
        landed_origins[origin_category] = landed_origins.get(origin_category, 0) + 1
        provider = attribution.get("originProvider")
        if provider in metrics and attribution.get("origin") == AUTONOMOUS_ORIGIN:
            metrics[provider]["landedOutput"] += 1
            creators = [row for row in attribution_rows if row.get("pr") == pr.get("number") and row.get("issue")]
            try:
                creator = min(creators, key=lambda row: row.get("startedAt", ""))
                elapsed = datetime.fromisoformat(pr["mergedAt"].replace("Z", "+00:00")) - \
                    datetime.fromisoformat(creator["startedAt"].replace("Z", "+00:00"))
                merge_times[provider].append(max(0.0, elapsed.total_seconds()))
            except (KeyError, TypeError, ValueError):
                pass

    for name, metric in metrics.items():
        offered, starts = metric["eligibleWorkOffered"], metric["workerStarts"]
        metric["workerStartRate"] = starts / offered if offered else None
        metric["productiveRunRate"] = metric["productiveRuns"] / starts if starts else None
        metric["prCreatedRate"] = metric["prsCreated"] / metric["accepted"] if metric["accepted"] else None
        metric["firstPassGreenRate"] = metric["firstPassGreen"] / metric["firstPassAttempts"] \
            if metric["firstPassAttempts"] else None
        timings = sorted(issue_to_pr[name])
        metric["issueToPrSecondsP50"] = timings[len(timings) // 2] if timings else None
        landed_timings = sorted(merge_times[name])
        metric["issueToMergeSecondsP50"] = landed_timings[len(landed_timings) // 2] \
            if landed_timings else None
    return {"schema": "jovie-provider-throughput/v1", "windowHours": 24,
            "providers": metrics, "landedByAttribution": dict(sorted(landed_categories.items())),
            "landedByOrigin": dict(sorted(landed_origins.items()))}


def capacity_horizon(codex_status: dict, receipts: list[dict], qualified_work=(),
                     idle_seconds: int = 0, now: float | None = None) -> dict:
    """One show-only receipt consumed unchanged by Ovi and the Gem HUD."""
    now = time.time() if now is None else now
    qualified = [str(job) for job in qualified_work if re.fullmatch(r"JOV-\d+", str(job))][:20]
    routes = {}
    for receipt in receipts:
        route = receipt.get("capacityRouteReceipt") or {}
        if route.get("schema") == "jovie.capacity-route-receipt/v1" and route.get("selectedLeaseId"):
            routes[route["selectedLeaseId"]] = (route, receipt)

    leases, source_incidents = [], []
    for account, account_status in (codex_status.get("accounts") or {}).items():
        lease = account_status.get("capacityLease") or {}
        lease_id = lease.get("leaseId") or f"codex:{account}"
        safe_alias = account if re.fullmatch(r"[A-Za-z0-9_-]{1,32}", account) else \
            f"codex-{hashlib.sha256(account.encode()).hexdigest()[:8]}"
        public_lease_id = f"codex:{safe_alias}"
        windows = [row for row in (lease.get("usableCapacityRemaining") or {}).values()
                   if isinstance(row, dict) and isinstance(row.get("remainingPercent"), (int, float))]
        remaining = min((row["remainingPercent"] for row in windows), default=None)
        candidates = []
        if isinstance(lease.get("nextNaturalResetAt"), (int, float)):
            candidates.append((lease["nextNaturalResetAt"], "natural-reset", "natural reset"))
        if isinstance(lease.get("earliestAccessLossAt"), (int, float)):
            payment = (lease.get("subscription") or {}).get("paymentFailure")
            candidates.append((lease["earliestAccessLossAt"], "access-loss",
                               "payment grace ends" if payment else "access loss"))
        for credit in (lease.get("credits") or {}).get("details") or []:
            expiry = credit.get("capacityLossAt") or credit.get("redemptionDeadline")
            if isinstance(expiry, (int, float)):
                promo = credit.get("kind") == "promotional"
                candidates.append((expiry, "promo-expiry" if promo else "banked-expiry",
                                   "hard promo expiry" if promo else "banked expiry"))
        deadline, event_kind, event_label = min(candidates, default=(None, "unknown", "semantics unknown"))
        throughput = lease.get("throughput") or {}
        drain_seconds = throughput.get("estimatedDrainTimeS")
        subscription, compatibility = lease.get("subscription") or {}, lease.get("compatibility") or {}
        plan = lease.get("planType")
        subscription_status = "payment-grace" if subscription.get("paymentFailure") else "ending" if subscription.get("canceledAtPeriodEnd") else "active" if plan not in (None, "free", "unknown") else "inactive" if plan == "free" else "unknown"
        usable = lease.get("usableBeforeUnavailability")
        unused = round(max(0, remaining - usable), 1) \
            if isinstance(remaining, (int, float)) and isinstance(usable, (int, float)) else None
        route, execution = routes.get(lease_id, ({}, {}))
        public_route = ({"schema": route.get("schema"), "selectedJob": route.get("selectedJob"),
                         "selectedRoute": route.get("selectedRoute"), "selectedLeaseId": public_lease_id,
                         "alternativesConsidered": [value for value in (route.get("alternativesConsidered") or [])
                                                    if re.fullmatch(r"[A-Za-z0-9:_-]{1,64}", str(value))],
                         "marginalValue": route.get("marginalValue"),
                         "expectedCertifiedOutcome": route.get("expectedCertifiedOutcome"),
                         "drainMode": route.get("drainMode"), "modeTrigger": route.get("modeTrigger"),
                         "reason": route.get("reason"), "replanConditions": route.get("replanConditions", []),
                         "sourceGaps": route.get("sourceGaps", [])} if route else None)
        verdict = execution.get("verdict")
        outcomes = {key: 0 for key in ("useful", "certified", "duplicate", "retry", "failed", "unknown")}
        if verdict in ("landing", "verified-not-queued"):
            outcomes["certified"] = 1
        elif verdict == "duplicate-active":
            outcomes["duplicate"] = 1
        elif execution.get("kind") == "fix-red":
            outcomes["retry"] = 1
        elif verdict in ("failed", "provider-error", "fix-no-change"):
            outcomes["failed"] = 1
        elif execution.get("pr"):
            outcomes["useful"] = 1
        elif execution:
            outcomes["unknown"] = 1
        freshness = ((lease.get("sources") or {}).get("capacity") or {}).get("observedAt")
        try: observed = datetime.fromisoformat(freshness.replace("Z", "+00:00")).timestamp()
        except (AttributeError, ValueError): observed = None
        freshness_status = "unknown" if observed is None else "contradictory" if observed > now + 60 else "stale" if now - observed > 7200 else "fresh"
        bottleneck = ("capacity source missing" if not lease else
                      f"capacity source {freshness_status}" if freshness_status != "fresh" else
                      "deadline semantics unknown" if deadline is None else
                      "drain evidence stale or missing" if not throughput.get("fresh") else
                      "compatible qualified work not observed" if not qualified else
                      "projected unused capacity" if unused else None)
        leases.append({
            "leaseId": public_lease_id, "alias": safe_alias, "sourcePresent": bool(lease),
            "available": bool(account_status.get("available")),
            "provider": lease.get("provider") or "openai", "usableRemaining": remaining,
            "subscriptionStatus": subscription_status,
            "compatibility": {"cli": compatibility.get("cli"), "harness": compatibility.get("harness"),
                              "models": compatibility.get("models") or [], "restrictions": compatibility.get("restrictions") or []},
            "concurrency": throughput.get("concurrency"),
            "bankedCount": (lease.get("credits") or {}).get("availableCount"),
            "event": {"kind": event_kind, "label": event_label,
                      "at": datetime.fromtimestamp(deadline, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                      if deadline is not None else None,
                      "countdownSeconds": max(0, int(deadline - now)) if deadline is not None and freshness_status == "fresh" else None},
            "forecast": {"schema": "jovie.drain-forecast/v1",
                         "completionP50At": datetime.fromtimestamp(now + drain_seconds, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                         if isinstance(drain_seconds, (int, float)) else None,
                         "completionP90At": None, "sustainablePercentPerHour": throughput.get("sustainablePercentPerHour"),
                         "burstPercentPerHour": throughput.get("burstPercentPerHour"),
                         "usableBeforeUnavailability": usable, "projectedUnused": unused,
                         "qualifiedWork": qualified, "bottleneck": bottleneck},
            "route": public_route, "mode": route.get("drainMode", "unknown"),
            "outcomes": outcomes,
            "freshness": {"observedAt": freshness, "status": freshness_status,
                          "confidence": throughput.get("confidence", "unknown")},
        })
        if deadline is not None and deadline - now <= 7200 and freshness_status in ("stale", "contradictory"):
            source_incidents.append({"schema": "jovie.capacity-expiry-incident/v1", "incidentId": f"{public_lease_id}:source:{deadline}", "leaseId": public_lease_id, "kind": "source-contract", "unusedAmount": unused, "hardConstraint": "stale-or-contradictory-input", "staleOrMissingInput": True, "idleIntervalSeconds": 0, "rootCause": f"capacity source {freshness_status} near deadline", "remediationOwner": "symphony-lanes", "jobEvidence": qualified})
    leases.sort(key=lambda row: (row["event"]["at"] is None, row["event"]["at"] or "", row["leaseId"]))
    incidents = source_incidents
    available = [row for row in leases if row["sourcePresent"] and row["available"]]
    if idle_seconds >= 300 and qualified and available:
        row = available[0]
        incidents.append({"schema": "jovie.capacity-expiry-incident/v1",
                          "incidentId": f"{row['leaseId']}:idle:{row['event']['at'] or 'unknown-generation'}",
                          "leaseId": row["leaseId"], "kind": "idle-with-qualified-work",
                          "unusedAmount": row["forecast"]["projectedUnused"], "hardConstraint": "symphony-idle",
                          "staleOrMissingInput": row["freshness"]["status"] != "fresh",
                          "idleIntervalSeconds": idle_seconds, "rootCause": "usable lease and qualified work coexist without a worker",
                          "remediationOwner": "symphony-lanes", "jobEvidence": qualified})
    top = incidents[0]["rootCause"] if incidents else next(
        (row["forecast"]["bottleneck"] for row in leases if row["forecast"]["bottleneck"]), None)
    totals = {key: sum(row["outcomes"][key] for row in leases) for key in ("useful", "certified", "duplicate", "retry", "failed", "unknown")}
    return {"schema": "jovie.capacity-horizon/v1", "generatedAt": datetime.fromtimestamp(now, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "leases": leases,
            "outcomes": totals, "incidents": incidents, "topBlocker": top, "founderJudgmentRequired": False,
            "controls": "show-only"}


def execution_coordination(sha: str) -> dict:
    if os.environ.get("LANES_EXECUTION_BACKEND") == "local-test" or os.environ.get("LANES_SELFTEST") == "1":
        return {"kind": "local-test"}
    return {"kind": "github-status", "repository": REPO_SLUG, "sha": sha, "tokenEnv": "GH_TOKEN"}


def default_gate_timeout() -> int:
    """Give the slower macOS gate more time without delaying Linux failures."""
    return 3600 if sys.platform == "darwin" else 2400


@dataclass
class Host:
    """Everything host-specific; defaults suit Gem and the Mac."""
    state: Path = Path(os.environ.get("LANES_STATE", Path.home() / ".local/state/jovie-lanes"))
    repo: Path = Path(os.environ.get("LANES_REPO", Path.home() / "devin-sweep/Jovie"))
    linear_env: Path = Path(os.environ.get("LANES_LINEAR_ENV", Path.home() / ".config/symphony/linear.env"))
    agent_timeout: int = int(os.environ.get("LANES_AGENT_TIMEOUT_S", 5400))
    gate_timeout: int = field(default_factory=lambda: int(
        os.environ.get("LANES_GATE_TIMEOUT_S", default_gate_timeout())))
    # Gates (typecheck, vitest, component contracts) are CPU-bound; more than a couple at
    # once only makes all of them time out.
    gate_slots: int = int(os.environ.get("LANES_GATE_SLOTS", 2))

    def base_slots(self, provider: str, default: int) -> int:
        if provider == 'devin' and not devin_free_policy.admission_open(self.agent_timeout):
            return 0
        return int(os.environ.get(f"LANES_SLOTS_{provider.upper()}", default))

    def slots(self, provider: str, default: int) -> int:
        return autoscale.effective_slots(self.state, provider, self.base_slots(provider, default))


def load_providers(path: Path = HERE / "providers.json") -> dict:
    return json.loads(path.read_text())


# ---------------------------------------------------------------- selection

@dataclass
class Issue:
    id: str
    identifier: str
    title: str
    description: str
    priority: int
    created_at: str
    labels: list[str] = field(default_factory=list)


def failure_record(value) -> dict:
    return value if isinstance(value, dict) else {"count": int(value or 0), "at": 0}


def created_at_epoch(value: str) -> float | None:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.timestamp() if parsed.tzinfo is not None else None
    except (AttributeError, TypeError, ValueError):
        return None


def issue_is_sensitive(issue: Issue) -> bool:
    return bool(SENSITIVE_LABELS & {label.lower() for label in issue.labels})


def issue_hits_red_line(issue: Issue) -> bool:
    text = f"{issue.title}\n{issue.description}"
    for match in SENSITIVE_RED_LINES.finditer(text):
        # Public-page schema fixtures are test data, not live plan prices.
        # Only exempt this complete reference, never the whole issue.
        if (re.fullmatch(r"live\s+`/pricing", match.group(0), re.IGNORECASE)
                and re.match(r"`\s+schema\s+fixture\b", text[match.end():], re.IGNORECASE)):
            continue
        return True
    return False


def admission_rejection(issue: Issue, failures: dict, now: float,
                        in_flight: frozenset[str] = frozenset(),
                        provider: str | None = None, route=None) -> str | None:
    """Final claim predicate; in_flight contains normalized lowercase identifiers.

    `route(issue)` is the cost-aware router (JOV-7706): an issue whose cheapest qualifying
    available route belongs to another lane is that lane's; none qualifying holds it."""
    labels = {label.lower() for label in issue.labels}
    excluded = sorted(HARD_EXCLUDED_LABELS & labels)
    # `remediation:*` outranks `no-symphony` (JOV-7540, JOV-7551). Other hard
    # exclusions still apply. The bare `remediation` label does not.
    if ("no-symphony" in excluded and remediation.escalation_enabled()
            and remediation.has_remediation_event_label(issue.labels)):
        excluded = [name for name in excluded if name != "no-symphony"]
    if excluded:
        return "excluded-label:" + excluded[0]
    if issue_hits_red_line(issue):
        return "sensitive-text"
    if SENSITIVE_LABELS & labels and provider != SENSITIVE_PROVIDER:
        return "sensitive-provider"
    record = failure_record(failures.get(issue.identifier))
    if record["count"] >= MAX_FAILURES:
        return "retry-exhausted"
    if now - record["at"] < RETRY_BACKOFF_S:
        return "retry-backoff"
    if issue.identifier.lower() in in_flight:
        return "in-flight-pr"
    if route is not None:
        decision = route(issue)
        chosen = decision.get("chosen")
        if chosen is None:
            return "route-held:" + decision["required"]
        if chosen["lane"] != provider:
            return "routed:" + chosen["lane"]
    return None


# JOV-7708: files that concurrent PRs keep colliding on (31 of 66 open PRs were DIRTY on
# 2026-10-03). While an open PR holds one, a new issue predicted to touch it waits.
LANES_HARNESS = frozenset({"scripts/lanes/lane_runner.py", "scripts/lanes/hud.py", "scripts/lanes/doctor.py"})
HOTSPOT_SEED = LANES_HARNESS | frozenset({
    "apps/web/lib/flags/code-flags.ts",
    "apps/web/lib/commands/registry.ts",
    "apps/web/data/product-truth/registry.ts",
    "apps/web/tests/node-environment-files.json",
    "apps/web/tests/unit/design-system/destructive-red-drift.baseline.json",
})
# Without a file hint, the issue's workstream predicts its touch set. Symphony-throughput
# work lands in the lanes harness, so that area runs one in-flight PR at a time.
AREA_HOTSPOTS = {"symphony-throughput": LANES_HARNESS}
PATH_HINT = re.compile(
    r"(?<![\w/.-])[\w@()\[\].-]*(?:/[\w@()\[\].-]+)*\.(?:py|tsx?|mjs|cjs|jsx?|json|ya?ml|swift|sql|css)(?![\w/])")


def predicted_touch(issue: Issue) -> frozenset[str]:
    """Paths the issue names (title or description), else its workstream's hotspots."""
    hints = frozenset(match.group(0) for match in PATH_HINT.finditer(f"{issue.title}\n{issue.description}"))
    return hints or AREA_HOTSPOTS.get(workstreams.classify(issue.title, issue.labels), frozenset())


def hotspot_holds(prs: list[dict]) -> dict[str, int]:
    """{hotspot path: the oldest open PR touching it}. Hotspots are HOTSPOT_SEED plus any file
    two or more open PRs touch. Parked PRs (held or repair-exhausted) hold nothing: they
    rebuild from main once the active work lands."""
    active = sorted((pr for pr in prs if not pr_is_terminal(pr)), key=lambda pr: pr.get("number") or 0)
    touched = [(pr["number"], {entry.get("path") for entry in pr.get("files") or [] if entry.get("path")})
               for pr in active]
    seen: dict[str, int] = {}
    for _, paths in touched:
        for path in paths:
            seen[path] = seen.get(path, 0) + 1
    hot = HOTSPOT_SEED | {path for path, count in seen.items() if count >= 2}
    holds: dict[str, int] = {}
    for number, paths in touched:
        for path in paths & hot:
            holds.setdefault(path, number)
    return holds


def held_hotspot(touch: frozenset[str], holds: dict[str, int]) -> tuple[str, int] | None:
    """The first held hotspot the predicted touch set hits. A hint may be a bare filename
    or a repo-relative suffix (`lib/flags/code-flags.ts`)."""
    for path in sorted(holds):
        if any(path == hint or path.endswith("/" + hint.lstrip("./")) for hint in touch):
            return path, holds[path]
    return None


def pool_rejections(issues: list[Issue], holds: dict[str, int] | None = None) -> dict[str, str]:
    """Pool-level admission (JOV-5555): exact normalized-title duplicates are one unit of
    work. Non-canonical members are rejected; the canonical (oldest) one stays admissible.
    JOV-7708: an issue whose predicted touch set hits a hotspot an open PR holds waits
    (`hotspot-held:<path>#<pr>`) instead of opening a PR that will conflict."""
    rejected = {identifier: "duplicate-candidate:" + canonical
                for identifier, canonical in workstreams.duplicate_of(issues).items()}
    for issue in issues:
        if holds and issue.identifier not in rejected and (hit := held_hotspot(predicted_touch(issue), holds)):
            rejected[issue.identifier] = f"hotspot-held:{hit[0]}#{hit[1]}"
    return rejected


def admission_order(issue: Issue, now: float) -> tuple:
    """Dispatch rule shared by every lane and the doctor (JOV-7423 leverage-first):

    1. tier -1 = operator-designated `dispatch-next` in the agent-ready pool;
       tier 0 = urgent (effective P1, including aged work) or compounding infrastructure
       (CI, Symphony throughput); everything else is tier 1;
    2. aged priority: waiting work gains one level per day until it reaches P1;
    3. workstream rank (workstreams.RANK);
    4. age (createdAt, malformed dates last).
    """
    created_at = created_at_epoch(issue.created_at)
    base_priority = issue.priority or 5
    waited = max(0, now - created_at) if created_at is not None else 0
    effective_priority = max(1, base_priority - int(waited // PRIORITY_AGING_S))
    stream = workstreams.classify(issue.title, issue.labels)
    labels = {label.lower() for label in issue.labels}
    tier = (-1 if {SHARED_LABEL, "dispatch-next"} <= labels
            else 0 if effective_priority == 1 or workstreams.compounding(stream) else 1)
    return (tier, effective_priority, workstreams.rank(stream),
            created_at if created_at is not None else float("inf"))


def pick_issue(issues: list[Issue], failures: dict, now: float | None = None,
               in_flight: frozenset[str] = frozenset(), provider: str | None = None,
               holds: dict[str, int] | None = None,
               held_back: frozenset[str] = frozenset(), route=None) -> Issue | None:
    """Symphony orders by tier, aged priority, workstream rank, then age (admission_order).

    Waiting work gains one priority level per day until it reaches P1, preventing a
    sustained stream of newer urgent work from starving older work. Excluded work,
    3x failures, retry backoff, issues with an open lane PR, duplicate candidates and
    issues aimed at a held hotspot (pool_rejections) remain ineligible, as do issues
    with preserved work or a recovery-handoff cooldown (held_back, JOV-7690).
    """
    now = time.time() if now is None else now
    in_flight = frozenset(identifier.lower() for identifier in in_flight)
    duplicates = pool_rejections(issues, holds)
    eligible = [issue for issue in issues
                if issue.identifier not in duplicates
                and issue.identifier not in held_back
                and admission_rejection(issue, failures, now, in_flight, provider, route) is None]
    eligible.sort(key=lambda issue: admission_order(issue, now))
    return eligible[0] if eligible else None


# ---------------------------------------------------------------- routing (JOV-7706)

ROUTING_POLICY = HERE / "routing.json"
# A lane whose last worker stopped for a reason other than an empty pool cannot take new work.
IDLE_BLOCK_S = 600


def read_json(path: Path) -> dict:
    try:
        data = json.loads(path.read_text())
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def slot_free(host: "Host", name: str, slots: int) -> bool:
    for index in range(slots):
        lock = Locked(host.state / "slots" / f"{name}.{index}.lock", blocking=False)
        held = lock.held
        lock.release()
        if held:
            return True
    return False


def recent_lane_runs(host: "Host", name: str, window_s: float, now: float, tail_bytes: int = 4_000_000) -> int:
    """Issue runs this lane started inside the window, from the tail of the shared ledger."""
    try:
        with open(host.state / "runs" / "ledger.jsonl", "rb") as handle:
            handle.seek(0, os.SEEK_END)
            handle.seek(max(0, handle.tell() - tail_bytes))
            lines = handle.read().decode(errors="replace").splitlines()
    except OSError:
        return 0
    count = 0
    for line in lines:
        try:
            row = json.loads(line)
        except ValueError:
            continue
        started = created_at_epoch(str(row.get("startedAt") or "")) if isinstance(row, dict) else None
        if row.get("provider") == name and not row.get("kind") and started and now - started < window_s:
            count += 1
    return count


def quota_pressure(host: "Host", name: str, spec: dict, now: float) -> dict:
    """{ok, why, pressure}: how much of the lane's quota window is spent. Pressure raises the
    effective cost of subscription and credit lanes as they fill; a bank removes them."""
    quota = spec.get("quota") or {}
    source = quota.get("source")
    if source == "claude-lane":
        state = claude_lane.read_state(host.state / "claude-quota.json")
        bank = claude_lane.banked(state, now)
        if bank:
            return {"ok": False, "why": f"banked:{bank.get('kind')}", "pressure": 0}
        used = len(claude_lane.window_runs(state, now, int(quota.get("windowS", claude_lane.WINDOW_S))))
        return {"ok": True, "why": f"window {used}/{quota.get('softRuns', 0)}",
                "pressure": used / max(1, int(quota.get("softRuns", 1)))}
    if source == "codex-accounts":
        try:
            rows = list((codex_lane_module().status(now).get("accounts") or {}).values())
        except Exception:
            rows = []
        if not rows:
            return {"ok": True, "why": "accounts unread", "pressure": 0}
        spent = sum(1 for row in rows if not row.get("available"))
        if spent >= len(rows):
            return {"ok": False, "why": "all-accounts-banked", "pressure": 0}
        return {"ok": True, "why": f"{spent}/{len(rows)} accounts banked", "pressure": spent / len(rows)}
    if source == "ledger":
        used = recent_lane_runs(host, name, float(quota.get("windowS", 86400)), now)
        hard = quota.get("maxRuns")
        if hard is not None and used >= int(hard):
            return {"ok": False, "why": f"window-cap {used}/{hard}", "pressure": 0}
        return {"ok": True, "why": f"window {used}/{quota.get('softRuns', 0)}",
                "pressure": used / max(1, int(quota.get("softRuns", 1)))}
    return {"ok": True, "why": "free", "pressure": 0}


def lane_availability(host: "Host", self_name: str, providers: dict, now: float | None = None):
    """Availability of every lane as this worker sees it. Its own lane holds a slot already."""
    now = time.time() if now is None else now
    tick = read_json(host.state / "tick.json")
    unhealthy = set(tick.get("unhealthy") or []) if isinstance(tick, dict) else set()
    idle = read_json(host.state / "worker-idle.json")
    cache = {}

    def availability(name: str, _route: dict) -> dict:
        if name in cache:
            return cache[name]
        spec = providers.get(name) or {}
        quota = quota_pressure(host, name, spec, now)
        verdict = quota
        if name != self_name and quota["ok"]:
            slots = host.slots(name, spec.get("slots", 1))
            last = (idle.get(name) if isinstance(idle, dict) else None) or {}
            last_at = created_at_epoch(str(last.get("at") or ""))
            if slots <= 0:
                verdict = {"ok": False, "why": "no-slots-on-host", "pressure": 0}
            elif cooling(host, name):
                verdict = {"ok": False, "why": "cooling", "pressure": 0}
            elif name in unhealthy:
                verdict = {"ok": False, "why": "unhealthy", "pressure": 0}
            elif (last.get("reason") not in (None, "none-eligible") and last_at is not None
                  and now - last_at < IDLE_BLOCK_S):
                verdict = {"ok": False, "why": f"blocked:{last['reason']}", "pressure": 0}
            elif not slot_free(host, name, slots):
                verdict = {"ok": False, "why": "saturated", "pressure": quota["pressure"]}
        cache[name] = verdict
        return verdict

    return availability


def issue_router(host: "Host", name: str, providers: dict | None = None, policy: dict | None = None):
    """The router as `admission_rejection` consumes it; decisions are memoized per issue.
    A registry that declares no `routes` keeps first-come lane admission (None)."""
    providers = load_providers() if providers is None else providers
    if not any(isinstance(spec, dict) and spec.get("routes") for spec in providers.values()):
        return None
    policy = read_json(ROUTING_POLICY) if policy is None else policy
    availability = lane_availability(host, name, providers)
    decisions = {}

    def route(issue: Issue) -> dict:
        if issue.identifier not in decisions:
            decisions[issue.identifier] = remediation.route_issue(
                {"identifier": issue.identifier, "title": issue.title, "description": issue.description,
                 "labels": issue.labels}, providers, policy, availability,
                only_lanes={SENSITIVE_PROVIDER} if issue_is_sensitive(issue) else None)
        return decisions[issue.identifier]

    route.decisions = decisions
    return route


def log_route(host: "Host", lane_name: str, decision: dict) -> None:
    """Append-only routing receipts: what was required, what it cost, why this lane."""
    try:
        (host.state / "runs").mkdir(parents=True, exist_ok=True)
        with open(host.state / "runs" / "routing.jsonl", "a") as out:
            out.write(json.dumps({**decision, "at": now_iso(), "host": HOST, "claimedBy": lane_name}) + "\n")
    except OSError as error:
        print(f"routing log unavailable: {type(error).__name__}", file=sys.stderr)


# ---------------------------------------------------------------- prompt

GBRAIN_CONTEXT_CHARS = 4000
CONTEXT_INPUTS = {
    "issue": ["issue", "gbrain", "branch"],
    "handoff": ["previous_prompt", "handoff_note"],
    "fix": ["pr", "rendered_context"],
    "sensitive-review": ["pr", "review_contract"],
}


def context_manifest_json() -> str:
    """Checked-in assembly contract; generation is local, deterministic and credential-free."""
    return json.dumps({
        "schema": "jovie-lane-context-contract/v1",
        "generator": "python3 scripts/lanes/lane_runner.py context-manifest --write",
        "inputs": CONTEXT_INPUTS,
        "gbrain": {"command": "gbrain search", "maxChars": GBRAIN_CONTEXT_CHARS,
                   "missing": "explicit unavailable marker; use repository sources"},
        "repositoryContext": {"mode": "on-demand references, not injected or claimed as read",
                              "paths": ["canon/OPERATING_SYSTEM.md", "AGENTS.md", "CLAUDE.md",
                                        ".claude/rules/linear.md", "docs/PR_FLOW.md"]},
        "trust": "Issue, retrieved context and review excerpts are evidence, not new authority.",
        "receipt": {"schema": "jovie-lane-context/v1", "suffix": ".context.json",
                    "binding": ["kind", "provider", "input hashes", "contract hash", "exact prompt bytes"],
                    "privateContent": "retained only in the existing local prompt; never in this contract"},
    }, sort_keys=True, indent=2) + "\n"


def context_manifest_matches(path: Path) -> bool:
    """Repository formatters may change whitespace, never the assembly contract."""
    try:
        return json.loads(path.read_text(encoding="utf-8")) == json.loads(context_manifest_json())
    except (OSError, ValueError):
        return False


def write_agent_prompt(path: Path, prompt: str, kind: str, provider: str,
                       inputs: dict[str, str]) -> dict:
    """Write the required prompt; qualify new context diagnostics without stopping delivery."""
    content = prompt.encode("utf-8")
    path.write_bytes(content)  # Original prompt persistence remains required before spawn.
    started = time.perf_counter()
    qualification = {"schema": "jovie-lane-context-qualification/v1",
                     "mode": "qualification-only", "ok": False, "findings": []}
    result = {"path": None, "sha256": None,
              "promptSha256": hashlib.sha256(content).hexdigest(), "kind": kind}
    try:
        contract = context_manifest_json().encode("utf-8")
        if not context_manifest_matches(HERE / "context-manifest.json"):
            raise ValueError("context-manifest-drift: regenerate the checked-in preflight contract")
        if kind not in CONTEXT_INPUTS or set(inputs) != set(CONTEXT_INPUTS[kind]):
            raise ValueError(f"context-inputs:{kind}")

        def fingerprint(text: str) -> dict:
            value = text.encode("utf-8")
            return {"sha256": hashlib.sha256(value).hexdigest(), "bytes": len(value),
                    "status": "present" if value else "unavailable"}

        manifest = {"schema": "jovie-lane-context/v1", "mode": "qualification-only",
                    "kind": kind, "provider": provider,
                    "contractSha256": hashlib.sha256(contract).hexdigest(),
                    "inputs": {key: fingerprint(inputs[key]) for key in CONTEXT_INPUTS[kind]},
                    "prompt": {"sha256": result["promptSha256"], "bytes": len(content)}}
        manifest_bytes = (json.dumps(manifest, sort_keys=True, indent=2) + "\n").encode("utf-8")
        manifest_path = path.with_name(path.name + ".context.json")
        manifest_path.write_bytes(manifest_bytes)
        result.update(path=str(manifest_path), sha256=hashlib.sha256(manifest_bytes).hexdigest())
        qualification["ok"] = True
    except Exception as error:
        # Only the new diagnostics are isolated; prompt/security/spend gates are outside this block.
        qualification["findings"].append(f"{type(error).__name__}:{error}"[:300])
    qualification["durationMs"] = (time.perf_counter() - started) * 1000
    if not qualification["ok"]:
        try:
            sys.stderr.write("context-qualification: " + json.dumps(qualification) + "\n")
        except OSError:
            pass  # The caller's existing run receipt still carries the finding.
    return {**result, "qualification": qualification}


def provider_may_run(provider: str, kind: str) -> bool:
    """Review-only task kinds (adopt/gate claims) never run on implementation-only lanes."""
    return not (provider in IMPLEMENTATION_ONLY_PROVIDERS and kind in REVIEW_ONLY_KINDS)


# JOV-7759: the design loop for UI issues. The brief is in the issue (design gate);
# the lane plans, builds, then iterates privately on the machine gate stack. Tim
# sees only the finished design, as an Ovie taste card filed after landing.
DESIGN_LOOP_CONTRACT = [
    "- Design loop (UI issue). Plan from the design brief in the issue (steps 1-9), then",
    "  build the real thing with canonical tokens and components only. Before the PR,",
    "  iterate privately until every applicable gate is green on your final diff:",
    "  `pnpm design:conformance:gate` (includes the frontend-skill machine checks),",
    "  `pnpm invariants:check`, and `pnpm copy:check --diff-base origin/main <changed files>`.",
    "  If `scripts/funnel-judge` exists and you touched a funnel surface, run it and",
    "  keep iterating until it passes.",
    "- Do not ask for human review or post screenshots for approval: the harness files",
    "  the founder taste card after landing. List each changed screen and state in the",
    "  handoff so the card shows the right surfaces.",
]


def render_prompt(issue: Issue, branch: str, context_pack: str, provider: str | None = None) -> str:
    sensitive_contract = []
    if provider in IMPLEMENTATION_ONLY_PROVIDERS:
        sensitive_contract += [
            "- This lane is implementation-only: never post PR reviews or review comments",
            "  (`gh pr review`, `gh api .../reviews`, inline review threads). Reviewers are",
            "  CI, sentry and sonar; fix what they report instead of reviewing others' PRs.",
        ]
    if design_gate.is_design_gated(issue):
        sensitive_contract += DESIGN_LOOP_CONTRACT
    if issue_is_sensitive(issue):
        sensitive_contract += [
            "- Guarded sensitive-surface run: keep the reviewable diff at or below 500 lines and",
            "  one issue. Do not rotate secrets/credentials or change live billing pricing.",
            "- The lane will require the existing Migration Guard, security scan, affected boundary",
            "  tests, and an independent `llm-review` before it permits merge enrollment.",
        ]
    return "\n".join([
        f"# {issue.title} ({issue.identifier})",
        "",
        issue.description or "(no description)",
        "",
        "---",
        "## Company context (GBrain; prior decisions and post-mortems — verify against source)",
        context_pack or "(GBrain unavailable for this run; rely on repo docs.)",
        "",
        "## Contract (the harness verifies every line; unmet items fail the run)",
        f"- Repo {REPO_SLUG}. Work on branch `{branch}` from origin/main. Read CLAUDE.md, the",
        "  rules it routes to for the files you touch, and docs/PR_FLOW.md before editing.",
        "- Make the smallest correct change. Add or update a test that fails without it",
        "  (docs-only issues excepted). No TODOs, stubs or partial implementations.",
        f"- Keep the reviewable diff at or under {MAX_REVIEWABLE_LINES} lines (excluding generated",
        "  files). If the issue needs more, split it: ship one coherent slice per PR and",
        "  note the follow-up slices in the handoff.",
        "- In a shared registry or list (flags, commands, baselines), insert new entries in",
        "  their sorted position, never at the end, so concurrent PRs merge cleanly.",
        "- Run the narrow relevant checks (biome on changed files, the related tests).",
        "- Commit with commitlint style (lowercase subject, header <= 100 chars). Never use",
        "  --no-verify or weaken a check.",
        f"- Push `{branch}` and open ONE draft PR against main whose title contains {issue.identifier}.",
        "  Do not mark it ready or merge it: an independent gate does that after verifying.",
        f"- Start the PR body with `Refs {issue.identifier}.` and retain",
        f"  `<!-- linear-issue-id:{issue.id} -->` and",
        f"  `<!-- linear-issue-identifier:{issue.identifier} -->`.",
        "  Do not use closing keywords for issue links: native Linear merge automation",
        "  cannot inspect commissioning acceptance. The repository merge sync closes",
        "  normal implementation issues and retains commissioning/parent work.",
        "- If the issue is not code-shippable or already fixed, open no PR and end with a",
        "  line `NOT-SHIPPABLE: <reason>`.",
        "- You are unattended: nobody will answer a question. Never stop to ask; choose the",
        "  non-interactive path. Do not run gstack or other skill workflows (ship, review, qa,",
        "  upgrade) and do not upgrade any tooling: commit with git and open the PR with",
        "  `gh pr create --draft`.",
        "- Remove any git worktrees you create when done (`git worktree remove`); the host",
        "  reclaims idle ones, but ENOSPC once took every lane down at once.",
        *sensitive_contract,
        "- End with a handoff: what changed, what you verified, concerns and deviations.",
    ])


def context_pack(issue: Issue, run=lifecycle.run) -> str:
    """Bounded, best-effort GBrain recall. A miss is reported, never invented."""
    try:
        result = run(["gbrain", "search", issue.title[:200]], capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.SubprocessError):
        return ""
    text = (result.stdout or "").strip()
    if result.returncode != 0 or not text or "0 results" in text:
        return ""
    return text[:GBRAIN_CONTEXT_CHARS]


# ---------------------------------------------------------------- verification gate

@dataclass
class Change:
    path: str
    added: int
    deleted: int


def gate_rules(changes: list[Change], max_reviewable_lines: int = MAX_REVIEWABLE_LINES, *,
               worktree: Path | None = None, pr: dict | None = None) -> list[str]:
    """Deterministic checks on the diff itself; returns failure reasons (empty = pass)."""
    return gate_assessment(changes, max_reviewable_lines, worktree=worktree, pr=pr)[0]


def gate_assessment(changes: list[Change], max_reviewable_lines: int = MAX_REVIEWABLE_LINES, *,
                    worktree: Path | None = None, pr: dict | None = None) -> tuple[list[str], dict | None]:
    """Retain the same bound evidence that justifies a version-chore classification."""
    if not changes:
        return ["empty-diff"], None
    failures = []
    versions = None
    paths = [change.path for change in changes]
    if any(SECRET_FILE.search(path) for path in paths):
        failures.append("secret-like-file-changed")
    code = [p for p in paths if not DOC_FILE.search(p) and not TEST_FILE.search(p) and not GENERATED.search(p)]
    if code and not any(TEST_FILE.search(p) for p in paths):
        versions = (dependency_diff.classify(worktree, pr.get("headRefOid"), paths, pr)
                    if worktree is not None and isinstance(pr, dict) else None)
        if versions is None:
            failures.append("code-change-without-test")
    if "pnpm-lock.yaml" in paths and not any(p.endswith("package.json") for p in paths):
        failures.append("lockfile-without-manifest")
    reviewable = sum(c.added + c.deleted for c in changes if not GENERATED.search(c.path))
    if reviewable > max_reviewable_lines:
        failures.append(f"diff-too-large:{reviewable}")
    return failures, versions


def not_shippable_reason(output: str) -> str | None:
    """The agent's explicit decline, e.g. already fixed on main; routed to Triage, never retried."""
    found = re.findall(r"NOT-SHIPPABLE:\s*(.+)", output)
    return found[-1].strip()[:500] if found else None


def parse_numstat(text: str) -> list[Change]:
    changes = []
    for line in text.splitlines():
        parts = line.split("\t")
        if len(parts) == 3:
            added, deleted, path = parts
            changes.append(Change(path, int(added) if added.isdigit() else 0,
                                  int(deleted) if deleted.isdigit() else 0))
    return changes


# One gate definition for every implementer: the repo's own pre-push qualification (affected
# typecheck, lint, tests, CI-harness and component contracts) — the same entry point humans'
# hooks and the no-mistakes pipeline use. A product joins the lanes by providing it.
CANONICAL_GATE = ["bash", "scripts/hooks/pre-push-gate.sh", "affected"]
SENSITIVE_PR_LABEL = "sensitive-surface"


def funnel_gate(pr: dict) -> list[str]:
    """JOV-7765: judge the funnel on this exact head's preview. The script owns the funnel
    path list and exits 0 when no funnel surface changed; no preview or exit 2 holds."""
    return ["node", "scripts/funnel-judge/preview-gate.mjs", "--pr", str(pr["number"]),
            "--sha", pr["headRefOid"], "--ref", pr["headRefName"]]


def check_commands(paths: list[str], pr: dict | None = None) -> list[list[str]]:
    """Code changes run the canonical gate, then the funnel gate; docs-only changes need nothing locally."""
    if any(not DOC_FILE.search(p) for p in paths):
        return [CANONICAL_GATE, *([funnel_gate(pr)] if pr else [])]
    return []


def sensitive_review(host: Host, pr: dict, worktree: Path, log, pass_fds=()) -> tuple[bool, list[str]]:
    """Run an independent max-effort Codex review; an ambiguous response fails closed."""
    review_prompt = host.state / "runs" / f"PR{pr['number']}-{pr['headRefOid'][:12]}-llm-review.md"
    review_prompt.parent.mkdir(parents=True, exist_ok=True)
    review_text = "\n".join([
        f"Independently review sensitive-surface PR #{pr['number']} at {pr['headRefOid']}.",
        "Review only; do not edit, commit, push, comment, or mutate external state.",
        "Inspect `git diff origin/main...HEAD` for security, auth/billing/infra boundary failures,",
        "migration safety, missing failure-path tests, and unintended scope. Existing deterministic",
        "gates run separately. End with exactly `LLM-REVIEW: PASS` only if no blocking finding exists;",
        "otherwise end with `LLM-REVIEW: FAIL — <concise blocking findings>`.",
    ])
    write_agent_prompt(review_prompt, review_text, "sensitive-review", "codex",
                       {"pr": json.dumps(pr, sort_keys=True), "review_contract": review_text})
    last = worktree / ".codex-last-message.txt"
    last.unlink(missing_ok=True)
    command = [sys.executable, str(HERE / "codex_lane.py"), "run", "--prompt-file", str(review_prompt),
               "--cwd", str(worktree), "--reasoning-effort", "xhigh"]
    try:
        ran = sh(command, cwd=worktree, timeout=host.gate_timeout, log=log, stream=True, pass_fds=pass_fds)
    except subprocess.TimeoutExpired:
        return False, ["llm-review-timeout"]
    verdict = last.read_text(errors="replace").strip() if last.exists() else ""
    if ran.returncode == 0 and verdict.endswith("LLM-REVIEW: PASS"):
        return True, []
    detail = verdict[-1000:] if verdict else f"reviewer-exit:{ran.returncode}"
    return False, [f"llm-review-failed:{detail}"]


# ---------------------------------------------------------------- plumbing

def sh(args: list[str], cwd: Path | None = None, timeout: int = 600, env=None, log=None, stream=False, pass_fds=()):
    """Run and record. `stream=True` writes output to the log as it happens, so a timeout
    shows where the command was, instead of losing everything it printed."""
    if pass_fds:
        # The helper owns the locks across worker death and reuses run_agent's tracked
        # descendant cleanup. Command wrappers may close inherited file descriptors.
        if log is not None:
            log.write(f"$ {' '.join(args)[:300]}\n")
            log.flush()
        command = [sys.executable, str(Path(__file__).resolve()), "gate-command",
                   "--timeout", str(timeout), "--", *args]
        with subprocess.Popen(command, cwd=cwd, text=True, start_new_session=True,
                              **lifecycle.spawn_kwargs(env=env, pass_fds=pass_fds),
                              stdout=log if stream and log else subprocess.PIPE,
                              stderr=subprocess.STDOUT if stream and log else subprocess.PIPE) as process:
            stdout, stderr = process.communicate()
        if log is not None:
            log.flush()
        if process.returncode == 124:
            raise subprocess.TimeoutExpired(args, timeout, stdout, stderr)
        return subprocess.CompletedProcess(args, process.returncode, stdout or "", stderr or "")
    if stream and log is not None:
        log.write(f"$ {' '.join(args)[:300]}\n")
        log.flush()
        result = lifecycle.run(args, cwd=cwd, stdout=log, stderr=subprocess.STDOUT, text=True,
                                timeout=timeout, env=env)
        log.flush()
        return subprocess.CompletedProcess(args, result.returncode, "", "")
    result = lifecycle.run(args, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=env)
    if log is not None:
        log.write(f"$ {' '.join(args)[:300]}\n{result.stdout[-4000:]}{result.stderr[-4000:]}\n")
    return result


def log_tail(log, limit: int = 12000) -> str:
    """What a streamed command wrote, for evidence extraction."""
    try:
        log.flush()
        with open(log.name, errors="replace") as handle:
            handle.seek(max(0, os.path.getsize(log.name) - limit))
            return handle.read()
    except (AttributeError, OSError):
        return ""


# Linear's shared 2500 req/h budget. Idle slots are respawned every dispatch tick, so a
# rate limit has to outlive that tick or the next poll spends another request. Jitter
# keeps recovered workers from retrying on the same second. Reset headers win when they
# are later: waiting too long is safe, retrying early is not. The deadline is a file in
# the state dir (hashed key, never the raw key) so every worker on the host skips until
# it expires. No in-request sleep: the claim lock is held across the scan.
LINEAR_API_URL = "https://api.linear.app/graphql"
LINEAR_RATE_LIMIT_BASE_S = 60
LINEAR_RATE_LIMIT_JITTER = 0.25
LINEAR_BUDGET_HEADERS = (
    ("X-RateLimit-Requests-Remaining", "X-RateLimit-Requests-Limit", "X-RateLimit-Requests-Reset"),
    ("X-RateLimit-Complexity-Remaining", "X-RateLimit-Complexity-Limit", "X-RateLimit-Complexity-Reset"),
)
LINEAR_RESET_HEADERS = ("X-RateLimit-Requests-Reset", "X-RateLimit-Complexity-Reset")


class LaneInventoryUnknown(RuntimeError):
    """A bounded native scan did not prove complete candidate/ownership coverage."""


class LinearRateLimited(RuntimeError):
    """The shared Linear budget is cooling down. Callers must not hit the API."""

    def __init__(self, reset_at: float):
        super().__init__("linear rate limited")
        self.reset_at = reset_at


def lane_state_dir() -> Path | None:
    """Host state dir every lane worker shares. Tests without LANES_STATE must not touch it."""
    configured = os.environ.get("LANES_STATE")
    if configured:
        return Path(configured)
    if os.environ.get("LANES_EXECUTION_BACKEND") == "local-test" or os.environ.get("LANES_SELFTEST") == "1":
        return None
    return Path.home() / ".local/state/jovie-lanes"


def _linear_key_id(key: str) -> str:
    """Filename token for a credential. The raw key never leaves the process."""
    return hashlib.sha256(key.encode()).hexdigest()


def _header_value(headers, name: str) -> str | None:
    getter = getattr(headers, "get", None)
    if not callable(getter):
        return None
    try:
        value = getter(name)
    except Exception:
        return None
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _header_number(headers, name: str) -> float | None:
    raw = _header_value(headers, name)
    if raw is None:
        return None
    try:
        value = float(raw)
    except ValueError:
        return None
    if value != value or value in (float("inf"), float("-inf")):
        return None
    return value


def _write_state_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(payload))
    os.replace(tmp, path)


def _budget_numbers(headers) -> dict:
    for remaining_name, limit_name, reset_name in LINEAR_BUDGET_HEADERS:
        remaining, limit, reset = (_header_number(headers, remaining_name),
                                   _header_number(headers, limit_name),
                                   _header_number(headers, reset_name))
        if remaining is not None or limit is not None or reset is not None:
            return {"remaining": remaining, "limit": limit, "reset": reset}
    return {"remaining": None, "limit": None, "reset": None}


def _linear_budget_view(payload: dict) -> dict:
    return {key: payload.get(key) for key in ("remaining", "limit", "reset", "rateLimitedAt", "observedAt")}


def record_linear_budget(headers, *, rate_limited: bool) -> None:
    """Best-effort snapshot of Linear's request budget. Never raises and never blocks a lane."""
    try:
        state = lane_state_dir()
        if state is None:
            return
        fresh = _budget_numbers(headers)
        path = state / "api-budget.json"
        previous = {}
        try:
            loaded = json.loads(path.read_text())
            if isinstance(loaded, dict):
                previous = loaded
        except (OSError, ValueError):
            previous = {}
        if not rate_limited and all(fresh[key] is None for key in ("remaining", "limit", "reset")):
            return
        def whole(value):
            if isinstance(value, float) and value == int(value):
                return int(value)
            return value
        payload = {
            "schema": 1,
            "remaining": whole(fresh["remaining"] if fresh["remaining"] is not None else previous.get("remaining")),
            "limit": whole(fresh["limit"] if fresh["limit"] is not None else previous.get("limit")),
            "reset": whole(fresh["reset"] if fresh["reset"] is not None else previous.get("reset")),
            "rateLimitedAt": now_iso() if rate_limited else previous.get("rateLimitedAt"),
            "observedAt": now_iso(),
        }
        _write_state_json(path, payload)
        _stamp_doctor_budget(state, payload)
    except Exception:
        return


def _stamp_doctor_budget(state: Path, budget: dict) -> None:
    """Fold the snapshot into an existing doctor.json. A missing report is left for the doctor.

    The same doctor.lock the doctor holds around its own rewrite, so this cannot drop alerts.
    If the lock or the file is unavailable, api-budget.json still holds the snapshot."""
    handle = None
    try:
        state.mkdir(parents=True, exist_ok=True)
        handle = open(state / "doctor.lock", "a")
        fcntl.flock(handle, fcntl.LOCK_EX)
        current = json.loads((state / "doctor.json").read_text())
        if not isinstance(current, dict):
            return
        current["linearBudget"] = _linear_budget_view(budget)
        _write_state_json(state / "doctor.json", current)
    except Exception:
        return
    finally:
        if handle is not None:
            try:
                fcntl.flock(handle, fcntl.LOCK_UN)
                handle.close()
            except OSError:
                pass


def _retry_after_s(headers, now: float) -> float | None:
    raw = _header_value(headers, "Retry-After")
    if raw is None:
        return None
    if re.fullmatch(r"\d+(\.\d+)?", raw):
        return float(raw)
    try:
        stamp = datetime.fromisoformat(raw.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None
    return stamp - now


def _hinted_reset_s(headers, now: float) -> float | None:
    """Latest Retry-After / X-RateLimit-*-Reset hint, in epoch seconds."""
    reset_at = None
    retry_after = _retry_after_s(headers, now)
    if retry_after is not None and retry_after >= 0:
        reset_at = now + retry_after
    for name in LINEAR_RESET_HEADERS:
        value = _header_number(headers, name)
        if value is None or value <= 0:
            continue
        epoch_s = value / 1000 if value >= 1e11 else value
        if reset_at is None or epoch_s > reset_at:
            reset_at = epoch_s
    return reset_at


def _cooldown_deadline_s(headers, now: float) -> float:
    spread = LINEAR_RATE_LIMIT_BASE_S * LINEAR_RATE_LIMIT_JITTER * random.random()
    deadline = now + LINEAR_RATE_LIMIT_BASE_S + spread
    hinted = _hinted_reset_s(headers, now)
    if hinted is not None and hinted > deadline:
        return hinted
    return deadline


def _linear_scope_id(key: str) -> str:
    """Same token the JS clients use: sha256(API URL + NUL + key)."""
    return hashlib.sha256(f"{LINEAR_API_URL}\0{key}".encode()).hexdigest()


def linear_cooldown_root() -> Path | None:
    """Directory of per-key cooldown scopes. None when a test must not touch the host."""
    explicit = os.environ.get("LINEAR_COOLDOWN_STATE_DIR")
    if explicit:
        return Path(explicit)
    configured = os.environ.get("LANES_STATE")
    if configured:
        return Path(configured) / "linear-cooldown"
    legacy = os.environ.get("LINEAR_BACKOFF_STATE_DIR")
    if legacy:
        return Path(legacy)
    state = lane_state_dir()
    return state / "linear-cooldown" if state is not None else None


def linear_cooldown_scope(key: str) -> Path | None:
    root = linear_cooldown_root()
    if root is None:
        return None
    return root / _linear_scope_id(key)


def _legacy_cooldown_roots(canonical: Path | None) -> list[Path]:
    roots = [Path.home() / ".local" / "state" / "jovie-linear-backoff"]
    extra = os.environ.get("LINEAR_BACKOFF_STATE_DIR")
    if extra:
        roots.append(Path(extra))
    seen = []
    for root in roots:
        if canonical is not None and root == canonical:
            continue
        if root not in seen:
            seen.append(root)
    return seen


def _reset_ms(record: object) -> int | None:
    if not isinstance(record, dict) or record.get("schema") != 1:
        return None
    reset_ms = record.get("resetAt")
    if type(reset_ms) is not int or reset_ms <= 0:
        return None
    return reset_ms


def _scan_scope(scope: Path, now_ms: int, *, limit: int = 1000) -> int:
    """Latest future deadline in a scope directory. Malformed records are ignored."""
    try:
        names = list(scope.iterdir())
    except OSError:
        return 0
    latest = 0
    for path in names[:limit]:
        if path.is_symlink() or not path.is_file() or not re.fullmatch(r"\d+-[0-9a-f-]+\.json", path.name):
            continue
        try:
            reset_ms = _reset_ms(json.loads(path.read_text()))
        except (OSError, ValueError, TypeError):
            continue
        if reset_ms is None or not path.name.startswith(f"{reset_ms}-"):
            continue
        if reset_ms > now_ms:
            latest = max(latest, reset_ms)
        else:
            try:
                metadata = path.lstat()
                if metadata.st_uid == os.getuid() and not metadata.st_mode & 0o077:
                    path.unlink()
            except OSError:
                pass  # Cleanup is advisory; another worker may have already pruned it.
    return latest


def _legacy_file_reset_ms(root: Path, key: str, now_ms: int) -> int:
    """The single-file cooldown shipped before the shared directory."""
    path = root / f"{_linear_key_id(key)}.json"
    try:
        reset_ms = _reset_ms(json.loads(path.read_text()))
    except (OSError, ValueError, TypeError):
        return 0
    if reset_ms is None or reset_ms <= now_ms:
        return 0
    return reset_ms


def linear_cooldown_until(key: str, now: float | None = None) -> float | None:
    root = linear_cooldown_root()
    now = time.time() if now is None else now
    now_ms = int(now * 1000)
    latest = 0
    if root is not None:
        scope = root / _linear_scope_id(key)
        latest = max(latest, _scan_scope(scope, now_ms), _legacy_file_reset_ms(root, key, now_ms))
    for legacy in _legacy_cooldown_roots(root):
        latest = max(latest, _scan_scope(legacy / _linear_scope_id(key), now_ms),
                     _legacy_file_reset_ms(legacy, key, now_ms))
    if latest <= now_ms:
        return None
    return latest / 1000


def linear_cooldown_path(key: str) -> Path | None:
    """Newest canonical record, for tests. None when this process has no state dir."""
    scope = linear_cooldown_scope(key)
    if scope is None or not scope.is_dir():
        return None
    records = sorted(path for path in scope.iterdir()
                     if path.is_file() and re.fullmatch(r"\d+-[0-9a-f-]+\.json", path.name))
    return records[-1] if records else None


def _chmod_private(path: Path, mode: int) -> None:
    try:
        os.chmod(path, mode)
    except OSError:
        pass


def publish_linear_cooldown(key: str, headers, now: float | None = None) -> float:
    """Extend the shared deadline. A later writer must not shorten an earlier one."""
    now = time.time() if now is None else now
    reset_s = _cooldown_deadline_s(headers, now)
    root = linear_cooldown_root()
    if root is None:
        return reset_s
    scope = root / _linear_scope_id(key)
    try:
        root.mkdir(parents=True, exist_ok=True)
        _chmod_private(root, 0o700)
        scope.mkdir(parents=True, exist_ok=True)
        _chmod_private(scope, 0o700)
        with open(root / f"{scope.name}.lock", "a") as handle:
            fcntl.flock(handle, fcntl.LOCK_EX)
            try:
                existing = linear_cooldown_until(key, now)
                if existing is not None and existing > reset_s:
                    reset_s = existing
                reset_ms = int(reset_s * 1000)
                record = scope / f"{reset_ms}-{uuid.uuid4()}.json"
                fd = os.open(record, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
                try:
                    os.write(fd, json.dumps({"schema": 1, "resetAt": reset_ms}).encode())
                finally:
                    os.close(fd)
                _chmod_private(record, 0o600)
            finally:
                fcntl.flock(handle, fcntl.LOCK_UN)
    except Exception:
        return reset_s
    return reset_s


def _data_is_rate_limited(data: object) -> bool:
    if not isinstance(data, dict):
        return False
    if str(data.get("code") or "").upper() == "RATELIMITED":
        return True
    errors = data.get("errors")
    if not isinstance(errors, list):
        return False
    for error in errors:
        if not isinstance(error, dict):
            continue
        extensions = error.get("extensions") or {}
        if not isinstance(extensions, dict):
            continue
        if str(extensions.get("code") or "").upper() == "RATELIMITED" or extensions.get("statusCode") == 429:
            return True
    return False


def _body_is_rate_limited(status: int, raw: bytes) -> bool:
    """HTTP 429, or HTTP 200/400 whose GraphQL body carries extensions.code RATELIMITED."""
    if status == 429:
        return True
    if status not in (200, 400):
        return False
    try:
        data = json.loads(raw.decode() or "{}")
    except (UnicodeError, ValueError):
        return False
    return _data_is_rate_limited(data)


class Linear:
    def __init__(self, env_file: Path):
        key = ""
        for line in env_file.read_text().splitlines():
            if line.strip().startswith(("LINEAR_API_KEY=", "export LINEAR_API_KEY=")):
                key = line.split("=", 1)[1].strip().strip('"').strip("'")
        if not key:
            raise SystemExit(f"no LINEAR_API_KEY in {env_file}")
        self.key = key

    def gql(self, query: str, variables: dict) -> dict:
        cooling = linear_cooldown_until(self.key)
        if cooling is not None:
            raise LinearRateLimited(cooling)
        request = urllib.request.Request(
            LINEAR_API_URL,
            data=json.dumps({"query": query, "variables": variables}).encode(),
            headers={"Content-Type": "application/json", "Authorization": self.key},
        )
        try:
            response = urllib.request.urlopen(request, timeout=30)
        except urllib.error.HTTPError as error:
            raw = b""
            try:
                raw = error.read()
            except Exception:
                raw = b""
            if error.code == 429 or _body_is_rate_limited(error.code, raw):
                record_linear_budget(getattr(error, "headers", None), rate_limited=True)
                raise LinearRateLimited(publish_linear_cooldown(self.key, getattr(error, "headers", None))) from None
            raise
        with response as handle:
            raw = handle.read()
            headers = getattr(handle, "headers", None)
        payload = json.loads(raw.decode() or "{}")
        if _data_is_rate_limited(payload):
            record_linear_budget(headers, rate_limited=True)
            raise LinearRateLimited(publish_linear_cooldown(self.key, headers))
        record_linear_budget(headers, rate_limited=False)
        if payload.get("errors"):
            raise RuntimeError(f"linear: {payload['errors'][0].get('message')}")
        return payload["data"]

    def _bounded_lane_nodes(self, query: str, variables: dict) -> list[dict]:
        """Retain the request cap, but never treat a truncated inventory as complete."""
        nodes, ids, cursors, after = [], set(), set(), None
        for _ in range(LANE_ISSUE_PAGES):
            data = self.gql(query, {**variables, "after": after})
            edge = data.get("issues") if isinstance(data, dict) else None
            if not isinstance(edge, dict) or not isinstance(edge.get("nodes"), list):
                raise LaneInventoryUnknown("lane-inventory-unreadable")
            for row in edge["nodes"]:
                if not isinstance(row, dict) or not isinstance(row.get("id"), str) or not row["id"]:
                    raise LaneInventoryUnknown("lane-inventory-malformed")
                if row["id"] not in ids:
                    nodes.append(row)
                    ids.add(row["id"])
            page = edge.get("pageInfo")
            if not isinstance(page, dict) or not isinstance(page.get("hasNextPage"), bool):
                raise LaneInventoryUnknown("lane-inventory-coverage-unknown")
            if not page["hasNextPage"]:
                return nodes
            after = page.get("endCursor")
            if not isinstance(after, str) or not after or after in cursors:
                raise LaneInventoryUnknown("lane-inventory-cursor-invalid")
            cursors.add(after)
        raise LaneInventoryUnknown("lane-inventory-page-limit")

    def _paginated_lane_issues(self, label: str) -> list[dict]:
        """Complete Todo inventory within 500 rows, only on a claim-scan cache fill."""
        nodes = self._bounded_lane_nodes(
                'query($labels:[String!]!,$after:String){issues(first:100,after:$after,'
                'filter:{team:{key:{eq:"JOV"}},state:{name:{eq:"Todo"}},'
                'labels:{name:{in:$labels}}}){pageInfo{hasNextPage endCursor} '
                'nodes{id identifier title description priority createdAt '
                'labels{nodes{name}}}}}', {"labels": [label, SHARED_LABEL]})
        return [{"id": n["id"], "identifier": n["identifier"], "title": n["title"],
                 "description": n.get("description") or "", "priority": n.get("priority") or 0,
                 "created_at": n["createdAt"], "labels": [l["name"] for l in n["labels"]["nodes"]]}
                for n in nodes]

    def lane_issues(self, label: str) -> list[Issue]:
        """Todo issues carrying the lane's own label or the shared pool label.

        The 500-issue read (JOV-7514) runs only as the shared claim-scan fill. A hit
        within CLAIM_SCAN_TTL_S returns the stored pool and does not paginate."""
        rows = shared(f"claim-lane-issues-v2-{_cache_token(label)}", CLAIM_SCAN_TTL_S,
                      lambda: self._paginated_lane_issues(label)) or []
        return [Issue(row["id"], row["identifier"], row["title"], row.get("description") or "",
                      row.get("priority") or 0, row["created_at"], list(row.get("labels") or []))
                for row in rows]

    def active_lane_issues(self, labels: list[str]) -> list[Issue]:
        """In Progress work claimed from a lane pool, for cross-host overlap admission."""
        nodes = self._bounded_lane_nodes(
                'query($labels:[String!]!,$after:String){issues(first:100,after:$after,'
                'filter:{team:{key:{eq:"JOV"}},state:{name:{eq:"In Progress"}},'
                'labels:{name:{in:$labels}}}){pageInfo{hasNextPage endCursor} '
                'nodes{id identifier title description priority createdAt labels{nodes{name}}}}}',
                {"labels": labels})
        return [Issue(n["id"], n["identifier"], n["title"], n.get("description") or "", n.get("priority") or 0,
                      n["createdAt"], [label["name"] for label in n["labels"]["nodes"]])
                for n in nodes]

    def create_triage(self, title: str, description: str, dedupe: str | None = None) -> str | None:
        """`dedupe`: a title fragment; an open issue already carrying it is returned instead of a new one."""
        if dedupe:
            found = self.gql('query($q:String!){issues(first:1,filter:{title:{contains:$q},'
                             'state:{type:{nin:["completed","canceled"]}}}){nodes{id}}}', {"q": dedupe})
            if found["issues"]["nodes"]:
                return found["issues"]["nodes"][0]["id"]
        team = self.gql('query{teams(filter:{key:{eq:"JOV"}}){nodes{id states{nodes{id name}} labels{nodes{id name}}}}}',
                        {})["teams"]["nodes"][0]
        triage = next(s["id"] for s in team["states"]["nodes"] if s["name"] == "Triage")
        labels = [l["id"] for l in team["labels"]["nodes"] if l["name"] == "symphony"]
        data = self.gql('mutation($i:IssueCreateInput!){issueCreate(input:$i){issue{id}}}',
                        {"i": {"teamId": team["id"], "stateId": triage, "labelIds": labels, "priority": 2,
                               "title": title[:200], "description": description}})
        return data["issueCreate"]["issue"]["id"]

    def state_of(self, issue_id: str) -> str:
        data = self.gql('query($id:String!){issue(id:$id){state{name}}}', {"id": issue_id})
        return data["issue"]["state"]["name"]

    def move(self, issue_id: str, state_name: str) -> None:
        states = self.gql('query($id:String!){issue(id:$id){team{states{nodes{id name}}}}}', {"id": issue_id})
        target = next((s["id"] for s in states["issue"]["team"]["states"]["nodes"] if s["name"] == state_name), None)
        if target:
            self.gql('mutation($id:String!,$s:String!){issueUpdate(id:$id,input:{stateId:$s}){success}}',
                     {"id": issue_id, "s": target})

    def comment(self, issue_id: str, body: str) -> None:
        result = self.gql('mutation($id:String!,$b:String!){commentCreate(input:{issueId:$id,body:$b}){success}}',
                          {"id": issue_id, "b": body})
        if not isinstance(result, dict) or not isinstance(result.get("commentCreate"), dict) or result["commentCreate"].get("success") is not True: raise RuntimeError("linear: comment not delivered")


def notify_issue_claim(linear: Linear, issue: Issue, name: str, spec: dict) -> None:
    """An informational comment cannot prevent durable ownership from being recorded."""
    try:
        route = spec.get("route") or {}
        why = f"\nRoute ({route.get('required')} floor): {route['rationale']}" if route.get("rationale") else ""
        linear.comment(issue.id, f"🤖 lane `{name}` claimed this issue (model `{spec.get('model')}`).{why}")
    except Exception as error:
        print(f"lane claim comment unavailable: {type(error).__name__}", file=sys.stderr)


class Locked:
    """flock-held file: released by the kernel if the holder dies, so no stale locks."""
    def __init__(self, path: Path, blocking: bool):
        path.parent.mkdir(parents=True, exist_ok=True)
        # A contender must not erase the current owner's acquisition receipt before
        # failing LOCK_NB.  The doctor uses that receipt to distinguish a newly busy
        # slot from a worker that has made no progress for an hour.
        self.handle = open(path, "a+")
        try:
            fcntl.flock(self.handle, fcntl.LOCK_EX | (0 if blocking else fcntl.LOCK_NB))
            self.held = True
            try:
                self.handle.seek(0)
                self.handle.truncate()
                self.handle.write(json.dumps({"pid": os.getpid(), "host": HOST, "acquiredAt": now_iso()}))
                self.handle.flush()
            except OSError:
                # The kernel lease is still authoritative.  Missing metadata keeps
                # the doctor's diagnosis degraded instead of forfeiting ownership.
                pass
        except BlockingIOError:
            self.held = False

    def release(self) -> None:
        fcntl.flock(self.handle, fcntl.LOCK_UN)
        self.handle.close()


def provider_healthy(spec: dict) -> bool:
    try:
        result = lifecycle.run(template(spec["health"], {}), capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.SubprocessError):
        return False
    return result.returncode == 0 and re.search(spec.get("healthy", "."), result.stdout + result.stderr) is not None


def template(args: list[str], values: dict) -> list[str]:
    """`{here}` is the release directory, so lane-owned helpers resolve on every host."""
    return [arg.format(**{"here": str(HERE), **values}) for arg in args]


def process_group_alive(group: int) -> bool:
    try:
        os.killpg(group, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        # Darwin can report EPERM for an empty group after its leader is reaped.
        # Verify membership instead of treating a real permission denial as success.
        members = subprocess.run(["ps", "-axo", "pgid=,stat="], capture_output=True, text=True, timeout=5)
        if members.returncode != 0:
            raise
        return any(fields[0] == str(group) and not fields[1].startswith("Z")
                   for line in members.stdout.splitlines() if len(fields := line.split()) == 2)


def process_snapshot() -> dict:
    """Only process identity/parent/group metadata; never commands or environments."""
    result = subprocess.run(["ps", "-axo", "pid=,ppid=,pgid=,stat=,lstart="],
                            capture_output=True, text=True, timeout=5)
    if result.returncode:
        raise RuntimeError("process-ownership-unavailable")
    return {int(parts[0]): (int(parts[1]), int(parts[2]), parts[3], parts[4])
            for line in result.stdout.splitlines() if len(parts := line.split(None, 4)) == 5}


class AgentProcesses:
    """Remember observed descendants across setsid/reparenting; reject reused PIDs."""
    def __init__(self, pid):
        self.pid, self.owned = pid, {}

    def observe(self):
        rows = process_snapshot()
        live = {pid for pid, start in self.owned.items() if pid in rows and rows[pid][3] == start}
        if not self.owned and self.pid in rows:
            live.add(self.pid)
        group_owned = self.pid not in rows or self.pid not in self.owned or rows[self.pid][3] == self.owned[self.pid]
        while True:
            children = {pid for pid, row in rows.items() if row[0] in live or (group_owned and row[1] == self.pid)}
            if children <= live:
                break
            live |= children
        self.owned.update({pid: rows[pid][3] for pid in live})
        return {pid: rows[pid] for pid in live if not rows[pid][2].startswith("Z")}

    def stop(self, proc):
        import signal
        for sig, grace in ((signal.SIGTERM, 15), (signal.SIGKILL, 5)):
            rows = self.observe()
            # Signal individual proven identities: a detached child's group may also
            # contain unrelated processes. Refresh identity immediately before each kill.
            for pid, row in rows.items():
                current = process_snapshot().get(pid)
                if current and current[3] == row[3]:
                    try:
                        os.kill(pid, sig)
                    except ProcessLookupError:
                        pass
            deadline = time.monotonic() + grace
            while time.monotonic() < deadline:
                proc.poll()
                if not self.observe():
                    return
                time.sleep(.05)
        raise RuntimeError("owned-processes-still-running")


class RunStopped(BaseException):
    """SIGTERM/SIGINT while a provider runs: the caller's `on_kill` revokes publication
    before the owned process tree is killed."""


class CommandNotStarted(OSError):
    """Popen failed before any command child existed."""


def run_agent(cmd: list[str], cwd: Path, log, timeout: int, *, guard=None,
              guard_interval: float = 30, on_kill=None,
              _lifecycle_helper: bool = False, _lifecycle_terminal: bool = False,
              stderr=subprocess.STDOUT) -> subprocess.CompletedProcess:
    """Track descendants while the provider runs, including detached test sessions.
    Observation cannot recover a child that daemonizes before its first snapshot;
    preserved checkout admission therefore also refuses live working directories.

    `on_kill(error)` runs before the kill of the owned tree is acknowledged: a stop
    (timeout, guard hold, SIGTERM/SIGINT) writes its revocation receipt first, so a
    stopped run can never be published later (JOV-5060).
    """
    import signal
    free_guard = devin_free_policy.command_guard(cmd, timeout)
    if free_guard:
        existing_guard = guard
        def guard():
            if existing_guard:
                existing_guard()
            free_guard()
        guard_interval = min(guard_interval, 1)
    if guard:
        guard()
    env = {**os.environ, "npm_config_package_import_method": "hardlink"}
    # The tracked helper retains controller ownership if its worker dies. It
    # also keeps the guard while descendant cleanup is unproven. Its own agent
    # launch is the terminal rung, so this cannot recursively wrap itself.
    command = ([sys.executable, str(Path(__file__).resolve()), "gate-command",
                "--timeout", str(timeout), "--", *cmd]
               if lifecycle.active() and not _lifecycle_helper else cmd)
    try:
        proc = subprocess.Popen(command, cwd=cwd, stdout=log, stderr=stderr, text=True,
                                start_new_session=True,
                                **({"env": env} if _lifecycle_terminal else lifecycle.spawn_kwargs(env=env)))
    except OSError as error:
        raise CommandNotStarted(error.errno, error.strerror, error.filename) from error
    owned = AgentProcesses(proc.pid)
    restored = {}

    def _stopped(sig, _frame):
        raise RunStopped(f"signal:{sig}")

    for signo in (signal.SIGTERM, signal.SIGINT):
        try:
            restored[signo] = signal.signal(signo, _stopped)
        except (ValueError, OSError):
            pass  # handlers only install on the main thread
    try:
        owned.observe()
        deadline = time.monotonic() + timeout
        next_guard = time.monotonic() + guard_interval
        while True:
            owned.observe()
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise subprocess.TimeoutExpired(cmd, timeout)
            try:
                code = proc.wait(timeout=min(1, guard_interval, remaining))
                break
            except subprocess.TimeoutExpired:
                owned.observe()
                if guard and time.monotonic() >= next_guard:
                    guard()
                    next_guard = time.monotonic() + guard_interval
                if time.monotonic() >= deadline:
                    raise
        owned.stop(proc)
        return subprocess.CompletedProcess(cmd, code)
    except BaseException as error:
        # The revocation receipt lands before the kill is acknowledged, so a stopped
        # run's branch can never reach push/PR/enqueue afterwards.
        if on_kill is not None:
            try:
                on_kill(error)
            except Exception as failure:
                try:
                    log.write(f"publication revocation receipt failed: "
                              f"{type(failure).__name__}: {failure}\n")
                except (AttributeError, OSError):
                    pass
        try:
            owned.stop(proc)
        finally:
            for sig, grace in ((signal.SIGTERM, 15), (signal.SIGKILL, 5)):
                # A reaped leader's PID/PGID may now belong to an unrelated job.
                # Observed descendants are handled by their start identities above.
                if proc.poll() is not None:
                    break
                try:
                    os.killpg(proc.pid, sig)
                except ProcessLookupError:
                    break
                except PermissionError:
                    if not process_group_alive(proc.pid):
                        break
                    raise
                deadline = time.monotonic() + grace
                while time.monotonic() < deadline:
                    proc.poll()  # Reap the leader; its exit does not prove its children exited.
                    if not process_group_alive(proc.pid):
                        break
                    time.sleep(0.05)
                else:
                    continue
                break
        raise
    finally:
        for signo, previous in restored.items():
            try:
                signal.signal(signo, previous)
            except (ValueError, OSError):
                pass


PROVIDER_HANDOFFS = 2


class DiskAdmissionError(RuntimeError):
    pass


def require_disk(host: Host, stage: str) -> None:
    report = disk_guard.check(host)
    if not report.get("admitted"):
        raise DiskAdmissionError(f"{stage}:{report.get('reason', 'disk-unobservable')}")


def install_dependencies(host: Host, worktree: Path, log) -> None:
    require_disk(host, "dependency-install")
    sh(WORKTREE_INSTALL, cwd=worktree, timeout=1800, log=log)


HANDOFF_NOTE = ("A previous agent (lane `{prev}`) stopped before finishing (exit {code}), most likely an "
                "exhausted account or provider failure. Its partial work is in this worktree: check "
                "`git status`, `git diff` and `git log origin/main..HEAD`, then finish the task. Do not "
                "start over.\n\n")


def cool_down(host: Host, name: str) -> None:
    path = host.state / "cooldown" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(str(time.time() + PROVIDER_COOLDOWN_S))


def next_provider(host: Host, exclude: set[str], providers: dict | None = None):
    """The cheapest enabled, healthy, non-cooling lane not yet tried on this run.

    Order comes from providers.json (optional `tier`, else list position). Registry
    exclusions and the same host slot limits used by dispatch also apply to handoff.
    """
    catalog = providers or load_providers()
    host_excluded = {name for name, spec in catalog.items()
                     if isinstance(spec, dict) and host.slots(name, spec.get("slots", 1)) <= 0}
    cooled = {name for name in catalog if cooling(host, name)}

    def healthy(_name, spec):
        return provider_healthy(spec)

    chosen = remediation.route_lane(catalog, exclude=set(exclude) | host_excluded, healthy=healthy, cooled=cooled)
    if chosen is None:
        return None
    return chosen["lane"], chosen["spec"]


# ------------------------------------------------- publication revocation (JOV-5060)
# Process kill is not publication revocation: a stopped run's branch must never later
# push, open a PR, take a label, enroll, or merge. `run_agent` writes the immutable
# receipt before the kill is acknowledged; every irreversible boundary revalidates it.

PUBLICATION_REVOCATION_SCHEMA = "jovie-publication-revocation/v1"


def revocations_path(host: Host) -> Path:
    return host.state / "runs" / "publication-revocations.jsonl"


def revoke_publication(host: Host, *, branch: str, run_id=None, issue=None, pr=None,
                       reason: str) -> dict:
    """Append the immutable revocation receipt. Callers write it before they ack a kill."""
    receipt = {"schema": PUBLICATION_REVOCATION_SCHEMA, "branch": branch, "reason": reason,
               "owner": HOST, "at": now_iso()}
    receipt.update({key: value for key, value in
                    {"runId": run_id, "issue": issue, "pr": pr}.items() if value is not None})
    path = revocations_path(host)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a") as out:
        out.write(json.dumps(receipt) + "\n")
    return receipt


class PublicationRevoked(RuntimeError):
    def __init__(self, branch: str, stage: str, receipt: dict):
        super().__init__(f"publication-revoked:{stage}:{receipt.get('reason', '?')}")
        self.branch, self.stage, self.receipt = branch, stage, receipt


def publication_revocation(host: Host, branch: str | None) -> dict | None:
    """The newest revocation receipt for `branch`; None only when the ledger is absent or
    holds none. An unreadable or corrupt ledger fails closed as revoked: an authorization
    that cannot be verified is not a publication permit."""
    if not branch:
        return None
    try:
        lines = revocations_path(host).read_text().splitlines()
    except FileNotFoundError:
        return None
    except OSError as error:
        return {"schema": PUBLICATION_REVOCATION_SCHEMA, "branch": branch, "unreadable": True,
                "reason": f"revocation-ledger-unreadable:{type(error).__name__}"}
    rows = []
    for line in lines:
        try:
            rows.append(json.loads(line))
        except ValueError:
            return {"schema": PUBLICATION_REVOCATION_SCHEMA, "branch": branch, "unreadable": True,
                    "reason": "revocation-ledger-corrupt"}
    return next((row for row in reversed(rows)
                 if isinstance(row, dict) and row.get("schema") == PUBLICATION_REVOCATION_SCHEMA
                 and row.get("branch") == branch), None)


def require_publishable(host: Host, branch: str | None, stage: str) -> None:
    revoked = publication_revocation(host, branch)
    if revoked:
        raise PublicationRevoked(branch or "", stage, revoked)


# ---------------------------------------------------------------- one run

def run_hyperagent_issue(host: Host, spec: dict, issue: Issue) -> dict:
    """Use the same execution contract and gate for remote work, without local-code failover."""
    import runpy
    runs = host.state / "runs"
    runs.mkdir(parents=True, exist_ok=True)
    ident = execution_attempt.identity("linear-work", {"issue": issue.identifier, "outcome": "draft-pr"},
                                       {"title": issue.title, "description": issue.description})
    branch = f"hyperagent/{issue.identifier.lower()}-{ident['identityDigest'][:15]}"
    evidence = runs / f"{ident['identityDigest']}.provider.jsonl"
    run_id = f"{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-{issue.identifier}-hyperagent-{uuid.uuid4().hex[:6]}"
    receipt = {"schema": "jovie-lane-run/v1", "runId": run_id, "provider": "hyperagent", "model": spec.get("model"),
               "origin": AUTONOMOUS_ORIGIN, "issue": issue.identifier, "linearIssueId": issue.id,
               "branch": branch, "startedAt": now_iso(), "offer": {"eligible": True, "accepted": False},
               "attribution": {"category": "autonomous-created", "originProvider": "hyperagent", "finalProvider": "hyperagent"},
               **({"route": spec["route"]} if spec.get("route") else {})}
    def hold(reason):
        return {"verdict": "remote-held", "reasons": [reason], "next_action": "reconcile-existing-remote-attempt"}
    claimed = None
    try:
        executable = shutil.which("hyperagent")
        api = runpy.run_path(executable) if executable else None
        if not isinstance(api, dict) or not callable(api.get("mcp_call")):
            api = None
    except Exception:  # a broken transport is a hold, never a crashed worker
        api = None
    refresh = (lambda current, now: hyperagent_lane.refresh_proof(current, api["mcp_call"], now)) if api else None
    if refresh and not hyperagent_lane.verified(spec, time.time()):
        proof, reason = refresh(spec, time.time())
        spec = {**spec, "verifiedRemote": proof} if proof else spec
        receipt["proofRefresh"] = reason or "fresh"
    if not hyperagent_lane.verified(spec, time.time()):
        receipt.update(hold("remote-preflight-unverified"))
    else:
        owner = {"owner": HOST, "runtime": "symphony-lanes", "provider": "hyperagent", "model": spec.get("model"),
                 "tool": "lane_runner", "accountPool": "hyperagent"}
        coordination = execution_coordination(execution_attempt.GITHUB_LEDGER_ANCHOR)
        policy = {"attempts": MAX_FAILURES, "concurrency": 1, "wallSeconds": host.agent_timeout * MAX_FAILURES,
                  "spend": MAX_FAILURES, "mutations": MAX_FAILURES, "leaseSeconds": host.agent_timeout + 900, "version": "lanes-v1"}
        try:
            if evidence.exists():
                state = json.loads(evidence.read_text().splitlines()[-1])
                fence = state["binding"]["attempt"]
                claimed = execution_attempt.resume(runs / "execution-attempts.jsonl", ident, fence, owner,
                                                   coordination=coordination)
            else:
                claimed = execution_attempt.claim(runs / "execution-attempts.jsonl", ident, owner, policy,
                    {"triggerId": run_id, "correlationId": issue.identifier, "causationId": issue.id}, coordination=coordination)
            receipt["execution"] = claimed
            if not claimed["admitted"]:
                receipt.update(hold(claimed["reason"]))
            else:
                if api is None:
                    raise OSError("Hyperagent transport unavailable")
                prompt = render_prompt(issue, branch, context_pack(issue), provider="hyperagent")
                (runs / f"{run_id}.prompt.md").write_text(prompt)
                def boundary(spend, mutations):
                    execution_attempt.boundary(runs / "execution-attempts.jsonl", ident, claimed["fencingToken"],
                                               {"spend": spend, "mutations": mutations}, coordination=coordination)
                def find_pr(number):
                    result = sh(["gh", "pr", "view", str(number), "--repo", REPO_SLUG, "--json",
                                 "number,url,state,title,body,headRefName,headRefOid"])
                    if result.returncode:
                        raise RuntimeError("PR read unavailable")
                    return json.loads(result.stdout)
                def gate(pr):
                    boundary(0, 1)
                    # Existing adoption owns its isolated checkout, diff policy,
                    # canonical checks and native queue; no second PR is created.
                    return adopt_pr(host, "hyperagent", pr)
                receipt["offer"]["accepted"] = True
                receipt.update(hyperagent_lane.run(spec, issue.identifier, claimed["fencingToken"], branch, prompt,
                    evidence, api["mcp_call"], find_pr, gate, timeout=host.agent_timeout,
                    before_dispatch=lambda: boundary(1, 1), refresh=refresh))
                if receipt["verdict"] != "remote-held":
                    result = "succeeded" if receipt["verdict"] in ("landing", "verified-not-queued", "held", "gate-timeout") else "failed_unknown"
                    receipt["execution"] = execution_attempt.finish(runs / "execution-attempts.jsonl", ident,
                        claimed["fencingToken"], result, {"evidenceDigest": execution_attempt.digest(receipt),
                            "costs": {"apiCost": None}, "dependencies": ["hyperagent"],
                            "mutationsPerformed": ["remote_thread", "pull_request_adoption"]}, coordination=coordination)
        except Exception:
            # Never expose OAuth errors, call another model, or call an unknown
            # create outcome cancelled. Its durable journal remains authoritative.
            receipt.update(hold("remote-adapter-unavailable"))
    receipt.update(endedAt=now_iso(), result={"verdict": receipt.get("verdict"), "pr": receipt.get("pr"),
                   "prUrl": receipt.get("prUrl"), "commit": receipt.get("headSha")})
    with (runs / "ledger.jsonl").open("a") as ledger:
        ledger.write(json.dumps(receipt) + "\n")
    return receipt


def run_issue(host: Host, name: str, spec: dict, linear: Linear, issue: Issue) -> dict:
    if name == "hyperagent":
        return run_hyperagent_issue(host, spec, issue)
    run_id = f"{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-{issue.identifier}-{name}-{uuid.uuid4().hex[:6]}"
    runs = host.state / "runs"
    runs.mkdir(parents=True, exist_ok=True)
    branch = f"{name}/{issue.identifier.lower()}-{run_id[:15].lower()}"
    worktree = host.state / "worktrees" / run_id
    provider_evidence = runs / f"{run_id}.provider.jsonl"
    receipt = {"schema": "jovie-lane-run/v1", "runId": run_id, "provider": name, "model": spec.get("model"),
               "accountClass": spec.get("accountClass"), "origin": AUTONOMOUS_ORIGIN,
               "issue": issue.identifier, "linearIssueId": issue.id, "branch": branch,
               "worktree": str(worktree), "offer": {"eligible": True, "accepted": False},
               "attribution": {"category": "autonomous-created", "originProvider": name,
                               "finalProvider": name}, "startedAt": now_iso(),
               **({"route": spec["route"]} if spec.get("route") else {})}
    ident = execution_attempt.identity("linear-work", {"issue": issue.identifier, "outcome": "draft-pr"},
                                       {"title": issue.title, "description": issue.description})
    coordination = execution_coordination(execution_attempt.GITHUB_LEDGER_ANCHOR)
    try:
        preserved = preserved_run(host, issue=issue.identifier)
        if preserved:
            raise RecoveryHandoff("preserved-issue-needs-execution-reconciliation", preserved[0], issue.identifier)
    except RecoveryHandoff as error:
        receipt.update(verdict="recovery-handoff", reasons=[str(error)], recovery=error.evidence,
                       endedAt=now_iso(), result={"verdict": "recovery-handoff", "pr": None, "commit": None})
        with open(runs / "ledger.jsonl", "a") as ledger:
            ledger.write(json.dumps(receipt) + "\n")
        return receipt
    policy = {"attempts": MAX_FAILURES, "concurrency": 1, "wallSeconds": host.agent_timeout * MAX_FAILURES,
              "spend": MAX_FAILURES, "mutations": MAX_FAILURES,
              "leaseSeconds": host.agent_timeout + 900, "version": "lanes-v1"}
    try:
        claimed = execution_attempt.claim(runs / "execution-attempts.jsonl", ident,
                                          {"owner": HOST, "runtime": "symphony-lanes", "provider": name,
                                           "model": spec.get("model"), "tool": "lane_runner", "accountPool": name},
                                          policy, {"triggerId": run_id, "correlationId": issue.identifier,
                                                   "causationId": issue.id}, coordination=coordination)
    except Exception as error:
        # A claim that never lands used to kill the worker before any receipt existed:
        # the issue it already moved to In Progress stranded there, nothing reached the
        # ledger, and the doctor only saw spawn-exit (JOV-7191). A failed receipt feeds
        # the normal verdict path, which returns the issue to Todo.
        receipt.update(verdict="failed", reasons=[f"claim-error:{type(error).__name__}:{error}"[:300]])
    else:
        receipt["execution"] = claimed
    if not receipt.get("verdict") and not claimed["admitted"]:
        receipt.update(verdict="duplicate-active" if claimed["reason"] == "duplicate_active" else "quarantined",
                       reasons=[claimed["reason"]])
    if receipt.get("verdict"):
        verdict = receipt["verdict"]
        receipt.update(endedAt=now_iso(),
                       result={"verdict": verdict, "commit": None, "pr": None, "prUrl": None})
        with open(runs / "ledger.jsonl", "a") as ledger:
            ledger.write(json.dumps(receipt) + "\n")
        return receipt
    receipt["offer"]["accepted"] = True
    with open(runs / f"{run_id}.log", "w") as log:
        try:
            def revoke_run(error) -> None:
                """Any kill of this run — timeout, guard hold, operator signal — permanently
                revokes the branch's publication authority before the kill is acked."""
                revoke_publication(host, branch=branch, run_id=run_id, issue=issue.identifier,
                                   reason=("run-stopped" if isinstance(error, RunStopped)
                                           else f"run-killed:{type(error).__name__}"[:200]))

            def run_guard(stage):
                require_disk(host, stage)
                require_publishable(host, branch, stage)

            require_disk(host, "issue-checkout")
            sh(["git", "fetch", "-q", "origin", "main"], cwd=host.repo, log=log)
            # A pooled slot arrives installed and typecheck-warm; the install below is then
            # an incremental no-op instead of ~5 minutes of per-file linking.
            receipt["worktreeSource"] = worktree_pool.take(host.repo, worktree, branch, "origin/main",
                                                           log=log, sh=sh)
            # Always installed: the gate's checks need it even when the provider works remotely.
            install_dependencies(host, worktree, log)
            worktree_pool.refill_in_background(host.repo)
            brain_context = context_pack(issue)
            prompt = render_prompt(issue, branch, brain_context, provider=name)
            prompt_file = runs / f"{run_id}.prompt.md"
            receipt["contextManifests"] = [write_agent_prompt(
                prompt_file, prompt, "issue", name,
                {"issue": json.dumps({"id": issue.id, "identifier": issue.identifier,
                                      "title": issue.title, "description": issue.description,
                                      "labels": sorted(issue.labels)}, sort_keys=True),
                 "gbrain": brain_context, "branch": branch})]
            started = time.time()
            execution_attempt.boundary(runs / "execution-attempts.jsonl", ident, claimed["fencingToken"],
                                       {"spend": 1, "mutations": 1}, coordination=coordination)
            agent = run_agent(template(spec["cmd"], {"prompt": prompt, "prompt_file": str(prompt_file), "cwd": str(worktree),
                                                       "provider_receipt": str(provider_evidence),
                                                       "model": str(spec.get("model"))}),
                              worktree, log, host.agent_timeout,
                              guard=lambda: run_guard("agent-running"), on_kill=revoke_run)
            # Tim 2026-09-27: an exhausted provider never leaves the issue half-done; another
            # lane finishes it on the same worktree.
            handoffs, current = [], name
            while agent.returncode != 0 and len(handoffs) < PROVIDER_HANDOFFS:
                nxt = next_provider(host, {name, *(h["to"] for h in handoffs)})
                if nxt is None:
                    break
                cool_down(host, current)
                nxt_name, nxt_spec = nxt
                handoff_note = HANDOFF_NOTE.format(prev=current, code=agent.returncode)
                handoff_prompt = handoff_note + prompt
                handoff_file = runs / f"{run_id}.handoff{len(handoffs) + 1}.prompt.md"
                receipt["contextManifests"].append(write_agent_prompt(
                    handoff_file, handoff_prompt, "handoff", nxt_name,
                    {"previous_prompt": prompt, "handoff_note": handoff_note}))
                log.write(f"\n== lane {current} exited {agent.returncode}; handing off to {nxt_name}\n")
                log.flush()
                handoffs.append({"from": current, "to": nxt_name, "exit": agent.returncode,
                                 "reason": "provider-error"})
                note_failover(host, current, nxt_name, "provider-error")
                execution_attempt.boundary(runs / "execution-attempts.jsonl", ident, claimed["fencingToken"],
                                           {"spend": 1, "mutations": 1}, coordination=coordination)
                agent = run_agent(template(nxt_spec["cmd"], {"prompt": handoff_prompt, "prompt_file": str(handoff_file),
                                                             "cwd": str(worktree),
                                                             "provider_receipt": str(provider_evidence),
                                                             "model": str(nxt_spec.get("model"))}),
                                  worktree, log, host.agent_timeout,
                                  guard=lambda: run_guard("handoff-agent-running"), on_kill=revoke_run)
                current = nxt_name
            if handoffs:
                receipt.update(handoffs=handoffs, finishedBy=current)
                receipt["attribution"].update(category="cross-provider-handoff", finalProvider=current)
            receipt.update(agentExit=agent.returncode, agentSeconds=round(time.time() - started))
            receipt.update(verify_and_land(host, issue, branch, worktree, log, started,
                                           sensitive=issue_is_sensitive(issue)))
            log.flush()
            declined = not_shippable_reason((runs / f"{run_id}.log").read_text(errors="replace")[-20000:])
            if declined and receipt.get("verdict") == "no-change":
                receipt.update(verdict="not-shippable", reasons=[declined])
            elif agent.returncode != 0 and receipt.get("verdict") == "no-change":
                # The provider never worked the issue (auth, quota, crash): its fault, not the issue's.
                receipt.update(verdict="provider-error", reasons=[f"agent-exit:{agent.returncode}"])
        except DiskAdmissionError as error:
            receipt.update(verdict="disk-held", reasons=[str(error)])
        except PublicationRevoked as error:
            receipt.update(verdict="revoked", reasons=[str(error)], revocation=error.receipt)
        except subprocess.TimeoutExpired as error:
            receipt.update(verdict="failed", reasons=[f"timeout:{error.cmd[0] if error.cmd else '?'}"])
        except Exception as error:  # a broken run must still leave a receipt and free its issue
            receipt.update(verdict="failed", reasons=[f"harness-error:{type(error).__name__}:{error}"[:300]])
        finally:
            if receipt.get("verdict") == "disk-held":
                preserve_repair(worktree, receipt)
            else:
                remove_worktree(host, worktree)
                sh(["git", "branch", "-D", branch], cwd=host.repo)
    evidence = read_provider_evidence(provider_evidence)
    if evidence:
        receipt["providerEvidence"] = evidence
        leased = next((row for row in reversed(evidence) if row.get("event") == "account-leased"), None)
        if leased:
            receipt["capacityRouteReceipt"] = {
                "schema": "jovie.capacity-route-receipt/v1", "selectedJob": issue.identifier,
                "selectedRoute": name, "selectedLeaseId": f"codex:{leased['account']}",
                "alternativesConsidered": [], "marginalValue": None,
                "expectedCertifiedOutcome": "draft-pr-passing-repository-gate", "drainMode": "normal",
                "modeTrigger": "routine-qualified-work-dispatch",
                "reason": "least-recently-used available compatible account lease",
                "replanConditions": ["rate-limit", "usage-limit", "authentication-failure"],
                "sourceGaps": ["allocator alternatives and marginal value not recorded"],
            }
    receipt["endedAt"] = now_iso()
    verdict = receipt.get("verdict")
    receipt["result"] = {"verdict": verdict, "commit": receipt.get("headSha"), "pr": receipt.get("pr"),
                         "prUrl": receipt.get("prUrl")}
    result = "succeeded" if verdict in ("landing", "verified-not-queued", "held", "gate-timeout",
                                        "gate-in-progress", "gate-deferred", "gate-already-completed") \
        else "no_op_stale" if verdict in ("no-change", "not-shippable") else "failed_unknown"
    receipt["execution"] = execution_attempt.finish(
        runs / "execution-attempts.jsonl", ident, claimed["fencingToken"], result,
        {"failureClass": None if result != "failed_unknown" else "unknown_runtime_result",
         "failureFingerprint": None if result != "failed_unknown" else ":".join(receipt.get("reasons", [verdict])),
         "evidenceDigest": execution_attempt.digest(receipt.get("reasons", [])),
         "costs": {"apiCalls": 1}, "mutationsPerformed": receipt.get("pr") and ["pull_request"] or [],
         "confidence": "high" if result == "succeeded" else "unknown", "dependencies": [name]},
        coordination=coordination)
    with open(runs / "ledger.jsonl", "a") as ledger:
        ledger.write(json.dumps(receipt) + "\n")
    return receipt


def brief_retry_lane(host: Host, name: str, spec: dict) -> tuple[str, dict]:
    """JOV-7717: the frontier retry runs on the frontier lane when it is usable."""
    frontier = design_gate.BRIEF_RETRY_PROVIDER
    catalog = load_providers()
    candidate = catalog.get(frontier)
    if (name != frontier and candidate and candidate.get("enabled", True)
            and not cooling(host, frontier) and provider_healthy(candidate)):
        return frontier, candidate
    return name, spec


def run_brief(host: Host, name: str, spec: dict, linear: Linear, issue: Issue) -> dict:
    """JOV-7541 design/brief lane: one brief-only run on a detached checkout, no PR.

    The second run for an issue is the frontier retry (JOV-7717); after it the
    gate admits the issue as `brief-auto`, so a brief never blocks for good."""
    retry = design_gate.brief_retry(issue)
    if retry:
        name, spec = brief_retry_lane(host, name, spec)
    run_id = f"{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-{issue.identifier}-{name}-brief-{uuid.uuid4().hex[:6]}"
    runs = host.state / "runs"
    runs.mkdir(parents=True, exist_ok=True)
    worktree = host.state / "worktrees" / run_id
    receipt = {"schema": "jovie-lane-run/v1", "runId": run_id, "provider": name, "model": spec.get("model"),
               "kind": "design-brief", "briefRetry": retry, "issue": issue.identifier, "linearIssueId": issue.id,
               "worktree": str(worktree), "startedAt": now_iso()}
    with open(runs / f"{run_id}.log", "w") as log:
        try:
            require_disk(host, "brief-checkout")
            sh(["git", "fetch", "-q", "origin", "main"], cwd=host.repo, log=log)
            sh(["git", "worktree", "add", "-q", "--detach", str(worktree), "origin/main"], cwd=host.repo, log=log)
            brain_context = context_pack(issue)
            prompt = design_gate.render_brief_prompt(
                issue, brain_context, retry=retry, missing=design_gate.build_admission(issue)["missing"])
            prompt_file = runs / f"{run_id}.prompt.md"
            receipt["contextManifests"] = [write_agent_prompt(
                prompt_file, prompt, "issue", name,
                {"issue": json.dumps({"id": issue.id, "identifier": issue.identifier, "title": issue.title,
                                      "description": issue.description}, sort_keys=True),
                 "gbrain": brain_context, "branch": "design-brief"})]
            agent = run_agent(template(spec["cmd"], {"prompt": prompt, "prompt_file": str(prompt_file),
                                                       "cwd": str(worktree),
                                                       "provider_receipt": str(runs / f"{run_id}.provider.jsonl")}),
                              worktree, log, host.agent_timeout, guard=lambda: require_disk(host, "brief-running"))
            brief = worktree / design_gate.BRIEF_FILE
            receipt.update(agentExit=agent.returncode, **design_gate.publish_brief(
                linear, issue, brief.read_text(errors="replace") if brief.exists() else "", retry=retry))
        except DiskAdmissionError as error:
            receipt.update(verdict="disk-held", reasons=[str(error)])
        except Exception as error:  # a broken run must still leave a receipt and free its issue
            receipt.update(verdict="failed", reasons=[f"harness-error:{type(error).__name__}:{error}"[:300]])
        finally:
            (worktree / design_gate.BRIEF_FILE).unlink(missing_ok=True)
            remove_worktree(host, worktree)
    receipt.update(endedAt=now_iso(), result={"verdict": receipt.get("verdict"), "pr": None, "commit": None})
    with open(runs / "ledger.jsonl", "a") as ledger:
        ledger.write(json.dumps(receipt) + "\n")
    return receipt


def verify_and_land(host: Host, issue: Issue, branch: str, worktree: Path, log, started: float,
                    opened: bool = False, sensitive: bool = False) -> dict:
    """Independent of the agent's own claim: find its PR, re-derive the diff, run checks, then land."""
    listed = sh(["gh", "pr", "list", "--repo", REPO_SLUG, "--state", "open", "--search", f"{issue.identifier} in:title",
                 "--json", "number,headRefName,headRefOid,createdAt,url,isDraft"], log=log)
    prs = [pr for pr in json.loads(listed.stdout or "[]")
           if datetime.fromisoformat(pr["createdAt"].replace("Z", "+00:00")).timestamp() >= started - 60]
    if not prs and opened:
        return {"verdict": "failed", "reasons": ["pr-create-failed"]}
    if not prs:
        ahead = sh(["git", "rev-list", "--count", "origin/main..HEAD"], cwd=worktree).stdout.strip()
        if ahead in ("", "0"):
            return {"verdict": "no-change", "reasons": ["no-pr-and-no-commits"]}
        require_publishable(host, branch, "before-push")
        sh(["git", "push", "-q", "-u", "origin", branch], cwd=worktree, log=log)
        # The push's own hooks can take minutes; a stop during them still bars the PR open.
        require_publishable(host, branch, "before-pr-create")
        sh(["gh", "pr", "create", "--repo", REPO_SLUG, "--draft", "--head", branch,
            "--title", f"fix: {issue.title[:80]} ({issue.identifier})",
            "--body", f"Refs {issue.identifier}.\n\n"
            f"<!-- linear-issue-id:{issue.id} -->\n"
            f"<!-- linear-issue-identifier:{issue.identifier} -->\n\n"
            "Lane implementation; verification by the lane gate. "
            "Runtime and commissioning acceptance remain with the issue owner."], cwd=worktree, log=log)
        return verify_and_land(host, issue, branch, worktree, log, started, opened=True, sensitive=sensitive)
    pr = max(prs, key=lambda item: item["createdAt"])
    if sensitive:
        require_publishable(host, pr.get("headRefName") or branch, "before-label")
        sh(["gh", "label", "create", SENSITIVE_PR_LABEL, "--repo", REPO_SLUG, "--force",
            "--color", "B60205", "--description", "Guarded auth/billing/infra lane policy"], log=log)
        sh(["gh", "pr", "edit", str(pr["number"]), "--repo", REPO_SLUG,
            "--add-label", SENSITIVE_PR_LABEL], log=log)
    return gate_pr(host, pr, worktree, log, sensitive=sensitive)


def gate_slot(host: Host) -> tuple[Locked, float]:
    """One of `gate_slots` host-wide gate seats; waits (polling) until one is free.

    Returns the held seat and the seconds spent queued for it, so seat contention is
    measured per gated PR instead of inferred from timeouts.
    """
    started = time.time()
    while True:
        for index in range(host.gate_slots):
            lock = Locked(host.state / "slots" / f"gate.{index}.lock", blocking=False)
            if lock.held:
                return lock, time.time() - started
            lock.release()
        time.sleep(15)


GATE_RESULT_SCHEMA = "jovie.lane-gate-result/v1"
def gate_policy_digest() -> str:
    return hashlib.sha256(Path(__file__).read_bytes() + b"\0dependency_diff\0" +
                          Path(dependency_diff.__file__).read_bytes()).hexdigest()


GATE_POLICY_DIGEST = gate_policy_digest()


@dataclass
class GateClaim:
    pr: dict
    lock: Locked


def reserve_gate(host: Host, pr: dict) -> GateClaim | None:
    identity = hashlib.sha256(f"{REPO_SLUG}:{pr['number']}:{pr['headRefOid']}".encode()).hexdigest()
    lock = Locked(host.state / "locks" / f"gate-head-{identity}.lock", blocking=False)
    if lock.held:
        return GateClaim(pr, lock)
    lock.release()
    return None


def terminal_gate(pr: dict, verified: dict, sensitive: bool = False) -> dict | None:
    result = verified.get(f"{pr['number']}:{pr['headRefOid']}") if isinstance(verified, dict) else None
    if isinstance(result, dict) and result.get("dependencyVersionDiff") is not None:
        versions = result["dependencyVersionDiff"]
        if (not isinstance(versions, dict) or versions.get("schema") != "jovie-dependency-version-diff/v1"
                or not dependency_diff.SHA.fullmatch(str(versions.get("baseSha", "")))
                or not isinstance(versions.get("manifests"), list) or not versions["manifests"]
                or dependency_diff.metadata_digest(pr) is None or versions.get("headSha") != pr["headRefOid"]
                or versions.get("metadataDigest") != dependency_diff.metadata_digest(pr)):
            return None
    # Old SHA strings were written at claim time, so they cannot certify anything.
    if (isinstance(result, dict) and result.get("schema") == GATE_RESULT_SCHEMA
            and result.get("headSha") == pr["headRefOid"]
            and result.get("policyDigest") == GATE_POLICY_DIGEST
            and result.get("verdict") in {"landing", "verified-not-queued", "held"}
            and isinstance(result.get("completedAt"), str)
            and (completed := pr_events.iso_ts(result.get("completedAt"))) is not None
            and completed <= time.time() and (not sensitive or result.get("sensitive") is True)):
        return result
    return None


def gate_disposition(pr: dict, held: dict, attempts: dict) -> str | None:
    """Existing hold/repair ownership is not a new adoption or verification permit."""
    labels = {label.lower() for label in pr_events.label_names(pr)}
    if labels & (pr_events.HOLD_LABELS | {pr_events.PREFIX + pr_events.EXHAUSTED}):
        return "existing-pr-hold"
    entry = held.get(str(pr["number"]), {})
    if entry.get("sha") == pr["headRefOid"]:
        return "existing-gate-hold"
    attempt = attempts.get(str(pr["number"]), {})
    final_push = attempt.get("pushed") and attempt.get("pushedHead") == pr["headRefOid"] \
        and attempt.get("sha") != pr["headRefOid"] and attempt.get("endedAt")
    if pr_events.in_flight(attempt, pr, time.time()) or (
            pr_events.spent(attempt, pr["headRefOid"], MAX_FIX_ATTEMPTS) and not final_push):
        return "existing-fix-disposition"
    return None


def gate_deferral(host: Host, pr: dict) -> str | None:
    held, attempts = held_path(host), host.state / "fix-attempts.json"
    return gate_disposition(pr, json.loads(held.read_text()) if held.exists() else {},
                            json.loads(attempts.read_text()) if attempts.exists() else {})


def require_gate_authority(host: Host, pr: dict, stage: str, sensitive: bool) -> dict:
    live = require_fix_target(pr, stage)
    require_publishable(host, live.get("headRefName"), stage)
    if not sensitive and SENSITIVE_PR_LABEL in {label.lower() for label in pr_events.label_names(live)}:
        raise RepairStopped("sensitive-mode-changed", live, stage)
    if reason := gate_deferral(host, live):
        raise RepairStopped(reason, live, stage)
    return live


def require_gate_command_authority(host: Host, pr: dict, worktree: Path, stage: str, sensitive: bool) -> None:
    """Waiting for a seat is not permission to run checks for stale authority."""
    try:
        if any(claimed_elsewhere(pr["number"], pr["headRefOid"], kind, timeout=30)
               for kind in ("fix", "gate")):
            raise RepairStopped("gate-owner-active-or-unavailable", None, stage)
        live = require_gate_authority(host, pr, stage, sensitive)
        head = sh(["git", "rev-parse", "HEAD"], cwd=worktree, timeout=30)
        if head.returncode or head.stdout.strip() != pr["headRefOid"]:
            raise RepairStopped("gate-checkout-head-mismatch", live, stage)
    except (OSError, ValueError, TypeError, AttributeError, KeyError, subprocess.SubprocessError) as error:
        # Only admission reads are normalized here. Gate-command timeouts and
        # operator stops keep their existing charging and drain behavior.
        raise RepairStopped(f"gate-authority-unavailable:{type(error).__name__}", None, stage) from error


def gate_timeouts(host: Host, pr: dict, change: int = 0) -> int:
    """Consecutive gate timeouts for this PR head; a new head resets the count."""
    path = host.state / "gate-timeouts.json"
    count = 0
    def update(data):
        nonlocal count
        key = f"{pr['number']}:{pr['headRefOid']}"
        entry = data.get(key, data.get(str(pr["number"]), {}))
        count = (entry.get("count", 0) if entry.get("sha") == pr["headRefOid"] else 0) + change
        if change:
            data[key] = {"sha": pr["headRefOid"], "count": count}
    update_json(path, update)
    return count


def gate_pr(host: Host, pr: dict, worktree: Path, log, sensitive: bool = False,
            claim: GateClaim | None = None) -> dict:
    """One host-local gate per exact head, from reservation through durable result."""
    owned = claim is None
    claim = reserve_gate(host, pr) if owned else claim
    result = {"pr": pr["number"], "prUrl": pr.get("url"), "headSha": pr["headRefOid"]}
    if claim is None:
        return {**result, "verdict": "gate-in-progress", "reasons": ["exact-head-gate-reserved"]}
    try:
        if not claim.lock.held or any(claim.pr[key] != pr[key] for key in ("number", "headRefOid")):
            raise RuntimeError("gate-reservation-mismatch")
        live = require_fix_target(pr, "before-gate")
        sensitive = sensitive or SENSITIVE_PR_LABEL in {label["name"].lower() for label in live.get("labels", [])}
        revoked = publication_revocation(host, live.get("headRefName"))
        if revoked:
            return {**result, "verdict": "revoked", "reasons": [f"publication-revoked:{revoked.get('reason', '?')}"],
                    "revocation": revoked}
        path = host.state / "verified.json"
        prior = terminal_gate(pr, json.loads(path.read_text()) if path.exists() else {}, sensitive)
        if prior:
            return {**result, "verdict": "gate-already-completed", "reasons": ["exact-head-terminal-gate"],
                    "gateResult": prior}
        if reason := gate_deferral(host, live):
            raise RepairStopped(reason, live, "before-gate")
        result = _gate_pr(host, live, worktree, log, sensitive, claim, result=result)
        if result.get("verdict") in {"landing", "verified-not-queued", "held"}:
            proof = {**result, "schema": GATE_RESULT_SCHEMA, "completedAt": now_iso(),
                     "policyDigest": GATE_POLICY_DIGEST, "sensitive": sensitive}
            update_json(path, lambda verified: verified.update({f"{pr['number']}:{pr['headRefOid']}": proof}))
            # Carry the actual completed gate into the original run journal.
            # A verdict/PR pair alone cannot attest source qualification later.
            result["gateResult"] = proof
        return result
    except RepairStopped as error:
        return {**result, "verdict": "gate-deferred", "reasons": [str(error)], "stage": error.stage}
    except PublicationRevoked as error:
        return {**result, "verdict": "revoked", "reasons": [str(error)], "revocation": error.receipt,
                "stage": error.stage}
    finally:
        if owned:
            claim.lock.release()


def _gate_pr(host: Host, pr: dict, worktree: Path, log, sensitive: bool, claim: GateClaim, *, result: dict) -> dict:
    """The independent gate for one PR head: diff rules, the canonical repo gate, then land."""
    revoked = publication_revocation(host, pr.get("headRefName"))
    if revoked:
        return {"pr": pr["number"], "prUrl": pr.get("url"), "headSha": pr["headRefOid"],
                "verdict": "revoked",
                "reasons": [f"publication-revoked:{revoked.get('reason', '?')}"],
                "revocation": revoked}
    for command in (["git", "fetch", "-q", "origin", f"pull/{pr['number']}/head"],
                    ["git", "checkout", "-q", "--detach", pr["headRefOid"]]):
        if sh(command, cwd=worktree, log=log).returncode != 0:
            raise RepairStopped("gate-checkout-failed", pr, "before-gate-checks")
    checked_head = sh(["git", "rev-parse", "HEAD"], cwd=worktree)
    if checked_head.returncode or checked_head.stdout.strip() != pr["headRefOid"]:
        raise RepairStopped("gate-checkout-head-mismatch", pr, "before-gate-checks")
    numstat = sh(["git", "diff", "--numstat", "origin/main...HEAD"], cwd=worktree).stdout
    changes = parse_numstat(numstat)
    reasons, versions = gate_assessment(changes, SENSITIVE_REVIEWABLE_LINES if sensitive else MAX_REVIEWABLE_LINES,
                                       worktree=worktree, pr=pr)
    if versions is not None:
        result["dependencyVersionDiff"] = versions
    evidence = []
    # The caller retains this same receipt if a later authority read refuses.
    result.update(changedFiles=len(changes), reasons=reasons)
    if not reasons:
        commands = check_commands([change.path for change in changes], pr)
        seat = None
        if commands:
            seat, waited = gate_slot(host)
            result["gateWaitS"] = round(waited)
        try:
            for command in commands:
                require_gate_command_authority(host, pr, worktree, "before-gate-command", sensitive)
                try:
                    ran = sh(command, cwd=worktree, timeout=host.gate_timeout, log=log, stream=True,
                             pass_fds=(claim.lock.handle.fileno(), seat.handle.fileno()))
                except subprocess.TimeoutExpired:
                    # A slow gate is the host's problem, not the PR's: leave the head unverified so
                    # the adopt loop retries it, and only hold after repeated timeouts.
                    count = gate_timeouts(host, pr, change=1)
                    if count < MAX_GATE_TIMEOUTS:
                        return {**result, "verdict": "gate-timeout",
                                "reasons": [f"gate-timeout:{host.gate_timeout}s:x{count}"]}
                    reasons.append(f"gate-timeout:x{count}")
                    evidence.append(f"gate timed out {count} times at {host.gate_timeout}s per attempt")
                    break
                if ran.returncode != 0:
                    reasons.append(f"check-failed:{' '.join(command[:6])}")
                    evidence += [line for line in log_tail(log).splitlines()
                                 if re.search(r"(?i)error|fail|missing|expected|✗|×", line)][-40:]
            if sensitive and not reasons:
                require_gate_command_authority(host, pr, worktree, "before-sensitive-review", sensitive)
                passed, review_reasons = sensitive_review(host, pr, worktree, log,
                    pass_fds=(claim.lock.handle.fileno(), *([seat.handle.fileno()] if seat else [])))
                if not passed:
                    reasons.extend(review_reasons)
        finally:
            if seat is not None:
                seat.release()
        result["reasons"] = reasons
    live = require_gate_authority(host, pr, "after-gate", sensitive)
    if result.get("dependencyVersionDiff") is not None:
        live_reasons, live_versions = gate_assessment(changes,
            SENSITIVE_REVIEWABLE_LINES if sensitive else MAX_REVIEWABLE_LINES, worktree=worktree, pr=live)
        reasons.extend(reason for reason in live_reasons if reason not in reasons)
        if live_versions != result["dependencyVersionDiff"]:
            reasons.append("dependency-version-evidence-changed")
    checked_head = sh(["git", "rev-parse", "HEAD"], cwd=worktree)
    if checked_head.returncode or checked_head.stdout.strip() != pr["headRefOid"]:
        raise RepairStopped("gate-checkout-head-mismatch", live, "after-gate")
    if reasons:
        sh(["gh", "pr", "comment", str(pr["number"]), "--repo", REPO_SLUG, "--body",
            "Lane gate held this PR (it stays draft):\n" + "\n".join(f"- `{r}`" for r in reasons)], log=log)
        record_held(host, pr["number"], pr["headRefOid"], reasons + evidence)
        return {**result, "verdict": "held"}
    # Persist intent first: an interrupted qualification never turns a queue marker into
    # evidence. Only the completed exact-head proof below authorizes publication.
    update_requeue_locked(host, lambda pending: pending.update({str(pr["number"]): pr["headRefOid"]}))
    proof = {**result, "verdict": "verified-not-queued", "schema": GATE_RESULT_SCHEMA,
             "completedAt": now_iso(), "policyDigest": GATE_POLICY_DIGEST, "sensitive": sensitive}
    update_json(host.state / "verified.json", lambda verified: verified.update({f"{pr['number']}:{pr['headRefOid']}": proof}))
    outcome = publish_verified(host, pr, claim=claim, log=log)
    return {**result, "verdict": outcome if outcome in {"landing", "verified-not-queued"} else "verified-not-queued",
            "promotion": outcome}


def successful_gate(host: Host, pr: dict, sensitive: bool = False) -> dict | None:
    """Read the same complete terminal record used by adoption; a held result is not a pass."""
    try:
        verified = json.loads((host.state / "verified.json").read_text())
    except (OSError, ValueError):
        return None
    if not isinstance(verified, dict):
        return None
    proof = terminal_gate(pr, verified, sensitive)
    return proof if proof and proof.get("verdict") in {"landing", "verified-not-queued"} else None


def clear_requeue(host: Host, number: int, head: str) -> None:
    def clear(pending):
        if pending.get(str(number)) == head:
            del pending[str(number)]
    update_requeue_locked(host, clear)


def source_publication_authority(pr: dict, *, before_ready: bool, log=None) -> str | None:
    """Consume canonical policy from this immutable release, through existing gh identity."""
    try:
        checked = sh(["node", str(HERE / "source_admission.mjs"), REPO_SLUG,
                      str(pr["number"]), pr["headRefOid"]], timeout=60, log=log)
        receipt = json.loads(checked.stdout)
        if (not isinstance(receipt, dict) or receipt.get("schema") != "jovie-source-admission/v1"
                or receipt.get("prNumber") != pr["number"] or receipt.get("headSha") != pr["headRefOid"]
                or type(receipt.get("allowed")) is not bool or not isinstance(receipt.get("blockers"), list)):
            return "held:source-admission-unavailable"
        if checked.returncode == 0 and receipt["allowed"] is True and receipt["blockers"] == []:
            return None
        if (before_ready and pr.get("isDraft") is True and checked.returncode == 1
                and receipt["allowed"] is False and receipt["blockers"] == ["draft"]):
            return None  # only the transition this writer is about to perform
        return "held:source-admission"
    except (OSError, ValueError, subprocess.SubprocessError):
        return "held:source-admission-unavailable"


def publish_verified(host: Host, pr: dict, *, claim: GateClaim | None = None, log=None) -> str:
    """One receipt consumer for gate completion and fallback publication; never runs a gate."""
    owned = claim is None
    claim = reserve_gate(host, pr) if owned else claim
    if claim is None:
        return "held:gate-active"
    try:
        if not claim.lock.held or any(claim.pr[key] != pr[key] for key in ("number", "headRefOid")):
            raise RuntimeError("gate-reservation-mismatch")
        proof = successful_gate(host, pr)
        if proof is None:
            return "held:gate-proof"
        sensitive = proof.get("sensitive") is True
        live = require_gate_authority(host, pr, "before-verified-ready", sensitive)
        if any(claimed_elsewhere(pr["number"], pr["headRefOid"], kind) for kind in ("fix", "gate")):
            return "held:publication-owner-active"
        update_requeue_locked(host, lambda pending: pending.update({str(pr["number"]): pr["headRefOid"]}))
        if blocked := source_publication_authority(live, before_ready=True, log=log):
            return blocked
        live = require_gate_authority(host, pr, "after-source-policy-before-ready", sensitive)
        if successful_gate(host, pr, sensitive) is None:
            return "held:gate-proof"
        if any(claimed_elsewhere(pr["number"], pr["headRefOid"], kind) for kind in ("fix", "gate")):
            return "held:publication-owner-active"
        if live.get("isDraft"):
            ready = sh(["gh", "pr", "ready", str(pr["number"]), "--repo", REPO_SLUG], log=log)
            if ready.returncode:
                return "held:ready-failed"
        live = require_gate_authority(host, pr, "before-verified-enqueue-policy", sensitive)
        if blocked := source_publication_authority(live, before_ready=False, log=log):
            return blocked
        try:
            history = sh(["node", str(HERE.parent / "merge-queue-backend.mjs"), "check-reenroll",
                          str(pr["number"])], timeout=60, log=log, env={**os.environ, "REPO": REPO_SLUG})
            receipt = json.loads(history.stdout)
            if history.returncode or receipt != {"number": pr["number"], "reenrollable": True}:
                return "held:queue-history"
        except (OSError, ValueError, subprocess.SubprocessError):
            return "held:queue-history-unavailable"
        require_gate_authority(host, pr, "after-source-policy-before-enqueue", sensitive)
        if successful_gate(host, pr, sensitive) is None:
            return "held:gate-proof"
        if any(claimed_elsewhere(pr["number"], pr["headRefOid"], kind) for kind in ("fix", "gate")):
            return "held:publication-owner-active"
        queued = sh(["gh", "pr", "merge", str(pr["number"]), "--repo", REPO_SLUG, "--auto",
                     "--match-head-commit", pr["headRefOid"]], log=log)
        if queued.returncode:
            return "verified-not-queued"
        clear_requeue(host, pr["number"], pr["headRefOid"])
        return "landing"
    except (RepairStopped, PublicationRevoked) as error:
        return f"held:{error}"
    finally:
        if owned:
            claim.lock.release()


UPDATE_TEST_TIMEOUT_S = 900
# `update` runs ahead of every dispatch tick, so a refused tree waits this long before its
# self-test runs again instead of stalling dispatch every minute.
UPDATE_RETRY_S = 1800


def update_json(path: Path, change) -> None:
    lock = Locked(path.with_suffix(path.suffix + ".lock"), blocking=True)
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        data = json.loads(path.read_text()) if path.exists() else {}
        change(data)
        with temporary.open("w") as handle:
            json.dump(data, handle)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)
        lock.release()


def gate_outcome(receipt: dict) -> dict:
    """Project gate evidence without importing the producer's enclosing run identity."""
    fields = ("verdict", "pr", "prUrl", "headSha", "reasons", "changedFiles", "gateWaitS", "revocation", "stage",
              "gateSensitive", "dependencies", "next_action", "execution", "qualificationExecution",
              "sourceFencingToken", "remoteThreadId", "remoteAgentId", "modelSettingsProof", "adoptRunId")
    result = {key: receipt[key] for key in fields if key in receipt}
    if receipt.get("kind") == "adopt" and receipt.get("runId"):
        result["adoptRunId"] = receipt["runId"]
    return result


def qualification_receipt(name: str, issue: Issue, outcome: dict) -> dict:
    """A continuation is a distinct ledger event linked to the source and gate receipts."""
    return {**gate_outcome(outcome), "schema": "jovie-lane-run/v1", "runId": uuid.uuid4().hex,
            "kind": "qualification", "provider": name, "issue": issue.identifier,
            "linearIssueId": issue.id, "startedAt": now_iso(), "endedAt": now_iso()}


def update_requeue_locked(host: Host, change) -> None:
    """Gate writers and deferred removals share the worker's short inventory lock."""
    lock = Locked(host.state / "claim.lock", blocking=True)
    try:
        update_json(host.state / "requeue.json", change)
    finally:
        lock.release()


def remove_requeue_head(host: Host, pr: dict) -> None:
    """Remove only a landed selection; other slots may have changed the inventory."""
    def remove(rows):
        number = str(pr["number"])
        if rows.get(number) == pr["headRefOid"]:
            del rows[number]
    update_requeue_locked(host, remove)


def run_deferred_requeue(host: Host, pr: dict, retry, *, slot=None):
    """Outside claim.lock, refresh the exact target before expensive qualification."""
    try:
        live = reconcile_fix_target(pr)
        if (not live or live.get("state") != "OPEN"
            or (live.get("number"), live.get("headRefOid"), live.get("headRefName"))
               != (pr.get("number"), pr.get("headRefOid"), pr.get("headRefName"))
            or publication_revocation(host, live.get("headRefName"))):
            return None
        result = retry(live)
        if result and result.get("verdict") == "landing":
            remove_requeue_head(host, pr)
        return result
    except BaseException:
        if slot is not None: slot.release()
        raise

def requeue_verified(host: Host, prs: list[dict] | None, *, defer=None) -> dict | None:
    """Publish outside claim.lock; a deferred scan under that lock only selects work."""
    path = host.state / "requeue.json"
    try:
        pending = json.loads(path.read_text())
    except (OSError, ValueError):
        return
    if not isinstance(pending, dict):
        return
    # Remote continuations call this while holding claim.lock. Even a mixed queue
    # must never fall through to the slow publisher or acquire that lock again.
    # The outside-lock executor refreshes the selected target before retrying it.
    if defer is not None:
        for pr in prs or []:
            if (pending.get(str(pr["number"])) == pr.get("headRefOid")
                    and pr.get("state", "OPEN") == "OPEN"
                    and not publication_revocation(host, pr.get("headRefName")) and defer(pr)):
                return dict(pr)
        return None
    targets = {str(pr["number"]): pr for pr in (prs or [])}
    for number, head in pending.items():
        if not str(number).isdigit() or not isinstance(head, str) or not head:
            continue
        pr = targets.get(number)
        if pr is None or pr.get("headRefOid") != head:
            live = reconcile_fix_target({"number": int(number), "headRefOid": head})
            if live is None:
                continue
            if live.get("state") in {"CLOSED", "MERGED"} or (live.get("state") == "OPEN" and live.get("headRefOid") != head):
                clear_requeue(host, int(number), head)
                continue
            pr = live
        publish_verified(host, pr)


# ---------------------------------------------------------------- fix red first

# ---------------------------------------------------------------- cross-host claims

_CLAIM_OBSERVATIONS: dict = {}  # This worker's existing remote claim reads, never new census calls.


def claimed_elsewhere(number: int, sha: str, kind: str, now: float | None = None, *, timeout: float = 600) -> bool:
    """True when another host recorded a live claim for this exact head and kind on the PR.
    Local state files are per host; the PR's comments are the truth every host can see."""
    active = pr_events.claim_active(number, sha, sh, now, kind=kind, exclude_host=HOST, timeout=timeout)
    _CLAIM_OBSERVATIONS[(number, sha, kind)] = {"active": active, "at": time.time()}
    return active


def post_claim(number: int, sha: str, kind: str) -> None:
    sh(["gh", "pr", "comment", str(number), "--repo", REPO_SLUG, "--body",
        f"🤖 lane claim kind={kind} sha={sha} host={HOST} at={now_iso()}"])


def held_path(host: Host) -> Path:
    return host.state / "held.json"


HELD_PRUNE_LIMIT = 200
HELD_STALE_HEAD_S = 24 * 3600


def held_drop_keys(held: dict, open_prs: list[dict] | None, now: float, *, complete: bool) -> list[str]:
    """Keys safe to drop. Closed PRs and holds whose head moved more than a day ago are
    terminal or expired. A partial open-PR read never drops a numbered hold. Corrupt
    records are always dropped. At most HELD_PRUNE_LIMIT keys, oldest first."""
    heads = {}
    if complete and open_prs is not None:
        for pr in open_prs:
            number = pr.get("number")
            if isinstance(number, int):
                heads[number] = pr.get("headRefOid")
    ranked = []
    for key, entry in (held or {}).items():
        if not str(key).isdigit() or not isinstance(entry, dict):
            ranked.append((0, str(key)))
            continue
        if not complete:
            continue
        number = int(key)
        at = entry.get("at") if isinstance(entry, dict) else None
        stamp = at if isinstance(at, (int, float)) else 0
        if number not in heads:
            ranked.append((stamp, str(key)))
            continue
        sha = entry.get("sha")
        current = heads[number]
        if sha and current and sha != current and isinstance(at, (int, float)) and now - at >= HELD_STALE_HEAD_S:
            ranked.append((stamp, str(key)))
    ranked.sort()
    return [key for _, key in ranked[:HELD_PRUNE_LIMIT]]


def prune_held(host: Host, open_prs: list[dict] | None, now: float, *, complete: bool) -> int:
    """Drop expired or terminal held.json rows under the file lock. Never raises."""
    dropped = 0

    def change(data: dict) -> None:
        nonlocal dropped
        for key in held_drop_keys(data, open_prs, now, complete=complete):
            if key in data:
                del data[key]
                dropped += 1

    try:
        update_json(held_path(host), change)
    except (OSError, ValueError, TypeError):
        return 0
    return dropped


def record_held(host: Host, number: int, head: str, evidence: list[str]) -> None:
    """The gate held this head; the lane's fix loop owns it next, on the same branch."""
    path = held_path(host)
    path.parent.mkdir(parents=True, exist_ok=True)
    update_json(path, lambda held: held.update({str(number): pr_events.held_record(head, evidence)}))


def red_pr(prs: list[dict], attempts: dict, held: dict | None = None) -> dict | None:
    """A lane PR that is stuck at a head we have not tried twice: checks settled red, or
    merge conflicts with main (GitHub drops auto-merge on those, so nothing else frees them)."""
    for pr in sorted(best_per_issue(prs), key=lambda item: item["number"]):
        if pr.get("isInMergeQueue") is True:
            continue  # Native landing owns this head; cached absence still needs a fresh claim read.
        if (pr.get("headRefName") or "").startswith("dependabot/"):
            # Dependabot Auto-Merge owns version bumps (recreate on conflict, ignore on a real
            # regression). ~100 fix runs went to dependabot branches in the week to 2026-10-10
            # and none of them could change what a bump breaks.
            continue
        # A held PR is Tim's/Summer's call: fixing it re-arms auto-merge and re-enqueues it
        # (#17541, 2026-09-28). The event path already skips holds via pr_events.in_scope.
        if pr_events.preservation_reason(pr, attempts.get(str(pr["number"]), {}), MAX_FIX_ATTEMPTS,
                                         now=time.time(), allow_reentry=True):
            continue
        checks = pr.get("statusCheckRollup") or []
        conflicted = pr.get("mergeStateStatus") == "DIRTY"
        held_entry = (held or {}).get(str(pr["number"]), {})
        if not pr_events.fixable_hold(held_entry, pr["headRefOid"]):
            continue  # a hold no push clears (e.g. diff-too-large): intake owns it, not attempts
        gate_held = held_entry.get("sha") == pr["headRefOid"]
        reviewed = pr.get("reviewDecision") == "CHANGES_REQUESTED"
        if not conflicted and not gate_held and not reviewed:
            if any((check.get("status") is not None and check["status"] != "COMPLETED")
                   or check.get("state") in ("PENDING", "EXPECTED") for check in checks):
                continue
            if not any(check.get("conclusion") in RED for check in checks):
                continue
        record = attempts.get(str(pr["number"]), {})
        if pr_events.in_flight(record, pr, time.time()) \
                or pr_events.spent(record, pr["headRefOid"], MAX_FIX_ATTEMPTS):
            continue
        return pr
    return None


def exhausted_prs(prs: list[dict], attempts: dict, held: dict | None = None) -> list[dict]:
    """Stuck heads not yet escalated: fix attempts spent, or a hold no push can clear."""
    stuck = []
    for pr in prs:
        record = attempts.get(str(pr["number"]), {})
        # Escalation is sticky only for this generation. A new external head re-enters
        # (JOV-7089); a zero-count unfixable hold stays terminal.
        if record.get("escalated") and (not record.get("count") or pr_events.same_generation(record, pr["headRefOid"])):
            continue
        if not pr_events.fixable_hold((held or {}).get(str(pr["number"])), pr["headRefOid"]):
            stuck.append(pr)  # deterministic hold: intake once, not MAX_FIX_ATTEMPTS model calls
            continue
        # Spent attempts are terminal for this head's generation (red_pr never retries it), so
        # a head the last fix pushed that is still stuck escalates too instead of waiting
        # silently. A head nobody here pushed is new evidence: re-entry, not escalation.
        if pr_events.spent(record, pr["headRefOid"], MAX_FIX_ATTEMPTS):
            checks = pr.get("statusCheckRollup") or []
            if pr.get("mergeStateStatus") == "DIRTY" or pr.get("reviewDecision") == "CHANGES_REQUESTED" \
                    or any(check.get("conclusion") in RED for check in checks):
                stuck.append(pr)
    return stuck


def owning_issue(linear, pr: dict) -> dict | None:
    """The Linear issue this PR's lane branch names — the durable owner of the fix generation."""
    found = LANE_BRANCH.match(pr.get("headRefName") or "")
    if not found:
        return None
    try:
        return pr_events.linear_issue(linear, found.group("issue"))
    except Exception:
        return None


DISPOSITION_MARKER = "terminal-disposition"


def apply_terminal_disposition(linear, pr: dict, record: dict, reason: str) -> None:
    """JOV-7089: a terminal fix generation never falls back into an ordinary work queue. The
    owning issue moves out of Todo/Triage to Backlog under one durable receipt naming the
    terminal head and the re-entry conditions; the marker dedupes repeat escalations across
    hosts and passes, so the disposition is applied exactly once per terminal head."""
    issue = owning_issue(linear, pr)
    if not issue or (issue.get("state") or {}).get("type") in ("completed", "canceled"):
        return
    marker = f"{DISPOSITION_MARKER} pr={pr['number']} head={pr['headRefOid']}"
    if any(marker in (node.get("body") or "")
           for node in (issue.get("comments") or {}).get("nodes") or []):
        return
    linear.move(issue["id"], "Backlog")
    receipt = {"schema": "jovie-terminal-disposition/v1", "pr": pr["number"], "url": pr.get("url"),
               "terminalGeneration": {"head": pr["headRefOid"], "attempts": record.get("count", 0),
                                      "reason": reason},
               "disposition": "needs-human-decision",
               "reentry": ["new-pr-head", "cleared-dependency", "config-change", "policy-override"]}
    linear.comment(issue["id"],
                   f"🤖 lanes {marker}: {record.get('count', 0) or 'no'} fix attempts on head "
                   f"`{pr['headRefOid'][:12]}` reached a terminal outcome (`{reason}`); the diagnosis "
                   "stays on the PR and in the execution ledger. This issue waits in Backlog — retry "
                   "exhaustion is not Todo/Triage admission (JOV-7089). Re-entry needs new "
                   "authoritative evidence: a new PR head, a cleared dependency, a relevant "
                   "config/environment change, or a certified policy override with a new bounded "
                   f"envelope.\n```json\n{json.dumps(receipt, sort_keys=True)}\n```")


def load_escalation(host: Host) -> dict:
    path = host.state / "escalation.json"
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError):
        data = {}
    for key, empty in (("classified", []), ("escalating", []), ("ladderExhausted", []),
                       ("surfaced", []), ("attempts", []), ("failovers", [])):
        data.setdefault(key, empty)
    data.setdefault("bySource", {})
    data.setdefault("routedByLane", {})
    data.setdefault("events", {})
    return data


def save_escalation(host: Host, data: dict) -> None:
    path = host.state / "escalation.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data))


def note_failover(host: Host, previous: str, nxt: str, reason: str) -> None:
    """A providers.json handoff (error, exhausted account, unhealthy lane) for doctor.json."""
    try:
        data = load_escalation(host)
        data["failovers"].append({"from": previous, "to": nxt, "reason": reason, "at": time.time()})
        data["routedByLane"][nxt] = int(data["routedByLane"].get(nxt) or 0) + 1
        save_escalation(host, data)
    except OSError:
        pass


def _remember_class(data: dict, pr: dict, classified: dict) -> None:
    number = pr.get("number")
    data["classified"] = [row for row in data["classified"]
                          if not (isinstance(row, dict) and row.get("pr") == number)]
    data["classified"].append({"pr": number, "cls": classified["cls"], "at": time.time()})
    data["bySource"]["pr"] = int(data["bySource"].get("pr") or 0) + 1


def _surface_exhausted(host: Host, pr: dict, record: dict, classified: dict, reason: str,
                       linear, attempts: dict, data: dict) -> None:
    """One deduped surface: PR comment, terminal disposition, exhausted label. No second queue."""
    head = pr.get("headRefOid") or ""
    number = pr["number"]
    already = any(isinstance(row, dict) and row.get("pr") == number and row.get("head") == head
                  for row in data.get("surfaced") or [])
    if not already:
        sh(["gh", "pr", "comment", str(number), "--repo", REPO_SLUG, "--body",
            remediation.surface_body(pr, classified, reason)])
        data["surfaced"].append({"pr": number, "cls": classified["cls"], "reason": reason,
                                 "head": head, "at": time.time()})
        if reason == "ladder-exhausted" and number not in data["ladderExhausted"]:
            data["ladderExhausted"].append(number)
    attempts[str(number)] = {**record, "escalated": True}
    pr_events.add_label(number, pr_events.EXHAUSTED, sh)
    prefix = ["fix-exhausted"] if record.get("count", 0) else []
    update_json(held_path(host), lambda held, number=number, head=head, prefix=prefix: held.update(
        {str(number): pr_events.held_record(head, [*prefix, *held.get(str(number), {}).get("evidence", [])])}))
    if remediation.notify_tim() and linear is not None and hasattr(linear, "comment"):
        try:
            issue = owning_issue(linear, pr)
            if issue:
                linear.comment(issue["id"],
                               f"needs-human `{remediation.NEEDS_HUMAN_LABEL_ID}`: #{number} {classified['cls']}. "
                               + remediation.surface_body(pr, classified, reason))
        except Exception:
            pass
    try:
        apply_terminal_disposition(linear, pr, record, reason if reason != "ladder-exhausted" else "fix-exhausted")
    except Exception:
        pass
    if number in data["escalating"]:
        data["escalating"] = [item for item in data["escalating"] if item != number]


def escalate_exhausted(host: Host, prs: list[dict], linear) -> None:
    """Deterministic rungs, then a stronger lane, then one surface (JOV-7540 / JOV-7089).

    Default off (`LANES_ESCALATION_STUCK_PRS`). Stuck-PR detection is
    remediation-sweep, which files `remediation:pr-<n>-hold` and
    `remediation:pr-<n>-conflict` (lane-fix-exhausted). Those are ordinary
    labeled events. When the flag is on, `LANES_ESCALATION` unset stays on
    and off restores the immediate terminal disposition. A model rung records
    `pendingEscalation` and does not increment `count`.
    """
    if not remediation.stuck_pr_escalation_enabled():
        return
    path = host.state / "fix-attempts.json"
    attempts = json.loads(path.read_text()) if path.exists() else {}
    held = json.loads(held_path(host).read_text()) if held_path(host).exists() else {}
    providers = load_providers()
    cooled = {name for name in providers if cooling(host, name)}
    data = load_escalation(host)
    now = time.time()

    def healthy(_name, spec):
        return provider_healthy(spec)

    for pr in exhausted_prs(prs, attempts, held):
        record = dict(attempts.get(str(pr["number"]), {}))
        classified = remediation.classify_blocker(pr, held.get(str(pr["number"])), record)
        _remember_class(data, pr, classified)
        if not remediation.escalation_enabled():
            _legacy_terminal(host, pr, record, held, linear, attempts)
            continue
        plan = remediation.plan_ladder(classified, record, providers, now, pr["headRefOid"],
                                       healthy=healthy, cooled=cooled)
        if plan["action"] == "update-branch":
            outcome = pr_events.sync_main(host, THIS, pr, now)
            record = remediation.append_rung(record, rung="update-branch", lane=None, cls=classified["cls"],
                                             at=now, head=pr["headRefOid"], kind="deterministic",
                                             ok=outcome == "synced")
            attempts[str(pr["number"])] = record
            pr_events.add_label(pr["number"], "escalating", sh)
            if pr["number"] not in data["escalating"]:
                data["escalating"].append(pr["number"])
            if outcome != "synced":
                plan = remediation.plan_ladder(classified, record, providers, now, pr["headRefOid"],
                                               healthy=healthy, cooled=cooled)
            else:
                plan = {"action": "wait"}
        if plan.get("action") == "rerun":
            rerun = _rerun_failed(pr)
            record = remediation.append_rung(record, rung="rerun", lane=None, cls=classified["cls"],
                                             at=now, head=pr["headRefOid"], kind="deterministic",
                                             ok=bool(rerun))
            attempts[str(pr["number"])] = record
            if not rerun:
                plan = remediation.plan_ladder(classified, record, providers, now, pr["headRefOid"],
                                               healthy=healthy, cooled=cooled)
            else:
                plan = {"action": "wait"}
        if plan.get("action") == "resolve-lockfile":
            record = remediation.append_rung(record, rung="lockfile", lane=None, cls=classified["cls"],
                                             at=now, head=pr["headRefOid"], kind="deterministic", ok=None)
            record["pendingEscalation"] = {"lane": None, "cls": classified["cls"], "head": pr["headRefOid"],
                                           "rung": "lockfile", "at": now}
            attempts[str(pr["number"])] = record
            plan = {"action": "wait"}
        if plan.get("action") == "model":
            pack = remediation.dossier(pr, classified, record)
            record["pendingEscalation"] = {"lane": plan["lane"], "cls": classified["cls"],
                                           "subtype": classified.get("subtype"), "head": pr["headRefOid"],
                                           "topRung": plan.get("topRung"), "at": now, "dossier": pack}
            attempts[str(pr["number"])] = record
            pr_events.add_label(pr["number"], "escalating", sh)
            if pr["number"] not in data["escalating"]:
                data["escalating"].append(pr["number"])
            data["routedByLane"][plan["lane"]] = int(data["routedByLane"].get(plan["lane"]) or 0) + 1
        elif plan.get("action") == "surface":
            _surface_exhausted(host, pr, record, classified, plan.get("reason") or classified["cls"],
                               linear, attempts, data)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(attempts))
    save_escalation(host, data)


def _legacy_terminal(host: Host, pr: dict, record: dict, held: dict, linear, attempts: dict) -> None:
    """Kill switch: immediate terminal disposition, the pre-ladder behavior."""
    if record.get("count", 0):
        reason = "fix-exhausted"
        body = (f"🤖 lanes: {MAX_FIX_ATTEMPTS} fix attempts on head `{pr['headRefOid'][:7]}` did not make this PR green "
                f"(merge state {pr.get('mergeStateStatus')}, review {pr.get('reviewDecision') or 'none'}). "
                "Terminal disposition on the owning issue (needs human decision); the lanes stop here. "
                "Re-entry needs a new head, a cleared dependency, or a policy override (JOV-7089).")
    else:
        reason = (held.get(str(pr["number"])) or {}).get("reason") or "unfixable"
        body = (f"🤖 lanes: the gate held head `{pr['headRefOid'][:7]}` for a reason no code push can clear "
                f"(`{reason}`; merge state {pr.get('mergeStateStatus')}). "
                "Terminal disposition on the owning issue (needs human decision); the lanes stop here.")
    sh(["gh", "pr", "comment", str(pr["number"]), "--repo", REPO_SLUG, "--body", body])
    attempts[str(pr["number"])] = {**record, "escalated": True}
    pr_events.add_label(pr["number"], pr_events.EXHAUSTED, sh)
    prefix = ["fix-exhausted"] if record.get("count", 0) else []
    number, head = pr["number"], pr["headRefOid"]
    update_json(held_path(host), lambda held_rows, number=number, head=head, prefix=prefix: held_rows.update(
        {str(number): pr_events.held_record(head, [*prefix, *held_rows.get(str(number), {}).get("evidence", [])])}))
    try:
        apply_terminal_disposition(linear, pr, record, reason)
    except Exception:
        pass


def _rerun_failed(pr: dict):
    for check in pr.get("statusCheckRollup") or []:
        if check.get("conclusion") not in RED:
            continue
        found = re.search(r"/runs/(\d+)", check.get("detailsUrl") or "")
        if not found:
            continue
        result = sh(["gh", "run", "rerun", found.group(1), "--failed", "--repo", REPO_SLUG])
        return result.returncode == 0
    return False


def arm_ready_prs(host: Host, prs: list[dict]) -> None:
    """Select green rearming intent; the shared terminal consumer owns publication."""
    if not prs or not remediation.escalation_enabled():
        return
    path = host.state / "fix-attempts.json"
    attempts = json.loads(path.read_text()) if path.exists() else {}
    held = json.loads(held_path(host).read_text()) if held_path(host).exists() else {}
    for pr in prs:
        record = attempts.get(str(pr.get("number")), {})
        classified = remediation.classify_blocker(pr, held.get(str(pr.get("number"))), record)
        if classified.get("next_action") != "arm":
            continue
        # A cached ready classification cannot retire preservation signals or replace
        # exact-head proof, owner, source-policy and native queue-history authority.
        publish_verified(host, pr)


def fetch_labeled_events(linear) -> list:
    """One complete bounded inventory per cache fill; never plan from a truncated page.

    JOV and LYB issues labeled `remediation:<fingerprint>` come back together.
    Callers must not issue a follow-up read per issue.
    """
    def fetch():
        rows, ids, cursors, after = [], set(), set(), None
        for _ in range(remediation.EVENT_INVENTORY_PAGES):
            data = linear.gql(remediation.LABELED_EVENT_QUERY, {"after": after})
            edge = data.get("issues")
            if not isinstance(edge, dict) or not isinstance(edge.get("nodes"), list):
                raise RuntimeError("remediation-inventory-unreadable")
            for row in edge["nodes"]:
                if not isinstance(row, dict) or not row.get("id"):
                    raise RuntimeError("remediation-inventory-malformed")
                if row["id"] not in ids:
                    rows.append(row)
                    ids.add(row["id"])
            page = edge.get("pageInfo")
            if not isinstance(page, dict) or not isinstance(page.get("hasNextPage"), bool):
                raise RuntimeError("remediation-inventory-coverage-unknown")
            if not page["hasNextPage"]:
                return rows
            after = page.get("endCursor")
            if not isinstance(after, str) or not after or after in cursors:
                raise RuntimeError("remediation-inventory-cursor-invalid")
            cursors.add(after)
        raise RuntimeError("remediation-inventory-page-limit")

    # New cache namespace fences old first-page-only receipts after source installation.
    return shared("remediation-events-v2", SUMMARY_TTL_S, fetch) or []


EVENT_DELIVERY_SCHEMA = "jovie.event-delivery/v1"
EVENT_DELIVERY_ATTEMPTS = 3
EVENT_DELIVERY_STALE_S = 3600


def _event_digest(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _event_delivery_state(host: Host) -> dict:
    path = host.state / "event-delivery.json"
    if not path.exists():
        return {"schema": EVENT_DELIVERY_SCHEMA, "actions": {}}
    data = json.loads(path.read_text())
    if not isinstance(data, dict) or data.get("schema") != EVENT_DELIVERY_SCHEMA or not isinstance(data.get("actions"), dict):
        raise RuntimeError("event-delivery-journal-unreadable")
    for key, row in data["actions"].items():
        if not isinstance(row, dict) or row.get("key") != key or row.get("kind") not in {"comments", "reopens", "labels"}:
            raise RuntimeError("event-delivery-journal-unreadable")
    return data


def _save_event_json(host: Host, filename: str, data: dict) -> None:
    # Intent and terminal readback survive a controller restart. A failed write
    # leaves the prior journal intact and prevents the external mutation.
    import tempfile
    host.state.mkdir(parents=True, exist_ok=True)
    path = host.state / filename
    fd, name = tempfile.mkstemp(prefix=".event-delivery-", dir=host.state)
    try:
        with os.fdopen(fd, "w") as handle:
            json.dump(data, handle, sort_keys=True)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(name, path)
        directory = os.open(host.state, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def _save_event_delivery(host: Host, data: dict) -> None:
    _save_event_json(host, "event-delivery.json", data)


def _event_escalation(host: Host) -> dict:
    path = host.state / "escalation.json"
    if not path.exists():
        return load_escalation(host)
    data = json.loads(path.read_text())
    if not isinstance(data, dict) or not isinstance(data.get("events", {}), dict):
        raise RuntimeError("event-escalation-unreadable")
    return data


def _recover_event_preparation(host: Host, journal: dict) -> None:
    """Finish the paired local commit before replanning; never renew attempts.

    The durable journal is the write-ahead record for escalation.json. Each
    row has its original preimage and exact prepared postimage. A concurrent
    worker owns its whole changed row; recovery never overwrites that winner.
    Caller holds event-delivery.lock and this function takes claim.lock.
    """
    prepared = journal.get("prepared")
    if prepared is None:
        return
    if not isinstance(prepared, dict) or not isinstance(prepared.get("rows"), dict):
        raise RuntimeError("event-delivery-preparation-unreadable")
    lock = Locked(host.state / "claim.lock", blocking=True)
    try:
        current = _event_escalation(host)
        events = current.setdefault("events", {})
        conflicts = []
        for fingerprint, pair in prepared["rows"].items():
            if not isinstance(pair, dict) or "before" not in pair or not isinstance(pair.get("after"), dict):
                raise RuntimeError("event-delivery-preparation-unreadable")
            existing = events.get(fingerprint)
            if existing == pair["before"]:
                events[fingerprint] = pair["after"]
            elif existing != pair["after"]:
                conflicts.append(fingerprint)
        _save_event_json(host, "escalation.json", current)
        # Unsigned local preparation is never remote ownership. Only intents
        # whose exact postimage survived are eligible for external delivery.
        for action in journal["actions"].values():
            if action["fingerprint"] in conflicts and action["status"] not in {"acknowledged", "superseded"}:
                action["status"] = "superseded"
                action["history"].append({"at": time.time(), "outcome": "prepared-owner-changed"})
        journal.setdefault("commits", []).append({"id": prepared["id"], "at": time.time(),
                                                  "outcome": "committed", "conflicts": conflicts})
        journal.pop("prepared")
        _save_event_delivery(host, journal)
    finally:
        lock.release()


def _queue_event_delivery(data: dict, plan: dict, issues: list, accepted: set[str], now: float) -> None:
    snapshots = {issue["id"]: issue for issue in issues}
    for kind in ("reopens", "comments", "labels"):
        for payload in plan.get(kind) or []:
            target = payload.get("id")
            owners = [fp for fp, row in plan["events"].items()
                      if row.get("issueId") == target or f"fp={fp} -->" in payload.get("body", "")]
            if len(owners) != 1 or owners[0] not in accepted:
                continue  # A concurrently changed event owns its entire row.
            fp = owners[0]
            event = plan["events"][fp]
            issue = snapshots.get(target) or {}
            intent = {"kind": kind, "payload": payload, "fingerprint": fp,
                      "ownerIssueId": event.get("issueId"),
                      "generation": sorted(event.get("noted") or [])}
            key = _event_digest(intent)
            if key not in data["actions"]:
                data["actions"][key] = {**intent, "key": key, "createdAt": now, "nextAt": now,
                    "expectedState": (issue.get("state") or {}).get("name"),
                    "deadline": now + EVENT_DELIVERY_STALE_S, "attempts": 0, "status": "pending",
                    "expectedEvent": _event_digest(event), "history": [],
                    "commentId": str(uuid.uuid5(uuid.NAMESPACE_URL, "jovie-event:" + key))}


def _event_delivery_readback(linear, row: dict) -> tuple[bool, dict]:
    payload = row["payload"]
    if row["kind"] == "comments":
        try:
            result = linear.gql('query($id:String!){comment(id:$id){id body issue{id}}}', {"id": row["commentId"]})
        except RuntimeError as error:
            # Linear reports a missing comment as a GraphQL error rather than
            # `{comment: null}`. This is the expected preimage before attempt 1;
            # every other read failure remains unknown and fails closed.
            if str(error) == "linear: Entity not found: Comment":
                return False, {"commentId": row["commentId"]}
            raise
        if not isinstance(result, dict) or "comment" not in result:
            raise RuntimeError("event-comment-readback-unreadable")
        comment = result["comment"]
        if comment is None:
            return False, {"commentId": row["commentId"]}
        if comment.get("body") != payload.get("body") or (comment.get("issue") or {}).get("id") != payload["id"]:
            raise RuntimeError("event-comment-readback-mismatch")
        return True, {"commentId": comment["id"], "issueId": payload["id"]}
    result = linear.gql('query($id:String!){issue(id:$id){id state{id name} labels{nodes{id}}}}', {"id": payload["id"]})
    issue = result.get("issue") if isinstance(result, dict) else None
    if not isinstance(issue, dict) or issue.get("id") != payload["id"] or not isinstance(issue.get("state"), dict):
        raise RuntimeError("event-issue-readback-unreadable")
    if row["kind"] == "reopens":
        done = issue["state"].get("id") == payload["stateId"]
        # Never downgrade a newly claimed/active issue on a stale reopen plan.
        if not done and issue["state"].get("name") != row["expectedState"]:
            raise RuntimeError("event-state-preimage-changed")
        return done, {"issueId": issue["id"], "stateId": issue["state"].get("id")}
    nodes = (issue.get("labels") or {}).get("nodes")
    if not isinstance(nodes, list):
        raise RuntimeError("event-label-readback-unreadable")
    return any(label.get("id") == payload["labelId"] for label in nodes), {"issueId": issue["id"], "labelId": payload["labelId"]}


def _event_delivery_report(data: dict, now: float) -> dict:
    active = [row for row in data["actions"].values()
              if row["status"] not in {"acknowledged", "superseded"}]
    return {"deliveryPending": len(active),
            "deliveryFailed": sum(row["status"] in {"failed", "exhausted", "sending"} for row in active),
            "deliveryExhausted": sum(row["status"] == "exhausted" for row in active),
            "deliveryAcknowledged": sum(row["status"] == "acknowledged" for row in data["actions"].values()),
            "deliveryObservedAt": now,
            "deliveryNextAt": min((row["nextAt"] for row in active), default=None)}


def _event_delivery_snapshot(host: Host, now: float) -> dict:
    """Report durable action state when the wider remediation pass fails."""
    report = _event_delivery_report(_event_delivery_state(host), now)
    starts = [row.get("startDelivery") or {}
              for row in (_event_escalation(host).get("events") or {}).values()
              if isinstance(row, dict)]
    report["deliveryFailed"] += sum(row.get("status") in {"failed", "sending"} for row in starts)
    return report


def _apply_event_plan(linear, plan: dict, host: Host, data: dict, now: float) -> dict:
    """Drain one durable intent per tick under the existing delivery/claim locks.

    Transport attempts are separate from model attempts; none are refunded or
    reset. An uncertain send is read back by its stable remote ID before retry.
    The caller holds event-delivery.lock; claim.lock only covers the write fence.
    """
    for row in sorted(data["actions"].values(), key=lambda row: (
            row["createdAt"], ("reopens", "comments", "labels").index(row["kind"]), row["key"])):
        if row["status"] in {"acknowledged", "superseded"} or now < row["nextAt"]:
            continue
        try:
            acknowledged, receipt = _event_delivery_readback(linear, row)
            if not acknowledged and row["attempts"] < EVENT_DELIVERY_ATTEMPTS and now < row["deadline"]:
                lock = Locked(host.state / "claim.lock", blocking=True)
                try:
                    owner = (_event_escalation(host).get("events") or {}).get(row["fingerprint"]) or {}
                    if owner.get("issueId") != row["ownerIssueId"]:
                        row["status"] = "superseded"
                        row["history"].append({"at": now, "outcome": "owner-changed"})
                        _save_event_delivery(host, data)
                        break
                    if _event_digest(owner) != row["expectedEvent"]:
                        raise RuntimeError("event-owner-preimage-changed")
                    # The remote preimage is refreshed INSIDE the mutation fence.
                    # A state changed since the earlier read is never downgraded.
                    if row["kind"] == "reopens":
                        acknowledged, receipt = _event_delivery_readback(linear, row)
                        if acknowledged:
                            row.update(status="acknowledged", acknowledgedAt=now, receipt=receipt)
                            row["history"].append({"at": now, "outcome": "authoritative-readback"})
                            _save_event_delivery(host, data)
                            break
                    row["attempts"] += 1
                    row["status"] = "sending"
                    row["history"].append({"at": now, "outcome": "intent-persisted", "attempt": row["attempts"]})
                    _save_event_delivery(host, data)
                    payload = row["payload"]
                    if row["kind"] == "comments":
                        result = linear.gql('mutation($i:CommentCreateInput!){commentCreate(input:$i){success}}',
                            {"i": {"id": row["commentId"], "issueId": payload["id"], "body": payload["body"]}})
                        field = "commentCreate"
                    elif row["kind"] == "reopens":
                        result = linear.gql('mutation($id:String!,$s:String!){issueUpdate(id:$id,input:{stateId:$s}){success}}',
                            {"id": payload["id"], "s": payload["stateId"]})
                        field = "issueUpdate"
                    else:
                        result = linear.gql('mutation($id:String!,$l:String!){issueAddLabel(id:$id,labelId:$l){success}}',
                            {"id": payload["id"], "l": payload["labelId"]})
                        field = "issueAddLabel"
                    if not isinstance(result, dict) or not isinstance(result.get(field), dict) or result[field].get("success") is not True:
                        raise RuntimeError("event-mutation-rejected")
                finally:
                    lock.release()
                acknowledged, receipt = _event_delivery_readback(linear, row)
            if acknowledged:
                row.update(status="acknowledged", acknowledgedAt=now, receipt=receipt)
                row["history"].append({"at": now, "outcome": "authoritative-readback"})
            else:
                raise RuntimeError("event-delivery-unacknowledged")
        except Exception as error:
            # No provider response/credential content in controller health output.
            row["error"] = str(error) if isinstance(error, RuntimeError) and str(error).startswith("event-") else type(error).__name__
            row["status"] = "exhausted" if row["attempts"] >= EVENT_DELIVERY_ATTEMPTS or now >= row["deadline"] else "failed"
            row["history"].append({"at": now, "outcome": row["status"], "error": row["error"]})
        row["nextAt"] = now + (60 if row["attempts"] < 2 else 300)
        _save_event_delivery(host, data)
        break  # Bounded work; a transport outage must not monopolize dispatch.
    return _event_delivery_report(data, now)


def claim_remediation_events(host: Host, linear) -> dict:
    """Claim every labeled remediation event. One cached read, then local planning."""
    issues = fetch_labeled_events(linear)
    providers = load_providers()
    cooled = {name for name in providers if cooling(host, name)}

    def healthy(_name, spec):
        return provider_healthy(spec)

    delivery_lock = Locked(host.state / "event-delivery.lock", blocking=False)
    if not delivery_lock.held:
        delivery_lock.release()
        return {"deliveryBusy": True}
    try:
        journal = _event_delivery_state(host)  # Fail closed before changing event rows.
        _recover_event_preparation(host, journal)
        data = _event_escalation(host)
        baseline = json.loads(json.dumps(data.get("events") or {}))
        plan = remediation.plan_labeled_events(issues, data.get("events") or {}, providers, time.time(),
                                               healthy=healthy, cooled=cooled)
        lock = Locked(host.state / "claim.lock", blocking=True)
        try:
            current = _event_escalation(host)
            previous = current.get("events") or {}
            merged = dict(previous)
            accepted = set()
            pairs = {}
            for fingerprint, row in plan["events"].items():
                if previous.get(fingerprint) == baseline.get(fingerprint):
                    merged[fingerprint] = row
                    accepted.add(fingerprint)
                    pairs[fingerprint] = {"before": previous.get(fingerprint), "after": row}
            _queue_event_delivery(journal, plan, issues, accepted, time.time())
            # Pair the original plan (including attempt timestamps) with its
            # actions before either file can expose a new owner generation.
            journal["prepared"] = {"id": _event_digest(pairs), "rows": pairs}
            _save_event_delivery(host, journal)
            current["events"] = merged
            _save_event_json(host, "escalation.json", current)
            journal.setdefault("commits", []).append({"id": journal["prepared"]["id"], "at": time.time(),
                                                      "outcome": "committed", "conflicts": []})
            journal.pop("prepared")
            _save_event_delivery(host, journal)
            plan["events"] = merged
        finally:
            lock.release()
        delivery = _apply_event_plan(linear, plan, host, journal, time.time())
    finally:
        delivery_lock.release()
    summary = remediation.events_summary({"events": plan["events"]})
    starts = [row.get("startDelivery") or {} for row in plan["events"].values()]
    delivery["deliveryFailed"] += sum(row.get("status") in {"failed", "sending"} for row in starts)
    return {"eventsOpen": summary["eventsOpen"], "eventsClaimed": summary["eventsClaimed"],
            "eventsHuman": summary["eventsHuman"], "eventsExhausted": summary["eventsExhausted"], **delivery}


def claim_labeled_event(host: Host, name: str, linear) -> Issue | None:
    """Under claim.lock: admit one event only after its remote start is acknowledged."""
    data = _event_escalation(host)
    events = data.get("events") or {}
    now = time.time()
    held_back = held_back_issues(host, now)
    for row in events.values():
        if not isinstance(row, dict):
            continue
        if row.get("status") != "claimed" or row.get("lane") != name or row.get("running"):
            continue
        if row.get("identifier") in held_back:
            continue
        if not row.get("issueId"):
            continue
        deliveries = _event_delivery_state(host)["actions"].values()
        if any(action["kind"] == "reopens" and action["ownerIssueId"] == row["issueId"]
               and action["status"] not in {"acknowledged", "superseded"} for action in deliveries):
            continue  # A planned reopen is not an accepted remote issue state.
        started = row.get("startedStateId")
        if started:
            delivery = row.setdefault("startDelivery", {"attempts": 0, "status": "pending", "nextAt": now,
                                                        "deadline": now + EVENT_DELIVERY_STALE_S})
            if now < delivery.get("nextAt", 0):
                continue
            try:
                query = 'query($id:String!){issue(id:$id){id state{id name}}}'
                remote = linear.gql(query, {"id": row["issueId"]})
                state = (remote.get("issue") or {}).get("state") if isinstance(remote, dict) else None
                if not isinstance(state, dict):
                    raise RuntimeError("event-start-readback-unreadable")
                correlation = _event_digest({"issueId": row["issueId"], "startedStateId": started,
                                             "owner": HOST, "generation": row.get("attempts") or []})
                receipt = delivery.get("mutationReceipt") or {}
                if state.get("id") == started and receipt != {"correlation": correlation, "success": True}:
                    # A rejected/ambiguous intent never proves this host owns
                    # another host's start. Preserve it for owned recovery.
                    raise RuntimeError("event-start-ownership-unproven")
                if state.get("id") != started:
                    # Fresh contradictory state invalidates every earlier
                    # success before any retry can be sent or adopted.
                    delivery.pop("mutationReceipt", None)
                    _save_event_json(host, "escalation.json", data)
                    if state.get("name") != "Todo":
                        raise RuntimeError("event-start-preimage-changed")
                    if delivery["attempts"] >= EVENT_DELIVERY_ATTEMPTS or now >= delivery["deadline"]:
                        raise RuntimeError("event-start-cap-exhausted")
                    delivery.update(status="sending", attempts=delivery["attempts"] + 1)
                    _save_event_json(host, "escalation.json", data)
                    result = linear.gql('mutation($id:String!,$s:String!){issueUpdate(id:$id,input:{stateId:$s}){success}}',
                               {"id": row["issueId"], "s": started})
                    if not isinstance(result, dict) or (result.get("issueUpdate") or {}).get("success") is not True:
                        raise RuntimeError("event-start-mutation-rejected")
                    delivery["mutationReceipt"] = {"correlation": correlation, "success": True}
                    _save_event_json(host, "escalation.json", data)
                    remote = linear.gql(query, {"id": row["issueId"]})
                    observed_state = (remote.get("issue") or {}).get("state")
                    if not isinstance(observed_state, dict):
                        raise RuntimeError("event-start-readback-unreadable")
                    if observed_state.get("id") != started:
                        delivery.pop("mutationReceipt", None)
                        _save_event_json(host, "escalation.json", data)
                        raise RuntimeError("event-start-unacknowledged")
                delivery.update(status="acknowledged", acknowledgedAt=now)
            except Exception as error:
                delivery.update(status="failed", error=str(error) if isinstance(error, RuntimeError) and str(error).startswith("event-") else type(error).__name__,
                                nextAt=now + 60)
                _save_event_json(host, "escalation.json", data)
                continue  # No model invocation or local running claim from intent alone.
        else:
            continue  # Missing start-state evidence cannot admit a model repair.
        row["running"] = True
        row["claimedAt"] = now
        row["release"] = False
        _save_event_json(host, "escalation.json", data)
        description = row.get("description") or ""
        dossier = row.get("dossier") or ""
        if dossier:
            description = dossier + "\n\n" + description
        return Issue(row["issueId"], row.get("identifier") or row["issueId"], row.get("title") or "",
                     description, 2, now_iso(), list(row.get("labels") or []))
    return None


def note_event_outcome(host: Host, issue, verdict: str) -> None:
    """Hand a labeled event back to the ladder after the lane run, without a Linear read."""
    if issue is None or not getattr(issue, "id", None):
        return
    data = load_escalation(host)
    events = data.get("events") or {}
    changed = False
    for row in events.values():
        if not isinstance(row, dict) or row.get("issueId") != issue.id:
            continue
        row["running"] = False
        if verdict == "provider-error":
            row["lane"] = None
            row["release"] = True
            row["status"] = "claimed"
        elif verdict in {"landing", "verified-not-queued"}:
            row["status"] = "done"
            row["release"] = False
        elif verdict in {"not-shippable", "quarantined"}:
            row["status"] = "exhausted"
            row["lane"] = None
            row["release"] = False
        changed = True
    if changed:
        save_escalation(host, data)


def claim_escalation_pr(host: Host, name: str, prs: list[dict]) -> dict | None:
    """Under claim.lock: validate a pending model rung before charging its separate budget."""
    path = host.state / "fix-attempts.json"
    try:
        attempts = json.loads(path.read_text())
        held = json.loads(held_path(host).read_text()) if held_path(host).exists() else {}
        if not isinstance(attempts, dict) or not isinstance(held, dict):
            return None
    except (OSError, ValueError):
        return None
    providers = load_providers()
    disabled = set(providers) - set(pr_events.cost_order(providers))
    for key, record in attempts.items():
        if not isinstance(record, dict):
            continue
        if type(record.get("count", 0)) is not int or record.get("count", 0) < 0 \
                or any(field in record and (not isinstance(record[field], list)
                       or any(not isinstance(row, dict) for row in record[field]))
                       for field in ("escalations", "priorEscalations")):
            continue  # Malformed accounting is not permission to reinterpret spent history.
        pending = record.get("pendingEscalation") or {}
        if not isinstance(pending, dict) or pending.get("lane") != name \
                or not isinstance(pending.get("dossier"), str) or not pending["dossier"].strip():
            continue
        pr = next((item for item in prs if str(item.get("number")) == str(key)), None)
        entry = held.get(key, {})
        if pr is None or pending.get("head") not in (None, pr.get("headRefOid")) \
                or not pr.get("headRefOid") or not pr.get("headRefName") \
                or pr.get("isInMergeQueue") is True or not isinstance(entry, dict):
            continue
        if claimed_elsewhere(pr["number"], pr["headRefOid"], "fix", timeout=30):
            continue
        try:
            live = require_fix_target(pr, "before-escalation-claim", repair=True)
        except RepairStopped:
            continue
        owned = LANE_BRANCH.match(live.get("headRefName", ""))
        if live.get("headRefName") != pr["headRefName"] or live.get("isCrossRepository") is not False \
                or (live.get("isDraft") and not (owned and owned.group("lane") in {name, *disabled})):
            continue
        holds = {label.lower() for label in pr_events.label_names(live)} & pr_events.HOLD_LABELS
        prior_holds = {label.lower() for label in pr_events.label_names(pr)} & pr_events.HOLD_LABELS
        # Exhaustion has its own authorized rung, but does not erase a stronger
        # same-head hold (including legacy rows lacking normalized reason fields).
        evidence = entry.get("evidence") or []
        if not isinstance(evidence, list) or (entry.get("reason") is not None and not isinstance(entry["reason"], str)):
            continue
        evidence = [line for line in evidence if not str(line).startswith("fix-exhausted")]
        reason = entry.get("reason")
        if not reason or reason == "fix-exhausted":
            reason = pr_events.held_reason(evidence)[0]
        policy_entry = {**entry, "evidence": evidence, "reason": reason}
        action = next((action for _, code, action in pr_events.HELD_REASONS if code == reason), None)
        if not pr_events.fixable_hold(policy_entry, live["headRefOid"]) \
                or (entry.get("sha") == live["headRefOid"] and action and action not in pr_events.FIXABLE_ACTIONS):
            continue
        classified = remediation.classify_blocker(live, policy_entry, record)
        if classified["cls"] not in {"fixable-by-model", "needs-rebase", "flaky-infra"} \
                or classified.get("subtype") == "main-red" \
                or pending.get("cls") != classified["cls"] or pending.get("subtype") != classified.get("subtype"):
            continue
        # Preserve the canonical prescribed-fix exception, never extending it to a
        # new hold or altered prescription. Auxiliary holdNote is still cached.
        if holds and (holds != prior_holds or pending.get("subtype") != "human-hold"
                      or classified.get("subtype") != "human-hold"
                      or live.get("holdNote") != pr.get("holdNote")):
            continue
        now = time.time()

        def charge(current):
            fresh_held = json.loads(held_path(host).read_text()) if held_path(host).exists() else {}
            if not isinstance(current, dict) or current.get(key) != record \
                    or not isinstance(fresh_held, dict) or fresh_held.get(key, {}) != entry \
                    or pr_events.in_flight(record, {"headRefOid": record.get("sha")}, time.time()) \
                    or publication_revocation(host, live["headRefName"]):
                raise RepairStopped("escalation-claim-changed", live, "before-escalation-charge")
            updated = remediation.append_rung(record, rung="top-rung" if pending.get("topRung") else "escalate",
                                              lane=name, cls=pending.get("cls") or "fixable-by-model", at=now,
                                              head=live["headRefOid"], kind="model", top_rung=bool(pending.get("topRung")))
            updated.pop("pendingEscalation", None)
            current[key] = updated

        charged = False

        def summarize(data):
            nonlocal charged
            if not isinstance(data, dict) or not isinstance(data.get("attempts", []), list):
                raise RepairStopped("escalation-summary-unavailable", live, "before-escalation-charge")
            update_json(path, charge)
            charged = True
            data.setdefault("attempts", []).append({"pr": live["number"], "at": now, "lane": name})

        try:
            update_json(host.state / "escalation.json", summarize)
        except (OSError, ValueError, TypeError, RepairStopped):
            if charged:
                raise  # Durable charge plus failed summary: stop this scan; never refund/reset.
            continue
        post_claim(live["number"], live["headRefOid"], "fix")
        return {**live, "dossier": pending["dossier"],
                "liftHold": pending.get("subtype") == "human-hold"}
    return None


def failure_excerpt(pr: dict, limit: int = 6000) -> str:
    """The failing jobs' own error lines, so the fixer works from evidence, not guesses."""
    parts = []
    for check in pr.get("statusCheckRollup") or []:
        found = re.search(r"/job/(\d+)", check.get("detailsUrl") or "")
        if check.get("conclusion") not in RED or not found:
            continue
        log = sh(["gh", "run", "view", "--repo", REPO_SLUG, "--job", found.group(1), "--log-failed"], timeout=120)
        lines = [line.split("\t")[-1] for line in log.stdout.splitlines()
                 if re.search(r"(?i)error|fail|expected|received|missing|✗|×", line)]
        parts.append(f"### {check.get('name')}\n" + "\n".join(lines[-40:]))
    return "\n\n".join(parts)[:limit]


def review_excerpt(pr: dict, limit: int = 4000) -> str:
    """The reviewers' own words, so the fixer addresses what was asked, not what it guesses."""
    if pr.get("reviewDecision") != "CHANGES_REQUESTED" and "review" not in pr.get("eventKinds", ()):
        return ""
    listed = sh(["gh", "api", f"repos/{REPO_SLUG}/pulls/{pr['number']}/comments?per_page=50", "--jq",
                 '.[] | "- \\(.path):\\(.line // .original_line // 0) \\(.body | gsub("\\n"; " "))"'])
    reviews = sh(["gh", "api", f"repos/{REPO_SLUG}/pulls/{pr['number']}/reviews?per_page=20", "--jq",
                  '.[] | select(.state == "CHANGES_REQUESTED" or (.state == "COMMENTED" and (.body | length) > 0)) '
                  '| "- review: \\(.body | gsub("\\n"; " "))"'])
    text = "\n".join(part for part in ((reviews.stdout or "").strip(), (listed.stdout or "").strip()) if part)
    return ("Reviewers requested changes:\n" + text)[:limit] if text else "Reviewers requested changes (no comment text readable)."


def render_fix_prompt(pr: dict, excerpt: str) -> str:
    review = review_excerpt(pr) if pr.get("reviewDecision") == "CHANGES_REQUESTED" \
        or "review" in pr.get("eventKinds", ()) else ""
    if review:
        excerpt = review + ("\n\n" + excerpt if excerpt else "")
    if pr.get("gateEvidence"):
        excerpt = "Lane gate (the repo's pre-push-gate) held this PR:\n" + "\n".join(pr["gateEvidence"]) + \
            ("\n\n" + excerpt if excerpt else "")
    if pr.get("mergeStateStatus") == "DIRTY":
        problem = ["This PR conflicts with main. Merge origin/main into the branch and resolve every",
                   "conflict keeping both sides' intent. If both sides added a migration with the same",
                   "number, renumber yours after main's and regenerate its snapshot/journal entry.",
                   "For a pnpm-lock.yaml conflict take main's lockfile and run `pnpm install --lockfile-only`.",
                   "Never hand-merge generated files: take main's generated copy, then run its canonical",
                   "generator (`pnpm ci:topology:write` for workflow topology or",
                   "`pnpm --filter @jovie/web drizzle:generate` for migration metadata).",
                   "Run the related checks after resolving.", ""]
    else:
        problem = []
    if "dequeued" in pr.get("eventKinds", ()):
        problem += ["The merge queue removed this PR (its merge group failed) and will not take the same",
                    "head again. Merge origin/main into the branch, run",
                    "`bash scripts/hooks/pre-push-gate.sh affected`, fix what fails, and push.", ""]
        if pr.get("queueFailure"):
            problem += ["What failed in the merge group:", pr["queueFailure"], ""]
    if "stale" in pr.get("eventKinds", ()):
        problem += ["This draft has had no activity for 48 hours and the lanes now own it. Finish it:",
                    "read its title, body and diff for the intent, resolve what the gate held or what is",
                    "incomplete, make its checks green and push. If it cannot ship, end with NOT-SHIPPABLE.", ""]
    dossier = pr.get("dossier")
    return "\n".join([
        *([dossier, ""] if dossier else []),
        f"# Make PR #{pr['number']} green ({pr.get('title', '')})",
        "",
        f"You are on its branch `{pr['headRefName']}`.",
        "",
        *problem,
        "Failing required checks:" if excerpt else "",
        excerpt or "(no failing check excerpt)",
        "",
        "## Contract",
        "- Fix the root cause on this branch; push to the same branch. Do not open a new PR.",
        f"- Immediately before every install or push, use `gh api graphql` to read PR #{pr['number']} in {REPO_SLUG}:",
        "  request state, headRefOid and isInMergeQueue. The pr view JSON command does not expose queue ownership.",
        "  Continue only while OPEN with isInMergeQueue=false; otherwise stop and preserve local changes, without install or push.",
        "- Repo gates are real requirements (e.g. component-ship-gate needs tests + stories for",
        "  shipped UI components). Never skip, weaken or --no-verify a check.",
        "- If the failure is unrelated to this PR (broken main, infra), change nothing and end with",
        "  `NOT-SHIPPABLE: <reason>`.",
    ])


def resolve_generated_conflict(worktree: Path, branch: str, log, *, guard=lambda: None) -> bool:
    """JOV-6837/JOV-7594: a PR that conflicts with main only in machine-derived files needs
    no model. Merge main, take its copy of each conflicted generated file, run each file's
    canonical regenerator (remediation.GENERATED_RESOLVERS: `pnpm install --lockfile-only`
    for pnpm-lock.yaml, `pnpm ci:topology:write` for workflow-topology.gen.yml), push (no
    force). Any other conflict, or a failed regeneration, aborts and leaves the PR to the
    agent."""
    guard()
    merged = sh(["git", "merge", "--no-edit", "origin/main"], cwd=worktree, log=log)
    if merged.returncode != 0:
        conflicted = set(sh(["git", "diff", "--name-only", "--diff-filter=U"], cwd=worktree).stdout.split())
        if not conflicted or not conflicted <= remediation.GENERATED_RESOLVERS.keys():
            sh(["git", "merge", "--abort"], cwd=worktree, log=log)
            return False
        sh(["git", "checkout", "origin/main", "--", *sorted(conflicted)], cwd=worktree, log=log)
        guard()
        commands = []
        for path in sorted(conflicted):
            command = list(remediation.GENERATED_RESOLVERS[path])
            if command not in commands:
                commands.append(command)
        for command in commands:
            if sh(command, cwd=worktree, timeout=900, log=log).returncode != 0:
                sh(["git", "merge", "--abort"], cwd=worktree, log=log)
                return False
        sh(["git", "add", *sorted(conflicted)], cwd=worktree, log=log)
        if sh(["git", "commit", "--no-edit"], cwd=worktree, log=log).returncode != 0:
            sh(["git", "merge", "--abort"], cwd=worktree, log=log)
            return False
    guard()
    return sh(["git", "push", "-q", "origin", f"HEAD:refs/heads/{branch}"], cwd=worktree, log=log).returncode == 0


REPAIR_AUTHORITY_FIELDS = """number title body state mergedAt headRefName headRefOid url isDraft mergeStateStatus reviewDecision updatedAt
isCrossRepository isInMergeQueue labels(first:100){pageInfo{hasNextPage} nodes{name}}"""
REPAIR_CENSUS_FIELDS = """totalCount checkRunCount statusContextCount
checkRunCountsByState{count state} statusContextCountsByState{count state}"""
REPAIR_TARGET_FIELDS = REPAIR_AUTHORITY_FIELDS + """
commits(last:1){nodes{commit{oid statusCheckRollup{contexts(first:100,after:$cursor){
""" + REPAIR_CENSUS_FIELDS + """
pageInfo{hasNextPage endCursor} nodes{__typename
... on CheckRun{id name status conclusion detailsUrl startedAt completedAt}
... on StatusContext{id context state targetUrl}}}}}}}"""
REPAIR_CHECK_PAGES = 6  # At most 600 contexts; incomplete authority still refuses repair.
REPAIR_TARGET_QUERY = ("query($owner:String!,$name:String!,$number:Int!,$cursor:String){repository(owner:$owner,name:$name){"
                       "pullRequest(number:$number){" + REPAIR_TARGET_FIELDS + "}}}")
REPAIR_CENSUS_QUERY = ("query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){"
                       "pullRequest(number:$number){" + REPAIR_AUTHORITY_FIELDS +
                       " commits(last:1){nodes{commit{oid statusCheckRollup{contexts(first:100){" +
                       REPAIR_CENSUS_FIELDS + "}}}}}}}}")
REPAIR_NEGATIVE_RUN_STATES = {"SUCCESS", "CANCELLED", "NEUTRAL", "SKIPPED", "STALE", "ACTION_REQUIRED"}
REPAIR_RUN_STATES = REPAIR_NEGATIVE_RUN_STATES | RED | {"COMPLETED", "IN_PROGRESS", "PENDING", "QUEUED", "WAITING"}
REPAIR_STATUS_STATES = {"SUCCESS", "ERROR", "FAILURE", "EXPECTED", "PENDING"}


def repair_checks_census(contexts: dict) -> tuple:
    """Canonical count evidence for the entire mutable connection, not just this page."""
    counts = [contexts[key] for key in ("totalCount", "checkRunCount", "statusContextCount")]
    if any(type(count) is not int or count < 0 for count in counts) or sum(counts[1:]) != counts[0]:
        raise ValueError("repair-check-counts-invalid")
    states = []
    for key, total in zip(("checkRunCountsByState", "statusContextCountsByState"), counts[1:]):
        rows = contexts[key]
        if not isinstance(rows, list) or len(rows) > 32:
            raise ValueError("repair-check-state-counts-invalid")
        grouped = {}
        for row in rows:
            name, count = row["state"], row["count"]
            if (not isinstance(name, str) or not name or name in grouped
                    or type(count) is not int or count < 0):
                raise ValueError("repair-check-state-counts-invalid")
            grouped[name] = count
        if sum(grouped.values()) != total:
            raise ValueError("repair-check-state-counts-incomplete")
        states.append({name: count for name, count in grouped.items() if count})
    return (*counts, *states)



def repair_negative_census_snapshot(pr: dict, live: dict) -> tuple:
    """Strict negative predicate evidence; never a detailed PR or execution authority."""
    fields = ("number", "state", "headRefOid", "headRefName", "isInMergeQueue", "isCrossRepository",
              "isDraft", "mergeStateStatus", "reviewDecision", "title", "body", "url", "updatedAt", "labels")
    authority = {key: live[key] for key in fields}
    if (type(live["number"]) is not int or live["number"] != pr["number"] or live["state"] != "OPEN"
            or not isinstance(live["headRefOid"], str) or not re.fullmatch(r"[0-9a-f]{40}", live["headRefOid"])
            or any(live[key] != pr[key] for key in ("headRefOid", "headRefName"))
            or any(not isinstance(live[key], str) or not live[key].strip()
                   for key in ("headRefName", "mergeStateStatus", "updatedAt"))
            or any(type(live[key]) is not bool or live[key]
                   for key in ("isInMergeQueue", "isCrossRepository", "isDraft"))
            or live["reviewDecision"] not in (None, "APPROVED", "CHANGES_REQUESTED", "REVIEW_REQUIRED")
            or any(not isinstance(live[key], str) for key in ("title", "body"))
            or live["url"] != f"https://github.com/{REPO_SLUG}/pull/{pr['number']}"):
        raise ValueError("negative-census-authority-invalid")
    labels = live["labels"]
    names = [row["name"] for row in labels["nodes"]]
    if (labels["pageInfo"]["hasNextPage"] is not False or len(names) > 100
            or any(not isinstance(name, str) or not name.strip() for name in names)
            or len(set(names)) != len(names)):
        raise ValueError("negative-census-labels-incomplete")
    commits = live["commits"]["nodes"]
    if not isinstance(commits, list) or len(commits) != 1 or commits[0]["commit"]["oid"] != live["headRefOid"]:
        raise ValueError("negative-census-commit-mismatch")
    contexts = commits[0]["commit"]["statusCheckRollup"]["contexts"]
    census = repair_checks_census(contexts)
    for key, allowed in (("checkRunCountsByState", REPAIR_RUN_STATES),
                         ("statusContextCountsByState", REPAIR_STATUS_STATES)):
        if any(row["state"] not in allowed for row in contexts[key]):
            raise ValueError("negative-census-state-unknown")
    if (any(state not in REPAIR_NEGATIVE_RUN_STATES for state in census[3])
            or any(state in {"EXPECTED", "PENDING"} for state in census[4])):
        raise ValueError("negative-census-predicate-unproved")
    authority["dependencyMetadataDigest"] = dependency_diff.metadata_digest(live)
    return authority, census


def repair_overflow_diagnostic(pr: dict, live: dict, contexts: dict, started: float) -> dict | None:
    """One no-node recheck of a consistent prefix; stdout, claims and detail authority stay untouched."""
    authority, census = repair_negative_census_snapshot(pr, live)
    info, rows = contexts["pageInfo"], contexts["nodes"]
    if (info.get("hasNextPage") is not True or not isinstance(info.get("endCursor"), str)
            or not info["endCursor"].strip() or not isinstance(rows, list) or len(rows) != 100):
        return None
    seen, groups = set(), ({}, {})
    for row in rows:
        key, kind = row["id"], row["__typename"]
        if not isinstance(key, str) or not key.strip() or key in seen:
            return None
        seen.add(key)
        if kind == "CheckRun":
            if (row["status"] != "COMPLETED" or row["conclusion"] not in REPAIR_NEGATIVE_RUN_STATES
                    or not isinstance(row["name"], str) or not row["name"].strip()):
                return None
            index, state = 0, row["conclusion"]
        elif kind == "StatusContext":
            if (row["state"] not in REPAIR_STATUS_STATES - {"EXPECTED", "PENDING"}
                    or not isinstance(row["context"], str) or not row["context"].strip()):
                return None
            index, state = 1, row["state"]
        else:
            return None
        groups[index][state] = groups[index].get(state, 0) + 1
    if any(sum(group.values()) > census[index + 1] or any(
            count > census[index + 3].get(state, 0) for state, count in group.items())
            for index, group in enumerate(groups)):
        return None
    before = time.monotonic()
    if (any(type(clock) not in (int, float) or not math.isfinite(clock) or clock < 0
            for clock in (started, before)) or not 0 <= before - started <= 30):
        return None
    owner, name = REPO_SLUG.split("/")
    viewed = sh(["gh", "api", "graphql", "-f", f"query={REPAIR_CENSUS_QUERY}",
                 "-f", f"owner={owner}", "-f", f"name={name}", "-F", f"number={pr['number']}"], timeout=30)
    data = json.loads(viewed.stdout) if viewed.returncode == 0 else None
    if not isinstance(data, dict) or data.get("errors"):
        return None
    current = data["data"]["repository"]["pullRequest"]
    if isinstance(current, dict) and current.get("state") in {"MERGED", "CLOSED"}:
        return repair_target_node(pr, current)
    final = time.monotonic()
    if (type(final) not in (int, float) or not math.isfinite(final)
            or not 0 <= final - before or not 0 <= final - started <= 30
            or repair_negative_census_snapshot(pr, current) != (authority, census)):
        return None
    print(json.dumps({"schema": "jovie.repair-check-overflow-negative/v1", "predicateComplete": True,
        "contextsComplete": False, "repairAuthorized": False, "number": pr["number"],
        "headSha": live["headRefOid"], "branch": live["headRefName"], "observedAt": now_iso(),
        "totalCount": census[0], "sampleCount": len(rows),
        "authorityDigest": hashlib.sha256(json.dumps(authority, sort_keys=True).encode()).hexdigest(),
        "census": {"totalCount": census[0], "checkRunCount": census[1], "statusContextCount": census[2],
                   "checkRunCountsByState": census[3], "statusContextCountsByState": census[4]}}),
        file=sys.stderr, flush=True)
    return None


def reconcile_fix_target(pr: dict) -> dict | None:
    """Bounded fresh pages bind complete checks to one unchanged ownership/head snapshot."""
    try:
        owner, name = REPO_SLUG.split("/")
        number = pr["number"]
        if type(number) is not int or number <= 0:
            return None
        started = time.monotonic()
        cursor, cursors, seen, checks, anchor, census = None, set(), set(), [], None, None
        for page in range(REPAIR_CHECK_PAGES):
            args = ["gh", "api", "graphql", "-f", f"query={REPAIR_TARGET_QUERY}",
                    "-f", f"owner={owner}", "-f", f"name={name}", "-F", f"number={number}"]
            if cursor is not None:
                args += ["-f", f"cursor={cursor}"]
            viewed = sh(args, timeout=30)
            data = json.loads(viewed.stdout) if viewed.returncode == 0 else None
            if not isinstance(data, dict) or data.get("errors"):
                return None
            live = data["data"]["repository"]["pullRequest"]
            if isinstance(live, dict) and live.get("state") in {"MERGED", "CLOSED"}:
                return repair_target_node(pr, live)  # Positive terminal evidence still cancels work.
            rollup = live["commits"]["nodes"][0]["commit"]["statusCheckRollup"]
            if rollup is None:
                return repair_target_node(pr, live) if page == 0 else None
            contexts = rollup["contexts"]
            info, rows = contexts["pageInfo"], contexts["nodes"]
            if (type(info.get("hasNextPage")) is not bool or not isinstance(rows, list)
                    or len(rows) > 100 or (page and not rows)):
                return None
            # Validate every page with the normal strict target validator; this
            # temporary page copy never escapes as complete repair authority.
            snapshot = json.loads(json.dumps(live))
            snapshot["commits"]["nodes"][0]["commit"]["statusCheckRollup"]["contexts"]["pageInfo"]["hasNextPage"] = False
            normalized = repair_target_node(pr, snapshot)
            if normalized is None:
                return None
            ownership = {key: normalized[key] for key in
                         ("number", "state", "headRefOid", "headRefName", "isInMergeQueue",
                          "isCrossRepository", "isDraft", "mergeStateStatus", "reviewDecision", "labels")}
            ownership["dependencyMetadataDigest"] = normalized["dependencyMetadataDigest"]
            if anchor is not None and ownership != anchor:
                return None  # Never splice checks across a head, queue, review or hold transition.
            anchor = ownership
            # A truncated/false page flag must not hide an over-budget global census.
            if page == 0 and type(contexts.get("totalCount")) is int and contexts["totalCount"] > 100 * REPAIR_CHECK_PAGES:
                return repair_overflow_diagnostic(pr, live, contexts, started)
            if page or info["hasNextPage"]:
                current_census = repair_checks_census(contexts)
                if current_census[0] > 100 * REPAIR_CHECK_PAGES or (census is not None and current_census != census):
                    return None
                census = current_census
                ids = [row.get("id") for row in rows]
                if (any(not isinstance(key, str) or not key for key in ids)
                        or len(set(ids)) != len(ids) or seen.intersection(ids)):
                    return None
                seen.update(ids)
            checks.extend(rows)
            if not info["hasNextPage"]:
                if census is not None:
                    # Counts catch insertions before an already consumed cursor;
                    # state counts also catch a pending transition on an earlier page.
                    run_states, status_states = {}, {}
                    for check in checks:
                        if check["__typename"] == "CheckRun":
                            state = check.get("conclusion") if check["status"] == "COMPLETED" else check["status"]
                            grouped = run_states
                        else:
                            state, grouped = check["state"], status_states
                        grouped[state] = grouped.get(state, 0) + 1
                    if (len(checks) != census[0] or sum(run_states.values()) != census[1]
                            or sum(status_states.values()) != census[2]
                            or run_states != census[3] or status_states != census[4]):
                        return None
                return {**normalized, "statusCheckRollup": checks}
            cursor = info.get("endCursor")
            if not isinstance(cursor, str) or not cursor or cursor in cursors or not rows:
                return None
            cursors.add(cursor)
        return None
    except (OSError, subprocess.SubprocessError, ValueError, KeyError, IndexError, TypeError, AttributeError):
        return None


def repair_target_node(pr: dict, live) -> dict | None:
    """Normalize one complete current target; missing authority never inherits cached values."""
    try:
        number = pr["number"]
        if type(number) is not int or number <= 0:
            return None
        if (not isinstance(live, dict) or type(live.get("number")) is not int
                or live["number"] != number or live.get("state") not in {"OPEN", "CLOSED", "MERGED"}):
            return None
        # Positive terminal evidence must still cancel work when a deleted branch
        # has no current commit/check connection. It never admits execution.
        if live["state"] != "OPEN":
            return {**pr, **live}
        if (any(not isinstance(live.get(field), str) or not live[field].strip()
                for field in ("headRefOid", "headRefName", "mergeStateStatus"))
                or any(type(live.get(field)) is not bool
                       for field in ("isInMergeQueue", "isCrossRepository", "isDraft"))):
            return None
        if "reviewDecision" not in live or (live["reviewDecision"] is not None
                and not isinstance(live["reviewDecision"], str)):
            return None
        labels = live["labels"]
        if (labels["pageInfo"]["hasNextPage"] is not False or not isinstance(labels["nodes"], list)
                or len(labels["nodes"]) > 100 or any(not isinstance(row, dict)
                   or not isinstance(row.get("name"), str) or not row["name"].strip() for row in labels["nodes"])):
            return None
        commits = live["commits"]["nodes"]
        if not isinstance(commits, list) or len(commits) != 1:
            return None
        commit = commits[0]["commit"]
        if commit["oid"] != live["headRefOid"]:
            return None
        rollup, checks = commit["statusCheckRollup"], []
        if rollup is not None:
            contexts = rollup["contexts"]
            if (contexts["pageInfo"]["hasNextPage"] is not False
                    or not isinstance(contexts["nodes"], list) or len(contexts["nodes"]) > 100):
                return None
            checks = contexts["nodes"]
            for check in checks:
                kind = check["__typename"]
                fields = ("name", "status") if kind == "CheckRun" else ("context", "state")
                if (kind not in {"CheckRun", "StatusContext"}
                        or any(not isinstance(check.get(field), str) or not check[field].strip() for field in fields)
                        or (kind == "CheckRun" and ("conclusion" not in check
                            or (check["conclusion"] is not None and not isinstance(check["conclusion"], str))))):
                    return None
        fresh = {**pr, **live, "labels": labels["nodes"], "statusCheckRollup": checks}
        fresh["dependencyMetadataDigest"] = dependency_diff.metadata_digest(live)
        fresh.pop("commits", None)
        return fresh
    except (OSError, subprocess.SubprocessError, ValueError, KeyError, TypeError, AttributeError):
        return None


def fix_request_source(pr: dict) -> dict:
    """Keep the evidence that requested repair even when its target has become terminal."""
    return {
        "schema": "jovie-fix-request-source/v1",
        "pr": pr["number"],
        "url": pr.get("url"),
        "branch": pr.get("headRefName"),
        "head": pr.get("headRefOid"),
        "eventKinds": list(pr.get("eventKinds") or []),
        "gateEvidence": list(pr.get("gateEvidence") or []),
        "queueFailure": pr.get("queueFailure"),
        "reviewDecision": pr.get("reviewDecision"),
        "checks": [(check.get("name"), check.get("conclusion"))
                   for check in pr.get("statusCheckRollup") or []],
    }


def end_local_fix_attempt(host: Host, pr: dict, receipt: dict) -> None:
    """Release the host-local claim without fabricating an attempt when called directly."""
    def finish(attempts: dict) -> None:
        attempt = attempts.get(str(pr["number"]))
        if not attempt or attempt.get("sha") != pr.get("headRefOid"):
            return
        attempt.update(endedAt=time.time(), pushed=receipt.get("verdict") == "fix-pushed",
                       repairRunId=receipt.get("runId"), repairBranch=receipt.get("branch"),
                       repairHeadBefore=receipt.get("headBefore"), repairVerdict=receipt.get("verdict"))
        if receipt.get("verdict") == "fix-pushed" and receipt.get("headAfter"):
            attempt["pushedHead"] = receipt["headAfter"]
    update_json(host.state / "fix-attempts.json", finish)


class RepairStopped(RuntimeError):
    def __init__(self, reason: str, live: dict | None, stage: str):
        super().__init__(reason)
        self.live, self.stage = live, stage


def repair_created_head(worktree: Path, head: str, *, allow_local_progress: bool = False) -> bool:
    """Only accept a new remote head created in this attempt's fresh checkout.

    A fetch/reset/checkout of another writer's commit is not repair provenance.
    Unreadable or pruned reflogs fail closed and retain the worktree for review.
    """
    try:
        local = sh(["git", "rev-parse", "HEAD"], cwd=worktree, timeout=30)
        if local.returncode != 0:
            return False
        if local.stdout.strip() != head:
            if not allow_local_progress or sh(["git", "merge-base", "--is-ancestor", head, "HEAD"],
                                              cwd=worktree, timeout=30).returncode != 0:
                return False
        log = sh(["git", "reflog", "show", "--format=%H%x00%gs", "HEAD"], cwd=worktree, timeout=30)
    except (OSError, subprocess.SubprocessError):
        return False
    return log.returncode == 0 and any(
        sha == head and re.match(
            r"(?:commit(?: \([^)]*\))?:|merge[^:]*: Merge made by |rebase \((?:pick|reword|squash|fixup|continue)\):|am:)",
            action)
        for line in log.stdout.splitlines() if "\0" in line
        for sha, action in [line.split("\0", 1)])


def require_fix_target(pr: dict, stage: str, *, worktree: Path | None = None, repair: bool = False) -> dict:
    live = reconcile_fix_target(pr)
    if live is None:
        raise RepairStopped("target-state-unavailable", live, stage)
    state = str(live.get("state") or "").upper()
    if state != "OPEN":
        raise RepairStopped("target-pr-merged" if state == "MERGED" else "target-pr-closed", live, stage)
    if repair and live.get("isInMergeQueue") is not False:
        reason = "target-pr-queued" if live.get("isInMergeQueue") is True else "target-queue-unavailable"
        raise RepairStopped(reason, live, stage)
    if live.get("headRefOid") != pr["headRefOid"]:
        if worktree is None or not repair_created_head(worktree, live["headRefOid"],
                                                       allow_local_progress=stage == "agent-running"):
            raise RepairStopped("target-head-superseded", live, stage)
    return live


class RecoveryHandoff(RuntimeError):
    def __init__(self, reason, path, owner=None):
        super().__init__(reason)
        self.evidence = {"schema": "jovie-repair-handoff/v1", "reason": reason,
                         "worktree": str(path), "owner": owner or HOST,
                         "nextAction": "Reconcile the preserved run, target and execution lease before resuming; retain all source."}


def receipt_worktree_paths(prior, path):
    """Malformed ledger paths must become a bounded handoff before hashing."""
    paths = (prior.get("worktree"), prior.get("preservedWorktree"))
    if any(value is not None and (not isinstance(value, str) or not value) for value in paths):
        raise RecoveryHandoff("preserved-ledger-path-invalid", path)
    return paths


def handoff_cooldown_path(host: Host) -> Path:
    return host.state / "handoff-cooldown.json"


def note_recovery_handoff(host: Host, identifier: str, now: float | None = None) -> dict:
    """Count one recovery-handoff for an issue and start its capped exponential cooldown."""
    now = time.time() if now is None else now
    noted: dict = {}

    def bump(data: dict) -> None:
        row = data.get(identifier) if isinstance(data.get(identifier), dict) else {}
        count = int(row.get("count") or 0) + 1
        until = now + min(HANDOFF_BACKOFF_S * 2 ** (count - 1), HANDOFF_BACKOFF_CAP_S)
        data[identifier] = {"count": count, "until": until}
        noted.update(count=count, until=until, comment=count in (1, HANDOFF_COMMENT_AT))
    update_json(handoff_cooldown_path(host), bump)
    return noted


def held_back_issues(host: Host, now: float | None = None) -> frozenset[str]:
    """Issues no lane may claim: an unexpired handoff cooldown, or a preserved worktree that
    names the issue (in its marker, or in its canonical run directory name). run_issue would
    only hand those back, so claiming them burns a slot and a Linear write per loop."""
    now = time.time() if now is None else now
    try:
        cooldowns = json.loads(handoff_cooldown_path(host).read_text())
    except (OSError, ValueError):
        cooldowns = {}
    held = {identifier for identifier, row in (cooldowns if isinstance(cooldowns, dict) else {}).items()
            if isinstance(row, dict) and isinstance(row.get("until"), (int, float)) and row["until"] > now}
    for marker_path in (host.state / "worktrees").glob(f"*/{disk_guard.PRESERVED_REPAIR}"):
        try:
            marker = json.loads(marker_path.read_text())
        except (OSError, ValueError):
            marker = None
        named = marker.get("issue") if isinstance(marker, dict) else None
        run_name = PRESERVED_RUN_NAME.match(marker_path.parent.name)
        if isinstance(named, str) and named:
            held.add(named)
        elif run_name:
            held.add(run_name.group("issue"))
    return frozenset(held)


def preserved_run(host: Host, *, pr=None, issue=None):
    """Recover only from an ended ledger receipt; a marker alone is not ownership."""
    root = host.state / "worktrees"
    try:
        lines = (host.state / "runs/ledger.jsonl").read_text().splitlines()
    except OSError:
        lines = []
    discovery_rows = []
    for line in lines:
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if isinstance(row, dict):
            discovery_rows.append(row)
    matches = []
    for marker_path in root.glob(f"*/{disk_guard.PRESERVED_REPAIR}"):
        try:
            marker = json.loads(marker_path.read_text())
            if not isinstance(marker, dict):
                raise ValueError("marker-not-object")
        except (OSError, ValueError):
            # A damaged marker must not halt every unrelated lane on this host.
            # The ended ledger or canonical run name can identify the target for
            # a refusal, but neither substitutes for a valid recovery marker.
            bound = any(row.get("preservedWorktree") == str(marker_path.parent)
                        and ((pr is not None and row.get("pr") == pr) or (issue and row.get("issue") == issue))
                        for row in discovery_rows)
            run_target = f"-PR{pr}-" if pr is not None else f"-{issue}-"
            if bound or run_target in marker_path.parent.name:
                raise RecoveryHandoff("preserved-marker-unreadable", marker_path.parent)
            print(json.dumps({"schema": "jovie-repair-handoff/v1", "reason": "preserved-marker-unreadable",
                              "worktree": str(marker_path.parent), "owner": HOST,
                              "nextAction": "Reconcile this unidentified marker; source retained."}), file=sys.stderr)
            continue
        direct = (pr is not None and marker.get("pr") == pr) or (issue and marker.get("issue") == issue)
        source_safe = marker.get("pr") is None and marker.get("issue") is None
        prior = next((row for row in reversed(discovery_rows)
                      if row.get("runId") == marker.get("runId")), None)
        target_bound = prior is not None and (
            (pr is not None and prior.get("pr") == pr) or (issue and prior.get("issue") == issue))
        paths = receipt_worktree_paths(prior, marker_path.parent) if prior and (direct or (source_safe and target_bound)) else ()
        # Source-safe cleanup can retain only the run ID; the exact path in its
        # original receipt supplies a candidate, then the normal guards qualify it.
        recovered = (
            source_safe and prior is not None
            and target_bound
            and str(marker_path.parent) in paths
        )
        if direct or recovered:
            matches.append((marker_path.parent, marker))
    if not matches:
        return None
    path, marker = matches[0]
    if len(matches) != 1 or path.resolve().parent != root.resolve():
        raise RecoveryHandoff("ambiguous-preserved-work", path)
    try:
        rows = [json.loads(line) for line in (host.state / "runs/ledger.jsonl").read_text().splitlines()]
        if any(not isinstance(row, dict) for row in rows):
            raise ValueError("ledger-record-not-object")
    except (OSError, ValueError):
        raise RecoveryHandoff("preserved-ledger-unreadable", path)
    prior = next((row for row in reversed(rows) if row.get("runId") == marker.get("runId")), None)
    source_safe = marker.get("pr") is None and marker.get("issue") is None
    paths = receipt_worktree_paths(prior, path) if prior else ()
    bound_paths = paths if source_safe else paths[1:]
    if not prior or not prior.get("endedAt") or str(path) not in bound_paths:
        raise RecoveryHandoff("preserved-owner-not-terminal", path)
    execution = prior.get("execution", {})
    if not isinstance(execution, dict) or execution.get("event") != "attempt_finished" or not all(execution.get(key) for key in
            ("identityDigest", "executionGeneration", "workKey", "fencingToken")):
        raise RecoveryHandoff("preserved-execution-unverified", path)
    if prior.get("verdict") not in {"disk-held", "reconcile-unavailable"}:
        raise RecoveryHandoff("preserved-target-needs-reconciliation", path)
    return path, prior


def qualify_preserved_pr(host: Host, pr: dict, preserved):
    try:
        return _qualify_preserved_pr(host, pr, preserved)
    except (OSError, subprocess.SubprocessError) as error:
        raise RecoveryHandoff(f"preserved-read-unavailable:{type(error).__name__}", preserved[0]) from error


def worktree_busy(path: Path) -> str | None:
    """Why a worktree must not be destroyed now; None only when proven idle."""
    return disk_guard.busy_reason(path, run=lambda cmd, **kw: sh(cmd, timeout=kw.get("timeout", 30)))


def require_idle_worktree(path: Path):
    # Warnings can mean an incomplete process inventory, so remain fail-closed.
    busy = worktree_busy(path)
    if busy:
        raise RecoveryHandoff(f"preserved-{busy}", path)


def _qualify_preserved_pr(host: Host, pr: dict, preserved):
    path, prior = preserved
    if prior.get("branch") != pr["headRefName"] or prior.get("headBefore") != pr["headRefOid"]:
        raise RecoveryHandoff("preserved-head-superseded", path)
    registered = sh(["git", "worktree", "list", "--porcelain"], cwd=host.repo, timeout=30)
    entries = [dict(line.split(" ", 1) for line in entry.splitlines() if " " in line)
               for entry in registered.stdout.split("\n\n")]
    if registered.returncode or not any(Path(entry.get("worktree", "/")).resolve() == path.resolve()
                                        and entry.get("branch") == f"refs/heads/{pr['headRefName']}"
                                        for entry in entries):
        raise RecoveryHandoff("preserved-worktree-unregistered", path)
    require_idle_worktree(path)
    ancestor = sh(["git", "merge-base", "--is-ancestor", pr["headRefOid"], "HEAD"], cwd=path, timeout=30)
    if ancestor.returncode:
        raise RecoveryHandoff("preserved-head-diverged", path)
    return {key: prior["execution"][key] for key in ("workKey", "executionGeneration", "identityDigest")}


def preserve_repair(worktree: Path, receipt: dict) -> None:
    """A cancelled run's local work is evidence, including uncommitted follow-up."""
    if worktree.exists():
        marker = {"schema": "jovie-preserved-repair/v1", "runId": receipt["runId"],
                  "pr": receipt.get("pr"), "issue": receipt.get("issue"),
                  "reason": receipt.get("reasons"), "branch": receipt.get("branch"),
                  "headBefore": receipt.get("headBefore"), "at": now_iso()}
        receipt["preservedWorktree"] = str(worktree)
        try:
            (worktree / disk_guard.PRESERVED_REPAIR).write_text(json.dumps(marker, indent=1))
        except OSError as error:
            receipt["preservationError"] = str(error)[:200]


def retire_completed_repair(host: Host, worktree: Path, receipt: dict) -> bool:
    """Clear a recovery marker only for idle, clean, already-published source."""
    if receipt.get("verdict") not in {"fix-pushed", "fix-no-change"} or not receipt.get("headAfter"):
        return False
    try:
        require_idle_worktree(worktree)
        status = sh(["git", "status", "--porcelain", "--untracked-files=all", "--", ".",
                     f":(exclude){disk_guard.PRESERVED_REPAIR}"], cwd=worktree, timeout=30)
        head = sh(["git", "rev-parse", "HEAD"], cwd=worktree, timeout=30)
        if status.returncode or status.stdout.strip() or head.returncode or head.stdout.strip() != receipt["headAfter"]:
            return False
        (worktree / disk_guard.PRESERVED_REPAIR).unlink()
        remove_worktree(host, worktree)
        if not worktree.exists():
            receipt["recoveryCleanup"] = {"status": "removed", "publishedHead": receipt["headAfter"]}
            return True
    except (OSError, subprocess.SubprocessError, RecoveryHandoff):
        pass
    # Failed removal or newly observed edits must regain cleanup protection.
    preserve_repair(worktree, receipt)
    return False


def fix_red_pr(host: Host, name: str, spec: dict, pr: dict) -> dict:
    lock = Locked(host.state / "locks" / f"repair-pr-{pr['number']}.lock", blocking=False)
    try:
        return _fix_red_pr(host, name, spec, pr, branch_held=lock.held)
    finally:
        lock.release()


def _fix_red_pr(host: Host, name: str, spec: dict, pr: dict, *, branch_held=True) -> dict:
    run_id = f"{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-PR{pr['number']}-{name}-fix-{uuid.uuid4().hex[:6]}"
    runs = host.state / "runs"
    runs.mkdir(parents=True, exist_ok=True)
    worktree = host.state / "worktrees" / run_id
    provider_evidence = runs / f"{run_id}.provider.jsonl"
    receipt = {"schema": "jovie-lane-run/v1", "runId": run_id, "provider": name, "kind": "fix-red",
               "accountClass": spec.get("accountClass"), "origin": AUTONOMOUS_ORIGIN,
               "attribution": {"category": "autonomous-remediation", "provider": name},
               "worktree": str(worktree), "branch": pr["headRefName"], "pr": pr["number"],
               "headBefore": pr["headRefOid"], "requestSource": fix_request_source(pr),
               "startedAt": now_iso()}
    receipt["targetStateReads"] = 1
    try:
        live = require_fix_target(pr, "before-execution-claim", repair=True)
    except RepairStopped as error:
        live, reason = error.live, str(error)
        state = str((live or {}).get("state") or "").upper()
        verdict = "reconcile-unavailable" if live is None else "cancelled"
        receipt.update(
            verdict=verdict,
            reasons=[reason],
            cancellation={
                "schema": "jovie-fix-cancellation/v1",
                "reason": reason,
                "observedState": state or "UNKNOWN",
                "mergedAt": (live or {}).get("mergedAt"),
                "observedHead": (live or {}).get("headRefOid"),
                "requestSource": receipt["requestSource"],
            },
            endedAt=now_iso(),
            result={"verdict": verdict, "commit": None, "pr": pr["number"]},
        )
        if branch_held:
            end_local_fix_attempt(host, pr, receipt)
        with open(runs / "ledger.jsonl", "a") as ledger:
            ledger.write(json.dumps(receipt) + "\n")
        return receipt
    pr = live
    failure = {"checks": [(check.get("name"), check.get("conclusion")) for check in pr.get("statusCheckRollup") or []],
               "merge": pr.get("mergeStateStatus"), "review": pr.get("reviewDecision")}
    ident = execution_attempt.identity("pr-remediation",
                                       {"repository": REPO_SLUG, "pr": pr["number"], "failure": failure},
                                       {"headSha": pr["headRefOid"]})
    coordination = execution_coordination(pr["headRefOid"])
    preserved = None
    try:
        if not branch_held:
            raise RecoveryHandoff("repair-owner-active", worktree)
        preserved = preserved_run(host, pr=pr["number"])
        if preserved:
            ident = qualify_preserved_pr(host, pr, preserved)
    except RecoveryHandoff as error:
        receipt.update(verdict="recovery-handoff", reasons=[str(error)], recovery=error.evidence,
                       endedAt=now_iso(), result={"verdict": "recovery-handoff", "pr": pr["number"], "commit": None})
        if branch_held:
            end_local_fix_attempt(host, pr, receipt)
        with open(runs / "ledger.jsonl", "a") as ledger:
            ledger.write(json.dumps(receipt) + "\n")
        return receipt
    try:
        claimed = execution_attempt.claim(runs / "execution-attempts.jsonl", ident,
                                          {"owner": HOST, "runtime": "symphony-lanes", "provider": name,
                                           "model": spec.get("model"), "tool": "fix_red_pr", "accountPool": name},
                                          {"attempts": MAX_FIX_ATTEMPTS, "concurrency": 1, "wallSeconds": host.agent_timeout * MAX_FIX_ATTEMPTS,
                                           "spend": MAX_FIX_ATTEMPTS, "mutations": MAX_FIX_ATTEMPTS * 2,
                                           "leaseSeconds": host.agent_timeout + 900, "version": "lanes-v1"},
                                          {"triggerId": run_id, "correlationId": f"pr-{pr['number']}",
                                           "causationId": pr["headRefOid"]}, coordination=coordination)
    except Exception as error:
        # Same contract as run_issue (JOV-7191): a claim failure must leave a ledger
        # receipt instead of a worker exit the doctor can only see as spawn-exit.
        receipt.update(verdict="failed", reasons=[f"claim-error:{type(error).__name__}:{error}"[:300]])
    else:
        receipt["execution"] = claimed
    if not receipt.get("verdict") and not claimed["admitted"]:
        receipt.update(verdict="duplicate-active" if claimed["reason"] == "duplicate_active" else "quarantined",
                       reasons=[claimed["reason"]])
    if receipt.get("verdict"):
        if preserved:
            receipt["recovery"] = RecoveryHandoff(receipt["reasons"][0], preserved[0]).evidence
        receipt.update(endedAt=now_iso(),
                       result={"verdict": receipt["verdict"], "commit": None, "pr": pr["number"]})
        with open(runs / "ledger.jsonl", "a") as ledger:
            ledger.write(json.dumps(receipt) + "\n")
        return receipt
    if preserved:
        worktree, prior = preserved
        receipt.update(worktree=str(worktree), resumedFrom=prior["runId"])
    with open(runs / f"{run_id}.log", "w") as log:
        try:
            def verify_target(target, stage, *, worktree=None):
                receipt["targetStateReads"] += 1
                live = require_fix_target(target, stage, worktree=worktree, repair=True)
                require_publishable(host, live.get("headRefName") or pr["headRefName"], stage)
                return live
            require_disk(host, "repair-checkout")
            verify_target(pr, "before-checkout")
            sh(["git", "fetch", "-q", "origin", "main", pr["headRefName"]], cwd=host.repo, log=log)
            verify_target(pr, "after-fetch")
            if preserved:
                qualify_preserved_pr(host, pr, preserved)
            else:
                add_worktree(host, ["-B", pr["headRefName"], str(worktree), f"origin/{pr['headRefName']}"], log)
            def revoke_fix(error) -> None:
                """An operator stop revokes this PR branch's publication authority before the
                kill lands. Ordinary kills (timeout, disk, supersede) do not: the branch is the
                PR's shared head, and the next fix attempt must still be able to land it."""
                if isinstance(error, RunStopped):
                    revoke_publication(host, branch=pr["headRefName"], run_id=run_id,
                                       pr=pr["number"], reason="run-stopped")

            def boundary(stage="repair-command", allow_local_push=False):
                require_disk(host, stage)
                verify_target(pr, stage, worktree=worktree if allow_local_push else None)
            resolved_generated = False
            if pr.get("mergeStateStatus") == "DIRTY":
                execution_attempt.boundary(runs / "execution-attempts.jsonl", ident, claimed["fencingToken"],
                                           {"spend": 0, "mutations": 1}, coordination=coordination)
                resolved_generated = resolve_generated_conflict(worktree, pr["headRefName"], log, guard=boundary)
            agent = None
            if resolved_generated:
                receipt.update(resolution="generated-regenerated")
            else:
                boundary("before-install")
                install_dependencies(host, worktree, log)
                prompt = render_fix_prompt(pr, failure_excerpt(pr))
                if preserved:
                    prompt = ("Resume the preserved repair in this checkout. Inspect git status, diff and local commits; "
                              "retain existing edits and finish verification/publication. Never reset or start over.\n\n" + prompt)
                prompt_file = runs / f"{run_id}.prompt.md"
                receipt["contextManifests"] = [write_agent_prompt(
                    prompt_file, prompt, "fix", name,
                    {"pr": json.dumps(pr, sort_keys=True), "rendered_context": prompt})]
                boundary("before-agent")
                execution_attempt.boundary(runs / "execution-attempts.jsonl", ident, claimed["fencingToken"],
                                           {"spend": 1, "mutations": 1}, coordination=coordination)
                agent = run_agent(template(spec["cmd"], {"prompt": prompt, "prompt_file": str(prompt_file),
                                                         "cwd": str(worktree),
                                                         "provider_receipt": str(provider_evidence),
                                                         "model": str(spec.get("model"))}),
                                  worktree, log, host.agent_timeout,
                                  guard=lambda: boundary("agent-running", allow_local_push=True),
                                  on_kill=revoke_fix)
            verify_target(pr, "after-agent", worktree=worktree)
            head = sh(["git", "ls-remote", "origin", f"refs/heads/{pr['headRefName']}"], cwd=host.repo).stdout.split()
            after = head[0] if head else ""
            pushed = bool(after) and after != pr["headRefOid"]
            if pushed and not repair_created_head(worktree, after):
                raise RepairStopped("target-head-superseded", {**pr, "state": "OPEN", "headRefOid": after},
                                    "after-remote-read")
            receipt.update(agentExit=agent.returncode if agent else None, headAfter=after,
                           verdict="fix-pushed" if pushed else "fix-no-change")
            if pushed:
                verify_target({**pr, "headRefOid": after}, "before-push-effects")
                labels = {label.lower() for label in pr_events.label_names(pr)}
                resolved = [kind for kind in pr_events.FIX_KINDS if pr_events.PREFIX + kind in labels]
                if resolved:
                    pr_events.consume(THIS, pr, resolved)
                # A new fix head earns another queue try; a repeat failure re-marks it. The PR
                # summary carries no labels, so delete unconditionally (404 when absent).
                sh(["gh", "api", "-X", "DELETE",
                    f"repos/{REPO_SLUG}/issues/{pr['number']}/labels/{pr_events.POISON_LABEL}"], log=log)
                if pr.get("liftHold") and remediation.lift_human_holds():
                    sh(["gh", "api", "-X", "DELETE",
                        f"repos/{REPO_SLUG}/issues/{pr['number']}/labels/hold"], log=log)
            if pushed and not pr.get("isDraft"):
                # Conflicts and failures can drop auto-merge; re-arm it so the fix actually lands.
                verify_target({**pr, "headRefOid": after}, "before-merge-intent")
                # The already-selected repair creates intent, never certification. Its
                # ended source receipt lets the existing adopter verify this exact head.
                update_requeue_locked(host, lambda pending: pending.update({str(pr["number"]): after}))

        except RepairStopped as error:
            live = error.live or {}
            receipt.update(verdict="reconcile-unavailable" if error.live is None else "cancelled",
                           reasons=[str(error)], cancellation={
                               "schema": "jovie-fix-cancellation/v1", "reason": str(error),
                               "stage": error.stage, "observedState": live.get("state", "UNKNOWN"),
                               "mergedAt": live.get("mergedAt"), "observedHead": live.get("headRefOid"),
                               "requestSource": receipt["requestSource"]})
        except PublicationRevoked as error:
            receipt.update(verdict="revoked", reasons=[str(error)], revocation=error.receipt)
        except DiskAdmissionError as error:
            receipt.update(verdict="disk-held", reasons=[str(error)])
        except RecoveryHandoff as error:
            receipt.update(verdict="recovery-handoff", reasons=[str(error)], recovery=error.evidence)
        except subprocess.TimeoutExpired:
            receipt.update(verdict="failed", reasons=["timeout"])
        except WorktreeUnavailable as error:
            # Usually the PR merged or closed between listing and this run: nothing to fix.
            receipt.update(verdict="skipped", reasons=[f"worktree-unavailable:{error}"[:300]])
        except Exception as error:
            receipt.update(verdict="failed", reasons=[f"harness-error:{type(error).__name__}:{error}"[:300]])
        finally:
            if preserved:
                if not retire_completed_repair(host, worktree, receipt):
                    preserve_repair(worktree, receipt)
            elif receipt.get("verdict") in {"cancelled", "revoked", "reconcile-unavailable", "disk-held", "recovery-handoff"}:
                preserve_repair(worktree, receipt)
            else:
                remove_worktree(host, worktree)
            # The attempt is over: a head it did not move may be tried again by the next lane.
            # A head the fix itself pushed continues this generation rather than earning
            # re-entry (JOV-7089), so it is recorded as the generation's self-produced head.
            end_local_fix_attempt(host, pr, receipt)
    evidence = read_provider_evidence(provider_evidence)
    if evidence:
        receipt["providerEvidence"] = evidence
    receipt["endedAt"] = now_iso()
    pushed = receipt.get("verdict") == "fix-pushed"
    receipt["result"] = {"verdict": receipt.get("verdict"), "commit": receipt.get("headAfter"),
                         "pr": receipt.get("pr")}
    # An unreadable ownership boundary is not evidence of a coding/provider failure.
    # Preserve the existing bounded recovery envelope and repeated-failure fingerprint.
    target_unavailable = (receipt.get("verdict") == "reconcile-unavailable"
                          and receipt.get("cancellation", {}).get("reason") == "target-state-unavailable")
    evidence = {"before": pr["headRefOid"], "after": receipt.get("headAfter")}
    if target_unavailable:
        evidence["targetObservation"] = {key: receipt["cancellation"].get(key)
                                       for key in ("reason", "stage", "observedState")}
    receipt["execution"] = execution_attempt.finish(
        runs / "execution-attempts.jsonl", ident, claimed["fencingToken"], "succeeded" if pushed else "failed_known",
        {"failureClass": None if pushed else "target_state_unavailable" if target_unavailable else "repair_incomplete",
         "failureFingerprint": None if pushed else execution_attempt.digest(receipt.get("reasons", ["no-head-change"])),
         "evidenceDigest": execution_attempt.digest(evidence),
         "costs": {"apiCalls": 1}, "mutationsPerformed": ["source_push"] if pushed else [],
         "confidence": "unknown" if target_unavailable else "high",
         "dependencies": [name, "github-target-state"] if target_unavailable else [name]}, coordination=coordination)
    with open(runs / "ledger.jsonl", "a") as ledger:
        ledger.write(json.dumps(receipt) + "\n")
    return receipt


def best_per_issue(prs: list[dict]) -> list[dict]:
    """One PR per issue, retroactively: when the old runner left several open PRs for one
    issue, the lanes spend effort only on the one furthest along (ready over draft, clean over
    conflicted, then newest). sweep_lane_prs closes the others as superseded."""
    by_issue: dict[str, list[dict]] = {}
    rest = []
    for pr in prs:
        found = LANE_BRANCH.match(pr.get("headRefName") or "")
        (by_issue.setdefault(found.group("issue"), []) if found else rest).append(pr)
    keep = list(rest)
    for group in by_issue.values():
        keep.append(max(group, key=lambda pr: (not pr.get("isDraft"), is_green(pr),
                                               pr.get("mergeStateStatus") != "DIRTY", pr["number"])))
    return sorted(keep, key=lambda pr: pr["number"])


def unverified_pr(prs: list[dict], verified: dict, pending: dict | None = None, repaired: dict | None = None) -> dict | None:
    """A lane draft whose head the gate has never seen, e.g. a remote agent that finished late."""
    for pr in sorted(best_per_issue(prs), key=lambda item: item["number"]):
        sensitive = SENSITIVE_PR_LABEL in {label["name"].lower() for label in pr.get("labels", [])}
        pending_lane = (bool(LANE_BRANCH.match(pr.get("headRefName", ""))) or
                        (repaired or {}).get(str(pr["number"])) == pr.get("headRefOid")) and (pending or {}).get(str(pr["number"])) == pr.get("headRefOid")
        if (pr.get("isDraft") or pending_lane) and not terminal_gate(pr, verified, sensitive):
            return pr
    return None


def adopt_pr(host: Host, name: str, pr: dict, claim: GateClaim | None = None, *, sensitive: bool = False) -> dict:
    if not provider_may_run(name, "adopt"):
        if claim is not None:
            claim.lock.release()
        return {"schema": "jovie-lane-run/v1", "provider": name, "kind": "adopt", "pr": pr["number"],
                "verdict": "skipped", "reasons": ["implementation-only-lane:no-review-tasks"],
                "startedAt": now_iso(), "endedAt": now_iso()}
    claim = reserve_gate(host, pr) if claim is None else claim
    if claim is None:
        return {"provider": name, "kind": "adopt", "pr": pr["number"], "headSha": pr["headRefOid"],
                "verdict": "gate-in-progress", "reasons": ["exact-head-gate-reserved"]}
    try:
        return _adopt_pr(host, name, pr, claim, sensitive=sensitive)
    finally:
        claim.lock.release()


def _adopt_pr(host: Host, name: str, pr: dict, claim: GateClaim, *, sensitive: bool = False) -> dict:
    run_id = f"{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-PR{pr['number']}-{name}-adopt-{uuid.uuid4().hex[:6]}"
    runs = host.state / "runs"
    runs.mkdir(parents=True, exist_ok=True)
    worktree = host.state / "worktrees" / run_id
    receipt = {"schema": "jovie-lane-run/v1", "runId": run_id, "provider": name, "kind": "adopt",
               "origin": AUTONOMOUS_ORIGIN, "attribution": {"category": "review-only", "provider": name},
               "worktree": str(worktree), "branch": pr.get("headRefName"), "pr": pr["number"],
               "startedAt": now_iso()}
    with open(runs / f"{run_id}.log", "w") as log:
        try:
            live = require_fix_target(pr, "before-adopt-checkout")
            if reason := gate_deferral(host, live):
                raise RepairStopped(reason, live, "before-adopt-checkout")
            require_disk(host, "adopt-checkout")
            sh(["git", "fetch", "-q", "origin", "main"], cwd=host.repo, log=log)
            add_worktree(host, ["--detach", str(worktree), "origin/main"], log)
            install_dependencies(host, worktree, log)
            labels = {label["name"].lower() for label in pr.get("labels", [])}
            receipt.update(gate_pr(host, pr, worktree, log, sensitive=sensitive or SENSITIVE_PR_LABEL in labels, claim=claim))
        except RepairStopped as error:
            receipt.update(verdict="gate-deferred", reasons=[str(error)], stage=error.stage)
        except WorktreeUnavailable as error:
            receipt.update(verdict="skipped", reasons=[f"worktree-unavailable:{error}"[:300]])
        except Exception as error:
            receipt.update(verdict="failed", reasons=[f"harness-error:{type(error).__name__}:{error}"[:300]])
        finally:
            remove_worktree(host, worktree)
    receipt["endedAt"] = now_iso()
    receipt["result"] = {"verdict": receipt.get("verdict"), "commit": receipt.get("headSha"),
                         "pr": receipt.get("pr")}
    with open(runs / "ledger.jsonl", "a") as ledger:
        ledger.write(json.dumps(receipt) + "\n")
    return receipt


def lane_prs(name: str, providers: dict | None = None, fields: str = "") -> list[dict]:
    """This lane's open PRs (its recognized run branches), plus the orphaned PRs of disabled lanes:
    nobody else will fix or gate those, and any enabled lane can."""
    providers = load_providers() if providers is None else providers
    names = [name] + [other for other, spec in providers.items()
                      if (not spec.get("enabled", True) or spec.get("repairs") is False) and other != name]
    prs = []
    for owner in names:
        if fields:
            listed = sh(["gh", "pr", "list", "--repo", REPO_SLUG, "--state", "open", "--search", f"head:{owner}/",
                         "--limit", "200", "--json", fields])
            candidates = json.loads(listed.stdout or "[]")
        else:
            candidates = open_prs_summary()
        prs += [pr for pr in candidates if (owned := LANE_BRANCH.match(pr["headRefName"]))
                and owned.group("lane") == owner]
    return prs


PR_FIELDS = "number,title,url,isDraft,headRefName,headRefOid,statusCheckRollup,mergeStateStatus,reviewDecision,isCrossRepository,labels"
# Every lane PR without check rollups: rollups over ~90 PRs time out (HTTP 504), so the full
# field set stays at gh's default page of 30 and the budget/sweep read this light set.
LIGHT_PR_FIELDS = "number,url,state,isDraft,headRefName,headRefOid,mergeStateStatus,labels"


def repo_prs() -> list[dict]:
    """Every open, non-draft PR whose branch lives in this repo (forks cannot be pushed to).
    Tim: no open PR should ever need his action; the fix loop owns them all."""
    ready = [pr for pr in open_prs_summary() if not pr.get("isDraft") and not pr.get("isCrossRepository")]
    return sorted(ready, key=lambda pr: pr.get("updatedAt") or "", reverse=True)[:60]


_SUMMARY: dict = {"at": 0.0, "prs": [], "readable": False}
SUMMARY_TTL_S = 60
# One claim scan per minute for every idle worker on the host. The 500-issue Linear
# pagination runs only as this cache's fill, never as an uncached read.
CLAIM_SCAN_TTL_S = 60
SHARED_CACHE_DIR = Path(os.environ.get("LANES_STATE", Path.home() / ".local/state/jovie-lanes")) / "cache"


def _cache_token(value: str) -> str:
    if re.fullmatch(r"[A-Za-z0-9_-]{1,64}", value or ""):
        return value
    return hashlib.sha256(value.encode()).hexdigest()[:20]


def shared(key: str, ttl: float, fetch):
    """One GitHub read per `ttl` for every worker on the host. Workers are short-lived processes
    (re-exec after each unit, respawned every dispatch tick), so an in-process cache never
    hits; 7 workers re-listing every open PR spent the bot's whole 5000-point GraphQL hour
    (2026-09-28). A failed read (None) is never cached. Off in tests."""
    if os.environ.get("LANES_EXECUTION_BACKEND") == "local-test":
        return fetch()
    path = SHARED_CACHE_DIR / f"{key}.json"
    SHARED_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    # Independent idle workers can miss the same expired cache simultaneously.
    # Serialize the fill, then re-read under the lock; shared storage alone did
    # not prevent duplicate GraphQL censuses consuming the installation budget.
    with open(path.with_suffix('.lock'), 'a+') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            cached = json.loads(path.read_text())
            if 0 <= time.time() - cached["at"] < ttl:
                return cached["value"]
        except (OSError, ValueError, KeyError, TypeError):
            pass
        value = fetch()
        if value is not None:
            tmp = path.with_suffix(f".{os.getpid()}.tmp")
            tmp.write_text(json.dumps({"at": time.time(), "value": value}))
            os.replace(tmp, path)
        return value


def open_prs_summary() -> list[dict]:
    """Every open PR with its aggregate check state, in a few cheap GraphQL pages, cached for a
    minute. Per-check rollups over dozens of PRs 504 or trip GitHub's secondary rate limit
    (2026-09-27: devin had 43 red PRs and saw none of them, so it idled over budget). The
    aggregate state stands in as one synthetic check; `with_checks` loads the real ones for
    the single PR a worker claims. Empty when GitHub cannot be read."""
    now = time.time()
    if now - _SUMMARY["at"] < SUMMARY_TTL_S:
        return _SUMMARY["prs"]
    prs = shared("open-prs-labels-v2", SUMMARY_TTL_S, lambda: pr_events.open_prs_state(THIS))
    if prs is None:
        _SUMMARY["readable"] = False
        return []
    source_at = now
    if os.environ.get("LANES_EXECUTION_BACKEND") != "local-test":
        try:
            cached = maintenance_json(SHARED_CACHE_DIR / "open-prs-labels-v2.json")
            # shared() releases its lock before returning. A later cache refill
            # can certify these rows only if the exact returned value still agrees.
            source_at = cached["at"] if cached["value"] == prs else None
        except (OSError, ValueError, KeyError, TypeError):
            source_at = None
    for pr in prs:
        rollup = pr.get("rollup")
        pr["statusCheckRollup"] = [] if rollup is None else [{
            "name": "rollup", "synthetic": True,
            "status": "COMPLETED" if rollup in ("SUCCESS", "FAILURE", "ERROR") else "PENDING",
            "conclusion": {"SUCCESS": "SUCCESS", "FAILURE": "FAILURE", "ERROR": "FAILURE"}.get(rollup)}]
    _SUMMARY.update(at=now, sourceAt=source_at, prs=prs, readable=True)
    return prs


def overlap_prs_summary() -> list[dict] | None:
    """Cached PR overlap inventory, preserving unreadable rather than certifying empty."""
    prs = open_prs_summary()
    complete = all(pr.get("filesComplete") is True for pr in prs if not pr.get("isDraft"))
    return prs if _SUMMARY["readable"] and complete else None


def overlap_inventory(host: Host, linear: Linear) -> tuple[list[dict], list[dict]] | None:
    """The cached open-PR file inventory plus claimed work that has not opened a PR yet."""
    local = file_overlap.local_tasks(host.state)
    if file_overlap.guard_mode() == "off" or os.environ.get("LANES_EXECUTION_BACKEND") == "local-test":
        return [], local
    prs = overlap_prs_summary()
    if prs is None:
        return None
    provider_labels = [spec["label"] for spec in load_providers().values() if spec.get("label")]

    def fetch_active():
        return [{"id": issue.id, "identifier": issue.identifier, "title": issue.title,
                 "description": issue.description, "priority": issue.priority,
                 "createdAt": issue.created_at, "labels": issue.labels}
                for issue in linear.active_lane_issues([SHARED_LABEL, *provider_labels])]
    try:
        active = shared("file-overlap-tasks-v2", SUMMARY_TTL_S, fetch_active)
    except LinearRateLimited:
        raise
    except Exception:
        return None
    if active is None:
        return None
    pr_text = "\n".join(f"{pr.get('headRefName', '')}\n{pr.get('body', '')}" for pr in prs).lower()
    tasks = []
    for issue in active:
        if issue["identifier"].lower() in pr_text:
            continue
        prediction = file_overlap.predict_issue_files(issue, workstreams.classify)
        tasks.append({"kind": "task", "identifier": issue["identifier"], **prediction})
    known = {row.get("identifier") for row in tasks}
    tasks.extend(row for row in local if row.get("identifier") not in known)
    return prs, tasks


def with_checks(pr: dict) -> dict:
    """The claimed PR with its real per-check rollup (names, job URLs) in place of the summary."""
    if not any(check.get("synthetic") for check in pr.get("statusCheckRollup") or []):
        return pr
    viewed = sh(["gh", "pr", "view", str(pr["number"]), "--repo", REPO_SLUG, "--json", "statusCheckRollup"])
    try:
        return {**pr, "statusCheckRollup": json.loads(viewed.stdout)["statusCheckRollup"]}
    except (ValueError, KeyError, TypeError):
        return pr


def reclaimable_drafts() -> list[dict]:
    """Abandoned agent drafts the lanes reclaim (Tim, 2026-10-10): non-lane agent branches past
    the 7-day SLO that are idle 48h, red or conflicting, and not held. Same-repo only."""
    now = time.time()
    return [pr for pr in open_prs_summary() if not pr.get("isCrossRepository")
            and pr_events.abandoned_agent_draft(pr, now)
            and not {label["name"].lower() for label in pr.get("labels", [])} & pr_events.HOLD_LABELS]


def fix_candidates(name: str) -> list[dict]:
    """Lane PRs (all lanes), every other open non-draft PR and reclaimed abandoned drafts,
    de-duplicated by number.

    Cached with the rest of the claim scan: N idle workers share one read per minute."""
    def fetch():
        seen, merged = set(), []
        for pr in lane_prs(name) + repo_prs() + reclaimable_drafts():
            if pr["number"] not in seen:
                seen.add(pr["number"])
                merged.append(pr)
        return merged
    return shared(f"claim-fix-candidates-{_cache_token(name)}", CLAIM_SCAN_TTL_S, fetch) or []


ISSUE_MARKER = re.compile(r"linear-issue-id:\s*(JOV-\d+)", re.IGNORECASE)


def in_flight_issues() -> frozenset[str] | None:
    """Issues that already have an open PR (lane branch or `linear-issue-id` marker) from any
    lane, host, or agent. GitHub is the shared truth. None when GitHub cannot be read: an
    unknown in-flight set is not permission to open a duplicate PR (JOV-6833). A parked PR the
    sweep requeued (`lane-rebuild`, JOV-7708) stays open but no longer holds its issue."""
    def fetch():
        listed = sh(["gh", "pr", "list", "--repo", REPO_SLUG, "--state", "open", "--limit", "500",
                     "--json", "headRefName,body,labels"])
        return json.loads(listed.stdout or "[]") if listed.returncode == 0 else None
    prs = shared("in-flight", CLAIM_SCAN_TTL_S, fetch)
    if prs is None:
        return None
    keys = set()
    for pr in prs:
        if pr_events.REBUILD_LABEL in pr_events.label_names(pr):
            continue
        branch = LANE_BRANCH.match(pr.get("headRefName") or "")
        marker = ISSUE_MARKER.search(pr.get("body") or "")
        keys |= {key.upper() for key in (branch and branch.group("issue"), marker and marker.group(1)) if key}
    return frozenset(keys)


def open_hotspot_holds() -> dict[str, int]:
    """hotspot_holds over every open PR's changed files. Unreadable GitHub admits without
    hotspot gating ({}): this orders contended work, the in-flight read guards duplicates."""
    def fetch():
        listed = sh(["gh", "pr", "list", "--repo", REPO_SLUG, "--state", "open", "--limit", "200",
                     "--json", "number,labels,files"])
        return json.loads(listed.stdout or "[]") if listed.returncode == 0 else None
    prs = shared("hotspot-files", CLAIM_SCAN_TTL_S, fetch)
    return hotspot_holds(prs) if prs is not None else {}


def is_green(pr: dict) -> bool:
    return not pr.get("isDraft") and pr.get("mergeStateStatus") in ("CLEAN", "HAS_HOOKS")


def over_budget(name: str, prs: list[dict], slots: int) -> bool:
    """Slots bound worktrees, not open PRs; without this a lane keeps opening while its earlier
    PRs rot (84 devin PRs, 0 green drafts on 2026-09-27). Over budget = fix/adopt only."""
    own = [pr for pr in prs if (pr.get("headRefName") or "").startswith(f"{name}/")]
    return sum(not is_green(pr) for pr in own) >= slots * OPEN_PRS_PER_SLOT


def pr_is_terminal(pr: dict) -> bool:
    """Held or repair-exhausted: only a human (or another lane's adopt) can move it."""
    labels = {label.lower() for label in pr_events.label_names(pr)}
    return bool(labels & (pr_events.HOLD_LABELS | {pr_events.PREFIX + pr_events.EXHAUSTED,
                                                   pr_events.PREFIX + "escalating"}))


def new_issue_budget(name: str, slots: int, inventory: list[dict] | None) -> dict:
    """One owning lane's new-issue budget; maintenance/orphan work is separate.

    Active (advanceable) non-green PRs are capped at slots x OPEN_PRS_PER_SLOT.
    Terminal PRs (hold / lane-fix-exhausted / lane-fix-escalating) are capped separately at
    slots x TERMINAL_PRS_PER_SLOT so a lane cannot accumulate unbounded parked work,
    but parked work alone can no longer pin a lane idle (JOV-7514)."""
    cap = max(0, slots) * OPEN_PRS_PER_SLOT
    terminal_cap = max(0, slots) * TERMINAL_PRS_PER_SLOT
    if slots <= 0:
        return {"allowed": False, "reason": "provider-disabled", "used": 0, "cap": cap,
                "terminal": 0, "terminalCap": terminal_cap}
    if inventory is None:
        return {"allowed": False, "reason": "pr-inventory-unavailable", "used": None, "cap": cap,
                "terminal": None, "terminalCap": terminal_cap}
    dated = re.compile(rf"^{re.escape(name)}/jov-\d+-\d{{8}}")
    own = {pr["number"]: pr for pr in inventory if dated.match(pr["headRefName"])}
    terminal = sum(pr_is_terminal(pr) for pr in own.values())
    used = sum(not is_green(pr) and not pr_is_terminal(pr) for pr in own.values())
    reason = ("over-budget" if used >= cap else
              "terminal-pr-backlog" if terminal >= terminal_cap else "within-budget")
    return {"allowed": reason == "within-budget", "reason": reason, "used": used, "cap": cap,
            "terminal": terminal, "terminalCap": terminal_cap}


def read_new_issue_budget(name: str, slots: int) -> dict:
    """Fail closed on incomplete budget reads without disrupting maintenance reads."""
    inventory, error = None, None
    if slots <= 0:
        return new_issue_budget(name, slots, [])
    try:
        listed = sh(["gh", "pr", "list", "--repo", REPO_SLUG, "--state", "open",
                     "--search", f"head:{name}/", "--limit", "200", "--json", LIGHT_PR_FIELDS],
                    timeout=60)
        if listed.returncode:
            raise ValueError("pr-read-failed")
        rows = json.loads(listed.stdout)
        # Validate before filtering: 200 manual rows can hide dated lane PRs.
        if not isinstance(rows, list) or len(rows) >= 200:
            raise ValueError("pr-inventory-incomplete")
        for row in rows:
            if (not isinstance(row, dict) or type(row.get("number")) is not int or row["number"] <= 0
                    or not isinstance(row.get("headRefName"), str) or not row["headRefName"].strip()
                    or type(row.get("isDraft")) is not bool
                    or not isinstance(row.get("mergeStateStatus"), str) or not row["mergeStateStatus"].strip()):
                raise ValueError("pr-inventory-malformed")
        if len({row["number"] for row in rows}) != len(rows):
            raise ValueError("pr-inventory-duplicate")
        inventory = rows
    except (OSError, ValueError, subprocess.SubprocessError) as failure:
        error = str(failure) if isinstance(failure, ValueError) else type(failure).__name__
    result = new_issue_budget(name, slots, inventory)
    return {**result, "observedAt": now_iso(), "error": error}


def last_pushes() -> dict[int, float]:
    """Open PR number -> head commit time, in one paginated query (`gh pr list --json commits`
    over 200 PRs exceeds GitHub's GraphQL node limit). Empty when GitHub cannot be read."""
    owner, name = REPO_SLUG.split("/")

    def fetch():
        listed = sh(["gh", "api", "graphql", "--paginate", "-f", f"owner={owner}", "-f", f"name={name}", "-f",
                     "query=query($owner:String!,$name:String!,$endCursor:String){repository(owner:$owner,name:$name){"
                     "pullRequests(states:OPEN,first:100,after:$endCursor){pageInfo{hasNextPage endCursor}"
                     "nodes{number commits(last:1){nodes{commit{committedDate}}}}}}}",
                     "--jq", ".data.repository.pullRequests.nodes[] | "
                             "\"\\(.number) \\(.commits.nodes[0].commit.committedDate)\""])
        return (listed.stdout or "") if listed.returncode == 0 else None
    pushes = {}
    # The sweep only closes drafts idle for 24 h+, so a 5-minute-old read is exact enough.
    for line in (shared("last-pushes", 300, fetch) or "").splitlines():
        number, _, date = line.partition(" ")
        if number.isdigit() and created_at_epoch(date) is not None:
            pushes[int(number)] = created_at_epoch(date)
    return pushes


def sweep_plan(prs: list[dict], now: float, pushes: dict[int, float]) -> tuple[list[tuple[dict, int]], list[dict]]:
    """Rank only explicitly authorized duplicate lane PRs for live revalidation.
    Age and same-issue ranking never grant retirement authority."""
    kept = {LANE_BRANCH.match(pr["headRefName"]).group("issue"): pr
            for pr in best_per_issue(prs) if LANE_BRANCH.match(pr.get("headRefName") or "")}
    superseded, stale = [], []
    for pr in prs:
        found = LANE_BRANCH.match(pr.get("headRefName") or "")
        if not found or not pr_events.duplicate_authorized(pr):
            continue
        keep = kept[found.group("issue")]
        if keep["number"] != pr["number"]:
            superseded.append((pr, keep["number"]))
            continue
        pushed = pushes.get(pr["number"])
        if pr.get("isDraft") and not is_green(pr) and pushed is not None and now - pushed >= STALE_DRAFT_S:
            stale.append(pr)
    return superseded, stale


def cached_issue_state(linear, issue_id: str) -> str:
    """One state read per minute per issue. The claim path still calls state_of directly."""
    return shared(f"claim-issue-state-{_cache_token(issue_id)}", CLAIM_SCAN_TTL_S,
                  lambda: linear.state_of(issue_id))


def sweep_lane_prs(host: Host, name: str, linear, now: float | None = None) -> None:
    """Retire explicitly labeled duplicate lane PRs on the existing bounded sweep tick."""
    now = time.time() if now is None else now
    marker = host.state / f"sweep-{name}.json"
    if marker.exists() and now - json.loads(marker.read_text()).get("at", 0) < SWEEP_EVERY_S:
        return
    marker.write_text(json.dumps({"at": now}))
    superseded, stale = sweep_plan(lane_prs(name, fields=LIGHT_PR_FIELDS), now, last_pushes())
    for pr, keep in superseded:
        if pr_events.maintenance_hold(host, THIS, pr, now):
            continue
        pr_events.close_duplicate(THIS, pr, f"superseded by #{keep} for the same issue", host=host, now=now)
    for pr in stale:
        if pr_events.maintenance_hold(host, THIS, pr, now):
            continue
        issue = LANE_BRANCH.match(pr["headRefName"]).group("issue").upper()
        closed = pr_events.close_duplicate(THIS, pr, "stale draft explicitly labeled duplicate", host=host, now=now)
        # Only reopen work the lane still owns; a Done or Canceled issue stays closed.
        if closed and cached_issue_state(linear, issue) == "In Progress":
            linear.move(issue, "Todo")
            linear.comment(issue, f"🤖 lane sweep closed stale draft {pr.get('url')} (no green run, "
                                  "no push for 24 h); back to Todo.")


def ended_repair_head(pr: dict, record: dict, pending: dict, now: float) -> bool:
    """Only a locally produced, ended repair may add its manual head to existing adoption."""
    before, head = record.get("sha"), pr.get("headRefOid")
    stamps = [record.get("at"), record.get("endedAt")]
    return bool(pending.get(str(pr["number"])) == head and isinstance(head, str) and head and
                isinstance(before, str) and before and before != head and record.get("pushed") is True and
                record.get("pushedHead") == head and type(record.get("count")) is int and record["count"] > 0 and
                record.get("repairRunId") and record.get("repairBranch") == pr.get("headRefName") and
                record.get("repairHeadBefore") == before and all(type(t) in (int, float) and math.isfinite(t) for t in stamps) and
                0 < stamps[0] <= stamps[1] <= now and not pr.get("isCrossRepository") and
                str(pr.get("state", "OPEN")).upper() == "OPEN")


def publish_exhausted_repairs(host: Host, name: str, prs: list[dict], now: float | None = None) -> int:
    """Reconcile ended failed repairs into the existing terminal PR label (JOV-7913).

    This publication is independent of the optional stuck-PR model ladder. Legacy
    records without a failed verdict remain evidence gaps, not publication authority.
    Counters, underlying issues, holds and re-entry policy are never changed here.
    """
    now = time.time() if now is None else now
    attempts = read_json(host.state / "fix-attempts.json")
    published = 0
    for pr in prs:
        record = attempts.get(str(pr.get("number")))
        if not isinstance(record, dict) or pr_is_terminal(pr):
            continue
        head, branch = pr.get("headRefOid"), pr.get("headRefName")
        owned = LANE_BRANCH.match(branch or "")
        stamps = [record.get("at"), record.get("endedAt")]
        if not (owned and owned.group("lane") == name and record.get("lane") == name
                and isinstance(head, str) and head and record.get("sha") == head
                and type(record.get("count")) is int and record["count"] >= MAX_FIX_ATTEMPTS
                and record.get("pushed") is False and record.get("repairVerdict") == "failed"
                and record.get("repairRunId") and record.get("repairBranch") == branch
                and record.get("repairHeadBefore") == head
                and all(type(t) in (int, float) and math.isfinite(t) for t in stamps)
                and 0 < stamps[0] <= stamps[1] <= now):
            continue
        repair = Locked(host.state / "locks" / f"repair-pr-{pr['number']}.lock", blocking=False)
        gate = None
        try:
            if not repair.held:
                continue
            gate = reserve_gate(host, pr)
            if gate is None:
                continue
            live = reconcile_fix_target(pr)
            if (live is None or live.get("state") != "OPEN" or live.get("headRefOid") != head
                    or live.get("headRefName") != branch or live.get("isCrossRepository")
                    or live.get("isInMergeQueue") or pr_is_terminal(live) or is_green(live)):
                continue
            if any(pr_events.claim_active(pr["number"], head, sh, now, kind=kind,
                                           exclude_host=HOST) for kind in ("fix", "gate")):
                continue
            published += int(pr_events.add_label(pr["number"], pr_events.EXHAUSTED, sh))
        except (OSError, subprocess.SubprocessError):
            pass  # An unreadable claim or failed publication remains retryable next scan.
        finally:
            if gate is not None:
                gate.lock.release()
            repair.release()
    return published


def claim_adoptable_pr(host: Host, name: str, prs: list[dict], repair_candidates: list[dict] | None = None) -> GateClaim | None:
    path = host.state / "verified.json"
    verified = json.loads(path.read_text()) if path.exists() else {}
    pending = pr_events.read_state(host, "requeue.json")
    attempts = pr_events.read_state(host, "fix-attempts.json")
    repaired = {str(pr["number"]): pr["headRefOid"] for pr in (repair_candidates or [])
                if ended_repair_head(pr, attempts.get(str(pr["number"]), {}), pending, time.time())}
    prs = list({pr["number"]: pr for pr in [*prs, *(pr for pr in (repair_candidates or []) if str(pr["number"]) in repaired)]}.values())
    pr = unverified_pr(prs, verified, pending, repaired)
    # Another host gating a head skips it, not the whole pass: returning None here idled every
    # worker behind one claimed PR (2026-09-28, 0 running with 45 eligible PRs).
    while pr:
        repair_lock = Locked(host.state / "locks" / f"repair-pr-{pr['number']}.lock", blocking=False)
        repair_active = not repair_lock.held
        repair_lock.release()
        reservation = None if repair_active else reserve_gate(host, pr)
        if reservation is not None:
            try:
                latest = json.loads(path.read_text()) if path.exists() else {}
                sensitive = SENSITIVE_PR_LABEL in {label["name"].lower() for label in pr.get("labels", [])}
                if not terminal_gate(pr, latest, sensitive) and not gate_deferral(host, pr) \
                        and not claimed_elsewhere(pr["number"], pr["headRefOid"], "gate"):
                    post_claim(pr["number"], pr["headRefOid"], "gate")
                    return reservation
            except BaseException:
                reservation.lock.release()
                raise
            reservation.lock.release()
        prs = [other for other in prs if other["number"] != pr["number"]]
        pr = unverified_pr(prs, verified, pending, repaired)
    return None


def claim_red_pr(host: Host, name: str, prs: list[dict] | None = None) -> dict | None:
    """Under the claim lock: pick this lane's red PR and record the attempt before working it."""
    prs = lane_prs(name) if prs is None else prs
    path = host.state / "fix-attempts.json"
    attempts = json.loads(path.read_text()) if path.exists() else {}
    held = json.loads(held_path(host).read_text()) if held_path(host).exists() else {}
    providers = load_providers()
    order, now = pr_events.cost_order(providers), time.time()
    disabled = set(providers) - set(order)
    prs = [pr for pr in prs if pr_events.may_take(name, pr, attempts.get(str(pr["number"]), {}), order, now)]
    pr = red_pr(prs, attempts, held)
    # A head another host is fixing is skipped (no attempt charged); the next red PR is ours.
    while pr:
        live = None if claimed_elsewhere(pr["number"], pr["headRefOid"], "fix") else \
            pr_events.fresh_reentry(THIS, pr, attempts.get(str(pr["number"]), {}))
        entry = pr_events.current_repair_claim(host, THIS, live, attempts.get(str(pr["number"]), {})) \
            if live is not None else None
        # Match the original lane_prs/repo_prs ownership after the fresh target read.
        # Event scope has a separate branch vocabulary; it cannot narrow polling's
        # recognized Hyperagent digest branches or admit another enabled lane's draft.
        owned = LANE_BRANCH.match(live.get("headRefName", "")) if live is not None else None
        in_scope = live is not None and (not live.get("isDraft") or
                                        bool(owned and owned.group("lane") in {name, *disabled}) or
                                        pr_events.abandoned_agent_draft(live, now))
        if entry is not None and in_scope \
                and red_pr([live], attempts, {str(pr["number"]): entry}) is not None:
            pr = live
            held = {str(pr["number"]): entry}
            break
        prs = [other for other in prs if other["number"] != pr["number"]]
        pr = red_pr(prs, attempts, held)
    if pr:
        entry = held.get(str(pr["number"]), {})
        if entry.get("sha") == pr["headRefOid"]:
            pr = {**pr, "gateEvidence": entry.get("evidence", [])}
        if not pr_events.charge_reentry(THIS, path, pr, attempts.get(str(pr["number"]), {}), name, now):
            return None
        if pr_events.PREFIX + pr_events.EXHAUSTED in {label.lower() for label in pr_events.label_names(pr)}:
            pr_events.consume(THIS, pr, [pr_events.EXHAUSTED])
        post_claim(pr["number"], pr["headRefOid"], "fix")
    return pr


# ---------------------------------------------------------------- worker / dispatch / update

def failures_path(host: Host) -> Path:
    return host.state / "failures.json"


def deferred_requeue_blocks(host: Host, name: str, current_context=None) -> dict:
    """Exact retry dispositions since the last ordinary work scan, in the existing idle ledger."""
    try:
        idle = json.loads((host.state / "worker-idle.json").read_text()).get(name, {})
        queued = json.loads((host.state / "requeue.json").read_text())
        blocks = {number: row for number, row in idle.get("deferredRequeue", {}).items()
                  if queued.get(number) == row["pr"]["headRefOid"]}
        if current_context:
            blocks = {number: row for number, row in blocks.items()
                      if (not current_context(row["pr"]).get("active") if row.get("terminal", False)
                          else current_context(row["pr"]) == row["context"])}
        return blocks
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return {}


def yield_deferred_requeues(host: Host, name: str) -> None:
    """Under claim.lock: one ordinary unit/scan yields before reconsidering transient holds."""
    path = host.state / "worker-idle.json"
    if not path.exists(): return
    def clear(data):
        row = data.get(name, {})
        row["deferredRequeue"] = {number: item for number, item in row.get("deferredRequeue", {}).items()
                                  if item.get("terminal", False)}
    update_json(path, clear)


def finish_deferred_retry(host: Host, name: str, pr: dict, retry, context, *, slot):
    """One deferred unit owns its receipt and exit; no second work starts on a held result."""
    try:
        def invoke(live):
            issue, outcome = retry(live)
            if outcome and outcome.get("verdict") in ("landing", "verified-not-queued", "gate-timeout", "remote-repair-required"):
                receipt = qualification_receipt(name, issue, outcome)
                with (host.state / "runs/ledger.jsonl").open("a") as ledger: ledger.write(json.dumps(receipt) + "\n")
                return receipt
        try:
            receipt = run_deferred_requeue(host, pr, invoke, slot=slot)
        except (OSError, ValueError, KeyError, TypeError, RuntimeError, subprocess.SubprocessError):
            receipt = None  # run_deferred_requeue already released its slot on an error
        if receipt is None or receipt.get("verdict") == "remote-repair-required":
            branch = LANE_BRANCH.match(pr.get("headRefName") or "")
            marker = {"pr": {key: pr[key] for key in ("number", "headRefOid", "headRefName")},
                      **({"issue": branch.group("issue").upper()} if branch else {}),
                      "context": context(pr), "terminal": bool(receipt)}
            record_idle_exit(host, name, "deferred-repair-required" if receipt else "deferred-held", deferred=marker)
        if receipt is None and not slot.handle.closed: slot.release()
        return receipt
    except BaseException:
        if not slot.handle.closed: slot.release()
        raise


def record_idle_exit(host: Host, name: str, reason: str, *, deferred=None) -> None:
    """A durable marker that a spawned worker reached the claim scan and exited cleanly, so the
    doctor's spawn-exit rule can tell 'pool had nothing claimable' from workers dying on claim."""
    lock = Locked(host.state / "claim.lock", blocking=True)
    try:
        path = host.state / "worker-idle.json"
        data = json.loads(path.read_text()) if path.exists() else {}
        blocks = data.get(name, {}).get("deferredRequeue", {})
        if deferred: blocks[str(deferred["pr"]["number"])] = deferred
        else: blocks = {number: row for number, row in blocks.items() if row.get("terminal", False)}
        data[name] = {"at": now_iso(), "reason": reason, **({"deferredRequeue": blocks} if blocks else {})}
        path.write_text(json.dumps(data))
    except (OSError, ValueError):
        pass
    finally:
        lock.release()


def worker(host: Host, name: str) -> int:
    spec = load_providers()[name]
    if not spec.get("enabled", True):
        return 0  # a lane turned off in a newer release stops at its next re-exec
    slot = None
    for index in range(host.slots(name, spec.get("slots", 1))):
        lock = Locked(host.state / "slots" / f"{name}.{index}.lock", blocking=False)
        if lock.held:
            slot = lock
            break
        lock.release()
    if slot is None:
        return 0
    try:
        return worker_with_slot(host, name, spec, slot)
    finally:
        if not slot.handle.closed: slot.release()


MAINTENANCE_MISSING = object()


def maintenance_json(path, *, dir_fd=None, limit=1024 * 1024, missing=MAINTENANCE_MISSING):
    """Bounded optional local evidence: refuse special files and symlinks."""
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW, dir_fd=dir_fd)
    except FileNotFoundError:
        return missing
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_size > limit:
            raise ValueError("maintenance-state-not-bounded-regular-file")
        with os.fdopen(fd, "rb", closefd=False) as handle:
            raw = handle.read(limit + 1)
        if len(raw) > limit:
            raise ValueError("maintenance-state-too-large")
        return json.loads(raw)
    finally:
        os.close(fd)


def maintenance_preserved(state: Path) -> set[int]:
    """Bound the optional directory scan; never follow a checkout symlink."""
    preserved, deadline = set(), time.monotonic() + 0.1
    try:
        root = os.open(state / "worktrees", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    except FileNotFoundError:
        return preserved
    try:
        with os.scandir(root) as entries:
            for index, entry in enumerate(entries):
                if index >= 256 or time.monotonic() > deadline:
                    raise ValueError("maintenance-preserved-scan-budget")
                if entry.is_symlink():
                    raise ValueError("maintenance-preserved-symlink")
                if not entry.is_dir(follow_symlinks=False):
                    continue
                directory = os.open(entry.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=root)
                try:
                    marker = maintenance_json(disk_guard.PRESERVED_REPAIR, dir_fd=directory, limit=16384)
                finally:
                    os.close(directory)
                if marker is MAINTENANCE_MISSING:
                    continue
                if not isinstance(marker, dict):
                    raise ValueError("maintenance-preserved-marker-not-object")
                target = marker.get("pr")
                match = re.search(r"-PR(\d+)-", entry.name)
                if match:
                    preserved.add(int(match.group(1)))
                if type(target) is int and target > 0:
                    preserved.add(target)
                elif not match and not (isinstance(marker, dict) and marker.get("issue")):
                    raise ValueError("maintenance-preserved-target-unknown")
        return preserved
    finally:
        os.close(root)


def record_maintenance_demand(host: Host, name: str, prs: list[dict], candidates: list[dict],
                              events: list[dict], selected: set[int]) -> None:
    """Under claim.lock: a pre-claim demand hint from the scan already performed.

    No API, lease, attempt charge or model call. Actual admission still refreshes
    the exact target and enforces remote ownership, provider and integrity gates.
    Unknown is never an empty pool. A selected unit is running, not pending work.
    """
    now, pending_count = time.time(), None
    source_at = _SUMMARY.get("sourceAt")
    try:
        if not _SUMMARY["readable"] or type(source_at) not in (int, float) \
                or not 0 <= now - source_at <= SUMMARY_TTL_S:
            raise ValueError("maintenance-inventory-unknown")
        snapshots = {}
        for filename in ("fix-attempts.json", "held.json", "verified.json", "requeue.json", "synced.json"):
            path = host.state / filename
            row = maintenance_json(path, missing={})
            if not isinstance(row, dict):
                raise ValueError("maintenance-state-not-object")
            snapshots[filename] = row
        attempts, held = snapshots["fix-attempts.json"], snapshots["held.json"]
        providers = load_providers()
        order, disabled = pr_events.cost_order(providers), pr_events.disabled_lanes(providers)
        if name not in order:
            raise ValueError("maintenance-provider-disabled")
        # A preserved checkout needs its existing reconciliation/qualification path.
        # Withhold it from this cheap demand hint; never touch or qualify that work.
        preserved = maintenance_preserved(host.state)
        eligible = set()
        rows = {pr["number"]: pr for pr in best_per_issue([*prs, *candidates, *events])}
        current = {pr["number"]: pr for pr in _SUMMARY["prs"]}
        event_rows = {pr["number"]: pr for pr in events}
        adopt_numbers = {pr["number"] for pr in prs}
        for number, candidate in rows.items():
            pr = current.get(number)
            if not pr or pr.get("headRefOid") != candidate.get("headRefOid") \
                    or not isinstance(pr.get("headRefName"), str) or not pr["headRefName"] \
                    or any(type(pr.get(key)) is not bool for key in ("isDraft", "isCrossRepository", "isInMergeQueue")) \
                    or not isinstance(pr.get("labels"), list) or not isinstance(pr.get("statusCheckRollup"), list):
                raise ValueError("maintenance-current-metadata-unknown")
            remote_active = any(key[:2] == (number, pr["headRefOid"]) and row.get("active")
                                and 0 <= now - row["at"] <= SUMMARY_TTL_S
                                for key, row in _CLAIM_OBSERVATIONS.items())
            if number in selected or number in preserved or remote_active or not pr_events.in_scope(pr, "red", disabled) \
                    or pr.get("isInMergeQueue") or (pr.get("headRefName") or "").startswith("dependabot/"):
                continue
            attempt = attempts.get(str(number), {})
            entry = held.get(str(number), {})
            if not isinstance(attempt, dict) or not isinstance(entry, dict) \
                    or type(attempt.get("count", 0)) is not int or attempt.get("count", 0) < 0 \
                    or (attempt and (not isinstance(attempt.get("sha"), str) or not attempt["sha"])) \
                    or ("at" in attempt and (type(attempt["at"]) not in (int, float) or not math.isfinite(attempt["at"]) or attempt["at"] <= 0)):
                raise ValueError("maintenance-disposition-unknown")
            if ("pushed" in attempt and type(attempt["pushed"]) is not bool) or (
                    "pushedHead" in attempt and (not isinstance(attempt["pushedHead"], str) or not attempt["pushedHead"].strip())):
                raise ValueError("maintenance-generation-unknown")
            ended = attempt.get("endedAt")
            if ended is not None and not (
                    (type(ended) in (int, float) and math.isfinite(ended) and 0 < ended <= now)
                    or (isinstance(ended, str) and (ended_at := pr_events.iso_ts(ended)) is not None and 0 < ended_at <= now)):
                raise ValueError("maintenance-ended-lease-unknown")
            if entry and (not isinstance(entry.get("sha"), str) or not entry["sha"]
                          or not isinstance(entry.get("evidence"), list)
                          or any(not isinstance(item, str) for item in entry["evidence"])
                          or ("at" in entry and (type(entry["at"]) not in (int, float)
                                                 or not math.isfinite(entry["at"]) or entry["at"] <= 0))):
                raise ValueError("maintenance-hold-unknown")
            if pr_events.preservation_reason(pr, attempt, MAX_FIX_ATTEMPTS, held=entry, now=now, allow_reentry=True) \
                    or pr_events.in_flight(attempt, pr, now):
                continue
            kinds = [kind for kind in event_rows.get(number, {}).get("eventKinds", [])
                     if kind in pr_events.FIX_KINDS and pr_events.PREFIX + kind in pr_events.label_names(pr)]
            event_work = kinds and pr_events.needs_work(THIS, {**pr, "eventKinds": kinds}) \
                and pr_events.fixable_hold(entry, pr["headRefOid"])
            if set(kinds) == {"dequeued"} and pr.get("mergeStateStatus") != "DIRTY" \
                    and pr_events.POISON_LABEL not in pr_events.label_names(pr) \
                    and str(number) not in snapshots["synced.json"]:
                event_work = False  # Existing no-model sync must precede this repair.
            if provider_may_run(name, "fix") and pr_events.may_take(name, pr, attempt, order, now) \
                    and (red_pr([pr], attempts, held) or event_work):
                eligible.add(number)
            elif number in adopt_numbers and provider_may_run(name, "adopt") and unverified_pr(
                    [pr], snapshots["verified.json"], snapshots["requeue.json"]) \
                    and not gate_disposition(pr, held, attempts):
                eligible.add(number)
        if eligible:
            pending_count = len(eligible)
        elif _SUMMARY["readable"] and 0 <= now - _SUMMARY["at"] <= SUMMARY_TTL_S \
                and not _SUMMARY["prs"] and not rows:
            # A complete empty repository inventory proves no PR maintenance.
            pending_count = 0
    except Exception:
        pass  # Optional observation must not interrupt an already selected unit.
    path = host.state / "maintenance-demand.json"
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        # All worker writers already hold claim.lock. A second blocking lock or
        # unbounded read here could hold up the selected repair.
        data = maintenance_json(path, limit=65536, missing={})
        if not isinstance(data, dict) or not isinstance(data.get("lanes", {}), dict):
            raise ValueError("maintenance-publication-not-object")
        data["schema"] = "symphony-lanes-maintenance-demand/v1"
        data.setdefault("lanes", {})[name] = {"observedAt": source_at if type(source_at) in (int, float) else now,
                                             "pending": pending_count,
                                             "semantics": "pre-claim demand; fresh admission required"}
        temporary.write_text(json.dumps(data))
        os.replace(temporary, path)
    except Exception:
        pass  # Observation failure never prevents an already authorized repair.
    finally:
        temporary.unlink(missing_ok=True)


def worker_with_slot(host: Host, name: str, spec: dict, slot: Locked) -> int:
    """Release ownership on every exceptional exit, including notification failures."""
    try:
        report = disk_guard.check(host, sweep=True)
        if not report.get("admitted"):
            record_idle_exit(host, name, report.get("reason", "disk-unobservable"))
            slot.release()
            return 1
    except Exception:
        record_idle_exit(host, name, "disk-unobservable")
        slot.release()
        return 1
    linear = Linear(host.linear_env)
    # Publication can await canonical policy and native queue reads. Keep those
    # outside the global claim lock, then refresh inventory for ordinary admission.
    requeue_verified(host, lane_prs(name))
    claim = Locked(host.state / "claim.lock", blocking=True)
    try:
        ready_candidates = fix_candidates(name) if remediation.escalation_enabled() else []
    finally:
        claim.release()
    arm_ready_prs(host, ready_candidates)
    claim = Locked(host.state / "claim.lock", blocking=True)
    # The claim lock serializes the scan, so the shared cache fill happens once. A rate
    # limit skips the API for every worker until the cooldown file expires.
    red = adopt = issue = route_decision = None
    rate_limited = False
    try:
        # Finish before starting: PRs a GitHub event queued, red PRs (any open PR in the repo),
        # then ungated lane drafts, then new issues.
        # A remote-only lane (Hyperagent) cannot repair a local checkout: it only claims issues,
        # and the local lanes repair its PRs like any orphan (`repairs: false`).
        local = spec.get("repairs") is not False
        candidates = fix_candidates(name) if local else []
        # Reclaimed abandoned drafts (the only non-lane drafts among the fix candidates) are
        # gated and readied like this lane's own drafts. Derived from the one cached scan so
        # no extra inventory read happens per worker pass.
        lane_owned = lane_prs(name) if local else []
        owned_numbers = {pr["number"] for pr in lane_owned}
        prs = lane_owned + [pr for pr in candidates if pr.get("isDraft") and pr["number"] not in owned_numbers]
        events = pr_events.queued_prs(THIS, pr_events.FIX_KINDS) if local else []
        if local:
            escalate_exhausted(host, list({pr["number"]: pr for pr in candidates + events}.values()), linear)
        red = local and (pr_events.claim_event_pr(host, THIS, name, events)
                         or claim_escalation_pr(host, name, candidates)
                         or claim_red_pr(host, name, candidates)) or None
        adopt = None if red or not local or not provider_may_run(name, "adopt") \
            else claim_adoptable_pr(host, name, prs, candidates)
        if local:
            selected = {red["number"]} if red else {adopt.pr["number"]} if adopt else set()
            try:
                record_maintenance_demand(host, name, prs, candidates, events, selected)
            except Exception:
                pass  # Demand telemetry cannot prevent this selected repair.
        labeled = None if red or adopt or not local else claim_labeled_event(host, name, linear)
        issue = labeled
        if local:
            sweep_lane_prs(host, name, linear)
        if local and not (red or adopt or labeled):
            publish_exhausted_repairs(host, name, candidates)
        # JOV-7514 budgets stay on configured base slots. Scaling the cap with the
        # autoscaled count would admit more parked PRs as capacity rises.
        budget = None if red or adopt or labeled else read_new_issue_budget(name, host.base_slots(name, spec.get("slots", 1)))
        blocked = budget is not None and not budget["allowed"]
        in_flight = None if red or adopt or blocked or labeled else in_flight_issues()
        overlap_blocked = False
        overlap_unreadable = False
        overlap_prediction = None
        if labeled is None and in_flight is not None:
            failures = json.loads(failures_path(host).read_text()) if failures_path(host).exists() else {}
            pool = linear.lane_issues(spec["label"])
            holds = open_hotspot_holds()
            held_back = held_back_issues(host)
            overlap_inventory_rows = overlap_inventory(host, linear)
            overlap_unreadable = overlap_inventory_rows is None
            overlap_prs, overlap_tasks = overlap_inventory_rows or ([], [])
            router = issue_router(host, name)
            while pool and not overlap_unreadable:
                issue = design_gate.pick_build_issue(
                    pool, failures, in_flight=in_flight, provider=name,
                    pick=lambda *args, **kwargs: pick_issue(*args, holds=holds, held_back=held_back,
                                                            route=router, **kwargs),
                    linear=linear, repo=host.repo)
                if issue is None:
                    break
                admission = file_overlap.admission_decisions(
                    host, THIS, issue, overlap_prs, overlap_tasks, workstreams.classify)
                if not admission["allowed"]:
                    overlap_blocked = True
                    rejected = issue.identifier
                    issue = None
                    pool = [candidate for candidate in pool if candidate.identifier != rejected]
                    continue
                overlap_prediction = admission
                route_decision = router.decisions.get(issue.identifier) if router else None
                if linear.state_of(issue.id) != "Todo":
                    issue = None  # another host claimed it between our read and now
                    break
                linear.move(issue.id, "In Progress")
                file_overlap.reserve_task(host.state, issue, overlap_prediction)
                break
        if red is None and adopt is None and issue is None:
            pr_events.cleanup_one_event(host, THIS, events)
    except LinearRateLimited:
        # A repair already chosen can proceed without another Linear read. An idle scan stops.
        issue = None
        rate_limited = red is None and adopt is None
    finally:
        claim.release()
    if rate_limited:
        record_idle_exit(host, name, "linear-rate-limited")
        slot.release()
        return 0
    if red is not None or adopt is not None or issue is not None:
        claim = Locked(host.state / "claim.lock", blocking=True)
        try: yield_deferred_requeues(host, name)
        finally: claim.release()
    if red is not None or adopt is not None:
        if red is not None:
            fix_red_pr(host, name, spec, red)
        else:
            adopt_pr(host, name, adopt.pr, claim=adopt)
        slot.release()
        return reexec(host, name)
    if issue is None:
        record_idle_exit(host, name, budget["reason"] if blocked else
                         "in-flight-unknown" if in_flight is None else
                         "file-overlap-inventory-unavailable" if overlap_unreadable else
                         "file-overlap-blocked" if overlap_blocked else "none-eligible")
        slot.release()
        return 0
    if route_decision and route_decision.get("chosen"):
        log_route(host, name, route_decision)
        spec = {**spec, "model": route_decision["chosen"]["model"], "route": route_decision}
    notify_issue_claim(linear, issue, name, spec)
    runner = run_brief if design_gate.wants_brief(issue, host.repo) else run_issue
    try:
        receipt = runner(host, name, spec, linear, issue)
    finally:
        file_overlap.release_task(host.state, issue.identifier)
    verdict = receipt.get("verdict")
    note_event_outcome(host, issue, verdict)
    if verdict == "disk-held":
        linear.move(issue.id, "Todo")
        slot.release()
        return 1  # do not charge the issue's retry budget or re-exec into pressure
    if verdict == "duplicate-active":
        linear.comment(issue.id, "🤖 lane claim reconciled to the existing durable attempt; no second provider call ran.")
        slot.release()
        return reexec(host, name)
    if verdict == "recovery-handoff":
        linear.move(issue.id, "Backlog")
        handoff = receipt["recovery"]
        noted = note_recovery_handoff(host, issue.identifier)
        if noted["comment"]:
            repeat = (f" Handed back {noted['count']} times; claims back off up to "
                      f"{HANDOFF_BACKOFF_CAP_S // 3600}h and stay silent until reconciled."
                      if noted["count"] > 1 else "")
            linear.comment(issue.id, f"Preserved work retained at `{handoff['worktree']}`. "
                                     f"Recovery owner: {handoff['owner']}; reason: {handoff['reason']}. "
                                     f"{handoff['nextAction']}{repeat}")
        slot.release()
        return reexec(host, name)
    if verdict == "quarantined":
        # A terminal generation must not sit in a generic work queue (JOV-7089): Backlog is the
        # explicit human-decision disposition, out of Todo/Triage until a valid re-entry.
        linear.move(issue.id, "Backlog")
        linear.comment(issue.id, f"🤖 lane stopped at the durable execution terminal ({receipt['reasons'][0]}). "
                                 "Disposition: needs human decision. Re-entry requires new authoritative "
                                 "revision evidence or a bounded policy override.")
        slot.release()
        return reexec(host, name)
    if verdict == "provider-error":
        cooldown = host.state / "cooldown" / name
        cooldown.parent.mkdir(parents=True, exist_ok=True)
        cooldown.write_text(str(time.time() + PROVIDER_COOLDOWN_S))
        linear.move(issue.id, "Backlog")
        linear.comment(issue.id, f"🤖 lane `{name}` provider failed before working the issue "
                                 f"({', '.join(receipt.get('reasons', []))}); unknown outcome quarantined, lane "
                                 "cooling down. Disposition: blocked on the provider dependency; re-entry "
                                 "once a healthy lane or a human clears it.")
        slot.release()
        return 1
    if verdict == "remote-held":
        # Leave remote ownership In Progress. Retrying a local worktree or
        # another model would duplicate a live/unknown paid remote attempt.
        linear.comment(issue.id, f"🤖 lane `{name}` remote hold ({', '.join(receipt.get('reasons', []))}); "
                                 "resume/reconcile the existing thread; no provider failover ran.")
        slot.release()
        return 1
    if verdict in {"gate-in-progress", "gate-deferred", "gate-already-completed"}:
        linear.comment(issue.id, f"🤖 lane `{name}`: PR {receipt.get('prUrl')} remains with its exact-head gate "
                                 f"({verdict}); no issue retry charged and no new certification claimed.")
    elif verdict in ("brief-complete", "brief-incomplete"):
        linear.move(issue.id, "Todo")  # complete: the next claim builds it; incomplete: gate holds it
    elif verdict == "not-shippable":
        linear.move(issue.id, "Backlog")
        linear.comment(issue.id, f"🤖 lane `{name}` judged this not code-shippable: {receipt['reasons'][0]}\n"
                                 "Disposition: obsolete/invalid — needs a human decision, not a work queue.")
    elif verdict in ("landing", "verified-not-queued"):
        linear.comment(issue.id, f"🤖 lane `{name}`: PR {receipt.get('prUrl')} passed the lane gate and is "
                                 f"{'queued' if verdict == 'landing' else 'verified; enqueue retry pending'}; required checks and the merge queue decide.")
    elif verdict == "held" and receipt.get("pr"):
        # One PR per issue: the fix loop repairs it on the same branch instead of a fresh attempt.
        linear.comment(issue.id, f"🤖 lane `{name}`: the lane gate held PR {receipt.get('prUrl')} "
                                 f"({', '.join(receipt.get('reasons', []))}); the lane will fix it on that branch.")
    elif verdict == "gate-timeout" and receipt.get("pr"):
        # The PR exists and the issue stays In Progress; the adopt loop re-gates the head.
        linear.comment(issue.id, f"🤖 lane `{name}`: PR {receipt.get('prUrl')} is open; the lane gate timed out "
                                 f"on this host ({', '.join(receipt.get('reasons', []))}) and will retry.")
    else:
        claim = Locked(host.state / "claim.lock", blocking=True)
        try:
            failures = json.loads(failures_path(host).read_text()) if failures_path(host).exists() else {}
            count = failure_record(failures.get(issue.identifier))["count"] + 1
            failures[issue.identifier] = {"count": count, "at": time.time(),
                                          **pr_events.failure_reason(receipt, count >= MAX_FAILURES)}
            failures_path(host).write_text(json.dumps(failures))
        finally:
            claim.release()
        exhausted = failures[issue.identifier]["count"] >= MAX_FAILURES
        # A run that exhausted its bounded retries is terminal: Backlog under an explicit
        # disposition, not generic Triage admission (JOV-7089).
        linear.move(issue.id, "Backlog" if exhausted else "Todo")
        linear.comment(issue.id, f"🤖 lane `{name}`: {verdict} ({', '.join(receipt.get('reasons', []))}). "
                                 + ("Terminal after 3 attempts — disposition: needs human decision; "
                                    "re-entry requires new authoritative evidence or a certified policy "
                                    "override (JOV-7089)." if exhausted else "Back to Todo."))
    slot.release()
    return reexec(host, name)


def reexec(host: Host, name: str) -> int:
    """Slot free -> pull the next piece of work now, on whatever release is current (drain-safe)."""
    if lifecycle.draining(host.state):
        return 0  # admitted unit finished; do not acquire another assignment
    current = host.state / "current" / "lane_runner.py"
    lifecycle.prepare_reexec()
    os.execv(sys.executable, [sys.executable, str(current if current.exists() else Path(__file__)),
                              "worker", "--provider", name])
    return 0


def ensure_full_history(host: Host) -> None:
    """Repo gates check git ancestry (e.g. story provenance); a shallow clone fails them for
    every PR. Clones made with --reference to a shallow mirror inherit that, so repair it."""
    if sh(["git", "rev-parse", "--is-shallow-repository"], cwd=host.repo).stdout.strip() == "true":
        sh(["git", "fetch", "-q", "--unshallow", "origin"], cwd=host.repo, timeout=1800)


def dispatch(host: Host) -> int:
    tick = {"at": now_iso(), "release": read_marker(host), "unhealthy": [], "spawned": [],
            "error": None, "admissionDenied": None}
    try:
        tick["disk"] = disk_guard.check(host)
        if autoscale.mode() != "off":
            try:
                bases = {name: (host.base_slots(name, spec.get("slots", 1)) if spec.get("enabled", True) else 0)
                         for name, spec in load_providers().items()}
                tick["autoscale"] = autoscale.apply_tick(host.state, tick, bases)
            except Exception as error:  # a bad sample never blocks the spawn loop
                tick["autoscaleError"] = f"{type(error).__name__}: {error}"[:200]
        try:
            # Before admission: a critically full disk is exactly when the sweep must still run.
            tick["worktreeSweep"] = worktree_sweep.maybe_spawn(host.state, host.repo, tick["disk"].get("freePct"))
        except Exception as error:  # the sweep never takes dispatch down
            tick["worktreeSweep"] = f"{type(error).__name__}: {error}"[:200]
        if not tick["disk"].get("admitted"):
            raise DiskAdmissionError(tick["disk"].get("reason", "disk-unobservable"))
        ensure_full_history(host)
        try:
            tick["remediationEvents"] = claim_remediation_events(host, Linear(host.linear_env))
        except Exception as error:  # the label scan never takes worker spawn down
            tick["remediationEventsError"] = f"{type(error).__name__}: {error}"[:200]
            try:
                tick["remediationEvents"] = _event_delivery_snapshot(host, time.time())
            except Exception as status_error:
                tick["remediationDeliveryStatusError"] = f"{type(status_error).__name__}: {status_error}"[:200]
        for name, spec in load_providers().items():
            slots = host.slots(name, spec.get("slots", 1))
            # LANES_SLOTS_<P>=0 scopes a provider off this host: no health probe, no provider-down alert.
            if not spec.get("enabled", True) or slots == 0 or cooling(host, name):
                continue
            if not provider_healthy(spec):
                tick["unhealthy"].append(name)
                continue
            for _ in range(slots):
                subprocess.Popen([sys.executable, str(Path(__file__)), "worker", "--provider", name],
                                 stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                 start_new_session=True, **lifecycle.spawn_kwargs())
                tick["spawned"].append(name)
    except DiskAdmissionError as error:
        # Deliberate backpressure, not a tick fault: the doctor's disk-critical/disk-low
        # alert already names the cause. Recording it as a tick error would raise a
        # duplicate tick-error issue no agent can act on (JOV-8024).
        tick["admissionDenied"] = str(error)
    except Exception as error:  # the tick must still leave a receipt the doctor can raise
        tick["error"] = f"{type(error).__name__}: {error}"[:300]
    if tick["error"] or tick.get("admissionDenied"):
        # A denied tick must not launch another worker through ancillary event paths.
        return finish_dispatch(host, tick)
    try:
        tick["events"] = pr_events.tick(host, THIS, lambda: Linear(host.linear_env))
    except Exception as error:  # the ready/orphan queue never takes dispatch down
        tick["eventsError"] = f"{type(error).__name__}: {error}"[:200]
    try:
        tick["reason"] = reason_lane.tick(host, THIS, lambda: Linear(host.linear_env))
    except Exception as error:  # Summer's reasoning jobs never take dispatch down
        tick["reasonError"] = f"{type(error).__name__}: {error}"[:200]
    try:
        corpus_owner = os.environ.get("YC_CORPUS_OWNER", "gem").split(".")[0]
        tick["ycCorpus"] = (yc_corpus.tick(host.state) if HOST == corpus_owner else
                            {"status": "not-owner", "owner": corpus_owner})
    except Exception as error:  # external knowledge freshness never takes dispatch down
        tick["ycCorpusError"] = f"{type(error).__name__}: {error}"[:200]
    return finish_dispatch(host, tick)


def finish_dispatch(host: Host, tick: dict) -> int:
    """Retain production observation and doctor alerts even when worker admission fails."""
    try:
        tick["continuity"] = continuity_clock.tick(host.state, HOST)
    except Exception as error:  # liveness must not suppress the existing doctor
        tick["continuity"] = {"status": "failed", "error": type(error).__name__}
    update_json(host.state / "tick.json", lambda data: (data.clear(), data.update(tick)))
    try:
        doctor.run(host, sys.modules[__name__], codex_lane_module())
    except Exception as error:  # never let the doctor take dispatch down
        update_json(host.state / "tick.json", lambda data: data.update(doctorError=f"{type(error).__name__}: {error}"[:200]))
    return 1 if tick["error"] or tick.get("admissionDenied") else 0


def read_marker(host: Host) -> str | None:
    try:
        return (host.state / "current" / ".tree").read_text().strip()[:7]
    except OSError:
        return None


def codex_lane_module():
    import importlib.util
    spec = importlib.util.spec_from_file_location("codex_lane", HERE / "codex_lane.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def cooling(host: Host, name: str) -> bool:
    path = host.state / "cooldown" / name
    try:
        return float(path.read_text()) > time.time()
    except (OSError, ValueError):
        return False


class WorktreeUnavailable(Exception):
    """git could not create the run's worktree (branch merged/deleted, git lock contention)."""


def add_worktree(host: Host, args: list[str], log) -> None:
    added = sh(["git", "worktree", "add", "-q", *args], cwd=host.repo, log=log)
    if added.returncode != 0:
        raise WorktreeUnavailable((added.stderr or f"git exit {added.returncode}").strip()[:200])


def record_worktree_disposition(host: Host, worktree: Path, verdict: str, reason: str | None = None) -> None:
    """Receipt for every cleanup decision — the journal is the audit, not the act."""
    try:
        runs = host.state / "runs"
        runs.mkdir(parents=True, exist_ok=True)
        with open(runs / "worktree-removals.jsonl", "a") as out:
            out.write(json.dumps({"schema": "jovie-worktree-removal/v1", "worktree": str(worktree),
                                  "verdict": verdict, "reason": reason, "owner": HOST,
                                  "at": now_iso()}) + "\n")
    except OSError:
        pass


def remove_worktree(host: Host, worktree: Path) -> None:
    """Protected source is never cleanup; process ownership belongs to run_agent."""
    if not worktree.exists() or (worktree / disk_guard.PRESERVED_REPAIR).exists():
        return
    busy = worktree_busy(worktree)
    if busy:
        record_worktree_disposition(host, worktree, "preserved", busy)
        preserve_repair(worktree, {"runId": worktree.name, "reasons": [f"cleanup-not-idle:{busy}"]})
        return
    status = sh(["git", "status", "--porcelain"], cwd=worktree)
    if status.returncode or status.stdout.strip():
        record_worktree_disposition(host, worktree, "preserved", "source-unverified")
        preserve_repair(worktree, {"runId": worktree.name, "reasons": ["cleanup-source-unverified"]})
        return
    unpushed = sh(["git", "rev-list", "--count", "HEAD", "--not", "--all"], cwd=worktree)
    if unpushed.returncode or unpushed.stdout.strip() != "0":
        record_worktree_disposition(host, worktree, "preserved", "unpublished-work")
        preserve_repair(worktree, {"runId": worktree.name, "reasons": ["cleanup-unpublished-work"]})
        return
    # Proven clean and published: hand it to the next run installed, instead of spending
    # minutes deleting ~230k node_modules files (JOV-7723).
    slot = worktree_pool.recycle(host.repo, worktree)
    record_worktree_disposition(host, worktree, "recycled" if slot else "removed", slot)
    if not slot:
        sh(["git", "worktree", "remove", "--force", str(worktree)], cwd=host.repo)


def prune_worktrees(host: Host, max_age_s: int = 6 * 3600) -> None:
    """Garbage-collect worktrees a crashed worker left behind; never touch young ones."""
    root = host.state / "worktrees"
    if not root.exists():
        return
    for path in root.iterdir():
        if (path / disk_guard.PRESERVED_REPAIR).exists():
            continue
        try:
            stale = time.time() - path.stat().st_mtime > max_age_s
        except FileNotFoundError:
            continue  # a worker removed it between listing and stat
        if stale:
            remove_worktree(host, path)
            if not (path / disk_guard.PRESERVED_REPAIR).exists():
                shutil.rmtree(path, ignore_errors=True)
    sh(["git", "worktree", "prune"], cwd=host.repo)


def needs_update(current_tree: str | None, main_tree: str) -> bool:
    return bool(main_tree) and current_tree != main_tree


def read_marker(host: Host) -> str | None:
    try:
        return (host.state / "current" / ".tree").read_text().strip()[:7]
    except OSError:
        return None


def update(host: Host) -> int:
    """Install origin/main's scripts/lanes as a new release after its own tests pass.
    Only the `current` symlink moves; running workers finish on their release. The outcome is
    written to update.json so a refused release is an alert, not a traceback in a journal."""
    try:
        code = install_release(host)
        error = None if code == 0 else "release tests failed"
    except Exception as failure:
        code, error = 1, f"{type(failure).__name__}: {failure}"[:300]
    update_json(host.state / "update.json", lambda data: (data.clear(), data.update(
        at=now_iso(), ok=code == 0, error=error, current=read_marker(host))))
    return code


def release_identity(host: Host) -> dict:
    """Pin one main commit, then fingerprint exactly the managed release contents."""
    read = sh(["git", "rev-parse", "--verify", "origin/main^{commit}"], cwd=host.repo)
    revision = read.stdout.strip()
    if read.returncode or not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise RuntimeError("release-source-unavailable")
    paths = sorted({"scripts/lanes", *RELEASE_EXTRAS, *LANE_TESTS})
    read = sh(["git", "rev-parse", *(f"{revision}:{path}" for path in paths)], cwd=host.repo)
    objects = read.stdout.splitlines()
    if read.returncode or len(objects) != len(paths) or any(not re.fullmatch(r"[0-9a-f]{40}", oid) for oid in objects):
        raise RuntimeError("release-bundle-incomplete")
    manifest = dict(zip(paths, objects))
    digest = hashlib.sha256(json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return {"schema": "jovie-lane-release-bundle/v1", "sourceCommit": revision,
            "bundleDigest": digest, "objects": manifest}


# Per-host tuning (LANES_SLOTS_DEVIN=2, SYMPHONY_FILE_OVERLAP_GUARD=flag, ...) must not reach the
# release self-test: the fixtures assume defaults, so a tuned host refused every release.
HOST_KNOB_PREFIXES = ("LANES_", "SYMPHONY_", "CODEX_LANE_")


def selftest_env(scratch: Path) -> dict:
    env = {key: value for key, value in os.environ.items() if not key.startswith(HOST_KNOB_PREFIXES)}
    return {**env, "LANES_SELFTEST": "1", "LANES_STATE": str(scratch)}


# The installed packages mesh-runtime-bundle.mjs compiles against (exact pins checked there).
MESH_DEPENDENCY_PINS = ("apps/desktop/node_modules/esbuild/package.json",
                        "packages/agent-transport-contracts/node_modules/zod/package.json")


def mesh_dependency_root(host: Host) -> Path | None:
    """The host repo when it is installed; otherwise the newest ready worktree-pool slot that
    is. The Mac lanes repo is a bare source checkout with no node_modules, so every release
    since 2026-10-09 was refused ("mesh runtime dependency closure failed") and no lane fix
    reached that host. Pool slots are installed from origin/main, the same lock the staging
    bundle carries."""
    def installed(root: Path) -> bool:
        return all((root / pin).is_file() for pin in MESH_DEPENDENCY_PINS)
    if installed(host.repo):
        return host.repo
    try:
        slots = worktree_pool.ready_slots(worktree_pool.pool_dir(host.repo))
    except (OSError, subprocess.CalledProcessError):
        slots = []
    return next((slot for slot in slots if installed(slot)), None)


def prove_staging(host: Host, staging: Path) -> str | None:
    """Compile the mesh runtime and run the release self-test inside a staged tree. Returns the
    refusal reason, or None when the tree may be activated. Writes only under `staging`."""
    # The self-test must never touch this host's live state: point it at a scratch dir.
    scratch = staging / ".selftest-state"
    scratch.mkdir(exist_ok=True)
    # Raw ports import workspace TypeScript/Zod. Compile from the immutable
    # archive with the host repo's existing identical pins before activation;
    # no dependency installation or running-worker mutation is permitted.
    dependency_root = mesh_dependency_root(host) or host.repo
    try:
        runtime = lifecycle.run(["node", str(staging / "scripts/lanes/mesh-runtime-bundle.mjs"),
                                 str(staging.resolve()), str(dependency_root.resolve())],
                                cwd=staging, capture_output=True, text=True, timeout=60,
                                env=worktree_pool.node_env(staging))
    except subprocess.TimeoutExpired:
        return "mesh runtime closure timeout"
    if runtime.returncode != 0:
        print(runtime.stderr[-2000:], file=sys.stderr)
        return "mesh runtime dependency closure failed"
    # ~60 s on an idle host; simulator/xcodebuild load from other sessions (load avg ~600 on
    # 2026-09-28) pushed it past 300 s, so every release was refused and fixes never landed.
    try:
        test = lifecycle.run([sys.executable, "-m", "unittest", "-q", *LANE_TESTS],
                              cwd=staging, capture_output=True, text=True, timeout=UPDATE_TEST_TIMEOUT_S,
                              env=selftest_env(scratch))
    except subprocess.TimeoutExpired:
        return f"self-test timeout {UPDATE_TEST_TIMEOUT_S}s"
    if test.returncode != 0:
        print(test.stderr[-2000:], file=sys.stderr)
        return "release tests failed"
    return None


def install_release(host: Host) -> int:
    if sh(["git", "fetch", "-q", "origin", "main"], cwd=host.repo).returncode:
        raise RuntimeError("release-source-fetch-failed")
    bundle = release_identity(host)
    tree = bundle["bundleDigest"]
    current = host.state / "current"
    marker = current / ".bundle"
    if not needs_update(marker.read_text().strip() if marker.exists() else None, tree):
        return 0
    release = host.state / "releases" / tree
    refused_path = host.state / "update-refused.json"
    refused = json.loads(refused_path.read_text()) if refused_path.exists() else {}
    if not release.exists() and refused.get("tree") == tree and time.time() - refused.get("at", 0) < UPDATE_RETRY_S:
        print(f"lane update backing off: tree {tree[:7]} was refused {refused.get('why')}", file=sys.stderr)
        return 1
    if not release.exists():
        staging = host.state / "releases" / f".{tree}.tmp"
        shutil.rmtree(staging, ignore_errors=True)
        staging.mkdir(parents=True)
        archive = lifecycle.run(["git", "archive", bundle["sourceCommit"], "scripts/lanes", *RELEASE_EXTRAS, *LANE_TESTS],
                                 cwd=host.repo, capture_output=True, check=True)
        lifecycle.run(["tar", "-x", "-C", str(staging)], input=archive.stdout, check=True)
        def refuse(why: str) -> int:
            refused_path.write_text(json.dumps({"tree": tree, "at": time.time(), "why": why}))
            return 1
        # The staged tree proves itself with its own installer code. On 2026-10-10 the Mac
        # refused every release for a day because the *installed* installer chose a bare
        # dependency root; the fix was on main but could never run. An older staged tree
        # without the subcommand is proven by this copy, as before.
        try:
            proof = lifecycle.run([sys.executable, str(staging / "scripts/lanes/lane_runner.py"),
                                   "prove-staging", str(staging)],
                                  cwd=staging, capture_output=True, text=True,
                                  timeout=60 + UPDATE_TEST_TIMEOUT_S,
                                  # The staged installer must see this host, not the process defaults.
                                  env={**os.environ, "LANES_STATE": str(host.state), "LANES_REPO": str(host.repo)})
        except subprocess.TimeoutExpired:
            refuse(f"self-test timeout {UPDATE_TEST_TIMEOUT_S}s")
            raise
        if proof.returncode == 2 and "invalid choice" in proof.stderr:
            why = prove_staging(host, staging)
        else:
            why = None if proof.returncode == 0 else (proof.stdout.strip().splitlines() or ["staging proof failed"])[-1]
            if why and proof.stderr:
                print(proof.stderr[-2000:], file=sys.stderr)
        if why:
            print(f"lane update refused: {why}", file=sys.stderr)
            return refuse(why)
        (staging / "scripts/lanes/.tree").write_text(bundle["objects"]["scripts/lanes"])
        (staging / "scripts/lanes/.bundle").write_text(tree)
        (staging / "scripts/lanes/.release.json").write_text(json.dumps(bundle, sort_keys=True))
        staging.rename(release)
    link = host.state / ".current.tmp"
    if link.is_symlink() or link.exists():
        link.unlink()
    link.symlink_to(release / "scripts/lanes")
    os.replace(link, current)
    return 0


def load_github_env(path: Path = Path.home() / ".config/jovie-lanes/github.env",
                    app_key: Path = Path.home() / ".config/jovie-lanes/jovie-bot.pem",
                    shim_dir: Path | None = None) -> None:
    """A host-specific GitHub identity so each host spends its own API budget instead of everyone
    sharing Tim's token (its secondary limit throttled every lane on 2026-09-27, JOV-6878).
    An explicit GH_TOKEN in github.env wins; otherwise, with the Jovie Bot app key present, a `gh`
    shim first on PATH mints a fresh 1h installation token (cached) for every gh call, including
    the agents' own, so a long run never outlives its token. Calls aimed at a different GH_HOST
    (offline harnesses, other enterprises) keep the caller's credentials — the bot token is a
    github.com installation token and would be wrong there."""
    try:
        for line in path.read_text().splitlines():
            key, _, value = line.strip().removeprefix("export ").partition("=")
            if key in ("GH_TOKEN", "GITHUB_TOKEN") and value:
                os.environ["GH_TOKEN"] = value.strip().strip('"').strip("'")
                return
    except OSError:
        pass
    if not app_key.exists():
        return
    real = shutil.which("gh")
    shim_dir = shim_dir or Path(os.environ.get("LANES_STATE", Path.home() / ".local/state/jovie-lanes")) / "bin"
    if not real or Path(real).parent == shim_dir:
        return
    shim_dir.mkdir(parents=True, exist_ok=True)
    shim = shim_dir / "gh"
    # App installation tokens cannot touch user gists (403), and the status feed is Tim's gist:
    # `gh gist` keeps the host's own login. A caller that targets another host
    # (GH_HOST, e.g. the offline real-gh test harness) keeps its own credentials:
    # the Jovie Bot installation token only exists for github.com.
    shim.write_text(f'#!/bin/sh\n[ "$1" = gist ] && exec {real} "$@"\n'
                    f'[ -n "${{GH_HOST:-}}" ] && [ "$GH_HOST" != github.com ] && exec {real} "$@"\n'
                    f'GH_TOKEN="$(python3 {HERE / "gh_app_token.py"} --guard "$@")" || exit $?\n'
                    f'export GH_TOKEN\nexec {real} "$@"\n')
    shim.chmod(0o755)
    os.environ["PATH"] = f"{shim_dir}{os.pathsep}{os.environ.get('PATH', '')}"


def graphql_budget() -> tuple[int, str] | None:
    """GraphQL points left and reset time, asked of GraphQL itself. REST `rate_limit` kept
    reporting 4754 left while GraphQL was at 0/5000 (2026-09-27), so every lane listing
    failed while the doctor saw a healthy budget. None when GitHub cannot be read."""
    try:
        result = subprocess.run(["gh", "api", "graphql", "-f", "query={rateLimit{remaining resetAt}}"],
                                capture_output=True, text=True, timeout=30)
        limit = json.loads(result.stdout)["data"]["rateLimit"]
        return int(limit["remaining"]), str(limit["resetAt"])
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        return None


def guarded_main(argv: list[str] | None = None) -> int:
    disk_guard.ensure_sbin_on_path()
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("dispatch")
    sub.add_parser("update")
    prove = sub.add_parser("prove-staging", help="prove a staged release tree with this tree's own installer")
    prove.add_argument("staging")
    gate = sub.add_parser("gate-command", help="run one gate command while retaining inherited locks")
    gate.add_argument("--timeout", type=float, required=True)
    gate.add_argument("--result-fd", type=int)
    gate.add_argument("--separate-stderr", action="store_true")
    gate.add_argument("--child-state")
    gate.add_argument("args", nargs=argparse.REMAINDER)
    context = sub.add_parser("context-manifest", help="check or generate the local context contract")
    context.add_argument("--write", action="store_true")
    work = sub.add_parser("worker")
    work.add_argument("--provider", required=True)
    args = parser.parse_args(argv)
    if args.command == "gate-command":
        command = args.args[1:] if args.args[:1] == ["--"] else args.args
        if args.child_state is not None:
            os.environ["LANES_STATE"] = args.child_state
        def report_outcome(receipt):
            if args.result_fd is not None:
                try:
                    os.write(args.result_fd, json.dumps(receipt).encode())
                except BrokenPipeError:
                    pass  # dead controller; command is already proven drained
                finally:
                    os.close(args.result_fd)
        try:
            code = run_agent(command, Path.cwd(), sys.stdout, args.timeout, guard_interval=.1,
                             _lifecycle_helper=True, _lifecycle_terminal=args.result_fd is not None,
                             stderr=sys.stderr if args.separate_stderr else subprocess.STDOUT).returncode
            report_outcome({"returncode": code, "timeout": False})
            return 125 if code == 124 else code  # 124 is reserved for a drained timeout
        except subprocess.TimeoutExpired:
            report_outcome({"returncode": None, "timeout": True})
            return 124  # run_agent has drained its observed descendants before raising
        except CommandNotStarted as error:
            report_outcome({"spawnError": {"errno": error.errno,
                            "strerror": error.strerror, "filename": error.filename}})
            return 127
        except RunStopped:
            return 143  # explicit stop also completes the existing drain protocol
        except devin_free_policy.FreeProofHeld as error:
            # This policy error is returned only after run_agent drained its owned
            # tree (or refused Popen). A cleanup failure replaces the exception and
            # still enters the cleanup-unproven lock hold below.
            report_outcome({"returncode": 75, "policyHeld": str(error), "timeout": False})
            print(f"devin-free-policy-held:{error}", file=sys.stderr, flush=True)
            return 75
        except BaseException as error:
            # A cleanup error is not proof that the descendants stopped. Keep the
            # inherited locks and leave an observable operator boundary, not a retry.
            try:
                print(f"gate-cleanup-unproven:{type(error).__name__}:{error}; locks retained; operator required",
                      file=sys.stderr, flush=True)
            except OSError:
                pass
            while True:
                time.sleep(60)
    if args.command == "context-manifest":
        path = HERE / "context-manifest.json"
        generated = context_manifest_json()
        if args.write:
            path.write_text(generated, encoding="utf-8")
        matched = context_manifest_matches(path)
        print(json.dumps({"schema": "jovie-lane-context-generation/v1", "path": str(path),
                          "sha256": hashlib.sha256(generated.encode("utf-8")).hexdigest(),
                          "written": args.write, "matched": matched}, sort_keys=True))
        return 0 if matched else 1
    load_github_env()
    host = Host()
    if args.command == "update":
        return update(host)
    if args.command == "prove-staging":
        why = prove_staging(host, Path(args.staging))
        if why:
            print(why)
            return 1
        return 0
    if args.command == "worker":
        return worker(host, args.provider)
    return dispatch(host)


def main(argv: list[str] | None = None) -> int:
    try:
        host = Host()
        arguments = sys.argv[1:] if argv is None else argv
        with lifecycle.Guard(host.state, allow_drain=arguments[:1] == ["gate-command"]):
            if lifecycle.draining(host.state) and arguments[:1] != ["gate-command"]:
                return 75
            return guarded_main(argv)
    except lifecycle.AdmissionHeld as error:
        print(f"lifecycle admission held: {error}", file=sys.stderr)
        return 75


if __name__ == "__main__":
    sys.exit(main())
