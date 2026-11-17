#!/usr/bin/env python3
"""Revert first, diagnose second (audit finding 3, 2026-11-11).

0 reverts in 2,725 main commits over 30 days while 49% of them were fixes. 2026-09-21: a Dependabot bump of the
Vercel CLI broke staging deploys and production stayed frozen 5 days while six stacked defects were fixed forward
one at a time. 2026-10-31 (6h 52m) and 2026-11-10 (8 h, zero merges) were each repaired by a forward fix that queued
behind the stall it was fixing. Main Health already names the first bad commit (main_health.evaluate `failingSha`)
and nothing acted on it: remediation classified main-red as `wait`.

Rule (canon/MERGE_QUEUE_STEWARD.md, "Revert first"): when Main Health or the merge-group ejector names a culprit
commit, a revert PR is opened and jumped to the head of the queue within REVERT_SLA_S. An open forward fix does not
hold the revert back; it replaces the revert only by landing first (Main Health green again, `superseded`). A
dependency bump is always reverted, never debugged in place. A red with no culprit commit (a test that expired by
the clock on an unchanged main) has nothing to revert and stays with the remediation intake.

No clock, network or git. Callers pass the runs, the commit range and the time; generated Win evidence is checked
with the canonical local Fleet validator before returning a plan. Revert PRs share the
main-red-eject contract (scripts/lib/main-red-eject.mjs) so its re-land job and caps treat them the same: branch
`compounding/revert-<pr>-<sha7>`, labels `compounding` (Merge Queue Green Enroll jumps it) and `main-red-revert`
(re-landed as a repair PR once it merges), and the `<!-- main-red-eject {...} -->` body marker.
"""
from __future__ import annotations

import json
import re

import repair_win

REVERT_SLA_S = 15 * 60
MAX_ATTEMPTS = 2  # MAX_ATTEMPTS_PER_CHANGE in scripts/lib/main-red-eject.mjs: revert, re-land, revert, then a human
COMPOUNDING_LABEL, REVERT_LABEL = "compounding", "main-red-revert"
SOURCE = "main-health"
CHECK = "Main health (census and certification)"
FAILED = frozenset({"failure", "timed_out", "startup_failure"})
EVENTS = ("push", "workflow_dispatch")
DEP_AUTHORS = frozenset({"dependabot[bot]", "renovate[bot]", "dependabot", "renovate", "app/dependabot", "app/renovate"})
# Dependabot and Renovate subjects: `build(deps): bump x from 1 to 2`, `chore(deps-dev): ...`, `Bump x from 1 to 2`.
DEP_SUBJECT = re.compile(r"^(?:(?:build|chore|fix|ci)\((?:deps|deps-dev|dependencies)[^)]*\)!?:|bump\s+\S+\s+from\s)", re.I)
PR_SUFFIX = re.compile(r"\(#(\d+)\)\s*$")
REVERT_SUBJECT = re.compile(r'^revert(?:\(|:|\s|")', re.I)  # mirrors isRevertSubject in scripts/lib/main-red-eject.mjs
MARKER = re.compile(r"<!-- main-red-eject (\{.*?\}) -->")


def _subject(commit: dict) -> str:
    return str(commit.get("subject") or "").split("\n", 1)[0].strip()


def parse_pr(subject) -> int | None:
    match = PR_SUFFIX.search(str(subject or "").split("\n", 1)[0])
    return int(match[1]) if match else None


def is_revert(subject) -> bool:
    """A revert (ours or a human's) is never reverted again."""
    return bool(REVERT_SUBJECT.match(str(subject or "").strip()))


def is_dependency_bump(commit: dict) -> bool:
    labels = {str(label).lower() for label in commit.get("labels") or ()}
    return (str(commit.get("author") or "").lower() in DEP_AUTHORS or "dependencies" in labels
            or bool(DEP_SUBJECT.match(_subject(commit))))


