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
import fix_red_classes as classes, model_pool_calls  # noqa: E401,E402  (model_pool_calls: no Anthropic model on the gateway)
from apiclient.gh import run_gh  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parent))
import provider_order as po  # noqa: E402  (credits-first order; never the Vercel AI Gateway)

SCHEMA = "jovie-remediation-swarm/v1"
HOST = "gha-swarm"
REPO = os.environ.get("GITHUB_REPOSITORY", "JovieInc/Jovie")
CLAIM_TTL_S = 60 * 60  # same TTL as scripts/lanes/pr_events.py CLAIM_TTL_S
RECENT_PUSH_S = 20 * 60
LABEL = "lane-fix-red"
CONFLICT_LABEL = "lane-fix-conflict"
SKIP_LABELS = {"lane-fix-exhausted", "queue-poison", "swarm-gave-up", "hold", "do-not-merge"}
# The launch shepherd owns these; never touched (coordinator 2026-10-28).
EXCLUDED = {23495, 23499, 23500, 23506, 23511, 23512, 23514, 23517, 23519}
MAX_ATTEMPTS = 2           # swarm attempts per (PR, failure fingerprint) before handing back to the lanes
MAX_FILES, MAX_LINES = 8, 250


def model_mode_on() -> bool:
    """Kill switch for every model path: only SWARM_MODEL_MODE == "on" allows a model call. Missing,
    empty or any other value is off (a switch that fails open is not a switch)."""
    return os.environ.get("SWARM_MODEL_MODE") == "on"
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
    by_tier = day_spend(a.ledger_issue)
    spent = None if by_tier is None else by_tier["oop"] + by_tier["credit"]
    # Each attempt costs ~8 calls; keep a quarter of the remaining quota in reserve.
    by_quota = int((remaining * 0.75) // 8)
    providers, refused = po.resolve(dict(os.environ))
    for why in refused:
        print(f"::warning title=swarm provider refused::{why}")
    caps = {"oop": a.daily_cap_usd * 100, "credit": a.credit_cap_usd * 100}
    tiers = po.tiers_with_room(by_tier, caps, a.attempt_cap_usd * 100) & {p.tier for p in providers}
    if os.environ.get("SWARM_PROVIDER_ORDER") != "on" and providers:  # legacy single relay: keep its select-time probe
        tiers = tiers if credits_available(providers[0].base_url, os.environ.get("SWARM_API_KEY", "")) else set()
    credits_ok = model_mode_on() and bool(tiers)
    room = max((caps[t] - by_tier[t] for t in tiers), default=0) if by_tier else 0
    matrix = plan_matrix(modes, limit=a.limit, by_quota=by_quota, spent_cents=None if spent is None else 0,
                         daily_cap_usd=room / 100, attempt_cap_usd=a.attempt_cap_usd, credits_ok=credits_ok)
    agents = sum(1 for m in matrix if m["agent"])
    if agents:
        # Reserve in every usable tier: a credits attempt may fall through to pay-as-you-go mid-run.
        want = {t: int(round(agents * a.attempt_cap_usd * 100)) for t in tiers}
        won = reserve(a.ledger_issue, os.environ.get("GITHUB_RUN_ID", "0"), want, caps)
        if not won:
            print(f"reservation {want} not admitted under the daily caps: model slots closed")
            agents = 0
        matrix = [dict(m, agent=bool(m["agent"] and won), tiers=",".join(sorted(won)) if m["agent"] else "") for m in matrix]
    print(f"red={len(modes)} take={len(matrix)} agent_slots={agents} quota={remaining}/{limit} "
          f"model_mode={'on' if model_mode_on() else 'OFF (model slots closed)'} "
          f"credits={'ok' if credits_ok else 'NONE (model slots closed)'} "
          f"spent_cents={'UNREADABLE (fail closed: no model attempts)' if spent is None else by_tier} "
          f"providers={[f'{p.name}:{p.funding}' for p in providers]}")
    out_var("matrix", json.dumps(matrix))
    out_var("reason", "ledger-unreadable" if spent is None else "model-mode-off" if not model_mode_on() else "no-credits" if not credits_ok else ("daily-cap" if agents == 0 and matrix else ("ok" if matrix else "none")))
    return 0

LEDGER_AUTHOR = os.environ.get("SWARM_LEDGER_AUTHOR", "jovie-bot[bot]")
LEDGER_RE = re.compile(r"^🤖 swarm-ledger run=(\d+) cents=(\d+) at=(\S+)")
CREDIT_RE = re.compile(r"\bcredit_cents=(\d+)")  # spend drawn from credit/prepaid sources (own daily cap)


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


def ledger_rows(issue: str) -> list[tuple[int, str, dict, bool]] | None:
    """Today's ledger rows as (comment id, run, {"oop": cents, "credit": cents}, is_reservation),
    oldest first; None when unset or unreadable. `cents=` is out-of-pocket; legacy rows (no
    credit_cents) predate the split and count as out-of-pocket, which only over-counts."""
    if not issue or not str(issue).isdigit():
        return None
    since = iso()[:10] + "T00:00:00Z"
    out = []
    try:
        for page in range(1, 11):
            rows = gh_json(["api", f"repos/{REPO}/issues/{issue}/comments?per_page=100&page={page}&since={since}"],
                           priority="report")
            for row in rows:
                if (row.get("user") or {}).get("login") != LEDGER_AUTHOR:
                    continue  # public repo: only the Jovie Bot app's own comments are spend
                m = LEDGER_RE.match(row.get("body") or "")
                if m and m.group(3)[:10] == since[:10]:
                    c = CREDIT_RE.search(row.get("body") or "")
                    out.append((int(row.get("id") or 0), m.group(1), {"oop": int(m.group(2)), "credit": int(c.group(1)) if c else 0},
                                (row.get("body") or "").rstrip().endswith("kind=reserve")))
            if len(rows) < 100:
                return sorted(out)
    except (RuntimeError, ValueError, TypeError, KeyError, AttributeError):
        return None
    return None


def per_run_cents(rows: list[tuple[int, str, dict, bool]]) -> dict[str, dict]:
    """A run's spend per tier: its final row once written (actual cost, may be 0 for a run that lost
    admission), else its reservation (in flight)."""
    final: dict[str, dict] = {}
    held: dict[str, dict] = {}
    for _id, run, cents, is_reserve in rows:
        book = held if is_reserve else final
        prev = book.get(run, {"oop": 0, "credit": 0})
        book[run] = {t: max(prev[t], cents[t]) for t in ("oop", "credit")}
    return {run: final.get(run) or held[run] for run in {*final, *held}}


def day_spend(issue: str) -> dict | None:
    """Today's spend per tier in cents ({"oop", "credit"}); None when unreadable (fail closed)."""
    rows = ledger_rows(issue)
    if rows is None:
        return None
    runs = per_run_cents(rows).values()
    return {t: sum(r[t] for r in runs) for t in ("oop", "credit")}


def reserve(issue: str, run: str, want: dict, caps: dict) -> set[str]:
    """Reserve-then-admit, so parallel runs cannot each read the same 'spent' and overshoot a cap.

    Post the reservation (per tier), re-read, and admit a tier only if every run whose first row is
    older than ours, plus ours, fits under that tier's cap. Every run sees the same comment-id order,
    so at most the cap is admitted per tier. Any write or read failure admits nothing (fail closed)."""
    body = f"🤖 swarm-ledger run={run} cents={want.get('oop', 0)} at={iso()} credit_cents={want.get('credit', 0)} kind=reserve"
    if gh(["api", f"repos/{REPO}/issues/{issue}/comments", "-f", f"body={body}"], priority="repair").returncode != 0:
        return set()
    rows = ledger_rows(issue)
    if rows is None:
        return set()
    first: dict[str, int] = {}
    for cid, r, _c, _k in rows:
        first.setdefault(r, cid)
    if run not in first:
        return set()
    spend = per_run_cents(rows)
    ok = set()
    for tier, cents in want.items():
        ahead = sum(c[tier] for r, c in spend.items() if r != run and first[r] < first[run])
        if cents > 0 and ahead + cents <= caps.get(tier, 0):
            ok.add(tier)
    return ok


def day_spend_cents(issue: str) -> int | None:
    """Today's swarm spend in cents: per run, the larger of its reservation and its final row, summed
    since UTC midnight. (The Actions artifacts listing 5xx's on this repo, so it cannot be the ledger.)
    None when the ledger issue is unset or unreadable in full: the caller must treat that as the cap
    reached (a cap that fails open is not a cap)."""
    spent = day_spend(issue)
    return None if spent is None else spent["oop"] + spent["credit"]


def cmd_ledger(a) -> int:
    """Append this run's spend to the ledger issue (retry once; a miss is loud, not silent)."""
    body = f"🤖 swarm-ledger run={a.run} cents={a.cents} at={iso()} credit_cents={a.credit_cents or 0}"
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


from swarm_prepare import (  # noqa: E402
    claim_live, latest_failures, extract_failure, fetch_job_log, job_log_tail, receipts_for,
    cmd_prepare, take_claim, concrete_error, prepare_red, rerun_failed, finish_plan,
    cmd_fix, diff_stats, cmd_regen, cmd_guard, cmd_finalize, push_commit, release_claim, receipt,
    REGEN, NOT_MODEL_FIXABLE, GATE_SKIPS,
)
from agent_runner import (  # noqa: E402
    named_files, CREDIT_TEXT, gateway_base, walk_cost, cmd_agent, run_agent_once, sum_reported_cost,
    CONTEXT_CHARS,
)

def pick_model(base: str, key: str, candidates: list[str], provider: "po.Provider | None" = None) -> tuple[str, dict]:
    import urllib.request
    req = urllib.request.Request(base.rstrip("/") + "/models", headers={"Authorization": f"Bearer {key}", "User-Agent": "jovie-pr-remediation-swarm/1"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = {m["id"]: m for m in json.load(resp)["data"]}
    for c in candidates:
        if c in data and not model_pool_calls.request_refusal(base, {"model": c}, site="pr-remediation-swarm", strict=True):
            pricing = data[c].get("pricing") or {}
            listed = {"in": pricing.get("input"), "out": pricing.get("output"), "cached": pricing.get("input_cache_read")}
            # A relay lists no prices: the per-model list price keeps the cost stop. Unpriced = never called
            # (the old flat $0.15/$0.50 default under-counted @cf/zai-org/glm-5.3 about 9x).
            unit = po.price(po.Provider("listed", base, "", "credits", prices={c: listed}), c) \
                or po.price(provider or po.Provider("table", base, "", "credits"), c)
            if unit:
                return c, unit
    raise SystemExit(f"no priced candidate model available: {candidates}")


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
    oop = sum(float(r.get("oopUsd", r.get("costUsd") if "creditUsd" not in r else 0) or 0) for r in rows)
    credit = sum(float(r.get("creditUsd") or 0) for r in rows)
    out_var("cents", str(int(round(oop * 100 + 0.499))) if oop > 0 else "0")  # out-of-pocket: the daily cap
    out_var("credit_cents", str(int(round(credit * 100 + 0.499))) if credit > 0 else "0")
    out_var("attempts", str(len(rows)))
    out_var("greened", str(greened))
    return 0


MIN_GH = (2, 40, 0)

from swarm_ops import gh_version, cmd_smoke, cmd_diagnose  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("select"); s.add_argument("--pr", default=""); s.add_argument("--limit", type=int, default=30)
    s.add_argument("--daily-cap-usd", type=float, default=5.0); s.add_argument("--credit-cap-usd", type=float, default=5.0); s.add_argument("--attempt-cap-usd", type=float, default=0.10)
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
    l = sub.add_parser("ledger"); l.add_argument("--issue", required=True); l.add_argument("--run", required=True); l.add_argument("--cents", required=True); l.add_argument("--credit-cents", default="0")
    sub.add_parser("smoke")
    d = sub.add_parser("diagnose"); d.add_argument("--prs", required=True); d.add_argument("--show", action="store_true")
    m = sub.add_parser("summarize"); m.add_argument("--dir", required=True); m.add_argument("--out", required=True)
    a = p.parse_args()
    return {"select": cmd_select, "prepare": cmd_prepare, "fix": cmd_fix, "regen": cmd_regen, "agent": cmd_agent, "guard": cmd_guard,
            "finalize": cmd_finalize, "diagnose": cmd_diagnose, "smoke": cmd_smoke, "ledger": cmd_ledger, "summarize": cmd_summarize}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
