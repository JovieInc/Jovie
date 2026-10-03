#!/usr/bin/env python3
"""Symphony's central remediation path: one event, one classifier, one ladder.

Stuck PRs, main and scheduled CI failures, deploy failures and Sentry issues
become ``jovie.remediation-event/v1`` records. A Linear issue on JOV or LYB labeled
``remediation:<fingerprint>`` is the same kind of event: one open event per
fingerprint, claimed on the tick that reads it. The classifier names the blocker.
Deterministic rungs run before any model. A providers.json router (tier, health,
cooldown) picks the next enabled lane, Hyperagent included only when its registry
entry is enabled. Needs-human and ladder-exhausted share one deduped surface.
"""
from __future__ import annotations

import hashlib
import os
import re
from datetime import datetime, timezone

SCHEMA = "jovie.remediation-event/v1"
CLASSES = (
    "ready",
    "needs-rebase",
    "flaky-infra",
    "fixable-by-model",
    "needs-human-decision",
    "obsolete",
    "main-red",
)
# Linear label `needs-human` (JOV). Writes stay behind LANES_ESCALATION_NOTIFY_TIM.
NEEDS_HUMAN_LABEL_ID = "ccf5eaaa-8705-49f0-b264-ec3558d678b7"
REMEDIATION_LABEL = "remediation"
# Detector contract: label `remediation:<fingerprint>` on a JOV or LYB issue.
LABEL_PREFIX = "remediation:"
# One label-filtered Linear read per tick. No pagination, no per-issue read.
LABELED_EVENT_QUERY = (
    'query{issues(first:100,filter:{team:{key:{in:["JOV","LYB"]}},'
    'labels:{name:{startsWith:"remediation:"}}}){nodes{id identifier title description '
    'url createdAt updatedAt state{name type} team{key states{nodes{id name type}}} '
    'labels{nodes{id name}}}}}'
)
EVENT_CLAIM_TTL_S = 2 * 3600
# MusicFetch gaps route at the in-house resolver cutover. Never a renewal.
MUSICFETCH_CUTOVER = "JOV-7323"
CLOSED_STATE_TYPES = frozenset({"completed", "canceled", "cancelled"})
HUMAN_ASKS = {
    "spend": "Tim needs to approve the spend. An agent must not start a paid plan or raise a limit.",
    "billing action": "Tim needs to perform the billing action. An agent must not change live billing.",
    "env/DNS/secrets": "Tim needs to change env, DNS, or secrets. An agent must not write credentials or DNS.",
    "store submission": "Tim needs to complete the store submission or agreement. An agent must not submit the store listing.",
    "outside human": "Tim needs a person outside the lanes to act.",
    "manual deploy": "Tim needs to run the manual deploy. An agent must not deploy by hand.",
}
INTAKE_LABEL = "symphony-remediation"
SURFACE_MARKER = "symphony-surface"
CLAIM_WINDOW_S = 30 * 60
HOLD_NAG_S = 24 * 3600
LOCKFILES = frozenset({"pnpm-lock.yaml"})
DIFF_POLICY = frozenset({"secret-file", "diff-too-large", "lockfile-without-manifest"})
STALE_LABELS = frozenset({"lane-fix-exhausted", "queue-poison", "lane-fix-escalating"})
FLAKY_CONCLUSIONS = frozenset({"CANCELLED", "TIMED_OUT", "STARTUP_FAILURE", "CANCELED"})
RED_CONCLUSIONS = FLAKY_CONCLUSIONS | {"FAILURE"}
PENDING_STATUS = frozenset({"IN_PROGRESS", "QUEUED", "PENDING", "WAITING", "REQUESTED"})
INFRA_TEXT = re.compile(
    r"runner has (?:been )?lost|The runner has received a shutdown|ETIMEDOUT|i/o timeout|"
    r"\bOOM\b|out of memory|Killed process|ENOMEM|\b5\d\d\b",
    re.IGNORECASE,
)
STRATEGY_TEXT = re.compile(
    r"canon/strategy|founder strategy|pricing|taste\b|credential",
    re.IGNORECASE,
)
ACTIONABLE_FIX = re.compile(
    r"computeRatePercent|use `|replace `|change `|fix:|add (?:the |a )?(?:story|test|colocated)|"
    r"@coverage-via|remove [`']?hold",
    re.IGNORECASE,
)
WS_BY_SOURCE = {
    "pr": "ci",
    "main-ci": "ci",
    "schedule": "ci",
    "golden-path": "ci",
    "deploy": "release-deploy",
    "sentry": "reliability",
}


