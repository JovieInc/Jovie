"""Repository bindings: one lanes service routes more than one Linear team to its own repo.

A binding is a Linear team key, a local checkout, a GitHub owner/repo, the labels an issue
must carry to be admitted (none: every Todo issue is eligible), and the gate that decides merge. The default binding is Jovie
(team JOV, LANES_REPO, the lane gate) and keeps its existing code path in lane_runner.
Extra bindings come from `bindings` in routing.json (Tim 2026-10-11: one service runs
everything, so the retired symphony-lyb Elixir service's LYB contract lives here).

Extra bindings share the host's provider seats, state dir and autoscale ceiling: a binding
run happens inside a seat a provider worker already holds, so the host's autoscaled seats
(compute and credits) are the only concurrency limit unless a binding sets `concurrency`.
Jovie-only holds (new-intake budget, hotspots, file overlap, routing) do not apply, and no
binding state holds Jovie. No open-PR ceiling limits a binding's intake (Tim 2026-10-12: only
real limits); a per-PR lease keeps two seats off one PR. Linear and GitHub reads go through lane_runner.shared(), on the
same TTLs as the Jovie claim scan. The binding's own CI is the gate: the harness opens a
ready PR and moves the issue to In Review; the repo's required checks and native merge queue
land it. It never runs Jovie's gate against another repo.

PR maintenance (Tim 2026-10-11: every open PR lands on its own) covers every open same-repo PR
in a binding's repo, not only lane-authored ones, and never reads Linear. Each pass first takes
the cheap, idempotent steps (`maintain`): enqueue a green ready PR that is not in the queue (a
queued PR is never re-enqueued: that sends it to the back), ready a green draft idle past the
draft SLO, and ask Dependabot to rebase its conflicting bumps. Then one agent run repairs the
oldest PR that is conflicting, red on the repo's own required checks, rejected by a merge group
at its head, or has changes requested. LYB runs iOS only in merge groups (LYB #1333), so a
failed_checks ejection is the iOS failure signal: the repair prompt carries that merge-group
run's failed-job log, and the failed head is not re-enqueued unchanged.
"""
from __future__ import annotations

import json
import os
import re
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

POLICY = Path(__file__).resolve().parent / "routing.json"
REPAIR_STATES = frozenset({"BEHIND", "DIRTY"})
# Every open PR of a binding repo with what maintenance needs, 50 per GraphQL page (cost 2).
OPEN_PRS_QUERY = (
    'query($owner:String!,$name:String!,$after:String){repository(owner:$owner,name:$name){'
    'pullRequests(states:OPEN,first:50,after:$after,orderBy:{field:CREATED_AT,direction:ASC}){'
    'pageInfo{hasNextPage endCursor} nodes{id number title url isDraft isCrossRepository headRefName '
    'headRefOid mergeStateStatus reviewDecision body author{login} labels(first:20){nodes{name}} '
    'mergeQueueEntry{state enqueuer{login}} commits(last:1){nodes{commit{committedDate '
    'statusCheckRollup{state contexts(first:80){nodes{__typename ... on CheckRun{name status conclusion} '
    '... on StatusContext{context state}}}}}}} timelineItems(last:6,itemTypes:[REMOVED_FROM_MERGE_QUEUE_EVENT]){'
    'nodes{... on RemovedFromMergeQueueEvent{createdAt reason}}}}}}}')
OPEN_PR_PAGES = 8                   # 400 open PRs; more reads as unreadable, never as a partial list
REQUIRED_TTL_S = 3600               # branch rules change rarely
GREEN = frozenset({"SUCCESS", "NEUTRAL", "SKIPPED"})
RED_STATES = frozenset({"FAILURE", "TIMED_OUT", "STARTUP_FAILURE", "ERROR", "ACTION_REQUIRED"})
ENQUEUE_STATES = frozenset({"CLEAN", "HAS_HOOKS", "UNSTABLE"})
DRAFT_STATES = ENQUEUE_STATES | {"DRAFT"}
POISON_FAILURES = 1                 # a failed merge group at one head: repair, never re-enqueue as is
MANUAL_QUIET_S = 2 * 3600           # someone dequeued it by hand: leave it this long
REPAIR_IDLE_S = 2 * 3600            # a session that pushed within this window still owns its PR
DRAFT_SLO_S = 48 * 3600
ATTEMPT_RESET_S = 24 * 3600         # repair attempts at one head may retry after a day
ACTION_RETRY_S = 3600
SETUP_RETRY_S = 3600                # a head whose checkout/install failed waits this long, uncharged
MAX_ACTIONS = 10                    # GitHub writes per maintenance pass
DEPENDENCY = re.compile(r"(?i)\b(?:depends on|blocked by|waits? (?:on|for)|stacked on)\s+#(\d+)"
                        r"|#(\d+)\s+(?:must|has to|needs to)\s+(?:be merged|merge|land)")
ENQUEUE_MUTATION = ('mutation($id:ID!,$head:GitObjectID!){enqueuePullRequest(input:{pullRequestId:$id,'
                    'expectedHeadOid:$head}){mergeQueueEntry{position}}}')
MERGE_GROUP_LOG_CHARS = 6000        # tail of the failed merge-group jobs' log in a repair prompt
FETCH_ATTEMPTS = 2                  # one lost ref-lock race retries once (JOV-8902/LYB-226); more is a real fault
CANNOT_LOCK_REF = "cannot lock ref"
PUSH_ATTEMPTS = 2                   # the pre-push hook's test suite can flake; one retry, never --no-verify


