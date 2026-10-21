"""Admission, budget and breaker decisions over one credential's ledger state (mirror of policy.ts).

State is plain JSON-shaped dicts with the same camelCase keys the TS client writes, so both
languages read and write one ledger. Pinned by packages/api-client/conformance/policy.json.
"""
from __future__ import annotations

import math
from typing import Callable, Optional

from .contract import DEFAULTS, priority_policy

LEDGER_SCHEMA = "jovie-api-ledger/v1"
HOUR_MS = 3_600_000
USAGE_HOURS = 24
UNTIMED_OBSERVATION_MS = 60_000
USAGE_FIELDS = ("attempts", "ok", "errors", "rateLimited", "shed", "waited", "retries", "cacheHits", "notModified")
BREAKER = DEFAULTS["breaker"]


def empty_ledger(provider: str) -> dict:
    return {"schema": LEDGER_SCHEMA, "provider": provider, "credentials": {}}


def empty_credential(now_ms: int) -> dict:
    return {
        "buckets": {},
        "pace": {},
        "breaker": {"state": "closed", "failures": 0, "windowStart": 0, "openUntil": 0, "opens": 0,
                    "probeUntil": 0, "reason": ""},
        "lastWriteAt": 0,
        "lastSeenAt": now_ms,
        "usage": {},
    }


def credential_state(ledger: dict, credential: str, now_ms: int) -> dict:
    state = ledger["credentials"].setdefault(credential, empty_credential(now_ms))
    state["lastSeenAt"] = now_ms
    return state


def live_bucket(state: dict, resource: str, now_ms: int) -> Optional[dict]:
    bucket = state["buckets"].get(resource)
    if not bucket:
        return None
    expires = bucket["resetAt"] if bucket.get("resetAt") is not None else bucket["observedAt"] + UNTIMED_OBSERVATION_MS
    if now_ms >= expires:
        state["buckets"].pop(resource, None)
        state["pace"].pop(resource, None)
        return None
    return bucket


def bump(state: dict, priority: str, field: str, now_ms: int, by: int = 1) -> None:
    hour = now_ms // HOUR_MS
    row = state["usage"].setdefault(str(hour), {})
    usage = row.setdefault(priority, {f: 0 for f in USAGE_FIELDS})
    usage[field] = usage.get(field, 0) + by
    oldest = hour - USAGE_HOURS
    for key in list(state["usage"].keys()):
        if int(key) < oldest:
            del state["usage"][key]


def _floor(bucket: dict, reserve: float) -> int:
    return 0 if bucket.get("limit") is None else int(math.ceil(bucket["limit"] * reserve))


def decision(action: str, until=None, reason: str = "", probe: bool = False, transition=None) -> dict:
    out = {"action": action, "until": until, "reason": reason, "probe": probe}
    if transition is not None:
        out["transition"] = transition
    return out


def _blocked(priority: str, until, reason: str) -> dict:
    return decision("shed" if priority_policy(priority)["onLow"] == "shed" else "wait", until, reason)


def decide(state: dict, priority: str, costs: dict, now_ms: int, write: bool = False,
           min_write_interval_ms: Optional[int] = None, breaker_cfg: dict = BREAKER,
           burst: Optional[float] = None) -> dict:
    """Admit, delay or shed one request. On go the state carries every reservation."""
    burst = DEFAULTS["pace"]["burst"] if burst is None else burst
    breaker = state["breaker"]
    transition = None
    if breaker["state"] == "open":
        if now_ms < breaker["openUntil"]:
            return _blocked(priority, breaker["openUntil"], f"breaker-open:{breaker['reason']}")
        breaker["state"] = "half-open"
        transition = {"from": "open", "to": "half-open", "reason": breaker["reason"], "until": None}
    out = _decide_budget(state, priority, costs, now_ms, write, min_write_interval_ms, breaker_cfg, burst,
                         breaker["state"] == "half-open")
    if transition is not None:
        out["transition"] = transition
    return out


def _decide_budget(state, priority, costs, now_ms, write, min_write_interval_ms, breaker_cfg, burst, half_open):
    policy = priority_policy(priority)
    breaker = state["breaker"]
    probe = False
    if half_open:
        if breaker["probeUntil"] > now_ms:
            return _blocked(priority, breaker["probeUntil"], "breaker-probe-in-flight")
        probe = True
    for resource, cost in costs.items():
        bucket = live_bucket(state, resource, now_ms)
        if not bucket:
            continue
        if bucket["remaining"] - cost < _floor(bucket, policy["reserve"]):
            until = bucket["resetAt"] if bucket.get("resetAt") is not None else now_ms + breaker_cfg["rateLimitCooldownMs"]
            return _blocked(priority, until, f"budget-reserve:{resource}")
    background = policy["class"] == "background"
    if background:
        for resource in costs:
            bucket = live_bucket(state, resource, now_ms)
            if not bucket or bucket.get("resetAt") is None:
                continue
            headroom = bucket["remaining"] - _floor(bucket, policy["reserve"])
            rate = headroom / max(1000, bucket["resetAt"] - now_ms)
            # The burst scales with the headroom (mirror of policy.ts).
            cap = max(burst, math.ceil(headroom * DEFAULTS["pace"]["burstFraction"]))
            pace = state["pace"].get(resource) or {"tokens": cap, "updatedAt": now_ms}
            tokens = min(cap, pace["tokens"] + max(0, now_ms - pace["updatedAt"]) * rate)
            if tokens < 1:
                until = now_ms + int(math.ceil((1 - tokens) / rate)) if rate > 0 else bucket["resetAt"]
                return _blocked(priority, until, f"pace:{resource}")
            state["pace"][resource] = {"tokens": tokens, "updatedAt": now_ms}
    interval = (min_write_interval_ms or 0) if write else 0
    if interval > 0 and state["lastWriteAt"] > 0 and now_ms < state["lastWriteAt"] + interval:
        return decision("wait", state["lastWriteAt"] + interval, "write-spacing")
    if background:
        for resource in costs:
            if resource in state["pace"]:
                state["pace"][resource]["tokens"] -= 1
    for resource, cost in costs.items():
        bucket = live_bucket(state, resource, now_ms)
        if bucket:
            bucket["remaining"] = max(0, bucket["remaining"] - cost)
    if interval > 0:
        state["lastWriteAt"] = now_ms
    if probe:
        breaker["probeUntil"] = now_ms + breaker_cfg["probeLeaseMs"]
    bump(state, priority, "attempts", now_ms)
    return decision("go", None, "breaker-probe" if probe else "admitted", probe)


