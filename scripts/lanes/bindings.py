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
binding state holds Jovie. A binding's own open-PR budget (`maxOpenPrs`) limits only new
issue intake, never repair of its existing PRs; a per-PR lease keeps two seats off one PR. Linear and GitHub reads go through lane_runner.shared(), on the
same TTLs as the Jovie claim scan. The binding's own CI is the gate: the harness opens a
ready PR and moves the issue to In Review; the repo's required checks and native merge queue
land it. It never runs Jovie's gate against another repo.
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
TODO_QUERY = (
    'query($team:String!,$labels:[String!]!,$after:String){issues(first:100,after:$after,'
    'filter:{team:{key:{eq:$team}},state:{name:{eq:"Todo"}},labels:{name:{in:$labels}}}){'
    'pageInfo{hasNextPage endCursor} '
    'nodes{id identifier title description priority createdAt labels{nodes{name}}}}}')
# Tim 2026-10-11: any issue is eligible. A binding with no required labels scans every Todo issue.
TODO_ALL_QUERY = (
    'query($team:String!,$after:String){issues(first:100,after:$after,'
    'filter:{team:{key:{eq:$team}},state:{name:{eq:"Todo"}}}){'
    'pageInfo{hasNextPage endCursor} '
    'nodes{id identifier title description priority createdAt labels{nodes{name}}}}}')
LIGHT_FIELDS = "number,title,url,isDraft,headRefName,headRefOid,mergeStateStatus"
REPAIR_STATES = frozenset({"BEHIND", "DIRTY"})


@dataclass(frozen=True)
class Binding:
    key: str                      # Linear team key, also the identifier prefix
    repo: Path                    # local checkout the worktrees come from
    slug: str                     # GitHub owner/repo the PRs target
    labels: tuple[str, ...]       # every one is required for admission; empty = any Todo issue
    gate: str                     # "lane-gate" (Jovie) | "github-required-checks"
    excluded: tuple[str, ...] = ()
    concurrency: int | None = None  # None: only the host's provider seats limit it
    max_open_prs: int = 3
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
            max(1, int(row.get("maxOpenPrs", 3))), tuple(row.get("providers") or ()),
            tuple(row.get("install") or ()), str(row.get("reviewState") or "In Review")))
    return active


def team_of(identifier: str) -> str:
    return (identifier or "").split("-", 1)[0].upper()


# ---------------------------------------------------------------- cached reads

def todo_issues(lane, linear, binding: Binding) -> list:
    """Todo issues carrying any required label (every Todo issue when none is required),
    one cached Linear read per host per TTL."""
    def fetch():
        nodes = (linear._bounded_lane_nodes(TODO_QUERY, {"team": binding.key, "labels": list(binding.labels)})
                 if binding.labels else linear._bounded_lane_nodes(TODO_ALL_QUERY, {"team": binding.key}))
        return [{"id": n["id"], "identifier": n["identifier"], "title": n.get("title") or "",
                 "description": n.get("description") or "", "priority": n.get("priority") or 0,
                 "created_at": n.get("createdAt") or "",
                 "labels": sorted(label["name"] for label in (n.get("labels") or {}).get("nodes") or [])}
                for n in nodes]
    scope = lane._linear_scope_id(linear.key)
    catalog = lane._cache_token(",".join(binding.labels) or "*")
    rows = lane.shared(f"binding-todo-v2-{binding.key}-{catalog}-{lane._cache_token(scope)}",
                       lane.CLAIM_SCAN_TTL_S, fetch)
    if rows is None:
        raise lane.LaneInventoryUnknown("binding-inventory-unavailable")
    return [lane.Issue(r["id"], r["identifier"], r["title"], r["description"], r["priority"],
                       r["created_at"], list(r["labels"])) for r in rows]


