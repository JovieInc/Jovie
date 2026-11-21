"""JOV-12620: BLOCKED early-exit + staging breaker before vercel build."""

import json
import os
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEPLOY_SCRIPT = REPO_ROOT / ".github/scripts/vercel-prebuilt-deploy.sh"
PRODUCTION_RELEASE_WORKFLOW = REPO_ROOT / ".github/workflows/production-release.yml"


def test_blocked_deployment_fails_immediately_and_trips_breaker(
    tmp_path: Path,
) -> None:
    """After upload, readyState=BLOCKED fails fast and trips the breaker."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    fake_vercel = bin_dir / "vercel"
    fake_vercel.write_text(
        """#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "${VERCEL_CALL_LOG}"
if [[ " $* " == *" inspect "* && " $* " == *" --format=json "* ]]; then
  printf '%s\\n' '{"readyState":"BLOCKED","readyStateReason":"Concurrent builds limit reached","id":"dpl_blocked","url":"jovie-blocked.vercel.app"}'
  exit 0
fi
if [[ " $* " == *" --prebuilt "* ]]; then
  echo "https://jovie-blocked.vercel.app"
  exit 0
fi
echo "source deploy must not run" >&2
exit 99
"""
    )
    fake_vercel.chmod(0o755)

    prebuilt_output = tmp_path / ".vercel/output"
    prebuilt_output.mkdir(parents=True)
    (prebuilt_output / "config.json").write_text("{}")
    breaker_path = tmp_path / ".vercel-blocked-breaker.json"
    env = {
        **os.environ,
        "PATH": f"{bin_dir}:{os.environ['PATH']}",
        "VERCEL_TOKEN": "test-token",
        "VERCEL_ORG_ID": "test-org",
        "VERCEL_ENABLE_SOURCE_FALLBACK": "false",
        "VERCEL_ENABLE_PLAIN_PREBUILT_FALLBACK": "false",
        "VERCEL_CALL_LOG": str(tmp_path / "vercel-calls"),
        "VERCEL_BLOCKED_BREAKER_PATH": str(breaker_path),
        "VERCEL_BLOCKED_BREAKER_TTL_SECONDS": "1800",
        "RUNNER_TEMP": str(tmp_path),
    }

    result = subprocess.run(
        ["bash", str(DEPLOY_SCRIPT), "deploy_url", "--yes"],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )

    assert result.returncode == 75, result.stdout + result.stderr
    assert "BLOCKED" in result.stderr
    assert "Concurrent builds limit reached" in result.stderr
    assert "exceeded its time budget" not in result.stderr
    assert breaker_path.is_file()
    breaker = json.loads(breaker_path.read_text())
    assert breaker["schema"] == "jovie-vercel-blocked-breaker/v1"
    assert breaker["state"] == "open"
    assert breaker["reason"] == "Concurrent builds limit reached"
    assert breaker["deploymentId"] == "dpl_blocked"
    calls = (tmp_path / "vercel-calls").read_text().splitlines()
    assert any("--prebuilt --archive=tgz --no-wait" in line for line in calls)
    assert any("inspect" in line and "--format=json" in line for line in calls)
    assert not any(
        line for line in calls if "deploy" in line and "--prebuilt" not in line
    )


def test_async_remote_error_after_nowait_falls_back_to_source(
    tmp_path: Path,
) -> None:
    """--no-wait + BUILDING then ERROR must still fall back to source."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    fake_vercel = bin_dir / "vercel"
    fake_vercel.write_text(
        """#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "${VERCEL_CALL_LOG}"
if [[ " $* " == *" inspect "* && " $* " == *" --format=json "* ]]; then
  if [[ -f "${RUNNER_TEMP}/source-deployed" ]]; then
    printf '%s\\n' '{"readyState":"READY","id":"dpl_source"}'
    exit 0
  fi
  count_file="${RUNNER_TEMP}/inspect-count"
  n=0
  if [[ -f "$count_file" ]]; then n=$(cat "$count_file"); fi
  n=$((n + 1))
  printf '%s' "$n" > "$count_file"
  if [[ "$n" -eq 1 ]]; then
    printf '%s\\n' '{"readyState":"BUILDING","id":"dpl_building"}'
  else
    printf '%s\\n' '{"readyState":"ERROR","errorMessage":"Extracting deployment files failed","id":"dpl_err"}'
  fi
  exit 0
fi
if [[ " $* " == *" --prebuilt "* ]]; then
  echo "https://jovie-async-error.vercel.app"
  exit 0
fi
: > "${RUNNER_TEMP}/source-deployed"
echo "https://jovie-source-after-error.vercel.app"
exit 0
"""
    )
    fake_vercel.chmod(0o755)

    prebuilt_output = tmp_path / ".vercel/output"
    prebuilt_output.mkdir(parents=True)
    (prebuilt_output / "config.json").write_text("{}")
    output_file = tmp_path / "github-output"
    env = {
        **os.environ,
        "PATH": f"{bin_dir}:{os.environ['PATH']}",
        "VERCEL_TOKEN": "test-token",
        "VERCEL_ORG_ID": "test-org",
        "GITHUB_OUTPUT": str(output_file),
        "VERCEL_ENABLE_SOURCE_FALLBACK": "true",
        "VERCEL_ENABLE_PLAIN_PREBUILT_FALLBACK": "false",
        "VERCEL_CALL_LOG": str(tmp_path / "vercel-calls"),
        "VERCEL_BLOCKED_BREAKER_PATH": str(tmp_path / ".vercel-blocked-breaker.json"),
        "VERCEL_DEPLOY_SETTLE_SECONDS": "5",
        "VERCEL_DEPLOY_SETTLE_INTERVAL_MS": "1",
        "RUNNER_TEMP": str(tmp_path),
    }

    result = subprocess.run(
        ["bash", str(DEPLOY_SCRIPT), "deploy_url", "--yes"],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert "Extracting deployment files failed" in result.stderr
    assert "Deploy succeeded on attempt 2 with source upload" in result.stdout
    assert output_file.read_text().strip() == (
        "deploy_url=https://jovie-source-after-error.vercel.app"
    )
    calls = (tmp_path / "vercel-calls").read_text().splitlines()
    deploy_calls = [line for line in calls if "deploy " in line]
    assert len(deploy_calls) == 2
    assert "--prebuilt --archive=tgz --no-wait" in deploy_calls[0]
    assert "--prebuilt" not in deploy_calls[1]
    assert sum(1 for line in calls if "inspect " in line) >= 2


def test_staging_skips_vercel_build_while_blocked_breaker_is_open() -> None:
    """Staging reads the breaker before `vercel build` and persists it after."""
    workflow = PRODUCTION_RELEASE_WORKFLOW.read_text()
    staging = workflow[
        workflow.index("  deploy-staging:") : workflow.index("  canary-health-gate:")
    ]
    restore_index = staging.index("Restore Vercel blocked breaker")
    check_index = staging.index(
        "Skip vercel build while Vercel blocked breaker is open"
    )
    build_index = staging.index("Build (preview target for staging verification)")
    persist_index = staging.index("Persist Vercel blocked breaker")
    deploy_index = staging.index("Deploy (staging preview, prebuilt)")

    assert restore_index < check_index < build_index < deploy_index < persist_index
    assert "vercel-blocked-breaker.mjs check" in staging
    assert "actions/cache/restore@" in staging[restore_index:check_index]
    assert "vercel-blocked-breaker-" in staging[restore_index:check_index]
    assert "actions/cache/save@" in staging[persist_index:]
    assert ".vercel-blocked-breaker.json" in staging
    assert "hashFiles('.vercel-blocked-breaker.json')" in staging
