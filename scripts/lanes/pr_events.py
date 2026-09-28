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
REPO = os.environ.get("GITHUB_REPOSITORY", "JovieInc/Jovie")
PREFIX = "lane-fix-"
FIX_KINDS = ("red", "conflict", "dequeued", "review", "stale")
TICK_KINDS = ("green", "orphan")
RED_CONCLUSIONS = frozenset({"failure", "timed_out", "startup_failure"})
HOLD_LABELS = frozenset({"hold", "gated", "incident", "do-not-merge", "tim-hold", "tim:hold", "hold:tim"})
LANE_BRANCH = re.compile(r"^(?P<lane>[a-z0-9-]+)/(?P<issue>jov-\d+)-\d{8}")
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


def queue_ejections(number: int, now: float, sh=run) -> int | None:
    """Failure removals from the merge queue in the last 24 h (the current one included)."""
    owner, name = REPO.split("/")
    listed = sh(["gh", "api", "graphql", "-f", f"query={{repository(owner:\"{owner}\",name:\"{name}\"){{"
                 f"pullRequest(number:{number}){{timelineItems(last:20,itemTypes:[REMOVED_FROM_MERGE_QUEUE_EVENT]){{"
                 "nodes{... on RemovedFromMergeQueueEvent{createdAt reason}}}}}}",
                 "--jq", ".data.repository.pullRequest.timelineItems.nodes"])
    if listed.returncode != 0:
        return None
    count = 0
    for item in json.loads(listed.stdout or "[]"):
        at = iso_ts(item.get("createdAt"))
        if at and now - at <= POISON_WINDOW_S and str(item.get("reason") or "").lower() == FAILED_DEQUEUE:
            count += 1
    return count


def mark_poison(number: int, pr: dict, now: float, sh=run) -> bool:
    """JOV-6904: a PR the queue ejected twice in 24 h is poison. Every re-entry (usually a sync
    with main, same defect) fails the group it joins and every group behind it. Label it so
    the enroll workflow skips it; the lanes still fix it and drop the label with their fix."""
    if POISON_LABEL in label_names(pr) or (queue_ejections(number, now, sh) or 0) < 2:
        return False
    if sh(["gh", "api", "-X", "POST", f"repos/{REPO}/issues/{number}/labels", "-f", f"labels[]={POISON_LABEL}"]).returncode:
        return False
    sh(["gh", "pr", "comment", str(number), "--repo", REPO, "--body",
        f"🤖 `{POISON_LABEL}`: the merge queue ejected this PR twice in 24 h, so it stays out of the queue "
        "until a fix lands (each re-entry fails every merge group behind it). The lanes are fixing it from "
        "the merge-group failure and remove this label when their fix pushes; remove it by hand once the "
        "failing merge-group check passes locally."])
    return True


def relay(event: str, payload: dict, sh=run, disabled: set[str] | None = None) -> list[tuple[int, str]]:
    disabled = disabled_lanes() if disabled is None else disabled
    added = []
    for number, kind, sha in relay_targets(event, payload):
        viewed = sh(["gh", "pr", "view", str(number), "--repo", REPO, "--json",
                     "state,isDraft,headRefName,headRefOid,isCrossRepository,labels"])
        if viewed.returncode != 0:
            continue
        pr = json.loads(viewed.stdout or "{}")
        if sha and pr.get("headRefOid") != sha:
            continue  # a newer head is already running CI; its own events speak for it
        if kind == "dequeued" and mark_poison(number, pr, time.time(), sh):
            added.append((number, POISON_LABEL))
        if PREFIX + kind in label_names(pr):
            continue
        if in_scope(pr, kind, disabled) and add_label(number, kind, sh):
            added.append((number, kind))
    if event == "push":
        added += label_backlog(sh, disabled, kinds=("conflict",))
    return added


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
    # worker pass asked for them; one read per minute per host serves them all.
    shared = getattr(lane, "shared", None)
    prs = shared("queued-" + "-".join(sorted(kinds)), 60, fetch) if shared else fetch()
    if prs is None:
        return []
    for pr in prs:
        pr["eventKinds"] = [name[len(PREFIX):] for name in label_names(pr)
                            if name.startswith(PREFIX) and name[len(PREFIX):] in kinds]
    return prs


def consume(lane, pr: dict, kinds=None) -> None:
    for kind in kinds if kinds is not None else pr.get("eventKinds") or []:
        lane.sh(["gh", "api", "-X", "DELETE", f"repos/{lane.REPO_SLUG}/issues/{pr['number']}/labels/{PREFIX}{kind}"])


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
    if record.get("sha") is None and record.get("pushedHead") is None:
        return True  # legacy record: nothing proves the head changed
    if sha in (record.get("sha"), record.get("pushedHead")):
        return True
    return bool(record.get("pushed")) and "pushedHead" not in record


