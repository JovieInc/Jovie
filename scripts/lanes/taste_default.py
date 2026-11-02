#!/usr/bin/env python3
"""Taste never blocks forever: ship the proposed default at a risk- and confidence-scaled deadline.

Tim, 2026-10-25: "if I don't give a taste call after x hours you ship. low risk things wait fast, high risk
things wait slow, and confidence influences wait time too." The validation lifecycle keeps an issue in
Validating while a required `founder-taste` receipt is missing; with nobody answering the Ovie taste card,
issues waited indefinitely. This lane gives every such item a recorded proposal and a deadline:

    wait = baseHours[risk] x confidenceFactor[confidence]          (scripts/lanes/taste-policy.json)

  * risk: the lifecycle manifest's riskLevel (reversibility and reach of the merged change), raised to high when
    the title, labels or required-receipt reasons mention legal, privacy, money or auth.
  * confidence: the proposer's evidence. A different-family adversarial review of the change, the outcome and
    screen-audit receipts, and Tim's earlier calls on the same assurance rows (a reversal lowers it, stable
    defaults raise it).
  * default: ship (accept the exact production build). It is recorded as a `founder-taste` pass receipt whose
    evidence starts `default-accepted:` and states risk, confidence and wait. A human receipt at any time ends
    the wait (Tim answering early always wins); a later human `fail` is a reversal and is learned from.
  * one digest per day on JOV-7739 is the post-ship note: feedback, not approval.
  * measured: time-to-decision, % shipped on default, % reversed (taste-metrics.json, ledger rows
    `kind: taste-decision`, stage events `taste-decision`).

  taste_default.py run [--dry-run]    # one pass (the dispatch tick starts this hourly)
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import statistics
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import lifecycle  # noqa: E402
import outcome_lane  # noqa: E402
import pathlib as _pl, sys as _sys  # noqa: E402
_sys.path[:0] = [p for p in [str(_pl.Path(__file__).resolve().parent)] if p not in _sys.path]  # sibling module of the release
from atomic_state import atomic_write_text  # noqa: E402

esc = outcome_lane.esc
POLICY_PATH = Path(os.environ.get("LANES_TASTE_POLICY", HERE / "taste-policy.json"))
PER_PASS = 25
REVIEWS_PER_PASS = 25
TRACK_PER_PASS = 20
DIGEST_ISSUE = os.environ.get("LANES_TASTE_DIGEST_ISSUE", "JOV-7739")
DIGEST_EVERY_S = 24 * 3600
STATE_FILE = "taste-default.json"
METRICS_FILE = "taste-metrics.json"
TICK_FILE = "taste-default-tick.json"
DIGEST_MARKER = "<!-- taste-default-digest:v1 -->"
DEFAULT_ACTION = "ship: accept the exact production build as the founder-taste decision"
TASTE_OWED_RE = re.compile(r"^- founder-taste: no current receipt\b", re.M)
RECEIPT_RE = re.compile(r"<!-- validation-receipt:v1\s*\n(\{.*?\})\s*\n-->", re.S)
QUERY = """query($after:String){issues(first:50,after:$after,
 filter:{team:{key:{eq:"JOV"}},state:{name:{eq:"Validating"}}},orderBy:updatedAt){
 pageInfo{hasNextPage endCursor}
 nodes{id identifier title url labels{nodes{name}}
  history(first:25){nodes{createdAt toState{name}}}
  comments(last:30){nodes{id body createdAt}}}}}"""
TRACK_QUERY = ("query($id:String!){issue(id:$id){id identifier state{name} comments(last:50){nodes{id body createdAt}}}}")


def enabled() -> bool:
    return os.environ.get("LANES_TASTE_DEFAULT", "on").strip().lower() not in {"off", "0", "false"}


def load_policy(path: Path | None = None) -> dict:
    policy = json.loads(Path(path or POLICY_PATH).read_text())
    for table, keys in (("baseHours", ("low", "medium", "high")), ("confidenceFactor", ("low", "medium", "high"))):
        for key in keys:
            value = (policy.get(table) or {}).get(key)
            if not isinstance(value, (int, float)) or isinstance(value, bool) or value <= 0:
                raise ValueError(f"taste policy {table}.{key} must be a positive number")
    policy.setdefault("minHours", 1)
    policy.setdefault("confidence", {})
    return policy


def _epoch(value) -> float | None:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.timestamp() if parsed.tzinfo else None


def _iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def receipts(comments: list[dict]) -> list[dict]:
    """Validation receipts in comment order, with the comment time."""
    found = []
    for node in sorted(comments or [], key=lambda c: c.get("createdAt") or ""):
        match = RECEIPT_RE.search(node.get("body") or "")
        if not match:
            continue
        try:
            data = json.loads(match.group(1))
        except ValueError:
            continue
        if isinstance(data, dict):
            found.append({**data, "at": _epoch(node.get("createdAt"))})
    return found


def is_default_receipt(receipt: dict) -> bool:
    return str(receipt.get("evidence") or "").startswith("default-accepted:")


def classify_risk(issue: dict, manifest: dict, policy: dict) -> tuple[str, str]:
    level = str(manifest.get("riskLevel") or "").lower()
    base = level if level in ("low", "medium", "high") else "medium"
    reasons = " ".join(str(entry.get("reason") or "") for entry in manifest.get("required") or [] if isinstance(entry, dict))
    labels = " ".join(node.get("name", "") for node in ((issue.get("labels") or {}).get("nodes") or []))
    text = f"{issue.get('title') or ''} {labels} {reasons}".lower()
    hits = sorted({word for word in policy.get("highRiskKeywords") or [] if word.lower() in text})
    if hits:
        return "high", f"mentions {', '.join(hits[:4])}"
    return base, f"manifest riskLevel {level or 'unset (medium)'}"


def rows_of(manifest: dict) -> list[str]:
    return sorted({str(row.get("row")) for row in manifest.get("uiEvidence") or [] if isinstance(row, dict) and row.get("row")})


def score_confidence(rows: list[str], recent: list[dict], review: dict | None, learning: dict, policy: dict,
                     now: float) -> tuple[str, int, list[str]]:
    weights, signals, score = policy["confidence"], [], 0
    verdict = (review or {}).get("verdict")
    if verdict == "supported":
        score += weights.get("adversarialSupported", 1)
        signals.append("adversarial review supports shipping the build")
    elif verdict == "contradicted":
        score += weights.get("adversarialContradicted", -2)
        signals.append("adversarial review contradicts")
    for kind, key in (("outcome", "outcomePass"), ("screen-audit", "screenAuditPass")):
        latest = next((r for r in reversed(recent) if r.get("kind") == kind), None)
        if latest and latest.get("status") == "pass":
            score += weights.get(key, 1)
            signals.append(f"{kind} receipt passed")
    window = policy.get("learningWindowDays", 60) * 86400
    reversed_rows = [r for r in rows if now - float((learning.get(r) or {}).get("lastReversedAt") or 0) <= window
                     and (learning.get(r) or {}).get("reversed")]
    if reversed_rows:
        score += weights.get("priorReversal", -2)
        signals.append(f"Tim reversed a default on {', '.join(reversed_rows[:3])}")
    stable = sum(int((learning.get(r) or {}).get("accepted") or 0) for r in rows)
    if stable >= weights.get("priorAcceptedMin", 3) and not reversed_rows:
        score += weights.get("priorAccepted", 1)
        signals.append(f"{stable} earlier defaults on these rows stood")
    level = "high" if score >= weights.get("highAtLeast", 2) else "low" if score <= weights.get("lowAtMost", -1) else "medium"
    return level, score, signals


def wait_hours(risk: str, confidence: str, policy: dict) -> float:
    return max(float(policy.get("minHours", 1)), float(policy["baseHours"][risk]) * float(policy["confidenceFactor"][confidence]))


def taste_ask(issue: dict, now: float, policy: dict | None = None, learning: dict | None = None,
              review: dict | None = None) -> dict | None:
    """The taste wait and proposal of one Validating issue, or None when founder-taste is not owed yet."""
    policy = policy or load_policy()
    comments = sorted(((issue.get("comments") or {}).get("nodes") or []), key=lambda node: node.get("createdAt") or "")
    lifecycle_comments = [c for c in comments if outcome_lane.LIFECYCLE_MARKER in (c.get("body") or "")]
    # The newest comment alternates between "deployment missing" and "receipts missing" as the served
    # build changes; the newest one that names a verified generation carries the ask.
    ask = next((c for c in reversed(lifecycle_comments) if outcome_lane.VERIFIED_RE.search(c["body"])), None)
    if ask is None or not TASTE_OWED_RE.search(ask["body"]):
        return None
    manifest_match = outcome_lane.MANIFEST_RE.search(ask["body"])
    try:
        manifest = json.loads(manifest_match.group(1)) if manifest_match else None
    except ValueError:
        manifest = None
    if not isinstance(manifest, dict) or manifest.get("issue") != issue.get("identifier"):
        return None
    entered = next((_epoch(node.get("createdAt")) for node in ((issue.get("history") or {}).get("nodes") or [])
                    if ((node.get("toState") or {}).get("name") == "Validating")), None)
    if entered is None:
        entered = _epoch(ask.get("createdAt"))
    if entered is None:
        return None
    sha = outcome_lane.VERIFIED_RE.search(ask["body"]).group(1)
    risk, risk_why = classify_risk(issue, manifest, policy)
    rows = rows_of(manifest)
    confidence, score, signals = score_confidence(rows, receipts(comments), review, learning or {}, policy, now)
    hours = wait_hours(risk, confidence, policy)
    held = bool(policy.get("holdWhenReviewerContradicts", True) and (review or {}).get("verdict") == "contradicted")
    return {"sha": sha, "manifest": manifest, "enteredAt": entered, "risk": risk, "riskWhy": risk_why, "confidence": confidence,
            "score": score, "signals": signals, "rows": rows, "waitHours": round(hours, 2), "deadlineAt": entered + hours * 3600,
            "due": now >= entered + hours * 3600 and not held, "held": held, "default": DEFAULT_ACTION}


def receipt_args(issue: str, ask: dict) -> list[str]:
    evidence = (f"default-accepted: risk={ask['risk']} confidence={ask['confidence']} wait={ask['waitHours']}h, no founder decision "
                f"by {_iso(ask['deadlineAt'])}; default = {ask['default']}; taste feedback stays open post-ship on {DIGEST_ISSUE}")
    note = (f"Charter default (taste never blocks forever): accepted at the deadline, not by a founder decision. "
            f"Send feedback on the production build through the Ovie taste card ({DIGEST_ISSUE}); "
            f"a founder fail receipt reopens the issue as Rework and lowers confidence for similar calls.")
    args = ["receipt", "--issue", issue, "--kind", "founder-taste", "--status", "pass", "--sha", ask["sha"],
            "--evidence", evidence, "--note", note]
    if ask["manifest"].get("receiptNotBefore"):
        args += ["--episode-started-at", str(ask["manifest"]["receiptNotBefore"])]
    return args


def read_state(state: Path) -> dict:
    try:
        data = json.loads((state / STATE_FILE).read_text())
        data = data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        data = {}
    for key in ("proposals", "learning", "reviews", "_digest"):
        data.setdefault(key, {})
    return data


def write_state(state: Path, data: dict) -> None:
    tmp = (state / STATE_FILE).with_suffix(".tmp")
    tmp.write_text(json.dumps(data, sort_keys=True))
    os.replace(tmp, state / STATE_FILE)


def ledger_row(state: Path, issue: str, proposal: dict, verdict: str, ended: float) -> None:
    """Stage receipt for shipping-slo: `taste-decision` waiting -> decided (stage_events.py)."""
    row = {"schema": "jovie-lane-run/v1", "kind": "taste-decision", "provider": "taste-default",
           "runId": f"taste-{issue}-{int(ended)}", "issue": issue, "startedAt": _iso(proposal["enteredAt"]),
           "endedAt": _iso(ended), "verdict": verdict, "risk": proposal.get("risk"), "confidence": proposal.get("confidence"),
           "waitHours": proposal.get("waitHours")}
    try:
        (state / "runs").mkdir(parents=True, exist_ok=True)
        with open(state / "runs" / "ledger.jsonl", "a") as out:
            out.write(json.dumps(row) + "\n")
    except OSError:
        pass


def compute_metrics(proposals: dict) -> dict:
    decided = {k: p for k, p in proposals.items() if p.get("status") in ("defaulted", "decided-pass", "decided-fail")}
    waits = sorted((p["decidedAt"] - p["enteredAt"]) / 3600 for p in decided.values() if p.get("decidedAt"))
    defaulted = [p for p in decided.values() if p["status"] == "defaulted"]
    reversed_ = [p for p in defaulted if p.get("reversedAt")]
    pct = lambda n, d: round(100 * n / d, 1) if d else None
    def quantile(q):
        return round(waits[min(len(waits) - 1, int(q * len(waits)))], 2) if waits else None
    return {"schema": "jovie-taste-metrics/v1", "waiting": sum(1 for p in proposals.values() if p.get("status") == "waiting"),
            "decided": len(decided), "defaulted": len(defaulted), "decidedByTim": len(decided) - len(defaulted),
            "timeToDecisionHoursP50": quantile(0.5), "timeToDecisionHoursP95": quantile(0.95),
            "shippedOnDefaultPct": pct(len(defaulted), len(decided)), "reversedPct": pct(len(reversed_), len(defaulted)),
            "reversed": len(reversed_)}


def scan(linear, now: float, policy: dict, state: dict, limit: int = 400):
    found, after, seen = [], None, 0
    while seen < limit:
        page = linear.gql(QUERY, {"after": after})["issues"]
        for issue in page["nodes"]:
            seen += 1
            cached = (state["reviews"].get(issue["identifier"]) or {})
            review = cached.get("review") if cached.get("sha") else None
            ask = taste_ask(issue, now, policy, state["learning"], review if cached.get("sha") == _sha_of(issue) else None)
            if ask:
                found.append((issue, ask))
        if not page["pageInfo"]["hasNextPage"]:
            break
        after = page["pageInfo"]["endCursor"]
    return found


def _sha_of(issue: dict) -> str | None:
    for comment in sorted(((issue.get("comments") or {}).get("nodes") or []), key=lambda c: c.get("createdAt") or "", reverse=True):
        found = outcome_lane.VERIFIED_RE.search(comment.get("body") or "")
        if found and outcome_lane.LIFECYCLE_MARKER in (comment.get("body") or ""):
            return found.group(1)
    return None


def review_question(issue: dict, ask: dict) -> str:
    return (f"Founder-taste default. Issue {issue['identifier']}: {issue['title']}. Risk {ask['risk']} ({ask['riskWhy']}). "
            f"Assurance rows touched: {', '.join(ask['rows']) or 'none listed'}. Machine evidence so far: "
            f"{'; '.join(ask['signals']) or 'none'}. Criterion: shipping the current production build as the accepted "
            "founder-taste decision is safe, with no visible regression in the touched rows.")


def human_receipt(comments: list[dict], after: float) -> dict | None:
    return next((r for r in receipts(comments) if r.get("kind") == "founder-taste" and not is_default_receipt(r)
                 and (r.get("at") or 0) >= after), None)


def track(linear, state: dict, current: set[str], now: float, policy: dict) -> None:
    """Learn from what happened to earlier proposals: Tim decided early, or reversed a default."""
    window = policy.get("learningWindowDays", 60) * 86400
    checked = 0
    for ident, proposal in sorted(state["proposals"].items()):
        if checked >= TRACK_PER_PASS:
            break
        status = proposal.get("status")
        waiting_gone = status == "waiting" and ident not in current
        watching = status == "defaulted" and not proposal.get("reversedAt") and now - proposal["decidedAt"] <= window
        if not (waiting_gone or watching):
            continue
        checked += 1
        row = linear.gql(TRACK_QUERY, {"id": ident}).get("issue")
        if not row:
            continue
        comments = (row.get("comments") or {}).get("nodes") or []
        if waiting_gone:
            human = human_receipt(comments, proposal["enteredAt"])
            if human:
                proposal.update(status="decided-pass" if human.get("status") == "pass" else "decided-fail",
                                decidedAt=human["at"], decidedBy="founder")
            else:
                proposal["status"] = "closed-without-taste"
        else:
            human = human_receipt(comments, proposal["decidedAt"])
            if human and human.get("status") == "fail":
                proposal["reversedAt"] = human["at"]
                for r in proposal.get("rows") or []:
                    entry = state["learning"].setdefault(r, {"accepted": 0, "reversed": 0})
                    entry["reversed"] += 1
                    entry["lastReversedAt"] = human["at"]
            elif now - proposal["decidedAt"] > 14 * 86400 and not proposal.get("stable"):
                proposal["stable"] = True
                for r in proposal.get("rows") or []:
                    state["learning"].setdefault(r, {"accepted": 0, "reversed": 0})["accepted"] += 1


def digest_text(waiting: list[dict], defaulted: list[dict], metrics: dict, now: float) -> str:
    lines = [DIGEST_MARKER, "Taste digest. This is feedback, not approval: waiting items ship their default at the deadline unless you decide first.", ""]
    lines.append(f"Waiting ({len(waiting)}):")
    for row in sorted(waiting, key=lambda r: r["deadlineAt"])[:40]:
        left = row["deadlineAt"] - now
        when = "held: reviewer contradicts, needs your call" if row.get("held") else (
            "due now" if left <= 0 else f"default ships {_iso(row['deadlineAt'])} (in {round(left / 3600)}h)")
        lines.append(f"- {row['identifier']} {row['title'][:70]} [risk {row['risk']}, confidence {row['confidence']}] {when}")
    lines += ["", f"Shipped on default since the last digest ({len(defaulted)}); a founder fail receipt reopens it as Rework and lowers confidence:"]
    for row in defaulted[:40]:
        lines.append(f"- {row['identifier']} {row['title'][:70]} [risk {row['risk']}, confidence {row['confidence']}, waited {row['waitHours']}h]")
    lines += ["", f"Measured: {metrics['decided']} decided, {metrics['shippedOnDefaultPct']}% on default, "
              f"{metrics['reversedPct']}% of defaults reversed, time-to-decision p50 {metrics['timeToDecisionHoursP50']}h "
              f"p95 {metrics['timeToDecisionHoursP95']}h."]
    return "\n".join(lines)


def run_pass(host, lane, now: float | None = None, dry_run: bool = False, run=lifecycle.run, policy: dict | None = None,
             urlopen=None, only: set[str] | None = None) -> dict:
    if not enabled():
        return {"status": "disabled"}
    now = time.time() if now is None else now
    policy = policy or load_policy()
    linear = lane.Linear(host.linear_env)
    state = read_state(host.state)
    asks = scan(linear, now, policy, state)
    # One adversarial review per (issue, verified generation), cached; it feeds confidence.
    reviewed = 0
    if not dry_run and esc.adversarial_model() and esc.gateway_key():
        for issue, ask in asks:
            cached = state["reviews"].get(issue["identifier"]) or {}
            if cached.get("sha") == ask["sha"] or reviewed >= REVIEWS_PER_PASS:
                continue
            result = esc.gateway_judge(review_question(issue, ask), esc.adversarial_model(), **({"urlopen": urlopen} if urlopen else {}))
            state["reviews"][issue["identifier"]] = {"sha": ask["sha"], "review": result, "at": now}
            reviewed += 1
        asks = scan(linear, now, policy, state)
    authorization = None if dry_run else outcome_lane.app_authorization(host.state)
    if not dry_run and authorization is None:
        return {"status": "linear-app-unavailable", "waiting": len(asks)}
    recorded, failed = [], []
    for issue, ask in asks:
        key = issue["identifier"]
        proposal = state["proposals"].get(key)
        if not proposal or proposal.get("sha") != ask["sha"] or proposal.get("status") not in ("waiting",):
            if proposal and proposal.get("sha") == ask["sha"] and proposal.get("status") == "defaulted":
                continue  # the lifecycle will move it on its next sweep
            proposal = {"status": "waiting", "sha": ask["sha"], "enteredAt": ask["enteredAt"]}
        proposal.update({k: ask[k] for k in ("risk", "riskWhy", "confidence", "score", "signals", "rows", "waitHours", "deadlineAt", "default", "held")},
                        title=issue["title"], sha=ask["sha"])
        state["proposals"][key] = proposal
        if len(recorded) >= PER_PASS or not ask["due"] or (only is not None and key not in only):
            continue
        if dry_run:
            recorded.append({"identifier": key, "title": issue["title"], "dryRun": True, "risk": ask["risk"],
                             "confidence": ask["confidence"], "waitHours": ask["waitHours"]})
            continue
        env = {k: os.environ[k] for k in ("HOME", "LANG") if k in os.environ}
        env["PATH"] = outcome_lane.node24_path() + os.pathsep + os.environ.get("PATH", "")
        env["LINEAR_API_KEY"] = authorization
        # The receipt CLI must come from a checkout that has it: the host clone can be weeks old, and an old
        # script silently runs a full lifecycle sweep instead (the first live proof, 2026-10-25, hit exactly that).
        tree = None
        try:
            tree = outcome_lane.checkout(host.repo, host.state / "outcome-worktrees", ask["sha"], run=run)
            done = run(["node", str(tree / "scripts/lib/linear-sync-on-merge.mjs"), *receipt_args(key, ask)],
                       cwd=str(tree), env=env, capture_output=True, text=True, timeout=120)
            posted = done.returncode == 0 and "validation-receipt:v1" in (done.stdout or "")
        except (RuntimeError, OSError, subprocess.SubprocessError):
            posted = False
        finally:
            if tree is not None:
                outcome_lane.drop_checkout(host.repo, tree, run=run)
        if posted:
            proposal.update(status="defaulted", decidedAt=now, decidedBy="default")
            ledger_row(host.state, key, proposal, "defaulted", now)
            recorded.append({"identifier": key, "title": issue["title"], "risk": ask["risk"], "confidence": ask["confidence"],
                             "waitHours": ask["waitHours"]})
        else:
            failed.append({"identifier": key})
    if not dry_run:
        track(linear, state, {i["identifier"] for i, _ in asks}, now, policy)
        for key, proposal in state["proposals"].items():
            if proposal.get("status", "").startswith("decided-") and not proposal.get("ledgered"):
                ledger_row(host.state, key, proposal, proposal["status"], proposal["decidedAt"])
                proposal["ledgered"] = True
        metrics = compute_metrics(state["proposals"])
        atomic_write_text(host.state / METRICS_FILE, json.dumps({**metrics, "at": now}))
    else:
        metrics = compute_metrics(state["proposals"])
    waiting = [{"identifier": i["identifier"], "title": i["title"], **{k: a[k] for k in ("risk", "confidence", "deadlineAt", "held")}}
               for i, a in asks if not a["due"]]
    digest = "skipped (--only)" if only is not None else maybe_digest(host, linear, state, waiting, [r for r in recorded if not r.get("dryRun")], metrics, now, dry_run)
    if not dry_run:
        write_state(host.state, state)
    return {"status": "ok", "waiting": len(waiting), "due": sum(1 for _, a in asks if a["due"]), "recorded": [r["identifier"] for r in recorded],
            "failed": [r["identifier"] for r in failed], "digest": digest, "reviewed": reviewed, "metrics": metrics,
            "proposals": {i["identifier"]: {k: a[k] for k in ("risk", "confidence", "waitHours", "deadlineAt", "held", "signals")}
                          for i, a in asks} if dry_run else None}


def maybe_digest(host, linear, state: dict, waiting: list, recorded: list, metrics: dict, now: float, dry_run: bool) -> str:
    """At most one digest per day, and only when its content changed."""
    meta = state.setdefault("_digest", {})
    pending = (meta.get("pendingDefaulted") or []) + recorded
    fingerprint = hashlib.sha256(json.dumps([sorted(w["identifier"] for w in waiting),
                                             sorted(r["identifier"] for r in pending)]).encode()).hexdigest()[:16]
    if dry_run or (not waiting and not pending):
        return "skipped"
    if fingerprint == meta.get("fingerprint") or now - float(meta.get("at") or 0) < DIGEST_EVERY_S:
        meta["pendingDefaulted"] = pending
        return "held"
    target = linear.gql('query($t:String!,$n:Float!){issues(first:1,filter:{team:{key:{eq:$t}},number:{eq:$n}}){nodes{id}}}',
                        {"t": DIGEST_ISSUE.split("-")[0], "n": float(DIGEST_ISSUE.split("-")[1])})["issues"]["nodes"]
    if not target:
        return "digest-issue-missing"
    linear.comment(target[0]["id"], digest_text(waiting, pending, metrics, now))
    state["_digest"] = {"at": now, "fingerprint": fingerprint, "pendingDefaulted": []}
    return "posted"


def tick(host, lane, spawn=subprocess.Popen) -> dict:
    """Dispatch hook: one detached pass an hour."""
    if os.environ.get("LANES_SELFTEST") or os.environ.get("LANES_EXECUTION_BACKEND") == "local-test":
        return {"status": "selftest-skipped"}
    if not enabled():
        return {"status": "disabled"}
    stamp = host.state / TICK_FILE
    try:
        last = float(json.loads(stamp.read_text()).get("at") or 0)
    except (OSError, ValueError, TypeError, AttributeError):
        last = 0
    if time.time() - last < 3600:
        return {"status": "not-due"}
    atomic_write_text(stamp, json.dumps({"at": time.time()}))
    spawn([sys.executable, str(HERE / "taste_default.py"), "run"], stdin=subprocess.DEVNULL,
          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True, **lifecycle.spawn_kwargs())
    return {"status": "spawned"}


def main(argv: list[str] | None = None) -> int:
    import argparse
    import lane_runner as lane
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    one = sub.add_parser("run")
    one.add_argument("--dry-run", action="store_true")
    one.add_argument("--only", help="comma-separated identifiers: record defaults only for these (live proof)")
    args = parser.parse_args(argv)
    lane.load_github_env()
    host = lane.Host()
    try:
        with lifecycle.Guard(host.state):
            print(json.dumps(run_pass(host, lane, dry_run=args.dry_run,
                                      only={i.strip().upper() for i in args.only.split(",")} if args.only else None)))
            return 0
    except lifecycle.AdmissionHeld as error:
        print(f"lifecycle admission held: {error}", file=sys.stderr)
        return 75


if __name__ == "__main__":
    sys.exit(main())
