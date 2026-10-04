#!/usr/bin/env python3
"""Event-driven PR repair for the lanes: GitHub pushes, the lanes pull one queue.

  pr_events.py relay      # in Actions: label the PR the triggering event is about
  pr_events.py backfill   # in Actions (manual): label the backlog that predates the relay

GitHub cannot reach Gem, so `.github/workflows/lane-fix-relay.yml` records each signal as a
`lane-fix-<kind>` label on the exact PR: a failed CI run (`red`), a merge-queue removal
(`dequeued`), a conflict after main moved (`conflict`), review feedback (`review`), a green
CI run on a lane draft (`green`) and a draft left by a disabled lane (`orphan`). Labels are
durable, visible on the PR and shared by every lane host. A worker pass reads them with one
search and takes the PR ahead of everything else; the dispatch tick handles `green` and
`orphan`. The PR's own state stays the truth: a label only says where to look first.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import remediation  # noqa: E402  (classifier + non-PR intake; no lane_runner import)
REPO = os.environ.get("GITHUB_REPOSITORY", "JovieInc/Jovie")
PREFIX = "lane-fix-"
FIX_KINDS = ("red", "conflict", "dequeued", "review", "stale")
TICK_KINDS = ("green", "orphan")
RED_CONCLUSIONS = frozenset({"failure", "timed_out", "startup_failure"})
HOLD_LABELS = frozenset({"hold", "gated", "incident", "do-not-merge", "tim-hold", "tim:hold", "hold:tim"})
LANE_BRANCH = re.compile(r"^(?P<lane>[a-z0-9-]+)/(?P<issue>jov-\d+)-\d{8}")
# Agent/automation-owned prefixes that are not lane branches (a codex run, a manual agent
# session). Their drafts are still lane-owned work: the reconcile sweep owes them a
# disposition instead of counting them forever (JOV-7079).
AGENT_BRANCH = re.compile(r"^(tim|codex|agent|claude|cursor|linear|dependabot|devin|hyperagent|n)/")
# A draft's "keep draft until the parent/dependency lands" note is revalidated against live
# state every sweep: while the referenced PR is open the draft holds; once it merges or
# closes the draft is stale work, not parked state.
DEP_REF = re.compile(
    r"(?i)(?:blocked\s+by|depends?\s+on|dependency|after|until|waiting\s+on|parent|stacks?\s+on)"
    r"\D{0,24}?#(\d{3,6})|/(?:pull|pulls)/(\d{3,6})")
# The cheaper lane owns an attempt first; another lane takes it once this long has passed.
ESCALATION_GRACE_S = 10 * 60
# A `green` label whose draft never turns CLEAN (a required check stays red) expires.
GREEN_TTL_S = 2 * 3600
# A fix attempt still running holds its head this long; after it ends (or the lease runs out)
# the same head may be tried again by the next lane, so a no-push attempt never parks a PR.
FIX_LEASE_S = 3 * 3600
# The reconcile sweep recovers missed events only; the relay is the primary path.
RECONCILE_S = 30 * 60
STALE_DRAFT_S = 48 * 3600
# A non-lane agent draft this old that is also stalled (idle past STALE_DRAFT_S, or already
# conflicting/red) needs repair, unless a dependency it names is still open. Age and
# retry exhaustion never authorize closing unfinished work (JOV-INV-011).
AGENT_DRAFT_S = 7 * 24 * 3600
# A PR updated this recently is between events (CI starting, enroll pending), not an orphan.
ORPHAN_GRACE_S = 30 * 60
EXHAUSTED = "exhausted"

# Held/failed evidence -> (reason code, next action). First row that matches wins, so the
# most severe reason names the record.
HELD_REASONS = (
    ("secret-like-file-changed", "secret-file", "bug-intake"),
    ("fix-exhausted", "fix-exhausted", "bug-intake-filed"),
    ("empty-diff", "empty-diff", "close-pr"),
    ("diff-too-large", "diff-too-large", "bug-intake"),
    ("lockfile-without-manifest", "lockfile-without-manifest", "fix-loop"),
    ("code-change-without-test", "missing-test", "fix-loop"),
    ("check-failed", "gate-check-failed", "fix-loop"),
    ("gate-timeout", "gate-timeout", "regate"),
)
# Held codes that green CI supersedes (the lane's local gate, not a diff policy, said no).
CI_SUPERSEDES = frozenset({"gate-check-failed", "gate-timeout"})
# Hold next_actions a pushed head can still clear. The rest (bug-intake, close-pr, ...)
# name conditions no agent push satisfies, so the fix loop must not burn attempts on them.
FIXABLE_ACTIONS = frozenset({"fix-loop", "regate"})
RUN_FAILURES = (
    ("timeout:", "agent-timeout"),
    ("harness-error:", "harness-error"),
    ("no-pr-and-no-commits", "no-change"),
    ("pr-create-failed", "pr-create-failed"),
    ("agent-exit:", "provider-error"),
)


def run(args: list[str], timeout: int = 120):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout)


# ---------------------------------------------------------------- reason codes

def held_reason(evidence: list[str]) -> tuple[str, str]:
    """Machine-readable (reason, next_action) for a held record's evidence lines."""
    for prefix, code, action in HELD_REASONS:
        if any(str(line).startswith(prefix) for line in evidence or []):
            return code, action
    return "unclassified", "fix-loop"


def held_record(sha: str, evidence: list[str], at: float | None = None) -> dict:
    reason, action = held_reason(evidence)
    return {"sha": sha, "evidence": evidence[-60:], "reason": reason, "next_action": action,
            "at": time.time() if at is None else at}


def fixable_hold(entry: dict | None, sha: str) -> bool:
    """False when the gate's recorded hold on this exact head names a reason no push can
    clear (e.g. `diff-too-large`): the fix loop cannot help and bug intake owns the PR."""
    if not entry or entry.get("sha") != sha:
        return True
    return held_reason(entry.get("evidence") or [])[1] in FIXABLE_ACTIONS


def failure_reason(receipt: dict, exhausted: bool) -> dict:
    """(reason, next_action) for an issue run that failed; the issue's failures.json record."""
    reasons = receipt.get("reasons") or []
    code = None
    for prefix, name in RUN_FAILURES:
        if any(str(reason).startswith(prefix) for reason in reasons):
            code = name
            break
    if code is None and receipt.get("verdict") == "held":
        code = held_reason(reasons)[0]
    return {"reason": code or receipt.get("verdict") or "unknown",
            "next_action": "backlog-disposition" if exhausted else "retry-after-backoff"}


def by_reason(held: dict, open_numbers: set[int] | None = None) -> dict[str, int]:
    """Held PRs counted by reason code (legacy records are classified from their evidence).
    With `open_numbers`, records for merged or closed PRs are left out."""
    counts: dict[str, int] = {}
    for number, entry in (held or {}).items():
        if open_numbers is not None and int(number) not in open_numbers:
            continue
        code = entry.get("reason") or held_reason(entry.get("evidence") or [])[0]
        counts[code] = counts.get(code, 0) + 1
    return dict(sorted(counts.items()))


# ---------------------------------------------------------------- relay (runs in Actions)

def human(user: dict | None) -> bool:
    user = user or {}
    return user.get("type") != "Bot" and not str(user.get("login", "")).endswith("[bot]")


def relay_targets(event: str, payload: dict) -> list[tuple[int, str, str | None]]:
    """(PR number, kind, head sha or None) the triggering event asks the lanes to look at."""
    if event == "workflow_run":
        workflow_run = payload.get("workflow_run") or {}
        if workflow_run.get("event") != "pull_request":
            return []
        conclusion = workflow_run.get("conclusion")
        kind = "red" if conclusion in RED_CONCLUSIONS else "green" if conclusion == "success" else None
        return [(pr["number"], kind, workflow_run.get("head_sha")) for pr in workflow_run.get("pull_requests") or []
                if kind]
    pr = payload.get("pull_request") or {}
    head = (pr.get("head") or {}).get("sha")
    if event == "pull_request_target" and payload.get("action") == "dequeued":
        # A hand dequeue (re-enqueue, hold), a merge or a deleted branch says nothing about the
        # code; treating it as a failure sent the fix loop after healthy queued PRs and
        # escalated #18873 as exhausted (2026-09-28). A missing reason keeps the old behaviour.
        reason = str(payload.get("reason") or "").lower()
        if any(word in reason for word in ("manual", "merged", "branch_removed", "branch removed")):
            return []
        return [(pr["number"], "dequeued", head)]
    if event == "pull_request_review" and payload.get("action") == "submitted":
        review = payload.get("review") or {}
        state = str(review.get("state", "")).lower()
        wanted = state == "changes_requested" or (state == "commented" and human(review.get("user"))
                                                  and bool((review.get("body") or "").strip()))
        return [(pr["number"], "review", None)] if wanted else []
    if event == "pull_request_review_comment" and payload.get("action") == "created":
        return [(pr["number"], "review", None)] if human((payload.get("comment") or {}).get("user")) else []
    return []


def disabled_lanes(providers: dict | None = None) -> set[str]:
    if providers is None:
        providers = json.loads((HERE / "providers.json").read_text())
    return {name for name, spec in providers.items() if not spec.get("enabled", True)}


def in_scope(pr: dict, kind: str, disabled: set[str]) -> bool:
    """The lanes own lane branches (drafts included) and every other open non-draft PR in the
    repo; `green` only readies lane drafts; `orphan` is only a disabled lane's draft."""
    if pr.get("isCrossRepository") or str(pr.get("state", "OPEN")).upper() != "OPEN":
        return False
    if {label.lower() for label in label_names(pr)} & HOLD_LABELS:
        return False
    lane_branch = LANE_BRANCH.match(pr.get("headRefName") or "")
    if kind == "orphan":
        return bool(lane_branch) and lane_branch.group("lane") in disabled
    if kind == "green":
        return bool(lane_branch) and bool(pr.get("isDraft"))
    return bool(lane_branch) or not pr.get("isDraft")


def agent_owned(pr: dict) -> bool:
    """Lane branches or an agent/automation prefix (not a human feature branch)."""
    branch = pr.get("headRefName") or ""
    return bool(LANE_BRANCH.match(branch) or AGENT_BRANCH.match(branch))


def dependency_refs(body: str | None) -> set[int]:
    """PR numbers a body names as the thing it waits on ("blocked by #n", "pull/n")."""
    refs = set()
    for match in DEP_REF.finditer(body or ""):
        refs.update(int(group) for group in match.groups() if group)
    return refs


def pr_scalar(number: int, field: str, sh=run) -> str:
    """One field of one PR ("" when unreadable): the body/deps read for stale drafts only."""
    viewed = sh(["gh", "pr", "view", str(number), "--repo", REPO, "--json", field,
                 "--jq", f".{field}"])
    return (viewed.stdout or "") if viewed.returncode == 0 else ""


