"""Epics as units of work, and the expiring `hold` (Tim 2026-10-11: no issue waits forever).

An epic with no open child issues is a decomposition job: a lane reads the epic and the repo
and answers with a plan; the harness (never the agent) files the children in the epic's team
(Todo, parent = the epic, a Goal and a Definition of done each, no labels), comments a
summary and leaves the epic In Progress. An epic with open children is not decomposed: the
children drive the work. Once every child is terminal, the parent still owes its own
outcome receipt. Only the canonical validation lifecycle may write Done.

`reconcile` is the throttled, single-owner pass dispatch runs: it requests parent validation, moves
Todo epics whose children are open to In Progress, and expires `hold` labels on Todo issues
with no activity for HOLD_EXPIRY_S (one team-wide filtered read, no per-issue reads).
"""
from __future__ import annotations

import json
import hashlib
import os
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

EPIC_LABEL = "type:epic"
HOLD_LABEL = "hold"
HOLD_EXPIRY_S = 72 * 3600
MAX_CHILDREN = 12
PLAN_SCHEMA = "jovie.epic-plan/v1"
TERMINAL_TYPES = frozenset({"completed", "canceled"})
RECONCILE_INTERVAL_S = 900
RECONCILE_LIMIT = 10  # writes per kind per pass; the next pass takes the rest
# Verdicts after which the epic's Linear state is already settled by this module.
SETTLED_VERDICTS = frozenset({"decomposed", "epic-children-active", "epic-done", "epic-awaiting-validation"})

DETAIL_QUERY = ('query($id:String!){issue(id:$id){id identifier state{name type} team{id key states{nodes{id name type}}} '
                'comments(first:100){pageInfo{hasNextPage} nodes{body}} '
                'children(first:100){pageInfo{hasNextPage} nodes{id identifier title state{name type}}}}}')
CREATE_MUTATION = ('mutation($i:IssueCreateInput!){issueCreate(input:$i){success '
                   'issue{id identifier title parent{id} state{id}}}}')
EPICS_QUERY = (
    'query($teams:[String!]!){issues(first:50,filter:{team:{key:{in:$teams}},'
    'labels:{name:{eqIgnoreCase:"type:epic"}},state:{type:{in:["unstarted","started"]}}}){'
    'nodes{id identifier state{name type} children(first:50){pageInfo{hasNextPage} nodes{state{type}}}}}}')
HOLDS_QUERY = (
    'query($teams:[String!]!,$before:DateTimeOrDuration!){issues(first:50,filter:{team:{key:{in:$teams}},'
    'state:{name:{eq:"Todo"}},labels:{name:{eqIgnoreCase:"hold"}},updatedAt:{lt:$before}}){'
    'nodes{id identifier updatedAt labels{nodes{id name}}}}}')
REMOVE_LABEL = ('mutation($id:String!,$label:String!){issueRemoveLabel(id:$id,labelId:$label){success '
                'issue{labels{nodes{name}}}}}')
HOLD_EXPIRED_COMMENT = ("🤖 lanes removed `hold`: no activity on this issue for 72h, so it is back in the "
                        "work pool. To keep it held, re-add `hold` with a comment saying why.")


def is_epic(issue) -> bool:
    return EPIC_LABEL in {str(label).lower() for label in getattr(issue, "labels", ()) or ()}


def children_status(children: list[dict], complete: bool = True) -> str:
    """open | done | empty. `done` needs every child terminal and at least one completed.
    All-canceled (or none) is `empty`: the epic still needs real children."""
    types = [((child.get("state") or {}).get("type") or "") for child in children]
    if not complete or any(kind not in TERMINAL_TYPES for kind in types):
        return "open"
    return "done" if "completed" in types else "empty"


def _norm(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (title or "").lower()).strip()


# ---------------------------------------------------------------- decomposition

