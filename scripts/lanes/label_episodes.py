"""Label-episode provenance: who applied the current episode of a repair label (JOV-8492).

The Lane Fix Relay clears a stale `lane-fix-red` when the PR-head check rollup settles green.
That rollup can only supersede a red the relay itself applied (a PR-head check red, written with
GITHUB_TOKEN and therefore actor `github-actions[bot]`). A `jovie-bot[bot]` episode is the queue
breaker's merge-group hold — those reds are invisible to the rollup, and clearing one re-arms the
hold/re-enroll churn (#24694 flew a green head through ~35 merge-group builds). A human label is a
human hold. An unreadable applier keeps the label: fail closed.

api-budget: github-user-graphql 60/hr - one label-episode read per green wake on a labeled head; fail-closed on unreadable
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

REPO = os.environ.get("GITHUB_REPOSITORY", "JovieInc/Jovie")
HERE = Path(__file__).resolve().parent
GH_BIN = "gh"

LABEL_EPISODE_QUERY = """query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){
pullRequest(number:$number){timelineItems(last:100,itemTypes:[LABELED_EVENT]){nodes{... on LabeledEvent{createdAt
label{name} actor{__typename login}}}}}}}"""

# The relay's own GITHUB_TOKEN identity: the only applier whose reds its rollup can evaluate.
RELAY_RED_LABELLER = "github-actions[bot]"


def _budgeted_gh(args):
    """gh through the shared client layer (budget, breaker, backoff); subprocess-shaped result."""
    scripts = str(HERE.parent)
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    from apiclient.gh import run_gh
    done = run_gh(list(args), priority="repair")
    return subprocess.CompletedProcess(args, done["code"], done["stdout"], done["stderr"])


def label_episode_applier(number: int, label: str, sh, budgeted=None) -> str | None:
    """Login that applied the current episode of `label` (one GraphQL read); None when unreadable.
    `budgeted` (the caller's real runner only) routes production through the shared budgeted
    client layer (external-api-guard ratchet); an injected shell (tests) sees the full command line."""
    owner, name = REPO.split("/", 1)
    args = ["api", "graphql", "-f", f"query={LABEL_EPISODE_QUERY}", "-F", f"owner={owner}",
            "-F", f"name={name}", "-F", f"number={number}"]
    read = None
    if budgeted:
        try:
            read = _budgeted_gh([GH_BIN, *args])
        except ImportError:  # sparse relay checkout without the client layer: plain gh still reads
            read = None
    if read is None:
        read = sh([GH_BIN, *args])
    try:
        nodes = json.loads(read.stdout)["data"]["repository"]["pullRequest"]["timelineItems"]["nodes"]
        episodes = [node for node in nodes
                    if str((node.get("label") or {}).get("name") or "").lower() == label]
        latest = max(episodes, key=lambda node: str(node.get("createdAt") or ""))
        actor = latest.get("actor") or {}
        login = actor.get("login")
    except (ValueError, KeyError, IndexError, TypeError, AttributeError):
        return None
    if not login:
        return None
    login = str(login).lower()
    # GraphQL names a Bot without REST's "[bot]" suffix ("github-actions"), so without this the
    # provenance gate never matched RELAY_RED_LABELLER and no stale lane-fix-red ever cleared (#25157).
    if actor.get("__typename") == "Bot" and not login.endswith("[bot]"):
        login += "[bot]"
    return login
