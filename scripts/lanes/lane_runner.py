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
import copy
from contextlib import contextmanager, nullcontext
import fcntl
import hashlib
import importlib
import math
import json
import types
import os
import random
import re
import shutil
import socket
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))
import continuity_clock  # noqa: E402
import lifecycle  # noqa: E402
import devin_free_policy  # noqa: E402
import autoscale  # noqa: E402
import capacity_limit  # noqa: E402
import pathlib as _pl, sys as _sys  # noqa: E402
_sys.path[:0] = [p for p in [str(_pl.Path(__file__).resolve().parent)] if p not in _sys.path]  # sibling module of the release
from atomic_state import atomic_write_text  # noqa: E402
import disk_guard  # noqa: E402  (sibling module of the release)
import git_housekeeping  # noqa: E402  (detached git maintenance vs cleanup)
import fleet_gate_emitter  # noqa: E402
import doctor  # noqa: E402  (sibling module of the release)
import execution_attempt  # noqa: E402
import file_overlap  # noqa: E402
import claude_lane  # noqa: E402  (subscription quota bank read by the router)
import hyperagent_lane  # noqa: E402
import hyperagent_repair  # noqa: E402
import migration_renumber  # noqa: E402  (no-model fix for migration number collisions)
import fix_red_classes  # noqa: E402  (fingerprint + deterministic routing of fix-red failures)
from gh_budget import gh_call  # noqa: E402  (budgeted gh for new lane code)
import machine_gap  # noqa: E402
import slot_yield  # noqa: E402  (slot ceilings from measured merged-per-dollar)  (abstraction gate: build the machine on the 3rd repeat or a costly task)
import update_drain  # noqa: E402  (drain gate admission while an update waits)
import linear_app_token  # noqa: E402  (Jovie Lanes OAuth app quota, separate from Tim's user)
import linear_sync  # noqa: E402  (local issue mirror, claim ledger, write outbox)
import ownership  # noqa: E402  (started-state live-owner invariant)
import fleet_ledger  # noqa: E402  (external agent claims, stranded-claim view)
import pr_events  # noqa: E402
import remediation  # noqa: E402  (classifier, router, escalation ladder)
import shipping_attribution  # noqa: E402  (receipt-first merged-PR provenance)
import workstreams  # noqa: E402  (shared workstream rank + duplicate identity)
import worktree_sweep  # noqa: E402  (idle / merged-PR checkout retirement, JOV-7704)
import worktree_pool  # noqa: E402  (pre-installed worktree pool, JOV-7705)
import reason_lane  # noqa: E402
import outcome_lane  # noqa: E402
import throughput_sentinel  # noqa: E402
import taste_default  # noqa: E402
import yc_corpus  # noqa: E402
import credentials_spend  # noqa: E402
import model_family_sync  # noqa: E402
import capacity_live  # noqa: E402  (live quota reads for the capacity registry)
import capacity_registry  # noqa: E402  (caps and policies come from ops/registry/capacity.json)
import design_gate  # noqa: E402  (IA-first admission for UI and landing work)
import qualification_guard  # noqa: E402
import dependency_diff  # noqa: E402  (immutable dependency-version chore evidence)
import bindings  # noqa: E402  (extra Linear team -> repo bindings, e.g. LYB)
import binding_refill  # noqa: E402  (Backlog -> Todo refill per extra binding)
import priority_admission  # noqa: E402  (Urgent/Summer-ranked admission, Todo WIP sanity, claim rank; JOV-7073)
import macos_pool  # noqa: E402  (shared hosted-macOS pool: measure, record, gate LYB iOS intake)
import decompose_pass  # noqa: E402  (standing epic decomposition when Todo < half target)
import epics  # noqa: E402  (epic decomposition/closure and the expiring hold)
# This module as imported: the event hooks take it as `lane`. Bound once, because other
# loaders (the HUD) may later rebind sys.modules["lane_runner"] to a fresh copy.
THIS = sys.modules[__name__]
REPO_SLUG = "JovieInc/Jovie"
# Tim 2026-10-11: every JOV Todo issue is eligible; no label is required. `agent-ready` +
# `dispatch-next` still designates bottleneck work, and a lane label (devin, codex, ...) is a
# routing preference (remediation.explicit_lane), never an admission requirement.
SHARED_LABEL = "agent-ready"
# Sensitive surfaces stay claimable, but only by SENSITIVE_PROVIDER under the guarded contract.
SENSITIVE_LABELS = frozenset({
    "billing", "blocked:payments", "stripe", "cost-monitoring", "blocked:auth", "auth",
    "area:auth", "infra", "area:infra", "infrastructure", "vercel",
})
# Tim 2026-10-11: no label parks an issue forever. `hold` is the one stop signal, and the
# reconcile pass (epics.reconcile) expires it after 72h without activity. `codex-blocked`
# only steers routing away from codex; `reasoning-job` belongs to the reason lane only when
# Summer's job block is present; `type:epic` is a decomposition unit (epics.py);
# `no-symphony` no longer excludes (the claiming agent decides what the issue needs).
HARD_EXCLUDED_LABELS = frozenset({"hold"})
CODEX_BLOCKED_LABEL = "codex-blocked"
REASONING_JOB_LABEL = "reasoning-job"
# A remote lane cannot hand the harness a local decomposition plan.
EPIC_REMOTE_LANES = frozenset({"hyperagent"})
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
    r"\b(?:live|production|prod)\b.{0,40}\b(?:prices?|pricing)\b|"
    r"\b(?:prices?|pricing)\b.{0,40}\b(?:live|production|prod)\b",
    re.IGNORECASE,
)
MAX_FAILURES = 3
MAX_FIX_ATTEMPTS = 2
REPAIR_ROUTING_UNSET = object()
REPAIR_ROUTING_SCHEMA = "jovie-repair-routing-context/v1"
MAX_GATE_TIMEOUTS = 3
CLAIM_TTL_S = pr_events.CLAIM_TTL_S
HOST = socket.gethostname().split(".")[0]
# Every file a release must pass before `current` moves to it.
LANE_TESTS = ["scripts/tests/test_factory_signals.py", "scripts/tests/test_factory_intake.py", "scripts/tests/test_update_drain.py", "scripts/tests/test_machine_gap.py", "scripts/tests/test_slot_yield.py", "scripts/tests/test_machine_metrics.py", "scripts/tests/test_lanes_atomic_state.py", "scripts/tests/test_lifecycle.py", "scripts/tests/test_execution_attempt.py", "scripts/tests/test_backlog_admission.py", "scripts/tests/test_backlog_writer_guard.py", "scripts/tests/test_lane_runner.py", "scripts/tests/test_hyperagent_lane.py", "scripts/tests/test_hyperagent_repair.py", "scripts/tests/test_fix_red_classes.py", "scripts/tests/test_migration_renumber.py",
              "scripts/tests/test_codex_lane.py", "scripts/tests/test_hud.py", "scripts/tests/test_devin_free_policy.py",
              "scripts/tests/test_doctor.py", "scripts/tests/test_pr_events.py",
              "scripts/tests/test_reason_lane.py", "scripts/tests/test_yc_corpus.py",
              "scripts/tests/test_gh_app_token.py", "scripts/tests/test_linear_app_token.py",
              "scripts/tests/test_disk_guard.py", "scripts/tests/test_qualification_guard.py",
              "scripts/tests/test_git_housekeeping.py",
              "scripts/tests/test_continuity_clock.py",
              "scripts/tests/test_worktree_sweep.py", "scripts/tests/test_service_census.py",
              "scripts/tests/test_worktree_pool.py",
              "scripts/tests/test_design_gate.py",
              "scripts/tests/test_file_overlap.py",
              "scripts/tests/test_remediation.py", "scripts/tests/test_autoscale.py",
              "scripts/tests/test_capacity_limit.py", "scripts/tests/test_capacity_registry.py", "scripts/tests/test_fleet_gate_emitter.py",
              "scripts/tests/test_claude_lane.py", "scripts/tests/test_issue_routing.py",
              "scripts/tests/test_epics.py",
              "scripts/tests/test_linear_sync.py", "scripts/tests/test_binding_refill.py", "scripts/tests/test_priority_admission.py", "scripts/tests/test_macos_pool.py",
              "scripts/tests/test_backlog_rank.py", "scripts/tests/test_decompose_pass.py",
              "scripts/tests/test_pytest_hook_names.py"]
# Dependencies outside scripts/lanes for installed source admission and the HUD's
# PROMOTION line (JOV-6836).
RELEASE_EXTRAS = ["scripts/shipping_origin.py", # Shared client layer (budgeted gh) used by the throughput sentinel.
                  "scripts/apiclient/__init__.py", "scripts/apiclient/__main__.py", "scripts/apiclient/cache.py", "scripts/apiclient/client.py", "scripts/apiclient/contract.py", "scripts/apiclient/credentials.py", "scripts/apiclient/fake.py", "scripts/apiclient/gh.py", "scripts/apiclient/github.py", "scripts/apiclient/headers.py", "scripts/apiclient/legacy.py", "scripts/apiclient/linear.py", "scripts/apiclient/policy.py", "scripts/apiclient/store.py",
                  "packages/api-client/providers.json",
                  "scripts/lib/github-rate-limit.mjs",
                  # The shipped failure-hold module uses the canonical Node client.
                  "packages/api-client/gh.ts", "packages/api-client/client.ts",
                  "packages/api-client/cache.ts", "packages/api-client/contract.ts",
                  "packages/api-client/headers.ts", "packages/api-client/policy.ts",
                  "packages/api-client/store.ts", "packages/api-client/cli.ts",
                  # Headroom file for Summer/Ovie (credentials_spend.py publishes it).
                  "scripts/rate-limit-headroom.mjs", "scripts/lib/api-budget.mjs", "ops/registry/rate-limits.json",
                  "scripts/fleet-gate/gem-priority-gate.py", "scripts/fleet-gate/closure_health.py",
                  "scripts/fleet-gate/gem_gate_contract.py", "scripts/fleet-gate/summer_ci_audit.py",
                  "scripts/fleet-gate/symphony_proof_context.py", "scripts/fleet-gate/scoped_admission.py",
                  "scripts/promotion-loss-metrics.mjs", "scripts/merge-group-failure-hold.mjs",
                  "scripts/lib/merge-group-ahead-attribution.mjs",
                  "scripts/lib/merge-group-admission.mjs",
                  "scripts/lib/source-admission-policy.mjs", "scripts/pr-fleet-rules.mjs", "scripts/lib/wins-ledger.mjs",
                  "scripts/lib/merge-group-member-policy.mjs",
                  "scripts/lib/pr-size-exclusions.mjs",
                  "scripts/lib/product-lane-classifier.mjs",
                  "scripts/lib/pr-size-guard-policy.mjs", "scripts/lib/repo-hygiene-limits.mjs",
                  "scripts/lib/pre-land-changelog.mjs", "scripts/version-fanout-guard.mjs",
                  "scripts/merge-queue-backend.mjs", "scripts/lib/merge-queue-guard.mjs",
                  ".nvmrc", "pnpm-lock.yaml", "packages/agent-transport-contracts/work-order.ts",
                  "scripts/backlog-orchestrator/summer-triage-assessment-client.mjs",
                  "scripts/backlog-orchestrator/admission-disposition.mjs",
                  "scripts/backlog-orchestrator/admission-policy.mjs",
                  "scripts/backlog-orchestrator/ownership-inventory.mjs",
                  "scripts/backlog-orchestrator/ownership-inventory.json",
                  # The doctor CLI must prepare/recheck deterministic receipts in an
                  # immutable release without checkout files or installed SDKs.
                  "packages/copy/lint.ts", "packages/copy/rules.ts", "packages/copy/writing-quality.ts",
                  "scripts/invariants/jev-gateway.mjs", "scripts/invariants/jev-shadow.mjs",
                  "scripts/invariants/jev-writing-quality.mjs", "scripts/invariants/run-outcome.mjs",
                  "scripts/invariants/writing-surfaces.mjs", "scripts/invariants/writing-surfaces-registry.json",
                  "scripts/invariants/screen-certification.mjs", "scripts/invariants/screen-decision-routing.mjs",
                  "scripts/invariants/screen-proof-resolver.mjs", "scripts/invariants/product-reference-coherence.mjs",
                  "scripts/invariants/browser-owned-input.mjs", "scripts/invariants/browser-owned-input-matrix.json",
                  "scripts/lib/playwright-png.mjs",
                  # Six-hourly credentials/spend check (credentials_spend.py) reads the reviewed registry.
                  "scripts/credentials-spend-check.mjs", "scripts/lib/credentials-live-reads.mjs",
                  "scripts/lib/credentials-registry.mjs", "scripts/lib/linear-issue-intake.mjs",
                  "scripts/lib/linear-cooldown.mjs", "ops/registry/credentials.json",
                  "ops/registry/spend.json", "ops/registry/capacity.json",
                  "scripts/backlog-orchestrator/config/model-registry.json",
                  "scripts/tests/fixtures/capacity-pricing-vectors.json",
                  "ops/registry/inventory.gen.json"]
# Preserve legacy dated run prefixes; only Hyperagent also owns the exact
# public 15-hex identity digest generated by run_hyperagent_issue.
LANE_BRANCH = re.compile(
    r"^(?=[a-z0-9-]+/jov-\d+-\d{8}|hyperagent/jov-\d+-[a-f0-9]{15}\Z)"
    r"(?P<lane>[a-z0-9-]+)/(?P<issue>jov-\d+)-(?:\d{8}|[a-f0-9]{15}\Z)"
)
RED = frozenset({"FAILURE", "TIMED_OUT", "STARTUP_FAILURE"})
# JOV-7690: a recovery-handoff run does no work, so the issue backs off exponentially
# (5 min doubling to 6 h) instead of being re-claimed on the next reexec. Linear hears
# about the first handoff and once more at HANDOFF_COMMENT_AT, never once per loop.
HANDOFF_BACKOFF_S = pr_events.HANDOFF_BACKOFF_S
HANDOFF_BACKOFF_CAP_S = 6 * 3600
HANDOFF_COMMENT_AT = 3
PRESERVED_RUN_NAME = re.compile(r"^\d{8}T\d{6}Z-(?P<issue>[A-Z]+-\d+)-")
STALE_DRAFT_S = 24 * 3600
SWEEP_EVERY_S = 1800
PROVIDER_COOLDOWN_S = 900
WORKTREE_INSTALL = ["pnpm", "install", "--frozen-lockfile", "--prefer-offline",
                    "--package-import-method=hardlink"]
# Aging breaks ties among non-urgent work; it cannot override explicit Urgent.
# Every waiting non-urgent item gains one effective level per day within its band.
PRIORITY_AGING_S = 24 * 3600
# Generated files do not count toward the reviewable-size cap.
GENERATED = re.compile(r"(^|/)(drizzle/migrations/meta/|pnpm-lock\.yaml$|__snapshots__/|\.snap$)")
# Match PR Size Guard for size only; executable generated code still requires tests.
GENERATED_SIZE = re.compile(r"(^|/)generated/")
# Test files: JS/TS conventions plus Python test_*.py and Xcode *Tests/ dirs.
TEST_FILE = re.compile(r"(\.test\.|\.spec\.|/(?:tests?|__tests__|[^/]*Tests)/|(^|/)test_[^/]+\.py$)")
DOC_FILE = re.compile(r"(\.mdx?c?$|^docs/|^canon/|\.txt$)")
# Reviewed source-reference inventory for the nonblocking feedback-linkage audit.
# Exempt only from the new-test requirement; canonical qualification still runs.
REFERENCE_DATA_FILES = frozenset({"LESSONS.guards.json"})
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
    """Compatibility projection of the receipt-first company attribution contract."""
    report = shipping_attribution.attribute_pr(pr, receipts, REPO_SLUG)
    source = report["origin"]
    confidence, method = source["confidence"], source["method"]
    provider = source.get("provider")
    final_provider = source.get("finalizingProvider") or provider
    exact_finalizers = [row for row in report["contributions"]
                        if row["role"] in {"finalizing", "remediation"}
                        and row.get("exactFinalHead") and row.get("provider")]
    if exact_finalizers:
        final_provider = exact_finalizers[-1]["provider"]
    if confidence == "verified" and method == "symphony":
        category = ("cross-provider-handoff" if source.get("finalizingProvider") else
                    "cross-provider-finalizer" if final_provider != provider else "autonomous-created")
        origin = AUTONOMOUS_ORIGIN
    elif confidence == "inferred":
        category, origin = f"inferred:{method}", "inferred"
    else:
        category, origin = "unknown", "unknown"
    roles = [{"provider": row.get("provider"), "category": row["role"], "runId": row.get("runId")}
             for row in report["contributions"] if row.get("provider")]
    return {"category": category, "originCategory": category, "origin": origin,
            "originProvider": provider, "finalProvider": final_provider, "roles": roles,
            "shippingMethod": method, "confidence": confidence,
            "missingOriginReceipt": confidence != "verified"}


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
        configured = int(os.environ.get(f"LANES_SLOTS_{provider.upper()}", default))
        # Pay-per-use lanes earn slots by measured merged PRs per dollar (slot_yield); everything else is as configured.
        return slot_yield.ceiling(self.state, provider, configured)[0]

    def slots(self, provider: str, default: int) -> int:
        return autoscale.effective_slots(self.state, provider, self.base_slots(provider, default))

    def intake_slots(self, provider: str, default: int) -> int:
        return autoscale.intake_slots(self.state, provider, self.base_slots(provider, default))


def load_providers(path: Path = HERE / "providers.json", registry: dict | None = None) -> dict:
    """providers.json plus the registry's quota limits (softRuns, windowS, maxRuns): the numbers live in
    ops/registry/capacity.json, not here. Custom paths (tests) keep their own numbers unless a registry is passed."""
    providers = json.loads(path.read_text())
    if registry is None and Path(path) == HERE / "providers.json":
        registry = capacity_registry.load()
    return capacity_registry.apply_limits(providers, registry) if registry else providers


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
    event_claim: dict | None = None


def failure_record(value) -> dict:
    return value if isinstance(value, dict) else {"count": int(value or 0), "at": 0}


def release_generation() -> str | None:
    """The installed release tree; a new one is new evidence for an exhausted issue."""
    state = lane_state_dir()
    try:
        return (state / "current" / ".tree").read_text().strip() or None if state else None
    except OSError:
        return None


def failure_rejection(record: dict) -> str | None:
    """MAX_FAILURES identical runs on one release park the issue on this host; the next
    release (a harness fix) is its automatic exit. No fixed backoff between runs (Tim
    2026-10-12): the count bounds identical retries, the release generation reopens them."""
    if record["count"] >= MAX_FAILURES and record.get("release") == release_generation():
        return "retry-exhausted"
    return None


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


# A reviewed false positive (2026-10-20): the matcher stays as is, and one issue at a time
# leaves the red-line hold only with BOTH the label and a comment receipt
# `<!-- sensitive-text-reviewed:v1 {"sha256": ..., "reviewer": ..., "reason": ..., "at": ...} -->`
# whose sha256 binds the exact title+description it reviewed. Any later edit voids it.
SENSITIVE_REVIEWED_LABEL = "sensitive-text-reviewed"
SENSITIVE_REVIEW_MARKER = re.compile(r"<!--\s*sensitive-text-reviewed:v1\s+(\{.*?\})\s*-->", re.S)
SENSITIVE_REVIEW_TTL_S = 600
SENSITIVE_REVIEW_QUERY = ('query($id:String!){issue(id:$id){comments(first:20,filter:{body:{contains:'
                          '"sensitive-text-reviewed:v1"}}){nodes{body}}}}')


def issue_text_digest(issue: Issue) -> str:
    return hashlib.sha256(f"{issue.title}\n{issue.description or ''}".encode()).hexdigest()


def sensitive_review_valid(issue: Issue, bodies: list[str]) -> bool:
    digest = issue_text_digest(issue)
    for body in bodies:
        for match in SENSITIVE_REVIEW_MARKER.finditer(body if isinstance(body, str) else ""):
            try:
                receipt = json.loads(match.group(1))
            except ValueError:
                continue
            if (isinstance(receipt, dict) and receipt.get("sha256") == digest
                    and all(isinstance(receipt.get(key), str) and receipt[key].strip()
                            for key in ("reviewer", "reason", "at"))):
                return True
    return False


def sensitive_review_comments(issue: Issue) -> list[str] | None:
    """Receipt comments, one Linear read per issue text per TTL (keyed on the text digest)."""
    def fetch():
        data = Linear(Host().linear_env).gql(SENSITIVE_REVIEW_QUERY, {"id": issue.id})
        nodes = (((data or {}).get("issue") or {}).get("comments") or {}).get("nodes")
        return [node.get("body") for node in nodes if isinstance(node, dict)] if isinstance(nodes, list) else None
    return shared(f"sensitive-review-{_cache_token(issue.id)}-{issue_text_digest(issue)[:16]}",
                  SENSITIVE_REVIEW_TTL_S, fetch)


SENSITIVE_REVIEW_READER = sensitive_review_comments


def sensitive_text_released(issue: Issue) -> bool:
    if SENSITIVE_REVIEWED_LABEL not in {label.lower() for label in issue.labels}:
        return False
    try:
        bodies = SENSITIVE_REVIEW_READER(issue)
    except Exception:  # an unreadable receipt keeps the hold
        return False
    return bool(bodies) and sensitive_review_valid(issue, bodies)


def label_rejection(issue: Issue, provider: str | None = None) -> str | None:
    """Label policy shared by the Jovie pool and every binding (bindings.refusal)."""
    labels = {label.lower() for label in issue.labels}
    excluded = sorted(HARD_EXCLUDED_LABELS & labels)
    if excluded:
        return "excluded-label:" + excluded[0]
    if REASONING_JOB_LABEL in labels and reason_lane.has_job_block(issue.description):
        return "reason-lane-job"
    if CODEX_BLOCKED_LABEL in labels and provider == "codex":
        return "codex-blocked"
    if epics.is_epic(issue) and provider in EPIC_REMOTE_LANES:
        return "epic-local-lanes-only"
    return None


def lane_restriction(issue: Issue, providers: dict) -> set[str] | None:
    """The lanes the router may choose for this issue; None means any."""
    allowed = set(providers)
    if issue_is_sensitive(issue):
        allowed &= {SENSITIVE_PROVIDER}
    labels = {label.lower() for label in issue.labels}
    if CODEX_BLOCKED_LABEL in labels:
        allowed.discard("codex")
    if epics.is_epic(issue):
        allowed -= EPIC_REMOTE_LANES
    return None if allowed == set(providers) else allowed


def admission_rejection(issue: Issue, failures: dict, now: float,
                        in_flight: frozenset[str] = frozenset(),
                        provider: str | None = None, route=None) -> str | None:
    """Final claim predicate; in_flight contains normalized lowercase identifiers.

    `route(issue)` is the cost-aware router (JOV-7706): an issue whose cheapest qualifying
    available route belongs to another lane is that lane's; none qualifying holds it."""
    labels = {label.lower() for label in issue.labels}
    rejected = label_rejection(issue, provider)
    if rejected:
        return rejected
    if issue_hits_red_line(issue) and not sensitive_text_released(issue):
        return "sensitive-text"
    if SENSITIVE_LABELS & labels and provider != SENSITIVE_PROVIDER:
        return "sensitive-provider"
    record = failure_record(failures.get(issue.identifier))
    if rejected := failure_rejection(record):
        return rejected
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
LANES_HARNESS = frozenset({"scripts/lanes/doctor.py", "scripts/lanes/factory_watchdog.py",
                           "scripts/lanes/hud.py", "scripts/lanes/lane_runner.py"})
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


def predicted_touch(issue: Issue, target_files: dict | None = None, now: float | None = None) -> frozenset[str]:
    """Paths the issue names (title or description), else its workstream's hotspots."""
    hints = frozenset(match.group(0) for match in PATH_HINT.finditer(f"{issue.title}\n{issue.description}"))
    witnessed = pr_events.target_issue_files(issue, target_files, now, REPO_SLUG) if not hints else None
    return hints or frozenset(witnessed or ()) or AREA_HOTSPOTS.get(workstreams.classify(issue.title, issue.labels), frozenset())


# A draft nobody has touched (no push, comment, label or review: GitHub `updatedAt`) for this
# long, and that no lane holds a repair lease on, stops holding hotspots: it is recorded as a
# file-overlap flag instead. 48h matches the reconcile pass's stale-draft SLO. Gem 2026-10-20:
# green draft #22253, idle 3 days, held six symphony-throughput issues on doctor.py.
HOTSPOT_DRAFT_IDLE_S = 48 * 3600


def stale_hotspot_draft(pr: dict, now: float, leased=lambda number: False) -> bool:
    """Evidence-based: a draft, with a readable updatedAt older than HOTSPOT_DRAFT_IDLE_S, and
    no live repair lease. Missing or unreadable evidence keeps the hold."""
    if pr.get("isDraft") is not True:
        return False
    updated = created_at_epoch(str(pr.get("updatedAt") or ""))
    return updated is not None and now - updated > HOTSPOT_DRAFT_IDLE_S and not leased(pr.get("number"))


def repair_leased(number) -> bool:
    """True while a lane holds this PR's repair lease (probe only; never takes or rewrites it)."""
    state = lane_state_dir()
    if state is None or not isinstance(number, int):
        return False
    path = state / "locks" / f"repair-pr-{number}.lock"
    if not path.exists():
        return False
    try:
        with open(path, "a") as handle:
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return True
            fcntl.flock(handle, fcntl.LOCK_UN)
    except OSError:
        return True  # unreadable lease evidence keeps the hold
    return False


def hotspot_holds(prs: list[dict], now: float | None = None, leased=lambda number: False) -> dict[str, int]:
    """{hotspot path: the oldest open PR touching it}. Hotspots are HOTSPOT_SEED plus any file
    two or more open PRs touch. Parked PRs (held or repair-exhausted) and stale unleased
    drafts (`stale_hotspot_draft`) hold nothing: they rebuild from main once the active work
    lands, and file-overlap still flags the overlap."""
    now = time.time() if now is None else now
    active = sorted((pr for pr in prs if not pr_is_terminal(pr) and not stale_hotspot_draft(pr, now, leased)),
                    key=lambda pr: pr.get("number") or 0)
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


def pool_rejections(issues: list[Issue], holds: dict[str, int] | None = None,
                    target_files: dict | None = None, now: float | None = None) -> dict[str, str]:
    """Pool-level admission (JOV-5555): exact normalized-title duplicates are one unit of
    work. Non-canonical members are rejected; the canonical (oldest) one stays admissible.
    JOV-7708: an issue whose predicted touch set hits a hotspot an open PR holds waits
    (`hotspot-held:<path>#<pr>`) instead of opening a PR that will conflict."""
    rejected = {identifier: "duplicate-candidate:" + canonical
                for identifier, canonical in workstreams.duplicate_of(issues).items()}
    for issue in issues:
        if holds and issue.identifier not in rejected and (hit := held_hotspot(predicted_touch(issue, target_files, now), holds)):
            rejected[issue.identifier] = f"hotspot-held:{hit[0]}#{hit[1]}"
    return rejected


def admission_order(issue: Issue, now: float) -> tuple:
    """Order only eligible, unclaimed work; explicit Linear Urgent is first.

    A designation and anti-starvation aging break ties inside that boundary.
    Invalid/missing priority never becomes Urgent. Non-urgent compounding work
    retains its existing tier and aging, and all callers keep their own gates.
    """
    created_at = created_at_epoch(issue.created_at)
    priority = issue.priority if type(issue.priority) is int and 1 <= issue.priority <= 4 else 0
    base_priority = priority or 5
    waited = max(0, now - created_at) if created_at is not None else 0
    effective_priority = max(1, base_priority - int(waited // PRIORITY_AGING_S))
    stream = workstreams.classify(issue.title, issue.labels)
    labels = {label.lower() for label in issue.labels}
    tier = (-1 if {SHARED_LABEL, "dispatch-next"} <= labels
            else 0 if effective_priority == 1 or workstreams.compounding(stream) else 1)
    # Summer's signed portfolio rank is the first key, then explicit Urgent, tier, aged priority, age (JOV-7073).
    return (*priority_admission.claim_key(issue.identifier, priority_admission.summer_ranks(now=now)),
            0 if priority == 1 else 1, tier, effective_priority, workstreams.rank(stream),
            created_at if created_at is not None else float("inf"))


def pick_issue(issues: list[Issue], failures: dict, now: float | None = None,
               in_flight: frozenset[str] = frozenset(), provider: str | None = None,
               holds: dict[str, int] | None = None,
               held_back: frozenset[str] = frozenset(), route=None,
               target_files: dict | None = None) -> Issue | None:
    """Symphony orders explicit Urgent first, then designation/tier, aged priority,
    workstream rank and age (admission_order).

    Non-urgent waiting work gains one effective priority level per day, preventing a
    sustained stream of newer urgent work from starving older work. Excluded work,
    3x failures, retry backoff, issues with an open lane PR, duplicate candidates and
    issues aimed at a held hotspot (pool_rejections) remain ineligible, as do issues
    with preserved work or a recovery-handoff cooldown (held_back, JOV-7690).
    """
    now = time.time() if now is None else now
    in_flight = frozenset(identifier.lower() for identifier in in_flight)
    duplicates = pool_rejections(issues, holds, target_files, now)
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
    """quota_window_pressure plus the registry's pace adjustment (`paceAdjust`, may be negative):
    a lane behind pace on use-or-lose quota is cheap to route to, a pool ahead of pace costs more."""
    seen = quota_window_pressure(host, name, spec, now)
    if seen.get("ok"):
        pace = capacity_registry.pace_adjust(capacity_registry.load(), host.state, name, now)
        if pace["adjust"]:
            seen = {**seen, "paceAdjust": pace["adjust"], "why": f"{seen.get('why')}; {pace['why']}"}
    return seen


def quota_window_pressure(host: "Host", name: str, spec: dict, now: float) -> dict:
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
            # An unavailable account is not necessarily banked: stale or missing capacity
            # evidence also refuses it. Name which, so the exclusion is explainable.
            banked = sum(1 for row in rows if row.get("exhaustedUntil"))
            why = ("all-accounts-banked" if banked >= len(rows) else
                   f"all-accounts-unavailable ({banked} banked, {len(rows) - banked} without fresh capacity evidence)")
            return {"ok": False, "why": why, "pressure": 0}
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
                verdict = {"ok": False, "why": "saturated", "pressure": quota["pressure"],
                           "paceAdjust": quota.get("paceAdjust", 0)}
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
                only_lanes=lane_restriction(issue, providers))
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
PRIOR_ATTEMPTS_CHARS = 6500
CONTEXT_INPUTS = {
    "issue": ["issue", "gbrain", "branch", "prior_attempts"],
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
        "priorAttempts": {"sources": ["Linear issue comments", "runs/ledger.jsonl"],
                          "maxChars": PRIOR_ATTEMPTS_CHARS, "ledgerTailBytes": 262144,
                          "maxRuns": 4, "maxComments": 5,
                          "missing": "explicit unavailable markers; never evidence of no prior fix"},
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
    "- Design loop (UI issue). Plan from the design brief in the issue (steps 1-9). If it is",
    "  missing or incomplete, write it yourself first from docs/design/design-brief-template.md",
    "  (marketing) or docs/design/app-ui-brief-template.md (app UI) and canon, put it in the PR",
    "  body, and keep going in this run: nobody else will write it. Then",
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


# JOV-INV-044: one capability/IA contract for every provider and platform.
# It lives in the task packet, not in an assumed callable Claude skill.
NO_HISTORY_REWRITE = [
    "- Never rebase, squash, reset or force-push a PR branch (no `--force`, `--force-with-lease`, `+ref`).",
    "  Integrate main by merging origin/main into the branch; every push must be a fast-forward of the",
    "  remote head. If a push is rejected as non-fast-forward, fetch, merge, and push again.",
]

PLANNING_CONTRACT = [
    "## Capability and IA decisions (shadow qualification)",
    "Read canon/ENGINEERING.md#capability-sourcing-and-ia-integration before new/expanded",
    "commodity or UI work. Inspect current implementation/decision, installed versions,",
    "official vendor integration indexes and platform features before custom mechanisms.",
    "For UI, inspect the mounted surface/current source and Pen/interaction owner first.",
    "Integrate > consolidate > replace > extend > add; account for deleted/merged UI and",
    "before/after complexity. Reuse applicable decisions; routine fixes/helpers/docs need",
    "no repeated research. Missing access/evidence becomes a bounded research task in",
    "this run or the existing research/trusted dependency-preparation path, never a rewrite.",
    "Extend the existing issue plan/workpad and PR JSON evidence with planningDecisions",
    "(field contract: scripts/invariants/capability-planning.mjs). Bind the receipt to the",
    "repository, final exact head, requirements/assumptions and trusted policy version/digest.",
    "Carry decision references, scope, versions, unresolved evidence and IA disposition in",
    "the same workpad through compaction/handoff; revalidate after head or assumption changes.",
    "Separate research-ready from implementation-candidate; self-signed exceptions and",
    "source-text/SDK-import tests are not independent review or runtime proof. Diagnostics",
    "remain nonblocking; existing security/CI gates and emergency authority still apply.",
    "",
]


# An issue section that already states when the work is done.
DONE_SECTION = re.compile(
    r"^#{1,6}\s*(?:definition of done|acceptance(?: criteria)?|success criteria|done when|"
    r"exit criteria)\b[^\n]*\n(?P<body>.*?)(?=^#{1,6}\s|\Z)", re.IGNORECASE | re.MULTILINE | re.DOTALL)


def definition_of_done(issue) -> list[str]:
    """The issue's own done criteria when it states them, else ones derived from its title."""
    found = DONE_SECTION.search(getattr(issue, "description", "") or "")
    body = found.group("body").strip() if found else ""
    if body:
        return [f"  {line}" for line in body.splitlines()[:30] if line.strip()]
    return [f"  - The outcome named in the title ({issue.title.strip()[:160]}) is true on main",
            "    after your one PR merges, and the description's details are handled.",
            "  - A test fails without the change and passes with it (docs-only work excepted).",
            "  - The narrow relevant checks pass on your final diff."]


def goal_contract(issue) -> list[str]:
    """Tim 2026-10-11: a goal with a clear definition of done replaces a pre-approved plan."""
    return [
        "## Goal",
        f"Ship {issue.identifier}: {issue.title.strip()}. You own it end to end in this run.",
        "",
        "## Definition of done",
        *definition_of_done(issue),
        "  Restate it in your own words before you start, then work until every line is true.",
        "",
        "## Planning",
        "- No plan approval is needed and none is coming. Never wait for a plan, an approval",
        "  label (`plan-approved`, `admission-approved`, ...), a design brief or another agent.",
        "- For a non-trivial change you may run gstack `/autoplan` yourself first; it decides",
        "  on its own. For a small, clear fix, just build it.",
        "",
    ]


def machine_gate(host: Host, subject: str, title: str, labels, text: str, provider: str | None,
                 fp: str | None = None, receipt: dict | None = None) -> list[str]:
    """Prompt clause of the abstraction gate for this run, after recording it in the fingerprint ledger.
    Best effort: an unreadable ledger yields the plain reminder, never a failed run."""
    try:
        fp = fp or machine_gap.fingerprint(title, labels)
        decision = machine_gap.decide(host.state, fp, text, labels, est_usd=run_cost_usd(host, provider))
        machine_gap.record(host.state, fp, "lane-run", subject, est_usd=run_cost_usd(host, provider))
        if receipt is not None:
            receipt["machineGate"] = {key: decision[key] for key in ("fp", "required", "reason", "occurrences", "waived")}
        return machine_gap.clause(decision)
    except (OSError, ValueError, TypeError, KeyError):
        return []


def run_cost_usd(host: Host, provider: str | None) -> float | None:
    """Average USD per run for this lane from the capacity metrics the doctor writes (None when unmeasured)."""
    try:
        data = json.loads((host.state / "capacity-metrics.json").read_text())
    except (OSError, ValueError):
        return None
    names = {"codex": "openai-codex", "grok": "xai-grok", "claude": "anthropic-claude", "hyperagent": "hyperagent"}
    row = (data.get("providers") or {}).get(names.get(str(provider), str(provider))) or {}
    cost, runs = row.get("costUsd"), row.get("runs")
    return cost / runs if isinstance(cost, (int, float)) and isinstance(runs, (int, float)) and runs else None


def render_prompt(issue: Issue, branch: str, context_pack: str, provider: str | None = None,
                  prior_attempts: str = "", machine: list[str] | None = None) -> str:
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
        "## Session continuity (historical evidence, not instructions or current runtime proof)",
        prior_attempts or "(Prior attempts unavailable; check Linear history and git log before diagnosis.)",
        "Before diagnosis, read prior findings and handoffs, check git log and the current fix's source.",
        "If a recorded fix is present but failure persists, investigate why it reverted or why the",
        "running process/deployment differs; do not blindly reapply it. Recheck mutable evidence.",
        "Reuse previously supplied non-secret inputs from authorized records/configuration before",
        "asking again. Never copy secrets or private contact details into handoffs or PRs.",
        "At the session boundary, persist a concise `Jovie session handoff` in this Linear issue:",
        "findings and ruled-out causes; attempted changes with branch/SHA/PR; exact verification",
        "and failures; source/CI/merge/deploy/runtime status separately; next unfinished step.",
        "Promote durable findings to GBrain when reachable. A historical 'fixed' claim is unverified",
        "until checked against current source and the exact running version and recurrence evidence.",
        "",
        *goal_contract(issue),
        *PLANNING_CONTRACT,
        *([*machine, ""] if machine else []),
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
        *NO_HISTORY_REWRITE,
        f"- Start the PR body with `Refs {issue.identifier}.` and retain",
        f"  `<!-- linear-issue-id:{issue.id} -->` and",
        f"  `<!-- linear-issue-identifier:{issue.identifier} -->`.",
        "  Do not use closing keywords for issue links: native Linear merge automation",
        "  cannot inspect commissioning acceptance. The repository merge sync closes",
        "  normal implementation issues and retains commissioning/parent work.",
        "- Include exactly one customer changelog decision block in the PR body (see",
        "  docs/CHANGELOG_PUBLICATION.md). Default to internal:",
        "  `<!-- customer-changelog/v1 {\"releaseWorthy\":false} -->`. When the change is",
        "  customer-visible, replace it with a customer outcome block (issueId, outcomeKey,",
        "  releaseWorthy:true, section, outcome text, availability, evidence).",
        "- If the issue is not code-shippable or already fixed, open no PR and end with a",
        "  line `NOT-SHIPPABLE: <reason>`.",
        "- You are unattended: nobody will answer a question. Never stop to ask; choose the",
        "  non-interactive path. Apart from `/autoplan`, do not run gstack or other skill",
        "  workflows (ship, review, qa, upgrade) and do not upgrade any tooling: commit with git",
        "  and open the PR with `pnpm pr:open open --draft` (drafts a gate-compliant body from the diff,",
        "  runs the Fleet Rules and Source Validation body gates, refuses a failing PR; never raw `gh pr create`).",
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


def prior_attempts_context(host: Host, linear: Linear | None, issue: Issue) -> str:
    """Recall existing receipts and cross-host handoffs, with bounded I/O and fail-soft reads."""
    def bounded(value, limit=180):
        text = str(value or "")
        return text[:limit] + ("…" if len(text) > limit else "")

    sections = []
    try:
        with (host.state / "runs" / "ledger.jsonl").open("rb") as source:
            source.seek(0, os.SEEK_END)
            offset = max(0, source.tell() - 262144)
            source.seek(offset)
            lines = source.read(262144).decode(errors="replace").splitlines()
            if offset:
                lines = lines[1:]  # The bounded tail can start in the middle of a JSON row.
        exact, related = [], []
        workstream = workstreams.classify(issue.title, issue.labels)
        for line in reversed(lines):
            try:
                row = json.loads(line)
            except ValueError:
                continue
            if not isinstance(row, dict) or row.get("repository") != REPO_SLUG:
                continue
            same_issue = row.get("issue") == issue.identifier or row.get("linearIssueId") == issue.id
            if not same_issue and (workstream == "general" or row.get("workstream") != workstream):
                continue
            evidence = {key: bounded(row.get(key)) for key in (
                "runId", "issue", "startedAt", "endedAt", "branch", "headSha", "prUrl", "verdict") if row.get(key)}
            reasons = row.get("reasons")
            if isinstance(reasons, list):
                evidence["reasons"] = [bounded(reason) for reason in reasons[:3]]
            target = exact if same_issue else related
            if len(target) < 4:
                target.append(evidence)
        attempts = (exact + related)[:4]
        sections.append("Local prior run excerpts (same issue first, then same workstream; newest first):\n"
                        + ("\n".join(bounded(json.dumps(row, ensure_ascii=False), 650) for row in attempts) if attempts
                           else "no matching attempts in bounded ledger tail"))
    except OSError:
        sections.append("local history unavailable")
    try:
        data = linear.gql('query($id:String!){issue(id:$id){comments(first:5,orderBy:createdAt){'
                          'nodes{id body createdAt} pageInfo{hasNextPage}}}}', {"id": issue.id})
        comments = data["issue"]["comments"]
        nodes = comments["nodes"]
        if not isinstance(nodes, list) or not isinstance(comments["pageInfo"]["hasNextPage"], bool):
            raise ValueError("invalid comment page")
        rows = [{key: bounded(node.get(key), 650 if key == "body" else 80)
                 for key in ("id", "createdAt", "body")} for node in nodes[:5] if isinstance(node, dict)]
        sections.append("Linear handoff/comment excerpts (newest first):\n"
                        + ("\n".join(bounded(json.dumps(row, ensure_ascii=False), 650) for row in rows) if rows else "no comments")
                        + ("\nolder comments omitted; retrieve relevant history before repeating a fix"
                           if comments["pageInfo"]["hasNextPage"] else ""))
    except Exception:  # Auth/quota/malformed/missing history must not stop unrelated work or leak response text.
        sections.append("Linear history unavailable; retrieve it before assuming no previous fix")
    return "\n\n".join(sections)[:PRIOR_ATTEMPTS_CHARS]


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
    code = [p for p in paths if p not in REFERENCE_DATA_FILES
            and not DOC_FILE.search(p) and not TEST_FILE.search(p) and not GENERATED.search(p)]
    if code and not any(TEST_FILE.search(p) for p in paths):
        versions = (dependency_diff.classify(worktree, pr.get("headRefOid"), paths, pr)
                    if worktree is not None and isinstance(pr, dict) else None)
        if versions is None:
            failures.append("code-change-without-test")
    if "pnpm-lock.yaml" in paths and not any(p.endswith("package.json") for p in paths):
        failures.append("lockfile-without-manifest")
    reviewable = sum(c.added + c.deleted for c in changes
                     if not GENERATED.search(c.path) and not GENERATED_SIZE.search(c.path))
    if reviewable > max_reviewable_lines:
        failures.append(f"diff-too-large:{reviewable}")
    return failures, versions


def not_shippable_reason(output: str) -> str | None:
    """The agent's explicit decline, e.g. already fixed on main; routed to Triage, never retried."""
    found = re.findall(r"NOT-SHIPPABLE:\s*(.+)", output)
    return found[-1].strip()[:500] if found else None


# Why a fix run that pushed nothing changed nothing (Gem ledger, 253 fix-no-change runs in
# 3.5 days all carried reasons=[]): 105 were a codex_lane crash before the agent started
# (account/read app-server timeout, exit 1), 112 were the agent's own NOT-SHIPPABLE decline
# (infrastructure red or a failure main already has), 17 found the head already green. A
# specific reason lets the budget, the backoff and the ledger treat each differently.
LANE_CRASH_SIGNATURES = (
    ("codex-account-metadata-timeout", re.compile(r"TimeoutError: account/read: app-server response unavailable")),
)
DECLINE_INFRA = re.compile(
    r"rate limit|HTTP 40[38]|HTTP 5\d\d|infrastructure|timed out fetching|outage|flak|Doppler",
    re.IGNORECASE)
DECLINE_BASE_RED = re.compile(
    r"origin/main|untouched main|\bmain\b|merge base|pre-existing|preexisting|inherited|unrelated|"
    r"identically|already fixed", re.IGNORECASE)


def classify_unpushed_repair(exit_code, log_text: str) -> list[str]:
    """Specific reason codes for a fix run that pushed nothing. The first code is the cause.

    lane-crash:<signature>      the provider wrapper died before an agent worked (attempt refunded)
    agent-exit:<n>              the agent exited non-zero without pushing
    agent-declined:<class>:<why> NOT-SHIPPABLE; class infra | base-red | other (infra and
                                base-red spend the head's budget: a second read declines again)
    no-change:agent-ended-without-push  the agent finished cleanly and pushed nothing
    """
    if exit_code not in (0, None):
        for name, pattern in LANE_CRASH_SIGNATURES:
            if pattern.search(log_text):
                return [f"lane-crash:{name}", f"agent-exit:{exit_code}"]
        return [f"agent-exit:{exit_code}"]
    declined = not_shippable_reason(log_text)
    if declined:
        kind = "infra" if DECLINE_INFRA.search(declined) else "base-red" if DECLINE_BASE_RED.search(declined) else "other"
        return [f"agent-declined:{kind}:{declined[:160]}"]
    return ["no-change:agent-ended-without-push"]


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
    # Git 2.55 detaches `maintenance run --auto` after ordinary commands. Lane git
    # must not leave that writer holding `.git/objects` for the next status or delete.
    if args and Path(args[0]).name == "git":
        env = git_housekeeping.apply_housekeeping_env(os.environ if env is None else env)
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
# Endpoint-specific limits carry their own reset; a rate limit waits for the latest one.
LINEAR_RESET_HEADERS = ("X-RateLimit-Requests-Reset", "X-RateLimit-Complexity-Reset",
                        "X-RateLimit-Endpoint-Requests-Reset")


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


def _budget_dimensions(headers) -> dict:
    return {name: {"remaining": _header_number(headers, fields[0]),
                   "limit": _header_number(headers, fields[1]), "reset": _header_number(headers, fields[2])}
            for name, fields in zip(("requests", "complexity"), LINEAR_BUDGET_HEADERS)}


def _budget_numbers(headers) -> dict:
    for row in _budget_dimensions(headers).values():
        if any(value is not None for value in row.values()):
            return row
    return {"remaining": None, "limit": None, "reset": None}


def _linear_operation_family(query: str) -> str:
    if query.lstrip().startswith("mutation"):
        return "mutation"
    if 'state:{name:{eq:"Todo"}}' in query:
        return "todo-inventory"
    if 'state:{name:{eq:"In Progress"}}' in query:
        return "active-ownership"
    if "issue(id:" in query:
        return "exact-issue"
    if "issues(" in query:
        return "issue-inventory"
    return "metadata"


def record_linear_usage(key: str, family: str, outcome: str, headers=None, *, attempted=True) -> None:
    """Bounded local attempt counters; quota observations are not consumed cost."""
    handle = None
    try:
        state = lane_state_dir()
        if state is None:
            return
        state.mkdir(parents=True, exist_ok=True)
        handle = open(state / "linear-usage.lock", "a")
        fcntl.flock(handle, fcntl.LOCK_EX)
        path, now = state / "linear-usage.json", time.time()
        data = maintenance_json(path, limit=1048576, missing={})
        if not isinstance(data, dict) or data.get("schema", "jovie-linear-usage/v1") != "jovie-linear-usage/v1":
            return
        windows = data.setdefault("windows", {})
        if not isinstance(windows, dict):
            return
        hour = int(now // 3600)
        windows = {name: row for name, row in windows.items() if name in {str(hour), str(hour - 1)}}
        data["windows"] = windows
        window = windows.setdefault(str(hour), {})
        scope = _linear_scope_id(key)
        if scope not in window and len(window) >= 16:
            return
        producer = window.setdefault(scope, {}).setdefault("lane-runner", {})
        if family not in {"mutation", "todo-inventory", "active-ownership", "exact-issue", "issue-inventory", "metadata"}:
            return
        row = producer.setdefault(family, {"httpAttempts": 0, "cooldownSkips": 0, "successes": 0,
                                          "errors": 0, "rateLimited": 0, "complexityConsumed": None})
        for count in ("httpAttempts", "cooldownSkips", "successes", "errors", "rateLimited"):
            if type(row.get(count)) is not int or row[count] < 0:
                return
        row["httpAttempts" if attempted else "cooldownSkips"] += 1
        cost = _header_number(headers, "X-Complexity")
        if cost is not None and cost >= 0:  # Linear's own per-query complexity for this response
            row["complexityConsumed"] = (row.get("complexityConsumed") or 0) + cost
        if attempted:
            row["successes" if outcome == "success" else "errors"] += 1
        if outcome == "rate-limited":
            row["rateLimited"] += 1
        row.update(observedAt=now, quotaObservations=_budget_dimensions(headers),
                   complexityCostCoverage="unknown; remaining includes other consumers")
        data.update(schema="jovie-linear-usage/v1", observedAt=now,
                    coverage="this transport only; HTTP attempts, not server-accepted requests")
        _write_state_json(path, data)
    except Exception:
        pass  # Telemetry cannot prevent an already admitted action.
    finally:
        if handle is not None:
            handle.close()


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
        dimensions = {}
        for name, values in _budget_dimensions(headers).items():
            if any(value is not None for value in values.values()):
                dimensions[name] = {**values, "observedAt": now_iso()}
            else:
                dimensions[name] = (previous.get("dimensions") or {}).get(name)
        payload["dimensions"] = dimensions
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
    scope_id = _linear_scope_id(key)
    latest = 0
    if root is not None:
        scope = root / scope_id
        latest = max(latest, _scan_scope(scope, now_ms), _legacy_file_reset_ms(root, key, now_ms))
    for legacy in _legacy_cooldown_roots(root):
        latest = max(latest, _scan_scope(legacy / scope_id, now_ms),
                     _legacy_file_reset_ms(legacy, key, now_ms))
    # Fallbacks written when the shared dir rejected a publish (JOV-7577).
    latest = max(latest, _scan_scope(_tmp_cooldown_root() / scope_id, now_ms))
    local = _PROCESS_LINEAR_COOLDOWNS.get(scope_id)
    if local is not None:
        local_ms = int(local * 1000)
        if local_ms > now_ms:
            latest = max(latest, local_ms)
        else:
            del _PROCESS_LINEAR_COOLDOWNS[scope_id]
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


# Cooldowns this process failed to persist to the shared dir, keyed by scope hash.
# An unwritable canonical dir used to mean every sibling process re-hit Linear;
# the in-process and tmp fallbacks keep the backoff alive until a write succeeds.
_PROCESS_LINEAR_COOLDOWNS: dict[str, float] = {}
_COOLDOWN_UNWRITABLE_EVENT_FIRED = False


def _tmp_cooldown_root() -> Path:
    uid = os.getuid() if hasattr(os, "getuid") else "shared"
    return Path(tempfile.gettempdir()) / f"jovie-linear-cooldown-{uid}"


def _tmp_fallback_publish(scope_id: str, reset_s: float) -> None:
    """Best-effort record under tmp so sibling processes still back off."""
    try:
        scope = _tmp_cooldown_root() / scope_id
        scope.mkdir(parents=True, exist_ok=True)
        _chmod_private(scope, 0o700)
        reset_ms = int(reset_s * 1000)
        record = scope / f"{reset_ms}-{uuid.uuid4()}.json"
        atomic_write_text(record, json.dumps({"schema": 1, "resetAt": reset_ms}))
        _chmod_private(record, 0o600)
    except OSError:
        pass


def _emit_cooldown_unwritable_event(root: Path, error: Exception) -> None:
    """One remediation intake per process; Linear is cooled down, so file via gh."""
    global _COOLDOWN_UNWRITABLE_EVENT_FIRED
    if _COOLDOWN_UNWRITABLE_EVENT_FIRED:
        return
    _COOLDOWN_UNWRITABLE_EVENT_FIRED = True
    try:
        pr_events.upsert_intake(remediation.remediation_event(
            source="lanes",
            fingerprint="linear-cooldown-unwritable",
            subject={"cooldown_root": str(root)},
            evidence={"excerpt": f"shared Linear cooldown write failed: {type(error).__name__}: {error}"},
            ws="ci",
            first_seen=remediation.now_iso()))
    except Exception:
        pass


def _cooldown_write_failed(root: Path, scope_id: str, reset_s: float, error: Exception) -> None:
    print(json.dumps({"schema": "jovie.linear-cooldown-write-failure/v1",
                      "fingerprint": "linear-cooldown-unwritable", "root": str(root),
                      "error": f"{type(error).__name__}: {error}"}),
          file=sys.stderr, flush=True)
    _PROCESS_LINEAR_COOLDOWNS[scope_id] = max(reset_s, _PROCESS_LINEAR_COOLDOWNS.get(scope_id, 0))
    _tmp_fallback_publish(scope_id, reset_s)
    _emit_cooldown_unwritable_event(root, error)


def publish_linear_cooldown(key: str, headers, now: float | None = None) -> float:
    """Extend the shared deadline. A later writer must not shorten an earlier one."""
    now = time.time() if now is None else now
    reset_s = _cooldown_deadline_s(headers, now)
    root = linear_cooldown_root()
    if root is None:
        return reset_s
    scope = root / _linear_scope_id(key)
    staging = None
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
                publication_id = uuid.uuid4()
                record = scope / f"{reset_ms}-{publication_id}.json"
                staging = scope / f".pending-{publication_id}"
                fd = os.open(staging, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
                with os.fdopen(fd, "w") as pending:
                    json.dump({"schema": 1, "resetAt": reset_ms}, pending)
                    pending.flush()
                    os.fsync(pending.fileno())
                _chmod_private(staging, 0o600)
                os.rename(staging, record)
                directory_fd = os.open(scope, os.O_RDONLY)
                try:
                    os.fsync(directory_fd)
                finally:
                    os.close(directory_fd)
            finally:
                fcntl.flock(handle, fcntl.LOCK_UN)
    except Exception as error:
        if staging is not None:
            try:
                staging.unlink(missing_ok=True)
            except OSError:
                pass  # Leftover staging still fail-closes strict JS readers.
        _cooldown_write_failed(root, scope.name, reset_s, error)
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


class LinearRequestError(RuntimeError):
    """Only fixed classification/status metadata survives a GraphQL rejection."""
    def __init__(self, error):
        error = error if isinstance(error, dict) else {}
        extensions = error.get("extensions")
        extensions = extensions if isinstance(extensions, dict) else {}
        code = extensions.get("code")
        allowed = {"FORBIDDEN", "UNAUTHENTICATED", "AUTHENTICATION_ERROR", "BAD_USER_INPUT",
                   "GRAPHQL_VALIDATION_FAILED", "NOT_FOUND", "INTERNAL_SERVER_ERROR"}
        self.diagnostic = {"class": "linear-graphql", "code": code if isinstance(code, str) and code in allowed else "UNKNOWN"}
        status = extensions.get("statusCode")
        if type(status) is int and 100 <= status <= 599:
            self.diagnostic["httpStatus"] = status
        # Retain ONLY this exact known missing-comment preimage contract. Other
        # provider messages can contain input, credentials or response bodies.
        missing = error.get("message") == "Entity not found: Comment"
        super().__init__("linear: Entity not found: Comment" if missing else "linear: request rejected")


class LinearAppCredentialMissing(RuntimeError):
    """No Jovie Lanes app credential: lanes Linear access fails closed (doctor alert
    `linear-app-credential-missing`). There is no personal-key fallback. A RuntimeError, so
    every `except Exception` around Linear (the doctor's tracker, the watchdog) degrades
    instead of exiting the process."""


class Linear:
    def __init__(self, env_file: Path | None = None, app_env: Path | None = None):
        # Only the Jovie Lanes app credential (own quota, revocable on its own). Tim
        # 2026-10-20: lanes never fall back to a personal LINEAR_API_KEY, so that key can be
        # revoked without breaking lanes. `env_file` is accepted for call compatibility and
        # never read. `key` scopes cooldowns and caches: the app identity, never the token.
        path = app_env if app_env is not None else linear_app_token.default_path()
        self.app = linear_app_token.credentials(path)
        if not self.app:
            raise LinearAppCredentialMissing(f"no Jovie Lanes Linear app credential at {path}")
        self.key = f"linear-app:{self.app[0]}"

    def _authorization(self, rejected: str | None = None) -> tuple[str, str | None]:
        if not getattr(self, "app", None):
            raise LinearAppCredentialMissing("no Jovie Lanes Linear app credential")
        try:
            access = linear_app_token.token(*self.app, lane_state_dir(), rejected=rejected)
        except linear_app_token.TokenUnavailable as error:
            raise LinearRateLimited(error.retry_at) from None
        return f"Bearer {access}", access

    def gql(self, query: str, variables: dict) -> dict:
        family = _linear_operation_family(query)
        cooling = linear_cooldown_until(self.key)
        if cooling is not None:
            record_linear_usage(self.key, family, "cooldown", attempted=False)
            raise LinearRateLimited(cooling)
        try:
            authorization, access = self._authorization()
        except LinearRateLimited:
            record_linear_usage(self.key, family, "cooldown", attempted=False)
            raise
        outcome, headers = "transport-error", None
        try:
            body = json.dumps({"query": query, "variables": variables}).encode()
            request = lambda auth: urllib.request.Request(
                LINEAR_API_URL, data=body, headers={"Content-Type": "application/json", "Authorization": auth})
            try:
                try:
                    response = urllib.request.urlopen(request(authorization), timeout=30)
                except urllib.error.HTTPError as error:
                    if error.code != 401 or access is None:
                        raise
                    # Revoked or expired app token: one re-mint (or a sibling's), one retry.
                    authorization, access = self._authorization(rejected=access)
                    response = urllib.request.urlopen(request(authorization), timeout=30)
            except urllib.error.HTTPError as error:
                headers, raw = getattr(error, "headers", None), b""
                try:
                    raw = error.read()
                except Exception:
                    pass
                if error.code == 429 or _body_is_rate_limited(error.code, raw):
                    outcome = "rate-limited"
                    record_linear_budget(headers, rate_limited=True)
                    raise LinearRateLimited(publish_linear_cooldown(self.key, headers)) from None
                outcome = "http-error"
                record_linear_budget(headers, rate_limited=False)
                raise
            with response as handle:
                raw, headers = handle.read(), getattr(handle, "headers", None)
            payload = json.loads(raw.decode() or "{}")
            if _data_is_rate_limited(payload):
                outcome = "rate-limited"
                record_linear_budget(headers, rate_limited=True)
                raise LinearRateLimited(publish_linear_cooldown(self.key, headers))
            record_linear_budget(headers, rate_limited=False)
            if payload.get("errors"):
                outcome = "graphql-error"
                raise LinearRequestError(payload["errors"][0])
            data = payload["data"]
            outcome = "success"
            return data
        finally:
            record_linear_usage(self.key, family, outcome, headers)

    def _snapshot_budget_admitted(self, pages: int, max_age_s: float | None = None) -> bool:
        max_age_s = CLAIM_SCAN_TTL_S if max_age_s is None else max_age_s
        state = lane_state_dir()
        if state is None:
            return False
        try:
            budget = maintenance_json(state / "api-budget.json", limit=65536, missing={})
            dimensions = budget.get("dimensions") if isinstance(budget, dict) else None
            if not isinstance(dimensions, dict):
                return False
            for name in ("requests", "complexity"):
                row = dimensions.get(name)
                if not isinstance(row, dict):
                    return False
                remaining, limit = row.get("remaining"), row.get("limit")
                at = autoscale._epoch(row.get("observedAt"))
                if any(type(value) not in (int, float) or not math.isfinite(value) for value in (remaining, limit, at)) or (
                        limit <= 0 or not 0 <= remaining <= limit or not 0 <= time.time() - at <= max_age_s):
                    return False
                # Protect both quota dimensions; unknown operation complexity is
                # never inferred from another consumer's remaining-counter delta.
                if remaining / limit < autoscale.LINEAR_INCREASE_RATIO or (
                        name == "requests" and remaining - pages < math.ceil(limit * autoscale.LINEAR_INCREASE_RATIO)):
                    return False
            return True
        except (OSError, ValueError, TypeError):
            return False

    def _refresh_budget_evidence(self, pages: int) -> bool:
        """Re-observe the Linear budget right before spending it, then apply the unchanged gate.

        Approval and execution were separate reads of one api-budget.json: on Gem the evidence
        was 39 s old when a worker was admitted and 82 s old when its scan ran, so the 60 s gate
        refused, and a quiet host made no other Linear call that could refresh it. Only evidence
        that would already pass every reserve (plus this probe's own request) within the
        autoscaler's freshness window is re-observed; the probe's real response headers are the
        new evidence."""
        if not self._snapshot_budget_admitted(pages + 1, max_age_s=autoscale.STALE_S):
            return False
        try:
            self.gql("query{viewer{id}}", {})
        except Exception:
            return False
        return self._snapshot_budget_admitted(pages)

    def lane_issues(self, label: str | None = None) -> list[Issue]:
        """Every dispatchable JOV Todo issue, from the host's local mirror (Tim 2026-10-11:
        "linear being down should not stop shipping"). No Linear request: the dispatch tick
        keeps the mirror fresh when the budget allows and a stale mirror is reported, not
        refused. `label` (the caller's lane) does not narrow the pool; the router decides.
        This host's claim ledger and pending outbox moves are already applied."""
        state = lane_state_dir()
        return [Issue(row["id"], row["identifier"], row["title"], row["description"], row["priority"],
                      row["createdAt"], list(row["labels"]))
                for row in (linear_sync.todo(state, "JOV") if state else [])]

    def admit(self, requests: int) -> bool:
        """The protected budget gate (both quota dimensions, fresh evidence) for mirror sync
        and outbox flushes; reserves are unchanged. Evidence older than the autoscaler's
        window (a quiet host) is re-observed by one probe, at most once per window."""
        if self._snapshot_budget_admitted(requests) or self._refresh_budget_evidence(requests):
            return True
        state = lane_state_dir()
        budget = maintenance_json(state / "api-budget.json", limit=65536, missing={}) if state else {}
        seen = autoscale._epoch(((budget.get("dimensions") or {}).get("requests") or {}).get("observedAt")) \
            if isinstance(budget, dict) else None
        if state is None or (seen is not None and 0 <= time.time() - seen <= autoscale.STALE_S):
            return False
        try:
            self.gql("query{viewer{id}}", {})
        except Exception:
            return False
        return self._snapshot_budget_admitted(requests)

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

    def move(self, issue_id: str, state_name: str, owner: str | None = None) -> None:
        # Direct (non-outbox) writes have no claim ledger to consult: a started state must
        # name its live owner explicitly (the orphaned In Progress guard).
        if state_name in linear_sync.STARTED and not owner:
            raise linear_sync.StartedWithoutOwner(f"{state_name} for {issue_id} without a live owner")
        states = self.gql('query($id:String!){issue(id:$id){team{states{nodes{id name}}}}}', {"id": issue_id})
        target = next((s["id"] for s in states["issue"]["team"]["states"]["nodes"] if s["name"] == state_name), None)
        if target:
            self.gql('mutation($id:String!,$s:String!){issueUpdate(id:$id,input:{stateId:$s}){success}}',
                     {"id": issue_id, "s": target})

    def comment(self, issue_id: str, body: str) -> None:
        result = self.gql('mutation($id:String!,$b:String!){commentCreate(input:{issueId:$id,body:$b}){success}}',
                          {"id": issue_id, "b": body})
        if not isinstance(result, dict) or not isinstance(result.get("commentCreate"), dict) or result["commentCreate"].get("success") is not True: raise RuntimeError("linear: comment not delivered")


def linear_optional(step, *args, **kwargs):
    """A Linear-dependent side task (escalation, labeled events, sweep). A rate limit skips
    it for this pass; issue intake continues from the local mirror."""
    try:
        return step(*args, **kwargs)
    except LinearRateLimited:
        return None


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


class RepairRoutingUnavailable(ValueError):
    """A route needs a new preflight observation, without consuming work history."""


def repair_provider_identity(providers: dict) -> str:
    """Bind the full configuration and its insertion order, not only route labels."""
    if not isinstance(providers, dict) or any(not isinstance(name, str) or not isinstance(spec, dict)
                                              for name, spec in providers.items()):
        raise RepairRoutingUnavailable("routing-provider-config-unreadable")
    return hashlib.sha256(json.dumps(list(providers.items()), sort_keys=True,
                                     separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def observe_repair_provider_health(spec: dict) -> bool | None:
    """The configured inspection command, with failure kept distinct from unavailable.

    This is not an inference command and does not reconcile accounts. Keep the
    ordinary provider_healthy semantics unchanged for its existing callers.
    """
    try:
        result = lifecycle.run(template(spec["health"], {}), capture_output=True, text=True, timeout=60)
        return result.returncode == 0 and re.search(spec.get("healthy", "."), result.stdout + result.stderr) is not None
    except (OSError, subprocess.SubprocessError, ValueError, TypeError, KeyError):
        return None


def repair_route_cooldowns(host: Host, providers: dict) -> dict:
    """Cheap bounded evidence for the canonical local repair provider scope."""
    expiries = {}
    for name, spec in providers.items():
        if not spec.get("enabled", True) or spec.get("repairs") is False:
            continue
        stamp = maintenance_json(host.state / "cooldown" / name, limit=4096)
        if stamp is MAINTENANCE_MISSING:
            stamp = None
        elif type(stamp) not in (int, float) or not math.isfinite(stamp):
            raise RepairRoutingUnavailable("routing-cooldown-unreadable")
        expiries[name] = stamp
    return expiries


def repair_routing_needed(host: Host, inventory: dict) -> bool:
    """Local preflight hint. A racing new rung still fails closed at admission."""
    try:
        attempts = maintenance_json(host.state / "fix-attempts.json", missing={})
        if not isinstance(attempts, dict):
            return True
        for pr in inventory.get("prs") or []:
            if not isinstance(pr, dict):
                return True
            record = attempts.get(str(pr.get("number")))
            if isinstance(record, dict) and (isinstance(record.get("pendingEscalation"), dict)
                    or (type(record.get("count")) is int and record["count"] >= MAX_FIX_ATTEMPTS)):
                return True
        return False
    except (OSError, ValueError, TypeError):
        return True


def capture_repair_routing(host: Host, providers: dict, inventory: dict) -> dict:
    """Outside claim.lock only: one complete, private, credential-free observation.

    No account, seat or provider configuration is changed. The producer and
    consumer share these exact health results instead of independently probing.
    """
    result = {"schema": REPAIR_ROUTING_SCHEMA, "complete": False,
              "sourceAt": inventory.get("sourceAt"), "health": {}}
    try:
        now = time.time()
        source = result["sourceAt"]
        if inventory.get("readable") is not True or not isinstance(inventory.get("prs"), list) \
                or type(source) not in (int, float) or not math.isfinite(source) \
                or not 0 <= now - source <= MAINTENANCE_DEMAND_MAX_AGE_S:
            raise RepairRoutingUnavailable("routing-inventory-unproven")
        result["providerIdentity"] = repair_provider_identity(providers)
        result["cooldowns"] = repair_route_cooldowns(host, providers)
        for name, spec in providers.items():
            if not spec.get("enabled", True) or spec.get("repairs") is False:
                continue
            observed_at = time.time()
            healthy = observe_repair_provider_health(spec)
            if type(healthy) is not bool:
                raise RepairRoutingUnavailable("routing-health-incomplete")
            result["health"][name] = {"healthy": healthy, "observedAt": observed_at}
        if result["cooldowns"] != repair_route_cooldowns(host, providers):
            raise RepairRoutingUnavailable("routing-cooldown-changed")
        result.update(complete=True, capturedAt=time.time())
        reason = repair_routing_reason(result, providers, time.time(), result["cooldowns"])
        if reason:
            raise RepairRoutingUnavailable(reason)
    except Exception as error:
        result.update(complete=False, reason=str(error) if isinstance(error, RepairRoutingUnavailable)
                      else "routing-capture-" + type(error).__name__)
    return result


def repair_routing_reason(context, providers: dict, now: float, cooldowns: dict) -> str | None:
    """Pure validation. The maintained repair-evidence age bound is unchanged."""
    if not isinstance(context, dict) or context.get("schema") != REPAIR_ROUTING_SCHEMA \
            or context.get("complete") is not True:
        return "routing-context-unproven"
    try:
        if repair_provider_identity(providers) != context.get("providerIdentity"):
            return "routing-provider-config-changed"
        if type(now) not in (int, float) or not math.isfinite(now):
            return "routing-time-unproven"
        for key in ("sourceAt", "capturedAt"):
            stamp = context.get(key)
            if type(stamp) not in (int, float) or not math.isfinite(stamp) \
                    or not 0 <= now - stamp <= MAINTENANCE_DEMAND_MAX_AGE_S:
                return "routing-context-expired"
        expected = {name for name, spec in providers.items()
                    if spec.get("enabled", True) and spec.get("repairs") is not False}
        health = context.get("health")
        if not isinstance(health, dict) or set(health) != expected:
            return "routing-health-incomplete"
        for sample in health.values():
            if not isinstance(sample, dict) or type(sample.get("healthy")) is not bool:
                return "routing-health-incomplete"
            stamp = sample.get("observedAt")
            if type(stamp) not in (int, float) or not math.isfinite(stamp) \
                    or not 0 <= now - stamp <= MAINTENANCE_DEMAND_MAX_AGE_S:
                return "routing-context-expired"
        captured = context.get("cooldowns")
        if not isinstance(captured, dict) or set(captured) != expected \
                or not isinstance(cooldowns, dict) or set(cooldowns) != expected:
            return "routing-cooldown-unproven"
        if any(value is not None and (type(value) not in (int, float) or not math.isfinite(value))
               for value in [*captured.values(), *cooldowns.values()]):
            return "routing-cooldown-unproven"
        if captured != cooldowns:
            return "routing-cooldown-changed"
    except (ValueError, TypeError):
        return "routing-provider-config-unreadable"
    return None


def current_repair_routing_reason(host: Host, context, providers: dict) -> str | None:
    """Only local bounded reads at admission, including the final charge boundary."""
    try:
        current = load_providers()
        if repair_provider_identity(current) != repair_provider_identity(providers):
            return "routing-provider-config-changed"
        return repair_routing_reason(context, current, time.time(), repair_route_cooldowns(host, current))
    except (OSError, ValueError, TypeError):
        return "routing-local-evidence-unreadable"


def repair_routing_plan(context, providers: dict, classified: dict, record: dict,
                        now: float, head: str, cooldowns: dict) -> dict:
    """The canonical algorithm with one shared availability context, no I/O.

    A non-model decision does not need health. With unknown context, the lazy
    health callback refuses before route selection; deterministic/terminal
    decisions retain their existing ordinary semantics.
    """
    reason = repair_routing_reason(context, providers, now, cooldowns)
    def healthy(name, _spec):
        if reason:
            raise RepairRoutingUnavailable(reason)
        return context["health"][name]["healthy"]
    cooled = set() if reason else {name for name, until in cooldowns.items()
                                  if until is not None and until > now}
    return remediation.plan_ladder(classified, record, providers, now, head,
                                   healthy=healthy, cooled=cooled)


def template(args: list[str], values: dict) -> list[str]:
    """`{here}` is the release directory, so lane-owned helpers resolve on every host."""
    return [arg.format(**{"here": str(HERE), **values}) for arg in args]


def process_group_alive(group: int) -> bool:
    permission_error = None
    try:
        os.killpg(group, 0)
    except ProcessLookupError:
        return False
    except PermissionError as error:
        permission_error = error
    # A successful signal probe also sees zombie-only groups on Linux; Darwin
    # can report EPERM for an empty group. Neither proves a live member remains.
    try:
        members = subprocess.run(["ps", "-axo", "pgid=,stat="], capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.SubprocessError):
        if permission_error is not None:
            raise permission_error
        return True  # unreadable membership cannot prove drainage
    rows = [line.split() for line in (members.stdout or "").splitlines() if line.strip()] if members.returncode == 0 else []
    # ps includes itself, so an empty or partially parsed table is unknown.
    # Preserve Linux/BSD state modifiers instead of mistaking them for rows to drop.
    valid = rows and all(len(fields) == 2 and re.fullmatch(r"[0-9]+", fields[0])
                         and re.fullmatch(r"[DIRSTUWZXIt][<NLsl+>AEVWXJKCP]*", fields[1]) for fields in rows)
    if not valid:
        if permission_error is not None:
            raise permission_error
        return True
    return any(fields[0] == str(group) and not fields[1].startswith("Z")
               for fields in rows)


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


    def observe_fixed(self, deadline):
        """This custodian's exact Linux births, never environment/name matching.

        Reuse the maintained proc-stat identity reader, not the self-test scope
        marker, environment census or its cleanup authority. Default observe and
        stop remain byte-exact. The root is never reaped while ownership is read.
        """
        handles = self.__dict__.setdefault("_fixed_handles", {})
        rows = {}
        for entry in Path("/proc").iterdir():
            if time.monotonic() >= deadline:
                raise FleetObservationHeld("fleet-observer-process-read-deadline")
            if entry.name.isdecimal():
                row = _selftest_process_row(entry, int(entry.name), os.getuid())
                if row is not None: rows[int(entry.name)] = row
        live = {pid for pid, birth in self.owned.items() if pid in rows and rows[pid][3] == birth}
        if not self.owned and self.pid in rows: live.add(self.pid)
        while True:
            children = {pid for pid, row in rows.items()
                        if row[0] in live or row[0] == self._fixed_custodian
                        or (not self.__dict__.get("_fixed_leader_reaped", False) and row[1] == self.pid)}
            if children <= live: break
            live |= children
        escaped = any(rows[pid][1] != self.pid for pid in live)
        self._fixed_escaped = self.__dict__.get("_fixed_escaped", False) or escaped
        for pid in live:
            row = rows[pid]
            if pid in self.owned and self.owned[pid] != row[3]:
                raise FleetObservationHeld("fleet-observer-birth-changed")
            if pid not in handles:
                try:
                    fd = os.pidfd_open(pid, 0)
                except ProcessLookupError:
                    if _selftest_process_row(Path("/proc") / str(pid), pid, os.getuid()) is None:
                        continue
                    raise FleetObservationHeld("fleet-observer-signal-identity-unavailable") from None
                after = _selftest_process_row(Path("/proc") / str(pid), pid, os.getuid())
                if after is None:
                    os.close(fd)
                    continue
                if after[3] != row[3]:
                    os.close(fd)
                    raise FleetObservationHeld("fleet-observer-signal-identity-changed")
                handles[pid] = fd
            self.owned[pid] = row[3]
        return {pid: rows[pid] for pid in live if not rows[pid][2].startswith("Z")}, self._fixed_escaped

    def stop_fixed(self, deadline):
        """TERM/KILL and actual drain fit within the one fixed profile deadline."""
        import signal
        term_until = min(time.monotonic() + 2, deadline - 1)
        sent = set()
        while time.monotonic() < deadline:
            rows, _ = self.observe_fixed(deadline)
            if not rows: return
            sig = signal.SIGTERM if time.monotonic() < term_until else signal.SIGKILL
            for pid, row in rows.items():
                if (pid, row[3], sig) in sent: continue
                current = _selftest_process_row(Path("/proc") / str(pid), pid, os.getuid())
                if current is None or current[2].startswith("Z"): continue
                if current[3] != row[3]:
                    raise FleetObservationHeld("fleet-observer-signal-identity-changed")
                try:
                    signal.pidfd_send_signal(self._fixed_handles[pid], sig, None, 0)
                except ProcessLookupError:
                    # This kernel-bound birth exited after the identity read.
                    # Rescan; ESRCH alone does not establish child drain.
                    continue
                sent.add((pid, row[3], sig))
            time.sleep(min(.01, max(0, deadline - time.monotonic())))
        raise FleetObservationHeld("fleet-observer-cleanup-unproven")

    def close_fixed(self):
        for fd in self.__dict__.pop("_fixed_handles", {}).values(): os.close(fd)


class FleetObservationHeld(RuntimeError):
    """A fixed read observer has no launch, observation or cleanup authority."""


@dataclass(frozen=True)
class FleetObservationRequest:
    # In-process only, from the existing writer protocol, never CLI/JSON input.
    preparation_started: float
    control_fd: int | None = None


FLEET_OBSERVER_EXECUTABLES = {
    "/usr/bin/python3.12": "1643dacd9feaedc58f3cc581e4d22577dfe25c09b10282936186ccf0f2e61118",
    "/usr/bin/gh": "56b8bbbb27b066ecb33dbef9a256dc9d1314adaeff0908a752feba6c34053b40",
    "/usr/bin/git": "2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668",
    "/usr/bin/systemctl": "7ba82b5ba146759c710e1b80fadaa3fdbc0f9b85c8fb2c8c3196b7b1a0037ef8",
}
FLEET_OBSERVER_SOURCES = ("gem-priority-gate.py", "closure_health.py", "gem_gate_contract.py",
                          "summer_ci_audit.py", "symphony_proof_context.py")


def _fleet_observer_executable(name):
    """Verify the actual existing route; never replace a shim by changing PATH."""
    path = Path("/usr/bin") / name
    expected = FLEET_OBSERVER_EXECUTABLES.get(str(path))
    try:
        actual = shutil.which(name)
        if not expected or actual is None or Path(actual).resolve(strict=True) != path:
            raise FleetObservationHeld("fleet-observer-existing-executable-route-unknown")
        info = path.lstat()
        raw, opened = lifecycle._read_regular(path, 64 * 1024 * 1024)
        if (info.st_uid != 0 or info.st_mode & 0o6022 or raw[:4] != b"\x7fELF"
                or opened.st_uid != 0 or opened.st_mode & 0o6022
                or hashlib.sha256(raw).hexdigest() != expected):
            raise FleetObservationHeld("fleet-observer-executable-closure-changed")
    except OSError:
        raise FleetObservationHeld("fleet-observer-executable-unavailable") from None
    return str(path)


def _fleet_observer_transport():
    if any(key.startswith(("LD_", "DYLD_")) or key in {"BASH_ENV", "ENV"} for key in os.environ):
        raise FleetObservationHeld("fleet-observer-loader-environment-unknown")
    if os.environ.get("GH_HOST", "github.com") != "github.com":
        raise FleetObservationHeld("fleet-observer-existing-explicit-github-identity-required")
    return _fleet_observer_executable("gh")


def _fleet_observation_profile(cmd, cwd, request):
    """Fail before forking on an unknown fixed source/OS/transport closure.

    This exact Gem executable baseline is private pending Native review. A changed
    binary is a qualification hold, never a fallback to a wrapper or another login.
    No supplied packet, arbitrary command or environment marks a profile trusted.
    """
    import ast
    import signal
    import threading
    now = time.monotonic()
    if (type(request) is not FleetObservationRequest or type(request.preparation_started) not in (int, float)
            or not math.isfinite(request.preparation_started) or not 0 <= now - request.preparation_started < 50
            or sys.platform != "linux" or threading.active_count() != 1
            or not all(callable(getattr(os, name, None)) for name in ("fork", "waitid", "pidfd_open"))
            or not callable(getattr(signal, "pidfd_send_signal", None)) or not hasattr(os, "WNOWAIT")):
        raise FleetObservationHeld("fleet-observer-platform-or-preparation-unavailable")
    if request.control_fd is not None and (type(request.control_fd) is not int or request.control_fd < 0
            or not stat.S_ISFIFO(os.fstat(request.control_fd).st_mode)
            or fcntl.fcntl(request.control_fd, fcntl.F_GETFL) & os.O_ACCMODE != os.O_RDONLY):
        raise FleetObservationHeld("fleet-observer-explicit-control-pipe-required")
    state = Path.home() / ".local/state/jovie-lanes"
    if lifecycle.active() or lifecycle.FD_ENV in os.environ or (state / "current").resolve() != HERE:
        raise FleetObservationHeld("fleet-observer-canonical-reader-required")
    gate = HERE.parent / "fleet-gate/gem-priority-gate.py"
    fixed = [sys.executable, "-I", "-B", "-S", "-X", "pycache_prefix=/dev/null", str(gate), "--observe-work-admission"]
    if list(cmd) != fixed or Path(cwd) != HERE:
        raise FleetObservationHeld("fleet-observer-fixed-command-required")
    _fleet_observer_transport()
    if not (os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")):
        raise FleetObservationHeld("fleet-observer-existing-explicit-github-identity-required")
    # Keep the caller's existing explicit credential; do not fall through to a
    # minting shim, CLI account lookup or another account. Values never leave env.
    env = dict(os.environ)
    for name in FLEET_OBSERVER_EXECUTABLES:
        _fleet_observer_executable(Path(name).name)
    if Path(sys.executable).resolve() != Path("/usr/bin/python3.12"):
        raise FleetObservationHeld("fleet-observer-interpreter-closure-changed")
    raw, _ = lifecycle._read_regular(HERE / ".release.json", 65536)
    manifest = lifecycle.validate_release(HERE.parent.parent, json.loads(raw))
    siblings = {name[:-3] for name in FLEET_OBSERVER_SOURCES}
    # -B disables writes only. The fixed prefix below the existing null device
    # prevents bytecode reads too, without deleting a canonical cache.
    null = Path("/dev/null").lstat()
    dev = Path("/dev").lstat()
    if (not stat.S_ISCHR(null.st_mode) or null.st_uid != 0 or null.st_rdev != os.makedev(1, 3)
            or not stat.S_ISDIR(dev.st_mode) or dev.st_uid != 0 or dev.st_mode & 0o22):
        raise FleetObservationHeld("fleet-observer-bytecode-boundary-unknown")
    from importlib.machinery import PathFinder, SourceFileLoader, all_suffixes
    allowed = {*FLEET_OBSERVER_SOURCES, "scoped_admission.py"}
    if any(path.name != "__pycache__" and (path.is_dir() and any((path / ("__init__" + suffix)).exists() for suffix in all_suffixes())
           or any(path.name.endswith(suffix) for suffix in all_suffixes())) and path.name not in allowed
           for path in gate.parent.iterdir()):
        raise FleetObservationHeld("fleet-observer-shadow-import-unknown")
    for name in FLEET_OBSERVER_SOURCES:
        relative = "scripts/fleet-gate/" + name
        if relative not in manifest["objects"]:
            raise FleetObservationHeld("fleet-observer-import-not-manifest-bound")
        if name != "gem-priority-gate.py":
            spec = PathFinder.find_spec(name[:-3], [str(gate.parent)])
            if (spec is None or type(spec.loader) is not SourceFileLoader
                    or spec.submodule_search_locations is not None or spec.origin != str(gate.parent / name)):
                raise FleetObservationHeld("fleet-observer-shadow-import-unknown")
        source, _ = lifecycle._read_regular(gate.parent / name)
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                imports = [node.module] if isinstance(node, ast.ImportFrom) else [alias.name for alias in node.names]
                for value in imports:
                    module = (value or "").split(".")[0]
                    if module in siblings: continue
                    if module in sys.stdlib_module_names:
                        if PathFinder.find_spec(module, [str(gate.parent)]) is not None:
                            raise FleetObservationHeld("fleet-observer-shadow-import-unknown")
                        continue
                    # Existing closure policy has an explicit ImportError
                    # fallback for this optional registry. Never silently drop
                    # a present registry by adding -S; a present/ambiguous module
                    # needs its own source binding before this profile may run.
                    if module == "gem_repo_registry" and importlib.util.find_spec(module) is None:
                        continue
                    raise FleetObservationHeld("fleet-observer-import-closure-unknown")
            if isinstance(node, ast.Call):
                function = ast.unparse(node.func)
                if (function in {"os.fork", "os.forkpty", "os.setsid", "os.setpgid", "os.system", "eval", "exec", "__import__"}
                        or function.startswith(("os.spawn", "os.exec"))
                        or any(k.arg in {"shell", "start_new_session", "preexec_fn"} and not isinstance(k.value, ast.Constant)
                               or k.arg in {"shell", "start_new_session", "preexec_fn"} and bool(k.value.value)
                               for k in node.keywords)):
                    raise FleetObservationHeld("fleet-observer-nondetaching-closure-unknown")
        if name == "gem-priority-gate.py":
            observe = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "observe_signals")
            entry = next(value for node in ast.walk(observe) if isinstance(node, ast.Dict)
                         for key, value in zip(node.keys, node.values)
                         if isinstance(key, ast.Constant) and key.value == "lease")
            if (not isinstance(entry, ast.IfExp) or ast.unparse(entry.test) != "_WORK_OBSERVATION_ONLY.get()"
                    or not isinstance(entry.body, ast.Dict)
                    or any(isinstance(n, ast.Call) for n in ast.walk(entry.body))):
                raise FleetObservationHeld("fleet-observer-guard-bin-closure-not-excluded")
    deadline = request.preparation_started + 60
    if deadline - time.monotonic() < 10:
        raise FleetObservationHeld("fleet-observer-drain-reserve-exhausted")
    return fixed, env, deadline


def _fleet_observation_drain(owned, process, deadline):
    """ECHILD, not a zero waitpid result, proves this subreaper has no child."""
    if not owned.__dict__.get("_fixed_leader_reaped", False):
        owned.stop_fixed(deadline)
        owned._fixed_returncode = process.wait(timeout=max(.001, deadline - time.monotonic()))
        owned._fixed_leader_reaped = True
    while time.monotonic() < deadline:
        # A fork/adoption can complete after the preceding /proc enumeration.
        # Once root is reaped its numeric PGID is no longer an ownership witness.
        owned.stop_fixed(deadline)
        try:
            if os.waitpid(-1, os.WNOHANG)[0] == 0:
                time.sleep(min(.01, max(0, deadline - time.monotonic())))
        except ChildProcessError:
            return owned._fixed_returncode
    raise FleetObservationHeld("fleet-observer-cleanup-unproven")


def _fleet_observation_custodian(command, env, deadline, live_fd, result_fd):
    """One ephemeral child custodian; no lifecycle, canonical state or retries.

    Linux child-subreaping detects even a pre-snapshot detached orphan as a
    contract violation. It is not containment against custodian SIGKILL.
    """
    import ctypes
    import select
    import signal
    process, owned, payload, cancelled = None, None, bytearray(), [False]
    result = {"held": "fleet-observer-cleanup-unproven", "drained": False}
    try:
        os.setsid()
        # Close every inherited FD except this invocation's two private ends.
        for name in os.listdir("/proc/self/fd"):
            fd = int(name)
            if fd not in {live_fd, result_fd}:
                try: os.close(fd)
                except OSError: pass
        libc = ctypes.CDLL(None, use_errno=True)
        if libc.prctl(36, 1, 0, 0, 0) != 0:  # PR_SET_CHILD_SUBREAPER, this process only
            raise FleetObservationHeld("fleet-observer-subreaper-unavailable")
        def cancel(*_): cancelled[0] = True
        signal.signal(signal.SIGTERM, cancel)
        signal.signal(signal.SIGINT, cancel)
        signal.signal(signal.SIGCHLD, signal.SIG_DFL)
        process = subprocess.Popen(command, cwd=HERE, env=env, stdin=subprocess.DEVNULL,
                                   stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                   close_fds=True, start_new_session=True)
        owned = AgentProcesses(process.pid)
        owned._fixed_custodian = os.getpid()
        # A direct, unreaped child cannot have its PID recycled at this point.
        # Retain its kernel handle before any observation/output failure.
        owned._fixed_handles = {process.pid: os.pidfd_open(process.pid, 0)}
        os.set_blocking(process.stdout.fileno(), False)
        observer_end = deadline - 5
        failure = None
        terminal = False
        while time.monotonic() < deadline:
            rows, escaped = owned.observe_fixed(deadline)
            if escaped: failure = "fleet-observer-detached-child"
            if cancelled[0] or select.select([live_fd], [], [], 0)[0]:
                failure = "fleet-observer-parent-closed"
            if time.monotonic() >= observer_end: failure = failure or "fleet-observer-timeout"
            chunk = os.read(process.stdout.fileno(), 262145 - len(payload)) if select.select([process.stdout], [], [], 0)[0] else b""
            payload.extend(chunk)
            if len(payload) > 262144: failure = "fleet-observer-output-bound"
            terminal = os.waitid(os.P_PID, process.pid, os.WEXITED | os.WNOHANG | os.WNOWAIT) is not None
            if failure or terminal:
                code = _fleet_observation_drain(owned, process, deadline)
                result["drained"] = True
                if owned.__dict__.get("_fixed_escaped", False):
                    failure = failure or "fleet-observer-detached-child"
                if not failure:
                    while True:
                        chunk = os.read(process.stdout.fileno(), 262145 - len(payload))
                        if not chunk: break
                        payload.extend(chunk)
                        if len(payload) > 262144: raise FleetObservationHeld("fleet-observer-output-bound")
                    result = {"returncode": code, "stdout": payload.decode("utf-8"), "drained": True}
                else:
                    result = {"held": failure, "drained": True}
                break
            select.select([live_fd, process.stdout], [], [], min(.02, max(0, observer_end - time.monotonic())))
    except BaseException as error:
        # Do not expose raw exceptions, environments, subprocess stderr or data.
        result["held"] = (str(error) if isinstance(error, FleetObservationHeld)
                          else "fleet-observer-output-invalid" if isinstance(error, UnicodeDecodeError)
                          else "fleet-observer-observation-unavailable")
        if owned is not None and not result["drained"] and time.monotonic() < deadline:
            try:
                _fleet_observation_drain(owned, process, deadline)
                result["drained"] = True
            except BaseException: pass
        if owned is not None and not result["drained"]:
            # Kernel handles never retarget a recycled PID/PGID, including a
            # failure during wait itself. Unknown visibility remains held;
            # best-effort signals cannot be represented as proven drain.
            for handle in owned.__dict__.get("_fixed_handles", {}).values():
                try: signal.pidfd_send_signal(handle, signal.SIGKILL, None, 0)
                except OSError: pass
    finally:
        if owned is not None: owned.close_fixed()
        try:
            frame = json.dumps(result, separators=(",", ":")).encode()
            if len(frame) > 1048576:
                frame = json.dumps({"held": "fleet-observer-result-bound", "drained": result["drained"]}).encode()
            offset = 0
            while offset < len(frame) and time.monotonic() < deadline:
                if select.select([], [result_fd], [], max(0, deadline - time.monotonic()))[1]:
                    try: offset += os.write(result_fd, frame[offset:])
                    except BlockingIOError: continue
        except OSError: pass  # dead reader never receives a positive outcome
        os._exit(0)


def _run_fleet_observation(cmd, cwd, request):
    """Fixed-profile arm of run_agent; the default provider path is unchanged."""
    import select
    command, env, deadline = _fleet_observation_profile(cmd, cwd, request)
    control = live_r = live_w = result_r = result_w = None
    pid = None
    outcome = bytearray()
    cancelled = False
    eof = False
    try:
        control = os.dup(request.control_fd) if request.control_fd is not None else None
        live_r, live_w = os.pipe2(os.O_CLOEXEC | os.O_NONBLOCK)
        result_r, result_w = os.pipe2(os.O_CLOEXEC | os.O_NONBLOCK)
        watch = select.poll()
        # POLLHUP is observable even behind queued control bytes. Never consume
        # or mistake POLLIN/request-body EOF for this explicit writer protocol.
        if control is not None: watch.register(control, select.POLLHUP | select.POLLERR)
        if watch.poll(0): raise FleetObservationHeld("fleet-observer-control-unavailable")
        pid = os.fork()
        if pid == 0:
            try:
                os.close(live_w); os.close(result_r)
                if control is not None: os.close(control)
                _fleet_observation_custodian(command, env, deadline, live_r, result_w)
            finally:
                os._exit(1)
        os.close(live_r); live_r = None
        os.close(result_w); result_w = None
        while time.monotonic() < deadline:
            if watch.poll(0) and not cancelled:
                cancelled = True
                os.close(live_w); live_w = None
            ready, _, _ = select.select([result_r], [], [], min(.02, max(0, deadline - time.monotonic())))
            if ready:
                chunk = os.read(result_r, 1048577 - len(outcome))
                if not chunk:
                    eof = True
                    break
                outcome.extend(chunk)
                if len(outcome) > 1048576: raise FleetObservationHeld("fleet-observer-result-bound")
        if cancelled: raise FleetObservationHeld("fleet-observer-parent-control-closed")
        if not eof: raise FleetObservationHeld("fleet-observer-custodian-deadline")
        try: value = json.loads(outcome)
        except ValueError: raise FleetObservationHeld("fleet-observer-custodian-unavailable") from None
        if value.get("drained") is not True or "held" in value:
            raise FleetObservationHeld(value.get("held", "fleet-observer-cleanup-unproven"))
        return subprocess.CompletedProcess(command, value["returncode"], value["stdout"], "")
    finally:
        for fd in (control, live_r, live_w, result_r, result_w):
            if fd is not None:
                try: os.close(fd)
                except OSError: pass
        if pid is not None:
            # Bounded reap only; killing the custodian would discard custody.
            while time.monotonic() < deadline:
                if os.waitpid(pid, os.WNOHANG)[0]: break
                time.sleep(.005)


class RunStopped(BaseException):
    """SIGTERM/SIGINT while a provider runs: the caller's `on_kill` revokes publication
    before the owned process tree is killed."""


class CommandNotStarted(OSError):
    """Popen failed before any command child existed."""


def run_agent(cmd: list[str], cwd: Path, log, timeout: int, *, guard=None,
              guard_interval: float = 30, on_kill=None,
              _lifecycle_helper: bool = False, _lifecycle_terminal: bool = False,
              stderr=subprocess.STDOUT, _fleet_observation=None) -> subprocess.CompletedProcess:
    """Track descendants while the provider runs, including detached test sessions.
    Observation cannot recover a child that daemonizes before its first snapshot;
    preserved checkout admission therefore also refuses live working directories.

    `on_kill(error)` runs before the kill of the owned tree is acknowledged: a stop
    (timeout, guard hold, SIGTERM/SIGINT) writes its revocation receipt first, so a
    stopped run can never be published later (JOV-5060).
    """
    if _fleet_observation is not None:
        if (timeout != 60 or log is not None or guard is not None or on_kill is not None
                or _lifecycle_helper or _lifecycle_terminal or stderr != subprocess.STDOUT):
            raise FleetObservationHeld("fleet-observer-fixed-profile-required")
        return _run_fleet_observation(cmd, cwd, _fleet_observation)
    import signal
    free_guard = devin_free_policy.command_guard(cmd, timeout)
    if free_guard:
        # The free-policy proof ticks every second; the ownership guard keeps its own cadence.
        # Running it at 1 Hz made a Devin repair read its multi-page GraphQL target up to 787
        # times, and any one racing read stopped the run as reconcile-unavailable (2026-10-11).
        existing_guard, existing_interval, next_existing = guard, guard_interval, [0.0]
        def guard():
            if existing_guard and time.monotonic() >= next_existing[0]:
                existing_guard()
                next_existing[0] = time.monotonic() + existing_interval
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
        stop_failure = None
        if _lifecycle_helper:
            _HELD_CLEANUP[:] = [owned, proc]
        try:
            owned.stop(proc)
        except RuntimeError as failure:
            # A failed tracked-descendant stop must not skip the process-group sweep below
            # or replace the stop cause with a permanent cleanup hold (Gem, 2026-10-29: a
            # `--timeout 600` trufflehog gate lived 2d17h). Re-verify drainage afterwards.
            stop_failure = failure
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
        if stop_failure is not None and not _cleanup_drained(owned, proc):
            raise stop_failure
        raise
    finally:
        for signo, previous in restored.items():
            try:
                signal.signal(signo, previous)
            except (ValueError, OSError):
                pass


_HELD_CLEANUP: list = []  # [AgentProcesses, Popen] of the helper's last stopped run


def _cleanup_drained(owned, proc) -> bool:
    """True only when no owned descendant and no process-group member remains."""
    try:
        proc.poll()
        return not owned.observe() and not process_group_alive(proc.pid)
    except Exception:
        return False  # unreadable membership cannot prove drainage


def retry_held_cleanup() -> bool:
    """One more TERM/KILL sweep over the helper's owned tree and its process group."""
    import signal
    if len(_HELD_CLEANUP) != 2:
        return False
    owned, proc = _HELD_CLEANUP
    try:
        owned.stop(proc)
    except Exception:
        pass
    if proc.returncode is None:  # unreaped leader: its PID/PGID cannot belong to anyone else
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except OSError:
            pass
    return _cleanup_drained(owned, proc)


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


# EX_TEMPFAIL: the provider wrapper measured a limit, an auth failure or no capacity
# (codex_lane NO_ACCOUNT_EXIT, claude_lane NO_CAPACITY_EXIT). Only those wrappers define it:
# a raw CLI's 75 (devin on LYB runs, Gem 03:38Z) is an unexplained failure, not a limit.
PROVIDER_LIMIT_EXIT = 75
LIMIT_EXIT_PROVIDERS = frozenset({"codex", "claude"})


def provider_exit(reasons) -> int:
    """The agent exit code a provider-error recorded; -1 when none was (never a limit)."""
    for reason in reasons or []:
        found = re.fullmatch(r"agent-exit:(-?\d+)", str(reason))
        if found:
            return int(found.group(1))
    return -1


def cool_down(host: Host, name: str, code: int | None = None) -> bool:
    """Cool a provider only on a measured provider limit (Tim 2026-10-12): a crash or any other
    non-zero exit is a failure, which the current failure rate already backs off on. Returns
    whether a cooldown was written."""
    # `code` None: the caller measured the limit itself. An exit code must be a wrapper's 75.
    if code is not None and (code != PROVIDER_LIMIT_EXIT or name not in LIMIT_EXIT_PROVIDERS):
        return False
    path = host.state / "cooldown" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_text(path, str(time.time() + PROVIDER_COOLDOWN_S))
    return True


def next_provider(host: Host, exclude: set[str], providers: dict | None = None, *,
                  issue: Issue | None = None, minimum_capability: str | None = None):
    """The cheapest enabled, healthy, non-cooling lane not yet tried on this run.

    Order comes from providers.json (optional `tier`, else list position). Registry
    exclusions and the same host slot limits used by dispatch also apply to handoff.
    An issue handoff keeps its guarded lanes and capability floor, including model choice.
    """
    catalog = providers or load_providers()
    host_excluded = {name for name, spec in catalog.items()
                     if isinstance(spec, dict) and host.slots(name, spec.get("slots", 1)) <= 0}
    cooled = {name for name in catalog if cooling(host, name)}

    health = {}
    def healthy(name, spec):
        if name not in health:
            health[name] = provider_healthy(spec)
        return health[name]

    if issue is not None:
        routing_catalog = catalog
        if minimum_capability is not None:
            if minimum_capability not in remediation.CAPABILITIES:
                return None
            floor = remediation.capability_rank(minimum_capability)
            routing_catalog = {name: {**spec, "routes": [route for route in spec.get("routes") or ()
                               if isinstance(route, dict) and remediation.capability_rank(route.get("capability")) >= floor]}
                               for name, spec in catalog.items() if isinstance(spec, dict)}
        allowed = lane_restriction(issue, catalog)
        allowed = set(catalog) if allowed is None else allowed
        allowed -= set(exclude) | host_excluded | cooled | {
            name for name, spec in catalog.items() if isinstance(spec, dict) and spec.get("repairs") is False}
        availability = lane_availability(host, "", catalog)

        def available(name, route):
            seen = availability(name, route)
            if seen["ok"] and not healthy(name, catalog[name]):
                return {"ok": False, "why": "unhealthy", "pressure": seen.get("pressure", 0)}
            return seen

        decision = remediation.route_issue(
            {"identifier": issue.identifier, "title": issue.title, "description": issue.description,
             "labels": issue.labels}, routing_catalog, read_json(ROUTING_POLICY), available, only_lanes=allowed)
        if minimum_capability is not None and remediation.capability_rank(decision["required"]) < floor:
            decision.update(required=minimum_capability,
                            reasons=[*decision["reasons"], f"initial-handoff-floor:{minimum_capability}"],
                            rationale=f"Preserving {minimum_capability} handoff floor; {decision['rationale']}")
        chosen = decision["chosen"]
        if chosen is None:
            return None
        return chosen["lane"], {**catalog[chosen["lane"]], "model": chosen["model"], "route": decision}

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

def run_hyperagent_issue(host: Host, spec: dict, issue: Issue, linear: Linear | None = None) -> dict:
    """Use the same execution contract and gate for remote work, without local-code failover."""
    import runpy
    runs = host.state / "runs"
    runs.mkdir(parents=True, exist_ok=True)
    ident = execution_attempt.identity("linear-work", {"issue": issue.identifier, "outcome": "draft-pr"},
                                       {"title": issue.title, "description": issue.description})
    branch = f"hyperagent/{issue.identifier.lower()}-{ident['identityDigest'][:15]}"
    evidence = runs / f"{ident['identityDigest']}.provider.jsonl"
    run_id = f"{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-{issue.identifier}-hyperagent-{uuid.uuid4().hex[:6]}"
    receipt = {"schema": "jovie-lane-run/v1", "runId": run_id, "repository": REPO_SLUG,
               "executionHost": HOST, "initiator": "symphony",
               "provider": "hyperagent", "model": spec.get("model"),
               "origin": AUTONOMOUS_ORIGIN, "issue": issue.identifier, "linearIssueId": issue.id,
               "branch": branch, "workstream": workstreams.classify(issue.title, issue.labels),
               "startedAt": now_iso(), "offer": {"eligible": True, "accepted": False},
               "attribution": {"category": "autonomous-created", "originProvider": "hyperagent", "finalProvider": "hyperagent"},
               **({"eventClaim": dict(issue.event_claim)} if issue.event_claim else {}),
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
                prompt = render_prompt(issue, branch, context_pack(issue), provider="hyperagent",
                                       prior_attempts=prior_attempts_context(host, linear, issue),
                                       machine=machine_gate(host, issue.identifier, issue.title, issue.labels,
                                                            issue.description or "", "hyperagent", receipt=receipt))
                atomic_write_text(runs / f"{run_id}.prompt.md", prompt)
                def boundary(spend, mutations, phase):
                    execution_attempt.boundary(runs / "execution-attempts.jsonl", ident, claimed["fencingToken"],
                                               {"spend": spend, "mutations": mutations}, coordination=coordination, boundary_id=phase)
                def find_pr(number):
                    result = sh(["gh", "pr", "view", str(number), "--repo", REPO_SLUG, "--json",
                                 "number,url,state,title,body,headRefName,headRefOid"])
                    if result.returncode:
                        raise RuntimeError("PR read unavailable")
                    return json.loads(result.stdout)
                def gate(pr):
                    boundary(0, 1, "hyperagent-adopt")
                    # Existing adoption owns its isolated checkout, diff policy,
                    # canonical checks and native queue; no second PR is created.
                    return adopt_pr(host, "hyperagent", pr)
                receipt["offer"]["accepted"] = True
                receipt.update(hyperagent_lane.run(spec, issue.identifier, claimed["fencingToken"], branch, prompt,
                    evidence, api["mcp_call"], find_pr, gate, timeout=host.agent_timeout,
                    before_dispatch=lambda: boundary(1, 1, "hyperagent-create"), refresh=refresh))
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
        return run_hyperagent_issue(host, spec, issue, linear)
    run_id = f"{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-{issue.identifier}-{name}-{uuid.uuid4().hex[:6]}"
    runs = host.state / "runs"
    runs.mkdir(parents=True, exist_ok=True)
    branch = f"{name}/{issue.identifier.lower()}-{run_id[:15].lower()}"
    worktree = host.state / "worktrees" / run_id
    provider_evidence = runs / f"{run_id}.provider.jsonl"
    receipt = {"schema": "jovie-lane-run/v1", "runId": run_id, "repository": REPO_SLUG,
               "executionHost": HOST, "initiator": "symphony", "provider": name, "model": spec.get("model"),
               "accountClass": spec.get("accountClass"), "origin": AUTONOMOUS_ORIGIN,
               "issue": issue.identifier, "linearIssueId": issue.id, "branch": branch,
               "workstream": workstreams.classify(issue.title, issue.labels),
               "worktree": str(worktree), "offer": {"eligible": True, "accepted": False},
               "attribution": {"category": "autonomous-created", "originProvider": name,
                               "finalProvider": name}, "startedAt": now_iso(),
               **({"eventClaim": dict(issue.event_claim)} if issue.event_claim else {}),
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
            prior_attempts = prior_attempts_context(host, linear, issue)
            prompt = render_prompt(issue, branch, brain_context, provider=name, prior_attempts=prior_attempts,
                                   machine=machine_gate(host, issue.identifier, issue.title, issue.labels,
                                                        issue.description or "", name, receipt=receipt))
            prompt_file = runs / f"{run_id}.prompt.md"
            receipt["contextManifests"] = [write_agent_prompt(
                prompt_file, prompt, "issue", name,
                {"issue": json.dumps({"id": issue.id, "identifier": issue.identifier,
                                      "title": issue.title, "description": issue.description,
                                      "labels": sorted(issue.labels)}, sort_keys=True),
                 "gbrain": brain_context, "branch": branch, "prior_attempts": prior_attempts})]
            started = time.time()
            execution_attempt.boundary(runs / "execution-attempts.jsonl", ident, claimed["fencingToken"],
                                       {"spend": 1, "mutations": 1}, coordination=coordination, boundary_id="issue-dispatch")
            agent = run_agent(template(spec["cmd"], {"prompt": prompt, "prompt_file": str(prompt_file), "cwd": str(worktree),
                                                       "provider_receipt": str(provider_evidence),
                                                       "model": str(spec.get("model"))}),
                              worktree, log, host.agent_timeout,
                              guard=lambda: run_guard("agent-running"), on_kill=revoke_run)
            # Tim 2026-09-27: an exhausted provider never leaves the issue half-done; another
            # lane finishes it on the same worktree.
            handoffs, current = [], name
            while agent.returncode != 0 and len(handoffs) < PROVIDER_HANDOFFS:
                nxt = next_provider(host, {name, *(h["to"] for h in handoffs)}, issue=issue,
                                    minimum_capability=(spec.get("route") or {}).get("required"))
                if nxt is None:
                    break
                cool_down(host, current, agent.returncode)
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
                                           {"spend": 1, "mutations": 1}, coordination=coordination, boundary_id=f"issue-handoff:{len(handoffs)}")
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
            if receipt.get("verdict") in {"disk-held", "pr-readback-pending"}:
                preserve_repair(worktree, receipt)
            else:
                reap_run_processes(worktree, receipt)
                if remove_worktree(host, worktree):
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
    if "prReadback" in receipt:
        receipt["result"]["prReadback"] = receipt["prReadback"]
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


def verify_and_land(host: Host, issue: Issue, branch: str, worktree: Path, log, started: float,
                    opened: bool = False, sensitive: bool = False) -> dict:
    """Independent of the agent's own claim: find its PR, re-derive the diff, run checks, then land."""
    def pending(reason):
        return {"verdict": "pr-readback-pending", "reasons": [reason],
                "prReadback": {"state": "unknown", "branch": branch},
                "next_action": "reconcile-existing-branch-pr-through-maintained-reader"}

    try:
        listed = sh(["gh", "pr", "list", "--repo", REPO_SLUG, "--state", "open", "--head", branch,
                     "--json", "number,headRefName,headRefOid,createdAt,url,isDraft"], log=log)
    except (subprocess.TimeoutExpired, OSError):
        return pending("pr-inventory-unavailable")
    if listed.returncode:
        return pending("pr-inventory-unavailable")
    try:
        prs = json.loads(listed.stdout)
        if not isinstance(prs, list) or len(prs) > 1:
            raise ValueError("inventory shape")
        for pr in prs:
            if (not isinstance(pr, dict) or type(pr.get("number")) is not int or pr["number"] <= 0
                    or pr.get("headRefName") != branch or type(pr.get("isDraft")) is not bool
                    or any(not isinstance(pr.get(key), str) or not pr[key]
                           for key in ("headRefOid", "url", "createdAt"))):
                raise ValueError("PR identity")
            created = datetime.fromisoformat(pr["createdAt"].replace("Z", "+00:00"))
            if created.tzinfo is None or created.timestamp() < started - 60:
                raise ValueError("PR generation")
    except (ValueError, TypeError, OverflowError):
        return pending("pr-inventory-invalid")
    if not prs and opened:
        # A create response (including 'already exists') is not readback.
        # Visibility/transport uncertainty must never start another PR attempt.
        return pending("pr-create-readback-unconfirmed")
    if not prs:
        ahead = sh(["git", "rev-list", "--count", "origin/main..HEAD"], cwd=worktree).stdout.strip()
        if ahead in ("", "0"):
            return {"verdict": "no-change", "reasons": ["no-pr-and-no-commits"]}
        require_publishable(host, branch, "before-push")
        try:
            pushed = sh(["git", "push", "-q", "-u", "origin", branch], cwd=worktree, log=log)
        except (subprocess.TimeoutExpired, OSError):
            return pending("pr-publication-unconfirmed")
        if pushed.returncode:
            return pending("pr-publication-unconfirmed")
        # The push's own hooks can take minutes; a stop during them still bars the PR open.
        require_publishable(host, branch, "before-pr-create")
        try:
            sh(["gh", "pr", "create", "--repo", REPO_SLUG, "--draft", "--head", branch,
                "--title", f"fix: {issue.title[:80]} ({issue.identifier})",
                "--body", f"Refs {issue.identifier}.\n\n"
                f"<!-- linear-issue-id:{issue.id} -->\n"
                f"<!-- linear-issue-identifier:{issue.identifier} -->\n"
                '<!-- customer-changelog/v1 {"releaseWorthy":false} -->\n\n'
                "Lane implementation; verification by the lane gate. "
                "Runtime and commissioning acceptance remain with the issue owner."], cwd=worktree, log=log)
        except (subprocess.TimeoutExpired, OSError):
            pass  # A create may have landed remotely; reconcile once, never resend.
        return verify_and_land(host, issue, branch, worktree, log, started, opened=True, sensitive=sensitive)
    pr = max(prs, key=lambda item: item["createdAt"])
    if sensitive:
        require_publishable(host, pr.get("headRefName") or branch, "before-label")
        sh(["gh", "label", "create", SENSITIVE_PR_LABEL, "--repo", REPO_SLUG, "--force",
            "--color", "B60205", "--description", "Guarded auth/billing/infra lane policy"], log=log)
        sh(["gh", "pr", "edit", str(pr["number"]), "--repo", REPO_SLUG,
            "--add-label", SENSITIVE_PR_LABEL], log=log)
    return gate_pr(host, pr, worktree, log, sensitive=sensitive)


UPDATE_DRAIN_REASON = "update-pending-drain"
STAGING_ADMISSION_WAIT_S = 20.0


@contextmanager
def gate_admission(host: Host, *, staging: bool = False):
    """Serialize seat admission with a non-waiting release proof reservation.

    Staging owns every existing gate seat until its proof helper drains. It
    defers to an admitted qualifier; a new qualifier defers to staging before
    starting heavy work. This does not attest custody of arbitrary SSH arrivals.
    """
    if not staging and lifecycle.draining(host.state):
        raise lifecycle.AdmissionHeld("operator requested natural controller drain")
    if not staging and update_drain.status(host.state)["active"]:
        raise lifecycle.AdmissionHeld(UPDATE_DRAIN_REASON)
    admission = Locked(host.state / "locks" / "gate-admission.lock", blocking=False)
    if staging:
        # Other workers hold the admission lock for milliseconds while they take a seat; the proof used
        # to lose to that on the first try. Wait briefly for it, then give up as before.
        waited = 0.0
        while not admission.held and waited < STAGING_ADMISSION_WAIT_S:
            admission.release()
            time.sleep(0.25)
            waited += 0.25
            admission = Locked(host.state / "locks" / "gate-admission.lock", blocking=False)
    seats = []
    try:
        if not admission.held:
            raise lifecycle.AdmissionHeld("gate-admission-busy")
        if staging:
            for index in range(host.gate_slots):
                seat = Locked(host.state / "slots" / f"gate.{index}.lock", blocking=False)
                seats.append(seat)
                if not seat.held:
                    raise lifecycle.AdmissionHeld("release-proof-gate-active")
        yield (admission, *seats)
    finally:
        for lock in reversed([admission, *seats]):
            lock.release()


def gate_slot(host: Host) -> tuple[Locked, float]:
    """One of `gate_slots` host-wide gate seats; waits (polling) until one is free.

    Returns the held seat and the seconds spent queued for it, so seat contention is
    measured per gated PR instead of inferred from timeouts.
    """
    started = time.time()
    while True:
        try:
            with gate_admission(host):
                for index in range(host.gate_slots):
                    lock = Locked(host.state / "slots" / f"gate.{index}.lock", blocking=False)
                    if lock.held:
                        return lock, time.time() - started
                    lock.release()
        except lifecycle.AdmissionHeld as error:
            if str(error) == UPDATE_DRAIN_REASON:
                # A pending update is draining the gate: wait in place (bounded by the drain), never cancel.
                time.sleep(15)
                continue
            raise RepairStopped(str(error), None, "before-gate-seat") from error
        time.sleep(15)


GATE_RESULT_SCHEMA = "jovie.lane-gate-result/v1"
def gate_policy_digest() -> str:
    return hashlib.sha256(Path(__file__).read_bytes() + b"\0dependency_diff\0" +
                          Path(dependency_diff.__file__).read_bytes() + b"\0qualification_guard\0" +
                          Path(qualification_guard.__file__).read_bytes()).hexdigest()


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


GATE_OWNER_KINDS = ("fix", "gate")  # Either foreign owner defers a gate on that head.


def require_gate_command_authority(host: Host, pr: dict, worktree: Path, stage: str, sensitive: bool) -> None:
    """Waiting for a seat is not permission to run checks for stale authority."""
    try:
        if claimed_elsewhere(pr["number"], pr["headRefOid"], GATE_OWNER_KINDS, timeout=30):
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


def require_qualification_checkout(pr: dict, worktree: Path, stage: str) -> dict:
    """A failed safety observation is a deferral, never completed gate evidence."""
    try:
        return qualification_guard.check(worktree, pr["headRefOid"])
    except qualification_guard.CheckoutHeld as error:
        raise RepairStopped(f"qualification-safety:{error}", pr, stage) from error


def _gate_pr(host: Host, pr: dict, worktree: Path, log, sensitive: bool, claim: GateClaim, *, result: dict) -> dict:
    """The independent gate for one PR head: diff rules, the canonical repo gate, then land."""
    revoked = publication_revocation(host, pr.get("headRefName"))
    if revoked:
        return {"pr": pr["number"], "prUrl": pr.get("url"), "headSha": pr["headRefOid"],
                "verdict": "revoked",
                "reasons": [f"publication-revoked:{revoked.get('reason', '?')}"],
                "revocation": revoked}
    # Fetch may invoke local reference hooks; qualification must not execute them.
    if sh(["git", "-c", "core.hooksPath=" + os.devnull, "-c", "core.fsmonitor=false",
           "fetch", "-q", "origin", f"pull/{pr['number']}/head"], cwd=worktree, log=log).returncode != 0:
        raise RepairStopped("gate-checkout-failed", pr, "before-gate-checks")
    try:
        qualification_guard.prepare_checkout(worktree, pr["headRefOid"])
    except qualification_guard.CheckoutHeld as error:
        raise RepairStopped(f"qualification-safety:{error}", pr, "before-gate-checks") from error
    checked_head = sh(["git", "rev-parse", "HEAD"], cwd=worktree)
    if checked_head.returncode or checked_head.stdout.strip() != pr["headRefOid"]:
        raise RepairStopped("gate-checkout-head-mismatch", pr, "before-gate-checks")
    result["qualificationSafety"] = require_qualification_checkout(pr, worktree, "before-gate-checks")
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
                result["qualificationSafety"] = require_qualification_checkout(pr, worktree, "before-gate-command")
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
                result["qualificationSafety"] = require_qualification_checkout(pr, worktree, "before-sensitive-review")
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
        # Merge Queue Green Enroll is the sole queue writer (2026-10-13): it admits this head
        # on the ready_for_review wake or its push-to-main sweep, behind the same hold labels.
        # Lanes never arm auto-merge or enqueue; an armed PR keeps enqueuing through a freeze.
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


# ---------------------------------------------------------------- red wake (JOV-8931)

# The lane-fix-relay labels a red PR within ~40s, but the 5-minute oneshot timer
# is when a worker can actually start: with every slot busy, a red waits out the
# tick (#22868: 11 minutes red to claim). The relay's gem-side job drops a wake
# file; the systemd jovie-lanes-wake.path unit runs fix-now the moment it lands.
RED_DISPATCH_SCHEMA = "jovie-lane-red-dispatch/v1"
RED_DISPATCH_HOUR_S = 3600
WAKE_FILE_MAX_BYTES = 4096
MAX_WAKE_PER_ACTIVATION = 5
MAX_RED_DISPATCH_PER_PR_PER_HOUR = 4


def iso_epoch(stamp):
    try:
        return datetime.fromisoformat(str(stamp).replace("Z", "+00:00")).timestamp()
    except (TypeError, ValueError):
        return None


def read_red_dispatch_rows(state):
    """Bounded optional ledger read; a corrupt or oversized ledger reads as empty."""
    try:
        rows = maintenance_json(state / "runs/red-dispatch.jsonl", json_lines=True)
    except ValueError:
        return []
    return rows if isinstance(rows, list) else []


def append_red_dispatch_row(state, row):
    path = state / "runs/red-dispatch.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as handle:
        handle.write(json.dumps(row) + "\n")


def red_dispatch_claims_this_hour(state, pr, now):
    """Per-PR abuse cap: how many red wakes this PR spent in the last hour."""
    return sum(1 for row in read_red_dispatch_rows(state)
               if row.get("pr") == pr and row.get("status") == "dispatched"
               and isinstance(row.get("dispatchedEpoch"), (int, float))
               and 0 <= now - row["dispatchedEpoch"] < RED_DISPATCH_HOUR_S)


def free_red_provider(host):
    """First enabled provider with a free, healthy, in-quota slot — the same
    admission dispatch's spawn loop applies (disk is checked by the caller)."""
    for name, spec in load_providers().items():
        try:
            if not spec.get("enabled", True):
                continue
            slots = host.slots(name, spec.get("slots", 1))
            if slots <= 0 or cooling(host, name):
                continue
            if not quota_pressure(host, name, spec, time.time())["ok"]:
                continue
            if not provider_healthy(spec):
                continue
            return name
        except Exception:  # one provider's fault must not block the others
            continue
    return None


def record_red_row(state, *, status, pr, sha, run_id, run_attempt, red_at,
                   reason=None, provider=None):
    """One JSONL row per wake outcome. Timestamps join with the CI timing
    collector (JOV-8933) on (pr, sha, runId, runAttempt)."""
    dispatched = status == "dispatched"
    append_red_dispatch_row(state, {
        "schema": RED_DISPATCH_SCHEMA,
        "status": status,
        "pr": pr,
        "sha": sha,
        "runId": run_id,
        "runAttempt": run_attempt,
        "redAt": red_at,
        "redAtEpoch": iso_epoch(red_at),
        "dispatchedAt": now_iso() if dispatched else None,
        "dispatchedEpoch": time.time() if dispatched else None,
        "claimAt": None,
        "provider": provider,
        "reason": reason,
    })


def read_wake_file(path):
    """Bounded, validated wake read. Anything unreadable or oversized is invalid."""
    try:
        if path.stat().st_size > WAKE_FILE_MAX_BYTES:
            return None
        data = json.loads(path.read_text())
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict) or data.get("schema") != pr_events.WAKE_SCHEMA:
        return None
    sha = data.get("sha")
    if not isinstance(data.get("pr"), int) or not re.fullmatch(r"[0-9a-f]{40}", sha or ""):
        return None
    return data


def backlog_wake(host: Host) -> dict:
    """Event-driven Backlog pass: wake files (issue created/updated, outcome gap, Sentry spike, Tim comment,
    capacity change) trigger a sync, refill and forced re-rank for just the teams named, now."""
    teams = {"JOV", *(binding.key for binding in bindings.extra_bindings(THIS))}
    wakes = binding_refill.drain_wakes(host.state, teams)
    if not wakes or os.environ.get("LANES_SELFTEST"):
        return {"wakes": len(wakes)}
    named = sorted({wake["team"] for wake in wakes})
    client = Linear(host.linear_env)
    report = {"wakes": len(wakes), "teams": named,
              "sync": linear_sync.tick(host.state, client, client.admit, (LinearRateLimited,), named)}
    extra = {binding.key: binding for binding in bindings.extra_bindings(THIS)}
    for team in named:
        binding = extra.get(team) or types.SimpleNamespace(key=team, excluded=("hold",), min_todo=0)
        report[team] = {"priority": priority_admission.run(THIS, host, team, client, floor=binding.min_todo, excluded=binding.excluded),
                        "refill": binding_refill.refill(THIS, host, binding, client, binding.min_todo),
                        "rank": binding_refill.rank_pass(THIS, host, binding, client, force=True)}
    return report


def fix_now(host: Host) -> int:
    """Drain the relay's wake dir immediately instead of waiting for the 5-minute
    tick. Same admission as dispatch(): disk, then the first provider with a free
    healthy slot. Dedupe per PR+SHA+attempt via an O_EXCL marker plus the fenced
    lane claim. No slot -> record no-slot and keep the lane-fix-red label; the
    5-minute timer remains the fallback."""
    wake_dir = host.state / "wake"
    if not wake_dir.is_dir():
        return 0
    try:  # backlog events share the wake dir and its path unit; a fault here never blocks red repair
        backlog_wake(host)
    except (Exception, SystemExit):
        pass
    for path in sorted(wake_dir.glob("red-*.json"))[:MAX_WAKE_PER_ACTIVATION]:
        marker = path.with_name(path.name + ".claim")
        try:
            fd = os.open(marker, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            os.close(fd)
        except FileExistsError:
            continue  # an earlier activation already handled this attempt
        data = read_wake_file(path)
        if data is None:
            record_red_row(host.state, status="invalid", pr=None, sha=None,
                           run_id=None, run_attempt=None, red_at=None, reason=path.name)
            path.unlink(missing_ok=True)
            continue
        pr, sha = data["pr"], data["sha"]
        run_id = data.get("runId")
        run_attempt = data.get("runAttempt")
        red_at = data.get("redAt")
        try:
            claimed = pr_events.claim_active(pr, sha, sh, kind="fix")
        except Exception:
            claimed = None
        if claimed:
            record_red_row(host.state, status="already-claimed", pr=pr, sha=sha,
                           run_id=run_id, run_attempt=run_attempt, red_at=red_at)
            path.unlink(missing_ok=True)
            continue
        if red_dispatch_claims_this_hour(host.state, pr, time.time()) >= MAX_RED_DISPATCH_PER_PR_PER_HOUR:
            record_red_row(host.state, status="no-slot", pr=pr, sha=sha, run_id=run_id,
                           run_attempt=run_attempt, red_at=red_at, reason="hourly-cap")
            path.unlink(missing_ok=True)
            continue
        disk = disk_guard.check(host)
        if not disk.get("admitted"):
            record_red_row(host.state, status="no-slot", pr=pr, sha=sha, run_id=run_id,
                           run_attempt=run_attempt, red_at=red_at,
                           reason=f"disk:{disk.get('reason', 'unobservable')}")
            path.unlink(missing_ok=True)
            continue
        provider = free_red_provider(host)
        if provider is None:
            record_red_row(host.state, status="no-slot", pr=pr, sha=sha, run_id=run_id,
                           run_attempt=run_attempt, red_at=red_at, reason="no-free-slot")
            path.unlink(missing_ok=True)
            continue
        subprocess.Popen([sys.executable, str(Path(__file__)), "worker", "--provider", provider],
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         start_new_session=True, **lifecycle.spawn_kwargs())
        record_red_row(host.state, status="dispatched", pr=pr, sha=sha, run_id=run_id,
                       run_attempt=run_attempt, red_at=red_at, provider=provider)
        path.unlink(missing_ok=True)
    return 0


def red_dispatch_stamps(number: int, sha: str) -> dict | None:
    """The dispatched row this claim belongs to, for the claim comment + claim row."""
    state = lane_state_dir()
    if state is None:
        return None
    row = next((row for row in reversed(read_red_dispatch_rows(state))
                if row.get("status") == "dispatched"
                and row.get("pr") == number and row.get("sha") == sha), None)
    return row


# ---------------------------------------------------------------- cross-host claims

_CLAIM_OBSERVATIONS: dict = {}  # This worker's existing remote claim reads, never new census calls.


def claimed_elsewhere(number: int, sha: str, kind: str, now: float | None = None, *, timeout: float = 600) -> bool:
    """True when another host recorded a live claim for this exact head and kind on the PR.
    Local state files are per host; the PR's comments are the truth every host can see."""
    active = pr_events.claim_active(number, sha, sh, now, kind=kind, exclude_host=HOST, timeout=timeout)
    _CLAIM_OBSERVATIONS[(number, sha, kind)] = {"active": active, "at": time.time()}
    return active


def post_claim(number: int, sha: str, kind: str) -> None:
    claim_at = now_iso()
    body = f"🤖 lane claim kind={kind} sha={sha} host={HOST} at={claim_at}"
    # JOV-8931: a claim for a relayed red check carries the dispatch stamps so
    # red_at -> claim_at latency is readable straight off the PR.
    claimed_row = None
    if kind == "fix":
        try:
            row = red_dispatch_stamps(number, sha)
        except Exception:
            row = None
        if row:
            body += f" red_at={row.get('redAt')} dispatched_at={row.get('dispatchedAt')} claim_at={claim_at}"
            claimed_row = {"schema": RED_DISPATCH_SCHEMA, "status": "claimed",
                           "pr": number, "sha": sha, "runId": row.get("runId"),
                           "runAttempt": row.get("runAttempt"), "redAt": row.get("redAt"),
                           "redAtEpoch": row.get("redAtEpoch"), "dispatchedAt": row.get("dispatchedAt"),
                           "dispatchedEpoch": row.get("dispatchedEpoch"), "claimAt": claim_at,
                           "provider": row.get("provider"), "reason": None}
    sh(["gh", "pr", "comment", str(number), "--repo", REPO_SLUG, "--body", body])
    if claimed_row is not None:
        try:
            append_red_dispatch_row(lane_state_dir(), claimed_row)
        except OSError:
            pass  # the claim comment already posted; the ledger row is best-effort


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
    atomic_write_text(path, json.dumps(data))


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
    if classified.get("decisionAsk"):
        # Non-blocking Ovie ask, one per PR head (EVENT 2026-10-28). The class above is
        # unchanged and the PR keeps moving; Summer files the card from this durable row.
        asks = data.setdefault("decisionAsks", [])
        head = pr.get("headRefOid")
        if not any(isinstance(row, dict) and row.get("pr") == number and row.get("head") == head
                   for row in asks):
            asks.append(remediation.decision_card(pr, classified))
            del asks[:-200]


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
    # A needs-human-decision disposition is a non-blocking Ovie decision ask, never a hold
    # (EVENT 2026-10-28, Tim: nothing in the shipping machinery waits on a human). It carries a
    # default and a deadline; Summer files the card from this row and the default ships if Tim is
    # silent. No label is applied, so every machine gate (CI, security, Migration Guard) is the
    # only thing that decides whether the PR lands.
    if classified.get("cls") == "needs-human-decision":
        row = next((row for row in data["surfaced"] if isinstance(row, dict) and row.get("pr") == number
                    and row.get("head") == head), None)
        if row is not None and not row.get("ovieCard"):
            row["ovieCard"] = remediation.decision_card(pr, classified)
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


def contain_history_rewrite(host: Host, pr: dict, after: str) -> dict:
    """A rewritten head leaves the automatic repair path: the same surface every other
    needs-human-decision uses (comment, exhausted label, non-blocking Ovie card), keyed to the
    rewritten head so green-wake, finalizer and fix paths refuse to repair it. The label is
    the machine custody fence; no human hold is applied."""
    classified = {"cls": "needs-human-decision", "subtype": "history-rewrite-detected",
                  "evidence": [f"history-rewrite-detected: {after[:12]} does not descend from "
                               f"{pr['headRefOid'][:12]}"], "next_action": "tim-decides"}
    data = load_escalation(host)
    _surface_exhausted(host, {**pr, "headRefOid": after}, {}, classified, "history-rewrite-detected",
                       None, {}, data)
    save_escalation(host, data)
    row = next((row for row in data["surfaced"] if isinstance(row, dict) and row.get("pr") == pr["number"]
                and row.get("head") == after), {})
    return {"surfaced": True, "ovieCard": bool(row.get("ovieCard"))}


def escalate_exhausted(host: Host, prs: list[dict], linear, *, model_only=False,
                       joined_rungs: frozenset[int] = frozenset(),
                       routing_context=REPAIR_ROUTING_UNSET) -> None:
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
    observed = json.loads(json.dumps(attempts))
    held = json.loads(held_path(host).read_text()) if held_path(host).exists() else {}
    providers = load_providers()
    cooled = {name for name in providers if cooling(host, name)} if routing_context is REPAIR_ROUTING_UNSET else set()
    data = load_escalation(host)
    now = time.time()

    health_seen = {}  # one probe per provider per pass: a per-PR probe cost ~460 `grok models` calls (~400s) per tick

    def healthy(name, spec):
        if name not in health_seen:
            health_seen[name] = provider_healthy(spec)
        return health_seen[name]

    def plan_next(classified, record, now, head):
        if routing_context is REPAIR_ROUTING_UNSET:
            return remediation.plan_ladder(classified, record, providers, now, head,
                                           healthy=healthy, cooled=cooled)
        try:
            return repair_routing_plan(routing_context, providers, classified, record, now, head,
                                       repair_route_cooldowns(host, providers))
        except (OSError, ValueError):
            return {"action": "wait", "reason": "routing-preflight-required"}

    try:
        preserved = maintenance_preserved(host.state) if model_only else set()
    except (OSError, ValueError):
        return  # Optional repair-floor observation cannot weaken custody.
    for candidate in exhausted_prs(prs, attempts, held):
        if model_only and (candidate["number"] in preserved
                           or publication_revocation(host, candidate.get("headRefName"))):
            continue
        pr = reconcile_fix_target(candidate)
        if (pr is None or pr.get("state") != "OPEN" or pr.get("isInMergeQueue") is not False
                or any(pr.get(key) != candidate.get(key) for key in ("headRefOid", "headRefName"))):
            continue  # No rungs or budget changes without fresh complete authority.
        record = dict(attempts.get(str(pr["number"]), {}))
        if routing_context is not REPAIR_ROUTING_UNSET and (model_only or pr["number"] in joined_rungs) \
                and current_repair_routing_reason(host, routing_context, providers):
            continue  # Return to fresh preflight; no latch, attempt or backoff is written.
        if pr["number"] in joined_rungs:
            # The selector may have refused this newly joined draft because a
            # different host owns it. Idle disposition is not a second claim path.
            # Refresh exact-head custody before any rerun, label or disposition.
            try:
                if claimed_elsewhere(pr["number"], pr["headRefOid"], ("fix", "gate"), timeout=30):
                    continue
                fresh_attempts = maintenance_json(path, missing={})
                fresh_held = maintenance_json(held_path(host), missing={})
                ended = _rung_stamp(record.get("endedAt"))
                owned = LANE_BRANCH.match(pr["headRefName"])
                pending = record.get("pendingEscalation") or {}
                if not isinstance(pending, dict) or type(pr.get("isDraft")) is not bool \
                        or pr.get("isCrossRepository") is not False or (pr["isDraft"] and not owned):
                    continue
                disabled = {name for name, spec in providers.items() if isinstance(spec, dict)
                            and (not spec.get("enabled", True) or spec.get("repairs") is False)}
                transfer = bool(pr.get("isDraft") and owned
                                and owned["lane"] not in {pending.get("lane"), *disabled})
                if transfer and (owned["lane"] not in providers or record.get("lane") != owned["lane"]
                                 or pending.get("head") != pr["headRefOid"]
                                 or pr["headRefOid"] not in (record.get("sha"), record.get("pushedHead"))
                                 or record.get("repairBranch") != pr["headRefName"]
                                 or _rung_stamp(record.get("at")) is None
                                 or ended is None or ended < _rung_stamp(record["at"])):
                    continue
                if not isinstance(fresh_attempts, dict) or fresh_attempts.get(str(pr["number"])) != record \
                        or not isinstance(fresh_held, dict) or fresh_held.get(str(pr["number"])) != held.get(str(pr["number"])) \
                        or (ended is None and (record.get("endedAt") is not None or transfer)) \
                        or (ended is not None and ended > time.time()) \
                        or pr_events.in_flight(record, {"headRefOid": record.get("sha")}, time.time()) \
                        or pr["number"] in maintenance_preserved(host.state) or pr_recovery_held(host, pr) \
                        or publication_revocation(host, pr["headRefName"]):
                    continue
            except (OSError, ValueError):
                continue
        if model_only:
            try:
                fresh_held = maintenance_json(held_path(host), missing={})
                ended = _rung_stamp(record.get("endedAt"))
                if not isinstance(fresh_held, dict) or fresh_held.get(str(pr["number"])) != held.get(str(pr["number"])) \
                        or (ended is None and pr["number"] not in joined_rungs) \
                        or (ended is not None and ended > now) \
                        or pr["number"] in maintenance_preserved(host.state) \
                        or pr_recovery_held(host, pr) or publication_revocation(host, pr["headRefName"]) \
                        or pr_events.in_flight(record, {"headRefOid": record.get("sha")}, now):
                    continue
            except (OSError, ValueError):
                continue
        if routing_context is not REPAIR_ROUTING_UNSET and (model_only or pr["number"] in joined_rungs) \
                and current_repair_routing_reason(host, routing_context, providers):
            continue  # Custody reads may have outlived preflight; no disposition may bypass it.
        classified = remediation.classify_blocker(pr, held.get(str(pr["number"])), record)
        _remember_class(data, pr, classified)
        if not remediation.escalation_enabled():
            if model_only:
                continue
            _legacy_terminal(host, pr, record, held, linear, attempts)
            continue
        plan = plan_next(classified, record, time.time(), pr["headRefOid"])
        if model_only and plan.get("action") != "model":
            # A repair-floor seat may refresh model authority without Linear.
            # Terminal disposition must wait for the ordinary client's receipt;
            # never set its sticky escalated latch without that transition.
            continue
        if plan["action"] == "update-branch":
            outcome = pr_events.sync_main(host, THIS, pr, now, terminal_ok=True)
            record = remediation.append_rung(record, rung="update-branch", lane=None, cls=classified["cls"],
                                             at=now, head=pr["headRefOid"], kind="deterministic",
                                             ok=outcome == "synced")
            attempts[str(pr["number"])] = record
            pr_events.add_label(pr["number"], "escalating", sh)
            if pr["number"] not in data["escalating"]:
                data["escalating"].append(pr["number"])
            if outcome != "synced":
                plan = plan_next(classified, record, time.time(), pr["headRefOid"])
            else:
                plan = {"action": "wait"}
        if plan.get("action") == "rerun":
            rerun = _rerun_failed(pr)
            record = remediation.append_rung(record, rung="rerun", lane=None, cls=classified["cls"],
                                             at=now, head=pr["headRefOid"], kind="deterministic",
                                             ok=bool(rerun))
            attempts[str(pr["number"])] = record
            if not rerun:
                plan = plan_next(classified, record, time.time(), pr["headRefOid"])
            else:
                plan = {"action": "wait"}
        if plan.get("action") == "resolve-lockfile":
            record = remediation.append_rung(record, rung="lockfile", lane=None, cls=classified["cls"],
                                             at=now, head=pr["headRefOid"], kind="deterministic", ok=None)
            record["pendingEscalation"] = {"lane": None, "cls": classified["cls"], "head": pr["headRefOid"],
                                           "rung": "lockfile", "at": now}
            attempts[str(pr["number"])] = record
            plan = {"action": "wait"}
        if plan.get("action") == "model" and routing_context is not REPAIR_ROUTING_UNSET:
            if current_repair_routing_reason(host, routing_context, providers):
                continue
            # The model route can change as an unchanged cooldown expires while
            # custody or a deterministic rung is being processed.
            plan = plan_next(classified, record, time.time(), pr["headRefOid"])
        if plan.get("action") == "model":
            now = time.time()
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

    def merge(current: dict) -> None:
        # Repairs end outside claim.lock (end_local_fix_attempt), so a whole-file rewrite of
        # this pass's snapshot could drop their endedAt/pushed/verdict. Write only the rows
        # this pass changed, and only where nobody changed them since it read them.
        for key, value in attempts.items():
            if value != observed.get(key) and current.get(key) == observed.get(key):
                current[key] = value
    path.parent.mkdir(parents=True, exist_ok=True)
    update_json(path, merge)
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


# At most this many GitHub writes per worker pass. A visited head waits until main moves.
TERMINAL_REVISITS_PER_PASS = 3
TERMINAL_LABELS = frozenset({pr_events.PREFIX + pr_events.EXHAUSTED, pr_events.POISON_LABEL})


def terminal_prs(prs: list[dict], attempts: dict, held: dict) -> list[dict]:
    """Open PRs parked on a terminal generation whose only exit is a new head: an escalated
    spent head, or an exhausted/poisoned label on a head no repair has moved since."""
    parked = []
    for pr in prs:
        head, record = pr.get("headRefOid"), attempts.get(str(pr.get("number"))) or {}
        labels = {label.lower() for label in pr_events.label_names(pr)}
        hold = held.get(str(pr.get("number")))
        if hold and hold.get("sha") == head:
            # Exhaustion is the condition this exit repairs. Preserve the underlying
            # gate evidence so a secret-file or empty-diff hold still blocks a sync.
            hold = {**hold, "evidence": pr_events.without_exhaustion_evidence(hold.get("evidence"))}
        if not isinstance(head, str) or not head or not isinstance(record, dict) \
                or labels & pr_events.HOLD_LABELS or pr.get("isInMergeQueue") is not False \
                or pr.get("isCrossRepository") is not False \
                or not pr_events.fixable_hold(hold, head):
            continue  # holds, queued heads, forks and diff-policy holds have other owners
        spent = pr_events.spent(record, head, MAX_FIX_ATTEMPTS)
        unchanged = not record.get("count") or pr_events.same_generation(record, head)
        if (record.get("escalated") and spent) or (labels & TERMINAL_LABELS and unchanged):
            parked.append(pr)
    return parked


def revisit_terminal_prs(host: Host, prs: list[dict], now: float | None = None) -> list[int]:
    """The material-change exit for terminal generations, fired without a human (2026-10-11).

    A terminal head waits for "a new PR head", which nothing produced: 26 PRs sat exhausted,
    poisoned or escalated for days. Main moving is new evidence, so each time main moved since
    the PR's last revisit (no clock: Tim 2026-10-12) the PR gets a deterministic no-model sync:
    GitHub merges main into it (exact expected head), or a Dependabot bump asks Dependabot to
    recreate itself on main. The new head is ordinary re-entry: a new bounded generation with
    its own attempts and the queue's failure log. A `queue-poison` label is lifted with it:
    main moved past the base that failed, and the label's removal is the boundary
    `queue_ejections` counts from, so a defect that still fails re-poisons after two more
    ejections, whoever authored the PR (bots and Dependabot included).
    `lane-fix-exhausted` lifts with the same successful sync. The new head is a new
    generation, so the gate can admit it; a green observation of the exhausted head does
    not. The fix loop re-applies the label if that generation exhausts again.
    A conflicted (DIRTY) head cannot take all of main without a model, but it can take the
    newest main commit that still merges cleanly (`partial_main_sync`, JOV-INV-043): that moves it as far
    as a deterministic merge can and gives the remaining conflict a fresh, smaller generation.
    No attempt or rung is refunded or reset. The PR revisited longest ago goes first, so a
    few PRs whose conflict main cannot move past never starve the rest.
    """
    now = time.time() if now is None else now
    attempts = read_json(host.state / "fix-attempts.json")
    held = read_json(held_path(host))
    path = host.state / "terminal-revisits.json"
    visits = read_json(path)
    due = []
    for pr in terminal_prs(prs, attempts, held):
        last = visits.get(str(pr["number"])) if isinstance(visits.get(str(pr["number"])), dict) else {}
        dependabot = (pr.get("headRefName") or "").startswith("dependabot/")
        due.append((pr, last, dependabot))
    if not due:
        return []
    due.sort(key=lambda item: (float(item[1].get("at") or 0), item[0]["number"]))
    listed = sh(["git", "ls-remote", "origin", "refs/heads/main"], cwd=host.repo, timeout=60)
    main = (listed.stdout or "").split()[0] if listed.returncode == 0 and (listed.stdout or "").split() else None
    if not main:
        return []  # without main's head, "main moved" is unproven
    acted = []
    for pr, last, dependabot in due:
        if len(acted) >= TERMINAL_REVISITS_PER_PASS:
            break
        if last.get("main") == main or publication_revocation(host, pr.get("headRefName")) \
                or claimed_elsewhere(pr["number"], pr["headRefOid"], "fix"):
            continue
        # A held PR (preservation hold, live repair) is not a revisit: it took one of the few
        # per-pass slots and was ledgered as revisit-failed without any GitHub call (~334/day).
        if not dependabot and pr.get("mergeStateStatus") != "DIRTY" and pr_events.maintenance_hold(
                host, THIS, pr, now, terminal_ok=True):
            continue
        if dependabot:
            action = "dependabot-recreate"
            result = sh(["gh", "pr", "comment", str(pr["number"]), "--repo", REPO_SLUG,
                         "--body", "@dependabot recreate"])
            ok = result.returncode == 0
        elif pr.get("mergeStateStatus") == "DIRTY":
            action = "partial-main-sync"
            ok = partial_main_sync(host, pr) is not None
        else:
            action = "update-branch"
            ok = pr_events.sync_main(host, THIS, pr, now, terminal_ok=True) == "synced"
        if ok:
            present = set(pr_events.label_names(pr))
            for label in (pr_events.POISON_LABEL, pr_events.PREFIX + pr_events.EXHAUSTED):
                if label in present:
                    sh(["gh", "api", "-X", "DELETE", f"repos/{REPO_SLUG}/issues/{pr['number']}/labels/{label}"])
        visit = {"at": now, "head": pr["headRefOid"], "main": main, "action": action, "ok": ok}
        update_json(path, lambda rows, key=str(pr["number"]), visit=visit: rows.update({key: visit}))
        pr_events.ledger(host, {"schema": "jovie-lane-run/v1", "kind": "terminal-revisit", "origin": AUTONOMOUS_ORIGIN,
                                "attribution": {"category": "finalizer-only", "provider": "lane-event"},
                                "pr": pr["number"], "headBefore": pr["headRefOid"], "main": main,
                                "action": action, "verdict": "revisited" if ok else "revisit-failed",
                                "endedAt": now_iso()})
        acted.append(pr["number"])
    return acted


SYNC_REF = "refs/jovie-sync/"


def newest_clean_main(host: Host, pr: dict) -> str | None:
    """The newest first-parent main commit this exact head merges with cleanly, if it is past
    what the head already contains. Bisects `git merge-tree` (no checkout, no hooks); a
    conflict, once main introduces it, stays, so the clean prefix is contiguous."""
    head, number = pr["headRefOid"], pr["number"]
    main_ref, pr_ref = f"{SYNC_REF}main", f"{SYNC_REF}pr-{number}"
    git = lambda *args, timeout=120: sh(["git", *args], cwd=host.repo, timeout=timeout)
    if git("fetch", "-q", "--no-tags", "origin", f"+refs/heads/main:{main_ref}",
           f"+refs/pull/{number}/head:{pr_ref}", timeout=600).returncode             or (git("rev-parse", pr_ref).stdout or "").strip() != head:
        return None
    base = git("merge-base", head, main_ref)
    listed = git("rev-list", "--first-parent", "--reverse", f"{(base.stdout or '').strip()}..{main_ref}")
    if base.returncode or listed.returncode:
        return None
    commits = (listed.stdout or "").split()
    clean, conflicted = -1, len(commits)
    while conflicted - clean > 1:
        middle = (clean + conflicted) // 2
        merged = git("merge-tree", "--write-tree", "--name-only", "--no-messages", head, commits[middle], timeout=300)
        if merged.returncode == 0:
            clean = middle
        elif merged.returncode == 1:
            conflicted = middle
        else:
            return None
    return commits[clean] if clean >= 0 else None


def partial_main_sync(host: Host, pr: dict) -> str | None:
    """Merge the newest conflict-free main commit into a DIRTY branch on GitHub (the merges
    API: server-side, no checkout, refuses with 409 on any conflict). Returns that commit."""
    if {label.lower() for label in pr_events.label_names(pr)} & pr_events.HOLD_LABELS:
        return None  # a held branch is never moved by a main sync
    target = newest_clean_main(host, pr)
    if not target:
        return None
    result = sh(["gh", "api", "-X", "POST", f"repos/{REPO_SLUG}/merges", "-f", f"base={pr['headRefName']}",
                 "-f", f"head={target}", "-f",
                 f"commit_message=Merge main@{target[:12]} into {pr['headRefName']} (newest conflict-free main)"])
    return target if result.returncode == 0 else None


DETERMINISTIC_CONFLICT_PER_PASS = 4
CONFLICT_PASS_MIN_INTERVAL_S = 120


def conflict_files(host: Host, pr: dict) -> list[str] | None:
    """Files a DIRTY head conflicts with main in (`git merge-tree`, no checkout); None when
    unknown, [] when it merges cleanly."""
    number, head = pr["number"], pr["headRefOid"]
    main_ref, pr_ref = f"{SYNC_REF}main", f"{SYNC_REF}pr-{number}"
    git = lambda *args, timeout=300: sh(["git", *args], cwd=host.repo, timeout=timeout)
    if git("fetch", "-q", "--no-tags", "origin", f"+refs/heads/main:{main_ref}",
           f"+refs/pull/{number}/head:{pr_ref}", timeout=600).returncode \
            or (git("rev-parse", pr_ref).stdout or "").strip() != head:
        return None
    merged = git("merge-tree", "--write-tree", "--name-only", "--no-messages", head, main_ref)
    if merged.returncode == 0:
        return []
    if merged.returncode != 1:
        return None
    return [line for line in (merged.stdout or "").splitlines()[1:] if line.strip()]


def deterministic_conflict_pass(host: Host, prs: list[dict], now: float | None = None) -> list[int]:
    """Model-free, attempt-free conflict repair for every DIRTY PR whose conflict is confined to
    generated or append-only files (remediation.RESOLVABLE_CONFLICT_FILES): merge main, take
    main's copy, run the generator, push (no force). It costs no seat and no fix attempt, so a
    spent or escalated PR is not left DIRTY by the thing a script can do. Each (PR, head, main)
    is tried once; every try is ledgered with the time the PR has been DIRTY-visible."""
    now = time.time() if now is None else now
    path = host.state / "deterministic-conflict.json"
    visits = read_json(path)
    acted = []
    due = sorted((pr for pr in prs if pr.get("mergeStateStatus") == "DIRTY" and not pr.get("isDraft")
                  and pr.get("isCrossRepository") is False and pr.get("isInMergeQueue") is not True
                  and not ({label.lower() for label in pr_events.label_names(pr)} & pr_events.HOLD_LABELS)
                  and not (pr.get("headRefName") or "").startswith("dependabot/")),
                 key=lambda pr: (float((visits.get(str(pr["number"])) or {}).get("at") or 0), pr["number"]))
    if not due:
        return []
    listed = sh(["git", "ls-remote", "origin", "refs/heads/main"], cwd=host.repo, timeout=60)
    main = (listed.stdout or "").split()[0] if listed.returncode == 0 and (listed.stdout or "").split() else None
    if not main:
        return []
    for pr in due:
        if len(acted) >= DETERMINISTIC_CONFLICT_PER_PASS:
            break
        last = visits.get(str(pr["number"])) or {}
        if (last.get("head") == pr["headRefOid"] and last.get("main") == main) \
                or now - float(last.get("at") or 0) < CONFLICT_PASS_MIN_INTERVAL_S \
                or claimed_elsewhere(pr["number"], pr["headRefOid"], "fix"):
            continue
        files = conflict_files(host, pr)
        outcome = "skipped"
        if files is not None and files and set(files) <= remediation.RESOLVABLE_CONFLICT_FILES:
            repair_lock = Locked(host.state / "locks" / f"repair-pr-{pr['number']}.lock", blocking=False)
            if not repair_lock.held:
                repair_lock.release()
                continue
            worktree = host.state / "worktrees" / f"detconflict-pr{pr['number']}"
            outcome = "failed"
            preserve, added = False, False
            try:
                fetched = sh(["git", "fetch", "-q", "origin", "main", pr["headRefName"]], cwd=host.repo, timeout=600)
                added = fetched.returncode == 0 and sh(
                    ["git", "worktree", "add", "-q", "--detach", str(worktree), f"origin/{pr['headRefName']}"],
                    cwd=host.repo).returncode == 0
                if added and sh(["git", "rev-parse", "HEAD"], cwd=worktree).stdout.strip() == pr["headRefOid"]:
                    with open(os.devnull, "a") as log:
                        guard = lambda: require_fix_target(pr, "deterministic-conflict", worktree=worktree, repair=True)
                        outcome = "resolved" if resolve_generated_conflict(
                            worktree, pr["headRefName"], log, guard=guard) else "failed"
            except RepairStopped:
                preserve, outcome = True, "target-changed"
            finally:
                if added and not preserve:
                    sh(["git", "worktree", "remove", "--force", str(worktree)], cwd=host.repo)
                repair_lock.release()
            acted.append(pr["number"])
        elif files is not None:
            outcome = "not-deterministic" if files else "clean"
        visit = {"at": now, "head": pr["headRefOid"], "main": main, "outcome": outcome, "files": (files or [])[:8]}
        if outcome == "target-changed":
            visit["worktree"] = str(worktree)
        update_json(path, lambda rows, key=str(pr["number"]), visit=visit: rows.update({key: visit}))
        if outcome in ("resolved", "failed"):
            pr_events.ledger(host, {"schema": "jovie-lane-run/v1", "kind": "deterministic-conflict",
                                    "origin": AUTONOMOUS_ORIGIN,
                                    "attribution": {"category": "finalizer-only", "provider": "lane-event"},
                                    "pr": pr["number"], "headBefore": pr["headRefOid"], "main": main,
                                    "action": "generated-conflict", "verdict": outcome,
                                    "files": files, "endedAt": now_iso()})
    return acted


RERUN_RUNS_LIMIT = 5


def _rerun_failed(pr: dict):
    """Rerun the failed jobs of every distinct run behind a red check (bounded). An outage
    can cancel jobs in several workflows; rerunning only the first left the rest red."""
    runs = []
    for check in pr.get("statusCheckRollup") or []:
        if str(check.get("conclusion") or "").upper() not in RED | {"CANCELLED"}:
            continue
        found = re.search(r"/runs/(\d+)", check.get("detailsUrl") or "")
        if found and found.group(1) not in runs:
            runs.append(found.group(1))
    results = [sh(["gh", "run", "rerun", run, "--failed", "--repo", REPO_SLUG]).returncode == 0
               for run in runs[:RERUN_RUNS_LIMIT]]
    return bool(results) and any(results)


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
EVENT_DELIVERY_ATTEMPTS_CAP = 10
EXHAUSTED_READBACK_S = 6 * 3600  # an exhausted delivery is only re-read for a late acknowledgement
EVENT_DELIVERY_HISTORY = 50      # retained attempt history per delivery row
EVENT_DELIVERY_PENDING_CAP = 256
EVENT_DELIVERY_STALE_S = 3600


def event_delivery_max_attempts() -> int:
    """The one configurable bound on every delivery retry loop (Gem 2026-10-23: nothing
    retries unbounded). Clamped to a hard cap; the default stays EVENT_DELIVERY_ATTEMPTS."""
    try:
        value = int(os.environ.get("LANES_EVENT_DELIVERY_MAX_ATTEMPTS", ""))
    except ValueError:
        return EVENT_DELIVERY_ATTEMPTS
    return max(1, min(EVENT_DELIVERY_ATTEMPTS_CAP, value))


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
    additions = {}
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
                additions[key] = {**intent, "key": key, "createdAt": now, "nextAt": now,
                    "expectedState": (issue.get("state") or {}).get("name"),
                    "deadline": now + EVENT_DELIVERY_STALE_S, "attempts": 0, "status": "pending",
                    "expectedEvent": _event_digest(event), "history": [],
                    "commentId": str(uuid.uuid5(uuid.NAMESPACE_URL, "jovie-event:" + key))}

    unresolved = sum(row.get("status") not in {"acknowledged", "superseded"} for row in data["actions"].values())
    if unresolved + len(additions) > EVENT_DELIVERY_PENDING_CAP:
        raise RuntimeError("event-delivery-capacity-held")
    data["actions"].update(additions)


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
    report["deliveryExhausted"] += sum(row.get("status") == "exhausted" for row in starts)
    return report


def drain_event_delivery(host: Host, linear) -> dict:
    """Drain the durable journal without claiming new events, for a tick whose wider
    remediation reconciliation failed: a failed delivery still retries with backoff here
    instead of waiting for a healthy planning pass that may never come (Gem 2026-10-23:
    57 failed actions with no authoritative ack and no next retry scheduled)."""
    delivery_lock = Locked(host.state / "event-delivery.lock", blocking=False)
    if not delivery_lock.held:
        delivery_lock.release()
        return {"deliveryBusy": True}
    try:
        journal = _event_delivery_state(host)  # Fail closed before changing event rows.
        _recover_event_preparation(host, journal)
        return _apply_event_plan(linear, {}, host, journal, time.time())
    finally:
        delivery_lock.release()


def _event_delivery_diagnostic(error, phase: str, operation: str) -> dict:
    diagnostic = {"phase": phase, "operation": operation}
    if isinstance(error, LinearRequestError):
        diagnostic.update(error.diagnostic)
    elif isinstance(error, urllib.error.HTTPError):
        diagnostic.update({"class": "linear-http", "httpStatus": error.code})
    elif isinstance(error, LinearRateLimited):
        diagnostic["class"] = "linear-rate-limited"
    elif isinstance(error, (TimeoutError, subprocess.TimeoutExpired)):
        diagnostic["class"] = "transport-timeout"
    elif isinstance(error, (urllib.error.URLError, OSError)):
        diagnostic["class"] = "transport-unavailable"
    else:
        diagnostic["class"] = "controller-error"
    return diagnostic


def _apply_event_plan(linear, plan: dict, host: Host, data: dict, now: float) -> dict:
    """Drain one durable intent per tick under the existing delivery/claim locks.

    Transport attempts are separate from model attempts; none are refunded or
    reset. An uncertain send is read back by its stable remote ID before retry.
    The caller holds event-delivery.lock; claim.lock only covers the write fence.
    """
    owners = _event_escalation(host).get("events") or {}
    # Exhausted rows can never send again: they sort after every live row and are only read
    # back every EXHAUSTED_READBACK_S. Before (Gem 2026-10-08..20) four exhausted rows took the
    # one-action-per-tick budget every tick (5,534 readbacks on one) and 36 pending deliveries
    # were never attempted. A row whose owning event finished or vanished is superseded.
    for row in sorted(data["actions"].values(), key=lambda row: (
            row["status"] == "exhausted", row["createdAt"],
            ("reopens", "comments", "labels").index(row["kind"]), row["key"])):
        if row["status"] in {"acknowledged", "superseded"} or now < row["nextAt"]:
            continue
        owner = owners.get(row["fingerprint"])
        if row["status"] == "exhausted" and (not isinstance(owner, dict) or owner.get("status") == "done"
                                             or owner.get("issueId") != row["ownerIssueId"]):
            row["status"] = "superseded"
            row["history"] = [*row["history"][-EVENT_DELIVERY_HISTORY:],
                              {"at": now, "outcome": "owner-finished" if isinstance(owner, dict) else "owner-gone"}]
            _save_event_delivery(host, data)
            continue
        phase = "readback"
        try:
            acknowledged, receipt = _event_delivery_readback(linear, row)
            if not acknowledged and row["attempts"] < event_delivery_max_attempts() and now < row["deadline"]:
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
                        phase = "fenced-readback"
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
                    phase = "send"
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
                phase = "post-send-readback"
                acknowledged, receipt = _event_delivery_readback(linear, row)
            if acknowledged:
                row.update(status="acknowledged", acknowledgedAt=now, receipt=receipt)
                row["history"].append({"at": now, "outcome": "authoritative-readback"})
            elif now >= row["deadline"]:
                # The readback proved the action absent and its deadline forbids a send: the
                # intent expired. Gem 2026-10-20: 36 comments starved for 3-12 days expired
                # this way and held remediation-delivery open with nothing left to deliver.
                row["status"] = "superseded"
                row["history"].append({"at": now, "outcome": "expired-unsent", "receipt": receipt})
            else:
                raise RuntimeError("event-delivery-unacknowledged")
        except Exception as error:
            # No provider response/credential content in controller health output.
            safe_events = {"event-comment-readback-unreadable", "event-comment-readback-mismatch",
                           "event-issue-readback-unreadable", "event-state-preimage-changed",
                           "event-label-readback-unreadable", "event-owner-preimage-changed",
                           "event-mutation-rejected", "event-delivery-unacknowledged"}
            row["error"] = str(error) if isinstance(error, RuntimeError) and str(error) in safe_events else type(error).__name__
            row["diagnostic"] = _event_delivery_diagnostic(error, phase, row["kind"])
            row["status"] = "exhausted" if row["attempts"] >= event_delivery_max_attempts() or now >= row["deadline"] else "failed"
            row["history"].append({"at": now, "outcome": row["status"], "error": row["error"],
                                   "diagnostic": row["diagnostic"]})
        row["nextAt"] = now + (EXHAUSTED_READBACK_S if row["status"] == "exhausted"
                               else 60 if row["attempts"] < 2 else 300)
        row["history"] = row["history"][-EVENT_DELIVERY_HISTORY:]
        _save_event_delivery(host, data)
        break  # Bounded work; a transport outage must not monopolize dispatch.
    return _event_delivery_report(data, now)


def _event_start_claim(fingerprint: str, row: dict) -> dict:
    generation = {"activeGeneration": dict(row["activeGeneration"])} if row.get("activeGeneration") else {}
    correlation = _event_digest({"issueId": row.get("issueId"), "startedStateId": row.get("startedStateId"),
                                 "owner": HOST, "generation": row.get("attempts") or [], **generation})
    return {"fingerprint": fingerprint, "issueId": row.get("issueId"), "team": row.get("team"),
            "owner": HOST, "lane": row.get("lane"), "correlation": correlation, **generation}


def claim_remediation_events(host: Host, linear) -> dict:
    """Claim every labeled remediation event. One cached read, then local planning."""
    issues = fetch_labeled_events(linear)
    providers = load_providers()
    cooled = {name for name in providers if cooling(host, name)}

    health_seen = {}  # one probe per provider per pass: a per-PR probe cost ~460 `grok models` calls (~400s) per tick

    def healthy(name, spec):
        if name not in health_seen:
            health_seen[name] = provider_healthy(spec)
        return health_seen[name]

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
        # Rotate only a settled, exactly owned start from a proven same-issue generation.
        # The paired-write preimage below still rejects any concurrent outcome/owner change.
        for fingerprint, row in plan["events"].items():
            before = baseline.get(fingerprint) or {}
            completed = before.get("completedGeneration") or {}
            renewed = row.get("completedGeneration") or {}
            delivery = before.get("startDelivery") or {}
            settled = delivery.get("settled") or {}
            binding = _event_start_claim(fingerprint, before)
            opened_at = remediation.iso_epoch(renewed.get("consumedAt"))
            closed_at = remediation.iso_epoch(completed.get("updatedAt"))
            if (completed and not completed.get("consumed") and renewed.get("consumed")
                    and renewed == {**completed, "consumed": True, "consumedAt": renewed.get("consumedAt")}
                    and completed.get("issueId") == before.get("issueId") == row.get("issueId")
                    and opened_at is not None and closed_at is not None and opened_at > closed_at
                    and delivery.get("status") == "acknowledged"
                    and delivery.get("mutationReceipt") == {"correlation": binding["correlation"], "success": True}
                    and settled.get("claim") == binding and settled.get("verdict") in {"landing", "verified-not-queued"}
                    and settled.get("executionDigest") and settled.get("runId")):
                row["priorStartDeliveries"] = [*(before.get("priorStartDeliveries") or []), delivery][-20:]
                row.pop("startDelivery", None)
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
            queue_held = False
            try:
                _queue_event_delivery(journal, plan, issues, accepted, time.time())
            except RuntimeError as error:
                if str(error) != "event-delivery-capacity-held":
                    raise
                # Decline new generations, then still drain an already accepted
                # intent. Backpressure must not make a full queue self-deadlock.
                queue_held, merged, pairs = True, previous, {}
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
        delivery["deliveryCapacityHeld"] = queue_held
    finally:
        delivery_lock.release()
    summary = remediation.events_summary({"events": plan["events"]})
    starts = [row.get("startDelivery") or {} for row in plan["events"].values()]
    delivery["deliveryFailed"] += sum(row.get("status") in {"failed", "sending"} for row in starts)
    delivery["deliveryExhausted"] += sum(row.get("status") == "exhausted" for row in starts)
    return {"eventsOpen": summary["eventsOpen"], "eventsClaimed": summary["eventsClaimed"],
            "eventsHuman": summary["eventsHuman"], "eventsExhausted": summary["eventsExhausted"], **delivery}


def claim_labeled_event(host: Host, name: str, linear) -> Issue | None:
    """Under claim.lock: admit one event only after its remote start is acknowledged."""
    data = _event_escalation(host)
    events = data.get("events") or {}
    now = time.time()
    held_back = held_back_issues(host, now)
    for fingerprint, row in events.items():
        if not isinstance(row, dict):
            continue
        if row.get("status") != "claimed" or row.get("lane") != name or row.get("running"):
            continue
        if (row.get("team") or bindings.team_of(row.get("identifier") or "")) not in ("", "JOV"):
            continue  # Another team's issue runs in its own repo via its binding, never in Jovie.
        if row.get("identifier") in held_back:
            continue
        if not row.get("issueId"):
            continue
        if linear_sync.claim_status(host.state, row["issueId"]) == "active":
            continue  # Ordinary and labeled generations share the same incumbent issue owner.
        deliveries = _event_delivery_state(host)["actions"].values()
        if any(action["kind"] == "reopens" and action["ownerIssueId"] == row["issueId"]
               and action["status"] not in {"acknowledged", "superseded"} for action in deliveries):
            continue  # A planned reopen is not an accepted remote issue state.
        started = row.get("startedStateId")
        if started:
            delivery = row.setdefault("startDelivery", {"attempts": 0, "status": "pending", "nextAt": now,
                                                        "deadline": now + EVENT_DELIVERY_STALE_S})
            # A terminal start delivery is a visible failure, never a retry loop: exhausted
            # rows used to re-fail every 60s forever (Gem 2026-10-23: 57 stuck actions).
            if delivery.get("status") == "exhausted" or now < delivery.get("nextAt", 0):
                continue
            attempts_cap = event_delivery_max_attempts()
            try:
                query = 'query($id:String!){issue(id:$id){id state{id name}}}'
                remote = linear.gql(query, {"id": row["issueId"]})
                state = (remote.get("issue") or {}).get("state") if isinstance(remote, dict) else None
                if not isinstance(state, dict):
                    raise RuntimeError("event-start-readback-unreadable")
                correlation = _event_start_claim(fingerprint, row)["correlation"]
                if state.get("id") == started and delivery.get("mutationReceipt") != {"correlation": correlation, "success": True}:
                    # A rejected/ambiguous intent never proves this host owns
                    # another host's start. But our OWN persisted intent (status
                    # 'sending') whose receipt was lost to a crash between the
                    # mutation and its save may re-prove ownership with one
                    # idempotent resend, still inside the attempt cap.
                    if delivery.get("status") != "sending" or delivery["attempts"] >= attempts_cap \
                            or now >= delivery["deadline"]:
                        raise RuntimeError("event-start-ownership-unproven")
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
                if state.get("id") != started:
                    # Fresh contradictory state invalidates every earlier
                    # success before any retry can be sent or adopted.
                    delivery.pop("mutationReceipt", None)
                    _save_event_json(host, "escalation.json", data)
                    if state.get("name") != "Todo":
                        raise RuntimeError("event-start-preimage-changed")
                    if delivery["attempts"] >= attempts_cap or now >= delivery["deadline"]:
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
                # These stops can never succeed by design: the retry budget is spent, the
                # remote preimage moved on, or this host can never prove ownership. They
                # are a terminal visible failure, not a 60s retry loop forever.
                terminal = str(error) in {"event-start-cap-exhausted", "event-start-ownership-unproven",
                                          "event-start-preimage-changed"}
                delivery.update(status="exhausted" if terminal else "failed",
                                error=str(error) if isinstance(error, RuntimeError) and str(error).startswith("event-") else type(error).__name__,
                                nextAt=now + 60)
                _save_event_json(host, "escalation.json", data)
                continue  # No model invocation or local running claim from intent alone.
        else:
            continue  # Missing start-state evidence cannot admit a model repair.
        # The worker holds claim.lock across both paths. Reserve the same local
        # issue authority as ordinary intake before exposing a running event.
        if not linear_sync.claim(host.state, row["issueId"], row.get("identifier") or row["issueId"], name):
            continue
        delivery.pop("settled", None)
        row["running"] = True
        row["claimedAt"] = now
        row["release"] = False
        _save_event_json(host, "escalation.json", data)
        description = row.get("description") or ""
        dossier = row.get("dossier") or ""
        if dossier:
            description = dossier + "\n\n" + description
        return Issue(row["issueId"], row.get("identifier") or row["issueId"], row.get("title") or "",
                     description, 2, now_iso(), list(row.get("labels") or []), _event_start_claim(fingerprint, row))
    return None


def note_event_outcome(host: Host, issue, verdict: str, *, receipt: dict | None = None) -> None:
    """Record only this admitted event generation's outcome; no Linear/provider read."""
    binding = getattr(issue, "event_claim", None)
    if issue is None or not getattr(issue, "id", None) or not isinstance(binding, dict):
        return
    lock = Locked(host.state / "claim.lock", blocking=True)
    try:
        data = _event_escalation(host)
        for fingerprint, row in (data.get("events") or {}).items():
            if not isinstance(row, dict) or row.get("issueId") != issue.id:
                continue
            delivery = row.get("startDelivery") or {}
            if (binding != _event_start_claim(fingerprint, row) or delivery.get("status") != "acknowledged"
                    or delivery.get("mutationReceipt") != {"correlation": binding["correlation"], "success": True}):
                continue  # Stale/foreign callbacks cannot mutate the current generation.
            if verdict in {"landing", "verified-not-queued"}:
                receipt = receipt if isinstance(receipt, dict) else {}
                execution = receipt.get("execution") or {}
                ident = execution_attempt.identity("linear-work", {"issue": issue.identifier, "outcome": "draft-pr"},
                                                   {"title": issue.title, "description": issue.description})
                if (not isinstance(receipt, dict) or not isinstance(execution, dict)
                        or receipt.get("schema") != "jovie-lane-run/v1" or receipt.get("repository") != REPO_SLUG
                        or receipt.get("executionHost") != HOST or receipt.get("provider") != binding["lane"]
                        or receipt.get("linearIssueId") != issue.id or receipt.get("issue") != issue.identifier
                        or receipt.get("eventClaim") != binding or receipt.get("verdict") != verdict
                        or not receipt.get("runId") or not receipt.get("endedAt")
                        or execution.get("schema") != execution_attempt.SCHEMA or execution.get("event") != "attempt_finished"
                        or execution.get("terminalState") != "succeeded" or execution.get("result") != "succeeded"
                        or execution.get("retryDecision") != "stop" or not execution.get("fencingToken")
                        or any(execution.get(key) != value for key, value in ident.items())):
                    continue  # A verdict or start ACK alone is never a settled execution receipt.
                delivery["settled"] = {"claim": binding, "verdict": verdict, "runId": receipt["runId"],
                                       "executionDigest": _event_digest(execution), "at": time.time()}
                row["status"], row["release"] = "done", False
            elif verdict == "provider-error":
                row["lane"], row["release"], row["status"] = None, True, "claimed"
            elif verdict in {"not-shippable", "quarantined"}:
                row["status"], row["lane"], row["release"] = "exhausted", None, False
            row["running"] = False
            _save_event_json(host, "escalation.json", data)
    finally:
        lock.release()


def _rung_result(state, reason, *, transfer=False):
    return {"state": state, "reason": reason, "crossLaneDraft": transfer}


def _rung_stamp(value):
    if type(value) in (int, float):
        return value if math.isfinite(value) and value > 0 else None
    if isinstance(value, str):
        try:
            stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if stamp.tzinfo is not None:
                return _rung_stamp(stamp.timestamp())
        except (ValueError, OverflowError, OSError):
            pass
    return None


def pending_rung_disposition(pr, record, name, providers, now, *, classified,
                             caps_allow, plan_ladder, top_rung_used, active_previous_attempt,
                             recovery_block=None):
    """Return eligible/blocked/unknown for a local pending rung, without mutation.

    Same-lane/disabled-owner draft handling retains the existing scope and the
    legacy optional pending head. The only new scope is an enabled native lane's
    draft explicitly routed to another lane. That exception requires an exact
    pending head, ended original attempt and current canonical route authority.

    `active_previous_attempt` comes from the maintained in_flight check against
    the *recorded* head; a changed remote head must not hide its original lease.
    `recovery_block` is the caller's existing preserved/revoked/custody reason.
    None means that caller's local preflight has not found such a hold; it does
    not attest to remote ownership. All live claim fences remain mandatory.
    """
    if not isinstance(pr, dict) or not isinstance(record, dict) or not isinstance(providers, dict):
        return _rung_result("unknown", "rung-input-unreadable")
    if _rung_stamp(now) is None or type(active_previous_attempt) is not bool:
        return _rung_result("unknown", "rung-time-or-lease-unknown")
    spec = providers.get(name)
    if not isinstance(spec, dict) or not spec.get("enabled", True) or spec.get("repairs") is False:
        return _rung_result("blocked", "rung-provider-disabled")
    if recovery_block:
        return _rung_result("blocked", str(recovery_block))
    count = record.get("count", 0)
    if type(count) is not int or count < 0:
        return _rung_result("unknown", "rung-accounting-malformed")
    for field in ("escalations", "priorEscalations"):
        rows = record.get(field, [])
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            return _rung_result("unknown", "rung-accounting-malformed")
        # Canonical caps count both histories and use their latest model stamp.
        # Malformed stamps cannot be silently interpreted as old/no cooldown.
        if any(row.get("kind") == "model" and
               (_rung_stamp(row.get("at")) is None or _rung_stamp(row["at"]) > now) for row in rows):
            return _rung_result("unknown", "rung-model-time-unknown")
    pending = record.get("pendingEscalation")
    if not isinstance(pending, dict) or pending.get("lane") != name:
        return _rung_result("blocked", "rung-not-routed")
    if not isinstance(pending.get("dossier"), str) or not pending["dossier"].strip():
        return _rung_result("unknown", "rung-dossier-unreadable")
    head, branch = pr.get("headRefOid"), pr.get("headRefName")
    if not isinstance(head, str) or not head.strip() or not isinstance(branch, str) or not branch:
        return _rung_result("unknown", "rung-target-unreadable")
    if any(type(pr.get(key)) is not bool for key in ("isDraft", "isCrossRepository", "isInMergeQueue")):
        return _rung_result("unknown", "rung-target-unreadable")
    # Maintained cached inventory is an OPEN-only query and may omit state.
    if pr.get("state", "OPEN") != "OPEN" or pr["isCrossRepository"] or pr["isInMergeQueue"]:
        return _rung_result("blocked", "rung-target-out-of-scope")
    if pending.get("head") not in (None, head):
        return _rung_result("blocked", "rung-head-changed")
    if active_previous_attempt:
        return _rung_result("blocked", "rung-previous-attempt-active")
    if not isinstance(classified, dict) or classified.get("cls") not in {"fixable-by-model", "needs-rebase", "flaky-infra"} \
            or classified.get("subtype") == "main-red":
        return _rung_result("blocked", "rung-current-blocker-not-model")
    if any(pending.get(key) != classified.get(key) for key in ("cls", "subtype")):
        return _rung_result("blocked", "rung-blocker-changed")
    try:
        authority = caps_allow(record, head, now)
    except Exception:
        return _rung_result("unknown", "rung-cap-authority-unreadable")
    if not isinstance(authority, tuple) or len(authority) != 2 or type(authority[0]) is not bool:
        return _rung_result("unknown", "rung-cap-authority-unreadable")
    if not authority[0]:
        return _rung_result("blocked", authority[1] or "rung-cap-refused")
    if pending.get("topRung") is True:
        try:
            used = top_rung_used(record, head)
        except Exception:
            return _rung_result("unknown", "rung-top-authority-unreadable")
        if type(used) is not bool:
            return _rung_result("unknown", "rung-top-authority-unreadable")
        if used:
            return _rung_result("blocked", "ladder-exhausted")
    owned = LANE_BRANCH.match(branch)
    disabled = {lane for lane, provider in providers.items() if isinstance(provider, dict)
                and (not provider.get("enabled", True) or provider.get("repairs") is False)}
    transfer = bool(pr["isDraft"] and owned and owned["lane"] not in {name, *disabled})
    if pr["isDraft"] and not owned:
        return _rung_result("blocked", "rung-foreign-draft")
    if transfer:
        if owned["lane"] not in providers or record.get("lane") != owned["lane"]:
            return _rung_result("blocked", "rung-draft-owner-unproven")
        if pending.get("head") != head:
            return _rung_result("blocked", "rung-draft-exact-head-required")
        ended = _rung_stamp(record.get("endedAt"))
        started = _rung_stamp(record.get("at"))
        if ended is None or ended > now or started is None or ended < started:
            return _rung_result("blocked", "rung-draft-previous-attempt-not-ended")
        if head not in (record.get("sha"), record.get("pushedHead")) \
                or record.get("repairBranch") != branch:
            return _rung_result("blocked", "rung-draft-attempt-target-changed")
        try:
            plan = plan_ladder(classified, record, providers, now, head)
        except RepairRoutingUnavailable as error:
            return _rung_result("unknown", str(error))
        except Exception:
            return _rung_result("unknown", "rung-route-authority-unreadable")
        if not isinstance(plan, dict):
            return _rung_result("unknown", "rung-route-authority-unreadable")
        if plan.get("action") != "model" or plan.get("lane") != name \
                or type(pending.get("topRung")) is not bool \
                or plan.get("topRung") is not pending["topRung"]:
            return _rung_result("blocked", "rung-draft-canonical-route-changed")
    return _rung_result("eligible", "pending-model-rung", transfer=transfer)


def pending_rung_candidates(host: Host, name: str, inventory: list[dict]) -> list[dict]:
    """Only existing routed rungs may cross the ordinary lane-draft boundary."""
    try:
        attempts = maintenance_json(host.state / "fix-attempts.json", missing={})
        if not isinstance(attempts, dict):
            return []
        preserved = maintenance_preserved(host.state)
    except (OSError, ValueError):
        return []
    return [pr for pr in inventory if pr["number"] not in preserved
            and isinstance(record := attempts.get(str(pr["number"])), dict)
            and isinstance(pending := record.get("pendingEscalation"), dict)
            and pending.get("lane") == name and pending.get("head") == pr.get("headRefOid")
            and not pr_recovery_held(host, pr)]


def rung_blocker(pr: dict, record: dict, entry: dict) -> dict | None:
    """Exhaustion permits its own bounded rung, never a stronger integrity hold."""
    evidence = entry.get("evidence") or []
    if not isinstance(evidence, list) or (entry.get("reason") is not None
                                        and not isinstance(entry["reason"], str)):
        return None
    evidence = pr_events.without_exhaustion_evidence(evidence)
    reason = entry.get("reason")
    if not reason or reason == "fix-exhausted":
        reason = pr_events.held_reason(evidence)[0]
    policy_entry = {**entry, "evidence": evidence, "reason": reason}
    action = next((action for _, code, action in pr_events.HELD_REASONS if code == reason), None)
    if not pr_events.fixable_hold(policy_entry, pr["headRefOid"]) or (
            entry.get("sha") == pr["headRefOid"] and action and action not in pr_events.FIXABLE_ACTIONS):
        return None
    return remediation.classify_blocker(pr, policy_entry, record)


def claim_escalation_pr(host: Host, name: str, prs: list[dict], *,
                        routing_context=REPAIR_ROUTING_UNSET) -> dict | None:
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
        if claimed_elsewhere(pr["number"], pr["headRefOid"], ("fix", "gate"), timeout=30):
            continue
        try:
            live = require_fix_target(pr, "before-escalation-claim", repair=True)
        except RepairStopped:
            continue
        if live.get("headRefName") != pr["headRefName"] or live.get("isCrossRepository") is not False:
            continue
        holds = {label.lower() for label in pr_events.label_names(live)} & pr_events.HOLD_LABELS
        prior_holds = {label.lower() for label in pr_events.label_names(pr)} & pr_events.HOLD_LABELS
        # Exhaustion has its own authorized rung, but does not erase a stronger
        # same-head hold (including legacy rows lacking normalized reason fields).
        classified = rung_blocker(live, record, entry)
        strict_routing = routing_context is not REPAIR_ROUTING_UNSET
        if strict_routing and current_repair_routing_reason(host, routing_context, providers):
            continue
        def current_plan(classified, record, providers, now, head):
            # The newly introduced foreign-draft exception always needs proof;
            # legacy direct callers cannot silently assume every route healthy.
            return repair_routing_plan(routing_context, providers, classified, record, now, head,
                                       repair_route_cooldowns(host, providers))
        rung = pending_rung_disposition(
            live, record, name, providers, time.time(), classified=classified,
            caps_allow=remediation.caps_allow, plan_ladder=current_plan,
            top_rung_used=remediation.top_rung_used,
            active_previous_attempt=pr_events.in_flight(record, {"headRefOid": record.get("sha")}, time.time()))
        if rung["state"] != "eligible":
            continue
        # Preserve the canonical prescribed-fix exception, never extending it to a
        # new hold or altered prescription. Auxiliary holdNote is still cached.
        if holds and (holds != prior_holds or pending.get("subtype") != "human-hold"
                      or classified.get("subtype") != "human-hold"
                      or live.get("holdNote") != pr.get("holdNote")):
            continue
        # Head/custody reads can wait. Refresh both native repair kinds before
        # taking local accounting locks; a gate claim is also active custody.
        if claimed_elsewhere(live["number"], live["headRefOid"], ("fix", "gate"), timeout=30):
            continue
        now = time.time()

        def charge(current):
            nonlocal now
            fresh_held = json.loads(held_path(host).read_text()) if held_path(host).exists() else {}
            if not isinstance(current, dict) or current.get(key) != record \
                    or not isinstance(fresh_held, dict) or fresh_held.get(key, {}) != entry \
                    or pr_events.in_flight(record, {"headRefOid": record.get("sha")}, time.time()) \
                    or live["number"] in maintenance_preserved(host.state) \
                    or pr_recovery_held(host, live) \
                    or publication_revocation(host, live["headRefName"]) \
                    or ((strict_routing or rung["crossLaneDraft"]) and
                        current_repair_routing_reason(host, routing_context, providers)):
                raise RepairStopped("escalation-claim-changed", live, "before-escalation-charge")
            # A cooldown can expire without its stored timestamp changing. Replan
            # at the charge boundary rather than treating unchanged evidence as
            # proof that the earlier route is still canonical.
            now = time.time()
            fresh_rung = pending_rung_disposition(
                live, record, name, providers, now, classified=classified,
                caps_allow=remediation.caps_allow, plan_ladder=current_plan,
                top_rung_used=remediation.top_rung_used,
                active_previous_attempt=pr_events.in_flight(record, {"headRefOid": record.get("sha")}, now))
            if fresh_rung["state"] != "eligible":
                raise RepairStopped("escalation-route-changed", live, "before-escalation-charge")
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
    rows = list(pr.get("reviewSummaries") or []) + list(pr.get("reviewThreads") or [])
    text = "\n".join(f"- {row['author']['login']}: {row['body']}" for row in rows if row.get("body"))
    return ("Reviewers requested changes:\n" + text)[:limit] if text else "Reviewers requested changes (no active current-head comment text)."


def render_fix_prompt(pr: dict, excerpt: str) -> str:
    review = review_excerpt(pr) if pr.get("reviewDecision") == "CHANGES_REQUESTED" \
        or "review" in pr.get("eventKinds", ()) else ""
    if review:
        excerpt = review + ("\n\n" + excerpt if excerpt else "")
    if pr.get("gateEvidence"):
        excerpt = "Lane gate (the repo's pre-push-gate) held this PR:\n" + "\n".join(pr["gateEvidence"]) + \
            ("\n\n" + excerpt if excerpt else "")
        if any(str(line).startswith("diff-too-large") for line in pr["gateEvidence"]):
            excerpt = (f"Split this PR: keep at most {MAX_REVIEWABLE_LINES} reviewable changed lines (tests "
                       "included, generated files excluded) on this branch, and move the rest to a new branch "
                       "based on this one, opened as a follow-up PR whose body says it stacks on this one. "
                       "Each part must build and pass its own tests.\n\n") + excerpt
    if pr.get("mergeStateStatus") == "DIRTY":
        problem = ["This PR conflicts with main. Merge origin/main into the branch and resolve every",
                   "conflict keeping both sides' intent. If both sides added a migration with the same",
                   "number, renumber yours after main's and regenerate its snapshot/journal entry.",
                   "For a pnpm-lock.yaml conflict take main's lockfile and run `pnpm install --lockfile-only`.",
                   "Never hand-merge generated files: take main's generated copy, then run its canonical",
                   "generator (`pnpm ci:topology:write` for workflow topology or",
                   "`pnpm --filter @jovie/web drizzle:generate` for migration metadata).",
                   "When the only conflict is scripts/preflight-changed.mjs in the NARROWED",
                   "merge-group-unit-guards command, union && prefixes and vitest paths with",
                   "fix_red_classes.merge_narrowed_guard_command. Unknown hunks stay unresolved.",
                   "Other shell && chains are unioned by fix_red_classes.merge_and_chain",
                   "(base order, then head-only prefixes; node --test and vitest paths union).",
                   "Unknown hunks stay unresolved.",
                   "A one-line comma-separated identifier list is unioned by",
                   "fix_red_classes.merge_additive_identifier_list (main order, then head-only",
                   "tokens). Unknown hunks stay unresolved.",
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
        *PLANNING_CONTRACT,
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
        "- Premise rule: when the same check fails twice in a row on this PR, state your",
        "  assumption and run one falsifying test before any patch. Inspect both failures;",
        "  record the assumption, exact command and observed result in the PR body under",
        "  `## Premise check` (Assumption / Falsifying test / Result). A retry is not a falsifier.",
        "- For bug fixes and CI repairs, retain pre-fix red evidence in `## Red-before-green`:",
        "  Failing command plus a red-output snippet or Failing run (before fix) URL.",
        "- Retain exactly one customer changelog decision in the PR body (docs/CHANGELOG_PUBLICATION.md).",
        "  Explicitly choose internal metadata or a customer-visible outcome with availability and evidence;",
        '  internal metadata is `<!-- customer-changelog/v1 {"releaseWorthy":false} -->`.',
        "  Use pr_events.repair_evidence_body(pr, body, excerpt, customer_decision=decision) to complete",
        "  missing repair metadata; preserve existing decisions, then run the canonical Fleet/changelog guards.",
        f"- Immediately before every install or push, use `gh api graphql` to read PR #{pr['number']} in {REPO_SLUG}:",
        "  request state, headRefOid and isInMergeQueue. The pr view JSON command does not expose queue ownership.",
        "  Continue only while OPEN with isInMergeQueue=false; otherwise stop and preserve local changes, without install or push.",
        "- Repo gates are real requirements (e.g. component-ship-gate needs tests + stories for",
        "  shipped UI components). Never skip, weaken or --no-verify a check.",
        *NO_HISTORY_REWRITE,
        "- If the failure is unrelated to this PR (broken main, infra), change nothing and end with",
        "  `NOT-SHIPPABLE: <reason>`.",
    ])


def regenerate_merged_generated(worktree: Path, paths, log, *, guard=lambda: None) -> bool:
    """Restore main's generated copies, then regenerate from the merged source, including
    outputs that Git merged cleanly. Also usable after an agent resolves source conflicts."""
    generated = sorted(set(paths) & remediation.GENERATED_RESOLVERS.keys())
    if not generated:
        return True
    if sh(["git", "checkout", "origin/main", "--", *generated], cwd=worktree, log=log).returncode:
        return False
    commands = dict.fromkeys(remediation.GENERATED_RESOLVERS[path] for path in generated)
    for command in commands:
        guard()
        if sh(list(command), cwd=worktree, timeout=900, log=log).returncode:
            return False
    return sh(["git", "add", *generated], cwd=worktree, log=log).returncode == 0


def union_merge_file(worktree: Path, path: str, log) -> bool:
    """Resolve an append-only file by keeping both sides' lines (`git merge-file --union`)."""
    stages = {}
    for stage in (1, 2, 3):
        shown = sh(["git", "show", f":{stage}:{path}"], cwd=worktree)
        if stage != 1 and shown.returncode:
            return False
        stages[stage] = shown.stdout if shown.returncode == 0 else ""
    with tempfile.TemporaryDirectory() as tmp:
        names = {}
        for stage, text in stages.items():
            names[stage] = str(Path(tmp) / f"s{stage}")
            atomic_write_text(Path(names[stage]), text)
        merged = sh(["git", "merge-file", "--union", "-p", names[2], names[1], names[3]], cwd=worktree)
    if merged.returncode < 0 or merged.returncode >= 128:
        return False
    try:
        rows = [json.loads(line) for line in merged.stdout.splitlines() if line.strip()]
        header = json.loads(next(iter(stages[3].splitlines()), "null"))
        if not isinstance(header, dict) or not header.get("schema") or not rows or rows[0] != header:
            return False
        rows = rows[1:]
        ids = [row["id"] for row in rows]
        if any(not isinstance(key, str) for key in ids) or len(set(ids)) != len(ids):
            return False
    except (ValueError, TypeError, KeyError):
        return False
    atomic_write_text(worktree / path, merged.stdout)
    return sh(["git", "add", path], cwd=worktree, log=log).returncode == 0


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
        if not conflicted or not conflicted <= remediation.RESOLVABLE_CONFLICT_FILES:
            sh(["git", "merge", "--abort"], cwd=worktree, log=log)
            return False
        for path in sorted(conflicted & remediation.UNION_MERGE_FILES):
            if not union_merge_file(worktree, path, log):
                sh(["git", "merge", "--abort"], cwd=worktree, log=log)
                return False
        conflicted -= remediation.UNION_MERGE_FILES
        changed = sh(["git", "diff", "--name-only", "HEAD"], cwd=worktree)
        if changed.returncode or not regenerate_merged_generated(
                worktree, conflicted | set(changed.stdout.splitlines()), log, guard=guard):
            sh(["git", "merge", "--abort"], cwd=worktree, log=log)
            return False
        if sh(["git", "commit", "--no-edit"], cwd=worktree, log=log).returncode != 0:
            sh(["git", "merge", "--abort"], cwd=worktree, log=log)
            return False
    guard()
    return sh(["git", "push", "-q", "origin", f"HEAD:refs/heads/{branch}"], cwd=worktree, log=log).returncode == 0


def resolve_narrowed_preflight_conflict(worktree: Path, branch: str, log, *, guard=lambda: None) -> bool:
    """Union a NARROWED preflight command when that file is the only conflict with main.

    Both sides keep their shell prefixes and vitest paths. Any other conflict, or a hunk
    the union cannot read, aborts and leaves the PR to the model. The push is a fast-forward
    of the PR branch; this never rebases or force-pushes."""
    guard()
    merged = sh(["git", "merge", "--no-edit", "origin/main"], cwd=worktree, log=log)
    if merged.returncode != 0:
        conflicted = [path for path in (sh(["git", "diff", "--name-only", "--diff-filter=U"], cwd=worktree).stdout or "").split() if path]
        target = worktree / fix_red_classes.NARROWED_PREFLIGHT
        if conflicted != [fix_red_classes.NARROWED_PREFLIGHT]:
            sh(["git", "merge", "--abort"], cwd=worktree, log=log)
            return False
        try:
            resolved = fix_red_classes.resolve_preflight_narrowed_text(target.read_text())
        except OSError:
            resolved = None
        if resolved is None:
            sh(["git", "merge", "--abort"], cwd=worktree, log=log)
            return False
        try:
            atomic_write_text(target, resolved)
        except OSError:
            sh(["git", "merge", "--abort"], cwd=worktree, log=log)
            return False
        guard()
        if sh(["git", "add", "--", fix_red_classes.NARROWED_PREFLIGHT], cwd=worktree, log=log).returncode != 0 \
                or sh(["git", "commit", "--no-edit"], cwd=worktree, log=log).returncode != 0:
            sh(["git", "merge", "--abort"], cwd=worktree, log=log)
            return False
    guard()
    pushed = sh(["git", "push", "-q", "origin", f"HEAD:refs/heads/{branch}"], cwd=worktree, log=log).returncode == 0
    return pushed


def resolve_and_chain_conflict(worktree: Path, branch: str, log, *, guard=lambda: None) -> bool:
    """Union shell && chains when every conflict hunk with main is that shape.

    Base order, then head-only prefixes. node --test and vitest paths follow the
    same rule. A hunk the union cannot read aborts and leaves the PR to the model.
    The push is a fast-forward of the PR branch; this never rebases or force-pushes."""
    guard()
    merged = sh(["git", "merge", "--no-edit", "origin/main"], cwd=worktree, log=log)
    if merged.returncode != 0:
        conflicted = [path for path in (sh(["git", "diff", "--name-only", "--diff-filter=U"], cwd=worktree).stdout or "").split() if path]
        if not conflicted:
            sh(["git", "merge", "--abort"], cwd=worktree, log=log)
            return False
        resolved_texts: dict[Path, str] = {}
        for rel in conflicted:
            target = worktree / rel
            try:
                outcome = fix_red_classes.resolve_and_chain_text(target.read_text())
            except (OSError, UnicodeError):
                outcome = None
            if outcome is None:
                sh(["git", "merge", "--abort"], cwd=worktree, log=log)
                return False
            resolved_texts[target] = outcome
        try:
            for target, outcome in resolved_texts.items():
                atomic_write_text(target, outcome)
        except OSError:
            sh(["git", "merge", "--abort"], cwd=worktree, log=log)
            return False
        guard()
        if sh(["git", "add", "--", *conflicted], cwd=worktree, log=log).returncode != 0 \
                or sh(["git", "commit", "--no-edit"], cwd=worktree, log=log).returncode != 0:
            sh(["git", "merge", "--abort"], cwd=worktree, log=log)
            return False
    guard()
    return sh(["git", "push", "-q", "origin", f"HEAD:refs/heads/{branch}"], cwd=worktree, log=log).returncode == 0


def resolve_additive_list_conflict(worktree: Path, branch: str, log, *, guard=lambda: None) -> bool:
    """Union quoted list entries when every conflict hunk with main is only those lines.

    Main's order stays, then head-only lines. A prose hunk or any other shape aborts
    and leaves the PR to the model. The push is a fast-forward of the PR branch."""
    guard()
    merged = sh(["git", "merge", "--no-edit", "origin/main"], cwd=worktree, log=log)
    if merged.returncode != 0:
        conflicted = [path for path in (sh(["git", "diff", "--name-only", "--diff-filter=U"], cwd=worktree).stdout or "").split() if path]
        if not conflicted:
            sh(["git", "merge", "--abort"], cwd=worktree, log=log)
            return False
        resolved: dict[str, str] = {}
        for path in conflicted:
            target = worktree / path
            try:
                text = fix_red_classes.resolve_additive_quoted_list_text(target.read_text())
            except OSError:
                text = None
            if text is None:
                sh(["git", "merge", "--abort"], cwd=worktree, log=log)
                return False
            resolved[path] = text
        try:
            for path, text in resolved.items():
                atomic_write_text(worktree / path, text)
        except OSError:
            sh(["git", "merge", "--abort"], cwd=worktree, log=log)
            return False
        guard()
        if sh(["git", "add", "--", *conflicted], cwd=worktree, log=log).returncode != 0 \
                or sh(["git", "commit", "--no-edit"], cwd=worktree, log=log).returncode != 0:
            sh(["git", "merge", "--abort"], cwd=worktree, log=log)
            return False
    guard()
    return sh(["git", "push", "-q", "origin", f"HEAD:refs/heads/{branch}"], cwd=worktree, log=log).returncode == 0


def resolve_identifier_list_conflict(worktree: Path, branch: str, log, *, guard=lambda: None) -> bool:
    """Union one-line identifier lists when every conflict hunk with main is that shape.

    Main's order stays, then head-only tokens. Prose or any other shape aborts and
    leaves the PR to the model. The push is a fast-forward of the PR branch."""
    guard()
    merged = sh(["git", "merge", "--no-edit", "origin/main"], cwd=worktree, log=log)
    if merged.returncode != 0:
        conflicted = [path for path in (sh(["git", "diff", "--name-only", "--diff-filter=U"], cwd=worktree).stdout or "").split() if path]
        if not conflicted:
            sh(["git", "merge", "--abort"], cwd=worktree, log=log)
            return False
        resolved: dict[str, str] = {}
        for path in conflicted:
            target = worktree / path
            try:
                text = fix_red_classes.resolve_additive_identifier_list_text(target.read_text())
            except (OSError, UnicodeError):
                text = None
            if text is None:
                sh(["git", "merge", "--abort"], cwd=worktree, log=log)
                return False
            resolved[path] = text
        try:
            for path, text in resolved.items():
                atomic_write_text(worktree / path, text)
        except OSError:
            sh(["git", "merge", "--abort"], cwd=worktree, log=log)
            return False
        guard()
        if sh(["git", "add", "--", *conflicted], cwd=worktree, log=log).returncode != 0 \
                or sh(["git", "commit", "--no-edit"], cwd=worktree, log=log).returncode != 0:
            sh(["git", "merge", "--abort"], cwd=worktree, log=log)
            return False
    guard()
    return sh(["git", "push", "-q", "origin", f"HEAD:refs/heads/{branch}"], cwd=worktree, log=log).returncode == 0


def conflict_resolvers():
    """DIRTY conflict classes in try order. Each one charges one mutation.

    The repair budget is this list plus the model dispatch, so adding a class
    cannot exhaust the budget before that class runs or before an unknown hunk
    reaches the model."""
    return (
        ("repair-generated-conflict", resolve_generated_conflict, "generated-regenerated"),
        ("repair-narrowed-preflight", resolve_narrowed_preflight_conflict, "narrowed-preflight-merged"),
        ("repair-and-chain", resolve_and_chain_conflict, "and-chain-merged"),
        ("repair-additive-list", resolve_additive_list_conflict, "additive-list-merged"),
        ("repair-identifier-list", resolve_identifier_list_conflict, "identifier-list-merged"),
    )


def merge_narrowed_preflight_fix(host: Host, pr: dict, route: dict, worktree: Path, log, receipt: dict):
    """No-model fix when Source Validation reports only the narrowed preflight conflict."""
    del host, route
    if not resolve_narrowed_preflight_conflict(worktree, pr["headRefName"], log):
        return None
    receipt.update(resolution="narrowed-preflight-merged")
    return types.SimpleNamespace(returncode=0)


REPAIR_AUTHORITY_FIELDS = """number title body state mergedAt headRefName headRefOid url isDraft mergeStateStatus reviewDecision updatedAt
isCrossRepository isInMergeQueue labels(first:100){pageInfo{hasNextPage} nodes{name}}
latestOpinionatedReviews(first:100,writersOnly:false){totalCount pageInfo{hasNextPage}
nodes{id state body submittedAt updatedAt author{__typename login} commit{oid}}}
reviewThreads(first:100){totalCount pageInfo{hasNextPage} nodes{id isResolved isOutdated
comments(first:100){totalCount pageInfo{hasNextPage}
nodes{id body state outdated updatedAt author{__typename login}
pullRequestReview{id state commit{oid}}}}}}"""
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
    authority["reviewAuthorityDigest"] = repair_review_authority(live)[2]
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
            ownership["reviewAuthorityDigest"] = normalized["reviewAuthorityDigest"]
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


def repair_review_authority(live: dict) -> tuple:
    """Complete bounded current-head review evidence; never cached prose authority."""
    def complete(connection):
        rows = connection["nodes"]
        if (connection["pageInfo"]["hasNextPage"] is not False
                or type(connection["totalCount"]) is not int
                or not isinstance(rows, list) or len(rows) > 100
                or connection["totalCount"] != len(rows)
                or any(not isinstance(row, dict) or not isinstance(row.get("id"), str)
                       or not row["id"].strip() for row in rows)
                or len({row["id"] for row in rows}) != len(rows)):
            raise ValueError("repair-reviews-incomplete")
        return rows

    def actor(row, active):
        value = row.get("author")
        if value is None and not active:
            return None
        if (not isinstance(value, dict) or value.get("__typename") not in {"User", "Bot"}
                or not isinstance(value.get("login"), str) or not value["login"].strip()):
            raise ValueError("repair-review-actor-invalid")
        return {"login": value["login"], "type": value["__typename"]}

    def text(row, key):
        value = row[key]
        if not isinstance(value, str):
            raise ValueError("repair-review-text-invalid")
        return value

    def flag(row, key):
        value = row[key]
        if type(value) is not bool:
            raise ValueError("repair-review-flag-invalid")
        return value

    def commit(row, *, inactive=False):
        provenance = row["commit"]
        if provenance is None and inactive:
            return None
        value = provenance["oid"]
        if not isinstance(value, str) or not value.strip():
            raise ValueError("repair-reviewed-head-invalid")
        return value

    summaries, threads, raw_summaries, raw_threads, actors = [], [], [], [], set()
    for row in complete(live["latestOpinionatedReviews"]):
        state = row["state"]
        if state not in {"APPROVED", "CHANGES_REQUESTED", "DISMISSED"}:
            raise ValueError("repair-review-state-invalid")
        reviewed = commit(row, inactive=state in {"APPROVED", "DISMISSED"})
        active = state == "CHANGES_REQUESTED" and reviewed == live["headRefOid"]
        who = actor(row, active)
        if who:
            key = (who["type"], who["login"].lower())
            if key in actors:
                raise ValueError("repair-review-actor-ambiguous")
            actors.add(key)
        normalized = {"id": row["id"], "state": state, "body": text(row, "body"),
                      "submittedAt": text(row, "submittedAt"), "updatedAt": text(row, "updatedAt"),
                      "author": who, "reviewedHead": reviewed}
        raw_summaries.append(normalized)
        if active:
            summaries.append(normalized)
    for thread in complete(live["reviewThreads"]):
        resolved, outdated = flag(thread, "isResolved"), flag(thread, "isOutdated")
        comments = []
        for row in complete(thread["comments"]):
            state, comment_outdated = row["state"], flag(row, "outdated")
            review = row["pullRequestReview"]
            if (state not in {"PENDING", "SUBMITTED"} or not isinstance(review, dict)
                    or not isinstance(review.get("id"), str) or not review["id"].strip()
                    or review.get("state") not in {"PENDING", "COMMENTED", "APPROVED",
                                                  "CHANGES_REQUESTED", "DISMISSED"}):
                raise ValueError("repair-inline-review-invalid")
            inactive = (resolved or outdated or comment_outdated or state == "PENDING"
                        or review["state"] in {"PENDING", "DISMISSED"})
            reviewed = commit(review, inactive=inactive)
            active = (not resolved and not outdated and not comment_outdated and state == "SUBMITTED"
                      and review["state"] not in {"PENDING", "DISMISSED"} and reviewed == live["headRefOid"])
            normalized = {"id": row["id"], "body": text(row, "body"), "state": state,
                          "updatedAt": text(row, "updatedAt"), "author": actor(row, active),
                          "outdated": comment_outdated, "reviewId": review["id"],
                          "reviewState": review["state"], "reviewedHead": reviewed,
                          "threadId": thread["id"], "resolved": resolved}
            comments.append(normalized)
            if active:
                threads.append(normalized)
        raw_threads.append({"id": thread["id"], "resolved": resolved, "outdated": outdated,
                            "comments": sorted(comments, key=lambda row: row["id"])})
    evidence = {"summaries": sorted(raw_summaries, key=lambda row: row["id"]),
                "threads": sorted(raw_threads, key=lambda row: row["id"]), "complete": True}
    digest = hashlib.sha256(json.dumps(evidence, sort_keys=True).encode()).hexdigest()
    return summaries, threads, digest


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
        summaries, threads, digest = repair_review_authority(live)
        fresh.update(reviewSummaries=summaries, reviewThreads=threads, reviewAuthorityDigest=digest)
        fresh.pop("latestOpinionatedReviews", None)
        fresh["dependencyMetadataDigest"] = dependency_diff.metadata_digest(live)
        fresh.pop("commits", None)
        return fresh
    except (OSError, subprocess.SubprocessError, ValueError, KeyError, TypeError, AttributeError):
        return None


PLATFORM_RED_TEXT = fix_red_classes.PLATFORM_TEXT


_FAILED_LOGS: dict = {}
FAILED_LOG_CHECKS, FAILED_LOG_CHARS = 6, 40000


def failed_logs(host: Host, pr: dict) -> dict | None:
    """{check name: failed-job log} for the real red checks on this head, read once per (PR, head); None when a
    check has no job link or a log is unreadable (an unknown red is never routed around a model)."""
    cache_key = (str(host.state), pr["number"], pr["headRefOid"])
    if cache_key in _FAILED_LOGS:
        return _FAILED_LOGS[cache_key]
    logs: dict | None = {}
    for check in fix_red_classes.real_failures(pr)[:FAILED_LOG_CHECKS]:
        job = re.search(r"/job/(\d+)", check.get("detailsUrl") or "")
        log = gh_call(["run", "view", "--repo", REPO_SLUG, "--job", job.group(1), "--log-failed"]) if job else None
        if log is None or log.returncode != 0:
            logs = None
            break
        logs[str(check.get("name"))] = (log.stdout or "")[-FAILED_LOG_CHARS:]
    if len(_FAILED_LOGS) > 64:
        _FAILED_LOGS.clear()
    _FAILED_LOGS[cache_key] = logs
    return logs


def infra_only_red(host: Host, pr: dict) -> str | None:
    """The infrastructure signature when every real red check on this head failed for a platform
    reason (rate limit, HTTP 408, missing token, runner loss), else None. 52 of 253 fix-no-change
    runs were an agent reading such a log and declining; a rerun costs no agent. One rerun per
    head: a head that is still infra-red after it goes to the agent as before."""
    kinds = set(pr.get("eventKinds") or [])
    if pr.get("gateEvidence") or pr.get("queueFailure") or kinds & {"conflict", "review", "dequeued"} \
            or pr.get("mergeStateStatus") == "DIRTY" or pr.get("reviewDecision") == "CHANGES_REQUESTED":
        return None
    if not fix_red_classes.real_failures(pr):
        return None
    logs = failed_logs(host, pr)
    if not logs:
        return None
    found = set()
    for text in logs.values():
        hit = PLATFORM_RED_TEXT.search(text)
        if not hit:
            return None
        found.add(re.sub(r"\W+", "-", hit.group(0).lower()).strip("-"))
    return "+".join(sorted(found))[:60]


def claim_infra_rerun(host: Host, pr: dict) -> bool:
    """True once per (PR, head): the caller may rerun instead of dispatching an agent."""
    taken = []
    def change(data: dict) -> None:
        if data.get(str(pr["number"])) != pr["headRefOid"]:
            data[str(pr["number"])] = pr["headRefOid"]
            taken.append(True)
    try:
        update_json(host.state / "infra-reruns.json", change)
    except (OSError, ValueError):
        return False
    return bool(taken)


OPEN_MIGRATIONS_QUERY = ('query($endCursor:String){repository(owner:"JovieInc",name:"Jovie"){pullRequests(states:OPEN,first:100,'
                         'after:$endCursor){pageInfo{hasNextPage endCursor}nodes{number files(first:100){nodes{path}}}}}}')


def open_pr_migrations(exclude: int) -> dict | None:
    """{PR number: migration numbers it adds} for every other open PR; None when GitHub cannot be read."""
    result = gh_call(["api", "graphql", "--paginate", "-f", f"query={OPEN_MIGRATIONS_QUERY}", "--jq",
                      ".data.repository.pullRequests.nodes[]|{n:.number,f:[.files.nodes[].path]}"])
    if result.returncode != 0:
        return None
    out = {}
    for line in (result.stdout or "").splitlines():
        try:
            row = json.loads(line)
        except ValueError:
            return None
        numbers = migration_renumber._numbers(row.get("f") or [])
        if numbers and row.get("n") != exclude:
            out[int(row["n"])] = numbers
    return out


def renumber_migrations_fix(host: Host, pr: dict, route: dict, worktree: Path, log, receipt: dict):
    """The no-model fix for a migration number collision: renumber to the next free number, rebuild the journal and
    snapshots, merge main and push. Returns a finished-agent stand-in, or None (worktree restored) when it does not apply."""
    git = lambda *args, **kw: sh(["git", *args], cwd=worktree, log=log, timeout=900, **kw)
    def restore() -> None:
        git("merge", "--abort")
        git("reset", "--hard", f"origin/{pr['headRefName']}")
        git("clean", "-fdq", "--", migration_renumber.MIG_DIR)
    others = open_pr_migrations(pr["number"])
    if others is None:
        return None
    def read(*args):
        done = sh(["git", *args], cwd=worktree, timeout=300)
        if done.returncode:
            raise OSError(f"git {args[0]} failed")
        return done.stdout or ""
    try:
        changed = migration_renumber.renumber(worktree, read, "origin/main", pr["number"], others)
        if not changed:
            return None
        git("add", "-A", "--", migration_renumber.MIG_DIR)
        if git("commit", "-q", "-m", "fix(db): renumber migration to the next free number").returncode:
            raise OSError("commit failed")
        if git("merge", "--no-edit", "origin/main").returncode:
            conflicted = (sh(["git", "diff", "--name-only", "--diff-filter=U"], cwd=worktree).stdout or "").split()
            if conflicted != [f"{migration_renumber.META}/_journal.json"] \
                    or git("checkout", "--ours", "--", conflicted[0]).returncode or git("add", conflicted[0]).returncode \
                    or git("commit", "-q", "--no-edit").returncode:
                raise OSError("merge conflict outside the journal")
        if git("push", "-q", "origin", f"HEAD:{pr['headRefName']}").returncode:
            raise OSError("push failed")
    except (migration_renumber.Unmergeable, OSError, ValueError, KeyError, subprocess.SubprocessError):
        restore()
        return None
    receipt.update(resolution="renumbered-migrations", renumbered=changed[:12])
    return types.SimpleNamespace(returncode=0)


def register_domain_writes_fix(host: Host, pr: dict, route: dict, worktree: Path, log, receipt: dict):
    """The no-model fix for an allowed-0 domain write: register the exporting module, lower the
    ratchet, commit and push. Returns a finished-agent stand-in, or None when the edit does not apply."""
    probe = sh(["node", "scripts/domain-write-guard.mjs"], cwd=worktree, log=log, timeout=300)
    added = fix_red_classes.register_direct_domain_writes(
        worktree, f"{probe.stdout or ''}\n{probe.stderr or ''}")
    if not added:
        return None
    if sh(["node", "scripts/domain-write-guard.mjs", "--write"], cwd=worktree, log=log, timeout=300).returncode:
        return None
    if sh(["node", "scripts/domain-write-guard.mjs"], cwd=worktree, log=log, timeout=300).returncode:
        return None
    message = "fix(domain): register " + ", ".join(Path(name).name for name in added)[:72]
    steps = [["git", "add", "--", "apps/web/lib/domain/write-registry.json",
              "scripts/lib/domain-write-guard.ratchet.gen.json"],
             ["git", "commit", "-q", "-m", message],
             ["git", "push", "-q", "origin", f"HEAD:{pr['headRefName']}"]]
    for step in steps:
        if sh(step, cwd=worktree, log=log, timeout=900).returncode:
            return None
    receipt.update(resolution="registered-domain-writes", registeredModules=added)
    return types.SimpleNamespace(returncode=0)


def atomic_state_fix(host: Host, pr: dict, route: dict, worktree: Path, log, receipt: dict):
    """Repair reported writes, verify them and publish through the existing repair route."""
    logs = failed_logs(host, pr)
    changed = fix_red_classes.repair_atomic_state_writes(worktree, "\n".join(logs.values()))
    if not changed:
        return None
    check = sh(["python3", "-m", "unittest", "scripts.tests.test_lanes_atomic_state"],
               cwd=worktree, log=log, timeout=300)
    if check.returncode:
        return None
    steps = [["pnpm", "preflight:changed"], ["git", "add", "--", *changed],
             ["git", "commit", "-q", "-m", "fix(lanes): publish state through the atomic writer"]]
    for step in steps:
        if sh(step, cwd=worktree, log=log, timeout=900).returncode:
            return None
    require_fix_target(pr, "before-atomic-push", worktree=worktree, repair=True)
    if sh(["git", "push", "-q", "origin", f"HEAD:{pr['headRefName']}"],
          cwd=worktree, log=log, timeout=900).returncode:
        return None
    receipt.update(resolution="atomic-state-writes", atomicFiles=changed)
    return types.SimpleNamespace(returncode=0)


def wire_ci_fast_fix(host: Host, pr: dict, route: dict, worktree: Path, log, receipt: dict):
    """The no-model fix for an unwired script test: list it in ci-fast-lanes.mjs, commit, push. Returns a
    finished-agent stand-in, or None when the edit does not apply (the model then gets the head)."""
    added = fix_red_classes.wire_ci_fast(worktree, route.get("files") or [])
    if not added:
        return None
    message = "fix(ci): wire " + ", ".join(Path(name).name for name in added)[:80] + " into ci-fast"
    steps = [["git", "add", "scripts/ci-fast-lanes.mjs"], ["git", "commit", "-q", "-m", message],
             ["git", "push", "-q", "origin", f"HEAD:{pr['headRefName']}"]]
    for step in steps:
        if sh(step, cwd=worktree, log=log, timeout=900).returncode:
            return None
    receipt.update(resolution="wired-ci-fast", wiredFiles=added)
    return types.SimpleNamespace(returncode=0)


def snap_spacing_fix(host: Host, pr: dict, route: dict, worktree: Path, log, receipt: dict):
    """The no-model fix for a grown spacing ratchet: snap added 10px/14px utilities onto the
    4px grid, commit and push. Returns a finished-agent stand-in, or None when nothing applies."""
    diff = sh(["git", "diff", "-U0", "origin/main...HEAD", "--", "apps/web", "packages/ui"],
              cwd=worktree, log=log, timeout=300)
    if diff.returncode:
        return None
    changed = fix_red_classes.snap_added_conservative_spacing(worktree, diff.stdout or "")
    if not changed:
        return None
    steps = [["git", "add", "--", *changed],
             ["git", "commit", "-q", "-m", "fix(ui): snap added off-grid spacing onto the 4px scale"],
             ["git", "push", "-q", "origin", f"HEAD:{pr['headRefName']}"]]
    for step in steps:
        if sh(step, cwd=worktree, log=log, timeout=900).returncode:
            return None
    receipt.update(resolution="snapped-spacing", snappedFiles=changed)
    return types.SimpleNamespace(returncode=0)


def claim_route(host: Host, pr: dict, action: str) -> bool:
    """True once per (PR, head, action): a deterministic route is tried once, then the model gets the head."""
    taken = []
    def change(data: dict) -> None:
        row = data.setdefault(str(pr["number"]), {})
        if row.get(action) != pr["headRefOid"]:
            row[action] = pr["headRefOid"]
            taken.append(True)
    try:
        update_json(host.state / "class-routes.json", change)
    except (OSError, ValueError):
        return False
    return bool(taken)


def route_fix_red(host: Host, pr: dict) -> dict | None:
    """Classify this red head by its failed logs. Returns the class (always) so the receipt carries a
    fingerprint; deterministic classes are acted on by the caller."""
    if pr.get("mergeStateStatus") == "DIRTY" or pr.get("reviewDecision") == "CHANGES_REQUESTED":
        return None
    try:
        logs = failed_logs(host, pr) or {}
        return fix_red_classes.classify(pr, logs)
    except (OSError, ValueError, KeyError, TypeError):
        return None


def stamp_changelog_decision(host: Host, pr: dict) -> bool:
    """Write the internal customer-changelog note onto the PR body. False when the body cannot
    take one or GitHub rejects the edit (the model then gets the head)."""
    stamped = fix_red_classes.stamp_internal_changelog(pr.get("body"))
    if stamped is None:
        return False
    runs = host.state / "runs"
    runs.mkdir(parents=True, exist_ok=True)
    path = runs / f"changelog-{int(pr['number'])}.md"
    atomic_write_text(path, stamped)
    edited = gh_call(["pr", "edit", str(int(pr["number"])), "--repo", REPO_SLUG, "--body-file", str(path)],
                     priority="repair")
    return edited.returncode == 0


def deterministic_route_taken(host: Host, pr: dict, route: dict | None) -> str | None:
    """Run the no-model action for a routed class once per head; the reason on success (None: use the model)."""
    if not route or route["action"] not in {fix_red_classes.RERUN, fix_red_classes.SYNC_MAIN, fix_red_classes.STAMP_CHANGELOG}:
        return None
    if route["action"] == fix_red_classes.STAMP_CHANGELOG:
        # No body, or a note already present: do not spend the once-per-head claim. An invalid
        # note is a different defect and still belongs to the model.
        if fix_red_classes.stamp_internal_changelog(pr.get("body")) is None:
            return None
        if not claim_route(host, pr, route["action"]):
            return None
        return "infra-rerun:changelog-metadata" if stamp_changelog_decision(host, pr) else None
    # One rerun per head, shared with the platform-red gate above; one sync per head.
    if not (claim_infra_rerun(host, pr) if route["action"] == fix_red_classes.RERUN else claim_route(host, pr, route["action"])):
        return None
    if route["action"] == fix_red_classes.RERUN:
        return f"infra-rerun:{route['cls']}" if _rerun_failed(pr) else None
    return f"infra-rerun:{route['cls']}" if pr_events.sync_main(host, THIS, pr, time.time(), terminal_ok=True) == "synced" else None


# Per-PR circuit breaker across heads. Gem ledger, 762 fix runs: after 3 consecutive unproductive
# runs on a PR inside 24 h the next run pushed 7% of the time (13 of 192), against 27% for a first
# run; 52% of all runs went to PRs the lane never pushed. A new head does not reset the streak.
BREAKER_STREAK = pr_events.BREAKER_STREAK
BREAKER_WINDOW_S = pr_events.BREAKER_WINDOW_S
breaker_streak = pr_events.breaker_streak
pr_breaker_open = pr_events.pr_breaker_open


def note_breaker_run(host: Host, pr: dict, receipt: dict, now: float | None = None) -> None:
    """Record one finished run; the run that completes the streak files one factory signal."""
    now = time.time() if now is None else now
    if receipt.get("attemptRefunded") or receipt.get("verdict") in ("recovery-handoff", "reconcile-unavailable", "skipped"):
        return  # no agent work was charged to the PR
    productive = receipt.get("verdict") in ("fix-pushed", "pr-opened")
    opened, tripped = [], []
    def change(data: dict) -> None:
        entry = data.setdefault(str(pr["number"]), {"runs": []})
        entry["runs"] = [row for row in entry.get("runs", []) if now - float(row[0]) < BREAKER_WINDOW_S]
        entry["runs"].append([now, productive])
        fp = (receipt.get("failureFingerprint") or {}).get("key")
        if fp:
            rows = entry.setdefault("fp", {})
            rows[fp] = [row for row in rows.get(fp, []) if now - float(row[0]) < BREAKER_WINDOW_S] + [[now, productive]]
            if productive:
                entry.pop("fpOpenHead", None)
            elif breaker_streak(rows[fp], now) >= fingerprint_breaker_n(host):
                entry["fpOpenHead"] = pr["headRefOid"]
                tripped.append(fp)
        entry["lastRunId"] = receipt.get("runId")
        if breaker_streak(entry["runs"], now) == BREAKER_STREAK and not entry.get("signalAt"):
            entry["signalAt"] = now
            opened.append(entry)
        elif productive:
            entry.pop("signalAt", None)
        for stale in [k for k, v in data.items() if not v.get("runs")]:
            del data[stale]
    try:
        update_json(host.state / "pr-breaker.json", change)
        if opened:
            (host.state / "runs").mkdir(parents=True, exist_ok=True)
            row = {"schema": "jovie-factory-signal/v1", "at": now_iso(), "source": "pr-breaker",
                   "fingerprint": hashlib.sha256(f"pr-breaker:{pr['number']}:{int(now // BREAKER_WINDOW_S)}".encode()).hexdigest()[:16],
                   "ws": "ci", "subject": {"pr": pr["number"]},
                   "evidence": {"excerpt": f"PR #{pr['number']}: {BREAKER_STREAK} consecutive unproductive fix runs in 24h; "
                                            f"last verdict {receipt.get('verdict')} reasons {(receipt.get('reasons') or [])[:2]}; "
                                            f"last run {receipt.get('runId')}. Lanes stopped repairing it; a human or a "
                                            "different approach is needed."}}
            with open(host.state / "runs" / "factory-signals.jsonl", "a") as out:
                out.write(json.dumps(row) + "\n")
    except (OSError, ValueError, TypeError):
        pass
    if tripped:
        note_fingerprint_trip(host, pr, {**(receipt.get("failureFingerprint") or {}), "checks": []}, receipt, now)


def fingerprint_breaker_n(host: Host) -> int:
    """No-push model runs on one (PR, fingerprint) before the next is refused: measured from the ledger by the
    doctor (fix_red_classes.breaker_n -> fix-red-metrics.json); the default until it has enough runs."""
    try:
        value = int(json.loads((host.state / "fix-red-metrics.json").read_text())["breakerN"])
        return min(max(value, 2), fix_red_classes.MAX_BREAKER_N)
    except (OSError, ValueError, KeyError, TypeError):
        return fix_red_classes.DEFAULT_BREAKER_N


def fingerprint_breaker_open(host: Host, pr: dict, key: str, now: float | None = None) -> bool:
    now = time.time() if now is None else now
    try:
        entry = json.loads((host.state / "pr-breaker.json").read_text()).get(str(pr["number"])) or {}
        return breaker_streak((entry.get("fp") or {}).get(key) or [], now) >= fingerprint_breaker_n(host)
    except (OSError, ValueError, AttributeError, TypeError):
        return False


def note_fingerprint_trip(host: Host, pr: dict, route: dict, receipt: dict, now: float | None = None) -> None:
    """One `machine-gap` factory signal per (PR, fingerprint): a model failed to move this failure class
    repeatedly, so the next unit of work is the machine that fixes the class, not another run."""
    now = time.time() if now is None else now
    cls, key = route.get("cls") or "other", route.get("key") or "unknown"
    fingerprint = f"fix-red-{cls}-{key}"
    path = host.state / "factory-signals" / f"{fingerprint}.json"
    if path.exists():
        return
    row = {"schema": "jovie-factory-signal/v1", "fingerprint": fingerprint, "source": "fix-red-fingerprint",
           "extraLabels": ["machine-gap"],
           "title": f"Machine gap: fix-red `{cls}` failures ({key}) keep reaching a model",
           "problem": f"PR #{pr['number']}: {fingerprint_breaker_n(host)} model fix runs in 24h on fingerprint `{key}` "
                      f"(class {cls}; signature {route.get('signature') or 'n/a'}) pushed nothing; last verdict "
                      f"{receipt.get('verdict')}. Build or extend the deterministic fixer / guard for this class in "
                      "scripts/lanes/fix_red_classes.py (or the check that emits it) instead of dispatching another run.",
           "acceptance": ["The failure class is classified in fix_red_classes.SIGNATURES with a deterministic action "
                          "(or a guard prevents it), with a test fed by the failing log",
                          "A new red of this class is fixed with no model run"],
           "metric": {"name": "model fix-red runs on this fingerprint", "baseline": fingerprint_breaker_n(host),
                      "target": 0, "measuredBy": "python3 scripts/lanes/fix_red_classes.py measure"}}
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        atomic_write_text(path, json.dumps(row, indent=1))
    except (OSError, ValueError):
        pass


def file_breaker_signals(host: Host, linear) -> int:
    """File each unfiled breaker signal as one remediation intake issue (idempotent by fingerprint)."""
    path = host.state / "runs" / "factory-signals.jsonl"
    if not path.exists():
        return 0
    rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    filed = 0
    for row in rows:
        if row.get("filedAt") or row.get("source") != "pr-breaker":
            continue
        if pr_events.ensure_linear_intake(linear, row):
            row["filedAt"] = now_iso()
            filed += 1
    if filed:
        atomic_write_text(path, "".join(json.dumps(row) + "\n" for row in rows))
    return filed


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


# Cancellation stages before the agent ran or any source mutation landed. A repair
# stopped at one of them consumed none of the work the fix budget pays for.
UNWORKED_PRE_AGENT_STAGES = frozenset(
    {"before-execution-claim", "before-checkout", "after-fetch", "before-install", "before-agent"})


def unworked_fix_attempt(receipt: dict) -> str | None:
    """The no-work reason when a charged attempt ended before any agent work, else None.

    The attempt is charged at claim time, before the run learns the target or its
    checkout are unusable. Infrastructure stops (an unreadable target, a failed
    checkout, a preserved-run handoff) then spent the head's bounded fix budget on
    no work — 19 repairs in 24h on 2026-10-11 (JOV-8191). Stops after the agent ran
    or source changed keep their charge."""
    verdict = receipt.get("verdict")
    if verdict == "recovery-handoff":
        return str((receipt.get("reasons") or ["recovery-handoff"])[0])
    if verdict == "skipped":
        reason = str((receipt.get("reasons") or [""])[0])
        return reason if reason.startswith(("worktree-unavailable", "infra-rerun:")) else None
    if verdict == "fix-no-change":
        # The provider wrapper died before any agent worked: the head's budget paid for nothing.
        reason = str((receipt.get("reasons") or [""])[0])
        return reason if reason.startswith("lane-crash:") else None
    # `cancelled` keeps its charge: a queued, merged or superseded target is a repair
    # outcome, not host infrastructure spending the budget (the doctor never counts it).
    if verdict == "reconcile-unavailable":
        stage = (receipt.get("cancellation") or {}).get("stage")
        if stage is None or stage in UNWORKED_PRE_AGENT_STAGES:
            return str((receipt.get("cancellation") or {}).get("reason")
                       or (receipt.get("reasons") or [verdict])[0])
    return None


# Infra-class no-work stops requeue with the same capped exponential backoff as recovery
# handoffs: the precondition (an unreadable target, a failed checkout) is host infrastructure,
# not the PR, and an immediate next-tick re-claim would crash-loop the same failure (Gem
# 2026-10-23: 7 target-state-unavailable + 6 worktree-unavailable stops in 24h).
INFRA_PRECONDITION_REASONS = frozenset({"target-state-unavailable", "worktree-unavailable", "lane-crash", "infra-rerun"})


def end_local_fix_attempt(host: Host, pr: dict, receipt: dict) -> None:
    """Release the host-local claim without fabricating an attempt when called directly."""
    handoff = False
    requeued = False
    def finish(attempts: dict) -> None:
        nonlocal handoff, requeued
        attempt = attempts.get(str(pr["number"]))
        if not attempt or attempt.get("sha") != pr.get("headRefOid"):
            return
        attempt.update(endedAt=time.time(), pushed=receipt.get("verdict") == "fix-pushed",
                       repairRunId=receipt.get("runId"), repairBranch=receipt.get("branch"),
                       repairHeadBefore=receipt.get("headBefore"), repairVerdict=receipt.get("verdict"))
        if receipt.get("verdict") == "fix-pushed" and receipt.get("headAfter"):
            attempt["pushedHead"] = receipt["headAfter"]
        if str((receipt.get("reasons") or [""])[0]).startswith(("agent-declined:infra:", "agent-declined:base-red:")) \
                and type(attempt.get("count")) is int:
            # The agent read this head's failure and declined it (infrastructure, or a red main
            # already has). A second attempt on the same head re-read the same evidence and
            # declined again 40 times in 3.5 days; a new head or a moved main is the re-entry.
            attempt["count"] = max(attempt["count"], MAX_FIX_ATTEMPTS)
            attempt["declined"] = {"reason": str(receipt["reasons"][0])[:200], "runId": receipt.get("runId"),
                                   "at": time.time()}
        if (refund := unworked_fix_attempt(receipt)) \
                and type(attempt.get("count")) is int and attempt["count"] > 0:
            attempt["count"] -= 1
            attempt["noWorkRefund"] = {"reason": refund[:120], "runId": receipt.get("runId"),
                                       "at": time.time()}
            receipt["attemptRefunded"] = refund[:120]
            handoff = receipt.get("verdict") == "recovery-handoff"
            requeued = handoff or refund in pr_events.UNRESUMABLE_PRESERVED \
                or refund.split(":", 1)[0] in INFRA_PRECONDITION_REASONS
    update_json(host.state / "fix-attempts.json", finish)
    note_breaker_run(host, pr, receipt)
    if requeued:
        try:
            path = (receipt.get("recovery") or {}).get("worktree") \
                if receipt.get("verdict") == "recovery-handoff" else None
            note_recovery_handoff(host, f"pr:{pr['number']}:{pr['headRefOid']}",
                                  preserved=Path(path) if isinstance(path, str) and path else None)
        except Exception as exc:
            # The durable refund itself supplies the short hold if this best-effort
            # cooldown write fails. Its failure must not discard the terminal receipt.
            receipt["handoffCooldownError"] = type(exc).__name__


# Consecutive unreadable target snapshots the in-run guard tolerates (~90s at its 30s cadence).
AGENT_GUARD_UNREADABLE_LIMIT = 3
# While the agent runs, the 30 s guard re-read the full target (up to 6 GraphQL pages) each
# time: ~120 reads an hour per running fix, the largest single gh cost on Gem (2026-10-12 gh
# ledger). After a good read the mid-run guard keeps local checks every tick and re-reads
# GitHub only this often; an unreadable read retries on the next tick, so a sustained outage
# still stops the run at the same ~90 s. Every boundary around the run stays a fresh read.
AGENT_GUARD_REMOTE_S = 120


class RepairStopped(RuntimeError):
    def __init__(self, reason: str, live: dict | None, stage: str):
        super().__init__(reason)
        self.live, self.stage = live, stage


def remote_fast_forwarded(worktree: Path, before: str, after: str) -> bool:
    """True only when the remote branch head `after` descends from the pre-run head `before`.

    A rebase, squash, reset or force-push replaces history, so `before` is not an ancestor.
    Anything unreadable fails closed: an unproven fast-forward never proceeds to ready/enqueue."""
    try:
        sh(["git", "fetch", "-q", "origin", after], cwd=worktree, timeout=120)
        return sh(["git", "merge-base", "--is-ancestor", before, after], cwd=worktree, timeout=60).returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


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
    if repair and remediation.review_authority_ask(live):
        raise RepairStopped("target-review-requires-authority", live, stage)
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


def note_recovery_handoff(host: Host, identifier: str, now: float | None = None, *,
                          preserved: Path | None = None) -> dict:
    """Count one recovery-handoff and start its capped exponential cooldown."""
    now = time.time() if now is None else now
    noted: dict = {}

    def bump(data: dict) -> None:
        row = data.get(identifier) if isinstance(data.get(identifier), dict) else {}
        count = int(row.get("count") or 0) + 1
        until = now + min(HANDOFF_BACKOFF_S * 2 ** (count - 1), HANDOFF_BACKOFF_CAP_S)
        data[identifier] = {"count": count, "until": until}
        try:
            if preserved is not None and (preserved / disk_guard.PRESERVED_REPAIR).exists():
                data[identifier]["preserved"] = str(preserved)
        except OSError:
            pass  # Unknown context retains the timed hold; it never authorizes cleanup.
        noted.update(count=count, until=until, comment=count in (1, HANDOFF_COMMENT_AT))
    update_json(handoff_cooldown_path(host), bump)
    return noted


def pr_recovery_held(host: Host, pr: dict, now: float | None = None) -> bool:
    return pr_events.pr_recovery_held(host, pr, now)


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
    held |= fleet_ledger.external_held(host.state, now)  # Lola/Hyperagent/Summer hold it: do not duplicate
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


def reap_run_processes(worktree: Path, receipt: dict) -> None:
    """The run is over and owns this checkout: stop what still works in it (a reparented
    `next dev` or esbuild) so cleanup can prove it idle instead of preserving it."""
    if not worktree.exists():
        return
    try:
        reaped = disk_guard.reap_cwd_holders(worktree, run=lambda cmd, **kw: sh(cmd, timeout=kw.get("timeout", 30)))
    except Exception as error:  # cleanup still fails closed through worktree_busy
        receipt["reapError"] = f"{type(error).__name__}: {error}"[:200]
        return
    if reaped:
        receipt["reapedProcesses"] = reaped


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


# A run id names its target: <ts>-PR<n>-... for repairs, <ts>-<TEAM>-<n>-... for issues.
# Cleanup markers stay unbound (recovery binds through the ledger), but an issue run's
# checkout can never hide a PR, so it must not blank every lane's repair demand (2026-10-11).
RUN_TARGET = re.compile(r"-(?:PR(\d+)|([A-Z]+-\d+))-")


def preserve_repair(worktree: Path, receipt: dict) -> None:
    """A cancelled run's local work is evidence, including uncommitted follow-up."""
    if worktree.exists():
        marker = {"schema": "jovie-preserved-repair/v1", "runId": receipt["runId"],
                  "pr": receipt.get("pr"), "issue": receipt.get("issue"),
                  "reason": receipt.get("reasons"), "branch": receipt.get("branch"),
                  "headBefore": receipt.get("headBefore"), "at": now_iso()}
        receipt["preservedWorktree"] = str(worktree)
        try:
            atomic_write_text(worktree / disk_guard.PRESERVED_REPAIR, json.dumps(marker, indent=1))
        except OSError as error:
            receipt["preservationError"] = str(error)[:200]


def retire_completed_repair(host: Host, worktree: Path, receipt: dict) -> bool:
    """Clear a recovery marker only for idle, clean, already-published source."""
    if receipt.get("verdict") not in {"fix-pushed", "fix-no-change"} or not receipt.get("headAfter"):
        return False
    try:
        require_idle_worktree(worktree)
        status = sh(["git", "status", "--porcelain", "--untracked-files=all", *disk_guard.SOURCE_PATHSPEC],
                    cwd=worktree, timeout=30)
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


def note_preserved_recovery(observations, phase, reason, *, marker=None, custody=None) -> None:
    """Safe refusal evidence only; never changes a recovery predicate or grants custody."""
    reasons = {"worktree-not-idle", "source-not-fully-published", "retire-io-unavailable",
               "retire-worktree-retained", "archive-too-fresh", "archive-head-unavailable",
               "archive-index-unavailable", "archive-tree-unavailable", "archive-commit-unavailable",
               "archive-ref-unavailable", "archive-worktree-retained", "archive-io-unavailable"}
    if type(observations) is not list or type(phase) is not str or type(reason) is not str \
            or phase not in {"retire", "archive"} or reason not in reasons:
        return
    row = {"schema": "jovie-preserved-recovery-observation/v1", "phase": phase, "reason": reason,
           "authorizesRecovery": False}
    if custody is not None:
        row["custodyReason"] = custody if type(custody) is str and custody in {
            "git-index-locked", "process-state-unavailable", "process-still-running"} else "unclassified"
    if type(marker) in (str, bytes):
        row["markerPreimageSha256"] = hashlib.sha256(marker.encode() if type(marker) is str else marker).hexdigest()
    try:
        row["observerSourceSha256"] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    except OSError:
        pass  # Missing observer identity is not a successful recovery or a custody release.
    observations.append(row)


def retire_published_preserved(host: Host, number: int, *, observations=None) -> list[str]:
    """Under the PR's repair lock: free this PR's preserved checkouts that hold nothing to recover.

    A cancelled or unreadable-target run preserves its checkout as evidence. Once that
    checkout is idle, has no source change and every commit is on origin, the evidence is
    already published; keeping it only turns each later repair into a recovery handoff
    (preserved-head-superseded / preserved-target-needs-reconciliation). On 2026-10-11 that
    spent 29 repair attempts and the top escalation rung of 3 PRs on no work. Anything
    unpublished, dirty, busy or unreadable stays preserved for the existing recovery path.
    """
    retired = []
    for marker_path in sorted((host.state / "worktrees").glob(f"*/{disk_guard.PRESERVED_REPAIR}")):
        path = marker_path.parent
        try:
            marker_text = marker_path.read_bytes().decode()  # Preserve line endings for the preimage digest.
            marker = json.loads(marker_text)
        except (OSError, ValueError):
            continue
        if not isinstance(marker, dict) or marker.get("issue") is not None:
            continue
        named = RUN_TARGET.search(path.name)
        if marker.get("pr") != number and not (
                marker.get("pr") is None and named and named.group(1) == str(number)):
            continue
        try:
            if busy := worktree_busy(path):
                note_preserved_recovery(observations, "retire", "worktree-not-idle", marker=marker_text, custody=busy)
                continue
            status = sh(["git", "status", "--porcelain", "--untracked-files=all", *disk_guard.SOURCE_PATHSPEC],
                        cwd=path, timeout=30)
            unpushed = sh(["git", "rev-list", "--count", "HEAD", "--not", "--remotes=origin"],
                          cwd=path, timeout=30)
            if status.returncode or status.stdout.strip() or unpushed.returncode or unpushed.stdout.strip() != "0":
                note_preserved_recovery(observations, "retire", "source-not-fully-published", marker=marker_text)
                continue
            marker_path.unlink()
            remove_worktree(host, path)
        except (OSError, subprocess.SubprocessError):
            note_preserved_recovery(observations, "retire", "retire-io-unavailable", marker=marker_text)
            continue
        if not path.exists():
            retired.append(path.name)
        else:
            note_preserved_recovery(observations, "retire", "retire-worktree-retained", marker=marker_text)
    return retired


# A preserved checkout these handoffs name can never resume: its run was cut from an older
# PR head, or it ended in a verdict the recovery path does not resume. On 2026-10-12 Gem
# logged 1,606 recovery-handoff runs for 9 PRs (#20840 alone 694) on such checkouts, so
# those PRs got no repair at all. A fresh handoff still waits for its owner; one nobody
# reconciled within PRESERVED_ARCHIVE_AFTER_S is archived so the PR can be repaired again.
UNRESUMABLE_PRESERVED = pr_events.UNRESUMABLE_PRESERVED
PRESERVED_ARCHIVE_REF = "refs/jovie-preserved/"
PRESERVED_ARCHIVE_AFTER_S = 6 * 3600
# Verdicts that stop a run before it finishes; its checkout may be resumed or reconciled.
INTERRUPTED_VERDICTS = frozenset({"cancelled", "revoked", "reconcile-unavailable", "disk-held", "recovery-handoff"})


def _ended_on_its_own_terms(host: Host, run_id) -> bool:
    """The preserved run finished (e.g. fix-no-change), was revoked, or was cancelled because
    its PR moved on (NEVER_RESUMED_CANCELS) instead of being interrupted for later resume: nobody
    will ever reconcile it, so waiting PRESERVED_ARCHIVE_AFTER_S only blocks the PR.
    2026-10-20 on Gem: 72 preserved-target-needs-reconciliation handoffs in 24h, mostly
    fix-no-change runs that left regenerated artifacts behind (PR #22420: screenshot PNGs)."""
    if not run_id:
        return False
    try:
        lines = (host.state / "runs/ledger.jsonl").read_text().splitlines()
    except OSError:
        return False
    for line in reversed(lines):
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if isinstance(row, dict) and row.get("runId") == run_id:
            if not row.get("endedAt"):
                return False
            verdict = row.get("verdict")
            if verdict == "revoked":
                return True  # its branch can never publish again
            if verdict == "cancelled" and set(row.get("reasons") or []) & NEVER_RESUMED_CANCELS:
                return True
            return verdict not in INTERRUPTED_VERDICTS
    return False


# A cancel for one of these reasons can never be resumed: the PR moved on (a new head, merged
# or closed). 2026-10-21 on Gem, after #22430: most remaining 1-8/h
# preserved-target-needs-reconciliation handoffs were target-head-superseded, waiting 6h for
# nobody. target-pr-queued is NOT here: the head is unchanged and the work may resume if the
# queue rejects the PR.
NEVER_RESUMED_CANCELS = frozenset({"target-head-superseded", "target-pr-merged", "target-pr-closed"})


def archive_unresumable_preserved(host: Host, path: Path, reason: str, *, observations=None) -> str | None:
    """Keep an unresumable preserved checkout's source as a local ref, then free the PR.

    The archive commit is the checkout's HEAD plus every uncommitted source file (a temporary
    index, so the checkout's own index and the shared stash are untouched), stored at
    refs/jovie-preserved/<run>. Returns the ref, or None when anything is unproven: then the
    checkout stays preserved and the handoff stands."""
    root = (host.state / "worktrees").resolve()
    marker_path = path / disk_guard.PRESERVED_REPAIR
    if reason not in UNRESUMABLE_PRESERVED or path.resolve().parent != root or not marker_path.exists():
        return None
    marker = None
    try:
        marker = marker_path.read_bytes().decode()  # Digest and restore the exact marker bytes.
        try:
            stamp = datetime.fromisoformat(str(json.loads(marker).get("at")).replace("Z", "+00:00")).timestamp()
        except (ValueError, TypeError, AttributeError):
            stamp = marker_path.stat().st_mtime
        try:
            run_id = json.loads(marker).get("runId")
        except (ValueError, AttributeError):
            run_id = None
        grace = (0 if reason == "preserved-target-needs-reconciliation" and _ended_on_its_own_terms(host, run_id)
                 else PRESERVED_ARCHIVE_AFTER_S)
        if time.time() - stamp < grace:
            note_preserved_recovery(observations, "archive", "archive-too-fresh", marker=marker)
            return None
        if busy := worktree_busy(path):
            note_preserved_recovery(observations, "archive", "worktree-not-idle", marker=marker, custody=busy)
            return None
        head = sh(["git", "rev-parse", "--verify", "HEAD^{commit}"], cwd=path, timeout=30)
        if head.returncode:
            note_preserved_recovery(observations, "archive", "archive-head-unavailable", marker=marker)
            return None
        with tempfile.TemporaryDirectory(dir=host.state) as scratch:
            env = {**os.environ, "GIT_INDEX_FILE": str(Path(scratch) / "index")}
            for args in (["git", "read-tree", "HEAD"], ["git", "add", "-A", *disk_guard.SOURCE_PATHSPEC]):
                if sh(args, cwd=path, env=env, timeout=300).returncode:
                    note_preserved_recovery(observations, "archive", "archive-index-unavailable", marker=marker)
                    return None
            tree = sh(["git", "write-tree"], cwd=path, env=env, timeout=60)
        if tree.returncode or not tree.stdout.strip():
            note_preserved_recovery(observations, "archive", "archive-tree-unavailable", marker=marker)
            return None
        commit = sh(["git", "commit-tree", tree.stdout.strip(), "-p", head.stdout.strip(),
                     "-m", f"lanes: archive preserved repair {path.name} ({reason})"], cwd=path, timeout=60)
        ref = PRESERVED_ARCHIVE_REF + path.name
        if commit.returncode or not commit.stdout.strip():
            note_preserved_recovery(observations, "archive", "archive-commit-unavailable", marker=marker)
            return None
        if sh(["git", "update-ref", ref, commit.stdout.strip()], cwd=path, timeout=30).returncode:
            note_preserved_recovery(observations, "archive", "archive-ref-unavailable", marker=marker)
            return None
        marker_path.unlink()
        sh(["git", "worktree", "remove", "--force", str(path)], cwd=host.repo, timeout=600)
        if path.exists():
            marker_path.write_bytes(marker.encode())  # Not removed: keep it protected; the ref also holds it.
            note_preserved_recovery(observations, "archive", "archive-worktree-retained", marker=marker)
            return None
    except (OSError, subprocess.SubprocessError):
        note_preserved_recovery(observations, "archive", "archive-io-unavailable", marker=marker)
        return None
    return ref


def fix_red_pr(host: Host, name: str, spec: dict, pr: dict) -> dict:
    lock = Locked(host.state / "locks" / f"repair-pr-{pr['number']}.lock", blocking=False)
    opened: dict = {}
    try:
        return _fix_red_pr(host, name, spec, pr, branch_held=lock.held, opened=opened)
    except BaseException as error:
        end_abandoned_attempt(host, opened, error)
        raise
    finally:
        lock.release()


def end_abandoned_attempt(host: Host, opened: dict, error: BaseException) -> dict | None:
    """A repair that crashes after its claim still ends its fenced attempt.

    Without this, its jovie-execution/* status on the PR head stayed pending until the
    lease expired and a later claim of the same identity reconciled it, which may never
    happen. Best effort: a failed write leaves the lease-expiry sweep as the backstop.
    """
    if not opened:
        return None
    try:
        return execution_attempt.finish(
            host.state / "runs" / "execution-attempts.jsonl", opened["ident"], opened["fence"], "failed_unknown",
            {"failureClass": "harness_crash", "failureFingerprint": execution_attempt.digest([type(error).__name__]),
             "evidenceDigest": execution_attempt.digest(f"{type(error).__name__}:{error}"[:300]),
             "costs": {}, "dependencies": []}, coordination=opened["coordination"])
    except Exception:
        return None
    finally:
        opened.clear()


def _fix_red_pr(host: Host, name: str, spec: dict, pr: dict, *, branch_held=True, opened: dict | None = None) -> dict:
    opened = {} if opened is None else opened
    run_id = f"{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-PR{pr['number']}-{name}-fix-{uuid.uuid4().hex[:6]}"
    runs = host.state / "runs"
    runs.mkdir(parents=True, exist_ok=True)
    worktree = host.state / "worktrees" / run_id
    provider_evidence = runs / f"{run_id}.provider.jsonl"
    receipt = {"schema": "jovie-lane-run/v1", "runId": run_id, "repository": REPO_SLUG,
               "executionHost": HOST, "initiator": "symphony", "provider": name, "kind": "fix-red",
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
                "stage": error.stage,
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
    infra = infra_only_red(host, pr) if branch_held else None
    if infra and claim_infra_rerun(host, pr) and _rerun_failed(pr):
        receipt.update(verdict="skipped", reasons=[f"infra-rerun:{infra}"], endedAt=now_iso(),
                       result={"verdict": "skipped", "commit": None, "pr": pr["number"]})
        end_local_fix_attempt(host, pr, receipt)
        with open(runs / "ledger.jsonl", "a") as ledger:
            ledger.write(json.dumps(receipt) + "\n")
        return receipt
    route = route_fix_red(host, pr) if branch_held else None
    if route:
        receipt["failureFingerprint"] = {key: route[key] for key in ("cls", "key", "action", "signature")}
        reason = deterministic_route_taken(host, pr, route)
        if not reason and fingerprint_breaker_open(host, pr, route["key"]):
            reason = f"infra-rerun:breaker-{route['cls']}"
            note_fingerprint_trip(host, pr, route, receipt)
        if reason:
            receipt.update(verdict="skipped", reasons=[reason], endedAt=now_iso(),
                           result={"verdict": "skipped", "commit": None, "pr": pr["number"]})
            end_local_fix_attempt(host, pr, receipt)
            with open(runs / "ledger.jsonl", "a") as ledger:
                ledger.write(json.dumps(receipt) + "\n")
            return receipt
    failure = {"checks": [(check.get("name"), check.get("conclusion")) for check in pr.get("statusCheckRollup") or []],
               "merge": pr.get("mergeStateStatus"), "review": pr.get("reviewDecision")}
    ident = execution_attempt.identity("pr-remediation",
                                       {"repository": REPO_SLUG, "pr": pr["number"], "failure": failure},
                                       {"headSha": pr["headRefOid"]})
    coordination = execution_coordination(pr["headRefOid"])
    preserved = None
    preserved_observations = []
    try:
        if not branch_held:
            raise RecoveryHandoff("repair-owner-active", worktree)
        if retired := retire_published_preserved(host, pr["number"], observations=preserved_observations):
            receipt["retiredPreserved"] = retired
        for archive_pass in (True, False):
            try:
                preserved = preserved_run(host, pr=pr["number"])
                if preserved:
                    ident = qualify_preserved_pr(host, pr, preserved)
                break
            except RecoveryHandoff as error:
                archived = archive_pass and archive_unresumable_preserved(
                    host, Path(error.evidence["worktree"]), str(error), observations=preserved_observations)
                if not archived:
                    raise
                receipt.setdefault("archivedPreserved", []).append(archived)
                preserved = None
    except RecoveryHandoff as error:
        receipt.update(verdict="recovery-handoff", reasons=[str(error)], recovery=error.evidence,
                       endedAt=now_iso(), result={"verdict": "recovery-handoff", "pr": pr["number"], "commit": None})
        if preserved_observations:
            receipt["preservedRecoveryObservations"] = preserved_observations
        if branch_held:
            end_local_fix_attempt(host, pr, receipt)
        with open(runs / "ledger.jsonl", "a") as ledger:
            ledger.write(json.dumps(receipt) + "\n")
        return receipt
    if preserved_observations:
        receipt["preservedRecoveryObservations"] = preserved_observations
    try:
        claimed = execution_attempt.claim(runs / "execution-attempts.jsonl", ident,
                                          {"owner": HOST, "runtime": "symphony-lanes", "provider": name,
                                           "model": spec.get("model"), "tool": "fix_red_pr", "accountPool": name},
                                          {"attempts": MAX_FIX_ATTEMPTS, "concurrency": 1, "wallSeconds": host.agent_timeout * MAX_FIX_ATTEMPTS,
                                           "spend": MAX_FIX_ATTEMPTS,
                                           "mutations": max(MAX_FIX_ATTEMPTS * 2, len(conflict_resolvers()) + 1),
                                           "leaseSeconds": host.agent_timeout + 900, "version": "lanes-v1"},
                                          {"triggerId": run_id, "correlationId": f"pr-{pr['number']}",
                                           "causationId": pr["headRefOid"]}, coordination=coordination)
    except Exception as error:
        # Same contract as run_issue (JOV-7191): a claim failure must leave a ledger
        # receipt instead of a worker exit the doctor can only see as spawn-exit.
        receipt.update(verdict="failed", reasons=[f"claim-error:{type(error).__name__}:{error}"[:300]])
    else:
        receipt["execution"] = claimed
        if claimed["admitted"]:
            opened.update(ident=ident, fence=claimed["fencingToken"], coordination=coordination)
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
            unreadable = [0]  # consecutive unavailable reads while the agent runs
            last_read = [None]  # monotonic time of the last good mid-run read

            def verify_target(target, stage, *, worktree=None):
                if (stage == "agent-running" and last_read[0] is not None
                        and time.monotonic() - last_read[0] < AGENT_GUARD_REMOTE_S):
                    require_publishable(host, pr["headRefName"], stage)
                    return None
                receipt["targetStateReads"] += 1
                try:
                    live = require_fix_target(target, stage, worktree=worktree, repair=True)
                except RepairStopped as error:
                    # Mid-run, one unreadable snapshot (a check finishing between pages, a
                    # 502) is not evidence the target changed; it stopped 20 runs in 48h.
                    # Positive evidence still stops at once, every boundary around the run
                    # stays a strict single read, and a sustained outage still stops it.
                    if stage != "agent-running" or error.live is not None:
                        raise
                    unreadable[0] += 1
                    receipt["targetUnreadableMidRun"] = receipt.get("targetUnreadableMidRun", 0) + 1
                    if unreadable[0] >= AGENT_GUARD_UNREADABLE_LIMIT:
                        raise
                    require_publishable(host, pr["headRefName"], stage)
                    return None
                unreadable[0] = 0
                last_read[0] = time.monotonic()
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
            resolved_name = None
            if pr.get("mergeStateStatus") == "DIRTY":
                for boundary_id, resolver, resolution in conflict_resolvers():
                    execution_attempt.boundary(runs / "execution-attempts.jsonl", ident, claimed["fencingToken"],
                                               {"spend": 0, "mutations": 1}, coordination=coordination, boundary_id=boundary_id)
                    if resolver(worktree, pr["headRefName"], log, guard=boundary):
                        resolved_name = resolution
                        break
            agent = None
            if resolved_name:
                receipt.update(resolution=resolved_name)
            else:
                boundary("before-install")
                install_dependencies(host, worktree, log)
                excerpt = failure_excerpt(pr)
                try:
                    pr_events.ensure_red_before_green(pr, excerpt)
                except (OSError, subprocess.SubprocessError, ValueError):
                    pass  # evidence is best effort; the repair itself must still run
                prompt = render_fix_prompt(pr, excerpt)
                prompt += "\n\n" + "\n".join(machine_gate(host, f"PR{pr['number']}", "", (), excerpt, name,
                                                           fp=machine_gap.check_fingerprint(pr), receipt=receipt))
                if preserved:
                    prompt = ("Resume the preserved repair in this checkout. Inspect git status, diff and local commits; "
                              "retain existing edits and finish verification/publication. Never reset or start over.\n\n" + prompt)
                prompt_file = runs / f"{run_id}.prompt.md"
                receipt["contextManifests"] = [write_agent_prompt(
                    prompt_file, prompt, "fix", name,
                    {"pr": json.dumps(pr, sort_keys=True), "rendered_context": prompt})]
                boundary("before-agent")
                execution_attempt.boundary(runs / "execution-attempts.jsonl", ident, claimed["fencingToken"],
                                           {"spend": 1, "mutations": 1}, coordination=coordination, boundary_id="repair-dispatch")
                fixer = {fix_red_classes.WIRE_CI_FAST: wire_ci_fast_fix,
                         fix_red_classes.ATOMIC_WRITE: atomic_state_fix,
                         fix_red_classes.RENUMBER: renumber_migrations_fix,
                         fix_red_classes.SNAP_SPACING: snap_spacing_fix,
                         fix_red_classes.MERGE_NARROWED: merge_narrowed_preflight_fix,
                         fix_red_classes.REGISTER_DOMAIN: register_domain_writes_fix}.get((route or {}).get("action"))
                agent = fixer(host, pr, route, worktree, log, receipt) if fixer else None
                agent = agent or run_agent(template(spec["cmd"], {"prompt": prompt, "prompt_file": str(prompt_file),
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
            rewritten = pushed and not remote_fast_forwarded(worktree, pr["headRefOid"], after)
            if rewritten:
                # Never rebase, squash, reset or force-push a PR branch. A non-fast-forward head
                # is not a fix: no ready, no enqueue, no adoption of this head.
                pushed = False
                receipt.update(agentExit=agent.returncode if agent else None, headAfter=after,
                               verdict="history-rewrite-detected",
                               reasons=[f"history-rewrite-detected: {after[:12]} does not descend from "
                                        f"{pr['headRefOid'][:12]}"],
                               alert={"kind": "history-rewrite-detected", "pr": pr["number"],
                                      "before": pr["headRefOid"], "after": after})
                try:
                    receipt["containment"] = contain_history_rewrite(host, pr, after)
                except Exception as error:  # the receipt above still stands; never lose it
                    receipt["containment"] = {"error": f"{type(error).__name__}: {error}"[:200]}
            if pushed and not repair_created_head(worktree, after):
                raise RepairStopped("target-head-superseded", {**pr, "state": "OPEN", "headRefOid": after},
                                    "after-remote-read")
            if not rewritten:
                receipt.update(agentExit=agent.returncode if agent else None, headAfter=after,
                               verdict="fix-pushed" if pushed else "fix-no-change")
                if not pushed and agent is not None:
                    log.flush()
                    receipt["reasons"] = classify_unpushed_repair(
                        agent.returncode, (runs / f"{run_id}.log").read_text(errors="replace")[-20000:])
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
                if pr.get("liftHold"):
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
            elif receipt.get("verdict") in INTERRUPTED_VERDICTS:
                preserve_repair(worktree, receipt)
            else:
                reap_run_processes(worktree, receipt)
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
    opened.clear()
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
    receipt = {"schema": "jovie-lane-run/v1", "runId": run_id, "repository": REPO_SLUG,
               "executionHost": HOST, "initiator": "symphony", "provider": name, "kind": "adopt",
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
            reap_run_processes(worktree, receipt)
            remove_worktree(host, worktree)
    receipt["endedAt"] = now_iso()
    receipt["result"] = {"verdict": receipt.get("verdict"), "commit": receipt.get("headSha"),
                         "pr": receipt.get("pr")}
    with open(runs / "ledger.jsonl", "a") as ledger:
        ledger.write(json.dumps(receipt) + "\n")
    return receipt


def lane_prs(name: str, providers: dict | None = None, fields: str = "", *, inventory: list[dict] | None = None) -> list[dict]:
    """This lane's open PRs (its recognized run branches), plus the orphaned PRs of disabled lanes:
    nobody else will fix or gate those, and any enabled lane can."""
    if fields and inventory is not None:
        raise ValueError("supplied-inventory-fields")
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
            candidates = inventory if inventory is not None else open_prs_summary()
        prs += [pr for pr in candidates if (owned := LANE_BRANCH.match(pr["headRefName"]))
                and owned.group("lane") == owner]
    return prs


PR_FIELDS = "number,title,url,isDraft,headRefName,headRefOid,statusCheckRollup,mergeStateStatus,reviewDecision,isCrossRepository,labels"
# Every lane PR without check rollups: rollups over ~90 PRs time out (HTTP 504), so the full
# field set stays at gh's default page of 30 and the budget/sweep read this light set.
LIGHT_PR_FIELDS = "number,url,state,isDraft,headRefName,headRefOid,mergeStateStatus,labels"


def repo_prs(*, inventory: list[dict] | None = None) -> list[dict]:
    """Every open, non-draft PR whose branch lives in this repo (forks cannot be pushed to).
    Tim: no open PR should ever need his action; the fix loop owns them all."""
    ready = [pr for pr in (inventory if inventory is not None else open_prs_summary()) if not pr.get("isDraft") and not pr.get("isCrossRepository")]
    # No top-N window: an old red PR outside the 60 most recently updated was never repaired.
    return sorted(ready, key=lambda pr: pr.get("updatedAt") or "", reverse=True)


_SUMMARY: dict = {"at": 0.0, "prs": [], "readable": False}
SUMMARY_TTL_S = 60
# A demand census reads rows the shared cache served (up to one TTL old), held in this
# process's summary (another TTL), then scanned. Requiring one TTL made a cache hit near
# expiry publish "unknown" for codex with 45 candidates (Gem 2026-10-11).
MAINTENANCE_DEMAND_MAX_AGE_S = 3 * SUMMARY_TTL_S
# One claim scan per minute for every idle worker on the host. The 500-issue Linear
# pagination runs only as this cache's fill, never as an uncached read.
CLAIM_SCAN_TTL_S = 60
# Size ceiling for the open-PR inventory cache read that certifies repair provenance only.
# The inventory carries every open PR with body and files, about 10 KB per PR (1.6 MB for 154
# PRs on 2026-10-24), so 16 MiB covers more than 1,000 open PRs. The generic 1 MiB default of
# maintenance_json made a healthy backlog read as unknown and idled every repair worker.
REPAIR_INVENTORY_MAX_BYTES = 16 * 1024 * 1024
SHARED_CACHE_DIR = Path(os.environ.get("LANES_STATE", Path.home() / ".local/state/jovie-lanes")) / "cache"


def _cache_token(value: str) -> str:
    if re.fullmatch(r"[A-Za-z0-9_-]{1,64}", value or ""):
        return value
    return hashlib.sha256(value.encode()).hexdigest()[:20]


def shared(key: str, ttl: float, fetch, *, validate=None):
    """One GitHub read per `ttl` for every worker on the host. Workers are short-lived processes
    (re-exec after each unit, respawned every dispatch tick), so an in-process cache never
    hits; 7 workers re-listing every open PR spent the bot's whole 5000-point GraphQL hour
    (2026-09-28). A failed read (None) is never cached. Off in tests."""
    if os.environ.get("LANES_EXECUTION_BACKEND") == "local-test":
        value = fetch()
        return value if value is None or validate is None or validate(value) else None
    path = SHARED_CACHE_DIR / f"{key}.json"
    SHARED_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    # Independent idle workers can miss the same expired cache simultaneously.
    # Serialize the fill, then re-read under the lock; shared storage alone did
    # not prevent duplicate GraphQL censuses consuming the installation budget.
    with open(path.with_suffix('.lock'), 'a+') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            cached = json.loads(path.read_text())
            if 0 <= time.time() - cached["at"] < ttl and (validate is None or validate(cached["value"])):
                return cached["value"]
        except (OSError, ValueError, KeyError, TypeError):
            pass
        value = fetch()
        if value is not None and validate is not None and not validate(value):
            return None
        if value is not None:
            tmp = path.with_suffix(f".{os.getpid()}.tmp")
            tmp.write_text(json.dumps({"at": time.time(), "value": value}))
            os.replace(tmp, path)
        return value


def _inventory_unreadable(path, error) -> dict:
    """Why the inventory cache could not certify provenance. Oversize is distinguishable from
    stale or corrupt so a growing backlog is not mistaken for a missing census."""
    if isinstance(error, ValueError) and str(error) in ("maintenance-state-not-bounded-regular-file",
                                                         "maintenance-state-too-large"):
        try:
            info = os.lstat(path)
        except OSError:
            return {"sourceAtReason": "inventory-unreadable"}
        if stat.S_ISREG(info.st_mode) and info.st_size > REPAIR_INVENTORY_MAX_BYTES:
            return {"sourceAtReason": "inventory-oversize", "sourceAtBytes": info.st_size}
    return {"sourceAtReason": "inventory-unreadable"}


def open_prs_summary(*, capture: list[dict] | None = None, refresh: bool = False) -> list[dict]:
    """Every open PR with its aggregate check state, in a few cheap GraphQL pages, cached for a
    minute. Per-check rollups over dozens of PRs 504 or trip GitHub's secondary rate limit
    (2026-09-27: devin had 43 red PRs and saw none of them, so it idled over budget). The
    aggregate state stands in as one synthetic check; `with_checks` loads the real ones for
    the single PR a worker claims. Empty when GitHub cannot be read."""
    now = time.time()
    if not refresh and now - _SUMMARY["at"] < SUMMARY_TTL_S:
        if capture is not None:
            capture.append(copy.deepcopy(_SUMMARY))
        return _SUMMARY["prs"]
    prs = shared("open-prs-labels-v2", SUMMARY_TTL_S, lambda: pr_events.open_prs_state(THIS))
    if prs is None:
        _SUMMARY["readable"] = False
        if capture is not None:
            capture.append({"at": now, "sourceAt": None, "prs": [], "readable": False})
        return []
    source_at = now
    source_why: dict = {}
    if os.environ.get("LANES_EXECUTION_BACKEND") != "local-test":
        inventory_path = SHARED_CACHE_DIR / "open-prs-labels-v2.json"
        try:
            cached = maintenance_json(inventory_path, limit=REPAIR_INVENTORY_MAX_BYTES)
            # shared() releases its lock before returning. A later cache refill
            # can certify these rows only if the exact returned value still agrees.
            source_at = cached["at"] if cached["value"] == prs else None
            if source_at is None:
                source_why = {"sourceAtReason": "inventory-mismatch"}
        except (OSError, ValueError, KeyError, TypeError) as error:
            source_at = None
            source_why = _inventory_unreadable(inventory_path, error)
    for pr in prs:
        rollup = pr.get("rollup")
        pr["statusCheckRollup"] = [] if rollup is None else [{
            "name": "rollup", "synthetic": True,
            "status": "COMPLETED" if rollup in ("SUCCESS", "FAILURE", "ERROR") else "PENDING",
            "conclusion": {"SUCCESS": "SUCCESS", "FAILURE": "FAILURE", "ERROR": "FAILURE"}.get(rollup)}]
    record = dict(at=now, sourceAt=source_at, prs=prs, readable=True, **source_why)
    _SUMMARY.pop("sourceAtReason", None)
    _SUMMARY.pop("sourceAtBytes", None)
    _SUMMARY.update(record)
    if capture is not None:
        capture.append(copy.deepcopy(record))
    return prs


class RepairInventoryHold(Exception):
    """The initial repair census cannot qualify this pass; exit after releasing claim.lock."""


def capture_repair_inventory(name: str, *, refresh: bool = False) -> dict:
    """Copy one summary invocation's rows and provenance outside global claim.lock."""
    identity = {"repository": REPO_SLUG, "provider": name,
                "cacheKey": "open-prs-labels-v2", "cacheRoot": str(SHARED_CACHE_DIR)}
    paired = []
    try:
        returned = copy.deepcopy(open_prs_summary(capture=paired, **({"refresh": True} if refresh else {})))
        summary = paired[0] if len(paired) == 1 else {}
        same = isinstance(returned, list) and isinstance(summary, dict) and returned == summary.get("prs")
    except (OSError, ValueError, TypeError, KeyError, AttributeError, subprocess.SubprocessError):
        returned, summary, same = [], {"sourceAt": None, "readable": False, "prs": []}, False
    return {**identity, "summary": summary, "prs": returned, "sameCallRows": same}


def repair_inventory_valid(receipt: dict, name: str) -> bool:
    """The initial repair selection uses this copied pair, never later global metadata."""
    if not isinstance(receipt, dict) or not isinstance(receipt.get("summary"), dict):
        return False
    summary = receipt["summary"]
    stamp = summary.get("sourceAt")
    return (receipt.get("repository") == REPO_SLUG and receipt.get("provider") == name
            and receipt.get("cacheKey") == "open-prs-labels-v2"
            and receipt.get("cacheRoot") == str(SHARED_CACHE_DIR)
            and receipt.get("sameCallRows") is True and isinstance(receipt.get("prs"), list)
            and receipt["prs"] == summary.get("prs") and summary.get("readable") is True
            and all(isinstance(pr, dict) and pr.get("labelsComplete") is True for pr in receipt["prs"])
            and type(stamp) in (int, float) and math.isfinite(stamp)
            and 0 <= time.time() - stamp < CLAIM_SCAN_TTL_S)


def repair_inventory_cause(receipt: dict, name: str, now: float | None = None) -> str | None:
    """The first reason `repair_inventory_valid` rejects a receipt, or None when it is valid.

    Idle exits used to record one generic `repair-inventory-unknown-or-stale` for every one of
    these, so a throughput stall could not be attributed (2026-10-24: oversize looked like stale)."""
    if not isinstance(receipt, dict) or not isinstance(receipt.get("summary"), dict):
        return "receipt-missing"
    summary = receipt["summary"]
    now = time.time() if now is None else now
    stamp = summary.get("sourceAt")
    if receipt.get("repository") != REPO_SLUG:
        return "wrong-repository"
    if receipt.get("provider") != name:
        return "wrong-provider"
    if receipt.get("cacheKey") != "open-prs-labels-v2":
        return "wrong-cache-key"
    if receipt.get("cacheRoot") != str(SHARED_CACHE_DIR):
        return "wrong-cache-root"
    if receipt.get("sameCallRows") is not True or not isinstance(receipt.get("prs"), list):
        return "rows-not-same-call"
    if receipt["prs"] != summary.get("prs"):
        return "rows-diverged"
    if summary.get("readable") is not True:
        return "github-unreadable"
    if not all(isinstance(pr, dict) and pr.get("labelsComplete") is True for pr in receipt["prs"]):
        return "labels-incomplete"
    if type(stamp) not in (int, float) or not math.isfinite(stamp):
        reason = summary.get("sourceAtReason")
        return str(reason) if isinstance(reason, str) and reason else "source-unstamped"
    if now - stamp < 0:
        return "source-clock-skew"
    if now - stamp >= CLAIM_SCAN_TTL_S:
        return "source-stale"
    return None


def lock_repair_inventory(host: Host, name: str, receipt: dict) -> tuple[Locked, dict]:
    """Fence a copied census after optional preflight, then after one lock wait.

    Only age can request another ordinary census outside claim.lock. A refresh
    supplies its own rows and provenance; unreadable/mismatched receipts still
    fail closed. Bound retries so contention cannot spin or repeat admission.
    """
    if repair_inventory_cause(receipt, name) == "source-stale":
        receipt = capture_repair_inventory(name, refresh=True)
    claim = Locked(host.state / "claim.lock", blocking=True)
    if repair_inventory_cause(receipt, name) == "source-stale":
        claim.release()
        receipt = capture_repair_inventory(name, refresh=True)
        claim = Locked(host.state / "claim.lock", blocking=True)
    return claim, receipt


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
    # Owned work without a PR comes from the local mirror and claim ledger, never a live
    # Linear read, so a Linear outage cannot hold file-overlap admission.
    try:
        active = linear_sync.active(host.state, "JOV")
    except Exception:
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


def reclaimable_drafts(*, inventory: list[dict] | None = None) -> list[dict]:
    """Abandoned drafts the lanes reclaim (Tim, 2026-10-10/11): any same-repo non-lane draft
    past the age floor with no commit for 48h, red or conflicting, and not held."""
    now = time.time()
    return [pr for pr in (inventory if inventory is not None else open_prs_summary()) if not pr.get("isCrossRepository")
            and pr_events.abandoned_agent_draft(pr, now)
            and not {label["name"].lower() for label in pr.get("labels", [])} & pr_events.HOLD_LABELS]


def fix_candidates(name: str, *, inventory: list[dict] | None = None) -> list[dict]:
    """Lane PRs (all lanes), every other open non-draft PR and reclaimed abandoned drafts,
    de-duplicated by number.

    Default callers share one cached read per minute; supplied rows project without a refill."""
    def fetch():
        seen, merged = set(), []
        for pr in (lane_prs(name) + repo_prs() + reclaimable_drafts() if inventory is None else
                   lane_prs(name, inventory=inventory) + repo_prs(inventory=inventory)
                   + reclaimable_drafts(inventory=inventory)):
            if pr["number"] not in seen:
                seen.add(pr["number"])
                merged.append(pr)
        return merged
    return fetch() if inventory is not None else shared(f"claim-fix-candidates-{_cache_token(name)}", CLAIM_SCAN_TTL_S, fetch) or []


ISSUE_MARKER = re.compile(r"linear-issue-id:\s*(JOV-\d+)", re.IGNORECASE)


def org_merged_prs(identifier: str) -> list[dict] | None:
    """Merged PRs in the org that mention the issue (title/body checked by the caller)."""
    owner = REPO_SLUG.split("/", 1)[0]
    found = sh(["gh", "search", "prs", identifier, "--owner", owner, "--merged",
                "--json", "repository,number,title,body", "--limit", "20"], timeout=60)
    try:
        rows = json.loads(found.stdout) if found.returncode == 0 else None
    except ValueError:
        return None
    if not isinstance(rows, list):
        return None
    return [{"repository": (row.get("repository") or {}).get("nameWithOwner"), "number": row.get("number"),
             "title": row.get("title"), "body": row.get("body")} for row in rows if isinstance(row, dict)]


def in_flight_issues() -> frozenset[str] | None:
    """Issues that already have an open PR (lane branch, canonical reference or legacy marker)
    from any lane, host, or agent. GitHub is the shared truth. None when GitHub cannot be read: an
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
        keys |= ownership.referenced(pr.get("body") or "")
    return frozenset(keys)


def open_hotspot_holds() -> dict[str, int]:
    """hotspot_holds over every open PR's changed files. Unreadable GitHub admits without
    hotspot gating ({}): this orders contended work, the in-flight read guards duplicates."""
    def fetch():
        listed = sh(["gh", "pr", "list", "--repo", REPO_SLUG, "--state", "open", "--limit", "200",
                     "--json", "number,labels,files,isDraft,updatedAt"])
        return json.loads(listed.stdout or "[]") if listed.returncode == 0 else None
    prs = shared("hotspot-files-v2", CLAIM_SCAN_TTL_S, fetch)
    return hotspot_holds(prs, leased=repair_leased) if prs is not None else {}


def is_green(pr: dict) -> bool:
    return not pr.get("isDraft") and pr.get("mergeStateStatus") in ("CLEAN", "HAS_HOOKS")


def pr_is_terminal(pr: dict) -> bool:
    """Held or repair-exhausted: only a human (or another lane's adopt) can move it."""
    labels = {label.lower() for label in pr_events.label_names(pr)}
    return bool(labels & (pr_events.HOLD_LABELS | {pr_events.PREFIX + pr_events.EXHAUSTED,
                                                   pr_events.PREFIX + "escalating"}))


def new_issue_budget(name: str, slots: int, inventory: list[dict] | None = None) -> dict:
    """A lane's new-issue admission. Tim 2026-10-12: no PR-count ceilings (the JOV-6833
    `slots x 2` active and JOV-7514 `slots x 4` terminal caps are gone); only real limits
    (compute, credits, quotas) bound a lane, and those live in autoscale. Repair of existing
    PRs never consulted this. `inventory` is reported for visibility only."""
    if slots <= 0:
        return {"allowed": False, "reason": "provider-disabled", "used": 0, "cap": None, "terminal": 0, "terminalCap": None}
    dated = re.compile(rf"^{re.escape(name)}/jov-\d+-\d{{8}}")
    own = [pr for pr in inventory or [] if dated.match(pr.get("headRefName") or "")]
    return {"allowed": True, "reason": "within-budget",
            "used": None if inventory is None else sum(not is_green(pr) and not pr_is_terminal(pr) for pr in own),
            "cap": None, "terminal": None if inventory is None else sum(pr_is_terminal(pr) for pr in own), "terminalCap": None}


def read_new_issue_budget(name: str, slots: int) -> dict:
    """No GitHub read: with no PR ceiling there is nothing to count before claiming."""
    return {**new_issue_budget(name, slots), "observedAt": now_iso(), "error": None}


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
    atomic_write_text(marker, json.dumps({"at": now}))
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


EXECUTION_STATUS_SWEEP_S = 900  # host-wide cadence of the stale jovie-execution/* sweep
EXECUTION_STATUS_RECHECK_S = 3600  # one head is re-read at most hourly
EXECUTION_STATUS_HEADS = 8  # bounded status reads per sweep (bot token, one paginated GET each)


def sweep_execution_statuses(host: Host, prs: list[dict] | None = None, now: float | None = None) -> list[dict]:
    """End stale jovie-execution/* statuses on open PR heads so they stop reading UNSTABLE.

    Candidates come from the cached open-PR inventory (no new listing): heads whose rollup is
    not green, pending first, each re-read at most hourly. execution_attempt decides staleness
    from the receipts themselves; a live lease is never touched."""
    now = time.time() if now is None else now
    if execution_coordination("0" * 40).get("kind") != "github-status":
        return []  # Self-test and local-test backends publish no commit statuses.
    marker = host.state / "execution-status-sweep.json"
    try:
        seen = json.loads(marker.read_text())
    except (OSError, ValueError):
        seen = {}
    if not isinstance(seen, dict) or not isinstance(seen.get("heads"), dict):
        seen = {"heads": {}}
    if now - (seen.get("at") or 0) < EXECUTION_STATUS_SWEEP_S:
        return []
    prs = open_prs_summary() if prs is None else prs
    open_heads = {pr.get("headRefOid") for pr in prs}
    heads = {sha: at for sha, at in seen["heads"].items() if sha in open_heads}
    candidates = sorted(
        (pr for pr in prs if re.fullmatch(r"[0-9a-f]{40}", pr.get("headRefOid") or "")
         and pr.get("rollup") not in (None, "SUCCESS") and not pr.get("isCrossRepository")
         and now - heads.get(pr["headRefOid"], 0) >= EXECUTION_STATUS_RECHECK_S),
        key=lambda pr: (pr.get("rollup") not in ("PENDING", "EXPECTED"), heads.get(pr["headRefOid"], 0), pr["number"]))
    results = []
    for pr in candidates[:EXECUTION_STATUS_HEADS]:
        coordination = execution_coordination(pr["headRefOid"])
        heads[pr["headRefOid"]] = now
        try:
            outcomes = execution_attempt.finalize_stale_statuses(
                host.state / "runs" / "execution-attempts.jsonl", coordination, now=now)
        except Exception as error:  # One unreadable head never blocks the others or the worker.
            outcomes = [{"outcome": f"error:{type(error).__name__}:{error}"[:200]}]
        results += [{"pr": pr["number"], "sha": pr["headRefOid"], **item} for item in outcomes]
    host.state.mkdir(parents=True, exist_ok=True)
    tmp = marker.with_suffix(f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps({"at": now, "heads": heads, "last": results[-50:]}))
    os.replace(tmp, marker)
    return results


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


ADOPT_SHARE_EVERY = 4


def adoption_turn_due(host: Host) -> bool:
    """Every Nth local selection pass on this host tries a green draft before red repairs.

    Runs under the claim lock. LANES_ADOPT_SHARE_EVERY overrides N (0 disables the share)."""
    try:
        every = int(os.environ.get("LANES_ADOPT_SHARE_EVERY", ADOPT_SHARE_EVERY))
    except ValueError:
        every = ADOPT_SHARE_EVERY
    if every <= 0:
        return False
    path = host.state / "adopt-share.json"
    try:
        count = int(json.loads(path.read_text()).get("passes", 0))
    except (OSError, ValueError, TypeError, AttributeError):
        count = 0
    count += 1
    try:
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps({"passes": count, "every": every}))
        os.replace(tmp, path)
    except OSError:
        pass  # an unwritable counter only means red repairs keep their usual priority
    return count % every == 0


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
                # Admission must refuse exactly what the gate command later refuses: a
                # foreign live fix claim deferred 141 adopt runs in 48h, each posting
                # another gate claim on the PR (2026-10-11, #20979/#20820).
                if not terminal_gate(pr, latest, sensitive) and not gate_deferral(host, pr) \
                        and not claimed_elsewhere(pr["number"], pr["headRefOid"], GATE_OWNER_KINDS):
                    post_claim(pr["number"], pr["headRefOid"], "gate")
                    return reservation
            except BaseException:
                reservation.lock.release()
                raise
            reservation.lock.release()
        prs = [other for other in prs if other["number"] != pr["number"]]
        pr = unverified_pr(prs, verified, pending, repaired)
    return None


OWNER_SETTLE_KEEP_S = 24 * 3600


def note_owner_settle(host: Host, pr: dict, left: float, now: float) -> None:
    """Record one deferral per (PR, head) so the wait is measurable: owner-settle.json keeps the
    open windows, runs/owner-settle.jsonl one row the first time a head is deferred. Best effort:
    a failed write never changes the deferral."""
    key, head = str(pr["number"]), pr.get("headRefOid")
    fresh = []

    def change(data: dict) -> None:
        for stale in [k for k, v in data.items() if not isinstance(v, dict)
                      or now - float(v.get("firstSeenAt") or 0) > OWNER_SETTLE_KEEP_S]:
            del data[stale]
        if (data.get(key) or {}).get("head") != head:
            data[key] = {"head": head, "firstSeenAt": now, "settleUntil": now + left}
            fresh.append(data[key])
    try:
        update_json(host.state / "owner-settle.json", change)
        if fresh:
            (host.state / "runs").mkdir(parents=True, exist_ok=True)
            with open(host.state / "runs" / "owner-settle.jsonl", "a") as out:
                out.write(json.dumps({"schema": "jovie-owner-settle/v1", "at": now_iso(), "pr": pr["number"],
                                      "head": head, "branch": pr.get("headRefName"), "settleLeftS": round(left),
                                      "reason": "owner-active:head-pushed-within-settle-window"}) + "\n")
    except (OSError, ValueError, TypeError):
        pass


def claim_red_pr(host: Host, name: str, prs: list[dict] | None = None) -> dict | None:
    """Under the claim lock: pick this lane's red PR and record the attempt before working it."""
    prs = lane_prs(name) if prs is None else prs
    path = host.state / "fix-attempts.json"
    attempts = json.loads(path.read_text()) if path.exists() else {}
    held = json.loads(held_path(host).read_text()) if held_path(host).exists() else {}
    providers = load_providers()
    order, now = pr_events.cost_order(providers), time.time()
    disabled = set(providers) - set(order)
    prs = [pr for pr in prs if not pr_recovery_held(host, pr, now) and not pr_breaker_open(host, pr["number"], now, pr.get("headRefOid"))
           and pr_events.may_take(name, pr, attempts.get(str(pr["number"]), {}), order, now)]
    settled = []
    for pr in prs:
        left = pr_events.owner_settling(pr, attempts.get(str(pr["number"]), {}), now)
        if left is not None and red_pr([pr], attempts, held) is not None:
            note_owner_settle(host, pr, left, now)  # only a PR a repair would take is a deferral
            settled.append(pr["number"])
    prs = [pr for pr in prs if pr["number"] not in settled]
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
        # Readers (doctor, HUD, the next worker's deferred-requeue scan, test snapshots) do not take
        # claim.lock. A truncating write_text let them read an empty file: ClaimScanCacheTest failed
        # ~5% of runs under load with JSONDecodeError and refused the 07:39Z release on Gem.
        temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
        try:
            temporary.write_text(json.dumps(data))
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)
        throughput_sentinel.append_idle_exit(host.state, REPO_SLUG, name, reason)
    except (OSError, ValueError):
        pass
    finally:
        lock.release()


def occupied_worker_slots(host: Host) -> dict[str, int] | None:
    """Count the same held seats, including workers outside a reduced cap."""
    counts = {}
    try:
        paths = list((host.state / "slots").iterdir())
        if len(paths) > 4096:
            return None
        for path in paths:
            match = re.fullmatch(r"([a-z][a-z0-9_-]*)\.[0-9]+\.lock", path.name)
            if not match:
                continue
            fd = os.open(path, os.O_RDWR | os.O_NONBLOCK | os.O_NOFOLLOW)
            try:
                if not stat.S_ISREG(os.fstat(fd).st_mode):
                    return None
                try:
                    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    provider = match.group(1)
                    counts[provider] = counts.get(provider, 0) + 1
                else:
                    fcntl.flock(fd, fcntl.LOCK_UN)
            finally:
                os.close(fd)
        return counts
    except OSError:
        return None


def reserved_binding_pass(host: Host, name: str, spec: dict) -> int:
    """A provider with no free seat (cap, host ceiling, or autoscaled to 0) still serves a binding's
    guaranteed seat, so a full or throttled Jovie pool cannot stall another repository. Disk-critical
    hosts admit nothing: a binding run needs a local checkout like any other."""
    try:
        pct = disk_guard.lanes_free_pct(host.state)  # observation only: cleanup stays with slot holders
        if pct is None or pct <= disk_guard.CRITICAL_PCT:
            return 0
        bound = bindings.reserve(THIS, host, name, spec)
    except Exception as error:
        print(f"reserved binding pass failed: {type(error).__name__}: {error}"[:300], file=sys.stderr)
        return 0
    return 0 if bound is None else reexec(host, name)


def worker(host: Host, name: str) -> int:
    spec = load_providers()[name]
    limit = host.slots(name, spec.get("slots", 1))
    if not spec.get("enabled", True):
        return 0
    if limit <= 0:
        return reserved_binding_pass(host, name, spec)
    intake_limit = host.intake_slots(name, spec.get("slots", 1))
    slot = None
    # One ledger and one serialized count/acquire, even while old occupied seats
    # finish naturally after a cap reduction. Work classes never add capacities.
    admission = Locked(host.state / "slots" / "admission.lock", blocking=True)
    try:
        occupied = occupied_worker_slots(host)
        ceiling = autoscale.host_ceiling(host.state)
        full = occupied is None or occupied.get(name, 0) >= limit or (
            ceiling is not None and sum(occupied.values()) >= ceiling)
        for index in range(0 if full else limit):
            maintenance_only = index >= intake_limit
            if maintenance_only and spec.get("repairs") is False:
                continue
            lock = Locked(host.state / "slots" / f"{name}.{index}.lock", blocking=False)
            if lock.held:
                slot = lock
                break
            lock.release()
    finally:
        admission.release()
    if slot is None:
        return reserved_binding_pass(host, name, spec)
    try:
        return worker_with_slot(host, name, spec, slot, maintenance_only=maintenance_only)
    finally:
        if not slot.handle.closed: slot.release()


MAINTENANCE_MISSING = object()


def maintenance_json(path, *, dir_fd=None, limit=1024 * 1024, missing=MAINTENANCE_MISSING, json_lines=False):
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
        return [json.loads(line) for line in raw.splitlines() if line.strip()] if json_lines else json.loads(raw)
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
                match = RUN_TARGET.search(entry.name)
                if match and match[1]:
                    preserved.add(int(match[1]))
                if type(target) is int and target > 0:
                    preserved.add(target)
                elif not match and not (isinstance(marker, dict) and marker.get("issue")):
                    raise ValueError("maintenance-preserved-target-unknown")
        return preserved
    finally:
        os.close(root)


def record_maintenance_demand(host: Host, name: str, prs: list[dict], candidates: list[dict],
                              events: list[dict], selected: set[int], *, summary: dict | None = None,
                              routing_context=REPAIR_ROUTING_UNSET) -> None:
    """Under claim.lock: a pre-claim demand hint from the scan already performed.

    No API, lease, attempt charge or model call. Actual admission still refreshes
    the exact target and enforces remote ownership, provider and integrity gates.
    Unknown is never an empty pool. A selected unit is running, not pending work.
    """
    summary = _SUMMARY if summary is None else summary
    now, pending_count = time.time(), None
    source_at = summary.get("sourceAt")
    dispositions, unknown_reasons, eligible_kinds = {}, {}, {}
    ordinary_pending = None

    def disposition(number, reason):
        dispositions[str(number)] = reason

    def unknown(reason):
        unknown_reasons[reason] = unknown_reasons.get(reason, 0) + 1
    try:
        if not summary["readable"] or type(source_at) not in (int, float) \
                or not 0 <= now - source_at <= MAINTENANCE_DEMAND_MAX_AGE_S:
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
        eligible, unknown_rows = set(), 0
        rung_rows = [pr for pr in summary["prs"]
                     if isinstance(record := attempts.get(str(pr["number"])), dict)
                     and isinstance(pending := record.get("pendingEscalation"), dict)
                     and pending.get("lane") == name]
        revocations = maintenance_json(revocations_path(host), missing=[], json_lines=True)
        if not isinstance(revocations, list) or any(not isinstance(row, dict) for row in revocations):
            raise ValueError("maintenance-revocations-unknown")
        revoked = {row.get("branch") for row in revocations if row.get("schema") == PUBLICATION_REVOCATION_SCHEMA}
        rows = {pr["number"]: pr for pr in best_per_issue([*prs, *candidates, *events, *rung_rows])}
        current = {pr["number"]: pr for pr in summary["prs"]}
        event_rows = {pr["number"]: pr for pr in events}
        adopt_numbers = {pr["number"] for pr in prs}
        for number, candidate in rows.items():
            try:
                pr = current.get(number)
                if not pr or pr.get("headRefOid") != candidate.get("headRefOid") \
                        or not isinstance(pr.get("headRefName"), str) or not pr["headRefName"] \
                        or any(type(pr.get(key)) is not bool for key in ("isDraft", "isCrossRepository", "isInMergeQueue")) \
                        or not isinstance(pr.get("labels"), list) or not isinstance(pr.get("statusCheckRollup"), list):
                    raise ValueError("maintenance-current-metadata-unknown")
                remote_active = any(key[:2] == (number, pr["headRefOid"]) and row.get("active")
                                    and 0 <= now - row["at"] <= SUMMARY_TTL_S
                                    for key, row in _CLAIM_OBSERVATIONS.items())
                blocked = ("selected" if number in selected else
                           "preserved-reconciliation-required" if number in preserved else
                           "remote-owned" if remote_active else
                           "publication-revoked" if pr.get("headRefName") in revoked else
                           "queued" if pr.get("isInMergeQueue") else
                           "dependabot" if (pr.get("headRefName") or "").startswith("dependabot/") else None)
                if blocked:
                    disposition(number, blocked)
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
                if isinstance(attempt.get("pendingEscalation"), dict) and attempt["pendingEscalation"].get("lane") == name:
                    if routing_context is not REPAIR_ROUTING_UNSET:
                        route_reason = current_repair_routing_reason(host, routing_context, providers)
                        if route_reason:
                            disposition(number, route_reason)
                            unknown_rows += 1
                            unknown(route_reason)
                            continue
                    def current_plan(classified, record, providers, now, head):
                        return repair_routing_plan(routing_context, providers, classified, record, now, head,
                                                   repair_route_cooldowns(host, providers))
                    rung = pending_rung_disposition(
                        pr, attempt, name, providers, now, classified=rung_blocker(pr, attempt, entry),
                        caps_allow=remediation.caps_allow, plan_ladder=current_plan,
                        top_rung_used=remediation.top_rung_used,
                        active_previous_attempt=pr_events.in_flight(attempt, {"headRefOid": attempt.get("sha")}, now))
                    if rung["state"] == "eligible" and provider_may_run(name, "fix"):
                        eligible.add(number)
                        eligible_kinds[str(number)] = "escalation"
                        disposition(number, "eligible-escalation")
                    else:
                        disposition(number, rung["reason"])
                        if rung["state"] == "unknown":
                            unknown_rows += 1
                            unknown(rung["reason"])
                    continue
                if not pr_events.in_scope(pr, "red", disabled):
                    disposition(number, "outside-repair-scope")
                    continue
                preserved_reason = pr_events.preservation_reason(
                    pr, attempt, MAX_FIX_ATTEMPTS, held=entry, now=now, allow_reentry=True)
                if preserved_reason or pr_events.in_flight(attempt, pr, now):
                    disposition(number, preserved_reason or "attempt-in-flight")
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
                    eligible_kinds[str(number)] = "repair"
                    disposition(number, "eligible-repair")
                elif number in adopt_numbers and provider_may_run(name, "adopt") and unverified_pr(
                        [pr], snapshots["verified.json"], snapshots["requeue.json"]) \
                        and not gate_disposition(pr, held, attempts):
                    eligible.add(number)
                    eligible_kinds[str(number)] = "adopt"
                    disposition(number, "eligible-adopt")
                else:
                    disposition(number, "no-current-ordinary-repair")
            except ValueError as error:
                disposition(number, str(error))
                unknown(str(error))
                # One stale or racing row (two caches, different TTLs) must not erase the
                # demand every other PR proves; eligible is then a lower bound (2026-10-11).
                unknown_rows += 1
        ordinary_pending = sum(kind != "escalation" for kind in eligible_kinds.values()) if not unknown_rows else None
        if eligible:
            pending_count = len(eligible)
        elif not unknown_rows and summary["readable"] and 0 <= now - summary["at"] <= MAINTENANCE_DEMAND_MAX_AGE_S \
                and not summary["prs"] and not rows:
            # A complete empty repository inventory proves no PR maintenance.
            pending_count = 0
    except Exception as error:
        reason = str(error) if isinstance(error, ValueError) else "maintenance-observation-" + type(error).__name__
        unknown(reason)
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
                                             "ordinaryPrPending": ordinary_pending,
                                             "byKind": {kind: list(eligible_kinds.values()).count(kind)
                                                        for kind in sorted(set(eligible_kinds.values()))},
                                             "blockedByReason": {reason: list(dispositions.values()).count(reason)
                                                                 for reason in sorted(set(dispositions.values()))
                                                                 if not reason.startswith("eligible-")},
                                             "unknownByReason": unknown_reasons,
                                             "dispositions": dict(list(dispositions.items())[:64]),
                                             "projectionComplete": False,
                                             "unmeasuredClasses": ["labeled-remediation-events"],
                                             "semantics": "pre-claim demand; fresh admission required"}
        temporary.write_text(json.dumps(data))
        os.replace(temporary, path)
    except Exception:
        pass  # Observation failure never prevents an already authorized repair.
    finally:
        temporary.unlink(missing_ok=True)


def jovie_repair_pending(host: Host, now: float | None = None) -> bool:
    """True unless a fresh maintenance-demand record from any local lane proves Jovie has no
    repairable PR. Unknown or stale counts as pending so the Jovie path gets a turn and
    refreshes the record (a record only goes stale when other work starves the Jovie path)."""
    now = time.time() if now is None else now
    lanes = read_json(host.state / "maintenance-demand.json").get("lanes")
    # Only a lane that repairs Jovie PRs can prove Jovie has none. record_maintenance_demand runs
    # only for such lanes (`local = spec.get("repairs") is not False`), and this filter keeps a
    # non-repairing lane's row, should one ever be written, from unblocking LYB intake.
    providers = read_json(HERE / "providers.json")
    for lane_name, row in (lanes.items() if isinstance(lanes, dict) else ()):
        if (providers.get(lane_name) or {}).get("repairs") is False:
            continue
        at, pending = (row or {}).get("observedAt"), (row or {}).get("pending")
        if type(at) in (int, float) and 0 <= now - at <= MAINTENANCE_DEMAND_MAX_AGE_S \
                and type(pending) is int and pending == 0:
            return False
    return True


def worker_with_slot(host: Host, name: str, spec: dict, slot: Locked, *, maintenance_only=False) -> int:
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
    # Extra repository bindings (LYB) share this seat. Jovie-only holds below never block them,
    # and a binding fault never blocks the Jovie path. No configured binding = no reads at all.
    try:
        bound = bindings.work(THIS, host, name, spec, maintenance_only=maintenance_only,
                              jovie_repair_pending=jovie_repair_pending(host))
    except Exception as error:
        bound = None
        print(f"binding pass failed: {type(error).__name__}: {error}"[:300], file=sys.stderr)
    if bound is not None:
        slot.release()
        return 1 if bound == "disk-held" else reexec(host, name)
    if name == "hyperagent":
        # Remote repair of existing PRs comes before new issues, and the shared 24/day thread
        # cap (bridge + issues + repairs) gates both: a spent cap ends the turn here.
        try:
            turn, _receipt = hyperagent_repair.lane_turn(host.state, spec)
        except Exception as error:
            turn = "idle"
            print(f"hyperagent repair pass failed: {type(error).__name__}: {error}"[:300], file=sys.stderr)
        if turn == "capped":
            record_idle_exit(host, name, "hyperagent-daily-cap")
            slot.release()
            return 0
        if turn == "ran":
            slot.release()
            return reexec(host, name)
    linear = None
    # Publication can await canonical policy and native queue reads. Keep those
    # outside the global claim lock, then refresh inventory for ordinary admission.
    requeue_verified(host, lane_prs(name))
    repair_inventory = capture_repair_inventory(name) if spec.get("repairs") is not False else None
    scan_summary = repair_inventory["summary"] if repair_inventory is not None else _SUMMARY
    # Scope-only evidence is optional. Never fetch it while holding claim.lock or
    # let an unavailable witness displace repair/adopt/labeled priority.
    try:
        target_files = pr_events.capture_target_file_witnesses(
            THIS, scan_summary.get("prs", []), scan_summary.get("sourceAt"))
    except Exception:
        target_files = {}  # Optional scope evidence cannot strand an authorized repair.
    # Pin the already complete scan before waiting for claim.lock. A later
    # mutable summary is not provenance for cross-provider draft scope.
    rung_inventory = json.loads(json.dumps({key: scan_summary.get(key)
                                           for key in ("readable", "sourceAt", "prs")}))
    routing_needed = spec.get("repairs") is not False and repair_routing_needed(host, rung_inventory)
    routing_providers = load_providers() if routing_needed else {}
    routing_context = capture_repair_routing(host, routing_providers, rung_inventory) if routing_needed else None
    if repair_inventory is not None:
        claim, repair_inventory = lock_repair_inventory(host, name, repair_inventory)
    else:
        claim = Locked(host.state / "claim.lock", blocking=True)
    # Bulk repair inventory fills under its per-key lock outside this global lock.
    # Current local filters and selected-head/owner/claim arbitration remain serialized.
    red = adopt = issue = route_decision = None
    rate_limited = inventory_unknown = repair_inventory_held = False
    routing_refresh_reason = None
    local = False
    candidates: list[dict] = []
    try:
        # Finish before starting: PRs a GitHub event queued, red PRs (any open PR in the repo),
        # then ungated lane drafts, then new issues.
        # A remote-only lane (Hyperagent) cannot repair a local checkout: it only claims issues,
        # and the local lanes repair its PRs like any orphan (`repairs: false`).
        local = spec.get("repairs") is not False
        if local and not repair_inventory_valid(repair_inventory, name):
            raise RepairInventoryHold()
        if local:
            # Project the refreshed same-call pair while claim ownership is held.
            # Optional file witnesses retain their original binding and are
            # revalidated by the new-issue path before use.
            scan_summary = repair_inventory["summary"]
            rung_inventory = {key: scan_summary.get(key) for key in ("readable", "sourceAt", "prs")}
        candidates = [pr for pr in fix_candidates(name, inventory=repair_inventory["prs"]) if not pr_recovery_held(host, pr)] if local else []
        # Reclaimed abandoned drafts (the only non-lane drafts among the fix candidates) are
        # gated and readied like this lane's own drafts. Derived from the one cached scan so
        # no extra inventory read happens per worker pass.
        lane_owned = [pr for pr in lane_prs(name, inventory=repair_inventory["prs"]) if not pr_recovery_held(host, pr)] if local else []
        owned_numbers = {pr["number"] for pr in lane_owned}
        prs = lane_owned + [pr for pr in candidates if pr.get("isDraft") and pr["number"] not in owned_numbers]
        events = [pr for pr in pr_events.queued_prs(THIS, pr_events.FIX_KINDS, inventory=repair_inventory["prs"])
                  if not pr_recovery_held(host, pr)] if local else []
        source_at = rung_inventory.get("sourceAt")
        rung_inventory_valid = (rung_inventory.get("readable") is True
                                and type(source_at) in (int, float) and math.isfinite(source_at)
                                and 0 <= time.time() - source_at <= MAINTENANCE_DEMAND_MAX_AGE_S
                                and isinstance(rung_inventory.get("prs"), list))
        rung_candidates = pending_rung_candidates(host, name, rung_inventory["prs"]) \
            if local and rung_inventory_valid else []
        # A fixed share of turns gates green drafts first: red repairs otherwise took 94-99% of
        # lane turns and green drafts waited hours for a gate (2026-10-21, Gem ledger).
        if local and provider_may_run(name, "adopt") and adoption_turn_due(host):
            adopt = claim_adoptable_pr(host, name, prs, candidates)
        red = None if adopt else local and (pr_events.claim_event_pr(host, THIS, name, events)
                         or claim_escalation_pr(host, name, list({pr["number"]: pr
                                                               for pr in candidates + rung_candidates}.values()),
                                                routing_context=routing_context)
                         or claim_red_pr(host, name, candidates)) or None
        if adopt is None:
            adopt = None if red or not local or not provider_may_run(name, "adopt") \
                else claim_adoptable_pr(host, name, prs, candidates)
        if local:
            selected = {red["number"]} if red else {adopt.pr["number"]} if adopt else set()
            try:
                record_maintenance_demand(host, name, prs, candidates, events, selected,
                                          summary=repair_inventory["summary"], routing_context=routing_context)
            except Exception:
                pass  # Demand telemetry cannot prevent this selected repair.
        # Existing-PR admission uses fresh GitHub/attempt authority. Do not make
        # its selection or execution depend on credentials or optional Linear work.
        if not (red or adopt):
            if not maintenance_only:
                linear = Linear(host.linear_env)
            if local:
                linear_optional(file_breaker_signals, host, linear)
                linear_optional(escalate_exhausted, host,
                                list({pr["number"]: pr for pr in candidates + events + rung_candidates}.values()), linear,
                                **({"model_only": True} if maintenance_only else {}),
                                **({"joined_rungs": frozenset(pr["number"] for pr in rung_candidates)}
                                   if rung_candidates else {}), routing_context=routing_context)
        if not (red or adopt) and (routing_needed or rung_candidates):
            routing_refresh_reason = current_repair_routing_reason(host, routing_context, load_providers())
        labeled = None if red or adopt or not local or maintenance_only \
            else linear_optional(claim_labeled_event, host, name, linear)
        issue = labeled
        if local and linear is not None:
            linear_optional(sweep_lane_prs, host, name, linear)
        if local and not (red or adopt or labeled):
            publish_exhausted_repairs(host, name, candidates)
            try:
                sweep_execution_statuses(host)
            except (OSError, subprocess.SubprocessError, ValueError, KeyError, TypeError):
                pass  # Retried on the next idle pass; it never blocks new work.
        budget = None if red or adopt or labeled or maintenance_only else read_new_issue_budget(name, host.base_slots(name, spec.get("slots", 1)))
        blocked = budget is not None and not budget["allowed"]
        in_flight = None if red or adopt or blocked or labeled or maintenance_only else in_flight_issues()
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
            target_files = pr_events.revalidate_target_file_witnesses(target_files, overlap_prs,
                                                                      repository=REPO_SLUG)
            router = issue_router(host, name)
            while pool and not overlap_unreadable:
                issue = design_gate.pick_build_issue(
                    pool, failures, in_flight=in_flight, provider=name,
                    pick=lambda *args, **kwargs: pick_issue(*args, holds=holds, held_back=held_back,
                                                            route=router, target_files=target_files, **kwargs),
                    linear=linear, repo=host.repo)
                if issue is None:
                    break
                admission = file_overlap.admission_decisions(
                    host, THIS, issue, overlap_prs, overlap_tasks, workstreams.classify,
                    target_files=target_files)
                if not admission["allowed"]:
                    overlap_blocked = True
                    rejected = issue.identifier
                    issue = None
                    pool = [candidate for candidate in pool if candidate.identifier != rejected]
                    continue
                # Design selection may wait. Recheck the pure hotspot predicate at the
                # claim boundary so scope expiry cannot admit a now-unknown target.
                if held_hotspot(predicted_touch(issue, target_files), holds):
                    pool = [candidate for candidate in pool if candidate.identifier != issue.identifier]
                    issue = None
                    continue
                overlap_prediction = admission
                route_decision = router.decisions.get(issue.identifier) if router else None
                # One Symphony host: the local ledger is the claim. Linear's In Progress is
                # its projection, delivered by the outbox when the budget allows.
                if not linear_sync.claim(host.state, issue.id, issue.identifier, name):
                    issue = None
                    break
                linear_sync.enqueue(host.state, "move", issue.id, target="In Progress")
                file_overlap.reserve_task(host.state, issue, overlap_prediction)
                break
        if red is None and adopt is None and issue is None:
            pr_events.cleanup_one_event(host, THIS, events)
    except RepairInventoryHold:
        repair_inventory_held = True
    except LaneInventoryUnknown:
        issue = None
        inventory_unknown = red is None and adopt is None
    except LinearRateLimited:
        # A repair already chosen can proceed without another Linear read. An idle scan stops.
        issue = None
        rate_limited = red is None and adopt is None
    finally:
        claim.release()
    if repair_inventory_held:
        held_summary = repair_inventory.get("summary") if isinstance(repair_inventory, dict) else None
        held_summary = held_summary if isinstance(held_summary, dict) else {}
        if held_summary.get("sourceAtReason") == "inventory-oversize":
            print(f"repair inventory cache is {held_summary.get('sourceAtBytes')} bytes, over the "
                  f"{REPAIR_INVENTORY_MAX_BYTES} byte limit", file=sys.stderr)
            record_idle_exit(host, name, "repair-inventory-oversize")
        else:
            record_idle_exit(host, name, "repair-inventory-" + (repair_inventory_cause(repair_inventory, name)
                                                                or "valid-at-recheck"))
        slot.release()
        return 0
    # Every local pass, including one that just claimed a repair. An idle-only sync
    # never ran while the fleet stayed busy, so exhausted heads sat behind main
    # (JOV-8536). After the lock: the sync must not block the next claim.
    if local:
        try:
            revisit_terminal_prs(host, candidates)
        except (OSError, subprocess.SubprocessError, ValueError, KeyError, TypeError):
            pass  # Retried next pass; it never blocks the claimed repair.
        try:
            deterministic_conflict_pass(host, candidates)
        except (OSError, subprocess.SubprocessError, ValueError, KeyError, TypeError):
            pass  # Same contract: a script-only rung never blocks the claimed repair.
    if routing_refresh_reason and red is None and adopt is None and issue is None:
        record_idle_exit(host, name, "routing-preflight-required:" + routing_refresh_reason)
        slot.release()
        return 0  # Refresh only joined/model routing; ordinary idle disposition already ran.
    if rate_limited or inventory_unknown:
        record_idle_exit(host, name, "linear-rate-limited" if rate_limited else "linear-inventory-unknown")
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
        record_idle_exit(host, name, "maintenance-only-idle" if maintenance_only else budget["reason"] if blocked else
                         "in-flight-unknown" if in_flight is None else
                         "file-overlap-inventory-unavailable" if overlap_unreadable else
                         "file-overlap-blocked" if overlap_blocked else "none-eligible")
        slot.release()
        return 0
    if route_decision and route_decision.get("chosen"):
        log_route(host, name, route_decision)
        spec = {**spec, "model": route_decision["chosen"]["model"], "route": route_decision}
    # The live owner of the started issue: held until this worker exits or re-execs.
    _RUN_LEASES.append(ownership.acquire_run_lease(host.state, issue.id, issue.identifier, name))
    linear = linear_sync.Outboxed(host.state, linear)  # every disposition write waits in the outbox
    notify_issue_claim(linear, issue, name, spec)
    try:
        receipt = (epics.run_epic(THIS, host, name, spec, linear, issue, host.repo) if epics.is_epic(issue)
                   else run_issue(host, name, spec, linear, issue))
    finally:
        file_overlap.release_task(host.state, issue.identifier)
    verdict = receipt.get("verdict")
    note_event_outcome(host, issue, verdict, receipt=receipt)
    if verdict in epics.SETTLED_VERDICTS:
        slot.release()
        return reexec(host, name)
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
        cooled = cool_down(host, name, provider_exit(receipt.get("reasons")))
        # Back to Todo, not Backlog: a provider fault says nothing about the issue, and Backlog
        # needed a human to come back (Tim 2026-10-12: every hold needs an automatic exit).
        linear.move(issue.id, "Todo")
        linear.comment(issue.id, f"🤖 lane `{name}` provider failed before working the issue "
                                 f"({', '.join(receipt.get('reasons', []))}); back to Todo"
                                 + (", lane cooling on the provider's limit." if cooled else "."))
        slot.release()
        return 1
    if verdict == "pr-readback-pending":
        # Keep the original issue/worktree/attempt. Inventory is unknown, so no
        # new provider run, retry refund, issue downgrade or success is justified.
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
            failures[issue.identifier] = {"count": count, "at": time.time(), "release": release_generation(),
                                          **pr_events.failure_reason(receipt, count >= MAX_FAILURES)}
            atomic_write_text(failures_path(host), json.dumps(failures))
        finally:
            claim.release()
        exhausted = failures[issue.identifier]["count"] >= MAX_FAILURES
        # Exhausted runs stay in Todo, parked on this host until the next lanes release
        # (failure_rejection): Backlog needed a human to come back (Tim 2026-10-12).
        linear.move(issue.id, "Todo")
        linear.comment(issue.id, f"🤖 lane `{name}`: {verdict} ({', '.join(receipt.get('reasons', []))}). "
                                 + (f"{MAX_FAILURES} attempts on this release; parked until the next lanes "
                                    "release, then retried automatically." if exhausted else "Back to Todo."))
    slot.release()
    return reexec(host, name)


_RUN_LEASES: list = []  # open run-lease handles; exec (close-on-exec) or exit releases them


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


def collect_shipping_origin(state: Path) -> dict:
    """Import the transport after a staged installer has restored new release extras."""
    import shipping_origin

    return shipping_origin.collect(state)


TICK_INTENT_SCHEMA = "jovie.tick-intent/v1"


def _begin_tick_intent(host: Host) -> dict | None:
    """Durable run-intent marker: written at dispatch start, cleared on a clean exit.
    A marker left behind by a dead run (crash, SIGKILL, host power loss — Gem 2026-10-23:
    ~180 unclean-termination warnings in the jovie-lanes.service journal) makes the
    previous tick's unclean termination visible and authorizes one bounded recovery.
    A marker whose pid is still alive inside its lease is a long tick, not an unclean one."""
    path = host.state / "tick-in-flight.json"
    previous = None
    try:
        raw = json.loads(path.read_text())
    except (OSError, ValueError):
        raw = None
    if isinstance(raw, dict) and raw.get("schema") == TICK_INTENT_SCHEMA:
        pid, started = raw.get("pid"), raw.get("startedAt")
        alive, stale = False, True
        if type(pid) is int and pid > 0:
            try:
                os.kill(pid, 0)
                alive = True
            except ProcessLookupError:
                alive = False
            except OSError:
                alive = True  # unreadable liveness keeps the conservative reading
        if type(started) in (int, float) and started > 0:
            stale = started < time.time() - pr_events.FIX_LEASE_S
        if not alive or stale:
            previous = {"pid": pid, "startedAt": started}
    update_json(path, lambda data: (data.clear(), data.update({
        "schema": TICK_INTENT_SCHEMA, "host": HOST, "pid": os.getpid(), "startedAt": time.time()})))
    return previous


def _clear_tick_intent(host: Host) -> None:
    try:
        (host.state / "tick-in-flight.json").unlink()
    except OSError:
        pass


def recover_unclean_tick(host: Host) -> dict:
    """Bounded recovery after an unclean termination: refund fix-attempt charges whose run
    died between the claim charge and its own verdict (no endedAt, lease expired — the
    runner's own wall budget is inside FIX_LEASE_S), so host death does not permanently
    spend a PR's bounded fix budget on no work."""
    refunded: list[int] = []

    def sweep(data: dict) -> None:
        for number, record in data.items():
            if not isinstance(record, dict) or record.get("endedAt") \
                    or record.get("noWorkRefund") or not record.get("at"):
                continue
            if type(record.get("count")) is not int or record["count"] <= 0:
                continue
            at = record.get("at")
            if type(at) not in (int, float) or not math.isfinite(at) \
                    or at > time.time() - pr_events.FIX_LEASE_S:
                continue
            record["count"] -= 1
            record["noWorkRefund"] = {"reason": "unclean-worker-termination", "at": time.time()}
            refunded.append(number)

    update_json(host.state / "fix-attempts.json", sweep)
    return {"schema": "jovie.unclean-tick-recovery/v1", "refundedFixAttempts": sorted(refunded)}


DOCTOR_REFRESH_S = 5 * 60


def spawn_doctor_if_stale(host: Host, now: float | None = None) -> bool:
    """Start a detached doctor pass when the last one is older than DOCTOR_REFRESH_S. The doctor used to run only
    at the very end of a dispatch tick, so a slow tick left the feed, the HUD and the dead-man stale."""
    now = time.time() if now is None else now
    try:
        at = datetime.fromisoformat(str(json.loads((host.state / "doctor.json").read_text())["at"]).replace("Z", "+00:00")).timestamp()
    except (OSError, ValueError, KeyError, TypeError):
        return False  # no doctor report at all (fresh host, fixture): the end-of-tick pass writes the first one
    if now - at < DOCTOR_REFRESH_S:
        return False
    try:
        with open(host.state / "doctor-spawn.log", "ab") as out:
            subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "doctor"], stdin=subprocess.DEVNULL,
                             stdout=out, stderr=out, start_new_session=True, cwd=str(host.repo))
        return True
    except OSError:
        return False


def run_doctor(host: Host) -> int:
    """One doctor pass; a second concurrent pass exits at once (doctor-run.lock)."""
    lock = Locked(host.state / "locks" / "doctor-run.lock", blocking=False)
    try:
        if not lock.held:
            return 0
        doctor.run(host, sys.modules[__name__], codex_lane_module())
        return 0
    finally:
        lock.release()


def dispatch(host: Host) -> int:
    lifecycle.HEARTBEAT = host.state / "tick-heartbeat"
    lifecycle.beat()
    try:
        spawn_doctor_if_stale(host)
    except Exception:  # a doctor that cannot start never blocks dispatch
        pass
    unclean_previous = None
    try:
        unclean_previous = _begin_tick_intent(host)
    except Exception:
        unclean_previous = {"unavailable": True}  # a failed marker write must not skip the tick
    started = time.monotonic()
    try:
        result = _dispatch(host, unclean_previous)
    finally:
        _clear_tick_intent(host)
        record_tick_duration(host, time.monotonic() - started)
    return result


def record_tick_duration(host: Host, seconds: float) -> None:
    """One row per dispatch tick: the number to drive down (it was 25-60 minutes on 2026-10-26; target under 5)."""
    try:
        with open(host.state / "runs" / "tick-durations.jsonl", "a") as out:
            out.write(json.dumps({"at": now_iso(), "dispatchS": round(seconds, 1), "release": read_marker(host),
                                  "topCommands": lifecycle.top_stats()}) + "\n")
    except OSError:
        pass


def _dispatch(host: Host, unclean_previous: dict | None) -> int:
    tick = {"at": now_iso(), "release": read_marker(host), "unhealthy": [], "quotaBlocked": {},
            "spawned": [], "error": None, "admissionDenied": None,
            "uncleanPreviousRun": unclean_previous}
    if unclean_previous:
        try:
            tick["uncleanRecovery"] = recover_unclean_tick(host)
        except Exception as error:  # recovery failure must not take dispatch down
            tick["uncleanRecoveryError"] = f"{type(error).__name__}: {error}"[:200]
    try:
        tick["disk"] = disk_guard.check(host)
        try:
            # The tick drives reclaim, not only worker spawns: a low reading
            # spawns one detached sweep per interval (disk_guard.maybe_sweep).
            tick["diskSweep"] = disk_guard.maybe_sweep(host, tick["disk"].get("freePct"))
        except Exception as error:  # reclaim never takes dispatch down
            tick["diskSweep"] = f"{type(error).__name__}: {error}"[:200]
        if autoscale.mode() != "off":
            try:
                bases = {name: (host.base_slots(name, spec.get("slots", 1)) if spec.get("enabled", True) else 0)
                         for name, spec in load_providers().items()}
                # Remote-only lanes run off gem, so gem host pressure does not size them.
                remote = sorted(name for name, spec in load_providers().items()
                                if spec.get("remote") is True or spec.get("repairs") is False)
                tick["autoscale"] = autoscale.apply_tick(host.state, tick, bases,
                                                         config={**autoscale.load_config(), "remote": remote})
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
        if not os.environ.get("LANES_SELFTEST"):
            try:
                tick["shippingOriginIngest"] = collect_shipping_origin(host.state)
            except Exception as error:
                tick["shippingOriginIngest"] = {"errors": [f"{type(error).__name__}:{error}"[:200]]}
        try:
            tick["remediationEvents"] = claim_remediation_events(host, Linear(host.linear_env))
        except (Exception, SystemExit) as error:  # the label scan (or a missing key) never takes spawn down
            tick["remediationEventsError"] = f"{type(error).__name__}: {error}"[:200]
            try:
                tick["remediationEvents"] = _event_delivery_snapshot(host, time.time())
            except Exception as status_error:
                tick["remediationDeliveryStatusError"] = f"{type(status_error).__name__}: {status_error}"[:200]
            try:
                # Reconciliation is down; the durable intents are not. A failed
                # delivery still drains with backoff here instead of sitting
                # unsent until a healthy planning pass happens to return.
                tick["remediationDeliveryDrain"] = drain_event_delivery(host, Linear(host.linear_env))
            except (Exception, SystemExit) as drain_error:
                tick["remediationDeliveryDrainError"] = f"{type(drain_error).__name__}: {drain_error}"[:200]
        if not os.environ.get("LANES_SELFTEST"):  # a release self-test never calls Linear
            try:
                teams = ["JOV", *(binding.key for binding in bindings.extra_bindings(THIS))]
                client = Linear(host.linear_env)
                tick["linearSync"] = linear_sync.tick(host.state, client, client.admit, (LinearRateLimited,), teams)
            except (Exception, SystemExit) as error:  # dispatch reads the mirror at any age
                tick["linearSyncError"] = f"{type(error).__name__}: {error}"[:200]
            try:  # measure the shared hosted-macOS pool (throttled); the LYB refill below reads it
                tick["macosPool"] = macos_pool.sample(host.state)
            except (Exception, SystemExit) as error:  # a sampling fault never blocks dispatch
                tick["macosPoolError"] = f"{type(error).__name__}: {error}"[:200]
            try:  # Todo below target is refilled from the Backlog the sync just refreshed, per team
                # Every team refills on its own mirror and seats; JOV has no extra binding, so it gets the same
                # floor-less pass (Summer's governor writes the same Todo moves idempotently).
                refill_for = [types.SimpleNamespace(key="JOV", excluded=("hold",), min_todo=0), *bindings.extra_bindings(THIS)]
                tick["backlogRefill"] = {binding.key: binding_refill.refill(THIS, host, binding, client, binding.min_todo)
                                         for binding in refill_for}
                tick["backlogRank"] = {binding.key: binding_refill.rank_pass(THIS, host, binding, client) for binding in refill_for}
                tick["priorityAdmission"] = {binding.key: priority_admission.run(THIS, host, binding.key, client, floor=binding.min_todo,
                                                                                  excluded=binding.excluded)
                                             for binding in refill_for}
                tick["backlogDecompose"] = decompose_pass.maybe_spawn(host.state, [binding.key for binding in refill_for])
            except (Exception, SystemExit) as error:  # a refill fault never blocks dispatch
                tick["backlogRefillError"] = f"{type(error).__name__}: {error}"[:200]
        try:
            tick["linear"] = linear_sync.status(host.state)
        except Exception as error:
            tick["linear"] = {"error": type(error).__name__}
        for name, spec in load_providers().items():
            try:
                slots = host.slots(name, spec.get("slots", 1))
                # LANES_SLOTS_<P>=0 scopes a provider off this host: no health probe, no provider-down alert.
                if not spec.get("enabled", True) or slots == 0 or cooling(host, name):
                    continue
                quota = quota_pressure(host, name, spec, time.time())
                if not quota["ok"]:
                    tick["quotaBlocked"][name] = quota["why"]
                    continue
                if not provider_healthy(spec):
                    tick["unhealthy"].append(name)
                    continue
                for _ in range(slots):
                    subprocess.Popen([sys.executable, str(Path(__file__)), "worker", "--provider", name],
                                     stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                     start_new_session=True, **lifecycle.spawn_kwargs())
                    tick["spawned"].append(name)
            except Exception as error:
                # One provider's malformed spec, probe or spawn fault holds that provider only;
                # it must not idle every other lane's seats for the tick.
                tick["unhealthy"].append(name)
                tick.setdefault("providerErrors", {})[name] = f"{type(error).__name__}: {error}"[:200]
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
    except (Exception, SystemExit) as error:  # the ready/orphan queue never takes dispatch down
        tick["eventsError"] = f"{type(error).__name__}: {error}"[:200]
    try:
        tick["reason"] = reason_lane.tick(host, THIS, lambda: Linear(host.linear_env))
    except (Exception, SystemExit) as error:  # Summer's reasoning jobs never take dispatch down
        tick["reasonError"] = f"{type(error).__name__}: {error}"[:200]
    try:
        owner = os.environ.get("OUTCOME_LANE_OWNER", "gem").split(".")[0]
        tick["outcome"] = (outcome_lane.tick(host, THIS) if HOST == owner else
                           {"status": "not-owner", "owner": owner})
    except (Exception, SystemExit) as error:  # outcome verification never takes dispatch down
        tick["outcomeError"] = f"{type(error).__name__}: {error}"[:200]
    try:
        tick["tasteDefault"] = (taste_default.tick(host, THIS) if HOST == owner else
                                {"status": "not-owner", "owner": owner})
    except (Exception, SystemExit) as error:  # taste defaults never take dispatch down
        tick["tasteDefaultError"] = f"{type(error).__name__}: {error}"[:200]
    try:
        if not os.environ.get("LANES_SELFTEST"):  # a release self-test never writes to Linear
            teams = ["JOV", *(binding.key for binding in bindings.extra_bindings(THIS))]
            tick["issueReconcile"] = epics.reconcile(THIS, host, lambda: Linear(host.linear_env), teams)
    except (Exception, SystemExit) as error:  # epic closure and hold expiry never take dispatch down
        tick["issueReconcileError"] = f"{type(error).__name__}: {error}"[:200]
    try:
        # A release self-test or fixture never writes to Linear or reads the host's git.
        if not os.environ.get("LANES_SELFTEST") and os.environ.get("LANES_EXECUTION_BACKEND") != "local-test":
            # Every started issue has a live owner, or it moves (outbox) to the right state.
            tick["ownership"] = ownership.reconcile(host.state, host.repo, in_flight_issues(),
                                                    search=org_merged_prs)
    except Exception as error:  # ownership repair never takes dispatch down
        tick["ownershipError"] = f"{type(error).__name__}: {error}"[:200]
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
    if autoscale.mode() == "apply":
        try:
            # After the spawn loop: a slow or failed Summer POST never delays or blocks a worker.
            record = capacity_limit.tick(host.state, tick)
            if record is not None:
                tick["capacityLimit"] = {"changed": True, "bottleneckFound": record["bottleneckFound"],
                                         "limited": [row["resource"] for row in record["limited"]]}
        except Exception as error:  # the record is observability, never dispatch
            tick["capacityLimitError"] = f"{type(error).__name__}: {error}"[:200]
    try:
        # The canonical Gem fleet-gate receipt, emitted when its local inputs change (replaces
        # fleet-gate-refresh.yml's */5 cron). Detached: never delays dispatch.
        tree = (host.state / "current" / ".tree").read_text().strip() if (host.state / "current" / ".tree").exists() else None
        tick["fleetGate"] = fleet_gate_emitter.tick(host.state, host.repo, tree)
    except Exception as error:  # observability and admission evidence, never dispatch
        tick["fleetGate"] = {"status": "error", "error": f"{type(error).__name__}: {error}"[:200]}
    try:
        owner = os.environ.get("CREDENTIALS_SPEND_OWNER", "gem").split(".")[0]
        tick["credentialsSpend"] = (credentials_spend.tick(host.state, HERE.parents[1]) if HOST == owner else
                                    {"status": "not-owner", "owner": owner})
    except Exception as error:  # registry freshness never takes dispatch down
        tick["credentialsSpend"] = {"status": "error", "error": type(error).__name__}
    try:
        # Daily model-family sync (model_family_sync.py): provider lists -> registry PR, stale alarm.
        owner = os.environ.get("CREDENTIALS_SPEND_OWNER", "gem").split(".")[0]
        tick["modelFamilySync"] = (model_family_sync.tick(host.state, host.repo) if HOST == owner else {"status": "not-owner"})
    except Exception as error:  # registry freshness never takes dispatch down
        tick["modelFamilySync"] = {"status": "error", "error": type(error).__name__}
    try:
        # Live quota reads (Codex ledger, Grok /usage) for the capacity registry; metadata only.
        tick["capacityLive"] = (capacity_live.tick(host.state) if HOST == os.environ.get("CREDENTIALS_SPEND_OWNER", "gem").split(".")[0]
                                else {"status": "not-owner"})
    except Exception as error:  # a registry read never takes dispatch down
        tick["capacityLive"] = {"status": "error", "error": type(error).__name__}
    update_json(host.state / "tick.json", lambda data: (data.clear(), data.update(tick)))
    try:
        run_doctor(host)
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


def remove_worktree(host: Host, worktree: Path) -> bool:
    """True only when clean, published source retired; retained work keeps its branch."""
    if not worktree.exists() or (worktree / disk_guard.PRESERVED_REPAIR).exists():
        return False
    # A maintenance child started before this config was in effect still holds
    # index.lock. Wait for it to leave; do not treat that writer as unpublished source.
    git_housekeeping.quiesce(worktree)
    busy = worktree_busy(worktree)
    if busy:
        record_worktree_disposition(host, worktree, "preserved", busy)
        preserve_repair(worktree, {"runId": worktree.name, "reasons": [f"cleanup-not-idle:{busy}"]})
        return False
    status = sh(["git", "status", "--porcelain", *disk_guard.SOURCE_PATHSPEC], cwd=worktree)
    if status.returncode or status.stdout.strip():
        record_worktree_disposition(host, worktree, "preserved", "source-unverified")
        preserve_repair(worktree, {"runId": worktree.name, "reasons": ["cleanup-source-unverified"]})
        return False
    reason = "publication-unverified"
    try:
        # Local refs (including HEAD itself) are not publication. Refresh every
        # origin branch atomically and prune deleted refs before trusting ancestry.
        fetched = sh(["git", "fetch", "-q", "--atomic", "--prune", "--no-tags",
                      "--no-recurse-submodules", "origin", "+refs/heads/*:refs/remotes/origin/*"],
                     cwd=worktree, timeout=30)
        head = (sh(["git", "rev-parse", "--verify", "HEAD"], cwd=worktree, timeout=30)
                if fetched.returncode == 0 else None)
        unpushed = (sh(["git", "rev-list", "--count", head.stdout.strip(), "--not", "--remotes=origin"],
                       cwd=worktree, timeout=30)
                    if head is not None and head.returncode == 0 and head.stdout.strip() else None)
        if unpushed is not None and unpushed.returncode == 0:
            count = unpushed.stdout.strip()
            if count == "0":
                reason = None
            elif count.isdecimal():
                reason = "unpublished-work"
    except (OSError, subprocess.SubprocessError):
        pass  # unknown publication is never permission to destroy source
    if reason:
        record_worktree_disposition(host, worktree, "preserved", reason)
        preserve_repair(worktree, {"runId": worktree.name, "reasons": [f"cleanup-{reason}"]})
        return False
    # The origin read may have taken time; recheck live ownership and source.
    git_housekeeping.quiesce(worktree)
    busy = worktree_busy(worktree)
    status = sh(["git", "status", "--porcelain", *disk_guard.SOURCE_PATHSPEC], cwd=worktree)
    current_head = sh(["git", "rev-parse", "--verify", "HEAD"], cwd=worktree, timeout=30)
    if (busy or status.returncode or status.stdout.strip() or current_head.returncode or
            current_head.stdout.strip() != head.stdout.strip()):
        reason = f"cleanup-not-idle:{busy}" if busy else "cleanup-source-unverified"
        record_worktree_disposition(host, worktree, "preserved", reason)
        preserve_repair(worktree, {"runId": worktree.name, "reasons": [reason]})
        return False
    # Proven clean and published: hand it to the next run installed, instead of spending
    # minutes deleting ~230k node_modules files (JOV-7723).
    slot = worktree_pool.recycle(host.repo, worktree)
    record_worktree_disposition(host, worktree, "recycled" if slot else "removed", slot)
    if not slot:
        removed, _error = git_housekeeping.remove_linked_worktree(
            lambda args: sh(["git", *args], cwd=host.repo, timeout=120), worktree)
        return removed
    return True


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
    sh(["git", "worktree", "prune"], cwd=host.repo)


def needs_update(current_tree: str | None, main_tree: str) -> bool:
    return bool(main_tree) and current_tree != main_tree


def read_marker(host: Host) -> str | None:
    try:
        return (host.state / "current" / ".tree").read_text().strip()[:7]
    except OSError:
        return None


MIRROR_FETCH_TIMEOUT_S = 300
SKILLS_TIMEOUT_S = 120
CODEX_LANE_SKILLS = ("autoreview", "behavior-validator")


def object_mirror(repo: Path) -> Path | None:
    """The bare mirror this clone borrows objects from (objects/info/alternates). Only a bare
    repository qualifies: on the Mac the alternate is Tim's own checkout, whose branches a
    mirror fetch would overwrite."""
    try:
        lines = (repo / ".git/objects/info/alternates").read_text().splitlines()
    except OSError:
        return None
    for line in lines:
        objects = Path(line.strip())
        mirror = objects.parent
        if objects.name != "objects" or mirror.name == ".git" or not mirror.name.endswith(".git"):
            continue
        bare = subprocess.run(["git", "config", "--file", str(mirror / "config"), "--bool", "core.bare"],
                              capture_output=True, text=True, timeout=10)
        if bare.returncode == 0 and bare.stdout.strip() == "true":
            return mirror
    return None


# A borrowing clone's refs are invisible to the mirror's gc. With these, pruned mirror refs
# never take objects with them (2026-10-12: one auto-gc after a minutely fetch dropped the
# objects of three lanes rebase branches and every origin fetch on Gem died "bad object").
MIRROR_KEEP_OBJECTS = (("gc.auto", "0"), ("gc.pruneExpire", "never"), ("gc.reflogExpireUnreachable", "never"))


def ensure_mirror_keeps_objects(mirror: Path) -> None:
    config = mirror / "config"
    for key, value in MIRROR_KEEP_OBJECTS:
        current = subprocess.run(["git", "config", "--file", str(config), "--get", key],
                                 capture_output=True, text=True, timeout=10).stdout.strip()
        if current != value:
            subprocess.run(["git", "config", "--file", str(config), key, value],
                           check=True, capture_output=True, timeout=10)


def missing_object_refs(repo: Path) -> list[str]:
    """Local refs whose objects this clone (alternates included) no longer has."""
    listing = subprocess.run(["git", "for-each-ref", "--format=%(objectname) %(refname)"], cwd=repo,
                             capture_output=True, text=True, timeout=60)
    refs = [line.split(" ", 1) for line in listing.stdout.splitlines() if " " in line]
    if listing.returncode or not refs:
        return []
    checked = subprocess.run(["git", "cat-file", "--batch-check=%(objectname)"], cwd=repo,
                             input="".join(f"{sha}\n" for sha, _ in refs), capture_output=True, text=True, timeout=120)
    missing = {line.split()[0] for line in checked.stdout.splitlines() if line.endswith(" missing")}
    return [ref for sha, ref in refs if sha in missing]


def fetch_release_source(host: Host) -> subprocess.CompletedProcess:
    """update's own origin fetch. A ref whose objects are gone cannot be repaired by any later
    fetch and blocks every one of them, so only such refs are deleted, then the fetch is retried
    once. Refs with present objects are never touched."""
    fetched = sh(["git", "fetch", "-q", "origin", "main"], cwd=host.repo)
    if fetched.returncode == 0 or not re.search(r"bad object|did not send all necessary objects",
                                                f"{fetched.stdout}{fetched.stderr}"):
        return fetched
    broken = missing_object_refs(host.repo)
    if not broken:
        return fetched
    for ref in broken:
        subprocess.run(["git", "update-ref", "-d", ref], cwd=host.repo, capture_output=True, timeout=30)
    print(f"lane update: deleted {len(broken)} ref(s) with missing objects: {', '.join(broken)[:300]}",
          file=sys.stderr)
    return sh(["git", "fetch", "-q", "origin", "main"], cwd=host.repo)


def refresh_object_mirror(host: Host) -> dict:
    """Refresh the shared object mirror right before update's own origin fetch, under the lock
    every mirror writer takes (/srv/git/locks/<name>-mirror.lock). Replaces Gem's retired
    jovie-git-mirror-refresh timer: the mirror moves on the same event the clone does."""
    mirror = object_mirror(host.repo)
    if mirror is None:
        return {"status": "no-mirror"}
    lock_path = mirror.parent.parent / "locks" / f"{mirror.name.removesuffix('.git').lower()}-mirror.lock"
    try:
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        with open(lock_path, "a") as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return {"status": "busy", "mirror": str(mirror)}
            ensure_mirror_keeps_objects(mirror)
            fetched = lifecycle.run(["git", "-c", "gc.auto=0", "-c", "maintenance.auto=false", "-C", str(mirror),
                                     "fetch", "--quiet", "--prune", "origin", "+refs/*:refs/*"],
                                    capture_output=True, text=True, timeout=MIRROR_FETCH_TIMEOUT_S)
    except subprocess.TimeoutExpired:
        return {"status": "timeout", "mirror": str(mirror)}
    except (OSError, subprocess.CalledProcessError) as error:
        return {"status": "error", "mirror": str(mirror), "error": f"{type(error).__name__}: {error}"[:200]}
    if fetched.returncode:
        return {"status": "failed", "mirror": str(mirror), "error": (fetched.stderr or "").strip()[-200:]}
    return {"status": "fetched", "mirror": str(mirror), "at": now_iso()}


def refresh_codex_skills(host: Host, home: Path | None = None) -> dict:
    """Keep the codex lanes' skills current from ~/agent-skills (retired update-agent-skills.sh
    cron). One ls-remote per update; fetch, fast-forward and reinstall only when main moved or
    the last install did not finish."""
    home = Path.home() if home is None else home
    source, receipt = home / "agent-skills", host.state / "codex-skills.json"
    if not (source / ".git").exists():
        return {"status": "no-source"}
    def git(*args):
        return lifecycle.run(["git", "-C", str(source), *args], capture_output=True, text=True, timeout=SKILLS_TIMEOUT_S)
    try:
        remote = git("ls-remote", "origin", "refs/heads/main")
        head = git("rev-parse", "HEAD").stdout.strip()
        wanted = remote.stdout.split()[0] if remote.returncode == 0 and remote.stdout.split() else None
        if not wanted:
            return {"status": "remote-unavailable"}
        installed = read_json(receipt).get("installed")
        if wanted == head and installed == head:
            return {"status": "current", "head": head[:12]}
        if wanted != head:
            for step in (("fetch", "-q", "origin", "main"), ("merge", "--ff-only", "-q", "FETCH_HEAD")):
                result = git(*step)
                if result.returncode:
                    return {"status": "failed", "step": step[0], "error": (result.stderr or "").strip()[-200:]}
        install = lifecycle.run([sys.executable, "scripts/install-skills", "--target", str(home / ".codex/skills"),
                                 *CODEX_LANE_SKILLS, "--force"], cwd=source, capture_output=True, text=True,
                                timeout=SKILLS_TIMEOUT_S)
        if install.returncode:
            return {"status": "failed", "step": "install", "error": (install.stderr or "").strip()[-200:]}
    except subprocess.TimeoutExpired:
        return {"status": "timeout"}
    except OSError as error:
        return {"status": "error", "error": f"{type(error).__name__}: {error}"[:200]}
    atomic_write_text(receipt, json.dumps({"installed": wanted, "at": now_iso()}))
    return {"status": "updated", "from": head[:12], "to": wanted[:12]}


def host_maintenance(host: Host, step) -> dict:
    """Host upkeep riding the update event; never fatal, never inside a release self-test."""
    if os.environ.get("LANES_SELFTEST"):
        return {"status": "selftest-skipped"}
    try:
        return step(host)
    except Exception as error:
        return {"status": "error", "error": f"{type(error).__name__}: {error}"[:200]}


def update(host: Host) -> int:
    """Install origin/main's scripts/lanes as a new release after its own tests pass.
    Only the `current` symlink moves; running workers finish on their release. The outcome is
    written to update.json so a refused release is an alert, not a traceback in a journal."""
    lifecycle.HEARTBEAT = host.state / "tick-heartbeat"  # the self-test is minutes long; its keepalive proves progress
    lifecycle.beat()
    # Single flight: two updaters take the gate-admission lock and the seats from each other, so each
    # reads gate-admission-busy (3 concurrent `lane_runner update` at 17:07Z 2026-10-25, one of them a
    # manual retry loop, kept #23268 from installing). A second caller exits without touching update.json.
    single = Locked(host.state / "locks" / "update.lock", blocking=False)
    if not single.held:
        print("lane update: update already running", file=sys.stderr)
        return 0
    try:
        return _update_locked(host)
    finally:
        single.release()


def _update_locked(host: Host) -> int:
    mirror = host_maintenance(host, refresh_object_mirror)  # before install_release's origin fetch
    before = read_marker(host)
    try:
        code = install_release(host)
        error = None if code == 0 else "release tests failed"
    except Exception as failure:
        code, error = 1, f"{type(failure).__name__}: {failure}"[:300]
    skills = host_maintenance(host, refresh_codex_skills)
    lag = host_maintenance(host, lambda h: install_lag(h, before, error))
    update_json(host.state / "update.json", lambda data: (data.clear(), data.update(
        at=now_iso(), ok=code == 0, error=error, current=read_marker(host), mirror=mirror, skills=skills,
        behindS=lag.get("behindS"), behindCommit=lag.get("behindCommit"))))
    host_maintenance(host, lambda h: update_drain.finish(h.state, lag.get("behindS")) or {"status": "no-drain"})
    return code


# Install lag is a stage: merge -> installed. Gem releases (59 since 10-23): p50 22 min, p80 85, p95 215,
# max 251. 10-25: a flaky self-test refusal (07:39) held three builds 90-111 min; a 60 min wait for a
# gate seat held #23123. update.json carries behindS while a lane-affecting main commit is not
# installed, update-lag.jsonl one row per install, and the doctor alerts past its INSTALL_LAG_ALERT_S (90 min).
def install_lag(host: Host, before: str | None, error: str | None) -> dict:
    """{'behindS', 'behindCommit'} while main's lane bundle is not installed; one lag row per install."""
    if os.environ.get("LANES_SELFTEST"):
        return {"status": "selftest-skipped"}
    bundle = release_identity(host)
    paths = sorted(bundle["objects"])
    stamp = lambda ref: sh(["git", "log", "-1", "--format=%ct %H", ref, "--", *paths], cwd=host.repo).stdout.split()
    marker = host.state / "current" / ".bundle"
    installed = marker.read_text().strip() if marker.exists() else None
    now = time.time()
    newest = stamp(bundle["sourceCommit"])
    commit_at = float(newest[0]) if newest else None
    if installed == bundle["bundleDigest"]:
        after = read_marker(host)
        if before is not None and after != before and commit_at is not None:
            row = {"schema": "jovie-install-lag/v1", "at": now_iso(), "commit": bundle["sourceCommit"],
                   "commitAt": commit_at, "installedAt": now, "lagS": round(now - commit_at), "from": before, "to": after}
            with open(host.state / "update-lag.jsonl", "a") as out:
                out.write(json.dumps(row) + "\n")
        return {"behindS": 0, "behindCommit": None}
    return {"behindS": round(now - commit_at) if commit_at is not None else None,
            "behindCommit": bundle["sourceCommit"], "why": error}


def release_paths(repo: Path, revision: str) -> list[str]:
    """Managed bundle paths that exist at `revision`. The installed LANE_TESTS and RELEASE_EXTRAS
    describe the installed release, not the incoming one: a file deleted upstream (#23510 removed
    ops/registry/third-party-grants.jsonl on 2026-10-28) made every later update refuse with
    release-bundle-incomplete for good, because the old updater could never install the release
    that no longer lists it. Missing extras and tests drop out of the bundle; scripts/lanes is mandatory."""
    wanted = sorted({"scripts/lanes", *RELEASE_EXTRAS, *LANE_TESTS})
    listing = subprocess.run(["git", "ls-tree", "--name-only", revision, "--", *wanted], cwd=repo,
                             capture_output=True, text=True)
    present = set(listing.stdout.splitlines())
    if listing.returncode or "scripts/lanes" not in present:
        raise RuntimeError("release-bundle-incomplete")
    return [path for path in wanted if path in present]


def ensure_dependency_pool(host: Host) -> bool:
    """The mesh runtime compiles against a pool slot restored from a recent lock; slots age out after
    three days and an aged pool made every release refuse 'mesh runtime dependency closure failed'
    (Gem, 2026-10-26 to 10-29). Refill before building when no ready slot remains. True when a fill ran."""
    try:
        if not worktree_pool.enabled() or worktree_pool.ready_slots(worktree_pool.pool_dir(host.repo)):
            return False
        print("lane update: dependency pool has no ready slot; refilling before the release build", file=sys.stderr)
        worktree_pool.fill(host.repo, warm=False, log=sys.stderr)
        return True
    except (OSError, subprocess.SubprocessError) as error:
        print(f"lane update: dependency pool refill failed: {error}", file=sys.stderr)
        return False


def release_identity(host: Host) -> dict:
    """Pin one main commit, then fingerprint exactly the managed release contents."""
    read = sh(["git", "rev-parse", "--verify", "origin/main^{commit}"], cwd=host.repo)
    revision = read.stdout.strip()
    if read.returncode or not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise RuntimeError("release-source-unavailable")
    paths = release_paths(host.repo, revision)
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


# Host credentials and identity files must not reach the self-test either. A fixture that fell
# through to the live host read ~/.config/jovie-lanes/autoscale.env, the legacy Linear backoff
# under ~/.local/state, claude.env and linear.env, and ran real authenticated `gh pr list`
# calls, so a selector could pass on a laptop and fail only on Gem (2026-10-11).
HOST_CREDENTIAL_PREFIXES = ("GH_", "GITHUB_", "LINEAR_", "JOVIE_BOT_", "JOVIE_GITHUB_", "CODEX_HOME", "XDG_")


# Every process a release self-test starts inherits this per-run marker. A detached child
# (start_new_session) leaves the helper's process group and can outlive it, but it cannot shed
# its environment, so the marker finds it. Not under LANES_: nested selftest_env calls keep it.
SELFTEST_RUN_ENV = "JOVIE_SELFTEST_RUN"
SELFTEST_SCOPES_ENV = "JOVIE_SELFTEST_SCOPES"
SELFTEST_CLEANUP_SCHEMA = "jovie-selftest-cleanup/v1"


class SelftestCleanupHeld(RuntimeError):
    """A proof cannot report cleanup when process custody is incomplete."""
    def __init__(self, message, *, pid=None, start=None, observed_start=None, source=None, error=None,
                 lineage=None):
        super().__init__(message)
        self.code = str(message).split(":", 1)[0]
        self.observation = None
        if type(pid) is int and pid > 0 and source in {"proc-stat", "proc-environ", "proc-directory", "scope-owner"}:
            self.observation = {"pid": pid, "source": source, "errorCode": self.code,
                                "errno": getattr(error, "errno", None)}
            if isinstance(lineage, list):
                self.observation["lineage"] = lineage[:16]
            for key, value in (("start", start), ("observedStart", observed_start)):
                if isinstance(value, str) and re.fullmatch(r"linux:[1-9][0-9]*", value):
                    self.observation[key] = value


def _selftest_process_row(entry: Path, pid: int, uid: int) -> tuple | None:
    """Read one allowed proc identity; snapshot absence cannot prove a live PID absent."""
    start = None
    try:
        if entry.stat().st_uid != uid:
            return None
        raw = (entry / "stat").read_text()
        prefix, rest = raw.rsplit(")", 1)
        fields = rest.split()
        if (int(prefix.split("(", 1)[0]) != pid or len(fields) < 20
                or not fields[19].isdecimal() or int(fields[19]) <= 0):
            raise ValueError("invalid Linux process birth")
        start = "linux:" + fields[19]
        row = (int(fields[1]), int(fields[2]), fields[0], start)
        if entry.stat().st_uid != uid:
            raise SelftestCleanupHeld("selftest-process-uid-changed", pid=pid, start=start, source="proc-stat")
        return row
    except (FileNotFoundError, ProcessLookupError) as error:
        # Both ENOENT and ESRCH can race process exit while proc is read. Only
        # a fresh missing-directory observation proves absence; a live/reused
        # directory or another unreadable observation still holds cleanup.
        try:
            entry.stat()
        except FileNotFoundError:
            return None  # proc confirms this enumerated directory no longer exists
        except OSError as observation_error:
            raise SelftestCleanupHeld("selftest-process-birth-unavailable", pid=pid, start=start,
                                      source="proc-stat", error=observation_error) from observation_error
        code = ("selftest-process-birth-missing" if isinstance(error, FileNotFoundError)
                else "selftest-process-birth-unavailable")
        raise SelftestCleanupHeld(code, pid=pid, start=start,
                                  source="proc-stat", error=error) from error
    except (OSError, ValueError, IndexError) as error:
        raise SelftestCleanupHeld("selftest-process-birth-unavailable", pid=pid, start=start,
                                  source="proc-stat", error=error) from error


def _selftest_process_rows() -> dict:
    """Keep the maintained inventory, with Linux birth ticks instead of rounded lstart."""
    proc = Path("/proc")
    if not proc.is_dir():
        raise SelftestCleanupHeld("selftest-scoped-cleanup-platform-unsupported")
    found = {}
    for pid in process_snapshot():
        row = _selftest_process_row(proc / str(pid), pid, os.getuid())
        if row is not None:
            found[pid] = row
    return found


def _selftest_lineage(value) -> list[str]:
    try:
        lineage = json.loads(value)
    except (TypeError, ValueError) as error:
        raise SelftestCleanupHeld("selftest-scope-lineage-malformed") from error
    if (not isinstance(lineage, list) or not 1 <= len(lineage) <= 32
            or any(not isinstance(part, str) or not re.fullmatch(r"[0-9a-f]{32}", part) for part in lineage)
            or len(set(lineage)) != len(lineage)):
        raise SelftestCleanupHeld("selftest-scope-lineage-malformed")
    return lineage


def selftest_env(scratch: Path, *, cleanup: dict | None = None) -> dict:
    env = {key: value for key, value in os.environ.items()
           if not key.startswith(HOST_KNOB_PREFIXES + HOST_CREDENTIAL_PREFIXES)}
    marker = env.get(SELFTEST_RUN_ENV) or uuid.uuid4().hex
    if not isinstance(marker, str) or not re.fullmatch(r"[0-9a-f]{32}", marker):
        raise SelftestCleanupHeld("selftest-root-marker-malformed")
    lineage = _selftest_lineage(env[SELFTEST_SCOPES_ENV]) if SELFTEST_SCOPES_ENV in env else []
    if lineage and SELFTEST_RUN_ENV not in env:
        raise SelftestCleanupHeld("selftest-scope-without-root")
    if len(lineage) >= 32:
        raise SelftestCleanupHeld("selftest-scope-depth-exceeded")
    scope = uuid.uuid4().hex
    lineage = [*lineage, scope]
    if cleanup is not None:
        if not isinstance(cleanup, dict) or cleanup:
            raise SelftestCleanupHeld("selftest-scope-receipt-must-be-fresh")
        rows = _selftest_process_rows()
        pid = os.getpid()
        if pid not in rows:
            raise SelftestCleanupHeld("selftest-scope-owner-unavailable")
        # Existing identities cannot inherit a nonce that has not been returned yet.
        cleanup.update(schema=SELFTEST_CLEANUP_SCHEMA, run=marker, scope=scope, lineage=lineage,
                       owner={"pid": pid, "start": rows[pid][3], "uid": os.getuid()},
                       baseline={pid: row[3] for pid, row in rows.items()})
    # The root marker survives nesting for outer cleanup of detached descendants;
    # the fresh endpoint limits an inner cleanup to its own subtree.
    env.update({SELFTEST_RUN_ENV: marker, SELFTEST_SCOPES_ENV: json.dumps(lineage, separators=(",", ":"))})
    shim = str(Path(os.environ.get("LANES_STATE", Path.home() / ".local/state/jovie-lanes")) / "bin")
    if "PATH" in env:
        env["PATH"] = os.pathsep.join(entry for entry in env["PATH"].split(os.pathsep) if entry.rstrip("/") != shim)
    return git_housekeeping.apply_fixture_env(
        {**env, "HOME": str(Path(scratch) / "home"), "LANES_SELFTEST": "1", "LANES_STATE": str(scratch)})


def _selftest_cleanup_rows(cleanup: dict) -> dict:
    if not isinstance(cleanup, dict) or cleanup.get("schema") != SELFTEST_CLEANUP_SCHEMA:
        raise SelftestCleanupHeld("selftest-scope-receipt-required")
    marker, scope = cleanup.get("run"), cleanup.get("scope")
    if (not isinstance(marker, str) or not re.fullmatch(r"[0-9a-f]{32}", marker)
            or not isinstance(scope, str) or not re.fullmatch(r"[0-9a-f]{32}", scope)):
        raise SelftestCleanupHeld("selftest-scope-receipt-malformed")
    lineage = _selftest_lineage(json.dumps(cleanup.get("lineage")))
    owner, baseline = cleanup.get("owner"), cleanup.get("baseline")
    if (lineage[-1] != scope or not isinstance(owner, dict) or not isinstance(baseline, dict)
            or type(owner.get("pid")) is not int or owner["pid"] != os.getpid()
            or type(owner.get("uid")) is not int or owner["uid"] != os.getuid()
            or not isinstance(owner.get("start"), str) or not owner["start"]
            or baseline.get(owner["pid"]) != owner["start"]
            or any(type(pid) is not int or pid <= 0 or not isinstance(start, str) or not start
                   for pid, start in baseline.items())):
        raise SelftestCleanupHeld("selftest-scope-owner-malformed")
    rows = _selftest_process_rows()
    if owner["pid"] not in rows or rows[owner["pid"]][3] != owner["start"]:
        raise SelftestCleanupHeld("selftest-scope-owner-changed", pid=owner["pid"],
                                  start=owner["start"], source="scope-owner")
    return rows


def _proc_identity(pid: int) -> tuple[int, int, str] | None:
    """(uid, ppid, birth) of any process, readable even when its environ is not."""
    try:
        entry = Path("/proc") / str(pid)
        uid = entry.stat().st_uid
        fields = (entry / "stat").read_text().rsplit(")", 1)[1].split()
        if len(fields) < 20 or not fields[1].isdecimal() or not fields[19].isdecimal():
            return None
        return uid, int(fields[1]), "linux:" + fields[19]
    except (OSError, ValueError, IndexError):
        return None


def _birth(start: str) -> int:
    return int(start.split(":", 1)[1])


def _foreign_lineage(pid: int, start: str, cleanup: dict, identity=_proc_identity) -> bool:
    """True only when an unreadable process provably is not a self-test descendant.

    A non-dumpable same-UID process (sshd/ssh session, ssh-agent) refuses its environ
    (EACCES, Gem 2026-10-20 and CI ejections of #22305/#22308). A self-test descendant
    only ever has self-test descendants, the owner, the owner's own ancestors or init in
    its parent chain (orphans reparent to an ancestor subreaper or init). So the first
    ancestor that is none of those and is provably not a descendant (another UID, or alive
    with the same birth since before the self-test began) proves the process foreign.
    Every parent must predate its child (a reused PID cannot pass). Anything else holds."""
    owner = cleanup["owner"]["pid"]
    ancestors, cursor = set(), owner
    for _ in range(64):
        found = identity(cursor)
        if found is None or found[1] <= 1:
            break
        ancestors.add(found[1])
        cursor = found[1]
    current, expected = pid, start
    for _ in range(64):
        found = identity(current)
        if found is None or found[2] != expected:
            return False  # gone or reused since observed: unproven
        child_birth = _birth(expected)
        parent = found[1]
        if parent <= 1 or parent == owner or parent in ancestors:
            return False
        observed = identity(parent)
        if observed is None or _birth(observed[2]) > child_birth:
            return False
        if observed[0] != cleanup["owner"]["uid"] or cleanup["baseline"].get(parent) == observed[2]:
            return True
        current, expected = parent, observed[2]
    return False


def _lineage_evidence(pid: int, cleanup: dict, identity=_proc_identity) -> list[dict]:
    """Why an unreadable process could not be proven foreign: each parent hop's role, with
    only a sanitized command name (no environment, arguments or paths). CI ejections of
    #22378 kept failing after #22316; this records the chain instead of guessing."""
    owner = cleanup["owner"]["pid"]
    ancestors, cursor = set(), owner
    for _ in range(64):
        found = identity(cursor)
        if found is None or found[1] <= 1:
            break
        ancestors.add(found[1])
        cursor = found[1]
    hops, current = [], pid
    for _ in range(16):
        found = identity(current)
        if found is None:
            hops.append({"pid": current, "gone": True})
            break
        try:
            comm = (Path("/proc") / str(current) / "comm").read_text().strip()
        except OSError:
            comm = ""
        hops.append({"pid": current, "comm": re.sub(r"[^A-Za-z0-9._-]", "_", comm)[:16],
                     "sameUid": found[0] == cleanup["owner"]["uid"], "birth": found[2],
                     "baseline": cleanup["baseline"].get(current) == found[2],
                     "owner": current == owner, "ownerAncestor": current in ancestors, "parent": found[1]})
        if current == owner or current in ancestors or found[1] <= 1:
            break
        current = found[1]
    return hops


def marked_processes(cleanup: dict) -> dict[int, str]:
    """Select only same-UID members of an explicit cleanup subtree, with birth identities."""
    _selftest_cleanup_rows(cleanup)
    proc = Path("/proc")
    if not proc.is_dir():
        # ps -E command text cannot prove environment custody. Darwin remains held
        # until JOV-8517 supplies a separately reviewed authoritative reader.
        raise SelftestCleanupHeld("selftest-scoped-cleanup-platform-unsupported")
    found = {}
    try:
        for entry in proc.iterdir():
            if not entry.name.isdecimal():
                continue
            pid = int(entry.name)
            if pid == cleanup["owner"]["pid"]:
                continue
            try:
                # A process may be born or reused between ps and proc enumeration.
                # Read this entry directly before any baseline exclusion or custody read.
                row = _selftest_process_row(entry, pid, cleanup["owner"]["uid"])
                if row is None:
                    continue  # proc proves gone, or there is no authority over this UID
                if row[2].startswith("Z") or cleanup["baseline"].get(pid) == row[3]:
                    continue
                raw = (entry / "environ").read_bytes()
            except FileNotFoundError:
                if _selftest_process_row(entry, pid, cleanup["owner"]["uid"]) is None:
                    continue
                raise SelftestCleanupHeld("selftest-process-custody-raced", pid=pid,
                                          start=row[3], source="proc-environ")
            except OSError as error:
                # After a failed environment read, the process may have exited
                # since its initial birth observation. Only fresh authoritative
                # absence or a same-birth zombie proves that it cannot execute.
                after = _selftest_process_row(entry, pid, cleanup["owner"]["uid"])
                if after is None:
                    continue
                if after[3] != row[3]:
                    raise SelftestCleanupHeld("selftest-process-identity-changed", pid=pid,
                                              start=row[3], observed_start=after[3],
                                              source="proc-stat") from error
                if after[2].startswith("Z"):
                    continue
                if _foreign_lineage(pid, row[3], cleanup):
                    continue  # provably outside the self-test: a non-dumpable sshd/ssh, xdist sibling
                raise SelftestCleanupHeld("selftest-process-custody-unreadable", pid=pid,
                                          start=row[3], source="proc-environ", error=error,
                                          lineage=_lineage_evidence(pid, cleanup)) from error
            pairs = [part.split(b"=", 1) for part in raw.split(b"\0") if b"=" in part]
            roots = [value for key, value in pairs if key == SELFTEST_RUN_ENV.encode()]
            if not roots or roots == [b""]:
                continue
            if len(roots) != 1:
                raise SelftestCleanupHeld("selftest-root-marker-ambiguous", pid=pid, start=row[3], source="proc-environ")
            if roots[0] != cleanup["run"].encode():
                continue
            scopes = [value for key, value in pairs if key == SELFTEST_SCOPES_ENV.encode()]
            if len(scopes) != 1:
                raise SelftestCleanupHeld("selftest-process-scope-missing", pid=pid, start=row[3], source="proc-environ")
            try:
                lineage = _selftest_lineage(scopes[0].decode("utf-8"))
            except (UnicodeError, SelftestCleanupHeld) as error:
                raise SelftestCleanupHeld("selftest-process-scope-malformed", pid=pid, start=row[3], source="proc-environ") from error
            if cleanup["scope"] not in lineage:
                continue  # valid sibling or ancestor scope
            if lineage[:len(cleanup["lineage"])] != cleanup["lineage"]:
                raise SelftestCleanupHeld("selftest-process-scope-changed", pid=pid, start=row[3], source="proc-environ")
            found[pid] = row[3]
    except OSError as error:
        raise SelftestCleanupHeld("selftest-process-observation-unavailable") from error
    _selftest_cleanup_rows(cleanup)
    for pid, start in tuple(found.items()):
        after = _selftest_process_row(proc / str(pid), pid, cleanup["owner"]["uid"])
        if after is None:
            del found[pid]
        elif after[3] != start:
            raise SelftestCleanupHeld("selftest-process-identity-changed", pid=pid, start=start,
                                      observed_start=after[3], source="proc-stat")
    return found


def _selftest_cleanup_summary(cleanup: dict) -> dict:
    if "diagnostic" not in cleanup:
        digest = lambda value: hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        cleanup["diagnostic"] = {"schema": "jovie-selftest-cleanup-summary/v1",
            "source": str(Path(__file__).resolve()), "sourceSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "sender": dict(cleanup.get("owner", {})), "runDigest": digest(cleanup.get("run")),
            "scopeDigest": digest(cleanup.get("scope")), "lineageDigest": digest(cleanup.get("lineage")),
            "attempts": [], "outcome": "pending"}
    return cleanup["diagnostic"]


def _selftest_cleanup_failure(cleanup: dict, error: BaseException) -> dict:
    """Retain only typed observation facts in the existing proof diagnostic."""
    summary = _selftest_cleanup_summary(cleanup)
    summary.update(outcome="held", errorCode=error.code if isinstance(error, SelftestCleanupHeld)
                   else "selftest-cleanup-observation-failed",
                   errno=getattr(error, "errno", getattr(error.__cause__, "errno", None)))
    if isinstance(error, SelftestCleanupHeld) and error.observation is not None:
        summary["observation"] = dict(error.observation)
    return summary


def reap_selftest_processes(cleanup: dict) -> int:
    """Drain one explicit subtree using Linux PID handles; never fall back to PID signals."""
    import signal
    summary = _selftest_cleanup_summary(cleanup) if isinstance(cleanup, dict) else None
    attempt = None
    try:
        _selftest_cleanup_rows(cleanup)
        if not callable(getattr(os, "pidfd_open", None)) or not callable(getattr(signal, "pidfd_send_signal", None)):
            raise SelftestCleanupHeld("selftest-pidfd-unavailable")
        leftovers = marked_processes(cleanup)
        for sig, grace in ((signal.SIGTERM, 3), (signal.SIGKILL, 2)):
            alive = marked_processes(cleanup)
            if not alive:
                break
            for pid, start in alive.items():
                attempt = {"target": {"pid": pid, "start": start}, "signal": int(sig), "outcome": "opening"}
                summary["attempts"].append(attempt)
                descriptor = None
                try:
                    descriptor = os.pidfd_open(pid, 0)
                    # The handle pins this process. Validate birth and scope after opening
                    # it; a PID reused after these reads cannot redirect the signal.
                    _selftest_cleanup_rows(cleanup)
                    current = _selftest_process_row(Path("/proc") / str(pid), pid, cleanup["owner"]["uid"])
                    if current is None or current[3] != start:
                        raise SelftestCleanupHeld("selftest-signal-target-changed", pid=pid, start=start,
                                                  observed_start=current[3] if current else None, source="proc-stat")
                    fresh = marked_processes(cleanup)
                    if fresh.get(pid) != start:
                        raise SelftestCleanupHeld("selftest-signal-custody-changed", pid=pid, start=start, source="proc-environ")
                    signal.pidfd_send_signal(descriptor, sig, None, 0)
                    attempt["outcome"] = "sent"
                except OSError as error:
                    raise SelftestCleanupHeld("selftest-pidfd-refused", pid=pid, start=start, source="proc-stat", error=error) from error
                finally:
                    if descriptor is not None:
                        os.close(descriptor)
            deadline = time.monotonic() + grace
            while time.monotonic() < deadline and marked_processes(cleanup):
                time.sleep(.05)
        if marked_processes(cleanup):
            raise SelftestCleanupHeld("selftest-cleanup-unproven")
        summary["outcome"] = "drained"
        return len(leftovers)
    except BaseException as error:
        if summary is not None:
            summary = _selftest_cleanup_failure(cleanup, error)
            if attempt is not None and attempt["outcome"] != "sent":
                attempt.update(outcome="held", errorCode=summary["errorCode"], errno=summary["errno"])
        raise

# The installed packages mesh-runtime-bundle.mjs compiles against (exact pins checked there).
MESH_DEPENDENCY_PINS = ("apps/desktop/node_modules/esbuild/package.json",
                        "packages/agent-transport-contracts/node_modules/zod/package.json")


def mesh_dependency_roots(host: Host, source_root: Path | None = None) -> list[Path]:
    """Prefer dependencies restored from the staged lock, then the existing compatible
    host/pool fallback. The runtime compiler still validates every exact dependency pin."""
    def installed(root: Path) -> bool:
        return all((root / pin).is_file() for pin in MESH_DEPENDENCY_PINS)
    try:
        source_lock = (source_root / "pnpm-lock.yaml").read_bytes() if source_root else None
    except OSError:
        source_lock = None

    def restored_for_source(root: Path) -> bool:
        if source_lock is None:
            return False
        try:
            return all((root / name).read_bytes() == source_lock
                       for name in ("pnpm-lock.yaml", "node_modules/.pnpm/lock.yaml"))
        except OSError:
            return False

    host_installed = installed(host.repo)
    try:
        slots = worktree_pool.ready_slots(worktree_pool.pool_dir(host.repo))
    except (OSError, subprocess.CalledProcessError):
        slots = []
    installed_slots = [slot for slot in slots if installed(slot)]
    # A retained product checkout can differ in unrelated lock entries while its
    # mesh pins remain compatible; only the compiler may admit that fallback.
    candidates = ([host.repo] if host_installed else []) + installed_slots
    matching = [root for root in candidates if restored_for_source(root)]
    return matching + [root for root in candidates if root not in matching]


def retain_selftest_diagnostic(staging: Path, stderr, returncode, *, timed_out=False, leftovers=0, cleanup=None) -> None:
    raw = stderr if isinstance(stderr, bytes) else (stderr or "").encode()
    diagnostic = {"schema": "jovie-lane-selftest-diagnostic/v1", "returncode": returncode,
                  "timedOut": timed_out, "observedAt": now_iso(), "leftoverProcesses": leftovers,
                  "failedSelectors": re.findall(r"^(?:FAIL|ERROR): ([A-Za-z0-9_.]+ \([A-Za-z0-9_.]+\))",
                                                raw.decode(errors="replace"), re.MULTILINE),
                  "stderrSha256": hashlib.sha256(raw).hexdigest(), "stderrBytes": len(raw)}
    if cleanup is not None:
        diagnostic["cleanup"] = _selftest_cleanup_summary(cleanup)
    for filename, content in ((".selftest-diagnostic.json", json.dumps(diagnostic).encode()),
                              (".selftest-stderr.log", raw[:4 * 1024 * 1024])):
        fd = os.open(staging / filename, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "wb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())


def complete_staged_bundle(host: Host, staging: Path) -> str | None:
    """An older installer archives with *its* LANE_TESTS, so a release that adds a test file was
    staged without it and refused forever (2026-10-11: test_lifecycle.py from #21225 kept Gem on
    a 10-10 release). Fill missing bundle paths from origin/main only when its scripts/lanes is
    byte-identical to the staged tree; anything else stays a refusal."""
    head = subprocess.run(["git", "rev-parse", "--verify", "origin/main^{commit}"], cwd=host.repo,
                          capture_output=True, text=True).stdout.strip()
    try:
        managed = release_paths(host.repo, head)
    except RuntimeError:
        return "release-bundle-incomplete"
    missing = [path for path in managed if not (staging / path).exists()]
    if not missing:
        return None
    def git(*args, **kwargs):
        return subprocess.run(["git", *args], cwd=host.repo, capture_output=True, **kwargs)
    revision = head
    listing = git("ls-tree", "-r", revision, "scripts/lanes", text=True)
    expected = {line.split("\t", 1)[1]: line.split()[2] for line in listing.stdout.splitlines()}
    lanes = staging / "scripts/lanes"
    # Importing this file already wrote __pycache__ beside it.
    staged = sorted(str(path.relative_to(staging)) for path in lanes.rglob("*")
                    if path.is_file() and "__pycache__" not in path.parts) if lanes.is_dir() else []
    if listing.returncode or not expected or staged != sorted(expected):
        return "release-bundle-incomplete"
    hashed = subprocess.run(["git", "hash-object", "--no-filters", "--stdin-paths"], cwd=staging,
                            input="\n".join(staged), capture_output=True, text=True)
    if hashed.returncode or hashed.stdout.split() != [expected[path] for path in staged]:
        return "release-bundle-incomplete"
    archive = git("archive", revision, *missing)
    if archive.returncode:
        return "release-bundle-incomplete"
    subprocess.run(["tar", "-x", "-C", str(staging)], input=archive.stdout, check=True)
    # Tar restores directory mtimes, so importers may retain a missing-extra listing.
    importlib.invalidate_caches()
    return None


def prove_staging(host: Host, staging: Path) -> str | None:
    """Compile the mesh runtime and run the release self-test inside a staged tree. Returns the
    refusal reason, or None when the tree may be activated. Writes only under `staging`."""
    # The self-test must never touch this host's live state: point it at a scratch dir.
    scratch = staging / ".selftest-state"
    (scratch / "home").mkdir(parents=True, exist_ok=True)
    # Raw ports import workspace TypeScript/Zod. Compile from the immutable
    # archive with the host repo's existing identical pins before activation;
    # no dependency installation or running-worker mutation is permitted.
    runtime = None
    for dependency_root in mesh_dependency_roots(host, staging) or [host.repo]:
        # Pool take/fill/recycle share this inode lease. Retain it until the
        # compiler has finished reading dependencies, without claiming the slot.
        lease = nullcontext(True) if dependency_root == host.repo else worktree_pool.slot_lease(dependency_root)
        with lease as owned:
            if not owned:
                continue
            try:
                runtime = lifecycle.run(["node", str(staging / "scripts/lanes/mesh-runtime-bundle.mjs"),
                                         str(staging.resolve()), str(dependency_root.resolve())],
                                        cwd=staging, capture_output=True, text=True, timeout=60,
                                        env=worktree_pool.node_env(staging))
            except subprocess.TimeoutExpired:
                return "mesh runtime closure timeout"
            if runtime.returncode == 0:
                break
            generated = staging / "scripts/lanes/.mesh-runtime"
            if generated.exists() or generated.is_symlink():
                # Exclusive generated writes are not replayable after a partial
                # build. Preserve that refusal rather than reuse its output.
                print(runtime.stderr[-2000:], file=sys.stderr)
                return "mesh runtime dependency closure failed"
    else:
        if runtime is not None:
            print(runtime.stderr[-2000:], file=sys.stderr)
        return "mesh runtime dependency closure failed"
    # ~60 s on an idle host; simulator/xcodebuild load from other sessions (load avg ~600 on
    # 2026-09-28) pushed it past 300 s, so every release was refused and fixes never landed.
    cleanup = {}
    test, run_error = None, None
    leftovers = 0
    try:
        env = selftest_env(scratch, cleanup=cleanup)
        try:
            try:
                test = lifecycle.run([sys.executable, "-m", "unittest", "-q", *LANE_TESTS],
                                      cwd=staging, capture_output=True, text=True, timeout=UPDATE_TEST_TIMEOUT_S,
                                      env=env)
            except BaseException as error:
                run_error = error
                raise
        finally:
            leftovers = reap_selftest_processes(cleanup)
            if leftovers:
                print(f"release self-test left {leftovers} process(es) running; stopped", file=sys.stderr)
    except BaseException as error:
        original = run_error or error
        summary = _selftest_cleanup_summary(cleanup)
        if summary["outcome"] == "pending":
            _selftest_cleanup_failure(cleanup, error)
        stderr = getattr(original, "stderr", test.stderr if test is not None else "")
        retain_selftest_diagnostic(staging, stderr, test.returncode if test is not None else None,
                                  timed_out=isinstance(original, subprocess.TimeoutExpired),
                                  leftovers=leftovers, cleanup=cleanup)
        if isinstance(error, subprocess.TimeoutExpired):
            return f"self-test timeout {UPDATE_TEST_TIMEOUT_S}s"
        raise  # a cleanup hold must never become test success, timeout retry, or idle
    retain_selftest_diagnostic(staging, test.stderr, test.returncode, leftovers=leftovers, cleanup=cleanup)
    if test.returncode != 0:
        print(test.stderr[-2000:], file=sys.stderr)
        if not retry_failed_selectors(staging, test.stderr):
            # The tail above is often only ResourceWarnings; CI summaries keep these lines, so
            # an unbounded failure (import error, many failures) still names what broke.
            if selftest_retry_ids(test.stderr) is None:
                for line in selftest_failure_lines(test.stderr):
                    print("release self-test failure: " + line, file=sys.stderr)
            return "release tests failed"
    return None


SELFTEST_RETRY_MAX_SELECTORS = 5
SELFTEST_RETRY_TIMEOUT_S = 300
_SELFTEST_FAILURE = re.compile(r"^(?:FAIL|ERROR): ([A-Za-z_][A-Za-z0-9_]*) \(([A-Za-z0-9_.]+)\)$", re.MULTILINE)


def selftest_failure_lines(stderr, limit: int = 8) -> list[str]:
    """The FAIL/ERROR headers and exception lines of a unittest run, bounded for CI summaries."""
    text = stderr.decode(errors="replace") if isinstance(stderr, bytes) else (stderr or "")
    return [line[:300] for line in text.splitlines()
            if re.match(r"^(FAIL|ERROR): |^\w*(Error|Exception)\b", line)][:limit]


def selftest_retry_ids(stderr) -> list[str] | None:
    """Exact unittest ids of the failed test methods, or None when the failure is not a bounded
    set of method failures (import errors, class/module fixtures, a long list)."""
    text = stderr.decode(errors="replace") if isinstance(stderr, bytes) else (stderr or "")
    headers = re.findall(r"^(?:FAIL|ERROR): .*$", text, re.MULTILINE)
    found = _SELFTEST_FAILURE.findall(text)
    if not found or len(found) != len(headers) or len(found) > SELFTEST_RETRY_MAX_SELECTORS:
        return None
    ids = []
    for method, where in found:
        if not method.startswith("test") or "_FailedTest" in where:
            return None
        # Python >= 3.11 prints the full id in parentheses; older versions print the class.
        ids.append(where if where.endswith("." + method) else f"{where}.{method}")
    return sorted(set(ids))


def retry_failed_selectors(staging: Path, stderr) -> bool:
    """One flaky selector must not freeze every release: rerun exactly the failed test methods
    once on the same staged tree, with a fresh scratch state. A second failure (or anything
    that is not a bounded set of method failures) keeps the refusal. The receipt names the
    selectors that needed the retry."""
    ids = selftest_retry_ids(stderr)
    if not ids:
        return False
    scratch = staging / ".selftest-retry-state"
    (scratch / "home").mkdir(parents=True, exist_ok=True)
    cleanup = {}
    rerun, timeout, run_error, failure, passed = None, None, None, None, False
    try:
        env = selftest_env(scratch, cleanup=cleanup)
        try:
            try:
                rerun = lifecycle.run([sys.executable, "-m", "unittest", "-q", *ids], cwd=staging,
                                      capture_output=True, text=True, timeout=SELFTEST_RETRY_TIMEOUT_S, env=env)
                passed = rerun.returncode == 0
            except subprocess.TimeoutExpired as error:
                timeout = error
            except BaseException as error:
                run_error = error
                raise
        finally:
            reap_selftest_processes(cleanup)
    except BaseException as error:
        failure, passed = error, False
        summary = _selftest_cleanup_summary(cleanup)
        if summary["outcome"] == "pending":
            _selftest_cleanup_failure(cleanup, error)
    stderr = (timeout.stderr if timeout is not None else rerun.stderr if rerun is not None
              else getattr(run_error or failure, "stderr", "")) or ""
    raw = stderr if isinstance(stderr, bytes) else stderr.encode()
    receipt = {"schema": "jovie-lane-selftest-retry/v1", "selectors": ids, "passedOnRetry": passed,
               "observedAt": now_iso(), "returncode": rerun.returncode if rerun is not None else None,
               "timedOut": timeout is not None, "stderrSha256": hashlib.sha256(raw).hexdigest(),
               "stderrBytes": len(raw), "cleanup": _selftest_cleanup_summary(cleanup)}
    fd = os.open(staging / ".selftest-retry.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w") as handle:
        handle.write(json.dumps(receipt))
    if failure is not None:
        raise failure
    print(f"release self-test retry: {len(ids)} selector(s) {'passed' if passed else 'failed again'}; "
          "see .selftest-retry.json", file=sys.stderr)
    if not passed:
        # The staged tree and its receipt are gone once the update is refused, and CI
        # summaries keep only these lines: name what failed (2026-10-21 merge-group ejections
        # said only "release tests failed").
        print("release self-test failed selector(s): " + ", ".join(ids), file=sys.stderr)
        text = raw.decode(errors="replace")
        for line in [line for line in text.splitlines()
                     if re.match(r"^(FAIL|ERROR): |^\w*(Error|Exception|Held)\b", line)][:8]:
            print("release self-test failure: " + line[:300], file=sys.stderr)
    return passed


def operator_install(host: Host, expected: dict, *, owner: str, operation_id: str, admission_check) -> int:
    """Supported exact release install; retain the owned drain for fleet acceptance.

    The caller's reviewed participant check must exclude every independent launch
    route. Installation alone never authorizes resuming writers or reconciliation.
    """
    with lifecycle.OperatorGuard(host.state, owner=owner, operation_id=operation_id,
                                 manifest=expected, admission_check=admission_check) as operator:
        return install_release(host, operator=operator)


def verify_generated_runtime(proven: Path, existing: Path) -> None:
    """Bind immutable generated outputs to an actual fresh exact-source proof."""
    def runtime(root):
        path = root / "scripts/lanes/.mesh-runtime"
        if path.is_symlink() or not path.is_dir():
            raise lifecycle.AdmissionHeld("generated runtime directory differs")
        raw, _ = lifecycle._read_regular(path / "manifest.json", 65536)
        return path, json.loads(raw)
    reference, expected = runtime(proven)
    actual, observed = runtime(existing)
    if (expected != observed or expected.get("schema") != "jovie.mesh-managed-runtime/v1"
            or expected.get("isolatedImportPassed") is not True or expected.get("recipientAdmission") is not False
            or set(expected.get("outputs", {})) != {"receiver.mjs", "terminal.mjs"}):
        raise lifecycle.AdmissionHeld("generated runtime differs from fresh qualified proof")
    for name, row in expected["outputs"].items():
        for directory in (reference, actual):
            raw, _ = lifecycle._read_regular(directory / name)
            if len(raw) != row.get("bytes") or hashlib.sha256(raw).hexdigest() != row.get("sha256"):
                raise lifecycle.AdmissionHeld("generated runtime output differs from fresh proof")


def install_release(host: Host, *, operator=None) -> int:
    if operator is None and lifecycle.draining(host.state):
        raise lifecycle.AdmissionHeld("operator requested natural controller drain")
    if operator is not None:
        if not isinstance(operator, lifecycle.OperatorGuard) or operator.state != host.state.resolve():
            raise lifecycle.AdmissionHeld("operator installation owner differs")
        operator.validate()
    if fetch_release_source(host).returncode:
        raise RuntimeError("release-source-fetch-failed")
    bundle = release_identity(host)
    if operator is not None and bundle != operator.manifest:
        raise lifecycle.AdmissionHeld("fetched release differs from qualified operator manifest")
    tree = bundle["bundleDigest"]
    current = host.state / "current"
    marker = current / ".bundle"
    if operator is None and not needs_update(marker.read_text().strip() if marker.exists() else None, tree):
        return 0
    release = host.state / "releases" / tree
    refused_path = host.state / "update-refused.json"
    refused = json.loads(refused_path.read_text()) if refused_path.exists() else {}
    if operator is None and not release.exists() and ensure_dependency_pool(host):
        # The cause the marker recorded (an aged dependency pool) was just repaired: retry now.
        if refused.get("why") == "mesh runtime dependency closure failed":
            refused = {}
            refused_path.unlink(missing_ok=True)
    if not release.exists() and refused.get("tree") == tree and time.time() - refused.get("at", 0) < UPDATE_RETRY_S:
        print(f"lane update backing off: tree {tree[:7]} was refused {refused.get('why')}", file=sys.stderr)
        return 1
    if operator is not None or not release.exists():
        with gate_admission(host, staging=True) as leases:
            proof_fds = tuple(lock.handle.fileno() for lock in leases)
            staging = host.state / "releases" / f".{tree}.tmp"
            if operator is None:
                shutil.rmtree(staging, ignore_errors=True)
            elif staging.exists() or staging.is_symlink():
                raise lifecycle.AdmissionHeld("operator proof staging already exists; reconcile its owner")
            staging.mkdir(parents=True, mode=0o700)
            archive = lifecycle.run(["git", "archive", bundle["sourceCommit"], *sorted(bundle["objects"])],
                                     cwd=host.repo, capture_output=True, check=True)
            lifecycle.run(["tar", "-x", "-C", str(staging)], input=archive.stdout, check=True)
            def refuse(why: str) -> int:
                atomic_write_text(refused_path, json.dumps({"tree": tree, "at": time.time(), "why": why}))
                return 1
            # The staged tree proves itself with its own installer code. On 2026-10-10 the Mac
            # refused every release for a day because the *installed* installer chose a bare
            # dependency root; the fix was on main but could never run. An older staged tree
            # without the subcommand is proven by this copy, as before.
            try:
                if operator is not None:
                    # The operator's canonical EX/drain protocol fences new
                    # launches even after its parent dies. Never pass that EX
                    # owner to the private proof or replace its durable drain.
                    proof = operator.prove_staging(staging.resolve(), host.repo, timeout=60 + UPDATE_TEST_TIMEOUT_S)
                else:
                    proof = lifecycle.run([sys.executable, str(staging / "scripts/lanes/lane_runner.py"),
                                           "prove-staging", str(staging)],
                                          cwd=staging, capture_output=True, text=True,
                                          timeout=60 + UPDATE_TEST_TIMEOUT_S, pass_fds=proof_fds,
                                          env={**os.environ, "LANES_STATE": str(host.state), "LANES_REPO": str(host.repo)})
            except subprocess.TimeoutExpired:
                refuse(f"self-test timeout {UPDATE_TEST_TIMEOUT_S}s")
                raise
            if operator is None and proof.returncode == 2 and "invalid choice" in proof.stderr:
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
            if operator is not None:
                operator.validate()
                lifecycle.validate_release(staging, bundle)
                verify_generated_runtime(staging, release if release.exists() else staging)
            if operator is not None and release.exists():
                # Retain the fresh proof artifact without rewriting the running tree.
                retained = host.state / "releases" / f".{tree}.proof-{operator.request['operationId']}"
                if retained.exists() or retained.is_symlink():
                    raise lifecycle.AdmissionHeld("operator proof receipt already exists")
                staging.rename(retained)
            else:
                staging.rename(release)
    if operator is not None:
        operator.validate()
        lifecycle.validate_release(release.resolve(), bundle)
        if current.is_symlink() and current.resolve() == release / "scripts/lanes":
            return 0
    link = host.state / ".current.tmp"
    if link.is_symlink() or link.exists():
        link.unlink()
    link.symlink_to(release / "scripts/lanes")
    os.replace(link, current)
    refused_path.unlink(missing_ok=True)  # the refusal that marker recorded is resolved by this activation
    return 0


def load_github_env(path: Path = Path.home() / ".config/jovie-lanes/github.env",
                    app_key: Path = Path.home() / ".config/jovie-lanes/jovie-bot.pem",
                    shim_dir: Path | None = None, *, _fleet_observation: bool = False) -> None:
    """A host-specific GitHub identity so each host spends its own API budget instead of everyone
    sharing Tim's token (its secondary limit throttled every lane on 2026-09-27, JOV-6878).
    An explicit GH_TOKEN in github.env wins; otherwise, with the Jovie Bot app key present, a `gh`
    shim first on PATH mints a fresh 1h installation token (cached) for every gh call, including
    the agents' own, so a long run never outlives its token. Calls aimed at a different GH_HOST
    (offline harnesses, other enterprises) keep the caller's credentials — the bot token is a
    github.com installation token and would be wrong there."""
    if _fleet_observation:
        # Only the existing fixed observer. Even an in-memory token cannot
        # permit a minting shim or any app-key/token/CLI account fallback.
        _fleet_observer_transport()
        try:
            path.lstat()
        except FileNotFoundError:
            raise FleetObservationHeld("fleet-observer-explicit-context-missing") from None
        except OSError:
            raise FleetObservationHeld("fleet-observer-explicit-context-unreadable") from None
        try:
            raw, _ = lifecycle._read_regular(path, 65536)
            tokens = []
            for line in raw.decode("utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#"): continue
                match = re.fullmatch(r"(?:export )?([A-Za-z_][A-Za-z0-9_]*)=(.*)", line)
                if match is None:
                    raise ValueError("malformed context")
                if match[1] not in ("GH_TOKEN", "GITHUB_TOKEN"): continue
                value = match[2]
                if len(value) >= 2 and value[0] in {"'", '"'} and value[-1] == value[0]: value = value[1:-1]
                if not re.fullmatch(r"[A-Za-z0-9_.-]{1,4096}", value):
                    raise ValueError("malformed explicit context")
                tokens.append(value)
            if len(tokens) != 1:
                raise ValueError("missing or ambiguous explicit context")
        except FileNotFoundError:
            raise FleetObservationHeld("fleet-observer-explicit-context-disappeared") from None
        except OSError:
            raise FleetObservationHeld("fleet-observer-explicit-context-unreadable") from None
        except (ValueError, lifecycle.AdmissionHeld):
            raise FleetObservationHeld("fleet-observer-explicit-context-invalid") from None
        os.environ["GH_TOKEN"] = tokens[0]
        return
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
    # `gh gist` and `gh api gists[/...]` keep the host's own login (the doctor's verified
    # publisher uses the REST form; Gem 2026-10-20 its 403 froze the public feed). A caller that targets another host
    # (GH_HOST, e.g. the offline real-gh test harness) keeps its own credentials:
    # the Jovie Bot installation token only exists for github.com.
    atomic_write_text(shim, f'#!/bin/sh\n[ "$1" = gist ] && exec {real} "$@"\n'
                    f'[ "$1" = api ] && case "$2" in gists|gists/*) exec {real} "$@";; esac\n'
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
    sub.add_parser("doctor", help="one doctor pass (the dispatch tick starts one when the last is stale)")
    sub.add_parser("fix-now", help="drain the relay's red wake files immediately (JOV-8931)")
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
            # Keep the locks only while descendants are provably alive: retry the sweep and
            # release the moment the tree drains, instead of holding them until an operator.
            while not retry_held_cleanup():
                time.sleep(float(os.environ.get("LANES_GATE_CLEANUP_RETRY_S", 10)))
            report_outcome({"returncode": None, "timeout": True})
            return 124
    if args.command == "context-manifest":
        path = HERE / "context-manifest.json"
        generated = context_manifest_json()
        if args.write:
            atomic_write_text(path, generated, encoding="utf-8")
        matched = context_manifest_matches(path)
        print(json.dumps({"schema": "jovie-lane-context-generation/v1", "path": str(path),
                          "sha256": hashlib.sha256(generated.encode("utf-8")).hexdigest(),
                          "written": args.write, "matched": matched}, sort_keys=True))
        return 0 if matched else 1
    host = Host()
    if args.command == "prove-staging":
        why = complete_staged_bundle(host, Path(args.staging)) or prove_staging(host, Path(args.staging))
        if why:
            print(why)
            return 1
        return 0
    load_github_env()
    if args.command == "update":
        return update(host)
    if args.command == "worker":
        return worker(host, args.provider)
    if args.command == "fix-now":
        return fix_now(host)
    if args.command == "doctor":
        return run_doctor(host)
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
