#!/usr/bin/env python3
"""Hyperagent CI remediator poke contract.

This file path is historical: the workflow used to poke a local Symphony port,
but now forwards CI failures to the Hyperagent remediator webhook.
"""

from __future__ import annotations

import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
POKE = ROOT / ".github/workflows/ha-ci-remediator-poke.yml"
AUTH_SOURCE = ROOT / "scripts/symphony/hyperagent/webhook_auth.py"
SPEC = importlib.util.spec_from_file_location("hyperagent_webhook_auth", AUTH_SOURCE)
webhook_auth = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(webhook_auth)


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
        self.assertIn("actions: read", text)
        self.assertIn("pull-requests: read", text)
        self.assertIn("statuses: write", text)
        self.assertNotIn("permissions: {}", text)

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

    def test_concurrency_serializes_by_pr_only(self):
        text = POKE.read_text(encoding="utf-8")
        start = text.index("concurrency:")
        end = text.index("jobs:", start)
        block = text[start:end]
        self.assertIn("concurrency:", block)
        self.assertIn(
            "ha-ci-remediator-${{ github.event.workflow_run.pull_requests[0].number || inputs.pr_number || 'na' }}",
            block,
        )
        self.assertIn("cancel-in-progress: false", block)
        self.assertNotIn("head_sha", block)
        self.assertNotIn("github.sha", block)
        self.assertIn("workflow_run.head_sha || github.sha", text)
        self.assertIn("if: steps.gate.outputs.proceed == 'true'", text)
        self.assertIn("ha-remediate/PR", text)

    def test_gate_uses_commit_status_receipt_not_broken_head_sha_filter(self):
        text = POKE.read_text(encoding="utf-8")
        gate = text.index("id: gate")
        poke = text.index("Poke Hyperagent CI remediator")
        self.assertLess(gate, poke)
        self.assertIn('context == "ha-ci-remediator-poke"', text)
        self.assertIn("repos/$REPO/commits/$HEAD_SHA/statuses", text)
        self.assertIn("-f context=ha-ci-remediator-poke", text)
        self.assertIn('if [ "${FORCE:-false}" != "true" ]', text)
        self.assertIn('prefix "ha-remediate/PR${PR_NUMBER}/"', text)
        self.assertIn("idempotency_key", text)
        self.assertNotIn(
            "actions/workflows/ha-ci-remediator-poke.yml/runs?head_sha=$HEAD_SHA&status=success",
            text,
        )


if __name__ == "__main__":
    unittest.main()
