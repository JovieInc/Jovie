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
    ("security.yml", "gitleaks"),
    ("security.yml", "trufflehog"),
    ("ci.yml", "ci-build-public"),
    ("ci.yml", "ci-summary"),
)


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