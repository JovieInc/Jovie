from pathlib import Path
import re
ROOT = Path(__file__).resolve().parents[2]
WF = ROOT / ".github" / "workflows"
RETIRED = "if: ${{ github.event_name == '__retired_linear_only__' }}"
def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")

def block(text: str, indent: int, name: str) -> str:
    prefix = " " * indent
    match = re.search(
        rf"^{prefix}{re.escape(name)}:\n(.*?)(?=^{prefix}[A-Za-z0-9_-]+:\n|\Z)",
        text, re.MULTILINE | re.DOTALL,
    )
    assert match, f"missing block: {name}"
    return match.group(1)

ISSUE_WRITES = ("issues: write", "gh issue", "issues.create", "issues.update", "/issues")

def assert_writes_no_issues(text: str) -> None:
    assert not [token for token in ISSUE_WRITES if token in text]

def step(text: str, name: str) -> str:
    marker = f"      - name: {name}\n"
    assert marker in text
    tail = text.split(marker, 1)[1]
    return tail.split("\n      - name:", 1)[0]

def test_dispatchers_and_claude_cannot_select_github_issues() -> None:
    dispatcher = read(WF / "github-ai-dispatcher.yml")
    orchestrator = read(WF / "github-ai-orchestrator.yml")
    tick = read(WF / "agent-tick.yml")
    for workflow in (dispatcher, orchestrator):
        triggers = block(workflow, 0, "on")
        assert "workflow_dispatch:" in triggers and "issues:" not in triggers
        assert "issues: read" not in workflow and "issues: write" not in workflow
    assert RETIRED in block(dispatcher, 2, "dispatch")
    for job in ("guard", "claim_issue", "implement_and_open_pr", "finalize_claim"):
        assert RETIRED in block(orchestrator, 2, job)
    for job in ("dispatch", "cost-anomaly"):
        assert RETIRED in block(tick, 2, job)
    claude = read(WF / "claude.yml")
    assert "issues:" not in block(claude, 0, "on")
    assert "github.event.issue.pull_request" in block(claude, 2, "claude")

def test_workflow_issue_writers_are_removed_or_hard_retired() -> None:
    retired_steps = {
        "production-controller-health.yml": ["Open one manual-recovery incident"],
        "runner-health-monitor.yml": ["Open one fixed-runner degradation incident"],
        "test-flakiness-report.yml": ["Find or create tracking issue", "Create or update tracking issue", "Auto-file deflake issues for high-severity tests"],
    }
    for name, steps in retired_steps.items():
        workflow = read(WF / name)
        assert "issues: write" not in workflow
        assert all(RETIRED in step(workflow, item) for item in steps)
    # The coverage audit's GitHub-issue failure notifier was deleted outright
    # (Slack is the failure channel), so assert it cannot write issues at all.
    coverage = read(WF / "test-coverage-audit.yml")
    assert_writes_no_issues(coverage)
    assert "      - name: Notify on failure\n" not in coverage
    assert "Slack alert on failure" in coverage
    observability = read(WF / "observability-issue.yml")
    assert "issues: write" not in observability
    assert "observability-issue-linear.mjs" in observability
    assert "observability-issue-github.mjs" not in observability
    assert "LINEAR_API_KEY" in observability
    assert RETIRED not in block(observability, 2, "sync-issue")
    cost = read(WF / "cost-anomaly-gate.yml")
    assert "issues: write" not in cost and "Prepare Linear-only anomaly receipt" in cost
    assert RETIRED in step(cost, "Create one open cost-anomaly incident")
    visual = read(WF / "pr-visual-review.yml")
    assert_writes_no_issues(visual)
    assert "github-ai-orchestrator.yml" not in visual
    # JOV-6232 retired the paid model `review` job; only capture remains and it
    # must not regain dispatch (actions: write) or issue-writing authority.
    jobs = block(visual, 0, "jobs")
    assert re.findall(r"^  ([A-Za-z0-9_-]+):\n", jobs, re.MULTILINE) == ["capture"]
    assert "actions: write" not in visual