def stale_agent_drafts(prs: list[dict], now: float) -> list[dict]:
    """Non-lane agent drafts past the age SLO that are stalled, the set the sweep revalidates
    dependencies for (lane branches already supersede/close inside the plan)."""
    return [pr for pr in prs if abandoned_agent_draft(pr, now)]


def abandoned_agent_draft(pr: dict, now: float) -> bool:
    """A draft the lanes do not gate (not a lane branch) on an agent-owned prefix, old enough
    that age alone is the governor signal, and demonstrably stalled: idle past the stale SLO
    or already conflicting/red. A recently pushed draft still in motion is left alone."""
    branch = pr.get("headRefName") or ""
    if not pr.get("isDraft") or LANE_BRANCH.match(branch) or not AGENT_BRANCH.match(branch):
        return False
    created = iso_ts(pr.get("createdAt"))
    if created is None or now - created <= AGENT_DRAFT_S:
        return False
    updated = iso_ts(pr.get("updatedAt"))
    idle = now - updated if updated is not None else AGENT_DRAFT_S
    return idle > STALE_DRAFT_S or pr.get("mergeStateStatus") == "DIRTY" \
        or pr.get("rollup") in ("FAILURE", "ERROR")


def open_dependencies(prs: list[dict], now: float, sh=run) -> dict[int, list[int]]:
    """{draft number: dependency PR numbers still open}. A dependency that merged or closed
    no longer holds the draft; an absent/unreadable body is no dependency."""
    open_numbers = {pr["number"] for pr in prs}
    deps: dict[int, list[int]] = {}
    for pr in stale_agent_drafts(prs, now):
        refs = dependency_refs(pr_scalar(pr["number"], "body", sh)) - {pr["number"]}
        waiting = [n for n in sorted(refs)
                   if n in open_numbers or pr_scalar(n, "state", sh).upper() == "OPEN"]
        if waiting:
            deps[pr["number"]] = waiting
    return deps


def dispositions(prs: list[dict], plan: dict, attempts: dict, max_attempts: int, now: float,
                 held: dict | None = None) -> list[dict]:
    """One truthful disposition per open PR, oldest first (JOV-7079): the reconcile sweep's
    record is what the doctor and the shipping cockpit render, so an old draft with no
    advancing event shows its blocker instead of sitting silent."""
    closing = {number: why for number, why in plan["close"]}
    dep_holds = {number: waiting for number, waiting in plan["depHolds"]}
    labeled = {number: kind for number, kind in plan["label"]}
    rows = []
    for pr in prs:
        number, labels = pr["number"], label_names(pr)
        updated = iso_ts(pr.get("updatedAt"))
        created = iso_ts(pr.get("createdAt"))
        idle_s = now - updated if updated is not None else 0
        holds = ({label.lower() for label in labels} & HOLD_LABELS) or (
            {EXHAUSTED} if PREFIX + EXHAUSTED in labels else set())
        live = [kind[len(PREFIX):] for kind in labels
                if kind.startswith(PREFIX) and kind[len(PREFIX):] in FIX_KINDS + TICK_KINDS]
        row = {"pr": number, "draft": bool(pr.get("isDraft")),
               "ageH": round((now - created) / 3600, 1) if created is not None else None,
               "idleH": round(idle_s / 3600, 1), "head": pr.get("headRefName")}
        protected = preservation_reason(pr, attempts.get(str(number), {}), max_attempts,
                                        held=(held or {}).get(str(number)), now=now)
        if protected:
            row.update(state="hold:" + protected, reason=protected,
                       next="preserve work and diagnosis; re-entry requires a fenced material-change receipt")
        elif number in closing:
            row.update(state="closing", reason=closing[number], next="closed this sweep")
        elif number in dep_holds:
            row.update(state="hold:dependency", reason="waits on " + ", ".join(f"#{n}" for n in dep_holds[number]),
                       next="revalidated every sweep; goes stale when the dependency lands")
        elif holds:
            row.update(state="hold:" + sorted(holds)[0], next="explicit hold; rechecked every sweep")
        elif pr.get("isInMergeQueue"):
            row.update(state="queued", next="the merge queue lands or ejects it")
        elif live or number in labeled:
            kind = labeled.get(number) or live[0]
            row.update(state="advancing", reason=f"{PREFIX}{kind}",
                       next="a lane works the labeled event")
        elif pr.get("mergeStateStatus") == "CLEAN" and not pr.get("isDraft"):
            row.update(state="ready", next="enroll in the merge queue")
        elif pr.get("rollup") in ("PENDING", "EXPECTED") or idle_s < ORPHAN_GRACE_S:
            row.update(state="advancing", reason="settling", next="its own checks/events report")
        elif abandoned_agent_draft(pr, now):
            row.update(state="repair", reason="stalled agent draft",
                       next="repair unfinished work; closure requires an explicit duplicate label")
        elif pr.get("isDraft"):
            if idle_s >= STALE_DRAFT_S:
                row.update(state="draft", reason="past the 48h stale SLO",
                           next=("repair unfinished work; closure requires an explicit duplicate label" if agent_owned(pr)
                                 else "writer-owned branch; the sweep never closes non-agent drafts"))
            else:
                row.update(state="draft", reason="inside the 48h stale SLO",
                           next="its writer, or the sweep at the SLO")
        else:
            row.update(state="orphaned", next="orphan-prs alert")
        rows.append(row)
    rows.sort(key=lambda row: -(row["ageH"] or 0))
    return rows[:100]


def label_names(pr: dict) -> list[str]:
    return [label.get("name", "") if isinstance(label, dict) else str(label) for label in pr.get("labels") or []]


def add_label(number: int, kind: str, sh=run) -> bool:
    """The issues API creates a missing label, so the queue needs no setup."""
    return sh(["gh", "api", "-X", "POST", f"repos/{REPO}/issues/{number}/labels",
               "-f", f"labels[]={PREFIX}{kind}"]).returncode == 0


POISON_LABEL = "queue-poison"
POISON_WINDOW_S = 24 * 3600
# Only a failed merge group says something about the PR's code (not manual, merged, conflict).
FAILED_DEQUEUE = "failed_checks"


def queue_ejections(number: int, now: float, sh=run, *, head: str) -> int | None:
    """Count failed removals after the latest current-head event, never prior repairs.

    Walk the ordered timeline backwards; force pushes can restore an old commit whose
    committedDate predates the repair, so commit timestamps cannot define this boundary.
    Missing, partial or changing history does not authorize a poison mutation.
    """
    if not head:
        return None
    owner, name = REPO.split("/")
    cursor, seen, count = None, set(), 0
    for _ in range(100):
        before = f",before:{json.dumps(cursor)}" if cursor is not None else ""
        query = (f'{{repository(owner:"{owner}",name:"{name}"){{pullRequest(number:{number}){{'
                 'headRefOid state timelineItems(last:100' + before +
                 ',itemTypes:[PULL_REQUEST_COMMIT,HEAD_REF_FORCE_PUSHED_EVENT,REMOVED_FROM_MERGE_QUEUE_EVENT]){'
                 'pageInfo{hasPreviousPage startCursor} nodes{__typename '
                 '... on PullRequestCommit{commit{oid}} '
                 '... on HeadRefForcePushedEvent{afterCommit{oid}} '
                 '... on RemovedFromMergeQueueEvent{createdAt reason}}}}}}')
        listed = sh(["gh", "api", "graphql", "-f", f"query={query}"])
        if listed.returncode != 0:
            return None
        try:
            payload = json.loads(listed.stdout)
            node = payload["data"]["repository"]["pullRequest"]
            if payload.get("errors") or node["state"] != "OPEN" or node["headRefOid"] != head:
                return None
            timeline = node["timelineItems"]
            if not isinstance(timeline["nodes"], list):
                return None
            for item in reversed(timeline["nodes"]):
                kind = item.get("__typename")
                if kind == "PullRequestCommit" and (item.get("commit") or {}).get("oid") == head:
                    return count
                if kind == "HeadRefForcePushedEvent" and (item.get("afterCommit") or {}).get("oid") == head:
                    return count
                if kind == "RemovedFromMergeQueueEvent":
                    at = iso_ts(item.get("createdAt"))
                    if at is not None and 0 <= now - at <= POISON_WINDOW_S \
                            and str(item.get("reason") or "").lower() == FAILED_DEQUEUE:
                        count += 1
            page = timeline["pageInfo"]
            if not page["hasPreviousPage"]:
                return None
            cursor = page["startCursor"]
            if not cursor or cursor in seen:
                return None
            seen.add(cursor)
        except (ValueError, KeyError, TypeError, AttributeError):
            return None
    return None


def mark_poison(number: int, pr: dict, now: float, sh=run) -> bool:
    """JOV-6904: a source revision the queue ejected twice in 24 h is poison. Every re-entry (usually a sync
    with main, same defect) fails the group it joins and every group behind it. Label it so
    the enroll workflow skips it; the lanes still fix it and drop the label with their fix."""
    if POISON_LABEL in label_names(pr) or (queue_ejections(number, now, sh, head=pr.get("headRefOid")) or 0) < 2:
        return False
    viewed = sh(["gh", "pr", "view", str(number), "--repo", REPO, "--json",
                 "state,isDraft,headRefName,headRefOid,isCrossRepository,labels"])
    try:
        live = json.loads(viewed.stdout or "{}")
    except (ValueError, TypeError):
        return False
    if viewed.returncode or live.get("headRefOid") != pr.get("headRefOid") \
            or not in_scope(live, "dequeued", set()) or POISON_LABEL in label_names(live):
        return False
    if sh(["gh", "api", "-X", "POST", f"repos/{REPO}/issues/{number}/labels", "-f", f"labels[]={POISON_LABEL}"]).returncode:
        return False
    sh(["gh", "pr", "comment", str(number), "--repo", REPO, "--body",
        f"🤖 `{POISON_LABEL}`: the merge queue ejected this source revision twice in 24 h, so it stays out of the queue "
        "until a fix lands (each re-entry fails every merge group behind it). The lanes are fixing it from "
        "the merge-group failure and remove this label when their fix pushes; remove it by hand once the "
        "failing merge-group check passes locally."])
    return True


# JOV-7066: a hold on a PR that reads CLEAN outlives its cause — the lanes skip held PRs,
# so after a poison storm nobody re-evaluates them (the 2026-09-28 review found 8). Tim's
# holds (product/spend/taste) and notes naming a non-check blocker stand regardless.
TIM_LOGINS = frozenset({"itstimwhite"})
STALE_HOLD_S = 24 * 3600
NON_CHECK_BLOCKER = re.compile(
    r"(?i)dependenc|blocked\s+(?:by|on)|qualification|pricing|red[ -]?line|spend|taste")

