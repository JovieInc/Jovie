"""Red-repair admission: who may get `lane-fix-red`, and when no one may (Tim, 2026-11-12).

A red REQUIRED check on any open same-repo PR to main, draft or not and whatever its branch
prefix, queues repair now, unless an ACTIVE WORKER holds the head. On 2026-11-12, 27 agent
drafts sat red 6-48h with nobody on them, because drafts were repaired only once
`pr_events.abandoned_agent_draft` (3 days old, 48h idle) reclaimed them. That rule stays the
authority for close and reclaim-to-close only (JOV-INV-011), never the gate for red repair.

Active worker, and nothing else (process liveness is invisible across hosts):
  - an unexpired `🤖 lane claim` on the exact head SHA (`pr_events.claim_active`, 60-minute TTL), or
  - a head commit newer than ACTIVE_COMMIT_S. That window is the "check in after an hour": no new
    poll or cron (JOV-INV-042); the relay acts on the red event and the existing reconcile sweep
    is the backstop once the window passes.

Guards that queue no repair at all:
  - red main: while the newest completed Main Health run on main failed, every PR inherits the red
    (`main_health.evaluate` is the one reader of that signal);
  - infra incident: more than INFRA_PEERS open PRs failing the same required check inside
    INFRA_WINDOW_S is one incident (one fingerprinted remediation intake), not N repairs.
The per-head attempt cap and HANDOFF_BACKOFF_S stay where they are; exhaustion parks, never closes.

Pure helpers plus reads through the shared client layer; pr_events wires them into the relay
and the reconcile sweep.
api-budget: github-app-graphql 60/hr - one 30-PR rollup read (~31 points) per red label the relay would apply (infra peer count)
api-budget: github-app-core 60/hr - one Main Health runs read per relay run that would apply a red label
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import main_health  # noqa: E402  (the one reader of the Main Health red/green signal)
import remediation  # noqa: E402  (fingerprinted intake events)

GH_BIN = "gh"
ACTIVE_COMMIT_S = 60 * 60
INFRA_PEERS = 5
INFRA_WINDOW_S = 30 * 60
RED_CHECK_STATES = frozenset({"FAILURE", "TIMED_OUT", "STARTUP_FAILURE", "ERROR"})
# Advisory checks that never gate a merge: their red (Tently's provider was down all night on
# 2026-11-01, ~100 PRs got lane-fix-red) is no repair signal.
NON_REQUIRED_CHECKS = frozenset({"tently"})
PEER_QUERY = """query($owner:String!,$name:String!){repository(owner:$owner,name:$name){
pullRequests(states:OPEN,first:30,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{number isCrossRepository
commits(last:1){nodes{commit{statusCheckRollup{contexts(first:100){nodes{__typename
... on CheckRun{name conclusion startedAt completedAt} ... on StatusContext{context state createdAt}}}}}}}}}}}"""


def epoch(stamp) -> float | None:
    try:
        return datetime.fromisoformat(str(stamp).replace("Z", "+00:00")).timestamp()
    except (TypeError, ValueError):
        return None


def failing_checks(nodes) -> dict[str, str]:
    """{required check name: when its latest run failed} from rollup context nodes. GitHub's
    rollup counts a CANCELLED (superseded) run as FAILURE even after its replacement passed, so
    only the latest run of each check counts; a SUCCESS tying a FAILURE is the newer verdict
    (JOV-8492)."""
    latest: dict = {}
    for node in nodes or []:
        if not isinstance(node, dict):
            continue
        key = node.get("name") or node.get("context")
        at = node.get("completedAt") or node.get("startedAt") or node.get("createdAt") or ""
        state = str(node.get("conclusion") or node.get("state") or "").upper()
        if not key or str(key).lower() in NON_REQUIRED_CHECKS:
            continue
        if key not in latest or at > latest[key][0] or (
                at == latest[key][0] and latest[key][1] in RED_CHECK_STATES and state not in RED_CHECK_STATES):
            latest[key] = (at, state)
    return {key: at for key, (at, state) in latest.items() if state in RED_CHECK_STATES}


def repairable_draft(pr: dict) -> bool:
    """A same-repo, open draft to main: in red-repair scope whatever its branch prefix. A stacked
    draft belongs to its parent's stack (a rebase onto main would re-add the parent's commits)."""
    return bool(pr.get("isDraft")) and not pr.get("isCrossRepository") \
        and str(pr.get("state", "OPEN")).upper() == "OPEN" and (pr.get("baseRefName") or "main") == "main"


def writer_active(committed_at, now: float) -> bool:
    """A head commit newer than ACTIVE_COMMIT_S: its writer still holds it."""
    committed = committed_at if isinstance(committed_at, (int, float)) else epoch(committed_at)
    return committed is not None and 0 <= now - committed < ACTIVE_COMMIT_S


def gh_read(args: list[str], sh=None):
    """A read through the shared client layer (budget, breaker, backoff) on the relay's read
    token when one was minted. An injected shell (tests, the lane host's `sh`) sees gh argv."""
    if sh is not None:
        return sh([GH_BIN, *args])
    scripts = str(HERE.parent)
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    from apiclient.gh import run_gh
    token = os.environ.get("GH_READ_TOKEN")
    done = run_gh(list(args), priority="repair", env={**os.environ, "GH_TOKEN": token} if token else None)
    return subprocess.CompletedProcess(args, done["code"], done["stdout"], done["stderr"])


def main_red(repo: str, sh=None, cache: dict | None = None) -> bool:
    """True while main's newest completed Main Health run failed. Unreadable is not red: the
    reconcile sweep re-reads, and a dropped red would cost more than one wasted label."""
    if cache is not None and "mainRed" in cache:
        return cache["mainRed"]
    read = gh_read(["api", f"repos/{repo}/actions/workflows/{main_health.WORKFLOW}/runs"
                           "?branch=main&status=completed&per_page=10"], sh)
    try:
        runs = json.loads(read.stdout or "")["workflow_runs"] if read.returncode == 0 else None
    except (ValueError, KeyError, TypeError):
        runs = None
    red = isinstance(runs, list) and main_health.evaluate(runs).get("status") == "failing"
    if cache is not None:
        cache["mainRed"] = red
    return red


def peer_failures(repo: str, sh=None, cache: dict | None = None) -> dict[str, dict[int, str]] | None:
    """{required check: {open same-repo PR: failedAt}} over the most recently updated open PRs.
    One GraphQL read per relay run; None when unreadable (no incident is invented)."""
    if cache is not None and "peers" in cache:
        return cache["peers"]
    owner, name = repo.split("/", 1)
    read = gh_read(["api", "graphql", "-f", f"query={PEER_QUERY}", "-F", f"owner={owner}", "-F", f"name={name}"], sh)
    peers: dict | None = {}
    try:
        nodes = json.loads(read.stdout or "")["data"]["repository"]["pullRequests"]["nodes"] \
            if read.returncode == 0 else None
        for node in nodes:
            if node.get("isCrossRepository"):
                continue
            commit = (node["commits"]["nodes"] or [{}])[0].get("commit") or {}
            contexts = ((commit.get("statusCheckRollup") or {}).get("contexts") or {}).get("nodes")
            for check, at in failing_checks(contexts).items():
                peers.setdefault(check, {})[node["number"]] = at
    except (ValueError, KeyError, TypeError, AttributeError, IndexError):
        peers = None
    if cache is not None:
        cache["peers"] = peers
    return peers


def incident_checks(failures: dict[str, dict[int, str]], now: float) -> dict[str, list[int]]:
    """{check: PRs} for each required check more than INFRA_PEERS PRs failed inside INFRA_WINDOW_S."""
    incidents = {}
    for check, rows in (failures or {}).items():
        recent = sorted(number for number, at in rows.items()
                        if (stamp := epoch(at)) is not None and 0 <= now - stamp <= INFRA_WINDOW_S)
        if len(recent) > INFRA_PEERS:
            incidents[check] = recent
    return incidents


def incident_event(check: str, prs: list[int], now: float) -> dict:
    """One fingerprinted remediation intake per check: `upsert_intake` keeps one open issue."""
    excerpt = (f"Infra incident: required check `{check}` failed on {len(prs)} open PRs within "
               f"{INFRA_WINDOW_S // 60} min ({', '.join(f'#{n}' for n in prs[:20])}). Treated as one "
               "incident: no PR gets lane-fix-red for it; the reconcile sweep re-checks once it clears.")
    return remediation.remediation_event(
        source="infra-incident", fingerprint=remediation.fingerprint(["infra-incident", check]),
        subject={"check": check, "prs": prs[:20]}, evidence={"url": "", "excerpt": excerpt}, ws="ci",
        first_seen=datetime.fromtimestamp(now).astimezone().isoformat())
