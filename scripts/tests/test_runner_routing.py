"""Regression tests for durable runner-health routing state."""

from __future__ import annotations

import os
import stat
import subprocess
import textwrap
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

_REPO_ROOT = Path(__file__).resolve().parents[2]
_SCRIPT = _REPO_ROOT / ".github" / "scripts" / "update-runner-routing.sh"
_QUERY_SCRIPT = _REPO_ROOT / ".github" / "scripts" / "query-runner-heartbeat.sh"


def _fake_gh(tmp_path: Path) -> Path:
    fake = tmp_path / "gh"
    fake.write_text(
        textwrap.dedent(
            """\
            #!/usr/bin/env bash
            set -euo pipefail
            state="${FAKE_GH_STATE:?}"
            endpoint=""
            method=GET
            name=""
            value=""
            jq_filter=""
            while [[ $# -gt 0 ]]; do
              case "$1" in
                api) shift ;;
                -X) method="$2"; shift 2 ;;
                -f)
                  case "$2" in
                    name=*) name="${2#name=}" ;;
                    value=*) value="${2#value=}" ;;
                  esac
                  shift 2
                  ;;
                --jq) jq_filter="$2"; shift 2 ;;
                *) [[ -z "$endpoint" ]] && endpoint="$1"; shift ;;
              esac
            done
            key="${endpoint##*/}"
            if [[ "$endpoint" == */actions/variables && "$method" == POST ]]; then
              key="$name"
            fi
            if [[ "$method" == GET ]]; then
              if ! entry=$(awk -F= -v key="$key" '$1 == key {sub(/^[^=]*=/, ""); print; found=1} END {if (!found) exit 1}' "$state"); then
                echo "gh: Variable not found (HTTP 404)" >&2
                exit 1
              fi
              [[ "$jq_filter" == .value ]] && printf '%s\n' "$entry" || printf '{"value":"%s"}\n' "$entry"
              exit 0
            fi
            if [[ "${FAKE_GH_FAIL_PATCH:-}" == "$name" && "$method" == PATCH ]]; then
              echo "gh: Resource not accessible by integration (HTTP 403)" >&2
              exit 1
            fi
            tmp="${state}.tmp"
            awk -F= -v key="$name" '$1 != key' "$state" > "$tmp"
            printf '%s=%s\n' "$name" "$value" >> "$tmp"
            mv "$tmp" "$state"
            """
        ),
        encoding="utf-8",
    )
    fake.chmod(fake.stat().st_mode | stat.S_IXUSR)
    return fake


def _run(
    tmp_path: Path,
    health: str,
    *,
    runner_temp: Optional[Path] = None,
    extra_env: Optional[dict[str, str]] = None,
) -> subprocess.CompletedProcess[str]:
    if runner_temp is None:
        runner_temp = tmp_path / "runner-temp"
    runner_temp.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env.update(
        {
            "PATH": f"{tmp_path}:{env['PATH']}",
            "FAKE_GH_STATE": str(tmp_path / "state"),
            "GH_REPO": "JovieInc/Jovie",
            "RUNNER_HEALTH": health,
            "RUNNER_TEMP": str(runner_temp),
        }
    )
    if extra_env:
        env.update(extra_env)
    return subprocess.run(
        ["bash", str(_SCRIPT)],
        cwd=_REPO_ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )


def _state(tmp_path: Path) -> dict[str, str]:
    return dict(
        line.split("=", 1)
        for line in (tmp_path / "state").read_text(encoding="utf-8").splitlines()
    )


def test_recovery_debounce_survives_distinct_runner_filesystems(tmp_path: Path) -> None:
    _fake_gh(tmp_path)
    (tmp_path / "state").write_text("CI_FAST_RUNNER=ubuntu-latest\n", encoding="utf-8")

    first_temp = tmp_path / "first-runner-temp"
    second_temp = tmp_path / "second-runner-temp"
    first = _run(tmp_path, "up", runner_temp=first_temp)
    assert first.returncode == 0, first.stderr
    assert _state(tmp_path) == {
        "CI_FAST_RUNNER": "ubuntu-latest",
        "CI_FAST_RUNNER_HEALTH_STATE": "up:1",
    }

    # The second observation runs on a separate hosted VM filesystem. Only the
    # repository variable is shared across ticks.
    second = _run(tmp_path, "up", runner_temp=second_temp)
    assert second.returncode == 0, second.stderr
    assert _state(tmp_path) == {
        "CI_FAST_RUNNER": "jovie-runner",
        "CI_FAST_RUNNER_HEALTH_STATE": "up:0",
    }
    assert first_temp != second_temp
    assert list(first_temp.iterdir()) == []
    assert list(second_temp.iterdir()) == []


