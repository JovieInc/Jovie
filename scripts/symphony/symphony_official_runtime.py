#!/usr/bin/env python3
"""Source-owned checks for the official OpenAI Symphony runtime.

This module deliberately stays outside the upstream Symphony binary. Jovie owns
the deployed service unit, workflow shape, request-budget math, closure
stop-line admission, permanent-error dead-letter receipts, and rate-limit
classification artifacts; OpenAI owns the binary itself. The selected Codex
account remains host-owned configuration and is never pinned by this source.
# JOV-INV-029: runtime admission is the draft-phase owner; activation requires
# separate production proof and is never inferred from a green wrapper.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import os
import pathlib
import re
import signal
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from email.utils import parsedate_to_datetime
from typing import Any


OFFICIAL_SERVICE_NAME = "symphony-elixir.service"
OFFICIAL_PORT = 4041
OFFICIAL_TEAM_KEY = "JOV"
TEAM_KEY_PATTERN = re.compile(r"^[A-Z][A-Z0-9]*$")
OFFICIAL_WORKSPACE_ROOT = "~/symphony-elixir-workspaces"
OFFICIAL_WORKFLOW_TARGET = "%h/.config/symphony/WORKFLOW.md"
OFFICIAL_LOGS_ROOT = "%h/symphony-elixir-logs"
OFFICIAL_MAX_CONCURRENT_AGENTS = 8
MIN_POLL_INTERVAL_MS = 30_000
LINEAR_HOURLY_REQUEST_BUDGET = 2_500
LINEAR_PAGE_SIZE = 50
LINEAR_COUNT_PAGE_SIZE = 100
LINEAR_COUNT_MAX_PAGES = 100
MEASURED_ACTIVE_ISSUES = 185  # JOV team Todo/In Progress/Rework/Merging, 2026-09-03
PER_AGENT_REQUESTS_PER_HOUR = 30
RETRY_REFRESH_REQUESTS_PER_HOUR = 100
TOOL_REQUESTS_PER_HOUR = 300
RESET_CANARY_REQUESTS_PER_HOUR = 100
RATE_LIMIT_GATE_SCHEMA = "symphony-linear-rate-limit-gate/v1"
RATE_LIMIT_EXIT_CODE = 75
FALLBACK_RETRY_AFTER_SECONDS = 3_600
DEFAULT_MAX_GATE_SLEEP_SECONDS = 3_900
DEFAULT_RATE_LIMIT_GATE = (
    pathlib.Path.home() / ".local/state/symphony-elixir/linear-rate-limit.json"
)
# Closure stop-line: Summer's jovie-closure-health/v1 signal embedded in the
# Gem fleet gate receipt is the admission stop-line for new Symphony work.
# "healthy" is the green admission state; grace/red, a missing receipt, a stale
# receipt, or any schema/authority/consistency violation all fail closed.
FLEET_GATE_SCHEMA = "jovie-fleet-gate/v1"
CLOSURE_HEALTH_SCHEMA = "jovie-closure-health/v1"
CLOSURE_HEALTH_AUTHORITY = "Summer"
CLOSURE_HEALTHY_STATUS = "healthy"
CLOSURE_HEALTH_STATUSES = frozenset({"healthy", "grace", "red"})
CLOSURE_HOLD_SCHEMA = "symphony-closure-hold/v1"
CLOSURE_HOLD_EXIT_CODE = 76
DEFAULT_FLEET_GATE_RECEIPT = (
    pathlib.Path.home() / "gem-workspace/state/gem-priority-gate/latest.json"
)
DEFAULT_CLOSURE_HOLD_RECEIPT = (
    pathlib.Path.home() / ".local/state/symphony-elixir/closure-hold.json"
)
DEFAULT_DEAD_LETTER_DIR = (
    pathlib.Path.home() / ".local/state/symphony-elixir/dead-letters"
)
# Mirrors gem-priority-gate.RECEIPT_STALE_AFTER; the receipt is regenerated
# every minute on Gem, so a receipt older than this is a writer outage.
FLEET_GATE_RECEIPT_MAX_AGE_SECONDS = 600
FLEET_GATE_RECEIPT_FUTURE_SKEW_SECONDS = 60
CLOSURE_HOLD_RECHECK_SECONDS = 30
ISSUE_DEAD_LETTER_SCHEMA = "symphony-issue-dead-letter/v1"
LINEAR_PERMANENT_ERROR_MAX_ATTEMPTS = 3
LINEAR_API_STATUS_PATTERN = re.compile(
    r"linear_api_status[=:\s]+(\d{3})\b", re.IGNORECASE
)
LOG_ATTEMPT_PATTERN = re.compile(r"\battempt[=:\s]+(\d+)\b", re.IGNORECASE)
ISSUE_IDENTIFIER_PATTERN = re.compile(r"\b([A-Z][A-Z0-9]*-\d+)\b")
ACTIVE_STATES = ("Todo", "In Progress", "Rework", "Merging")
TERMINAL_STATES = ("Done", "Canceled", "Cancelled", "Duplicate", "Closed")
# JOV-INV-028: only a mechanical dead-letter excludes official dispatch.
EXCLUDED_LABELS = ("no-symphony",)
LINEAR_API_URL = "https://api.linear.app/graphql"
OBSOLETE_TOKENS = (
    "symphony-burrito.service",
    "symphony-burrito-update.timer",
    "symphony-burrito-update.service",
    "--port 4043",
    "127.0.0.1:4043",
    "symphony-burrito-logs",
    "symphony-runtime/elixir",
    "WORKFLOW.jovie-ui-pilot.md",
)
LINEAR_ELIGIBLE_COUNT_QUERY = """
query SymphonyLinearEligibleCount($teamKey: String!, $stateNames: [String!]!, $first: Int!, $after: String) {
  issues(filter: {team: {key: {eq: $teamKey}}, state: {name: {in: $stateNames}}}, first: $first, after: $after) {
    nodes {
      id
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
"""


@dataclass(frozen=True)
class WorkflowContract:
    team_key: str
    api_key: str
    project_slug: str | None
    required_labels: tuple[str, ...]
    excluded_labels: tuple[str, ...]
    active_states: tuple[str, ...]
    terminal_states: tuple[str, ...]
    poll_interval_ms: int
    workspace_root: str
    max_concurrent_agents: int
    server_port: int
    after_create: str


@dataclass(frozen=True)
class BudgetInputs:
    active_issues: int = MEASURED_ACTIVE_ISSUES
    page_size: int = LINEAR_PAGE_SIZE
    poll_interval_ms: int = MIN_POLL_INTERVAL_MS
    max_concurrent_agents: int = OFFICIAL_MAX_CONCURRENT_AGENTS
    per_agent_requests_per_hour: int = PER_AGENT_REQUESTS_PER_HOUR
    retry_refresh_requests_per_hour: int = RETRY_REFRESH_REQUESTS_PER_HOUR
    tool_requests_per_hour: int = TOOL_REQUESTS_PER_HOUR
    reset_canary_requests_per_hour: int = RESET_CANARY_REQUESTS_PER_HOUR
    hourly_budget: int = LINEAR_HOURLY_REQUEST_BUDGET


@dataclass(frozen=True)
class ClosureStopLine:
    receipt_path: pathlib.Path = DEFAULT_FLEET_GATE_RECEIPT
    hold_receipt_path: pathlib.Path = DEFAULT_CLOSURE_HOLD_RECEIPT
    dead_letter_dir: pathlib.Path = DEFAULT_DEAD_LETTER_DIR
    max_receipt_age_seconds: int = FLEET_GATE_RECEIPT_MAX_AGE_SECONDS


def _iso(value: dt.datetime) -> str:
    return value.astimezone(dt.timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _read_text(path: pathlib.Path) -> str:
    return path.read_text(encoding="utf-8")


def sha256_file(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _front_matter(text: str) -> str:
    if not text.startswith("---\n"):
        raise ValueError("workflow must start with front matter")
    parts = text.split("\n---", 1)
    if len(parts) != 2:
        raise ValueError("workflow front matter terminator missing")
    return parts[0][4:]


def _section(lines: list[str], name: str) -> list[str]:
    out: list[str] = []
    inside = False
    for line in lines:
        if re.match(rf"^{re.escape(name)}:\s*$", line):
            inside = True
            continue
        if inside:
            if line and not line.startswith(" "):
                break
            out.append(line)
    return out


def _scalar(body: list[str], key: str) -> str:
    for line in body:
        match = re.match(rf"^\s+{re.escape(key)}:\s*(.+?)\s*$", line)
        if match:
            return match.group(1).strip().strip('"').strip("'")
    raise ValueError(f"missing scalar {key}")


def _list_items(body: list[str], key: str) -> tuple[str, ...]:
    items: list[str] = []
    inside = False
    key_indent: int | None = None
    for line in body:
        match = re.match(rf"^(\s+){re.escape(key)}:\s*$", line)
        if match:
            inside = True
            key_indent = len(match.group(1))
            continue
        if inside:
            item = re.match(r"^(\s+)-\s*(.+?)\s*$", line)
            if item and (key_indent is None or len(item.group(1)) > key_indent):
                items.append(item.group(2).strip().strip('"').strip("'"))
                continue
            if line.strip() and (key_indent is None or len(line) - len(line.lstrip()) <= key_indent):
                break
    return tuple(items)


def _int_scalar(body: list[str], key: str) -> int:
    raw = _scalar(body, key)
    try:
        return int(raw)
    except ValueError as exc:
        raise ValueError(f"{key} must be an integer") from exc


def _non_negative_int(value: str, *, name: str) -> int:
    try:
        parsed = int(value, 10)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be a non-negative integer") from exc
    if parsed < 0:
        raise ValueError(f"{name} must be a non-negative integer")
    return parsed


def _dotenv_values(path: pathlib.Path) -> dict[str, str]:
    values: dict[str, str] = {}
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return values
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        name, value = line.split("=", 1)
        name = name.strip()
        value = value.strip().strip('"').strip("'")
        if name:
            values[name] = value
    return values


def _linear_api_key(linear_env_file: pathlib.Path | None) -> str:
    value = os.environ.get("LINEAR_API_KEY")
    if value and value.strip():
        return value.strip()
    if linear_env_file is not None:
        value = _dotenv_values(linear_env_file).get("LINEAR_API_KEY")
        if value and value.strip():
            return value.strip()
    raise RuntimeError("linear_eligible_count_missing_api_key")


def parse_workflow(path: pathlib.Path) -> WorkflowContract:
    front = _front_matter(_read_text(path))
    lines = front.splitlines()
    tracker = _section(lines, "tracker")
    polling = _section(lines, "polling")
    workspace = _section(lines, "workspace")
    agent = _section(lines, "agent")
    server = _section(lines, "server")
    team_match = re.search(r'^\s+team_key:\s*"?([^"\n]+?)"?\s*$', front, re.M)
    project_match = re.search(r'^\s+project_slug:\s*"?([^"\n]+?)"?\s*$', front, re.M)
    api_key_match = re.search(r"^\s+api_key:\s*(.+?)\s*$", front, re.M)
    if not team_match:
        raise ValueError("missing tracker.provider.team_key")
    team_key = team_match.group(1).strip()
    if not TEAM_KEY_PATTERN.fullmatch(team_key):
        raise ValueError(f"malformed tracker.provider.team_key:{team_key}")
    if not api_key_match:
        raise ValueError("missing tracker.provider.api_key")
    after_create = ""
    if "after_create:" in front:
        after_create = front.split("after_create:", 1)[1].split("\nagent:", 1)[0]
    return WorkflowContract(
        team_key=team_key,
        api_key=api_key_match.group(1).strip(),
        project_slug=project_match.group(1).strip() if project_match else None,
        required_labels=_list_items(tracker, "required_labels"),
        excluded_labels=_list_items(tracker, "excluded_labels"),
        active_states=_list_items(tracker, "active_states"),
        terminal_states=_list_items(tracker, "terminal_states"),
        poll_interval_ms=_int_scalar(polling, "interval_ms"),
        workspace_root=_scalar(workspace, "root"),
        max_concurrent_agents=_int_scalar(agent, "max_concurrent_agents"),
        server_port=_int_scalar(server, "port"),
        after_create=after_create,
    )


def compute_budget(inputs: BudgetInputs) -> dict[str, int | bool]:
    if inputs.active_issues < 0:
        raise ValueError("active_issues must be non-negative")
    if inputs.page_size <= 0:
        raise ValueError("page_size must be positive")
    if inputs.poll_interval_ms <= 0:
        raise ValueError("poll_interval_ms must be positive")
    if inputs.max_concurrent_agents < 0:
        raise ValueError("max_concurrent_agents must be non-negative")

    pages_per_poll = max(1, math.ceil(inputs.active_issues / inputs.page_size))
    polls_per_hour = math.ceil(3_600_000 / inputs.poll_interval_ms)
    scheduler_requests_per_hour = pages_per_poll * polls_per_hour
    agent_requests_per_hour = (
        inputs.max_concurrent_agents * inputs.per_agent_requests_per_hour
    )
    steady_state_requests_per_hour = (
        scheduler_requests_per_hour
        + agent_requests_per_hour
        + inputs.retry_refresh_requests_per_hour
        + inputs.tool_requests_per_hour
        + inputs.reset_canary_requests_per_hour
    )
    return {
        "activeIssues": inputs.active_issues,
        "pageSize": inputs.page_size,
        "pagesPerPoll": pages_per_poll,
        "pollIntervalMs": inputs.poll_interval_ms,
        "pollsPerHour": polls_per_hour,
        "schedulerRequestsPerHour": scheduler_requests_per_hour,
        "maxConcurrentAgents": inputs.max_concurrent_agents,
        "perAgentRequestsPerHour": inputs.per_agent_requests_per_hour,
        "agentRequestsPerHour": agent_requests_per_hour,
        "retryRefreshRequestsPerHour": inputs.retry_refresh_requests_per_hour,
        "toolRequestsPerHour": inputs.tool_requests_per_hour,
        "resetCanaryRequestsPerHour": inputs.reset_canary_requests_per_hour,
        "steadyStateRequestsPerHour": steady_state_requests_per_hour,
        "hourlyBudget": inputs.hourly_budget,
        "headroomRequestsPerHour": inputs.hourly_budget - steady_state_requests_per_hour,
        "withinBudget": steady_state_requests_per_hour <= inputs.hourly_budget,
    }


def fetch_linear_eligible_issue_count(
    *,
    api_key: str,
    team_key: str = OFFICIAL_TEAM_KEY,
    active_states: tuple[str, ...] = ACTIVE_STATES,
    api_url: str = LINEAR_API_URL,
    page_size: int = LINEAR_COUNT_PAGE_SIZE,
) -> int:
    if not active_states:
        return 0
    if page_size <= 0:
        raise ValueError("page_size must be positive")
    if not TEAM_KEY_PATTERN.fullmatch(team_key):
        raise ValueError(f"team_key must match {TEAM_KEY_PATTERN.pattern}")

    count = 0
    after: str | None = None
    pages = 0
    while True:
        payload = json.dumps(
            {
                "query": LINEAR_ELIGIBLE_COUNT_QUERY,
                "variables": {
                    "teamKey": team_key,
                    "stateNames": list(active_states),
                    "first": page_size,
                    "after": after,
                },
            },
            separators=(",", ":"),
        ).encode("utf-8")
        request = urllib.request.Request(
            api_url,
            data=payload,
            headers={
                "Authorization": api_key,
                "Content-Type": "application/json",
                "User-Agent": "jovie-symphony-elixir-budget/1",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                status = int(getattr(response, "status", 200))
                headers = {key.lower(): value for key, value in response.headers.items()}
                body = response.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            headers = {key.lower(): value for key, value in exc.headers.items()}
            classification = classify_linear_response(
                status=exc.code,
                headers=headers,
                body=body,
            )
            if classification["kind"] == "rate_limited":
                raise RuntimeError(
                    "linear_eligible_count_rate_limited:"
                    f"retryAfterSeconds={classification['retryAfterSeconds']}:"
                    f"resetAt={classification['resetAt']}"
                ) from exc
            raise RuntimeError(f"linear_eligible_count_http_status:{exc.code}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"linear_eligible_count_request_failed:{exc.reason}") from exc

        classification = classify_linear_response(status=status, headers=headers, body=body)
        if classification["kind"] == "rate_limited":
            raise RuntimeError(
                "linear_eligible_count_rate_limited:"
                f"retryAfterSeconds={classification['retryAfterSeconds']}:"
                f"resetAt={classification['resetAt']}"
            )
        if status < 200 or status >= 300:
            raise RuntimeError(f"linear_eligible_count_http_status:{status}")
        try:
            decoded = json.loads(body)
        except json.JSONDecodeError as exc:
            raise RuntimeError("linear_eligible_count_invalid_json") from exc
        if _graphql_ratelimited(body):
            raise RuntimeError("linear_eligible_count_rate_limited")
        errors = decoded.get("errors") if isinstance(decoded, dict) else None
        if errors:
            raise RuntimeError("linear_eligible_count_graphql_errors")
        issues = decoded.get("data", {}).get("issues") if isinstance(decoded, dict) else None
        nodes = issues.get("nodes") if isinstance(issues, dict) else None
        page_info = issues.get("pageInfo") if isinstance(issues, dict) else None
        if not isinstance(nodes, list) or not isinstance(page_info, dict):
            raise RuntimeError("linear_eligible_count_missing_team_issues")
        count += len(nodes)
        if page_info.get("hasNextPage") is not True:
            return count
        after_value = page_info.get("endCursor")
        if not isinstance(after_value, str) or not after_value:
            raise RuntimeError("linear_eligible_count_missing_page_cursor")
        after = after_value
        pages += 1
        if pages >= LINEAR_COUNT_MAX_PAGES:
            raise RuntimeError("linear_eligible_count_page_limit_exceeded")


def resolve_linear_eligible_issue_count(
    *,
    linear_env_file: pathlib.Path | None,
    team_key: str = OFFICIAL_TEAM_KEY,
    active_states: tuple[str, ...] = ACTIVE_STATES,
    api_url: str = LINEAR_API_URL,
) -> int:
    override = os.environ.get("SYMPHONY_LINEAR_ACTIVE_ISSUES")
    if override is not None and override.strip():
        return _non_negative_int(override.strip(), name="SYMPHONY_LINEAR_ACTIVE_ISSUES")
    return fetch_linear_eligible_issue_count(
        api_key=_linear_api_key(linear_env_file),
        team_key=team_key,
        active_states=active_states,
        api_url=api_url,
    )


def validate_source(
    *,
    repo_root: pathlib.Path,
    workflow_path: pathlib.Path,
    unit_path: pathlib.Path,
    service_name: str,
    active_issues: int | None = None,
) -> dict[str, Any]:
    errors: list[str] = []
    root_workflow = repo_root / "WORKFLOW.md"
    if root_workflow.exists():
        errors.append("obsolete_root_workflow_present")
    if service_name != OFFICIAL_SERVICE_NAME:
        errors.append(f"obsolete_service_name:{service_name}")

    try:
        workflow = parse_workflow(workflow_path)
    except (OSError, ValueError) as exc:
        workflow = None
        errors.append(f"workflow_invalid:{exc}")

    if workflow is not None:
        if workflow.team_key != OFFICIAL_TEAM_KEY:
            errors.append(f"workflow_team_key:{workflow.team_key}")
        if workflow.project_slug is not None:
            errors.append(f"workflow_project_slug_present:{workflow.project_slug}")
        if workflow.api_key != "$LINEAR_API_KEY":
            errors.append("workflow_api_key_not_env_bound")
        if workflow.required_labels:
            errors.append(
                f"workflow_required_labels_present:{','.join(workflow.required_labels)}"
            )
        for label in EXCLUDED_LABELS:
            if label not in workflow.excluded_labels:
                errors.append(f"workflow_excluded_label_missing:{label}")
        if workflow.active_states != ACTIVE_STATES:
            errors.append(f"workflow_active_states:{','.join(workflow.active_states)}")
        for state in TERMINAL_STATES:
            if state not in workflow.terminal_states:
                errors.append(f"workflow_terminal_state_missing:{state}")
        if workflow.poll_interval_ms < MIN_POLL_INTERVAL_MS:
            errors.append(f"poll_interval_too_low:{workflow.poll_interval_ms}")
        if workflow.workspace_root != OFFICIAL_WORKSPACE_ROOT:
            errors.append(f"workflow_workspace_root:{workflow.workspace_root}")
        if workflow.max_concurrent_agents != OFFICIAL_MAX_CONCURRENT_AGENTS:
            errors.append(
                f"workflow_max_concurrent_agents:{workflow.max_concurrent_agents}"
            )
        if workflow.server_port != OFFICIAL_PORT:
            errors.append(f"workflow_server_port:{workflow.server_port}")
        if 'jovie-symphony-workspace-create" "$PWD"' not in workflow.after_create:
            errors.append("workflow_after_create_missing_managed_wrapper")
        if "git clone " in workflow.after_create:
            errors.append("workflow_after_create_bypasses_managed_wrapper")
        if 'jovie-symphony-workspace cleanup "$PWD"' not in workflow.after_create:
            errors.append("workflow_before_remove_missing_managed_cleanup")
        if "git@" in workflow.after_create:
            errors.append("workflow_after_create_uses_ssh")
        if "mix " in workflow.after_create:
            errors.append("workflow_after_create_uses_elixir_build")
        if active_issues is None:
            budget = None
            errors.append("linear_active_issue_count_missing")
        else:
            budget = compute_budget(
                BudgetInputs(
                    active_issues=active_issues,
                    poll_interval_ms=workflow.poll_interval_ms,
                    max_concurrent_agents=workflow.max_concurrent_agents,
                )
            )
            if not budget["withinBudget"]:
                errors.append(
                    "linear_request_budget_exceeded:"
                    f"{budget['steadyStateRequestsPerHour']}>{budget['hourlyBudget']}"
                )
    else:
        budget = None

    try:
        unit = _read_text(unit_path)
    except OSError as exc:
        unit = ""
        errors.append(f"unit_invalid:{exc}")
    if unit:
        if OFFICIAL_WORKFLOW_TARGET not in unit:
            errors.append("unit_workflow_target_not_config_symphony")
        if f"--port {OFFICIAL_PORT}" not in unit:
            errors.append("unit_port_not_4041")
        if OFFICIAL_LOGS_ROOT not in unit:
            errors.append("unit_logs_root_not_elixir")
        if "%h/.local/bin/symphony" not in unit:
            errors.append("unit_not_using_official_binary_path")
        if "symphony-official-runtime run" not in unit:
            errors.append("unit_missing_rate_limit_runtime_wrapper")
        if "--max-gate-sleep-seconds" not in unit:
            errors.append("unit_missing_rate_limit_sleep_bound")
        if "--closure-gate-file" not in unit:
            errors.append("unit_missing_closure_stop_line_gate")
        if "ExecStartPre=%h/.local/bin/symphony-official-runtime reset-gate" in unit:
            errors.append("unit_uses_tight_restart_rate_limit_gate")
        if (
            "--i-understand-that-this-will-be-running-without-the-usual-guardrails"
            not in unit
        ):
            errors.append("unit_missing_official_unsafe_guard_acknowledgement")
        if "EnvironmentFile=%h/.config/symphony/codex-account.env" not in unit:
            errors.append("unit_missing_host_owned_codex_account_environment")
        if "Environment=CODEX_HOME=" in unit:
            errors.append("unit_hardcodes_codex_account")
        if "SuccessExitStatus=0 1" not in unit:
            errors.append("unit_missing_clean_beam_stop_status")
        for token in OBSOLETE_TOKENS:
            if token in unit:
                errors.append(f"unit_obsolete_token:{token}")
        if "symphony-lyb.service" in unit or "127.0.0.1:4042" in unit:
            errors.append("unit_must_not_touch_lyb")

    return {
        "ok": not errors,
        "errors": errors,
        "serviceName": service_name,
        "workflow": asdict(workflow) if workflow else None,
        "budget": budget,
        "sourceHashes": {
            "workflow": sha256_file(workflow_path) if workflow_path.is_file() else None,
            "unit": sha256_file(unit_path) if unit_path.is_file() else None,
            "helper": sha256_file(pathlib.Path(__file__)),
        },
    }


def _headers_map(raw_headers: list[str], retry_after: str | None) -> dict[str, str]:
    headers: dict[str, str] = {}
    for raw in raw_headers:
        if ":" not in raw:
            raise ValueError(f"invalid header {raw!r}; expected Name: value")
        name, value = raw.split(":", 1)
        headers[name.strip().lower()] = value.strip()
    if retry_after is not None:
        headers["retry-after"] = retry_after
    return headers


def _parse_retry_after(value: str | None, *, now: dt.datetime) -> int | None:
    if value is None or not value.strip():
        return None
    stripped = value.strip()
    if re.fullmatch(r"\d+", stripped):
        return max(0, int(stripped))
    try:
        parsed = parsedate_to_datetime(stripped)
    except (TypeError, ValueError, IndexError, OverflowError):
        return None
    if parsed is None:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return max(0, math.ceil((parsed - now).total_seconds()))


def _graphql_ratelimited(body: str) -> bool:
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        return False
    errors = payload.get("errors") if isinstance(payload, dict) else None
    if not isinstance(errors, list):
        return False
    for error in errors:
        if not isinstance(error, dict):
            continue
        extension = error.get("extensions")
        candidates = [
            error.get("code"),
            error.get("type"),
            error.get("message"),
        ]
        if isinstance(extension, dict):
            candidates.extend(
                [extension.get("code"), extension.get("type"), extension.get("status")]
            )
        if any(str(candidate).upper() == "RATELIMITED" for candidate in candidates):
            return True
    return False


def _json_candidate(text: str) -> str:
    start = text.find("{")
    if start == -1:
        return text
    candidate = text[start:].strip()
    try:
        json.loads(candidate)
    except json.JSONDecodeError:
        return text
    return candidate


def classify_linear_log_line(
    line: str, now: dt.datetime | None = None
) -> dict[str, Any] | None:
    """Classify official Symphony log lines without modifying the upstream binary."""
    upper = line.upper()
    if "RATELIMITED" not in upper and "RATE LIMIT" not in upper:
        return None
    status_match = re.search(r"(?:HTTP|STATUS|STATUS_CODE)[=:\s]+(400|429)\b", upper)
    if status_match is None:
        return None
    retry_match = re.search(
        r"RETRY-AFTER[=:\s]+([0-9]+|[A-Z][A-Z][A-Z],\s+[^;]+GMT)",
        line,
        re.I,
    )
    headers = (
        {"retry-after": retry_match.group(1).strip()} if retry_match is not None else {}
    )
    classification = classify_linear_response(
        status=int(status_match.group(1)),
        headers=headers,
        body=_json_candidate(line),
        now=now,
    )
    return classification if classification["kind"] == "rate_limited" else None


def classify_linear_response(
    *, status: int, headers: dict[str, str], body: str, now: dt.datetime | None = None
) -> dict[str, Any]:
    observed_at = now or _now()
    retry_after = _parse_retry_after(headers.get("retry-after"), now=observed_at)
    graphql_rate_limited = _graphql_ratelimited(body)
    rate_limited = status == 429 or (status == 400 and graphql_rate_limited)
    if rate_limited and retry_after is None:
        retry_after = FALLBACK_RETRY_AFTER_SECONDS
    reset_at = (
        _iso(observed_at + dt.timedelta(seconds=retry_after))
        if retry_after is not None
        else None
    )
    if rate_limited:
        return {
            "kind": "rate_limited",
            "status": status,
            "source": "linear_graphql_ratelimited"
            if graphql_rate_limited
            else "linear_http_429",
            "retryAfterSeconds": retry_after,
            "resetAt": reset_at,
            "recordedAt": _iso(observed_at),
        }
    if status == 400:
        return {
            "kind": "bad_request",
            "status": status,
            "source": "linear_graphql_bad_request",
            "retryAfterSeconds": None,
            "resetAt": None,
            "recordedAt": _iso(observed_at),
        }
    if status >= 500:
        return {
            "kind": "transient_error",
            "status": status,
            "source": "linear_transport",
            "retryAfterSeconds": retry_after,
            "resetAt": reset_at,
            "recordedAt": _iso(observed_at),
        }
    return {
        "kind": "ok" if 200 <= status < 300 else "error",
        "status": status,
        "source": "linear_transport",
        "retryAfterSeconds": retry_after,
        "resetAt": reset_at,
        "recordedAt": _iso(observed_at),
    }


def write_rate_limit_gate(path: pathlib.Path, classification: dict[str, Any]) -> bool:
    if classification.get("kind") != "rate_limited":
        return False
    payload = {
        "schema": RATE_LIMIT_GATE_SCHEMA,
        "status": "active",
        **classification,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        try:
            handle = os.fdopen(descriptor, "w", encoding="utf-8")
        except Exception:
            try:
                os.close(descriptor)
            except OSError:
                pass
            raise
        with handle:
            json.dump(payload, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_name, path)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)
    return True


def _sleep_gate(gate: dict[str, Any], max_sleep_seconds: int | None) -> int:
    seconds = int(gate.get("retryAfterSeconds") or 0)
    if seconds <= 0:
        return 0
    if max_sleep_seconds is not None:
        if max_sleep_seconds <= 0:
            return 0
        seconds = min(seconds, max_sleep_seconds)
    print(
        json.dumps(
            {
                "kind": "rate_limit_gate_wait",
                "resetAt": gate.get("resetAt"),
                "sleepSeconds": seconds,
            },
            sort_keys=True,
        ),
        flush=True,
    )
    time.sleep(seconds)
    return seconds


def _print_gate_wait_exhausted(gate: dict[str, Any], max_sleep_seconds: int) -> None:
    print(
        json.dumps(
            {
                "kind": "rate_limit_gate_wait_exhausted",
                "resetAt": gate.get("resetAt"),
                "maxGateSleepSeconds": max_sleep_seconds,
            },
            sort_keys=True,
        ),
        flush=True,
    )


def _pause_child_for_gate(
    process: subprocess.Popen[str],
    gate: dict[str, Any],
    max_gate_sleep_seconds: int | None,
) -> int:
    if process.poll() is not None or not gate.get("active"):
        return 0
    if not isinstance(process.pid, int) or process.pid <= 0:
        return 0
    os.kill(process.pid, signal.SIGSTOP)
    try:
        return _sleep_gate(gate, max_gate_sleep_seconds)
    finally:
        if process.poll() is None:
            try:
                os.kill(process.pid, signal.SIGCONT)
            except ProcessLookupError:
                pass


def _write_json_receipt(path: pathlib.Path, payload: dict[str, Any]) -> None:
    """Atomic durable receipt write (same fsync+replace shape as the rate gate)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_name, path)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)


def read_closure_stop_line(
    path: pathlib.Path,
    now: dt.datetime | None = None,
    *,
    max_age_seconds: int = FLEET_GATE_RECEIPT_MAX_AGE_SECONDS,
) -> dict[str, Any]:
    """Fail-closed admission verdict from the freshest Gem fleet gate receipt.

    New issue admission is allowed only while Summer's closure health signal is
    healthy (the green admission state). A missing, unreadable, stale,
    future-dated, or internally inconsistent receipt holds new admission.
    """
    observed_at = now or _now()

    def hold(reason: str, **extra: Any) -> dict[str, Any]:
        return {"hold": True, "reason": reason, "path": str(path), **extra}

    if not path.exists():
        return hold("fleet-gate-receipt-missing")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return hold(f"fleet-gate-receipt-invalid:{type(exc).__name__}")
    if not isinstance(payload, dict) or payload.get("schema") != FLEET_GATE_SCHEMA:
        return hold("fleet-gate-receipt-schema-mismatch")
    receipt_observed_raw = payload.get("observedAt")
    try:
        receipt_observed = (
            dt.datetime.fromisoformat(str(receipt_observed_raw).replace("Z", "+00:00"))
            if receipt_observed_raw
            else None
        )
    except ValueError:
        receipt_observed = None
    if receipt_observed is None:
        return hold("fleet-gate-receipt-observed-at-missing")
    age_seconds = math.ceil((observed_at - receipt_observed).total_seconds())
    details: dict[str, Any] = {
        "receiptObservedAt": _iso(receipt_observed),
        "receiptAgeSeconds": age_seconds,
        "maxReceiptAgeSeconds": max_age_seconds,
    }
    if age_seconds < -FLEET_GATE_RECEIPT_FUTURE_SKEW_SECONDS:
        return hold("fleet-gate-receipt-future", **details)
    if age_seconds > max_age_seconds:
        return hold("fleet-gate-receipt-stale", **details)
    signals = payload.get("signals")
    closure = signals.get("closureHealth") if isinstance(signals, dict) else None
    if not isinstance(closure, dict):
        return hold("closure-health-missing", **details)
    status = closure.get("status")
    intake = closure.get("newIssueIntakeAllowed")
    tampered = (
        closure.get("schema") != CLOSURE_HEALTH_SCHEMA
        or closure.get("authority") != CLOSURE_HEALTH_AUTHORITY
        or status not in CLOSURE_HEALTH_STATUSES
        or not isinstance(intake, bool)
        or intake is not (status == CLOSURE_HEALTHY_STATUS)
        or closure.get("promotionContinues") is not True
        or closure.get("remediationContinues") is not True
    )
    details["closureStatus"] = status if isinstance(status, str) else None
    if tampered:
        return hold("closure-health-receipt-tampered", **details)
    admission = payload.get("closureAdmission")
    if (
        not isinstance(admission, dict)
        or admission.get("newIssueIntakeAllowed") is not intake
        or admission.get("status") != status
    ):
        return hold("closure-admission-disagrees", **details)
    details["newIssueIntakeAllowed"] = intake
    if status != CLOSURE_HEALTHY_STATUS or intake is not True:
        return hold("closure-health-not-green", **details)
    return {
        "hold": False,
        "reason": "closure-health-green",
        "path": str(path),
        **details,
    }


def write_closure_hold_receipt(
    path: pathlib.Path,
    verdict: dict[str, Any],
    *,
    status: str,
    sleep_seconds_used: int,
    max_sleep_seconds: int | None,
    now: dt.datetime | None = None,
) -> dict[str, Any]:
    """Durable symphony-closure-hold/v1 receipt for one hold decision."""
    payload = {
        "schema": CLOSURE_HOLD_SCHEMA,
        "status": status,
        "reason": verdict.get("reason"),
        "closureStatus": verdict.get("closureStatus"),
        "newIssueIntakeAllowed": verdict.get("newIssueIntakeAllowed"),
        "receiptPath": verdict.get("path"),
        "receiptObservedAt": verdict.get("receiptObservedAt"),
        "receiptAgeSeconds": verdict.get("receiptAgeSeconds"),
        "holdSleepSecondsUsed": sleep_seconds_used,
        "maxGateSleepSeconds": max_sleep_seconds,
        "observedAt": _iso(now or _now()),
    }
    _write_json_receipt(path, payload)
    return payload


def _closure_hold_receipt_status(path: pathlib.Path) -> str | None:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict) or payload.get("schema") != CLOSURE_HOLD_SCHEMA:
        return None
    status = payload.get("status")
    return status if isinstance(status, str) else None