def render_prompt(issue, children: list[dict]) -> str:
    existing = [f"- {child['identifier']} {child.get('title') or ''} ({(child.get('state') or {}).get('name')})"
                for child in children] or ["- (none)"]
    example = json.dumps({"schema": PLAN_SCHEMA, "summary": "<2-4 sentences: the slices and their order>",
                          "children": [{"title": "<imperative, specific>", "goal": "<the outcome>",
                                        "definitionOfDone": ["<checkable line>", "<checkable line>"]}]})
    return "\n".join([
        f"# Decompose epic {issue.identifier}: {issue.title}", "",
        issue.description or "(no description)", "", "---",
        "## Existing child issues (never duplicate these)", *existing, "",
        "## Task",
        "You are planning, not implementing. Read the epic above and the repository checked out",
        f"in your working directory (origin/main). Split the epic into at most {MAX_CHILDREN} child",
        "issues in dependency order, each one PR-sized (<= 1500 changed lines) and shippable",
        "on its own by an unattended coding agent. Skip anything main already does or an",
        "existing child covers.",
        "- Do not edit files, commit, push, open PRs or call Linear: the harness files the issues.",
        "- You are unattended: never ask a question or wait for approval.",
        "- End your reply with exactly one fenced json block of this shape:",
        "```json", example, "```",
        "- If the epic is obsolete or already delivered, file no children and end with a line",
        "  `NOT-SHIPPABLE: <reason>` instead.",
    ])


def parse_plan(text: str) -> dict | None:
    """The last well-formed plan block in the agent's output, children capped at MAX_CHILDREN."""
    for block in reversed(re.findall(r"```json\s*(\{.*?\})\s*```", text or "", re.S)):
        try:
            plan = json.loads(block)
        except json.JSONDecodeError:
            continue
        if not isinstance(plan, dict) or plan.get("schema") != PLAN_SCHEMA:
            continue
        children = []
        for row in plan.get("children") or []:
            if not isinstance(row, dict):
                continue
            title, goal = str(row.get("title") or "").strip(), str(row.get("goal") or "").strip()
            done = row.get("definitionOfDone")
            done = [done] if isinstance(done, str) else done if isinstance(done, list) else []
            done = [str(line).strip() for line in done if str(line).strip()]
            if title and goal and done:
                children.append({"title": title[:200], "goal": goal[:4000], "done": done[:20]})
        return {"summary": str(plan.get("summary") or "").strip()[:2000], "children": children[:MAX_CHILDREN]}
    return None


def child_description(epic, child: dict, lane_name: str) -> str:
    return "\n".join(["## Goal", child["goal"], "", "## Definition of done",
                      *[f"- {line}" for line in child["done"]], "",
                      f"Part of epic {epic.identifier}; filed by the lane `{lane_name}` decomposition."])


def create_child(linear, detail: dict, epic, child: dict, lane_name: str, priority: int) -> dict:
    """issueCreate with readback: the created issue must be in Todo under this epic."""
    todo = next((state["id"] for state in detail["team"]["states"]["nodes"] if state["name"] == "Todo"), None)
    if todo is None:
        raise RuntimeError("linear: team has no Todo state")
    payload = {"teamId": detail["team"]["id"], "stateId": todo, "parentId": epic.id, "title": child["title"],
               "description": child_description(epic, child, lane_name)}
    if priority:
        payload["priority"] = priority
    data = linear.gql(CREATE_MUTATION, {"i": payload})
    created = (data.get("issueCreate") or {}) if isinstance(data, dict) else {}
    issue = created.get("issue") or {}
    if (created.get("success") is not True or (issue.get("parent") or {}).get("id") != epic.id
            or (issue.get("state") or {}).get("id") != todo or not issue.get("identifier")):
        raise RuntimeError("linear: child issue readback mismatch")
    return issue


def apply_plan(linear, detail: dict, epic, plan: dict, lane_name: str) -> list[dict]:
    """File the plan's children, skipping titles that already exist under the epic (rerun-safe)."""
    seen = {_norm(child.get("title") or "") for child in detail["children"]["nodes"]}
    created = []
    for child in plan["children"]:
        key = _norm(child["title"])
        if not key or key in seen:
            continue
        created.append(create_child(linear, detail, epic, child, lane_name, getattr(epic, "priority", 0) or 0))
        seen.add(key)
    return created


def plan_text(worktree: Path, log_path: Path) -> str:
    """Codex leaves its final message in the worktree; every provider's output is in the log."""
    parts = []
    for path in (log_path, worktree / ".codex-last-message.txt"):
        try:
            parts.append(path.read_text(errors="replace")[-60000:])
        except OSError:
            pass
    return "\n".join(parts)


