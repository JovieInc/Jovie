"""JOV-5921 / JOV-6029: HA CI remediator poke Hyperagent contract.

The workflow now forwards GitHub-hosted CI failures on pull_request/merge_group
to the Hyperagent remediator webhook (HTTP 202). It runs on ubuntu-latest with
no checkout, no Node, and a 2-minute timeout. The poke gate dedupes by PR +
head SHA before curl.
"""
import importlib.util
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/ha-ci-remediator-poke.yml"
GATE_SOURCE = ROOT / "scripts/ha-ci-remediator-poke-gate.py"
SPEC = importlib.util.spec_from_file_location("ha_ci_remediator_poke_gate", GATE_SOURCE)
gate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gate)

NOW = datetime(2026, 9, 12, 3, 0, tzinfo=timezone.utc)
PR = 4321
SHA = "a" * 40
KEY = gate.poke_run_name(PR, SHA)


def _text() -> str:
    return WORKFLOW.read_text()


def _run(**overrides):
    payload = {
        "id": 1,
        "display_title": KEY,
        "status": "completed",
        "conclusion": "success",
        "created_at": "2026-09-12T02:00:00Z",
    }
    payload.update(overrides)
    return payload


def _decide(runs, **overrides):
    params = {
        "pr_number": PR,
        "head_sha": SHA,
        "ci_conclusion": "failure",
        "event_name": "workflow_run",
        "force": False,
        "current_run_id": 99,
        "now": NOW,
        "poke_runs": {"workflow_runs": runs},
    }
    params.update(overrides)
    return gate.decide_poke(**params)


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
    assert "X-Hyperagent-Webhook-Secret" in workflow
    assert "X-Hyperagent-Webhook-Signature" in workflow
    assert "X-Hyperagent-Webhook-Timestamp" in workflow
    assert "HTTP 202" in workflow or "202" in workflow
    assert '-H "Authorization: Bearer' not in workflow
    assert '-H "X-HA-Access' not in workflow
    assert "HYPERAGENT_CI_WEBHOOK_URL and HYPERAGENT_CI_WEBHOOK_SECRET are required" in workflow


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
    assert "actions: read" in workflow
    assert "contents: read" in workflow


def test_no_checkout_and_no_node() -> None:
    workflow = _text()

    assert "actions/checkout" not in workflow
    assert "setup-node" not in workflow
    assert "node " not in workflow
    assert "ha-ci-remediator-poke-gate.py" in workflow
    assert "poke_history_unproven" in workflow
    assert "already_poked_sha" in workflow or "Skipping Hyperagent poke" in workflow


def test_run_name_is_pr_and_head_sha() -> None:
    workflow = _text()

    assert "run-name: ha-poke-" in workflow
    assert "pull_requests[0].number || inputs.pr_number" in workflow
    assert "workflow_run.head_sha || github.sha" in workflow


def test_job_ignores_cancelled_and_success() -> None:
    workflow = _text()

    assert "workflow_run.conclusion == 'failure'" in workflow
    assert "workflow_run.conclusion != 'cancelled'" in workflow
    assert "workflow_run.conclusion != 'success'" in workflow


def test_gate_skips_cancelled_and_success() -> None:
    empty = {"workflow_runs": []}
    assert _decide([], ci_conclusion="cancelled") == {
        "decision": "skip",
        "reason": gate.SKIP_CI_CONCLUSION,
    }
    assert _decide([], ci_conclusion="success") == {
        "decision": "skip",
        "reason": gate.SKIP_CI_CONCLUSION,
    }
    assert _decide([], poke_runs=empty)["decision"] == "poke"


def test_gate_skips_in_flight_and_same_sha() -> None:
    assert _decide([_run(status="in_progress", conclusion=None)]) == {
        "decision": "skip",
        "reason": gate.SKIP_IN_FLIGHT,
    }
    assert _decide([_run()]) == {
        "decision": "skip",
        "reason": gate.SKIP_ALREADY_DELIVERED,
    }
    assert _decide([_run(conclusion="failure", created_at="2026-09-12T02:50:00Z")]) == {
        "decision": "skip",
        "reason": gate.SKIP_RECENT_SHA,
    }


def test_gate_rate_limits_and_fails_closed() -> None:
    other = _run(
        display_title=gate.poke_run_name(PR, "b" * 40),
        created_at="2026-09-12T02:50:00Z",
    )
    assert _decide([other]) == {
        "decision": "skip",
        "reason": gate.SKIP_PR_RATE_LIMIT,
    }
    storm = [
        _run(
            id=index,
            display_title=gate.poke_run_name(8000 + index, "c" * 40),
            created_at="2026-09-12T02:10:00Z",
        )
        for index in range(gate.GLOBAL_RATE_LIMIT_COUNT)
    ]
    assert _decide(storm) == {
        "decision": "skip",
        "reason": gate.SKIP_GLOBAL_RATE_LIMIT,
    }
    assert _decide([], poke_runs=None) == {
        "decision": "skip",
        "reason": gate.SKIP_HISTORY_UNPROVEN,
    }


def test_one_hundred_redeliveries_create_one_poke() -> None:
    first = _decide([])
    assert first == {"decision": "poke", "reason": gate.DECISION_POKE}
    delivered = [_run()]
    skipped = [_decide(delivered) for _ in range(99)]
    assert {row["reason"] for row in skipped} == {gate.SKIP_ALREADY_DELIVERED}


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