@dataclass(frozen=True)
class Binding:
    key: str                      # Linear team key, also the identifier prefix
    repo: Path                    # local checkout the worktrees come from
    slug: str                     # GitHub owner/repo the PRs target
    labels: tuple[str, ...]       # every one is required for admission; empty = any Todo issue
    gate: str                     # "lane-gate" (Jovie) | "github-required-checks"
    excluded: tuple[str, ...] = ()
    concurrency: int | None = None  # None: only the host's provider seats limit it
    providers: tuple[str, ...] = ()
    install: tuple[str, ...] = ()
    review_state: str = "In Review"

    def branch_pattern(self) -> re.Pattern:
        return re.compile(rf"^(?P<lane>[a-z0-9-]+)/(?P<issue>{self.key.lower()}-\d+)-\d{{8}}")


def default_binding(lane, host) -> Binding:
    """Today's Jovie behavior, documented as a binding. lane_runner's JOV path is unchanged."""
    return Binding("JOV", host.repo, lane.REPO_SLUG, (), "lane-gate")  # any Todo issue (2026-10-11)


def extra_bindings(lane, policy: dict | None = None, env=None, hostname: str | None = None) -> list[Binding]:
    """Configured, enabled bindings whose checkout exists on this host.

    A binding is active on the hosts it names, or anywhere `LANES_REPO_<KEY>` points at a
    checkout; `LANES_BINDING_<KEY>=0` turns it off. Unit tests pass `policy` explicitly."""
    env = os.environ if env is None else env
    if policy is None:
        if env.get("LANES_EXECUTION_BACKEND") == "local-test":
            return []
        policy = lane.read_json(POLICY)
    hostname = lane.HOST if hostname is None else hostname
    rows = policy.get("bindings") if isinstance(policy, dict) else None
    active = []
    for key, row in (rows or {}).items():
        if not isinstance(row, dict) or not re.fullmatch(r"[A-Z][A-Z0-9]{1,9}", key) or key == "JOV":
            continue
        if row.get("enabled") is not True or env.get(f"LANES_BINDING_{key}") == "0":
            continue
        override = env.get(f"LANES_REPO_{key}")
        if not override and hostname not in (row.get("hosts") or []):
            continue
        repo = Path(override or os.path.expanduser(str(row.get("repo") or "")))
        labels = row.get("requiredLabels")
        slug = row.get("repoSlug")
        if not (repo / ".git").exists() or not isinstance(slug, str) or not re.fullmatch(r"[\w.-]+/[\w.-]+", slug):
            continue
        if not isinstance(labels, list) or any(not isinstance(x, str) or not x for x in labels):
            continue
        active.append(Binding(
            key, repo, slug, tuple(label.lower() for label in labels), str(row.get("gate") or "github-required-checks"),
            tuple(str(x).lower() for x in row.get("excludedLabels") or ()),
            None if row.get("concurrency") is None else max(1, int(row["concurrency"])),
            tuple(row.get("providers") or ()),
            tuple(row.get("install") or ()), str(row.get("reviewState") or "In Review")))
    return active


def team_of(identifier: str) -> str:
    return (identifier or "").split("-", 1)[0].upper()


# ---------------------------------------------------------------- cached reads

def todo_issues(lane, host, binding: Binding) -> list:
    """Todo issues carrying any required label (every Todo issue when none is required),
    from the host's local mirror of the binding's team: no Linear request (2026-10-11)."""
    wanted = set(binding.labels)
    return [lane.Issue(r["id"], r["identifier"], r["title"], r["description"], r["priority"],
                       r["createdAt"], list(r["labels"]))
            for r in lane.linear_sync.todo(host.state, binding.key) if not wanted or wanted & set(r["labels"])]


def required_checks(lane, binding: Binding) -> list[str] | None:
    """The repo's own required status checks on main (its gate), cached per repo."""
    def fetch():
        ran = lane.sh(["gh", "api", f"repos/{binding.slug}/rules/branches/main"])
        if ran.returncode:
            return None
        try:
            rules = json.loads(ran.stdout or "[]")
            return sorted({check["context"] for rule in rules if rule.get("type") == "required_status_checks"
                           for check in rule["parameters"]["required_status_checks"]})
        except (ValueError, KeyError, TypeError):
            return None
    return lane.shared(f"binding-required-v1-{lane._cache_token(binding.slug)}", REQUIRED_TTL_S, fetch)


def gate_state(checks: list[dict], required: list[str], rollup: str | None) -> str:
    """green | red | pending on the repo's required checks (the aggregate rollup when none)."""
    if not required:
        return {"SUCCESS": "green", "FAILURE": "red", "ERROR": "red"}.get(rollup or "", "pending")
    latest = {check.get("name"): (check.get("conclusion") or check.get("state") or "").upper()
              for check in checks}
    states = [latest.get(name, "") for name in required]
    if any(state in RED_STATES for state in states):
        return "red"
    return "green" if all(state in GREEN for state in states) else "pending"



def pr_row(node: dict, required: list[str]) -> dict:
    """One PR in the shape the binding pass uses (the old `gh pr list` fields plus maintenance facts)."""
    commit = (((node.get("commits") or {}).get("nodes") or [{}])[-1] or {}).get("commit") or {}
    rollup = commit.get("statusCheckRollup") or {}
    checks = []
    for item in (rollup.get("contexts") or {}).get("nodes") or []:
        if item.get("__typename") == "StatusContext":
            checks.append({"name": item.get("context"), "state": item.get("state")})
        elif item.get("name"):
            checks.append({"name": item["name"], "status": item.get("status"), "conclusion": item.get("conclusion")})
    entry = node.get("mergeQueueEntry")
    return {
        "id": node.get("id"), "number": node["number"], "title": node.get("title") or "", "url": node.get("url"),
        "isDraft": bool(node.get("isDraft")), "crossRepository": bool(node.get("isCrossRepository")),
        "headRefName": node.get("headRefName") or "", "headRefOid": node.get("headRefOid") or "",
        "mergeStateStatus": node.get("mergeStateStatus"), "reviewDecision": node.get("reviewDecision"),
        "author": (node.get("author") or {}).get("login") or "",
        "labels": sorted(label["name"].lower() for label in (node.get("labels") or {}).get("nodes") or []),
        "committedAt": commit.get("committedDate") or "",
        "queue": {"state": entry.get("state"), "enqueuer": (entry.get("enqueuer") or {}).get("login") or ""}
        if entry else None,
        "removals": [{"reason": (item.get("reason") or "").lower(), "at": item.get("createdAt") or ""}
                     for item in (node.get("timelineItems") or {}).get("nodes") or [] if item],
        "dependsOn": sorted({int(n) for pair in DEPENDENCY.findall(node.get("body") or "") for n in pair if n}),
        "statusCheckRollup": checks,
        "gate": gate_state(checks, required, rollup.get("state")),
    }