def run_epic(lane, host, name: str, spec: dict, linear, issue, repo: Path) -> dict:
    """One epic unit of work for a lane that already moved the epic to In Progress."""
    run_id = f"{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-{issue.identifier}-{name}-{uuid.uuid4().hex[:6]}"
    runs = host.state / "runs"
    runs.mkdir(parents=True, exist_ok=True)
    receipt = {"schema": "jovie-lane-run/v1", "kind": "epic", "runId": run_id, "provider": name,
               "model": spec.get("model"), "issue": issue.identifier, "linearIssueId": issue.id,
               "origin": lane.AUTONOMOUS_ORIGIN, "startedAt": lane.now_iso()}
    worktree = host.state / "worktrees" / run_id
    try:
        detail = linear.gql(DETAIL_QUERY, {"id": issue.id})["issue"]
        children = detail["children"]["nodes"]
        status = children_status(children, complete=not detail["children"]["pageInfo"]["hasNextPage"])
        if status == "open":
            linear.comment(issue.id, "🤖 lanes: this epic has open child issues; they carry the work and "
                                     "the parent outcome still requires its own validation after delivery.")
            receipt.update(verdict="epic-children-active")
        elif status == "done":
            close_epic(linear, issue.id, children)
            receipt.update(verdict="epic-awaiting-validation")
        else:
            receipt.update(_decompose(lane, host, name, spec, linear, issue, repo, detail, run_id, worktree))
    except lane.DiskAdmissionError as error:
        receipt.update(verdict="disk-held", reasons=[str(error)])
    except Exception as error:  # a broken run still leaves a receipt and frees the epic
        receipt.update(verdict="failed", reasons=[f"epic-error:{type(error).__name__}:{error}"[:300]])
    finally:
        if worktree.exists():
            lane.sh(["git", "worktree", "remove", "--force", str(worktree)], cwd=repo)
    receipt["endedAt"] = lane.now_iso()
    with open(runs / "ledger.jsonl", "a") as ledger:
        ledger.write(json.dumps(receipt) + "\n")
    return receipt


def _decompose(lane, host, name, spec, linear, issue, repo, detail, run_id, worktree) -> dict:
    runs = host.state / "runs"
    log_path = runs / f"{run_id}.log"
    with open(log_path, "w") as log:
        lane.require_disk(host, "epic-checkout")
        lane.sh(["git", "fetch", "-q", "origin", "main"], cwd=repo, log=log)
        worktree.parent.mkdir(parents=True, exist_ok=True)
        if lane.sh(["git", "worktree", "add", "-q", "--detach", str(worktree), "origin/main"],
                   cwd=repo, log=log).returncode:
            raise RuntimeError("git-worktree-add-failed")
        prompt = render_prompt(issue, detail["children"]["nodes"])
        prompt_file = runs / f"{run_id}.prompt.md"
        prompt_file.write_text(prompt)
        agent = lane.run_agent(lane.template(spec["cmd"], {
            "prompt": prompt, "prompt_file": str(prompt_file), "cwd": str(worktree),
            "provider_receipt": str(runs / f"{run_id}.provider.jsonl"), "model": str(spec.get("model"))}),
            worktree, log, host.agent_timeout, guard=lambda: lane.require_disk(host, "epic-agent-running"))
    text = plan_text(worktree, log_path)
    plan = parse_plan(text)
    if plan is None or not plan["children"]:
        declined = lane.not_shippable_reason(text)
        if declined:
            return {"verdict": "not-shippable", "reasons": [declined]}
        if agent.returncode != 0:
            return {"verdict": "provider-error", "reasons": [f"agent-exit:{agent.returncode}"]}
        return {"verdict": "failed", "reasons": ["epic-plan-missing"]}
    created = []
    try:
        created = apply_plan(linear, detail, issue, plan, name)
    finally:
        if created:
            lines = "\n".join(f"- {row['identifier']} {row['title']}" for row in created)
            linear.comment(issue.id, f"🤖 lane `{name}` decomposed this epic into {len(created)} child "
                                     f"issue(s) in Todo:\n{lines}\n\n{plan['summary']}".strip())
    if not created:
        return {"verdict": "failed", "reasons": ["epic-plan-duplicates-existing-children"]}
    return {"verdict": "decomposed", "children": [row["identifier"] for row in created]}


