#!/usr/bin/env python3
"""Per-PR merge-group failure breaker.

2026-10-29: #23471 failed merge-group CI four times at four heads. Each failure re-formed every group
behind it (about 10 min of CI apiece) and a per-head breaker never tripped because the head kept
changing. Two merge-group CI failures for one PR within WINDOW_S dequeue it, label it `lane-fix-red`
(an admission hold label, so the enroll path will not re-enqueue it), and comment with the failing
check and its first error line. Failures count per PR head: a merge-group run that started before the
PR's current head existed belongs to an older head and is ignored, so a fix pushed after a trip never
inherits the old head's failures. The hold stays while the head is the one that failed (the sweep puts
the label back if the relay cleared it); when a new head is pushed the sweep removes `lane-fix-red`
itself, for PRs this breaker tripped only (a human or hold-contract label is never touched). JOV-8492
(2026-11-09): supersession — a failure older than the PR's latest SUCCESSFUL merge-group run is no
evidence (that tree already passed), so it neither trips the breaker nor sustains a re-block; the
sweep releases such a hold itself (`released-superseded`) instead of re-labeling a head whose reds
later green runs at the same head already superseded. State: queue-breaker.json, log:
queue-breaker.jsonl. HEADGREEN grouping (live 2026-10-29): only a group head's build gates the merge, so a failed
build of an entry that is still queued on that same synthetic commit did not eject it and is not counted.
2026-11-01: merge-group failures are attributed before a trip. A signal that also fails WITHOUT the PR — the same
failing check and first error line in another PR's group that does not contain it, or on a main-branch CI run — is a
shared/base-branch failure, never that PR's (main's brand-guard break ejected green queued #24111/#24105/#22252 and
re-labeled each relay clear until dequeue-held had churned them twice). Shared evidence skips the trip and releases
an earlier one; unreadable evidence keeps today's behavior. The signal is the top failing test (`FAIL <project> x.test.ts`, the
failureSignature() token) when the log has one, and >=3 distinct PR groups failing on that same test inside
SHARED_WINDOW_S is shared on its own; a held PR whose signature is shared is released every sweep, label included,
with a `released-shared-failure` receipt in the log. 2026-11-11: shared evidence used to stop at "not this PR's
fault", and remediation classifies main-red as `wait`, so nothing was dispatched to fix main itself: a test that expired
by the clock on an unchanged main (JOV-8737) failed every group for 8h with zero merges until a chat session noticed.
`main_poison()` now files one remediation intake per shared signal (POISON_PRS distinct PR groups in SHARED_WINDOW_S) with
source `merge-group-shared`, which routes to a fix lane like any model-fixable event. All GitHub access goes through
the injected budgeted gh runner."""
from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

WINDOW_S, TRIP_FAILURES, STATE_KEEP_S, MAX_TRIPS_PER_TICK = 3 * 3600, 2, 24 * 3600, 2
SHARED_WINDOW_S, MAX_SHARED_PEERS, MAX_SHARED_MAIN_RUNS = 6 * 3600, 5, 3
STATE_FILE, LOG_FILE, HOLD_LABEL = "queue-breaker.json", "queue-breaker.jsonl", "lane-fix-red"
QUEUE_QUERY = ("query($o:String!,$r:String!){repository(owner:$o,name:$r){mergeQueue(branch:\"main\"){entries(first:50)"
               "{nodes{state headCommit{oid} pullRequest{id number headRefOid}}}}}}")
DEQUEUE = "mutation($id:ID!){dequeuePullRequest(input:{id:$id}){clientMutationId}}"
BRANCH = re.compile(r"^gh-readonly-queue/main/pr-(\d+)-")
AGGREGATORS = ("ci-fast", "PR Ready", "Product Lane Receipt")
# Mirrors the test token of failureSignature() in scripts/lib/main-red-eject.mjs (`FAIL <project> <file>.test.<ext>`).
# A Python port of that one regex rather than a node subprocess: the breaker only needs the top failing test.
TEST_FAIL = re.compile(r"\bFAIL\s+\S+\s+([\w@./()\[\]-]+\.test\.\w+)")
ANSI = re.compile(r"\x1b\[[0-9;]*m")
CLUSTER_PRS, MAX_CLUSTER_RUNS = 3, 8
POISON_PRS, POISON_SCAN, POISON_FILE = 3, 6, "queue-breaker-poison.json"