def open_prs(lane, binding: Binding) -> list[dict] | None:
    """Every open PR in the binding's repo with its required-check gate, queue entry and queue
    removals, in a few GraphQL pages. One cached fill per host per TTL, keyed per repo. None
    when GitHub cannot be read."""
    owner, name = binding.slug.split("/", 1)

    def fetch():
        required = required_checks(lane, binding)
        if required is None:
            return None
        nodes, after = [], None
        for _ in range(OPEN_PR_PAGES):
            args = ["gh", "api", "graphql", "-f", f"query={OPEN_PRS_QUERY}", "-F", f"owner={owner}",
                    "-F", f"name={name}", *(["-f", f"after={after}"] if after else [])]
            listed = lane.sh(args)
            if listed.returncode:
                return None
            try:
                page = json.loads(listed.stdout or "{}")["data"]["repository"]["pullRequests"]
                nodes.extend(page["nodes"])
            except (ValueError, KeyError, TypeError):
                return None
            if not page["pageInfo"]["hasNextPage"]:
                return [pr_row(node, required) for node in nodes if node]
            after = page["pageInfo"]["endCursor"]
        return None
    return lane.shared(f"binding-open-prs-v2-{lane._cache_token(binding.slug)}", lane.SUMMARY_TTL_S, fetch)


def in_flight(binding: Binding, prs: list[dict]) -> frozenset[str]:
    """Identifiers any open PR already carries in its branch or title (lane or legacy branch)."""
    found = re.compile(rf"\b{binding.key}-\d+\b", re.IGNORECASE)
    return frozenset(match.upper() for pr in prs
                     for match in found.findall(f"{pr.get('headRefName') or ''} {pr.get('title') or ''}"))


def lane_owned(binding: Binding, prs: list[dict], lanes=None) -> list[dict]:
    """Open PRs on a run branch of a configured lane (`<lane>/<key>-<n>-<date>`)."""
    pattern = binding.branch_pattern()
    lanes = set(lanes) if lanes is not None else None
    return [pr for pr in prs if (owned := pattern.match(pr.get("headRefName") or ""))
            and (lanes is None or owned.group("lane") in lanes)]


def is_red(lane, pr: dict) -> bool:
    """Red on the repo's required checks; any red check when the gate is unknown."""
    if pr.get("gate"):
        return pr["gate"] == "red"
    return any((check.get("conclusion") or check.get("state") or "").upper() in lane.RED
               for check in pr.get("statusCheckRollup") or [])


def _age(stamp: str, now: float) -> float:
    try:
        return now - datetime.fromisoformat(stamp.replace("Z", "+00:00")).timestamp()
    except (AttributeError, ValueError):
        return float("inf")  # unknown age never holds work back


def queue_failures(pr: dict) -> int:
    """Merge groups that failed at the current head (removals since its commit)."""
    since = pr.get("committedAt") or ""
    return sum(1 for item in pr.get("removals") or ()
               if item.get("reason") == "failed_checks" and item.get("at", "") >= since)


def _waits_on_open_pr(pr: dict, open_numbers: set) -> bool:
    return any(number in open_numbers and number != pr["number"] for number in pr.get("dependsOn") or ())


def _is_dependabot(pr: dict) -> bool:
    return pr.get("author", "").startswith("dependabot") or pr.get("headRefName", "").startswith("dependabot/")


def repair_reasons(lane, binding: Binding, pr: dict) -> list[str]:
    """Why an agent should repair this PR; empty when the queue, a person or a cheap step owns it."""
    if pr.get("crossRepository") or pr.get("queue") or set(pr.get("labels") or ()) & set(binding.excluded):
        return []
    reasons = []
    if pr.get("mergeStateStatus") in REPAIR_STATES and not _is_dependabot(pr):  # Dependabot rebases its own
        reasons.append("conflict" if pr["mergeStateStatus"] == "DIRTY" else "behind")
    if is_red(lane, pr):
        reasons.append("red-checks")
    if queue_failures(pr) >= POISON_FAILURES:
        reasons.append("merge-group-failed")
    if pr.get("reviewDecision") == "CHANGES_REQUESTED":
        reasons.append("changes-requested")
    return reasons


def _attempt_count(value, now: float) -> int:
    if isinstance(value, dict):
        return 0 if now - float(value.get("at") or 0) > ATTEMPT_RESET_S else int(value.get("count") or 0)
    return int(value or 0)


# ---------------------------------------------------------------- admission

def refusal(lane, binding: Binding, issue, failures: dict, now: float, flying: frozenset[str],
            provider: str | None = None) -> str | None:
    """The binding's admission predicate. Every refusal names the binding.

    Sensitive labels no longer exclude an issue; like the Jovie pool, only the stricter
    SENSITIVE_PROVIDER lane may claim it."""
    labels = {label.lower() for label in issue.labels}
    missing = sorted(set(binding.labels) - labels)
    if missing:
        return f"{binding.key}:missing-label:{','.join(missing)}"
    excluded = sorted(set(binding.excluded) & labels)
    if excluded:
        return f"{binding.key}:excluded-label:{excluded[0]}"
    shared_rule = lane.label_rejection(issue, provider)
    if shared_rule:
        return f"{binding.key}:{shared_rule}"
    if lane.issue_hits_red_line(issue):
        return f"{binding.key}:sensitive-text"
    if lane.issue_is_sensitive(issue) and provider != lane.SENSITIVE_PROVIDER:
        return f"{binding.key}:sensitive-provider"
    record = lane.failure_record(failures.get(issue.identifier))
    if rejected := lane.failure_rejection(record):
        return f"{binding.key}:{rejected}"
    if issue.identifier.upper() in flying:
        return f"{binding.key}:in-flight-pr"
    return None


