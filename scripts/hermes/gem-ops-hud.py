#!/usr/bin/env python3
"""Low-overhead, read-only operations HUD for Gem's Linux console."""

from __future__ import annotations

import argparse
import datetime as dt
import html.parser
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import termios
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


REPO = "JovieInc/Jovie"
LOCAL_INTERVAL = max(10, int(os.environ.get("HUD_LOCAL_INTERVAL", "15")))
REMOTE_INTERVAL = max(60, int(os.environ.get("HUD_REMOTE_INTERVAL", "120")))
STALE_AFTER = {
    "symphony": LOCAL_INTERVAL * 3,
    "delivery": REMOTE_INTERVAL * 3,
    "issues": REMOTE_INTERVAL * 3,
}
STATE_DIR = Path(os.environ.get("HUD_STATE_DIR", "~/.local/state/gem-ops-hud")).expanduser()
STATE_FILE = STATE_DIR / "state.json"
WORKFLOWS = {
    "CI",
    "Production Controller",
    "Fleet Gate Refresh",
    "Merge Queue Auto-Enroll",
    "Queue-Deferred Release",
    "Delivery Control Receipts",
}
LINEAR_API = "https://api.linear.app/graphql"
LINEAR_TEAM_KEY = "JOV"
GITHUB_READY_LABELS = {"agent-ready", "ready-for-intake"}


class IssueSourceUnavailable(RuntimeError):
    """Both read-only issue sources were unavailable."""


def now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def iso(ts: dt.datetime | None = None) -> str:
    return (ts or now()).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_time(value: str | None) -> dt.datetime | None:
    if not value:
        return None
    try:
        return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def age_text(value: str | None) -> str:
    stamp = parse_time(value)
    if not stamp:
        return "unknown"
    seconds = max(0, int((now() - stamp).total_seconds()))
    if seconds < 60:
        return f"{seconds}s"
    if seconds < 3600:
        return f"{seconds // 60}m"
    if seconds < 86400:
        return f"{seconds // 3600}h{(seconds % 3600) // 60:02d}m"
    return f"{seconds // 86400}d{(seconds % 86400) // 3600:02d}h"


def elapsed_text(value: str | None) -> str:
    return age_text(value) if value else "unknown"


def compact(text: Any, limit: int = 72) -> str:
    value = re.sub(r"\s+", " ", "" if text is None else str(text)).strip()
    return value if len(value) <= limit else value[: max(1, limit - 3)] + "..."


def clip_line(text: Any, limit: int) -> str:
    value = str(text).rstrip()
    return value if len(value) <= limit else value[: max(1, limit - 3)] + "..."


def error_kind(text: Any) -> str:
    value = str(text or "").lower()
    if "no available orchestrator slots" in value:
        return "capacity"
    if "response_timeout" in value or "timed out" in value or "timeout" in value:
        return "timeout"
    match = re.search(r"port_exit[, :]\s*(\d+)", value)
    if match:
        return "launcher_failure"
    if "rate" in value and "limit" in value:
        return "timeout"
    if any(term in value for term in ("merge queue", "merge-queue", "merge_queue")):
        return "merge_queue_wait"
    if any(term in value for term in ("ci failure", "check failure", "required check", "test failure")):
        return "ci_check_failure"
    if any(term in value for term in ("operator input", "approval required", "owner input", "human review")):
        return "ownership_input"
    return "other"


def configured_slots() -> int | None:
    path = Path("/home/timwhite/symphony-runtime/elixir/WORKFLOW.jovie-ui-pilot.md")
    try:
        match = re.search(r"^\s*max_concurrent_agents:\s*([1-9][0-9]*)\s*$", path.read_text(), re.MULTILINE)
        return int(match.group(1)) if match else None
    except OSError:
        return None


def duration_text(seconds: float | int | None) -> str:
    if seconds is None:
        return "unknown"
    value = max(0, int(seconds))
    if value < 60:
        return f"{value}s"
    if value < 3600:
        return f"{value // 60}m {value % 60:02d}s"
    return f"{value // 3600}h {(value % 3600) // 60:02d}m"


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, int((len(ordered) - 1) * fraction + 0.5)))
    return ordered[index]


