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
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import continuity_clock  # noqa: E402
import disk_guard  # noqa: E402  (sibling module of the release)
import doctor  # noqa: E402  (sibling module of the release)
import execution_attempt  # noqa: E402
import pr_events  # noqa: E402
import remediation  # noqa: E402  (classifier, router, escalation ladder)
import workstreams  # noqa: E402  (shared workstream rank + duplicate identity)
import reason_lane  # noqa: E402
import yc_corpus  # noqa: E402
import design_gate  # noqa: E402  (IA-first admission for UI and landing work)
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
CLAIM_TTL_S = 2 * 3600
HOST = socket.gethostname().split(".")[0]
# Every file a release must pass before `current` moves to it.
LANE_TESTS = ["scripts/tests/test_execution_attempt.py", "scripts/tests/test_lane_runner.py",
              "scripts/tests/test_codex_lane.py", "scripts/tests/test_hud.py",
              "scripts/tests/test_doctor.py", "scripts/tests/test_pr_events.py",
              "scripts/tests/test_reason_lane.py", "scripts/tests/test_yc_corpus.py",
              "scripts/tests/test_gh_app_token.py",
              "scripts/tests/test_disk_guard.py", "scripts/tests/test_continuity_clock.py",
              "scripts/tests/test_design_gate.py",
              "scripts/tests/test_remediation.py"]
# Files outside scripts/lanes a release carries: the HUD's PROMOTION line (JOV-6836).
RELEASE_EXTRAS = ["scripts/promotion-loss-metrics.mjs"]
LANE_BRANCH = re.compile(r"^(?P<lane>[a-z0-9-]+)/(?P<issue>jov-\d+)-\d{8}")
RED = frozenset({"FAILURE", "TIMED_OUT", "STARTUP_FAILURE"})
RETRY_BACKOFF_S = 1800
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
            if evidence_provider in metrics:
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


@dataclass
class Host:
    """Everything host-specific; defaults suit both Gem and the Mac."""
    state: Path = Path(os.environ.get("LANES_STATE", Path.home() / ".local/state/jovie-lanes"))
    repo: Path = Path(os.environ.get("LANES_REPO", Path.home() / "devin-sweep/Jovie"))
    linear_env: Path = Path(os.environ.get("LANES_LINEAR_ENV", Path.home() / ".config/symphony/linear.env"))
    agent_timeout: int = int(os.environ.get("LANES_AGENT_TIMEOUT_S", 5400))
    gate_timeout: int = int(os.environ.get("LANES_GATE_TIMEOUT_S", 2400))
    # Gates (typecheck, vitest, component contracts) are CPU-bound; more than a couple at
    # once only makes all of them time out.
    gate_slots: int = int(os.environ.get("LANES_GATE_SLOTS", 2))

    def slots(self, provider: str, default: int) -> int:
        return int(os.environ.get(f"LANES_SLOTS_{provider.upper()}", default))


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
                        provider: str | None = None) -> str | None:
    """Final claim predicate; in_flight contains normalized lowercase identifiers."""
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
    return None


def pool_rejections(issues: list[Issue]) -> dict[str, str]:
    """Pool-level admission (JOV-5555): exact normalized-title duplicates are one unit of
    work. Non-canonical members are rejected; the canonical (oldest) one stays admissible."""
    return {identifier: "duplicate-candidate:" + canonical
            for identifier, canonical in workstreams.duplicate_of(issues).items()}


