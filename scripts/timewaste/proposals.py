"""Automation proposals: rank by saved hours x confidence / build cost, thresholds, and shrink checks.

Score = (tim_minutes_saved/60 * TIM_HOUR_WEIGHT + agent_hours_saved) * confidence / build_cost_hours.
TIM_HOUR_WEIGHT=10: one founder hour is worth ten agent hours (Tim's time is the scarcest input).
Saved = measured weekly base * expected reduction. Expected reduction and confidence are priors, then
`evaluate` replaces them with what actually shrank.
"""
from __future__ import annotations

TIM_HOUR_WEIGHT = 10.0
REOPEN_IF_SHRUNK_LESS_THAN = 0.2  # a shipped proposal must cut its category by >= 20% within the review window
MIN_BASE = 5.0                     # ignore categories under 5 Tim-minutes (or 0.25 agent-hours) a week


def _cat(snap: dict, *ids: str) -> tuple[float, int]:
    cats = {c["id"]: c for c in snap["tim"]["categories"]}
    return sum(cats.get(i, {}).get("minutes", 0.0) for i in ids), sum(cats.get(i, {}).get("events", 0) for i in ids)


def _get(snap, *path, default=0.0):
    cur = snap["agent"]
    for key in path:
        if not isinstance(cur, dict) or cur.get(key) is None:
            return default
        cur = cur[key]
    return cur


# id, scope, label, automation, reduction, confidence, cost_h, owner, needs_decision, base(snap)->(value, evidence)
def _tim(ids, noun):
    return lambda s: (_cat(s, *ids)[0], f"{_cat(s, *ids)[1]} {noun} events, {_cat(s, *ids)[0]:.0f} Tim-min/week")


