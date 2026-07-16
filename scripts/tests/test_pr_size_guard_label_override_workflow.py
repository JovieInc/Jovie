from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/pr-size-guard-label-override.yml"


def test_pull_request_target_checks_out_trusted_workflow_commit() -> None:
    workflow = WORKFLOW.read_text()

    assert "pull_request_target:" in workflow
    assert "ref: ${{ github.workflow_sha }}" in workflow
    assert "ref: ${{ github.event.pull_request.base.sha }}" not in workflow
    assert "ref: ${{ github.event.pull_request.head.sha }}" not in workflow
    assert "persist-credentials: false" in workflow


def test_policy_runs_from_checked_out_trusted_commit() -> None:
    workflow = WORKFLOW.read_text()

    checkout = workflow.index("uses: actions/checkout@")
    policy = workflow.index("node scripts/lib/pr-size-guard-policy.mjs")
    check_writer = workflow.index("node scripts/pr-size-guard-label-override.mjs")

    assert checkout < policy < check_writer
