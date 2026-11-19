"""No-abandonment work ledger: pure state for leases, owner ladder, failure signatures and handoffs.

Tim 2026-11-19 9:35 AM PT: no work item ends without a verified outcome; every item always has a live
owner and a next event; a usage limit moves ownership automatically; a red check wakes the original
worker at once; idle hosted runners swarm red PRs. This module holds no I/O. `route.py` reads GitHub
and Linear and calls these functions; tests drive them with literal dicts.

Liveness is measured by PROGRESS events only (head push, check suite on a new head, lease renew,
merge), never by `updatedAt`: labels and bot comments bump `updatedAt`, which is how 17 of 18
`lane-fix-escalating` PRs looked fresh on 2026-11-19 while nothing had moved for 2+ days.
"""
from __future__ import annotations

import hashlib
import json
import re

SCHEMA_LEASE = "noabandon.lease/v1"
SCHEMA_HANDOFF = "noabandon.handoff/v1"
LEASE_MARKER = "<!-- noabandon:lease v1 -->"

# Cheapest first; each rung's quota is independent of the rung before it.
LADDER = ("original", "deterministic", "swarm", "lanes", "hyperagent", "owning_agent")
TTL_S = {"original": 7200, "deterministic": 900, "swarm": 1800, "lanes": 7200, "codex": 7200,
         "hyperagent": 10800, "owning_agent": 86400}
ATTEMPTS_PER_HEAD_SIG = 3
ATTEMPTS_PER_ITEM = 6
MAX_RENEWALS_PER_HEAD = 2
QUOTA_COOLDOWN_S = 6 * 3600
SHARED_RED_MIN_PRS = 3
MAX_ATTEMPT_ROWS = 12
OWNER_CARD_MAX_AGE_S = 7 * 86400
SENSITIVE = (re.compile(r"^\.github/workflows/"), re.compile(r"(^|/)migrations?/"),
             re.compile(r"(^|/)(billing|stripe|secrets?)(/|\.)"), re.compile(r"(^|/)\.env"))
RELEASE_REASONS = frozenset({"quota", "gave_up", "needs_owner_reserved", "unfixable", "stalled", "lost_lease"})
TERMINAL = frozenset({"verified", "closed_with_reason"})

# Branch prefix -> lane that opened the PR (rung 0, "original worker").
PREFIX_LANE = {"codex": "codex", "glm": "hyperagent", "flash": "hyperagent", "hyperagent": "hyperagent",
               "claude": "hyperagent", "grok": "hyperagent", "cursor": "lanes", "lola": "owning_agent",
               "chloe": "owning_agent", "compounding": "lanes", "tim": "owning_agent"}

_NOISE = [(re.compile(r"\b[0-9a-f]{7,40}\b"), "<sha>"), (re.compile(r"\d+(\.\d+)?\s*(ms|s|m|sec|seconds)\b"), "<dur>"),
          (re.compile(r"/(tmp|home|private|var|Users)/\S+"), "<path>"), (re.compile(r":\d+(:\d+)?\b"), ":<n>"),
          (re.compile(r"\d{4}-\d\d-\d\dT[\d:.]+Z?"), "<ts>"), (re.compile(r"\s+"), " ")]


def normalize_error(line: str) -> str:
    text = (line or "").strip()
    for pattern, repl in _NOISE:
        text = pattern.sub(repl, text)
    return text[:240]


def signature(check: str, first_error: str, merge_base: str = "") -> str:
    """Same check + same normalized first error + same base = one failure class (one fixer, not N)."""
    raw = f"{check.strip()}\n{normalize_error(first_error)}\n{merge_base[:12]}"
    return hashlib.sha1(raw.encode()).hexdigest()[:16]


def original_lane(branch: str, body: str = "") -> str:
    match = re.search(r"^Worker:\s*([a-z_-]+)", body or "", re.M)
    if match:
        return match.group(1)
    return PREFIX_LANE.get((branch or "").split("/", 1)[0], "lanes")


def sensitive(paths) -> bool:
    return any(p.search(path) for path in paths or [] for p in SENSITIVE)