CATALOG = [
    dict(id="tim-status-ask", scope="tim", categories=("status_ask", "chase_stalled"),
         title="Answer 'fill me in' from the live board",
         automation="Detect a status ask in Ovie/iMessage and answer instantly with the one-screen status (Summer), pin the status card on Ovie, and have the stall detector chase stalled work before Tim has to.",
         reduction=0.8, confidence=0.7, cost_h=6, owner="Summer", needs_decision=False, base=_tim(("status_ask", "chase_stalled"), "status/chase")),
    dict(id="tim-rule-restated", scope="tim", categories=("re_explanation",),
         title="Capture a restated rule once, enforce it everywhere",
         automation="When a rule Tim already gave is restated ('Summer should run this', 'execution on Gem'), write it to canon and gbrain, inject it at session start, and add a lint or routing guard so no agent needs it restated.",
         reduction=0.7, confidence=0.5, cost_h=8, owner="Summer + canon", needs_decision=False, base=_tim(("re_explanation",), "restated-rule")),
    dict(id="tim-slop-gates", scope="tim", categories=("slop_flag",),
         title="Machine gates for the slop Tim keeps flagging",
         automation="Add CI checks for the repeated classes (alignment, text on text, misspelled 'jovie', oversized type) so slop fails before Tim sees it; each flagged class becomes a fixture.",
         reduction=0.6, confidence=0.6, cost_h=12, owner="Design CI (Jovie)", needs_decision=False, base=_tim(("slop_flag",), "slop-flag")),
    dict(id="tim-corrections", scope="tim", categories=("correction",),
         title="Every correction files a guard",
         automation="Classify each correction by class; the second correction of a class opens a guard issue (lint, invariant, prompt rule) automatically.",
         reduction=0.4, confidence=0.5, cost_h=10, owner="Summer", needs_decision=False, base=_tim(("correction",), "correction")),
    dict(id="tim-verify-asks", scope="tim", categories=("verify_ask",),
         title="Verify before reporting: number provenance",
         automation="Every number an agent reports carries source and freshness; 'is this a bug' asks are answered by running the invariant check first.",
         reduction=0.6, confidence=0.5, cost_h=8, owner="Summer", needs_decision=False, base=_tim(("verify_ask",), "verify-ask")),
    dict(id="tim-approvals", scope="tim", categories=("approval",),
         title="Standing approvals for settings and routine go-aheads",
         automation="Extend default-on-deadline from cards to settings classes Tim has approved repeatedly; Summer applies the approved default and logs it.",
         reduction=0.8, confidence=0.7, cost_h=5, owner="Summer", needs_decision=True, base=_tim(("approval",), "approval")),
    dict(id="tim-copy-numbers", scope="tim", categories=("copy_number_update",),
         title="Copy and number edits as data Summer applies",
         automation="Route copy and number updates through content records so Summer applies and previews them without Tim.",
         reduction=0.7, confidence=0.6, cost_h=6, owner="Summer + content records", needs_decision=False, base=_tim(("copy_number_update",), "copy/number")),
    dict(id="tim-github-path", scope="tim", categories=("github_review", "github_merge", "github_label", "linear_triage"),
         title="Take Tim off the review/merge/label path",
         automation="Machine-green non-taste PRs auto-merge; lanes own labels and Linear triage; Tim only sees taste-touching changes after ship.",
         reduction=0.8, confidence=0.7, cost_h=6, owner="Symphony / merge queue", needs_decision=False, base=_tim(("github_review", "github_merge", "github_label", "linear_triage"), "github/linear")),
    dict(id="agent-ci-rework", scope="agent", title="Cut CI rework rounds",
         automation="Run `pnpm preflight:remote` before every lane push and classify the failing check class on round 2 so repair targets it.",
         reduction=0.6, confidence=0.6, cost_h=10, owner="Symphony lanes", needs_decision=False,
         base=lambda s: (_get(s, "ci", "agentHours"), f"{_get(s, 'ci', 'reworkRounds'):.0f} extra rounds, p95 {_get(s, 'ci', 'roundsP95', default='n/a')}, {_get(s, 'ci', 'prsOver3Rounds'):.0f} PRs over 3 rounds")),
    dict(id="agent-queue-ejections", scope="agent", title="Stop merge-queue ejections",
         automation="Check merge-group parity before enqueue and route each ejection by failure class to a targeted fix.",
         reduction=0.5, confidence=0.5, cost_h=16, owner="Merge queue", needs_decision=False,
         base=lambda s: (_get(s, "queue", "agentHours"), f"{_get(s, 'queue', 'mergeGroupFailed'):.0f} of {_get(s, 'queue', 'mergeGroupRuns'):.0f} merge-group runs failed")),
    dict(id="agent-duplicate-work", scope="agent", title="Reject duplicate builds up front",
         automation="Admission rejects an issue or branch that already has an open or recently closed PR; worker prompts require search-before-build.",
         reduction=0.7, confidence=0.7, cost_h=6, owner="Symphony lanes", needs_decision=False,
         base=lambda s: (_get(s, "duplicates", "agentHours"), f"{_get(s, 'duplicates', 'builtTwice'):.0f} issues built twice, {_get(s, 'duplicates', 'closedUnmerged'):.0f} PRs closed unmerged")),
    dict(id="agent-noop-wakes", scope="agent", title="Wake the coordinator only on state change",
         automation="Replace polling notifications with change digests; a notification with no state delta never wakes the coordinator.",
         reduction=0.9, confidence=0.8, cost_h=5, owner="Summer", needs_decision=False,
         base=lambda s: (_get(s, "wakes", "agentHours"), f"{_get(s, 'wakes', 'noOpWakes'):.0f} no-op wakes of {_get(s, 'wakes', 'notifications'):.0f} notifications")),
    dict(id="agent-stalled-workers", scope="agent", title="Reap stalled workers with failover",
         automation="Stall reaper hands the worktree to the next lane with evidence when a worker exits without landing.",
         reduction=0.5, confidence=0.5, cost_h=10, owner="Symphony lanes", needs_decision=False,
         base=lambda s: (_get(s, "lanes", "stalledAgentHours"), f"{_get(s, 'lanes', 'stalledOrFailed'):.0f} runs ended without landing")),
    dict(id="agent-host-pressure", scope="agent", title="Gate new seats on host pressure",
         automation="Admission reads host PSI and holds new seats instead of letting overload kill running work.",
         reduction=0.5, confidence=0.5, cost_h=8, owner="Symphony lanes", needs_decision=False,
         base=lambda s: (_get(s, "lanes", "hostAlarms") * 0.5, f"{_get(s, 'lanes', 'hostAlarms'):.0f} host overload alarms")),
]


