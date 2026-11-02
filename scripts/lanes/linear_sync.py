"""Local Linear mirror, claim ledger and write outbox for the one Symphony host.

Tim 2026-10-11: "linear being down should not stop shipping." Under <state>/linear/:
mirror-<TEAM>.json holds open issues, refreshed incrementally (updatedAt >= cursor) by the
dispatch tick when the budget admits it, plus every issue an outbox flush reads back;
dispatch reads it at any age. claims.json is the claim authority (Linear's In Progress is
its projection). outbox.json holds every lane write, flushed oldest-first with readback;
a flush that finds the issue closed or parked supersedes the claim and never destroys work.
No Linear webhook feed reaches Gem yet; `apply()` is where one would land."""
from __future__ import annotations

import fcntl
import hashlib
import json
import os
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from atomic_state import atomic_write_text

TEAMS = ("JOV", "LYB")
SYNC_PAGES = 20   # incremental pages per team per tick (1000 rows); the wall budget below ends it sooner
SYNC_BUDGET_S = 25  # wall budget for one team's incremental pass
MIRROR_SYNC_LOG = "mirror-sync.jsonl"  # one row per completed pass: oldest change -> mirrored (stage_events linear-mirror)
FILL_PAGES = 10   # first-fill pages per team per tick; the fill resumes next tick
FILL_OVERLAP_S = 300  # the first incremental re-reads this window before the fill began
STALE_ALERT_S = 6 * 3600
OUTBOX_ALERT_S = 3600  # writes are comments and state moves; an hour behind already misleads the board
# Gem 2026-10-25: 504 pending writes (408 lane comments), none attempted, oldest 164 min, depth growing.
# Arrivals ran 80-175 per 30 min against a drain of 10 per dispatch tick, with Linear at 4995/5000
# requests free: the cap, not the API, was the limit. Drain until the quota guard (admit) holds, the
# wall budget ends, or the safety ceiling is reached.
FLUSH_LIMIT = 200
FLUSH_BUDGET_S = 45
DEAD_AFTER = 8
CLAIM_KEEP_S = 7 * 86400
TERMINAL = frozenset({"completed", "canceled"})
NOT_STARTED = frozenset({"triage", "backlog", "unstarted"})
RELEASE_STATES = frozenset({"Todo", "Backlog", "Triage", "Done", "Canceled"})
# Started states. Entering one needs a live owner recorded at the same moment (an active
# local claim, or an explicit owner the caller names); a status alone owns nothing.
STARTED = frozenset({"In Progress", "In Review", "Rework", "Merging", "Validating"})


class StartedWithoutOwner(ValueError):
    """A started-state move with no recorded owner: the orphaned-status bug, refused."""


def require_owner(state: Path, issue_id: str, target: str, owner: str | None) -> None:
    if target in STARTED and not owner and claim_status(state, issue_id) != "active":
        raise StartedWithoutOwner(f"{target} for {issue_id} without a live owner")
ROW = ("id identifier title description priority createdAt updatedAt state{name type} parent{id} "
       "labels(first:25){pageInfo{hasNextPage} nodes{name}}")
# Newest change first: an Urgent or just-updated issue reaches the mirror in the first page, not the last.
SYNC_QUERY = ('query($team:String!,$since:DateTimeOrDuration!,$after:String){issues(first:50,after:$after,orderBy:updatedAt,'
              'filter:{team:{key:{eq:$team}},updatedAt:{gte:$since}}){pageInfo{hasNextPage endCursor} nodes{'
              + ROW + '}}}')
FILL_QUERY = ('query($team:String!,$after:String){issues(first:50,after:$after,filter:{team:{key:{eq:$team}},'
              'state:{type:{in:["triage","unstarted","started"]}}}){pageInfo{hasNextPage endCursor} nodes{' + ROW + '}}}')
ISSUE_QUERY = 'query($id:String!){issue(id:$id){' + ROW + ' team{states{nodes{id name}}}}}'
MOVE_MUTATION = ('mutation($id:String!,$s:String!){issueUpdate(id:$id,input:{stateId:$s}){success issue{'
                 + ROW + '}}}')