def admission_order(issue: Issue, now: float) -> tuple:
    """Dispatch rule shared by every lane and the doctor (JOV-7423 leverage-first):

    1. tier 0 = urgent (effective P1, including aged work) or compounding infrastructure
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
    tier = 0 if effective_priority == 1 or workstreams.compounding(stream) else 1
    return (tier, effective_priority, workstreams.rank(stream),
            created_at if created_at is not None else float("inf"))


def pick_issue(issues: list[Issue], failures: dict, now: float | None = None,
               in_flight: frozenset[str] = frozenset(), provider: str | None = None) -> Issue | None:
    """Symphony orders by tier, aged priority, workstream rank, then age (admission_order).

    Waiting work gains one priority level per day until it reaches P1, preventing a
    sustained stream of newer urgent work from starving older work. Excluded work,
    3x failures, retry backoff, issues with an open lane PR, and duplicate candidates
    (pool_rejections) remain ineligible.
    """
    now = time.time() if now is None else now
    in_flight = frozenset(identifier.lower() for identifier in in_flight)
    duplicates = pool_rejections(issues)
    eligible = [issue for issue in issues
                if issue.identifier not in duplicates
                and admission_rejection(issue, failures, now, in_flight, provider) is None]
    eligible.sort(key=lambda issue: admission_order(issue, now))
    return eligible[0] if eligible else None


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


def render_prompt(issue: Issue, branch: str, context_pack: str, provider: str | None = None) -> str:
    sensitive_contract = []
    if provider in IMPLEMENTATION_ONLY_PROVIDERS:
        sensitive_contract += [
            "- This lane is implementation-only: never post PR reviews or review comments",
            "  (`gh pr review`, `gh api .../reviews`, inline review threads). Reviewers are",
            "  CI, sentry and sonar; fix what they report instead of reviewing others' PRs.",
        ]
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


def context_pack(issue: Issue, run=subprocess.run) -> str:
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


def gate_rules(changes: list[Change], max_reviewable_lines: int = MAX_REVIEWABLE_LINES) -> list[str]:
    """Deterministic checks on the diff itself; returns failure reasons (empty = pass)."""
    if not changes:
        return ["empty-diff"]
    failures = []
    paths = [change.path for change in changes]
    if any(SECRET_FILE.search(path) for path in paths):
        failures.append("secret-like-file-changed")
    code = [p for p in paths if not DOC_FILE.search(p) and not TEST_FILE.search(p) and not GENERATED.search(p)]
    if code and not any(TEST_FILE.search(p) for p in paths):
        failures.append("code-change-without-test")
    if "pnpm-lock.yaml" in paths and not any(p.endswith("package.json") for p in paths):
        failures.append("lockfile-without-manifest")
    reviewable = sum(c.added + c.deleted for c in changes if not GENERATED.search(c.path))
    if reviewable > max_reviewable_lines:
        failures.append(f"diff-too-large:{reviewable}")
    return failures


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


def check_commands(paths: list[str]) -> list[list[str]]:
    """Code changes run the canonical gate; docs-only changes need nothing locally."""
    if any(not DOC_FILE.search(p) for p in paths):
        return [CANONICAL_GATE]
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
        with subprocess.Popen(command, cwd=cwd, env=env, text=True, start_new_session=True,
                              pass_fds=tuple(pass_fds), stdout=log if stream and log else subprocess.PIPE,
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
        result = subprocess.run(args, cwd=cwd, stdout=log, stderr=subprocess.STDOUT, text=True,
                                timeout=timeout, env=env)
        log.flush()
        return subprocess.CompletedProcess(args, result.returncode, "", "")
    result = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=env)
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
        request = urllib.request.Request(
            "https://api.linear.app/graphql",
            data=json.dumps({"query": query, "variables": variables}).encode(),
            headers={"Content-Type": "application/json", "Authorization": self.key},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.load(response)
        if payload.get("errors"):
            raise RuntimeError(f"linear: {payload['errors'][0].get('message')}")
        return payload["data"]

    def lane_issues(self, label: str) -> list[Issue]:
        """Todo issues carrying the lane's own label or the shared pool label.

        Paginated (bounded by LANE_ISSUE_PAGES): the leverage-first rank and duplicate
        identity are pool properties, so admission must see the whole pool rather than
        whichever 100 issues Linear returns first."""
        nodes, after = [], None
        for _ in range(LANE_ISSUE_PAGES):
            data = self.gql(
                'query($labels:[String!]!,$after:String){issues(first:100,after:$after,'
                'filter:{team:{key:{eq:"JOV"}},state:{name:{eq:"Todo"}},'
                'labels:{name:{in:$labels}}}){pageInfo{hasNextPage endCursor} '
                'nodes{id identifier title description priority createdAt '
                'labels{nodes{name}}}}}', {"labels": [label, SHARED_LABEL], "after": after})
            nodes += data["issues"]["nodes"]
            page = data["issues"].get("pageInfo") or {}
            after = page.get("endCursor")
            if not page.get("hasNextPage") or not after:
                break
        return [Issue(n["id"], n["identifier"], n["title"], n.get("description") or "", n.get("priority") or 0,
                      n["createdAt"], [l["name"] for l in n["labels"]["nodes"]])
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
        linear.comment(issue.id, f"🤖 lane `{name}` claimed this issue (model `{spec.get('model')}`).")
    except Exception as error:
        print(f"lane claim comment unavailable: {type(error).__name__}", file=sys.stderr)


class Locked:
    """flock-held file: released by the kernel if the holder dies, so no stale locks."""
    def __init__(self, path: Path, blocking: bool):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.handle = open(path, "w")
        try:
            fcntl.flock(self.handle, fcntl.LOCK_EX | (0 if blocking else fcntl.LOCK_NB))
            self.held = True
        except BlockingIOError:
            self.held = False

    def release(self) -> None:
        fcntl.flock(self.handle, fcntl.LOCK_UN)
        self.handle.close()


def provider_healthy(spec: dict) -> bool:
    try:
        result = subprocess.run(template(spec["health"], {}), capture_output=True, text=True, timeout=60)
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


def run_agent(cmd: list[str], cwd: Path, log, timeout: int, *, guard=None,
              guard_interval: float = 30, on_kill=None) -> subprocess.CompletedProcess:
    """Track descendants while the provider runs, including detached test sessions.
    Observation cannot recover a child that daemonizes before its first snapshot;
    preserved checkout admission therefore also refuses live working directories.

    `on_kill(error)` runs before the kill of the owned tree is acknowledged: a stop
    (timeout, guard hold, SIGTERM/SIGINT) writes its revocation receipt first, so a
    stopped run can never be published later (JOV-5060).
    """
    import signal
    if guard:
        guard()
    env = {**os.environ, "npm_config_package_import_method": "hardlink"}
    proc = subprocess.Popen(cmd, cwd=cwd, stdout=log, stderr=subprocess.STDOUT, text=True,
                            start_new_session=True, env=env)
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
    """The cheapest enabled, healthy, non-cooling lane not yet tried on this run."""
    for name, spec in (providers or load_providers()).items():
        if name in exclude or not spec.get("enabled", True) or cooling(host, name):
            continue
        if provider_healthy(spec):
            return name, spec
    return None


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

def run_issue(host: Host, name: str, spec: dict, linear: Linear, issue: Issue) -> dict:
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
                               "finalProvider": name}, "startedAt": now_iso()}
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
            sh(["git", "worktree", "add", "-q", "-b", branch, str(worktree), "origin/main"], cwd=host.repo, log=log)
            # Always installed: the gate's checks need it even when the provider works remotely.
            install_dependencies(host, worktree, log)
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
                                                       "provider_receipt": str(provider_evidence)}),
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
                handoffs.append({"from": current, "to": nxt_name, "exit": agent.returncode})
                execution_attempt.boundary(runs / "execution-attempts.jsonl", ident, claimed["fencingToken"],
                                           {"spend": 1, "mutations": 1}, coordination=coordination)
                agent = run_agent(template(nxt_spec["cmd"], {"prompt": handoff_prompt, "prompt_file": str(handoff_file),
                                                             "cwd": str(worktree),
                                                             "provider_receipt": str(provider_evidence)}),
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
GATE_POLICY_DIGEST = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


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
    result = verified.get(f"{pr['number']}:{pr['headRefOid']}")
    # Old SHA strings were written at claim time, so they cannot certify anything.
    if (isinstance(result, dict) and result.get("schema") == GATE_RESULT_SCHEMA
            and result.get("headSha") == pr["headRefOid"]
            and result.get("policyDigest") == GATE_POLICY_DIGEST
            and result.get("verdict") in {"landing", "verified-not-queued", "held"}
            and result.get("completedAt") and (not sensitive or result.get("sensitive") is True)):
        return result
    return None


def gate_deferral(host: Host, pr: dict) -> str | None:
    """Existing hold/repair ownership is not a new adoption or verification permit."""
    labels = {label.lower() for label in pr_events.label_names(pr)}
    if labels & (pr_events.HOLD_LABELS | {pr_events.PREFIX + pr_events.EXHAUSTED}):
        return "existing-pr-hold"
    held = held_path(host)
    entry = (json.loads(held.read_text()) if held.exists() else {}).get(str(pr["number"]), {})
    if entry.get("sha") == pr["headRefOid"]:
        return "existing-gate-hold"
    path = host.state / "fix-attempts.json"
    attempt = (json.loads(path.read_text()) if path.exists() else {}).get(str(pr["number"]), {})
    final_push = attempt.get("pushed") and attempt.get("pushedHead") == pr["headRefOid"] \
        and attempt.get("sha") != pr["headRefOid"] and attempt.get("endedAt")
    if pr_events.in_flight(attempt, pr, time.time()) or (
            pr_events.spent(attempt, pr["headRefOid"], MAX_FIX_ATTEMPTS) and not final_push):
        return "existing-fix-disposition"
    return None


def require_gate_authority(host: Host, pr: dict, stage: str, sensitive: bool) -> dict:
    live = require_fix_target(pr, stage)
    require_publishable(host, live.get("headRefName"), stage)
    if not sensitive and SENSITIVE_PR_LABEL in {label.lower() for label in pr_events.label_names(live)}:
        raise RepairStopped("sensitive-mode-changed", live, stage)
    if reason := gate_deferral(host, live):
        raise RepairStopped(reason, live, stage)
    return live


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
        result = _gate_pr(host, live, worktree, log, sensitive, claim)
        if result.get("verdict") in {"landing", "verified-not-queued", "held"}:
            proof = {**result, "schema": GATE_RESULT_SCHEMA, "completedAt": now_iso(),
                     "policyDigest": GATE_POLICY_DIGEST, "sensitive": sensitive}
            update_json(path, lambda verified: verified.update({f"{pr['number']}:{pr['headRefOid']}": proof}))
        return result
    except RepairStopped as error:
        return {**result, "verdict": "gate-deferred", "reasons": [str(error)], "stage": error.stage}
    except PublicationRevoked as error:
        return {**result, "verdict": "revoked", "reasons": [str(error)], "revocation": error.receipt}
    finally:
        if owned:
            claim.lock.release()


def _gate_pr(host: Host, pr: dict, worktree: Path, log, sensitive: bool, claim: GateClaim) -> dict:
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
    reasons = gate_rules(changes, SENSITIVE_REVIEWABLE_LINES if sensitive else MAX_REVIEWABLE_LINES)
    evidence = []
    result = {"pr": pr["number"], "prUrl": pr.get("url"), "headSha": pr["headRefOid"],
              "changedFiles": len(changes), "reasons": reasons}
    if not reasons:
        commands = check_commands([change.path for change in changes])
        seat = None
        if commands:
            seat, waited = gate_slot(host)
            result["gateWaitS"] = round(waited)
        try:
            for command in commands:
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
                passed, review_reasons = sensitive_review(host, pr, worktree, log,
                    pass_fds=(claim.lock.handle.fileno(), *([seat.handle.fileno()] if seat else [])))
                if not passed:
                    reasons.extend(review_reasons)
        finally:
            if seat is not None:
                seat.release()
        result["reasons"] = reasons
    live = require_gate_authority(host, pr, "after-gate", sensitive)
    checked_head = sh(["git", "rev-parse", "HEAD"], cwd=worktree)
    if checked_head.returncode or checked_head.stdout.strip() != pr["headRefOid"]:
        raise RepairStopped("gate-checkout-head-mismatch", live, "after-gate")
    if reasons:
        sh(["gh", "pr", "comment", str(pr["number"]), "--repo", REPO_SLUG, "--body",
            "Lane gate held this PR (it stays draft):\n" + "\n".join(f"- `{r}`" for r in reasons)], log=log)
        record_held(host, pr["number"], pr["headRefOid"], reasons + evidence)
        return {**result, "verdict": "held"}
    revoked = publication_revocation(host, pr.get("headRefName"))
    if revoked:
        return {**result, "verdict": "revoked",
                "reasons": [f"publication-revoked:{revoked.get('reason', '?')}"],
                "revocation": revoked}
    require_gate_authority(host, pr, "before-ready", sensitive)
    sh(["gh", "pr", "ready", str(pr["number"]), "--repo", REPO_SLUG], log=log)
    require_gate_authority(host, pr, "before-enqueue", sensitive)
    queued = sh(["gh", "pr", "merge", str(pr["number"]), "--repo", REPO_SLUG, "--auto",
                 "--match-head-commit", pr["headRefOid"]], log=log)
    if queued.returncode != 0:
        # Verified heads are never re-gated, so a failed enqueue (e.g. a GraphQL rate limit)
        # would strand a green PR; each worker pass retries it via requeue_verified.
        update_requeue_locked(host, lambda requeue: requeue.update({str(pr["number"]): pr["headRefOid"]}))
    return {**result, "verdict": "landing" if queued.returncode == 0 else "verified-not-queued"}


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
    fields = ("verdict", "pr", "prUrl", "headSha", "reasons", "changedFiles", "gateWaitS", "revocation",
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

def requeue_verified(host: Host, prs: list[dict], *, defer=None) -> dict | None:
    """Retry enqueueing gate-verified PRs whose enqueue failed; drop them once queued or moved."""
    path = host.state / "requeue.json"
    if not path.exists():
        return
    selected = None
    inventory = {str(pr["number"]): pr for pr in prs}
    def retry(requeue: dict) -> None:
        nonlocal selected
        for number, head in list(requeue.items()):
            if number not in inventory:
                live = reconcile_fix_target({"number": int(number), "headRefOid": head})
                if live is None: continue
                inventory[number] = live
            if inventory[number].get("state", "OPEN") != "OPEN" or inventory[number].get("headRefOid") != head:
                del requeue[number]  # merged, closed, or a new head that the gate owns again
                continue
            if publication_revocation(host, inventory[number].get("headRefName")):
                del requeue[number]  # revoked branches never re-enroll
                continue
            if defer and defer(inventory[number]):
                if selected is None:
                    selected = dict(inventory[number])
                continue
            pr = inventory[number]
            # Only current structured proof records sensitive review. Legacy requeue
            # entries prove an old pass, but cannot authorize a newly sensitive head.
            proof_path = host.state / "verified.json"
            proofs = json.loads(proof_path.read_text()) if proof_path.exists() else {}
            proof = terminal_gate(pr, proofs, sensitive=True)
            sensitive = bool(proof and proof.get("verdict") != "held")
            try:
                require_gate_authority(host, pr, "before-requeue-ready", sensitive)
                sh(["gh", "pr", "ready", number, "--repo", REPO_SLUG])
                require_gate_authority(host, pr, "before-requeue-enqueue", sensitive)
            except (RepairStopped, PublicationRevoked):
                continue  # preserve the pending record; no new authority was granted
            if sh(["gh", "pr", "merge", number, "--repo", REPO_SLUG, "--auto",
                   "--match-head-commit", head]).returncode == 0:
                del requeue[number]
    update_json(path, retry)
    return selected


# ---------------------------------------------------------------- fix red first

# ---------------------------------------------------------------- cross-host claims

def claimed_elsewhere(number: int, sha: str, kind: str, now: float | None = None) -> bool:
    """True when another host recorded a live claim for this exact head and kind on the PR.
    Local state files are per host; the PR's comments are the truth every host can see."""
    now = time.time() if now is None else now
    listed = sh(["gh", "api", f"repos/{REPO_SLUG}/issues/{number}/comments?per_page=100&sort=created&direction=desc",
                 "--jq", ".[] | select(.body | startswith(\"🤖 lane claim \")) | .body"])
    if listed.returncode != 0:
        return True  # fail closed: an unreadable claim list is not permission to take the head
    for line in (listed.stdout or "").splitlines():
        fields = dict(part.split("=", 1) for part in line.split()[3:] if "=" in part)
        try:
            age = now - datetime.fromisoformat(fields.get("at", "").replace("Z", "+00:00")).timestamp()
        except ValueError:
            continue
        if fields.get("sha") == sha and fields.get("kind") == kind and fields.get("host") != HOST and age < CLAIM_TTL_S:
            return True
    return False


