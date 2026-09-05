#!/usr/bin/env python3
"""Source-owned checks for the official OpenAI Symphony runtime.

This module deliberately stays outside the upstream Symphony binary. Jovie owns
the deployed service unit, workflow shape, request-budget math, closure
stop-line admission, permanent-error dead-letter receipts, and rate-limit
classification artifacts; OpenAI owns the binary itself. The selected Codex
account remains host-owned configuration and is never pinned by this source.
"""

from __future__ import annotations

import argparse
import ctypes
import datetime as dt
import errno
import hashlib
import json
import math
import os
import pathlib
import queue
import re
import select
import signal
import subprocess
import sys
import tempfile
import threading
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
BOUNDED_REPAIR_SCHEMA = "symphony-bounded-repair-admission/v1"
BOUNDED_REPAIR_MAX_SECONDS = 900
BOUNDED_REPAIR_ADMISSION_FIELDS = frozenset(
    {"remediationAdmission", "workAdmission"}
)
RUNTIME_OUTPUT_QUEUE_MAX_LINES = 256
DEFAULT_SHUTDOWN_GRACE_SECONDS = 10.0
MAX_SHUTDOWN_GRACE_SECONDS = 12.0
ISSUE_DEAD_LETTER_SCHEMA = "symphony-issue-dead-letter/v1"
LINEAR_PERMANENT_ERROR_MAX_ATTEMPTS = 3
LINEAR_API_STATUS_PATTERN = re.compile(
    r"linear_api_status[=:\s]+(\d{3})\b", re.IGNORECASE
)
LOG_ATTEMPT_PATTERN = re.compile(r"\battempt[=:\s]+(\d+)\b", re.IGNORECASE)
ISSUE_IDENTIFIER_PATTERN = re.compile(r"\b([A-Z][A-Z0-9]*-\d+)\b")
ACTIVE_STATES = ("Todo", "In Progress", "Rework", "Merging")
TERMINAL_STATES = ("Done", "Canceled", "Cancelled", "Duplicate", "Closed")
EXCLUDED_LABELS = ("no-symphony", "needs-human")
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
EXPECTED_HOOKS = {
    "after_create": (
        'export PATH="$HOME/.local/bin:$HOME/.hermes/bin:$HOME/.npm-global/bin:$PATH"',
        "git clone --depth 1 https://github.com/JovieInc/Jovie.git .",
        "git fetch --depth 1 origin main",
        "git checkout -B main origin/main",
        'skills_tmp="$(mktemp -d "${TMPDIR:-/tmp}/openai-symphony-skills.XXXXXX")"',
        "trap 'rm -rf \"$skills_tmp\"' EXIT",
        'git clone --depth 1 --filter=blob:none --sparse https://github.com/openai/symphony.git "$skills_tmp"',
        'git -C "$skills_tmp" sparse-checkout set .codex/skills',
        "mkdir -p .codex/skills",
        'cp -R "$skills_tmp/.codex/skills/commit" "$skills_tmp/.codex/skills/push" "$skills_tmp/.codex/skills/pull" "$skills_tmp/.codex/skills/land" "$skills_tmp/.codex/skills/linear" .codex/skills/',
        "SYMPHONY_TRUSTED_HOOK_PHASE=after_create bash ./scripts/symphony/symphony-nvme-package-cache.sh after-create",
    ),
    "before_remove": (
        'export PATH="$HOME/.local/bin:$HOME/.hermes/bin:$HOME/.npm-global/bin:$PATH"',
        "if [ -f ./scripts/symphony/symphony-nvme-package-cache.sh ]; then",
        "  SYMPHONY_TRUSTED_HOOK_PHASE=before_remove bash ./scripts/symphony/symphony-nvme-package-cache.sh before-remove",
        "else",
        "  rm -rf ./node_modules ./.symphony/package-cache/pnpm-store",
        "  find ./apps ./packages ./workers -mindepth 2 -maxdepth 2 -type d -name node_modules -exec rm -rf {} + 2>/dev/null || true",
        "fi",
    ),
}
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
    max_turns: int
    codex_command: str
    thread_sandbox: str
    turn_sandbox_type: str
    network_access: bool
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
    recovery_manifest_path: pathlib.Path | None = None


@dataclass(frozen=True)
class BoundedRepairAdmission:
    manifest_path: pathlib.Path
    claim_path: pathlib.Path
    issue_identifier: str
    issue_id: str
    required_label: str
    workspace_root: pathlib.Path
    router_path: pathlib.Path
    expires_at: dt.datetime
    scheduler_command: tuple[str, ...]


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
    section_indent = -1
    for line in lines:
        match = re.match(rf"^(\s*){re.escape(name)}:\s*$", line)
        if match:
            inside = True
            section_indent = len(match.group(1))
            continue
        if inside:
            indent = len(line) - len(line.lstrip())
            if line.strip() and indent <= section_indent:
                break
            out.append(line)
    return out


def _literal_hook(front: str, name: str) -> tuple[str, ...] | None:
    match = re.search(rf"^  {re.escape(name)}: \|\n((?:    .*\n?)*)", front, re.M)
    if match is None:
        return None
    return tuple(line[4:] for line in match.group(1).splitlines())


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


