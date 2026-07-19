"""Regression tests for self-hosted agent workflow hygiene."""
import os
import re
import subprocess
import textwrap
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = REPO_ROOT / ".github" / "workflows"


HOT_PATH_WORKFLOWS = (
    "auto-ready-agent-drafts.yml",
    "agent-tick.yml",
    "auto-fix-lint-agent-drafts.yml",
    "stuck-draft-autoclose.yml",
    "merge-queue-autoenroll.yml",
)

FULL_CHECKOUT_JOBS = (
    ("ci.yml", "ci-unit-tests"),
)

FLEET_CONTROLLER_JOBS = (
    ("auto-pr-on-push.yml", "open-pr"),
    ("auto-ready-agent-drafts.yml", "auto-ready"),
    ("merge-queue-autoenroll.yml", "enroll"),
    ("merge-queue-autoenroll.yml", "rebase"),
    ("agent-tick.yml", "auto-ready"),
)

MODEL_OR_ADVISORY_JOBS = (
    ("claude.yml", "claude"),
    ("claude-review.yml", "review"),
    ("eval.yml", "eval"),
    ("eval-real-model.yml", "real-model-eval"),
    ("github-ai-orchestrator.yml", "implement_and_open_pr"),
    ("main-autofix.yml", "autofix"),
    ("sentry-autofix.yml", "autofix"),
    ("taste-classifier.yml", "classify"),
    ("taste-label-guard.yml", "guard"),
)

HOSTED_DEEP_EVIDENCE_JOBS = (
    ("e2e-full-matrix.yml", "e2e-full-matrix"),
    ("e2e-full-matrix.yml", "notify"),
    ("nightly-testing-agent.yml", "context"),
    ("nightly-testing-agent.yml", "deterministic"),
    ("nightly-testing-agent.yml", "mutation-hotspots"),
    ("nightly-testing-agent.yml", "candidate-validation"),
    ("nightly-testing-agent.yml", "report"),
    ("nightly-tests.yml", "knip"),
    ("nightly-tests.yml", "unit-tests"),
    ("nightly-tests.yml", "e2e-tests"),
    ("nightly-tests.yml", "notify"),
    ("synthetic-monitoring.yml", "synthetic-test"),
    ("test-coverage-audit.yml", "audit"),
    ("sonarcloud.yml", "sonarcloud"),
    ("security.yml", "gitleaks"),
    ("security.yml", "trufflehog"),
    ("security.yml", "trivy"),
    ("security.yml", "scorecard"),
    ("security.yml", "commit-signature-check"),
    ("screenshots.yml", "generate"),
    ("test-flakiness-report.yml", "analyze-flakiness"),
    ("ci-duration-ratchet.yml", "measure"),
    ("sentry-error-gate.yml", "sentry-gate"),
    ("cost-anomaly-gate.yml", "evaluate"),
    ("main-ci-health-monitor.yml", "monitor"),
    ("main-ci-health-monitor.yml", "auto-rerun"),
    ("visual-a11y.yml", "ci-visual-path-changes"),
    ("visual-a11y.yml", "storybook-a11y"),
    ("visual-regression.yml", "visual-regression"),
)

HOSTED_POST_MERGE_JOBS = (
    ("linear-sync-on-merge.yml", "sync_done"),
    ("neon-ephemeral-branch-cleanup.yml", "delete-neon-branch"),
)

HOSTED_API_ONLY_PR_CONTROLLERS = (
    ("dependabot-auto-merge.yml", "auto-merge"),
    ("pr-size-guard-label-override.yml", "override"),
)

