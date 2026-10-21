"""Started-state ownership: every In Progress / In Review / Rework / Merging / Validating issue
has a live, verifiable owner, or it is moved to the correct non-started state.

Gem 2026-10-20: 536 JOV issues sat in started states (In Progress 170, Validating 238, Merging
97, Rework 21, In Review 10) with 4 workers running, and 144 local claims stayed `active` for a
median 5.6 days. A status or a claim row is not an owner. An owner is, checked against reality
on every dispatch tick:

- `run`: a run lease (kernel flock under <state>/linear/run-leases) held by a live worker;
- `worktree`: a lanes run checkout for the issue still exists (a legacy or preserved run);
- `claim-grace` / `legacy-run`: a fresh local claim inside its grace window;
- `pr`: an open PR for the issue (the fix loop and merge queue own every open PR);
- `handoff`: an unexpired handoff record (`handoff-cooldown.json`);
- `lifecycle`: Merging/Validating with merged evidence: origin/main, or a merged PR anywhere in the
  org that claims the issue (bounded GitHub search, cached; Summer/Ops/LYB work). linear-sync-on-merge and
  its receipts own Merging -> Validating -> Done; lanes never writes Done, per linear.md);
- `epic-children`: an epic with open child issues;
- `hold`: a `hold` label (it expires on its own after 72h of inactivity);
- `recent-activity`: an issue lanes never claimed with activity inside HUMAN_ACTIVITY_S
  (a human or external agent session, time-bounded).

An issue with none of these for longer than GRACE_S is resolved, at most MAX_MOVES per tick,
through the Linear outbox: merged evidence -> Merging (the lifecycle's entry state); otherwise
-> Todo, back to the eligible pool (Rework is repair demand). Merging/Validating without merged
evidence or a PR is never guessed at: it stays counted as `ownerless` and the doctor escalates it
to the repair owner. Claims whose run is provably over are released here as well.
"""
from __future__ import annotations

import fcntl
import json
import os
import re
import subprocess
import time
from datetime import datetime
from pathlib import Path

import linear_sync  # noqa: E402  (sibling module of the release)

STARTED = linear_sync.STARTED
GRACE_S = 600                    # an owner may vanish this long before the issue is resolved
CLAIM_GRACE_S = 600              # claim -> run lease window inside one worker pass
LEGACY_RUN_GRACE_S = 3 * 3600    # claims from releases before run leases existed
HUMAN_ACTIVITY_S = 24 * 3600
MAX_MOVES = 20                   # Linear writes queued per tick (each also queues one comment)
MERGED_SINCE_DAYS = 180
LIFECYCLE_QUIET_S = 7 * 86400    # reported (lifecycleQuiet) when the merge lifecycle stalls
REPORT = "ownership.json"
ISSUE = re.compile(r"\bJOV-\d+\b", re.IGNORECASE)
MERGE_REFERENCE = re.compile(
    r"linear-issue-identifier:\s*(JOV-\d+)|^(?:refs|fixes|closes|resolves)\s+((?:JOV-\d+[\s,;]*)+)\.?\s*$",
    re.IGNORECASE | re.MULTILINE)


def referenced(body: str) -> set[str]:
    """Issues a body names as its own: the lanes marker, or a Refs/Fixes line (one or a list)."""
    return {ident.upper() for marker, refs in MERGE_REFERENCE.findall(body or "")
            for ident in ([marker] if marker else ISSUE.findall(refs))}


def _lease_dir(state: Path) -> Path:
    return state / "linear" / "run-leases"


def acquire_run_lease(state: Path, issue_id: str, identifier: str, lane: str):
    """Hold the issue's run lease for as long as the returned handle stays open (the kernel
    releases it if the worker dies). None when another live process already holds it."""
    path = _lease_dir(state) / f"{issue_id}.lock"
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = open(path, "a+")
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        handle.close()
        return None
    handle.seek(0)
    handle.truncate()
    handle.write(json.dumps({"issue": identifier, "lane": lane, "pid": os.getpid(), "at": time.time()}))
    handle.flush()
    return handle


def run_lease(state: Path, issue_id: str) -> str | None:
    """`live` while a worker holds it, `ended` once it was taken and released, None if never."""
    path = _lease_dir(state) / f"{issue_id}.lock"
    if not path.exists():
        return None
    try:
        with open(path, "a") as handle:
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return "live"
            fcntl.flock(handle, fcntl.LOCK_UN)
    except OSError:
        return "live"  # unreadable lease evidence never releases ownership
    return "ended"


def merged_identifiers(repo: Path, run=subprocess.run) -> set[str] | None:
    """Issues an origin/main commit names as its own: squash subject, the lanes PR marker, or an
    explicit Refs/Fixes line. Local git only (no API budget); None when unreadable."""
    try:
        log = run(["git", "-C", str(repo), "log", "origin/main", f"--since={MERGED_SINCE_DAYS} days",
                   "--format=%s%n%b%x1e"], capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.SubprocessError):
        return None
    if getattr(log, "returncode", 1) != 0:
        return None
    found = set()
    for record in (log.stdout or "").split("\x1e"):
        subject, _, body = record.strip().partition("\n")
        found |= {match.upper() for match in ISSUE.findall(subject)}
        found |= referenced(body)
    return found