def _bool_scalar(body: list[str], key: str) -> bool:
    raw = _scalar(body, key)
    if raw == "true":
        return True
    if raw == "false":
        return False
    raise ValueError(f"{key} must be a boolean")


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
    codex = _section(lines, "codex")
    turn_sandbox = _section(codex, "turn_sandbox_policy")
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
        max_turns=_int_scalar(agent, "max_turns"),
        codex_command=_scalar(codex, "command"),
        thread_sandbox=_scalar(codex, "thread_sandbox"),
        turn_sandbox_type=_scalar(turn_sandbox, "type"),
        network_access=_bool_scalar(turn_sandbox, "networkAccess"),
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
        workflow_text = _read_text(workflow_path)
        workflow_config = _front_matter(workflow_text)
        for hook_name, expected_hook in EXPECTED_HOOKS.items():
            if _literal_hook(workflow_config, hook_name) != expected_hook:
                errors.append(f"workflow_hook_not_canonical:{hook_name}")
        command_match = re.search(
            r"^\s+command:\s*['\"]?(.+?)['\"]?\s*$", workflow_config, re.M
        )
        expected_command = "./scripts/symphony/symphony-codex-router app-server"
        if command_match is None or command_match.group(1) != expected_command:
            errors.append("workflow_agent_command_not_canonical")
        if "scripts/hermes/" in workflow_config or "../" in workflow_config:
            errors.append("workflow_executable_reference_unsafe")
        for shell_target in re.findall(
            r"^\s+(?:[A-Z_][A-Z0-9_]*=[^\s]+\s+)*(?:bash|sh)\s+([^\s;&|]+)",
            workflow_config,
            re.M,
        ):
            if shell_target != "./scripts/symphony/symphony-nvme-package-cache.sh":
                errors.append(f"workflow_shell_target_not_allowlisted:{shell_target}")
        for direct_target in re.findall(
            r"^\s+(?:(/[^\s;&|]+|\.\.?/[^\s;&|]+))", workflow_config, re.M
        ):
            if direct_target not in {
                "./scripts/symphony/symphony-codex-router",
                "./scripts/symphony/symphony-nvme-package-cache.sh",
            }:
                errors.append(f"workflow_direct_target_not_allowlisted:{direct_target}")
        if re.search(r"\$\(\s*(?:/|\.\.?/)", workflow_config) or re.search(
            r"`\s*(?:/|\.\.?/)", workflow_config
        ):
            errors.append("workflow_command_substitution_target_unsafe")
        referenced = set(
            re.findall(r"\./scripts/symphony/[A-Za-z0-9._-]+", workflow_config)
        )
        allowed = {
            "./scripts/symphony/symphony-codex-router",
            "./scripts/symphony/symphony-nvme-package-cache.sh",
        }
        if not referenced.issubset(allowed) or not allowed.issubset(referenced):
            errors.append("workflow_executable_reference_not_allowlisted")
        for relative in allowed:
            executable = repo_root / relative.removeprefix("./")
            try:
                resolved = executable.resolve(strict=True)
                expected = (repo_root.resolve() / relative.removeprefix("./"))
                if (
                    executable.is_symlink()
                    or resolved != expected
                    or not executable.is_file()
                    or not os.access(executable, os.X_OK)
                ):
                    errors.append(f"workflow_executable_invalid:{relative}")
            except OSError:
                errors.append(f"workflow_executable_invalid:{relative}")
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
        if "git clone --depth 1 https://github.com/JovieInc/Jovie.git ." not in workflow.after_create:
            errors.append("workflow_after_create_missing_https_clone")
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
        if "KillMode=control-group" not in unit:
            errors.append("unit_missing_control_group_kill_mode")
        if "TimeoutStopSec=15s" not in unit:
            errors.append("unit_missing_bounded_stop_timeout")
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


def _sleep_gate(
    gate: dict[str, Any],
    max_sleep_seconds: int | None,
    shutdown: threading.Event | None = None,
) -> int:
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
    if shutdown is None:
        time.sleep(seconds)
        return seconds
    interrupted = shutdown.wait(seconds)
    return 0 if interrupted else seconds


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
    shutdown: threading.Event | None = None,
) -> int:
    if process.poll() is not None or not gate.get("active"):
        return 0
    if not isinstance(process.pid, int) or process.pid <= 0:
        return 0
    os.kill(process.pid, signal.SIGSTOP)
    try:
        return _sleep_gate(gate, max_gate_sleep_seconds, shutdown)
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


def _parse_utc_timestamp(value: Any, *, field: str) -> dt.datetime:
    try:
        parsed = dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field}-invalid") from exc
    if parsed.tzinfo is None:
        raise ValueError(f"{field}-timezone-missing")
    return parsed.astimezone(dt.timezone.utc)


def _require_private_regular_file(path: pathlib.Path, *, field: str) -> None:
    try:
        stat = path.lstat()
    except OSError as exc:
        raise ValueError(f"{field}-unreadable:{type(exc).__name__}") from exc
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"{field}-not-regular")
    if stat.st_uid != os.geteuid():
        raise ValueError(f"{field}-wrong-owner")
    if stat.st_mode & 0o077:
        raise ValueError(f"{field}-permissions-not-private")