def _sleep_closure_hold(verdict: dict[str, Any], seconds: int) -> int:
    if seconds <= 0:
        return 0
    print(
        json.dumps(
            {
                "kind": "closure_hold_wait",
                "reason": verdict.get("reason"),
                "closureStatus": verdict.get("closureStatus"),
                "sleepSeconds": seconds,
            },
            sort_keys=True,
        ),
        flush=True,
    )
    time.sleep(seconds)
    return seconds


def _closure_hold_wait(
    stop_line: ClosureStopLine,
    verdict: dict[str, Any],
    *,
    max_sleep_seconds: int | None,
    sleep_used: int,
) -> tuple[int, dict[str, Any]]:
    """Hold new admission in bounded chunks, re-reading the fleet receipt.

    The fleet gate is regenerated every minute on Gem, so the hold re-reads the
    receipt after every bounded chunk and releases as soon as closure health
    returns to healthy. Every hold decision rewrites the durable hold receipt.
    """
    while verdict["hold"]:
        write_closure_hold_receipt(
            stop_line.hold_receipt_path,
            verdict,
            status="holding",
            sleep_seconds_used=sleep_used,
            max_sleep_seconds=max_sleep_seconds,
        )
        remaining = (
            None if max_sleep_seconds is None else max_sleep_seconds - sleep_used
        )
        chunk = CLOSURE_HOLD_RECHECK_SECONDS
        if remaining is not None:
            chunk = min(chunk, remaining)
        if chunk <= 0:
            break
        sleep_used += _sleep_closure_hold(verdict, chunk)
        verdict = read_closure_stop_line(
            stop_line.receipt_path, max_age_seconds=stop_line.max_receipt_age_seconds
        )
    return sleep_used, verdict


