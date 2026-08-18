"""Static contracts for the Linear-only control-plane cutover.

GitHub remains the source for pull requests, Actions, and merge-queue state.
GitHub Issues are historical/reporting-only and must not select or create work.
"""

from pathlib import Path
import re


REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = REPO_ROOT / ".github" / "workflows"
RETIRED_GUARD = "if: ${{ github.event_name == '__retired_linear_only__' }}"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _trigger_block(workflow: str) -> str:
    match = re.search(
        r"^on:\n(.*?)(?=^(?:permissions|concurrency|jobs):)",
        workflow,
        re.MULTILINE | re.DOTALL,
    )
    assert match, "missing workflow triggers"
    return match.group(1)


def _job_block(workflow: str, job: str) -> str:
    match = re.search(
        rf"^  {re.escape(job)}:\n(.*?)(?=^  [A-Za-z0-9_-]+:\n|\Z)",
        workflow,
        re.MULTILINE | re.DOTALL,
    )
    assert match, f"missing job: {job}"
    return match.group(1)


def _step_block(workflow: str, step: str) -> str:
    marker = f"      - name: {step}\n"
    assert marker in workflow, f"missing step: {step}"
    tail = workflow.split(marker, 1)[1]
    next_step = tail.find("\n      - name:")
    return tail if next_step == -1 else tail[:next_step]


def test_github_issue_dispatchers_are_manual_only_and_hard_disabled() -> None:
    dispatcher = _read(WORKFLOWS / "github-ai-dispatcher.yml")
    orchestrator = _read(WORKFLOWS / "github-ai-orchestrator.yml")
    tick = _read(WORKFLOWS / "agent-tick.yml")

    dispatcher_triggers = _trigger_block(dispatcher)
    assert "workflow_dispatch:" in dispatcher_triggers
    assert "issues:" not in dispatcher_triggers
    assert "pull_request:" not in dispatcher_triggers
    assert "workflow_run:" not in dispatcher_triggers
    assert RETIRED_GUARD in _job_block(dispatcher, "dispatch")
    assert "issues: read" not in dispatcher
    assert "issues: write" not in dispatcher

    orchestrator_triggers = _trigger_block(orchestrator)
    assert "workflow_dispatch:" in orchestrator_triggers
    assert "issues:" not in orchestrator_triggers
    for job in ("guard", "claim_issue", "implement_and_open_pr", "finalize_claim"):
        assert RETIRED_GUARD in _job_block(orchestrator, job)
    assert "issues: read" not in orchestrator
    assert "issues: write" not in orchestrator

    assert RETIRED_GUARD in _job_block(tick, "dispatch")
    assert RETIRED_GUARD in _job_block(tick, "cost-anomaly")
    assert "issues: read" not in tick
    assert "issues: write" not in tick


def test_github_issue_events_cannot_select_claude_work() -> None:
    workflow = _read(WORKFLOWS / "claude.yml")
    triggers = _trigger_block(workflow)

    assert "issues:" not in triggers
    assert "issue_comment:" in triggers
    assert "github.event.issue.pull_request" in _job_block(workflow, "claude")


def test_active_workflows_do_not_create_or_update_github_issues() -> None:
    retired_steps = (
        ("production-controller-health.yml", "Open one manual-recovery incident"),
        ("runner-health-monitor.yml", "Open one fixed-runner degradation incident"),
        ("test-coverage-audit.yml", "Notify on failure"),
        ("test-flakiness-report.yml", "Find or create tracking issue"),
        ("test-flakiness-report.yml", "Create or update tracking issue"),
        (
            "test-flakiness-report.yml",
            "Auto-file deflake issues for high-severity tests",
        ),
    )
    for name, step in retired_steps:
        workflow = _read(WORKFLOWS / name)
        assert "issues: write" not in workflow
        assert RETIRED_GUARD in _step_block(workflow, step)

    observability = _read(WORKFLOWS / "observability-issue.yml")
    assert "issues: write" not in observability
    assert RETIRED_GUARD in _job_block(observability, "sync-issue")

    cost = _read(WORKFLOWS / "cost-anomaly-gate.yml")
    assert "Prepare Linear-only anomaly receipt" in cost
    assert "gh issue create" not in cost
    assert "gh issue list" not in cost
    visual_review = _read(WORKFLOWS / "pr-visual-review.yml")
    assert "gh issue create" not in visual_review
    assert "gh issue list" not in visual_review
    assert "github-ai-orchestrator.yml" not in visual_review
    assert "actions: write" not in _job_block(visual_review, "review")


def test_historical_issue_reporting_is_visibly_degraded_not_canonical() -> None:
    report = _read(WORKFLOWS / "agent-harness-health-report.yml")
    hud = _read(REPO_ROOT / "scripts/hermes/gem-ops-hud.py")
    scoreboard = _read(REPO_ROOT / "scripts/hermes/jobs/pipeline-scoreboard.ts")
    menu_monitor = _read(
        REPO_ROOT
        / "apps/macos/MenuMonitor/Sources/MenuMonitor/ShippingStatusStore.swift"
    )

    assert "gh issue" not in report
    assert "Open flakiness issues" not in report
    assert "GitHub Issues are historical" in report
    assert "fetch_github_issues" not in hud
    assert "GitHub Issue fallback prohibited" in hud
    assert "GITHUB_ISSUE_SCOREBOARD_RETIRED = true" in scoreboard
    assert "fetchGitHubInProgressCount" not in menu_monitor
    assert "no GitHub Issue fallback" in menu_monitor


