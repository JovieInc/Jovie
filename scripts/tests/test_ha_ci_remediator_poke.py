"""JOV-5921 / JOV-6029: HA CI remediator poke Hyperagent + idempotency contract.

The workflow forwards GitHub-hosted CI failures on pull_request/merge_group to
the Hyperagent remediator webhook (HTTP 202). A fail-closed gate runs first:
merged/closed PRs, per-sha commit-status receipts, and a 45-minute per-PR
cooldown / in-flight check. It runs on ubuntu-latest with no checkout, no Node,
and a 2-minute timeout.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/ha-ci-remediator-poke.yml"


def _text() -> str:
    return WORKFLOW.read_text()


def _concurrency_block() -> str:
    workflow = _text()
    start = workflow.index("concurrency:")
    end = workflow.index("jobs:", start)
    return workflow[start:end]


def _permissions_blocks() -> list[str]:
    workflow = _text()
    blocks: list[str] = []
    cursor = 0
    while True:
        start = workflow.find("permissions:", cursor)
        if start < 0:
            break
        rest = workflow[start:]
        end_candidates = [
            idx
            for idx in (
                rest.find("\nconcurrency:"),
                rest.find("\njobs:"),
                rest.find("\n    steps:"),
                rest.find("\n    if:"),
            )
            if idx >= 0
        ]
        end = min(end_candidates) if end_candidates else len(rest)
        blocks.append(rest[:end])
        cursor = start + 1
    return blocks


def test_same_pr_runs_are_serialized_without_cancel() -> None:
    workflow = _text()
    block = _concurrency_block()

    assert "concurrency:" in workflow
    assert (
        "ha-ci-remediator-${{ github.event.workflow_run.pull_requests[0].number || inputs.pr_number || 'na' }}"
        in block
    )
    assert "cancel-in-progress: false" in block
    assert "head_sha" not in block
    assert "github.sha" not in block


def test_run_name_is_searchable_per_pr_and_sha() -> None:
    workflow = _text()

    assert "run-name: ha-remediate/PR" in workflow
    assert "ha-remediate/PR${{ github.event.workflow_run.pull_requests[0].number || inputs.pr_number || 'na' }}/" in workflow
    assert "${{ github.event.workflow_run.head_sha || github.sha }}" in workflow


def test_gate_runs_before_the_hyperagent_poke() -> None:
    workflow = _text()

    gate = workflow.index("Gate duplicate, merged, closed, and cooldown keys")
    poke = workflow.index("Poke Hyperagent CI remediator")
    assert gate < poke
    assert "id: gate" in workflow
    assert "if: steps.gate.outputs.proceed == 'true'" in workflow
    assert 'echo "proceed=true" >> "$GITHUB_OUTPUT"' in workflow


def test_merged_or_closed_prs_are_terminal() -> None:
    workflow = _text()

    assert 'gh api "repos/$REPO/pulls/$PR_NUMBER"' in workflow
    assert ".merged" in workflow
    assert '"$state" != "open"' in workflow
    assert "remediation key is terminal" in workflow


def test_commit_status_receipt_dedups_per_head_sha() -> None:
    workflow = _text()

    assert "ha-ci-remediator-poke" in workflow
    assert "repos/$REPO/commits/$HEAD_SHA/statuses" in workflow
    assert 'context == "ha-ci-remediator-poke"' in workflow
    assert '.state == "success" or .state == "pending"' in workflow
    assert "already delivered/in-flight for this head SHA" in workflow
    assert "repos/$REPO/statuses/$HEAD_SHA" in workflow
    assert "-f context=ha-ci-remediator-poke" in workflow
    assert '-f state="$state"' in workflow
    assert "write_receipt success" in workflow
    assert "HA remediator poke delivered" in workflow
    assert (
        "actions/workflows/ha-ci-remediator-poke.yml/runs?head_sha=$HEAD_SHA&status=success"
        not in workflow
    )


def test_per_pr_cooldown_uses_run_name_not_actions_head_sha() -> None:
    workflow = _text()

    assert 'prefix "ha-remediate/PR${PR_NUMBER}/"' in workflow
    assert "runs?per_page=30" in workflow
    assert "<= 2700" in workflow
    assert '.status == "in_progress" or .status == "queued"' in workflow
    assert '.conclusion == "success"' in workflow
    assert "remediator already poked for this PR within cooldown / in flight" in workflow
    assert "display_title" in workflow


def test_force_dispatch_is_the_only_bounded_retry() -> None:
    workflow = _text()

    assert "force:" in workflow
    assert "type: boolean" in workflow
    assert 'if [ "${FORCE:-false}" != "true" ]' in workflow
    assert "FORCE: ${{ inputs.force || false }}" in workflow


def test_permissions_include_actions_pull_requests_and_statuses() -> None:
    workflow = _text()
    blocks = _permissions_blocks()

    assert blocks, "expected workflow and job permissions blocks"
    assert "permissions: {}" not in workflow
    for block in blocks:
        assert "actions: read" in block
        assert "pull-requests: read" in block
        assert "statuses: write" in block


def test_poke_step_targets_hyperagent_webhook() -> None:
    workflow = _text()

    assert "HYPERAGENT_CI_WEBHOOK_URL" in workflow
    assert "HYPERAGENT_CI_WEBHOOK_SECRET" in workflow
    assert "X-Hyperagent-Webhook-Secret" in workflow
    assert "X-Hyperagent-Webhook-Signature" in workflow
    assert "X-Hyperagent-Webhook-Timestamp" in workflow
    assert "HTTP 202" in workflow or "202" in workflow
    assert '-H "Authorization: Bearer' not in workflow
    assert '-H "X-HA-Access' not in workflow
    assert "HYPERAGENT_CI_WEBHOOK_URL and HYPERAGENT_CI_WEBHOOK_SECRET are required" in workflow


def test_idempotency_key_is_in_payload() -> None:
    workflow = _text()

    assert "idempotency_key" in workflow
    assert "ha-ci-remediator:${REPO}:PR${PR_NUMBER}:${HEAD_SHA}" in workflow


def test_no_local_symphony_poke() -> None:
    workflow = _text()

    assert "http://127.0.0.1:4041/api/v1/refresh" not in workflow
    assert "symphony-grok-sidecar.service" not in workflow
    assert "systemctl" not in workflow


def test_pr_16419_exclusion_is_preserved() -> None:
    workflow = _text()

    assert "inputs.pr_number != '16419'" in workflow
    assert "pull_requests[0].number != 16419" in workflow


def test_runs_on_github_hosted_ubuntu_latest() -> None:
    workflow = _text()

    assert "runs-on: ubuntu-latest" in workflow


def test_two_minute_timeout() -> None:
    workflow = _text()

    assert "timeout-minutes: 2" in workflow


def test_no_checkout_and_no_node() -> None:
    workflow = _text()

    assert "actions/checkout" not in workflow
    assert "setup-node" not in workflow
    assert "node " not in workflow


def test_slim_json_payload_is_posted() -> None:
    workflow = _text()

    assert "Content-Type: application/json" in workflow
    assert "jq -n" in workflow
    assert "repository" in workflow
    assert "head_sha" in workflow
    assert "run_url" in workflow


def test_only_ci_failures_on_pull_request_and_merge_group() -> None:
    workflow = _text()

    assert "workflow_run.conclusion == 'failure'" in workflow
    assert "pull_request" in workflow
    assert "merge_group" in workflow


def test_non_202_does_not_write_success_receipt() -> None:
    workflow = _text()
    poke = workflow[workflow.index("Poke Hyperagent CI remediator") :]

    assert 'if [ "$http_code" != "202" ]' in poke
    failure_branch = poke[poke.index('if [ "$http_code" != "202" ]') : poke.index("write_receipt success")]
    assert "write_receipt success" not in failure_branch
    assert "write_receipt failure" in failure_branch
    assert "write_receipt success" in poke