def _print_closure_hold_exhausted(max_sleep_seconds: int | None) -> None:
    print(
        json.dumps(
            {
                "kind": "closure_hold_wait_exhausted",
                "maxGateSleepSeconds": max_sleep_seconds,
            },
            sort_keys=True,
        ),
        flush=True,
    )


def _pause_child_for_closure_hold(
    process: subprocess.Popen[str],
    stop_line: ClosureStopLine,
    verdict: dict[str, Any],
    max_gate_sleep_seconds: int | None,
) -> int:
    """Pause only the scheduler while closure health holds new admission.

    Same contract as the rate-limit pause: agent processes already launched by
    the scheduler keep running to completion. The budget bounds one continuous
    hold episode; on exhaustion the scheduler resumes so finished agents are
    collected before the next bounded episode starts on a still-red receipt.
    """
    if process.poll() is not None or not verdict.get("hold"):
        return 0
    if not isinstance(process.pid, int) or process.pid <= 0:
        return 0
    os.kill(process.pid, signal.SIGSTOP)
    try:
        slept, latest = _closure_hold_wait(
            stop_line, verdict, max_sleep_seconds=max_gate_sleep_seconds, sleep_used=0
        )
        if latest["hold"]:
            write_closure_hold_receipt(
                stop_line.hold_receipt_path,
                latest,
                status="exhausted",
                sleep_seconds_used=slept,
                max_sleep_seconds=max_gate_sleep_seconds,
            )
            _print_closure_hold_exhausted(max_gate_sleep_seconds)
        else:
            write_closure_hold_receipt(
                stop_line.hold_receipt_path,
                latest,
                status="released",
                sleep_seconds_used=slept,
                max_sleep_seconds=max_gate_sleep_seconds,
            )
            print(
                json.dumps(
                    {
                        "kind": "closure_hold_release",
                        "receiptObservedAt": latest.get("receiptObservedAt"),
                    },
                    sort_keys=True,
                ),
                flush=True,
            )
        return slept
    finally:
        if process.poll() is None:
            try:
                os.kill(process.pid, signal.SIGCONT)
            except ProcessLookupError:
                pass