def repair_candidate(lane, binding: Binding, prs: list[dict], attempts: dict, busy=lambda pr: False,
                     now: float | None = None) -> dict | None:
    """The PR an agent repairs next: lane PRs first, then ready before draft, oldest first. Any
    open same-repo PR qualifies (`repair_reasons`); another author's PR only once its head has
    been idle REPAIR_IDLE_S. At most MAX_FIX_ATTEMPTS per head per day, never one another seat
    is repairing (`busy`)."""
    now = time.time() if now is None else now
    owned = {pr["number"] for pr in lane_owned(binding, prs, lane.load_providers())}
    for pr in sorted(prs, key=lambda row: (row["number"] not in owned, bool(row.get("isDraft")), row["number"])):
        reasons = repair_reasons(lane, binding, pr)
        if not reasons or (pr["number"] not in owned and _age(pr.get("committedAt") or "", now) < REPAIR_IDLE_S):
            continue
        record = attempts.get(f"{binding.key}#{pr['number']}:{pr['headRefOid']}")
        if isinstance(record, dict) and now - float(record.get("setupFailedAt") or 0) < SETUP_RETRY_S:
            continue
        if _attempt_count(record, now) < lane.MAX_FIX_ATTEMPTS and not busy(pr):
            return {**pr, "repairReasons": reasons}
    return None


# ---------------------------------------------------------------- cheap maintenance

def maintenance_actions(binding: Binding, prs: list[dict], now: float) -> list[tuple[str, dict]]:
    """The idempotent GitHub steps this snapshot calls for, as (kind, pr):
    `enqueue` a green ready PR out of the queue (never one already queued, never a head a merge
    group rejected, never within MANUAL_QUIET_S of a manual dequeue),
    `ready` a green draft idle past the draft SLO, `rebase` a conflicting Dependabot bump."""
    open_numbers = {pr["number"] for pr in prs}
    actions = []
    for pr in sorted(prs, key=lambda row: row["number"]):
        if pr.get("crossRepository") or not pr.get("id") or set(pr.get("labels") or ()) & set(binding.excluded):
            continue
        green, state, queue = pr.get("gate") == "green", pr.get("mergeStateStatus"), pr.get("queue")
        if queue:
            continue  # in the queue: re-enqueueing would send it to the back
        if _is_dependabot(pr) and state == "DIRTY":
            actions.append(("rebase", pr))
            continue
        if not green or _waits_on_open_pr(pr, open_numbers) or queue_failures(pr) >= POISON_FAILURES:
            continue
        if pr.get("isDraft"):
            if state in DRAFT_STATES and _age(pr.get("committedAt") or "", now) >= DRAFT_SLO_S:
                actions.append(("ready", pr))
            continue
        last = (pr.get("removals") or [{}])[-1]
        if state in ENQUEUE_STATES and not (last.get("reason") == "manual"
                                             and _age(last.get("at") or "", now) < MANUAL_QUIET_S):
            actions.append(("enqueue", pr))
    return actions


def _enqueue(lane, pr: dict) -> bool:
    return lane.sh(["gh", "api", "graphql", "-f", f"query={ENQUEUE_MUTATION}", "-f", f"id={pr['id']}",
                    "-f", f"head={pr['headRefOid']}"]).returncode == 0


def _apply(lane, binding: Binding, kind: str, pr: dict) -> bool:
    number = str(pr["number"])
    if kind == "enqueue":
        return _enqueue(lane, pr)
    if kind == "ready":
        if lane.sh(["gh", "pr", "ready", number, "--repo", binding.slug]).returncode:
            return False
        lane.sh(["gh", "pr", "comment", number, "--repo", binding.slug, "--body",
                 "Lanes readied this draft: required checks are green on this head and it has been "
                 "idle past the 48h draft SLO. The native merge queue lands it."])
        return True
    if kind == "rebase":
        return lane.sh(["gh", "pr", "comment", number, "--repo", binding.slug, "--body",
                        "@dependabot rebase"]).returncode == 0
    return False


def maintain(lane, host, binding: Binding, prs: list[dict], now: float | None = None) -> dict:
    """Apply `maintenance_actions` once per (kind, PR, head, queue removals); a failed write
    retries after ACTION_RETRY_S. Returns counts per kind for the status record."""
    now = time.time() if now is None else now
    path = host.state / "bindings" / binding.key / "maintenance.json"
    done = lane.read_json(path)
    applied: dict[str, int] = {}
    writes = 0
    for kind, pr in maintenance_actions(binding, prs, now):
        key = f"{kind}:{pr['number']}:{pr['headRefOid']}:{len(pr.get('removals') or ())}"
        prior = done.get(key) or {}
        if prior.get("ok") or now - float(prior.get("at") or 0) < ACTION_RETRY_S:
            continue
        if writes >= MAX_ACTIONS:
            break
        writes += 1
        ok = _apply(lane, binding, kind, pr)
        done[key] = {"at": now, "ok": ok}
        applied[kind if ok else f"{kind}-failed"] = applied.get(kind if ok else f"{kind}-failed", 0) + 1
    if writes:
        def merge(data: dict) -> None:
            data.update(done)
            for key in [key for key, row in data.items() if now - float(row.get("at") or 0) > 14 * 86400]:
                del data[key]
        lane.update_json(path, merge)
    return applied


