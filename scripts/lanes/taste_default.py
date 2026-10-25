#!/usr/bin/env python3
"""Taste never blocks forever: record `founder-taste` as default-accepted after a deadline.

Tim's charter (~/.claude/CLAUDE.md sections 2 and 2a): humans give taste feedback after ship, not
as a gate. The validation lifecycle (scripts/lib/validation-lifecycle.mjs) keeps an issue in
Validating while a required `founder-taste` receipt is missing; with nobody answering the Ovie
taste card, 100+ issues waited indefinitely. This lane closes that loop:

  1. Candidates: Validating JOV issues whose newest lifecycle comment that names a verified
     production generation lists `- founder-taste: no current receipt`.
  2. Wait clock: the most recent transition into Validating (a rework restarts it). After
     DEADLINE_S (48h) of silence the lane records a founder-taste `pass` receipt whose evidence
     says `default-accepted` and names the post-ship feedback path. An explicit founder rejection
     is a `fail` receipt, which the lifecycle routes to Rework before this lane ever looks.
  3. One digest comment per day on the founder work-order issue (JOV-7739) lists what is waiting
     (with its deadline) and what was defaulted, so taste feedback stays open post-ship.

  taste_default.py run [--dry-run]    # one pass (the dispatch tick starts this hourly)
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import lifecycle  # noqa: E402
import outcome_lane  # noqa: E402

DEADLINE_S = int(os.environ.get("LANES_TASTE_DEADLINE_S", str(48 * 3600)) or 0)
PER_PASS = 25
DIGEST_ISSUE = os.environ.get("LANES_TASTE_DIGEST_ISSUE", "JOV-7739")
DIGEST_EVERY_S = 24 * 3600
STATE_FILE = "taste-default.json"
TICK_FILE = "taste-default-tick.json"
DIGEST_MARKER = "<!-- taste-default-digest:v1 -->"
TASTE_OWED_RE = re.compile(r"^- founder-taste: no current receipt\b", re.M)
QUERY = """query($after:String){issues(first:50,after:$after,
 filter:{team:{key:{eq:"JOV"}},state:{name:{eq:"Validating"}}},orderBy:updatedAt){
 pageInfo{hasNextPage endCursor}
 nodes{id identifier title url
  history(first:25){nodes{createdAt toState{name}}}
  comments(last:20){nodes{body createdAt}}}}}"""


def enabled() -> bool:
    return os.environ.get("LANES_TASTE_DEFAULT", "on").strip().lower() not in {"off", "0", "false"} and DEADLINE_S > 0


def _epoch(value) -> float | None:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.timestamp() if parsed.tzinfo else None


def taste_ask(issue: dict, now: float) -> dict | None:
    """The taste wait of one Validating issue, or None when founder-taste is not owed yet."""
    comments = sorted(((issue.get("comments") or {}).get("nodes") or []),
                      key=lambda node: node.get("createdAt") or "")
    lifecycle_comments = [c for c in comments if outcome_lane.LIFECYCLE_MARKER in (c.get("body") or "")]
    # The newest comment alternates between "deployment missing" and "receipts missing" as the
    # served build changes; the newest one that names a verified generation carries the ask.
    ask = next((c for c in reversed(lifecycle_comments)
                if outcome_lane.VERIFIED_RE.search(c["body"])), None)
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
    return {"sha": sha, "manifest": manifest, "enteredAt": entered, "deadlineAt": entered + DEADLINE_S,
            "due": now >= entered + DEADLINE_S}


def receipt_args(issue: str, ask: dict) -> list[str]:
    hours = round(DEADLINE_S / 3600)
    evidence = (f"default-accepted: no founder decision within {hours}h of entering Validating; "
                f"taste feedback stays open post-ship on {DIGEST_ISSUE}")
    note = (f"Charter default (taste never blocks forever): accepted by deadline, not by a founder decision. "
            f"Send feedback on the production build through the Ovie taste card ({DIGEST_ISSUE}); "
            f"a rejection reopens the issue as Rework.")
    args = ["receipt", "--issue", issue, "--kind", "founder-taste", "--status", "pass", "--sha", ask["sha"],
            "--evidence", evidence, "--note", note]
    if ask["manifest"].get("receiptNotBefore"):
        args += ["--episode-started-at", str(ask["manifest"]["receiptNotBefore"])]
    return args


def digest_text(waiting: list[dict], defaulted: list[dict], now: float) -> str:
    lines = [DIGEST_MARKER, "Taste digest (founder-taste receipts; machines never block on taste):", ""]
    lines.append(f"Waiting for a founder decision ({len(waiting)}), default-accepted at the deadline unless rejected:")
    for row in sorted(waiting, key=lambda r: r["deadlineAt"])[:40]:
        left = row["deadlineAt"] - now
        when = "due now" if left <= 0 else f"default in {round(left / 3600)}h"
        lines.append(f"- {row['identifier']} {row['title'][:80]} ({when})")
    lines += ["", f"Default-accepted since the last digest ({len(defaulted)}); give feedback any time, a rejection reopens as Rework:"]
    for row in defaulted[:40]:
        lines.append(f"- {row['identifier']} {row['title'][:80]}")
    return "\n".join(lines)


def read_state(state: Path) -> dict:
    try:
        data = json.loads((state / STATE_FILE).read_text())
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def write_state(state: Path, data: dict) -> None:
    tmp = (state / STATE_FILE).with_suffix(".tmp")
    tmp.write_text(json.dumps(data, sort_keys=True))
    os.replace(tmp, state / STATE_FILE)


def scan(linear, now: float, limit: int = 400) -> list[tuple[dict, dict]]:
    found, after, seen = [], None, 0
    while seen < limit:
        page = linear.gql(QUERY, {"after": after})["issues"]
        for issue in page["nodes"]:
            seen += 1
            ask = taste_ask(issue, now)
            if ask:
                found.append((issue, ask))
        if not page["pageInfo"]["hasNextPage"]:
            break
        after = page["pageInfo"]["endCursor"]
    return found


def run_pass(host, lane, now: float | None = None, dry_run: bool = False, run=lifecycle.run) -> dict:
    if not enabled():
        return {"status": "disabled"}
    now = time.time() if now is None else now
    linear = lane.Linear(host.linear_env)
    state = read_state(host.state)
    asks = scan(linear, now)
    recorded, failed = [], []
    authorization = None if dry_run else outcome_lane.app_authorization(host.state)
    if not dry_run and authorization is None:
        return {"status": "linear-app-unavailable", "waiting": len(asks)}
    for issue, ask in asks:
        if len(recorded) >= PER_PASS or not ask["due"]:
            continue
        key = issue["identifier"]
        if state.get(key, {}).get("sha") == ask["sha"] and state[key].get("result") == "recorded":
            continue  # the lifecycle will move it on its next sweep
        if dry_run:
            recorded.append({"identifier": key, "title": issue["title"], "dryRun": True})
            continue
        env = {k: os.environ[k] for k in ("HOME", "LANG") if k in os.environ}
        env["PATH"] = outcome_lane.node24_path() + os.pathsep + os.environ.get("PATH", "")
        env["LINEAR_API_KEY"] = authorization
        done = run(["node", str(Path(host.repo) / "scripts/lib/linear-sync-on-merge.mjs"), *receipt_args(key, ask)],
                   cwd=str(host.repo), env=env, capture_output=True, text=True, timeout=120)
        ok = done.returncode == 0
        state[key] = {"sha": ask["sha"], "at": now, "result": "recorded" if ok else "receipt-failed"}
        (recorded if ok else failed).append({"identifier": key, "title": issue["title"]})
    if not dry_run:
        write_state(host.state, state)
    waiting = [{"identifier": i["identifier"], "title": i["title"], "deadlineAt": a["deadlineAt"]}
               for i, a in asks if not a["due"]]
    digest = maybe_digest(host, linear, state, waiting, recorded, now, dry_run)
    return {"status": "ok", "waiting": len(waiting), "due": sum(1 for _, a in asks if a["due"]),
            "recorded": [r["identifier"] for r in recorded], "failed": [r["identifier"] for r in failed],
            "digest": digest}


def maybe_digest(host, linear, state: dict, waiting: list, recorded: list, now: float, dry_run: bool) -> str:
    """At most one digest per day, and only when its content changed."""
    meta = state.setdefault("_digest", {})
    pending = meta.get("pendingDefaulted", []) + [r for r in recorded if not r.get("dryRun")]
    fingerprint = hashlib.sha256(json.dumps([sorted(w["identifier"] for w in waiting),
                                             sorted(r["identifier"] for r in pending)]).encode()).hexdigest()[:16]
    if dry_run or (not waiting and not pending):
        return "skipped"
    if fingerprint == meta.get("fingerprint") or now - float(meta.get("at") or 0) < DIGEST_EVERY_S:
        meta["pendingDefaulted"] = pending
        write_state(host.state, state)
        return "held"
    target = linear.gql('query($t:String!,$n:Float!){issues(first:1,filter:{team:{key:{eq:$t}},number:{eq:$n}}){nodes{id}}}',
                        {"t": DIGEST_ISSUE.split("-")[0], "n": float(DIGEST_ISSUE.split("-")[1])})["issues"]["nodes"]
    if not target:
        return "digest-issue-missing"
    linear.comment(target[0]["id"], digest_text(waiting, pending, now))
    state["_digest"] = {"at": now, "fingerprint": fingerprint, "pendingDefaulted": []}
    write_state(host.state, state)
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
    stamp.write_text(json.dumps({"at": time.time()}))
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
    args = parser.parse_args(argv)
    lane.load_github_env()
    host = lane.Host()
    try:
        with lifecycle.Guard(host.state):
            print(json.dumps(run_pass(host, lane, dry_run=args.dry_run)))
            return 0
    except lifecycle.AdmissionHeld as error:
        print(f"lifecycle admission held: {error}", file=sys.stderr)
        return 75


if __name__ == "__main__":
    sys.exit(main())