EVIDENCE = "merged-evidence.json"
SEARCHES_PER_TICK = 5            # GitHub search API: 30/min; one tick spends at most 5
NEGATIVE_EVIDENCE_TTL_S = 24 * 3600


def pr_names_issue(pr: dict, ident: str) -> bool:
    """The PR claims the issue as its own: in its title, the lanes marker, or a Refs line."""
    if ident in {match.upper() for match in ISSUE.findall(pr.get("title") or "")}:
        return True
    return ident in referenced(pr.get("body") or "")


def org_merged_evidence(state: Path, ident: str, search, now: float, budget: list) -> list[str] | None:
    """Merged PRs anywhere in the org that claim the issue (Summer, Ops and LYB work lands
    outside Jovie main). Positive evidence is kept; a miss is retried after a day. None
    when no search budget is left this tick or the search is unreadable."""
    path = state / EVIDENCE
    try:
        cache = json.loads(path.read_text())
    except (OSError, ValueError):
        cache = {}
    row = cache.get(ident) if isinstance(cache, dict) else None
    if isinstance(row, dict) and (row.get("prs") or now - float(row.get("at") or 0) < NEGATIVE_EVIDENCE_TTL_S):
        return list(row.get("prs") or [])
    if search is None or budget[0] <= 0:
        return None
    budget[0] -= 1
    found = search(ident)
    if found is None:
        return None
    prs = sorted({f"{pr['repository']}#{pr['number']}" for pr in found
                  if isinstance(pr, dict) and pr.get("repository") and pr.get("number") and pr_names_issue(pr, ident)})
    cache = cache if isinstance(cache, dict) else {}
    cache[ident] = {"at": now, "prs": prs}
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(cache))
    os.replace(tmp, path)
    return prs


def handoff_identifiers(state: Path, now: float) -> set[str]:
    try:
        rows = json.loads((state / "handoff-cooldown.json").read_text())
    except (OSError, ValueError):
        return set()
    return {key.upper() for key, row in (rows if isinstance(rows, dict) else {}).items()
            if ISSUE.fullmatch(key) and isinstance(row, dict) and isinstance(row.get("until"), (int, float))
            and row["until"] > now}


def run_worktrees(state: Path) -> set[str]:
    """Issues with a lanes run checkout on disk (`<stamp>-<ISSUE>-<lane>-<id>`)."""
    found = set()
    try:
        for entry in (state / "worktrees").iterdir():
            match = re.match(r"^\d{8}T\d{6}Z-(JOV-\d+)-", entry.name)
            if match:
                found.add(match.group(1).upper())
    except OSError:
        pass
    return found


def _epoch(value) -> float | None:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def owner_of(row: dict, claim: dict | None, lease: str | None, *, open_prs: frozenset[str],
             merged: set[str] | None, handoffs: set[str], worktrees: set[str], open_children: set[str],
             now: float) -> str | None:
    ident = row["identifier"].upper()
    active = (claim or {}).get("status") == "active"
    claimed_at = (claim or {}).get("claimedAt") or 0
    if "hold" in {label.lower() for label in row.get("labels") or ()}:
        return "hold"
    if lease == "live":
        return "run"
    if ident in worktrees:
        return "worktree"
    if active and now - claimed_at < CLAIM_GRACE_S:
        return "claim-grace"
    if active and lease is None and now - claimed_at < LEGACY_RUN_GRACE_S:
        return "legacy-run"
    if ident in open_prs:
        return "pr"
    if ident in handoffs:
        return "handoff"
    if row["state"] in ("Merging", "Validating") and merged is not None and ident in merged:
        return "lifecycle"
    if row["id"] in open_children:
        return "epic-children"
    updated = _epoch(row.get("updatedAt"))
    if claim is None and updated is not None and now - updated < HUMAN_ACTIVITY_S:
        return "recent-activity"
    return None


def resolution(row: dict, merged: set[str] | None) -> tuple[str | None, str]:
    """Where an ownerless started issue goes; (None, why) when no automatic move is justified."""
    ident, state = row["identifier"].upper(), row["state"]
    if state in ("Merging", "Validating"):
        return None, "post-merge-without-merged-evidence"
    if merged is None:
        return None, "merged-evidence-unreadable"
    if state != "Rework" and ident in merged:
        return "Merging", "merged-on-main"
    return "Todo", "rework-repair-demand" if state == "Rework" else "no-live-owner"