HOSTED_BACKGROUND_CONTROLLER_JOBS = (
    ("agent-harness-health-report.yml", "report"),
    ("agent-landing-sweep.yml", "sweep"),
    ("agent-tick.yml", "landing-sweep"),
    ("agent-tick.yml", "cost-anomaly"),
    ("agent-tick.yml", "dispatch"),
    ("agent-tick.yml", "neon-cleanup"),
    ("agent-tick.yml", "synthetic-monitoring"),
    ("auto-fix-lint-agent-drafts.yml", "auto-fix-lint"),
    ("doc-gardening-agent.yml", "garden"),
    ("github-ai-dispatcher.yml", "dispatch"),
    ("github-ai-orchestrator.yml", "guard"),
    ("github-ai-orchestrator.yml", "claim_issue"),
    ("github-ai-orchestrator.yml", "sync_in_review"),
    ("neon-scheduled-cleanup.yml", "scheduled-cleanup"),
    ("observability-issue.yml", "sync-issue"),
    ("reusable-ci-lint.yml", "lint"),
    ("reusable-ci-lint.yml", "typecheck"),
    ("reusable-ci-lint.yml", "knip"),
    ("reusable-ci-lint.yml", "env-example-guard"),
    ("reusable-ci-lint.yml", "promptfoo-evals"),
    ("reusable-ci-lint.yml", "golden-eval-set"),
)


def _job_block(workflow: str, job_name: str) -> str:
    """Return one top-level workflow job using its two-space YAML boundary."""
    content = (WORKFLOWS / workflow).read_text(encoding="utf-8")
    marker = f"  {job_name}:\n"
    assert marker in content, f"{workflow}: missing jobs.{job_name}"
    remainder = content.split(marker, 1)[1]
    lines: list[str] = []
    for line in remainder.splitlines():
        if line.startswith("  ") and not line.startswith("    "):
            break
        lines.append(line)
    return "\n".join(lines)


def _step_block(workflow: str, step_name: str) -> str:
    """Return one workflow step using its six-space YAML boundary."""
    content = (WORKFLOWS / workflow).read_text(encoding="utf-8")
    marker = f"      - name: {step_name}\n"
    assert marker in content, f"{workflow}: missing step {step_name}"
    remainder = content.split(marker, 1)[1]
    return remainder.split("\n      - name:", 1)[0]


def _sparse_checkout_paths(step_block: str) -> set[str]:
    """Return the literal paths from an actions/checkout sparse list."""
    marker = "          sparse-checkout: |\n"
    assert marker in step_block, "missing sparse-checkout list"
    paths: set[str] = set()
    for line in step_block.split(marker, 1)[1].splitlines():
        if not line.startswith("            "):
            break
        paths.add(line.strip())
    return paths


LOCAL_IMPORT_RE = re.compile(
    r"(?:from\s+|import\s*(?:\(\s*)?)[\"'](\.{1,2}/[^\"']+)[\"']"
)
LOCAL_RESOURCE_RE = re.compile(
    r"new URL\([\"'](\.{1,2}/[^\"']+)[\"'],\s*import\.meta\.url\)"
)


def _assert_local_runtime_closure(materialized: set[str], entrypoint: str) -> None:
    """Fail when materialized ESM references an omitted local dependency."""
    pending = [entrypoint]
    visited: set[str] = set()

    while pending:
        relative_path = pending.pop()
        if relative_path in visited:
            continue
        visited.add(relative_path)
        source_path = REPO_ROOT / relative_path
        source = source_path.read_text(encoding="utf-8")

        def assert_materialized(local_path: str) -> str:
            dependency = (source_path.parent / local_path).resolve()
            dependency_relative = dependency.relative_to(REPO_ROOT).as_posix()
            assert dependency_relative in materialized, (
                f"{relative_path} references {dependency_relative}, but the workflow "
                "sparse checkout does not materialize it"
            )
            return dependency_relative

        for import_path in LOCAL_IMPORT_RE.findall(source):
            pending.append(assert_materialized(import_path))
        for resource_path in LOCAL_RESOURCE_RE.findall(source):
            assert_materialized(resource_path)


def test_agent_hot_paths_do_not_run_repo_tests() -> None:
    """Fleet scans must not fail on a contaminated sparse self-hosted checkout."""
    for workflow_name in HOT_PATH_WORKFLOWS:
        content = (WORKFLOWS / workflow_name).read_text(encoding="utf-8")
        assert "test_gh_retry.py" not in content, workflow_name


