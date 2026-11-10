"""Label-episode provenance: who applied the current episode of a repair label (JOV-8492).

The Lane Fix Relay clears a stale `lane-fix-red` when the PR-head check rollup settles green.
That rollup can only supersede a red the relay itself applied (a PR-head check red, written with
GITHUB_TOKEN and therefore actor `github-actions[bot]`). A `jovie-bot[bot]` episode is the queue
breaker's merge-group hold — those reds are invisible to the rollup, and clearing one re-arms the
hold/re-enroll churn (#24694 flew a green head through ~35 merge-group builds). A human label is a
human hold. An unreadable applier keeps the label: fail closed.
"""
from __future__ import annotations

import json
import os

REPO = os.environ.get("GITHUB_REPOSITORY", "JovieInc/Jovie")

LABEL_EPISODE_QUERY = """query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){
pullRequest(number:$number){timelineItems(last:100,itemTypes:[LABELED_EVENT]){nodes{... on LabeledEvent{createdAt
label{name} actor{__typename login}}}}}}}}"""

# The relay's own GITHUB_TOKEN identity: the only applier whose reds its rollup can evaluate.
RELAY_RED_LABELLER = "github-actions[bot]"


def label_episode_applier(number: int, label: str, sh) -> str | None:
    """Login that applied the current episode of `label` (one GraphQL read); None when unreadable."""
    owner, name = REPO.split("/", 1)
    read = sh(["gh", "api", "graphql", "-f", f"query={LABEL_EPISODE_QUERY}", "-F", f"owner={owner}",
               "-F", f"name={name}", "-F", f"number={number}"])
    try:
        nodes = json.loads(read.stdout)["data"]["repository"]["pullRequest"]["timelineItems"]["nodes"]
        episodes = [node for node in nodes
                    if str((node.get("label") or {}).get("name") or "").lower() == label]
        latest = max(episodes, key=lambda node: str(node.get("createdAt") or ""))
        login = (latest.get("actor") or {}).get("login")
    except (ValueError, KeyError, IndexError, TypeError, AttributeError):
        return None
    return str(login).lower() if login else None
