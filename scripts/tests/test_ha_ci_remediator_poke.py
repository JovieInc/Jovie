"""JOV-5921: HA remediator poke idempotency contract.

One in-flight remediator per PR + head SHA. The GitHub poke must fail closed
on redeliveries, merged/closed PRs, and SHAs that already have a delivered
poke, so duplicate CI failure events can never spawn duplicate Symphony
remediator wakes (Gem burrito :4041 refresh + Grok/Kimi sidecar).
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


def test_gate_runs_before_the_symphony_poke() -> None:
    workflow = _text()

    gate = workflow.index("Gate duplicate, merged, and closed remediation keys")
    poke = workflow.index("Poke Symphony remediator")
    assert gate < poke
    assert "if: steps.gate.outputs.proceed == 'true'" in workflow


def test_merged_or_closed_prs_are_terminal() -> None:
    workflow = _text()

    assert "/pulls/$PR_NUMBER" in workflow
    assert ".merged" in workflow
    assert '"$state" != "open"' in workflow


def test_prior_successful_poke_for_head_sha_blocks_duplicates() -> None:
    workflow = _text()

    assert (
        "actions/workflows/ha-ci-remediator-poke.yml/runs?head_sha=$HEAD_SHA&status=success"
        in workflow
    )
    assert "one in-flight remediator per PR+SHA" in workflow


def test_force_dispatch_is_the_only_bounded_retry() -> None:
    workflow = _text()

    assert "force:" in workflow
    assert "type: boolean" in workflow
    assert 'if [ "$FORCE" != "true" ]' in workflow


def test_symphony_poke_contract_unchanged() -> None:
    workflow = _text()

    assert "http://127.0.0.1:4041/api/v1/refresh" in workflow
    assert "symphony-grok-sidecar.service" not in workflow
    assert "Do not restart burrito" in workflow
    assert "Do not touch LYB :4042" in workflow
    # Hyperagent webhook is not the remediator queue on this path.
    assert "HYPERAGENT_CI_WEBHOOK" not in workflow
    assert "X-Hyperagent-Webhook-Secret" not in workflow


def test_pr_16419_exclusion_is_preserved() -> None:
    workflow = _text()

    assert "inputs.pr_number != '16419'" in workflow
    assert "pull_requests[0].number != 16419" in workflow


def test_token_permissions_are_minimal_and_read_only() -> None:
    workflow = _text()

    permissions = workflow.index("permissions:")
    on_block_end = workflow.index("concurrency:", permissions)
    block = workflow[permissions:on_block_end]
    assert "actions: read" in block
    assert "pull-requests: read" in block
    assert "write" not in block


def test_runs_on_self_hosted_jovie_fixed() -> None:
    workflow = _text()

    assert "runs-on: [self-hosted, Linux, X64, jovie-fixed]" in workflow