def classify_linear_issue_error_log_line(
    line: str, now: dt.datetime | None = None
) -> dict[str, Any] | None:
    """Classify permanent Linear per-issue client errors from scheduler logs.

    Only a ``linear_api_status`` 4xx (never 429, never a RATELIMITED body, which
    the rate-limit gate owns) attributed to exactly one issue identifier may
    dead-letter. Ambiguous or unattributable lines fail closed to no action.
    """
    status_match = LINEAR_API_STATUS_PATTERN.search(line)
    if status_match is None:
        return None
    status = int(status_match.group(1))
    if status < 400 or status >= 500 or status == 429:
        return None
    if "RATELIMITED" in line.upper():
        return None
    issues = {match.upper() for match in ISSUE_IDENTIFIER_PATTERN.findall(line)}
    if len(issues) != 1:
        return None
    attempt_match = LOG_ATTEMPT_PATTERN.search(line)
    return {
        "kind": "linear_permanent_client_error",
        "issue": sorted(issues)[0],
        "status": status,
        "attempt": int(attempt_match.group(1)) if attempt_match else None,
        "recordedAt": _iso(now or _now()),
    }


def write_issue_dead_letter(
    path: pathlib.Path,
    issue_error: dict[str, Any],
    *,
    attempts: int,
    first_observed_at: str,
    now: dt.datetime | None = None,
) -> dict[str, Any]:
    """Durable symphony-issue-dead-letter/v1 terminal receipt for one issue."""
    payload = {
        "schema": ISSUE_DEAD_LETTER_SCHEMA,
        "status": "dead-lettered",
        "issue": issue_error["issue"],
        "errorClass": issue_error["kind"],
        "linearApiStatus": issue_error["status"],
        "attempts": attempts,
        "maxAttempts": LINEAR_PERMANENT_ERROR_MAX_ATTEMPTS,
        "firstObservedAt": first_observed_at,
        "observedAt": _iso(now or _now()),
        "excludedFromDispatch": True,
        "nextAction": "apply the no-symphony Linear label (already dispatch-excluded by the workflow) before any further machine pickup",
        "source": "symphony-official-runtime",
    }
    _write_json_receipt(path, payload)
    return payload


