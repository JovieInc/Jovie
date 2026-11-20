"""JOV-13077 workflow half: hosted relay files Linear via LINEAR_API_KEY, never GitHub."""
from __future__ import annotations

import io
import json
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from scripts.tests.test_pr_events import NOW, Shell, events
from scripts.tests.test_pr_events_red_repair import FakeIntakeLinear
import intake_linear
from apiclient import MemoryLedgerStore


class ActionsLinearClientTest(unittest.TestCase):
    def test_relay_uses_actions_secret_only_when_the_relay_flag_is_set(self):
        calls = []

        def transport(method, url, headers, body, timeout):
            calls.append((method, headers, json.loads(body)))
            return 200, {"content-type": "application/json"}, '{"data":{"ok":true}}'

        env = {"LANES_RELAY_LINEAR": "1", "LINEAR_API_KEY": "lin_api_fixture",
               "LANES_EXECUTION_BACKEND": "local-test", "LANES_SELFTEST": "1"}
        with patch.dict(os.environ, env, clear=False):
            client = intake_linear.relay_linear_client()
        self.assertIsInstance(client, intake_linear.ActionsLinear)
        client._client.client.transport = transport
        client._client.client.store = MemoryLedgerStore()
        self.assertEqual(client.gql("query { ok }", {}), {"ok": True})
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][1]["Authorization"], "Bearer lin_api_fixture")
        self.assertEqual(calls[0][2], {"query": "query { ok }", "variables": {}})
        self.assertTrue(client._client.client.state())

        off = {"LINEAR_API_KEY": "lin_api_fixture", "LANES_EXECUTION_BACKEND": "local-test",
               "LANES_SELFTEST": "1"}
        with patch.dict(os.environ, off, clear=True):
            os.environ.pop("LANES_RELAY_LINEAR", None)
            os.environ.pop("GITHUB_ACTIONS", None)
            self.assertIsNone(intake_linear.relay_linear_client())

    def test_actions_linear_files_intake_and_never_calls_gh_issue_create(self):
        linear, shell = FakeIntakeLinear(), Shell({})
        event = {"source": "deploy", "fingerprint": "feedbeef0002", "ws": "release-deploy",
                 "subject": {"sha": "abc", "deployment": "preview"},
                 "evidence": {"url": "https://example.test/deploy/1", "excerpt": "preview failure"}}
        with patch.object(intake_linear, "relay_linear_client", return_value=linear):
            issue_id = intake_linear.upsert_intake(event, shell, NOW)
        self.assertEqual(issue_id, linear.destination("feedbeef0002"))
        self.assertEqual(shell.made("gh", "issue", "create"), [])


