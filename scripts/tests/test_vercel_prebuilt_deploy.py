import os
import re
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DEPLOY_SCRIPT = REPO_ROOT / ".github/scripts/vercel-prebuilt-deploy.sh"


def test_timed_out_prebuilt_uploads_fall_back_to_source(tmp_path: Path) -> None:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    fake_vercel = bin_dir / "vercel"
    fake_vercel.write_text(
        """#!/usr/bin/env bash
set -euo pipefail
if [[ " $* " == *" --prebuilt "* ]]; then
  trap '' TERM
  sleep 5
  exit 1
fi
echo "https://jovie-timeout-test.vercel.app"
"""
    )
    fake_vercel.chmod(0o755)

    output_file = tmp_path / "github-output"
    prebuilt_output = tmp_path / ".vercel/output"
    prebuilt_output.mkdir(parents=True)
    (prebuilt_output / "config.json").write_text("{}")

    env = os.environ.copy()
    env.update(
        {
            "PATH": f"{bin_dir}:{env['PATH']}",
            "VERCEL_TOKEN": "test-token",
            "VERCEL_ORG_ID": "test-org",
            "GITHUB_OUTPUT": str(output_file),
            "VERCEL_ENABLE_PLAIN_PREBUILT_FALLBACK": "true",
            "VERCEL_DEPLOY_ARCHIVE_TIMEOUT_SECONDS": "1",
            "VERCEL_DEPLOY_SOURCE_TIMEOUT_SECONDS": "5",
            "VERCEL_DEPLOY_KILL_GRACE_SECONDS": "1",
        }
    )

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
    assert result.stderr.count("exceeded its time budget") == 3
    assert "Deploy succeeded on attempt 4 with source upload" in result.stdout
    assert output_file.read_text().strip() == (
        "deploy_url=https://jovie-timeout-test.vercel.app"
    )


def test_default_attempt_budgets_leave_one_minute_for_step_overhead() -> None:
    script = DEPLOY_SCRIPT.read_text()

    def default_for(name: str) -> int:
        match = re.search(rf"\$\{{{name}:-([0-9]+)\}}", script)
        assert match is not None, f"missing default for {name}"
        return int(match.group(1))

    archive = default_for("VERCEL_DEPLOY_ARCHIVE_TIMEOUT_SECONDS")
    source = default_for("VERCEL_DEPLOY_SOURCE_TIMEOUT_SECONDS")
    kill_grace = default_for("VERCEL_DEPLOY_KILL_GRACE_SECONDS")

    worst_case_seconds = 3 * (archive + kill_grace) + source + kill_grace
    assert worst_case_seconds <= 9 * 60


def test_timed_out_source_with_accepted_url_hands_off_to_health_gate(
    tmp_path: Path,
) -> None:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    fake_vercel = bin_dir / "vercel"
    fake_vercel.write_text(
        """#!/usr/bin/env bash
set -euo pipefail
if [[ " $* " == *" --prebuilt "* ]]; then
  exit 1
fi
echo "https://jovie-accepted-test.vercel.app"
trap '' TERM
sleep 5
"""
    )
    fake_vercel.chmod(0o755)

    output_file = tmp_path / "github-output"
    prebuilt_output = tmp_path / ".vercel/output"
    prebuilt_output.mkdir(parents=True)
    (prebuilt_output / "config.json").write_text("{}")

    env = os.environ.copy()
    env.update(
        {
            "PATH": f"{bin_dir}:{env['PATH']}",
            "VERCEL_TOKEN": "test-token",
            "VERCEL_ORG_ID": "test-org",
            "GITHUB_OUTPUT": str(output_file),
            "VERCEL_ENABLE_PLAIN_PREBUILT_FALLBACK": "true",
            "VERCEL_DEPLOY_ARCHIVE_TIMEOUT_SECONDS": "1",
            "VERCEL_DEPLOY_SOURCE_TIMEOUT_SECONDS": "1",
            "VERCEL_DEPLOY_KILL_GRACE_SECONDS": "1",
        }
    )

    result = subprocess.run(
        ["bash", str(DEPLOY_SCRIPT), "deploy_url", "--yes"],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert "downstream health gates will verify readiness" in result.stdout
    assert output_file.read_text().strip() == (
        "deploy_url=https://jovie-accepted-test.vercel.app"
    )