def rank(snap: dict, top: int | None = None) -> list[dict]:
    out = []
    for item in CATALOG:
        base, evidence = item["base"](snap)
        floor = MIN_BASE if item["scope"] == "tim" else 0.25
        if base < floor:
            continue
        saved_tim_h = base / 60 * item["reduction"] if item["scope"] == "tim" else 0.0
        saved_agent_h = base * item["reduction"] if item["scope"] == "agent" else 0.0
        equiv = saved_tim_h * TIM_HOUR_WEIGHT + saved_agent_h
        out.append({"id": item["id"], "scope": item["scope"], "title": item["title"], "automation": item["automation"],
                    "evidence": evidence, "base": round(base, 1),
                    "estimate": (f"{saved_tim_h * 60:.0f} Tim-min/week" if item["scope"] == "tim" else f"{saved_agent_h:.1f} agent-h/week"),
                    "confidence": item["confidence"], "buildCostHours": item["cost_h"], "owner": item["owner"],
                    "needsReservedDecision": item["needs_decision"],
                    "score": round(equiv * item["confidence"] / item["cost_h"], 3)})
    out.sort(key=lambda p: -p["score"])
    return out[:top] if top else out


# (id, label, metric(snap)->value, threshold)
TRIGGERS = [
    ("tim-category-leak", lambda s: max((c["minutes"] for c in s["tim"]["categories"] if c["class"] == "automatable"), default=0), 30.0, "an automatable Tim category passed 30 min/week"),
    ("tim-human-only-low", lambda s: (100 - (s["tim"]["humanOnlyPct"] or 100)) , 60.0, "less than 40% of Tim time is human-only high-value"),
    ("agent-ci-rework", lambda s: _get(s, "ci", "reworkRounds"), 15.0, "CI rework rounds passed 15 in the sample"),
    ("agent-queue-failures", lambda s: _get(s, "queue", "failedShare") * 100, 20.0, "over 20% of merge-group runs failed"),
    ("agent-duplicates", lambda s: _get(s, "duplicates", "builtTwice"), 3.0, "3 or more issues were built twice"),
    ("agent-noop-wakes", lambda s: _get(s, "wakes", "noOpWakes"), 100.0, "100 or more no-op coordinator wakes"),
    ("agent-stalled", lambda s: _get(s, "lanes", "stalledAgentHours"), 5.0, "5 or more agent-hours ended without landing"),
    ("agent-host-overload", lambda s: _get(s, "lanes", "hostAlarms"), 5.0, "5 or more host overload alarms"),
]


def crossed(snap: dict) -> list[dict]:
    return [{"id": i, "value": round(v, 1), "threshold": t, "why": why}
            for i, fn, t, why in TRIGGERS if (v := fn(snap)) >= t]


def evaluate(state: dict, snap: dict, now: float, review_days: int = 7) -> list[dict]:
    """state: {proposal_id: {issue, shippedAt, baseline}}. A shipped proposal whose metric did not shrink by
    REOPEN_IF_SHRUNK_LESS_THAN within the review window is reopened (verdict carries the evidence)."""
    by_id = {item["id"]: item for item in CATALOG}
    verdicts = []
    for pid, entry in state.items():
        item, shipped = by_id.get(pid), entry.get("shippedAt")
        if not item or not shipped or now - shipped < review_days * 86400 or not entry.get("baseline"):
            continue
        current = item["base"](snap)[0]
        shrink = 1 - current / entry["baseline"]
        verdicts.append({"id": pid, "issue": entry.get("issue"), "baseline": entry["baseline"], "current": round(current, 1),
                         "shrink": round(shrink, 2), "verdict": "reopen" if shrink < REOPEN_IF_SHRUNK_LESS_THAN else "worked"})
    return verdicts