def _bounded_repair_artifact(
    artifacts: Any, name: str, *, private: bool = False
) -> pathlib.Path:
    entry = artifacts.get(name) if isinstance(artifacts, dict) else None
    if not isinstance(entry, dict):
        raise ValueError(f"artifact-{name}-missing")
    raw_path = entry.get("path")
    expected_hash = entry.get("sha256")
    if not isinstance(raw_path, str) or not pathlib.Path(raw_path).is_absolute():
        raise ValueError(f"artifact-{name}-path-invalid")
    if not isinstance(expected_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", expected_hash):
        raise ValueError(f"artifact-{name}-sha256-invalid")
    path = pathlib.Path(raw_path)
    if private:
        _require_private_regular_file(path, field=f"artifact-{name}")
    elif path.is_symlink() or not path.is_file():
        raise ValueError(f"artifact-{name}-not-regular")
    if sha256_file(path) != expected_hash:
        raise ValueError(f"artifact-{name}-sha256-mismatch")
    return path


def validate_bounded_repair_admission(
    manifest_path: pathlib.Path,
    *,
    fleet_path: pathlib.Path,
    fleet_payload: dict[str, Any],
    now: dt.datetime | None = None,
    expected_command: list[str] | None = None,
    require_unclaimed: bool = False,
) -> BoundedRepairAdmission:
    """Validate one short-lived, single-issue repair admission without mutating fleet truth."""
    observed_at = now or _now()
    _require_private_regular_file(manifest_path, field="recovery-manifest")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"recovery-manifest-invalid:{type(exc).__name__}") from exc
    if not isinstance(manifest, dict) or manifest.get("schema") != BOUNDED_REPAIR_SCHEMA:
        raise ValueError("recovery-manifest-schema-mismatch")
    if manifest.get("status") != "authorized":
        raise ValueError("recovery-manifest-not-authorized")

    issued_at = _parse_utc_timestamp(manifest.get("issuedAt"), field="issuedAt")
    expires_at = _parse_utc_timestamp(manifest.get("expiresAt"), field="expiresAt")
    duration = (expires_at - issued_at).total_seconds()
    if duration <= 0 or duration > BOUNDED_REPAIR_MAX_SECONDS:
        raise ValueError("recovery-manifest-duration-invalid")
    if observed_at < issued_at - dt.timedelta(seconds=FLEET_GATE_RECEIPT_FUTURE_SKEW_SECONDS):
        raise ValueError("recovery-manifest-not-yet-valid")
    if observed_at >= expires_at:
        raise ValueError("recovery-manifest-expired")
    if manifest.get("maxConcurrent") != 1:
        raise ValueError("recovery-manifest-max-concurrent-not-one")
    if manifest.get("newIssueIntakeAllowed") is not False:
        raise ValueError("recovery-manifest-new-intake-not-false")
    if manifest.get("pushAllowed") is not False:
        raise ValueError("recovery-manifest-push-not-false")

    issue = manifest.get("issueIdentifier")
    issue_id = manifest.get("issueId")
    label = manifest.get("requiredLabel")
    if not isinstance(issue, str) or not re.fullmatch(r"JOV-[1-9][0-9]*", issue):
        raise ValueError("recovery-manifest-issue-invalid")
    if not isinstance(issue_id, str) or not re.fullmatch(
        r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", issue_id
    ):
        raise ValueError("recovery-manifest-issue-id-invalid")
    if (
        not isinstance(label, str)
        or not re.fullmatch(r"symphony-recovery-[a-z0-9-]+", label)
        or issue.lower() not in label
    ):
        raise ValueError("recovery-manifest-label-invalid")

    admission_field = manifest.get("admissionField")
    activity = manifest.get("activity")
    if admission_field not in BOUNDED_REPAIR_ADMISSION_FIELDS:
        raise ValueError("recovery-manifest-admission-field-invalid")
    admission = fleet_payload.get(admission_field)
    activities = admission.get("activities") if isinstance(admission, dict) else None
    if (
        not isinstance(admission, dict)
        or admission.get("allowed") is not True
        or admission.get("localAllowed") is not True
        or activity != "isolated-pr-repair"
        or not isinstance(activities, list)
        or activity not in activities
    ):
        raise ValueError("fleet-local-repair-not-admitted")
    concurrency = fleet_payload.get("concurrency")
    gem = concurrency.get("gem") if isinstance(concurrency, dict) else None
    if (
        not isinstance(gem, dict)
        or isinstance(gem.get("runtimeFloor"), bool)
        or gem.get("runtimeFloor") != 1
    ):
        raise ValueError("fleet-runtime-floor-missing")
    if pathlib.Path(str(manifest.get("fleetGatePath"))).resolve() != fleet_path.resolve():
        raise ValueError("recovery-manifest-fleet-path-mismatch")

    source_root_raw = manifest.get("sourceRoot")
    source_commit = manifest.get("sourceCommit")
    if not isinstance(source_root_raw, str) or not pathlib.Path(source_root_raw).is_absolute():
        raise ValueError("recovery-manifest-source-root-invalid")
    if not isinstance(source_commit, str) or not re.fullmatch(r"[0-9a-f]{40}", source_commit):
        raise ValueError("recovery-manifest-source-commit-invalid")
    source_root = pathlib.Path(source_root_raw)
    try:
        actual_commit = subprocess.run(
            ["git", "-C", str(source_root), "rev-parse", "HEAD"],
            capture_output=True, text=True, check=True, timeout=5,
        ).stdout.strip()
    except subprocess.SubprocessError as exc:
        raise ValueError("recovery-manifest-source-unverifiable") from exc
    if actual_commit != source_commit:
        raise ValueError("recovery-manifest-source-commit-mismatch")

    artifacts = manifest.get("artifacts")
    runtime_path = _bounded_repair_artifact(artifacts, "runtime")
    workflow_path = _bounded_repair_artifact(artifacts, "workflow")
    router_path = _bounded_repair_artifact(artifacts, "router")
    _bounded_repair_artifact(artifacts, "binary")
    account_path = _bounded_repair_artifact(artifacts, "accountEnv", private=True)
    if runtime_path.resolve() != pathlib.Path(__file__).resolve():
        raise ValueError("recovery-manifest-runtime-path-mismatch")
    account_home = manifest.get("accountHome")
    if not isinstance(account_home, str) or _dotenv_values(account_path).get("CODEX_HOME") != account_home:
        raise ValueError("recovery-manifest-account-home-mismatch")
    if os.environ.get("CODEX_HOME") != account_home:
        raise ValueError("recovery-process-account-home-mismatch")

    workflow = parse_workflow(workflow_path)
    if workflow.required_labels != (label,):
        raise ValueError("recovery-workflow-required-label-mismatch")
    if workflow.max_concurrent_agents != 1:
        raise ValueError("recovery-workflow-max-concurrent-not-one")
    if workflow.max_turns != 1:
        raise ValueError("recovery-workflow-max-turns-not-one")
    if workflow.thread_sandbox != "read-only":
        raise ValueError("recovery-workflow-thread-sandbox-not-read-only")
    if workflow.turn_sandbox_type != "readOnly":
        raise ValueError("recovery-workflow-turn-sandbox-not-read-only")
    if workflow.network_access is not False:
        raise ValueError("recovery-workflow-network-not-false")
    workspace_raw = manifest.get("workspaceRoot")
    if not isinstance(workspace_raw, str) or not pathlib.Path(workspace_raw).is_absolute():
        raise ValueError("recovery-manifest-workspace-root-invalid")
    workspace_root = pathlib.Path(workspace_raw)
    if pathlib.Path(workflow.workspace_root) != workspace_root:
        raise ValueError("recovery-workflow-workspace-root-mismatch")
    expected_agent_command = (
        f"{runtime_path} recovery-agent --manifest {manifest_path} -- "
        f"{router_path} app-server"
    )
    if workflow.codex_command != expected_agent_command:
        raise ValueError("recovery-workflow-router-mismatch")

    command = manifest.get("schedulerCommand")
    if not isinstance(command, list) or not command or not all(isinstance(item, str) for item in command):
        raise ValueError("recovery-manifest-command-invalid")
    if expected_command is not None and command != expected_command:
        raise ValueError("recovery-manifest-command-mismatch")
    binary_path = str(_bounded_repair_artifact(artifacts, "binary"))
    if command[0] != binary_path or str(workflow_path) not in command:
        raise ValueError("recovery-manifest-command-artifact-mismatch")
    claim_raw = manifest.get("claimPath")
    if not isinstance(claim_raw, str) or not pathlib.Path(claim_raw).is_absolute():
        raise ValueError("recovery-manifest-claim-path-invalid")
    claim_path = pathlib.Path(claim_raw)
    if claim_path.parent.resolve() != manifest_path.parent.resolve():
        raise ValueError("recovery-manifest-claim-parent-mismatch")
    if require_unclaimed and claim_path.exists():
        raise ValueError("recovery-manifest-already-claimed")
    return BoundedRepairAdmission(
        manifest_path=manifest_path,
        claim_path=claim_path,
        issue_identifier=issue,
        issue_id=issue_id,
        required_label=label,
        workspace_root=workspace_root,
        router_path=router_path,
        expires_at=expires_at,
        scheduler_command=tuple(command),
    )


