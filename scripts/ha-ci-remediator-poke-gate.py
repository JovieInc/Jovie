#!/usr/bin/env python3
"""Decide whether ha-ci-remediator-poke may POST to Hyperagent (JOV-5921).

Concurrency serializes same-key runs but does not skip them. This gate is the
durable skip: one delivered poke per PR + head SHA, plus a short rate limit.
A missing history read fails closed (no poke). Cancelled/success CI conclusions
never poke. Bounded workflow_dispatch --force retries a SHA only when nothing
is already in flight.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone

IGNORE_CI_CONCLUSIONS = frozenset({"cancelled", "success", "skipped", "neutral"})
EXCLUDED_PR_NUMBERS = frozenset({16419})
IN_FLIGHT_STATUSES = frozenset(
    {"queued", "in_progress", "waiting", "requested", "pending"}
)
SAME_SHA_COOLDOWN_SECONDS = 30 * 60
PR_RATE_LIMIT_SECONDS = 15 * 60
GLOBAL_RATE_LIMIT_SECONDS = 60 * 60
GLOBAL_RATE_LIMIT_COUNT = 8
RUN_NAME_PREFIX = "ha-poke"

SKIP_CI_CONCLUSION = "ci_conclusion_ignored"
SKIP_EXCLUDED_PR = "excluded_pr"
SKIP_MISSING_KEY = "missing_pr_or_sha"
SKIP_HISTORY_UNPROVEN = "poke_history_unproven"
SKIP_IN_FLIGHT = "remediator_in_flight"
SKIP_ALREADY_DELIVERED = "already_poked_sha"
SKIP_RECENT_SHA = "recently_poked_sha"
SKIP_PR_RATE_LIMIT = "pr_rate_limit"
SKIP_GLOBAL_RATE_LIMIT = "global_rate_limit"
DECISION_POKE = "poke"
DECISION_SKIP = "skip"


def poke_run_name(pr_number: int | str, head_sha: str) -> str:
    return f"{RUN_NAME_PREFIX}-{pr_number}-{head_sha}"


def _parse_time(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else None


def _positive_pr(value: object) -> int | None:
    if isinstance(value, bool) or value in (None, ""):
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _head_sha(value: object) -> str | None:
    text = str(value or "").strip().lower()
    if len(text) != 40 or any(char not in "0123456789abcdef" for char in text):
        return None
    return text


def _run_title(run: dict) -> str:
    title = run.get("display_title") or run.get("name") or ""
    return str(title).strip()


def _created_at(run: dict) -> datetime | None:
    return _parse_time(run.get("created_at") or run.get("run_started_at"))


def _is_in_flight(run: dict) -> bool:
    return str(run.get("status") or "") in IN_FLIGHT_STATUSES


def _delivered(run: dict) -> bool:
    return (
        str(run.get("status") or "") == "completed"
        and str(run.get("conclusion") or "") == "success"
    )


def _cancelled_run(run: dict) -> bool:
    return str(run.get("conclusion") or "") == "cancelled"


def _within(run: dict, now: datetime, seconds: int) -> bool:
    created = _created_at(run)
    if created is None or created > now:
        return False
    return (now - created).total_seconds() <= seconds


def decide_poke(
    *,
    pr_number: object,
    head_sha: object,
    ci_conclusion: object = "",
    event_name: object = "workflow_run",
    force: bool = False,
    current_run_id: object = None,
    now: datetime | None = None,
    poke_runs: object = None,
) -> dict[str, str]:
    """Return {decision, reason} without contacting Hyperagent."""
    now = now or datetime.now(timezone.utc)
    if event_name != "workflow_dispatch":
        conclusion = str(ci_conclusion or "").strip().lower()
        if conclusion in IGNORE_CI_CONCLUSIONS or conclusion != "failure":
            return {"decision": DECISION_SKIP, "reason": SKIP_CI_CONCLUSION}

    pr = _positive_pr(pr_number)
    sha = _head_sha(head_sha)
    if pr is None or sha is None:
        return {"decision": DECISION_SKIP, "reason": SKIP_MISSING_KEY}
    if pr in EXCLUDED_PR_NUMBERS:
        return {"decision": DECISION_SKIP, "reason": SKIP_EXCLUDED_PR}

    if not isinstance(poke_runs, dict) or not isinstance(
        poke_runs.get("workflow_runs"), list
    ):
        return {"decision": DECISION_SKIP, "reason": SKIP_HISTORY_UNPROVEN}

    try:
        current_id = int(current_run_id) if current_run_id not in (None, "") else None
    except (TypeError, ValueError):
        current_id = None

    key_name = poke_run_name(pr, sha)
    pr_prefix = f"{RUN_NAME_PREFIX}-{pr}-"
    peers: list[dict] = []
    for run in poke_runs["workflow_runs"]:
        if not isinstance(run, dict):
            return {"decision": DECISION_SKIP, "reason": SKIP_HISTORY_UNPROVEN}
        run_id = run.get("id")
        if current_id is not None and run_id == current_id:
            continue
        peers.append(run)

    same_key = [run for run in peers if _run_title(run) == key_name]
    if any(_is_in_flight(run) for run in same_key):
        return {"decision": DECISION_SKIP, "reason": SKIP_IN_FLIGHT}

    if not force:
        if any(_delivered(run) for run in same_key):
            return {"decision": DECISION_SKIP, "reason": SKIP_ALREADY_DELIVERED}
        if any(
            not _cancelled_run(run) and _within(run, now, SAME_SHA_COOLDOWN_SECONDS)
            for run in same_key
        ):
            return {"decision": DECISION_SKIP, "reason": SKIP_RECENT_SHA}

    pr_peers = [run for run in peers if _run_title(run).startswith(pr_prefix)]
    if any(
        (_delivered(run) or _is_in_flight(run))
        and _within(run, now, PR_RATE_LIMIT_SECONDS)
        for run in pr_peers
    ):
        return {"decision": DECISION_SKIP, "reason": SKIP_PR_RATE_LIMIT}

    global_hits = [
        run
        for run in peers
        if _run_title(run).startswith(f"{RUN_NAME_PREFIX}-")
        and (_delivered(run) or _is_in_flight(run))
        and _within(run, now, GLOBAL_RATE_LIMIT_SECONDS)
    ]
    if len(global_hits) >= GLOBAL_RATE_LIMIT_COUNT:
        return {"decision": DECISION_SKIP, "reason": SKIP_GLOBAL_RATE_LIMIT}

    return {"decision": DECISION_POKE, "reason": DECISION_POKE}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pr-number", required=True)
    parser.add_argument("--head-sha", required=True)
    parser.add_argument("--ci-conclusion", default="")
    parser.add_argument("--event-name", default="workflow_run")
    parser.add_argument("--force", default="false")
    parser.add_argument("--current-run-id", default="")
    parser.add_argument("--now-epoch", default="")
    parser.add_argument("--runs-json", required=True)
    args = parser.parse_args(argv)

    try:
        payload = json.loads(open(args.runs_json, encoding="utf-8").read())
    except (OSError, json.JSONDecodeError):
        payload = None

    now = None
    if args.now_epoch:
        try:
            now = datetime.fromtimestamp(int(args.now_epoch), tz=timezone.utc)
        except (TypeError, ValueError):
            now = None

    result = decide_poke(
        pr_number=args.pr_number,
        head_sha=args.head_sha,
        ci_conclusion=args.ci_conclusion,
        event_name=args.event_name,
        force=str(args.force).strip().lower() in {"1", "true", "yes"},
        current_run_id=args.current_run_id,
        now=now,
        poke_runs=payload,
    )
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry
    raise SystemExit(main())