def reconcile(state: Path, repo: Path, open_prs: frozenset[str] | None, *, run=subprocess.run,
              now: float | None = None, team: str = "JOV", max_moves: int = MAX_MOVES, search=None) -> dict:
    """One incremental, idempotent pass over the local mirror (no Linear read). Writes go
    through the outbox, which is flushed under the shared Linear budget."""
    now = time.time() if now is None else now
    report_path = state / REPORT
    try:
        previous = json.loads(report_path.read_text())
    except (OSError, ValueError):
        previous = {}
    since = previous.get("ownerlessSince") if isinstance(previous.get("ownerlessSince"), dict) else {}
    rows = list((linear_sync.read_mirror(state, team).get("issues") or {}).values())
    pending = linear_sync._pending_moves(state)
    claims = linear_sync._claims(state)
    merged = merged_identifiers(repo, run)
    handoffs, worktrees = handoff_identifiers(state, now), run_worktrees(state)
    open_children = {row.get("parentId") for row in rows if row.get("parentId")
                     and row.get("stateType") not in linear_sync.TERMINAL}
    report = {"at": now, "openPrsKnown": open_prs is not None, "mergedKnown": merged is not None,
              "started": 0, "owners": {}, "ownerless": 0, "overGrace": 0, "oldestOwnerlessS": 0,
              "unresolved": {}, "moved": [], "claimsReleased": [], "sample": []}
    next_since, moves, budget = {}, 0, [SEARCHES_PER_TICK]
    noted = set(previous.get("evidenceNoted") or [])
    for row in sorted(rows, key=lambda r: r.get("updatedAt") or ""):
        current = pending.get(row["id"], row["state"])
        if current not in STARTED:
            continue
        row = {**row, "state": current}
        report["started"] += 1
        claim = claims.get(row["id"])
        owner = owner_of(row, claim, run_lease(state, row["id"]),
                         open_prs=open_prs or frozenset(), merged=merged, handoffs=handoffs,
                         worktrees=worktrees, open_children=open_children, now=now)
        if owner is None and open_prs is None:
            owner = "unknown-pr-inventory"  # an unreadable PR list never orphans an issue
        if owner is None and current in ("Merging", "Validating"):
            evidence = org_merged_evidence(state, row["identifier"].upper(), search, now, budget)
            if evidence:
                owner = "lifecycle"
                if row["id"] not in noted:  # one receipt per issue, through the outbox
                    linear_sync.enqueue(state, "comment", row["id"], body=(
                        f"🤖 lanes ownership: merged evidence {', '.join(evidence)} claims this issue; it "
                        f"belongs to the merge lifecycle ({current} → Done by its receipts), not to a lane."))
                    noted.add(row["id"])
        if owner is not None:
            report["owners"][owner] = report["owners"].get(owner, 0) + 1
            updated = _epoch(row.get("updatedAt"))
            if owner == "lifecycle" and updated is not None and now - updated > LIFECYCLE_QUIET_S:
                # Owned, but the lifecycle has not moved it for a week: measured, not guessed at.
                report["lifecycleQuiet"] = report.get("lifecycleQuiet", 0) + 1
            continue
        first = since.get(row["id"], now)
        next_since[row["id"]] = first
        report["ownerless"] += 1
        report["oldestOwnerlessS"] = max(report["oldestOwnerlessS"], round(now - first))
        if now - first < GRACE_S:
            continue
        report["overGrace"] += 1
        target, why = resolution(row, merged)
        if target is None:
            report["unresolved"][why] = report["unresolved"].get(why, 0) + 1
            if len(report["sample"]) < 20:
                report["sample"].append({"issue": row["identifier"], "state": current, "reason": why})
            continue
        if moves >= max_moves:
            report["unresolved"]["move-budget"] = report["unresolved"].get("move-budget", 0) + 1
            continue
        if (claim or {}).get("status") == "active":
            linear_sync.release(state, row["id"], "released", f"ownership:{why}")
            report["claimsReleased"].append(row["identifier"])
        linear_sync.enqueue(state, "move", row["id"], target=target,
                            owner="lifecycle:merged-on-main" if target == "Merging" else None)
        linear_sync.enqueue(state, "comment", row["id"], body=(
            f"🤖 lanes ownership: {current} had no live owner (no running worker, open PR, handoff "
            f"or recent activity) for {round((now - first) / 60)} min; moved to {target} ({why})."))
        next_since.pop(row["id"], None)
        moves += 1
        report["moved"].append({"issue": row["identifier"], "from": current, "to": target, "reason": why})
    # A claim is a reservation, not an owner: release every active claim whose run is over.
    for issue_id, claim in claims.items():
        if claim.get("status") != "active" or now - (claim.get("claimedAt") or now) < CLAIM_GRACE_S:
            continue
        lease = run_lease(state, issue_id)
        ident = str(claim.get("identifier") or "").upper()
        if lease == "live" or ident in worktrees or not ident.startswith(team + "-"):
            continue
        if lease is None and now - claim["claimedAt"] < LEGACY_RUN_GRACE_S:
            continue
        linear_sync.release(state, issue_id, "released", "ownership:no-live-lease")
        report["claimsReleased"].append(claim.get("identifier"))
    report["claimsActive"] = sum(1 for row in linear_sync._claims(state).values() if row.get("status") == "active")
    report["ownerlessSince"] = next_since
    report["evidenceNoted"] = sorted(noted)
    tmp = report_path.with_suffix(".tmp")
    tmp.write_text(json.dumps(report))
    os.replace(tmp, report_path)
    return {key: value for key, value in report.items() if key not in ("ownerlessSince", "evidenceNoted")}
