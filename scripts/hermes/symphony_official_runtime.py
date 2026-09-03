#!/usr/bin/env python3
"""Source-owned checks for the official OpenAI Symphony runtime.

This module deliberately stays outside the upstream Symphony binary. Jovie owns
the deployed service unit, workflow shape, request-budget math, and rate-limit
classification artifacts; OpenAI owns the binary itself. The selected Codex
account remains host-owned configuration and is never pinned by this source.
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
OFFICIAL_PROJECT_ID = "440ea404-041f-461e-ae45-dd6a2e98e4a1"
OFFICIAL_PROJECT_SLUG = "symphony-ui-pilot-96d6b9c5b2d5"
OFFICIAL_WORKSPACE_ROOT = "~/symphony-elixir-workspaces"
OFFICIAL_WORKFLOW_TARGET = "%h/.config/symphony/WORKFLOW.md"
OFFICIAL_LOGS_ROOT = "%h/symphony-elixir-logs"
OFFICIAL_MAX_CONCURRENT_AGENTS = 8
MIN_POLL_INTERVAL_MS = 30_000
LINEAR_HOURLY_REQUEST_BUDGET = 2_500
LINEAR_PAGE_SIZE = 50
LINEAR_COUNT_PAGE_SIZE = 100
LINEAR_COUNT_MAX_PAGES = 100
MEASURED_ACTIVE_ISSUES = 110
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
ACTIVE_STATES = ("Todo", "In Progress")
TERMINAL_STATES = ("Done", "Canceled", "Cancelled", "Duplicate", "Closed")
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
query SymphonyLinearEligibleCount($projectId: String!, $first: Int!, $after: String) {
  project(id: $projectId) {
    issues(first: $first, after: $after) {
      nodes {
        state { name }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}
"""


@dataclass(frozen=True)
class WorkflowContract:
    project_slug: str
    api_key: str
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
    project_match = re.search(r'^\s+project_slug:\s*"?([^"\n]+)"?\s*$', front, re.M)
    api_key_match = re.search(r"^\s+api_key:\s*(.+?)\s*$", front, re.M)
    if not project_match:
        raise ValueError("missing tracker.provider.project_slug")
    if not api_key_match:
        raise ValueError("missing tracker.provider.api_key")
    after_create = ""
    if "after_create:" in front:
        after_create = front.split("after_create:", 1)[1].split("\nagent:", 1)[0]
    return WorkflowContract(
        project_slug=project_match.group(1).strip(),
        api_key=api_key_match.group(1).strip(),
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
    project_id: str = OFFICIAL_PROJECT_ID,
    active_states: tuple[str, ...] = ACTIVE_STATES,
    api_url: str = LINEAR_API_URL,
    page_size: int = LINEAR_COUNT_PAGE_SIZE,
) -> int:
    if not active_states:
        return 0
    if page_size <= 0:
        raise ValueError("page_size must be positive")

    active = set(active_states)
    count = 0
    after: str | None = None
    pages = 0
    while True:
        payload = json.dumps(
            {
                "query": LINEAR_ELIGIBLE_COUNT_QUERY,
                "variables": {
                    "projectId": project_id,
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
        project = decoded.get("data", {}).get("project") if isinstance(decoded, dict) else None
        issues = project.get("issues") if isinstance(project, dict) else None
        nodes = issues.get("nodes") if isinstance(issues, dict) else None
        page_info = issues.get("pageInfo") if isinstance(issues, dict) else None
        if not isinstance(nodes, list) or not isinstance(page_info, dict):
            raise RuntimeError("linear_eligible_count_missing_project_issues")
        for node in nodes:
            state = node.get("state") if isinstance(node, dict) else None
            state_name = state.get("name") if isinstance(state, dict) else None
            if state_name in active:
                count += 1
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
    project_id: str = OFFICIAL_PROJECT_ID,
    active_states: tuple[str, ...] = ACTIVE_STATES,
    api_url: str = LINEAR_API_URL,
) -> int:
    override = os.environ.get("SYMPHONY_LINEAR_ACTIVE_ISSUES")
    if override is not None and override.strip():
        return _non_negative_int(override.strip(), name="SYMPHONY_LINEAR_ACTIVE_ISSUES")
    return fetch_linear_eligible_issue_count(
        api_key=_linear_api_key(linear_env_file),
        project_id=project_id,
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
        if workflow.project_slug != OFFICIAL_PROJECT_SLUG:
            errors.append(f"workflow_project_slug:{workflow.project_slug}")
        if workflow.api_key != "$LINEAR_API_KEY":
            errors.append("workflow_api_key_not_env_bound")
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


def run_official_binary_once(
    command: list[str],
    *,
    gate_file: pathlib.Path,
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
    returncode = process.wait()
    return RATE_LIMIT_EXIT_CODE if rate_limited else returncode


def run_official_binary(
    command: list[str],
    *,
    gate_file: pathlib.Path,
    max_gate_sleep_seconds: int | None = DEFAULT_MAX_GATE_SLEEP_SECONDS,
) -> int:
    if not command:
        raise ValueError("missing official Symphony command after --")
    gate_sleep_used = 0
    while True:
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
    count_parser.add_argument("--project-id", default=OFFICIAL_PROJECT_ID)
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
            project_id=args.project_id,
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
            max_gate_sleep_seconds=args.max_gate_sleep_seconds,
        )

    raise AssertionError(f"unhandled command {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())