def spent(record: dict, sha: str, max_attempts: int) -> bool:
    """This head's bounded retry budget is gone: a terminal generation that may not re-enter
    the fix queue without a receipted material change (JOV-7089)."""
    return record.get("count", 0) >= max_attempts and same_generation(record, sha)


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
    if rollover:
        entry["reentry"] = {"schema": "jovie-reentry/v1", "materialChange": "new-pr-head",
                            "fromGeneration": {"head": record.get("sha"), "attempts": record.get("count", 0),
                                               "pushedHead": record.get("pushedHead")},
                            "toGeneration": {"head": sha}, "at": now}
    attempts[str(number)] = entry


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
    posts the cross-host claim and consumes the labels. A label whose PR no longer needs work
    (or is out of scope) is consumed; one on a spent head or a head a fix is still running on
    stays, so the PR shows why it is waiting and the relay does not re-add it."""
    now = time.time() if now is None else now
    path = host.state / "fix-attempts.json"
    attempts = json.loads(path.read_text()) if path.exists() else {}
    held_file = lane.held_path(host)
    held = json.loads(held_file.read_text()) if held_file.exists() else {}
    providers = lane.load_providers()
    order = cost_order(providers)
    disabled = set(providers) - set(order)
    for pr in sorted(prs, key=lambda item: item["number"]):
        record = attempts.get(str(pr["number"]), {})
        if not in_scope(pr, "red", disabled) or not needs_work(lane, pr):
            consume(lane, pr)
            continue
        if spent(record, pr["headRefOid"], lane.MAX_FIX_ATTEMPTS) or in_flight(record, pr, now):
            continue
        if set(pr.get("eventKinds") or []) == {"dequeued"} and pr.get("mergeStateStatus") != "DIRTY" \
                and POISON_LABEL not in label_names(pr) \
                and str(pr["number"]) not in read_state(host, "synced.json"):
            continue  # the tick's no-model sync with main goes first
        if not fixable_hold(held.get(str(pr["number"])), pr["headRefOid"]):
            consume(lane, pr)  # intake owns this head; the label must not keep queueing fixes
            continue
        if not may_take(name, pr, record, order, now) or lane.claimed_elsewhere(pr["number"], pr["headRefOid"], "fix"):
            continue
        entry = held.get(str(pr["number"]), {})
        if entry.get("sha") == pr["headRefOid"]:
            pr = {**pr, "gateEvidence": entry.get("evidence", [])}
        if "dequeued" in (pr.get("eventKinds") or []):
            pr = {**pr, "queueFailure": queue_failure(lane, pr["number"])}
        record_attempt(attempts, pr["number"], pr["headRefOid"], name, now)
        path.write_text(json.dumps(attempts))
        lane.post_claim(pr["number"], pr["headRefOid"], "fix")
        consume(lane, pr)
        return pr
    return None


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
    lane.sh(["gh", "pr", "ready", str(pr["number"]), "--repo", lane.REPO_SLUG])
    queued = lane.sh(["gh", "pr", "merge", str(pr["number"]), "--repo", lane.REPO_SLUG, "--auto"])
    if queued.returncode != 0:
        lane.update_json(host.state / "requeue.json",
                         lambda requeue: requeue.update({str(pr["number"]): pr["headRefOid"]}))
    receipt = {"schema": "jovie-lane-run/v1", "kind": "ready-green", "origin": "autonomous-lane",
               "attribution": {"category": "finalizer-only", "provider": "lane-event"},
               "pr": pr["number"], "headSha": pr["headRefOid"],
               "prUrl": pr.get("url"), "verdict": "landing" if queued.returncode == 0 else "verified-not-queued",
               "endedAt": lane.now_iso()}
    ledger(host, receipt)
    return receipt["verdict"]


def linear_issue(linear, identifier: str) -> dict | None:
    team, _, number = identifier.upper().partition("-")
    data = linear.gql('query($n:Float!,$t:String!){issues(filter:{team:{key:{eq:$t}},number:{eq:$n}})'
                      '{nodes{id state{name type} comments(last:20){nodes{body}}}}}', {"n": float(number), "t": team})
    nodes = data["issues"]["nodes"]
    return nodes[0] if nodes else None


def return_to_pool(lane, linear, pr: dict, why: str) -> None:
    """Close a disabled lane's PR and put its issue back in Todo for a live lane."""
    lane.sh(["gh", "pr", "close", str(pr["number"]), "--repo", lane.REPO_SLUG, "--comment",
             f"🤖 lanes: closing this {why}; the issue goes back to the pool for a live lane."])
    found = LANE_BRANCH.match(pr.get("headRefName") or "")
    try:
        issue = linear_issue(linear, found.group("issue")) if found else None
        if issue and issue["state"]["type"] not in ("completed", "canceled"):
            linear.move(issue["id"], "Todo")
            linear.comment(issue["id"], f"🤖 lanes: PR #{pr['number']} from a disabled lane was closed ({why}); "
                                        "back in Todo for a live lane.")
    except Exception:
        pass


