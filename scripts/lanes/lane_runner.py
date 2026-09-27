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
import doctor  # noqa: E402  (sibling module of the release)
import execution_attempt  # noqa: E402
import pr_events  # noqa: E402
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
EXCLUDED_LABELS = frozenset({"no-symphony", *SENSITIVE_LABELS, "type:epic", "codex-blocked"})
HARD_EXCLUDED_LABELS = frozenset({"no-symphony", "type:epic", "codex-blocked"})
SENSITIVE_PROVIDER = "codex"
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
LANE_TESTS = ["scripts/tests/test_execution_attempt.py", "scripts/tests/test_lane_runner.py", "scripts/tests/test_codex_lane.py", "scripts/tests/test_hud.py",
              "scripts/tests/test_doctor.py", "scripts/tests/test_pr_events.py"]
LANE_BRANCH = re.compile(r"^(?P<lane>[a-z0-9-]+)/(?P<issue>jov-\d+)-\d{8}")
RED = frozenset({"FAILURE", "TIMED_OUT", "STARTUP_FAILURE"})
RETRY_BACKOFF_S = 1800
# JOV-6833: a lane may hold this many open non-green PRs per slot before it stops claiming
# new issues and only fixes/adopts what it already opened.
OPEN_PRS_PER_SLOT = 2
STALE_DRAFT_S = 24 * 3600
SWEEP_EVERY_S = 1800
PROVIDER_COOLDOWN_S = 900
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


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


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
    return SENSITIVE_RED_LINES.search(f"{issue.title}\n{issue.description}") is not None