def read_marker(body) -> dict | None:
    match = MARKER.search(str(body or ""))
    try:
        data = json.loads(match[1]) if match else None
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def name_culprit(runs: list[dict], commits: list[dict] | None) -> dict:
    """Main Health runs (newest first) and the commits after the last green run up to the first red one (oldest
    first, `git rev-list --reverse <green>..<red>`) -> attribution. Only a push run can name a culprit: the oldest
    red run of the streak is a push of exactly one commit on top of the last green run."""
    real = [r for r in runs if r.get("event", "push") in EVENTS
            and (r.get("conclusion") == "success" or r.get("conclusion") in FAILED)]
    streak = next((i for i, r in enumerate(real) if r.get("conclusion") not in FAILED), len(real))
    out = {"status": "unknown", "culprit": None, "candidates": [], "check": CHECK}
    if not real:
        return {**out, "reason": "no-main-health-runs"}
    if streak == 0:
        return {**out, "status": "green", "reason": "main-health-green", "sha": real[0].get("head_sha")}
    first_red = real[streak - 1]
    out.update(redSince=first_red.get("created_at"), redEndedAt=first_red.get("updated_at"), run=first_red.get("html_url"),
               failingSha=first_red.get("head_sha"))
    if streak == len(real):
        return {**out, "reason": "no-green-run-in-window"}
    green = real[streak]
    out["greenSha"] = green.get("head_sha")
    if first_red.get("head_sha") == green.get("head_sha"):
        # Same tree, green then red: the clock or the environment changed, not a commit (JOV-8737 class).
        return {**out, "status": "no-culprit", "reason": "red-on-an-unchanged-commit"}
    if first_red.get("event", "push") != "push":
        return {**out, "status": "no-culprit", "reason": "first-red-run-was-not-a-push"}
    if commits is None:
        return {**out, "reason": "commit-range-unread"}
    if not commits or commits[-1].get("sha") != first_red.get("head_sha"):
        return {**out, "reason": "commit-range-does-not-end-at-the-red-commit"}
    if len(commits) > 1:
        return {**out, "status": "ambiguous", "reason": "several-commits-since-green", "candidates": commits}
    return {**out, "status": "named", "reason": "first-red-push", "culprit": commits[0]}


def decide(attribution: dict, *, open_reverts: list[dict] = (), mode: str = "apply") -> dict:
    """open-revert | dry-revert | skip | alert | none. An open forward fix is deliberately not an input."""
    def verdict(action, reason):
        return {"action": action, "reason": reason}
    if mode == "off":
        return verdict("skip", "kill-switch-off")
    status, culprit = attribution.get("status"), attribution.get("culprit")
    if status in {"green", "unknown", "no-culprit"}:
        return verdict("none", attribution.get("reason") or status)
    if status != "named" or not culprit:
        return verdict("alert", f"{attribution.get('reason') or status}-needs-bisect")
    if is_revert(_subject(culprit)) or REVERT_LABEL in (culprit.get("labels") or ()):
        return verdict("alert", "culprit-is-a-revert")
    if not (culprit.get("pr") or parse_pr(_subject(culprit))):
        return verdict("alert", "culprit-has-no-pr")
    if culprit.get("revertedBy"):
        # Its revert already merged and main is still red: the streak's first red push names the same commit
        # every wake, so reverting it again does nothing. Something after it is also red; a human bisects.
        return verdict("alert", "culprit-already-reverted-needs-bisect")
    if any(row.get("culprit") == culprit.get("sha") for row in open_reverts):
        return verdict("skip", "revert-in-flight")
    if int(culprit.get("priorAttempts") or 0) >= MAX_ATTEMPTS:
        return verdict("alert", "attempt-cap")
    reason = "dependency-bump" if is_dependency_bump(culprit) else "culprit-named"
    return verdict("dry-revert" if mode == "dry" else "open-revert", reason)


def titles(culprit: dict) -> dict:
    """Same shape as titles() in scripts/lib/main-red-eject.mjs: conventional, at most 100 characters."""
    pr = culprit.get("pr") or parse_pr(_subject(culprit))
    base = re.sub(r"^\w+(\([^)]*\))?!?:\s*", "", PR_SUFFIX.sub("", _subject(culprit)).strip())

    def fit(prefix, suffix):
        return f"{prefix}{base[:max(10, 100 - len(prefix) - len(suffix))]}{suffix}"
    return {"revert": fit("revert(main-red): ", f" (#{pr})"), "reopen": fit("fix(main-red): re-land ", f" (#{pr})")}