def post_claim(number: int, sha: str, kind: str) -> None:
    sh(["gh", "pr", "comment", str(number), "--repo", REPO_SLUG, "--body",
        f"🤖 lane claim kind={kind} sha={sha} host={HOST} at={now_iso()}"])


def held_path(host: Host) -> Path:
    return host.state / "held.json"


def record_held(host: Host, number: int, head: str, evidence: list[str]) -> None:
    """The gate held this head; the lane's fix loop owns it next, on the same branch."""
    path = held_path(host)
    path.parent.mkdir(parents=True, exist_ok=True)
    update_json(path, lambda held: held.update({str(number): pr_events.held_record(head, evidence)}))


def red_pr(prs: list[dict], attempts: dict, held: dict | None = None) -> dict | None:
    """A lane PR that is stuck at a head we have not tried twice: checks settled red, or
    merge conflicts with main (GitHub drops auto-merge on those, so nothing else frees them)."""
    for pr in sorted(best_per_issue(prs), key=lambda item: item["number"]):
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
            if any(check.get("status") in ("IN_PROGRESS", "QUEUED", "PENDING") for check in checks):
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
        if record.get("escalated"):
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


def escalate_exhausted(host: Host, prs: list[dict], linear) -> None:
    """Terminal disposition, never a queue: comment on the PR, tombstone the head, move the
    owning issue to its explicit Backlog disposition once (JOV-7089)."""
    path = host.state / "fix-attempts.json"
    attempts = json.loads(path.read_text()) if path.exists() else {}
    held = json.loads(held_path(host).read_text()) if held_path(host).exists() else {}
    for pr in exhausted_prs(prs, attempts, held):
        record = attempts.get(str(pr["number"]), {})
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
        pr_events.add_label(pr["number"], pr_events.EXHAUSTED, sh)  # held with a reason, visible on the PR
        # Spent attempts rename the hold fix-exhausted; a zero-attempt hold keeps its real reason.
        prefix = ["fix-exhausted"] if record.get("count", 0) else []
        update_json(held_path(host), lambda held: held.update({str(pr["number"]): pr_events.held_record(
            pr["headRefOid"], [*prefix, *held.get(str(pr["number"]), {}).get("evidence", [])])}))
        # A disabled implementation lane does not make its preserved work redundant.
        # Exhaustion holds this source generation; semantic retirement is a separate disposition.
        try:
            apply_terminal_disposition(linear, pr, record, reason)
        except Exception:
            pass  # Linear down: the PR label and held record still tombstone the head
    path.write_text(json.dumps(attempts))


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
        problem += ["This lane draft has had no activity for 48 hours. Finish it: resolve what the gate",
                    "held, make its checks green and push. If it cannot ship, end with NOT-SHIPPABLE.", ""]
    return "\n".join([
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
        f"- Immediately before every install or push, read `gh pr view {pr['number']} --repo {REPO_SLUG} --json state`.",
        "  If the target merged/closed or its state is unreadable, stop and preserve local changes; do not install or push.",
        "- Repo gates are real requirements (e.g. component-ship-gate needs tests + stories for",
        "  shipped UI components). Never skip, weaken or --no-verify a check.",
        "- If the failure is unrelated to this PR (broken main, infra), change nothing and end with",
        "  `NOT-SHIPPABLE: <reason>`.",
    ])