def record_status(lane, host, binding: Binding, **fields) -> None:
    """Latest pass per binding (refusal reasons included) for the operator and the doctor."""
    try:
        lane.update_json(host.state / "bindings.json",
                         lambda data: data.update({binding.key: {"at": lane.now_iso(), **fields}}))
    except (OSError, ValueError):
        pass


class _Unbounded:
    """The seat of a binding without its own cap: the provider seat already held is the limit."""
    held = True

    def release(self) -> None:
        pass


def take_seat(lane, host, binding: Binding):
    """One of the binding's own seats, if it sets a cap. Outside slots/ so the provider-seat
    census never counts it."""
    root = host.state / "bindings" / binding.key
    root.mkdir(parents=True, exist_ok=True)
    if binding.concurrency is None:
        return _Unbounded()
    for index in range(binding.concurrency):
        seat = lane.Locked(root / f"seat.{index}.lock", blocking=False)
        if seat.held:
            return seat
        seat.release()
    return None


# ---------------------------------------------------------------- the pass

def work(lane, host, name: str, spec: dict, *, maintenance_only: bool = False,
         bindings: list[Binding] | None = None) -> str | None:
    """Repair, else claim, one unit of bound work in this worker's held provider seat.

    Returns the run verdict, or None when no binding had work for this lane."""
    bindings = extra_bindings(lane) if bindings is None else bindings
    if not bindings or spec.get("repairs") is False:
        return None
    for binding in bindings:
        if binding.providers and name not in binding.providers:
            continue
        seat = take_seat(lane, host, binding)
        if seat is None:
            continue  # the binding's own concurrency is in use; the last pass's status stands
        try:
            verdict = _work_one(lane, host, binding, name, spec, maintenance_only)
        except lane.LinearRateLimited:
            record_status(lane, host, binding, worker=name, outcome="linear-rate-limited")
            return None
        except lane.LaneInventoryUnknown as error:
            record_status(lane, host, binding, worker=name, outcome=f"{binding.key}:{error}")
            continue
        finally:
            seat.release()
        if verdict is not None:
            return verdict
    return None


def _repair_lease(lane, host, binding: Binding, pr: dict):
    """A non-blocking per-PR lock held for the whole repair run; None when another seat has it.
    The kernel drops it when the holder exits, so a crashed run never strands the PR."""
    lease = lane.Locked(host.state / "bindings" / binding.key / f"repair.{pr['number']}.lock", blocking=False)
    if lease.held:
        return lease
    lease.release()
    return None


def _work_one(lane, host, binding: Binding, name: str, spec: dict, maintenance_only: bool) -> str | None:
    pr = issue = linear = lease = None
    leases = {}

    def busy(candidate):
        held = _repair_lease(lane, host, binding, candidate)
        if held is not None:
            leases[candidate["number"]] = held
        return held is None
    claim = lane.Locked(host.state / "claim.lock", blocking=True)
    try:
        prs = open_prs(lane, binding)
        if prs is None:
            record_status(lane, host, binding, worker=name, outcome="github-unreadable")
            return None
        try:  # a maintenance fault never holds back repair or intake
            maintained = maintain(lane, host, binding, prs)
        except Exception as error:
            maintained = {"error": f"{type(error).__name__}: {error}"[:200]}
        attempts_path = host.state / "bindings" / binding.key / "fix-attempts.json"
        attempts = lane.read_json(attempts_path)
        pr = repair_candidate(lane, binding, prs, attempts, busy)
        lease = leases.pop(pr["number"], None) if pr is not None else None
        for other in leases.values():
            other.release()
        if pr is not None:
            key = f"{binding.key}#{pr['number']}:{pr['headRefOid']}"
            stamp = time.time()
            lane.update_json(attempts_path, lambda data: data.update(
                {key: {"count": _attempt_count(data.get(key), stamp) + 1, "at": stamp}}))
            record_status(lane, host, binding, worker=name, outcome="repair", pr=pr["number"],
                          reasons=pr.get("repairReasons") or [], maintained=maintained)
        elif not maintenance_only:
            linear = lane.linear_sync.Outboxed(host.state, lane.Linear(host.linear_env))
            pool = todo_issues(lane, host, binding)
            failures = lane.read_json(lane.failures_path(host))
            now, flying = time.time(), in_flight(binding, prs)
            refused = {item.identifier: refusal(lane, binding, item, failures, now, flying, name) for item in pool}
            eligible = sorted((item for item in pool if refused[item.identifier] is None),
                              key=lambda item: lane.admission_order(item, now))
            # The local ledger is the claim; In Progress reaches Linear through the outbox.
            if eligible and lane.linear_sync.claim(
                    host.state, eligible[0].id, eligible[0].identifier, name):
                issue = eligible[0]
                lease = lane.Locked(host.state / "bindings" / binding.key / f"issue.{issue.identifier}.lock",
                                    blocking=False)
                linear.move(issue.id, "In Progress")
            outcome = "claimed" if issue else "claim-raced" if eligible else "none-eligible"
            record_status(lane, host, binding, worker=name, outcome=outcome, pool=len(pool),
                          eligible=len(eligible), claimed=issue.identifier if issue else None,
                          refusals={key: value for key, value in refused.items() if value},
                          maintained=maintained)
        else:
            record_status(lane, host, binding, worker=name, outcome="no-repair", maintained=maintained)
    finally:
        claim.release()
    if pr is not None:
        try:
            receipt = run(lane, host, binding, name, spec, pr=pr)
        finally:
            lease.release()
        if setup_failed(receipt):
            lane.update_json(attempts_path, lambda data: refund_setup_failure(
                data, f"{binding.key}#{pr['number']}:{pr['headRefOid']}", time.time()))
        return receipt.get("verdict")
    if issue is None:
        return None
    try:
        lane.notify_issue_claim(linear, issue, name, spec)
        if lane.epics.is_epic(issue):  # decomposed in the binding's own team and repo
            receipt = lane.epics.run_epic(lane, host, name, spec, linear, issue, binding.repo)
        else:
            receipt = run(lane, host, binding, name, spec, issue=issue)
        if receipt.get("verdict") not in lane.epics.SETTLED_VERDICTS:
            finish_issue(lane, host, binding, name, linear, issue, receipt)
    finally:
        lease.release()
    return receipt.get("verdict")


