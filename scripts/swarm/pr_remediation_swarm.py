#!/usr/bin/env python3
"""PR remediation swarm: one cheap, bounded remediator per red PR on GitHub-hosted runners.

Subcommands (all stateless; the workflow owns ordering):
  select    red PR numbers for a matrix, quota-aware (reads /rate_limit, which is free)
  prepare   per-PR: gate, claim, fetch latest failing logs once, classify, choose an action
  fix       deterministic fixes in the PR checkout (sync-main, wire-ci-fast); no model
  guard     verify the working diff (size, forbidden paths) before any push
  finalize  push one commit (only if guard + repro passed), receipt comment, release claim, metrics
  summarize aggregate the per-attempt JSONL into a job summary and the ledger artifact name

Every GitHub call goes through gh() with the App installation token (GH_TOKEN) so the swarm never
spends the repo's Actions GITHUB_TOKEN quota, and every call is counted into the metrics row.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_classes as classes  # noqa: E402
from apiclient.gh import run_gh  # noqa: E402

SCHEMA = "jovie-remediation-swarm/v1"
HOST = "gha-swarm"
REPO = os.environ.get("GITHUB_REPOSITORY", "JovieInc/Jovie")
CLAIM_TTL_S = 2 * 3600
RECENT_PUSH_S = 20 * 60
LABEL = "lane-fix-red"
CONFLICT_LABEL = "lane-fix-conflict"
SKIP_LABELS = {"lane-fix-exhausted", "queue-poison", "swarm-gave-up", "hold", "do-not-merge"}
# The launch shepherd owns these; never touched (coordinator 2026-10-28).
EXCLUDED = {23495, 23499, 23500, 23506, 23511, 23512, 23514, 23517, 23519}
MAX_ATTEMPTS = 2           # swarm attempts per (PR, failure fingerprint) before handing back to the lanes
MAX_FILES, MAX_LINES = 8, 250
# The cheap model never edits these; PRs touching them go to the Codex/Opus ladder.
SENSITIVE = re.compile(
    r"(^|/)(auth|billing|entitlement|stripe|clerk|secrets?|credentials?)[^/]*"
    r"|(^|/)(migrations?|drizzle)/|\.env|(^|/)proxy\.ts$|^\.github/(workflows|actions)/"
    r"|^canon/|^\.claude/|^scripts/(invariants|lanes)/|branch-protection|CODEOWNERS", re.I)
TESTISH = re.compile(r"(\.test\.|\.spec\.|/tests?/|__tests__)", re.I)
calls = 0


def now() -> float:
    return time.time()


def iso(ts: float | None = None) -> str:
    return datetime.fromtimestamp(ts or now(), timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sh(cmd: list[str], cwd: str | None = None, timeout: int = 300, check: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, check=check)


class _Result:
    def __init__(self, r: dict):
        self.returncode, self.stdout, self.stderr = r["code"], r["stdout"], r["stderr"]


def gh(args: list[str], *, input_text: str | None = None, priority: str = "repair") -> _Result:
    """The only GitHub call site: the budgeted apiclient layer (ledger, backoff, breaker); counts calls."""
    global calls
    calls += 1
    return _Result(run_gh(args, priority=priority))


def gh_json(args: list[str], priority: str = "repair"):
    out = gh(args, priority=priority)
    if out.returncode != 0:
        raise RuntimeError(f"gh {' '.join(args[:3])}: {out.stderr.strip()[:200]}")
    return json.loads(out.stdout or "null")


def out_var(key: str, value: str) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a") as fh:
            fh.write(f"{key}={value}\n")
    print(f"{key}={value}")


def quota() -> tuple[int, int]:
    """(remaining, limit) of the token in use; /rate_limit is not charged."""
    data = gh_json(["api", "rate_limit"])["resources"]["core"]
    return int(data["remaining"]), int(data["limit"])


# ---------------------------------------------------------------- select

def cmd_select(a) -> int:
    remaining, limit = quota()
    if remaining < 0.2 * limit:
        print(f"quota-low remaining={remaining}/{limit}: backing off, empty matrix")
        out_var("matrix", "[]")
        out_var("reason", "quota-low")
        return 0
    modes: dict[int, str] = {}
    want = {m.strip() for m in a.modes.split(",")}
    if a.pr:
        for n in (int(x) for x in a.pr.split(",") if x.strip()):
            modes[n] = "red"
    else:
        for label, mode in ((LABEL, "red"), (CONFLICT_LABEL, "conflict")):
            if mode not in want and "all" not in want:
                continue
            for page in range(1, 6):
                rows = gh_json(["api", f"repos/{REPO}/issues?labels={label}&state=open&per_page=100&page={page}"], priority="report")
                for row in rows:
                    labels = {l["name"].lower() for l in row.get("labels", [])}
                    if "pull_request" in row and not labels & SKIP_LABELS:
                        modes.setdefault(row["number"], mode)  # red wins: sync-main is part of its ladder
                if len(rows) < 100:
                    break
    if not a.pr and ("behind" in want or "all" in want):
        for n in behind_prs(a.behind_limit):
            modes.setdefault(n, "behind")
    modes = {n: m for n, m in modes.items() if n not in EXCLUDED}
    spent = day_spend_cents(a.ledger_issue)
    # Each attempt costs ~8 calls; keep a quarter of the remaining quota in reserve.
    by_quota = int((remaining * 0.75) // 8)
    credits_ok = credits_available(gateway_base(), os.environ.get("SWARM_API_KEY", ""))
    matrix = plan_matrix(modes, limit=a.limit, by_quota=by_quota, spent_cents=spent,
                         daily_cap_usd=a.daily_cap_usd, attempt_cap_usd=a.attempt_cap_usd, credits_ok=credits_ok)
    agents = sum(1 for m in matrix if m["agent"])
    print(f"red={len(modes)} take={len(matrix)} agent_slots={agents} quota={remaining}/{limit} "
          f"credits={'ok' if credits_ok else 'NONE (model slots closed)'} "
          f"spent_cents={'UNREADABLE (fail closed: no model attempts)' if spent is None else spent}")
    out_var("matrix", json.dumps(matrix))
    out_var("reason", "ledger-unreadable" if spent is None else "no-credits" if not credits_ok else ("daily-cap" if agents == 0 and matrix else ("ok" if matrix else "none")))
    return 0


LEDGER_AUTHOR = os.environ.get("SWARM_LEDGER_AUTHOR", "jovie-bot[bot]")
LEDGER_RE = re.compile(r"^🤖 swarm-ledger run=(\d+) cents=(\d+) at=(\S+)")


BEHIND_QUERY = ("query($after:String){repository(owner:\"%s\",name:\"%s\"){pullRequests(states:OPEN,first:100,after:$after)"
                "{pageInfo{hasNextPage endCursor} nodes{number mergeStateStatus isCrossRepository labels(first:30){nodes{name}} "
                "commits(last:1){nodes{commit{statusCheckRollup{state}}}}}}}}")


def behind_prs(limit: int) -> list[int]:
    """Open same-repo PRs that are only BEHIND main and not red: a server-side update-branch clears them
    at no model cost. Paced (`limit` per run) because every update fans out a full CI run."""
    if limit <= 0:
        return []
    owner, name = REPO.split("/")
    found, cursor = [], None
    try:
        for _ in range(5):
            args = ["api", "graphql", "-f", f"query={BEHIND_QUERY % (owner, name)}"]
            if cursor:
                args += ["-f", f"after={cursor}"]
            data = gh_json(args, priority="report")["data"]["repository"]["pullRequests"]
            for node in data["nodes"]:
                labels = {l["name"].lower() for l in node["labels"]["nodes"]}
                rollup = ((node["commits"]["nodes"] or [{}])[0].get("commit") or {}).get("statusCheckRollup") or {}
                if node["mergeStateStatus"] == "BEHIND" and not node["isCrossRepository"] and not labels & SKIP_LABELS \
                        and rollup.get("state") not in {"FAILURE", "ERROR"}:
                    found.append(node["number"])
            if not data["pageInfo"]["hasNextPage"]:
                break
            cursor = data["pageInfo"]["endCursor"]
    except (RuntimeError, KeyError, TypeError, ValueError):
        return []  # a read failure costs nothing: no PRs are updated
    return found[:limit]


def day_spend_cents(issue: str) -> int | None:
    """Today's swarm spend in cents: the sum of `swarm-ledger` comments on the ledger issue since UTC
    midnight. (The Actions artifacts listing 5xx's on this repo, so it cannot be the ledger.) None when
    the ledger issue is unset or unreadable in full: the caller must treat that as the cap reached
    (a cap that fails open is not a cap)."""
    if not issue or not str(issue).isdigit():
        return None
    since = iso()[:10] + "T00:00:00Z"
    total, seen = 0, set()
    try:
        for page in range(1, 11):
            rows = gh_json(["api", f"repos/{REPO}/issues/{issue}/comments?per_page=100&page={page}&since={since}"],
                           priority="report")
            for row in rows:
                if (row.get("user") or {}).get("login") != LEDGER_AUTHOR:
                    continue  # public repo: only the Jovie Bot app's own comments are spend
                m = LEDGER_RE.match(row.get("body") or "")
                if m and m.group(3)[:10] == since[:10] and m.group(1) not in seen:
                    seen.add(m.group(1))
                    total += int(m.group(2))
            if len(rows) < 100:
                return total
    except (RuntimeError, ValueError, TypeError, KeyError, AttributeError):
        return None
    return None


def cmd_ledger(a) -> int:
    """Append this run's spend to the ledger issue (retry once; a miss is loud, not silent)."""
    body = f"🤖 swarm-ledger run={a.run} cents={a.cents} at={iso()}"
    for _ in range(2):
        if gh(["api", f"repos/{REPO}/issues/{a.issue}/comments", "-f", f"body={body}"], priority="repair").returncode == 0:
            return 0
    print("::error::swarm ledger write failed; the next selector will under-count today's spend")
    return 1


def credits_available(base: str, key: str) -> bool:
    """True only when the gateway reports a positive balance. Anything else (no key, 402,
    insufficient_funds, unreadable) closes the model slots; deterministic actions still run."""
    if os.environ.get("SWARM_CREDIT_PROBE") == "off":
        return bool(key)  # Workers AI relay: startup credits, no balance endpoint; the daily cap and 429s bound it
    if not key:
        return False
    import urllib.error
    import urllib.request
    req = urllib.request.Request(base.rstrip("/") + "/credits", headers={"Authorization": f"Bearer {key}", "User-Agent": "jovie-pr-remediation-swarm/1"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.load(resp)
    except (urllib.error.URLError, ValueError, OSError):
        return False
    try:
        return float(data.get("balance", data.get("total_credits", 0)) or 0) > 0
    except (TypeError, ValueError):
        return False


def plan_matrix(modes: dict[int, str], *, limit: int, by_quota: int, spent_cents: int | None,
                daily_cap_usd: float, attempt_cap_usd: float, credits_ok: bool = True) -> list[dict]:
    """PRs to dispatch. `agent` is true only for as many PRs as the remaining daily budget affords; an
    unreadable ledger affords none. Deterministic actions cost $0, so PRs are still dispatched."""
    afford = 0 if (spent_cents is None or not credits_ok) else int(max(0.0, daily_cap_usd * 100 - spent_cents) // max(1.0, attempt_cap_usd * 100))
    take = max(0, min(len(modes), limit, by_quota))
    return [{"pr": n, "mode": modes[n], "agent": i < afford} for i, n in enumerate(list(modes)[:take])]


# ---------------------------------------------------------------- prepare

def claim_live(number: int, sha: str) -> bool:
    since = iso(now() - CLAIM_TTL_S)
    rows = gh_json(["api", f"repos/{REPO}/issues/{number}/comments?per_page=100&since={since}"])
    for row in rows:
        body = row.get("body") or ""
        if not body.startswith("🤖 lane claim "):
            continue
        f = dict(p.split("=", 1) for p in body.splitlines()[0].split()[3:] if "=" in p)
        try:
            age = now() - datetime.fromisoformat(f.get("at", "").replace("Z", "+00:00")).timestamp()
        except ValueError:
            continue
        if f.get("sha") == sha and f.get("kind") in {"fix", "gate"} and age < CLAIM_TTL_S:
            return True
    return False


def latest_failures(sha: str) -> tuple[list[dict], bool]:
    """Latest result per check name, red ones only."""
    runs = gh_json(["api", f"repos/{REPO}/commits/{sha}/check-runs?per_page=100"])["check_runs"]
    latest: dict[str, dict] = {}
    for run in runs:
        name = run["name"]
        if name not in latest or run["id"] > latest[name]["id"]:
            latest[name] = run
    pending = any(r.get("status") != "completed" for r in latest.values())
    red = [r for r in latest.values() if (r.get("conclusion") or "").lower() in
           {"failure", "timed_out", "cancelled", "startup_failure"}]
    return red, pending


ERROR_LINE = re.compile(r"##\[error\]|::error|\bFAIL\b|✖|AssertionError|ERR_[A-Z_]+|\bError:|Unwired|exit code [1-9]|: FAIL$")
ANSI = re.compile(r"\x1b\[[0-9;]*m|\[\d+(?:;\d+)*m")


def extract_failure(text: str, tail: int = 60, context: int = 6, cap: int = 220) -> str:
    """The lines that explain a failed job: every error-looking line with a little context, then the tail.
    The raw tail alone is post-job cleanup noise for most failures."""
    lines = [ANSI.sub("", re.sub(r"^\S+Z ", "", l)) for l in text.splitlines()]
    # Best case: the output of the failing step (after its command echo, up to its ##[error] line).
    errs = [i for i, l in enumerate(lines) if l.startswith("##[error]")]
    if errs:
        end = errs[-1]
        groups = [i for i, l in enumerate(lines[:end]) if l.startswith("##[endgroup]")]
        if groups:
            span = lines[groups[-1] + 1:end + 2]
            if any(l.strip() for l in span):
                return "\n".join(span[-cap:] + ["--- tail ---"] + lines[-tail:][-20:])
    keep: set[int] = set()
    for i, line in enumerate(lines):
        if ERROR_LINE.search(line) and "✓" not in line and "continue-on-error" not in line \
                and not line.lstrip().startswith(("env:", "echo ", "if ")):
            keep.update(range(max(0, i - context), min(len(lines), i + context + 1)))
    picked = sorted(keep)[-cap:]
    out = [lines[i] for i in picked]
    return "\n".join(out + ["--- tail ---"] + lines[-tail:])


LOG_DIAG: list[dict] = []


def fetch_job_log(job_id) -> "_Result":
    """Job logs hold ANSI escapes; current gh refuses to print them without --allow-escape-sequences
    (older gh lacks the flag), so retry with it only when gh asks."""
    url = f"repos/{REPO}/actions/jobs/{job_id}/logs"
    out = gh(["api", url])
    if out.returncode != 0 and "allow-escape-sequences" in (out.stderr or ""):
        out = gh(["api", "--allow-escape-sequences", url])
    return out


def job_log_tail(run: dict) -> str:
    out = fetch_job_log(run["id"])
    LOG_DIAG.append({"check": run["name"], "rc": out.returncode, "bytes": len(out.stdout or ""),
                     "err": (out.stderr or "")[:120]})
    if out.returncode != 0:
        return ""
    return extract_failure(out.stdout)


def receipts_for(number: int, sha: str, key: str) -> dict | None:
    """Swarm receipts on the PR in the last 24h: {fp: attempts for this failure, sha: handled this head}."""
    try:
        rows = gh_json(["api", f"repos/{REPO}/issues/{number}/comments?per_page=100&since={iso(now() - 24 * 3600)}"])
    except RuntimeError:
        return {"fp": MAX_ATTEMPTS, "sha": 0}  # unreadable evidence fails closed: no attempt
    mine = [r.get("body") or "" for r in rows if (r.get("body") or "").startswith("🤖 swarm receipt")]
    return {"fp": sum(1 for b in mine if f"fp={key}" in b), "sha": sum(1 for b in mine if f"sha={sha}" in b)}


def cmd_prepare(a) -> int:
    n = a.pr
    plan: dict = {"kind": a.mode, "ghVersion": gh_version(), "schema": SCHEMA, "pr": n, "startedAt": iso(), "outcome": "skipped", "action": "none"}
    Path(a.plan).write_text(json.dumps(plan))
    try:
        pr = gh_json(["api", f"repos/{REPO}/pulls/{n}"])
        plan.update(sha=pr["head"]["sha"], ref=pr["head"]["ref"])
        why = None
        if pr["state"] != "open":
            why = "closed"
        elif pr["head"]["repo"] is None or pr["head"]["repo"]["full_name"] != REPO:
            why = "fork"
        elif n in EXCLUDED:
            why = "excluded"
        elif {l["name"].lower() for l in pr["labels"]} & SKIP_LABELS:
            why = "skip-label"
        if not why and claim_live(n, plan["sha"]):
            why = "claimed-elsewhere"
        if not why:
            plan["files"] = [f["filename"] for f in gh_json(["api", f"repos/{REPO}/pulls/{n}/files?per_page=100"])]
            # Sensitive paths only bar edits by the model or the wiring fixer; a rebase, a rerun and a
            # conflict sync leave the PR's own diff untouched, so they stay allowed.
            plan["sensitive"] = any(SENSITIVE.search(f) for f in plan["files"])
        if why:
            plan.update(outcome="skipped", reason=why)
            return finish_plan(plan, a)
        if a.mode == "red":
            return prepare_red(a, plan, pr)
        take_claim(plan, n)
        if a.mode == "behind":
            if pr.get("mergeable_state") != "behind" or pr.get("draft"):
                plan.update(outcome="skipped", reason="not-behind", action="none")
                return finish_plan(plan, a)
            # server-side merge of main into the branch, only if the head is still the one we read
            res = gh(["api", "-X", "PUT", f"repos/{REPO}/pulls/{n}/update-branch", "-f", f"expected_head_sha={plan['sha']}"])
            if res.returncode == 0:
                plan.update(outcome="deterministic-fixed", fix="update-branch", cls="behind", fp="behind", action="none")
            else:
                plan.update(outcome="gave-up", reason="update-branch-failed:" + res.stderr.strip()[:80], cls="behind", action="none")
            return finish_plan(plan, a)
        if a.mode == "conflict":
            if pr.get("mergeable_state") != "dirty":
                plan.update(outcome="skipped", reason="not-conflicting", action="none")
            else:
                plan.update(cls="conflict", action="sync-main", fp="conflict")
            return finish_plan(plan, a)
    except Exception as exc:  # never raise past the claim: finalize must release it
        plan.update(outcome="error", reason=str(exc)[:200], action="none")
    return finish_plan(plan, a)


def take_claim(plan: dict, n: int) -> None:
    body = f"🤖 lane claim kind=fix sha={plan['sha']} host={HOST} at={iso()} run={os.environ.get('GITHUB_RUN_ID', '')}"
    plan["claimId"] = gh_json(["api", f"repos/{REPO}/issues/{n}/comments", "-f", f"body={body}"])["id"]


# Deterministic regenerations: the command comes from this table, never from a log.
REGEN = (
    ("workflow-topology", re.compile(r"generated workflow DAG is stale|ci:topology:write"), "pnpm ci:topology:write"),
    ("repository-docs", re.compile(r"repository_docs\.py --write"), "python3 scripts/repository_docs.py --write"),
)
# Classes a model cannot fix by editing files in the checkout.
NOT_MODEL_FIXABLE = frozenset({"pr-body"})
GATE_SKIPS = frozenset({"ci-running", "no-failing-checks", "no-concrete-error", "already-handled-sha",
                        "deterministic-unsupported->lanes", "not-model-fixable->lanes", "sensitive-paths->codex",
                        "model-budget-closed", "attempt-cap->lanes"})


def concrete_error(text: str) -> bool:
    """True when the extract holds an actual error line (not just cleanup noise or nothing)."""
    body = text.split("--- tail ---")[0]
    return any(ERROR_LINE.search(l) and "✓" not in l for l in body.splitlines())


def prepare_red(a, plan: dict, pr: dict) -> int:
    """Everything up to the claim costs $0 and posts nothing: only a PR that reaches a fixing action is
    claimed. Only a model-fixable class with a concrete error extract reaches the model."""
    n, sha = plan["pr"], plan["sha"]
    failures, pending = latest_failures(sha)
    if pending:
        plan.update(outcome="skipped", reason="ci-running", action="none")
        return finish_plan(plan, a)
    if not failures:
        plan.update(outcome="skipped", reason="no-failing-checks", action="none")
        return finish_plan(plan, a)
    logs = {r["name"]: job_log_tail(r) for r in failures[:4]}
    view = {"mergeStateStatus": "BEHIND" if pr.get("mergeable_state") == "behind" else "BLOCKED",
            "statusCheckRollup": [{"name": r["name"], "conclusion": (r["conclusion"] or "").upper()} for r in failures]}
    cls = classes.classify(view, logs)
    plan.update(cls=cls["cls"], fp=cls["key"], action=cls["action"], files_hint=cls["files"],
                checks=cls["checks"], signature=cls["signature"], mergeable=pr.get("mergeable_state"))
    if pr.get("mergeable_state") == "dirty":
        plan.update(action="sync-main", cls="conflict")
    joined = "\n".join(logs.values())
    plan["logDiag"] = LOG_DIAG[:4]
    regen = next((cmd for name, pat, cmd in REGEN if pat.search(joined)), None)
    action = plan["action"]
    skip = None
    if regen and action == classes.AGENT:
        plan.update(action="regen", regen=regen, cls="regen")
        action = "regen"
    elif action in {classes.RENUMBER, classes.REGISTER_DOMAIN}:
        skip = "deterministic-unsupported->lanes"
    elif action == classes.AGENT:
        if cls["cls"] in NOT_MODEL_FIXABLE:
            skip = "not-model-fixable->lanes"
        elif not concrete_error(joined):
            skip = "no-concrete-error"
        elif plan.get("sensitive"):
            skip = "sensitive-paths->codex"
        elif a.agent != "true":
            skip = "model-budget-closed"
    elif action == classes.WIRE_CI_FAST and plan.get("sensitive"):
        skip = "sensitive-paths->codex"
    if not skip:
        counts = receipts_for(n, sha, cls["key"])
        if counts["sha"]:
            skip = "already-handled-sha"
        elif action == classes.AGENT and counts["fp"] >= MAX_ATTEMPTS:
            skip = "attempt-cap->lanes"
    if skip:
        plan.update(outcome="skipped", reason=skip, action="none")
        return finish_plan(plan, a)
    take_claim(plan, n)
    if action == classes.RERUN:
        rerun_failed(failures)
        plan.update(outcome="deterministic-fixed", fix="rerun-failed-jobs", action="none")
    elif action == classes.AGENT:
        Path(a.log).write_text("\n\n".join(f"## {k}\n{v}" for k, v in logs.items()))
    return finish_plan(plan, a)


def rerun_failed(failures: list[dict]) -> None:
    runs = {m.group(1) for r in failures if (m := re.search(r"/runs/(\d+)/", r.get("details_url") or ""))}
    for run_id in sorted(runs)[:3]:
        gh(["api", "-X", "POST", f"repos/{REPO}/actions/runs/{run_id}/rerun-failed-jobs"])


def finish_plan(plan: dict, a) -> int:
    if plan.get("action", "none") != "none" and plan.get("outcome") == "skipped":
        plan["outcome"] = "attempting"  # a fix is in flight; finalize decides pushed vs gave-up
    plan["calls"] = calls
    Path(a.plan).write_text(json.dumps(plan))
    out_var("action", plan.get("action", "none"))
    out_var("ref", plan.get("ref", ""))
    out_var("sha", plan.get("sha", ""))
    out_var("outcome", plan.get("outcome", "skipped"))
    return 0


# ---------------------------------------------------------------- fix / guard

def cmd_fix(a) -> int:
    plan = json.loads(Path(a.plan).read_text())
    cwd = a.cwd
    fixed = None
    if plan["action"] == classes.SYNC_MAIN:
        sh(["git", "fetch", "origin", "main", "--depth=200"], cwd)
        if sh(["git", "-c", "user.name=jovie-swarm", "-c", "user.email=swarm@jov.ie", "rebase", "origin/main"], cwd).returncode == 0:
            fixed = "rebase-main"
        else:
            sh(["git", "rebase", "--abort"], cwd)
            plan.update(outcome="gave-up", reason="rebase-conflict->lanes")
    elif plan["action"] == classes.WIRE_CI_FAST:
        added = classes.wire_ci_fast(Path(cwd), plan.get("files_hint", []))
        if added:
            sh(["git", "add", "-A"], cwd)
            sh(["git", "-c", "user.name=jovie-swarm", "-c", "user.email=swarm@jov.ie", "commit", "-m",
                "fix(ci): wire unwired script tests into ci-fast"], cwd)
            fixed = "wire-ci-fast"
    if fixed:
        plan["fix"] = fixed
        plan["deterministic"] = True
    Path(a.plan).write_text(json.dumps(plan))
    return 0


def diff_stats(cwd: str, base: str) -> tuple[list[str], int]:
    names = sh(["git", "diff", "--name-only", base], cwd).stdout.split()
    stat = sh(["git", "diff", "--numstat", base], cwd).stdout.split("\n")
    lines = sum(int(p[0]) + int(p[1]) for s in stat if (p := s.split("\t")) and len(p) == 3 and p[0].isdigit() and p[1].isdigit())
    return names, lines


def cmd_regen(a) -> int:
    plan = json.loads(Path(a.plan).read_text())
    cmd = plan.get("regen")
    if cmd not in {c for _, _, c in REGEN}:  # only table commands ever run
        plan.update(outcome="gave-up", reason="regen-not-allowlisted")
    else:
        res = subprocess.run(cmd, shell=True, cwd=a.cwd, capture_output=True, text=True, timeout=600)
        if res.returncode != 0:
            plan.update(outcome="gave-up", reason="regen-failed:" + (res.stderr or res.stdout)[-80:].strip())
        else:
            plan.update(fix="regen:" + cmd, deterministic=True)
    Path(a.plan).write_text(json.dumps(plan))
    return 0


def cmd_guard(a) -> int:
    """Passes only a bounded, non-sensitive diff that does not delete or weaken tests."""
    plan = json.loads(Path(a.plan).read_text())
    base = plan["sha"]
    if plan.get("outcome") in {"gave-up", "blocked-credits", "error"}:
        out_var("guard", "fail")  # an earlier step already decided; keep its reason
        return 0
    if plan.get("fix") == "rebase-main":  # history rewrite onto main: nothing of the PR's own diff changes
        out_var("guard", "ok")
        return 0
    sh(["git", "add", "-A"], a.cwd)
    names, lines = diff_stats(a.cwd, base)
    bad = None
    if not names and not plan.get("deterministic"):
        bad = "no-change"
    elif len(names) > MAX_FILES or lines > MAX_LINES:
        bad = f"diff-too-large files={len(names)} lines={lines}"
    elif any(SENSITIVE.search(f) for f in names):
        bad = "touches-sensitive-path->codex"
    else:
        removed = sh(["git", "diff", "--diff-filter=D", "--name-only", base], a.cwd).stdout.split()
        if any(TESTISH.search(f) for f in removed):
            bad = "deletes-test"
        else:
            weak = sh(["git", "diff", "-U0", base], a.cwd).stdout
            if re.search(r"^\+.*(\.skip\(|\.only\(|eslint-disable|@ts-ignore|@ts-expect-error|continue-on-error|--no-verify)", weak, re.M):
                bad = "gate-weakening-pattern"
    plan["diffFiles"], plan["diffLines"] = len(names), lines
    if bad:
        plan.update(outcome="gave-up", reason=bad)
        sh(["git", "reset", "--hard", base], a.cwd)
    out_var("guard", "fail" if bad else "ok")
    Path(a.plan).write_text(json.dumps(plan))
    return 0


# ---------------------------------------------------------------- finalize

def cmd_finalize(a) -> int:
    plan = json.loads(Path(a.plan).read_text())
    meta = json.loads(Path(a.agent_meta).read_text()) if a.agent_meta and Path(a.agent_meta).exists() else {}
    plan.update({k: meta[k] for k in ("model", "costUsd", "tokens", "agentSeconds", "agentSaid", "aborted") if k in meta})
    if plan["outcome"] == "blocked-credits":
        plan["costUsd"] = 0
    elif plan["outcome"] not in {"skipped", "gave-up", "error", "deterministic-fixed"}:
        if a.guard == "ok" and a.repro in {"ok", "n/a"} and push_commit(a, plan):
            plan["outcome"] = "deterministic-fixed" if plan.get("deterministic") else "agent-fixed"
        else:
            plan.update(outcome="gave-up", reason=plan.get("reason") or ("repro-failed" if a.repro == "fail" else "guard-or-push"))
    plan["finishedAt"] = iso()
    plan["seconds"] = int(now() - datetime.fromisoformat(plan["startedAt"].replace("Z", "+00:00")).timestamp())
    plan["calls"] = plan.get("calls", 0) + calls + (2 if plan.get("claimId") else 0)
    if str(plan.get("reason", "")).startswith("rebase-conflict") and plan["outcome"] == "gave-up":
        # a real textual conflict belongs to the conflict lane: label it, never drop it
        gh(["api", "-X", "POST", f"repos/{REPO}/issues/{plan['pr']}/labels", "-f", f"labels[]={CONFLICT_LABEL}"])
        plan["calls"] = plan.get("calls", 0) + 1
    if plan.get("claimId"):
        release_claim(plan)
        if plan["outcome"] not in {"skipped", "blocked-credits"}:
            receipt(plan)
    Path(a.plan).write_text(json.dumps(plan))
    with open(a.metrics, "a") as fh:
        fh.write(json.dumps(plan, sort_keys=True) + "\n")
    return 0


def push_commit(a, plan: dict) -> bool:
    cwd = a.cwd
    token = os.environ["GH_TOKEN"]
    if sh(["git", "status", "--porcelain"], cwd).stdout.strip():
        msg = f"fix(ci): remediate {plan.get('cls', 'red')} on #{plan['pr']} [swarm]\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
        sh(["git", "add", "-A"], cwd)
        res = sh(["git", "-c", "user.name=jovie-swarm", "-c", "user.email=swarm@jov.ie", "commit", "-m", msg], cwd)
        if res.returncode != 0:
            plan["reason"] = "commit-failed"
            return False
    if sh(["git", "rev-parse", "HEAD"], cwd).stdout.strip() == plan["sha"]:
        return False
    import base64
    auth = base64.b64encode(f"x-access-token:{token}".encode()).decode()
    # lease on the exact head we repaired: a concurrent human/agent push wins, we do not clobber it
    res = sh(["git", "-c", "core.hooksPath=/dev/null", "-c", f"http.https://github.com/.extraheader=AUTHORIZATION: basic {auth}",
              "push", f"--force-with-lease=refs/heads/{plan['ref']}:{plan['sha']}", "origin", f"HEAD:refs/heads/{plan['ref']}"], cwd, timeout=180)
    if res.returncode != 0:
        plan["reason"] = "push-rejected:" + res.stderr.replace(token, "***")[-120:]
        return False
    plan["newSha"] = sh(["git", "rev-parse", "HEAD"], cwd).stdout.strip()
    return True


def release_claim(plan: dict) -> None:
    body = f"🤖 lane released kind=fix sha={plan['sha']} host={HOST} at={iso()}"
    gh(["api", "-X", "PATCH", f"repos/{REPO}/issues/comments/{plan['claimId']}", "-f", f"body={body}"])


def receipt(plan: dict) -> None:
    body = (f"🤖 swarm receipt pr={plan['pr']} sha={plan['sha']} fp={plan.get('fp', '-')} class={plan.get('cls', '-')} "
            f"outcome={plan['outcome']} fix={plan.get('fix', plan.get('reason', '-'))} model={plan.get('model', '-')} "
            f"cost_usd={plan.get('costUsd', 0)} seconds={plan['seconds']} api_calls={plan['calls']}")
    gh(["api", f"repos/{REPO}/issues/{plan['pr']}/comments", "-f", f"body={body}"])



# ---------------------------------------------------------------- agent

PROMPT = """You are a bounded CI remediator for one failing pull request in this repo.
Failing checks: {checks}. Failure class: {cls}.
Below are the extracted error and the files it names (truncated). Fix ONLY what the error shows,
editing the fewest files. Do not explore the repo; the files you need are below.
Rules: never edit tests to make them pass (no skip/only/deleted assertions), never touch auth, billing,
migrations, secrets, .github or canon files, never add dependencies, never use --no-verify.
Do not commit or push. If the error is not fixable with a few small edits, change nothing.

=== ERROR EXTRACT ===
{error}

=== FILES NAMED IN THE ERROR ===
{files}
"""
CONTEXT_CHARS = 60_000  # about 15-20k tokens of named files
ERROR_CHARS = 8_000
FILE_REF = re.compile(r"(?<![\w/.-])((?:[\w.@-]+/)*[\w.@-]+\.(?:tsx?|mjs|cjs|jsx?|py|json|ya?ml|md|sh))(?::\d+)?")


def named_files(error: str, cwd: str) -> str:
    """Contents of repo files the error names, bounded in total and per file; sensitive paths excluded."""
    seen, out, used = set(), [], 0
    for m in FILE_REF.finditer(error):
        rel = m.group(1)
        path = Path(cwd) / rel
        if rel in seen or SENSITIVE.search(rel) or not path.is_file() or ".." in rel:
            continue
        seen.add(rel)
        try:
            text = path.read_text()[:15_000]
        except (OSError, UnicodeDecodeError):
            continue
        if used + len(text) > CONTEXT_CHARS:
            break
        used += len(text)
        out.append(f"--- {rel} ---\n{text}")
    return "\n\n".join(out) or "(none of the named files exist in the checkout)"


CREDIT_TEXT = re.compile(r"insufficient[_ ]funds|insufficient credit|payment required|\"status\"\s*:\s*402", re.I)


def gateway_base() -> str:
    """OpenAI-compatible base URL: SWARM_BASE_URL, else the registered ai-gateway host (one registry)."""
    if os.environ.get("SWARM_BASE_URL"):
        return os.environ["SWARM_BASE_URL"]
    registry = json.loads((Path(__file__).resolve().parents[2] / "packages/api-client/providers.json").read_text())
    return "https://" + registry["providers"]["ai-gateway"]["hosts"][0] + "/v1"


def pick_model(base: str, key: str, candidates: list[str]) -> tuple[str, float, float]:
    import urllib.request
    req = urllib.request.Request(base.rstrip("/") + "/models", headers={"Authorization": f"Bearer {key}", "User-Agent": "jovie-pr-remediation-swarm/1"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = {m["id"]: m for m in json.load(resp)["data"]}
    for c in candidates:
        if c in data:
            pricing = data[c].get("pricing") or {}
            # A relay lists no prices: fall back to list price per token so the cost stop still trips.
            p_in = float(pricing.get("input") or 0) or float(os.environ.get("SWARM_PRICE_IN_PER_M", "0.15")) / 1e6
            p_out = float(pricing.get("output") or 0) or float(os.environ.get("SWARM_PRICE_OUT_PER_M", "0.50")) / 1e6
            return c, p_in, p_out
    raise SystemExit(f"no candidate model available: {candidates}")


def walk_cost(node, acc: dict) -> None:
    if isinstance(node, dict):
        if isinstance(node.get("tokens"), dict):
            t = node["tokens"]
            acc["in"] += int(t.get("input") or 0) + int(t.get("cache", {}).get("read", 0) if isinstance(t.get("cache"), dict) else 0)
            acc["out"] += int(t.get("output") or 0) + int(t.get("reasoning") or 0)
        for v in node.values():
            walk_cost(v, acc)
    elif isinstance(node, list):
        for v in node:
            walk_cost(v, acc)


def cmd_agent(a) -> int:
    """Run opencode with no shell, no key in its env (provider key is read from a file outside the
    checkout), and a hard stop when the running cost passes the per-attempt cap."""
    plan = json.loads(Path(a.plan).read_text())
    base = gateway_base()
    key_file = Path(a.key_file)
    key = key_file.read_text().strip()
    cands = [m.strip() for m in os.environ.get("SWARM_MODELS", "zai/glm-5.3-flash,deepseek/deepseek-v4-flash,zai/glm-5.2").split(",")]
    cap = float(os.environ.get("SWARM_ATTEMPT_USD_CAP", "0.10"))
    try:
        model, p_in, p_out = pick_model(base, key, cands)
    except OSError as exc:  # urllib HTTPError/URLError are OSErrors; 402 = no credit
        key_file.unlink(missing_ok=True)
        blocked = "402" in str(exc) or "insufficient" in str(exc).lower()
        plan.update(outcome="blocked-credits" if blocked else "gave-up",
                    reason="gateway-insufficient_funds" if blocked else "relay-unreachable:" + str(exc)[:80])
        Path(a.plan).write_text(json.dumps(plan))
        Path(a.meta).write_text(json.dumps({"costUsd": 0, "aborted": plan["reason"]}))
        return 0
    config = {"$schema": "https://opencode.ai/config.json", "autoupdate": False, "share": "disabled",
              "provider": {"swarm": {"npm": "@ai-sdk/openai-compatible", "name": "swarm",
                                      "options": {"baseURL": base, "apiKey": "{file:" + str(key_file) + "}"},
                                      "models": {model: {"name": model}}}},
              # No shell at all: the push gate's preflight is the only executor, in a step with no secrets.
              "permission": {"edit": "allow", "bash": "deny", "webfetch": "deny", "external_directory": "deny"},
              "agent": {"build": {"steps": a.max_steps}}}
    env = {k: v for k, v in os.environ.items() if k not in {"SWARM_API_KEY", "GH_TOKEN", "GITHUB_TOKEN"}}
    env["OPENCODE_CONFIG_CONTENT"] = json.dumps(config)
    error = Path(a.log).read_text()[:ERROR_CHARS]
    prompt = PROMPT.format(checks=", ".join(plan.get("checks", [])), cls=plan.get("cls"), error=error,
                           files=named_files(error, a.cwd))
    started = now()
    acc = {"in": 0, "out": 0}
    reported = 0.0
    aborted = None
    blocked_credits = False
    last_text = ""
    proc = subprocess.Popen(["npx", "--yes", "opencode-ai@1.19.5", "run", "--format", "json", "-m", f"swarm/{model}", prompt],
                            cwd=a.cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    try:
        for line in proc.stdout:
            try:
                ev = json.loads(line)
            except ValueError:
                continue
            # Only an error event counts: the agent echoes repo text that may mention payments.
            if isinstance(ev, dict) and (ev.get("type") == "error" or "error" in ev) and CREDIT_TEXT.search(line):
                blocked_credits = True
                aborted = "blocked-credits"
                break
            if isinstance(ev, dict) and ev.get("type") == "text":
                last_text = str((ev.get("part") or {}).get("text") or "")[-300:] or last_text
            step = {"in": 0, "out": 0}
            walk_cost(ev, step)
            acc["in"] += step["in"]; acc["out"] += step["out"]
            reported += sum_reported_cost(ev)
            spent = max(acc["in"] * p_in + acc["out"] * p_out, reported)
            if spent > cap:
                aborted = f"attempt-cap ${spent:.4f}>${cap}"
                break
            if now() - started > a.timeout:
                aborted = "timeout"
                break
    finally:
        if proc.poll() is None:
            proc.kill()
        key_file.unlink(missing_ok=True)
    cost = max(acc["in"] * p_in + acc["out"] * p_out, reported)
    meta = {"model": model, "costUsd": round(cost, 5), "tokens": acc, "agentSeconds": int(now() - started),
            "agentSaid": last_text}
    if blocked_credits:
        meta["costUsd"] = 0  # no credit means nothing was charged: never reaches the ledger
        plan.update(outcome="blocked-credits", reason="gateway-insufficient_funds")
        sh(["git", "checkout", "--", "."], a.cwd)
        sh(["git", "clean", "-fdq"], a.cwd)
        Path(a.plan).write_text(json.dumps(plan))
    elif aborted:
        meta["aborted"] = aborted
        plan.update(reason="agent-" + aborted.split(" ")[0])
        sh(["git", "checkout", "--", "."], a.cwd)
        sh(["git", "clean", "-fdq"], a.cwd)
        Path(a.plan).write_text(json.dumps(plan))
    Path(a.meta).write_text(json.dumps(meta))
    return 0


def sum_reported_cost(node) -> float:
    if isinstance(node, dict):
        own = node.get("cost")
        return (float(own) if isinstance(own, (int, float)) else 0.0) + sum(sum_reported_cost(v) for v in node.values())
    if isinstance(node, list):
        return sum(sum_reported_cost(v) for v in node)
    return 0.0


# ---------------------------------------------------------------- summarize

ALARM_USD_PER_GREENED = 0.10


def cmd_summarize(a) -> int:
    rows = [json.loads(l) for p in Path(a.dir).rglob("*.jsonl") for l in p.read_text().splitlines() if l.strip()]
    by: dict[str, int] = {}
    for r in rows:
        by[r["outcome"]] = by.get(r["outcome"], 0) + 1
    cost = sum(float(r.get("costUsd") or 0) for r in rows)
    api = sum(int(r.get("calls") or 0) for r in rows)
    behind = [r for r in rows if r.get("kind") == "behind"]
    updated = sum(1 for r in behind if r["outcome"] == "deterministic-fixed")
    conflicts = [r for r in rows if r.get("kind") == "conflict"]
    cleared = sum(1 for r in conflicts if r["outcome"] == "deterministic-fixed")
    reds = [r for r in rows if r.get("kind") not in {"conflict", "behind"}]
    greened = sum(1 for r in reds if r["outcome"] in ("deterministic-fixed", "agent-fixed"))
    gated = sum(1 for r in rows if r["outcome"] == "skipped" and r.get("reason") in GATE_SKIPS)
    attempted = [r for r in rows if r.get("model")]
    per_green = (cost / greened) if greened else None
    lines = ["## Remediation swarm", "",
             f"attempts={len(rows)} reds={len(reds)} reds-pushed-or-rerun={greened} conflicts={len(conflicts)} "
             f"conflicts-cleared={cleared} behind={len(behind)} behind-updated={updated} "
             f"blocked-credits={by.get('blocked-credits', 0)} cost=${cost:.4f} api_calls={api}", "",
             f"gate-skipped={gated}/{len(rows)} ({(100 * gated // len(rows)) if rows else 0}%) model-attempts={len(attempted)} "
             f"usd-per-greened={'n/a (none greened)' if per_green is None else f'${per_green:.4f}'}", "",
             "| outcome | n |", "|---|---|", *[f"| {k} | {v} |" for k, v in sorted(by.items())]]
    if cost > 0 and (per_green is None or per_green > ALARM_USD_PER_GREENED):
        msg = (f"swarm spent ${cost:.4f} for {greened} greened PRs"
               + ("" if per_green is None else f" (${per_green:.4f} each)") + f"; alarm above ${ALARM_USD_PER_GREENED:.2f} per greened PR")
        print(f"::warning title=swarm cost per greened PR::{msg}")
        lines += ["", f"ALARM: {msg}"]
    Path(a.out).write_text("\n".join(lines) + "\n")
    out_var("cents", str(int(round(cost * 100 + 0.499))) if cost > 0 else "0")
    out_var("attempts", str(len(rows)))
    out_var("greened", str(greened))
    return 0


MIN_GH = (2, 40, 0)


def gh_version() -> str:
    try:
        first = run_gh(["--version"])["stdout"].splitlines()[0]
        return first.split()[2] if first.startswith("gh version") else first
    except (OSError, IndexError):
        return "unknown"


def cmd_smoke(a) -> int:
    """Runner-side canary for the log path: log the gh version and fetch a known completed job's log
    through the exact production fetch. Exits 1 (no fan-out) if no readable log can be found, so
    client drift (e.g. gh refusing escape sequences) fails loudly here instead of silently skipping
    every PR. The scan is deliberately wide (50 runs, all jobs per run): at this repo's run rate the
    newest completed runs are mostly skipped/cancelled event handlers and the newest eligible jobs
    may still be uploading logs, so a narrow window gives false negatives (run 40936622218)."""
    version = gh_version()
    parts = tuple(int(x) for x in re.findall(r"\d+", version)[:3]) or (0,)
    print(f"gh version {version} (minimum {'.'.join(map(str, MIN_GH))})")
    out_var("gh_version", version)
    if parts < MIN_GH:
        print(f"::error title=swarm smoke::gh {version} is older than the supported minimum")
        return 1
    runs = gh_json(["api", f"repos/{REPO}/actions/runs?status=completed&per_page=50"], priority="report")["workflow_runs"]
    conclusions: dict[str, int] = {}
    eligible_runs = eligible_jobs = tried = 0
    for run in runs:
        conc = run.get("conclusion") or "none"
        conclusions[conc] = conclusions.get(conc, 0) + 1
        if conc not in {"success", "failure"}:
            continue
        jobs = gh_json(["api", f"repos/{REPO}/actions/runs/{run['id']}/jobs?per_page=100"], priority="report")["jobs"]
        eligible = [j for j in jobs if j.get("conclusion") in {"success", "failure"} and j.get("started_at")]
        if eligible:
            eligible_runs += 1
        for job in eligible:
            eligible_jobs += 1
            log = fetch_job_log(job["id"])
            size = len(log.stdout or "")
            tried += 1
            print(f"smoke job {job['id']} ({job['name']}): rc={log.returncode} bytes={size} err={(log.stderr or '')[:100]!r}")
            if log.returncode == 0 and size > 0:
                return 0
            if "escape" in (log.stderr or "") or tried >= 6:
                print(f"::error title=swarm smoke::job log fetch returned rc={log.returncode} bytes={size}; gh {version} cannot read job logs")
                return 1
    print(f"::error title=swarm smoke::no readable completed job log to smoke-test the log fetch "
          f"(scanned {len(runs)} recent completed runs, conclusions={json.dumps(conclusions, sort_keys=True)}, "
          f"eligible_runs={eligible_runs}, eligible_jobs={eligible_jobs}, log_attempts={tried})")
    return 1


def cmd_diagnose(a) -> int:
    """Local, read-only replay of the runner's gate for PRs: the same API calls, job selection and
    extraction as prepare_red, with whatever token `gh` holds. Posts nothing, claims nothing."""
    for n in (int(x) for x in a.prs.split(",") if x.strip()):
        pr = gh_json(["api", f"repos/{REPO}/pulls/{n}"])
        sha = pr["head"]["sha"]
        runs = gh_json(["api", f"repos/{REPO}/commits/{sha}/check-runs?per_page=100"])["check_runs"]
        latest: dict[str, dict] = {}
        for r in runs:
            if r["name"] not in latest or r["id"] > latest[r["name"]]["id"]:
                latest[r["name"]] = r
        print(f"== #{n} {sha[:9]} state={pr['mergeable_state']} check-runs={len(runs)} distinct={len(latest)}")
        failures, pending = latest_failures(sha)
        print(f"   failing={[r['name'] for r in failures]} pending={pending}")
        for r in failures[:4]:
            app = (r.get("app") or {}).get("slug")
            m = re.search(r"/runs/(\d+)/job/(\d+)", r.get("details_url") or "")
            out = fetch_job_log(r["id"])
            attempt = ""
            if m:
                job = gh_json(["api", f"repos/{REPO}/actions/jobs/{m.group(2)}"])
                attempt = f" run_attempt={job.get('run_attempt')} job_conclusion={job.get('conclusion')} id_match={str(job['id']) == str(r['id'])}"
            text = extract_failure(out.stdout) if out.returncode == 0 else ""
            print(f"   - {r['name']!r} id={r['id']} app={app} conclusion={r['conclusion']} details={'job' if m else 'NO-JOB-URL'}"
                  f" logs rc={out.returncode} bytes={len(out.stdout or '')} err={(out.stderr or '')[:80]!r}{attempt}")
            print(f"     extract_lines={len(text.splitlines())} concrete={concrete_error(text)} classify={classes.classify({'mergeStateStatus': 'BLOCKED', 'statusCheckRollup': [{'name': r['name'], 'conclusion': r['conclusion'].upper()}]}, {r['name']: text})['cls']}")
            if a.show:
                print("     " + text.split("--- tail ---")[0][-600:].replace("\n", "\n     "))
    return 0


def main() -> int:
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("select"); s.add_argument("--pr", default=""); s.add_argument("--limit", type=int, default=30)
    s.add_argument("--daily-cap-usd", type=float, default=5.0); s.add_argument("--attempt-cap-usd", type=float, default=0.10)
    s.add_argument("--ledger-issue", default=""); s.add_argument("--behind-limit", type=int, default=10); s.add_argument("--modes", default="all")
    pr = sub.add_parser("prepare"); pr.add_argument("--pr", type=int, required=True); pr.add_argument("--plan", required=True); pr.add_argument("--log", required=True); pr.add_argument("--mode", default="red"); pr.add_argument("--agent", default="true")
    for name in ("fix", "guard", "regen"):
        x = sub.add_parser(name); x.add_argument("--plan", required=True); x.add_argument("--cwd", required=True)
    g = sub.add_parser("agent"); g.add_argument("--plan", required=True); g.add_argument("--cwd", required=True)
    g.add_argument("--log", required=True); g.add_argument("--meta", required=True); g.add_argument("--key-file", required=True)
    g.add_argument("--max-steps", type=int, default=8); g.add_argument("--timeout", type=int, default=600)
    f = sub.add_parser("finalize"); f.add_argument("--plan", required=True); f.add_argument("--cwd", required=True)
    f.add_argument("--guard", default="fail"); f.add_argument("--repro", default="n/a"); f.add_argument("--agent-meta", default="")
    f.add_argument("--metrics", required=True)
    l = sub.add_parser("ledger"); l.add_argument("--issue", required=True); l.add_argument("--run", required=True); l.add_argument("--cents", required=True)
    sub.add_parser("smoke")
    d = sub.add_parser("diagnose"); d.add_argument("--prs", required=True); d.add_argument("--show", action="store_true")
    m = sub.add_parser("summarize"); m.add_argument("--dir", required=True); m.add_argument("--out", required=True)
    a = p.parse_args()
    return {"select": cmd_select, "prepare": cmd_prepare, "fix": cmd_fix, "regen": cmd_regen, "agent": cmd_agent, "guard": cmd_guard,
            "finalize": cmd_finalize, "diagnose": cmd_diagnose, "smoke": cmd_smoke, "ledger": cmd_ledger, "summarize": cmd_summarize}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