def test_stuck_draft_autoclose_is_manual_and_hosted_only() -> None:
    """The all-PR drain must never schedule an automatic draft closer."""
    workflow = (WORKFLOWS / "stuck-draft-autoclose.yml").read_text(
        encoding="utf-8"
    )
    trigger_block = workflow.split("\non:\n", 1)[1].split(
        "\nconcurrency:", 1
    )[0]

    assert "workflow_dispatch:" in trigger_block
    assert "schedule:" not in trigger_block
    assert "runs-on: ubuntu-latest" in _job_block(
        "stuck-draft-autoclose.yml", "autoclose"
    )
    assert "CI_FAST_RUNNER" not in _job_block(
        "stuck-draft-autoclose.yml", "autoclose"
    )


def test_node_only_agent_jobs_do_not_write_to_system_corepack_dir() -> None:
    """Node scripts must not call corepack enable on locked-down runners."""
    for workflow_name in (
        "agent-pipeline.yml",
        "pr-conflict-handler.yml",
        "merge-queue-autoenroll.yml",
    ):
        content = (WORKFLOWS / workflow_name).read_text(encoding="utf-8")
        assert "run: corepack enable" not in content, workflow_name


def test_trigger_guard_materializes_systemic_detector_import_closure() -> None:
    """The detector must not fail before it can classify a systemic failure."""
    step = _step_block("agent-pipeline.yml", "Checkout systemic detector")
    materialized = _sparse_checkout_paths(step)
    entrypoint = "scripts/lib/detect-systemic-failures.mjs"

    assert entrypoint in materialized
    _assert_local_runtime_closure(materialized, entrypoint)


def test_self_hosted_gate_jobs_materialize_full_checkout() -> None:
    """Jobs that need repo scripts/actions must recover from sparse workspaces."""
    required_steps = (
        "Reset workspace git state (self-hosted)",
        "uses: actions/checkout@",
        "Materialize full tree (self-hosted)",
        "git checkout-index -a -f",
        "Verify checkout sentinel",
        "uses: ./.github/actions/setup-node-pnpm",
    )

    for workflow_name, job_name in FULL_CHECKOUT_JOBS:
        block = _job_block(workflow_name, job_name)
        positions = []
        for step in required_steps:
            assert step in block, (workflow_name, job_name, step)
            positions.append(block.index(step))
        assert positions == sorted(positions), (workflow_name, job_name)


def test_trufflehog_job_does_not_require_docker() -> None:
    """Self-hosted runners do not expose a Docker socket for trufflehog action."""
    content = (WORKFLOWS / "security.yml").read_text(encoding="utf-8")
    assert "trufflesecurity/trufflehog@" not in content
    assert "ci-pr-trufflehog" in content


def test_merge_gated_secret_scans_use_clean_hosted_runners() -> None:
    """Secret scanners need a fresh, authoritative Git object store."""
    for job_name in ("gitleaks", "trufflehog"):
        block = _job_block("security.yml", job_name)
        assert "runs-on: ubuntu-latest" in block, job_name
        assert "runs-on: ${{ vars.CI_FAST_RUNNER }}" not in block, job_name


def test_gated_secret_scan_fetches_only_the_exact_event_range() -> None:
    """The fast gate must not fetch every branch and tag to scan one diff."""
    block = _job_block("ci.yml", "ci-secret-scan")

    assert "fetch-depth: 1" in block
    assert "fetch-depth: 0" not in block
    assert "prepare-ci-secret-scan-range.sh" in block
    assert "github.event.pull_request.base.sha" in block
    assert "github.event.merge_group.base_sha" in block
    assert "github.event.before" in block
    assert '"$BASE_SHA" "$GITHUB_SHA" "$GITHUB_REF"' in block
    assert 'scan-secrets.sh ci-pr "$BASE_SHA"' in block
    assert 'git fetch origin "${{ github.base_ref }}"' not in block

    helper = REPO_ROOT / "scripts/security/prepare-ci-secret-scan-range.sh"
    assert helper.is_file()
    assert os.access(helper, os.X_OK)