# ---------------------------------------------------------------- runs

def fetch(lane, host, binding: Binding, log, *refs: str) -> None:
    """Fetch `refs` from the binding's shared clone, one fetch per repo at a time.

    Seats claimed in the same second race the clone's ref lock and die 'cannot lock ref
    refs/remotes/origin/main' seconds in (JOV-8902/LYB-226). A per-repo flock serializes
    them and a lost race retries once. The kernel drops the lock if the holder dies and
    git's own 600s timeout bounds every hold, so the wait cannot outlive the fetch it
    serializes; a non-ref-lock fault fails immediately."""
    lock = lane.Locked(host.state / "bindings" / binding.key / "fetch.lock", blocking=True)
    try:
        for attempt in range(FETCH_ATTEMPTS):
            ran = lane.sh(["git", "fetch", "-q", "origin", *refs], cwd=binding.repo, timeout=600, log=log)
            if not ran.returncode:
                return
            if attempt + 1 < FETCH_ATTEMPTS and CANNOT_LOCK_REF in f"{ran.stdout}{ran.stderr}":
                continue
            raise RuntimeError("git-fetch-failed")
    finally:
        lock.release()


def push_with_retry(git, branch: str, attempts: int = PUSH_ATTEMPTS) -> None:
    """Push an issue branch, retrying a flaky pre-push hook once. The hook gates every
    attempt (never --no-verify), so a persistent failure - a real regression, not a flake -
    still fails the run and charges the issue."""
    last: BaseException = RuntimeError("git-push-failed")
    for _ in range(attempts):
        try:
            git("push", "-q", "-u", "origin", branch)
            return
        except RuntimeError as error:
            last = error
    raise last


def merge_group_evidence(lane, binding: Binding, pr: dict) -> str:
    """The failed merge-group run for this PR (`gh-readonly-queue/main/pr-<n>-*`) and the tail of
    its failed jobs' log, read once when the repair starts. Empty when none is readable."""
    listed = lane.sh(["gh", "api", f"repos/{binding.slug}/actions/runs?event=merge_group&status=failure&per_page=50",
                      "--jq", ".workflow_runs[] | [.id, .head_branch, .html_url] | @tsv"], timeout=60)
    prefix = f"gh-readonly-queue/main/pr-{pr['number']}-"
    for line in (listed.stdout or "").splitlines() if listed.returncode == 0 else []:
        run_id, branch, url = (line.split("\t") + ["", "", ""])[:3]
        if branch.startswith(prefix) and run_id.isdigit():
            log = lane.sh(["gh", "run", "view", run_id, "--repo", binding.slug, "--log-failed"], timeout=120)
            tail = (log.stdout or "")[-MERGE_GROUP_LOG_CHARS:] if log.returncode == 0 else ""
            return f"Failed merge-group run {url}\n```\n{tail or '(log unreadable)'}\n```"
    return ""


def render_prompt(binding: Binding, branch: str, *, issue=None, pr=None, context: str = "",
                  goal: list[str] | tuple = ()) -> str:
    common = [
        f"- Repo {binding.slug}. Read AGENTS.md / CLAUDE.md and the rules they route to before editing.",
        "- Make the smallest correct change. Do not weaken CI, delete tests or skip gates.",
        "  Never use --no-verify, the GitHub Contents API, or a force push.",
        "- Run the tightest relevant checks you can on this host and say exactly what ran.",
        "- Commit with a clear commitlint-style message. Do not push and do not open or",
        "  edit a PR: the harness pushes your commits; the repo's required checks gate merge.",
        "- You are unattended: never stop to ask and never wait for a plan, approval label or",
        "  another agent. Do not run gstack or skill workflows other than `/autoplan`.",
        "- If the work is not code-shippable or already done, commit nothing and end with a",
        "  line `NOT-SHIPPABLE: <reason>`.",
        "- End with a handoff: what changed, what you verified, concerns and deviations.",
    ]
    if pr is not None:
        failing = sorted({check.get("name") or check.get("context") or "?"
                          for check in pr.get("statusCheckRollup") or []
                          if (check.get("conclusion") or check.get("state") or "").upper()
                          in {"FAILURE", "TIMED_OUT", "STARTUP_FAILURE"}})
        reasons = pr.get("repairReasons") or []
        extra = []
        if "merge-group-failed" in reasons:
            extra.append("- The merge queue rejected this exact head (failed merge-group CI; iOS runs only in "
                         "merge groups). Reproduce against origin/main merged in and fix the cause in this "
                         "branch. If the failure is another PR's in the same group, merging origin/main is "
                         "the whole fix: the new head re-enters the queue.")
            if context:
                extra.append(context)
        if "changes-requested" in reasons:
            extra.append(f"- A review requested changes. Read `gh pr view {pr['number']} --repo {binding.slug} "
                         "--comments` and the inline review comments, and address each one.")
        return "\n".join([
            f"# Repair PR #{pr['number']} in {binding.slug}: {pr.get('title') or ''}", "",
            f"Branch `{branch}` at {pr['headRefOid']} is checked out. Merge state: "
            f"{pr.get('mergeStateStatus') or 'unknown'}. Failing checks: {', '.join(failing) or 'none'}. "
            f"Repair reasons: {', '.join(reasons) or 'red or behind'}.", "",
            "## Contract",
            "- Merge origin/main into this branch first (no rebase), resolving conflicts.",
            "- Then fix what the failing checks report. Read their logs with `gh run view --log-failed`.",
            *extra,
            "- Keep the PR's intent. If origin/main already contains this change, commit nothing and end",
            "  with `NOT-SHIPPABLE: superseded by <commit or PR>`.",
            *common])
    return "\n".join([
        f"# {issue.title} ({issue.identifier})", "", issue.description or "(no description)", "", "---",
        "## Company context (GBrain; verify against source)",
        context or "(GBrain unavailable for this run; rely on repo docs.)", "",
        *goal,
        "## Contract",
        f"- Work on branch `{branch}` from origin/main.",
        *common])