def pick_issue(issues: list[Issue], failures: dict, now: float | None = None,
               in_flight: frozenset[str] = frozenset(), provider: str | None = None) -> Issue | None:
    """Symphony orders by aged priority then age, while preserving urgent-first admission.

    Waiting work gains one priority level per day until it reaches P1, preventing a
    sustained stream of newer urgent work from starving older work. Excluded work,
    3x failures, retry backoff, and issues with an open lane PR remain ineligible.
    """
    now = time.time() if now is None else now
    in_flight = {identifier.lower() for identifier in in_flight}

    def retryable(identifier: str) -> bool:
        record = failure_record(failures.get(identifier))
        return record["count"] < MAX_FAILURES and now - record["at"] >= RETRY_BACKOFF_S

    def admitted(issue: Issue) -> bool:
        labels = {label.lower() for label in issue.labels}
        if HARD_EXCLUDED_LABELS & labels or issue_hits_red_line(issue):
            return False
        if SENSITIVE_LABELS & labels and provider != SENSITIVE_PROVIDER:
            return False
        return retryable(issue.identifier) and issue.identifier.lower() not in in_flight

    eligible = [issue for issue in issues if admitted(issue)]

    def admission_order(issue: Issue) -> tuple[int, float]:
        created_at = created_at_epoch(issue.created_at)
        base_priority = issue.priority or 5
        waited = max(0, now - created_at) if created_at is not None else 0
        effective_priority = max(1, base_priority - int(waited // PRIORITY_AGING_S))
        return effective_priority, created_at if created_at is not None else float("inf")

    eligible.sort(key=admission_order)
    return eligible[0] if eligible else None


# ---------------------------------------------------------------- prompt

def render_prompt(issue: Issue, branch: str, context_pack: str) -> str:
    sensitive_contract = []
    if issue_is_sensitive(issue):
        sensitive_contract = [
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
        "- Run the narrow relevant checks (biome on changed files, the related tests).",
        "- Commit with commitlint style (lowercase subject, header <= 100 chars). Never use",
        "  --no-verify or weaken a check.",
        f"- Push `{branch}` and open ONE draft PR against main whose title contains {issue.identifier}.",
        "  Do not mark it ready or merge it: an independent gate does that after verifying.",
        "- If the issue is not code-shippable or already fixed, open no PR and end with a",
        "  line `NOT-SHIPPABLE: <reason>`.",
        "- You are unattended: nobody will answer a question. Never stop to ask; choose the",
        "  non-interactive path. Do not run gstack or other skill workflows (ship, review, qa,",
        "  upgrade) and do not upgrade any tooling: commit with git and open the PR with",
        "  `gh pr create --draft`.",
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
    return text[:4000]


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


def sensitive_review(host: Host, pr: dict, worktree: Path, log) -> tuple[bool, list[str]]:
    """Run an independent max-effort Codex review; an ambiguous response fails closed."""
    review_prompt = host.state / "runs" / f"PR{pr['number']}-{pr['headRefOid'][:12]}-llm-review.md"
    review_prompt.parent.mkdir(parents=True, exist_ok=True)
    review_prompt.write_text("\n".join([
        f"Independently review sensitive-surface PR #{pr['number']} at {pr['headRefOid']}.",
        "Review only; do not edit, commit, push, comment, or mutate external state.",
        "Inspect `git diff origin/main...HEAD` for security, auth/billing/infra boundary failures,",
        "migration safety, missing failure-path tests, and unintended scope. Existing deterministic",
        "gates run separately. End with exactly `LLM-REVIEW: PASS` only if no blocking finding exists;",
        "otherwise end with `LLM-REVIEW: FAIL — <concise blocking findings>`.",
    ]))
    last = worktree / ".codex-last-message.txt"
    last.unlink(missing_ok=True)
    command = [sys.executable, str(HERE / "codex_lane.py"), "run", "--prompt-file", str(review_prompt),
               "--cwd", str(worktree), "--reasoning-effort", "xhigh"]
    try:
        ran = sh(command, cwd=worktree, timeout=host.gate_timeout, log=log, stream=True)
    except subprocess.TimeoutExpired:
        return False, ["llm-review-timeout"]
    verdict = last.read_text(errors="replace").strip() if last.exists() else ""
    if ran.returncode == 0 and verdict.endswith("LLM-REVIEW: PASS"):
        return True, []
    detail = verdict[-1000:] if verdict else f"reviewer-exit:{ran.returncode}"
    return False, [f"llm-review-failed:{detail}"]


# ---------------------------------------------------------------- plumbing

def sh(args: list[str], cwd: Path | None = None, timeout: int = 600, env=None, log=None, stream=False):
    """Run and record. `stream=True` writes output to the log as it happens, so a timeout
    shows where the command was, instead of losing everything it printed."""
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
        """Todo issues carrying the lane's own label or the shared pool label."""
        data = self.gql(
            'query($labels:[String!]!){issues(first:100,filter:{team:{key:{eq:"JOV"}},state:{name:{eq:"Todo"}},'
            'labels:{name:{in:$labels}}}){nodes{id identifier title description priority createdAt '
            'labels{nodes{name}}}}}', {"labels": [label, SHARED_LABEL]})
        return [Issue(n["id"], n["identifier"], n["title"], n.get("description") or "", n.get("priority") or 0,
                      n["createdAt"], [l["name"] for l in n["labels"]["nodes"]])
                for n in data["issues"]["nodes"]]

    def create_triage(self, title: str, description: str) -> str | None:
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
        self.gql('mutation($id:String!,$b:String!){commentCreate(input:{issueId:$id,body:$b}){success}}',
                 {"id": issue_id, "b": body})


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


def run_agent(cmd: list[str], cwd: Path, log, timeout: int) -> subprocess.CompletedProcess:
    """The provider and every child it spawns live in one process group, so a timeout kills
    all of them instead of leaving an agent editing a worktree the runner already gave up on."""
    import signal
    proc = subprocess.Popen(cmd, cwd=cwd, stdout=log, stderr=subprocess.STDOUT, text=True, start_new_session=True)
    try:
        code = proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        for sig, grace in ((signal.SIGTERM, 15), (signal.SIGKILL, 5)):
            try:
                os.killpg(proc.pid, sig)
            except ProcessLookupError:
                break
            try:
                proc.wait(timeout=grace)
                break
            except subprocess.TimeoutExpired:
                continue
        raise subprocess.TimeoutExpired(cmd, timeout)
    return subprocess.CompletedProcess(cmd, code)


# ---------------------------------------------------------------- one run

def run_issue(host: Host, name: str, spec: dict, linear: Linear, issue: Issue) -> dict:
    run_id = f"{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-{issue.identifier}-{name}-{uuid.uuid4().hex[:6]}"
    runs = host.state / "runs"
    runs.mkdir(parents=True, exist_ok=True)
    receipt = {"schema": "jovie-lane-run/v1", "runId": run_id, "provider": name, "model": spec.get("model"),
               "issue": issue.identifier, "startedAt": now_iso()}
    ident = execution_attempt.identity("linear-work", {"issue": issue.identifier, "outcome": "draft-pr"},
                                       {"title": issue.title, "description": issue.description})
    policy = {"attempts": MAX_FAILURES, "concurrency": 1, "wallSeconds": host.agent_timeout * MAX_FAILURES,
              "spend": MAX_FAILURES, "mutations": MAX_FAILURES,
              "leaseSeconds": host.agent_timeout + 900, "version": "lanes-v1"}
    claimed = execution_attempt.claim(runs / "execution-attempts.jsonl", ident,
                                      {"owner": HOST, "runtime": "symphony-lanes", "provider": name,
                                       "model": spec.get("model"), "tool": "lane_runner", "accountPool": name},
                                      policy, {"triggerId": run_id, "correlationId": issue.identifier,
                                               "causationId": issue.id})
    receipt["execution"] = claimed
    if not claimed["admitted"]:
        receipt.update(verdict="duplicate-active" if claimed["reason"] == "duplicate_active" else "quarantined",
                       reasons=[claimed["reason"]], endedAt=now_iso())
        return receipt
    branch = f"{name}/{issue.identifier.lower()}-{run_id[:15].lower()}"
    worktree = host.state / "worktrees" / run_id
    with open(runs / f"{run_id}.log", "w") as log:
        try:
            sh(["git", "fetch", "-q", "origin", "main"], cwd=host.repo, log=log)
            sh(["git", "worktree", "add", "-q", "-b", branch, str(worktree), "origin/main"], cwd=host.repo, log=log)
            # Always installed: the gate's checks need it even when the provider works remotely.
            sh(["pnpm", "install", "--frozen-lockfile", "--prefer-offline"], cwd=worktree, timeout=1800, log=log)
            prompt = render_prompt(issue, branch, context_pack(issue))
            prompt_file = runs / f"{run_id}.prompt.md"
            prompt_file.write_text(prompt)
            started = time.time()
            execution_attempt.boundary(runs / "execution-attempts.jsonl", ident, claimed["fencingToken"],
                                       {"spend": 1, "mutations": 1})
            agent = run_agent(template(spec["cmd"], {"prompt": prompt, "prompt_file": str(prompt_file), "cwd": str(worktree)}),
                              worktree, log, host.agent_timeout)
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
        except subprocess.TimeoutExpired as error:
            receipt.update(verdict="failed", reasons=[f"timeout:{error.cmd[0] if error.cmd else '?'}"])
        except Exception as error:  # a broken run must still leave a receipt and free its issue
            receipt.update(verdict="failed", reasons=[f"harness-error:{type(error).__name__}:{error}"[:300]])
        finally:
            sh(["git", "worktree", "remove", "--force", str(worktree)], cwd=host.repo)
            sh(["git", "branch", "-D", branch], cwd=host.repo)
    receipt["endedAt"] = now_iso()
    verdict = receipt.get("verdict")
    result = "succeeded" if verdict in ("landing", "verified-not-queued", "held", "gate-timeout") \
        else "no_op_stale" if verdict in ("no-change", "not-shippable") else "failed_unknown"
    receipt["execution"] = execution_attempt.finish(
        runs / "execution-attempts.jsonl", ident, claimed["fencingToken"], result,
        {"failureClass": None if result != "failed_unknown" else "unknown_runtime_result",
         "failureFingerprint": None if result != "failed_unknown" else ":".join(receipt.get("reasons", [verdict])),
         "evidenceDigest": execution_attempt.digest(receipt.get("reasons", [])),
         "costs": {"apiCalls": 1}, "mutationsPerformed": receipt.get("pr") and ["pull_request"] or [],
         "confidence": "high" if result == "succeeded" else "unknown", "dependencies": [name]})
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
        sh(["git", "push", "-q", "-u", "origin", branch], cwd=worktree, log=log)
        sh(["gh", "pr", "create", "--repo", REPO_SLUG, "--draft", "--head", branch,
            "--title", f"fix: {issue.title[:80]} ({issue.identifier})",
            "--body", f"Lane run for {issue.identifier}. Verification by the lane gate."], cwd=worktree, log=log)
        return verify_and_land(host, issue, branch, worktree, log, started, opened=True, sensitive=sensitive)
    pr = max(prs, key=lambda item: item["createdAt"])
    if sensitive:
        sh(["gh", "label", "create", SENSITIVE_PR_LABEL, "--repo", REPO_SLUG, "--force",
            "--color", "B60205", "--description", "Guarded auth/billing/infra lane policy"], log=log)
        sh(["gh", "pr", "edit", str(pr["number"]), "--repo", REPO_SLUG,
            "--add-label", SENSITIVE_PR_LABEL], log=log)
    return gate_pr(host, pr, worktree, log, sensitive=sensitive)


def gate_slot(host: Host) -> Locked:
    """One of `gate_slots` host-wide gate seats; waits (polling) until one is free."""
    while True:
        for index in range(host.gate_slots):
            lock = Locked(host.state / "slots" / f"gate.{index}.lock", blocking=False)
            if lock.held:
                return lock
            lock.release()
        time.sleep(15)


def gate_timeouts(host: Host, pr: dict, change: int = 0) -> int:
    """Consecutive gate timeouts for this PR head; a new head resets the count."""
    path = host.state / "gate-timeouts.json"
    data = json.loads(path.read_text()) if path.exists() else {}
    entry = data.get(str(pr["number"]), {})
    count = (entry.get("count", 0) if entry.get("sha") == pr["headRefOid"] else 0) + change
    if change:
        data[str(pr["number"])] = {"sha": pr["headRefOid"], "count": count}
        path.write_text(json.dumps(data))
    return count


def gate_pr(host: Host, pr: dict, worktree: Path, log, sensitive: bool = False) -> dict:
    """The independent gate for one PR head: diff rules, the canonical repo gate, then land."""
    sh(["git", "fetch", "-q", "origin", f"pull/{pr['number']}/head"], cwd=worktree, log=log)
    sh(["git", "checkout", "-q", "--detach", pr["headRefOid"]], cwd=worktree, log=log)
    numstat = sh(["git", "diff", "--numstat", "origin/main...HEAD"], cwd=worktree).stdout
    changes = parse_numstat(numstat)
    reasons = gate_rules(changes, SENSITIVE_REVIEWABLE_LINES if sensitive else MAX_REVIEWABLE_LINES)
    evidence = []
    result = {"pr": pr["number"], "prUrl": pr.get("url"), "headSha": pr["headRefOid"],
              "changedFiles": len(changes), "reasons": reasons}
    if not reasons:
        commands = check_commands([change.path for change in changes])
        seat = gate_slot(host) if commands else None
        try:
            for command in commands:
                try:
                    ran = sh(command, cwd=worktree, timeout=host.gate_timeout, log=log, stream=True)
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
                passed, review_reasons = sensitive_review(host, pr, worktree, log)
                if not passed:
                    reasons.extend(review_reasons)
        finally:
            if seat is not None:
                seat.release()
        result["reasons"] = reasons
    if reasons:
        sh(["gh", "pr", "comment", str(pr["number"]), "--repo", REPO_SLUG, "--body",
            "Lane gate held this PR (it stays draft):\n" + "\n".join(f"- `{r}`" for r in reasons)], log=log)
        record_held(host, pr["number"], pr["headRefOid"], reasons + evidence)
        return {**result, "verdict": "held"}
    sh(["gh", "pr", "ready", str(pr["number"]), "--repo", REPO_SLUG], log=log)
    queued = sh(["gh", "pr", "merge", str(pr["number"]), "--repo", REPO_SLUG, "--auto"], log=log)
    if queued.returncode != 0:
        # Verified heads are never re-gated, so a failed enqueue (e.g. a GraphQL rate limit)
        # would strand a green PR; each worker pass retries it via requeue_verified.
        update_json(host.state / "requeue.json", lambda requeue: requeue.update({str(pr["number"]): pr["headRefOid"]}))
    return {**result, "verdict": "landing" if queued.returncode == 0 else "verified-not-queued"}


def update_json(path: Path, change) -> None:
    data = json.loads(path.read_text()) if path.exists() else {}
    change(data)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data))


def requeue_verified(host: Host, prs: list[dict]) -> None:
    """Retry enqueueing gate-verified PRs whose enqueue failed; drop them once queued or moved."""
    path = host.state / "requeue.json"
    if not path.exists():
        return
    heads = {str(pr["number"]): pr["headRefOid"] for pr in prs}
    def retry(requeue: dict) -> None:
        for number, head in list(requeue.items()):
            if heads.get(number) != head:
                del requeue[number]  # merged, closed, or a new head that the gate owns again
                continue
            sh(["gh", "pr", "ready", number, "--repo", REPO_SLUG])
            if sh(["gh", "pr", "merge", number, "--repo", REPO_SLUG, "--auto"]).returncode == 0:
                del requeue[number]
    update_json(path, retry)


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
    held = json.loads(path.read_text()) if path.exists() else {}
    held[str(number)] = pr_events.held_record(head, evidence)
    path.write_text(json.dumps(held))


def red_pr(prs: list[dict], attempts: dict, held: dict | None = None) -> dict | None:
    """A lane PR that is stuck at a head we have not tried twice: checks settled red, or
    merge conflicts with main (GitHub drops auto-merge on those, so nothing else frees them)."""
    for pr in sorted(best_per_issue(prs), key=lambda item: item["number"]):
        checks = pr.get("statusCheckRollup") or []
        conflicted = pr.get("mergeStateStatus") == "DIRTY"
        gate_held = (held or {}).get(str(pr["number"]), {}).get("sha") == pr["headRefOid"]
        reviewed = pr.get("reviewDecision") == "CHANGES_REQUESTED"
        if not conflicted and not gate_held and not reviewed:
            if any(check.get("status") in ("IN_PROGRESS", "QUEUED", "PENDING") for check in checks):
                continue
            if not any(check.get("conclusion") in RED for check in checks):
                continue
        record = attempts.get(str(pr["number"]), {})
        if pr_events.in_flight(record, pr, time.time()) or record.get("count", 0) >= MAX_FIX_ATTEMPTS:
            continue
        return pr
    return None


def exhausted_prs(prs: list[dict], attempts: dict) -> list[dict]:
    """Heads the fix loop tried MAX_FIX_ATTEMPTS times and that are still stuck, not yet escalated."""
    stuck = []
    for pr in prs:
        record = attempts.get(str(pr["number"]), {})
        # Spent attempts are terminal for the PR (red_pr never retries it), so a head the last
        # fix pushed that is still stuck escalates too instead of waiting silently.
        if record.get("count", 0) >= MAX_FIX_ATTEMPTS and not record.get("escalated"):
            checks = pr.get("statusCheckRollup") or []
            if pr.get("mergeStateStatus") == "DIRTY" or pr.get("reviewDecision") == "CHANGES_REQUESTED" \
                    or any(check.get("conclusion") in RED for check in checks):
                stuck.append(pr)
    return stuck


def escalate_exhausted(host: Host, prs: list[dict], linear) -> None:
    """Bug intake, never Tim: comment on the PR, open a Linear Triage issue once, mark it escalated."""
    path = host.state / "fix-attempts.json"
    attempts = json.loads(path.read_text()) if path.exists() else {}
    for pr in exhausted_prs(prs, attempts):
        body = (f"🤖 lanes: {MAX_FIX_ATTEMPTS} fix attempts on head `{pr['headRefOid'][:7]}` did not make this PR green "
                f"(merge state {pr.get('mergeStateStatus')}, review {pr.get('reviewDecision') or 'none'}). "
                "Filed through bug intake (Linear Triage); the lanes stop here.")
        sh(["gh", "pr", "comment", str(pr["number"]), "--repo", REPO_SLUG, "--body", body])
        record = attempts.get(str(pr["number"]), {})
        try:
            linear.create_triage(f"Fix loop exhausted: PR #{pr['number']} {pr.get('title', '')[:80]}",
                                 pr_events.bug_report(pr, f"{body}\n\nHost `{HOST}`, {now_iso()}.", HOST, record))
        except Exception:
            pass
        attempts[str(pr["number"])] = {**record, "escalated": True}
        pr_events.add_label(pr["number"], pr_events.EXHAUSTED, sh)  # held with a reason, visible on the PR
        update_json(held_path(host), lambda held: held.update({str(pr["number"]): pr_events.held_record(
            pr["headRefOid"], ["fix-exhausted", *held.get(str(pr["number"]), {}).get("evidence", [])])}))
        found = LANE_BRANCH.match(pr.get("headRefName") or "")
        if found and found.group("lane") in pr_events.disabled_lanes(load_providers()):
            pr_events.return_to_pool(THIS, linear, pr, "orphaned lane PR after its fix attempts ran out")
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
        "- Repo gates are real requirements (e.g. component-ship-gate needs tests + stories for",
        "  shipped UI components). Never skip, weaken or --no-verify a check.",
        "- If the failure is unrelated to this PR (broken main, infra), change nothing and end with",
        "  `NOT-SHIPPABLE: <reason>`.",
    ])