def test_active_tracker_facades_are_linear_only_and_fail_closed() -> None:
    tracker = _read(REPO_ROOT / "scripts/hermes/lib/tracker-client.ts")
    retired_tracker = _read(REPO_ROOT / "scripts/lib/tracker.mjs")
    qa_propose = _read(REPO_ROOT / "scripts/qa-swarm/propose.mjs")
    golden_path = _read(REPO_ROOT / "scripts/golden-path-lock.mjs")
    golden_path_intake = _read(
        REPO_ROOT / "scripts/lib/golden-path-intake.mjs"
    )

    assert "api.linear.app/graphql" in tracker
    assert "issueCreate" in tracker
    assert "node:child_process" not in tracker
    assert "gh issue" not in tracker
    assert "tracker: 'linear'" in tracker
    assert "GITHUB_ISSUE_INTAKE_RETIRED = true" in retired_tracker
    assert "GitHub Issue intake retired; use Linear" in retired_tracker
    assert "GitHub Issue selection retired" in retired_tracker
    assert "node:child_process" not in retired_tracker
    assert "execFileSync" not in retired_tracker
    assert not re.search(
        r"['\"]issue['\"],\s*['\"](?:create|edit|close|comment)['\"]",
        retired_tracker,
    )
    dispatch_shim = retired_tracker.split(
        "export function shouldDispatchIssue", 1
    )[1]
    assert "return false" in dispatch_shim

    assert "fileLinearIssue" in qa_propose
    assert "fileGithubIssue" not in qa_propose
    assert "shouldMirrorLinear" not in qa_propose

    assert golden_path_intake.count("mutation CreateGoldenPathLockIssue") == 1
    assert "createGoldenPathLinearIssue" in golden_path
    assert "createGithubIssue" not in golden_path
    assert "api.github.com/repos" not in golden_path
    assert "Linear intake failed closed" in golden_path
    autofix = golden_path.split("async function runAutofix", 1)[1]
    linear_create = autofix.index("createGoldenPathLinearIssue")
    failure_gate = autofix.index("if (!linear.ok)")
    cursor_dispatch = autofix.index("cursorRequest", failure_gate)
    assert linear_create < failure_gate < cursor_dispatch


def test_local_github_issue_shipper_has_an_unconditional_source_guard() -> None:
    shipper = _read(REPO_ROOT / "scripts/hermes/jobs/codex-issue-shipper.ts")
    entrypoint = _read(REPO_ROOT / "scripts/hermes/shipper-gated-entrypoint.py")
    bootstrap = _read(REPO_ROOT / "scripts/hermes/bootstrap-pro-launchd.sh")
    guard = "GITHUB_ISSUE_INTAKE_RETIRED = true"

    assert guard in shipper
    assert shipper.index(guard) < shipper.index("async function runShipper")
    run_shipper = shipper.split("async function runShipper", 1)[1]
    assert run_shipper.index("GITHUB_ISSUE_INTAKE_RETIRED") < run_shipper.index(
        "loadHermesEnv()"
    )
    assert "GITHUB_ISSUE_INTAKE_RETIRED = True" in entrypoint
    main = entrypoint.split("def main() -> int:", 1)[1]
    assert main.index("GITHUB_ISSUE_INTAKE_RETIRED") < main.index("load_env_file")
    retired_bootstrap = bootstrap.split(
        "for label in co.jovie.hermes.cron-codex-issue-shipper", 1
    )[1].split("done", 1)[0]
    assert "launchctl disable" in retired_bootstrap
    assert "launchctl bootstrap" not in retired_bootstrap


def test_manual_github_issue_shippers_fail_before_any_create_call() -> None:
    launch_shipper = _read(REPO_ROOT / "scripts/create-launch-issues.sh")
    assert launch_shipper.index("exit 78") < launch_shipper.index("gh issue create")

    for name in ("plan2issues.mjs", "plan2issues.v2.mjs"):
        shipper = _read(REPO_ROOT / ".github" / "scripts" / name)
        assert "GITHUB_ISSUE_INTAKE_RETIRED = true" in shipper
        assert shipper.index("GITHUB_ISSUE_INTAKE_RETIRED = true") < shipper.index(
            "octo.rest.issues.create("
        )

    observability = _read(REPO_ROOT / "scripts/observability-issue-github.mjs")
    guard = "GITHUB_OBSERVABILITY_ISSUE_SYNC_RETIRED = true"
    assert guard in observability
    sync = observability.split("export async function syncObservabilityIssue", 1)[1]
    assert sync.index("GITHUB_OBSERVABILITY_ISSUE_SYNC_RETIRED") < sync.index(
        "findIssueByFingerprint"
    )


def test_active_agent_instructions_are_linear_only() -> None:
    copilot = _read(REPO_ROOT / ".github/copilot-instructions.md")
    settings = _read(REPO_ROOT / ".claude/settings.json")

    assert "Canonical intake**: Linear only" in copilot
    assert "gh issue create *" not in settings


def test_active_ship_prompt_requires_linear_follow_ups_only() -> None:
    ship_skill = _read(REPO_ROOT / ".agents/skills/gstack/ship/SKILL.md")

    assert "Blame + assign required Linear issue" in ship_skill
    assert "gh issue create" not in ship_skill
    assert "Never fall back to a GitHub or GitLab issue" in ship_skill
