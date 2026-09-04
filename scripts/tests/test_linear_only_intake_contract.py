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
        "test-coverage-audit.yml": ["Notify on failure"],
        "test-flakiness-report.yml": ["Find or create tracking issue", "Create or update tracking issue", "Auto-file deflake issues for high-severity tests"],
    }
    for name, steps in retired_steps.items():
        workflow = read(WF / name)
        assert "issues: write" not in workflow
        assert all(RETIRED in step(workflow, item) for item in steps)
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
    assert "gh issue" not in visual and "github-ai-orchestrator.yml" not in visual
    assert "actions: write" not in block(visual, 2, "review")

def test_active_facades_are_linear_only_and_fail_closed() -> None:
    tracker = read(ROOT / "scripts/hermes/lib/tracker-client.ts")
    assert "api.linear.app/graphql" in tracker and "issueCreate" in tracker
    assert "node:child_process" not in tracker and "gh issue" not in tracker
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
    # JOV-5966: golden-path intake dedupes by fingerprint before create and
    # lands the P0 directly in Todo (skips Triage) via the shared upsert.
    assert "upsertLinearIssueByTitleFingerprint" in intake
    assert "issueCreate" not in intake and "issueUpdate" not in intake
    assert "stateName" in intake
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
    # The dedupe result must be visible in the run log, not just created.
    assert "Deduped golden-path Linear intake" in autofix

def test_local_and_manual_github_issue_shippers_are_source_guarded() -> None:
    shipper = read(ROOT / "scripts/hermes/jobs/codex-issue-shipper.ts")
    run = shipper.split("async function runShipper", 1)[1]
    assert run.index("GITHUB_ISSUE_INTAKE_RETIRED") < run.index("loadHermesEnv()")
    entry = read(ROOT / "scripts/hermes/shipper-gated-entrypoint.py")
    main = entry.split("def main() -> int:", 1)[1]
    assert main.index("GITHUB_ISSUE_INTAKE_RETIRED") < main.index("load_env_file")
    bootstrap = read(ROOT / "scripts/hermes/bootstrap-pro-launchd.sh")
    retired = bootstrap.split("for label in co.jovie.hermes.cron-codex-issue-shipper", 1)[1].split("done", 1)[0]
    assert "launchctl disable" in retired and "launchctl bootstrap" not in retired
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
    hud = read(ROOT / "scripts/hermes/gem-ops-hud.py")
    menu = read(ROOT / "apps/macos/MenuMonitor/Sources/MenuMonitor/ShippingStatusStore.swift")
    assert "gh issue" not in report and "GitHub Issues are historical" in report
    assert "GITHUB_ISSUE_FALLBACK_RETIRED = True" in hud
    issue_source = hud.split("def fetch_issue_source", 1)[1].split("def process_count", 1)[0]
    guard = issue_source.index("if GITHUB_ISSUE_FALLBACK_RETIRED")
    assert guard < issue_source.index("return", guard) < issue_source.index("fetch_github_issues")
    assert "githubIssueFallbackRetired = true" in menu
    assert menu.count("fetchGitHubInProgressCount") == 1
    assert "no GitHub Issue fallback" in menu
    scoreboard = read(ROOT / "scripts/hermes/jobs/pipeline-scoreboard.ts")
    assert "GITHUB_ISSUE_SCOREBOARD_RETIRED = true" in scoreboard
    copilot = read(ROOT / ".github/copilot-instructions.md")
    assert "Canonical intake**: Linear only" in copilot
    assert "gh issue create *" not in read(ROOT / ".claude/settings.json")
    ship = read(ROOT / ".agents/skills/gstack/ship/SKILL.md")
    assert "gh issue create" not in ship and "Never fall back to a GitHub" in ship