def test_active_facades_are_linear_only_and_fail_closed() -> None:
    legacy = read(ROOT / "scripts/lib/tracker.mjs")
    assert "GITHUB_ISSUE_INTAKE_RETIRED = true" in legacy
    for name in ("buildIssueCreateArgs", "fileGithubIssue", "shouldMirrorLinear", "claimIssue", "finalizeIssueClaim", "transitionIssue", "queryTodoIssues", "shouldDispatchIssue"):
        prefix = legacy.split(f"export function {name}", 1)[1][:500]
        assert "if (GITHUB_ISSUE_INTAKE_RETIRED)" in prefix
    dispatch = legacy.split("export function shouldDispatchIssue", 1)[1]
    assert dispatch.index("return false") < dispatch.index("issue.labels")
    qa = read(ROOT / "scripts/qa-swarm/propose.mjs")
    assert "fileLinearIssue" in qa and "fileGithubIssue" not in qa
    golden = read(ROOT / "scripts/golden-path-lock.mjs")
    intake = read(ROOT / "scripts/lib/golden-path-intake.mjs")
    shared = read(ROOT / "scripts/lib/linear-issue-intake.mjs")
    assert "upsertLinearIssueByTitleFingerprint" in intake and "createGithubIssue" not in intake
    # JOV-5966: fail-closed fingerprint dedupe before create lives in the
    # shared primitive; the golden-path intake wraps it and skips Triage.
    assert "createStateName: 'Todo'" in intake
    assert shared.index("query FindIssueByFingerprint") < shared.index("mutation CreateDedupedLinearIssue")
    assert "createGoldenPathLinearIssue" in golden and "createGithubIssue" not in golden
    observability_linear = read(ROOT / "scripts/observability-issue-linear.mjs")
    assert "upsertLinearIssueByTitleFingerprint" in observability_linear
    assert "api.github.com" not in observability_linear
    synthetic = read(ROOT / "scripts/synthetic-monitoring-intake.mjs")
    assert "upsertLinearIssueByTitleFingerprint" in synthetic
    assert "api.github.com" not in synthetic
    autofix = golden.split("async function runAutofix", 1)[1]
    assert autofix.index("createGoldenPathLinearIssue") < autofix.index("if (!linear.ok)")
    gate = autofix.index("if (!linear.ok)")
    assert gate < autofix.index("cursorRequest", gate)

def test_local_and_manual_github_issue_shippers_are_source_guarded() -> None:
    launch = read(ROOT / "scripts/create-launch-issues.sh")
    assert launch.index("exit 78") < launch.index("gh issue create")
    for name in ("plan2issues.mjs", "plan2issues.v2.mjs"):
        source = read(ROOT / ".github/scripts" / name)
        assert source.index("GITHUB_ISSUE_INTAKE_RETIRED = true") < source.index("octo.rest.issues.create(")
    sync = read(ROOT / "scripts/observability-issue-github.mjs")
    body = sync.split("export async function syncObservabilityIssue", 1)[1]
    assert body.index("GITHUB_OBSERVABILITY_ISSUE_SYNC_RETIRED") < body.index("findIssueByFingerprint")

def test_reporting_and_instructions_cannot_restore_canonical_github_intake() -> None:
    report = read(WF / "agent-harness-health-report.yml")
    menu = read(ROOT / "apps/macos/MenuMonitor/Sources/MenuMonitor/ShippingStatusStore.swift")
    assert "gh issue" not in report and "GitHub Issues are historical" in report
    assert "githubIssueFallbackRetired = true" in menu
    assert menu.count("fetchGitHubInProgressCount") == 1
    assert "no GitHub Issue fallback" in menu
    copilot = read(ROOT / ".github/copilot-instructions.md")
    assert "Canonical intake**: Linear only" in copilot
    assert "gh issue create *" not in read(ROOT / ".claude/settings.json")
    ship = read(ROOT / ".agents/skills/gstack/ship/SKILL.md")
    assert "gh issue create" not in ship and "Never fall back to a GitHub" in ship