def _epoch(value):
    try:
        return datetime.strptime(str(value), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()
    except ValueError:
        return None


def _gh(run, *args):
    done = run(list(args), capture_output=True, text=True, timeout=60)
    if done.returncode != 0:
        raise RuntimeError((done.stderr or done.stdout or f"exit {done.returncode}").strip()[-200:])
    return done.stdout


def latest_green_by_pr(runs: list[dict]) -> dict[int, float]:
    """Per PR: when its latest SUCCESSFUL merge-group run ended (JOV-8492). A failure that ended
    before this is superseded — that exact tree already passed a full group build — so it is no
    evidence against the current head. 2026-11-09 #24694: the breaker kept a 24h hold whose two
    reds 34 later green runs at the same head had superseded, and each relay clear of the stale
    label re-enqueued the head for another full merge-group flight."""
    latest: dict[int, float] = {}
    for row in runs:
        match = BRANCH.match(str(row.get("head_branch") or ""))
        ended = _epoch(row.get("updated_at"))
        if row.get("conclusion") != "success" or not match or ended is None:
            continue
        number = int(match[1])
        if ended > latest.get(number, 0):
            latest[number] = ended
    return latest


def failures_by_pr(runs: list[dict], now: float) -> dict[int, list[dict]]:
    """CI merge_group runs that failed inside the window, keyed by the PR the group branch names."""
    found: dict[int, list[dict]] = {}
    for row in runs:
        match = BRANCH.match(str(row.get("head_branch") or ""))
        ended = _epoch(row.get("updated_at"))
        if row.get("conclusion") != "failure" or not match or ended is None or not 0 <= now - ended <= WINDOW_S:
            continue
        found.setdefault(int(match[1]), []).append({"id": row["id"], "at": ended, "head": row.get("head_sha"),
                                                    "started": _epoch(row.get("created_at"))})
    return found


def head_since(run, repo: str, sha: str | None) -> float | None:
    """When the PR's current head commit was created; None when unknown (then nothing is discounted)."""
    if not sha:
        return None
    try:
        commit = json.loads(_gh(run, "api", f"repos/{repo}/commits/{sha}")).get("commit") or {}
    except (RuntimeError, ValueError):
        return None
    return _epoch((commit.get("committer") or {}).get("date"))


def current_head_failures(fails: list[dict], since: float | None) -> list[dict]:
    """Failures of the current head only: a group run that started before the head existed ran an older head."""
    if since is None:
        return fails
    return [f for f in fails if f.get("started") is None or f["started"] >= since]


def failing_check(run, repo: str, run_id: int) -> dict:
    """The first leaf job and step that failed (aggregators skipped) and its first error line."""
    jobs = json.loads(_gh(run, "api", f"repos/{repo}/actions/runs/{run_id}/jobs?per_page=100")).get("jobs") or []
    leaf = [job for job in jobs if job.get("conclusion") == "failure" and job.get("name") not in AGGREGATORS]
    job = (leaf or [job for job in jobs if job.get("conclusion") == "failure"] or [{}])[0]
    step = next((s.get("name") for s in job.get("steps") or [] if s.get("conclusion") == "failure"), None)
    line = test = None
    if job.get("id"):
        try:
            for text in _gh(run, "api", f"repos/{repo}/actions/jobs/{job['id']}/logs").splitlines():
                if line is None and "##[error]" in text:
                    line = text.split("##[error]", 1)[1].strip()[:240]
                if test is None and (hit := TEST_FAIL.search(ANSI.sub("", text))):
                    test = hit[1]
                if line and test:
                    break
        except RuntimeError:
            pass
    out = {"job": job.get("name"), "step": step, "line": line}
    if test:
        out["test"] = test
    return out


def same_signal(a: dict, b: dict) -> bool:
    """Two failing checks are the same signal: same top failing test, else same job and first error line."""
    if a.get("test") and b.get("test"):
        return a["test"] == b["test"]
    return bool(a.get("job") and a.get("line") and a.get("job") == b.get("job") and a.get("line") == b.get("line"))


def _cached_check(run, repo: str, run_id, cache: dict | None) -> dict:
    if cache is None:
        return failing_check(run, repo, run_id)
    if run_id not in cache:
        cache[run_id] = failing_check(run, repo, run_id)
    return cache[run_id]


def test_cluster_evidence(run, repo: str, runs: list[dict], number: int, check: dict, now: float, cache: dict | None = None) -> dict | None:
    """Simpler shared rule: >= CLUSTER_PRS distinct PR groups (this one included) failed on the same top failing
    test inside SHARED_WINDOW_S. One test red across unrelated PRs is main poison, never one PR's fault."""
    test = (check or {}).get("test")
    if not test:
        return None
    number = int(number)
    newest: dict[int, dict] = {}
    for row in runs:
        match = BRANCH.match(str(row.get("head_branch") or ""))
        ended = _epoch(row.get("updated_at"))
        if row.get("conclusion") != "failure" or not match or ended is None or int(match[1]) == number:
            continue
        if 0 <= now - ended <= SHARED_WINDOW_S and ended > (_epoch(newest.get(int(match[1]), {}).get("updated_at")) or 0):
            newest[int(match[1])] = row
    prs = [number]
    for pr, row in sorted(newest.items(), key=lambda kv: _epoch(kv[1].get("updated_at")), reverse=True)[:MAX_CLUSTER_RUNS]:
        try:
            peer = _cached_check(run, repo, row["id"], cache)
        except (RuntimeError, ValueError, KeyError, TypeError):
            continue
        if peer.get("test") == test:
            prs.append(pr)
    if len(prs) >= CLUSTER_PRS:
        return {"kind": "cluster", "test": test, "prs": sorted(prs)}
    return None


def group_contains_pr(run, repo: str, group_head, number: int) -> bool | None:
    """Whether the queue group's synthetic head carries PR #number's squashed commit (its subject ends
    "(#number)"). None when the head or the compare is unreadable; None is never shared evidence."""
    if not isinstance(group_head, str) or not re.fullmatch(r"[0-9a-f]{40}", group_head):
        return None
    try:
        compare = json.loads(_gh(run, "api", f"repos/{repo}/compare/main...{group_head}"))
    except (RuntimeError, ValueError):
        return None
    commits = compare.get("commits") if isinstance(compare, dict) else None
    if not isinstance(commits, list):
        return None
    suffix = f"(#{number})"
    for row in commits:
        subject = str((row.get("commit") or {}).get("message") or "").split("\n")[0].strip()
        if subject.endswith(suffix):
            return True
    return False


def shared_failure_evidence(run, repo: str, runs: list[dict], number: int, check: dict, now: float, cache: dict | None = None) -> dict | None:
    """Proof the failing signal also fails WITHOUT PR #number, so its merge-group failures say nothing
    about it: a failed merge-group run of a different PR, inside SHARED_WINDOW_S, whose group does not
    contain #number, failing the same check name with the same first error line; or a failed main-branch
    CI run doing the same (the single-queued-PR case). None means not proven shared: today's behavior."""
    job, line = (check or {}).get("job"), (check or {}).get("line")
    if not (job and line) and not (check or {}).get("test"):
        return None
    peers = []
    for row in runs:
        match = BRANCH.match(str(row.get("head_branch") or ""))
        ended = _epoch(row.get("updated_at"))
        if row.get("conclusion") != "failure" or not match or ended is None or int(match[1]) == number:
            continue
        if not 0 <= now - ended <= SHARED_WINDOW_S:
            continue
        peers.append(row)
    peers.sort(key=lambda r: _epoch(r.get("updated_at")) or 0, reverse=True)
    for row in peers[:MAX_SHARED_PEERS]:
        if group_contains_pr(run, repo, row.get("head_sha"), number) is not False:
            continue  # unreadable, or this PR rides in the peer's group: no evidence either way
        try:
            peer_check = _cached_check(run, repo, row["id"], cache)
        except (RuntimeError, ValueError, KeyError, TypeError):
            continue
        if same_signal(check, peer_check):
            return {"kind": "peer", "run": row["id"], "pr": int(BRANCH.match(str(row["head_branch"]))[1]),
                    "job": job, "line": line, "test": check.get("test")}
    try:
        main_runs = json.loads(_gh(run, "api",
                                   f"repos/{repo}/actions/workflows/ci.yml/runs?branch=main&status=failure&per_page=10")).get("workflow_runs") or []
    except (RuntimeError, ValueError):
        main_runs = []
    recent = [row for row in (main_runs if isinstance(main_runs, list) else [])
              if isinstance(row, dict) and (ended := _epoch(row.get("updated_at"))) is not None
              and 0 <= now - ended <= SHARED_WINDOW_S]
    for row in recent[:MAX_SHARED_MAIN_RUNS]:
        try:
            main_check = _cached_check(run, repo, row["id"], cache)
        except (RuntimeError, ValueError, KeyError, TypeError):
            continue
        if same_signal(check, main_check):
            return {"kind": "main", "run": row.get("id"), "job": job, "line": line, "test": check.get("test")}
    return test_cluster_evidence(run, repo, runs, number, check, now, cache)


def _signal_key(check: dict) -> str | None:
    if check.get("test"):
        return f"test:{check['test']}"
    if check.get("job") and check.get("line"):
        return f"job:{check['job']}|{check['line']}"
    return None


def poison_signals(run, repo: str, runs: list[dict], now: float, cache: dict, greens: dict | None = None) -> list[dict]:
    """Signals that failed POISON_PRS or more distinct PR groups inside SHARED_WINDOW_S. Reads the newest failed group
    per PR, at most POISON_SCAN of them, through the shared per-sweep check cache. A failure that ended before the PR's
    latest green merge-group run (`greens`, from latest_green_by_pr) is superseded (JOV-8492) and is no poison
    evidence: that PR's tree has since passed, so it cannot count toward main failing without any one PR."""
    greens = greens or {}
    newest: dict[int, dict] = {}
    for row in runs:
        match, ended = BRANCH.match(str(row.get("head_branch") or "")), _epoch(row.get("updated_at"))
        if row.get("conclusion") != "failure" or not match or ended is None or not 0 <= now - ended <= SHARED_WINDOW_S:
            continue
        if ended <= greens.get(int(match[1]), 0):
            continue
        if ended > (_epoch(newest.get(int(match[1]), {}).get("updated_at")) or 0):
            newest[int(match[1])] = row
    groups: dict[str, dict] = {}
    for pr, row in sorted(newest.items(), key=lambda kv: _epoch(kv[1].get("updated_at")), reverse=True)[:POISON_SCAN]:
        try:
            check = _cached_check(run, repo, row["id"], cache)
        except (RuntimeError, ValueError, KeyError, TypeError):
            continue
        key = _signal_key(check)
        if key:
            entry = groups.setdefault(key, {"key": key, "check": check, "prs": set(), "runs": [], "ended": []})
            entry["prs"].add(pr)
            entry["runs"].append(row.get("id"))
            entry["ended"].append(_epoch(row.get("updated_at")))
    return [{**{k: v for k, v in g.items() if k != "ended"}, "prs": sorted(g["prs"]), "first": min(g["ended"]),
             "last": max(g["ended"])} for g in groups.values() if len(g["prs"]) >= POISON_PRS]


def _file_intake(run, event: dict):
    import pr_events  # lazy: pr_events pulls in remediation and the gh CLI wrappers
    # upsert_intake builds full `gh ...` argv; the sweep's runner (throughput_sentinel._budgeted_gh -> run_gh) takes
    # argv without the leading `gh`, like _gh() above, so strip it or every call runs as `gh gh issue ...`.
    def sh(args):
        argv = list(args)
        return run(argv[1:] if argv[:1] == ["gh"] else argv, capture_output=True, text=True, timeout=60)
    return pr_events.upsert_intake(event, sh=sh)


def main_poison(state: Path, run, runs: list[dict], now: float, repo: str, cache: dict, file_intake=None,
                greens: dict | None = None) -> list[dict]:
    """File one remediation intake per poisoning EPISODE so a fix lane repairs main (canon/MERGE_QUEUE_STEWARD.md
    invariant 4, base-branch class). An episode lasts while each newest failure lands within SHARED_WINDOW_S of its
    last one. The fingerprint (which ensure_linear_intake turns into the Linear issue id) hashes the signal and the
    episode's first failure, so a recurrence after main was fixed gets a new issue, never the completed one. Within an
    episode it is filed once, and again only if still failing a full window after the last filing."""
    signals = poison_signals(run, repo, runs, now, cache, greens)
    import hashlib
    try:
        episodes = json.loads((state / POISON_FILE).read_text())
    except (OSError, ValueError):
        episodes = {}
    episodes = {k: v for k, v in episodes.items() if isinstance(v, dict) and isinstance(v.get("last_fail"), (int, float))
                and now - v["last_fail"] <= SHARED_WINDOW_S}
    out = []
    if signals:
        import remediation  # lazy, like pr_events: only a poisoned main pays for the import
    for signal in signals:
        slot = hashlib.sha256(signal["key"].encode()).hexdigest()[:16]
        episode = episodes.get(slot)
        if episode is None or signal["last"] - episode["last_fail"] > SHARED_WINDOW_S:
            # Pure hex: pr_events.convert_intake and ensure_linear_intake only accept [0-9a-f]+ fingerprints.
            fp = hashlib.sha256(f"main-poison|{signal['key']}|{int(signal['first'])}".encode()).hexdigest()[:16]
            episode = {"fp": fp, "first_fail": signal["first"], "last_fail": signal["last"], "filed": None}
            episodes[slot] = episode
        episode["last_fail"] = max(episode["last_fail"], signal["last"])
        fp = episode["fp"]
        if episode.get("filed") is not None and signal["last"] <= episode["filed"] + SHARED_WINDOW_S:
            continue
        check = signal["check"]
        excerpt = (f"Main is poisoned: `{check.get('test') or check.get('job')}` failed merge groups of {len(signal['prs'])} "
                   f"unrelated PRs ({', '.join(f'#{p}' for p in signal['prs'])}) in {SHARED_WINDOW_S // 3600}h, so it fails "
                   f"without any one PR. First error: {check.get('line')}\n"
                   "Fix it on main in one small PR (base-branch class): reproduce on origin/main, fix the cause (an expired "
                   "date, a stale checked-in baseline, a broken tool fetch), and do not dequeue or edit the victim PRs. "
                   "Never skip, weaken or quarantine the check to get green.")
        event = remediation.remediation_event(
            source="merge-group-shared", fingerprint=fp, ws="ci", first_seen=remediation.now_iso(episode["first_fail"]),
            subject={"signal": signal["key"][:200], "prs": signal["prs"], "runs": signal["runs"][:POISON_SCAN]},
            evidence={"url": f"https://github.com/{repo}/actions/runs/{signal['runs'][0]}", "excerpt": excerpt})
        try:
            issue = (file_intake or _file_intake)(run, event)
        except Exception as error:  # noqa: BLE001 - a filing failure must never break the breaker sweep
            out.append({"fingerprint": fp, "error": f"{type(error).__name__}: {error}"[:160]})
            continue
        if issue:  # an unfiled signal (gh error, or an open intake already holds it) is retried next sweep;
            episode["filed"] = now  # upsert_intake's fingerprint check keeps that from opening a duplicate
        out.append({"fingerprint": fp, "signal": signal["key"][:200], "prs": signal["prs"], "issue": issue})
        with open(state / LOG_FILE, "a") as log:
            log.write(json.dumps({"at": now, "action": "filed-main-poison", "fingerprint": fp, "signal": signal["key"][:200],
                                  "prs": signal["prs"], "issue": issue}) + "\n")
    tmp = state / f".{POISON_FILE}.{os.getpid()}.tmp"
    tmp.write_text(json.dumps(episodes, sort_keys=True))
    os.replace(tmp, state / POISON_FILE)
    return out


def sweep(state, run, now: float | None = None, repo: str = "JovieInc/Jovie", file_intake=None) -> dict:
    now, state = time.time() if now is None else now, Path(state)
    owner, name = repo.split("/")
    out = {"tripped": [], "reblocked": [], "errors": []}
    cache: dict = {}
    try:
        saved = json.loads((state / STATE_FILE).read_text())
    except (OSError, ValueError):
        saved = {}
    saved = {k: v for k, v in saved.items() if now - v.get("at", 0) < STATE_KEEP_S}
    try:
        runs = json.loads(_gh(run, "api", f"repos/{repo}/actions/workflows/ci.yml/runs?event=merge_group&status=failure&per_page=100")).get("workflow_runs") or []
        queue = json.loads(_gh(run, "api", "graphql", "-f", f"query={QUEUE_QUERY}", "-f", f"o={owner}", "-f", f"r={name}"))
        entries = ((((queue.get("data") or {}).get("repository") or {}).get("mergeQueue") or {}).get("entries") or {}).get("nodes") or []
    except (RuntimeError, ValueError) as error:
        out["errors"].append(f"read: {error}")
        return out
    try:
        # Unreadable green runs keep today's behavior (no supersession knowledge), like every
        # other unreadable attribution input here; they never sharpen a hold.
        greens = latest_green_by_pr(json.loads(_gh(run, "api", f"repos/{repo}/actions/workflows/ci.yml/runs?event=merge_group&status=success&per_page=100")).get("workflow_runs") or [])
    except (RuntimeError, ValueError) as error:
        greens = {}
        out["errors"].append(f"green-runs read: {error}")
    queued = {(e.get("pullRequest") or {}).get("number"): e["pullRequest"] for e in entries if e.get("pullRequest")}
    live_commits = {(e.get("pullRequest") or {}).get("number"): ((e.get("headCommit") or {}).get("oid") or "").lower()
                    for e in entries if e.get("pullRequest")}
    for number, fails in sorted(failures_by_pr(runs, now).items()):
        pr = queued.get(number)
        # Supersession first (JOV-8492): a failure older than this PR's latest green merge-group
        # run says nothing about the current head — that tree already passed. A genuinely red
        # head keeps failing after its latest green, so it still trips.
        fails = [f for f in fails if (f.get("at") or 0) > greens.get(number, 0)]
        if len(fails) < TRIP_FAILURES or pr is None or len(out["tripped"]) >= MAX_TRIPS_PER_TICK:
            continue
        live = live_commits.get(number)
        fails = [f for f in fails if not live or str(f.get("head") or "").lower() != live]
        if len(fails) < TRIP_FAILURES:
            continue
        fails = current_head_failures(fails, head_since(run, repo, pr.get("headRefOid")))
        if len(fails) < TRIP_FAILURES:
            continue
        try:
            check = _cached_check(run, repo, max(fails, key=lambda f: f["at"])["id"], cache)
            shared = shared_failure_evidence(run, repo, runs, number, check, now, cache)
            if shared:
                out.setdefault("skipped-shared", []).append(int(number))
                with open(state / LOG_FILE, "a") as log:
                    log.write(json.dumps({"at": now, "pr": number, "failures": len(fails), "check": check,
                                          "head": pr.get("headRefOid"), "action": "skipped-shared-failure",
                                          "shared": shared}) + "\n")
                continue
            _gh(run, "api", "graphql", "-f", f"query={DEQUEUE}", "-f", f"id={pr['id']}")
            marker = json.dumps({"code": "merge-group-breaker", "by": "lanes/queue_breaker", "failures": len(fails), "check": check.get("job")})
            body = (f"Dequeued from the merge queue: {len(fails)} merge-group CI failures in {WINDOW_S // 3600}h, each of which "
                    f"re-formed every group behind it. Failing check: `{check.get('job')}` / `{check.get('step')}`.\n"
                    f"First error: `{check.get('line')}`\n\nIt is held with `{HOLD_LABEL}` and will not be re-enqueued until its head changes "
                    f"and the check passes at PR time.\n<!-- queue-dequeue {marker} -->")
            for args in (("api", f"repos/{repo}/issues/{number}/comments", "-f", f"body={body}"),
                         ("api", f"repos/{repo}/issues/{number}/labels", "-f", f"labels[]={HOLD_LABEL}")):
                try:
                    _gh(run, *args)
                except RuntimeError as error:
                    out["errors"].append(f"#{number} {args[1].rsplit('/', 1)[-1]}: {error}")
            saved[str(number)] = {"head": pr.get("headRefOid"), "at": now, "check": check}
            out["tripped"].append(number)
            with open(state / LOG_FILE, "a") as log:
                log.write(json.dumps({"at": now, "pr": number, "failures": len(fails), "check": check, "head": pr.get("headRefOid"),
                                      "action": "dequeued+held"}) + "\n")
        except RuntimeError as error:
            out["errors"].append(f"#{number} trip: {error}")
    try:
        poison = main_poison(state, run, runs, now, repo, cache, file_intake, greens)
        if poison:
            out["main-poison"] = poison
    except Exception as error:  # noqa: BLE001 - poison filing never breaks the trip/hold sweep
        out["errors"].append(f"main-poison: {type(error).__name__}: {error}"[:200])
    # Keep a tripped PR held while its head is unchanged: Source Validation passing on the same head is not a fix.
    for number, record in list(saved.items()):
        if str(number) in map(str, out["tripped"]):
            continue
        try:
            current = json.loads(_gh(run, "api", f"repos/{repo}/pulls/{number}"))
            if current.get("state") != "open":
                saved.pop(number, None)
                continue
            if (current.get("head") or {}).get("sha") != record.get("head"):
                # New head: the breaker's own hold is released. Only this label, and only for a PR it tripped.
                labels = [l.get("name") for l in current.get("labels") or []]
                if HOLD_LABEL in labels:
                    _gh(run, "api", "-X", "DELETE", f"repos/{repo}/issues/{number}/labels/{HOLD_LABEL}")
                saved.pop(number, None)
                out.setdefault("released", []).append(int(number))
                with open(state / LOG_FILE, "a") as log:
                    log.write(json.dumps({"at": now, "pr": int(number), "head": (current.get("head") or {}).get("sha"),
                                          "action": "released-new-head"}) + "\n")
            else:
                labels = [l.get("name") for l in current.get("labels") or []]
                if greens.get(int(number), 0) > float(record.get("at") or 0):
                    # Superseded (JOV-8492): a green merge-group run at this head ended after the
                    # trip, so the reds the hold names are no longer the latest verdict. Release
                    # like a new head: take back the label this breaker applied (when still
                    # present) and never re-apply it — each re-application wakes dequeue-held and
                    # churns a green queued PR.
                    removed = HOLD_LABEL in labels
                    if removed:
                        _gh(run, "api", "-X", "DELETE", f"repos/{repo}/issues/{number}/labels/{HOLD_LABEL}")
                    saved.pop(number, None)
                    out.setdefault("released-superseded", []).append(int(number))
                    with open(state / LOG_FILE, "a") as log:
                        log.write(json.dumps({"at": now, "pr": int(number), "head": record.get("head"),
                                              "action": "released-superseded", "label_removed": removed}) + "\n")
                    continue
                shared = shared_failure_evidence(run, repo, runs, number, record.get("check") or {}, now, cache)
                if shared:
                    # The trip's failures were never this PR's. Release the hold: take back the label this breaker
                    # applied (when still present) and never re-apply it (each re-application wakes dequeue-held
                    # and churns a green queued PR). Receipt: the jsonl line below.
                    removed = HOLD_LABEL in labels
                    if removed:
                        _gh(run, "api", "-X", "DELETE", f"repos/{repo}/issues/{number}/labels/{HOLD_LABEL}")
                    saved.pop(number, None)
                    out.setdefault("released-shared", []).append(int(number))
                    with open(state / LOG_FILE, "a") as log:
                        log.write(json.dumps({"at": now, "pr": int(number), "head": record.get("head"),
                                              "check": record.get("check"), "action": "released-shared-failure",
                                              "label_removed": removed, "shared": shared}) + "\n")
                elif HOLD_LABEL not in labels:
                    _gh(run, "api", f"repos/{repo}/issues/{number}/labels", "-f", f"labels[]={HOLD_LABEL}")
                    out["reblocked"].append(int(number))
                    with open(state / LOG_FILE, "a") as log:
                        log.write(json.dumps({"at": now, "pr": int(number), "head": record.get("head"), "action": "reblocked-same-head"}) + "\n")
        except (RuntimeError, ValueError) as error:
            out["errors"].append(f"#{number} recheck: {error}")
    tmp = state / f".{STATE_FILE}.{os.getpid()}.tmp"
    tmp.write_text(json.dumps(saved, sort_keys=True))
    os.replace(tmp, state / STATE_FILE)
    return out