def fix_red_pr(host: Host, name: str, spec: dict, pr: dict) -> dict:
    run_id = f"{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-PR{pr['number']}-{name}-fix-{uuid.uuid4().hex[:6]}"
    runs = host.state / "runs"
    runs.mkdir(parents=True, exist_ok=True)
    worktree = host.state / "worktrees" / run_id
    receipt = {"schema": "jovie-lane-run/v1", "runId": run_id, "provider": name, "kind": "fix-red",
               "pr": pr["number"], "headBefore": pr["headRefOid"], "startedAt": now_iso()}
    failure = {"checks": [(check.get("name"), check.get("conclusion")) for check in pr.get("statusCheckRollup") or []],
               "merge": pr.get("mergeStateStatus"), "review": pr.get("reviewDecision")}
    ident = execution_attempt.identity("pr-remediation",
                                       {"repository": REPO_SLUG, "pr": pr["number"], "failure": failure},
                                       {"headSha": pr["headRefOid"]})
    claimed = execution_attempt.claim(runs / "execution-attempts.jsonl", ident,
                                      {"owner": HOST, "runtime": "symphony-lanes", "provider": name,
                                       "model": spec.get("model"), "tool": "fix_red_pr", "accountPool": name},
                                      {"attempts": MAX_FIX_ATTEMPTS, "concurrency": 1, "wallSeconds": host.agent_timeout * MAX_FIX_ATTEMPTS,
                                       "spend": MAX_FIX_ATTEMPTS, "mutations": MAX_FIX_ATTEMPTS,
                                       "leaseSeconds": host.agent_timeout + 900, "version": "lanes-v1"},
                                      {"triggerId": run_id, "correlationId": f"pr-{pr['number']}",
                                       "causationId": pr["headRefOid"]})
    receipt["execution"] = claimed
    if not claimed["admitted"]:
        receipt.update(verdict="duplicate-active" if claimed["reason"] == "duplicate_active" else "quarantined",
                       reasons=[claimed["reason"]], endedAt=now_iso())
        return receipt
    with open(runs / f"{run_id}.log", "w") as log:
        try:
            sh(["git", "fetch", "-q", "origin", "main", pr["headRefName"]], cwd=host.repo, log=log)
            sh(["git", "worktree", "add", "-q", "-B", pr["headRefName"], str(worktree),
                f"origin/{pr['headRefName']}"], cwd=host.repo, log=log)
            sh(["pnpm", "install", "--frozen-lockfile", "--prefer-offline"], cwd=worktree, timeout=1800, log=log)
            prompt = render_fix_prompt(pr, failure_excerpt(pr))
            prompt_file = runs / f"{run_id}.prompt.md"
            prompt_file.write_text(prompt)
            execution_attempt.boundary(runs / "execution-attempts.jsonl", ident, claimed["fencingToken"],
                                       {"spend": 1, "mutations": 1})
            agent = run_agent(template(spec["cmd"], {"prompt": prompt, "prompt_file": str(prompt_file), "cwd": str(worktree)}),
                              worktree, log, host.agent_timeout)
            head = sh(["git", "ls-remote", "origin", f"refs/heads/{pr['headRefName']}"], cwd=host.repo).stdout.split()
            after = head[0] if head else ""
            pushed = bool(after) and after != pr["headRefOid"]
            receipt.update(agentExit=agent.returncode, headAfter=after,
                           verdict="fix-pushed" if pushed else "fix-no-change")
            if pushed and not pr.get("isDraft"):
                # Conflicts and failures can drop auto-merge; re-arm it so the fix actually lands.
                sh(["gh", "pr", "merge", str(pr["number"]), "--repo", REPO_SLUG, "--auto"], log=log)
        except subprocess.TimeoutExpired:
            receipt.update(verdict="failed", reasons=["timeout"])
        except Exception as error:
            receipt.update(verdict="failed", reasons=[f"harness-error:{type(error).__name__}:{error}"[:300]])
        finally:
            sh(["git", "worktree", "remove", "--force", str(worktree)], cwd=host.repo)
            # The attempt is over: a head it did not move may be tried again by the next lane.
            update_json(host.state / "fix-attempts.json", lambda attempts: attempts.get(str(pr["number"]), {}).update(
                endedAt=time.time(), pushed=receipt.get("verdict") == "fix-pushed"))
    receipt["endedAt"] = now_iso()
    pushed = receipt.get("verdict") == "fix-pushed"
    receipt["execution"] = execution_attempt.finish(
        runs / "execution-attempts.jsonl", ident, claimed["fencingToken"], "succeeded" if pushed else "failed_known",
        {"failureClass": None if pushed else "deterministic_code",
         "failureFingerprint": None if pushed else execution_attempt.digest(receipt.get("reasons", ["no-head-change"])),
         "evidenceDigest": execution_attempt.digest({"before": pr["headRefOid"], "after": receipt.get("headAfter")}),
         "costs": {"apiCalls": 1}, "mutationsPerformed": ["source_push"] if pushed else [],
         "confidence": "high", "dependencies": [name]})
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
        if pr.get("isDraft") and verified.get(str(pr["number"])) != pr["headRefOid"]:
            return pr
    return None