def open_prs(lane, binding: Binding) -> list[dict] | None:
    """Every open PR in the binding's repo; lane-branch PRs also carry their check rollup.
    One cached fill per host per TTL, keyed per repo. None when GitHub cannot be read."""
    pattern = binding.branch_pattern()

    def fetch():
        listed = lane.sh(["gh", "pr", "list", "--repo", binding.slug, "--state", "open",
                          "--limit", "200", "--json", LIGHT_FIELDS])
        if listed.returncode:
            return None
        prs = json.loads(listed.stdout or "[]")
        for pr in prs:
            if pattern.match(pr.get("headRefName") or ""):
                viewed = lane.sh(["gh", "pr", "view", str(pr["number"]), "--repo", binding.slug,
                                  "--json", "statusCheckRollup"])
                if viewed.returncode:
                    return None
                pr["statusCheckRollup"] = json.loads(viewed.stdout or "{}").get("statusCheckRollup") or []
        return prs
    return lane.shared(f"binding-open-prs-v1-{lane._cache_token(binding.slug)}", lane.SUMMARY_TTL_S, fetch)


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
    return any((check.get("conclusion") or check.get("state") or "").upper() in lane.RED
               for check in pr.get("statusCheckRollup") or [])


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
    if record["count"] >= lane.MAX_FAILURES:
        return f"{binding.key}:retry-exhausted"
    if now - record["at"] < lane.RETRY_BACKOFF_S:
        return f"{binding.key}:retry-backoff"
    if issue.identifier.upper() in flying:
        return f"{binding.key}:in-flight-pr"
    return None


def intake_refusal(binding: Binding, prs: list[dict], running: int = 0) -> str | None:
    """The binding's own new-intake budget: open lane PRs, whatever their check state, plus
    issue runs still working toward a PR. It never limits repair of existing PRs."""
    count = len(lane_owned(binding, prs)) + running
    return f"{binding.key}:intake-budget:{count}/{binding.max_open_prs}" if count >= binding.max_open_prs else None


def running_issue_runs(lane, host, binding: Binding) -> int:
    """Issue runs of this binding still in progress on this host (their lease is held)."""
    count = 0
    for path in sorted((host.state / "bindings" / binding.key).glob("issue.*.lock")):
        probe = lane.Locked(path, blocking=False)
        free = probe.held
        probe.release()
        if free:
            try:
                path.unlink()
            except OSError:
                pass
        else:
            count += 1
    return count