def test_fleet_controllers_checkout_main_policy_code() -> None:
    """PR events must not replace fleet scripts with the triggering merge ref."""
    for workflow, job_name in FLEET_CONTROLLER_JOBS:
        block = _job_block(workflow, job_name)
        assert "uses: actions/checkout@" in block, (workflow, job_name)
        assert "ref: main" in block, (workflow, job_name)
        assert "persist-credentials: false" in block, (workflow, job_name)


def test_gh_fleet_controllers_use_hosted_cli_contract() -> None:
    """Controller jobs invoking gh must not depend on heterogeneous runners."""
    for workflow, job_name in FLEET_CONTROLLER_JOBS:
        block = _job_block(workflow, job_name)
        assert "runs-on: ubuntu-latest" in block, (workflow, job_name)
        assert "run: gh --version" in block, (workflow, job_name)


def test_conflict_handler_coalesces_audits_without_cancelling_manual_apply() -> None:
    """CI-completion audits may supersede each other, never operator runs."""
    block = _job_block("pr-conflict-handler.yml", "plan")

    assert "runs-on: ubuntu-latest" in block
    assert "runs-on: ${{ vars.CI_FAST_RUNNER }}" not in block
    assert "github.event.workflow_run.event == 'pull_request'" in block
    assert "github.event.workflow_run.conclusion != 'cancelled'" in block
    assert (
        "group: pr-conflict-handler-${{ github.repository }}-"
        "${{ github.event_name == 'workflow_dispatch' && "
        "'operator' || 'audit' }}"
    ) in block
    assert (
        "cancel-in-progress: ${{ github.event_name != 'workflow_dispatch' }}"
        in block
    )
    assert 'if [[ "${{ github.event_name }}" == "workflow_dispatch"' in block
    assert '"${{ inputs.apply }}" == "true"' in block
    assert 'MODE="--apply"' in block


def test_workflow_run_controllers_ignore_non_pr_and_stale_runs() -> None:
    """Main/merge-group completions must not wake PR fleet controllers."""
    for workflow, job_name in (
        ("merge-queue-autoenroll.yml", "enroll"),
        ("auto-ready-agent-drafts.yml", "auto-ready"),
        ("pr-conflict-handler.yml", "plan"),
    ):
        block = _job_block(workflow, job_name)
        assert "github.event.workflow_run.event == 'pull_request'" in block, workflow
        assert "github.event.workflow_run.conclusion != 'cancelled'" in block, workflow

    pipeline = _job_block("agent-pipeline.yml", "guard")
    assert "github.event.workflow_run.event == 'pull_request'" in pipeline
    assert 'if [[ "$PR_HEAD_SHA" != "$HEAD_SHA" ]]' in pipeline
    assert "workflow_run.pull_requests[0].number" in pipeline
    assert "pulls?state=open" not in pipeline


def test_agent_pipeline_retry_budget_is_durable() -> None:
    """Each remediation run must record the attempt its guard counted."""
    fix = _job_block("agent-pipeline.yml", "fix")
    assert "Record bounded remediation attempt" in fix
    assert 'ATTEMPT_LABEL="agent-fix-${TRIGGER_TYPE}-${SHORT_SHA}-${ATTEMPT}"' in fix
    assert '"labels[]=$ATTEMPT_LABEL"' in fix


def test_conflict_paths_never_merge_or_force_push_pr_branches() -> None:
    """Conflict repair uses the shared exact-head GitHub REBASE mutation only."""
    fleet = (REPO_ROOT / "scripts/pr-conflict-handler.mjs").read_text(
        encoding="utf-8"
    )

    assert not (WORKFLOWS / "auto-resolve-conflicts.yml").exists()
    assert not (REPO_ROOT / ".github/scripts/resolve-pr-conflict.mjs").exists()
    assert not (WORKFLOWS / "agent-pr-verify-ready.yml").exists()
    assert "tryGitHubRebase" in fleet
    assert "git merge" not in fleet
    assert "force-with-lease" not in fleet
    assert "gh pr update-branch" not in fleet


