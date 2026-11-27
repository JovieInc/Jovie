"""Compose the doctor's existing source and release health providers.

Each provider keeps its own sampling cache, API budget and incident policy.
The hosted detector receipt is read independently of the workflow verdict.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from datetime import datetime
from functools import partial
from pathlib import Path

import deploy_health
import lifecycle
import main_health
import queue_empty_red
import release_evidence
import release_gates


AUTOMATION_LIVENESS_RECEIPTS = "automation-liveness-receipts"
AUTOMATION_LIVENESS_TTL_S = 600


def _github_utc_epoch(stamp: object) -> float | None:
    if not isinstance(stamp, str) or not stamp.endswith("Z") or "T" not in stamp:
        return None
    try:
        return datetime.fromisoformat(stamp.replace("Z", "+00:00")).timestamp()
    except (ValueError, OverflowError):
        return None


def automation_liveness(lane, now: float) -> dict:
    """Latest hosted detector report upload, independent of monitored loop health."""
    scripts = str(Path(__file__).resolve().parents[1])
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    from apiclient.gh import default_run, run_gh
    from apiclient.github import GitHubClient

    def fetch():
        endpoint = f"repos/{lane.REPO_SLUG}/actions/artifacts"
        result = run_gh(["api", f"{endpoint}?name={AUTOMATION_LIVENESS_RECEIPTS}&per_page=20"], priority="poll",
                        max_attempts=1, max_wait_ms=0, run=partial(default_run, timeout=30, execute=lifecycle.run))
        if result["code"] != 0:
            return None
        try:
            body = json.loads(result["stdout"])
        except (ValueError, TypeError):
            return None
        rows = body.get("artifacts") if isinstance(body, dict) else None
        total = body.get("total_count") if isinstance(body, dict) else None
        if not isinstance(rows, list) or type(total) is not int or total < len(rows):
            return None
        latest = None
        malformed = False
        for row in rows:
            run = row.get("workflow_run") if isinstance(row, dict) else None
            if not isinstance(run, dict) or not isinstance(run.get("head_branch"), str):
                malformed = True
                continue
            if run["head_branch"] != "main" or row.get("expired") is True:
                continue
            repo_id = run.get("repository_id")
            head_repo_id = run.get("head_repository_id")
            if type(repo_id) is not int or repo_id <= 0 or type(head_repo_id) is not int:
                malformed = True
                continue
            if repo_id != head_repo_id:
                continue
            stamp = row.get("created_at")
            expiry = row.get("expires_at")
            created = _github_utc_epoch(stamp)
            expires = _github_utc_epoch(expiry)
            if (row.get("name") != AUTOMATION_LIVENESS_RECEIPTS or row.get("expired") is not False
                    or any(type(value) is not int or value <= 0 for value in
                           (row.get("id"), row.get("size_in_bytes"), run.get("id")))
                    or row.get("url") != GitHubClient.url(f"{endpoint}/{row.get('id')}")
                    or not re.fullmatch(r"[0-9a-f]{40}", str(run.get("head_sha", "")))
                    or created is None or expires is None or not 0 < created <= now < expires):
                malformed = True
                continue
            if latest is None or created > latest[0]:
                latest = (created, stamp)
        if latest is None and (malformed or total > len(rows)):
            return None
        return {"installed": True, "lastRunAt": latest[1] if latest else None}
    found = lane.shared("automation-liveness-report", AUTOMATION_LIVENESS_TTL_S, fetch)
    return found if isinstance(found, dict) else {"installed": None}


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