def claim_bounded_repair(admission: BoundedRepairAdmission) -> None:
    payload = {
        "schema": "symphony-bounded-repair-claim/v1",
        "issueIdentifier": admission.issue_identifier,
        "issueId": admission.issue_id,
        "workspace": str(admission.workspace_root / admission.issue_identifier),
        "manifestPath": str(admission.manifest_path),
        "claimedAt": _iso(_now()),
    }
    try:
        descriptor = os.open(
            admission.claim_path,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL,
            0o600,
        )
    except FileExistsError as exc:
        raise ValueError("recovery-manifest-already-claimed") from exc
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        directory = os.open(admission.claim_path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    except BaseException:
        try:
            admission.claim_path.unlink()
        except OSError:
            pass
        raise


def run_bounded_repair_agent(
    manifest_path: pathlib.Path, command: list[str]
) -> int:
    """Claim and exec the sole issue agent from its exact Symphony workspace."""
    try:
        _require_private_regular_file(manifest_path, field="recovery-manifest")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        fleet_path = pathlib.Path(str(manifest.get("fleetGatePath")))
        verdict = read_closure_stop_line(
            fleet_path, recovery_manifest_path=manifest_path
        )
        if verdict["hold"]:
            raise ValueError(str(verdict["reason"]))
        fleet_payload = json.loads(fleet_path.read_text(encoding="utf-8"))
        admission = validate_bounded_repair_admission(
            manifest_path,
            fleet_path=fleet_path,
            fleet_payload=fleet_payload,
            require_unclaimed=True,
        )
        expected_workspace = (
            admission.workspace_root / admission.issue_identifier
        ).resolve()
        if pathlib.Path.cwd().resolve() != expected_workspace:
            raise ValueError("recovery-agent-workspace-mismatch")
        expected_command = [str(admission.router_path), "app-server"]
        if command != expected_command:
            raise ValueError("recovery-agent-command-mismatch")
        claim_bounded_repair(admission)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(
            json.dumps(
                {"kind": "bounded_repair_agent_refused", "reason": str(exc)},
                sort_keys=True,
            ),
            flush=True,
        )
        return CLOSURE_HOLD_EXIT_CODE
    sanitized = dict(os.environ)
    for name in (
        "GITHUB_TOKEN",
        "GH_TOKEN",
        "LINEAR_API_KEY",
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "XAI_API_KEY",
    ):
        sanitized.pop(name, None)
    sanitized["SYMPHONY_RECOVERY_ISSUE_IDENTIFIER"] = admission.issue_identifier
    sanitized["SYMPHONY_RECOVERY_ISSUE_ID"] = admission.issue_id
    os.execve(command[0], command, sanitized)
    raise AssertionError("execve returned")


def read_closure_stop_line(
    path: pathlib.Path,
    now: dt.datetime | None = None,
    *,
    max_age_seconds: int = FLEET_GATE_RECEIPT_MAX_AGE_SECONDS,
    recovery_manifest_path: pathlib.Path | None = None,
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
    if recovery_manifest_path is not None:
        try:
            admission = validate_bounded_repair_admission(
                recovery_manifest_path,
                fleet_path=path,
                fleet_payload=payload,
                now=observed_at,
            )
        except ValueError as exc:
            return hold(f"bounded-repair-refused:{exc}", **details)
        return {
            "hold": False,
            "reason": "bounded-local-repair",
            "path": str(path),
            "issueIdentifier": admission.issue_identifier,
            "requiredLabel": admission.required_label,
            "expiresAt": _iso(admission.expires_at),
            **details,
        }
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


def _sleep_closure_hold(
    verdict: dict[str, Any],
    seconds: int,
    shutdown: threading.Event | None = None,
) -> int:
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
    if shutdown is None:
        time.sleep(seconds)
        return seconds
    interrupted = shutdown.wait(seconds)
    return 0 if interrupted else seconds


def _closure_hold_wait(
    stop_line: ClosureStopLine,
    verdict: dict[str, Any],
    *,
    max_sleep_seconds: int | None,
    sleep_used: int,
    shutdown: threading.Event | None = None,
) -> tuple[int, dict[str, Any]]:
    """Hold new admission in bounded chunks, re-reading the fleet receipt.

    The fleet gate is regenerated every minute on Gem, so the hold re-reads the
    receipt after every bounded chunk and releases as soon as closure health
    returns to healthy. Every hold decision rewrites the durable hold receipt.
    """
    while verdict["hold"] and not (shutdown is not None and shutdown.is_set()):
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
        sleep_used += _sleep_closure_hold(verdict, chunk, shutdown)
        if shutdown is not None and shutdown.is_set():
            break
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
    shutdown: threading.Event | None = None,
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
            stop_line,
            verdict,
            max_sleep_seconds=max_gate_sleep_seconds,
            sleep_used=0,
            shutdown=shutdown,
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
    max_gate_sleep_seconds: int | None,
) -> int:
    recovery_deadline: float | None = None
    if closure.recovery_manifest_path is not None:
        verdict = read_closure_stop_line(
            closure.receipt_path,
            max_age_seconds=closure.max_receipt_age_seconds,
            recovery_manifest_path=closure.recovery_manifest_path,
        )
        if verdict["hold"]:
            raise ValueError(str(verdict["reason"]))
        expires_at = _parse_utc_timestamp(verdict.get("expiresAt"), field="expiresAt")
        recovery_deadline = time.monotonic() + max(
            0.0, (expires_at - _now()).total_seconds()
        )
    raw_shutdown_grace = os.environ.get(
        "SYMPHONY_SHUTDOWN_GRACE_SECONDS",
        str(DEFAULT_SHUTDOWN_GRACE_SECONDS),
    )
    try:
        shutdown_grace = float(raw_shutdown_grace)
    except (TypeError, ValueError) as exc:
        raise ValueError("SYMPHONY_SHUTDOWN_GRACE_SECONDS must be finite and positive") from exc
    if not math.isfinite(shutdown_grace) or shutdown_grace <= 0:
        raise ValueError("SYMPHONY_SHUTDOWN_GRACE_SECONDS must be finite and positive")
    shutdown_grace = min(MAX_SHUTDOWN_GRACE_SECONDS, shutdown_grace)
    if sys.platform.startswith("linux"):
        try:
            libc = ctypes.CDLL(None, use_errno=True)
            if libc.prctl(36, 1, 0, 0, 0) != 0:
                error_number = ctypes.get_errno()
                raise OSError(error_number, os.strerror(error_number))
        except AttributeError as exc:
            raise RuntimeError("Linux child-subreaper support is unavailable") from exc
    pidfd_reserve: list[int] = []
    if sys.platform.startswith("linux"):
        try:
            for _ in range(8):
                pidfd_reserve.append(os.open("/dev/null", os.O_RDONLY))
        except OSError:
            for descriptor in pidfd_reserve:
                os.close(descriptor)
            pidfd_reserve = []
    try:
        launch_read, launch_write = os.pipe()
    except BaseException:
        for descriptor in pidfd_reserve:
            os.close(descriptor)
        raise
    launcher = [
        sys.executable,
        "-c",
        (
            "import os,sys; fd=int(sys.argv[1]); ready=os.read(fd,1); "
            "os.close(fd); "
            "ready == b'1' or sys.exit(125); "
            "os.execvp(sys.argv[2], sys.argv[2:])"
        ),
        str(launch_read),
        *command,
    ]
    try:
        process = subprocess.Popen(
            launcher,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            errors="replace",
            bufsize=1,
            start_new_session=True,
            pass_fds=(launch_read,),
        )
    except BaseException:
        os.close(launch_read)
        os.close(launch_write)
        for descriptor in pidfd_reserve:
            os.close(descriptor)
        raise
    os.close(launch_read)
    previous_handlers: dict[signal.Signals, Any] = {}
    shutdown = threading.Event()
    nonlinux_descendants: set[int] = set()
    termination_complete = False
    shutdown_signum = 0
    pidfds: dict[int, int] = {}

    def remember(pid: int) -> bool:
        if pid in pidfds:
            return True
        if not hasattr(os, "pidfd_open"):
            if sys.platform.startswith("linux"):
                raise RuntimeError("Linux pidfd support is required")
            return True
        while True:
            try:
                pidfds[pid] = os.pidfd_open(pid)
                break
            except ProcessLookupError:
                return False
            except OSError as exc:
                if exc.errno in (errno.EMFILE, errno.ENFILE) and pidfd_reserve:
                    os.close(pidfd_reserve.pop())
                    continue
                raise RuntimeError(f"cannot pin process identity for pid {pid}") from exc
        return True

    def send_pinned(descriptor: int, signum: int) -> None:
        try:
            if sys.platform.startswith("linux"):
                if not hasattr(signal, "pidfd_send_signal"):
                    raise RuntimeError("Linux process signaling requires pidfd")
                signal.pidfd_send_signal(descriptor, signum)
            else:
                raise RuntimeError("send_pinned is Linux-only")
        except ProcessLookupError:
            pass

    def signal_identity(pid: int, signum: int) -> bool:
        """Pin, signal, and release one non-root identity at a time.

        Releasing each descendant pidfd immediately lets one reserved slot
        contain an arbitrarily wide tree even when the process is already at
        its descriptor limit. Numeric PIDs are never used for Linux signals.
        """
        if not sys.platform.startswith("linux"):
            try:
                os.kill(pid, signum)
            except ProcessLookupError:
                return False
            return True
        if pid == process.pid and pid in pidfds:
            send_pinned(pidfds[pid], signum)
            return True
        if not remember(pid):
            return False
        descriptor = pidfds.pop(pid)
        try:
            send_pinned(descriptor, signum)
        finally:
            os.close(descriptor)
        return True

    def root_target() -> list[int]:
        # Once Popen has observed the root exit, only a pidfd can safely refer
        # to that numeric PID; without one it may already have been recycled.
        if process.pid in pidfds or process.poll() is None:
            return [process.pid]
        return []

    def close_pidfds() -> None:
        for descriptor in pidfds.values():
            try:
                os.close(descriptor)
            except OSError:
                pass
        pidfds.clear()
        while pidfd_reserve:
            try:
                os.close(pidfd_reserve.pop())
            except OSError:
                pass

    def descendant_pids() -> list[int]:
        try:
            if pathlib.Path("/proc").is_dir():
                pairs = []
                for entry in pathlib.Path("/proc").iterdir():
                    if not entry.name.isdigit():
                        continue
                    try:
                        fields = (entry / "stat").read_text().rsplit(")", 1)[1].split()
                        pairs.append((int(entry.name), int(fields[1])))
                    except (OSError, IndexError, ValueError):
                        continue
            else:
                rows = subprocess.run(
                    ["ps", "-axo", "pid=,ppid="], capture_output=True,
                    text=True, check=True, timeout=2,
                ).stdout.splitlines()
                pairs = [tuple(int(value) for value in row.split()) for row in rows]
        except (OSError, IndexError, ValueError, subprocess.SubprocessError):
            return []
        children: dict[int, list[int]] = {}
        for pid, parent in pairs:
            children.setdefault(parent, []).append(pid)
        found: list[int] = []
        visited: set[int] = set()
        # Linux subreaping reparents late-forking orphans to this wrapper. Walk
        # both the launched root and the wrapper so those adopted descendants
        # remain inside the shutdown boundary.
        pending = [process.pid]
        if sys.platform.startswith("linux"):
            pending.append(os.getpid())
        while pending:
            parent = pending.pop()
            for child in children.get(parent, []):
                if child in visited:
                    continue
                visited.add(child)
                pending.append(child)
                if child != process.pid:
                    found.append(child)
        return found

    def signal_tree(signum: int) -> None:
        roots = root_target()
        targets = descendant_pids()
        if not sys.platform.startswith("linux"):
            nonlinux_descendants.update(targets)
            targets = list(nonlinux_descendants)
        # Existing detached descendants must be signaled before a non-Linux
        # root can exit and orphan them outside our observable process tree.
        # Linux subreaping still catches anything forked by the root's handler
        # in the grace-period rescans below.
        for pid in [*reversed(targets), *roots]:
            if signal_identity(pid, signal.SIGCONT):
                signal_identity(pid, signum)

    def reap_descendants(pids: list[int]) -> None:
        if not sys.platform.startswith("linux"):
            return
        for pid in pids:
            try:
                os.waitpid(pid, os.WNOHANG)
            except ChildProcessError:
                pass

    def terminate_tree() -> None:
        nonlocal termination_complete
        if termination_complete:
            return
        signal_tree(signal.SIGTERM)
        deadline = time.monotonic() + shutdown_grace
        while time.monotonic() < deadline:
            process.poll()
            descendants = descendant_pids()
            for pid in descendants:
                signal_identity(pid, signal.SIGTERM)
            reap_descendants(descendants)
            descendants = descendant_pids()
            root_descriptor = pidfds.get(process.pid)
            root_alive = bool(
                root_descriptor is not None
                and not select.select([root_descriptor], [], [], 0)[0]
            )
            if not root_alive and not descendants:
                break
            time.sleep(0.02)
        signal_tree(signal.SIGKILL)
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        if sys.platform.startswith("linux"):
            reap_deadline = time.monotonic() + 1.0
            while time.monotonic() < reap_deadline:
                descendants = descendant_pids()
                for pid in descendants:
                    signal_identity(pid, signal.SIGKILL)
                while True:
                    try:
                        reaped, _status = os.waitpid(-1, os.WNOHANG)
                    except ChildProcessError:
                        reaped = 0
                        break
                    if reaped <= 0:
                        break
                if not descendant_pids():
                    break
                time.sleep(0.01)
        close_pidfds()
        termination_complete = True

    def forward_signal(signum: int, _frame: Any) -> None:
        """Request complete child-tree termination from the main loop.

        Python delivers handlers on the main thread.  Calling terminate_tree()
        here can re-enter subprocess.Popen while an interrupted poll() still
        owns its private waitpid lock, permanently deadlocking shutdown.
        """
        nonlocal shutdown_signum
        shutdown_signum = signum
        shutdown.set()

    # Pin the launched root before any wait/reap can make its numeric PID
    # available for reuse.
    try:
        for forwarded in (signal.SIGTERM, signal.SIGINT):
            previous_handlers[forwarded] = signal.getsignal(forwarded)
            signal.signal(forwarded, forward_signal)
        if not remember(process.pid) or (
            sys.platform.startswith("linux") and
            not hasattr(signal, "pidfd_send_signal")
        ):
            raise RuntimeError("Linux root pidfd support is required")
        os.write(launch_write, b"1")
    except BaseException:
        try:
            if process.pid in pidfds:
                terminate_tree()
            else:
                process.terminate()
                try:
                    process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
        finally:
            if process.stdout is not None:
                process.stdout.close()
            close_pidfds()
            for forwarded, previous in previous_handlers.items():
                signal.signal(forwarded, previous)
        raise
    finally:
        os.close(launch_write)
    output_lines: queue.Queue[tuple[bool, str]] = queue.Queue(
        maxsize=RUNTIME_OUTPUT_QUEUE_MAX_LINES
    )

    def read_output() -> None:
        try:
            assert process.stdout is not None
            for output_line in process.stdout:
                output_lines.put((False, output_line))
        finally:
            output_lines.put((True, ""))

    output_reader = threading.Thread(target=read_output, daemon=True)
    output_reader.start()

    rate_limited = False
    issue_errors: dict[str, dict[str, Any]] = {}
    dead_letter_noted: set[str] = set()
    last_closure_check = 0.0
    try:
        while True:
            # A detached descendant can keep stdout continuously readable after
            # the scheduler exits, so root completion cannot depend on an empty
            # output queue. terminate_tree() kills the holder, then the bounded
            # queue drains through its EOF sentinel.
            if shutdown.is_set() or process.poll() is not None:
                terminate_tree()
            monotonic_now = time.monotonic()
            if recovery_deadline is not None and monotonic_now >= recovery_deadline:
                print(
                    json.dumps(
                        {"kind": "bounded_repair_expired", "action": "terminate-tree"},
                        sort_keys=True,
                    ),
                    flush=True,
                )
                shutdown.set()
                terminate_tree()
            if monotonic_now - last_closure_check >= CLOSURE_HOLD_RECHECK_SECONDS:
                last_closure_check = monotonic_now
                verdict = read_closure_stop_line(
                    closure.receipt_path,
                    max_age_seconds=closure.max_receipt_age_seconds,
                    recovery_manifest_path=closure.recovery_manifest_path,
                )
                if verdict["hold"]:
                    if closure.recovery_manifest_path is not None:
                        print(
                            json.dumps(
                                {
                                    "kind": "bounded_repair_revoked",
                                    "reason": verdict.get("reason"),
                                },
                                sort_keys=True,
                            ),
                            flush=True,
                        )
                        shutdown.set()
                        terminate_tree()
                    else:
                        _pause_child_for_closure_hold(
                            process, closure, verdict, max_gate_sleep_seconds, shutdown
                        )
            try:
                eof, line = output_lines.get(timeout=0.1)
            except queue.Empty:
                if shutdown.is_set() or process.poll() is not None:
                    terminate_tree()
                continue
            if eof:
                break
            print(line, end="", flush=True)
            classification = classify_linear_log_line(line)
            if classification and write_rate_limit_gate(gate_file, classification):
                # The official scheduler may be supervising active agents. Record the
                # reset gate and suspend only the scheduler process; do not
                # terminate the process tree that may contain active Codex jobs.
                rate_limited = True
                gate = read_rate_limit_gate(gate_file)
                _pause_child_for_gate(
                    process, gate, max_gate_sleep_seconds, shutdown
                )
            else:
                issue_error = classify_linear_issue_error_log_line(line)
                if issue_error is not None:
                    record_linear_issue_error(
                        closure.dead_letter_dir,
                        issue_error,
                        issue_errors,
                        dead_letter_noted,
                    )
            if process.poll() is not None:
                terminate_tree()
        output_reader.join()
        returncode = process.wait()
        terminate_tree()
    finally:
        if shutdown.is_set() and process.poll() is None:
            terminate_tree()
        if process.stdout is not None:
            process.stdout.close()
        close_pidfds()
        for forwarded, previous in previous_handlers.items():
            signal.signal(forwarded, previous)
    if shutdown_signum:
        return 0
    return RATE_LIMIT_EXIT_CODE if rate_limited else returncode


def run_official_binary(
    command: list[str],
    *,
    gate_file: pathlib.Path,
    closure: ClosureStopLine,
    max_gate_sleep_seconds: int | None = DEFAULT_MAX_GATE_SLEEP_SECONDS,
) -> int:
    if not command:
        raise ValueError("missing official Symphony command after --")
    gate_sleep_used = 0
    closure_sleep_used = 0
    while True:
        verdict = read_closure_stop_line(
            closure.receipt_path,
            max_age_seconds=closure.max_receipt_age_seconds,
            recovery_manifest_path=closure.recovery_manifest_path,
        )
        if verdict["hold"]:
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
        if closure.recovery_manifest_path is not None:
            try:
                fleet_payload = json.loads(
                    closure.receipt_path.read_text(encoding="utf-8")
                )
                validate_bounded_repair_admission(
                    closure.recovery_manifest_path,
                    fleet_path=closure.receipt_path,
                    fleet_payload=fleet_payload,
                    expected_command=command,
                    require_unclaimed=True,
                )
            except (OSError, json.JSONDecodeError, ValueError) as exc:
                print(
                    json.dumps(
                        {
                            "kind": "bounded_repair_refused",
                            "reason": str(exc),
                        },
                        sort_keys=True,
                    ),
                    flush=True,
                )
                return CLOSURE_HOLD_EXIT_CODE
        returncode = run_official_binary_once(
            command,
            gate_file=gate_file,
            closure=closure,
            max_gate_sleep_seconds=max_gate_sleep_seconds,
        )
        if returncode != RATE_LIMIT_EXIT_CODE:
            return returncode
        if closure.recovery_manifest_path is not None:
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
    run_parser.add_argument(
        "--recovery-manifest",
        type=pathlib.Path,
        help="host-owned single-use bounded local-repair admission",
    )
    run_parser.add_argument("binary_command", nargs=argparse.REMAINDER)

    recovery_agent_parser = sub.add_parser("recovery-agent")
    recovery_agent_parser.add_argument("--manifest", type=pathlib.Path, required=True)
    recovery_agent_parser.add_argument("agent_command", nargs=argparse.REMAINDER)

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
                recovery_manifest_path=args.recovery_manifest,
            ),
            max_gate_sleep_seconds=args.max_gate_sleep_seconds,
        )

    if args.command == "recovery-agent":
        command = args.agent_command
        if command and command[0] == "--":
            command = command[1:]
        return run_bounded_repair_agent(args.manifest, command)

    raise AssertionError(f"unhandled command {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())