def test_standalone_health_monitors_have_independent_bounded_schedules() -> None:
    """Critical monitors must not depend on the disabled Agent Tick monolith."""
    schedules = {
        "main-ci-health-monitor.yml": "'8,28,48 * * * *'",
        "runner-health-monitor.yml": "'2,12,22,32,42,52 * * * *'",
        "synthetic-monitoring.yml": "'17 */6 * * *'",
    }
    for workflow, cron in schedules.items():
        content = (WORKFLOWS / workflow).read_text(encoding="utf-8")
        assert "schedule:" in content, workflow
        assert cron in content, workflow

    for workflow, job_name in (
        ("main-ci-health-monitor.yml", "monitor"),
        ("main-ci-health-monitor.yml", "auto-rerun"),
        ("runner-health-monitor.yml", "monitor"),
    ):
        assert "runs-on: ubuntu-latest" in _job_block(workflow, job_name)


def test_main_autofix_waits_for_rerun_and_exact_sha_repair_ownership() -> None:
    """Schedule ticks must not dispatch or alert repeatedly for owned failures."""
    evaluator = (
        REPO_ROOT / ".github/actions/eval-main-health/action.yml"
    ).read_text(encoding="utf-8")
    autofix = (WORKFLOWS / "main-autofix.yml").read_text(encoding="utf-8")

    assert "const failingRunAttempt = Number(latestFailure?.run_attempt ?? 0)" in evaluator
    assert "failingRunAttempt < 2" in evaluator
    assert "autofixSkipReason = 'awaiting_one_shot_rerun'" in evaluator
    assert "repairInFlight = openPulls.some" in evaluator
    assert "run.head_sha === failingSha" in evaluator
    assert "github.rest.repos.listCommitStatusesForRef" in evaluator
    assert "github.rest.repos.getCommit" in evaluator
    assert "latestFailure.head_sha !== currentMainSha" in evaluator
    assert "ownedAttempts >= autofixAttemptLimit" in evaluator
    assert "withinLease(latestOwnershipStatus.created_at)" in evaluator
    assert "uncertain:repair_state_unavailable" in evaluator
    assert "status.context === 'main-autofix/ownership'" in evaluator
    assert "description.match(/^owned:run-" in evaluator
    assert "description.startsWith('terminal:')" in evaluator
    assert "const recentAttemptShas = new Set([currentFailingSha])" in evaluator
    assert "(status.description ?? '').startsWith('owned:')" in evaluator
    assert "candidateStatuses = await github.paginate" in evaluator
    assert "if (r.head_sha) recentShas.add(r.head_sha)" not in evaluator
    assert "autofixSkipReason = 'repair_in_flight'" in evaluator
    assert "autofixSkipReason = 'repair_marker_owned'" in evaluator
    assert "autofixSkipReason = 'terminal_repair_recorded'" in evaluator
    assert "autofixSkipReason = 'repair_state_unavailable'" in evaluator
    assert "const shouldAlert =" in evaluator
    assert "(repairStateKnown || firstUncertaintyAlert)" in evaluator
    assert "failingRunAttempt === 1" in evaluator
    assert autofix.count("context: 'main-autofix/ownership'") == 2
    assert "Record exact-SHA repair ownership" in autofix
    assert "Finalize exact-SHA repair ownership" in autofix
    assert "terminal:no_changes" in autofix
    assert "released:pr-${prNumber}" in autofix
    assert "forcing autofix" not in autofix
    assert "dispatch_target_not_current_failure" in autofix

    for workflow, job_name in (
        ("main-ci-health-monitor.yml", "monitor"),
        ("main-autofix.yml", "evaluate"),
    ):
        assert "statuses: write" in _job_block(workflow, job_name)

    agent_tick = (WORKFLOWS / "agent-tick.yml").read_text(encoding="utf-8")
    assert "\n  main-ci-health:\n" not in agent_tick
    agent_tick_trigger = agent_tick.split("\non:\n", 1)[1].split(
        "\npermissions:", 1
    )[0]
    assert "workflow_dispatch:" in agent_tick_trigger
    assert "schedule:" not in agent_tick_trigger

    landing_sweep = _job_block("agent-tick.yml", "landing-sweep")
    assert "statuses: read" in landing_sweep
    assert "statuses: write" not in landing_sweep


