import os
import re
import subprocess
import textwrap
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DEPLOY_SCRIPT = REPO_ROOT / ".github/scripts/vercel-prebuilt-deploy.sh"
PRODUCTION_PROMOTION_SCRIPT = (
    REPO_ROOT / ".github/scripts/promote-production-deployment.sh"
)
PRODUCTION_ALIAS_SCRIPT = REPO_ROOT / ".github/scripts/verify-production-alias.sh"
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
    assert "--build-env NEXT_PUBLIC_BUILD_SHA=0123456" in calls[1]
    assert "--env NEXT_PUBLIC_BUILD_SHA=0123456" in calls[1]


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


def test_prebuilt_failure_does_not_fall_back_to_source_when_disabled(
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
  exit 1
fi
echo "source deploy must not run" >&2
exit 99
"""
    )
    fake_vercel.chmod(0o755)

    prebuilt_output = tmp_path / ".vercel/output"
    prebuilt_output.mkdir(parents=True)
    (prebuilt_output / "config.json").write_text("{}")
    env = {
        **os.environ,
        "PATH": f"{bin_dir}:{os.environ['PATH']}",
        "VERCEL_TOKEN": "test-token",
        "VERCEL_ORG_ID": "test-org",
        "VERCEL_ENABLE_SOURCE_FALLBACK": "false",
        "VERCEL_ENABLE_PLAIN_PREBUILT_FALLBACK": "false",
        "VERCEL_CALL_LOG": str(tmp_path / "vercel-calls"),
    }

    result = subprocess.run(
        ["bash", str(DEPLOY_SCRIPT), "deploy_url", "--yes"],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )

    assert result.returncode == 1
    calls = (tmp_path / "vercel-calls").read_text().splitlines()
    assert len(calls) == 1
    assert "--prebuilt --archive=tgz" in calls[0]


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


def test_pr_preview_readiness_requires_terminal_ready_state() -> None:
    workflow = CI_WORKFLOW.read_text()
    readiness = workflow[
        workflow.index("- name: Wait for PR preview readiness") : workflow.index(
            "  # PR Lighthouse runs"
        )
    ]

    assert "set -euo pipefail" in readiness
    assert "--wait" in readiness
    assert "--format=json" in readiness
    assert '(.readyState // .state // .status // "unknown") | ascii_upcase' in readiness
    assert 'if [ "$deployment_state" != "READY" ]; then' in readiness
    assert "refusing a false-green preview" in readiness
    assert "exit 1" in readiness
    assert "handing off to retrying canary" not in readiness


def test_pr_preview_readiness_script_fails_closed_for_every_non_ready_state(
    tmp_path: Path,
) -> None:
    workflow = CI_WORKFLOW.read_text()
    readiness = workflow[
        workflow.index("- name: Wait for PR preview readiness") : workflow.index(
            "  # PR Lighthouse runs"
        )
    ]
    script = textwrap.dedent(readiness.split("        run: |\n", 1)[1])

    fake_vercel = tmp_path / "node_modules/.bin/vercel"
    fake_vercel.parent.mkdir(parents=True)
    fake_vercel.write_text(
        """#!/usr/bin/env bash
set -euo pipefail
if [[ " $* " == *" --format=json "* ]]; then
  printf '%s\n' "${DEPLOYMENT_JSON}"
  exit "${FORMAT_STATUS:-0}"
fi
exit "${WAIT_STATUS:-0}"
"""
    )
    fake_vercel.chmod(0o755)

    cases = [
        ("READY after wait timeout", '{"readyState":"READY"}', "0", False),
        ("BUILDING", '{"readyState":"BUILDING"}', "0", True),
        ("QUEUED", '{"readyState":"QUEUED"}', "0", True),
        ("INITIALIZING", '{"readyState":"INITIALIZING"}', "0", True),
        ("ERROR", '{"readyState":"ERROR"}', "0", True),
        ("CANCELED", '{"readyState":"CANCELED"}', "0", True),
        ("unknown", "{}", "0", True),
        ("malformed JSON", "{", "0", True),
        ("JSON inspection failure", '{"readyState":"READY"}', "23", True),
    ]
    for name, deployment_json, format_status, expected_failure in cases:
        result = subprocess.run(
            ["bash", "-euo", "pipefail", "-c", script],
            cwd=tmp_path,
            env={
                **os.environ,
                "DEPLOYMENT_URL": "https://jovie-readiness-test.vercel.app",
                "DEPLOYMENT_JSON": deployment_json,
                "FORMAT_STATUS": format_status,
                "VERCEL_TOKEN": "test-token",
                "VERCEL_ORG_ID": "team-test",
                "WAIT_STATUS": "124",
            },
            capture_output=True,
            text=True,
            check=False,
        )
        assert (result.returncode != 0) == expected_failure, (
            name,
            result.stdout,
            result.stderr,
        )


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


def _write_fake_promotion_vercel(tmp_path: Path) -> Path:
    fake_vercel = tmp_path / "vercel"
    fake_vercel.write_text(
        r'''#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$VERCEL_CALL_LOG"
cmd="$1"

if [ "$cmd" = "inspect" ]; then
  if [ "$FAKE_SCENARIO" = "malformed" ]; then
    echo '{}'
    exit 0
  fi
  current="dpl_previous"
  if [ "$FAKE_SCENARIO" = "owned-timeout" ]; then
    current="dpl_previous"
  elif [ "$FAKE_SCENARIO" = "rolling" ]; then
    if grep -q '^rolling-release complete ' "$VERCEL_CALL_LOG"; then
      current="dpl_target"
    fi
  elif grep -q '^promote ' "$VERCEL_CALL_LOG"; then
    current="dpl_target"
  fi
  printf '{"id":"%s","readyState":"READY","target":"production"}\n' "$current"
  exit 0
fi

if [ "$cmd" = "rolling-release" ] && [ "$2" = "fetch" ]; then
  if [ "$FAKE_SCENARIO" = "foreign" ]; then
    echo '{"activeStage":{"targetPercentage":10},"canaryDeployment":{"id":"dpl_foreign"}}'
  elif [ "$FAKE_SCENARIO" = "rolling" ] &&
    grep -q '^promote ' "$VERCEL_CALL_LOG" &&
    ! grep -q '^rolling-release complete ' "$VERCEL_CALL_LOG"; then
    echo '{"activeStage":{"targetPercentage":10},"canaryDeployment":{"id":"dpl_target"}}'
  elif [ "$FAKE_SCENARIO" = "owned-timeout" ] &&
    grep -q '^promote ' "$VERCEL_CALL_LOG" &&
    ! grep -q '^rolling-release abort ' "$VERCEL_CALL_LOG"; then
    echo '{"activeStage":{"targetPercentage":10},"default":{"targetDeploymentId":"dpl_target"}}'
  else
    echo 'null'
  fi
  exit 0
fi

if [ "$cmd" = "promote" ]; then
  if [ "$FAKE_SCENARIO" = "promote-timeout" ]; then
    echo 'promotion timed out after server acceptance' >&2
    exit 1
  fi
  exit 0
fi

exit 0
'''
    )
    fake_vercel.chmod(0o755)
    return fake_vercel


def _run_promotion_controller(
    tmp_path: Path, scenario: str
) -> subprocess.CompletedProcess[str]:
    fake_vercel = _write_fake_promotion_vercel(tmp_path)
    env = {
        **os.environ,
        "FAKE_SCENARIO": scenario,
        "PRODUCTION_DEPLOYMENT_ID": "dpl_target",
        "PRODUCTION_PROMOTION_POLL_SECONDS": "0",
        "PRODUCTION_PROMOTION_SETTLE_ATTEMPTS": "2",
        "PRODUCTION_PROMOTION_CLEANUP_ATTEMPTS": "2",
        "PRODUCTION_PROMOTION_CLI_TIMEOUT": "1s",
        "VERCEL_CLI": str(fake_vercel),
        "VERCEL_TOKEN": "token",
        "VERCEL_ORG_ID": "team_test",
        "VERCEL_PROJECT_ID": "project_test",
        "VERCEL_CALL_LOG": str(tmp_path / "vercel-calls"),
        "GITHUB_OUTPUT": str(tmp_path / "github-output"),
    }
    return subprocess.run(
        ["bash", str(PRODUCTION_PROMOTION_SCRIPT)],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )


def test_promotion_controller_promotes_once_and_requires_terminal_current(
    tmp_path: Path,
) -> None:
    result = _run_promotion_controller(tmp_path, "standard")

    assert result.returncode == 0, result.stdout + result.stderr
    calls = (tmp_path / "vercel-calls").read_text()
    assert calls.count("promote dpl_target") == 1
    assert "Production Current is terminal on dpl_target" in result.stdout


def test_promotion_controller_observes_nonzero_promote_without_resubmitting(
    tmp_path: Path,
) -> None:
    result = _run_promotion_controller(tmp_path, "promote-timeout")

    assert result.returncode == 0, result.stdout + result.stderr
    calls = (tmp_path / "vercel-calls").read_text()
    assert calls.count("promote dpl_target") == 1
    assert "without resubmitting" in result.stderr


def test_promotion_controller_completes_only_its_exact_rolling_release(
    tmp_path: Path,
) -> None:
    result = _run_promotion_controller(tmp_path, "rolling")

    assert result.returncode == 0, result.stdout + result.stderr
    calls = (tmp_path / "vercel-calls").read_text()
    assert "rolling-release complete --dpl dpl_target" in calls
    assert "rolling-release abort" not in calls


def test_promotion_controller_rejects_foreign_rollout_without_mutation(
    tmp_path: Path,
) -> None:
    result = _run_promotion_controller(tmp_path, "foreign")

    assert result.returncode == 1
    calls = (tmp_path / "vercel-calls").read_text()
    assert "promote dpl_target" not in calls
    assert "rolling-release complete" not in calls
    assert (tmp_path / "github-output").read_text().strip() == (
        "failure_subtype=production_promotion_foreign_rollout"
    )


def test_promotion_controller_aborts_timed_out_owned_rollout_and_stops(
    tmp_path: Path,
) -> None:
    result = _run_promotion_controller(tmp_path, "owned-timeout")

    assert result.returncode == 1
    calls = (tmp_path / "vercel-calls").read_text()
    assert calls.count("promote dpl_target") == 1
    assert "rolling-release abort --dpl dpl_target" in calls
    assert "vercel rollback" not in calls
    assert (tmp_path / "github-output").read_text().strip().endswith(
        "failure_subtype=production_promotion_failed"
    )


def test_promotion_controller_fails_closed_on_malformed_preflight(
    tmp_path: Path,
) -> None:
    result = _run_promotion_controller(tmp_path, "malformed")

    assert result.returncode == 1
    assert (tmp_path / "github-output").read_text().strip() == (
        "failure_subtype=production_promotion_state_invalid"
    )
    assert "promote dpl_target" not in (tmp_path / "vercel-calls").read_text()


def _write_fake_alias_tools(tmp_path: Path) -> tuple[Path, Path]:
    fake_vercel = tmp_path / "vercel"
    fake_vercel.write_text(
        "#!/usr/bin/env bash\n"
        "set -euo pipefail\n"
        "printf '%s\\n' \"$*\" >> \"$VERCEL_CALL_LOG\"\n"
        "printf '{\"id\":\"%s\",\"readyState\":\"READY\",\"target\":\"production\"}\\n' \"$FAKE_CURRENT_ID\"\n"
    )
    fake_vercel.chmod(0o755)

    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    fake_curl = fake_bin / "curl"
    fake_curl.write_text(
        "#!/usr/bin/env bash\n"
        "set -euo pipefail\n"
        "printf '%s\\n' \"$*\" >> \"$CURL_CALL_LOG\"\n"
        "printf '{\"commitSha\":\"%s\",\"environment\":\"production\"}\\n200\\n' \"$FAKE_BUILD_SHA\"\n"
    )
    fake_curl.chmod(0o755)
    return fake_vercel, fake_bin


def _run_alias_verifier(
    tmp_path: Path, *, current_id: str, build_sha: str
) -> subprocess.CompletedProcess[str]:
    fake_vercel, fake_bin = _write_fake_alias_tools(tmp_path)
    env = {
        **os.environ,
        "PATH": f"{fake_bin}:{os.environ['PATH']}",
        "EXPECTED_COMMIT_SHA": "new5678full",
        "EXPECTED_PRODUCTION_DEPLOYMENT_ID": "dpl_target",
        "PRODUCTION_ALIAS_MAX_ATTEMPTS": "1",
        "PRODUCTION_ALIAS_REQUIRED_ROUNDS": "1",
        "PRODUCTION_ALIAS_RETRY_SECONDS": "0",
        "VERCEL_CLI": str(fake_vercel),
        "VERCEL_TOKEN": "token",
        "VERCEL_ORG_ID": "team_test",
        "VERCEL_CALL_LOG": str(tmp_path / "vercel-calls"),
        "CURL_CALL_LOG": str(tmp_path / "curl-calls"),
        "FAKE_CURRENT_ID": current_id,
        "FAKE_BUILD_SHA": build_sha,
        "GITHUB_OUTPUT": str(tmp_path / "github-output"),
    }
    return subprocess.run(
        ["bash", str(PRODUCTION_ALIAS_SCRIPT)],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )


def test_alias_verifier_requires_exact_id_sha_and_all_rolling_routes(
    tmp_path: Path,
) -> None:
    result = _run_alias_verifier(
        tmp_path, current_id="dpl_target", build_sha="new5678"
    )

    assert result.returncode == 0, result.stdout + result.stderr
    curl_calls = (tmp_path / "curl-calls").read_text()
    assert curl_calls.count("api/health/build-info") == 3
    assert "vcrrForceStable=true" in curl_calls
    assert "vcrrForceCanary=true" in curl_calls
    assert "x-vercel-protection-bypass" not in curl_calls


def test_alias_verifier_rejects_stale_sha_even_on_expected_deployment(
    tmp_path: Path,
) -> None:
    result = _run_alias_verifier(
        tmp_path, current_id="dpl_target", build_sha="old1234"
    )

    assert result.returncode == 1
    assert (tmp_path / "github-output").read_text().strip() == (
        "failure_subtype=production_alias_not_updated"
    )


def test_alias_verifier_rejects_wrong_current_id_even_with_expected_sha(
    tmp_path: Path,
) -> None:
    result = _run_alias_verifier(
        tmp_path, current_id="dpl_old", build_sha="new5678"
    )

    assert result.returncode == 1
    assert (tmp_path / "github-output").read_text().strip() == (
        "failure_subtype=production_alias_not_updated"
    )