def repair_candidate(lane, binding: Binding, prs: list[dict], attempts: dict, busy=lambda pr: False) -> dict | None:
    """The oldest lane PR that is red or behind/conflicting at a head not yet tried twice
    and not under repair in another seat (`busy`)."""
    for pr in sorted(lane_owned(binding, prs, lane.load_providers()), key=lambda row: row["number"]):
        if not (is_red(lane, pr) or pr.get("mergeStateStatus") in REPAIR_STATES):
            continue
        if attempts.get(f"{binding.key}#{pr['number']}:{pr['headRefOid']}", 0) < lane.MAX_FIX_ATTEMPTS \
                and not busy(pr):
            return pr
    return None


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
        attempts_path = host.state / "bindings" / binding.key / "fix-attempts.json"
        attempts = lane.read_json(attempts_path)
        pr = repair_candidate(lane, binding, prs, attempts, busy)
        lease = leases.pop(pr["number"], None) if pr is not None else None
        for other in leases.values():
            other.release()
        if pr is not None:
            key = f"{binding.key}#{pr['number']}:{pr['headRefOid']}"
            lane.update_json(attempts_path, lambda data: data.update({key: data.get(key, 0) + 1}))
            record_status(lane, host, binding, worker=name, outcome="repair", pr=pr["number"])
        elif not maintenance_only:
            budget = intake_refusal(binding, prs, running_issue_runs(lane, host, binding))
            linear = lane.Linear(host.linear_env)
            pool = todo_issues(lane, linear, binding)
            failures = lane.read_json(lane.failures_path(host))
            now, flying = time.time(), in_flight(binding, prs)
            refused = {item.identifier: refusal(lane, binding, item, failures, now, flying, name) for item in pool}
            eligible = sorted((item for item in pool if refused[item.identifier] is None),
                              key=lambda item: lane.admission_order(item, now))
            if eligible and budget is None and linear.state_of(eligible[0].id) == "Todo":
                issue = eligible[0]
                lease = lane.Locked(host.state / "bindings" / binding.key / f"issue.{issue.identifier}.lock",
                                    blocking=False)
                linear.move(issue.id, "In Progress")
            outcome = budget or ("claimed" if issue else "claim-raced" if eligible else "none-eligible")
            record_status(lane, host, binding, worker=name, outcome=outcome, pool=len(pool),
                          eligible=len(eligible), claimed=issue.identifier if issue else None,
                          refusals={key: value for key, value in refused.items() if value})
    finally:
        claim.release()
    if pr is not None:
        try:
            receipt = run(lane, host, binding, name, spec, pr=pr)
        finally:
            lease.release()
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
        return "\n".join([
            f"# Repair PR #{pr['number']} in {binding.slug}: {pr.get('title') or ''}", "",
            f"Branch `{branch}` at {pr['headRefOid']} is checked out. Merge state: "
            f"{pr.get('mergeStateStatus') or 'unknown'}. Failing checks: {', '.join(failing) or 'none'}.", "",
            "## Contract",
            "- Merge origin/main into this branch first (no rebase), resolving conflicts.",
            "- Then fix what the failing checks report. Read their logs with `gh run view --log-failed`.",
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
               "worktree": str(worktree), "origin": lane.AUTONOMOUS_ORIGIN, "startedAt": lane.now_iso(),
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
                git("fetch", "-q", "origin", "main", branch, cwd=binding.repo)
                git("worktree", "add", "-q", "--detach", str(worktree), pr["headRefOid"], cwd=binding.repo)
            else:
                git("fetch", "-q", "origin", "main", cwd=binding.repo)
                git("worktree", "add", "-q", "-b", branch, str(worktree), "origin/main", cwd=binding.repo)
            if binding.install and lane.sh(list(binding.install), cwd=worktree, timeout=1800, log=log).returncode:
                raise RuntimeError("install-failed")
            prompt = render_prompt(binding, branch, issue=issue, pr=pr,
                                   context=lane.context_pack(issue) if issue is not None else "",
                                   goal=lane.goal_contract(issue) if issue is not None else ())
            prompt_file = runs / f"{run_id}.prompt.md"
            prompt_file.write_text(prompt)
            started = time.time()
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
    git("push", "-q", "-u", "origin", branch)
    created = lane.sh(["gh", "pr", "create", "--repo", binding.slug, "--base", "main", "--head", branch,
                       "--title", f"fix: {issue.title[:80]} ({issue.identifier})",
                       "--body", f"Refs {issue.identifier}.\n\n<!-- linear-issue-id:{issue.id} -->\n"
                                 f"<!-- linear-issue-identifier:{issue.identifier} -->\n\n"
                                 f"Lane implementation (binding {binding.key}); {binding.slug} required checks "
                                 "gate merge."])
    url = (created.stdout or "").strip().splitlines()[-1:] if created.returncode == 0 else []
    if not url:
        return {"verdict": "failed", "reasons": ["pr-create-failed"], "headSha": git("rev-parse", "HEAD")}
    return {"verdict": "pr-opened", "prUrl": url[0], "headSha": git("rev-parse", "HEAD")}


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
    status = lane.sh(["git", "status", "--porcelain", *lane.disk_guard.SOURCE_PATHSPEC], cwd=worktree)
    unpushed = lane.sh(["git", "rev-list", "--count", "HEAD", "--not", "--remotes=origin"], cwd=worktree)
    if (receipt.get("verdict") == "disk-held" or status.returncode or status.stdout.strip()
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
        lane.cool_down(host, name)
        linear.move(issue.id, "Todo")
        return
    claim = lane.Locked(host.state / "claim.lock", blocking=True)  # the lock the Jovie path writes under
    try:
        failures = lane.read_json(lane.failures_path(host))
        count = lane.failure_record(failures.get(issue.identifier))["count"] + 1
        failures[issue.identifier] = {"count": count, "at": time.time(),
                                      **lane.pr_events.failure_reason(receipt, count >= lane.MAX_FAILURES)}
        lane.failures_path(host).write_text(json.dumps(failures))
    finally:
        claim.release()
    exhausted = count >= lane.MAX_FAILURES
    linear.move(issue.id, "Backlog" if exhausted else "Todo")
    linear.comment(issue.id, f"🤖 lane `{name}`: {verdict} ({', '.join(receipt.get('reasons', []))}). "
                             + ("Terminal after 3 attempts; needs a human decision." if exhausted else "Back to Todo."))
