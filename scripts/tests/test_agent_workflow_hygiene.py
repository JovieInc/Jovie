"""Regression tests for self-hosted agent workflow hygiene."""
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