def test_opposite_observation_resets_consecutive_count(tmp_path: Path) -> None:
    _fake_gh(tmp_path)
    (tmp_path / "state").write_text(
        "CI_FAST_RUNNER=jovie-runner\nCI_FAST_RUNNER_HEALTH_STATE=down:1\n",
        encoding="utf-8",
    )

    up = _run(tmp_path, "up")
    assert up.returncode == 0, up.stderr
    assert _state(tmp_path)["CI_FAST_RUNNER_HEALTH_STATE"] == "up:0"

    down = _run(tmp_path, "down")
    assert down.returncode == 0, down.stderr
    assert _state(tmp_path)["CI_FAST_RUNNER_HEALTH_STATE"] == "down:1"


def _run_heartbeat_query(
    tmp_path: Path, latest: str, *, api_error: Optional[str] = None
) -> tuple[subprocess.CompletedProcess[str], str]:
    fake = tmp_path / "gh"
    fake.write_text(
        (
            f"#!/usr/bin/env bash\necho '{api_error}' >&2\nexit 1\n"
            if api_error
            else f"#!/usr/bin/env bash\nprintf '%s\\n' '{latest}'\n"
        ),
        encoding="utf-8",
    )
    fake.chmod(fake.stat().st_mode | stat.S_IXUSR)
    output = tmp_path / "output"
    env = os.environ.copy()
    env.update(
        {
            "PATH": f"{tmp_path}:{env['PATH']}",
            "GH_REPO": "JovieInc/Jovie",
            "GITHUB_OUTPUT": str(output),
        }
    )

    result = subprocess.run(
        ["bash", str(_QUERY_SCRIPT)],
        cwd=_REPO_ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )
    return result, output.read_text(encoding="utf-8") if output.exists() else ""


def test_fresh_successful_heartbeat_is_up(tmp_path: Path) -> None:
    created_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    result, output = _run_heartbeat_query(
        tmp_path,
        f"completed\tsuccess\t{created_at}\thttps://example.test/run",
    )

    assert result.returncode == 0, result.stderr
    assert "health=up" in output


def test_no_heartbeat_run_is_down_without_parse_noise(tmp_path: Path) -> None:
    result, output = _run_heartbeat_query(tmp_path, "\t\t\t")

    assert result.returncode == 0, result.stderr
    assert "health=down" in output
    assert "no runner heartbeat run exists" in output


def test_stale_successful_heartbeat_is_down(tmp_path: Path) -> None:
    created_at = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat().replace(
        "+00:00", "Z"
    )
    result, output = _run_heartbeat_query(
        tmp_path,
        f"completed\tsuccess\t{created_at}\thttps://example.test/stale",
    )

    assert result.returncode == 0, result.stderr
    assert "health=down" in output
    assert "stale" in output


def test_queued_heartbeat_is_down_for_routing_debounce(tmp_path: Path) -> None:
    created_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    result, output = _run_heartbeat_query(
        tmp_path,
        f"queued\t\t{created_at}\thttps://example.test/queued",
    )

    assert result.returncode == 0, result.stderr
    assert "health=down" in output
    assert "status=queued" in output


def test_heartbeat_api_auth_failure_is_not_reported_as_runner_down(tmp_path: Path) -> None:
    result, output = _run_heartbeat_query(
        tmp_path,
        "",
        api_error="HTTP 403: Resource not accessible by integration",
    )

    assert result.returncode == 3
    assert "credential/permission error (HTTP 401/403)" in result.stderr
    assert "routing was not changed" in result.stderr
    assert "health=down" not in output


