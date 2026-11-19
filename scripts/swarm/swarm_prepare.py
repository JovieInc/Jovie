"""Prepare/fix/guard/finalize helpers, split out so pr_remediation_swarm.py stays under the size ratchet.

Patched helpers (gh, gh_json, latest_failures, job_log_tail, receipts_for, take_claim, concrete_error,
out_var, fetch_job_log, gh_version) are resolved at call time from pr_remediation_swarm.
"""
# api-budget: github-app-core 400/hr - moved with cmd_prepare/cmd_finalize/claim/receipt from pr_remediation_swarm.py; a remediating run uses claim, log reads, labels and a receipt on the App token, not GITHUB_TOKEN
from __future__ import annotations

import json
import os
import re
from datetime import datetime
from pathlib import Path


def _s():
    import pr_remediation_swarm as s
    return s

def claim_live(number: int, sha: str) -> bool:
    s = _s()
    gh, iso, now, CLAIM_TTL_S = s.gh, s.iso, s.now, s.CLAIM_TTL_S
    REPO = s.REPO
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
    s = _s()
    gh_json, REPO, fetch_job_log = s.gh_json, s.REPO, s.fetch_job_log
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
    s = _s()
    gh = s.gh
    REPO = s.REPO
    url = f"repos/{REPO}/actions/jobs/{job_id}/logs"
    out = gh(["api", url])
    if out.returncode != 0 and "allow-escape-sequences" in (out.stderr or ""):
        out = gh(["api", "--allow-escape-sequences", url])
    return out


def job_log_tail(run: dict) -> str:
    s = _s()
    fetch_job_log = s.fetch_job_log
    extract_failure, LOG_DIAG = s.extract_failure, LOG_DIAG
    out = fetch_job_log(run["id"])
    LOG_DIAG.append({"check": run["name"], "rc": out.returncode, "bytes": len(out.stdout or ""),
                     "err": (out.stderr or "")[:120]})
    if out.returncode != 0:
        return ""
    return extract_failure(out.stdout)


def receipts_for(number: int, sha: str, key: str) -> dict | None:
    """Swarm receipts on the PR in the last 24h: {fp: attempts for this failure, sha: handled this head}."""
    s = _s()
    gh_json, REPO = s.gh_json, s.REPO
    try:
        rows = gh_json(["api", f"repos/{REPO}/issues/{number}/comments?per_page=100&since={iso(now() - 24 * 3600)}"])
    except RuntimeError:
        return {"fp": MAX_ATTEMPTS, "sha": 0}  # unreadable evidence fails closed: no attempt
    mine = [r.get("body") or "" for r in rows if (r.get("body") or "").startswith("🤖 swarm receipt")]
    return {"fp": sum(1 for b in mine if f"fp={key}" in b), "sha": sum(1 for b in mine if f"sha={sha}" in b)}