def parse_lease(comment_body: str | None) -> dict | None:
    if not comment_body or LEASE_MARKER not in comment_body:
        return None
    match = re.search(r"```json\n(.*?)\n```", comment_body, re.S)
    try:
        lease = json.loads(match.group(1)) if match else None
    except ValueError:
        return None
    return lease if isinstance(lease, dict) and lease.get("schema") == SCHEMA_LEASE else None


def render_lease(lease: dict) -> str:
    body = json.dumps({**lease, "schema": SCHEMA_LEASE}, indent=1, sort_keys=True)
    holder = lease.get("holder_lane")
    return (f"{LEASE_MARKER}\n**No-abandon lease**: `{holder}` holds this PR (epoch {lease.get('epoch')}). "
            f"Next event: `{(lease.get('next_event') or {}).get('kind')}`.\n```json\n{body}\n```")


def lease_live(lease: dict | None, now: float) -> bool:
    if not lease or lease.get("released"):
        return False
    return now < float(lease.get("granted_at", 0)) + float(lease.get("ttl_s", 0))


def renew(lease: dict, now: float, head_sha: str, pushed: bool) -> dict:
    """A push by the holder is a full heartbeat; a bare renew is capped so nobody holds a PR without pushing."""
    out = dict(lease)
    if pushed:
        out.update(granted_at=now, head_sha=head_sha, renewals=0)
    elif int(out.get("renewals", 0)) < MAX_RENEWALS_PER_HEAD:
        out.update(granted_at=now, renewals=int(out.get("renewals", 0)) + 1)
    return out


def attempts_for(lease: dict | None, head: str | None = None, sig: str | None = None) -> int:
    rows = (lease or {}).get("attempts") or []
    return sum(1 for r in rows if (head is None or r.get("head") == head) and (sig is None or r.get("sig") == sig)
               and r.get("outcome") not in ("lost_lease", "quota"))


def record_attempt(lease: dict, row: dict) -> dict:
    out = dict(lease)
    out["attempts"] = (list(out.get("attempts") or []) + [row])[-MAX_ATTEMPT_ROWS:]
    out["lifetime_attempts"] = int(out.get("lifetime_attempts", 0)) + (
        0 if row.get("outcome") in ("lost_lease", "quota") else 1)
    return out


def cooled(lane: str, cooldowns: dict, now: float) -> bool:
    return now >= float((cooldowns or {}).get(lane, 0))


def next_rung(lease: dict | None, *, origin: str, head: str, sig: str, is_sensitive: bool, cooldowns: dict,
              now: float, receivers_enabled: dict | None = None) -> str:
    """Who gets this red event. The current holder keeps it while it has attempts left on (head, sig)
    and its quota is cooled; otherwise the lowest rung that is allowed, cooled, enabled and has not
    already tried this (head, sig). `receivers_enabled[lane] is False` (e.g. the swarm workflow is
    disabled, as it has been since 2026-11-02 while the relay kept dispatching to it) skips the lane:
    a dispatch into a disabled receiver is a silent drop, never "handled"."""
    enabled = receivers_enabled or {}
    lease = lease or {}

    def usable(lane: str) -> bool:
        return enabled.get(lane) is not False and cooled(lane, cooldowns, now)

    if int(lease.get("lifetime_attempts", 0)) >= ATTEMPTS_PER_ITEM:
        return "owning_agent"
    holder = lease.get("holder_lane")
    if holder and not lease.get("released") and usable(holder) and \
            sum(1 for r in lease.get("attempts") or [] if r.get("lane") == holder and r.get("head") == head
                and r.get("sig") == sig and r.get("outcome") not in ("lost_lease", "quota")) < ATTEMPTS_PER_HEAD_SIG:
        return holder
    tried = {r.get("lane") for r in lease.get("attempts") or [] if r.get("head") == head and r.get("sig") == sig}
    if lease.get("released") and holder:
        tried.add(holder)
    for rung in LADDER:
        lane = origin if rung == "original" else rung
        if rung == "owning_agent":
            return "owning_agent"
        if lane in tried or (is_sensitive and rung in ("deterministic", "swarm")) or not usable(lane):
            continue
        return lane
    return "owning_agent"


