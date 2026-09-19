#!/usr/bin/env python3
"""Count consecutive publisher-missing holds and name allowlisted restarts.

Summer's self-repair lane: after N identical publisher-missing reasons, restart
only named Gem publishers. Never symphony-elixir. Does not mint ranking
evidence or Linear children.
"""

from __future__ import annotations

from typing import Any

SCHEMA = "jovie.publisher-self-repair-streak/v1"
STREAK_THRESHOLD = 3
PUBLISHER_UNITS = (
    "gem-service-attestation.timer",
    "gem-service-attestation.service",
)
# Maps a structured hold to the allowlisted unit that feeds it.
PUBLISHER_FOR_REASON = {
    "runner-source-attestation-unavailable": "gem-service-attestation.timer",
    "queue-blocked-since-unavailable": "gem-service-attestation.timer",
}


def publisher_missing_reason(
    *,
    attestation_healthy: bool | None,
    green_ready: int,
    blocked_since: str | None,
    consumer_status: str | None,
) -> str | None:
    if attestation_healthy is not True:
        return "runner-source-attestation-unavailable"
    if (
        isinstance(green_ready, int)
        and not isinstance(green_ready, bool)
        and green_ready > 0
        and not (isinstance(blocked_since, str) and blocked_since.strip())
    ):
        return "queue-blocked-since-unavailable"
    if consumer_status == "idle" and green_ready > 0:
        return None
    return None


def next_streak(previous: object, reason: str | None, observed_at: str) -> dict[str, Any]:
    prior = previous if isinstance(previous, dict) else {}
    if reason is None:
        return {
            "schema": SCHEMA,
            "reason": None,
            "count": 0,
            "observedAt": observed_at,
            "restart": False,
            "unit": None,
        }
    count = 1
    if prior.get("schema") == SCHEMA and prior.get("reason") == reason:
        prior_count = prior.get("count")
        if isinstance(prior_count, int) and not isinstance(prior_count, bool) and prior_count >= 0:
            count = prior_count + 1
    restart = count >= STREAK_THRESHOLD
    unit = PUBLISHER_FOR_REASON.get(reason) if restart else None
    if restart and unit not in PUBLISHER_UNITS:
        restart = False
        unit = None
    return {
        "schema": SCHEMA,
        "reason": reason,
        "count": count,
        "observedAt": observed_at,
        "restart": restart,
        "unit": unit,
    }