COMMENT_MUTATION = 'mutation($id:String!,$b:String!){commentCreate(input:{issueId:$id,body:$b}){success}}'
RANK_MUTATION = ('mutation($id:String!,$o:Float!){issueUpdate(id:$id,input:{sortOrder:$o}){success issue{id sortOrder}}}')
LABELS_QUERY = ('query($id:String!){issue(id:$id){labels(first:50){nodes{id name}} team{key}}}')
LABEL_LOOKUP = ('query($n:String!){issueLabels(first:20,filter:{name:{eq:$n}}){nodes{id name team{key}}}}')
LABEL_MUTATION = ('mutation($id:String!,$l:[String!]!){issueUpdate(id:$id,input:{labelIds:$l}){success issue{id}}}')
BACKLOG_ORDER_QUERY = ('query($team:String!,$after:String){issues(first:100,after:$after,filter:{team:{key:{eq:$team}},'
                       'state:{type:{eq:"backlog"}}}){pageInfo{hasNextPage endCursor} nodes{id identifier sortOrder}}}')
COMMENTS_QUERY = 'query($id:String!){issue(id:$id){comments(first:20){nodes{body}}}}'


def _read(path: Path, schema: str) -> dict:
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError):
        return {"schema": schema}
    return data if isinstance(data, dict) and data.get("schema") == schema else {"schema": schema}


def _write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(data, separators=(",", ":")))
    os.replace(tmp, path)