HOLD_CONTEXT_QUERY = ('{repository(owner:"%s",name:"%s"){pullRequest(number:%d){'
                      "timelineItems(last:100,itemTypes:[LABELED_EVENT]){pageInfo{hasPreviousPage}nodes{... on LabeledEvent{"
                      "createdAt label{name} actor{login}}}}"
                      "comments(last:100){pageInfo{hasPreviousPage}nodes{createdAt author{login} body}}"
                      "commits(last:1){nodes{commit{oid committedDate}}}}}}")


def hold_context(number: int, sh=run) -> dict | None:
    """The hold's provenance for one PR: every hold/poison label application (when, by whom),
    recent comments that may explain it, and the current head's commit time. None when the
    read fails — an unreadable hold is never flagged."""
    owner, name = REPO.split("/")
    result = sh(["gh", "api", "graphql", "-f", f"query={HOLD_CONTEXT_QUERY % (owner, name, number)}"])
    if result.returncode != 0:
        return None
    try:
        node = json.loads(result.stdout)["data"]["repository"]["pullRequest"]
    except (ValueError, KeyError, TypeError):
        return None
    if not isinstance(node, dict):
        return None
    # Missing or truncated provenance cannot prove absence of founder authority.
    # Keep the hold intact instead of suggesting an automatic lift.
    for connection in ("timelineItems", "comments"):
        value = node.get(connection)
        if not isinstance(value, dict) or not isinstance(value.get("nodes"), list):
            return None
        page = value.get("pageInfo")
        if not isinstance(page, dict) or page.get("hasPreviousPage") is not False:
            return None
    events = []
    for item in (node.get("timelineItems") or {}).get("nodes") or []:
        label = str((item.get("label") or {}).get("name") or "")
        at = iso_ts(item.get("createdAt"))
        if at is not None and (label.lower() in HOLD_LABELS or label == POISON_LABEL):
            events.append({"label": label, "at": at, "actor": str((item.get("actor") or {}).get("login") or "")})
    notes = [{"at": iso_ts(n.get("createdAt")), "author": str((n.get("author") or {}).get("login") or ""),
              "body": str(n.get("body") or "")}
             for n in (node.get("comments") or {}).get("nodes") or []]
    commits = (node.get("commits") or {}).get("nodes") or [{}]
    commit = (commits[0] or {}).get("commit") or {}
    return {"events": events, "notes": notes,
            "headOid": commit.get("oid"), "headCommittedAt": iso_ts(commit.get("committedDate"))}


def stale_hold(number: int, pr: dict, now: float, sh=run) -> dict | None:
    """JOV-7066: a held PR reading CLEAN whose hold outlived its cause — applied more than
    24 h ago with no Tim-authored hold note. Tim's holds and notes naming a non-check
    blocker (a dependency, a qualification pass, a pricing red line) are human gates, not
    storm leftovers: no row, no alert. The row's `auto` marks the stricter mode's subset:
    the hold came from automation and the head moved after it."""
    ctx = hold_context(number, sh)
    if not ctx or not ctx["events"]:
        return None
    event = max(ctx["events"], key=lambda e: e["at"])
    hold_at = event["at"]
    if now - hold_at <= STALE_HOLD_S:
        return None
    # A later bot label does not supersede an earlier founder hold note.
    notes = ctx["notes"]
    if event["actor"] in TIM_LOGINS or any(n["author"] in TIM_LOGINS for n in notes):
        return None  # Tim's hold or Tim's hold note: stays, silently
    blocker = any(NON_CHECK_BLOCKER.search(n["body"]) for n in notes)
    automation = event["actor"].endswith("[bot]")
    moved = ctx["headCommittedAt"] is not None and ctx["headCommittedAt"] > hold_at
    return {"pr": number, "head": pr.get("headRefOid"), "holdAgeH": round((now - hold_at) / 3600, 1),
            "labeler": event["actor"] or "unknown", "timHold": False, "nonCheckBlocker": blocker,
            "auto": bool(automation and moved and not blocker)}


def stale_hold_alert(row: dict) -> str:
    tail = ("its notes name a non-check blocker, so a human still owns the call."
            if row["nonCheckBlocker"] else
            "re-evaluate: lift the hold so the queue takes it, or restate the blocker.")
    return (f"🤖 lanes: held {row['holdAgeH']}h while `mergeStateStatus=CLEAN` (hold applied by "
            f"`{row['labeler']}`, no Tim-authored hold note) — the hold may have outlived its "
            f"cause. Head `{row['head']}`. {tail}")


def stale_holds(prs: list[dict], now: float, sh=run) -> list[dict]:
    """CLEAN PRs carrying a hold label whose hold went stale, oldest hold first."""
    rows = []
    for pr in prs:
        labels = {label.lower() for label in label_names(pr)}
        if pr.get("mergeStateStatus") != "CLEAN" or not (labels & HOLD_LABELS):
            continue
        row = stale_hold(pr["number"], pr, now, sh)
        if row:
            rows.append(row)
    return sorted(rows, key=lambda row: -row["holdAgeH"])


def resolve_ci_pr(payload: dict, sh=run) -> dict:
    """An empty CI association can resolve only to one current same-repo source head.

    Read GitHub metadata, never code or artifacts from the triggering run. Ambiguous,
    stale, fork and malformed events cannot put a different PR into the repair queue.
    """
    workflow = payload.get("workflow_run") or {}
    if workflow.get("pull_requests") or workflow.get("event") != "pull_request" \
            or workflow.get("conclusion") not in RED_CONCLUSIONS | {"success"}:
        return payload
    sha, branch = workflow.get("head_sha"), workflow.get("head_branch")
    if (workflow.get("head_repository") or {}).get("full_name") != REPO \
            or not isinstance(branch, str) or not branch \
            or not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{40}", sha):
        return payload
    result = sh(["gh", "api", f"repos/{REPO}/pulls", "--method", "GET", "-f", "state=open",
                 "-f", f"head={REPO.split('/')[0]}:{branch}", "-f", "per_page=100"])
    if result.returncode != 0:
        raise RuntimeError("cannot resolve CI event's current PR")
    candidates = json.loads(result.stdout or "[]")
    if not isinstance(candidates, list) or len(candidates) != 1:
        return payload
    pr = candidates[0]
    if not isinstance(pr, dict):
        return payload
    head, base = pr.get("head") or {}, pr.get("base") or {}
    if pr.get("state") != "open" or head.get("sha") != sha or head.get("ref") != branch \
            or (head.get("repo") or {}).get("full_name") != REPO \
            or (base.get("repo") or {}).get("full_name") != REPO \
            or not isinstance(pr.get("number"), int) or pr["number"] <= 0:
        return payload
    return {**payload, "workflow_run": {**workflow, "pull_requests": [{"number": pr["number"]}]}}


def relay(event: str, payload: dict, sh=run, disabled: set[str] | None = None) -> list[tuple[int, str]]:
    disabled = disabled_lanes() if disabled is None else disabled
    if event == "workflow_run":
        payload = resolve_ci_pr(payload, sh)
    added = []
    for number, kind, sha in relay_targets(event, payload):
        viewed = sh(["gh", "pr", "view", str(number), "--repo", REPO, "--json",
                     "state,isDraft,headRefName,headRefOid,isCrossRepository,labels"])
        if viewed.returncode != 0:
            continue
        pr = json.loads(viewed.stdout or "{}")
        if sha and pr.get("headRefOid") != sha:
            continue  # a newer head is already running CI; its own events speak for it
        if not in_scope(pr, kind, disabled):
            continue
        if kind == "dequeued" and mark_poison(number, pr, time.time(), sh):
            added.append((number, POISON_LABEL))
        if PREFIX + kind in label_names(pr):
            continue
        if in_scope(pr, kind, disabled) and add_label(number, kind, sh):
            added.append((number, kind))
    if event == "push":
        added += label_backlog(sh, disabled, kinds=("conflict",))
    intake = remediation.non_pr_event(event, payload)
    if intake:
        created = upsert_intake(intake, sh)
        if created:
            added.append((created, remediation.INTAKE_LABEL))
    return added


def upsert_intake(event: dict, sh=run, now: float | None = None) -> int | None:
    """One GitHub issue per fingerprint. A hit inside 30 minutes is the claim window."""
    now = time.time() if now is None else now
    marker = f"fingerprint={event.get('fingerprint')}"
    listed = sh(["gh", "issue", "list", "--repo", REPO, "--state", "open", "--label", remediation.INTAKE_LABEL,
                 "--limit", "50", "--json", "number,body,updatedAt"])
    try:
        rows = json.loads(listed.stdout or "[]") if listed.returncode == 0 else []
    except (ValueError, AttributeError):
        rows = []
    if not isinstance(rows, list):
        rows = []
    for row in rows:
        if not isinstance(row, dict) or marker not in (row.get("body") or ""):
            continue
        return None  # one record per fingerprint; the tick converts after the claim window
    created = sh(["gh", "issue", "create", "--repo", REPO,
                  "--title", remediation.linear_intake_plan(event)["title"][:80],
                  "--body", remediation.intake_body(event),
                  "--label", remediation.INTAKE_LABEL])
    found = re.search(r"/issues/(\d+)", created.stdout or "")
    if not found:
        return None
    # Touch nothing else inside the claim window; updatedAt on the new issue starts it.
    if remediation.claim_open(now, now + 1):
        return int(found.group(1))
    return int(found.group(1))


def convert_intake(lane, linear_factory, sh, now: float) -> list[int] | None:
    """After the 30-minute claim window, one Linear issue per fingerprint. No new secret."""
    listed = sh(["gh", "issue", "list", "--repo", REPO, "--state", "open", "--label", remediation.INTAKE_LABEL,
                 "--limit", "30", "--json", "number,title,body,updatedAt"])
    try:
        rows = json.loads(listed.stdout or "[]") if getattr(listed, "returncode", 1) == 0 else []
    except (ValueError, AttributeError):
        return None
    if not isinstance(rows, list) or not rows:
        return None
    due = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        body = row.get("body") or ""
        if "linear-issue-id:" in body:
            continue
        updated = iso_ts(row.get("updatedAt"))
        if updated is None or remediation.claim_open(updated, now):
            continue
        due.append(row)
    if not due:
        return None
    try:
        linear = linear_factory()
    except Exception:
        return None
    if linear is None or not hasattr(linear, "gql"):
        return None
    linked = []
    for row in due:
        body = row.get("body") or ""
        found = re.search(r"fingerprint=([0-9a-f]+)", body)
        ws = "ci"
        if "ws:release-deploy" in body or "release-deploy" in body:
            ws = "release-deploy"
        elif "ws:reliability" in body or "source': 'sentry'" in body or "sentry" in body[:80]:
            ws = "reliability"
        event = {"source": "intake", "fingerprint": found.group(1) if found else str(row.get("number")),
                 "ws": ws, "subject": {"github_issue": row.get("number")}, "evidence": {"excerpt": body[:400]}}
        try:
            issue_id = ensure_linear_intake(linear, event)
        except Exception:
            continue
        if not issue_id:
            continue
        sh(["gh", "issue", "comment", str(row["number"]), "--repo", REPO, "--body",
            f"<!-- linear-issue-id:{issue_id} -->\nSymphony intake linked."])
        linked.append(row["number"])
    return linked or None