def adopt_pr(host: Host, name: str, pr: dict) -> dict:
    run_id = f"{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-PR{pr['number']}-{name}-adopt-{uuid.uuid4().hex[:6]}"
    runs = host.state / "runs"
    runs.mkdir(parents=True, exist_ok=True)
    worktree = host.state / "worktrees" / run_id
    receipt = {"schema": "jovie-lane-run/v1", "runId": run_id, "provider": name, "kind": "adopt",
               "pr": pr["number"], "startedAt": now_iso()}
    with open(runs / f"{run_id}.log", "w") as log:
        try:
            sh(["git", "fetch", "-q", "origin", "main"], cwd=host.repo, log=log)
            sh(["git", "worktree", "add", "-q", "--detach", str(worktree), "origin/main"], cwd=host.repo, log=log)
            sh(["pnpm", "install", "--frozen-lockfile", "--prefer-offline"], cwd=worktree, timeout=1800, log=log)
            labels = {label["name"].lower() for label in pr.get("labels", [])}
            receipt.update(gate_pr(host, pr, worktree, log, sensitive=SENSITIVE_PR_LABEL in labels))
        except Exception as error:
            receipt.update(verdict="failed", reasons=[f"harness-error:{type(error).__name__}:{error}"[:300]])
        finally:
            sh(["git", "worktree", "remove", "--force", str(worktree)], cwd=host.repo)
    if receipt.get("verdict") in ("gate-timeout", "failed"):
        # Not verified: forget the claim so the next adopt pass retries this head.
        update_json(host.state / "verified.json", lambda verified: verified.pop(str(pr["number"]), None))
    receipt["endedAt"] = now_iso()
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
        listed = sh(["gh", "pr", "list", "--repo", REPO_SLUG, "--state", "open", "--search", f"head:{owner}/",
                     *(["--limit", "200", "--json", fields] if fields else ["--json", PR_FIELDS])])
        own = re.compile(rf"^{re.escape(owner)}/jov-\d+-\d{{8}}")
        prs += [pr for pr in json.loads(listed.stdout or "[]") if own.match(pr["headRefName"])]
    return prs


