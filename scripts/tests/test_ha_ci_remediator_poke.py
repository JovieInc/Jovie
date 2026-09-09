"""JOV-5921 / JOV-6029: HA CI remediator poke Hyperagent contract.

The workflow now forwards GitHub-hosted CI failures on pull_request/merge_group
to the Hyperagent remediator webhook (HTTP 202). It runs on ubuntu-latest with
no checkout, no Node, empty permissions, and a 2-minute timeout.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/ha-ci-remediator-poke.yml"


def _text() -> str:
    return WORKFLOW.read_text()


def test_same_key_runs_are_serialized_without_cancel() -> None:
    workflow = _text()

    assert "concurrency:" in workflow
    assert "ha-ci-remediator-" in workflow
    assert "pull_requests[0].number || inputs.pr_number" in workflow
    assert "workflow_run.head_sha || github.sha" in workflow
    assert "cancel-in-progress: false" in workflow


def test_poke_step_targets_hyperagent_webhook() -> None:
    workflow = _text()

    assert "HYPERAGENT_CI_WEBHOOK_URL" in workflow
    assert "HYPERAGENT_CI_WEBHOOK_SECRET" in workflow
    assert "X-Hyperagent-Webhook-Signature" in workflow
    assert "HTTP 202" in workflow or "202" in workflow


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


def test_permissions_are_empty() -> None:
    workflow = _text()

    assert "permissions: {}" in workflow


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
