"""Priority admission, Todo hygiene and Summer rank intake (JOV-7073).

Before this module the only Backlog -> Todo writer (`binding_refill.refill`) promoted work
only while Todo sat under a small target (2 per seat). With Todo at 167 and 131 ready items
waiting a median 25 days, Urgent work and Summer's portfolio picks never reached a lane:
"delegated" was a log line. Three bounded, outbox-written behaviours close that:

1. Priority replacement: Urgent (Linear P1) agent-ready Backlog items, and items carrying a
   fresh signed Summer portfolio rank, are admitted to Todo regardless of the Todo target.
   Each admission displaces one lowest-ranked, oldest, unclaimed Todo item back to Backlog
   (with a comment) once Todo is at or over target. Admissions and displacements are capped
   per tick.
2. WIP sanity: when Todo exceeds a ceiling, stale (> 7 days untouched) P3/P4 Todo items go
   back to Backlog in bounded batches, so Todo means "next up".
3. Summer rank intake: `summer.portfolio-rank/v1` envelopes, Ed25519-signed by Summer, are
   verified against a pinned public key and stored as `summer-portfolio/rank.verified.json`.
   `lane_runner.admission_order` claims by that rank first, then priority, then age.

Every admission is logged with a timestamp; `measure` turns each into admitted -> claimed
latency (p50/p95) when a lane claims it. All writes go through the lane outbox (readback,
retry, never overwrites a remote decision). Only issues that pass the same readiness gate as
the refill (`binding_refill.skip_reason`: acceptance criteria, no hold label,
no open blocker, no red line) are ever admitted.
"""
from __future__ import annotations

import base64
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import backlog_rank
import binding_refill
import linear_sync

sys.dont_write_bytecode = True

RANK_SCHEMA = "summer.portfolio-rank/v1"
MAX_ADMIT_PER_TICK = 3
MAX_DISPLACE_PER_TICK = 3
MAX_DEMOTE_PER_TICK = 10
STALE_TODO_S = 7 * 86400
RANK_TTL_S = 24 * 3600
MAX_RANKED = 50
CEILING_FLOOR = 30          # Todo above max(this, 4 x target) is over WIP
DEMOTE_PRIORITIES = (3, 4)  # P3/P4 only; unset priority is unknown, not unimportant
PROTECT_LABELS = frozenset({"dispatch-next", "plan-approved", "tim-approved", "incident", "factory"})
MIRROR_MAX_AGE_S = 6 * 3600  # candidates are re-read live, so a lagging mirror only needs to be recent enough to nominate
PUBKEY_ENV = "LANES_SUMMER_PORTFOLIO_PUBKEY"
DEFAULT_PUBKEY = Path.home() / ".config" / "symphony" / "summer-portfolio-pubkey.pem"


def _dir(state) -> Path:
    return Path(state) / "summer-portfolio"