PR_FIELDS = "number,title,url,isDraft,headRefName,headRefOid,statusCheckRollup,mergeStateStatus,reviewDecision,isCrossRepository,labels"
# Every lane PR without check rollups: rollups over ~90 PRs time out (HTTP 504), so the full
# field set stays at gh's default page of 30 and the budget/sweep read this light set.
LIGHT_PR_FIELDS = "number,url,isDraft,headRefName,mergeStateStatus"


def repo_prs() -> list[dict]:
    """Every open, non-draft PR whose branch lives in this repo (forks cannot be pushed to).
    Tim: no open PR should ever need his action; the fix loop owns them all."""
    listed = sh(["gh", "pr", "list", "--repo", REPO_SLUG, "--state", "open", "--limit", "60",
                 "--search", "draft:false sort:updated-desc", "--json", PR_FIELDS])
    return [pr for pr in json.loads(listed.stdout or "[]") if not pr.get("isCrossRepository")]


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
    listed = sh(["gh", "pr", "list", "--repo", REPO_SLUG, "--state", "open", "--limit", "500",
                 "--json", "headRefName,body"])
    if listed.returncode != 0:
        return None
    keys = set()
    for pr in json.loads(listed.stdout or "[]"):
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


def last_pushes() -> dict[int, float]:
    """Open PR number -> head commit time, in one paginated query (`gh pr list --json commits`
    over 200 PRs exceeds GitHub's GraphQL node limit). Empty when GitHub cannot be read."""
    owner, name = REPO_SLUG.split("/")
    listed = sh(["gh", "api", "graphql", "--paginate", "-f", f"owner={owner}", "-f", f"name={name}", "-f",
                 "query=query($owner:String!,$name:String!,$endCursor:String){repository(owner:$owner,name:$name){"
                 "pullRequests(states:OPEN,first:100,after:$endCursor){pageInfo{hasNextPage endCursor}"
                 "nodes{number commits(last:1){nodes{commit{committedDate}}}}}}}",
                 "--jq", ".data.repository.pullRequests.nodes[] | "
                         "\"\\(.number) \\(.commits.nodes[0].commit.committedDate)\""])
    pushes = {}
    for line in (listed.stdout or "").splitlines() if listed.returncode == 0 else []:
        number, _, date = line.partition(" ")
        if number.isdigit() and created_at_epoch(date) is not None:
            pushes[int(number)] = created_at_epoch(date)
    return pushes