LOCKFILES = frozenset({"pnpm-lock.yaml"})


def resolve_lockfile_conflict(worktree: Path, branch: str, log, *, guard=lambda: None) -> bool:
    """JOV-6837: a PR that conflicts with main only in pnpm-lock.yaml needs no model. Merge
    main, take its lockfile, regenerate it from the merged manifests, push (no force). Any
    other conflict, or a failed regeneration, aborts and leaves the PR to the agent."""
    guard()
    merged = sh(["git", "merge", "--no-edit", "origin/main"], cwd=worktree, log=log)
    if merged.returncode != 0:
        conflicted = set(sh(["git", "diff", "--name-only", "--diff-filter=U"], cwd=worktree).stdout.split())
        if not conflicted or not conflicted <= LOCKFILES:
            sh(["git", "merge", "--abort"], cwd=worktree, log=log)
            return False
        sh(["git", "checkout", "origin/main", "--", *sorted(conflicted)], cwd=worktree, log=log)
        guard()
        regenerated = sh(["pnpm", "install", "--lockfile-only", "--ignore-scripts"], cwd=worktree, timeout=900, log=log)
        if regenerated.returncode != 0:
            sh(["git", "merge", "--abort"], cwd=worktree, log=log)
            return False
        sh(["git", "add", *sorted(conflicted)], cwd=worktree, log=log)
        if sh(["git", "commit", "--no-edit"], cwd=worktree, log=log).returncode != 0:
            sh(["git", "merge", "--abort"], cwd=worktree, log=log)
            return False
    guard()
    return sh(["git", "push", "-q", "origin", f"HEAD:refs/heads/{branch}"], cwd=worktree, log=log).returncode == 0


