"""Regression tests for durable runner-health routing state."""

from __future__ import annotations

import os
import stat
import subprocess
import textwrap
from datetime import datetime, timedelta, timezone
from pathlib import Path

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
              entry=$(awk -F= -v key="$key" '$1 == key {sub(/^[^=]*=/, ""); print; found=1} END {if (!found) exit 1}' "$state")
              [[ "$jq_filter" == .value ]] && printf '%s\n' "$entry" || printf '{"value":"%s"}\n' "$entry"
              exit 0
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


def _run(tmp_path: Path, health: str) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env.update(
        {
            "PATH": f"{tmp_path}:{env['PATH']}",
            "FAKE_GH_STATE": str(tmp_path / "state"),
            "GH_REPO": "JovieInc/Jovie",
            "RUNNER_HEALTH": health,
        }
    )
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

    first = _run(tmp_path, "up")
    assert first.returncode == 0, first.stderr
    assert _state(tmp_path) == {
        "CI_FAST_RUNNER": "ubuntu-latest",
        "CI_FAST_RUNNER_HEALTH_STATE": "up:1",
    }

    # Each invocation is a fresh process; no runner.temp file can carry state.
    second = _run(tmp_path, "up")
    assert second.returncode == 0, second.stderr
    assert _state(tmp_path) == {
        "CI_FAST_RUNNER": "jovie-runner",
        "CI_FAST_RUNNER_HEALTH_STATE": "up:0",
    }


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


def _run_heartbeat_query(tmp_path: Path, latest: str) -> tuple[subprocess.CompletedProcess[str], str]:
    fake = tmp_path / "gh"
    fake.write_text(
        f"#!/usr/bin/env bash\nprintf '%s\\n' '{latest}'\n",
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
    return result, output.read_text(encoding="utf-8")


def test_fresh_successful_heartbeat_is_up(tmp_path: Path) -> None:
    created_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    result, output = _run_heartbeat_query(
        tmp_path,
        f"completed\tsuccess\t{created_at}\thttps://example.test/run",
    )

    assert result.returncode == 0, result.stderr
    assert "health=up" in output


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
