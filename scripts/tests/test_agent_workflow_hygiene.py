"""Regression tests for self-hosted agent workflow hygiene."""
import re
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
    ("ci.yml", "ci-build-public"),
    ("ci.yml", "ci-summary"),
)

FLEET_CONTROLLER_JOBS = (
    ("auto-pr-on-push.yml", "open-pr"),
    ("auto-ready-agent-drafts.yml", "auto-ready"),
    ("merge-queue-autoenroll.yml", "enroll"),
    ("merge-queue-autoenroll.yml", "rebase"),
    ("agent-tick.yml", "auto-ready"),
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


def test_node_only_agent_jobs_do_not_write_to_system_corepack_dir() -> None:
    """Node scripts must not call corepack enable on locked-down runners."""
    for workflow_name in (
        "agent-pipeline.yml",
        "pr-conflict-handler.yml",
        "merge-queue-autoenroll.yml",
    ):
        content = (WORKFLOWS / workflow_name).read_text(encoding="utf-8")
        assert "run: corepack enable" not in content, workflow_name


def test_conflict_resolver_executes_on_synchronize_for_stale_label_cleanup() -> None:
    """A clean synchronized PR must reach the resolver's stale-label removal path."""
    content = (WORKFLOWS / "auto-resolve-conflicts.yml").read_text(encoding="utf-8")
    assert "types: [labeled, synchronize, opened, reopened]" in content
    assert "github.event.action == 'synchronize'" in _job_block(
        "auto-resolve-conflicts.yml", "resolve-conflicts"
    )


def test_pr_ready_fails_closed_on_required_smoke_evidence() -> None:
    """The aggregate cannot green while its declared high-risk smoke lane skips."""
    job = _job_block("ci.yml", "ci-pr-ready")
    assert "ci-e2e-smoke," in job
    assert "needs.ci-risk-classifier.outputs.requires_smoke" in job
    assert 'RISK_REQUIRES_SMOKE" == "true"' in job
    assert 'SMOKE_RESULT" != "success"' in job


def test_trigger_guard_materializes_systemic_detector_import_closure() -> None:
    """The detector must not fail before it can classify a systemic failure."""
    step = _step_block("agent-pipeline.yml", "Checkout systemic detector")
    materialized = _sparse_checkout_paths(step)
    entrypoint = "scripts/lib/detect-systemic-failures.mjs"

    assert entrypoint in materialized
    _assert_local_runtime_closure(materialized, entrypoint)


def test_self_hosted_gate_jobs_materialize_full_checkout() -> None:
    """Jobs that need repo scripts/actions must recover from sparse workspaces."""
    for workflow_name, _job_hint in FULL_CHECKOUT_JOBS:
        content = (WORKFLOWS / workflow_name).read_text(encoding="utf-8")
        assert "git checkout-index -a -f" in content, workflow_name
        assert "Verify checkout sentinel" in content, workflow_name


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
