#!/usr/bin/env python3
"""Hyperagent CI remediator poke contract.

This file path is historical: the workflow used to poke a local Symphony port,
but now forwards CI failures to the Hyperagent remediator webhook.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import pathlib
import subprocess
import tempfile
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


    def _run_poke_shell(self, response_body, http_code, fail_success=False):
        'Run the workflow Poke step with local gh and curl fixtures.'
        workflow = POKE.read_text(encoding="utf-8")
        step = workflow[workflow.index("      - name: Poke Hyperagent CI remediator\n"):]
        script = step.split("        run: |\n", 1)[1]
        script = "\n".join(
            line[10:] if line.startswith(" " * 10) else line
            for line in script.splitlines()
        ) + "\n"

        with tempfile.TemporaryDirectory(prefix="ha-poke-fixture-") as directory:
            root = pathlib.Path(directory)
            bin_dir = root / "bin"
            bin_dir.mkdir()
            response_path = root / "response"
            response_path.write_bytes(response_body)
            gh_log = root / "gh.jsonl"
            curl_log = root / "curl.jsonl"
            output_path = root / "github-output"

            gh_fixture = bin_dir / "gh"
            gh_fixture.write_text(
                '''#!/usr/bin/env python3
import json
import os
import sys

args = sys.argv[1:]
fields = {}
index = 0
while index < len(args):
    if args[index] == "-f" and index + 1 < len(args):
        key, value = args[index + 1].split("=", 1)
        fields[key] = value
        index += 2
    else:
        index += 1
fail_success = fields.get("state") == "success" and os.environ.get("GH_FAIL_SUCCESS") == "1"
with open(os.environ["GH_FIXTURE_LOG"], "a", encoding="utf-8") as handle:
    handle.write(json.dumps({"args": args, "fields": fields, "persisted": not fail_success}) + "\\n")
if fail_success:
    print("fixture status write failed", file=sys.stderr)
    raise SystemExit(1)
print("{}")
''',
                encoding="utf-8",
            )
            curl_fixture = bin_dir / "curl"
            curl_fixture.write_text(
                '''#!/usr/bin/env python3
import json
import os
import pathlib
import sys

args = sys.argv[1:]
output = pathlib.Path(args[args.index("-o") + 1])
payload = args[args.index("-d") + 1]
with open(os.environ["CURL_FIXTURE_LOG"], "a", encoding="utf-8") as handle:
    handle.write(json.dumps({"payload": payload}) + "\\n")
output.write_bytes(pathlib.Path(os.environ["CURL_FIXTURE_RESPONSE"]).read_bytes())
print(os.environ["CURL_FIXTURE_CODE"])
''',
                encoding="utf-8",
            )
            gh_fixture.chmod(0o755)
            curl_fixture.chmod(0o755)

            environment = os.environ.copy()
            environment.update(
                {
                    "PATH": f"{bin_dir}:{environment['PATH']}",
                    "GH_FIXTURE_LOG": str(gh_log),
                    "CURL_FIXTURE_LOG": str(curl_log),
                    "CURL_FIXTURE_RESPONSE": str(response_path),
                    "CURL_FIXTURE_CODE": str(http_code),
                    "GH_FAIL_SUCCESS": "1" if fail_success else "",
                    "GITHUB_OUTPUT": str(output_path),
                    "WEBHOOK_URL": "https://fixture.invalid/hyperagent",
                    "WEBHOOK_SECRET": "fixture-secret",
                    "GH_TOKEN": "fixture-token",
                    "PR_NUMBER": "18003",
                    "HEAD_SHA": "a" * 40,
                    "RUN_URL": "https://github.com/JovieInc/Jovie/actions/runs/123",
                    "REPO": "JovieInc/Jovie",
                    "EVENT": "pull_request",
                }
            )
            completed = subprocess.run(
                ["bash", "-euo", "pipefail", "-c", script],
                cwd=ROOT,
                env=environment,
                text=True,
                capture_output=True,
                timeout=20,
            )
            statuses = [
                json.loads(line)
                for line in gh_log.read_text(encoding="utf-8").splitlines()
                if line
            ] if gh_log.exists() else []
            requests = [
                json.loads(line)
                for line in curl_log.read_text(encoding="utf-8").splitlines()
                if line
            ] if curl_log.exists() else []
            return completed, statuses, requests

    def test_poke_persists_valid_202_run_id_and_exact_payload_fingerprint(self):
        run_id = "r" * 48
        completed, statuses, requests = self._run_poke_shell(
            json.dumps({"runId": run_id, "status": "accepted"}).encode(), 202
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(len(requests), 1)
        self.assertEqual([entry["fields"]["state"] for entry in statuses], ["pending", "success"])
        payload = requests[0]["payload"]
        fingerprint = hashlib.sha256(payload.encode()).hexdigest()
        description = statuses[-1]["fields"]["description"]
        self.assertEqual(
            description,
            f"ha-receipt accepted run={run_id} fp={fingerprint}",
        )
        self.assertLessEqual(len(description), 140)

    def test_poke_preserves_pending_for_missing_malformed_and_wrong_202_bodies(self):
        fixtures = (
            b"",
            b"not-json",
            b'{"status":"accepted"}',
            b'{"runId":"provider-run-123","status":"running"}',
            json.dumps({"runId": "provider-run-123\n", "status": "accepted"}).encode(),
            json.dumps({"runId": "provider-run-123\x00123", "status": "accepted"}).encode(),
            json.dumps({"runId": "r" * 49, "status": "accepted"}).encode(),
        )
        for response_body in fixtures:
            with self.subTest(response_body=response_body):
                completed, statuses, requests = self._run_poke_shell(response_body, 202)
                self.assertEqual(completed.returncode, 0, completed.stderr)
                self.assertEqual(len(requests), 1)
                self.assertEqual([entry["fields"]["state"] for entry in statuses], ["pending"])
                description = statuses[0]["fields"]["description"]
                self.assertIn("ha-receipt pending fp=", description)
                self.assertNotIn("accepted run=", description)

    def test_poke_fails_closed_when_accepted_receipt_cannot_persist(self):
        completed, statuses, requests = self._run_poke_shell(
            b'{"runId":"provider-run-123","status":"accepted"}',
            202,
            fail_success=True,
        )
        self.assertEqual(completed.returncode, 1)
        self.assertEqual(len(requests), 1)
        self.assertEqual([entry["fields"]["state"] for entry in statuses], ["pending", "success"])
        self.assertTrue(statuses[0]["persisted"])
        self.assertFalse(statuses[1]["persisted"])
        self.assertIn("failing closed", completed.stdout)

    def test_poke_keeps_non_202_failure_receipt_and_does_not_replay(self):
        completed, statuses, requests = self._run_poke_shell(
            b'{"error":"temporarily unavailable"}', 503
        )
        self.assertEqual(completed.returncode, 1)
        self.assertEqual(len(requests), 1)
        self.assertEqual([entry["fields"]["state"] for entry in statuses], ["pending", "failure"])
        payload = requests[0]["payload"]
        fingerprint = hashlib.sha256(payload.encode()).hexdigest()
        self.assertIn(f"http=503 fp={fingerprint}", statuses[-1]["fields"]["description"])


if __name__ == "__main__":
    unittest.main()