def canonical(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


# ------------------------------------------------------------------ signed Summer rank

def verify(message: bytes, signature: str, pem: str) -> bool:
    """Ed25519 verify (base64url, no padding). Falls back to node when `cryptography` is absent."""
    raw = base64.urlsafe_b64decode(signature + "=" * (-len(signature) % 4))
    try:
        from cryptography.exceptions import InvalidSignature
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
        from cryptography.hazmat.primitives.serialization import load_pem_public_key
    except ImportError:
        script = ("const c=require('node:crypto');let d='';process.stdin.on('data',x=>d+=x).on('end',()=>{"
                  "const j=JSON.parse(d);const k=c.createPublicKey(j.pem);if(k.asymmetricKeyType!=='ed25519')process.exit(2);"
                  "process.exit(c.verify(null,Buffer.from(j.m,'base64'),k,Buffer.from(j.s,'base64'))?0:1)})")
        done = subprocess.run(["node", "-e", script], capture_output=True, text=True, timeout=20,
                              input=json.dumps({"pem": pem, "m": base64.b64encode(message).decode(),
                                                "s": base64.b64encode(raw).decode()}))
        return done.returncode == 0
    key = load_pem_public_key(pem.encode())
    if not isinstance(key, Ed25519PublicKey):
        return False
    try:
        key.verify(raw, message)
    except InvalidSignature:
        return False
    return True


def _epoch(stamp) -> float | None:
    return backlog_rank._epoch(stamp)


def check_envelope(body: dict, pem: str, now: float) -> tuple[dict | None, str]:
    """(ranks {identifier: rank}, reason). Strict shape, pinned key, fresh, signature over
    `schema NUL canonical(body without signature)`."""
    if not isinstance(body, dict) or body.get("schema") != RANK_SCHEMA:
        return None, "schema"
    signature = str(body.get("signature") or "")
    if not signature.startswith("ed25519="):
        return None, "unsigned"
    unsigned = {key: value for key, value in body.items() if key != "signature"}
    sent = _epoch(unsigned.get("sentAt"))
    if sent is None or now - sent > RANK_TTL_S or sent - now > 300:
        return None, "stale-or-future"
    items = unsigned.get("items")
    if not isinstance(items, list) or not 0 < len(items) <= MAX_RANKED:
        return None, "items"
    ranks = {}
    for item in items:
        identifier, rank = (item or {}).get("id"), (item or {}).get("rank")
        if not (isinstance(identifier, str) and identifier.count("-") == 1 and isinstance(rank, int)
                and not isinstance(rank, bool) and 1 <= rank <= 1000) or identifier in ranks:
            return None, "item"
        ranks[identifier] = rank
    try:
        ok = verify(f"{RANK_SCHEMA}\0{canonical(unsigned)}".encode(), signature[len("ed25519="):], pem)
    except (ValueError, OSError, subprocess.SubprocessError):
        ok = False
    return (ranks, "ok") if ok else (None, "bad-signature")


def _pubkey() -> str | None:
    path = Path(os.environ.get(PUBKEY_ENV) or DEFAULT_PUBKEY)
    try:
        pem = path.read_text()
    except OSError:
        return None
    return pem if "PUBLIC KEY" in pem else None


def ingest(state, body: dict, now: float | None = None, pem: str | None = None) -> dict:
    """Verify a Summer rank envelope and publish it for the claim ordering. Fails closed:
    no pinned key, a bad signature or a stale envelope changes nothing."""
    now = time.time() if now is None else now
    pem = pem or _pubkey()
    if not pem:
        return {"ok": False, "reason": "no-pinned-public-key"}
    ranks, reason = check_envelope(body, pem, now)
    if ranks is None:
        return {"ok": False, "reason": reason}
    directory = _dir(state)
    directory.mkdir(parents=True, exist_ok=True)
    out = {"schema": "jovie-summer-portfolio-verified/v1", "verifiedAt": now, "sentAt": body["sentAt"],
           "deliveryId": body.get("deliveryId"), "expiresAt": now + RANK_TTL_S, "ranks": ranks}
    temporary = directory / "rank.verified.tmp"
    temporary.write_text(json.dumps(out))
    temporary.replace(directory / "rank.verified.json")
    return {"ok": True, "ranks": len(ranks), "deliveryId": body.get("deliveryId")}


def ingest_inbox(state, now: float | None = None) -> dict | None:
    """Consume a dropped envelope (`summer-portfolio/rank.json`): the supported handoff file."""
    path = _dir(state) / "rank.json"
    try:
        body = json.loads(path.read_text())
    except (OSError, ValueError):
        return None
    result = ingest(state, body, now)
    path.rename(path.with_suffix(".consumed" if result["ok"] else ".rejected"))
    return result


_CACHE: dict = {}


def summer_ranks(state=None, now: float | None = None) -> dict[str, int]:
    """Fresh verified ranks, {identifier: rank} (1 = first). Empty when absent or expired."""
    state = state or os.environ.get("LANES_STATE")
    if not state:
        return {}
    now = time.time() if now is None else now
    path = _dir(state) / "rank.verified.json"
    try:
        stamp = path.stat().st_mtime_ns
        if _CACHE.get("key") != (str(path), stamp):
            _CACHE.update(key=(str(path), stamp), data=json.loads(path.read_text()))
        data = _CACHE["data"]
    except (OSError, ValueError):
        return {}
    if data.get("schema") != "jovie-summer-portfolio-verified/v1" or float(data.get("expiresAt") or 0) < now:
        return {}
    return {k: v for k, v in (data.get("ranks") or {}).items() if isinstance(v, int)}


def claim_key(identifier: str, ranks: dict[str, int]) -> tuple[int, int]:
    """First element of the claim ordering: Summer-ranked work first, in Summer's order."""
    rank = ranks.get(identifier)
    return (0, rank) if rank is not None else (1, 0)


# ------------------------------------------------------------------ selection (pure)

def protected(row: dict, ranks: dict[str, int]) -> bool:
    labels = {str(label).lower() for label in row.get("labels") or ()}
    return row.get("priority") == 1 or row.get("identifier") in ranks or bool(labels & PROTECT_LABELS)


def admit_candidates(rows: list[dict], ranks: dict[str, int], excluded=(), red_line=lambda row: False,
                     now: float | None = None, pending: dict | None = None) -> tuple[list[dict], dict]:
    """Backlog rows that qualify for priority admission, best first: Summer rank order, then
    Urgent by backlog score. Readiness gates are the refill's own (`skip_reason`)."""
    now = time.time() if now is None else now
    pending = pending or {}
    excluded = frozenset(label.lower() for label in excluded)
    open_ids = {row["identifier"] for row in rows}
    found, skipped = [], {}
    for row in rows:
        if row.get("state") != "Backlog" or pending.get(row["id"]) == "Todo":
            continue
        if row.get("priority") != 1 and row["identifier"] not in ranks:
            continue
        reason = binding_refill.skip_reason(row, open_ids, excluded, red_line)
        if reason:
            skipped[row["identifier"]] = reason
        else:
            found.append(row)
    found.sort(key=lambda row: (*claim_key(row["identifier"], ranks), row.get("priority") != 1,
                                -backlog_rank.score(row, now), row.get("createdAt") or ""))
    return found, skipped


def displacement_order(todo: list[dict], ranks: dict[str, int], now: float) -> list[dict]:
    """Unclaimed, unprotected Todo rows, the first being the first to give way: lowest score,
    then oldest."""
    pool = [row for row in todo if not protected(row, ranks)]
    return sorted(pool, key=lambda row: (backlog_rank.score(row, now), row.get("createdAt") or "", row["identifier"]))


def ceiling(goal: int) -> int:
    return max(CEILING_FLOOR, 4 * goal)


def stale_demotions(todo: list[dict], ranks: dict[str, int], now: float, limit: int) -> list[dict]:
    """Stale (untouched > 7 days), low-priority, unprotected Todo rows, stalest first."""
    out = []
    for row in todo:
        updated = _epoch(row.get("updatedAt"))
        if (row.get("priority") in DEMOTE_PRIORITIES and updated is not None and now - updated > STALE_TODO_S
                and not protected(row, ranks)):
            out.append((updated, row["identifier"], row))
    return [row for _, _, row in sorted(out)[:max(0, limit)]]


# ------------------------------------------------------------------ the tick

def _log(state, name: str, row: dict) -> None:
    try:
        with open(Path(state) / name, "a") as handle:
            handle.write(json.dumps(row) + "\n")
    except OSError:
        pass


def _percentile(values: list[float], q: float):
    values = sorted(values)
    return round(values[min(len(values) - 1, int(q * len(values)))], 1) if values else None


def measure(state, now: float | None = None) -> dict:
    """Admitted -> claimed latency in seconds. Each admission is closed once, when a lane claims it."""
    now = time.time() if now is None else now
    state = Path(state)
    try:
        admitted = [json.loads(line) for line in (state / "priority-admissions.jsonl").read_text().splitlines() if line]
    except (OSError, ValueError):
        return {}
    try:
        closed = {json.loads(line)["id"] + "@" + str(json.loads(line)["admittedAt"])
                  for line in (state / "priority-latency.jsonl").read_text().splitlines() if line}
    except (OSError, ValueError, KeyError):
        closed = set()
    claims = linear_sync._claims(state)
    for row in admitted:
        key = f"{row['id']}@{row['admittedAt']}"
        claim = claims.get(row["issueId"]) or {}
        if key in closed or not claim.get("claimedAt") or claim["claimedAt"] < row["admittedAt"]:
            continue
        latency = round(claim["claimedAt"] - row["admittedAt"], 1)
        _log(state, "priority-latency.jsonl", {"id": row["id"], "admittedAt": row["admittedAt"],
                                               "claimedAt": claim["claimedAt"], "latencyS": latency,
                                               "urgent": row.get("urgent"), "ranked": row.get("ranked")})
    try:
        lat = [json.loads(line) for line in (state / "priority-latency.jsonl").read_text().splitlines() if line][-200:]
    except (OSError, ValueError):
        lat = []
    seconds = [row["latencyS"] / 60 for row in lat]
    return {"admittedToClaimedMinP50": _percentile(seconds, 0.5), "admittedToClaimedMinP95": _percentile(seconds, 0.95),
            "samples": len(seconds), "targetMin": 15}


def _live_state(client, issue_id: str):
    """The issue's state name read from Linear right now; None when unreadable (never admit blind)."""
    try:
        issue = (client.gql(linear_sync.ISSUE_QUERY, {"id": issue_id}) or {}).get("issue") or {}
        return (issue.get("state") or {}).get("name")
    except Exception:
        return None


def run(lane, host, team: str, client, now: float | None = None, floor: int = 0, excluded=("hold",)) -> dict:
    """One priority-admission pass for `team`, written through the outbox."""
    now = time.time() if now is None else now
    state = Path(host.state)
    receipt = {"at": now, "team": team, "admitted": [], "displaced": [], "demoted": [], "admittedUnlabelled": []}
    try:
        receipt["rankIntake"] = ingest_inbox(state, now)
    except Exception as error:  # a malformed envelope never blocks admission
        receipt["rankIntake"] = {"ok": False, "reason": type(error).__name__}
    ranks = summer_ranks(state, now)
    receipt["summerRanks"] = len(ranks)
    mirror = linear_sync.read_mirror(state, team)
    if now - float(mirror.get("syncedAt") or 0) > MIRROR_MAX_AGE_S:  # too old even to nominate candidates
        receipt["held"] = "mirror-stale"
        return _finish(state, team, receipt, now)
    rows = list((mirror.get("issues") or {}).values())
    pending = linear_sync._pending_moves(state)
    todo = linear_sync.todo(state, team)
    goal = binding_refill.target(state, floor)
    receipt.update(todo=len(todo), target=goal, ceiling=ceiling(goal))
    outbox = linear_sync.Outboxed(state, client)
    candidates, skipped = admit_candidates(rows, ranks, excluded, lambda row: lane.issue_hits_red_line(binding_refill._issue(lane, row)),
                                           now, pending)
    for row in list(candidates):  # a live local claim owns the issue; leave it
        if linear_sync.claim_status(state, row["id"]) == "active":
            candidates.remove(row)
            skipped[row["identifier"]] = "claim-active"
    # Ranked and Urgent skips first: the reason a Summer pick did not run must survive the receipt cap.
    receipt["skipped"] = dict(sorted(skipped.items(), key=lambda kv: (kv[0] not in ranks, kv[0]))[:50])
    live_todo = list(todo)
    admitted = []
    for row in candidates:  # the mirror may lag: confirm in Linear that the candidate is still Backlog (and Urgent or ranked)
        if len(admitted) >= MAX_ADMIT_PER_TICK:
            break
        if _live_state(client, row["id"]) == "Backlog":
            admitted.append(row)
        else:
            receipt["skipped"][row["identifier"]] = "live-state-changed"
    victims = displacement_order(live_todo, ranks, now)
    for row in admitted:
        why = "Summer portfolio rank %s" % ranks[row["identifier"]] if row["identifier"] in ranks else "Urgent (P1)"
        displaced = None
        if len(live_todo) >= goal and len(receipt["displaced"]) < MAX_DISPLACE_PER_TICK and victims:
            displaced = victims.pop(0)
            while displaced is not None and _live_state(client, displaced["id"]) != "Todo":
                displaced = victims.pop(0) if victims else None
        if displaced is not None:
            outbox.move(displaced["id"], "Backlog")
            outbox.comment(displaced["id"], f"Priority replacement: returned to Backlog so {row['identifier']} ({why}) can run now. "
                                            f"Todo was {len(live_todo)} of target {goal}; this item ranked lowest and oldest among "
                                            f"unclaimed Todo ({backlog_rank.explain(displaced, now)}). It is re-promoted by rank when Todo has room.")
            live_todo = [r for r in live_todo if r["id"] != displaced["id"]]
            receipt["displaced"].append(displaced["identifier"])
        # Urgent or Summer-ranked admission is a new decision: a stale superseded claim (an earlier lane
        # run the remote state outran) must not turn every move into a silent no-op.
        if linear_sync.clear_superseded(state, row["id"]):
            receipt.setdefault("clearedSuperseded", []).append(row["identifier"])
        outbox.move(row["id"], "Todo")
        labelled = binding_refill.READY_LABEL in {str(label).lower() for label in row.get("labels") or ()}
        # "Label at admission" is read by Summer's quality check (labelled vs unlabelled revert/fail rate).
        outbox.comment(row["id"], f"Priority admission: promoted to Todo regardless of target ({why}; Todo was {len(todo)} of {goal}"
                                  + (f"; displaced {displaced['identifier']}" if displaced else "")
                                  + f"). Claim order: Summer rank, then priority, then age. Label at admission: {'present' if labelled else 'none'}.")
        live_todo.append(row)
        receipt["admitted"].append(row["identifier"])
        if not labelled:  # measured: admission no longer needs the retired agent-ready label
            receipt["admittedUnlabelled"].append(row["identifier"])
        _log(state, "priority-admissions.jsonl", {"id": row["identifier"], "issueId": row["id"], "admittedAt": now,
                                                  "urgent": row.get("priority") == 1, "ranked": row["identifier"] in ranks, "labelled": labelled,
                                                  "backlogAgeS": round(now - (_epoch(row.get("createdAt")) or now)),
                                                  "displaced": displaced["identifier"] if displaced else None})
    excess = len(live_todo) - ceiling(goal)
    if excess > 0:
        for row in stale_demotions(live_todo, ranks, now, min(excess, MAX_DEMOTE_PER_TICK)):
            outbox.move(row["id"], "Backlog")
            outbox.comment(row["id"], f"Todo WIP sanity: returned to Backlog ({len(live_todo)} in Todo against target {goal}, ceiling "
                                      f"{ceiling(goal)}). P{row.get('priority')} and untouched since {row.get('updatedAt')} (over 7 days). "
                                      f"Todo means next up; it is re-promoted by rank when there is room.")
            receipt["demoted"].append(row["identifier"])
            _log(state, "todo-demotions.jsonl", {"id": row["identifier"], "at": now, "priority": row.get("priority"),
                                                 "updatedAt": row.get("updatedAt")})
    return _finish(state, team, receipt, now)


def _finish(state: Path, team: str, receipt: dict, now: float) -> dict:
    receipt["latency"] = measure(state, now)
    binding_refill._write(state / "refill" / f"{team}-priority.json", receipt)
    return receipt


def main(argv: list[str]) -> int:
    """`priority_admission.py ingest FILE` verifies a Summer rank envelope into the state dir."""
    if len(argv) == 3 and argv[1] == "ingest":
        state = os.environ.get("LANES_STATE") or str(Path.home() / ".local/state/jovie-lanes")
        result = ingest(state, json.loads(Path(argv[2]).read_text()))
        print(json.dumps(result))
        return 0 if result["ok"] else 1
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