def reconcile_fix_target(pr: dict) -> dict | None:
    """Read the target immediately before repair work; an unreadable target fails closed."""
    try:
        viewed = sh(["gh", "pr", "view", str(pr["number"]), "--repo", REPO_SLUG, "--json",
                     "state,mergedAt,headRefName,headRefOid,url,isDraft,mergeStateStatus,reviewDecision,statusCheckRollup,labels"], timeout=30)
    except (OSError, subprocess.SubprocessError):
        return None
    try:
        live = json.loads(viewed.stdout) if viewed.returncode == 0 else None
    except (TypeError, ValueError):
        live = None
    if not isinstance(live, dict) or str(live.get("state") or "").upper() not in {"OPEN", "CLOSED", "MERGED"}:
        return None
    if str(live["state"]).upper() == "OPEN" and any(
            not isinstance(live.get(field), str) or not live[field].strip()
            for field in ("headRefOid", "headRefName")):
        return None
    return {**pr, **live}


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
        attempt.update(endedAt=time.time(), pushed=receipt.get("verdict") == "fix-pushed")
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


def require_fix_target(pr: dict, stage: str, *, worktree: Path | None = None) -> dict:
    live = reconcile_fix_target(pr)
    if live is None:
        raise RepairStopped("target-state-unavailable", live, stage)
    state = str(live.get("state") or "").upper()
    if state != "OPEN":
        raise RepairStopped("target-pr-merged" if state == "MERGED" else "target-pr-closed", live, stage)
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
    live = reconcile_fix_target(pr)
    receipt["targetStateReads"] = 1
    state = str((live or {}).get("state") or "").upper()
    changed_head = state == "OPEN" and live.get("headRefOid") != pr["headRefOid"] if live else False
    if live is None or state != "OPEN" or changed_head:
        reason = "target-state-unavailable" if live is None else \
            "target-pr-merged" if state == "MERGED" else \
            "target-pr-closed" if state == "CLOSED" else "target-head-superseded"
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
                live = require_fix_target(target, stage, worktree=worktree)
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
            lockfile_only = False
            if pr.get("mergeStateStatus") == "DIRTY":
                execution_attempt.boundary(runs / "execution-attempts.jsonl", ident, claimed["fencingToken"],
                                           {"spend": 0, "mutations": 1}, coordination=coordination)
                lockfile_only = resolve_lockfile_conflict(worktree, pr["headRefName"], log, guard=boundary)
            agent = None
            if lockfile_only:
                receipt.update(resolution="lockfile-regenerated")
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
                                                         "provider_receipt": str(provider_evidence)}),
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
                # A new fix head earns another queue try; a repeat failure re-marks it. The PR
                # summary carries no labels, so delete unconditionally (404 when absent).
                sh(["gh", "api", "-X", "DELETE",
                    f"repos/{REPO_SLUG}/issues/{pr['number']}/labels/{pr_events.POISON_LABEL}"], log=log)
            if pushed and not pr.get("isDraft"):
                # Conflicts and failures can drop auto-merge; re-arm it so the fix actually lands.
                verify_target({**pr, "headRefOid": after}, "before-merge-intent")
                sh(["gh", "pr", "merge", str(pr["number"]), "--repo", REPO_SLUG, "--auto"], log=log)
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
    receipt["execution"] = execution_attempt.finish(
        runs / "execution-attempts.jsonl", ident, claimed["fencingToken"], "succeeded" if pushed else "failed_known",
        {"failureClass": None if pushed else "repair_incomplete",
         "failureFingerprint": None if pushed else execution_attempt.digest(receipt.get("reasons", ["no-head-change"])),
         "evidenceDigest": execution_attempt.digest({"before": pr["headRefOid"], "after": receipt.get("headAfter")}),
         "costs": {"apiCalls": 1}, "mutationsPerformed": ["source_push"] if pushed else [],
         "confidence": "high", "dependencies": [name]}, coordination=coordination)
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


