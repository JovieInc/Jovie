"""Bounded, resumable pagination of the outcome lane's Validating issue queue."""
import json
from pathlib import Path

from atomic_state import atomic_write_text


CANDIDATES_QUERY = """query($after:String,$first:Int!){issues(first:$first,after:$after,
 filter:{team:{key:{eq:"JOV"}},state:{name:{eq:"Validating"}}},orderBy:updatedAt){
 pageInfo{hasNextPage endCursor}
 nodes{id identifier title url description comments(last:30){nodes{id body createdAt parent{id} user{name}}}}}}"""


def scan_issues(linear, state: Path, now: float, limit: int, cursor_ttl: float):
    """Commit the cursor only after the caller processes a complete scan window."""
    cursor_path = state / "outcome-scan-cursor.json"
    try:
        cursor = json.loads(cursor_path.read_text())
        after = cursor["after"] if 0 <= now - cursor["at"] < cursor_ttl else None
        if after is not None and (not isinstance(after, str) or not 0 < len(after) <= 4096):
            raise ValueError("outcome-scan-cursor-invalid")
    except FileNotFoundError:
        after = None
    seen, visited = 0, set()
    while seen < limit:
        size = min(50, limit - seen)
        visited.add(after)
        page = linear.gql(CANDIDATES_QUERY, {"after": after, "first": size})["issues"]
        if len(page["nodes"]) > size:
            raise ValueError("outcome-scan-page-too-large")
        for issue in page["nodes"]:
            seen += 1
            yield issue
        if not page["pageInfo"]["hasNextPage"]:
            after = None
            break
        after = page["pageInfo"]["endCursor"]
        if not page["nodes"] or not isinstance(after, str) or not 0 < len(after) <= 4096 or after in visited:
            raise ValueError("outcome-scan-no-progress")
    atomic_write_text(cursor_path, json.dumps({"after": after, "at": now}))