@contextmanager
def _mutating(path: Path, schema: str):
    """Read-modify-write under the file's own lock; readers see whole files only."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path.with_suffix(".lock"), "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        data = _read(path, schema)
        yield data
        _write(path, data)


def mirror_path(state: Path, team: str) -> Path:
    return state / "linear" / f"mirror-{team}.json"


def _claims_path(state: Path) -> Path:
    return state / "linear" / "claims.json"


def _outbox_path(state: Path) -> Path:
    return state / "linear" / "outbox.json"


MIRROR, CLAIMS, OUTBOX = "jovie-linear-mirror/v1", "jovie-linear-claims/v1", "jovie-linear-outbox/v1"


def normalize(node) -> dict | None:
    """A mirror row from a Linear issue node, or None when the node is not a whole issue."""
    if not isinstance(node, dict):
        return None
    state, labels = node.get("state"), node.get("labels")
    if not all(isinstance(node.get(key), str) and node[key] for key in ("id", "identifier", "updatedAt", "createdAt")) \
            or not isinstance(state, dict) or not isinstance(state.get("name"), str) or not isinstance(labels, dict) \
            or not isinstance(labels.get("nodes"), list):
        return None
    names = sorted({item["name"] for item in labels["nodes"] if isinstance(item, dict) and isinstance(item.get("name"), str)})
    priority = node.get("priority")
    return {"id": node["id"], "identifier": node["identifier"], "title": node.get("title") or "",
            "description": node.get("description") or "",
            "priority": priority if type(priority) is int and 0 <= priority <= 4 else 0,
            "createdAt": node["createdAt"], "updatedAt": node["updatedAt"],
            "state": state["name"], "stateType": state.get("type") or "",
            "parentId": (node.get("parent") or {}).get("id"), "labels": names,
            # A truncated label list could hide a hold or sensitive label: never dispatchable.
            "labelsComplete": (labels.get("pageInfo") or {}).get("hasNextPage") is False
                              and len(names) == len(labels["nodes"])}


def team_of(identifier: str) -> str:
    return (identifier or "").split("-", 1)[0].upper()


def apply(state: Path, team: str, nodes: list) -> int:
    """Upsert issue nodes (newer updatedAt wins); closed issues leave the mirror. Claims the
    remote state no longer supports are reconciled here, never by deleting work."""
    rows = [row for row in map(normalize, nodes) if row is not None and team_of(row["identifier"]) == team]
    if not rows:
        return 0
    changed = []
    with _mutating(mirror_path(state, team), MIRROR) as data:
        issues = data.setdefault("issues", {})
        for row in rows:
            old = issues.get(row["id"])
            if old and old.get("updatedAt", "") > row["updatedAt"]:
                continue
            changed.append(row)
            if row["stateType"] in TERMINAL:
                issues.pop(row["id"], None)
            else:
                issues[row["id"]] = row
    _reconcile_claims(state, changed)
    return len(changed)


def _pending_moves(state: Path) -> dict:
    moves = {}
    for entry in _read(_outbox_path(state), OUTBOX).get("entries") or []:
        if entry.get("op") == "move":
            moves[entry.get("issueId")] = entry.get("target")
    return moves


def _reconcile_claims(state: Path, rows: list[dict]) -> None:
    claims = _read(_claims_path(state), CLAIMS).get("claims") or {}
    stale = [row for row in rows if (claims.get(row["id"]) or {}).get("status") == "active"]
    if not stale:
        return
    pending = _pending_moves(state)
    with _mutating(_claims_path(state), CLAIMS) as data:
        for row in stale:
            claim = data.setdefault("claims", {}).get(row["id"])
            if not claim or claim.get("status") != "active":
                continue
            if row["stateType"] in TERMINAL:
                claim.update(status="closed", endedAt=time.time(), reason=f"remote:{row['state']}")
            elif row["stateType"] in NOT_STARTED and row["id"] not in pending and claim.get("baseUpdatedAt") \
                    and row["updatedAt"] > claim["baseUpdatedAt"]:
                claim.update(status="superseded", endedAt=time.time(), reason=f"remote:{row['state']}")


def _iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _log_pass(state: Path, team: str, oldest_change, synced_at: float) -> None:
    """Freshness stage row: when the oldest change in this pass happened, and when the mirror had it."""
    try:
        path = Path(state) / MIRROR_SYNC_LOG
        with open(path, "a") as handle:
            handle.write(json.dumps({"team": team, "enteredAt": oldest_change, "exitedAt": _iso(synced_at)}) + "\n")
        if path.stat().st_size > 1_000_000:
            lines = path.read_text().splitlines()[-2000:]
            atomic_write_text(path, "\n".join(lines) + "\n")
    except OSError:
        pass


def sync(state: Path, team: str, linear, admit, transient=()) -> dict:
    """One bounded incremental pass. Progress (resume cursor) survives across ticks."""
    path = mirror_path(state, team)
    data = _read(path, MIRROR)
    resume = data.get("resume") if isinstance(data.get("resume"), dict) else None
    filling = not data.get("cursor") if resume is None else resume.get("fill") is True
    if resume is None:
        resume = {"fill": filling, "after": None, "high": None, "since": data.get("cursor"),
                  "startedAt": time.time()}
    pages, outcome = 0, "partial"
    began = time.monotonic()
    while pages < (FILL_PAGES if filling else SYNC_PAGES):
        if not filling and pages and time.monotonic() - began > SYNC_BUDGET_S:
            break
        if not admit(1):
            outcome = "budget-held"
            break
        try:
            variables = {"team": team, "after": resume["after"]}
            if not filling:
                variables["since"] = resume["since"]
            page = linear.gql(FILL_QUERY if filling else SYNC_QUERY, variables)
        except transient:
            outcome = "rate-limited"
            break
        except Exception as error:
            outcome = f"error:{type(error).__name__}"
            break
        pages += 1
        edge = page.get("issues") if isinstance(page, dict) else None
        info = edge.get("pageInfo") if isinstance(edge, dict) else None
        if not isinstance(info, dict) or not isinstance(edge.get("nodes"), list):
            outcome = "error:malformed"
            break
        apply(state, team, edge["nodes"])
        stamps = [node["updatedAt"] for node in edge["nodes"]
                  if isinstance(node, dict) and isinstance(node.get("updatedAt"), str)]
        if stamps:
            resume["high"] = max([resume["high"] or "", *stamps])
            resume["low"] = min([resume.get("low") or stamps[0], *stamps])
        done = info.get("hasNextPage") is False
        with _mutating(path, MIRROR) as current:
            if done:
                # The fill re-reads from just before it began; an incremental pass advances to
                # the newest server updatedAt it saw (gte: the boundary row is re-read, never skipped).
                current["cursor"] = (_iso(resume["startedAt"] - FILL_OVERLAP_S) if filling
                                     else resume["high"] or resume["since"])
                current["syncedAt"] = time.time()
                current.setdefault("filledAt", current["syncedAt"])
                current.pop("resume", None)
                if not filling:
                    _log_pass(state, team, resume.get("low") or resume.get("since"), current["syncedAt"])
            else:
                resume["after"] = info.get("endCursor")
                current["resume"] = resume
            current["team"] = team
        if done:
            outcome = "filled" if filling else "synced"
            break
        if not isinstance(resume["after"], str) or not resume["after"]:
            outcome = "error:cursor"
            break
    return {"team": team, "outcome": outcome, "pages": pages}


def read_mirror(state: Path, team: str) -> dict:
    return _read(mirror_path(state, team), MIRROR)


def _claims(state: Path) -> dict:
    return _read(_claims_path(state), CLAIMS).get("claims") or {}


def claim_status(state: Path, issue_id: str) -> str | None:
    return (_claims(state).get(issue_id) or {}).get("status")


def todo(state: Path, team: str) -> list[dict]:
    """Dispatchable Todo rows: the mirror with this host's pending moves and claims applied."""
    rows = (_read(mirror_path(state, team), MIRROR).get("issues") or {}).values()
    pending, claims = _pending_moves(state), _claims(state)
    return sorted((row for row in rows if pending.get(row["id"], row["state"]) == "Todo" and row.get("labelsComplete")
                   and (claims.get(row["id"]) or {}).get("status") != "active"), key=lambda row: row["id"])


