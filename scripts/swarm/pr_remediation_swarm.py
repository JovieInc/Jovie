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
    if a.pr:
        for n in (int(x) for x in a.pr.split(",") if x.strip()):
            modes[n] = "red"
    else:
        for label, mode in ((LABEL, "red"), (CONFLICT_LABEL, "conflict")):
            for page in range(1, 6):
                rows = gh_json(["api", f"repos/{REPO}/issues?labels={label}&state=open&per_page=100&page={page}"], priority="report")
                for row in rows:
                    labels = {l["name"].lower() for l in row.get("labels", [])}
                    if "pull_request" in row and not labels & SKIP_LABELS:
                        modes.setdefault(row["number"], mode)  # red wins: sync-main is part of its ladder
                if len(rows) < 100:
                    break
    numbers = [n for n in modes if n not in EXCLUDED]
    spent = day_spend_cents(a.ledger_prefix)
    budget_left = max(0.0, a.daily_cap_usd * 100 - spent)
    afford = int(budget_left // max(1.0, a.attempt_cap_usd * 100))
    # Each attempt costs ~6 calls; keep a quarter of the remaining quota in reserve.
    by_quota = int((remaining * 0.75) // 8)
    take = max(0, min(len(numbers), a.limit, afford, by_quota))
    matrix = [{"pr": n, "mode": modes[n]} for n in numbers[:take]]
    print(f"red={len(numbers)} take={take} quota={remaining}/{limit} spent_cents={spent} afford={afford}")
    out_var("matrix", json.dumps(matrix))
    out_var("reason", "ok" if matrix else ("daily-cap" if afford == 0 else "none"))
    return 0


def day_spend_cents(prefix: str) -> int:
    """Today's swarm spend, from artifact names `<prefix>-<run>-c<cents>`; no download needed."""
    if not prefix:
        return 0
    try:
        data = gh_json(["api", f"repos/{REPO}/actions/artifacts?per_page=100"])
    except RuntimeError:
        return 0
    today = iso()[:10]
    total = 0
    for art in data.get("artifacts", []):
        m = re.search(r"-c(\d+)$", art.get("name", ""))
        if m and art.get("name", "").startswith(prefix) and str(art.get("created_at", ""))[:10] == today:
            total += int(m.group(1))
    return total


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


def job_log_tail(run: dict, n: int = 400) -> str:
    out = gh(["api", f"repos/{REPO}/actions/jobs/{run['id']}/logs"])
    if out.returncode != 0:
        return ""
    lines = out.stdout.splitlines()
    return "\n".join(lines[-n:])


def attempts_for(number: int, key: str) -> int:
    rows = gh_json(["api", f"repos/{REPO}/issues/{number}/comments?per_page=100&since={iso(now() - 24 * 3600)}"])
    return sum(1 for r in rows if (r.get("body") or "").startswith("🤖 swarm receipt") and f"fp={key}" in r["body"])


def cmd_prepare(a) -> int:
    n = a.pr
    plan: dict = {"kind": a.mode, "schema": SCHEMA, "pr": n, "startedAt": iso(), "outcome": "skipped", "action": "none"}
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
            if any(SENSITIVE.search(f) for f in plan["files"]):
                why = "sensitive-paths->codex"
        if why:
            plan.update(outcome="skipped", reason=why)
            return finish_plan(plan, a)
        body = f"🤖 lane claim kind=fix sha={plan['sha']} host={HOST} at={iso()} run={os.environ.get('GITHUB_RUN_ID', '')}"
        cid = gh_json(["api", f"repos/{REPO}/issues/{n}/comments", "-f", f"body={body}"])["id"]
        plan["claimId"] = cid
        if a.mode == "conflict":
            if pr.get("mergeable_state") != "dirty":
                plan.update(outcome="skipped", reason="not-conflicting", action="none")
            else:
                plan.update(cls="conflict", action="sync-main", fp="conflict")
            return finish_plan(plan, a)
        failures, pending = latest_failures(plan["sha"])
        if pending:
            plan.update(outcome="skipped", reason="ci-running", action="none")
            return finish_plan(plan, a)
        logs = {r["name"]: job_log_tail(r) for r in failures[:4]}
        view = {"mergeStateStatus": "BEHIND" if pr.get("mergeable_state") == "behind" else "BLOCKED",
                "statusCheckRollup": [{"name": r["name"], "conclusion": (r["conclusion"] or "").upper()} for r in failures]}
        cls = classes.classify(view, logs)
        plan.update(cls=cls["cls"], fp=cls["key"], action=cls["action"], files_hint=cls["files"],
                    checks=cls["checks"], signature=cls["signature"], mergeable=pr.get("mergeable_state"))
        if pr.get("mergeable_state") == "dirty":
            plan.update(action="sync-main", cls="conflict")
        if plan["action"] == classes.AGENT:
            if attempts_for(n, cls["key"]) >= MAX_ATTEMPTS:
                plan.update(outcome="gave-up", reason="attempt-cap->lanes", action="none")
            else:
                Path(a.log).write_text("\n\n".join(f"## {k}\n{v}" for k, v in logs.items()))
        elif plan["action"] == classes.RERUN:
            rerun_failed(failures)
            plan.update(outcome="deterministic-fixed", fix="rerun-failed-jobs", action="none")
        elif not failures:
            plan.update(outcome="skipped", reason="no-failures", action="none")
    except Exception as exc:  # never raise past the claim: finalize must release it
        plan.update(outcome="error", reason=str(exc)[:200], action="none")
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
        if sh(["git", "rebase", "origin/main"], cwd).returncode == 0:
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


def cmd_guard(a) -> int:
    """Passes only a bounded, non-sensitive diff that does not delete or weaken tests."""
    plan = json.loads(Path(a.plan).read_text())
    base = plan["sha"]
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
    plan.update({k: meta[k] for k in ("model", "costUsd", "tokens", "agentSeconds") if k in meta})
    if plan["outcome"] not in {"skipped", "gave-up", "error", "deterministic-fixed"}:
        if a.guard == "ok" and a.repro in {"ok", "n/a"} and push_commit(a, plan):
            plan["outcome"] = "deterministic-fixed" if plan.get("deterministic") else "agent-fixed"
        else:
            plan.update(outcome="gave-up", reason=plan.get("reason") or ("repro-failed" if a.repro == "fail" else "guard-or-push"))
    plan["finishedAt"] = iso()
    plan["seconds"] = int(now() - datetime.fromisoformat(plan["startedAt"].replace("Z", "+00:00")).timestamp())
    plan["calls"] = plan.get("calls", 0) + calls + (2 if plan.get("claimId") else 0)
    if plan.get("claimId"):
        release_claim(plan)
        if plan["outcome"] != "skipped":
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
    body = (f"🤖 swarm receipt pr={plan['pr']} fp={plan.get('fp', '-')} class={plan.get('cls', '-')} "
            f"outcome={plan['outcome']} fix={plan.get('fix', plan.get('reason', '-'))} model={plan.get('model', '-')} "
            f"cost_usd={plan.get('costUsd', 0)} seconds={plan['seconds']} api_calls={plan['calls']}")
    gh(["api", f"repos/{REPO}/issues/{plan['pr']}/comments", "-f", f"body={body}"])



# ---------------------------------------------------------------- agent

PROMPT = """You are a bounded CI remediator for one failing pull request in this repo.
Failing checks: {checks}. Failure class: {cls}.
The failed job log tail is in {log}. Fix ONLY what the log shows, editing the fewest files.
Rules: never edit tests to make them pass (no skip/only/deleted assertions), never touch auth, billing,
migrations, secrets, .github or canon files, never add dependencies, never use --no-verify.
Do not commit or push. Stop after the minimal fix; if the failure is not fixable in a few small
edits, change nothing."""


def gateway_base() -> str:
    """OpenAI-compatible base URL: SWARM_BASE_URL, else the registered ai-gateway host (one registry)."""
    if os.environ.get("SWARM_BASE_URL"):
        return os.environ["SWARM_BASE_URL"]
    registry = json.loads((Path(__file__).resolve().parents[2] / "packages/api-client/providers.json").read_text())
    return "https://" + registry["providers"]["ai-gateway"]["hosts"][0] + "/v1"


def pick_model(base: str, key: str, candidates: list[str]) -> tuple[str, float, float]:
    import urllib.request
    req = urllib.request.Request(base.rstrip("/") + "/models", headers={"Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = {m["id"]: m for m in json.load(resp)["data"]}
    for c in candidates:
        if c in data:
            pricing = data[c].get("pricing") or {}
            return c, float(pricing.get("input") or 0), float(pricing.get("output") or 0)
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
    model, p_in, p_out = pick_model(base, key, cands)
    config = {"$schema": "https://opencode.ai/config.json", "autoupdate": False, "share": "disabled",
              "provider": {"swarm": {"npm": "@ai-sdk/openai-compatible", "name": "swarm",
                                      "options": {"baseURL": base, "apiKey": "{file:" + str(key_file) + "}"},
                                      "models": {model: {"name": model}}}},
              # No shell at all: the push gate's preflight is the only executor, in a step with no secrets.
              "permission": {"edit": "allow", "bash": "deny", "webfetch": "deny", "external_directory": "deny"},
              "agent": {"build": {"steps": a.max_steps}}}
    env = {k: v for k, v in os.environ.items() if k not in {"SWARM_API_KEY", "GH_TOKEN", "GITHUB_TOKEN"}}
    env["OPENCODE_CONFIG_CONTENT"] = json.dumps(config)
    prompt = PROMPT.format(checks=", ".join(plan.get("checks", [])), cls=plan.get("cls"), log=a.log)
    started = now()
    acc = {"in": 0, "out": 0}
    reported = 0.0
    aborted = None
    proc = subprocess.Popen(["npx", "--yes", "opencode-ai@1.19.5", "run", "--format", "json", "-m", f"swarm/{model}", prompt],
                            cwd=a.cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    try:
        for line in proc.stdout:
            try:
                ev = json.loads(line)
            except ValueError:
                continue
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
    meta = {"model": model, "costUsd": round(cost, 5), "tokens": acc, "agentSeconds": int(now() - started)}
    if aborted:
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

def cmd_summarize(a) -> int:
    rows = [json.loads(l) for p in Path(a.dir).rglob("*.jsonl") for l in p.read_text().splitlines() if l.strip()]
    by: dict[str, int] = {}
    for r in rows:
        by[r["outcome"]] = by.get(r["outcome"], 0) + 1
    cost = sum(float(r.get("costUsd") or 0) for r in rows)
    api = sum(int(r.get("calls") or 0) for r in rows)
    greened = by.get("deterministic-fixed", 0) + by.get("agent-fixed", 0)
    conflicts = [r for r in rows if r.get("kind") == "conflict"]
    cleared = sum(1 for r in conflicts if r["outcome"] == "deterministic-fixed")
    reds = [r for r in rows if r.get("kind") != "conflict"]
    greened = sum(1 for r in reds if r["outcome"] in ("deterministic-fixed", "agent-fixed"))
    lines = [f"## Remediation swarm", "", f"attempts={len(rows)} reds={len(reds)} reds-pushed-or-rerun={greened} "
             f"conflicts={len(conflicts)} conflicts-cleared={cleared} cost=${cost:.4f} api_calls={api}", "",
             "| outcome | n |", "|---|---|", *[f"| {k} | {v} |" for k, v in sorted(by.items())]]
    Path(a.out).write_text("\n".join(lines) + "\n")
    out_var("cents", str(int(round(cost * 100 + 0.499))))
    out_var("attempts", str(len(rows)))
    return 0


def main() -> int:
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("select"); s.add_argument("--pr", default=""); s.add_argument("--limit", type=int, default=30)
    s.add_argument("--daily-cap-usd", type=float, default=5.0); s.add_argument("--attempt-cap-usd", type=float, default=0.10)
    s.add_argument("--ledger-prefix", default="swarm-ledger")
    pr = sub.add_parser("prepare"); pr.add_argument("--pr", type=int, required=True); pr.add_argument("--plan", required=True); pr.add_argument("--log", required=True); pr.add_argument("--mode", default="red")
    for name in ("fix", "guard"):
        x = sub.add_parser(name); x.add_argument("--plan", required=True); x.add_argument("--cwd", required=True)
    g = sub.add_parser("agent"); g.add_argument("--plan", required=True); g.add_argument("--cwd", required=True)
    g.add_argument("--log", required=True); g.add_argument("--meta", required=True); g.add_argument("--key-file", required=True)
    g.add_argument("--max-steps", type=int, default=25); g.add_argument("--timeout", type=int, default=600)
    f = sub.add_parser("finalize"); f.add_argument("--plan", required=True); f.add_argument("--cwd", required=True)
    f.add_argument("--guard", default="fail"); f.add_argument("--repro", default="n/a"); f.add_argument("--agent-meta", default="")
    f.add_argument("--metrics", required=True)
    m = sub.add_parser("summarize"); m.add_argument("--dir", required=True); m.add_argument("--out", required=True)
    a = p.parse_args()
    return {"select": cmd_select, "prepare": cmd_prepare, "fix": cmd_fix, "agent": cmd_agent, "guard": cmd_guard,
            "finalize": cmd_finalize, "summarize": cmd_summarize}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