def run(lane, host, binding: Binding, name: str, spec: dict, *, issue=None, pr=None) -> dict:
    """One agent run in a binding worktree, then push and (for an issue) a ready PR."""
    subject = issue.identifier if issue is not None else f"{binding.key}-PR{pr['number']}"
    run_id = f"{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-{subject}-{name}-{uuid.uuid4().hex[:6]}"
    branch = pr["headRefName"] if pr is not None else f"{name}/{issue.identifier.lower()}-{run_id[:15].lower()}"
    runs = host.state / "runs"
    runs.mkdir(parents=True, exist_ok=True)
    worktree = host.state / "bindings" / binding.key / "worktrees" / run_id
    receipt = {"schema": "jovie-lane-run/v1", "binding": binding.key, "repository": binding.slug,
               "gate": binding.gate, "kind": "binding-repair" if pr is not None else "binding-issue",
               "runId": run_id, "provider": name, "model": spec.get("model"), "branch": branch,
               "worktree": str(worktree), "origin": lane.AUTONOMOUS_ORIGIN,
               "executionHost": lane.HOST, "initiator": "symphony",
               "attribution": {"category": "autonomous-remediation" if pr is not None else "autonomous-created",
                               **({"provider": name} if pr is not None else
                                  {"originProvider": name, "finalProvider": name})},
               "startedAt": lane.now_iso(),
               **({"issue": issue.identifier, "linearIssueId": issue.id} if issue is not None else
                  {"pr": pr["number"], "headBefore": pr["headRefOid"]})}
    with open(runs / f"{run_id}.log", "w") as log:
        def git(*args, cwd=worktree, timeout=600):
            ran = lane.sh(["git", *args], cwd=cwd, timeout=timeout, log=log)
            if ran.returncode:
                raise RuntimeError(f"git-{args[0]}-failed")
            return ran.stdout.strip()
        try:
            lane.require_disk(host, "binding-checkout")
            worktree.parent.mkdir(parents=True, exist_ok=True)
            if pr is not None:
                fetch(lane, host, binding, log, "main", branch)
                git("worktree", "add", "-q", "--detach", str(worktree), pr["headRefOid"], cwd=binding.repo)
            else:
                fetch(lane, host, binding, log, "main")
                git("worktree", "add", "-q", "-b", branch, str(worktree), "origin/main", cwd=binding.repo)
            if binding.install and lane.sh(install_command(binding, pr), cwd=worktree, timeout=1800,
                                           log=log).returncode:
                raise RuntimeError("install-failed")
            prompt = render_prompt(binding, branch, issue=issue, pr=pr,
                                   context=lane.context_pack(issue) if issue is not None else
                                   merge_group_evidence(lane, binding, pr)
                                   if "merge-group-failed" in (pr.get("repairReasons") or []) else "",
                                   goal=lane.goal_contract(issue) if issue is not None else ())
            prompt_file = runs / f"{run_id}.prompt.md"
            prompt_file.write_text(prompt)
            started = time.time()
            receipt["agentStarted"] = True
            agent = lane.run_agent(lane.template(spec["cmd"], {
                "prompt": prompt, "prompt_file": str(prompt_file), "cwd": str(worktree),
                "provider_receipt": str(runs / f"{run_id}.provider.jsonl"), "model": str(spec.get("model"))}),
                worktree, log, host.agent_timeout, guard=lambda: lane.require_disk(host, "binding-agent-running"))
            receipt.update(agentExit=agent.returncode, agentSeconds=round(time.time() - started))
            log.flush()
            declined = lane.not_shippable_reason((runs / f"{run_id}.log").read_text(errors="replace")[-20000:])
            receipt.update(publish(lane, binding, branch, worktree, git, issue=issue, pr=pr))
            if receipt["verdict"] == "no-change" and declined:
                receipt.update(verdict="not-shippable", reasons=[declined])
            elif receipt["verdict"] == "no-change" and agent.returncode != 0:
                receipt.update(verdict="provider-error", reasons=[f"agent-exit:{agent.returncode}"])
        except lane.DiskAdmissionError as error:
            receipt.update(verdict="disk-held", reasons=[str(error)])
        except Exception as error:  # a broken run must still leave a receipt and free its issue
            receipt.update(verdict="failed", reasons=[f"harness-error:{type(error).__name__}:{error}"[:300]])
        finally:
            cleanup(lane, binding, worktree, branch if pr is None else None, receipt)
    receipt["endedAt"] = lane.now_iso()
    with open(runs / "ledger.jsonl", "a") as ledger:
        ledger.write(json.dumps(receipt) + "\n")
    return receipt


def install_command(binding: Binding, pr: dict | None) -> list[str]:
    """A repaired PR's lockfile may be stale by design (a Dependabot bump is exactly that):
    repairs install without the frozen-lockfile check, which only new work keeps."""
    command = list(binding.install)
    if pr is not None and "--frozen-lockfile" in command:
        command[command.index("--frozen-lockfile")] = "--no-frozen-lockfile"
    return command


def setup_failed(receipt: dict) -> bool:
    """The run failed before any agent started (checkout, install): not a repair attempt."""
    return receipt.get("verdict") == "failed" and not receipt.get("agentStarted")