class DeployFailureLike25985Test(unittest.TestCase):
    def test_deploy_failure_like_25985_files_linear_and_never_creates_a_github_issue(self):
        """Close bar: a deployment_status failure shaped like #25985 files one Linear issue."""
        payload = {
            "deployment": {"environment": "Preview – jovie",
                           "sha": "6b41dcf66f3826e34b0fa45c772819c2168dc69e"},
            "deployment_status": {
                "state": "failure",
                "target_url": "https://github.com/JovieInc/Jovie/actions/runs/44484798091/job/135425462484",
                "description": "Deployment failed",
                "created_at": "2026-11-19T08:11:00Z",
            },
        }
        event = events.remediation.non_pr_event("deployment_status", payload)
        self.assertIsNotNone(event)
        self.assertEqual((event["source"], event["ws"]), ("deploy", "release-deploy"))
        linear, shell = FakeIntakeLinear(), Shell({})
        with patch.object(intake_linear, "relay_linear_client", return_value=linear):
            added = events.relay("deployment_status", payload, shell, set())
        self.assertEqual(added, [(linear.destination(event["fingerprint"]), "symphony-remediation")])
        self.assertEqual(shell.made("gh", "issue", "create"), [])
        self.assertEqual(len(linear.creates), 1)
        with patch.object(intake_linear, "relay_linear_client", return_value=linear):
            again = events.relay("deployment_status", payload, shell, set())
        self.assertEqual(again, [(linear.destination(event["fingerprint"]), "symphony-remediation")])
        self.assertEqual(len(linear.creates), 1)
        self.assertEqual(len(linear.comments), 1)

    def test_same_fingerprint_replay_does_not_open_a_second_linear_or_any_github_issue(self):
        run = {"name": "CI", "event": "push", "conclusion": "failure", "head_branch": "main",
               "head_sha": "abc", "pull_requests": [], "html_url": "https://example.test/run/1",
               "updated_at": "2026-10-02T00:00:00Z"}
        payload = {"workflow_run": run}
        event = events.remediation.non_pr_event("workflow_run", payload)
        linear, shell = FakeIntakeLinear(), Shell({})
        with patch.object(intake_linear, "relay_linear_client", return_value=linear):
            first = events.relay("workflow_run", payload, shell, set())
            second = events.relay("workflow_run", payload, shell, set())
        dest = linear.destination(event["fingerprint"])
        self.assertEqual(first, [(dest, "symphony-remediation")])
        self.assertEqual(second, [(dest, "symphony-remediation")])
        self.assertEqual(len(linear.creates), 1)
        self.assertEqual(shell.made("gh", "issue", "create"), [])

    def test_missing_credential_defers_visibly_and_never_uses_github(self):
        run = {"name": "CI", "event": "push", "conclusion": "failure", "head_branch": "main",
               "head_sha": "abc", "pull_requests": [], "html_url": "https://example.test/run/1",
               "updated_at": "2026-10-02T00:00:00Z"}
        shell = Shell({})
        with patch.object(intake_linear, "relay_linear_client", return_value=None), \
                patch.object(sys, "stderr", io.StringIO()) as stderr:
            added = events.relay("workflow_run", {"workflow_run": run}, shell, set())
        self.assertEqual(added, [])
        self.assertEqual(shell.made("gh", "issue", "create"), [])
        self.assertIn("intake deferred", stderr.getvalue())


class ConvertLegacyIntakeCliTest(unittest.TestCase):
    def test_convert_legacy_intake_cli_uses_convert_intake_and_needs_a_client(self):
        with patch.object(intake_linear, "operator_linear_client", return_value=None), \
                patch.object(sys, "stderr", io.StringIO()) as stderr:
            self.assertEqual(intake_linear.convert_legacy_intake_main(), 2)
        self.assertIn("no Linear client", stderr.getvalue())

        linear, shell = FakeIntakeLinear(), Shell({("gh", "issue", "list"): "[]"})
        code = intake_linear.convert_legacy_intake_main(now=NOW, sh=shell, linear_factory=lambda: linear)
        self.assertEqual(code, 0)
        self.assertEqual(shell.made("gh", "issue", "create"), [])
        self.assertTrue(shell.made("gh", "issue", "list"))


class RelayWorkflowSecretWiringTest(unittest.TestCase):
    """Outside-review must-fix (2026-11-19): the relay's LINEAR_API_KEY exposure surface is
    pinned, not just currently correct — step-scoped env on exactly one step, flag-gated."""

    def workflow(self) -> str:
        root = Path(__file__).resolve().parents[2]
        return (root / ".github/workflows/lane-fix-relay.yml").read_text()

    def step_block(self, text: str, step_name: str) -> list[str]:
        lines = text.splitlines()
        start = next(i for i, line in enumerate(lines) if line.strip() == f"- name: {step_name}")
        end = next((i for i in range(start + 1, len(lines))
                    if lines[i].strip().startswith("- name:")
                    or (lines[i] and not lines[i][0].isspace() and not lines[i].lstrip().startswith("#"))),
                   len(lines))
        return lines[start:end]

    def test_relay_secret_is_step_scoped_to_one_flag_gated_step(self):
        text = self.workflow()
        key_lines = [line for line in text.splitlines() if line.strip().startswith("LINEAR_API_KEY:")]
        self.assertEqual(len(key_lines), 1, f"the Actions key must be set on exactly one line, got {key_lines}")
        flag_lines = [line for line in text.splitlines() if line.strip().startswith("LANES_RELAY_LINEAR:")]
        self.assertEqual(len(flag_lines), 1, f"the relay flag must be set on exactly one line, got {flag_lines}")
        block = "\n".join(self.step_block(text, "Label the PR for the lanes"))
        self.assertIn("LINEAR_API_KEY: ${{ secrets.LINEAR_API_KEY }}", block)
        self.assertIn('LANES_RELAY_LINEAR: "1"', block)