def retire_orphan(lane, linear, pr: dict, open_prs: list[dict]) -> str:
    """A disabled lane's PR: close it when another PR for the issue supersedes it or the issue
    is already done; otherwise the live lanes adopt it (lane_prs includes disabled lanes)."""
    found = LANE_BRANCH.match(pr.get("headRefName") or "")
    if not found:
        return "not-a-lane-pr"
    group = {other["number"]: other for other in open_prs
             if (match := LANE_BRANCH.match(other.get("headRefName") or "")) and match.group("issue") == found.group("issue")}
    group[pr["number"]] = pr
    best = lane.best_per_issue(list(group.values()))
    if best and best[0]["number"] != pr["number"]:
        lane.sh(["gh", "pr", "close", str(pr["number"]), "--repo", lane.REPO_SLUG, "--comment",
                 f"🤖 lanes: superseded by #{best[0]['number']} for the same issue; closing this orphaned draft."])
        return f"superseded-by:{best[0]['number']}"
    try:
        issue = linear_issue(linear, found.group("issue"))
    except Exception:
        return "linear-unreadable"
    if issue and issue["state"]["type"] in ("completed", "canceled"):
        lane.sh(["gh", "pr", "close", str(pr["number"]), "--repo", lane.REPO_SLUG, "--comment",
                 f"🤖 lanes: {found.group('issue').upper()} is already {issue['state']['name']}; closing this orphaned draft."])
        return "issue-done"
    lane.sh(["gh", "pr", "comment", str(pr["number"]), "--repo", lane.REPO_SLUG, "--body",
             "🤖 lanes: this lane is off; the live lanes adopt this PR (gate, fix loop, ready on green). "
             "If it exhausts its fix attempts it is closed and the issue returns to the pool."])
    return "adopted"


