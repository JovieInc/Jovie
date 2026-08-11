import json
import os
import re
import subprocess
import textwrap
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
DEPLOY_SCRIPT = REPO_ROOT / ".github/scripts/vercel-prebuilt-deploy.sh"
PRODUCTION_PROMOTION_SCRIPT = (
    REPO_ROOT / ".github/scripts/promote-production-deployment.sh"
)
PRODUCTION_ALIAS_SCRIPT = REPO_ROOT / ".github/scripts/verify-production-alias.sh"
CI_WORKFLOW = REPO_ROOT / ".github/workflows/ci.yml"
PRODUCTION_RELEASE_WORKFLOW = REPO_ROOT / ".github/workflows/production-release.yml"
CANARY_WORKFLOW = REPO_ROOT / ".github/workflows/canary-health-gate.yml"
EXPECTED_COMMIT_SHA = "a" * 40
ACTION_CACHE_V4_2_3_SHA = "5a3ec84eff668545956fd18022155c47e93e2684"


def test_production_next_cache_experiment_is_bounded_and_restore_only_by_default() -> None:
    """Keep the production cache experiment narrow enough to be reversible.

    The production build cache may speed ``vercel build --prod``, but it must
    never turn a prebuilt deploy artifact (or dependencies) into a cache input.
    Cache writes also require an explicit repository opt-in and a measured
    compressed archive below the documented ceiling.
    """

    workflow = PRODUCTION_RELEASE_WORKFLOW.read_text()
    restore_match = re.search(
        r"      - name: Restore production Next build cache\n(?P<body>.*?)"
        r"      - name: Build and stage production deployment\n",
        workflow,
        re.DOTALL,
    )
    assert restore_match, "production release must restore only the Next cache"
    restore = restore_match.group("body")
    assert "actions/cache/restore@" in restore
    assert f"actions/cache/restore@{ACTION_CACHE_V4_2_3_SHA}" in restore
    assert "path: apps/web/.next/cache" in restore
    assert "jovie-production-next-cache-v1-" in restore

    save_match = re.search(
        r"      - name: Save bounded production Next build cache\n(?P<body>.*?)"
        r"\n  production-public-profile-alias-gate:",
        workflow,
        re.DOTALL,
    )
    assert save_match, "production release must save through the bounded cache step"
    save = save_match.group("body")
    assert "actions/cache/save@" in save
    assert f"actions/cache/save@{ACTION_CACHE_V4_2_3_SHA}" in save
    assert "0c45773b623bea8c8e75f6c82b208c3cf94ea4f9" not in workflow
    assert "path: apps/web/.next/cache" in save
    assert "steps.verify-production.outcome == 'success'" in save
    assert "steps.stage-production.outputs.next_cache_save_eligible == 'true'" in save

    for cache_step in (restore, save):
        assert ".vercel/output" not in cache_step
        assert "node_modules" not in cache_step
        assert ".next/server" not in cache_step
        assert ".next/static" not in cache_step

    assert "JOVIE_PRODUCTION_NEXT_CACHE_SAVE" in workflow
    assert "PRODUCTION_NEXT_CACHE_MAX_ARCHIVE_BYTES: '536870912'" in workflow
    assert "tar -C apps/web/.next -czf \"$next_cache_probe\" cache" in workflow
    assert "next_cache_archive_bytes" in workflow
    assert "next_cache_save_eligible" in workflow


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
printf '%s|%s\n' "${VERCEL_GIT_COMMIT_SHA:-}" "${NEXT_PUBLIC_BUILD_SHA:-}" > "${VERCEL_ENV_LOG}"
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
            "VERCEL_ENV_LOG": str(tmp_path / "vercel-env"),
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
    assert "--build-env VERCEL_GIT_COMMIT_SHA" in calls[1]
    assert "--env VERCEL_GIT_COMMIT_SHA" in calls[1]
    assert "--build-env NEXT_PUBLIC_BUILD_SHA" in calls[1]
    assert "--env NEXT_PUBLIC_BUILD_SHA" in calls[1]
    assert "VERCEL_GIT_COMMIT_SHA=" not in calls[1]
    assert "NEXT_PUBLIC_BUILD_SHA=" not in calls[1]
    assert (tmp_path / "vercel-env").read_text().strip() == (
        "0123456789abcdef|0123456"
    )


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
    workflow = PRODUCTION_RELEASE_WORKFLOW.read_text()

    deploy_index = workflow.index("- name: Deploy (staging preview, prebuilt)")
    wait_index = workflow.index("- name: Wait for staging deployment readiness")
    attestation_index = workflow.index("  attest-staging-build:")
    canary_index = workflow.index("  canary-health-gate:")
    alias_job_index = workflow.index("  alias-staging:")
    migration_index = workflow.index("  migrate-production:")
    promote_index = workflow.index("  promote-production:")

    assert (
        deploy_index
        < wait_index
        < attestation_index
        < canary_index
        < alias_job_index
        < migration_index
        < promote_index
    )
    assert "vercel inspect" in workflow[wait_index:canary_index]
    assert "--wait" in workflow[wait_index:canary_index]
    assert (
        "needs: [deploy-staging, attest-staging-build, canary-health-gate, "
        "alias-staging, production-head, migrate-production]"
        in workflow[promote_index:]
    )

    source_workflow = CI_WORKFLOW.read_text()
    preview_deploy_index = source_workflow.index(
        "- name: Deploy (PR preview, fast deployment for UI-only changes)"
    )
    preview_wait_index = source_workflow.index("- name: Wait for PR preview readiness")
    assert preview_deploy_index < preview_wait_index