def test_auto_ready_compensates_live_hold_race(tmp_path: Path) -> None:
    """A hold arriving after promotion restores the exact PR to draft."""
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    state_file = tmp_path / "state"
    state_file.write_text("draft", encoding="utf-8")
    call_log = tmp_path / "calls.log"
    fake_gh = fake_bin / "gh"
    fake_gh.write_text(
        textwrap.dedent(
            f"""\
            #!/usr/bin/env bash
            set -euo pipefail
            printf '%s\\n' "$*" >> {call_log}
            if [[ "$1 $2" == "pr list" ]]; then
              printf '%s\\n' '[{{"n":42,"t":"race guard","draft":true,"m":"MERGEABLE","ms":"CLEAN","head":"codex/race","oid":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","L":[]}}]'
            elif [[ "$1 $2" == "pr view" ]]; then
              phase="$(cat {state_file})"
              if [[ "$phase" == "ready" ]]; then
                printf '%s\\n' '{{"draft":false,"head":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","branch":"codex/race","labels":["gated"],"mergeable":"MERGEABLE","state":"OPEN"}}'
              elif [[ "$phase" == "restored" ]]; then
                printf '%s\\n' '{{"draft":true,"head":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","branch":"codex/race","labels":["gated"],"mergeable":"MERGEABLE","state":"OPEN"}}'
              else
                printf '%s\\n' '{{"draft":true,"head":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","branch":"codex/race","labels":[],"mergeable":"MERGEABLE","state":"OPEN"}}'
              fi
            elif [[ "$1 $2" == "pr checks" ]]; then
              printf '%s\\n' '[{{"bucket":"pass","state":"SUCCESS","name":"PR Ready"}},{{"bucket":"pass","state":"SUCCESS","name":"Migration Guard"}},{{"bucket":"pass","state":"SUCCESS","name":"Fork PR Gate"}},{{"bucket":"pass","state":"SUCCESS","name":"PR Size Guard"}}]'
            elif [[ "$1 $2" == "pr ready" ]]; then
              if [[ " $* " == *" --undo "* ]]; then
                printf '%s\\n' restored > {state_file}
              else
                printf '%s\\n' ready > {state_file}
              fi
            elif [[ "$1" == "api" ]]; then
              :
            elif [[ "$1 $2" == "pr comment" ]]; then
              :
            else
              printf 'unexpected fake gh invocation: %s\\n' "$*" >&2
              exit 2
            fi
            """
        ),
        encoding="utf-8",
    )
    fake_gh.chmod(0o755)

    env = os.environ.copy()
    env.update(
        {
            "PATH": f"{fake_bin}:{env['PATH']}",
            "REPO": "JovieInc/Jovie",
            "GH_RETRY_ATTEMPTS": "1",
            "ATTEMPT_COOLDOWN_HOURS": "0",
            "JOVIE_AGENT_PROFILE": "coder",
        }
    )
    result = subprocess.run(
        ["bash", str(REPO_ROOT / "scripts/auto-ready-agent-drafts.sh")],
        cwd=REPO_ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=False,
        timeout=20,
    )

    assert result.returncode == 0, result.stderr
    assert "compensated: restored #42 to draft" in result.stdout
    assert state_file.read_text(encoding="utf-8").strip() == "restored"
    calls = call_log.read_text(encoding="utf-8")
    assert "pr ready 42 -R JovieInc/Jovie" in calls
    assert "pr ready 42 -R JovieInc/Jovie --undo" in calls


def test_scheduled_synthetic_alerts_before_preserving_failure() -> None:
    """Setup, parser, and canary failures must all reach alerting before red."""
    workflow = (WORKFLOWS / "synthetic-monitoring.yml").read_text(
        encoding="utf-8"
    )
    parse = _step_block("synthetic-monitoring.yml", "Parse test results")
    alert = _step_block("synthetic-monitoring.yml", "Send Slack Alert on Failure")
    preserve = _step_block("synthetic-monitoring.yml", "Fail job if tests failed")

    assert "if: ${{ always() }}" in parse
    failure_safe = (
        "always() && (failure() || "
        "steps.test-results.outputs.test_status != 'passed')"
    )
    assert failure_safe in alert
    assert failure_safe in preserve
    assert workflow.index("Send Slack Alert on Failure") < workflow.index(
        "Fail job if tests failed"
    )


