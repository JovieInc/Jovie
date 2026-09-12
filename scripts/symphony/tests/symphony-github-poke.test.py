#!/usr/bin/env python3
"""Hyperagent CI remediator poke contract.

This file path is historical: the workflow used to poke a local Symphony port,
but now forwards CI failures to the Hyperagent remediator webhook.
"""

from __future__ import annotations

import importlib.util
import json
import pathlib
import tempfile
import unittest
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[3]
POKE = ROOT / ".github/workflows/ha-ci-remediator-poke.yml"
AUTH_SOURCE = ROOT / "scripts/symphony/hyperagent/webhook_auth.py"
GATE_SOURCE = ROOT / "scripts/ha-ci-remediator-poke-gate.py"
SPEC = importlib.util.spec_from_file_location("hyperagent_webhook_auth", AUTH_SOURCE)
webhook_auth = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(webhook_auth)
GATE_SPEC = importlib.util.spec_from_file_location("ha_ci_remediator_poke_gate", GATE_SOURCE)
poke_gate = importlib.util.module_from_spec(GATE_SPEC)
GATE_SPEC.loader.exec_module(poke_gate)


class HyperagentCiRemediatorPokeContractTests(unittest.TestCase):
    def test_poke_targets_hyperagent_webhook_not_symphony(self):
        text = POKE.read_text(encoding="utf-8")
        self.assertIn("16419", text)
        self.assertNotIn("http://127.0.0.1:4041/api/v1/refresh", text)
        self.assertNotIn("symphony-grok-sidecar.service", text)
        self.assertNotIn("systemctl", text)
        self.assertIn("HYPERAGENT_CI_WEBHOOK_URL", text)
        self.assertIn("HYPERAGENT_CI_WEBHOOK_SECRET", text)
        self.assertIn("X-Hyperagent-Webhook-Secret", text)
        self.assertIn("X-Hyperagent-Webhook-Signature", text)
        self.assertIn("202", text)
        self.assertIn("accountable-writer: Hyperagent", text)

    def test_poke_sends_secret_header_and_keeps_hmac_headers(self):
        text = POKE.read_text(encoding="utf-8")
        self.assertIn('-H "X-Hyperagent-Webhook-Secret: $WEBHOOK_SECRET"', text)
        self.assertIn("X-Hyperagent-Webhook-Timestamp", text)
        self.assertIn("X-Hyperagent-Webhook-Signature", text)
        self.assertNotIn("-H \"Authorization: Bearer", text)
        self.assertNotIn("-H \"X-HA-Access", text)
        self.assertIn("HYPERAGENT_CI_WEBHOOK_URL and HYPERAGENT_CI_WEBHOOK_SECRET are required", text)

    def test_receiver_rejects_missing_wrong_and_lookalike_headers(self):
        secret = "ha-webhook-secret"
        self.assertEqual(webhook_auth.authorize_hyperagent_webhook({}, secret), 401)
        self.assertEqual(
            webhook_auth.authorize_hyperagent_webhook({"Authorization": f"Bearer {secret}"}, secret),
            401,
        )
        self.assertEqual(
            webhook_auth.authorize_hyperagent_webhook({"X-HA-Access": secret}, secret),
            401,
        )
        self.assertEqual(
            webhook_auth.authorize_hyperagent_webhook(
                {
                    "X-Hyperagent-Webhook-Signature": "sha256=deadbeef",
                    "X-Hyperagent-Webhook-Timestamp": "1",
                },
                secret,
            ),
            401,
        )
        self.assertEqual(
            webhook_auth.authorize_hyperagent_webhook(
                {webhook_auth.HA_WEBHOOK_SECRET_HEADER: "wrong"},
                secret,
            ),
            403,
        )
        self.assertEqual(
            webhook_auth.authorize_hyperagent_webhook(
                {webhook_auth.HA_WEBHOOK_SECRET_HEADER: secret},
                secret,
            ),
            202,
        )
        self.assertEqual(
            webhook_auth.authorize_hyperagent_webhook(
                {
                    webhook_auth.HA_WEBHOOK_SECRET_HEADER: secret,
                    "X-Hyperagent-Webhook-Signature": "sha256=deadbeef",
                    "X-Hyperagent-Webhook-Timestamp": "1",
                },
                secret,
            ),
            202,
        )
        with self.assertRaises(ValueError):
            webhook_auth.authorize_hyperagent_webhook(
                {webhook_auth.HA_WEBHOOK_SECRET_HEADER: secret},
                "",
            )

    def test_poke_runs_on_github_hosted_ubuntu(self):
        text = POKE.read_text(encoding="utf-8")
        self.assertIn("runs-on: ubuntu-latest", text)
        self.assertIn("timeout-minutes: 2", text)
        self.assertIn("permissions: {}", text)

    def test_poke_needs_no_checkout_or_node(self):
        text = POKE.read_text(encoding="utf-8")
        self.assertNotIn("actions/checkout", text)
        self.assertNotIn("setup-node", text)
        self.assertNotIn("node ", text)

    def test_poke_filters_pull_request_and_merge_group_failures(self):
        text = POKE.read_text(encoding="utf-8")
        self.assertIn("workflow_run.conclusion == 'failure'", text)
        self.assertIn("pull_request", text)
        self.assertIn("merge_group", text)
        self.assertIn("pull_requests[0].number != 16419", text)
        self.assertIn("inputs.pr_number != '16419'", text)

    def test_poke_posts_slim_json(self):
        text = POKE.read_text(encoding="utf-8")
        self.assertIn("Content-Type: application/json", text)
        self.assertIn("repository", text)
        self.assertIn("head_sha", text)
        self.assertIn("run_url", text)
        self.assertIn("jq -n", text)

    def test_concurrency_serializes_by_pr_and_head_sha(self):
        text = POKE.read_text(encoding="utf-8")
        self.assertIn("concurrency:", text)
        self.assertIn("ha-ci-remediator-", text)
        self.assertIn("pull_requests[0].number || inputs.pr_number", text)
        self.assertIn("workflow_run.head_sha || github.sha", text)
        self.assertIn("cancel-in-progress: false", text)
        self.assertIn("run-name: ha-poke-", text)

    def test_poke_gate_skips_before_webhook_curl(self):
        text = POKE.read_text(encoding="utf-8")
        self.assertIn("scripts/ha-ci-remediator-poke-gate.py", text)
        self.assertIn("actions/workflows/ha-ci-remediator-poke.yml/runs?per_page=100", text)
        self.assertIn("Skipping Hyperagent poke", text)
        self.assertIn("poke_history_unproven", text)
        self.assertIn("already_poked_sha", text)
        self.assertIn("recently_poked_sha", text)
        self.assertIn("remediator_in_flight", text)
        self.assertIn("pr_rate_limit", text)
        self.assertIn("global_rate_limit", text)
        self.assertIn("ci_conclusion_ignored", text)
        self.assertIn("workflow_run.conclusion != 'cancelled'", text)
        self.assertIn("workflow_run.conclusion != 'success'", text)
        self.assertIn("actions: read", text)
        self.assertNotIn("actions/checkout", text)
        webhook_index = text.index('-H "X-Hyperagent-Webhook-Secret: $WEBHOOK_SECRET"')
        gate_index = text.index("/tmp/ha-ci-remediator-poke-gate.py")
        self.assertLess(gate_index, webhook_index)

    def test_gate_dedupes_one_hundred_same_sha_redeliveries(self):
        now = datetime(2026, 9, 12, 3, 0, tzinfo=timezone.utc)
        pr = 88
        sha = "d" * 40
        empty = poke_gate.decide_poke(
            pr_number=pr,
            head_sha=sha,
            ci_conclusion="failure",
            current_run_id=1,
            now=now,
            poke_runs={"workflow_runs": []},
        )
        self.assertEqual(empty, {"decision": "poke", "reason": poke_gate.DECISION_POKE})
        delivered = {
            "id": 2,
            "display_title": poke_gate.poke_run_name(pr, sha),
            "status": "completed",
            "conclusion": "success",
            "created_at": "2026-09-12T02:00:00Z",
        }
        for _ in range(99):
            self.assertEqual(
                poke_gate.decide_poke(
                    pr_number=pr,
                    head_sha=sha,
                    ci_conclusion="failure",
                    current_run_id=100,
                    now=now,
                    poke_runs={"workflow_runs": [delivered]},
                ),
                {"decision": "skip", "reason": poke_gate.SKIP_ALREADY_DELIVERED},
            )

    def test_gate_skips_in_flight_recent_and_ignored_conclusions(self):
        now = datetime(2026, 9, 12, 3, 0, tzinfo=timezone.utc)
        pr = 91
        sha = "e" * 40
        key = poke_gate.poke_run_name(pr, sha)
        in_flight = {
            "id": 3,
            "display_title": key,
            "status": "in_progress",
            "conclusion": None,
            "created_at": "2026-09-12T02:59:00Z",
        }
        self.assertEqual(
            poke_gate.decide_poke(
                pr_number=pr,
                head_sha=sha,
                ci_conclusion="failure",
                force=True,
                current_run_id=9,
                now=now,
                poke_runs={"workflow_runs": [in_flight]},
            ),
            {"decision": "skip", "reason": poke_gate.SKIP_IN_FLIGHT},
        )
        self.assertEqual(
            poke_gate.decide_poke(
                pr_number=pr,
                head_sha=sha,
                ci_conclusion="cancelled",
                poke_runs={"workflow_runs": []},
            )["reason"],
            poke_gate.SKIP_CI_CONCLUSION,
        )
        self.assertEqual(
            poke_gate.decide_poke(
                pr_number=pr,
                head_sha=sha,
                ci_conclusion="success",
                poke_runs={"workflow_runs": []},
            )["reason"],
            poke_gate.SKIP_CI_CONCLUSION,
        )
        self.assertEqual(
            poke_gate.decide_poke(
                pr_number=16419,
                head_sha=sha,
                ci_conclusion="failure",
                poke_runs={"workflow_runs": []},
            )["reason"],
            poke_gate.SKIP_EXCLUDED_PR,
        )
        cancelled_prior = {
            "id": 4,
            "display_title": key,
            "status": "completed",
            "conclusion": "cancelled",
            "created_at": "2026-09-12T02:59:00Z",
        }
        self.assertEqual(
            poke_gate.decide_poke(
                pr_number=pr,
                head_sha=sha,
                ci_conclusion="failure",
                current_run_id=9,
                now=now,
                poke_runs={"workflow_runs": [cancelled_prior]},
            ),
            {"decision": "poke", "reason": poke_gate.DECISION_POKE},
        )

    def test_gate_cli_fails_closed_on_unreadable_history(self):
        with tempfile.TemporaryDirectory() as directory:
            missing = pathlib.Path(directory) / "missing.json"
            stdout = pathlib.Path(directory) / "stdout.json"
            with stdout.open("w", encoding="utf-8") as handle:
                previous = poke_gate.sys.stdout
                poke_gate.sys.stdout = handle
                try:
                    code = poke_gate.main(
                        [
                            "--pr-number",
                            "12",
                            "--head-sha",
                            "f" * 40,
                            "--ci-conclusion",
                            "failure",
                            "--runs-json",
                            str(missing),
                        ]
                    )
                finally:
                    poke_gate.sys.stdout = previous
            self.assertEqual(code, 0)
            self.assertEqual(
                json.loads(stdout.read_text(encoding="utf-8")),
                {"decision": "skip", "reason": poke_gate.SKIP_HISTORY_UNPROVEN},
            )


if __name__ == "__main__":
    unittest.main()