def test_pr_preview_readiness_requires_terminal_ready_state() -> None:
    workflow = CI_WORKFLOW.read_text()
    readiness = workflow[
        workflow.index("- name: Wait for PR preview readiness") : workflow.index(
            "  # Deep Lighthouse runs"
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
            "  # Deep Lighthouse runs"
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
    workflow = PRODUCTION_RELEASE_WORKFLOW.read_text()
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
    readiness_block = staging_block[
        staging_block.index("- name: Wait for staging deployment readiness") :
        staging_block.index("- name: Encode deployment URL for downstream jobs")
    ]
    readiness_timeout = re.search(
        r"^        timeout-minutes: ([0-9]+)$", readiness_block, re.M
    )

    assert job_timeout is not None
    assert deploy_timeout is not None
    assert readiness_timeout is not None
    assert int(job_timeout.group(1)) >= (
        int(deploy_timeout.group(1)) + int(readiness_timeout.group(1)) + 5
    )


def _staging_build_step(workflow: str) -> str:
    staging = workflow[
        workflow.index("  deploy-staging:") : workflow.index(
            "  canary-health-gate:"
        )
    ]
    return staging[
        staging.index(
            "- name: Build (preview target for staging verification)"
        ) : staging.index(
            "- name: Hash fixed staging build subject for isolated attestation"
        )
    ]


def test_staging_build_runs_in_job_and_materializes_trace_closure() -> None:
    workflow = PRODUCTION_RELEASE_WORKFLOW.read_text()
    staging = workflow[
        workflow.index("  deploy-staging:") : workflow.index(
            "  canary-health-gate:"
        )
    ]

    # The staging artifact is built and deployed in the same job, so the
    # JOV-4087 cross-job producer/upload/download/restore chain is gone and
    # traced runtime dependencies never leave the workspace.
    assert "download-artifact" not in staging
    assert "restore_vercel_build" not in staging
    assert "vercel-runtime-node-modules.tar.gz" not in staging

    build_step = _staging_build_step(workflow)

    # The in-job artifact is the thing canary verifies, so the build always
    # runs (no step-level if:) and cannot be skipped by artifact state.
    assert "if:" not in build_step.split("run: |", 1)[0]
    assert "./node_modules/.bin/vercel build" in build_step

    # Vercel's function trace references the generated robots response at its
    # public-file path even though the source route is app/robots.ts, so the
    # build materializes it and records it for the deploy script's cleanup.
    assert "test -f apps/web/.next/server/app/robots.txt.body" in build_step
    assert (
        "cp apps/web/.next/server/app/robots.txt.body apps/web/public/robots.txt"
        in build_step
    )
    assert ".vercel/jovie-generated-public-files" in build_step

    deploy_step = staging[
        staging.index("- name: Deploy (staging preview, prebuilt)") :
    ]
    # Fail-closed: a source fallback would silently discard the in-job
    # artifact and repeat the slow server build.
    assert "VERCEL_ENABLE_SOURCE_FALLBACK: 'false'" in deploy_step


def test_staging_clerk_secrets_are_exposed_to_vercel_builds() -> None:
    workflow = PRODUCTION_RELEASE_WORKFLOW.read_text()
    expected_publishable = (
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "
        "${{ secrets.CLERK_PUBLISHABLE_KEY_STAGING }}"
    )
    expected_secret = "CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY_STAGING }}"

    staging = workflow[
        workflow.index("  deploy-staging:") : workflow.index(
            "  canary-health-gate:"
        )
    ]
    build_step = _staging_build_step(workflow)

    # The in-job staging build must sign Clerk tokens with staging keys.
    assert expected_publishable in build_step
    assert expected_secret in build_step
    # The prebuilt deploy step also receives them so CLI-side env resolution
    # cannot fall back to production keys.
    assert staging.count(expected_publishable) >= 2
    assert staging.count(expected_secret) >= 2


def test_masked_deployment_url_is_encoded_across_job_boundary() -> None:
    workflow = PRODUCTION_RELEASE_WORKFLOW.read_text()
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
    workflow = PRODUCTION_RELEASE_WORKFLOW.read_text()
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
  printf '%s\n' \
    'Vercel CLI 54.14.5 (Node.js 22.23.1)' \
    'Fetching deployment "jov.ie" in test-team' >&2
  if [ "$FAKE_SCENARIO" = "inspect-error" ]; then
    printf '%s\n' \
      '{"status":"error","reason":"api_error","message":"do-not-leak-sensitive-marker"}' >&2
    exit 1
  fi
  if [ "$FAKE_SCENARIO" = "malformed" ]; then
    echo '{}'
    exit 0
  fi
  current="dpl_previous"
  if [ "$FAKE_SCENARIO" = "owned-timeout" ]; then
    current="dpl_previous"
  elif [ "$FAKE_SCENARIO" = "rolling" ]; then
    fetch_count=$(grep -c '^rolling-release fetch' "$VERCEL_CALL_LOG" || true)
    if [ "$fetch_count" -ge 3 ]; then
      current="dpl_target"
    fi
  elif grep -q '^promote ' "$VERCEL_CALL_LOG"; then
    current="dpl_target"
  fi
  printf '{"id":"%s","url":"%s.vercel.app","readyState":"READY","target":"production"}\n' "$current" "$current"
  exit 0
fi

if [ "$cmd" = "rolling-release" ] && [ "$2" = "fetch" ]; then
  printf '%s\n' \
    'Vercel CLI 54.14.5 (Node.js 22.23.1)' \
    'Retrieving project…' >&2
  if [ "$FAKE_SCENARIO" = "rollout-error" ]; then
    printf '%s\n' \
      '{"status":"error","reason":"api_error","message":"do-not-leak-sensitive-marker"}' >&2
    exit 1
  fi
  if [ "$FAKE_SCENARIO" = "rollout-malformed" ]; then
    printf '%s\n' '> do-not-leak-sensitive-marker' >&2
    exit 0
  fi

  rollout='null'
  if [ "$FAKE_SCENARIO" = "foreign-complete" ]; then
    rollout='{"state":"COMPLETE","currentCanaryPercentage":100,"activeStage":{"index":2,"isFinalStage":true,"targetPercentage":100},"canaryDeployment":{"id":"dpl_foreign"}}'
  elif [ "$FAKE_SCENARIO" = "foreign" ]; then
    rollout='{"activeStage":{"targetPercentage":10},"canaryDeployment":{"id":"dpl_foreign"}}'
  elif [ "$FAKE_SCENARIO" = "rolling" ] &&
    grep -q '^promote ' "$VERCEL_CALL_LOG" &&
    [[ $(grep -c '^rolling-release fetch' "$VERCEL_CALL_LOG" || true) -lt 3 ]]; then
    rollout='{"state":"ROLLING","activeStage":{"targetPercentage":10,"duration":300},"canaryDeployment":{"id":"dpl_target"}}'
  elif [ "$FAKE_SCENARIO" = "owned-timeout" ] &&
    grep -q '^promote ' "$VERCEL_CALL_LOG" &&
    ! grep -q '^rolling-release abort ' "$VERCEL_CALL_LOG"; then
    rollout='{"activeStage":{"targetPercentage":10},"default":{"targetDeploymentId":"dpl_target"}}'
  fi

  if [ "$FAKE_SCENARIO" = "legacy-stdout" ]; then
    printf '%s\n' "$rollout"
  else
    # Vercel CLI 54.14.5 uses its stderr-backed output manager for this
    # machine-readable response. Only the first JSON line has the `> ` prefix.
    printf '> ' >&2
    jq . <<<"$rollout" >&2
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
    tmp_path: Path, scenario: str, *, main_sha: str | None = None
) -> subprocess.CompletedProcess[str]:
    fake_vercel = _write_fake_promotion_vercel(tmp_path)
    fake_gh = tmp_path / "gh"
    fake_gh.write_text(
        "#!/usr/bin/env bash\n"
        "set -euo pipefail\n"
        "printf '%s\\n' \"${FAKE_MAIN_SHA}\"\n"
    )
    fake_gh.chmod(0o755)
    expected_main_sha = "a" * 40
    env = {
        **os.environ,
        "FAKE_SCENARIO": scenario,
        "PRODUCTION_DEPLOYMENT_ID": "dpl_target",
        "EXPECTED_MAIN_SHA": expected_main_sha,
        "FAKE_MAIN_SHA": main_sha or expected_main_sha,
        "GITHUB_REPOSITORY": "jovie/jovie",
        "GH_TOKEN": "github-token",
        "GH_CLI": str(fake_gh),
        "PRODUCTION_PROMOTION_POLL_SECONDS": "0",
        "PRODUCTION_PROMOTION_SETTLE_ATTEMPTS": "4",
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


def test_promotion_controller_accepts_legacy_rollout_json_on_stdout(
    tmp_path: Path,
) -> None:
    result = _run_promotion_controller(tmp_path, "legacy-stdout")

    assert result.returncode == 0, result.stdout + result.stderr
    calls = (tmp_path / "vercel-calls").read_text()
    assert calls.count("promote dpl_target") == 1


def test_promotion_controller_observes_nonzero_promote_without_resubmitting(
    tmp_path: Path,
) -> None:
    result = _run_promotion_controller(tmp_path, "promote-timeout")

    assert result.returncode == 0, result.stdout + result.stderr
    calls = (tmp_path / "vercel-calls").read_text()
    assert calls.count("promote dpl_target") == 1
    assert "without resubmitting" in result.stderr


def test_promotion_controller_observes_automatic_rolling_release(
    tmp_path: Path,
) -> None:
    result = _run_promotion_controller(tmp_path, "rolling")

    assert result.returncode == 0, result.stdout + result.stderr
    calls = (tmp_path / "vercel-calls").read_text()
    assert "rolling-release complete" not in calls
    assert "observing owned automatic rollout" in result.stdout
    assert "rolling-release abort" not in calls


def test_promotion_controller_rejects_foreign_rollout_without_mutation(
    tmp_path: Path,
) -> None:
    result = _run_promotion_controller(tmp_path, "foreign")

    assert result.returncode == 1
    calls = (tmp_path / "vercel-calls").read_text()
    assert "promote dpl_target" not in calls
    assert "rolling-release complete" not in calls
    outputs = (tmp_path / "github-output").read_text()
    assert "previous_production_deployment_id=dpl_previous" in outputs
    assert "previous_production_deployment_url=" not in outputs
    assert f"promotion_sha={'a' * 40}" in outputs
    assert "is_current=" not in outputs
    assert "failure_subtype=production_promotion_foreign_rollout" in outputs


def test_promotion_controller_emits_observed_newer_sha_without_mutation(
    tmp_path: Path,
) -> None:
    newer_sha = "b" * 40
    result = _run_promotion_controller(
        tmp_path, "standard", main_sha=newer_sha
    )

    assert result.returncode == 0, result.stdout + result.stderr
    calls = (tmp_path / "vercel-calls").read_text()
    assert "promote dpl_target" not in calls
    outputs = (tmp_path / "github-output").read_text()
    assert f"promotion_sha={newer_sha}" in outputs
    assert "is_current=" not in outputs


def test_promotion_controller_ignores_completed_foreign_rollout_record(
    tmp_path: Path,
) -> None:
    result = _run_promotion_controller(tmp_path, "foreign-complete")

    assert result.returncode == 0, result.stdout + result.stderr
    calls = (tmp_path / "vercel-calls").read_text()
    assert calls.count("promote dpl_target") == 1
    assert "rolling-release complete" not in calls
    assert "rolling-release abort" not in calls


def test_promotion_controller_ignores_completed_foreign_rollout_record(
    tmp_path: Path,
) -> None:
    result = _run_promotion_controller(tmp_path, "foreign-complete")

    assert result.returncode == 0, result.stdout + result.stderr
    calls = (tmp_path / "vercel-calls").read_text()
    assert calls.count("promote dpl_target") == 1
    assert "rolling-release complete" not in calls
    assert "rolling-release abort" not in calls


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


def test_promotion_controller_reports_safe_inspect_failure_reason(
    tmp_path: Path,
) -> None:
    result = _run_promotion_controller(tmp_path, "inspect-error")

    assert result.returncode == 1
    assert "Vercel inspect current failed (exit 1, reason=api_error)." in result.stderr
    assert "do-not-leak-sensitive-marker" not in result.stderr
    assert "rolling-release fetch" not in (tmp_path / "vercel-calls").read_text()
    assert "promote dpl_target" not in (tmp_path / "vercel-calls").read_text()


def test_promotion_controller_reports_safe_rollout_failure_reason(
    tmp_path: Path,
) -> None:
    result = _run_promotion_controller(tmp_path, "rollout-error")

    assert result.returncode == 1
    assert (
        "Vercel rolling-release fetch failed (exit 1, reason=api_error)."
        in result.stderr
    )
    assert "do-not-leak-sensitive-marker" not in result.stderr
    assert "promote dpl_target" not in (tmp_path / "vercel-calls").read_text()


def test_promotion_controller_reports_safe_malformed_rollout_shape(
    tmp_path: Path,
) -> None:
    result = _run_promotion_controller(tmp_path, "rollout-malformed")

    assert result.returncode == 1
    assert "Vercel rolling-release fetch returned malformed JSON" in result.stderr
    assert "do-not-leak-sensitive-marker" not in result.stderr
    assert "promote dpl_target" not in (tmp_path / "vercel-calls").read_text()


def _write_fake_alias_tools(tmp_path: Path) -> tuple[Path, Path]:
    fake_vercel = tmp_path / "vercel"
    fake_vercel.write_text(
        "#!/usr/bin/env bash\n"
        "set -euo pipefail\n"
        "printf '%s\\n' \"$*\" >> \"$VERCEL_CALL_LOG\"\n"
        "printf '{\"id\":\"%s\",\"url\":\"%s.vercel.app\",\"readyState\":\"READY\",\"target\":\"production\"}\\n' \"$FAKE_CURRENT_ID\" \"$FAKE_CURRENT_ID\"\n"
    )
    fake_vercel.chmod(0o755)

    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    fake_curl = fake_bin / "curl"
    fake_curl.write_text(
        r'''#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$CURL_CALL_LOG"
call_index="$(wc -l < "$CURL_CALL_LOG" | tr -d ' ')"
IFS=',' read -r -a observations <<< "${FAKE_CURL_SEQUENCE:-match}"
observation="${observations[$((call_index - 1))]:-match}"
build_sha="$FAKE_BUILD_SHA"
build_environment="$FAKE_BUILD_ENVIRONMENT"
http_status="200"

case "$observation" in
  match) ;;
  stale-sha) build_sha="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" ;;
  wrong-environment) build_environment="preview" ;;
  http-503) http_status="503" ;;
  http-000) http_status="000" ;;
  transient) exit 28 ;;
  *)
    echo "Unknown fake curl observation: $observation" >&2
    exit 2
    ;;
esac

printf '{"commitSha":"%s","environment":"%s"}\n%s\n' \
  "$build_sha" "$build_environment" "$http_status"
'''
    )
    fake_curl.chmod(0o755)
    return fake_vercel, fake_bin


def _run_alias_verifier(
    tmp_path: Path,
    *,
    current_id: str,
    build_sha: str,
    max_attempts: int = 1,
    required_rounds: int = 1,
    max_transient_failures: int = 0,
    route_retries: int | None = 0,
    curl_sequence: str = "match",
    build_environment: str = "production",
    expected_sha: str = EXPECTED_COMMIT_SHA,
    deployment_id: str = "dpl_target",
) -> subprocess.CompletedProcess[str]:
    fake_vercel, fake_bin = _write_fake_alias_tools(tmp_path)
    env = {
        **os.environ,
        "PATH": f"{fake_bin}:{os.environ['PATH']}",
        "EXPECTED_COMMIT_SHA": expected_sha,
        "EXPECTED_PRODUCTION_DEPLOYMENT_ID": deployment_id,
        "PRODUCTION_ALIAS_MAX_ATTEMPTS": str(max_attempts),
        "PRODUCTION_ALIAS_REQUIRED_ROUNDS": str(required_rounds),
        "PRODUCTION_ALIAS_MAX_TRANSIENT_FAILURES": str(max_transient_failures),
        "PRODUCTION_ALIAS_RETRY_SECONDS": "0",
        "VERCEL_CLI": str(fake_vercel),
        "VERCEL_TOKEN": "token",
        "VERCEL_ORG_ID": "team_test",
        "VERCEL_CALL_LOG": str(tmp_path / "vercel-calls"),
        "CURL_CALL_LOG": str(tmp_path / "curl-calls"),
        "FAKE_CURL_SEQUENCE": curl_sequence,
        "FAKE_CURRENT_ID": current_id,
        "FAKE_BUILD_SHA": build_sha,
        "FAKE_BUILD_ENVIRONMENT": build_environment,
        "GITHUB_OUTPUT": str(tmp_path / "github-output"),
    }
    if route_retries is not None:
        env["PRODUCTION_ALIAS_ROUTE_RETRIES"] = str(route_retries)
    return subprocess.run(
        ["bash", str(PRODUCTION_ALIAS_SCRIPT)],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )


def _alias_observation_sequence(
    *attempts: tuple[str, ...],
) -> str:
    return ",".join(observation for attempt in attempts for observation in attempt)


def test_alias_verifier_requires_exact_id_sha_and_all_rolling_routes(
    tmp_path: Path,
) -> None:
    result = _run_alias_verifier(
        tmp_path, current_id="dpl_target", build_sha=EXPECTED_COMMIT_SHA
    )

    assert result.returncode == 0, result.stdout + result.stderr
    curl_calls = (tmp_path / "curl-calls").read_text()
    assert curl_calls.count("api/health/build-info") == 3
    assert "vcrrForceStable=true" in curl_calls
    assert "vcrrForceCanary=true" in curl_calls
    assert "x-vercel-protection-bypass" not in curl_calls


def test_alias_verifier_rejects_an_abbreviated_nonmatching_prefix(
    tmp_path: Path,
) -> None:
    result = _run_alias_verifier(
        tmp_path,
        current_id="dpl_target",
        build_sha="bbbbbbb",
    )

    assert result.returncode == 1
    assert "failure_subtype=production_alias_not_updated" in (
        tmp_path / "github-output"
    ).read_text()


def test_alias_verifier_accepts_matching_short_sha_from_production_probe(
    tmp_path: Path,
) -> None:
    result = _run_alias_verifier(
        tmp_path,
        current_id="dpl_target",
        build_sha=EXPECTED_COMMIT_SHA[:7],
    )

    assert result.returncode == 0, result.stdout + result.stderr


def test_alias_verifier_replays_production_transients_with_independent_proof(
    tmp_path: Path,
) -> None:
    # Exact route-observation pattern from production run 29686884512. The
    # legacy global streak never exceeded one clean round, even though every
    # response that arrived identified the exact Production deployment.
    observations = _alias_observation_sequence(
        ("match", "match", "match"),
        ("transient", "match", "match"),
        ("match", "match", "match"),
        ("transient", "match", "match"),
        ("transient", "match", "match"),
        ("match", "match", "match"),
        ("transient", "match", "match"),
        ("transient", "match", "match"),
        ("transient", "match", "transient"),
        ("match", "match", "match"),
        ("match", "match", "transient"),
        ("match", "match", "match"),
        ("match", "match", "transient"),
        ("match", "match", "transient"),
        ("match", "match", "match"),
    )
    result = _run_alias_verifier(
        tmp_path,
        current_id="dpl_target",
        build_sha=EXPECTED_COMMIT_SHA,
        max_attempts=15,
        required_rounds=3,
        curl_sequence=observations,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert "attempt 6/15 production-alias/canary" in result.stdout
    assert len((tmp_path / "curl-calls").read_text().splitlines()) == 18


def test_alias_verifier_completes_once_every_route_reaches_exact_proof(
    tmp_path: Path,
) -> None:
    # A trailing unknown on an unrelated route is not contradictory evidence:
    # the gate completes as soon as every target holds the required exact
    # proof, without demanding an all-exact latest round.
    result = _run_alias_verifier(
        tmp_path,
        current_id="dpl_target",
        build_sha=EXPECTED_COMMIT_SHA,
        max_attempts=3,
        required_rounds=2,
        curl_sequence=_alias_observation_sequence(
            ("match", "match", "match"),
            ("match", "transient", "match"),
            ("transient", "match", "match"),
        ),
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert "attempt 3/3 production-alias/plain: HTTP 000" in result.stdout


def test_alias_verifier_retries_transport_unknowns_within_each_route_observation(
    tmp_path: Path,
) -> None:
    result = _run_alias_verifier(
        tmp_path,
        current_id="dpl_target",
        build_sha=EXPECTED_COMMIT_SHA,
        max_attempts=2,
        required_rounds=2,
        route_retries=1,
        curl_sequence=_alias_observation_sequence(
            ("transient", "match", "transient", "match", "match"),
            ("match", "match", "match"),
        ),
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert "transport unknown (HTTP 000), retry 1/1" in result.stdout
    assert "attempt 2/2 production-alias/canary" in result.stdout
    assert len((tmp_path / "curl-calls").read_text().splitlines()) == 8


def test_alias_verifier_retries_successful_http_000_within_each_route_observation(
    tmp_path: Path,
) -> None:
    result = _run_alias_verifier(
        tmp_path,
        current_id="dpl_target",
        build_sha=EXPECTED_COMMIT_SHA,
        route_retries=1,
        curl_sequence=_alias_observation_sequence(
            ("http-000", "match", "match", "match"),
        ),
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert "transport unknown (HTTP 000), retry 1/1" in result.stdout
    assert len((tmp_path / "curl-calls").read_text().splitlines()) == 4


def test_alias_verifier_default_production_release_budget_fits_eight_minutes() -> None:
    verifier = PRODUCTION_ALIAS_SCRIPT.read_text()

    def verifier_default(name: str, shell_name: str) -> int:
        match = re.search(
            rf'{shell_name}="\$\{{{name}:-([0-9]+)\}}"',
            verifier,
        )
        assert match is not None, f"missing verifier default for {name}"
        return int(match.group(1))

    max_attempts = verifier_default(
        "PRODUCTION_ALIAS_MAX_ATTEMPTS", "max_attempts"
    )
    retry_seconds = verifier_default(
        "PRODUCTION_ALIAS_RETRY_SECONDS", "retry_seconds"
    )
    route_retries = verifier_default(
        "PRODUCTION_ALIAS_ROUTE_RETRIES", "route_retries"
    )
    curl_max_time = int(re.search(r"--max-time ([0-9]+)", verifier).group(1))

    worst_case_seconds = (
        3 * max_attempts * (route_retries + 1) * curl_max_time
        + (max_attempts - 1) * retry_seconds
    )

    assert max_attempts == 15
    assert retry_seconds == 10
    assert route_retries == 1
    assert curl_max_time == 3
    assert worst_case_seconds == 410
    assert worst_case_seconds < 8 * 60


def test_alias_verifier_resets_proof_on_observed_identity_mismatch(
    tmp_path: Path,
) -> None:
    result = _run_alias_verifier(
        tmp_path,
        current_id="dpl_target",
        build_sha=EXPECTED_COMMIT_SHA,
        max_attempts=5,
        required_rounds=3,
        curl_sequence=_alias_observation_sequence(
            ("match", "match", "match"),
            ("match", "match", "match"),
            ("wrong-environment", "match", "match"),
            ("match", "match", "match"),
            ("match", "match", "match"),
        ),
    )

    assert result.returncode == 1
    assert "environment=preview" in result.stdout


def test_alias_verifier_preserves_exact_proof_across_transport_unknowns(
    tmp_path: Path,
) -> None:
    # Transport unknowns consume bounded attempt budget only; they never reset
    # exact proof a route already established.
    result = _run_alias_verifier(
        tmp_path,
        current_id="dpl_target",
        build_sha=EXPECTED_COMMIT_SHA,
        max_attempts=6,
        required_rounds=3,
        route_retries=1,
        curl_sequence=_alias_observation_sequence(
            ("match", "match", "match"),
            ("match", "match", "match"),
            ("transient", "transient", "match", "match"),
            ("transient", "transient", "match", "match"),
            ("transient", "transient", "match", "match"),
            ("match", "match", "match"),
        ),
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert "attempt 6/6 production-alias/plain: HTTP 200" in result.stdout
    assert len((tmp_path / "curl-calls").read_text().splitlines()) == 21


def test_alias_verifier_unknown_only_window_never_passes(
    tmp_path: Path,
) -> None:
    # Unknown is never passing by itself: a window of pure transport unknowns
    # exhausts the bounded budget and fails without contradictory evidence.
    result = _run_alias_verifier(
        tmp_path,
        current_id="dpl_target",
        build_sha=EXPECTED_COMMIT_SHA,
        max_attempts=3,
        required_rounds=2,
        curl_sequence=_alias_observation_sequence(
            ("transient", "transient", "transient"),
            ("transient", "transient", "transient"),
            ("transient", "transient", "transient"),
        ),
    )

    assert result.returncode == 1
    assert "proof=0/2" in result.stdout
    assert "did not converge" in result.stderr
    assert (tmp_path / "github-output").read_text().strip() == (
        "failure_subtype=production_alias_not_updated"
    )


def test_alias_verifier_mixed_route_outcomes_complete_on_exact_proof(
    tmp_path: Path,
) -> None:
    # Mixed plain/stable/canary outcomes: each route accumulates exact proof
    # independently while unknowns on sibling routes are non-contradictory.
    result = _run_alias_verifier(
        tmp_path,
        current_id="dpl_target",
        build_sha=EXPECTED_COMMIT_SHA,
        max_attempts=4,
        required_rounds=2,
        curl_sequence=_alias_observation_sequence(
            ("match", "match", "transient"),
            ("match", "transient", "match"),
            ("match", "transient", "match"),
            ("match", "match", "match"),
        ),
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert "outcome=unknown" in result.stdout
    assert "proof=2/2" in result.stdout


def test_alias_verifier_replays_run_31440637821_stable_alternation(
    tmp_path: Path,
) -> None:
    # Replay of Production Controller run 31440637821 (OAuth job 93628867652):
    # plain and canary reached 2/2 exact while stable alternated exact HTTP 200
    # and transport HTTP 000. The exact generation must resolve to verified.
    fixture = json.loads(
        (FIXTURES_DIR / "production-alias-run-31440637821-replay.json").read_text()
    )
    sequence = _alias_observation_sequence(
        *(tuple(attempt) for attempt in fixture["observationRounds"])
    )
    result = _run_alias_verifier(
        tmp_path,
        current_id=fixture["deploymentId"],
        build_sha=fixture["shortSha"],
        max_attempts=fixture["verifier"]["maxAttempts"],
        required_rounds=fixture["verifier"]["requiredRounds"],
        curl_sequence=sequence,
        expected_sha=fixture["sha"],
        deployment_id=fixture["deploymentId"],
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert fixture["deploymentId"] in result.stdout
    assert fixture["shortSha"] in result.stdout


def test_alias_verifier_rejects_stale_sha_even_on_expected_deployment(
    tmp_path: Path,
) -> None:
    result = _run_alias_verifier(
        tmp_path,
        current_id="dpl_target",
        build_sha="b" * 40,
        route_retries=2,
        curl_sequence="stale-sha,match,match",
    )

    assert result.returncode == 1
    assert (tmp_path / "github-output").read_text().strip() == (
        "failure_subtype=production_alias_not_updated"
    )
    assert len((tmp_path / "curl-calls").read_text().splitlines()) == 3


def test_alias_verifier_does_not_retry_wrong_environment_response(
    tmp_path: Path,
) -> None:
    result = _run_alias_verifier(
        tmp_path,
        current_id="dpl_target",
        build_sha=EXPECTED_COMMIT_SHA,
        route_retries=2,
        curl_sequence="wrong-environment,match,match",
    )

    assert result.returncode == 1
    assert "environment=preview" in result.stdout
    assert len((tmp_path / "curl-calls").read_text().splitlines()) == 3


def test_alias_verifier_does_not_retry_non_transport_http_response(
    tmp_path: Path,
) -> None:
    result = _run_alias_verifier(
        tmp_path,
        current_id="dpl_target",
        build_sha=EXPECTED_COMMIT_SHA,
        route_retries=2,
        curl_sequence="http-503,match,match",
    )

    assert result.returncode == 1
    assert "HTTP 503" in result.stdout
    assert len((tmp_path / "curl-calls").read_text().splitlines()) == 3


def test_alias_verifier_rejects_wrong_current_id_even_with_expected_sha(
    tmp_path: Path,
) -> None:
    result = _run_alias_verifier(
        tmp_path, current_id="dpl_old", build_sha=EXPECTED_COMMIT_SHA
    )

    assert result.returncode == 1
    assert (tmp_path / "github-output").read_text().strip() == (
        "failure_subtype=production_alias_not_updated"
    )