def active(state: Path, team: str) -> list[dict]:
    """Owned work that has not opened a PR yet: In Progress rows plus local claims."""
    rows = (_read(mirror_path(state, team), MIRROR).get("issues") or {}).values()
    pending, claims = _pending_moves(state), _claims(state)
    return [row for row in rows if (claims.get(row["id"]) or {}).get("status") == "active"
            or pending.get(row["id"], row["state"]) == "In Progress"]


def claim(state: Path, issue_id: str, identifier: str, lane: str) -> bool:
    """The local ownership record. False when this host already owns the issue."""
    row = (_read(mirror_path(state, team_of(identifier)), MIRROR).get("issues") or {}).get(issue_id) or {}
    with _mutating(_claims_path(state), CLAIMS) as data:
        claims = data.setdefault("claims", {})
        now = time.time()
        for key in [key for key, value in claims.items() if value.get("status") != "active"
                    and now - (value.get("endedAt") or now) > CLAIM_KEEP_S]:
            claims.pop(key)
        if (claims.get(issue_id) or {}).get("status") == "active":
            return False
        claims[issue_id] = {"identifier": identifier, "lane": lane, "status": "active", "claimedAt": now,
                            "baseUpdatedAt": row.get("updatedAt")}
    return True


def clear_superseded(state: Path, issue_id: str) -> bool:
    """Forget a superseded claim so a new explicit decision (priority admission) can move the issue.
    Outboxed.move drops every move for a superseded claim, so one stale `remote:Backlog` record
    would otherwise make an issue unpromotable for CLAIM_KEEP_S. Active claims are never touched."""
    with _mutating(_claims_path(state), CLAIMS) as data:
        claims = data.setdefault("claims", {})
        if (claims.get(issue_id) or {}).get("status") != "superseded":
            return False
        claims.pop(issue_id)
        return True


def release(state: Path, issue_id: str, status: str = "released", reason: str = "") -> None:
    with _mutating(_claims_path(state), CLAIMS) as data:
        row = data.setdefault("claims", {}).get(issue_id)
        if row and row.get("status") == "active":
            row.update(status=status, endedAt=time.time(), reason=reason)


def enqueue(state: Path, op: str, issue_id: str, *, target: str | None = None, body: str | None = None,
            owner: str | None = None) -> str:
    """Durable, idempotent write intent. A newer state move replaces a pending one. A move
    into a started state must name its owner (`require_owner`)."""
    if op == "move":
        require_owner(state, issue_id, target, owner)
        key = f"move:{issue_id}:{target}"
    elif op == "rank":
        key = f"rank:{issue_id}:{target}"
    elif op == "label":
        key = f"label:{issue_id}:{body}"
    elif op == "comment":
        key = "comment:" + hashlib.sha256(f"{issue_id}\0{body}".encode()).hexdigest()[:24]
    elif op == "create":  # a child issue under issue_id; body is the JSON payload (title, description, priority, labels)
        key = "create:" + hashlib.sha256(f"{issue_id}\0{json.loads(body)['title']}".encode()).hexdigest()[:24]
    else:
        raise ValueError(f"unknown outbox op {op}")
    with _mutating(_outbox_path(state), OUTBOX) as data:
        entries = data.setdefault("entries", [])
        if any(entry.get("key") == key for entry in entries):
            return key
        if op in ("move", "rank"):  # the newest intent replaces a pending one
            entries[:] = [entry for entry in entries if not (entry.get("op") == op and entry.get("issueId") == issue_id)]
        entries.append({"key": key, "op": op, "issueId": issue_id, "enqueuedAt": time.time(), "attempts": 0,
                        **({"target": target} if op == "move" else {"value": float(target)} if op == "rank"
                           else {"body": body})})
    return key