def sweep_plan(prs: list[dict], now: float, pushes: dict[int, float]) -> tuple[list[tuple[dict, int]], list[dict]]:
    """(duplicates to close as superseded by the kept PR, stale drafts to close).
    Only lane-branch PRs; the kept PR per issue is best_per_issue's pick."""
    kept = {LANE_BRANCH.match(pr["headRefName"]).group("issue"): pr
            for pr in best_per_issue(prs) if LANE_BRANCH.match(pr.get("headRefName") or "")}
    superseded, stale = [], []
    for pr in prs:
        found = LANE_BRANCH.match(pr.get("headRefName") or "")
        if not found:
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
    """On the existing lane tick (at most every SWEEP_EVERY_S per host): leave one open PR per
    issue and close drafts with no green run and no push for a day, returning their issue to Todo."""
    now = time.time() if now is None else now
    marker = host.state / f"sweep-{name}.json"
    if marker.exists() and now - json.loads(marker.read_text()).get("at", 0) < SWEEP_EVERY_S:
        return
    marker.write_text(json.dumps({"at": now}))
    superseded, stale = sweep_plan(lane_prs(name, fields=LIGHT_PR_FIELDS), now, last_pushes())
    for pr, keep in superseded:
        sh(["gh", "pr", "close", str(pr["number"]), "--repo", REPO_SLUG, "--comment",
            f"🤖 lane sweep: superseded by #{keep} (one open PR per Linear issue, JOV-6833)."])
    for pr in stale:
        issue = LANE_BRANCH.match(pr["headRefName"]).group("issue").upper()
        closed = sh(["gh", "pr", "close", str(pr["number"]), "--repo", REPO_SLUG, "--comment",
                     "🤖 lane sweep: closing this draft; no green run and no push for 24 h (JOV-6833). "
                     f"{issue} goes back to Todo for a fresh attempt."])
        # Only reopen work the lane still owns; a Done or Canceled issue stays closed.
        if closed.returncode == 0 and linear.state_of(issue) == "In Progress":
            linear.move(issue, "Todo")
            linear.comment(issue, f"🤖 lane sweep closed stale draft {pr.get('url')} (no green run, "
                                  "no push for 24 h); back to Todo.")