def record_linear_issue_error(
    dead_letter_dir: pathlib.Path,
    issue_error: dict[str, Any],
    tracked: dict[str, dict[str, Any]],
    noted: set[str],
    now: dt.datetime | None = None,
) -> dict[str, Any] | None:
    """Count permanent per-issue errors; dead-letter at the bounded ceiling.

    The receipt is written once and then suppresses further accounting for the
    issue (exclude-from-dispatch): the durable receipt, not the log stream, is
    the terminal record downstream tooling and humans act on. The wrapper has
    no Linear mutation path, so applying the no-symphony label stays with the
    downstream consumer of the receipt.
    """
    issue = issue_error["issue"]
    receipt_path = dead_letter_dir / f"{issue}.json"
    if issue in noted or receipt_path.exists():
        if issue not in noted:
            noted.add(issue)
            print(
                json.dumps(
                    {"kind": "issue_dead_letter_suppressed", "issue": issue},
                    sort_keys=True,
                ),
                flush=True,
            )
        return None
    entry = tracked.setdefault(
        issue,
        {
            "count": 0,
            "maxAttempt": 0,
            "status": issue_error["status"],
            "firstObservedAt": issue_error["recordedAt"],
        },
    )
    entry["count"] += 1
    entry["status"] = issue_error["status"]
    attempt = issue_error.get("attempt")
    if isinstance(attempt, int):
        entry["maxAttempt"] = max(entry["maxAttempt"], attempt)
    attempts = max(entry["count"], entry["maxAttempt"])
    if attempts < LINEAR_PERMANENT_ERROR_MAX_ATTEMPTS:
        return None
    receipt = write_issue_dead_letter(
        receipt_path,
        issue_error,
        attempts=attempts,
        first_observed_at=entry["firstObservedAt"],
        now=now,
    )
    noted.add(issue)
    print(
        json.dumps(
            {
                "kind": "issue_dead_letter",
                "issue": issue,
                "status": issue_error["status"],
                "attempts": attempts,
                "receipt": str(receipt_path),
            },
            sort_keys=True,
        ),
        flush=True,
    )
    return receipt


