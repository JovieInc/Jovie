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
        self.assertIn("202", text)
        self.assertIn("accountable-writer: Hyperagent", text)

    def test_poke_uses_documented_secret_header_not_bearer_hmac_or_x_ha_access(self):
        text = POKE.read_text(encoding="utf-8")
        self.assertIn("-H \"X-Hyperagent-Webhook-Secret: $WEBHOOK_SECRET\"", text)
        self.assertNotIn("Authorization: Bearer", text)
        self.assertNotIn("X-HA-Access", text)
        self.assertNotIn("X-Hyperagent-Webhook-Signature", text)
        self.assertNotIn("X-Hyperagent-Webhook-Timestamp", text)
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


if __name__ == "__main__":
    unittest.main()