def observe(state: dict, observations, now_ms: int) -> None:
    """Fold response headers into the shared buckets. Server truth wins."""
    for obs in observations:
        current = state["buckets"].get(obs["resource"])
        if (current and current.get("resetAt") is not None and obs.get("resetAt") is not None
                and obs["resetAt"] < current["resetAt"] - 1000):
            continue  # a late response from an older window
        limit = obs.get("limit")
        if limit is None and current:
            limit = current.get("limit")
        state["buckets"][obs["resource"]] = {"limit": limit, "remaining": obs["remaining"],
                                             "resetAt": obs.get("resetAt"), "observedAt": now_ms}


def _open(breaker: dict, until: int, reason: str) -> dict:
    origin = breaker["state"]
    breaker.update(state="open", openUntil=max(breaker["openUntil"], until), opens=breaker["opens"] + 1,
                   failures=0, probeUntil=0, reason=reason)
    return {"from": origin, "to": "open", "reason": reason, "until": breaker["openUntil"]}


def cooldown_ms(opens: int, cfg: dict = BREAKER) -> int:
    return min(cfg["cooldownMaxMs"], cfg["cooldownBaseMs"] * 2 ** opens)


def record_outcome(state: dict, priority: str, resource: str, fail: dict, probe: bool, now_ms: int,
                   cfg: dict = BREAKER) -> Optional[dict]:
    """Record a finished attempt; returns a breaker transition when one happened."""
    kind = fail["kind"]
    breaker = state["breaker"]
    if kind in ("none", "client"):
        bump(state, priority, "ok" if kind == "none" else "errors", now_ms)
        breaker["failures"] = 0
        if breaker["state"] == "closed":
            return None
        origin = breaker["state"]
        breaker.update(state="closed", opens=0, probeUntil=0, openUntil=0, reason="")
        return {"from": origin, "to": "closed", "reason": "probe-succeeded", "until": None}
    bump(state, priority, "errors", now_ms)
    if kind == "primary":
        bump(state, priority, "rateLimited", now_ms)
        reset_at = fail.get("retryAtMs") if fail.get("retryAtMs") is not None else now_ms + cfg["rateLimitCooldownMs"]
        current = state["buckets"].get(resource) or {}
        state["buckets"][resource] = {"limit": current.get("limit"), "remaining": 0,
                                      "resetAt": max(reset_at, now_ms + 1000), "observedAt": now_ms}
        if probe:
            breaker["probeUntil"] = 0
        return None
    if kind == "secondary":
        bump(state, priority, "rateLimited", now_ms)
        until = fail.get("retryAtMs") if fail.get("retryAtMs") is not None else now_ms + cfg["rateLimitCooldownMs"]
        return _open(breaker, until, "secondary-rate-limit")
    if probe or breaker["state"] == "half-open":
        return _open(breaker, now_ms + cooldown_ms(breaker["opens"], cfg), "probe-failed")
    if now_ms - breaker["windowStart"] > cfg["failureWindowMs"]:
        breaker["windowStart"] = now_ms
        breaker["failures"] = 0
    breaker["failures"] += 1
    if breaker["failures"] < cfg["failureThreshold"]:
        return None
    return _open(breaker, now_ms + cooldown_ms(breaker["opens"], cfg), "transient-failures")


def backoff_ms(attempt: int, fail: dict, now_ms: int, random: Callable[[], float],
               base_ms: Optional[int] = None, cap_ms: Optional[int] = None) -> int:
    """Full-jitter exponential backoff that never retries before a known reset."""
    base = DEFAULTS["backoffBaseMs"] if base_ms is None else base_ms
    cap = DEFAULTS["backoffCapMs"] if cap_ms is None else cap_ms
    jitter = int(math.floor(random() * min(cap, base * 2 ** (attempt - 1))))
    hinted = 0 if fail.get("retryAtMs") is None else fail["retryAtMs"] - now_ms
    return max(jitter, hinted)


def prune_ledger(ledger: dict, now_ms: int, stale_ms: Optional[int] = None) -> None:
    stale = DEFAULTS["staleCredentialMs"] if stale_ms is None else stale_ms
    for cid, state in list(ledger["credentials"].items()):
        b = state["breaker"]
        still_open = b["state"] != "closed" and b["openUntil"] > now_ms
        if not still_open and now_ms - state["lastSeenAt"] > stale:
            del ledger["credentials"][cid]