def _settle(state: Path, key: str, *, error: str | None = None, sent: bool = False) -> None:
    with _mutating(_outbox_path(state), OUTBOX) as data:
        entries = data.setdefault("entries", [])
        for entry in list(entries):
            if entry.get("key") != key:
                continue
            if sent:
                entry["sentAt"] = time.time()
            elif error is None:
                entries.remove(entry)
            else:
                entry.update(attempts=entry.get("attempts", 0) + 1, lastError=error[:200], lastAttemptAt=time.time())
                if entry["attempts"] >= DEAD_AFTER:
                    entries.remove(entry)
                    data["dead"] = (data.get("dead") or [])[-49:] + [entry]


def _deliver_move(state: Path, linear, entry: dict) -> str:
    issue = (linear.gql(ISSUE_QUERY, {"id": entry["issueId"]}) or {}).get("issue")
    if not isinstance(issue, dict):
        release(state, entry["issueId"], "superseded", "remote-missing")
        return "remote-missing"
    target, current = entry["target"], issue.get("state") or {}
    row = normalize(issue)
    if row:
        apply(state, team_of(row["identifier"]), [issue])
    if current.get("type") in TERMINAL and current.get("name") != target:
        release(state, entry["issueId"], "superseded", f"remote:{current.get('name')}")
        return "remote-closed"
    if target == "In Progress" and current.get("name") not in ("Todo", "In Progress"):
        release(state, entry["issueId"], "superseded", f"remote:{current.get('name')}")
        return "remote-moved"
    if current.get("name") == target:
        return "already"
    state_id = next((node["id"] for node in ((issue.get("team") or {}).get("states") or {}).get("nodes") or []
                     if node.get("name") == target), None)
    if not state_id:
        raise ValueError(f"no workflow state {target}")
    result = (linear.gql(MOVE_MUTATION, {"id": entry["issueId"], "s": state_id}) or {}).get("issueUpdate") or {}
    after = result.get("issue") if isinstance(result.get("issue"), dict) else {}
    if result.get("success") is not True or (after.get("state") or {}).get("name") != target:
        raise RuntimeError("move not confirmed by readback")
    if normalize(after):
        apply(state, team_of(after["identifier"]), [after])
    return "moved"


def _deliver_comment(state: Path, linear, entry: dict) -> str:
    if entry.get("sentAt"):
        # A send whose outcome was never recorded: read back before sending again.
        nodes = ((((linear.gql(COMMENTS_QUERY, {"id": entry["issueId"]}) or {}).get("issue") or {})
                  .get("comments") or {}).get("nodes") or [])
        if any(isinstance(node, dict) and node.get("body") == entry["body"] for node in nodes):
            return "readback"
    _settle(state, entry["key"], sent=True)
    result = (linear.gql(COMMENT_MUTATION, {"id": entry["issueId"], "b": entry["body"]}) or {}).get("commentCreate")
    if not isinstance(result, dict) or result.get("success") is not True:
        raise RuntimeError("comment not confirmed")
    return "commented"


CHILDREN_QUERY = ('query($id:String!){issue(id:$id){team{id key states{nodes{id name}}} '
                  'children(first:100){nodes{id identifier title}}}}')
CREATE_MUTATION = 'mutation($i:IssueCreateInput!){issueCreate(input:$i){success issue{id identifier title}}}'