def until_text(value: str | None) -> str:
    stamp = parse_time(value)
    if not stamp:
        return "time unknown"
    seconds = int((stamp - now()).total_seconds())
    if seconds <= 0:
        return "due now"
    return f"in {duration_text(seconds)}"


def color_enabled() -> bool:
    mode = os.environ.get("HUD_COLOR", "auto").lower()
    if mode == "never" or "NO_COLOR" in os.environ:
        return False
    return mode == "always" or (sys.stdout.isatty() and os.environ.get("TERM", "") != "dumb")


def colorize_line(line: str) -> str:
    if not color_enabled():
        return line
    reset = "\x1b[0m"
    bold = "\x1b[1m"
    cyan = "\x1b[36m"
    green = "\x1b[32m"
    yellow = "\x1b[33m"
    red = "\x1b[31m"
    magenta = "\x1b[35m"
    if line.startswith("| [") or "GEM OPERATIONS" in line:
        return f"{bold}{cyan}{line}{reset}"
    if "| Active" in line or "| RUNNING" in line or "| EXACT" in line:
        return f"{bold}{green}{line}{reset}"
    if "| Ready queue" in line:
        return f"{bold}{cyan}{line}{reset}"
    if "| Retrying" in line or "| ATTENTION" in line or "| AUTO RETRY" in line or "DEGRADED" in line:
        return f"{bold}{yellow}{line}{reset}"
    if "| Owner input" in line:
        return f"{bold}{magenta}{line}{reset}"
    if "STALE" in line or "ERROR" in line or "NOT PROVEN" in line:
        return f"{red}{line}{reset}"
    if line.startswith("[!]"):
        return f"{red}{line}{reset}"
    if line.startswith("[+]"):
        return f"{green}{line}{reset}"
    if line.startswith("[>]"):
        return f"{yellow}{line}{reset}"
    return line


GRID_WIDTH = 160
GRID_LABEL = 24
GRID_VALUE = 11
GRID_STATE = 18
GRID_DETAIL = 94


def grid_bar(fill: str = "-") -> str:
    return "+" + (fill * (GRID_WIDTH - 2)) + "+"


def grid_title(text: str) -> str:
    value = clip_line(text, GRID_WIDTH - 4)
    return f"| {value:<{GRID_WIDTH - 4}} |"


def grid_row(label: Any, value: Any = "", status: Any = "", detail: Any = "") -> str:
    label_text = compact(label, GRID_LABEL)
    value_text = compact(value, GRID_VALUE)
    status_text = compact(status, GRID_STATE)
    detail_text = compact(detail, GRID_DETAIL)
    return (
        f"| {label_text:<{GRID_LABEL}} | {value_text:>{GRID_VALUE}} | "
        f"{status_text:<{GRID_STATE}} | {detail_text:<{GRID_DETAIL}} |"
    )