def run_official_binary_once(
    command: list[str],
    *,
    gate_file: pathlib.Path,
    closure: ClosureStopLine,
    closure_observe_only: bool,
    max_gate_sleep_seconds: int | None,
) -> int:
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        errors="replace",
        bufsize=1,
    )
    rate_limited = False
    issue_errors: dict[str, dict[str, Any]] = {}
    dead_letter_noted: set[str] = set()
    last_closure_check = 0.0
    assert process.stdout is not None
    for line in process.stdout:
        print(line, end="", flush=True)
        classification = classify_linear_log_line(line)
        if classification and write_rate_limit_gate(gate_file, classification):
            # The official scheduler may be supervising active agents. Record the
            # reset gate and suspend only the scheduler process; do not
            # terminate the process tree that may contain active Codex jobs.
            rate_limited = True
            gate = read_rate_limit_gate(gate_file)
            _pause_child_for_gate(process, gate, max_gate_sleep_seconds)
        else:
            issue_error = classify_linear_issue_error_log_line(line)
            if issue_error is not None:
                record_linear_issue_error(
                    closure.dead_letter_dir,
                    issue_error,
                    issue_errors,
                    dead_letter_noted,
                )
        monotonic_now = time.monotonic()
        if (
            not closure_observe_only
            and monotonic_now - last_closure_check >= CLOSURE_HOLD_RECHECK_SECONDS
        ):
            last_closure_check = monotonic_now
            verdict = read_closure_stop_line(
                closure.receipt_path, max_age_seconds=closure.max_receipt_age_seconds
            )
            if verdict["hold"]:
                _pause_child_for_closure_hold(
                    process, closure, verdict, max_gate_sleep_seconds
                )
    returncode = process.wait()
    return RATE_LIMIT_EXIT_CODE if rate_limited else returncode