def unverified_pr(prs: list[dict], verified: dict) -> dict | None:
    """A lane draft whose head the gate has never seen, e.g. a remote agent that finished late."""
    for pr in sorted(best_per_issue(prs), key=lambda item: item["number"]):
        sensitive = SENSITIVE_PR_LABEL in {label["name"].lower() for label in pr.get("labels", [])}
        if pr.get("isDraft") and not terminal_gate(pr, verified, sensitive):
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
    """This lane's open PRs (its dated run branches), plus the orphaned PRs of disabled lanes:
    nobody else will fix or gate those, and any enabled lane can."""
    providers = load_providers() if providers is None else providers
    names = [name] + [other for other, spec in providers.items() if not spec.get("enabled", True) and other != name]
    prs = []
    for owner in names:
        own = re.compile(rf"^{re.escape(owner)}/jov-\d+-\d{{8}}")
        if fields:
            listed = sh(["gh", "pr", "list", "--repo", REPO_SLUG, "--state", "open", "--search", f"head:{owner}/",
                         "--limit", "200", "--json", fields])
            prs += [pr for pr in json.loads(listed.stdout or "[]") if own.match(pr["headRefName"])]
        else:
            prs += [pr for pr in open_prs_summary() if own.match(pr["headRefName"])]
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


_SUMMARY: dict = {"at": 0.0, "prs": []}
SUMMARY_TTL_S = 60
SHARED_CACHE_DIR = Path(os.environ.get("LANES_STATE", Path.home() / ".local/state/jovie-lanes")) / "cache"


def shared(key: str, ttl: float, fetch):
    """One GitHub read per `ttl` for every worker on the host. Workers are short-lived processes
    (re-exec after each unit, respawned every dispatch tick), so an in-process cache never
    hits; 7 workers re-listing every open PR spent the bot's whole 5000-point GraphQL hour
    (2026-09-28). A failed read (None) is never cached. Off in tests."""
    if os.environ.get("LANES_EXECUTION_BACKEND") == "local-test":
        return fetch()
    path = SHARED_CACHE_DIR / f"{key}.json"
    try:
        cached = json.loads(path.read_text())
        if time.time() - cached["at"] < ttl:
            return cached["value"]
    except (OSError, ValueError, KeyError, TypeError):
        pass
    value = fetch()
    if value is not None:
        SHARED_CACHE_DIR.mkdir(parents=True, exist_ok=True)
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
    prs = shared("open-prs", SUMMARY_TTL_S, lambda: pr_events.open_prs_state(sys.modules[__name__]))
    if prs is None:
        return []
    for pr in prs:
        rollup = pr.get("rollup")
        pr["statusCheckRollup"] = [] if rollup is None else [{
            "name": "rollup", "synthetic": True,
            "status": "COMPLETED" if rollup in ("SUCCESS", "FAILURE", "ERROR") else "PENDING",
            "conclusion": {"SUCCESS": "SUCCESS", "FAILURE": "FAILURE", "ERROR": "FAILURE"}.get(rollup)}]
    _SUMMARY.update(at=now, prs=prs)
    return prs