def grant(lease: dict | None, *, lane: str, worker_id: str, head: str, now: float, next_kind: str,
          item: str, pr: int) -> dict:
    base = dict(lease or {})
    base.update(schema=SCHEMA_LEASE, item=item, pr=pr, holder_lane=lane, worker_id=worker_id, head_sha=head,
                granted_at=now, ttl_s=TTL_S.get(lane, 7200), epoch=int(base.get("epoch", 0)) + 1,
                renewals=0, released=None, next_event={"kind": next_kind, "due_at": now + TTL_S.get(lane, 7200)})
    return base


def release(lease: dict, reason: str, now: float, cooldowns: dict) -> tuple[dict, dict]:
    if reason not in RELEASE_REASONS:
        raise ValueError(f"unknown release reason {reason!r}")
    out = dict(lease, released={"reason": reason, "at": now})
    cools = dict(cooldowns or {})
    if reason == "quota":
        cools[lease.get("holder_lane")] = now + QUOTA_COOLDOWN_S
    return out, cools


def shared_red(red_by_pr: dict) -> dict:
    """{pr: [sig, ...]} -> {sig: [prs]} for signatures red on >= SHARED_RED_MIN_PRS open PRs."""
    groups: dict[str, list] = {}
    for pr, sigs in (red_by_pr or {}).items():
        for sig in set(sigs or []):
            groups.setdefault(sig, []).append(pr)
    return {sig: sorted(prs) for sig, prs in groups.items() if len(prs) >= SHARED_RED_MIN_PRS}


def disposition(item: dict, now: float) -> str:
    """verified | closed_with_reason | live | waiting_owner_reserved | waiting_dependency | abandoned.

    `item`: {state, lease, pending_run, owner_card_at, depends_on_state}. `pending_run` is True when a
    queued/in-progress run or an unstarted dispatch exists for the head (the next event is scheduled)."""
    if item.get("state") in TERMINAL:
        return item["state"]
    if lease_live(item.get("lease"), now) or item.get("pending_run"):
        return "live"
    card = item.get("owner_card_at")
    if card is not None and now - float(card) < OWNER_CARD_MAX_AGE_S:
        return "waiting_owner_reserved"
    dep = item.get("depends_on_state")
    if dep is not None and dep != "abandoned":
        return "waiting_dependency"
    return "abandoned"


def swarm_admission(*, capacity: int, in_progress_jobs: int, mq_queued_over_60s: bool, red_without_lease: int,
                    max_parallel: int, mq_reserve: int = 38, enabled: bool = True) -> int:
    """How many fixers to fan out now. The merge queue always wins; capacity is the VERIFIED figure (60 on
    the 2026-09-08 Team-plan readback), not the HOSTED_RUNNER_CAPACITY=120 planning variable."""
    if not enabled or mq_queued_over_60s or red_without_lease <= 0:
        return 0
    free = capacity - in_progress_jobs - mq_reserve
    return max(0, min(max_parallel, free // 2, red_without_lease))


def handoff(*, item: str, repo: str, pr: int, head: str, base: str, lease: dict, frm: dict, to_lane: str,
            failing: list, usd_left_today: float | None, owner_reserved: str | None = None) -> dict:
    head_attempts = attempts_for(lease, head)
    return {
        "schema": SCHEMA_HANDOFF, "item": item, "repo": repo, "pr": pr, "head_sha": head, "base_sha": base,
        "epoch": lease.get("epoch"), "from": frm, "to": {"lane": to_lane, "ttl_s": TTL_S.get(to_lane, 7200)},
        "failing": [{**f, "extract": (f.get("extract") or "")[:4000]} for f in failing or []],
        "attempts": list(lease.get("attempts") or []),
        "constraints": ["no check weakening", "no admin bypass", f"push with expectedHeadOid == {head}",
                        "sensitive paths -> owning lane (workflows via Symphony Owner)"],
        "acceptance": "required checks green on new head -> merge queue -> merge SHA -> main CI green on merge SHA",
        "budget": {"attempts_left_head": max(0, ATTEMPTS_PER_HEAD_SIG - head_attempts),
                   "attempts_left_item": max(0, ATTEMPTS_PER_ITEM - int(lease.get("lifetime_attempts", 0))),
                   "usd_left_today": usd_left_today},
        "owner_reserved": owner_reserved,
    }