def refund_setup_failure(attempts: dict, key: str, now: float) -> None:
    """Return the attempt a setup failure was charged; the head then waits SETUP_RETRY_S
    instead of retrying (and re-checking out) every worker loop."""
    record = attempts.get(key)
    attempts[key] = {"count": max(0, _attempt_count(record, now) - 1),
                     "at": record.get("at", now) if isinstance(record, dict) else now,
                     "setupFailedAt": now}


def publish(lane, binding: Binding, branch: str, worktree: Path, git, *, issue=None, pr=None) -> dict:
    """Push the agent's commits (never forced) and, for an issue, open its one ready PR.

    Ready, never draft: the repo's native merge-queue enrollment skips drafts, and every
    lane PR must land on its own once the required checks pass."""
    if pr is not None:
        result = _publish_repair(lane, branch, worktree, git, pr)
        if pr.get("isDraft") and lane.sh(["gh", "pr", "ready", str(pr["number"]), "--repo", binding.slug]).returncode:
            result.setdefault("reasons", []).append("pr-ready-failed")
        return result
    if git("rev-list", "--count", "origin/main..HEAD") in ("", "0"):
        return {"verdict": "no-change", "reasons": ["no-commits"]}
    push_with_retry(git, branch)
    created = lane.sh(["gh", "pr", "create", "--repo", binding.slug, "--base", "main", "--head", branch,
                       "--title", f"fix: {issue.title[:80]} ({issue.identifier})",
                       "--body", f"Refs {issue.identifier}.\n\n<!-- linear-issue-id:{issue.id} -->\n"
                                 f"<!-- linear-issue-identifier:{issue.identifier} -->\n\n"
                                 f"Lane implementation (binding {binding.key}); {binding.slug} required checks "
                                 "gate merge."])
    url = (created.stdout or "").strip().splitlines()[-1:] if created.returncode == 0 else []
    if not url:
        return {"verdict": "failed", "reasons": ["pr-create-failed"], "headSha": git("rev-parse", "HEAD")}
    match = re.fullmatch(rf"https://github\.com/{re.escape(binding.slug)}/pull/(\d+)", url[0])
    if not match:
        return {"verdict": "failed", "reasons": ["pr-create-readback-invalid"],
                "headSha": git("rev-parse", "HEAD")}
    return {"verdict": "pr-opened", "pr": int(match.group(1)), "prUrl": url[0],
            "headSha": git("rev-parse", "HEAD")}


def _publish_repair(lane, branch: str, worktree: Path, git, pr: dict) -> dict:
    head = git("rev-parse", "HEAD")
    if head == pr["headRefOid"]:
        return {"verdict": "no-change", "reasons": ["repair-made-no-commit"]}
    if lane.sh(["git", "merge-base", "--is-ancestor", pr["headRefOid"], head], cwd=worktree).returncode:
        return {"verdict": "failed", "reasons": ["repair-rewrote-history"]}
    git("push", "-q", "origin", f"HEAD:refs/heads/{branch}")
    return {"verdict": "pushed", "headSha": head}


def cleanup(lane, binding: Binding, worktree: Path, branch: str | None, receipt: dict) -> None:
    """Unpublished or uncommitted work is preserved; a clean, pushed checkout is removed."""
    if not worktree.exists():
        return
    if receipt.get("verdict") != "disk-held":
        lane.reap_run_processes(worktree, receipt)
    status = lane.sh(["git", "status", "--porcelain", *lane.disk_guard.SOURCE_PATHSPEC], cwd=worktree)
    unpushed = lane.sh(["git", "rev-list", "--count", "HEAD", "--not", "--remotes=origin"], cwd=worktree)
    # No agent ran in a setup failure, so the checkout holds no work worth preserving.
    if not setup_failed(receipt) and (
            receipt.get("verdict") == "disk-held" or status.returncode or status.stdout.strip()
            or unpushed.returncode or unpushed.stdout.strip() != "0"):
        lane.preserve_repair(worktree, receipt)
        return
    lane.sh(["git", "worktree", "remove", "--force", str(worktree)], cwd=binding.repo)
    if branch:
        lane.sh(["git", "branch", "-D", branch], cwd=binding.repo)


def finish_issue(lane, host, binding: Binding, name: str, linear, issue, receipt: dict) -> None:
    """Linear disposition per the binding contract: PR open -> In Review; else Todo/Backlog."""
    verdict = receipt.get("verdict")
    if verdict == "pr-opened":
        linear.move(issue.id, binding.review_state)
        linear.comment(issue.id, f"🤖 lane `{name}` opened PR {receipt.get('prUrl')}; "
                                 f"{binding.slug} required checks and merge queue land it.")
        return
    if verdict == "disk-held":
        linear.move(issue.id, "Todo")
        return
    if verdict == "not-shippable":
        linear.move(issue.id, "Backlog")
        linear.comment(issue.id, f"🤖 lane `{name}` judged this not code-shippable: {receipt['reasons'][0]}")
        return
    if verdict == "provider-error":
        lane.cool_down(host, name, lane.provider_exit(receipt.get("reasons")))
        linear.move(issue.id, "Todo")
        return
    claim = lane.Locked(host.state / "claim.lock", blocking=True)  # the lock the Jovie path writes under
    try:
        failures = lane.read_json(lane.failures_path(host))
        count = lane.failure_record(failures.get(issue.identifier))["count"] + 1
        failures[issue.identifier] = {"count": count, "at": time.time(), "release": lane.release_generation(),
                                      **lane.pr_events.failure_reason(receipt, count >= lane.MAX_FAILURES)}
        lane.failures_path(host).write_text(json.dumps(failures))
    finally:
        claim.release()
    exhausted = count >= lane.MAX_FAILURES
    linear.move(issue.id, "Todo")  # exhausted: parked until the next lanes release, no human
    linear.comment(issue.id, f"🤖 lane `{name}`: {verdict} ({', '.join(receipt.get('reasons', []))}). "
                             + (f"{lane.MAX_FAILURES} attempts on this release; parked until the next lanes release."
                                if exhausted else "Back to Todo."))