def with_checks(pr: dict) -> dict:
    """The claimed PR with its real per-check rollup (names, job URLs) in place of the summary."""
    if not any(check.get("synthetic") for check in pr.get("statusCheckRollup") or []):
        return pr
    viewed = sh(["gh", "pr", "view", str(pr["number"]), "--repo", REPO_SLUG, "--json", "statusCheckRollup"])
    try:
        return {**pr, "statusCheckRollup": json.loads(viewed.stdout)["statusCheckRollup"]}
    except (ValueError, KeyError, TypeError):
        return pr


def fix_candidates(name: str) -> list[dict]:
    """Lane PRs (all lanes) plus every other open non-draft PR, de-duplicated by number."""
    seen, merged = set(), []
    for pr in lane_prs(name) + repo_prs():
        if pr["number"] not in seen:
            seen.add(pr["number"])
            merged.append(pr)
    return merged


ISSUE_MARKER = re.compile(r"linear-issue-id:\s*(JOV-\d+)", re.IGNORECASE)


def in_flight_issues() -> frozenset[str] | None:
    """Issues that already have an open PR (lane branch or `linear-issue-id` marker) from any
    lane, host, or agent. GitHub is the shared truth. None when GitHub cannot be read: an
    unknown in-flight set is not permission to open a duplicate PR (JOV-6833)."""
    def fetch():
        listed = sh(["gh", "pr", "list", "--repo", REPO_SLUG, "--state", "open", "--limit", "500",
                     "--json", "headRefName,body"])
        return json.loads(listed.stdout or "[]") if listed.returncode == 0 else None
    prs = shared("in-flight", SUMMARY_TTL_S, fetch)
    if prs is None:
        return None
    keys = set()
    for pr in prs:
        branch = LANE_BRANCH.match(pr.get("headRefName") or "")
        marker = ISSUE_MARKER.search(pr.get("body") or "")
        keys |= {key.upper() for key in (branch and branch.group("issue"), marker and marker.group(1)) if key}
    return frozenset(keys)


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
    return bool(labels & (pr_events.HOLD_LABELS | {pr_events.PREFIX + pr_events.EXHAUSTED}))


def new_issue_budget(name: str, slots: int, inventory: list[dict] | None) -> dict:
    """One owning lane's new-issue budget; maintenance/orphan work is separate.

    Active (advanceable) non-green PRs are capped at slots x OPEN_PRS_PER_SLOT.
    Terminal PRs (hold / lane-fix-exhausted) are capped separately at
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
        if closed and linear.state_of(issue) == "In Progress":
            linear.move(issue, "Todo")
            linear.comment(issue, f"🤖 lane sweep closed stale draft {pr.get('url')} (no green run, "
                                  "no push for 24 h); back to Todo.")


def claim_adoptable_pr(host: Host, name: str, prs: list[dict]) -> GateClaim | None:
    path = host.state / "verified.json"
    verified = json.loads(path.read_text()) if path.exists() else {}
    pr = unverified_pr(prs, verified)
    # Another host gating a head skips it, not the whole pass: returning None here idled every
    # worker behind one claimed PR (2026-09-28, 0 running with 45 eligible PRs).
    while pr:
        reservation = reserve_gate(host, pr)
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
        pr = unverified_pr(prs, verified)
    return None


def claim_red_pr(host: Host, name: str, prs: list[dict] | None = None) -> dict | None:
    """Under the claim lock: pick this lane's red PR and record the attempt before working it."""
    prs = lane_prs(name) if prs is None else prs
    path = host.state / "fix-attempts.json"
    attempts = json.loads(path.read_text()) if path.exists() else {}
    held = json.loads(held_path(host).read_text()) if held_path(host).exists() else {}
    order, now = pr_events.cost_order(load_providers()), time.time()
    prs = [pr for pr in prs if pr_events.may_take(name, pr, attempts.get(str(pr["number"]), {}), order, now)]
    pr = red_pr(prs, attempts, held)
    # A head another host is fixing is skipped (no attempt charged); the next red PR is ours.
    while pr:
        live = None if claimed_elsewhere(pr["number"], pr["headRefOid"], "fix") else \
            pr_events.fresh_reentry(THIS, pr, attempts.get(str(pr["number"]), {}))
        if live is not None and red_pr([live], attempts, held) is not None:
            pr = live
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
    claim = Locked(host.state / "claim.lock", blocking=True)
    try:
        # Finish before starting: PRs a GitHub event queued, red PRs (any open PR in the repo),
        # then ungated lane drafts, then new issues.
        prs = lane_prs(name)
        candidates = fix_candidates(name)
        events = pr_events.queued_prs(THIS, pr_events.FIX_KINDS)
        requeue_verified(host, prs)
        escalate_exhausted(host, list({pr["number"]: pr for pr in candidates + events}.values()), linear)
        red = pr_events.claim_event_pr(host, THIS, name, events) or claim_red_pr(host, name, candidates)
        adopt = None if red or not provider_may_run(name, "adopt") else claim_adoptable_pr(host, name, prs)
        issue = None
        sweep_lane_prs(host, name, linear)
        budget = None if red or adopt else read_new_issue_budget(name, host.slots(name, spec.get("slots", 1)))
        blocked = budget is not None and not budget["allowed"]
        in_flight = None if red or adopt or blocked else in_flight_issues()
        if in_flight is not None:
            failures = json.loads(failures_path(host).read_text()) if failures_path(host).exists() else {}
            issue = design_gate.pick_build_issue(
                linear.lane_issues(spec["label"]), failures, in_flight=in_flight,
                provider=name, pick=pick_issue, linear=linear, repo=host.repo)
            if issue and linear.state_of(issue.id) != "Todo":
                issue = None  # another host claimed it between our read and now
            if issue:
                linear.move(issue.id, "In Progress")
    finally:
        claim.release()
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
                         "in-flight-unknown" if in_flight is None else "none-eligible")
        slot.release()
        return 0
    notify_issue_claim(linear, issue, name, spec)
    receipt = run_issue(host, name, spec, linear, issue)
    verdict = receipt.get("verdict")
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
        linear.comment(issue.id, f"Preserved work retained at `{handoff['worktree']}`. "
                                 f"Recovery owner: {handoff['owner']}; reason: {handoff['reason']}. "
                                 f"{handoff['nextAction']}")
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
    current = host.state / "current" / "lane_runner.py"
    os.execv(sys.executable, [sys.executable, str(current if current.exists() else Path(__file__)),
                              "worker", "--provider", name])
    return 0