def test_routing_api_403_is_not_misclassified_as_missing_state(tmp_path: Path) -> None:
    fake = tmp_path / "gh"
    fake.write_text(
        textwrap.dedent(
            """\
            #!/usr/bin/env bash
            set -euo pipefail
            endpoint=""
            while [[ $# -gt 0 ]]; do
              case "$1" in
                api) shift ;;
                --jq) shift 2 ;;
                *) [[ -z "$endpoint" ]] && endpoint="$1"; shift ;;
              esac
            done
            if [[ "$endpoint" == */actions/variables/CI_FAST_RUNNER ]]; then
              echo ubuntu-latest
              exit 0
            fi
            echo 'gh: Resource not accessible by integration (HTTP 403)' >&2
            exit 1
            """
        ),
        encoding="utf-8",
    )
    fake.chmod(fake.stat().st_mode | stat.S_IXUSR)

    result = _run(tmp_path, "up")

    assert result.returncode == 3
    assert "credential/permission failure" in result.stderr
    assert "HTTP 401/403" in result.stderr
    assert "routing target was not changed" in result.stderr
    assert "CI_FAST_RUNNER_HEALTH_STATE" in result.stderr


def test_target_mutation_403_fails_closed_and_retries_next_tick(tmp_path: Path) -> None:
    _fake_gh(tmp_path)
    (tmp_path / "state").write_text(
        "CI_FAST_RUNNER=ubuntu-latest\nCI_FAST_RUNNER_HEALTH_STATE=up:1\n",
        encoding="utf-8",
    )

    failed = _run(
        tmp_path,
        "up",
        extra_env={"FAKE_GH_FAIL_PATCH": "CI_FAST_RUNNER"},
    )

    assert failed.returncode == 3
    assert "credential/permission failure" in failed.stderr
    assert "updating repository variable 'CI_FAST_RUNNER'" in failed.stderr
    assert "persisted debounce state will make the next tick retry" in failed.stderr
    assert _state(tmp_path) == {
        "CI_FAST_RUNNER": "ubuntu-latest",
        "CI_FAST_RUNNER_HEALTH_STATE": "up:2",
    }

    retried = _run(tmp_path, "up")
    assert retried.returncode == 0, retried.stderr
    assert _state(tmp_path) == {
        "CI_FAST_RUNNER": "jovie-runner",
        "CI_FAST_RUNNER_HEALTH_STATE": "up:0",
    }


def _agent_runner_health_block() -> str:
    workflow = (_REPO_ROOT / ".github/workflows/agent-tick.yml").read_text(
        encoding="utf-8"
    )
    return workflow.split("  runner-health:\n", 1)[1].split(
        "  # JOB: synthetic-monitoring", 1
    )[0]


def test_health_workflows_are_independent_and_serialized() -> None:
    agent_runner_health = _agent_runner_health_block()
    standalone = (
        _REPO_ROOT / ".github/workflows/runner-health-monitor.yml"
    ).read_text(encoding="utf-8")
    heartbeat = (_REPO_ROOT / ".github/workflows/runner-heartbeat.yml").read_text(
        encoding="utf-8"
    )

    for observer in (agent_runner_health, standalone):
        assert "runs-on: ubuntu-latest" in observer
        assert "runs-on: ${{ vars.CI_FAST_RUNNER }}" not in observer
        assert "group: runner-health-routing" in observer
        assert "cancel-in-progress: false" in observer
        assert "actions/runners" not in observer
        assert "runner.temp" not in observer
        assert ".github/scripts/query-runner-heartbeat.sh" in observer
        assert ".github/scripts/update-runner-routing.sh" in observer

    assert "runs-on: jovie-runner" in heartbeat
    assert "group: runner-heartbeat" in heartbeat


def test_health_workflows_use_jovie_bot_token_for_api_calls() -> None:
    standalone = (
        _REPO_ROOT / ".github/workflows/runner-health-monitor.yml"
    ).read_text(encoding="utf-8")
    for workflow in (_agent_runner_health_block(), standalone):
        assert "actions/create-github-app-token@" in workflow
        assert "app-id: ${{ vars.JOVIE_BOT_APP_ID }}" in workflow
        assert "private-key: ${{ secrets.JOVIE_BOT_PRIVATE_KEY }}" in workflow
        assert "GH_TOKEN: ${{ steps.app-token.outputs.token }}" in workflow