def close_epic(linear, epic_id: str, children: list[dict]) -> bool:
    """Request parent validation once; child counts never certify the parent."""
    detail = linear.gql(DETAIL_QUERY, {"id": epic_id})["issue"]
    if (detail.get("state") or {}).get("name") in {"Done", "Canceled", "Merging", "Validating", "Rework"}:
        return False
    child_connection = detail.get("children") or {}
    comments = detail.get("comments") or {}
    if (child_connection.get("pageInfo", {}).get("hasNextPage") is not False
            or comments.get("pageInfo", {}).get("hasNextPage") is not False
            or not isinstance(comments.get("nodes"), list)):
        return False
    current = child_connection.get("nodes") or []
    if children_status(current) != "done":
        return False
    identity = sorted((str(child.get("id") or child.get("identifier") or ""),
                       (child.get("state") or {}).get("type")) for child in current)
    if any(not identifier for identifier, _ in identity):
        return False
    key = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()[:16]
    marker = f"<!-- parent-validation-required:v1 {key} -->"
    if any(marker in str(comment.get("body") or "") for comment in comments["nodes"]):
        return False
    linear.comment(epic_id, f"🤖 lanes: all {len(current)} child issues are closed. The parent outcome is "
                   "not certified by child completion. The canonical validation lifecycle (JOV-7694) "
                   "owns Done; its acceptance owner must record the parent's fresh outcome proof on "
                   "a verified production generation. State is unchanged until that proof arrives.\n\n" + marker)
    return True


# ---------------------------------------------------------------- reconcile pass

def reconcile_owner() -> str:
    return os.environ.get("LANES_RECONCILE_OWNER", "gem").split(".")[0]


def reconcile(lane, host, linear_factory, teams: list[str], now: float | None = None) -> dict:
    """Throttled to RECONCILE_INTERVAL_S and run by one host (LANES_RECONCILE_OWNER)."""
    now = time.time() if now is None else now
    if lane.HOST != reconcile_owner():
        return {"status": "not-owner", "owner": reconcile_owner()}
    path = host.state / "issue-reconcile.json"
    last = lane.read_json(path)
    if now - float(last.get("at") or 0) < RECONCILE_INTERVAL_S:
        return {"status": "throttled", "last": last.get("result")}
    linear = linear_factory()
    result = {"epicsDone": [], "epicsAwaitingValidation": [], "epicsStarted": [], "holdsExpired": []}
    try:
        epics = linear.gql(EPICS_QUERY, {"teams": teams})["issues"]["nodes"]
        for epic in epics:
            children = epic["children"]["nodes"]
            status = children_status(children, complete=not epic["children"]["pageInfo"]["hasNextPage"])
            if status == "done" and len(result["epicsAwaitingValidation"]) < RECONCILE_LIMIT:
                if close_epic(linear, epic["id"], children):
                    result["epicsAwaitingValidation"].append(epic["identifier"])
            elif (status == "open" and epic["state"]["name"] == "Todo"
                  and len(result["epicsStarted"]) < RECONCILE_LIMIT):
                linear.move(epic["id"], "In Progress")
                linear.comment(epic["id"], "🤖 lanes: open child issues carry this epic's work; In Progress "
                                           "until they are done.")
                result["epicsStarted"].append(epic["identifier"])
        before = datetime.fromtimestamp(now - HOLD_EXPIRY_S, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        for issue in linear.gql(HOLDS_QUERY, {"teams": teams, "before": before})["issues"]["nodes"][:RECONCILE_LIMIT]:
            if expire_hold(linear, issue):
                result["holdsExpired"].append(issue["identifier"])
        status = "ok"
    except lane.LinearRateLimited as error:
        status = "linear-rate-limited"
        result["resetAt"] = error.reset_at
    lane.update_json(path, lambda data: (data.clear(), data.update(at=now, result={**result, "status": status})))
    return {**result, "status": status}


def expire_hold(linear, issue: dict) -> bool:
    """Remove every `hold` label (any case), verified by the mutation's own readback, then say why."""
    labels = [label for label in issue["labels"]["nodes"] if label["name"].lower() == HOLD_LABEL]
    remaining = None
    for label in labels:
        data = linear.gql(REMOVE_LABEL, {"id": issue["id"], "label": label["id"]})["issueRemoveLabel"]
        if data.get("success") is not True:
            return False
        remaining = [row["name"].lower() for row in data["issue"]["labels"]["nodes"]]
    if remaining is None or HOLD_LABEL in remaining:
        return False
    linear.comment(issue["id"], HOLD_EXPIRED_COMMENT)
    return True