def claim_adoptable_pr(host: Host, name: str, prs: list[dict]) -> dict | None:
    path = host.state / "verified.json"
    verified = json.loads(path.read_text()) if path.exists() else {}
    pr = unverified_pr(prs, verified)
    if pr:
        if claimed_elsewhere(pr["number"], pr["headRefOid"], "gate"):
            return None  # another host is gating this head; we look again next pass
        verified[str(pr["number"])] = pr["headRefOid"]
        path.write_text(json.dumps(verified))
        post_claim(pr["number"], pr["headRefOid"], "gate")
    return pr


def claim_red_pr(host: Host, name: str, prs: list[dict] | None = None) -> dict | None:
    """Under the claim lock: pick this lane's red PR and record the attempt before working it."""
    prs = lane_prs(name) if prs is None else prs
    path = host.state / "fix-attempts.json"
    attempts = json.loads(path.read_text()) if path.exists() else {}
    held = json.loads(held_path(host).read_text()) if held_path(host).exists() else {}
    order, now = pr_events.cost_order(load_providers()), time.time()
    prs = [pr for pr in prs if pr_events.may_take(name, pr, attempts.get(str(pr["number"]), {}), order, now)]
    pr = red_pr(prs, attempts, held)
    if pr:
        entry = held.get(str(pr["number"]), {})
        if entry.get("sha") == pr["headRefOid"]:
            pr = {**pr, "gateEvidence": entry.get("evidence", [])}
        if claimed_elsewhere(pr["number"], pr["headRefOid"], "fix"):
            return None  # another host is already fixing this head; no attempt is charged
        record = attempts.get(str(pr["number"]), {})
        attempts[str(pr["number"])] = {"sha": pr["headRefOid"], "count": record.get("count", 0) + 1,
                                       "lane": name, "at": now}
        path.write_text(json.dumps(attempts))
        post_claim(pr["number"], pr["headRefOid"], "fix")
    return pr


# ---------------------------------------------------------------- worker / dispatch / update