def ensure_linear_intake(linear, event: dict) -> str | None:
    """Create the remediation label only when it is missing, then one agent-ready issue."""
    team = linear.gql('query{teams(filter:{key:{eq:"JOV"}}){nodes{id states{nodes{id name}} labels{nodes{id name}}}}}',
                      {})["teams"]["nodes"][0]
    names = {label["name"]: label["id"] for label in team["labels"]["nodes"]}
    wanted = remediation.intake_labels(str(event.get("ws") or "ci"))
    ids = []
    for name in wanted:
        if name in names:
            ids.append(names[name])
            continue
        if name != remediation.REMEDIATION_LABEL:
            continue
        created = linear.gql('mutation($n:String!,$t:String!){issueLabelCreate(input:{name:$n,teamId:$t}){issueLabel{id}}}',
                             {"n": name, "t": team["id"]})
        ids.append(created["issueLabelCreate"]["issueLabel"]["id"])
    todo = next(state["id"] for state in team["states"]["nodes"] if state["name"] == "Todo")
    plan = remediation.linear_intake_plan(event)
    data = linear.gql('mutation($i:IssueCreateInput!){issueCreate(input:$i){issue{id}}}',
                      {"i": {"teamId": team["id"], "stateId": todo, "labelIds": ids,
                             "title": plan["title"], "description": plan["description"]}})
    return data["issueCreate"]["issue"]["id"]


def backlog_targets(prs: list[dict], disabled: set[str], kinds=("conflict", "green", "orphan")) -> list[tuple[int, str]]:
    """Open PRs already in a state the relay would have labeled, had it been watching."""
    targets = []
    for pr in prs:
        present = set(label_names(pr))
        wanted = []
        if "conflict" in kinds and pr.get("mergeable") == "CONFLICTING":
            wanted.append("conflict")
        if "green" in kinds and pr.get("isDraft") and pr.get("mergeStateStatus") == "CLEAN":
            wanted.append("green")
        if "orphan" in kinds:
            wanted.append("orphan")
        targets += [(pr["number"], kind) for kind in wanted
                    if PREFIX + kind not in present and in_scope(pr, kind, disabled)]
    return targets


def list_open(sh=run) -> list[dict]:
    listed = sh(["gh", "pr", "list", "--repo", REPO, "--state", "open", "--limit", "300", "--json",
                 "number,headRefName,isDraft,mergeable,mergeStateStatus,isCrossRepository,labels"], timeout=180)
    return json.loads(listed.stdout or "[]") if listed.returncode == 0 else []


def label_backlog(sh=run, disabled: set[str] | None = None, kinds=("conflict", "green", "orphan"),
                  settle_s: int = 45) -> list[tuple[int, str]]:
    """GitHub computes mergeability lazily after main moves: a first read starts it, so PRs
    still UNKNOWN are read once more after `settle_s`."""
    disabled = disabled_lanes() if disabled is None else disabled
    prs = list_open(sh)
    if "conflict" in kinds and any(pr.get("mergeable") == "UNKNOWN" for pr in prs) and settle_s:
        time.sleep(settle_s)
        prs = list_open(sh) or prs
    return [(number, kind) for number, kind in backlog_targets(prs, disabled, kinds) if add_label(number, kind, sh)]


# ---------------------------------------------------------------- lane side (runs on Gem)

def queued_prs(lane, kinds) -> list[dict]:
    """Open PRs carrying any of these queue labels: one search, never a scan."""
    search = "label:" + ",".join(PREFIX + kind for kind in kinds)

    def fetch():
        listed = lane.sh(["gh", "pr", "list", "--repo", lane.REPO_SLUG, "--state", "open", "--limit", "100",
                          "--search", search, "--json", lane.PR_FIELDS + ",labels,updatedAt"])
        return json.loads(listed.stdout or "[]") if listed.returncode == 0 else None
    # Per-check rollups over 100 PRs are the costliest GraphQL read the lanes make, and every
    # worker pass asked for them; one read per minute per host serves them all. This is part
    # of the claim scan, so it shares that TTL with lane issues, in-flight, and fix candidates.
    shared = getattr(lane, "shared", None)
    ttl = getattr(lane, "CLAIM_SCAN_TTL_S", 60)
    prs = shared("queued-" + "-".join(sorted(kinds)), ttl, fetch) if shared else fetch()
    if prs is None:
        return []
    for pr in prs:
        pr["eventKinds"] = [name[len(PREFIX):] for name in label_names(pr)
                            if name.startswith(PREFIX) and name[len(PREFIX):] in kinds]
    return prs


def consume(lane, pr: dict, kinds=None, *, timeout: float | None = None) -> None:
    for kind in kinds if kinds is not None else pr.get("eventKinds") or []:
        lane.sh(["gh", "api", "-X", "DELETE", f"repos/{lane.REPO_SLUG}/issues/{pr['number']}/labels/{PREFIX}{kind}"],
                **({"timeout": timeout} if timeout is not None else {}))