def sync_main(host, lane, pr: dict, now: float) -> str:
    """No-model first answer to a merge-queue removal: GitHub merges main into the branch
    (exact head, no force), so the PR gets a new head, fresh CI and a fresh enroll. The queue
    never takes a rejected head twice (JOV-INV-022), so this is the one sanctioned re-enqueue.
    Once per PR per stuck episode; a second removal goes to a model with the queue's log."""
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
pullRequests(states:OPEN,first:50,after:$cursor){pageInfo{hasNextPage endCursor} nodes{number title url isDraft
headRefName headRefOid mergeStateStatus reviewDecision isInMergeQueue isCrossRepository updatedAt labels(first:30){nodes{name}}
commits(last:1){nodes{commit{statusCheckRollup{state}}}}}}}}"""


def open_prs_state(lane) -> list[dict] | None:
    """Every open PR's merge state, queue membership, labels and rollup state (not per-check
    contexts), a few GraphQL pages. None when GitHub is unreadable."""
    owner, name = lane.REPO_SLUG.split("/")
    prs, cursor = [], None
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
            prs.append(node)
        if not page["pageInfo"]["hasNextPage"]:
            return prs
        cursor = page["pageInfo"]["endCursor"]
    return prs


def reconcile_plan(prs: list[dict], attempts: dict, disabled: set[str], max_attempts: int, now: float) -> dict:
    """Pure: what the sweep changes, and which open PRs nobody owns. The invariant: every open
    non-draft PR is in the merge queue, carries a fix label the lanes will still act on, or is
    held with a reason (a hold label, or `lane-fix-exhausted` after bug intake)."""
    plan = {"label": [], "unlabel": [], "reset": [], "stale": [], "close": [], "orphans": [], "counts": {}}
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
        if pr.get("mergeStateStatus") == "CLEAN" or pr.get("isInMergeQueue"):
            plan["reset"].append(number)  # the stuck episode is over: attempts and sync start fresh
            if PREFIX + EXHAUSTED in labels:
                plan["unlabel"].append((number, EXHAUSTED))
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
        if pr.get("isDraft") and age > STALE_DRAFT_S:
            if not found:
                counts["staleOtherDrafts"] += 1
            else:
                counts["staleLaneDrafts"] += 1
                group = lane_groups.get(found.group("issue"), [pr])
                best = max(group, key=lambda item: (not item.get("isDraft"), item.get("mergeStateStatus") != "DIRTY",
                                                    item["number"]))
                if best["number"] != number:
                    plan["close"].append((number, f"superseded by #{best['number']} for the same issue"))
                    continue
                if generation_spent:
                    plan["close"].append((number, "stale for 48h after its fix attempts ran out"))
                    continue
                wanted.append("stale")
        scope_kind = {"green": "green"}
        for kind in wanted:
            if PREFIX + kind not in labels and in_scope(pr, scope_kind.get(kind, "red"), disabled):
                plan["label"].append((number, kind))
                labels.add(PREFIX + kind)
        if pr.get("isDraft") or pr.get("isCrossRepository") or pr.get("isInMergeQueue"):
            continue
        held = {label.lower() for label in labels} & HOLD_LABELS or PREFIX + EXHAUSTED in labels
        queued = any(PREFIX + kind in labels for kind in FIX_KINDS) and not generation_spent
        settling = age < ORPHAN_GRACE_S or pr.get("rollup") in ("PENDING", "EXPECTED")
        if not (held or queued or settling):
            plan["orphans"].append(number)
    plan["counts"] = counts
    return plan


def reconcile(host, lane, linear_factory, now: float, force: bool = False) -> dict | None:
    """Every RECONCILE_S: recover missed events, retire stale lane drafts, reset finished
    episodes, and record orphan PRs for the doctor's `orphan-prs` alert."""
    previous = read_state(host, "reconcile.json")
    if not force and now - float(previous.get("atEpoch") or 0) < RECONCILE_S:
        return None
    prs = open_prs_state(lane)
    if prs is None:
        return None
    providers = lane.load_providers()
    disabled = set(providers) - set(cost_order(providers))
    plan = reconcile_plan(prs, read_state(host, "fix-attempts.json"), disabled, lane.MAX_FIX_ATTEMPTS, now)
    for number, kind in plan["label"]:
        add_label(number, kind, lane.sh)
    for number, kind in plan["unlabel"]:
        consume(lane, {"number": number}, [kind])
    if plan["reset"]:
        reset = {str(number) for number in plan["reset"]}
        def drop(data: dict) -> None:
            for key in reset & set(data):
                del data[key]
        for name in ("fix-attempts.json", "synced.json"):
            lane.update_json(host.state / name, drop)
    by_number = {pr["number"]: pr for pr in prs}
    linear = None
    for number, why in plan["close"]:
        if linear is None:
            try:
                linear = linear_factory()
            except Exception:
                linear = False
        if linear:
            return_to_pool(lane, linear, by_number[number], why)
        else:
            lane.sh(["gh", "pr", "close", str(number), "--repo", lane.REPO_SLUG, "--comment", f"🤖 lanes: closing this {why}."])
    record = {"at": lane.now_iso(), "atEpoch": now, "counts": plan["counts"], "labeled": plan["label"],
              "closed": [number for number, _ in plan["close"]], "orphans": plan["orphans"]}
    lane.update_json(host.state / "reconcile.json", lambda data: (data.clear(), data.update(record)))
    return record


def tick(host, lane, linear_factory, now: float | None = None) -> dict:
    """Dispatch-tick work: the periodic reconcile, then `green`, `orphan` and first-time
    `dequeued` labels; returns {pr: outcome}."""
    now = time.time() if now is None else now
    swept = reconcile(host, lane, linear_factory, now)
    prs = queued_prs(lane, TICK_KINDS + ("dequeued",))
    outcomes = {"reconciled": swept["counts"]} if swept else {}
    if not prs:
        return outcomes
    held_file = lane.held_path(host)
    held = json.loads(held_file.read_text()) if held_file.exists() else {}
    synced = read_state(host, "synced.json")
    open_prs, linear = None, None
    for pr in prs:
        if "dequeued" in pr["eventKinds"] and str(pr["number"]) not in synced and pr.get("mergeStateStatus") != "DIRTY" \
                and POISON_LABEL not in label_names(pr) \
                and in_scope(pr, "red", set()):
            outcomes[pr["number"]] = sync_main(host, lane, pr, now)
            if outcomes[pr["number"]] == "synced":
                consume(lane, pr, ["dequeued"])
        if "green" in pr["eventKinds"]:
            outcome = ready_green(host, lane, pr, held, now)
            outcomes[pr["number"]] = outcome
            if outcome != "wait":
                consume(lane, pr, ["green"])
        if "orphan" in pr["eventKinds"]:
            if open_prs is None:
                open_prs = list_open(lane.sh)
                linear = linear_factory()
            outcome = retire_orphan(lane, linear, pr, open_prs)
            outcomes[pr["number"]] = outcome
            if outcome != "linear-unreadable":
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