def http_json(url: str, timeout: float = 5.0) -> Any:
    request = urllib.request.Request(url, headers={"User-Agent": "gem-ops-hud/1"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read(1_000_000).decode("utf-8"))


def http_text(url: str, timeout: float = 4.0) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "gem-ops-hud/1"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read(1_000_000).decode("utf-8", "replace")


def run_json(command: list[str], timeout: float = 20.0) -> Any:
    completed = subprocess.run(
        command,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=timeout,
        check=True,
        env={**os.environ, "GH_PAGER": "cat", "PAGER": "cat"},
    )
    return json.loads(completed.stdout)


def linear_graphql(
    query: str, variables: dict[str, Any], timeout: float = 8.0
) -> dict[str, Any]:
    token = os.environ.get("LINEAR_API_KEY")
    if not token:
        raise RuntimeError("linear_unconfigured")
    request = urllib.request.Request(
        LINEAR_API,
        data=json.dumps({"query": query, "variables": variables}).encode("utf-8"),
        headers={
            "Authorization": token,
            "Content-Type": "application/json",
            "User-Agent": "gem-ops-hud/1",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read(1_000_000).decode("utf-8"))
    if payload.get("errors") or not isinstance(payload.get("data"), dict):
        raise RuntimeError("linear_invalid_response")
    return payload["data"]


def linear_error_kind(exc: Exception) -> str:
    if isinstance(exc, urllib.error.HTTPError) and exc.code in {401, 403}:
        return "unauthorized"
    if str(exc) == "linear_unconfigured":
        return "unconfigured"
    if isinstance(exc, (TimeoutError, urllib.error.URLError)):
        return "unavailable"
    return "error"


def fetch_linear_issues() -> dict[str, Any]:
    team_payload = linear_graphql(
        """
        query HudTeam($key: String!) {
          teams(first: 1, filter: {key: {eq: $key}}) { nodes { id } }
        }
        """,
        {"key": LINEAR_TEAM_KEY},
    )
    teams = team_payload.get("teams", {}).get("nodes", [])
    if len(teams) != 1 or not teams[0].get("id"):
        raise RuntimeError("linear_team_missing")

    state_types: list[str] = []
    cursor: str | None = None
    for _ in range(40):
        payload = linear_graphql(
            """
            query HudIssues($teamId: ID!, $after: String) {
              issues(
                first: 250
                after: $after
                filter: {
                  team: {id: {eq: $teamId}}
                  state: {type: {nin: ["completed", "canceled"]}}
                }
              ) {
                nodes { state { type } }
                pageInfo { hasNextPage endCursor }
              }
            }
            """,
            {"teamId": teams[0]["id"], "after": cursor},
        )
        issues = payload.get("issues", {})
        for issue in issues.get("nodes", []):
            state_type = issue.get("state", {}).get("type")
            if isinstance(state_type, str):
                state_types.append(state_type)
        page_info = issues.get("pageInfo", {})
        if not page_info.get("hasNextPage"):
            break
        cursor = page_info.get("endCursor")
        if not cursor:
            raise RuntimeError("linear_invalid_cursor")
    else:
        raise RuntimeError("linear_page_limit")

    return {
        "open": len(state_types),
        "backlog": sum(1 for state in state_types if state == "backlog"),
        "ready": sum(1 for state in state_types if state == "unstarted"),
    }


def fetch_github_issues() -> dict[str, Any]:
    pages = run_json(
        ["gh", "api", "--paginate", "--slurp", f"repos/{REPO}/issues?state=open&per_page=100"]
    )
    issues = [
        item for page in pages for item in page if not item.get("pull_request")
    ]
    ready = 0
    for issue in issues:
        labels = {
            label.get("name", "").lower()
            for label in issue.get("labels", [])
            if isinstance(label, dict)
        }
        if labels & GITHUB_READY_LABELS:
            ready += 1
    return {"open": len(issues), "backlog": len(issues), "ready": ready}


def fetch_issue_source() -> dict[str, Any]:
    try:
        counts = fetch_linear_issues()
        return {
            "updated": iso(),
            "error": None,
            "source": "linear",
            "degraded": False,
            **counts,
        }
    except Exception as exc:
        linear_error = linear_error_kind(exc)

    try:
        counts = fetch_github_issues()
        return {
            "updated": iso(),
            "error": None,
            "source": "github",
            "degraded": True,
            "linear_error": linear_error,
            **counts,
        }
    except Exception as exc:
        raise IssueSourceUnavailable(
            f"linear_{linear_error};github_{type(exc).__name__}"
        ) from None


def process_count(needle: str) -> int:
    count = 0
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            command = (entry / "cmdline").read_bytes().replace(b"\0", b" ").decode("utf-8", "ignore")
        except (OSError, UnicodeError):
            continue
        if needle in command and "gem-ops-hud" not in command:
            count += 1
    return count


def prepare_console() -> None:
    """Prevent a stale software-flow-control stop from freezing HUD refreshes."""
    if not sys.stdout.isatty():
        return
    try:
        attrs = termios.tcgetattr(sys.stdout.fileno())
        attrs[0] &= ~(termios.IXON | termios.IXOFF)
        termios.tcsetattr(sys.stdout.fileno(), termios.TCSANOW, attrs)
        termios.tcflow(sys.stdout.fileno(), termios.TCOON)
    except (OSError, termios.error):
        pass


def fetch_symphony() -> dict[str, Any]:
    jobs: list[dict[str, Any]] = []
    blockers: list[dict[str, Any]] = []
    runtime_errors: list[str] = []
    counts = {"implementing": 0, "retrying": 0, "queued": 0, "blocked": 0}
    reasons = {
        "capacity": 0,
        "timeout": 0,
        "launcher_failure": 0,
        "ci_check_failure": 0,
        "merge_queue_wait": 0,
        "ownership_input": 0,
        "other": 0,
    }
    retry_deadlines: list[str] = []
    for label, port in (("JOV", 4041), ("LYB", 4042)):
        base = f"http://127.0.0.1:{port}"
        try:
            body = http_text(base + "/")
            identifiers = sorted(set(re.findall(r'href="/api/v1/([A-Za-z0-9_-]+)"', body)))[:40]
            titles = {
                identifier: slug.replace("-", " ").strip().title()
                for identifier, slug in re.findall(
                    r"linear\.app/[^/]+/issue/([A-Za-z0-9_-]+)/([A-Za-z0-9_-]+)", body
                )
            }
            for identifier in identifiers:
                try:
                    item = http_json(f"{base}/api/v1/{identifier}")
                except Exception:
                    continue
                status = compact(item.get("status") or "unknown", 18)
                running = item.get("running") or {}
                retry = item.get("retry") or {}
                if status == "running":
                    counts["implementing"] += 1
                    jobs.append(
                        {
                            "id": compact(identifier, 18),
                            "title": compact(titles.get(identifier) or "title unavailable", 64),
                            "lane": label,
                            "status": status,
                            "activity": compact(running.get("last_activity") or "active", 50),
                            "started": running.get("started_at") or running.get("start_time") or running.get("claimed_at"),
                        }
                    )
                elif status in {"retrying", "blocked"}:
                    counts[status] += 1
                    due = retry.get("due_at") or (item.get("blocked") or {}).get("since")
                    reason = "ownership_input" if status == "blocked" else error_kind(item.get("last_error") or retry.get("error"))
                    reasons[reason] += 1
                    if status == "retrying" and parse_time(due):
                        retry_deadlines.append(str(due))
                    blockers.append(
                        {
                            "id": compact(identifier, 18),
                            "title": compact(titles.get(identifier) or "title unavailable", 56),
                            "owner": f"Symphony/{label}",
                            "reason": reason,
                            "next": "automatic retry" if status == "retrying" else "operator review",
                            "deadline": compact(due or "none", 25),
                            "attempt": int((item.get("attempts") or {}).get("current_retry_attempt") or 0),
                        }
                    )
                elif status in {"queued", "pending", "todo"}:
                    counts["queued"] += 1
        except Exception as exc:
            runtime_errors.append(f"{label}:{type(exc).__name__}")
    return {
        "updated": iso(),
        "error": ", ".join(runtime_errors) or None,
        "workers": {
            "runner_listeners": process_count("Runner.Listener"),
            "runner_jobs": process_count("Runner.Worker"),
            "symphony_jobs": len(jobs),
        },
        "counts": counts,
        "reason_buckets": reasons,
        "slots": {
            "total": configured_slots(),
            "available": (
                0
                if reasons["capacity"] > 0
                else max(0, (configured_slots() or counts["implementing"]) - counts["implementing"])
            ),
            "basis": "configured max plus live capacity signal",
        },
        "next_retry": min(retry_deadlines) if retry_deadlines else None,
        "jobs": jobs[:8],
        "blockers": sorted(
            blockers,
            key=lambda item: (-int(item.get("attempt") or 0), item.get("deadline") or ""),
        )[:8],
    }


GRAPHQL_QUERY = """
query {
  repository(owner: "JovieInc", name: "Jovie") {
    defaultBranchRef { target { ... on Commit { oid } } }
    pullRequests(first: 40, states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes { number title isDraft mergeStateStatus updatedAt mergeQueueEntry { position } }
    }
    merged: pullRequests(first: 50, states: MERGED, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes { number title mergedAt }
    }
  }
}
"""


def fetch_delivery() -> dict[str, Any]:
    graph = run_json(["gh", "api", "graphql", "-f", f"query={GRAPHQL_QUERY}"])
    repo = graph["data"]["repository"]
    prs = repo["pullRequests"]["nodes"]
    merged = repo["merged"]["nodes"]
    window_start = now() - dt.timedelta(hours=24)
    merged_recent = [pr for pr in merged if (parse_time(pr.get("mergedAt")) or dt.datetime.min.replace(tzinfo=dt.timezone.utc)) >= window_start]
    queue = sorted(
        (
            {
                "number": pr["number"],
                "position": pr["mergeQueueEntry"]["position"],
                "title": compact(pr["title"], 56),
            }
            for pr in prs
            if pr.get("mergeQueueEntry")
        ),
        key=lambda item: item["position"],
    )
    runs_payload = run_json(["gh", "api", f"repos/{REPO}/actions/runs?per_page=40"])
    runs = []
    for item in runs_payload.get("workflow_runs", []):
        if item.get("name") not in WORKFLOWS:
            continue
        runs.append(
            {
                "id": item.get("id"),
                "name": compact(item.get("name"), 28),
                "status": compact(item.get("status"), 14),
                "conclusion": compact(item.get("conclusion") or "-", 12),
                "sha": compact(item.get("head_sha"), 8),
                "updated": item.get("updated_at"),
            }
        )
        if len(runs) >= 10:
            break
    production_payload = run_json(
        ["gh", "api", f"repos/{REPO}/actions/workflows/production-controller.yml/runs?per_page=30&status=success"]
    )
    production_successes = [
        run
        for run in production_payload.get("workflow_runs", [])
        if run.get("conclusion") == "success"
        and (parse_time(run.get("updated_at")) or dt.datetime.min.replace(tzinfo=dt.timezone.utc)) >= window_start
    ]
    production_completions: int | str = len(production_successes)
    if len(production_successes) == 30:
        production_completions = "30+"
    ci_payload = run_json(
        ["gh", "api", f"repos/{REPO}/actions/workflows/ci.yml/runs?per_page=30&status=success"]
    )
    ci_durations = []
    for run in ci_payload.get("workflow_runs", []):
        created = parse_time(run.get("created_at"))
        updated = parse_time(run.get("updated_at"))
        if created and updated and updated >= window_start and updated >= created:
            ci_durations.append((updated - created).total_seconds())
    build = http_json("https://jov.ie/api/health/build-info")
    deploy = http_json("https://jov.ie/api/health/deploy")
    main_sha = repo["defaultBranchRef"]["target"]["oid"]
    prod_sha = build.get("commitSha") or build.get("gitSha") or build.get("sha")
    return {
        "updated": iso(),
        "error": None,
        "main_sha": compact(main_sha, 40),
        "prod_sha": compact(prod_sha, 40),
        "deploy_status": compact(deploy.get("status") or "unknown", 20),
        "exact": bool(main_sha and prod_sha and main_sha == prod_sha),
        "prs": {
            "total": len(prs),
            "draft": sum(1 for pr in prs if pr.get("isDraft")),
            "ready": sum(1 for pr in prs if not pr.get("isDraft")),
            "queued": len(queue),
        },
        "queue": queue[:8],
        "runs": runs,
        "success_window_hours": 24,
        "merged_recent": len(merged_recent),
        "production_completions": production_completions,
        "latency": {
            "pickup": None,
            "implementation": None,
            "ci": {
                "sample": len(ci_durations),
                "typical_seconds": percentile(ci_durations, 0.50),
                "slow_tail_seconds": percentile(ci_durations, 0.95),
                "window_hours": 24,
            },
            "merge": None,
        },
    }


def load_state() -> dict[str, Any]:
    try:
        state = json.loads(STATE_FILE.read_text())
        return state if isinstance(state, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def save_state(state: dict[str, Any]) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temporary = tempfile.mkstemp(prefix="state.", dir=STATE_DIR)
    try:
        with os.fdopen(fd, "w") as handle:
            json.dump(state, handle, separators=(",", ":"), sort_keys=True)
            handle.write("\n")
        os.chmod(temporary, 0o600)
        os.replace(temporary, STATE_FILE)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def section_health(state: dict[str, Any], key: str) -> str:
    section = state.get(key) or {}
    age = age_text(section.get("updated"))
    stamp = parse_time(section.get("updated"))
    stale = not stamp or (now() - stamp).total_seconds() > STALE_AFTER[key]
    if section.get("error"):
        return f"ERROR last-good {age} ago ({compact(section['error'], 32)})"
    if stale:
        return f"STALE {age} old"
    return f"OK age {age}"


def render(state: dict[str, Any]) -> str:
    local = state.get("symphony") or {}
    delivery = state.get("delivery") or {}
    issues = state.get("issues") or {}
    workers = local.get("workers") or {}
    counts = local.get("counts") or {}
    reasons = local.get("reason_buckets") or {}
    slots = local.get("slots") or {}
    next_retry = local.get("next_retry")
    prs = delivery.get("prs") or {}
    latency = delivery.get("latency") or {}
    ci_latency = latency.get("ci") or {}
    jobs = local.get("jobs") or []
    blockers = local.get("blockers") or []
    queue = delivery.get("queue") or []
    main = compact(delivery.get("main_sha"), 8) or "????????"
    prod = compact(delivery.get("prod_sha"), 8) or "????????"
    exact = "EXACT" if delivery.get("exact") else "NOT PROVEN"
    issue_source = str(issues.get("source") or "none").upper()
    has_issue_counts = all(key in issues for key in ("backlog", "ready"))
    issue_status = (
        "AUTHORITATIVE"
        if issue_source == "LINEAR"
        else "DEGRADED"
        if issue_source == "GITHUB"
        else "NOT MEASURED"
    )
    if issues.get("error"):
        issue_status = "LAST GOOD" if has_issue_counts else "UNAVAILABLE"
    issue_count_status = issue_status if issues.get("error") else issue_source
    heartbeat = iso()

    rows = [
        grid_bar("="),
        grid_title("GEM OPERATIONS  |  READ ONLY  |  NO CONTROL-PLANE WRITES"),
        grid_row("UTC heartbeat", heartbeat[11:20], section_health(state, "symphony"), f"{heartbeat}; delivery {section_health(state, 'delivery') }"),
        grid_bar("="),
        grid_title("[ SYMPHONY ]"),
        grid_row("Active", counts.get("implementing", "?"), "RUNNING" if counts.get("implementing") else "IDLE", "code work executing now" if counts.get("implementing") else "no code work executing now"),
        grid_row("Ready queue", counts.get("queued", "?"), "WAITING" if counts.get("queued") else "EMPTY", "tracked first-run wait; retries excluded"),
        grid_row("Retrying", counts.get("retrying", "?"), "ATTENTION" if counts.get("retrying") else "CLEAR", f"not active shipping; next {until_text(next_retry)}"),
        grid_row("Owner input", counts.get("blocked", "?"), "BLOCKED" if counts.get("blocked") else "CLEAR", "human decision or named-owner action"),
        grid_row("Execution slots", f"{slots.get('available','?')}/{slots.get('total','?')}", "FULL" if slots.get("available") == 0 else "AVAILABLE", "configured JOV implementation capacity"),
        grid_row("GitHub runners", f"{workers.get('runner_jobs','?')}/{workers.get('runner_listeners','?')}", "JOBS / LISTENERS", "separate from Symphony implementation"),
    ]

    for job in jobs[:4]:
        rows.append(grid_row(job.get("id", "job"), elapsed_text(job.get("started")), "IMPLEMENTING", job.get("title", "title unavailable")))
    if not jobs:
        rows.append(grid_row("Active issue", 0, "NONE", "retry and ready-queue counts remain visible above"))

    rows += [
        grid_bar(),
        grid_title("[ WAIT REASONS ]"),
        grid_row("Capacity", reasons.get("capacity", "?"), "AUTO RETRY" if reasons.get("capacity") else "CLEAR", f"slots busy/cooling; not code/CI; next {until_text(next_retry)}"),
        grid_row("Timeout", reasons.get("timeout", "?"), "AUTO RETRY" if reasons.get("timeout") else "CLEAR", "model/provider exceeded response window; inspect if persistent"),
        grid_row("Launcher", reasons.get("launcher_failure", "?"), "OWNER CHECK" if reasons.get("launcher_failure") else "CLEAR", "agent failed before useful work; inspect routing/launcher evidence"),
        grid_row("CI / check", reasons.get("ci_check_failure", "?"), "PR OWNER" if reasons.get("ci_check_failure") else "CLEAR", "required check failed; fix check before promotion"),
        grid_row("Merge queue", prs.get("queued", "?"), "GITHUB WAIT" if prs.get("queued") else "CLEAR", "native queue; automatic progression; not implementation"),
        grid_row("Ownership / input", counts.get("blocked", "?"), "HUMAN ACTION" if counts.get("blocked") else "CLEAR", "decision, approval, or named-owner action required"),
        grid_row("Other retry", reasons.get("other", "?"), "OWNER CHECK" if reasons.get("other") else "CLEAR", "unclassified safe bucket; inspect sanitized evidence"),
        grid_bar(),
        grid_title("[ DELIVERY FUNNEL ]"),
        grid_row(
            "Issue source",
            issue_source,
            issue_status,
            (
                f"last-known counts; {issues.get('error')}"
                if issues.get("error") and has_issue_counts
                else f"both read-only sources unavailable; {issues.get('error')}"
                if issues.get("error")
                else "Linear workflow states"
                if issue_source == "LINEAR"
                else f"read-only GitHub fallback; Linear {issues.get('linear_error', 'unavailable')}"
            ),
        ),
        grid_row(
            "Backlog",
            issues.get("backlog", "?"),
            issue_count_status,
            (
                "Linear Backlog state"
                if issue_source == "LINEAR"
                else "all open GitHub issues; degraded semantics"
            ),
        ),
        grid_row(
            "Ready / to do",
            issues.get("ready", "?"),
            issue_count_status,
            (
                "Linear unstarted state"
                if issue_source == "LINEAR"
                else "agent-ready / ready-for-intake GitHub labels"
            ),
        ),
        grid_row("In progress", counts.get("implementing", "?"), "RUNNING" if counts.get("implementing") else "IDLE", "local Symphony running status"),
        grid_row("Blocked / retry", f"{counts.get('blocked','?')}/{counts.get('retrying','?')}", "LIVE", "owner-input blocked / automatic retry wait"),
        grid_row("Review ready", prs.get("ready", "?"), "OPEN PRs", "GitHub non-draft open pull requests"),
        grid_row("Merge queue", prs.get("queued", "?"), "NATIVE", "GitHub mergeQueueEntry count"),
        grid_row("Merged", delivery.get("merged_recent", "?"), "ROLLING 24H", "source-backed merged pull requests"),
        grid_row("Production verified", delivery.get("production_completions", "?"), "ROLLING 24H", "successful Production Controller runs"),
        grid_bar(),
        grid_title("[ CYCLE TIME ]"),
        grid_row("Pickup", "? / ?", "NOT MEASURED", "typical p50 / slow-tail p95 unavailable"),
        grid_row("Implementation", "? / ?", "NOT MEASURED", "typical p50 / slow-tail p95 unavailable"),
        grid_row("CI typical (p50)", duration_text(ci_latency.get("typical_seconds")), f"n={ci_latency.get('sample',0)} / 24H", "successful workflow runs"),
        grid_row("CI slow tail (p95)", duration_text(ci_latency.get("slow_tail_seconds")), f"n={ci_latency.get('sample',0)} / 24H", "successful workflow runs"),
        grid_row("Merge", "? / ?", "NOT MEASURED", "queue-entry history unavailable"),
        grid_bar(),
        grid_title("[ DELIVERY LIFECYCLE ]"),
        grid_row("Open pull requests", prs.get("total", "?"), f"READY {prs.get('ready','?')}", f"drafts {prs.get('draft','?')}; native queue {prs.get('queued','?')}"),
        grid_row("Main SHA", main, f"PROD {prod}", f"{exact}; deploy {delivery.get('deploy_status','unknown')}"),
    ]

    for item in queue[:4]:
        rows.append(grid_row(f"MQ #{item.get('number','?')}", item.get("position", "?"), "WAITING", item.get("title", "")))
    if not queue:
        rows.append(grid_row("Merge queue", 0, "EMPTY", "or delivery state unavailable"))

    for run in (delivery.get("runs") or [])[:5]:
        state_text = run.get("status", "") if run.get("status") != "completed" else run.get("conclusion", "-")
        rows.append(grid_row(run.get("name", "workflow"), run.get("sha", ""), state_text.upper(), f"age {age_text(run.get('updated'))}"))

    rows += [grid_bar("="), grid_title("[ DETAILS / NEXT ACTION ]")]
    if blockers:
        oldest = blockers[0]
        rows.append(grid_row("Longest-wait proxy", oldest.get("id", "?"), f"TRY {oldest.get('attempt',0)}", oldest.get("title", "")))
        rows.append(grid_row("Blocker action", oldest.get("reason", "?"), oldest.get("owner", "?"), f"{oldest.get('next','?')} by {oldest.get('deadline','none')}"))
    else:
        rows.append(grid_row("Longest-wait proxy", "none", "CLEAR", "no Symphony blocker reported"))
    rows += [
        grid_row("Next automatic retry", until_text(next_retry), "AUTO", next_retry or "time unknown"),
        grid_row(
            "Data freshness",
            age_text(local.get("updated")),
            section_health(state, "symphony"),
            f"delivery {age_text(delivery.get('updated'))}; issues {age_text(issues.get('updated'))}",
        ),
        grid_row("Refresh / fallback", "15s / 120s", "LOCAL / REMOTE", "last-known cache; ANSI auto; NO_COLOR plain text; errors sanitized"),
        grid_bar("="),
    ]
    return "\n".join(colorize_line(row) for row in rows) + "\n"


def refresh(state: dict[str, Any], remote: bool) -> dict[str, Any]:
    try:
        state["symphony"] = fetch_symphony()
    except Exception as exc:
        section = state.setdefault("symphony", {})
        section["error"] = type(exc).__name__
    if remote:
        try:
            state["delivery"] = fetch_delivery()
        except Exception as exc:
            section = state.setdefault("delivery", {})
            section["error"] = type(exc).__name__
        try:
            state["issues"] = fetch_issue_source()
        except IssueSourceUnavailable as exc:
            section = state.setdefault("issues", {})
            section["error"] = str(exc)
            section["degraded"] = True
    save_state(state)
    return state


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="refresh and render once")
    parser.add_argument("--no-clear", action="store_true", help="do not clear the terminal")
    args = parser.parse_args()
    prepare_console()
    state = refresh(load_state(), remote=True)
    if args.once:
        sys.stdout.write(render(state))
        return 0
    next_remote = time.monotonic() + REMOTE_INTERVAL
    while True:
        output = render(state)
        if not args.no_clear:
            sys.stdout.write("\x1b[2J\x1b[H")
        sys.stdout.write(output)
        sys.stdout.flush()
        time.sleep(LOCAL_INTERVAL)
        due = time.monotonic() >= next_remote
        state = refresh(state, remote=due)
        if due:
            next_remote = time.monotonic() + REMOTE_INTERVAL


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(0)