def cmd_prepare(a) -> int:
    s = _s()
    gh_json, gh_version, iso, SCHEMA = s.gh_json, s.gh_version, s.iso, s.SCHEMA
    REPO, out_var, prepare_red, finish_plan = s.REPO, s.out_var, s.prepare_red, s.finish_plan
    latest_failures, job_log_tail = s.latest_failures, s.job_log_tail
    HOST = s.HOST
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
    s = _s()
    gh_json, gh, REPO, iso = s.gh_json, s.gh, s.REPO, s.iso
    now, CLAIM_TTL_S = s.now, s.CLAIM_TTL_S
    HOST = s.HOST
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
    s = _s()
    model_mode_on, latest_failures, job_log_tail, concrete_error = s.model_mode_on, s.latest_failures, s.job_log_tail, s.concrete_error
    receipts_for, take_claim, classes, MAX_ATTEMPTS = s.receipts_for, s.take_claim, s.classes, s.MAX_ATTEMPTS
    out_var, finish_plan, rerun_failed, iso = s.out_var, s.finish_plan, s.rerun_failed, s.iso
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
    skip = classes.owner_handoff_reason(cls) if action == cls["action"] else None
    if regen and action == classes.AGENT:
        plan.update(action="regen", regen=regen, cls="regen")
        action = "regen"
    elif action in {classes.RENUMBER, classes.REGISTER_DOMAIN, classes.BIOME_FORMAT}:
        skip = "deterministic-unsupported->lanes"
    elif action == classes.AGENT:
        if cls["cls"] in NOT_MODEL_FIXABLE:
            skip = "not-model-fixable->lanes"
        elif not concrete_error(joined):
            skip = "no-concrete-error"
        elif plan.get("sensitive"):
            skip = "sensitive-paths->codex"
        elif a.agent != "true" or not model_mode_on():
            skip = "model-budget-closed"  # before any claim or receipt: turning the switch on later finds a clean head
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
    s = _s()
    gh = s.gh
    runs = {m.group(1) for r in failures if (m := re.search(r"/runs/(\d+)/", r.get("details_url") or ""))}
    for run_id in sorted(runs)[:3]:
        gh(["api", "-X", "POST", f"repos/{REPO}/actions/runs/{run_id}/rerun-failed-jobs"])


def finish_plan(plan: dict, a) -> int:
    s = _s()
    out_var = s.out_var
    calls = s.calls
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
    s = _s()
    sh, classes = s.sh, s.classes
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
    s = _s()
    sh = s.sh
    names = sh(["git", "diff", "--name-only", base], cwd).stdout.split()
    stat = sh(["git", "diff", "--numstat", base], cwd).stdout.split("\n")
    lines = sum(int(p[0]) + int(p[1]) for s in stat if (p := s.split("\t")) and len(p) == 3 and p[0].isdigit() and p[1].isdigit())
    return names, lines


def cmd_regen(a) -> int:
    s = _s()
    sh, diff_stats = s.sh, s.diff_stats
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
    s = _s()
    diff_stats, MAX_FILES, MAX_LINES = s.diff_stats, s.MAX_FILES, s.MAX_LINES
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
    s = _s()
    iso, now, gh, REPO = s.iso, s.now, s.gh, s.REPO
    CONFLICT_LABEL, push_commit, release_claim, receipt = s.CONFLICT_LABEL, s.push_commit, s.release_claim, s.receipt
    calls = s.calls
    plan = json.loads(Path(a.plan).read_text())
    meta = json.loads(Path(a.agent_meta).read_text()) if a.agent_meta and Path(a.agent_meta).exists() else {}
    plan.update({k: meta[k] for k in ("model", "costUsd", "oopUsd", "creditUsd", "providersTried", "tokens",
                                      "agentSeconds", "agentSaid", "aborted") if k in meta})
    if plan["outcome"] == "blocked-credits":
        pass  # tokens served before the credits error still cost: costUsd stays as metered
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
    s = _s()
    sh, REPO = s.sh, s.REPO
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
    s = _s()
    gh, REPO = s.gh, s.REPO
    body = f"🤖 lane released kind=fix sha={plan['sha']} host={HOST} at={iso()}"
    gh(["api", "-X", "PATCH", f"repos/{REPO}/issues/comments/{plan['claimId']}", "-f", f"body={body}"])


def receipt(plan: dict) -> None:
    s = _s()
    gh, REPO, SCHEMA = s.gh, s.REPO, s.SCHEMA
    HOST = s.HOST
    body = (f"🤖 swarm receipt pr={plan['pr']} sha={plan['sha']} fp={plan.get('fp', '-')} class={plan.get('cls', '-')} "
            f"outcome={plan['outcome']} fix={plan.get('fix', plan.get('reason', '-'))} model={plan.get('model', '-')} "
            f"cost_usd={plan.get('costUsd', 0)} seconds={plan['seconds']} api_calls={plan['calls']}")
    gh(["api", f"repos/{REPO}/issues/{plan['pr']}/comments", "-f", f"body={body}"])
