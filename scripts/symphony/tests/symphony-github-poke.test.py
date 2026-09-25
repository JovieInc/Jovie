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
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[3]
POKE = ROOT / ".github/workflows/ha-ci-remediator-poke.yml"
AUTH_SOURCE = ROOT / "scripts/symphony/hyperagent/webhook_auth.py"
SPEC = importlib.util.spec_from_file_location("hyperagent_webhook_auth", AUTH_SOURCE)
webhook_auth = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(webhook_auth)


def pr_candidate(number, head_sha, branch, *, state="open", head_repo="JovieInc/Jovie", base_repo="JovieInc/Jovie"):
    return {
        "number": number,
        "state": state,
        "head": {
            "sha": head_sha,
            "ref": branch,
            "repo": {"full_name": head_repo},
        },
        "base": {"repo": {"full_name": base_repo}},
    }


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


    def _run_gate_shell(
        self,
        *,
        pr_number,
        head_sha,
        statuses_by_head,
        workflow_runs,
        gate_now=2_000_000_000,
        force=False,
        producer_event="pull_request",
        fx_enabled="",
        fx_canary_pr="",
        head_branch="codex/gate-fixture",
        head_repository="JovieInc/Jovie",
        pr_associations="[]",
        pull_requests=(),
        pull_requests_json=None,
        fail_pr_lookup=False,
    ):
        'Run the workflow Gate step with local GitHub API and clock fixtures.'
        workflow = POKE.read_text(encoding="utf-8")
        start = workflow.index("      - name: Gate duplicate, merged, closed, and cooldown keys\n")
        end = workflow.index("      - name: Poke Hyperagent CI remediator\n", start)
        step = workflow[start:end]
        script = step.split("        run: |\n", 1)[1]
        script = "\n".join(
            line[10:] if line.startswith(" " * 10) else line
            for line in script.splitlines()
        ) + "\n"

        with tempfile.TemporaryDirectory(prefix="ha-gate-fixture-") as directory:
            root = pathlib.Path(directory)
            bin_dir = root / "bin"
            bin_dir.mkdir()
            statuses_path = root / "statuses.json"
            statuses_path.write_text(json.dumps(statuses_by_head), encoding="utf-8")
            runs_path = root / "runs.json"
            runs_path.write_text(json.dumps({"workflow_runs": workflow_runs}), encoding="utf-8")
            pr_candidates_path = root / "pr-candidates.json"
            pr_candidates_path.write_text(
                pull_requests_json if pull_requests_json is not None else json.dumps(pull_requests),
                encoding="utf-8",
            )
            gh_log = root / "gh.jsonl"
            output_path = root / "github-output"

            gh_fixture = bin_dir / "gh"
            gh_fixture.write_text(
                '''#!/usr/bin/env python3
import json
import os
import sys

args = sys.argv[1:]
endpoint = args[1] if len(args) > 1 and args[0] == "api" else ""
with open(os.environ["GH_GATE_LOG"], "a", encoding="utf-8") as handle:
    handle.write(json.dumps({"args": args, "endpoint": endpoint}) + "\\n")
if "/pulls/" in endpoint:
    print(json.dumps({
        "merged": os.environ.get("GATE_PR_MERGED") == "true",
        "state": os.environ.get("GATE_PR_STATE", "open"),
    }))
elif endpoint.endswith("/pulls"):
    if os.environ.get("GATE_PR_LOOKUP_FAILURE") == "true":
        raise SystemExit(1)
    with open(os.environ["GATE_PR_CANDIDATES"], encoding="utf-8") as handle:
        print(handle.read())
elif "/commits/" in endpoint and "/statuses" in endpoint:
    head = endpoint.split("/commits/", 1)[1].split("/statuses", 1)[0]
    with open(os.environ["GATE_STATUS_MAP"], encoding="utf-8") as handle:
        status_map = json.load(handle)
    print(json.dumps(status_map.get(head, [])))
elif "/actions/workflows/ha-ci-remediator-poke.yml/runs" in endpoint:
    with open(os.environ["GATE_RUNS"], encoding="utf-8") as handle:
        print(handle.read())
else:
    print("{}")
''',
                encoding="utf-8",
            )
            date_fixture = bin_dir / "date"
            date_fixture.write_text(
                '''#!/usr/bin/env python3
import os
import sys

if sys.argv[1:] == ["-u", "+%s"]:
    print(os.environ["GATE_NOW"])
else:
    raise SystemExit("unexpected date invocation")
''',
                encoding="utf-8",
            )
            gh_fixture.chmod(0o755)
            date_fixture.chmod(0o755)

            environment = os.environ.copy()
            environment.update(
                {
                    "PATH": f"{bin_dir}:{environment['PATH']}",
                    "GH_GATE_LOG": str(gh_log),
                    "GATE_STATUS_MAP": str(statuses_path),
                    "GATE_RUNS": str(runs_path),
                    "GATE_PR_CANDIDATES": str(pr_candidates_path),
                    "GATE_PR_LOOKUP_FAILURE": "true" if fail_pr_lookup else "false",
                    "GATE_NOW": str(gate_now),
                    "GITHUB_OUTPUT": str(output_path),
                    "GH_TOKEN": "fixture-token",
                    "PR_NUMBER": str(pr_number),
                    "HEAD_SHA": head_sha,
                    "FORCE": "true" if force else "false",
                    "REPO": "JovieInc/Jovie",
                    "RUN_ID": "999999",
                    "GATE_PR_STATE": "open",
                    "GATE_PR_MERGED": "false",
                    "PRODUCER_EVENT": producer_event,
                    "HEAD_BRANCH": head_branch,
                    "HEAD_REPOSITORY": head_repository,
                    "PR_ASSOCIATIONS": pr_associations,
                    "FX_HOSTED_REMEDIATION_ENABLED": fx_enabled,
                    "FX_HOSTED_REMEDIATION_CANARY_PR": fx_canary_pr,
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
            output = output_path.read_text(encoding="utf-8") if output_path.exists() else ""
            calls = [
                json.loads(line)
                for line in gh_log.read_text(encoding="utf-8").splitlines()
                if line
            ] if gh_log.exists() else []
            return completed, output, calls

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

    def test_gate_cooldown_protects_failed_attempts_and_non_202_is_not_replayed(self):
        completed, statuses, requests = self._run_poke_shell(
            b'{"error":"temporarily unavailable"}', 503
        )
        self.assertEqual(completed.returncode, 1)
        self.assertEqual(len(requests), 1)
        self.assertEqual([entry["fields"]["state"] for entry in statuses], ["pending", "failure"])
        payload = requests[0]["payload"]
        fingerprint = hashlib.sha256(payload.encode()).hexdigest()
        self.assertIn(f"http=503 fp={fingerprint}", statuses[-1]["fields"]["description"])

        old_head = "a" * 40
        new_head = "b" * 40
        gate_now = 2_000_000_000

        def created_at(age):
            return datetime.fromtimestamp(gate_now - age, timezone.utc).isoformat().replace("+00:00", "Z")

        def workflow_run(pr_number=18003, age=100, status="completed", conclusion="failure"):
            return {
                "id": 1234,
                "display_title": f"ha-remediate/PR{pr_number}/{old_head}",
                "status": status,
                "conclusion": conclusion,
                "created_at": created_at(age),
            }

        accepted_failed, accepted_statuses, accepted_requests = self._run_poke_shell(
            b'{"runId":"provider-run-123","status":"accepted"}',
            202,
            fail_success=True,
        )
        self.assertEqual(accepted_failed.returncode, 1)
        self.assertEqual(len(accepted_requests), 1)
        old_pending = [
            {
                "context": entry["fields"]["context"],
                "state": entry["fields"]["state"],
                "description": entry["fields"]["description"],
                "target_url": entry["fields"]["target_url"],
            }
            for entry in accepted_statuses
            if entry["persisted"] and entry["fields"]["state"] == "pending"
        ]
        self.assertEqual(len(old_pending), 1)

        # Cross-step regression: an accepted provider delivery followed by a
        # failed success-receipt write produces a failed workflow run and an
        # old-head pending receipt. A new head must still be held by cooldown.
        cross_step, output, calls = self._run_gate_shell(
            pr_number=18003,
            head_sha=new_head,
            statuses_by_head={old_head: old_pending, new_head: []},
            workflow_runs=[workflow_run(conclusion="failure")],
            gate_now=gate_now,
        )
        self.assertEqual(cross_step.returncode, 0, cross_step.stderr)
        self.assertNotIn("proceed=true", output)
        self.assertTrue(any("/actions/workflows/ha-ci-remediator-poke.yml/runs" in call["endpoint"] for call in calls))
        self.assertTrue(all(call["args"][0] == "api" for call in calls))

        same_head, output, _ = self._run_gate_shell(
            pr_number=18003,
            head_sha=old_head,
            statuses_by_head={old_head: old_pending},
            workflow_runs=[],
            gate_now=gate_now,
        )
        self.assertEqual(same_head.returncode, 0, same_head.stderr)
        self.assertNotIn("proceed=true", output)

        for conclusion in ("success", "failure", "cancelled", "timed_out", None, "unknown"):
            with self.subTest(conclusion=conclusion):
                completed_run, output, _ = self._run_gate_shell(
                    pr_number=18003,
                    head_sha=new_head,
                    statuses_by_head={new_head: []},
                    workflow_runs=[workflow_run(conclusion=conclusion)],
                    gate_now=gate_now,
                )
                self.assertEqual(completed_run.returncode, 0, completed_run.stderr)
                self.assertNotIn("proceed=true", output)

        for status in ("queued", "in_progress"):
            with self.subTest(status=status):
                active_run, output, _ = self._run_gate_shell(
                    pr_number=18003,
                    head_sha=new_head,
                    statuses_by_head={new_head: []},
                    workflow_runs=[workflow_run(status=status, age=10_000, conclusion=None)],
                    gate_now=gate_now,
                )
                self.assertEqual(active_run.returncode, 0, active_run.stderr)
                self.assertNotIn("proceed=true", output)

        exact_boundary, output, _ = self._run_gate_shell(
            pr_number=18003,
            head_sha=new_head,
            statuses_by_head={new_head: []},
            workflow_runs=[workflow_run(age=2700, conclusion="failure")],
            gate_now=gate_now,
        )
        self.assertEqual(exact_boundary.returncode, 0, exact_boundary.stderr)
        self.assertNotIn("proceed=true", output)

        expired, output, _ = self._run_gate_shell(
            pr_number=18003,
            head_sha=new_head,
            statuses_by_head={new_head: []},
            workflow_runs=[workflow_run(age=2701, conclusion="failure")],
            gate_now=gate_now,
        )
        self.assertEqual(expired.returncode, 0, expired.stderr)
        self.assertIn("proceed=true", output)

        isolated, output, _ = self._run_gate_shell(
            pr_number=18004,
            head_sha=new_head,
            statuses_by_head={new_head: []},
            workflow_runs=[workflow_run(pr_number=18003, age=100, conclusion="failure")],
            gate_now=gate_now,
        )
        self.assertEqual(isolated.returncode, 0, isolated.stderr)
        self.assertIn("proceed=true", output)

    def test_active_fx_canary_excludes_same_source_pr_even_when_forced(self):
        head = "a" * 40
        cases = (
            # A direct CI failure for the canary PR.
            {
                "pr_number": "18003",
                "producer_event": "pull_request",
                "force": False,
            },
            # Manual force is not an escape hatch around the canary's writer.
            {
                "pr_number": "018003",
                "producer_event": "workflow_dispatch",
                "force": True,
            },
        )
        for case in cases:
            with self.subTest(case=case):
                completed, output, calls = self._run_gate_shell(
                    pr_number=case["pr_number"],
                    head_sha=head,
                    statuses_by_head={head: []},
                    workflow_runs=[],
                    force=case["force"],
                    producer_event=case["producer_event"],
                    fx_enabled="true",
                    fx_canary_pr="18003",
                )
                self.assertEqual(completed.returncode, 0, completed.stderr)
                self.assertNotIn("proceed=true", output)
                self.assertEqual(calls, [])

    def test_active_fx_canary_resolves_empty_same_repo_association_before_hyperagent_gate(self):
        head = "a" * 40
        branch = "codex/fx-canary"
        completed, output, calls = self._run_gate_shell(
            pr_number="",
            head_sha=head,
            statuses_by_head={head: []},
            workflow_runs=[],
            producer_event="pull_request",
            fx_enabled="true",
            fx_canary_pr="18003",
            head_branch=branch,
            head_repository="JovieInc/Jovie",
            pr_associations="[]",
            pull_requests=[pr_candidate(18003, head, branch)],
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertNotIn("proceed=true", output)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["endpoint"], "repos/JovieInc/Jovie/pulls")
        self.assertIn("head=JovieInc:codex/fx-canary", calls[0]["args"])

    def test_active_fx_canary_keeps_hyperagent_for_unique_exact_noncanary_empty_association(self):
        head = "a" * 40
        branch = "codex/other-pr"
        completed, output, calls = self._run_gate_shell(
            pr_number="",
            head_sha=head,
            statuses_by_head={head: []},
            workflow_runs=[],
            producer_event="pull_request",
            fx_enabled="true",
            fx_canary_pr="18003",
            head_branch=branch,
            head_repository="JovieInc/Jovie",
            pr_associations="[]",
            pull_requests=[pr_candidate(18004, head, branch)],
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertIn("proceed=true", output)
        self.assertTrue(any(call["endpoint"] == "repos/JovieInc/Jovie/pulls" for call in calls))
        self.assertTrue(any("/commits/" in call["endpoint"] for call in calls))

    def test_active_fx_canary_fails_closed_for_ambiguous_stale_and_malformed_empty_associations(self):
        head = "a" * 40
        branch = "codex/fx-canary"
        cases = (
            {
                "name": "ambiguous",
                "pull_requests": [
                    pr_candidate(18003, head, branch),
                    pr_candidate(18004, head, branch),
                ],
            },
            {
                "name": "stale head",
                "pull_requests": [pr_candidate(18003, "b" * 40, branch)],
            },
            {
                "name": "malformed response",
                "pull_requests_json": '{"not":"an array"}',
            },
        )
        for case in cases:
            with self.subTest(case=case["name"]):
                completed, output, calls = self._run_gate_shell(
                    pr_number="",
                    head_sha=head,
                    statuses_by_head={head: []},
                    workflow_runs=[],
                    producer_event="pull_request",
                    fx_enabled="true",
                    fx_canary_pr="18003",
                    head_branch=branch,
                    head_repository="JovieInc/Jovie",
                    pr_associations="[]",
                    **{key: value for key, value in case.items() if key != "name"},
                )
                self.assertEqual(completed.returncode, 0, completed.stderr)
                self.assertNotIn("proceed=true", output)
                self.assertEqual(len(calls), 1)
                self.assertEqual(calls[0]["endpoint"], "repos/JovieInc/Jovie/pulls")

    def test_active_fx_canary_fails_closed_when_empty_association_lookup_fails(self):
        head = "a" * 40
        completed, output, calls = self._run_gate_shell(
            pr_number="",
            head_sha=head,
            statuses_by_head={head: []},
            workflow_runs=[],
            producer_event="pull_request",
            fx_enabled="true",
            fx_canary_pr="18003",
            head_branch="codex/fx-canary",
            head_repository="JovieInc/Jovie",
            pr_associations="[]",
            fail_pr_lookup=True,
        )
        self.assertNotEqual(completed.returncode, 0)
        self.assertNotIn("proceed=true", output)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["endpoint"], "repos/JovieInc/Jovie/pulls")

    def test_active_fx_canary_preserves_merge_group_hyperagent_lane(self):
        head = "a" * 40
        for pr_number in ("18004", ""):
            with self.subTest(pr_number=pr_number):
                completed, output, _calls = self._run_gate_shell(
                    pr_number=pr_number,
                    head_sha=head,
                    statuses_by_head={head: []},
                    workflow_runs=[],
                    producer_event="merge_group",
                    fx_enabled="true",
                    fx_canary_pr="18003",
                )
                self.assertEqual(completed.returncode, 0, completed.stderr)
                self.assertIn("proceed=true", output)

    def test_active_fx_canary_preserves_hyperagent_for_other_pull_request_failures(self):
        head = "a" * 40
        completed, output, _calls = self._run_gate_shell(
            pr_number="18004",
            head_sha=head,
            statuses_by_head={head: []},
            workflow_runs=[],
            producer_event="pull_request",
            fx_enabled="true",
            fx_canary_pr="18003",
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertIn("proceed=true", output)


if __name__ == "__main__":
    unittest.main()