def revert_plan(attribution: dict, *, named_at: float, repo: str = "JovieInc/Jovie") -> dict:
    """Everything the opener needs: branch, commit message, PR title/body, labels and the SLA deadline."""
    culprit = attribution["culprit"]
    attempt = int(culprit.get("priorAttempts") or 0) + 1
    sha, pr, check = str(culprit["sha"]), culprit.get("pr") or parse_pr(_subject(culprit)), attribution["check"]
    dependency = is_dependency_bump(culprit)
    title, url = titles(culprit)["revert"], f"https://github.com/{repo}/pull/{pr}"
    why = (f"#{pr} ({sha[:9]}) is the first commit Main Health failed on (`{check}`, green on its parent); every PR "
           "behind it inherits the red.")
    rule = ("Dependency bumps are always reverted, never debugged in place." if dependency else
            "Revert first, diagnose second: a forward fix replaces this revert only if it lands first.")
    # Reuse the repair loop's Fleet policy so a generated compounding PR cannot publish invalid evidence.
    win = ("## Win\n\n- Claim: main is restored by a revert instead of waiting for a forward fix\n- Area: queue\n"
           "- Theme: main-red-repair\n- Metric: main-red minutes to revert opened | min | lower | ? | ? | Main Health runs "
           f"| first red Main Health run to this PR's created_at\n- Verify: {attribution.get('run') or url}\n- Pending: yes")
    repair_win.validate(win)
    body = "\n\n".join([
        f"<!-- main-red-eject {json.dumps({'check': check, 'culprit': sha, 'origin': pr, 'attempt': attempt, 'source': SOURCE, 'namedAt': int(named_at)}, sort_keys=True)} -->",
        f"## Summary\n\nno Linear issue: main is red (revert first). {why} {rule}",
        f"## Failure attached\n\nFailing check: `{check}`\nFirst red run: {attribution.get('run') or 'unknown'}\n"
        f"Red since: {attribution.get('redSince') or 'unknown'}",
        f"## Next\n\nThis revert jumps the queue (`{COMPOUNDING_LABEL}`). When it merges, #{pr} is re-landed as a repair "
        "PR with this failure attached. If a forward fix lands first and Main Health is green again, this PR is closed.",
        '<!-- customer-changelog/v1 {"releaseWorthy":false} -->',
        win,
    ])
    return {
        "branch": f"compounding/revert-{pr}-{sha[:7]}",
        "sha": sha, "pr": pr, "check": check, "dependencyBump": dependency,
        "title": title, "body": body, "labels": [COMPOUNDING_LABEL, REVERT_LABEL],
        "commitMessage": f"{title}\n\nReverts {sha}. Revert first: `{check}` first failed on this commit "
                         f"({attribution.get('run') or 'Main Health'}).",
        "namedAt": named_at, "deadline": named_at + REVERT_SLA_S,
        "url": url,
    }


def superseded(revert_marker: dict | None, attribution: dict) -> bool:
    """An open Main Health revert is moot once Main Health is green again: the forward fix landed first."""
    return bool(revert_marker and revert_marker.get("source") == SOURCE and attribution.get("status") == "green")


def sla(named_at: float, opened_at: float | None, now: float) -> dict:
    """Revert opened within REVERT_SLA_S of the culprit being named; an unopened revert is late once now passes it."""
    end = opened_at if opened_at is not None else now
    late = end - named_at - REVERT_SLA_S
    return {"withinSla": late <= 0, "lateS": max(0, round(late)), "opened": opened_at is not None}


def main_red_rung(culprit, evidence: list[str]) -> tuple[str, list[str], str]:
    """remediation.classify_event's main-red rung -> (subtype, evidence, next_action). A named culprit is reverted."""
    sha = str(culprit.get("sha") or "") if isinstance(culprit, dict) else ""
    if not sha:
        return "main-red", evidence, "wait"
    tag = " (dependency bump)" if is_dependency_bump(culprit) else ""
    return "culprit-named", [*evidence, f"culprit {sha[:12]}{tag}"], "revert"


def ladder_rung(subtype) -> dict:
    """remediation.plan_ladder for main-red: revert a named culprit (deterministic, no model), otherwise wait."""
    if subtype == "culprit-named":
        return {"action": "revert", "reason": "culprit-named", "kind": "deterministic", "cls": "main-red"}
    return {"action": "wait", "reason": "main-red", "cls": "main-red"}
