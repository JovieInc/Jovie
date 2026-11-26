"""Read-only issue and retirement queries used by PR event handling."""

import json
import re
import time
from datetime import datetime


AUTO_READY_PARK_RE = re.compile(r"<!--\s*jovie-auto-ready:\s*park\s*-->", re.IGNORECASE)


BACKLOG_DRAFT_FIELDS = """state baseRefName headRefOid isDraft mergeable
reviewDecision isCrossRepository isInMergeQueue body labels(first:100){pageInfo{hasNextPage} nodes{name}}
commits(last:1){nodes{commit{committedDate}}}
timelineItems(last:1,itemTypes:[CONVERT_TO_DRAFT_EVENT,HEAD_REF_FORCE_PUSHED_EVENT]){nodes{__typename}}"""


def _timestamp(value):
    try:
        stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return stamp.timestamp() if stamp.tzinfo is not None else None
    except (ValueError, AttributeError, TypeError, OverflowError):
        return None


def _unheld_labels(labels, protected):
    return isinstance(labels, list) and all(
        isinstance(item, dict) and isinstance(item.get("name"), str)
        and item["name"].lower() not in protected for item in labels
    )


def _stale_conflict_clock(pr, row, writer_active, protected, now):
    """Accept an idle tip only with full evidence for the original head."""
    try:
        # GraphQL lists the latest relevant event. A draft created as a draft can have none.
        events = pr["timelineItems"]["nodes"]
        if events not in ([], [{"__typename": "HeadRefForcePushedEvent"}]):
            return None
        if pr["labels"]["pageInfo"]["hasNextPage"] is not False or not _unheld_labels(
                pr["labels"]["nodes"], protected):
            return None
        if (pr["state"] != "OPEN" or pr["isDraft"] is not True or pr["baseRefName"] != "main"
                or pr["headRefOid"] != row["headRefOid"] or pr["isCrossRepository"] is not False
                or pr["isInMergeQueue"] is not False or pr["mergeable"] != "CONFLICTING"
                or pr["reviewDecision"] not in (None, "APPROVED", "REVIEW_REQUIRED")
                or AUTO_READY_PARK_RE.search(pr["body"])):
            return None
        commit_at = pr["commits"]["nodes"][0]["commit"]["committedDate"]
    except (IndexError, KeyError, TypeError, ValueError):
        # An unreadable candidate leaves the rest of the inventory available.
        return None
    moved = _timestamp(commit_at)
    if moved is None or moved > now or writer_active(moved, now):
        return None
    return commit_at


def list_open_prs(repo: str, read, writer_active, is_lane_branch, protected_labels, min_age_s: int,
                  *, enrich_conflicted_drafts: bool = False) -> list[dict]:
    """Request clocks for non-lane draft conflicts only during a conflict sweep."""
    fields = "number,headRefName,headRefOid,isDraft,mergeable,mergeStateStatus,isCrossRepository,labels"
    if enrich_conflicted_drafts:
        fields += ",createdAt,baseRefName"
    listed = read(["pr", "list", "--repo", repo, "--state", "open", "--limit", "300", "--json", fields])
    try:
        rows = json.loads(listed.stdout) if listed.returncode == 0 else []
    except (ValueError, TypeError):
        return []
    if not isinstance(rows, list):
        return []
    rows = [row for row in rows if isinstance(row, dict) and type(row.get("number")) is int]
    if not enrich_conflicted_drafts:
        return rows
    now = time.time()
    candidates = []
    for row in rows:
        # Preserve the ordinary inventory shape unless the new conflict path qualifies.
        created_at = row.pop("createdAt", None)
        base = row.pop("baseRefName", None)
        created = _timestamp(created_at)
        if (row.get("isDraft") is not True or row.get("isCrossRepository") is not False
                or row.get("mergeable") != "CONFLICTING" or base != "main"
                or created is None or now - created <= min_age_s
                or not row.get("headRefOid") or not isinstance(row.get("headRefName"), str)
                or is_lane_branch(row["headRefName"]) or not _unheld_labels(row.get("labels"), protected_labels)):
            continue
        candidates.append((row, created_at))
    owner, name = repo.split("/", 1)
    for start in range(0, len(candidates), 25):
        batch = candidates[start:start + 25]
        aliases = " ".join(
            f"pr{row['number']}:pullRequest(number:{row['number']}){{{BACKLOG_DRAFT_FIELDS}}}"
            for row, _ in batch
        )
        query = f"query($owner:String!,$name:String!){{repository(owner:$owner,name:$name){{{aliases}}}}}"
        viewed = read(["api", "graphql", "-f", f"query={query}", "-F", f"owner={owner}", "-F", f"name={name}"])
        try:
            evidence = json.loads(viewed.stdout)["data"]["repository"]
        except (KeyError, TypeError, ValueError):
            continue
        if not isinstance(evidence, dict):
            continue
        for row, created_at in batch:
            pr = evidence.get(f"pr{row['number']}")
            commit_at = _stale_conflict_clock(pr, row, writer_active, protected_labels, now)
            if commit_at is not None:
                row.update(baseRefName="main", createdAt=created_at, lastCommitAt=commit_at)
    return rows


def linear_issue(linear, identifier: str) -> dict | None:
    team, _, number = identifier.upper().partition("-")
    data = linear.gql('query($n:Float!,$t:String!){issues(filter:{team:{key:{eq:$t}},number:{eq:$n}})'
                      '{nodes{id state{name type} comments(last:20){nodes{body}}}}}', {"n": float(number), "t": team})
    nodes = data["issues"]["nodes"]
    return nodes[0] if nodes else None

RETIREMENT_QUERY = """query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){
pullRequest(number:$number){number state headRefOid headRefName isCrossRepository isInMergeQueue
labels(first:100){pageInfo{hasNextPage} nodes{name}}}}}"""