def _deliver_create(state: Path, linear, entry: dict) -> str:
    """Create one child issue in Backlog. Idempotent: a child with the same title under the parent is the
    readback, so a lost response or a retry never makes a duplicate."""
    payload = json.loads(entry["body"])
    parent = (linear.gql(CHILDREN_QUERY, {"id": entry["issueId"]}) or {}).get("issue")
    if not isinstance(parent, dict):
        return "remote-missing"
    if any(node.get("title") == payload["title"] for node in (parent.get("children") or {}).get("nodes") or []):
        return "already"
    team = parent["team"]
    backlog = next((n["id"] for n in team["states"]["nodes"] if n["name"] == "Backlog"), None)
    if not backlog:
        raise ValueError("team has no Backlog state")
    label_ids = []
    for name in payload.get("labels") or []:
        nodes = ((linear.gql(LABEL_LOOKUP, {"n": name}) or {}).get("issueLabels") or {}).get("nodes") or []
        found = next((n["id"] for n in nodes if (n.get("team") or {}).get("key") == team["key"]),
                     next((n["id"] for n in nodes if not n.get("team")), None))
        if not found:
            raise ValueError(f"no label {name}")
        label_ids.append(found)
    _settle(state, entry["key"], sent=True)
    result = (linear.gql(CREATE_MUTATION, {"i": {
        "teamId": team["id"], "stateId": backlog, "parentId": entry["issueId"], "title": payload["title"],
        "description": payload["description"], "priority": int(payload.get("priority") or 0),
        "labelIds": label_ids}}) or {}).get("issueCreate") or {}
    if result.get("success") is not True:
        raise RuntimeError("create not confirmed")
    return "created"


def _deliver_rank(state: Path, linear, entry: dict) -> str:
    result = (linear.gql(RANK_MUTATION, {"id": entry["issueId"], "o": entry["value"]}) or {}).get("issueUpdate") or {}
    after = result.get("issue") if isinstance(result.get("issue"), dict) else {}
    if result.get("success") is not True or abs(float(after.get("sortOrder", "nan")) - entry["value"]) > 1e-6:
        raise RuntimeError("rank not confirmed by readback")
    return "ranked"


def _deliver_label(state: Path, linear, entry: dict) -> str:
    issue = (linear.gql(LABELS_QUERY, {"id": entry["issueId"]}) or {}).get("issue")
    if not isinstance(issue, dict):
        return "remote-missing"
    have = {node["id"] for node in (issue.get("labels") or {}).get("nodes") or []}
    # A label is team-scoped or workspace-wide (team null); the issue's own team wins over a workspace label.
    nodes = ((linear.gql(LABEL_LOOKUP, {"n": entry["body"]}) or {}).get("issueLabels") or {}).get("nodes") or []
    team = (issue.get("team") or {}).get("key")
    wanted = next((n["id"] for n in nodes if (n.get("team") or {}).get("key") == team),
                  next((n["id"] for n in nodes if not n.get("team")), None))
    if not wanted:
        raise ValueError(f"no label {entry['body']}")
    if wanted in have:
        return "already"
    result = (linear.gql(LABEL_MUTATION, {"id": entry["issueId"], "l": sorted(have | {wanted})}) or {}).get("issueUpdate") or {}
    if result.get("success") is not True:
        raise RuntimeError("label not confirmed")
    return "labelled"


def flush(state: Path, linear, admit, transient=(), limit: int = FLUSH_LIMIT, budget_s: float = FLUSH_BUDGET_S) -> dict:
    entries = list(_read(_outbox_path(state), OUTBOX).get("entries") or [])
    delivered, outcome = [], "drained"
    started = time.monotonic()
    for entry in entries[:limit]:
        if time.monotonic() - started > budget_s:
            outcome = "partial"
            break
        if not admit(2):
            outcome = "budget-held"
            break
        try:
            result = {"move": _deliver_move, "rank": _deliver_rank, "label": _deliver_label,
                  "create": _deliver_create}.get(entry["op"], _deliver_comment)(
                state, linear, entry)
        except transient:
            outcome = "rate-limited"  # never an attempt: the entry waits for the reset
            break
        except Exception as error:
            _settle(state, entry["key"], error=f"{type(error).__name__}: {error}")
            continue
        _settle(state, entry["key"])
        delivered.append({"key": entry["key"], "result": result})
    else:
        if len(entries) > limit:
            outcome = "partial"
    return {"outcome": outcome, "delivered": delivered}


