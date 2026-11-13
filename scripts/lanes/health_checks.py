"""Compose the doctor's existing source and release health providers.

Each provider keeps its own sampling cache, API budget and incident policy.
This adapter only joins their observation, alert and public-feed projections.
"""
from __future__ import annotations

import os
import time
from pathlib import Path

import deploy_health
import main_health
import queue_empty_red
import release_evidence
import release_gates


def observe(state: Path, now: float) -> dict:
    if os.environ.get("LANES_SELFTEST"):
        return dict.fromkeys(("deployHealth", "releaseEvidence", "releaseGates", "mainHealth", "groupOutcomes"))
    health = main_health.sample(state, now)[0]
    # The idle clock: with no push for an hour nothing re-tests main, so the doctor dispatches the read-only workflow.
    main_health.idle_probe(state, health, now)
    return {
        "deployHealth": deploy_health.sample(state, now)[0],
        "releaseEvidence": release_evidence.sample(state, now)[0],
        "releaseGates": release_gates.sample(state, now)[0],
        "mainHealth": health,
        "groupOutcomes": queue_empty_red.sample(state, now)[0],
    }


def judge(observation: dict) -> dict[str, str]:
    now = observation.get("now") or time.time()
    return {
        **deploy_health.judge(observation.get("deployHealth"), now),
        **release_evidence.judge(observation.get("releaseEvidence"), now),
        **release_gates.judge(observation.get("releaseGates"), now),
        **main_health.judge(observation.get("mainHealth")),
        **queue_empty_red.judge(observation),
    }


def feed(observation: dict) -> dict:
    return {
        "deployHealth": deploy_health.feed_block(observation.get("deployHealth"), observation.get("now") or time.time()),
        "mainHealth": main_health.feed_block(observation.get("mainHealth")),
    }