def failures_path(host: Host) -> Path:
    return host.state / "failures.json"


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
    if slot is None:
        return 0
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
        adopt = None if red else claim_adoptable_pr(host, name, prs)
        issue = None
        sweep_lane_prs(host, name, linear)
        in_flight = None if red or adopt or over_budget(name, lane_prs(name, fields=LIGHT_PR_FIELDS),
                                                        host.slots(name, spec.get("slots", 1))) \
            else in_flight_issues()
        if in_flight is not None:
            failures = json.loads(failures_path(host).read_text()) if failures_path(host).exists() else {}
            issue = pick_issue(linear.lane_issues(spec["label"]), failures, in_flight=in_flight,
                               provider=name)
            if issue and linear.state_of(issue.id) != "Todo":
                issue = None  # another host claimed it between our read and now
            if issue:
                linear.move(issue.id, "In Progress")
    finally:
        claim.release()
    if red is not None or adopt is not None:
        if red is not None:
            fix_red_pr(host, name, spec, red)
        else:
            adopt_pr(host, name, adopt)
        slot.release()
        return reexec(host, name)
    if issue is None:
        return 0
    linear.comment(issue.id, f"🤖 lane `{name}` claimed this issue (model `{spec.get('model')}`).")
    receipt = run_issue(host, name, spec, linear, issue)
    verdict = receipt.get("verdict")
    if verdict == "duplicate-active":
        linear.comment(issue.id, "🤖 lane claim reconciled to the existing durable attempt; no second provider call ran.")
        slot.release()
        return reexec(host, name)
    if verdict == "quarantined":
        linear.move(issue.id, "Triage")
        linear.comment(issue.id, f"🤖 lane stopped at the durable execution terminal ({receipt['reasons'][0]}). "
                                 "Re-entry requires new authoritative revision evidence or a bounded policy override.")
        slot.release()
        return reexec(host, name)
    if verdict == "provider-error":
        cooldown = host.state / "cooldown" / name
        cooldown.parent.mkdir(parents=True, exist_ok=True)
        cooldown.write_text(str(time.time() + PROVIDER_COOLDOWN_S))
        linear.move(issue.id, "Triage")
        linear.comment(issue.id, f"🤖 lane `{name}` provider failed before working the issue "
                                 f"({', '.join(receipt.get('reasons', []))}); unknown outcome quarantined, lane cooling down.")
        slot.release()
        return 1
    if verdict == "not-shippable":
        linear.move(issue.id, "Triage")
        linear.comment(issue.id, f"🤖 lane `{name}` judged this not code-shippable: {receipt['reasons'][0]}\n"
                                 "Returned to Triage for Summer/owner routing.")
    elif verdict in ("landing", "verified-not-queued"):
        linear.comment(issue.id, f"🤖 lane `{name}`: PR {receipt.get('prUrl')} passed the lane gate and is "
                                 f"queued; required checks and the merge queue decide.")
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
        linear.move(issue.id, "Triage" if exhausted else "Todo")
        linear.comment(issue.id, f"🤖 lane `{name}`: {verdict} ({', '.join(receipt.get('reasons', []))}). "
                                 + ("Returned to Triage after 3 attempts." if exhausted else "Back to Todo."))
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
        ensure_full_history(host)
        prune_worktrees(host)
        for name, spec in load_providers().items():
            if not spec.get("enabled", True) or cooling(host, name):
                continue
            if not provider_healthy(spec):
                tick["unhealthy"].append(name)
                continue
            for _ in range(host.slots(name, spec.get("slots", 1))):
                subprocess.Popen([sys.executable, str(Path(__file__)), "worker", "--provider", name],
                                 stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                 start_new_session=True)
                tick["spawned"].append(name)
    except Exception as error:  # the tick must still leave a receipt the doctor can raise
        tick["error"] = f"{type(error).__name__}: {error}"[:300]
    try:
        tick["events"] = pr_events.tick(host, THIS, lambda: Linear(host.linear_env))
    except Exception as error:  # the ready/orphan queue never takes dispatch down
        tick["eventsError"] = f"{type(error).__name__}: {error}"[:200]
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


def prune_worktrees(host: Host, max_age_s: int = 6 * 3600) -> None:
    """Garbage-collect worktrees a crashed worker left behind; never touch young ones."""
    root = host.state / "worktrees"
    if not root.exists():
        return
    for path in root.iterdir():
        try:
            stale = time.time() - path.stat().st_mtime > max_age_s
        except FileNotFoundError:
            continue  # a worker removed it between listing and stat
        if stale:
            sh(["git", "worktree", "remove", "--force", str(path)], cwd=host.repo)
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
    if not release.exists():
        staging = host.state / "releases" / f".{tree}.tmp"
        shutil.rmtree(staging, ignore_errors=True)
        staging.mkdir(parents=True)
        archive = subprocess.run(["git", "archive", "origin/main", "scripts/lanes", *LANE_TESTS],
                                 cwd=host.repo, capture_output=True, check=True)
        subprocess.run(["tar", "-x", "-C", str(staging)], input=archive.stdout, check=True)
        # The self-test must never touch this host's live state: point it at a scratch dir.
        scratch = staging / ".selftest-state"
        scratch.mkdir(exist_ok=True)
        test = subprocess.run([sys.executable, "-m", "unittest", "-q", *LANE_TESTS],
                              cwd=staging, capture_output=True, text=True, timeout=300,
                              env={**os.environ, "LANES_SELFTEST": "1", "LANES_STATE": str(scratch)})
        if test.returncode != 0:
            print(f"lane update refused: release tests failed\n{test.stderr[-2000:]}", file=sys.stderr)
            return 1
        (staging / "scripts/lanes/.tree").write_text(tree)
        staging.rename(release)
    link = host.state / ".current.tmp"
    if link.is_symlink() or link.exists():
        link.unlink()
    link.symlink_to(release / "scripts/lanes")
    os.replace(link, current)
    return 0


def load_github_env(path: Path = Path.home() / ".config/jovie-lanes/github.env") -> None:
    """A host-specific GitHub token (GH_TOKEN=...) so each host spends its own API budget
    instead of everyone sharing one user's 5000/hr."""
    try:
        for line in path.read_text().splitlines():
            key, _, value = line.strip().removeprefix("export ").partition("=")
            if key in ("GH_TOKEN", "GITHUB_TOKEN") and value:
                os.environ["GH_TOKEN"] = value.strip().strip('"').strip("'")
    except OSError:
        return


def main(argv: list[str] | None = None) -> int:
    load_github_env()
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("dispatch")
    sub.add_parser("update")
    work = sub.add_parser("worker")
    work.add_argument("--provider", required=True)
    args = parser.parse_args(argv)
    host = Host()
    if args.command == "update":
        return update(host)
    if args.command == "worker":
        return worker(host, args.provider)
    return dispatch(host)


if __name__ == "__main__":
    sys.exit(main())