def tick(state: Path, linear, admit, transient=(), teams=TEAMS) -> dict:
    """Dispatch-tick maintenance: drain writes, then refresh each team's mirror."""
    report = {}
    for name, step in [("outbox", lambda: flush(state, linear, admit, transient)),
                       *[(team, lambda team=team: sync(state, team, linear, admit, transient)) for team in teams]]:
        try:
            report[name] = step()
        except Exception as error:  # one team's fault never blocks the other or dispatch
            report[name] = {"outcome": f"error:{type(error).__name__}"}
    return report


def _read_loose(path: Path) -> dict:
    try:
        data = json.loads(path.read_text())
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def status(state: Path, now: float | None = None) -> dict:
    """Mirror age and outbox depth for lanes-status, the HUD and the doctor."""
    now = time.time() if now is None else now
    mirrors = {}
    for team in TEAMS:
        data = _read(mirror_path(state, team), MIRROR)
        synced = data.get("syncedAt")
        mirrors[team] = {"rows": len(data.get("issues") or {}), "todo": len(todo(state, team)),
                         "ageS": round(now - synced) if type(synced) in (int, float) else None,
                         "filling": bool((data.get("resume") or {}).get("fill")) or not data.get("cursor")}
    outbox = _read(_outbox_path(state), OUTBOX)
    entries = outbox.get("entries") or []
    oldest = min((entry.get("enqueuedAt") or now for entry in entries), default=None)
    claims = _claims(state)
    backlog = {}
    for team in TEAMS:
        row = _read_loose(Path(state) / "refill" / f"{team}.json")
        if row:
            backlog[team] = {key: row.get(key) for key in ("todo", "target", "backlog", "ready", "readyAgeDaysP50",
                                                           "readyAgeDaysP95", "deficitSince", "alarm", "at")}
    return {"mirror": mirrors, "backlog": backlog,
            "outbox": {"depth": len(entries), "oldestAgeS": round(now - oldest) if oldest else None,
                       "dead": len(outbox.get("dead") or [])},
            "claims": {"active": sum(1 for row in claims.values() if row.get("status") == "active"),
                       "superseded": sum(1 for row in claims.values() if row.get("status") == "superseded")}}


def alerts(view: dict) -> dict[str, str]:
    """Doctor alerts keyed for stable conditions. Observability only: never a dispatch gate."""
    found = {}
    for team, row in (view.get("mirror") or {}).items():
        if row.get("ageS") is not None and row["ageS"] > STALE_ALERT_S:
            found[f"linear-mirror-stale:{team}"] = (f"Linear mirror {team} last synced {row['ageS'] // 3600}h ago; "
                                                    "dispatch continues from it")
    for team, row in (view.get("backlog") or {}).items():
        if row.get("alarm"):
            found[f"backlog-ready-idle:{team}"] = (f"{team}: {row.get('ready')} agent-ready in Backlog while Todo is "
                                                   f"{row.get('todo')} of {row.get('target')} since the deficit opened")
    outbox = view.get("outbox") or {}
    if (outbox.get("oldestAgeS") or 0) > OUTBOX_ALERT_S:
        found["linear-outbox-stale"] = (f"Linear outbox: {outbox['depth']} writes waiting, "
                                        f"oldest {outbox['oldestAgeS'] // 60}m")
    if outbox.get("dead"):
        found["linear-outbox-dead"] = f"Linear outbox: {outbox['dead']} writes dead-lettered after {DEAD_AFTER} attempts"
    return found


class Outboxed:
    """The Linear client with lane writes routed through the outbox. Reads pass through."""

    def __init__(self, state: Path, client):
        self._state, self._client = state, client

    def __getattr__(self, name):
        return getattr(self._client, name)

    def move(self, issue_id: str, state_name: str, owner: str | None = None) -> None:
        status = claim_status(self._state, issue_id)
        if status == "superseded":
            return  # the remote owner changed it; never overwrite that decision
        if status == "active" and state_name in RELEASE_STATES:
            release(self._state, issue_id, reason=f"lane:{state_name}")
        enqueue(self._state, "move", issue_id, target=state_name, **({"owner": owner} if owner else {}))

    def comment(self, issue_id: str, body: str) -> None:
        enqueue(self._state, "comment", issue_id, body=body)

    def rank(self, issue_id: str, sort_order: float) -> None:
        enqueue(self._state, "rank", issue_id, target=str(sort_order))

    def label(self, issue_id: str, name: str) -> None:
        enqueue(self._state, "label", issue_id, body=name)