def _flag(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _limit(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def escalation_enabled() -> bool:
    """Autonomous ladder. Default on: it spends only lanes already in the registry."""
    return _flag("LANES_ESCALATION", True)


def notify_tim() -> bool:
    return _flag("LANES_ESCALATION_NOTIFY_TIM", False)


def lift_human_holds() -> bool:
    return _flag("LANES_ESCALATION_LIFT_HUMAN_HOLDS", False)


def per_head_cap() -> int:
    return _limit("LANES_ESCALATION_PER_HEAD", 2)


def per_pr_cap() -> int:
    return _limit("LANES_ESCALATION_PER_PR", 4)


def cooldown_s() -> int:
    return _limit("LANES_ESCALATION_COOLDOWN_S", 30 * 60)


def blocker(cls: str, subtype: str | None, evidence, next_action: str) -> dict:
    return {"cls": cls, "subtype": subtype, "evidence": [str(item) for item in evidence if item],
            "next_action": next_action}


def fingerprint(parts: list[str]) -> str:
    text = "\n".join(sorted(str(part) for part in parts if part is not None))
    return hashlib.sha256(text.encode()).hexdigest()[:20]


def remediation_event(*, source: str, fingerprint: str, subject: dict, evidence: dict | None,
                      ws: str, first_seen) -> dict:
    return {"schema": SCHEMA, "source": source, "fingerprint": fingerprint,
            "subject": subject, "evidence": evidence or {}, "ws": ws, "first_seen": first_seen}


def _labels(pr: dict) -> set[str]:
    names = []
    for label in pr.get("labels") or []:
        names.append(label.get("name", "") if isinstance(label, dict) else str(label))
    return {name.lower() for name in names if name}


def _checks(pr: dict) -> list[dict]:
    return [check for check in (pr.get("statusCheckRollup") or []) if isinstance(check, dict)]


def _conclusion(check: dict) -> str:
    return str(check.get("conclusion") or "").upper()


def _failing(pr: dict) -> list[dict]:
    return [check for check in _checks(pr) if _conclusion(check) in RED_CONCLUSIONS]


def _pending(pr: dict) -> list[dict]:
    return [check for check in _checks(pr)
            if str(check.get("status") or "").upper() in PENDING_STATUS and _conclusion(check) not in RED_CONCLUSIONS]


def _threads(pr: dict) -> list[dict]:
    return [thread for thread in (pr.get("reviewThreads") or []) if isinstance(thread, dict)]


def _bot(thread: dict) -> bool:
    if thread.get("bot") is True:
        return True
    author = thread.get("author") or thread.get("user") or ""
    if isinstance(author, dict):
        if author.get("type") == "Bot":
            return True
        author = author.get("login") or ""
    login = str(author)
    return login.endswith("[bot]") or login.lower() in {"sentry", "codex"}


def _unresolved(threads: list[dict]) -> list[dict]:
    return [thread for thread in threads if not thread.get("resolved")]


def _hold_text(pr: dict, held: dict | None) -> tuple[str, str]:
    note = pr.get("holdNote") or {}
    if isinstance(note, dict) and (note.get("body") or note.get("text")):
        return str(note.get("author") or ""), str(note.get("body") or note.get("text") or "")
    evidence = (held or {}).get("evidence") or []
    return str((held or {}).get("author") or ""), "\n".join(str(line) for line in evidence)


def _actionable(text: str) -> bool:
    return bool(text and ACTIONABLE_FIX.search(text))


def _strategy(pr: dict) -> bool:
    files = pr.get("files") or pr.get("paths") or pr.get("conflictFiles") or []
    blob = " ".join([pr.get("title") or "", pr.get("body") or "", " ".join(str(item) for item in files)])
    return bool(STRATEGY_TEXT.search(blob))


def _held_reason(pr: dict, held: dict | None) -> str | None:
    entry = held or {}
    sha = pr.get("headRefOid")
    if entry and sha and entry.get("sha") not in (None, sha):
        return None
    return entry.get("reason")


def _obsolete(pr: dict) -> str | None:
    linked = pr.get("linkedIssue") or {}
    state = str(linked.get("state") or linked.get("stateType") or "").lower()
    if state in {"done", "completed", "canceled", "cancelled", "duplicate"} and (
            linked.get("supersededBy") or linked.get("duplicateOfMerged")):
        return f"linked issue {linked.get('identifier') or ''} is {state}"
    if pr.get("newerMergedPr"):
        return f"newer merged PR #{pr['newerMergedPr']} covers the same JOV id"
    return None


def _main_overlap(pr: dict, main_rollup) -> list[str]:
    if not main_rollup:
        return []
    failed = {str(check.get("name")) for check in main_rollup
              if isinstance(check, dict) and _conclusion(check) in RED_CONCLUSIONS}
    return [str(check.get("name")) for check in _failing(pr) if str(check.get("name")) in failed]


def _green(pr: dict) -> bool:
    checks = _checks(pr)
    if not checks or _failing(pr) or _pending(pr):
        return False
    return all(_conclusion(check) in {"SUCCESS", "SKIPPED", "NEUTRAL"} for check in checks)


def classify_blocker(pr: dict, held: dict | None = None, attempts: dict | None = None,
                     main_rollup=None) -> dict:
    """One blocker class from the reconcile fields the lanes already read."""
    attempts = attempts or {}
    labels = _labels(pr)
    evidence: list[str] = []
    reason = _held_reason(pr, held)
    author, note = _hold_text(pr, held)
    threads = _unresolved(_threads(pr))
    bot_threads = [thread for thread in threads if _bot(thread)]
    human_threads = [thread for thread in threads if not _bot(thread)]
    merge = str(pr.get("mergeStateStatus") or "")
    obsolete = _obsolete(pr)
    if obsolete:
        return blocker("obsolete", None, [obsolete], "surface-only")

    if _strategy(pr) or "needs-human" in labels or reason in DIFF_POLICY \
            or "sensitive-surface" in labels or pr.get("sensitiveSurface"):
        why = []
        if _strategy(pr):
            why.append("strategy/pricing/credential/taste content")
        if "needs-human" in labels:
            why.append("needs-human label")
        if reason in DIFF_POLICY:
            why.append(reason)
        if "sensitive-surface" in labels or pr.get("sensitiveSurface"):
            why.append("sensitive-surface")
        return blocker("needs-human-decision", reason or "human-gate", why, "tim-decides")

    human_review = pr.get("reviewDecision") == "CHANGES_REQUESTED" and (
        bool(human_threads) or not bot_threads)
    if human_review:
        return blocker("needs-human-decision", "changes-requested",
                       ["human changes requested"], "tim-decides")

    held_here = bool(labels & {"hold", "gated", "incident", "do-not-merge", "tim-hold", "tim:hold", "hold:tim"})
    if held_here and not _actionable(note):
        return blocker("needs-human-decision", "hold",
                       [note[:240] or "human hold without a fix"], "tim-decides")
    if pr.get("codeownersBlocked") or "codeowners" in labels:
        return blocker("needs-human-decision", "codeowners",
                       ["missing required human approval"], "tim-decides")

    if held_here and _actionable(note):
        return blocker("fixable-by-model", "human-hold",
                       [f"{author}: {note[:400]}".strip(": ")], "apply-prescribed-fix")

    if merge in {"DIRTY", "BEHIND"} or str(pr.get("mergeable") or "").upper() == "CONFLICTING":
        files = [str(path) for path in (pr.get("conflictFiles") or [])]
        subtype = "lockfile-only" if files and set(files) <= LOCKFILES else "semantic"
        if bot_threads:
            evidence.append("unresolved bot review: " + "; ".join(
                f"{thread.get('severity') or 'note'} {(thread.get('body') or '')[:120]}"
                for thread in bot_threads[:4]))
        if files:
            evidence.append("conflicts: " + ", ".join(files[:12]))
        evidence.append(f"mergeStateStatus={merge or 'CONFLICTING'}")
        action = "resolve-lockfile" if subtype == "lockfile-only" else "update-branch"
        return blocker("needs-rebase", subtype, evidence, action)

    overlap = _main_overlap(pr, main_rollup)
    failing = _failing(pr)
    flaky = [check for check in failing if _conclusion(check) in FLAKY_CONCLUSIONS
             or INFRA_TEXT.search(str(check.get("excerpt") or check.get("name") or ""))]
    if overlap:
        return blocker("flaky-infra", "main-red", [f"main is red on {', '.join(overlap)}"], "wait")
    if failing and len(flaky) == len(failing):
        return blocker("flaky-infra", "infra",
                       [f"{check.get('name')}: {_conclusion(check)}" for check in flaky], "rerun")

    pending = _pending(pr)
    if pending and not failing and merge != "DIRTY":
        return blocker("ready", "awaiting",
                       [f"{check.get('name')} {check.get('status')}" for check in pending[:6]], "wait")

    if _green(pr) and not pr.get("isDraft") and merge in {"CLEAN", "HAS_HOOKS", "UNSTABLE", "BLOCKED", ""}:
        if pr.get("autoMergeRequest"):
            return blocker("ready", "armed", ["auto-merge already requested"], "none")
        stale = sorted(labels & {name.lower() for name in STALE_LABELS})
        return blocker("ready", None, [*stale, "green and not armed"], "arm")

    if failing or bot_threads or ("queue-poison" in labels and (pr.get("queueFailure") or pr.get("mergeGroupLog"))):
        if failing:
            evidence.extend(f"{check.get('name')}: {(check.get('excerpt') or _conclusion(check))[:240]}"
                            for check in failing[:4])
        if bot_threads:
            evidence.append("unresolved bot review")
        log = pr.get("queueFailure") or pr.get("mergeGroupLog")
        if log:
            evidence.append(str(log)[:400])
        pushed = attempts.get("pushedHead") or attempts.get("sha")
        if attempts.get("count") and attempts.get("pushed") is False and attempts.get("sha") == pr.get("headRefOid"):
            evidence.append("attempts did not move the head")
        elif pushed and pushed == pr.get("headRefOid") and attempts.get("pushed") is False:
            evidence.append("attempts did not move the head")
        return blocker("fixable-by-model", "check" if failing else "review", evidence, "escalate")

    if pr.get("isDraft") and _green(pr):
        return blocker("ready", "draft", ["lane draft is green"], "ready-green")
    return blocker("needs-human-decision", "unclassified", ["no autonomous rung matched"], "tim-decides")


def classify_event(event: dict) -> dict:
    """Same classes as classify_blocker, plus main-red when main itself is the failure."""
    if not isinstance(event, dict):
        return blocker("needs-human-decision", "malformed", ["event was not an object"], "tim-decides")
    source = event.get("source")
    if source == "pr" or event.get("pr"):
        pr = event.get("pr") if isinstance(event.get("pr"), dict) else event.get("subject") or {}
        classified = classify_blocker(pr, event.get("held"), event.get("attempts"), event.get("main_rollup"))
        if classified["subtype"] == "main-red":
            return blocker("main-red", "main-red", classified["evidence"], "wait")
        return classified
    evidence = event.get("evidence") or {}
    excerpt = str(evidence.get("excerpt") or "")
    if source in {"main-ci", "schedule", "golden-path"} and (
            event.get("main_red") or INFRA_TEXT.search(excerpt)):
        cls = "main-red" if event.get("main_red") or source == "main-ci" else "flaky-infra"
        if event.get("main_red") or source == "main-ci":
            return blocker("main-red", "main-red", [excerpt[:240] or source], "wait")
        return blocker("flaky-infra", source, [excerpt[:240] or source], "rerun")
    if source == "deploy":
        return blocker("fixable-by-model", "deploy", [excerpt[:240] or "deploy failure"], "route")
    if source == "sentry":
        return blocker("fixable-by-model", "sentry", [excerpt[:240] or "sentry issue"], "route")
    return blocker("fixable-by-model", source or "event", [excerpt[:240] or "remediation event"], "route")


def _indexed(providers: dict, *, remote: bool = False) -> list[tuple[int, int, str, dict]]:
    """Lanes by tier. Remote-only lanes (`repairs: false`, Hyperagent) cannot continue a local
    worktree or repair a checkout, so handoff and escalation never see them unless asked."""
    rows = []
    for index, (name, spec) in enumerate(providers.items()):
        if not isinstance(spec, dict) or (not remote and spec.get("repairs") is False):
            continue
        tier = spec.get("tier", index)
        try:
            tier = int(tier)
        except (TypeError, ValueError):
            tier = index
        rows.append((tier, index, name, spec))
    rows.sort()
    return rows


def route_lane(providers: dict, *, exclude: set[str] | None = None, healthy=None, cooled: set[str] | None = None) -> dict | None:
    """Next enabled, healthy, uncooled lane. Disabled registry entries are never chosen."""
    exclude = exclude or set()
    cooled = cooled or set()
    healthy = healthy or (lambda name, spec: True)
    for tier, index, name, spec in _indexed(providers):
        if name in exclude or name in cooled or not spec.get("enabled", True):
            continue
        if not healthy(name, spec):
            continue
        return {"lane": name, "spec": spec, "tier": tier, "index": index}
    return None


def failover(providers: dict, current: str, reason: str, *, exclude: set[str] | None = None,
             healthy=None, cooled: set[str] | None = None) -> dict:
    """Cool `current` and take the next registry lane. The receipt records the handoff."""
    cooled = set(cooled or ())
    cooled.add(current)
    skipped = set(exclude or ())
    skipped.add(current)
    nxt = route_lane(providers, exclude=skipped, healthy=healthy, cooled=cooled)
    return {"from": current, "to": None if nxt is None else nxt["lane"], "reason": reason,
            "cooled": sorted(cooled), "lane": nxt}


def select_escalation_lane(providers: dict, attempted: set[str], *, healthy=None, cooled: set[str] | None = None,
                           top_rung_used: bool = False) -> dict | None:
    """Lowest tier strictly stronger than every lane that already attempted this head.

    When none is stronger, one top-rung retry on the strongest enabled healthy lane.
    """
    cooled = cooled or set()
    healthy = healthy or (lambda name, spec: True)
    catalog = []
    tiers = {}
    for tier, index, name, spec in _indexed(providers):
        tiers[name] = tier
        if not spec.get("enabled", True) or name in cooled or not healthy(name, spec):
            continue
        catalog.append({"lane": name, "spec": spec, "tier": tier, "index": index})
    if not catalog:
        return None
    ceiling = max((tiers[name] for name in attempted if name in tiers), default=-1)
    stronger = [row for row in catalog if row["tier"] > ceiling and row["lane"] not in attempted]
    if stronger:
        return {**stronger[0], "topRung": False}
    if top_rung_used:
        return None
    strongest = max(catalog, key=lambda row: (row["tier"], -row["index"]))
    return {**strongest, "topRung": True}


# ---------------------------------------------------------------- issue routing (JOV-7706)
# One decision per issue: the capability floor comes from risk (routing.json), then the
# cheapest available route that clears it, by effective cost = route cost x quota pressure.
# Free and subsidized lanes come first; subscription lanes get dearer as their window fills
# and drop out while banked. Nothing ever falls below the floor: no qualifying route holds.

CAPABILITIES = ("bounded", "standard", "frontier")
ROUTING_SCHEMA = "jovie-lane-route/v1"


def capability_rank(name) -> int:
    return CAPABILITIES.index(name) if name in CAPABILITIES else CAPABILITIES.index("standard")


def required_capability(title: str, description: str, labels, policy: dict) -> dict:
    """Risk floor for one issue. Frontier evidence beats a bounded marker: a frozen plan for a
    protected surface still needs a frontier implementer here (JOV-7343 phase receipts are
    separate work), so cheap lanes only take bounded work that touches nothing protected."""
    lowered = {str(label).lower() for label in labels or ()}
    reasons = []
    frontier = policy.get("frontier") or {}
    for label in sorted(lowered & {str(x).lower() for x in frontier.get("labels") or ()}):
        reasons.append(f"label:{label}")
    for pattern in frontier.get("titlePatterns") or ():
        if re.search(pattern, title or "", re.I):
            reasons.append(f"title:{pattern}")
    for pattern in frontier.get("bodyPatterns") or ():
        if re.search(pattern, description or "", re.I):
            reasons.append(f"body:{pattern}")
    if reasons:
        return {"capability": "frontier", "reasons": reasons}
    bounded = policy.get("bounded") or {}
    for label in sorted(lowered & {str(x).lower() for x in bounded.get("labels") or ()}):
        reasons.append(f"label:{label}")
    for marker in bounded.get("bodyMarkers") or ():
        if marker.lower() in (description or "").lower():
            reasons.append(f"marker:{marker}")
    if reasons:
        return {"capability": "bounded", "reasons": reasons}
    return {"capability": "standard", "reasons": ["default"]}


def issue_routes(providers: dict) -> list[dict]:
    """Every enabled (lane, model) route with its capability and base cost."""
    rows = []
    for tier, index, name, spec in _indexed(providers, remote=True):
        if not spec.get("enabled", True):
            continue
        for order, route in enumerate(spec.get("routes") or ()):
            if not isinstance(route, dict) or not route.get("model"):
                continue
            rows.append({"lane": name, "model": route["model"], "alias": route.get("alias"),
                         "capability": route.get("capability", "standard"),
                         "costClass": route.get("costClass"), "cost": float(route.get("cost", tier)),
                         "tier": tier, "index": index, "order": order})
    return rows


def explicit_lane(labels, providers: dict) -> dict | None:
    """`route:<lane>[:<alias>]` or a bare lane label names the route; the floor still applies."""
    lowered = [str(label).lower() for label in labels or ()]
    for label in lowered:
        if label.startswith("route:"):
            parts = label.split(":")
            if len(parts) >= 2 and parts[1] in providers:
                return {"lane": parts[1], "alias": parts[2] if len(parts) > 2 else None, "via": label}
    for name, spec in providers.items():
        if isinstance(spec, dict) and str(spec.get("label", name)).lower() in lowered:
            return {"lane": name, "alias": None, "via": spec.get("label", name)}
    return None


def route_issue(issue: dict, providers: dict, policy: dict, availability, *, only_lanes=None) -> dict:
    """Pure routing decision; `availability(lane, route)` returns {ok, why, pressure}.

    Candidates are routes at or above the floor, cheapest effective cost first (ties: tier,
    then list order). An explicit lane narrows the candidates to that lane when it can clear
    the floor; otherwise it is ignored and the receipt says so. `only_lanes` is the guarded
    sensitive-surface restriction. The first available candidate is chosen; none -> held.
    """
    labels = issue.get("labels") or []
    need = required_capability(issue.get("title", ""), issue.get("description", ""), labels, policy)
    floor = capability_rank(need["capability"])
    routes = issue_routes(providers)
    if only_lanes is not None:
        routes = [row for row in routes if row["lane"] in only_lanes]
    qualified = [row for row in routes if capability_rank(row["capability"]) >= floor]
    explicit = explicit_lane(labels, providers)
    notes = []
    if explicit:
        pinned = [row for row in qualified if row["lane"] == explicit["lane"]
                  and (explicit["alias"] is None or row["alias"] == explicit["alias"])]
        if pinned:
            qualified = pinned
            notes.append(f"explicit:{explicit['via']}")
        else:
            notes.append(f"explicit-below-floor-or-disabled:{explicit['via']}")
    candidates = []
    for row in qualified:
        seen = availability(row["lane"], row) or {}
        pressure = max(0.0, float(seen.get("pressure") or 0.0))
        candidates.append({**row, "available": bool(seen.get("ok")), "why": seen.get("why") or "ok",
                           "pressure": round(pressure, 3),
                           "effectiveCost": round(row["cost"] * (1 + pressure), 3)})
    candidates.sort(key=lambda row: (row["effectiveCost"], row["tier"], row["index"], row["order"]))
    chosen = next((row for row in candidates if row["available"]), None)
    rejected = [row for row in routes if capability_rank(row["capability"]) < floor]
    if chosen is None:
        rationale = (f"no available route clears the {need['capability']} floor; held, never downgraded"
                     if candidates else f"no enabled route clears the {need['capability']} floor; held")
    else:
        cheaper = [row for row in candidates if row["effectiveCost"] < chosen["effectiveCost"]]
        rationale = (f"{need['capability']} work ({', '.join(need['reasons'])}) -> {chosen['lane']}/"
                     f"{chosen['model']} at effective cost {chosen['effectiveCost']} "
                     f"({chosen['costClass'] or 'unclassed'}, pressure {chosen['pressure']})")
        if cheaper:
            rationale += "; cheaper skipped: " + ", ".join(f"{row['lane']}/{row['model']}={row['why']}" for row in cheaper)
        if rejected:
            rationale += "; below floor: " + ", ".join(sorted({f"{row['lane']}/{row['model']}" for row in rejected}))
    return {"schema": ROUTING_SCHEMA, "issue": issue.get("identifier"), "required": need["capability"],
            "reasons": need["reasons"], "notes": notes,
            "chosen": None if chosen is None else {key: chosen[key] for key in
                                                   ("lane", "model", "alias", "capability", "costClass",
                                                    "cost", "pressure", "effectiveCost")},
            "candidates": [{key: row[key] for key in ("lane", "model", "capability", "cost", "pressure",
                                                      "effectiveCost", "available", "why")}
                           for row in candidates],
            "rationale": rationale}


def _rungs(record: dict, head: str, kind: str | None = None, rung: str | None = None) -> list[dict]:
    rows = []
    for row in list(record.get("escalations") or []) + list(record.get("priorEscalations") or []):
        if not isinstance(row, dict):
            continue
        if head and row.get("head") not in (None, head) and kind == "model" and row.get("kind") == "model":
            # Per-head model rows are filtered by the caller. Keep PR-wide rows available.
            pass
        if kind and row.get("kind") != kind:
            continue
        if rung and row.get("rung") != rung:
            continue
        rows.append(row)
    return rows


def deterministic_used(record: dict, head: str, rung: str) -> bool:
    return any(row.get("head") == head and row.get("rung") == rung and row.get("kind") == "deterministic"
               for row in (record.get("escalations") or []) if isinstance(row, dict))


def model_escalations(record: dict, head: str | None = None) -> list[dict]:
    rows = [row for row in (record.get("escalations") or []) + (record.get("priorEscalations") or [])
            if isinstance(row, dict) and row.get("kind") == "model"]
    if head is None:
        return rows
    return [row for row in rows if row.get("head") == head]


def caps_allow(record: dict, head: str, now: float) -> tuple[bool, str | None]:
    if len(model_escalations(record, head)) >= per_head_cap():
        return False, "ladder-exhausted"
    if len(model_escalations(record, None)) >= per_pr_cap():
        return False, "ladder-exhausted"
    stamps = [float(row.get("at") or 0) for row in model_escalations(record, None)
              if isinstance(row, dict)]
    latest = max(stamps, default=0)
    if latest and now - latest < cooldown_s():
        return False, "cooldown"
    return True, None


def attempted_lanes(record: dict, head: str) -> set[str]:
    lanes = set()
    if record.get("lane") and record.get("sha") == head:
        lanes.add(record["lane"])
    for row in record.get("escalations") or []:
        if isinstance(row, dict) and row.get("head") == head and row.get("lane"):
            lanes.add(row["lane"])
    for name in record.get("lanes") or []:
        lanes.add(name)
    return lanes


def top_rung_used(record: dict, head: str) -> bool:
    return any(isinstance(row, dict) and row.get("head") == head and row.get("topRung")
               for row in record.get("escalations") or [])


def plan_ladder(classified: dict, record: dict, providers: dict, now: float, head: str, *,
                healthy=None, cooled: set[str] | None = None) -> dict:
    """Next rung. Deterministic actions spend no model. Caps end at ladder-exhausted."""
    cls = classified["cls"]
    subtype = classified.get("subtype")
    record = record or {}
    if not escalation_enabled() and cls in {"fixable-by-model", "needs-rebase", "flaky-infra"}:
        return {"action": "surface", "reason": "escalation-disabled", "cls": cls}
    if cls in {"obsolete", "needs-human-decision"}:
        return {"action": "surface", "reason": cls, "cls": cls}
    if cls == "main-red" or subtype == "main-red":
        return {"action": "wait", "reason": "main-red", "cls": "main-red"}
    if cls == "ready":
        if subtype == "awaiting":
            return {"action": "wait", "reason": "awaiting", "cls": cls}
        if classified["next_action"] in {"none", "ready-green"}:
            return {"action": classified["next_action"], "reason": subtype or "ready", "cls": cls}
        return {"action": "arm", "reason": "ready", "cls": cls}
    if cls == "flaky-infra":
        if not deterministic_used(record, head, "rerun"):
            return {"action": "rerun", "reason": "flaky-infra", "kind": "deterministic", "cls": cls}
    if cls == "needs-rebase":
        if subtype == "lockfile-only" and not deterministic_used(record, head, "lockfile"):
            return {"action": "resolve-lockfile", "reason": "lockfile-only", "kind": "deterministic", "cls": cls}
        if not deterministic_used(record, head, "update-branch"):
            return {"action": "update-branch", "reason": subtype or "needs-rebase", "kind": "deterministic", "cls": cls}
    if cls in {"fixable-by-model", "needs-rebase", "flaky-infra"}:
        allowed, why = caps_allow(record, head, now)
        if not allowed and why == "cooldown":
            return {"action": "wait", "reason": "cooldown", "cls": cls}
        if not allowed:
            return {"action": "surface", "reason": "ladder-exhausted", "cls": cls}
        chosen = select_escalation_lane(providers, attempted_lanes(record, head), healthy=healthy, cooled=cooled,
                                         top_rung_used=top_rung_used(record, head))
        if chosen is None:
            return {"action": "surface", "reason": "ladder-exhausted", "cls": cls}
        return {"action": "model", "reason": "top-rung" if chosen["topRung"] else "escalate",
                "lane": chosen["lane"], "tier": chosen["tier"], "topRung": chosen["topRung"],
                "kind": "model", "cls": cls, "spec": chosen["spec"]}
    return {"action": "wait", "reason": cls, "cls": cls}


def append_rung(record: dict, *, rung: str, lane: str | None, cls: str, at: float, head: str,
                kind: str, top_rung: bool = False, ok: bool | None = None) -> dict:
    """Record a rung without resetting spent attempt history."""
    entry = dict(record or {})
    rows = list(entry.get("escalations") or [])
    rows.append({"rung": rung, "lane": lane, "cls": cls, "at": at, "head": head, "kind": kind,
                 "topRung": top_rung, "ok": ok})
    entry["escalations"] = rows
    entry["escalation"] = {"rung": rung, "lane": lane, "cls": cls, "at": at}
    return entry


def dossier(pr: dict, classified: dict, record: dict | None = None) -> str:
    record = record or {}
    lines = [
        f"Blocker class: {classified['cls']}" + (f" ({classified.get('subtype')})" if classified.get("subtype") else ""),
        "Evidence:",
        *[f"- {item}" for item in (classified.get("evidence") or ["none"])],
    ]
    if pr.get("conflictFiles"):
        lines.append("Conflict files: " + ", ".join(str(path) for path in pr["conflictFiles"]))
    log = pr.get("queueFailure") or pr.get("mergeGroupLog")
    if log:
        lines += ["Merge-group / failing log:", str(log)[:2000]]
    threads = _unresolved(_threads(pr))
    if threads:
        lines.append("Unresolved review threads:")
        for thread in threads[:8]:
            lines.append(f"- {thread.get('author') or 'unknown'}: {(thread.get('body') or '')[:400]}")
    author, note = _hold_text(pr, None)
    if note:
        lines.append(f"Hold note ({author or 'unknown'}): {note[:1000]}")
    prior = record.get("escalations") or []
    if prior:
        lines.append("Prior rungs: " + "; ".join(
            f"{row.get('kind')}:{row.get('rung')}:{row.get('lane') or '-'}" for row in prior if isinstance(row, dict)))
    if record.get("count"):
        lines.append(f"Fix attempts already spent on this generation: {record.get('count')} "
                     f"(pushed={record.get('pushed')})")
    linked = pr.get("linkedIssue") or {}
    if linked.get("identifier") or pr.get("issue"):
        lines.append(f"Linked issue: {linked.get('identifier') or pr.get('issue')}")
    lines.append("Do not reset attempt history. Push to this branch. Do not open a new PR.")
    return "\n".join(lines)


def surface_marker(number, head: str) -> str:
    return f"<!-- {SURFACE_MARKER} pr={number} head={head} -->"


def surface_body(pr: dict, classified: dict, reason: str) -> str:
    evidence = "; ".join(classified.get("evidence") or [])[:800] or "none"
    decision = classified.get("next_action") or reason
    subtype = f" ({classified['subtype']})" if classified.get("subtype") else ""
    return (f"🤖 lanes: `{classified['cls']}`{subtype} — {reason}.\n"
            f"Evidence: {evidence}.\n"
            f"Decision needed: {decision}.\n"
            + surface_marker(pr.get("number"), pr.get("headRefOid") or ""))


def already_surfaced(texts: list[str], number, head: str) -> bool:
    marker = surface_marker(number, head)
    return any(marker in (text or "") for text in texts)


def hold_nag_due(nags: dict, pr: int, head: str, now: float) -> bool:
    """At most one hold nag per PR per head per 24h, even if a pass misses the row."""
    row = (nags or {}).get(str(pr)) or {}
    if row.get("head") != head:
        return True
    try:
        return now - float(row.get("at") or 0) >= HOLD_NAG_S
    except (TypeError, ValueError):
        return True


def empty_escalation() -> dict:
    return {"by_class": {name: 0 for name in CLASSES}, "escalating": 0, "ladder_exhausted": 0,
            "surfaced": [], "attempts24h": 0, "landed_after_escalation24h": 0}


def empty_events() -> dict:
    return {"eventsOpen": 0, "eventsClaimed": 0, "eventsHuman": 0, "eventsExhausted": 0,
            "byFingerprint": {}}


def empty_remediation() -> dict:
    report = {"by_source": {}, "by_class": {name: 0 for name in CLASSES}, "routed_by_lane": {},
              "failovers24h": 0, "escalations24h": 0, "ladder_exhausted": 0, "surfaced": []}
    report.update(empty_events())
    return report


def _within(stamp, now: float) -> bool:
    try:
        return now - float(stamp) <= 86400
    except (TypeError, ValueError):
        return False


def escalation_summary(snapshot: dict | None, receipts: list[dict] | None, now: float) -> dict:
    snapshot = snapshot or {}
    report = empty_escalation()
    latest: dict[int, str] = {}
    for row in snapshot.get("classified") or []:
        if not isinstance(row, dict) or row.get("cls") not in report["by_class"]:
            continue
        number = row.get("pr")
        if number is not None:
            latest[int(number)] = row["cls"]
    for cls in latest.values():
        report["by_class"][cls] += 1
    report["escalating"] = len(snapshot.get("escalating") or [])
    report["ladder_exhausted"] = len(snapshot.get("ladderExhausted") or [])
    report["surfaced"] = [{"pr": row.get("pr"), "cls": row.get("cls"), "reason": row.get("reason")}
                          for row in (snapshot.get("surfaced") or []) if isinstance(row, dict)]
    report["attempts24h"] = sum(1 for row in (snapshot.get("attempts") or [])
                                if isinstance(row, dict) and _within(row.get("at"), now))
    landed = 0
    for receipt in receipts or []:
        if not isinstance(receipt, dict) or not receipt.get("escalation"):
            continue
        if receipt.get("verdict") in {"landing", "verified-not-queued"} and _within_iso(receipt.get("endedAt"), now):
            landed += 1
    report["landed_after_escalation24h"] = landed
    return report


def _within_iso(stamp, now: float) -> bool:
    if not stamp:
        return False
    try:
        parsed = datetime.fromisoformat(str(stamp).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return False
    return now - parsed <= 86400


def remediation_summary(snapshot: dict | None, receipts: list[dict] | None, now: float) -> dict:
    snapshot = snapshot or {}
    report = empty_remediation()
    for source, count in (snapshot.get("bySource") or {}).items():
        report["by_source"][str(source)] = int(count)
    escalation = escalation_summary(snapshot, receipts, now)
    report["by_class"] = escalation["by_class"]
    report["routed_by_lane"] = {str(lane): int(count) for lane, count in (snapshot.get("routedByLane") or {}).items()}
    report["failovers24h"] = sum(1 for row in (snapshot.get("failovers") or [])
                                 if isinstance(row, dict) and _within(row.get("at"), now))
    report["escalations24h"] = escalation["attempts24h"]
    report["ladder_exhausted"] = escalation["ladder_exhausted"]
    report["surfaced"] = escalation["surfaced"]
    report.update(events_summary(snapshot))
    return report


def alert_reason(report: dict) -> str | None:
    surfaced = report.get("surfaced") or []
    if not surfaced:
        return None
    listed = ", ".join(f"#{row.get('pr')} {row.get('cls')}" for row in surfaced[:12])
    return f"needs a human decision: {listed}"


def intake_labels(ws: str) -> list[str]:
    key = ws if ws in {"ci", "release-deploy", "reliability"} else "ci"
    return [REMEDIATION_LABEL, "agent-ready", f"ws:{key}"]


def intake_body(event: dict) -> str:
    evidence = event.get("evidence") or {}
    return "\n".join([
        f"Symphony remediation intake ({event.get('source')}).",
        f"Fingerprint: `{event.get('fingerprint')}`",
        f"Workstream: `ws:{event.get('ws')}`",
        f"Subject: `{event.get('subject')}`",
        f"Evidence: {evidence.get('url') or 'n/a'}",
        str(evidence.get("excerpt") or "")[:1500],
        f"<!-- {INTAKE_LABEL} fingerprint={event.get('fingerprint')} -->",
    ])


def claim_open(updated_at: float | None, now: float) -> bool:
    return updated_at is not None and now - updated_at < CLAIM_WINDOW_S


def non_pr_event(event_name: str, payload: dict) -> dict | None:
    """Normalize a relay payload that is not a pull request. None keeps the PR label path."""
    payload = payload or {}
    if event_name == "workflow_run":
        run = payload.get("workflow_run") or {}
        if run.get("pull_requests"):
            return None
        conclusion = str(run.get("conclusion") or "")
        if conclusion not in {"failure", "timed_out", "startup_failure", "cancelled"}:
            return None
        kind = str(run.get("event") or "")
        branch = run.get("head_branch")
        if kind == "pull_request":
            return None
        if branch != "main" and kind not in {"schedule", "workflow_dispatch"}:
            return None
        name = str(run.get("name") or "workflow")
        lowered = name.lower()
        if kind == "schedule" or "golden" in lowered or "synthetic" in lowered or "continuity" in lowered:
            source = "golden-path" if "golden" in lowered else "schedule"
        elif "deploy" in lowered or "production controller" in lowered or "production release" in lowered:
            source = "deploy"
        else:
            source = "main-ci"
        ws = WS_BY_SOURCE[source]
        excerpt = f"{name} {conclusion}"
        return remediation_event(
            source=source,
            fingerprint=fingerprint([source, name, str(run.get("head_sha") or ""), conclusion]),
            subject={"sha": run.get("head_sha"), "workflow": name},
            evidence={"url": run.get("html_url") or "", "excerpt": excerpt},
            ws=ws,
            first_seen=run.get("updated_at") or run.get("created_at"),
        )
    if event_name == "deployment_status":
        status = payload.get("deployment_status") or {}
        if str(status.get("state") or "") not in {"failure", "error"}:
            return None
        deployment = payload.get("deployment") or {}
        environment = str(deployment.get("environment") or "")
        sha = str(deployment.get("sha") or "")
        return remediation_event(
            source="deploy",
            fingerprint=fingerprint(["deploy", environment, sha, str(status.get("state") or "")]),
            subject={"sha": sha, "deployment": environment},
            evidence={"url": status.get("target_url") or status.get("log_url") or "",
                      "excerpt": status.get("description") or f"{environment} {status.get('state')}"},
            ws="release-deploy",
            first_seen=status.get("created_at"),
        )
    if event_name == "repository_dispatch" and payload.get("action") == "sentry-issue":
        return event_from_sentry(payload.get("client_payload") or {})
    return None


def event_from_sentry(payload: dict | None) -> dict | None:
    """Normalize the existing Sentry repository_dispatch payload. No new Sentry credential."""
    payload = payload or {}
    issue_id = str(payload.get("issue_id") or payload.get("dedupe_key") or "")
    if not issue_id:
        return None
    context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
    return remediation_event(
        source="sentry",
        fingerprint=fingerprint(["sentry", issue_id]),
        subject={"sentry_issue": issue_id},
        evidence={"url": payload.get("url") or "",
                  "excerpt": str(payload.get("message") or payload.get("title") or "")[:500]},
        ws="reliability",
        first_seen=context.get("first_seen"),
    )


def event_from_pr(pr: dict, kind: str) -> dict:
    number = pr.get("number")
    sha = pr.get("headRefOid") or pr.get("sha")
    return remediation_event(
        source="pr",
        fingerprint=fingerprint(["pr", str(number), str(sha or ""), kind]),
        subject={"pr": number, "sha": sha, "kind": kind},
        evidence={"url": pr.get("url") or "", "excerpt": kind},
        ws="ci",
        first_seen=pr.get("updatedAt"),
    )


def linear_intake_plan(event: dict) -> dict:
    return {"title": f"Symphony remediation {event.get('source')} {event.get('fingerprint')}"[:200],
            "description": intake_body(event),
            "labels": intake_labels(str(event.get("ws") or "ci")),
            "ws": event.get("ws") or "ci"}


def iso_epoch(stamp: str | None) -> float | None:
    try:
        return datetime.fromisoformat(str(stamp).replace("Z", "+00:00")).timestamp()
    except (TypeError, ValueError):
        return None


def now_iso(now: float | None = None) -> str:
    moment = datetime.now(timezone.utc) if now is None else datetime.fromtimestamp(now, timezone.utc)
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


def fingerprint_key(name: str) -> str:
    """Suffix of a `remediation:<fingerprint>` label. Other text is returned unchanged."""
    text = str(name or "").strip()
    if text.lower().startswith(LABEL_PREFIX):
        return text.split(":", 1)[1].strip()
    return text


def is_musicfetch(fingerprint: str) -> bool:
    key = fingerprint_key(fingerprint).lower()
    return key == "musicfetch" or key.startswith("musicfetch-")


def _label_nodes(issue: dict) -> list:
    raw = issue.get("labels") or []
    if isinstance(raw, dict):
        raw = raw.get("nodes") or []
    return list(raw)


def event_label(issue: dict) -> str | None:
    """First `remediation:<fingerprint>` label. The bare `remediation` label is not an event."""
    for node in _label_nodes(issue):
        name = node.get("name") if isinstance(node, dict) else str(node)
        key = fingerprint_key(name)
        if str(name).lower().startswith(LABEL_PREFIX) and key:
            return str(name)
    return None


def _state_type(issue: dict) -> str:
    state = issue.get("state") or {}
    return str(state.get("type") or "").lower()


def issue_open(issue: dict) -> bool:
    return _state_type(issue) not in CLOSED_STATE_TYPES


ALERT_SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
REMEDIATION_LABEL_COLOR = "#E5484D"
HISTORY_STATE_NAMES = frozenset({"done", "canceled", "cancelled", "closed"})


def stuck_pr_escalation_enabled() -> bool:
    """In-process stuck-PR ladder. Default off, and only while the router flag is on.

    Detection belongs to remediation-sweep. It files ordinary labeled issues:
    ``remediation:pr-<n>-hold`` and ``remediation:pr-<n>-conflict`` (the
    lane-fix-exhausted case). ``LANES_ESCALATION_STUCK_PRS=1`` restores the
    in-process ladder.
    """
    return escalation_enabled() and _flag("LANES_ESCALATION_STUCK_PRS", False)


def alert_key_slug(key: str) -> str | None:
    """Alert key as ``^[a-z0-9]+(-[a-z0-9]+)*$``. Colons become hyphens."""
    slug = re.sub(r"[^a-z0-9]+", "-", str(key or "").strip().lower())
    slug = re.sub(r"-{2,}", "-", slug).strip("-")
    if not slug or ALERT_SLUG.fullmatch(slug) is None:
        return None
    return slug


def remediation_label_for_alert(key: str) -> str | None:
    slug = alert_key_slug(key)
    if slug is None:
        return None
    return f"{LABEL_PREFIX}{slug}"


def has_remediation_event_label(labels) -> bool:
    """True for ``remediation:<fingerprint>``. The bare ``remediation`` label is not an event."""
    for label in labels or []:
        name = label.get("name") if isinstance(label, dict) else str(label)
        if event_label({"labels": [{"name": name}]}):
            return True
    return False


def issue_is_history(issue: dict) -> bool:
    """Closed or Done. History for recurrence and attempt count, not an active duplicate."""
    if not isinstance(issue, dict) or not issue_open(issue):
        return True
    name = str((issue.get("state") or {}).get("name") or "").strip().lower()
    return name in HISTORY_STATE_NAMES


def _active_and_history(group: list, recorded_id: str | None) -> tuple[dict | None, list, list]:
    """Label group only. Titles are not a match key.

    The active event is the recorded open issue, else the oldest open issue.
    Closed and Done issues stay in history.
    """
    history, active = [], []
    for issue in group:
        if not isinstance(issue, dict):
            continue
        (history if issue_is_history(issue) else active).append(issue)
    active.sort(key=lambda issue: issue.get("createdAt") or "9999")
    chosen = next((issue for issue in active if recorded_id and issue.get("id") == recorded_id), None)
    if chosen is None and active:
        chosen = active[0]
    others = [issue for issue in active if chosen is None or issue.get("id") != chosen.get("id")]
    return chosen, others, history


def _state_id(issue: dict, name: str) -> str | None:
    team = issue.get("team") or {}
    states = team.get("states") or {}
    nodes = states.get("nodes") if isinstance(states, dict) else states
    for node in nodes or []:
        if isinstance(node, dict) and node.get("name") == name and node.get("id"):
            return node["id"]
    return None


def _human_category(key: str, blob: str) -> str | None:
    """Needs Tim: spend, billing actions, env/DNS/secrets, store submissions,
    outside humans, manual deploys. Ordinary billing or health text stays fixable."""
    lowered = key.lower()
    tokens = set(re.split(r"[\s:/]+", lowered.replace("-", " ")))
    text = blob.lower()
    if lowered in {"asc-agreements", "asc-agreement"} or "store submission" in text or "store-submission" in lowered:
        return "store submission"
    if "spend" in tokens or re.search(r"\bspend\b", text):
        return "spend"
    if re.search(r"billing[\s-]*actions?", text) or "billing-action" in lowered or "billing-actions" in lowered:
        return "billing action"
    if re.search(r"manual[\s-]*deploys?", text) or "manual-deploy" in lowered:
        return "manual deploy"
    if re.search(r"outside[\s-]*humans?", text) or "outside-human" in lowered:
        return "outside human"
    if tokens & {"dns", "secret", "secrets"} or lowered.startswith("env-") or "-env-" in f"-{lowered}-":
        return "env/DNS/secrets"
    if re.search(r"env\s*/\s*dns|dns\s*/\s*secrets?|\brotate\b.{0,40}\bsecrets?\b", text):
        return "env/DNS/secrets"
    return None


def exact_ask(label: str, category: str, *, exhausted: bool = False) -> str:
    """The one comment a human-only or ladder-exhausted event is allowed to post."""
    if exhausted:
        return (f"needs-human `{NEEDS_HUMAN_LABEL_ID}`: `{label}` exhausted the lane ladder. "
                "Ask: Tim needs to decide the next step. An agent must not open another attempt.")
    sentence = HUMAN_ASKS.get(category, "Tim needs to decide.")
    return (f"needs-human `{NEEDS_HUMAN_LABEL_ID}`: `{label}` is human-only ({category}). "
            f"Ask: {sentence}")


def classify_labeled_event(fingerprint: str, title: str = "", description: str = "") -> dict:
    """Fixable-by-agent, or human-only when the gap needs Tim.

    `remediation:musicfetch-*` is the in-house resolver cutover (JOV-7323). The route
    never asks an agent to renew MusicFetch, even when the issue text says to.
    """
    key = fingerprint_key(fingerprint)
    label = f"{LABEL_PREFIX}{key}"
    if is_musicfetch(key):
        return blocker(
            "fixable-by-agent", "musicfetch-cutover",
            [f"Route to the in-house resolver cutover ({MUSICFETCH_CUTOVER}). Do not renew MusicFetch."],
            MUSICFETCH_CUTOVER)
    category = _human_category(key, " ".join([key.replace("-", " "), title or "", description or ""]))
    if category:
        return blocker("human-only", category, [exact_ask(label, category)], "tim-decides")
    return blocker("fixable-by-agent", "agent", [title or key], "escalate")


def event_dossier(classified: dict, title: str, identifier: str) -> str:
    if classified.get("subtype") == "musicfetch-cutover":
        return (
            "Blocker class: fixable-by-agent (musicfetch-cutover)\n"
            f"Route to the in-house resolver cutover ({MUSICFETCH_CUTOVER}). "
            "Do not renew MusicFetch. Do not purchase, extend, or restore a MusicFetch subscription.\n"
            f"Issue: {identifier} {title}"
        )
    subtype = f" ({classified.get('subtype')})" if classified.get("subtype") else ""
    evidence = "\n".join(f"- {item}" for item in (classified.get("evidence") or ["none"]))
    return f"Blocker class: {classified.get('cls')}{subtype}\nEvidence:\n{evidence}\nIssue: {identifier} {title}"


def event_marker(kind: str, fingerprint: str) -> str:
    return f"<!-- symphony-event {kind} fp={fingerprint} -->"


def event_dispatch_lane(providers: dict, attempts: list, *, healthy=None, cooled: set[str] | None = None) -> dict | None:
    """First dispatch is a stronger model than the weakest enabled lane, then failover.

    A failed lane is recorded on `attempts` and skipped. When nothing enabled is
    stronger, one top-rung retry remains, matching `select_escalation_lane`.
    """
    attempted = {row.get("lane") for row in attempts if isinstance(row, dict) and row.get("lane")}
    top = any(isinstance(row, dict) and row.get("topRung") for row in attempts)
    seeded = set(attempted)
    if not seeded:
        weakest = route_lane(providers, healthy=healthy, cooled=cooled)
        if weakest:
            seeded.add(weakest["lane"])
    return select_escalation_lane(providers, seeded, healthy=healthy, cooled=cooled, top_rung_used=top)


def _group_labeled(issues: list) -> dict[str, list]:
    grouped: dict[str, list] = {}
    for issue in issues or []:
        if not isinstance(issue, dict):
            continue
        label = event_label(issue)
        if not label:
            continue
        grouped.setdefault(fingerprint_key(label), []).append(issue)
    for rows in grouped.values():
        rows.sort(key=lambda issue: issue.get("createdAt") or "9999")
    return grouped


def _absorb_event(row: dict, issue: dict, fingerprint: str) -> None:
    label = event_label(issue) or f"{LABEL_PREFIX}{fingerprint}"
    row["fingerprint"] = fingerprint
    row["label"] = label
    row["issueId"] = issue.get("id")
    row["identifier"] = issue.get("identifier")
    row["team"] = (issue.get("team") or {}).get("key")
    row["title"] = issue.get("title") or ""
    row["description"] = issue.get("description") or ""
    row["labels"] = [node.get("name") if isinstance(node, dict) else str(node) for node in _label_nodes(issue)]
    todo, started = _state_id(issue, "Todo"), _state_id(issue, "In Progress")
    if todo:
        row["todoStateId"] = todo
    if started:
        row["startedStateId"] = started


def _note(row: dict, issue_id: str) -> bool:
    noted = list(row.get("noted") or [])
    if not issue_id or issue_id in noted:
        return False
    noted.append(issue_id)
    row["noted"] = noted
    return True


def _surface_event(row: dict, *, exhausted: bool, comments: list, labels: list) -> None:
    label = row.get("label") or f"{LABEL_PREFIX}{row.get('fingerprint')}"
    category = row.get("subtype") or "human-only"
    row["status"] = "exhausted" if exhausted else "human"
    if exhausted:
        row["cls"] = row.get("cls") or "fixable-by-agent"
    else:
        row["cls"] = "human-only"
    row["lane"] = None
    row["running"] = False
    row["ask"] = exact_ask(label, category, exhausted=exhausted)
    if notify_tim() and not row.get("asked") and row.get("issueId"):
        kind = "exhausted" if exhausted else "ask"
        comments.append({"id": row["issueId"], "body": row["ask"] + "\n" + event_marker(kind, row.get("fingerprint") or "")})
        labels.append({"id": row["issueId"], "labelId": NEEDS_HUMAN_LABEL_ID})
        row["asked"] = True


def _assign_event(row: dict, classified: dict, providers: dict, now: float, *, healthy, cooled: set[str]) -> tuple[str, dict | None]:
    """Returns (status, chosen lane or None). Mutates `row` attempts when a new lane is taken."""
    fingerprint = row.get("fingerprint") or ""
    attempts = [item for item in (row.get("attempts") or []) if isinstance(item, dict)]
    allowed, why = caps_allow({"escalations": attempts, "priorEscalations": []}, fingerprint, now)
    lane_name = row.get("lane")
    spec = providers.get(lane_name) if isinstance(providers.get(lane_name), dict) else {}
    lane_dead = bool(lane_name) and (lane_name in cooled or not spec.get("enabled", True) or not healthy(lane_name, spec))
    if not allowed and why == "ladder-exhausted":
        return "exhausted", None
    # A live claim stays put. A dead lane fails over immediately; cooldown only
    # holds a lane that can still run.
    if lane_name and not lane_dead and not row.get("release") and row.get("status") == "claimed":
        return "claimed", None
    if not allowed and why == "cooldown" and not lane_dead:
        return "claimed", None
    chosen = event_dispatch_lane(providers, attempts, healthy=healthy, cooled=cooled)
    if chosen is None:
        return "exhausted", None
    if row.get("release") or not attempts or attempts[-1].get("lane") != chosen["lane"]:
        attempts.append({"kind": "model", "lane": chosen["lane"], "head": fingerprint, "at": now,
                         "topRung": bool(chosen.get("topRung")), "ok": None})
    row["attempts"] = attempts
    row["lane"] = chosen["lane"]
    row["release"] = False
    row["running"] = False
    return "claimed", chosen


def _event_stale(row: dict, now: float) -> bool:
    try:
        return now - float(row.get("claimedAt") or 0) >= EVENT_CLAIM_TTL_S
    except (TypeError, ValueError):
        return True


def plan_labeled_events(issues: list, recorded: dict | None, providers: dict, now: float, *,
                        healthy=None, cooled: set[str] | None = None) -> dict:
    """One open event per fingerprint. Recurrence reopens the canonical issue and comments.

    The plan is pure: callers perform `reopens`, `comments`, and `labels`. Human-only
    and ladder-exhausted comments and the `needs-human` label are included only when
    `LANES_ESCALATION_NOTIFY_TIM` is on. State is still recorded when the flag is off.
    """
    healthy = healthy or (lambda name, spec: True)
    cooled = set(cooled or ())
    events = {key: dict(row) for key, row in (recorded or {}).items() if isinstance(row, dict)}
    comments, labels, reopens = [], [], []
    for fingerprint, group in _group_labeled(issues).items():
        row = dict(events.get(fingerprint) or {})
        recorded_id = row.get("issueId")
        if escalation_enabled():
            canonical, duplicates, history = _active_and_history(group, recorded_id)
            prior_attempts = [item for item in (row.get("attempts") or []) if isinstance(item, dict)]
            row["attempts"] = prior_attempts
            row["recurrence"] = len(history)
            row["attemptCount"] = len(prior_attempts)
            if canonical is None:
                if history:
                    _absorb_event(row, history[0], fingerprint)
                row["status"] = "done"
                row["running"] = False
                events[fingerprint] = row
                continue
            _absorb_event(row, canonical, fingerprint)
            for other in duplicates:
                if _note(row, other.get("id")):
                    comments.append({
                        "id": other.get("id"),
                        "body": (f"Symphony remediation: `{LABEL_PREFIX}{fingerprint}` already has one event on "
                                 f"{canonical.get('identifier')}. This issue is not a second event.\n"
                                 + event_marker("dup", fingerprint)),
                    })
            if recorded_id and canonical.get("id") != recorded_id:
                row["release"] = True
                row["running"] = False
                row["lane"] = None
                if row.get("status") in {"done", "human", "exhausted"}:
                    row["status"] = "open"
                    row["asked"] = False
        else:
            by_id = {issue.get("id"): issue for issue in group}
            canonical = by_id.get(recorded_id) or group[0]
            _absorb_event(row, canonical, fingerprint)
            for other in group:
                if other.get("id") == canonical.get("id") or not issue_open(other):
                    continue
                if _note(row, other.get("id")):
                    comments.append({
                        "id": other.get("id"),
                        "body": (f"Symphony remediation: `{LABEL_PREFIX}{fingerprint}` already has one event on "
                                 f"{canonical.get('identifier')}. This issue is not a second event.\n"
                                 + event_marker("dup", fingerprint)),
                    })
        if not escalation_enabled() and not issue_open(canonical):
            opener = next((issue for issue in group if issue.get("id") != canonical.get("id") and issue_open(issue)), None)
            if opener is None:
                row["status"] = "done"
                row["running"] = False
                events[fingerprint] = row
                continue
            todo = row.get("todoStateId") or _state_id(canonical, "Todo")
            if todo and _note(row, f"reopen:{opener.get('id')}"):
                reopens.append({"id": canonical.get("id"), "stateId": todo})
                comments.append({
                    "id": canonical.get("id"),
                    "body": (f"Symphony remediation: `{LABEL_PREFIX}{fingerprint}` recurred. "
                             f"Reopened {canonical.get('identifier')} instead of a second event. "
                             f"New signal: {opener.get('identifier')} {opener.get('title') or ''}\n"
                             + event_marker("reopen", fingerprint)),
                })
                row["status"] = "open"
                row["release"] = True
                row["running"] = False
                row["asked"] = False
            elif row.get("status") in {"claimed", "human", "exhausted"} and not row.get("release"):
                events[fingerprint] = row
                continue
        elif row.get("status") in {"human", "exhausted", "done"} and not row.get("release"):
            if row.get("status") == "done":
                stamp = str(canonical.get("updatedAt") or "")
                if _note(row, f"recur:{stamp}"):
                    comments.append({
                        "id": canonical.get("id"),
                        "body": (f"Symphony remediation: `{LABEL_PREFIX}{fingerprint}` was reopened. "
                                 "Claiming the same event again instead of filing another.\n"
                                 + event_marker("reopen", fingerprint)),
                    })
                row["status"] = "open"
                row["release"] = True
                row["asked"] = False
            else:
                events[fingerprint] = row
                continue
        if row.get("running") and not _event_stale(row, now):
            events[fingerprint] = row
            continue
        if row.get("running") and _event_stale(row, now):
            row["running"] = False
            row["release"] = True
            row["lane"] = None
        classified = classify_labeled_event(fingerprint, canonical.get("title") or "", canonical.get("description") or "")
        row["cls"] = classified["cls"]
        row["subtype"] = classified.get("subtype")
        row["dossier"] = event_dossier(classified, canonical.get("title") or "", canonical.get("identifier") or "")
        if classified["subtype"] == "musicfetch-cutover":
            row["route"] = MUSICFETCH_CUTOVER
        if classified["cls"] == "human-only":
            _surface_event(row, exhausted=False, comments=comments, labels=labels)
            events[fingerprint] = row
            continue
        status, _chosen = _assign_event(row, classified, providers, now, healthy=healthy, cooled=cooled)
        if status == "exhausted":
            _surface_event(row, exhausted=True, comments=comments, labels=labels)
        else:
            row["status"] = "claimed"
        events[fingerprint] = row
    return {"events": events, "comments": comments, "labels": labels, "reopens": reopens}


def events_summary(snapshot: dict | None) -> dict:
    """doctor.json counters. `byFingerprint` is one row per tracked fingerprint."""
    report = empty_events()
    rows = (snapshot or {}).get("events") or {}
    for fingerprint, row in rows.items():
        if not isinstance(row, dict):
            continue
        status = str(row.get("status") or "open")
        report["byFingerprint"][str(fingerprint)] = {
            "state": status, "issue": row.get("identifier"), "cls": row.get("cls"),
            "lane": row.get("lane"), "ask": row.get("ask"),
            "recurrence": int(row.get("recurrence") or 0),
            "attemptCount": int(row.get("attemptCount") if row.get("attemptCount") is not None
                                else len(row.get("attempts") or [])),
        }
        if status == "done":
            continue
        report["eventsOpen"] += 1
        if status == "claimed":
            report["eventsClaimed"] += 1
        elif status == "human":
            report["eventsHuman"] += 1
        elif status == "exhausted":
            report["eventsExhausted"] += 1
    return report