def iso_ts(stamp: str | None) -> float | None:
    try:
        return datetime.fromisoformat(str(stamp).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def cost_order(providers: dict) -> list[str]:
    """Enabled lanes, cheapest first: providers.json lists them in cost order."""
    return [name for name, spec in providers.items() if spec.get("enabled", True)]


def may_take(name: str, pr: dict, record: dict, order: list[str], now: float) -> bool:
    """Cheapest capable model first, escalating on failure: attempt n belongs to the n-th lane
    in cost order. Any other lane takes it after ESCALATION_GRACE_S, so a lane that is down or
    busy never strands a PR."""
    if not order or name not in order:
        return True
    count = record.get("count", 0)
    if order[min(count, len(order) - 1)] == name:
        return True
    since = record.get("at") if count else iso_ts(pr.get("updatedAt"))
    return since is None or now - since >= ESCALATION_GRACE_S


def needs_work(lane, pr: dict) -> bool:
    """The PR's own state still backs its labels: conflicts and red checks are re-read, while a
    merge-queue removal or review feedback stands until a new head answers it."""
    if pr.get("isInMergeQueue") is True:
        return False
    kinds = set(pr.get("eventKinds") or [])
    if kinds & {"dequeued", "review", "stale"}:
        return True
    if "conflict" in kinds and pr.get("mergeStateStatus") == "DIRTY":
        return True
    return "red" in kinds and any(check.get("conclusion") in lane.RED for check in pr.get("statusCheckRollup") or [])


def in_flight(record: dict, pr: dict, now: float) -> bool:
    """An attempt on this head that has not ended and is inside its lease. Records written
    before attempts carried `at` count as ended, so legacy parked heads get their retry."""
    if record.get("sha") != pr["headRefOid"] or record.get("endedAt") or not record.get("at"):
        return False
    return now - record["at"] < FIX_LEASE_S


def same_generation(record: dict, sha: str) -> bool:
    """Whether this head continues the recorded fix generation (JOV-7089). A head is external
    evidence only when the record proves it is neither the attempted head nor the head our own
    fix pushed; a self-push never earns re-entry. Records written before `pushedHead` existed
    fail closed to the same generation."""
    if not record.get("count"):
        return False
    if not isinstance(sha, str) or not sha.strip() or not isinstance(record.get("sha"), str) or not record["sha"].strip():
        return True  # absent head evidence cannot authorize a new generation
    if record.get("sha") is None and record.get("pushedHead") is None:
        return True  # legacy record: nothing proves the head changed
    if sha in (record.get("sha"), record.get("pushedHead")):
        return True
    return bool(record.get("pushed")) and "pushedHead" not in record


def spent(record: dict, sha: str, max_attempts: int) -> bool:
    """This head's bounded retry budget is gone: a terminal generation that may not re-enter
    the fix queue without a receipted material change (JOV-7089)."""
    return record.get("count", 0) >= max_attempts and same_generation(record, sha)


def terminal_reason(pr: dict, record: dict, max_attempts: int, *, allow_reentry: bool = False) -> str | None:
    """Observation never consumes exhaustion. Only a repair claim may receipt a proven new head."""
    sha = pr.get("headRefOid")
    if spent(record, sha, max_attempts):
        return "fix-exhausted"
    if PREFIX + EXHAUSTED in {label.lower() for label in label_names(pr)}:
        external = record.get("count", 0) > 0 and not same_generation(record, sha)
        if not (allow_reentry and external):
            return "exhausted-without-reentry"
    return None


def preservation_reason(pr: dict, record: dict, max_attempts: int, *, held: dict | None = None,
                        now: float | None = None, allow_reentry: bool = False) -> str | None:
    """One guard for the existing claim, event and maintenance paths; no new retry authority."""
    labels = {label.lower() for label in label_names(pr)}
    if not isinstance(pr.get("headRefOid"), str) or not pr["headRefOid"].strip():
        return "head-unavailable"
    if holds := labels & HOLD_LABELS:
        return sorted(holds)[0]
    if reason := terminal_reason(pr, record, max_attempts, allow_reentry=allow_reentry):
        return reason
    # A different remote head is material evidence, not revocation of a local
    # writer's live lease. Wait for that attempt to end before recording re-entry.
    if now is not None and in_flight(record, {"headRefOid": record.get("sha")}, now):
        return "repair-active"
    entry = held or {}
    if entry.get("sha") == pr.get("headRefOid") and not fixable_hold(entry, pr.get("headRefOid")):
        return entry.get("reason") or held_reason(entry.get("evidence") or [])[0]
    return None


def maintenance_hold(host, lane, pr: dict, now: float) -> str | None:
    reason = preservation_reason(pr, read_state(host, "fix-attempts.json").get(str(pr["number"]), {}),
                                 lane.MAX_FIX_ATTEMPTS, held=read_state(host, "held.json").get(str(pr["number"])), now=now)
    if reason:
        return reason
    return "repair-active" if lane.claimed_elsewhere(pr["number"], pr.get("headRefOid"), "fix") else None


def record_attempt(attempts: dict, number: int, sha: str, lane_name: str, now: float) -> None:
    """Charge one fix attempt to this PR. A head that is neither the attempted head nor the
    head our fix produced is new authoritative evidence: it starts a new bounded generation
    and the record carries a durable receipt linking it to the previous one (JOV-7089)."""
    record = attempts.get(str(number), {})
    rollover = record.get("count", 0) > 0 and not same_generation(record, sha)
    entry = {"sha": sha, "count": 1 if rollover else record.get("count", 0) + 1,
             "lane": lane_name, "at": now}
    if not rollover and record.get("pushedHead"):
        entry["pushedHead"] = record["pushedHead"]  # self-pushes stay in the same generation
    if not rollover and record.get("reentry"):
        entry["reentry"] = record["reentry"]
    if not rollover:
        for key in ("escalations", "pendingEscalation", "escalated", "priorEscalations"):
            if key in record:
                entry[key] = record[key]
    if rollover:
        prior = list(record.get("escalations") or []) + list(record.get("priorEscalations") or [])
        entry["reentry"] = {"schema": "jovie-reentry/v1", "materialChange": "new-pr-head",
                            "fromGeneration": {"head": record.get("sha"), "attempts": record.get("count", 0),
                                               "pushedHead": record.get("pushedHead")},
                            "toGeneration": {"head": sha}, "at": now}
        if prior:
            entry["reentry"]["priorEscalations"] = prior
            entry["priorEscalations"] = prior
        # A new generation does not inherit `escalated`. Spent attempt history stays on the receipt.
    attempts[str(number)] = entry


def fresh_reentry(lane, pr: dict, record: dict) -> dict | None:
    """Every selected repair needs fresh target ownership before any generation is charged."""
    live = lane.reconcile_fix_target(pr)
    if not live or live.get("state") != "OPEN" or live.get("headRefOid") != pr.get("headRefOid") \
            or live.get("headRefName") != pr.get("headRefName") or live.get("isCrossRepository") is not False \
            or live.get("isInMergeQueue") is not False \
            or {label.lower() for label in label_names(live)} & HOLD_LABELS:
        return None
    return live


def current_repair_claim(host, lane, pr: dict, expected: dict, now: float | None = None) -> dict | None:
    """Recheck local preservation after the last remote read, before the existing CAS."""
    try:
        paths = [host.state / name for name in ("fix-attempts.json", "held.json")]
        attempts, held = [json.loads(path.read_text()) if path.exists() else {} for path in paths]
        if not isinstance(attempts, dict) or not isinstance(held, dict):
            return None
        record, entry = attempts.get(str(pr["number"]), {}), held.get(str(pr["number"]), {})
        if not isinstance(record, dict) or not isinstance(entry, dict) or record != expected:
            return None
        if preservation_reason(pr, record, lane.MAX_FIX_ATTEMPTS, held=entry,
                               now=time.time() if now is None else now, allow_reentry=True):
            return None
        return entry
    except (OSError, ValueError, TypeError):
        return None


def read_state(host, name: str) -> dict:
    path = host.state / name
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return {}


def queue_failure(lane, number: int, limit: int = 4000) -> str:
    """The merge group's own failing lines: a dequeued head is often green on its own, so the
    PR's checks say nothing about why the queue rejected it."""
    runs = lane.sh(["gh", "run", "list", "--repo", lane.REPO_SLUG, "--event", "merge_group", "--status", "failure",
                    "--limit", "60", "--json", "databaseId,headBranch,workflowName"])
    try:
        found = [run for run in json.loads(runs.stdout or "[]") if f"/pr-{number}-" in (run.get("headBranch") or "")]
    except ValueError:
        found = []
    if not found:
        return ""
    log = lane.sh(["gh", "run", "view", str(found[0]["databaseId"]), "--repo", lane.REPO_SLUG, "--log-failed"], timeout=120)
    lines = [line.split("\t")[-1] for line in (log.stdout or "").splitlines()
             if re.search(r"(?i)error|fail|expected|received|missing|✗|×", line)]
    return f"### merge group: {found[0].get('workflowName')}\n" + "\n".join(lines[-40:])[:limit]


def claim_event_pr(host, lane, name: str, prs: list[dict], now: float | None = None) -> dict | None:
    """Under the claim lock: the first event-queued PR this lane may fix. Records the attempt,
    posts the cross-host claim and consumes the labels. Resolved or out-of-scope labels wait
    for bounded cleanup after productive selection declines. Spent and active heads retain
    their signals, so the PR shows why it is waiting and the relay does not re-add them."""
    now = time.time() if now is None else now
    path = host.state / "fix-attempts.json"
    attempts = json.loads(path.read_text()) if path.exists() else {}
    held_file = lane.held_path(host)
    held = json.loads(held_file.read_text()) if held_file.exists() else {}
    providers = lane.load_providers()
    order = cost_order(providers)
    disabled = set(providers) - set(order)
    for pr in sorted(prs, key=lambda item: item["number"]):
        if pr.get("isInMergeQueue") is True:
            continue  # Preserve events while native landing owns the target.
        record = attempts.get(str(pr["number"]), {})
        needs_repair = needs_work(lane, pr)
        if preservation_reason(pr, record, lane.MAX_FIX_ATTEMPTS, now=now, allow_reentry=needs_repair):
            continue
        if not in_scope(pr, "red", disabled) or not needs_repair:
            continue  # Cleanup runs only after both repair selectors and new work decline.

        if spent(record, pr["headRefOid"], lane.MAX_FIX_ATTEMPTS) or in_flight(record, pr, now):
            continue
        if set(pr.get("eventKinds") or []) == {"dequeued"} and pr.get("mergeStateStatus") != "DIRTY" \
                and POISON_LABEL not in label_names(pr) \
                and str(pr["number"]) not in read_state(host, "synced.json"):
            continue  # the tick's no-model sync with main goes first
        if not fixable_hold(held.get(str(pr["number"])), pr["headRefOid"]):
            continue  # A stronger preservation hold retains the source signal.
        if not may_take(name, pr, record, order, now) or lane.claimed_elsewhere(pr["number"], pr["headRefOid"], "fix"):
            continue
        pr = fresh_reentry(lane, pr, record)
        if pr is None or not in_scope(pr, "red", disabled) or not needs_work(lane, pr):
            continue
        if "dequeued" in (pr.get("eventKinds") or []):
            failure = queue_failure(lane, pr["number"])
            if lane.claimed_elsewhere(pr["number"], pr["headRefOid"], "fix"):
                continue
            pr = fresh_reentry(lane, pr, record)
            if pr is None or not in_scope(pr, "red", disabled) or not needs_work(lane, pr):
                continue
            pr = {**pr, "queueFailure": failure}
        entry = current_repair_claim(host, lane, pr, record, now)
        if entry is None:
            continue
        if entry.get("sha") == pr["headRefOid"]:
            pr = {**pr, "gateEvidence": entry.get("evidence", [])}
        if not charge_reentry(lane, path, pr, record, name, now):
            continue
        if PREFIX + EXHAUSTED in {label.lower() for label in label_names(pr)}:
            # The linked receipt above is durable before the old exhaustion marker is consumed.
            consume(lane, pr, [EXHAUSTED])
        lane.post_claim(pr["number"], pr["headRefOid"], "fix")
        consume(lane, pr)
        return pr
    return None


def cleanup_one_event(host, lane, prs: list[dict], now: float | None = None) -> int | None:
    """One bounded maintenance candidate after work selection; snapshots never grant writes.

    Rotate with the existing scan TTL so a refused first row cannot starve later rows.
    The caller retains claim.lock; this path never charges or grants re-entry. At most
    three 30-second commands (owner, target, one deletion) bound maintenance per idle scan.
    """
    now = time.time() if now is None else now
    try:
        path = host.state / "fix-attempts.json"
        attempts = json.loads(path.read_text()) if path.exists() else {}
        if not isinstance(attempts, dict):
            return None
        providers = lane.load_providers()
        disabled = set(providers) - set(cost_order(providers))
        candidates = sorted((pr for pr in prs if pr.get("isInMergeQueue") is not True
                             and set(pr.get("eventKinds") or []) & set(FIX_KINDS)
                             and (not in_scope(pr, "red", disabled) or not needs_work(lane, pr))),
                            key=lambda pr: pr["number"])
        if not candidates:
            return None
        pr = candidates[int(now // getattr(lane, "CLAIM_SCAN_TTL_S", 60)) % len(candidates)]
        record = attempts.get(str(pr["number"]), {})
        if not isinstance(record, dict) or preservation_reason(pr, record, lane.MAX_FIX_ATTEMPTS, now=now):
            return None
        if lane.claimed_elsewhere(pr["number"], pr["headRefOid"], "fix", timeout=30):
            return None
        live = fresh_reentry(lane, pr, record)
        if live is None or (in_scope(live, "red", disabled) and needs_work(lane, live)):
            return None
        entry = current_repair_claim(host, lane, live, record, now)
        if entry is None or preservation_reason(live, record, lane.MAX_FIX_ATTEMPTS, held=entry, now=now):
            return None
        kinds = [kind for kind in pr.get("eventKinds") or []
                 if kind in FIX_KINDS and PREFIX + kind in label_names(live)]
        if kinds:
            consume(lane, live, kinds[:1], timeout=30)
            return pr["number"]
    except (OSError, subprocess.SubprocessError, ValueError, KeyError, TypeError, AttributeError):
        return None
    return None


def charge_reentry(lane, path: Path, pr: dict, expected: dict, name: str, now: float) -> bool:
    """Atomically persist the claim and linked receipt before consuming any remote label."""
    charged = False
    def charge(current):
        nonlocal charged
        if current.get(str(pr["number"]), {}) != expected:
            return  # another claim/state update owns the new evidence
        record_attempt(current, pr["number"], pr["headRefOid"], name, now)
        charged = True
    lane.update_json(path, charge)
    return charged


def ready_green(host, lane, pr: dict, held: dict, now: float) -> str:
    """The lane is the PR's writer (JOV-INV-022): a CLEAN lane draft whose head no diff policy
    held is marked ready together with its native merge intent. Returns what happened."""
    entry = held.get(str(pr["number"]), {})
    if entry.get("sha") == pr["headRefOid"]:
        code = entry.get("reason") or held_reason(entry.get("evidence") or [])[0]
        if code not in CI_SUPERSEDES:
            return f"held:{code}"
    if not pr.get("isDraft"):
        return "already-ready"
    if pr.get("mergeStateStatus") != "CLEAN":
        updated = iso_ts(pr.get("updatedAt"))
        expired = pr.get("mergeStateStatus") == "DIRTY" or (updated is not None and now - updated > GREEN_TTL_S)
        return "not-clean" if expired else "wait"
    revoked = lane.publication_revocation(host, pr.get("headRefName"))
    if revoked:
        return f"revoked:{revoked.get('reason', '?')}"
    outcome = lane.publish_verified(host, pr)
    if outcome not in {"landing", "verified-not-queued"}:
        return outcome
    receipt = {"schema": "jovie-lane-run/v1", "kind": "ready-green", "origin": "autonomous-lane",
               "attribution": {"category": "finalizer-only", "provider": "lane-event"},
               "pr": pr["number"], "headSha": pr["headRefOid"],
               "prUrl": pr.get("url"), "verdict": outcome,
               "endedAt": lane.now_iso()}
    ledger(host, receipt)
    return receipt["verdict"]


def linear_issue(linear, identifier: str) -> dict | None:
    team, _, number = identifier.upper().partition("-")
    data = linear.gql('query($n:Float!,$t:String!){issues(filter:{team:{key:{eq:$t}},number:{eq:$n}})'
                      '{nodes{id state{name type} comments(last:20){nodes{body}}}}}', {"n": float(number), "t": team})
    nodes = data["issues"]["nodes"]
    return nodes[0] if nodes else None


RETIREMENT_QUERY = """query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){
pullRequest(number:$number){number state headRefOid headRefName isCrossRepository isInMergeQueue
labels(first:100){pageInfo{hasNextPage} nodes{name}}}}}"""


def duplicate_authorized(pr: dict) -> bool:
    labels = {name.lower() for name in label_names(pr)}
    return ("duplicate" in labels and not labels & (HOLD_LABELS | {POISON_LABEL})
            and pr.get("state", "OPEN") == "OPEN" and not pr.get("isCrossRepository")
            and not pr.get("isInMergeQueue"))


def close_duplicate(lane, pr: dict, why: str, *, host, now: float | None = None) -> bool:
    """Revalidate explicit duplicate authority and the source lease before retirement.
    A failed or incomplete read preserves the PR; neither age nor ranking grants authority.
    """
    if not duplicate_authorized(pr) or not pr.get("headRefOid"):
        return False
    owner, name = lane.REPO_SLUG.split("/")
    try:
        read = lane.sh(["gh", "api", "graphql", "-f", f"query={RETIREMENT_QUERY}",
                        "-F", f"owner={owner}", "-F", f"name={name}", "-F", f"number={pr['number']}"])
        data = json.loads(read.stdout) if read.returncode == 0 else {}
        live = data["data"]["repository"]["pullRequest"]
        labels = live["labels"]
        if (data.get("errors") or labels["pageInfo"]["hasNextPage"] is not False
                or live["number"] != pr["number"] or live["state"] != "OPEN"
                or live["headRefOid"] != pr["headRefOid"]
                or live["headRefName"] != pr["headRefName"]
                or live["isCrossRepository"] is not False or live["isInMergeQueue"] is not False
                or not duplicate_authorized({**live, "labels": labels["nodes"]})):
            return False
    except (ValueError, KeyError, TypeError, AttributeError, OSError, subprocess.SubprocessError):
        return False
    # Retirement intent cannot supersede a terminal generation or a repair owner.
    # Read their current persisted state after the network read, at the close boundary.
    live = {**live, "labels": labels["nodes"]}
    if maintenance_hold(host, lane, live, time.time() if now is None else now):
        return False
    return lane.sh(["gh", "pr", "close", str(pr["number"]), "--repo", lane.REPO_SLUG, "--comment",
                    f"🤖 lanes: closing this explicitly labeled duplicate ({why}); source branch preserved."]).returncode == 0


def return_to_pool(lane, linear, pr: dict, why: str, *, host, now: float | None = None) -> bool:
    """Return explicitly retired duplicate work to the pool only after a successful close."""
    if maintenance_hold(host, lane, pr, time.time() if now is None else now):
        return False
    if not close_duplicate(lane, pr, why, host=host, now=now):
        return False
    found = LANE_BRANCH.match(pr.get("headRefName") or "")
    try:
        issue = linear_issue(linear, found.group("issue")) if found else None
        if issue and issue["state"]["type"] not in ("completed", "canceled"):
            linear.move(issue["id"], "Todo")
            linear.comment(issue["id"], f"🤖 lanes: PR #{pr['number']} from a disabled lane was closed ({why}); "
                                        "back in Todo for a live lane.")
    except Exception:
        pass
    return True


def retire_orphan(lane, linear, pr: dict, open_prs: list[dict], *, host, now: float | None = None) -> str:
    """Adopt disabled-lane work; retire only explicitly authorized, unheld duplicates."""
    if reason := maintenance_hold(host, lane, pr, time.time() if now is None else now):
        return f"held:{reason}"
    found = LANE_BRANCH.match(pr.get("headRefName") or "")
    if not found:
        return "not-a-lane-pr"
    group = {other["number"]: other for other in open_prs
             if (match := LANE_BRANCH.match(other.get("headRefName") or "")) and match.group("issue") == found.group("issue")}
    group[pr["number"]] = pr
    best = lane.best_per_issue(list(group.values()))
    if best and best[0]["number"] != pr["number"] and close_duplicate(
            lane, pr, f"superseded by #{best[0]['number']} for the same issue", host=host, now=now):
        return f"superseded-by:{best[0]['number']}"
    try:
        issue = linear_issue(linear, found.group("issue"))
    except Exception:
        return "linear-unreadable"
    if issue and issue["state"]["type"] in ("completed", "canceled") and close_duplicate(
            lane, pr, f"{found.group('issue').upper()} is already {issue['state']['name']}", host=host, now=now):
        return "issue-done"
    lane.sh(["gh", "pr", "comment", str(pr["number"]), "--repo", lane.REPO_SLUG, "--body",
             "🤖 lanes: this lane is off; the live lanes adopt this PR (gate, fix loop, ready on green). "
             "Exhausted attempts preserve the branch and file a bounded repair disposition; "
             "only an explicit duplicate label authorizes retirement."])
    return "adopted"


# JOV-7708: parked work rots. A PR the lanes gave up on (`lane-fix-exhausted`) or the queue
# keeps ejecting (`queue-poison`) for longer than PARKED_S, on an agent-owned branch with no
# hold, sends its issue back to the pool to rebuild from main. The PR stays open (JOV-INV-011:
# only an explicit `duplicate` label retires it); `lane-rebuild` marks it requeued, once, and
# lets `lane_runner.in_flight_issues` admit the issue again.
PARKED_S = 48 * 3600
PARKED_LABELS = frozenset({PREFIX + EXHAUSTED, POISON_LABEL})
REBUILD_LABEL = "lane-rebuild"
ISSUE_REF = re.compile(r"(?i)\bjov-\d+\b")
POOL_LABEL = "agent-ready"  # lane_runner.SHARED_LABEL; this module does not import the runner


def parked_requeue_enabled() -> bool:
    return os.environ.get("LANES_PARKED_REQUEUE", "1").strip().lower() not in ("0", "false", "no", "off")


def parked_candidates(prs: list[dict], now: float) -> list[dict]:
    """Pure first cut: agent-owned same-repo PRs, not queued, unheld, carrying a parked label,
    not yet requeued, open longer than PARKED_S. parked_since then measures the label's age."""
    rows = []
    for pr in prs:
        labels = {label.lower() for label in label_names(pr)}
        created = iso_ts(pr.get("createdAt"))
        if (agent_owned(pr) and labels & PARKED_LABELS and not labels & HOLD_LABELS
                and REBUILD_LABEL not in labels
                and not pr.get("isCrossRepository") and not pr.get("isInMergeQueue")
                and created is not None and now - created > PARKED_S):
            rows.append(pr)
    return rows


def parked_since(number: int, labels: set[str], sh=run) -> float | None:
    """When the PR became parked: per parked label it still carries, its latest `labeled`
    event; the earliest of those. None when unreadable or no event is found."""
    read = sh(["gh", "api", "--paginate", f"repos/{REPO}/issues/{number}/events", "--jq",
               '.[] | select(.event == "labeled") | [.label.name, .created_at] | @tsv'])
    if read.returncode != 0:
        return None
    latest: dict[str, float] = {}
    for line in (read.stdout or "").splitlines():
        name, _, at = line.partition("\t")
        stamp = iso_ts(at.strip())
        if name in labels & PARKED_LABELS and stamp is not None:
            latest[name] = max(latest.get(name, 0.0), stamp)
    return min(latest.values()) if latest else None


def pr_issue(pr: dict) -> str | None:
    """The Linear issue a PR implements: its lane branch, else a JOV id in head or title."""
    found = LANE_BRANCH.match(pr.get("headRefName") or "")
    if found:
        return found.group("issue").upper()
    ref = ISSUE_REF.search(pr.get("headRefName") or "") or ISSUE_REF.search(pr.get("title") or "")
    return ref.group(0).upper() if ref else None


def requeue_parked(lane, linear, pr: dict, since: float, open_prs: list[dict], *, host, now: float) -> bool:
    """Return a parked PR's issue to the pool with a rebuild-from-main note. Never closes the PR.
    A failed read, a hold, a queue entry, a live repair claim, a done issue or another open PR
    for the same issue leaves everything as it is."""
    number, head = pr["number"], pr.get("headRefOid")
    identifier = pr_issue(pr)
    if not identifier or not linear or any(
            other["number"] != number and pr_issue(other) == identifier for other in open_prs):
        return False
    owner, name = lane.REPO_SLUG.split("/")
    try:
        read = lane.sh(["gh", "api", "graphql", "-f", f"query={RETIREMENT_QUERY}",
                        "-F", f"owner={owner}", "-F", f"name={name}", "-F", f"number={number}"])
        data = json.loads(read.stdout) if read.returncode == 0 else {}
        live = data["data"]["repository"]["pullRequest"]
        labels = {node["name"].lower() for node in live["labels"]["nodes"]}
        if (data.get("errors") or live["labels"]["pageInfo"]["hasNextPage"] is not False
                or live["state"] != "OPEN" or not head or live["headRefOid"] != head
                or live["isCrossRepository"] is not False or live["isInMergeQueue"] is not False
                or labels & HOLD_LABELS or REBUILD_LABEL in labels or not labels & PARKED_LABELS):
            return False
    except (ValueError, KeyError, TypeError, AttributeError, OSError, subprocess.SubprocessError):
        return False
    record = read_state(host, "fix-attempts.json").get(str(number), {})
    if in_flight(record, {"headRefOid": record.get("sha")}, now) or lane.claimed_elsewhere(number, head, "fix"):
        return False
    hours = int((now - since) // 3600)
    parked = ", ".join(f"`{label}`" for label in sorted(labels & PARKED_LABELS))
    try:
        issue = linear_issue(linear, identifier)
        if not issue or issue["state"]["type"] in ("completed", "canceled"):
            return False
        linear.move(issue["id"], "Todo")
        found = linear.gql('query($n:String!){issueLabels(filter:{name:{eq:$n}}){nodes{id}}}',
                           {"n": POOL_LABEL})["issueLabels"]["nodes"]
        if found:
            linear.gql('mutation($id:String!,$l:String!){issueAddLabel(id:$id,labelId:$l){success}}',
                       {"id": issue["id"], "l": found[0]["id"]})
        linear.comment(issue["id"], f"🤖 lanes: PR #{number} has been parked ({parked}) for {hours}h (JOV-7708). "
                                    "Rebuild from current main. Use its branch "
                                    f"`{pr.get('headRefName')}` as reference only: check what already landed, "
                                    "and do not rebase it or copy whole files from it. The old PR stays open "
                                    "until the rebuild lands and it is labeled `duplicate`.")
    except Exception:
        return False
    if lane.sh(["gh", "api", "-X", "POST", f"repos/{lane.REPO_SLUG}/issues/{number}/labels",
                "-f", f"labels[]={REBUILD_LABEL}"]).returncode != 0:
        return False
    lane.sh(["gh", "pr", "comment", str(number), "--repo", lane.REPO_SLUG, "--body",
             f"🤖 lanes: parked ({parked}) for {hours}h. {identifier} is back in the pool to rebuild from "
             "main (JOV-7708); this PR stays open. When the rebuild lands, label this PR `duplicate` "
             "and the sweep retires it (JOV-INV-011)."])
    ledger(host, {"schema": "jovie-lane-run/v1", "kind": "parked-requeue", "origin": "autonomous-lane",
                  "pr": number, "head": head, "parkedHours": hours, "issue": identifier,
                  "endedAt": lane.now_iso()})
    return True


def sync_main(host, lane, pr: dict, now: float) -> str:
    """No-model first answer to a merge-queue removal: GitHub merges main into the branch
    (exact head, no force), so the PR gets a new head, fresh CI and a fresh enroll. The queue
    never takes a rejected head twice (JOV-INV-022), so this is the one sanctioned re-enqueue.
    Once per PR per stuck episode; a second removal goes to a model with the queue's log."""
    if reason := maintenance_hold(host, lane, pr, now):
        return f"held:{reason}"
    revoked = lane.publication_revocation(host, pr.get("headRefName"))
    if revoked:
        return f"revoked:{revoked.get('reason', '?')}"
    result = lane.sh(["gh", "api", "-X", "PUT", f"repos/{lane.REPO_SLUG}/pulls/{pr['number']}/update-branch",
                      "-f", f"expected_head_sha={pr['headRefOid']}"])
    ok = result.returncode == 0
    lane.update_json(host.state / "synced.json",
                     lambda synced: synced.update({str(pr["number"]): {"from": pr["headRefOid"], "at": now, "ok": ok}}))
    ledger(host, {"schema": "jovie-lane-run/v1", "kind": "sync-main", "origin": "autonomous-lane",
                  "attribution": {"category": "finalizer-only", "provider": "lane-event"},
                  "pr": pr["number"], "headBefore": pr["headRefOid"],
                  "verdict": "synced" if ok else "sync-failed", "endedAt": lane.now_iso()})
    return "synced" if ok else "sync-failed"


def ledger(host, receipt: dict) -> None:
    (host.state / "runs").mkdir(parents=True, exist_ok=True)
    with open(host.state / "runs" / "ledger.jsonl", "a") as handle:
        handle.write(json.dumps(receipt) + "\n")


OPEN_PRS_QUERY = """query($owner:String!,$name:String!,$cursor:String){repository(owner:$owner,name:$name){
pullRequests(states:OPEN,first:50,after:$cursor){pageInfo{hasNextPage endCursor} nodes{number title body url isDraft
baseRefName headRefName headRefOid mergeStateStatus reviewDecision isInMergeQueue isCrossRepository createdAt updatedAt
labels(first:30){nodes{name}} files(first:100){totalCount nodes{path additions deletions changeType}}
commits(last:1){nodes{commit{statusCheckRollup{state}}}}}}}}"""


def open_prs_state(lane, report: dict | None = None) -> list[dict] | None:
    """Every open PR's merge state, queue membership, labels and rollup state (not per-check
    contexts), a few GraphQL pages. None when GitHub is unreadable. `report["complete"]` is
    false when the page cap is hit, so a hold prune must not treat missing numbers as closed."""
    owner, name = lane.REPO_SLUG.split("/")
    prs, cursor = [], None
    if report is not None:
        report["complete"] = False
    for _ in range(10):
        args = ["gh", "api", "graphql", "-f", f"query={OPEN_PRS_QUERY}", "-F", f"owner={owner}", "-F", f"name={name}"]
        if cursor:
            args += ["-F", f"cursor={cursor}"]
        result = lane.sh(args, timeout=120)
        try:
            page = json.loads(result.stdout)["data"]["repository"]["pullRequests"] if result.returncode == 0 else None
        except (ValueError, KeyError, TypeError):
            page = None
        if page is None:
            return None
        for node in page["nodes"]:
            commits = node.pop("commits", {}).get("nodes") or [{}]
            node["rollup"] = ((commits[0].get("commit") or {}).get("statusCheckRollup") or {}).get("state")
            node["labels"] = node.get("labels", {}).get("nodes", [])
            files = node.pop("files", {}) or {}
            node["files"] = files.get("nodes") or []
            total = files.get("totalCount")
            node["filesComplete"] = isinstance(total, int) and total == len(node["files"])
            if isinstance(total, int) and not node["filesComplete"]:
                listed = lane.sh(["gh", "api", "--paginate", "--slurp",
                                  f"repos/{lane.REPO_SLUG}/pulls/{node['number']}/files?per_page=100"], timeout=120)
                try:
                    pages = json.loads(listed.stdout) if listed.returncode == 0 else None
                    node["files"] = [{"path": row["filename"], "additions": row.get("additions", 0),
                                      "deletions": row.get("deletions", 0), "changeType": row.get("status", "")}
                                     for page_rows in pages for row in page_rows]
                    node["filesComplete"] = total == len(node["files"])
                except (ValueError, KeyError, TypeError):
                    node["filesComplete"] = False
            prs.append(node)
        if not page["pageInfo"]["hasNextPage"]:
            if report is not None:
                report["complete"] = True
            return prs
        cursor = page["pageInfo"]["endCursor"]
    return prs


def reconcile_plan(prs: list[dict], attempts: dict, disabled: set[str], max_attempts: int, now: float,
                   deps: dict | None = None, held: dict | None = None) -> dict:
    """Pure: what the sweep changes, and which open PRs nobody owns. The invariant: every open
    non-draft PR is in the merge queue, carries a fix label the lanes will still act on, or is
    held with a reason (a hold label, or `lane-fix-exhausted` after bug intake). JOV-7079:
    every open PR also gets one truthful disposition in `dispositions`, and a stale
    agent-owned draft has a repair or live dependency disposition. Retirement requires
    explicit duplicate authority; age, provider state and retry exhaustion never grant it
    here. Parked work past PARKED_S is requeued, never closed (`requeue_parked`, JOV-7708)."""
    plan = {"label": [], "unlabel": [], "reset": [], "stale": [], "close": [], "orphans": [],
            "depHolds": [], "dispositions": [], "counts": {}}
    lane_groups: dict[str, list[dict]] = {}
    for pr in prs:
        found = LANE_BRANCH.match(pr.get("headRefName") or "")
        if found:
            lane_groups.setdefault(found.group("issue"), []).append(pr)
    counts = {"open": len(prs), "drafts": 0, "inQueue": 0, "dirty": 0, "red": 0, "cleanNotQueued": 0,
              "exhausted": 0, "staleLaneDrafts": 0, "staleOtherDrafts": 0}
    for pr in prs:
        number, labels = pr["number"], set(label_names(pr))
        # Spent is generation-scoped: a head nobody here pushed is new evidence, not a dead end.
        generation_spent = spent(attempts.get(str(number), {}), pr.get("headRefOid"), max_attempts)
        dirty, red = pr.get("mergeStateStatus") == "DIRTY", pr.get("rollup") in ("FAILURE", "ERROR")
        updated = iso_ts(pr.get("updatedAt"))
        age = now - updated if updated is not None else 0
        counts["drafts"] += bool(pr.get("isDraft"))
        counts["inQueue"] += bool(pr.get("isInMergeQueue"))
        counts["dirty"] += dirty
        counts["red"] += red and not dirty
        counts["cleanNotQueued"] += pr.get("mergeStateStatus") == "CLEAN" and not pr.get("isInMergeQueue") \
            and not pr.get("isDraft")
        counts["exhausted"] += PREFIX + EXHAUSTED in labels
        counts.setdefault("staleAgentDrafts", 0)
        if preservation_reason(pr, attempts.get(str(number), {}), max_attempts,
                               held=(held or {}).get(str(number)), now=now):
            continue
        if pr.get("mergeStateStatus") == "CLEAN" or pr.get("isInMergeQueue"):
            plan["reset"].append(number)  # only synchronization housekeeping; attempts remain immutable here
        wanted = []
        if POISON_LABEL in labels:
            wanted.append("dequeued")  # repeated ejections need the merge-group log and a model fix
        if dirty:
            wanted.append("conflict")
        elif red:
            wanted.append("red")
        if pr.get("isDraft") and pr.get("mergeStateStatus") == "CLEAN":
            wanted.append("green")
        found = LANE_BRANCH.match(pr.get("headRefName") or "")
        stalled_agent_draft = abandoned_agent_draft(pr, now)
        if pr.get("isDraft") and (age > STALE_DRAFT_S or stalled_agent_draft):
            if found:
                counts["staleLaneDrafts"] += 1
                group = lane_groups.get(found.group("issue"), [pr])
                best = max(group, key=lambda item: (not item.get("isDraft"), item.get("mergeStateStatus") != "DIRTY",
                                                    item["number"]))
                if best["number"] != number and duplicate_authorized(pr):
                    plan["close"].append((number, f"superseded by #{best['number']} for the same issue"))
                    continue
                wanted.append("stale")
            elif agent_owned(pr):
                waiting_on = (deps or {}).get(number) if stalled_agent_draft else None
                if waiting_on:
                    counts["staleAgentDrafts"] += 1
                    plan["depHolds"].append((number, waiting_on))
                elif stalled_agent_draft and duplicate_authorized(pr):
                    opened = iso_ts(pr.get("createdAt"))
                    days = int((now - opened) // 86400) if opened is not None else int(age // 86400)
                    plan["close"].append((number, f"abandoned agent draft: open {days}d with no "
                                                  "advancing event and no open dependency"))
                    continue
                else:
                    counts["staleAgentDrafts"] += 1
            else:
                counts["staleOtherDrafts"] += 1
        scope_kind = {"green": "green"}
        for kind in wanted:
            if PREFIX + kind not in labels and in_scope(pr, scope_kind.get(kind, "red"), disabled):
                plan["label"].append((number, kind))
                labels.add(PREFIX + kind)
        if pr.get("isDraft") or pr.get("isCrossRepository") or pr.get("isInMergeQueue"):
            continue
        explicitly_held = {label.lower() for label in labels} & HOLD_LABELS or PREFIX + EXHAUSTED in labels
        queued = any(PREFIX + kind in labels for kind in FIX_KINDS) and not generation_spent
        settling = age < ORPHAN_GRACE_S or pr.get("rollup") in ("PENDING", "EXPECTED")
        if not (explicitly_held or queued or settling):
            plan["orphans"].append(number)
    plan["counts"] = counts
    plan["dispositions"] = dispositions(prs, plan, attempts, max_attempts, now, held)
    return plan


def reconcile(host, lane, linear_factory, now: float, force: bool = False) -> dict | None:
    """Every RECONCILE_S: recover missed events, retire stale lane drafts, reset finished
    episodes, and record orphan PRs for the doctor's `orphan-prs` alert."""
    previous = read_state(host, "reconcile.json")
    if not force and now - float(previous.get("atEpoch") or 0) < RECONCILE_S:
        return None
    report: dict = {}
    prs = open_prs_state(lane, report)
    if prs is None:
        return None
    prune_held = getattr(lane, "prune_held", None)
    if prune_held is not None:
        prune_held(host, prs, now, complete=bool(report.get("complete")))
    providers = lane.load_providers()
    disabled = set(providers) - set(cost_order(providers))
    deps = open_dependencies(prs, now, lane.sh)
    attempts = read_state(host, "fix-attempts.json")
    held = read_state(host, "held.json")
    plan = reconcile_plan(prs, attempts, disabled, lane.MAX_FIX_ATTEMPTS, now, deps, held)
    for number, kind in plan["label"]:
        add_label(number, kind, lane.sh)
    for number, kind in plan["unlabel"]:
        consume(lane, {"number": number}, [kind])
    if plan["reset"]:
        reset = {str(number) for number in plan["reset"]}
        def drop(data: dict) -> None:
            for key in reset & set(data):
                del data[key]
        lane.update_json(host.state / "synced.json", drop)
    by_number = {pr["number"]: pr for pr in prs}
    # JOV-7066: held PRs whose hold outlived its cause get one alert per stale episode; the
    # opt-in stricter mode lifts automation holds whose head already moved past the hold.
    announced = {row.get("pr") for row in previous.get("staleHolds") or []}
    nags = previous.get("holdNags") or {}
    next_nags = dict(nags)
    stale_candidates = []
    for pr in prs:
        record = attempts.get(str(pr["number"]), {})
        if terminal_reason(pr, record, lane.MAX_FIX_ATTEMPTS) \
                or in_flight(record, {"headRefOid": record.get("sha")}, now):
            continue
        if pr.get("mergeStateStatus") == "CLEAN" and {label.lower() for label in label_names(pr)} & HOLD_LABELS \
                and lane.claimed_elsewhere(pr["number"], pr.get("headRefOid"), "fix"):
            continue
        stale_candidates.append(pr)
    stale = stale_holds(stale_candidates, now, lane.sh)
    auto_unhold = os.environ.get("LANES_STALE_HOLD_UNHOLD", "").lower() in ("1", "true", "yes")
    for row in stale:
        if row["pr"] in announced:
            continue
        if not remediation.hold_nag_due(nags, row["pr"], row["head"], now):
            continue
        next_nags[str(row["pr"])] = {"head": row["head"], "at": now}
        if auto_unhold and row["auto"]:
            for name in (label for label in label_names(by_number[row["pr"]])
                         if label.lower() in HOLD_LABELS or label == POISON_LABEL):
                lane.sh(["gh", "api", "-X", "DELETE",
                         f"repos/{lane.REPO_SLUG}/issues/{row['pr']}/labels/{name}"])
            lane.sh(["gh", "pr", "comment", str(row["pr"]), "--repo", lane.REPO_SLUG, "--body",
                     f"🤖 lanes: the automation hold went stale — CLEAN for >24h and the head moved "
                     f"past it (head `{row['head']}`), so `hold`/`{POISON_LABEL}` are removed and the "
                     "queue can take this PR. Re-hold with a note if it should still wait."])
        else:
            lane.sh(["gh", "pr", "comment", str(row["pr"]), "--repo", lane.REPO_SLUG, "--body",
                     stale_hold_alert(row)])
    linear, closed = None, []
    for number, why in plan["close"]:
        if reason := maintenance_hold(host, lane, by_number[number], now):
            for row in plan["dispositions"]:
                if row["pr"] == number:
                    row.update(state=f"hold:{reason}", reason=reason, next="preserve existing work")
            continue
        if linear is None:
            try:
                linear = linear_factory()
            except Exception:
                linear = False
        if linear:
            retired = return_to_pool(lane, linear, by_number[number], why, host=host, now=now)
        else:
            retired = close_duplicate(lane, by_number[number], why, host=host, now=now)
        if retired:
            closed.append(number)
        else:
            for row in plan["dispositions"]:
                if row["pr"] == number:
                    row.update(state="hold:retirement-unavailable", reason="retirement refused or failed",
                               next="preserve source; revalidate retirement authority")
    parked = []
    for pr in parked_candidates(prs, now) if parked_requeue_enabled() else []:
        since = parked_since(pr["number"], {label.lower() for label in label_names(pr)}, lane.sh)
        if since is None or now - since <= PARKED_S:
            continue
        if linear is None:
            try:
                linear = linear_factory()
            except Exception:
                linear = False
        if requeue_parked(lane, linear, pr, since, prs, host=host, now=now):
            parked.append(pr["number"])
            for row in plan["dispositions"]:
                if row["pr"] == pr["number"]:
                    row.update(reason=f"parked {int((now - since) // 3600)}h; issue requeued",
                               next="the issue rebuilds from main; label this PR `duplicate` once it lands")
    record = {"at": lane.now_iso(), "atEpoch": now, "counts": plan["counts"], "labeled": plan["label"],
              "closed": closed, "parkedRequeued": parked, "orphans": plan["orphans"],
              "depHolds": plan["depHolds"], "dispositions": plan["dispositions"], "staleHolds": stale,
              "holdNags": next_nags}
    lane.update_json(host.state / "reconcile.json", lambda data: (data.clear(), data.update(record)))
    return record


def tick(host, lane, linear_factory, now: float | None = None) -> dict:
    """Dispatch-tick work: the periodic reconcile, then `green`, `orphan` and first-time
    `dequeued` labels; returns {pr: outcome}."""
    now = time.time() if now is None else now
    swept = reconcile(host, lane, linear_factory, now)
    prs = queued_prs(lane, TICK_KINDS + ("dequeued",))
    outcomes = {"reconciled": swept["counts"]} if swept else {}
    overlap = getattr(lane, "file_overlap", None)
    inventory = getattr(lane, "overlap_prs_summary", None)
    if overlap is not None and callable(inventory):
        overlap_prs = inventory()
        outcomes["fileOverlap"] = (overlap.reconcile_open_prs(host, lane, overlap_prs)
                                   if overlap_prs is not None else {"status": "inventory-unavailable"})
    intake = convert_intake(lane, linear_factory, lane.sh, now)
    if intake:
        outcomes["intake"] = intake
    if not prs:
        return outcomes
    held_file = lane.held_path(host)
    held = json.loads(held_file.read_text()) if held_file.exists() else {}
    synced = read_state(host, "synced.json")
    open_prs, linear = None, None
    for pr in prs:
        if reason := maintenance_hold(host, lane, pr, now):
            outcomes[pr["number"]] = f"held:{reason}"
            # A finished final self-push stays spent for repair, but its completed
            # independent gate may authorize promotion through the shared consumer.
            if "green" in pr["eventKinds"]:
                outcome = ready_green(host, lane, pr, held, now)
                if outcome in {"landing", "verified-not-queued"}:
                    outcomes[pr["number"]] = outcome
                    consume(lane, pr, ["green"])
            continue
        if "dequeued" in pr["eventKinds"] and str(pr["number"]) not in synced and pr.get("mergeStateStatus") != "DIRTY" \
                and POISON_LABEL not in label_names(pr) \
                and in_scope(pr, "red", set()):
            outcomes[pr["number"]] = sync_main(host, lane, pr, now)
            if outcomes[pr["number"]] == "synced":
                consume(lane, pr, ["dequeued"])
        if "green" in pr["eventKinds"]:
            outcome = ready_green(host, lane, pr, held, now)
            outcomes[pr["number"]] = outcome
            if outcome != "wait" and not outcome.startswith("held:"):
                consume(lane, pr, ["green"])
        if "orphan" in pr["eventKinds"]:
            if open_prs is None:
                open_prs = list_open(lane.sh)
                linear = linear_factory()
            outcome = retire_orphan(lane, linear, pr, open_prs, host=host, now=now)
            outcomes[pr["number"]] = outcome
            if outcome != "linear-unreadable" and not outcome.startswith("held:"):
                consume(lane, pr, ["orphan"])
    return outcomes


def bug_report(pr: dict, body: str, host_name: str, attempts: dict) -> str:
    """The escalation filed through bug intake: a jovie.bug-report/v1 envelope
    (docs/design-system/BUG_INTAKE_LOOP.md) so Summer's intake scores and routes it."""
    envelope = {"schema": "jovie.bug-report/v1", "source": "agent", "reporterRef": f"lanes@{host_name}",
                "product": "jov", "surface": f"pull-request/{pr['number']}", "message": body[:2000],
                "evidenceRefs": [ref for ref in (pr.get("url"),) if ref], "commitSha": pr.get("headRefOid"),
                "triage": {"reason": "fix-exhausted", "attempts": attempts.get("count"), "lastLane": attempts.get("lane")}}
    return f"{pr.get('url')}\n\n{body}\n\n```json\n{json.dumps(envelope, indent=1)}\n```"


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    command = argv[0] if argv else ""
    if command == "relay":
        event = os.environ.get("GITHUB_EVENT_NAME", "")
        payload = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
        added = relay(event, payload)
    elif command == "backfill":
        added = label_backlog()
    else:
        print(__doc__, file=sys.stderr)
        return 2
    for number, kind in added:
        print(f"#{number} {PREFIX}{kind}")
    print(f"labeled={len(added)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