def run_official_binary(
    command: list[str],
    *,
    gate_file: pathlib.Path,
    closure: ClosureStopLine,
    closure_observe_only: bool = False,
    max_gate_sleep_seconds: int | None = DEFAULT_MAX_GATE_SLEEP_SECONDS,
) -> int:
    if not command:
        raise ValueError("missing official Symphony command after --")
    gate_sleep_used = 0
    closure_sleep_used = 0
    while True:
        verdict = read_closure_stop_line(
            closure.receipt_path, max_age_seconds=closure.max_receipt_age_seconds
        )
        if verdict["hold"] and not closure_observe_only:
            # The closure stop-line holds NEW admission only. Already-running
            # work belongs to a live scheduler process (or none has started
            # yet), so holding here never interrupts an active agent.
            closure_sleep_used, verdict = _closure_hold_wait(
                closure,
                verdict,
                max_sleep_seconds=max_gate_sleep_seconds,
                sleep_used=closure_sleep_used,
            )
            if verdict["hold"]:
                write_closure_hold_receipt(
                    closure.hold_receipt_path,
                    verdict,
                    status="exhausted",
                    sleep_seconds_used=closure_sleep_used,
                    max_sleep_seconds=max_gate_sleep_seconds,
                )
                _print_closure_hold_exhausted(max_gate_sleep_seconds)
                return CLOSURE_HOLD_EXIT_CODE
            write_closure_hold_receipt(
                closure.hold_receipt_path,
                verdict,
                status="released",
                sleep_seconds_used=closure_sleep_used,
                max_sleep_seconds=max_gate_sleep_seconds,
            )
            print(
                json.dumps(
                    {
                        "kind": "closure_hold_release",
                        "receiptObservedAt": verdict.get("receiptObservedAt"),
                    },
                    sort_keys=True,
                ),
                flush=True,
            )
        elif _closure_hold_receipt_status(closure.hold_receipt_path) in {
            "holding",
            "exhausted",
        }:
            # A previous bounded episode ended mid-hold; record that admission
            # resumed instead of leaving a stale hold receipt behind.
            write_closure_hold_receipt(
                closure.hold_receipt_path,
                verdict,
                status="released",
                sleep_seconds_used=closure_sleep_used,
                max_sleep_seconds=max_gate_sleep_seconds,
            )
        gate = read_rate_limit_gate(gate_file)
        if gate["active"]:
            remaining_sleep = (
                None
                if max_gate_sleep_seconds is None
                else max_gate_sleep_seconds - gate_sleep_used
            )
            slept = _sleep_gate(gate, remaining_sleep)
            if slept <= 0:
                return RATE_LIMIT_EXIT_CODE
            gate_sleep_used += slept
            if (
                max_gate_sleep_seconds is not None
                and gate_sleep_used >= max_gate_sleep_seconds
            ):
                _print_gate_wait_exhausted(gate, max_gate_sleep_seconds)
                return RATE_LIMIT_EXIT_CODE
            continue
        returncode = run_official_binary_once(
            command,
            gate_file=gate_file,
            closure=closure,
            closure_observe_only=closure_observe_only,
            max_gate_sleep_seconds=max_gate_sleep_seconds,
        )
        if returncode != RATE_LIMIT_EXIT_CODE:
            return returncode
        gate = read_rate_limit_gate(gate_file)
        if not gate["active"]:
            return RATE_LIMIT_EXIT_CODE
        remaining_sleep = (
            None
            if max_gate_sleep_seconds is None
            else max_gate_sleep_seconds - gate_sleep_used
        )
        slept = _sleep_gate(gate, remaining_sleep)
        if slept <= 0:
            return RATE_LIMIT_EXIT_CODE
        gate_sleep_used += slept
        if (
            max_gate_sleep_seconds is not None
            and gate_sleep_used >= max_gate_sleep_seconds
        ):
            _print_gate_wait_exhausted(gate, max_gate_sleep_seconds)
            return RATE_LIMIT_EXIT_CODE


def read_rate_limit_gate(path: pathlib.Path, now: dt.datetime | None = None) -> dict[str, Any]:
    observed_at = now or _now()
    if not path.exists():
        return {"active": False, "reason": "missing", "path": str(path)}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return {"active": False, "reason": f"invalid:{type(exc).__name__}", "path": str(path)}
    reset_at_raw = payload.get("resetAt")
    try:
        reset_at = (
            dt.datetime.fromisoformat(str(reset_at_raw).replace("Z", "+00:00"))
            if reset_at_raw
            else None
        )
    except ValueError:
        reset_at = None
    if reset_at and reset_at > observed_at:
        return {
            "active": True,
            "reason": payload.get("source", "linear_rate_limit"),
            "resetAt": _iso(reset_at),
            "retryAfterSeconds": math.ceil((reset_at - observed_at).total_seconds()),
            "path": str(path),
        }
    return {
        "active": False,
        "reason": "expired" if reset_at else "missing_reset",
        "resetAt": _iso(reset_at) if reset_at else None,
        "path": str(path),
    }