def test_live_model_work_never_fans_out_from_pull_requests() -> None:
    """PR evals stay deterministic; live-model spend belongs off the PR path."""
    real_model = (WORKFLOWS / "eval-real-model.yml").read_text(encoding="utf-8")
    deterministic = (WORKFLOWS / "eval.yml").read_text(encoding="utf-8")

    assert "pull_request:" not in real_model
    assert "pnpm exec vitest run" in real_model
    assert "github.event_name == 'pull_request' && '0'" in deterministic


def test_deep_lanes_are_staggered_and_bounded() -> None:
    """Scheduled exhaustive coverage should not fan out across the runner pool."""
    full_matrix = (WORKFLOWS / "e2e-full-matrix.yml").read_text(encoding="utf-8")
    nightly_agent = (WORKFLOWS / "nightly-testing-agent.yml").read_text(
        encoding="utf-8"
    )

    assert "max-parallel: 1" in full_matrix
    assert "needs: [context, deterministic]" in nightly_agent
    assert "'30 4 * * *'" in nightly_agent

    nightly = (WORKFLOWS / "nightly-tests.yml").read_text(encoding="utf-8")
    screenshots = (WORKFLOWS / "screenshots.yml").read_text(encoding="utf-8")
    harness = (WORKFLOWS / "agent-harness-health-report.yml").read_text(
        encoding="utf-8"
    )
    assert "'30 23 * * *'" in nightly
    assert "'0 9 * * *'" in screenshots
    assert "'0 9 * * 2'" in harness


def test_cost_monitoring_docs_match_activation_gated_observer() -> None:
    """Declared scheduling must not be confused with activation or rollback."""
    workflow = (WORKFLOWS / "cost-anomaly-gate.yml").read_text(encoding="utf-8")
    cost_docs = (REPO_ROOT / "docs/COST_MONITORING.md").read_text(
        encoding="utf-8"
    )
    audit = (REPO_ROOT / "docs/AUTOMATION_AUDIT.md").read_text(
        encoding="utf-8"
    )

    trigger_block = workflow.split("on:", 1)[1].split("# Prevent", 1)[0]
    assert "workflow_dispatch:" in trigger_block
    assert "schedule:" in trigger_block
    assert "'*/15 * * * *'" in trigger_block
    assert "workflow enablement is an explicit operational step" in cost_docs
    assert "never mutates production" in cost_docs
    assert "vercel rollback" not in workflow
    assert "Cost Anomaly Gate" in audit
    assert "Keep activation-gated" in audit


def test_auto_pr_compares_trigger_branch_without_executing_its_checkout() -> None:
    """The pushed branch is controller input; current main supplies helpers."""
    block = _job_block("auto-pr-on-push.yml", "open-pr")
    assert 'git fetch origin "refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"' in block
    assert 'git diff --name-only "origin/main...origin/$BRANCH"' in block
    assert "origin/main...HEAD" not in block


def test_claude_review_uses_hosted_bun_prerequisites() -> None:
    """setup-bun must not land on self-hosted images missing unzip."""
    block = _job_block("claude-review.yml", "review")
    assert "runs-on: ubuntu-latest" in block
    assert "runs-on: ${{ vars.CI_FAST_RUNNER }}" not in block
    assert "uses: oven-sh/setup-bun@" in block


def test_taste_policy_runs_trusted_base_code_with_write_authority() -> None:
    """PR data may steer policy, but PR-controlled code must never execute."""
    for workflow, job_name in (
        ("taste-classifier.yml", "classify"),
        ("taste-label-guard.yml", "guard"),
    ):
        source = (WORKFLOWS / workflow).read_text(encoding="utf-8")
        block = _job_block(workflow, job_name)
        assert "\n  pull_request_target:\n" in source
        assert "\n  pull_request:\n" not in source
        assert "ref: ${{ github.event.pull_request.base.sha }}" in block
        assert "persist-credentials: false" in block
        assert "ref: ${{ github.event.pull_request.head.sha }}" not in block
        assert "pnpm install" not in block
        assert "corepack enable" not in block
        assert "runs-on: ubuntu-latest" in block


