import os
import re
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DEPLOY_SCRIPT = REPO_ROOT / ".github/scripts/vercel-prebuilt-deploy.sh"
CI_WORKFLOW = REPO_ROOT / ".github/workflows/ci.yml"
CANARY_WORKFLOW = REPO_ROOT / ".github/workflows/canary-health-gate.yml"


def test_timed_out_prebuilt_with_accepted_url_hands_off_to_health_gate(
    tmp_path: Path,
) -> None:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    fake_vercel = bin_dir / "vercel"
    fake_vercel.write_text(
        """#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${VERCEL_CALL_LOG}"
if [[ " $* " == *" --prebuilt "* ]]; then
  echo "https://jovie-incomplete-prebuilt.vercel.app"
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
            "VERCEL_ENABLE_PLAIN_PREBUILT_FALLBACK": "false",
            "VERCEL_DEPLOY_ARCHIVE_TIMEOUT_SECONDS": "1",
            "VERCEL_DEPLOY_SOURCE_TIMEOUT_SECONDS": "5",
            "VERCEL_DEPLOY_KILL_GRACE_SECONDS": "1",
            "VERCEL_CALL_LOG": str(tmp_path / "vercel-calls"),
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
    assert result.stderr.count("exceeded its time budget") == 1
    assert "downstream health gates will verify readiness" in result.stdout
    assert output_file.read_text().strip() == (
        "deploy_url=https://jovie-incomplete-prebuilt.vercel.app"
    )
    calls = (tmp_path / "vercel-calls").read_text().splitlines()
    assert len(calls) == 1
    assert "--prebuilt --archive=tgz" in calls[0]


def test_timed_out_prebuilt_without_accepted_url_falls_back_to_source(
    tmp_path: Path,
) -> None:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    fake_vercel = bin_dir / "vercel"
    fake_vercel.write_text(
        """#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${VERCEL_CALL_LOG}"
if [[ " $* " == *" --prebuilt "* ]]; then
  trap '' TERM
  sleep 5
  exit 1
fi
echo "https://jovie-source-fallback.vercel.app"
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
            "VERCEL_ENABLE_PLAIN_PREBUILT_FALLBACK": "false",
            "VERCEL_DEPLOY_ARCHIVE_TIMEOUT_SECONDS": "1",
            "VERCEL_DEPLOY_SOURCE_TIMEOUT_SECONDS": "5",
            "VERCEL_DEPLOY_KILL_GRACE_SECONDS": "1",
            "VERCEL_GIT_COMMIT_SHA": "0123456789abcdef",
            "VERCEL_CALL_LOG": str(tmp_path / "vercel-calls"),
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
    assert result.stderr.count("exceeded its time budget") == 1
    assert "Deploy succeeded on attempt 2 with source upload" in result.stdout
    assert output_file.read_text().strip() == (
        "deploy_url=https://jovie-source-fallback.vercel.app"
    )
    calls = (tmp_path / "vercel-calls").read_text().splitlines()
    assert len(calls) == 2
    assert "--prebuilt --archive=tgz" in calls[0]
    assert "--prebuilt" not in calls[1]
    assert "--build-env VERCEL_GIT_COMMIT_SHA=0123456789abcdef" in calls[1]
    assert "--env VERCEL_GIT_COMMIT_SHA=0123456789abcdef" in calls[1]


def test_failed_prebuilt_with_url_still_falls_back_to_source(tmp_path: Path) -> None:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    fake_vercel = bin_dir / "vercel"
    fake_vercel.write_text(
        """#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${VERCEL_CALL_LOG}"
if [[ " $* " == *" --prebuilt "* ]]; then
  echo "https://jovie-canceled-archive.vercel.app"
  exit 1
fi
echo "https://jovie-source-after-cancel.vercel.app"
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
            "VERCEL_ENABLE_PLAIN_PREBUILT_FALLBACK": "false",
            "VERCEL_CALL_LOG": str(tmp_path / "vercel-calls"),
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
    assert "Deploy succeeded on attempt 2 with source upload" in result.stdout
    assert output_file.read_text().strip() == (
        "deploy_url=https://jovie-source-after-cancel.vercel.app"
    )
    calls = (tmp_path / "vercel-calls").read_text().splitlines()
    assert len(calls) == 2
    assert "--prebuilt --archive=tgz" in calls[0]
    assert "--prebuilt" not in calls[1]


def test_default_attempt_budgets_leave_one_minute_for_step_overhead() -> None:
    script = DEPLOY_SCRIPT.read_text()

    def default_for(name: str) -> int:
        match = re.search(rf"\$\{{{name}:-([0-9]+)\}}", script)
        assert match is not None, f"missing default for {name}"
        return int(match.group(1))

    archive = default_for("VERCEL_DEPLOY_ARCHIVE_TIMEOUT_SECONDS")
    source = default_for("VERCEL_DEPLOY_SOURCE_TIMEOUT_SECONDS")
    kill_grace = default_for("VERCEL_DEPLOY_KILL_GRACE_SECONDS")

    worst_case_seconds = archive + kill_grace + source + kill_grace
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
            "VERCEL_ENABLE_PLAIN_PREBUILT_FALLBACK": "false",
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


def test_workflow_waits_for_readiness_and_aliases_only_after_canary() -> None:
    workflow = CI_WORKFLOW.read_text()

    deploy_index = workflow.index("- name: Deploy (staging preview, prebuilt)")
    wait_index = workflow.index("- name: Wait for staging deployment readiness")
    canary_index = workflow.index("  canary-health-gate:")
    alias_job_index = workflow.index("  alias-staging:")
    promote_index = workflow.index("  promote-production:")

    assert deploy_index < wait_index < canary_index < alias_job_index < promote_index
    assert "vercel inspect" in workflow[wait_index:canary_index]
    assert "--wait" in workflow[wait_index:canary_index]
    assert "needs: [deploy-staging, canary-health-gate, alias-staging]" in workflow[
        promote_index:
    ]

    preview_deploy_index = workflow.index(
        "- name: Deploy (PR preview, fast deployment for UI-only changes)"
    )
    preview_wait_index = workflow.index("- name: Wait for PR preview readiness")
    assert preview_deploy_index < preview_wait_index < deploy_index


def test_staging_job_budget_contains_deploy_and_readiness_steps() -> None:
    workflow = CI_WORKFLOW.read_text()
    staging_block = workflow[
        workflow.index("  deploy-staging:") : workflow.index(
            "  canary-health-gate:"
        )
    ]

    job_timeout = re.search(r"^    timeout-minutes: ([0-9]+)$", staging_block, re.M)
    deploy_timeout = re.search(
        r"- name: Deploy \(staging preview, prebuilt\)\n        timeout-minutes: ([0-9]+)",
        staging_block,
    )
    readiness_timeout = re.search(
        r"- name: Wait for staging deployment readiness\n        timeout-minutes: ([0-9]+)",
        staging_block,
    )

    assert job_timeout is not None
    assert deploy_timeout is not None
    assert readiness_timeout is not None
    assert int(job_timeout.group(1)) >= (
        int(deploy_timeout.group(1)) + int(readiness_timeout.group(1)) + 5
    )


def test_reusable_vercel_artifact_contains_traced_runtime_dependencies() -> None:
    workflow = CI_WORKFLOW.read_text()
    producer = workflow[
        workflow.index("- name: Vercel build (deploy artifact)") : workflow.index(
            "- name: Upload vercel build artifact"
        )
    ]

    assert "apps/web/.next/standalone/apps/web/.next/node_modules" in producer
    snapshot_index = producer.index("vercel-runtime-node-modules.tar.gz")
    build_index = producer.index("./node_modules/.bin/vercel build")
    restore_index = producer.index(
        "tar -xzf /tmp/vercel-runtime-node-modules.tar.gz"
    )
    assert snapshot_index < build_index < restore_index
    assert "apps/web/.next/node_modules" in producer
    assert "import-in-the-middle-*" in producer
    assert "apps/web/.next/server/chunks" in producer
    assert "apps/web/.next/server \\" in producer
    assert "apps/web/.next/server/edge \\" not in producer
    for metadata_file in (
        "BUILD_ID",
        "app-path-routes-manifest.json",
        "build-manifest.json",
        "package.json",
        "prerender-manifest.json",
        "required-server-files.json",
    ):
        assert f"apps/web/.next/{metadata_file}" in producer


def test_staging_clerk_secrets_are_exposed_to_vercel_builds() -> None:
    workflow = CI_WORKFLOW.read_text()
    expected_publishable = (
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "
        "${{ secrets.CLERK_PUBLISHABLE_KEY_STAGING }}"
    )
    expected_secret = "CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY_STAGING }}"

    producer = workflow[
        workflow.index("- name: Vercel build (deploy artifact)") : workflow.index(
            "- name: Upload vercel build artifact"
        )
    ]
    staging = workflow[
        workflow.index("  deploy-staging:") : workflow.index(
            "  canary-health-gate:"
        )
    ]
    assert expected_publishable in producer
    assert expected_secret in producer
    assert staging.count(expected_publishable) >= 2
    assert staging.count(expected_secret) >= 2


def test_masked_deployment_url_is_encoded_across_job_boundary() -> None:
    workflow = CI_WORKFLOW.read_text()
    canary_workflow = CANARY_WORKFLOW.read_text()
    staging_block = workflow[
        workflow.index("  deploy-staging:") : workflow.index(
            "  canary-health-gate:"
        )
    ]
    downstream = workflow[
        workflow.index("  canary-health-gate:") : workflow.index(
            "  promote-production:"
        )
    ]

    assert "deploy_url_b64: ${{ steps.encode_deploy_url.outputs.deploy_url_b64 }}" in staging_block
    assert "deployment_url_b64: ${{ needs.deploy-staging.outputs.deploy_url_b64 }}" in downstream
    assert "base64 --decode" in downstream
    assert "DEPLOYMENT_URL_B64: ${{ inputs.deployment_url_b64 }}" in canary_workflow
    assert "base64 --decode" in canary_workflow


def test_readiness_gate_hands_active_deployment_to_retrying_canary() -> None:
    workflow = CI_WORKFLOW.read_text()
    readiness = workflow[
        workflow.index("- name: Wait for staging deployment readiness") : workflow.index(
            "- name: Encode deployment URL for downstream jobs"
        )
    ]

    assert "--wait" in readiness
    assert "--format=json" in readiness
    assert "BUILDING|QUEUED|INITIALIZING)" in readiness
    assert "handing off to retrying canary" in readiness
    assert "terminal state" in readiness