def _print_result(result: dict[str, Any], *, json_output: bool) -> None:
    if json_output:
        print(json.dumps(result, sort_keys=True))
        return
    if "budget" in result:
        budget = result.get("budget") or {}
        status = "SOURCE_OK" if result.get("ok") else "SOURCE_RED"
        print(status)
        for error in result.get("errors", []):
            print(f"ERROR {error}")
        if budget:
            print(
                "BUDGET_"
                + ("OK" if budget.get("withinBudget") else "RED")
                + " "
                + f"steady={budget.get('steadyStateRequestsPerHour')} "
                + f"budget={budget.get('hourlyBudget')} "
                + f"headroom={budget.get('headroomRequestsPerHour')} "
                + f"pages={budget.get('pagesPerPoll')} "
                + f"polls={budget.get('pollsPerHour')}"
            )
        return
    print(json.dumps(result, sort_keys=True))


def _parse_now(value: str | None) -> dt.datetime | None:
    if not value:
        return None
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    budget_parser = sub.add_parser("budget-check")
    budget_parser.add_argument("--active-issues", type=int, default=MEASURED_ACTIVE_ISSUES)
    budget_parser.add_argument("--page-size", type=int, default=LINEAR_PAGE_SIZE)
    budget_parser.add_argument("--poll-interval-ms", type=int, default=MIN_POLL_INTERVAL_MS)
    budget_parser.add_argument(
        "--max-concurrent-agents", type=int, default=OFFICIAL_MAX_CONCURRENT_AGENTS
    )
    budget_parser.add_argument("--json", action="store_true")

    validate_parser = sub.add_parser("validate-source")
    validate_parser.add_argument("--repo-root", type=pathlib.Path, required=True)
    validate_parser.add_argument("--workflow", type=pathlib.Path, required=True)
    validate_parser.add_argument("--unit", type=pathlib.Path, required=True)
    validate_parser.add_argument("--service-name", default=OFFICIAL_SERVICE_NAME)
    validate_parser.add_argument("--active-issues", type=int)
    validate_parser.add_argument("--json", action="store_true")

    count_parser = sub.add_parser("linear-eligible-count")
    count_parser.add_argument(
        "--linear-env-file",
        type=pathlib.Path,
        default=pathlib.Path.home() / ".config/symphony/linear.env",
    )
    count_parser.add_argument("--team-key", default=OFFICIAL_TEAM_KEY)
    count_parser.add_argument("--api-url", default=LINEAR_API_URL)
    count_parser.add_argument("--active-state", action="append")

    classify_parser = sub.add_parser("classify-response")
    classify_parser.add_argument("--status", type=int, required=True)
    classify_parser.add_argument("--header", action="append", default=[])
    classify_parser.add_argument("--retry-after")
    classify_parser.add_argument("--body", default="")
    classify_parser.add_argument("--body-file", type=pathlib.Path)
    classify_parser.add_argument("--gate-file", type=pathlib.Path)
    classify_parser.add_argument("--now")

    gate_parser = sub.add_parser("reset-gate")
    gate_parser.add_argument("--gate-file", type=pathlib.Path, default=DEFAULT_RATE_LIMIT_GATE)
    gate_parser.add_argument("--now")

    run_parser = sub.add_parser("run")
    run_parser.add_argument("--gate-file", type=pathlib.Path, default=DEFAULT_RATE_LIMIT_GATE)
    run_parser.add_argument(
        "--max-gate-sleep-seconds",
        type=int,
        default=DEFAULT_MAX_GATE_SLEEP_SECONDS,
    )
    run_parser.add_argument(
        "--closure-gate-file",
        type=pathlib.Path,
        default=DEFAULT_FLEET_GATE_RECEIPT,
    )
    run_parser.add_argument(
        "--closure-observe-only",
        action="store_true",
        help="observe closure health without pausing the scheduler",
    )
    run_parser.add_argument(
        "--closure-gate-max-age-seconds",
        type=int,
        default=FLEET_GATE_RECEIPT_MAX_AGE_SECONDS,
    )
    run_parser.add_argument(
        "--closure-hold-receipt",
        type=pathlib.Path,
        default=DEFAULT_CLOSURE_HOLD_RECEIPT,
    )
    run_parser.add_argument(
        "--dead-letter-dir",
        type=pathlib.Path,
        default=DEFAULT_DEAD_LETTER_DIR,
    )
    run_parser.add_argument("binary_command", nargs=argparse.REMAINDER)

    args = parser.parse_args(argv)

    if args.command == "budget-check":
        budget = compute_budget(
            BudgetInputs(
                active_issues=args.active_issues,
                page_size=args.page_size,
                poll_interval_ms=args.poll_interval_ms,
                max_concurrent_agents=args.max_concurrent_agents,
            )
        )
        if args.json:
            print(json.dumps(budget, sort_keys=True))
        else:
            print(
                "BUDGET_"
                + ("OK" if budget["withinBudget"] else "RED")
                + " "
                + f"steady={budget['steadyStateRequestsPerHour']} "
                + f"budget={budget['hourlyBudget']} "
                + f"headroom={budget['headroomRequestsPerHour']}"
            )
        return 0 if budget["withinBudget"] else 1

    if args.command == "validate-source":
        result = validate_source(
            repo_root=args.repo_root,
            workflow_path=args.workflow,
            unit_path=args.unit,
            service_name=args.service_name,
            active_issues=args.active_issues,
        )
        _print_result(result, json_output=args.json)
        return 0 if result["ok"] else 1

    if args.command == "linear-eligible-count":
        active_states = tuple(args.active_state or ACTIVE_STATES)
        count = resolve_linear_eligible_issue_count(
            linear_env_file=args.linear_env_file,
            team_key=args.team_key,
            active_states=active_states,
            api_url=args.api_url,
        )
        print(count)
        return 0

    if args.command == "classify-response":
        body = args.body_file.read_text(encoding="utf-8") if args.body_file else args.body
        classification = classify_linear_response(
            status=args.status,
            headers=_headers_map(args.header, args.retry_after),
            body=body,
            now=_parse_now(args.now),
        )
        if args.gate_file:
            classification["gateRecorded"] = write_rate_limit_gate(
                args.gate_file, classification
            )
        print(json.dumps(classification, sort_keys=True))
        return 0 if classification["kind"] != "rate_limited" else 75

    if args.command == "reset-gate":
        gate = read_rate_limit_gate(args.gate_file, now=_parse_now(args.now))
        print(json.dumps(gate, sort_keys=True))
        return RATE_LIMIT_EXIT_CODE if gate["active"] else 0

    if args.command == "run":
        command = args.binary_command
        if command and command[0] == "--":
            command = command[1:]
        return run_official_binary(
            command,
            gate_file=args.gate_file,
            closure=ClosureStopLine(
                receipt_path=args.closure_gate_file,
                hold_receipt_path=args.closure_hold_receipt,
                dead_letter_dir=args.dead_letter_dir,
                max_receipt_age_seconds=args.closure_gate_max_age_seconds,
            ),
            closure_observe_only=args.closure_observe_only,
            max_gate_sleep_seconds=args.max_gate_sleep_seconds,
        )

    raise AssertionError(f"unhandled command {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())