def test_model_and_advisory_jobs_never_consume_fixed_ci_runners() -> None:
    """Long or advisory work cannot starve deterministic merge capacity."""
    for workflow, job_name in MODEL_OR_ADVISORY_JOBS:
        block = _job_block(workflow, job_name)
        assert "runs-on: ubuntu-latest" in block, (workflow, job_name)
        assert "CI_FAST_RUNNER" not in block, (workflow, job_name)
        assert "CI_UNIT_RUNNER" not in block, (workflow, job_name)


def test_deep_evidence_jobs_use_hosted_capacity() -> None:
    """Deep evidence must not consume the five fixed merge-throughput runners."""
    for workflow, job_name in HOSTED_DEEP_EVIDENCE_JOBS:
        block = _job_block(workflow, job_name)
        assert "runs-on: ubuntu-latest" in block, (workflow, job_name)
        assert "CI_FAST_RUNNER" not in block, (workflow, job_name)
        assert "CI_UNIT_RUNNER" not in block, (workflow, job_name)


def test_post_merge_fanout_never_consumes_fixed_ci_capacity() -> None:
    """Every merged PR fans these jobs out, so they must stay off fixed runners."""
    for workflow, job_name in HOSTED_POST_MERGE_JOBS:
        block = _job_block(workflow, job_name)
        assert "runs-on: ubuntu-latest" in block, (workflow, job_name)
        assert "CI_FAST_RUNNER" not in block, (workflow, job_name)
        assert "CI_UNIT_RUNNER" not in block, (workflow, job_name)


def test_api_only_pr_controllers_never_consume_fixed_ci_capacity() -> None:
    """Queue and check API work must leave fixed runners to deterministic tests."""
    for workflow, job_name in HOSTED_API_ONLY_PR_CONTROLLERS:
        block = _job_block(workflow, job_name)
        assert "runs-on: ubuntu-latest" in block, (workflow, job_name)
        assert "CI_FAST_RUNNER" not in block, (workflow, job_name)
        assert "CI_UNIT_RUNNER" not in block, (workflow, job_name)

    dependabot = (WORKFLOWS / "dependabot-auto-merge.yml").read_text(
        encoding="utf-8"
    )
    assert "Graphite" not in dependabot
    assert "native merge-queue enrollment" in dependabot


def test_background_controllers_never_consume_fixed_ci_capacity() -> None:
    """Schedules, API controllers, and dormant lanes cannot steal unit slots."""
    for workflow, job_name in HOSTED_BACKGROUND_CONTROLLER_JOBS:
        block = _job_block(workflow, job_name)
        assert "runs-on: ubuntu-latest" in block, (workflow, job_name)
        assert "CI_FAST_RUNNER" not in block, (workflow, job_name)
        assert "CI_UNIT_RUNNER" not in block, (workflow, job_name)


def test_heartbeat_is_the_only_scheduled_generic_fixed_runner_consumer() -> None:
    """Schedules cannot silently compete with the bounded merge unit pool."""
    scheduled_fixed: list[str] = []
    for workflow_path in sorted(WORKFLOWS.glob("*.yml")):
        content = workflow_path.read_text(encoding="utf-8")
        if "\non:\n" not in content:
            continue
        trigger = content.split("\non:\n", 1)[1].split("\npermissions:", 1)[0]
        if "schedule:" not in trigger:
            continue
        if any(
            marker in content
            for marker in (
                "runs-on: jovie-runner",
                "runs-on: ${{ vars.CI_FAST_RUNNER",
                "runs-on: ${{ vars.CI_UNIT_RUNNER",
            )
        ):
            scheduled_fixed.append(workflow_path.name)

    assert scheduled_fixed == ["runner-heartbeat.yml"]