def ensure_full_history(host: Host) -> None:
    """Repo gates check git ancestry (e.g. story provenance); a shallow clone fails them for
    every PR. Clones made with --reference to a shallow mirror inherit that, so repair it."""
    if sh(["git", "rev-parse", "--is-shallow-repository"], cwd=host.repo).stdout.strip() == "true":
        sh(["git", "fetch", "-q", "--unshallow", "origin"], cwd=host.repo, timeout=1800)


def dispatch(host: Host) -> int:
    tick = {"at": now_iso(), "release": read_marker(host), "unhealthy": [], "spawned": [], "error": None}
    try:
        tick["disk"] = disk_guard.check(host)
        if not tick["disk"].get("admitted"):
            raise DiskAdmissionError(tick["disk"].get("reason", "disk-unobservable"))
        ensure_full_history(host)
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
                                 start_new_session=True)
                tick["spawned"].append(name)
    except Exception as error:  # the tick must still leave a receipt the doctor can raise
        tick["error"] = f"{type(error).__name__}: {error}"[:300]
    if tick["error"]:
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
    return 1 if tick["error"] else 0


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
    record_worktree_disposition(host, worktree, "removed")
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


def install_release(host: Host) -> int:
    sh(["git", "fetch", "-q", "origin", "main"], cwd=host.repo)
    tree = sh(["git", "rev-parse", "origin/main:scripts/lanes"], cwd=host.repo).stdout.strip()
    current = host.state / "current"
    marker = current / ".tree"
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
        archive = subprocess.run(["git", "archive", "origin/main", "scripts/lanes", *RELEASE_EXTRAS, *LANE_TESTS],
                                 cwd=host.repo, capture_output=True, check=True)
        subprocess.run(["tar", "-x", "-C", str(staging)], input=archive.stdout, check=True)
        # The self-test must never touch this host's live state: point it at a scratch dir.
        scratch = staging / ".selftest-state"
        scratch.mkdir(exist_ok=True)
        # ~60 s on an idle host; simulator/xcodebuild load from other sessions (load avg ~600 on
        # 2026-09-28) pushed it past 300 s, so every release was refused and fixes never landed.
        def refuse(why: str) -> int:
            refused_path.write_text(json.dumps({"tree": tree, "at": time.time(), "why": why}))
            return 1
        try:
            test = subprocess.run([sys.executable, "-m", "unittest", "-q", *LANE_TESTS],
                                  cwd=staging, capture_output=True, text=True, timeout=UPDATE_TEST_TIMEOUT_S,
                                  env={**os.environ, "LANES_SELFTEST": "1", "LANES_STATE": str(scratch)})
        except subprocess.TimeoutExpired:
            refuse(f"self-test timeout {UPDATE_TEST_TIMEOUT_S}s")
            raise
        if test.returncode != 0:
            print(f"lane update refused: release tests failed\n{test.stderr[-2000:]}", file=sys.stderr)
            return refuse("release tests failed")
        (staging / "scripts/lanes/.tree").write_text(tree)
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
    the agents' own, so a long run never outlives its token."""
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
    # `gh gist` keeps the host's own login.
    shim.write_text(f'#!/bin/sh\n[ "$1" = gist ] && exec {real} "$@"\n'
                    f'GH_TOKEN="$(python3 {HERE / "gh_app_token.py"})" || exit 1\n'
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("dispatch")
    sub.add_parser("update")
    gate = sub.add_parser("gate-command", help="run one gate command while retaining inherited locks")
    gate.add_argument("--timeout", type=float, required=True)
    gate.add_argument("args", nargs=argparse.REMAINDER)
    context = sub.add_parser("context-manifest", help="check or generate the local context contract")
    context.add_argument("--write", action="store_true")
    work = sub.add_parser("worker")
    work.add_argument("--provider", required=True)
    args = parser.parse_args(argv)
    if args.command == "gate-command":
        command = args.args[1:] if args.args[:1] == ["--"] else args.args
        try:
            code = run_agent(command, Path.cwd(), sys.stdout, args.timeout, guard_interval=.1).returncode
            return 125 if code == 124 else code  # 124 is reserved for a drained timeout
        except subprocess.TimeoutExpired:
            return 124  # run_agent has drained its observed descendants before raising
        except RunStopped:
            return 143  # explicit stop also completes the existing drain protocol
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
    if args.command == "worker":
        return worker(host, args.provider)
    return dispatch(host)


if __name__ == "__main__":
    sys.exit(main())
